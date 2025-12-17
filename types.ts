import { LucideIcon } from 'lucide-react';

// --- HUB SPECIFIC TYPES ---
export interface Version {
  version: string;
  date: string;
  changes: string[];
  status: 'stable' | 'beta' | 'deprecated';
}

export interface FeedbackComment {
  id: string;
  text: string;
  author: string;
  date: string;
}

export interface FeedbackTicket {
  id: string;
  title: string;
  description: string;
  votes: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE';
  date: string;
  author: string; // z.B. "Betrieb Huber"
  comments?: FeedbackComment[];
}

export enum Tab {
  HOME = 'HOME',
  APP = 'APP',
  FEEDBACK = 'FEEDBACK', // Ersetzt DEV_LAB
  ADMIN = 'ADMIN',     // Restricted Admin Area
  CHANGELOG = 'CHANGELOG'
}

export interface AgriUser {
    uid: string;
    email: string | null;
    isAnonymous: boolean; // True if Guest
}

// --- APP ENUMS (CRITICAL FOR RUNTIME) ---

export enum ActivityType {
  FERTILIZATION = 'Düngung',
  HARVEST = 'Ernte',
  TILLAGE = 'Bodenbearbeitung',
  SOWING = 'Aussaat',
  PROTECTION = 'Pflanzenschutz'
}

export enum FertilizerType {
  SLURRY = 'Gülle',
  MANURE = 'Mist'
}

export enum HarvestType {
  SILAGE = 'Silage',
  HAY = 'Heu',
  STRAW = 'Stroh',
  GRAIN = 'Getreide'
}

export enum TillageType {
  HARROW = 'Wiesenegge',
  MULCH = 'Schlegeln',
  WEEDER = 'Striegel',
  RESEEDING = 'Nachsaat',
  PLOW = 'Pflug'
}

// --- SHARED DATA INTERFACES ---

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TrackPoint extends GeoPoint {
  timestamp: number;
  speed: number;
  isSpreading: boolean;
  storageId?: string; // ID of the storage this segment originated from
  loadIndex?: number; // Sequential ID of the load (1, 2, 3...) for precise splitting
}

export interface Field {
  id: string;
  name: string;
  areaHa: number;
  type: 'Grünland' | 'Acker';
  usage: string; // eAMA Usage code e.g. "Mähwiese"
  boundary: GeoPoint[];
  color?: string; // Custom display color
  codes?: string; // eAMA Codes e.g. "BIO, UMW"
}

export interface StorageLocation {
  id: string;
  name: string;
  type: FertilizerType;
  capacity: number; // m3
  currentLevel: number; // m3
  dailyGrowth: number; // m3 per day
  geo: GeoPoint;
}

export interface FarmProfile {
  farmId: string; // LFBIS
  operatorName: string;
  address: string;
  addressGeo?: GeoPoint;
  totalAreaHa: number;
}

export interface ActivityRecord {
  id: string;
  date: string; // ISO String
  type: ActivityType | string;
  year: number;
  
  // Relations
  fieldIds: string[]; // IDs of fields involved
  
  // Amounts
  amount?: number; // Total amount
  unit?: string; // m3, t, Stk, ha
  loadCount?: number;

  // Details
  fertilizerType?: FertilizerType;
  tillageType?: TillageType;
  notes?: string;

  // Tracking Data
  trackPoints?: TrackPoint[];
  
  // Distributions (Calculated shares)
  fieldDistribution?: Record<string, number>; // FieldID -> Amount
  storageDistribution?: Record<string, number>; // StorageID -> Amount taken
  
  // Advanced Traceability
  fieldSources?: Record<string, string[]>; // FieldID -> Array of StorageIDs used on this field
  
  // NEW: Precise mapping of Amount per Source per Field
  // Structure: { "field_id": { "storage_id_A": 10.5, "storage_id_B": 5.0 } }
  detailedFieldSources?: Record<string, Record<string, number>>; 
  
  // Sync Meta
  farmId?: string; // The Farm Group ID
  userId?: string; // The User who created it
}

// Legacy Alias for compatibility
export type Activity = ActivityRecord;
export type Trip = ActivityRecord;

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  actionLink?: string;
  actionLabel?: string;
}

export interface AppSettings {
  slurryLoadSize: number;
  manureLoadSize: number;
  minSpeed: number; // km/h for GPS auto-start
  maxSpeed: number; // km/h for GPS validation
  storageRadius: number; // meters to detect storage
  spreadWidth: number; // meters
  slurrySpreadWidth?: number; // Optional specific width
  manureSpreadWidth?: number; // Optional specific width
  serverUrl: string; // Legacy
  farmName?: string;
  appIcon?: string;
  // WhatsApp Settings
  adminPhone?: string;
  enableWhatsApp?: boolean;
  // Multi-User Cloud Sync
  farmId?: string; // LFBIS Nummer als Gruppen-ID
  farmPin?: string; // Passwort für die Gruppe
  ownerEmail?: string; // Email des Hof-Besitzers für Handshake
}

export const DEFAULT_SETTINGS: AppSettings = {
  slurryLoadSize: 10,
  manureLoadSize: 8,
  minSpeed: 2.0,
  maxSpeed: 8.0,
  storageRadius: 15,
  spreadWidth: 12,
  slurrySpreadWidth: 12,
  manureSpreadWidth: 10,
  serverUrl: '',
  appIcon: 'standard',
  // Vordefinierte Admin Einstellungen
  adminPhone: '436765624502',
  enableWhatsApp: true,
  farmId: '',
  farmPin: ''
};
