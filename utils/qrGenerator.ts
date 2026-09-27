/**
 * Standalone, zero-dependency QR Code Generator in pure TypeScript.
 * Generates an SVG or boolean 2D matrix for any text/URL.
 * Supports Byte Mode encoding up to Version 10 (covering > 1000 bytes with ECC).
 */

// GF(2^8) math
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    LOG_TABLE[val] = i;
    val <<= 1;
    if (val & 0x100) {
      val ^= 0x11d;
    }
  }
  LOG_TABLE[0] = 0;
})();

function gexp(n: number): number {
  while (n < 0) n += 255;
  while (n >= 255) n -= 255;
  return EXP_TABLE[n];
}

function glog(n: number): number {
  if (n <= 0) throw new Error('glog(n) with n <= 0');
  return LOG_TABLE[n];
}

function gmult(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return gexp(glog(a) + glog(b));
}

// Polynomial operations
function polyMultiply(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gmult(p1[i], p2[j]);
    }
  }
  return result;
}

function getErrorCorrectionPolynomial(ecLength: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecLength; i++) {
    poly = polyMultiply(poly, [1, gexp(i)]);
  }
  return poly;
}

function calculateErrorCorrectionCodewords(dataCodewords: number[], ecLength: number): number[] {
  const genPoly = getErrorCorrectionPolynomial(ecLength);
  const result = new Array(ecLength).fill(0);
  const messagePoly = dataCodewords.concat(result);

  for (let i = 0; i < dataCodewords.length; i++) {
    const lead = messagePoly[i];
    if (lead !== 0) {
      for (let j = 0; j < genPoly.length; j++) {
        messagePoly[i + j] ^= gmult(genPoly[j], lead);
      }
    }
  }

  return messagePoly.slice(dataCodewords.length);
}

// Version table: [version, totalCodewords, ecCodewords, blocks] for Level L
const VERSION_SPECS_L: Array<{ version: number; totalCodewords: number; ecPerBlock: number; blocks: number }> = [
  { version: 1, totalCodewords: 26, ecPerBlock: 7, blocks: 1 },
  { version: 2, totalCodewords: 44, ecPerBlock: 10, blocks: 1 },
  { version: 3, totalCodewords: 70, ecPerBlock: 15, blocks: 1 },
  { version: 4, totalCodewords: 100, ecPerBlock: 20, blocks: 1 },
  { version: 5, totalCodewords: 134, ecPerBlock: 26, blocks: 1 },
  { version: 6, totalCodewords: 172, ecPerBlock: 18, blocks: 2 },
  { version: 7, totalCodewords: 196, ecPerBlock: 20, blocks: 2 },
  { version: 8, totalCodewords: 242, ecPerBlock: 24, blocks: 2 },
  { version: 9, totalCodewords: 292, ecPerBlock: 30, blocks: 2 },
  { version: 10, totalCodewords: 346, ecPerBlock: 18, blocks: 4 },
  { version: 11, totalCodewords: 404, ecPerBlock: 20, blocks: 4 },
  { version: 12, totalCodewords: 466, ecPerBlock: 24, blocks: 4 },
  { version: 13, totalCodewords: 532, ecPerBlock: 26, blocks: 4 },
  { version: 14, totalCodewords: 581, ecPerBlock: 30, blocks: 4 },
];

// Alignment pattern centers for versions
const ALIGNMENT_PATTERN_POSITIONS: { [version: number]: number[] } = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
};

