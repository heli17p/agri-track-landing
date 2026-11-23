import { ExternalGpsStatus } from '../types';

type PositionCallback = (pos: GeolocationPosition) => void;
type StatusCallback = (status: ExternalGpsStatus) => void;

const INITIAL_STATUS: ExternalGpsStatus = {
  connected: false,
  connecting: false,
  transport: 'none',
  deviceName: '',
  baudRate: 115200,
  fixQuality: 0,
  fixLabel: 'Kein Fix',
  satellites: 0,
  hdop: 99.9,
  accuracyMeters: 99,
  speedKmh: 0,
  headingDeg: null,
  altitudeM: null,
  hz: 0,
  lastLat: null,
  lastLng: null,
  lastUpdateTs: null,
  lastError: null,
  recentLines: []
};

const USB_GPS_FILTERS = [
  { vendorId: 0x10c4 }, // Silicon Labs CP2102 / CP2102N / CP2104
  { vendorId: 0x0403 }, // FTDI FT232R / FT231X
  { vendorId: 0x1a86 }, // WCH CH340 / CH341
  { vendorId: 0x067b }, // Prolific PL2303
  { vendorId: 0x1546 }, // u-blox AG (native USB)
  { classCode: 0x02 }   // CDC-ACM Communication
];

const getFixLabel = (q: number): string => {
  switch (q) {
    case 4: return 'RTK Fixed';
    case 5: return 'RTK Float';
    case 2: return 'DGPS / EGNOS';
    case 1: return 'GPS 3D';
    case 6: return 'Koppelnavigation';
    default: return 'Kein Fix';
  }
};

const estimateAccuracy = (fixQuality: number, hdop: number): number => {
  if (fixQuality === 4) return 0.02; // RTK Fixed ~2 cm
  if (fixQuality === 5) return 0.35; // RTK Float ~35 cm
  if (fixQuality === 2) return Math.max(0.4, Math.round(hdop * 1.0 * 10) / 10); // SBAS/EGNOS
  if (fixQuality === 1) return Math.max(1.5, Math.round(hdop * 2.5 * 10) / 10);
  return 50;
};

const validateNmeaChecksum = (sentence: string): boolean => {
  const starIdx = sentence.indexOf('*');
  if (starIdx === -1 || !sentence.startsWith('$')) return false;
  const body = sentence.slice(1, starIdx);
  const checksumHex = sentence.slice(starIdx + 1, starIdx + 3);
  if (checksumHex.length < 2) return false;
  let xor = 0;
  for (let i = 0; i < body.length; i++) {
    xor ^= body.charCodeAt(i);
  }
  const expected = parseInt(checksumHex, 16);
  return !Number.isNaN(expected) && xor === expected;
};

const parseNmeaCoord = (coord: string, hemi: string): number | null => {
  if (!coord || !hemi) return null;
  const dotIdx = coord.indexOf('.');
  if (dotIdx < 2) return null;
  const degLen = dotIdx - 2;
  const deg = parseInt(coord.slice(0, degLen), 10);
  const min = parseFloat(coord.slice(degLen));
  if (Number.isNaN(deg) || Number.isNaN(min)) return null;
  let decimal = deg + min / 60;
  if (hemi === 'S' || hemi === 'W') decimal = -decimal;
  return decimal;
};

class ExternalGpsService {
  private status: ExternalGpsStatus = { ...INITIAL_STATUS };
  private posListeners: Set<PositionCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();

  // Active transport handles
  private serialPort: any = null;
  private serialReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private usbDevice: any = null;
  private keepReading = false;
  private simInterval: any = null;

  // NMEA epoch accumulator
  private lineBuffer = '';
  private fixTimestamps: number[] = [];
  private lastGgaTs = 0;
  private pendingSpeedMs = 0;
  private pendingHeadingDeg: number | null = null;
  private pendingAltM: number | null = null;
  private pendingFixQuality = 0;
  private pendingSatellites = 0;
  private pendingHdop = 1.0;

  constructor() {
    // Native Capacitor / Android WebView Bridge Listener
    if (typeof window !== 'undefined') {
      window.addEventListener('agritrack-nmea', (ev: any) => {
        const line = typeof ev?.detail === 'string' ? ev.detail : '';
        if (line) {
          if (!this.status.connected || this.status.transport !== 'native') {
            this.updateStatus({
              connected: true,
              connecting: false,
              transport: 'native',
              deviceName: 'Android Native USB-Serial',
              lastError: null
            });
          }
          this.ingestChunk(line.endsWith('\n') ? line : line + '\n');
        }
      });

      (window as any).AgriTrackNmeaIngest = (chunk: string) => {
        if (!this.status.connected || this.status.transport !== 'native') {
          this.updateStatus({
            connected: true,
            connecting: false,
            transport: 'native',
            deviceName: 'Android Native USB-Serial',
            lastError: null
          });
        }
        this.ingestChunk(chunk);
      };
    }
  }

  public getCapabilities() {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isAndroid = /Android/i.test(ua);
    return {
      isAndroid,
      hasWebSerial: !!nav.serial,
      hasWebUsb: !!nav.usb,
      hasNativeBridge: !!(typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()),
      isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false
    };
  }

  public getStatus(): ExternalGpsStatus {
    return { ...this.status };
  }

  public isConnected(): boolean {
    return this.status.connected;
  }

  public onPosition(cb: PositionCallback): () => void {
    this.posListeners.add(cb);
    return () => {
      this.posListeners.delete(cb);
    };
  }

  public onStatusChange(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    cb(this.getStatus());
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private updateStatus(patch: Partial<ExternalGpsStatus>) {
    this.status = { ...this.status, ...patch };
    const snapshot = this.getStatus();
    this.statusListeners.forEach(cb => cb(snapshot));
  }

  private emitPosition(lat: number, lng: number) {
    const now = Date.now();
    this.fixTimestamps.push(now);
    const cutoff = now - 1000;
    while (this.fixTimestamps.length > 0 && this.fixTimestamps[0] < cutoff) {
      this.fixTimestamps.shift();
    }
    const hz = this.fixTimestamps.length;
    const accuracy = estimateAccuracy(this.pendingFixQuality, this.pendingHdop);
    const speedMs = this.pendingSpeedMs;
    const speedKmh = Math.round(speedMs * 3.6 * 10) / 10;

    this.updateStatus({
      fixQuality: this.pendingFixQuality,
      fixLabel: getFixLabel(this.pendingFixQuality),
      satellites: this.pendingSatellites,
      hdop: this.pendingHdop,
      accuracyMeters: accuracy,
      speedKmh,
      headingDeg: this.pendingHeadingDeg,
      altitudeM: this.pendingAltM,
      hz,
      lastLat: lat,
      lastLng: lng,
      lastUpdateTs: now,
      lastError: null
    });

    const geoPos: GeolocationPosition = {
      coords: {
        latitude: lat,
        longitude: lng,
        altitude: this.pendingAltM,
        accuracy,
        altitudeAccuracy: this.pendingAltM !== null ? accuracy * 1.5 : null,
        heading: this.pendingHeadingDeg,
        speed: speedMs,
        toJSON() {
          return {
            latitude: this.latitude,
            longitude: this.longitude,
            altitude: this.altitude,
            accuracy: this.accuracy,
            altitudeAccuracy: this.altitudeAccuracy,
            heading: this.heading,
            speed: this.speed
          };
        }
      } as GeolocationCoordinates,
      timestamp: now,
      toJSON() {
        return {
          coords: this.coords.toJSON(),
          timestamp: this.timestamp
        };
      }
    } as GeolocationPosition;

    this.posListeners.forEach(cb => cb(geoPos));
  }

  public ingestChunk(chunk: string) {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop() || '';
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (trimmed.startsWith('$')) {
        this.processNmeaLine(trimmed);
      }
    }
  }