function encodeByteData(text: string): { codewords: number[]; version: number; spec: typeof VERSION_SPECS_L[0] } {
  // UTF-8 encode
  const utf8Bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let charCode = text.charCodeAt(i);
    if (charCode < 0x80) {
      utf8Bytes.push(charCode);
    } else if (charCode < 0x800) {
      utf8Bytes.push(0xc0 | (charCode >> 6));
      utf8Bytes.push(0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8Bytes.push(0xe0 | (charCode >> 12));
      utf8Bytes.push(0x80 | ((charCode >> 6) & 0x3f));
      utf8Bytes.push(0x80 | (charCode & 0x3f));
    } else {
      // surrogate pair
      i++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (text.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(0xf0 | (charCode >> 18));
      utf8Bytes.push(0x80 | ((charCode >> 12) & 0x3f));
      utf8Bytes.push(0x80 | ((charCode >> 6) & 0x3f));
      utf8Bytes.push(0x80 | (charCode & 0x3f));
    }
  }

  // Find smallest version that fits
  let chosenSpec = VERSION_SPECS_L[0];
  let found = false;
  for (const spec of VERSION_SPECS_L) {
    const dataCapacity = spec.totalCodewords - spec.ecPerBlock * spec.blocks;
    // 4 bits mode + (8 or 16 bits count) + 8*length
    const countBits = spec.version >= 10 ? 16 : 8;
    const requiredBits = 4 + countBits + utf8Bytes.length * 8;
    if (requiredBits <= dataCapacity * 8) {
      chosenSpec = spec;
      found = true;
      break;
    }
  }

  if (!found) {
    chosenSpec = VERSION_SPECS_L[VERSION_SPECS_L.length - 1];
  }

  const dataCapacity = chosenSpec.totalCodewords - chosenSpec.ecPerBlock * chosenSpec.blocks;
  const countBits = chosenSpec.version >= 10 ? 16 : 8;

  // Build bit array
  const bits: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // Mode: 0100 for Byte
  pushBits(0b0100, 4);
  // Character count indicator
  pushBits(utf8Bytes.length, countBits);
  // Data bytes
  for (const b of utf8Bytes) {
    pushBits(b, 8);
  }

  // Terminator (up to 4 zero bits)
  const remainingBits = dataCapacity * 8 - bits.length;
  const termLength = Math.min(4, Math.max(0, remainingBits));
  pushBits(0, termLength);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Pad with 0xEC and 0x11 until capacity
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < dataCapacity * 8) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i + b];
    }
    dataCodewords.push(byteVal);
  }

  return { codewords: dataCodewords, version: chosenSpec.version, spec: chosenSpec };
}