  private processNmeaLine(line: string) {
    if (!validateNmeaChecksum(line)) return;

    // Record recent lines for live NMEA diagnostic display
    const recent = [line, ...this.status.recentLines].slice(0, 6);
    this.status.recentLines = recent;

    const clean = line.split('*')[0];
    const parts = clean.split(',');
    const talkerType = parts[0].slice(3); // GGA, RMC, VTG

    if (talkerType === 'GGA' && parts.length >= 10) {
      // $GNGGA,time,lat,NS,lon,EW,quality,numSV,HDOP,alt,altUnit,...
      const lat = parseNmeaCoord(parts[2], parts[3]);
      const lng = parseNmeaCoord(parts[4], parts[5]);
      const quality = parseInt(parts[6] || '0', 10) || 0;
      const sats = parseInt(parts[7] || '0', 10) || 0;
      const hdop = parseFloat(parts[8] || '99') || 99;
      const alt = parts[9] ? parseFloat(parts[9]) : null;

      this.pendingFixQuality = quality;
      this.pendingSatellites = sats;
      this.pendingHdop = hdop;
      this.pendingAltM = alt !== null && !Number.isNaN(alt) ? alt : null;

      if (quality > 0 && lat !== null && lng !== null) {
        this.lastGgaTs = Date.now();
        this.emitPosition(lat, lng);
      } else {
        this.updateStatus({
          fixQuality: quality,
          fixLabel: getFixLabel(quality),
          satellites: sats,
          hdop,
          recentLines: recent
        });
      }
    } else if (talkerType === 'RMC' && parts.length >= 9) {
      // $GNRMC,time,status,lat,NS,lon,EW,spdKnots,cog,date,...
      const active = parts[2] === 'A';
      const lat = parseNmeaCoord(parts[3], parts[4]);
      const lng = parseNmeaCoord(parts[5], parts[6]);
      const knots = parseFloat(parts[7] || '0');
      const cog = parseFloat(parts[8] || '');

      if (!Number.isNaN(knots)) {
        this.pendingSpeedMs = Math.max(0, knots * 0.514444);
      }
      if (!Number.isNaN(cog) && this.pendingSpeedMs > 0.25) {
        this.pendingHeadingDeg = cog;
      }

      // Only emit from RMC if GGA hasn't fired recently (fallback when only RMC is active)
      if (active && lat !== null && lng !== null && Date.now() - this.lastGgaTs > 450) {
        if (this.pendingFixQuality === 0) this.pendingFixQuality = 1;
        this.emitPosition(lat, lng);
      }
    } else if (talkerType === 'VTG' && parts.length >= 8) {
      // $GNVTG,cogt,T,cogm,M,sogn,N,sogk,K,...
      const cogTrue = parseFloat(parts[1] || '');
      const speedKmh = parseFloat(parts[7] || '');
      const speedKnots = parseFloat(parts[5] || '');

      if (!Number.isNaN(speedKmh)) {
        this.pendingSpeedMs = Math.max(0, speedKmh / 3.6);
      } else if (!Number.isNaN(speedKnots)) {
        this.pendingSpeedMs = Math.max(0, speedKnots * 0.514444);
      }
      if (!Number.isNaN(cogTrue) && this.pendingSpeedMs > 0.25) {
        this.pendingHeadingDeg = cogTrue;
      }
    }
  }

  /**
   * Auto-connect:
   * - On Android Chrome: MUST use WebUSB (navigator.usb), because navigator.serial on Android only scans Bluetooth SPP ports, NOT USB-OTG!
   * - On Desktop Chrome/Edge: uses Web Serial API (or WebUSB if requested).
   */
  public async connectAuto(baudRate = 115200, preferWebUsb?: boolean): Promise<boolean> {
    const caps = this.getCapabilities();
    if (!caps.isSecureContext) {
      this.updateStatus({
        lastError: 'USB-Zugriff erfordert HTTPS oder localhost.'
      });
      return false;
    }

    const useWebUsbFirst = preferWebUsb ?? caps.isAndroid;

    if (useWebUsbFirst) {
      if (caps.hasWebUsb) {
        return this.connectWebUsb(baudRate);
      }
      this.updateStatus({
        lastError:
          'Auf diesem Handy ist WebUSB im aktuellen Browser nicht verfügbar. Bitte direkt in Google Chrome öffnen (nicht im In-App-Browser).'
      });
      return false;
    }

    if (caps.hasWebSerial) {
      return this.connectWebSerial(baudRate);
    }
    if (caps.hasWebUsb) {
      return this.connectWebUsb(baudRate);
    }

    this.updateStatus({
      lastError:
        'Dieser Browser unterstützt weder WebUSB noch Web Serial. Auf Android bitte Chrome verwenden oder App als Capacitor-APK bauen.'
    });
    return false;
  }