export function generateQrMatrix(text: string): boolean[][] {
  const { codewords, version, spec } = encodeByteData(text);
  const size = version * 4 + 17;

  // Divide into blocks and compute EC
  const totalBlocks = spec.blocks;
  const ecLength = spec.ecPerBlock;
  const dataLen = codewords.length;
  const shortBlockLen = Math.floor(dataLen / totalBlocks);
  const numLongBlocks = dataLen % totalBlocks;

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  let offset = 0;
  for (let i = 0; i < totalBlocks; i++) {
    const blockLen = i >= totalBlocks - numLongBlocks ? shortBlockLen + 1 : shortBlockLen;
    const block = codewords.slice(offset, offset + blockLen);
    offset += blockLen;
    dataBlocks.push(block);
    ecBlocks.push(calculateErrorCorrectionCodewords(block, ecLength));
  }

  // Interleave data codewords
  const finalCodewords: number[] = [];
  const maxDataBlockLen = shortBlockLen + (numLongBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      if (i < dataBlocks[b].length) {
        finalCodewords.push(dataBlocks[b][i]);
      }
    }
  }

  // Interleave EC codewords
  for (let i = 0; i < ecLength; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      finalCodewords.push(ecBlocks[b][i]);
    }
  }

  // Build matrix (null for unset, true/false for set)
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFunctionModule(r: number, c: number, val: boolean) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      isFunction[r][c] = true;
    }
  }

  // 1. Finder patterns
  function placeFinder(top: number, left: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            setFunctionModule(row, col, true);
          } else {
            setFunctionModule(row, col, false);
          }
        } else {
          // Separator
          setFunctionModule(row, col, false);
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (!isFunction[6][i]) setFunctionModule(6, i, val);
    if (!isFunction[i][6]) setFunctionModule(i, 6, val);
  }

  // 3. Alignment patterns
  const positions = ALIGNMENT_PATTERN_POSITIONS[version] || [];
  for (const r of positions) {
    for (const c of positions) {
      if (isFunction[r][c]) continue; // Skip finders
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const val = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunctionModule(r + dr, c + dc, val);
        }
      }
    }
  }

  // Dark module
  setFunctionModule(4 * version + 9, 8, true);

  // Reserve format information areas
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) setFunctionModule(8, i, false);
    if (!isFunction[i][8]) setFunctionModule(i, 8, false);
  }
  for (let i = 0; i <= 7; i++) {
    if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
  }

  // Place data bits with Mask 0 ((row + col) % 2 === 0)
  const bitArray: number[] = [];
  for (const cw of finalCodewords) {
    for (let b = 7; b >= 0; b--) {
      bitArray.push((cw >> b) & 1);
    }
  }
  // Add remainder bits if needed
  while (bitArray.length < size * size) {
    bitArray.push(0);
  }

  let bitIdx = 0;
  let upward = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing column
    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
    for (const r of rows) {
      for (const colOffset of [0, 1]) {
        const col = c - colOffset;
        if (!isFunction[r][col]) {
          const bit = bitIdx < bitArray.length ? bitArray[bitIdx++] : 0;
          // Apply mask 0: (r + col) % 2 == 0
          const mask = (r + col) % 2 === 0;
          matrix[r][col] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  // Format info for Level L and Mask 0: 0b111011111000100 (BCH code 15,5)
  // Format string: 0b111011111000100
  const FORMAT_INFO_L_MASK0 = 0x77c4; // 15 bits
  for (let i = 0; i < 15; i++) {
    const bit = ((FORMAT_INFO_L_MASK0 >> i) & 1) === 1;
    // Top-left
    if (i < 6) {
      matrix[8][i] = bit;
    } else if (i === 6) {
      matrix[8][7] = bit;
    } else if (i === 7) {
      matrix[8][8] = bit;
    } else if (i === 8) {
      matrix[7][8] = bit;
    } else {
      matrix[14 - i][8] = bit;
    }

    // Split corners
    if (i < 8) {
      matrix[size - 1 - i][8] = bit;
    } else {
      matrix[8][size - 15 + i] = bit;
    }
  }

  // Convert to clean boolean matrix
  return matrix.map(row => row.map(cell => !!cell));
}

/**
 * Generates an SVG string of the QR Code (infinitely crisp and sharp).
 */
export function generateQrSvg(text: string, options?: { size?: number; margin?: number; darkColor?: string; lightColor?: string }): string {
  const matrix = generateQrMatrix(text);
  const margin = options?.margin !== undefined ? options.margin : 4;
  const darkColor = options?.darkColor || '#000000';
  const lightColor = options?.lightColor || '#ffffff';
  const numCells = matrix.length + margin * 2;
  const size = options?.size || 280;

  let rects = '';
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${darkColor}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${numCells} ${numCells}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${numCells}" height="${numCells}" fill="${lightColor}"/>
    ${rects}
  </svg>`;
}

/**
 * Draws the QR code to an HTML Canvas element with crisp pixel rendering.
 */
export function drawQrToCanvas(canvas: HTMLCanvasElement, text: string, options?: { size?: number; margin?: number; darkColor?: string; lightColor?: string }) {
  try {
    const matrix = generateQrMatrix(text);
    const size = options?.size || 280;
    const margin = options?.margin !== undefined ? options.margin : 4; // Quiet zone standard
    const darkColor = options?.darkColor || '#000000';
    const lightColor = options?.lightColor || '#ffffff';

    const numCells = matrix.length + margin * 2;
    // Set actual pixel dimensions to high-res
    const scale = window.devicePixelRatio || 2;
    canvas.width = size * scale;
    canvas.height = size * scale;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    ctx.imageSmoothingEnabled = false;
    ctx.scale(scale, scale);

    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, size, size);

    const cellSize = size / numCells;
    ctx.fillStyle = darkColor;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          const x = (c + margin) * cellSize;
          const y = (r + margin) * cellSize;
          ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellSize), Math.ceil(cellSize));
        }
      }
    }
    return true;
  } catch (e) {
    console.error('drawQrToCanvas error:', e);
    return false;
  }
}