  /**
   * Connects via Web Serial API (Desktop Chrome / Edge / ChromeOS, or Bluetooth SPP on Android).
   */
  public async connectWebSerial(baudRate = 115200): Promise<boolean> {
    const nav = navigator as any;
    if (!nav.serial) {
      this.updateStatus({ lastError: 'Web Serial API wird von diesem Browser nicht unterstützt.' });
      return false;
    }

    try {
      // Request port FIRST so the browser user-gesture token is preserved!
      const port = await nav.serial.requestPort();

      if (this.status.connected) {
        await this.disconnect();
      }
      this.updateStatus({ connecting: true, lastError: null, baudRate });

      await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
      this.serialPort = port;
      this.keepReading = true;

      const info = port.getInfo ? port.getInfo() : {};
      const vidHex = info.usbVendorId ? `0x${info.usbVendorId.toString(16).toUpperCase()}` : '';
      const deviceName = vidHex === '0x10C4'
        ? 'CP2102N USB-GPS (Web Serial)'
        : vidHex
          ? `USB-Serial GPS (${vidHex})`
          : 'USB-Serial GPS';

      this.updateStatus({
        connected: true,
        connecting: false,
        transport: 'webserial',
        deviceName,
        baudRate,
        lastError: null
      });

      this.readSerialLoop(port);
      return true;
    } catch (err: any) {
      const msg = err?.name === 'NotFoundError'
        ? 'Kein serieller Anschluss ausgewählt.'
        : `Serial-Verbindung fehlgeschlagen: ${err?.message || err}`;
      this.updateStatus({ connecting: false, connected: false, lastError: msg });
      return false;
    }
  }

  private async readSerialLoop(port: any) {
    const decoder = new TextDecoder();
    try {
      while (port.readable && this.keepReading) {
        const reader = port.readable.getReader();
        this.serialReader = reader;
        try {
          while (this.keepReading) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              this.ingestChunk(decoder.decode(value, { stream: true }));
            }
          }
        } finally {
          reader.releaseLock();
          this.serialReader = null;
        }
      }
    } catch (err: any) {
      if (this.keepReading) {
        this.updateStatus({
          connected: false,
          transport: 'none',
          lastError: `USB-Verbindung unterbrochen: ${err?.message || 'Gerät getrennt'}`
        });
      }
    }
  }

  /**
   * Connects directly via WebUSB (works natively on Android Chrome with CP2102/CP2102N, FTDI, CH340, u-blox CDC-ACM).
   */
  public async connectWebUsb(baudRate = 115200, showAllDevices = false): Promise<boolean> {
    const nav = navigator as any;
    if (!nav.usb) {
      this.updateStatus({ lastError: 'WebUSB wird von diesem Browser nicht unterstützt.' });
      return false;
    }

    try {
      // Request device FIRST so the browser user-gesture token is preserved!
      const device = await nav.usb.requestDevice({
        filters: showAllDevices ? [] : USB_GPS_FILTERS
      });

      if (this.status.connected) {
        await this.disconnect();
      }
      this.updateStatus({ connecting: true, lastError: null, baudRate });

      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      // Find best interface with a bulk IN endpoint
      let targetInterface: any = null;
      let inEndpointNumber = 1;
      let packetSize = 64;
      let commInterfaceNumber: number | null = null;

      for (const iface of device.configuration.interfaces) {
        const alt = iface.alternate || iface.alternates?.[0];
        if (!alt) continue;
        if (alt.interfaceClass === 0x02) {
          commInterfaceNumber = iface.interfaceNumber;
        }
        const bulkIn = alt.endpoints?.find((ep: any) => ep.direction === 'in' && ep.type === 'bulk');
        if (bulkIn) {
          targetInterface = iface;
          inEndpointNumber = bulkIn.endpointNumber;
          packetSize = bulkIn.packetSize || 64;
          if (alt.interfaceClass === 0x0a || device.vendorId === 0x10c4) break;
        }
      }

      if (!targetInterface) {
        throw new Error('Keine serielle USB-Datenschnittstelle gefunden.');
      }

      const ifaceNum = targetInterface.interfaceNumber;
      await device.claimInterface(ifaceNum);

      // Chip-specific initialization
      const vid = device.vendorId;
      if (vid === 0x10c4) {
        // Silicon Labs CP2102 / CP2102N / CP2104
        await device.controlTransferOut({
          requestType: 'vendor',
          recipient: 'interface',
          request: 0x00, // IFC_ENABLE
          value: 0x0001,
          index: ifaceNum
        });
        const baudBuf = new ArrayBuffer(4);
        new DataView(baudBuf).setUint32(0, baudRate, true);
        await device.controlTransferOut(
          {
            requestType: 'vendor',
            recipient: 'interface',
            request: 0x1e, // SET_BAUDRATE
            value: 0x0000,
            index: ifaceNum
          },
          baudBuf
        );
        await device.controlTransferOut({
          requestType: 'vendor',
          recipient: 'interface',
          request: 0x03, // SET_LINE_CTL (8N1)
          value: 0x0800,
          index: ifaceNum
        });
        await device.controlTransferOut({
          requestType: 'vendor',
          recipient: 'interface',
          request: 0x07, // SET_MHS (DTR + RTS)
          value: 0x0303,
          index: ifaceNum
        });
      } else if (vid === 0x0403) {
        // FTDI FT232R
        await device.controlTransferOut({
          requestType: 'vendor',
          recipient: 'device',
          request: 0x00,
          value: 0x0000,
          index: 0
        });
        const divisor = Math.round(3000000 / baudRate);
        await device.controlTransferOut({
          requestType: 'vendor',
          recipient: 'device',
          request: 0x03,
          value: divisor & 0xffff,
          index: (divisor >> 16) & 0xffff
        });
        await device.controlTransferOut({
          requestType: 'vendor',
          recipient: 'device',
          request: 0x04,
          value: 0x0008,
          index: 0
        });
      } else if (commInterfaceNumber !== null) {
        // CDC-ACM Line Coding
        try {
          if (commInterfaceNumber !== ifaceNum) {
            await device.claimInterface(commInterfaceNumber);
          }
          const lineCoding = new ArrayBuffer(7);
          const dv = new DataView(lineCoding);
          dv.setUint32(0, baudRate, true);
          dv.setUint8(4, 0); // 1 stop bit
          dv.setUint8(5, 0); // no parity
          dv.setUint8(6, 8); // 8 data bits
          await device.controlTransferOut(
            {
              requestType: 'class',
              recipient: 'interface',
              request: 0x20, // SET_LINE_CODING
              value: 0,
              index: commInterfaceNumber
            },
            lineCoding
          );
          await device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: 0x22, // SET_CONTROL_LINE_STATE (DTR+RTS)
            value: 0x03,
            index: commInterfaceNumber
          });
        } catch {
          // Some CDC-ACM devices (e.g. u-blox) stream immediately without line coding
        }
      }

      this.usbDevice = device;
      this.keepReading = true;
      const label = device.productName || (vid === 0x10c4 ? 'CP2102N USB-GPS' : `USB-GPS (0x${vid.toString(16)})`);

      this.updateStatus({
        connected: true,
        connecting: false,
        transport: 'webusb',
        deviceName: `${label} (WebUSB)`,
        baudRate,
        lastError: null
      });

      this.readUsbLoop(device, inEndpointNumber, Math.max(packetSize, 64), vid === 0x0403);
      return true;
    } catch (err: any) {
      let msg = `WebUSB Fehler: ${err?.message || err}`;
      if (err?.name === 'NotFoundError') {
        msg = 'Kein USB-GPS ausgewählt. Prüfe USB-OTG in den Handy-Einstellungen, das Datenkabel oder tippe auf „Alle USB-Geräte zeigen“.';
      } else if (err?.name === 'SecurityError' || String(err?.message).includes('claimInterface')) {
        msg = 'USB-Schnittstelle durch System/andere App belegt (z.B. „GPS Connector“ Standard-App in Android zurücksetzen).';
      }
      this.updateStatus({ connecting: false, connected: false, lastError: msg });
      return false;
    }
  }

  private async readUsbLoop(device: any, endpointNumber: number, transferSize: number, isFtdi: boolean) {
    const decoder = new TextDecoder();
    try {
      while (this.keepReading && device.opened) {
        const result = await device.transferIn(endpointNumber, transferSize);
        if (result?.status === 'ok' && result.data && result.data.byteLength > 0) {
          let bytes = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
          if (isFtdi) {
            if (bytes.byteLength <= 2) continue;
            bytes = bytes.slice(2);
          }
          this.ingestChunk(decoder.decode(bytes, { stream: true }));
        }
      }
    } catch (err: any) {
      if (this.keepReading) {
        this.updateStatus({
          connected: false,
          transport: 'none',
          lastError: `USB-Stream beendet: ${err?.message || 'Gerät abgezogen'}`
        });
      }
    }
  }

  /**
   * Starts a realistic 10 Hz NMEA ($GNRMC + $GNVTG + $GNGGA) stream for testing without hardware.
   */
  public startSimulated10Hz(startLat = 47.5005, startLng = 14.5005) {
    this.disconnect();
    let step = 0;
    let lat = startLat;
    let lng = startLng;

    this.updateStatus({
      connected: true,
      connecting: false,
      transport: 'simulator',
      deviceName: 'CP2102N NMEA 10Hz Simulator',
      baudRate: 115200,
      lastError: null
    });

    const formatNmeaLat = (val: number) => {
      const abs = Math.abs(val);
      const deg = Math.floor(abs);
      const min = (abs - deg) * 60;
      return `${String(deg).padStart(2, '0')}${min.toFixed(5).padStart(8, '0')}`;
    };
    const formatNmeaLng = (val: number) => {
      const abs = Math.abs(val);
      const deg = Math.floor(abs);
      const min = (abs - deg) * 60;
      return `${String(deg).padStart(3, '0')}${min.toFixed(5).padStart(8, '0')}`;
    };
    const withChecksum = (body: string) => {
      let xor = 0;
      for (let i = 0; i < body.length; i++) xor ^= body.charCodeAt(i);
      return `$${body}*${xor.toString(16).toUpperCase().padStart(2, '0')}\r\n`;
    };

    this.simInterval = setInterval(() => {
      step++;
      const angle = (step * 0.02) % (Math.PI * 2);
      const speedKmh = 9.5;
      const distPer100ms = (speedKmh / 3.6) * 0.1;
      const heading = ((Math.sin(angle) * 25 + 65) + 360) % 360;
      const rad = (heading * Math.PI) / 180;
      lat += (Math.cos(rad) * distPer100ms) / 111132;
      lng += (Math.sin(rad) * distPer100ms) / (111319 * Math.cos((lat * Math.PI) / 180));

      const now = new Date();
      const utc = `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}.${String(Math.floor(now.getUTCMilliseconds() / 100))}0`;
      const latStr = formatNmeaLat(lat);
      const lngStr = formatNmeaLng(lng);
      const knots = (speedKmh / 1.852).toFixed(2);

      const rmc = withChecksum(`GNRMC,${utc},A,${latStr},N,${lngStr},E,${knots},${heading.toFixed(1)},231126,,,A`);
      const vtg = withChecksum(`GNVTG,${heading.toFixed(1)},T,,M,${knots},N,${speedKmh.toFixed(1)},K,A`);
      const gga = withChecksum(`GNGGA,${utc},${latStr},N,${lngStr},E,2,18,0.6,642.4,M,43.2,M,,`);

      this.ingestChunk(rmc + vtg + gga);
    }, 100); // 10 Hz!
  }

  public async disconnect() {
    this.keepReading = false;
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
    if (this.serialReader) {
      try {
        await this.serialReader.cancel();
      } catch {}
      this.serialReader = null;
    }
    if (this.serialPort) {
      try {
        await this.serialPort.close();
      } catch {}
      this.serialPort = null;
    }
    if (this.usbDevice) {
      try {
        await this.usbDevice.close();
      } catch {}
      this.usbDevice = null;
    }
    this.fixTimestamps = [];
    this.lineBuffer = '';
    this.updateStatus({
      ...INITIAL_STATUS,
      baudRate: this.status.baudRate
    });
  }
}

export const externalGpsService = new ExternalGpsService();
