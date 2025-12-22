
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
  author: string;
  comments?: FeedbackComment[];
}

export enum Tab {
  HOME = 'HOME',
  APP = 'APP',
  FEEDBACK = 'FEEDBACK',
  ADMIN = 'ADMIN',
  CHANGELOG = 'CHANGELOG'
}

export interface AgriUser {
    uid: string;
    email: string | null;
    isAnonymous: boolean;
}

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

// Fix: Added missing TillageType enum to resolve import errors
export enum TillageType {
  HARROW = 'Wiesenegge',
  MULCH = 'Schlegeln',
  WEEDER = 'Striegel',
  RESEEDING = 'Nachsaat'
}

// NEU: Dynamische Kategorien
export interface EquipmentCategory {
  id: string;
  name: string;
  icon?: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: string; // Geändert von Enum auf string für Dynamik
  width: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TrackPoint extends GeoPoint {
  timestamp: number;
  speed: number;
  isSpreading: boolean;
  storageId?: string;
  loadIndex?: number;
}

export interface Field {
  id: string;
  name: string;
  areaHa: number;
  type: 'Grünland' | 'Acker';
  usage: string;
  boundary: GeoPoint[];
  color?: string;
  codes?: string;
  detailedSources?: Record<string, number>;
}

export interface StorageLocation {
  id: string;
  name: string;
  type: FertilizerType;
  capacity: number;
  currentLevel: number;
  dailyGrowth: number;
  geo: GeoPoint;
}

export interface FarmProfile {
  farmId: string;
  operatorName: string;
  address: string;
  addressGeo?: GeoPoint;
  totalAreaHa: number;
}

export interface ActivityRecord {
  id: string;
  date: string;
  type: ActivityType | string;
  year: number;
  fieldIds: string[];
  amount?: number;
  unit?: string;
  loadCount?: number;
  fertilizerType?: FertilizerType;
  tillageType?: string; // String für dynamische Typen
  equipmentId?: string;
  equipmentName?: string;
  notes?: string;
  trackPoints?: TrackPoint[];
  fieldDistribution?: Record<string, number>;
  storageDistribution?: Record<string, number>;
  detailedFieldSources?: Record<string, Record<string, number>>; 
  farmId?: string;
  userId?: string;
}

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
  minSpeed: number;
  maxSpeed: number;
  storageRadius: number;
  spreadWidth: number;
  slurrySpreadWidth?: number;
  manureSpreadWidth?: number;
  harrowWidth?: number;
  mulchWidth?: number;
  weederWidth?: number;
  reseedingWidth?: number;
  serverUrl: string;
  farmName?: string;
  appIcon?: string;
  adminPhone?: string;
  enableWhatsApp?: boolean;
  farmId?: string;
  farmPin?: string;
  ownerEmail?: string;
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
  harrowWidth: 6,
  mulchWidth: 3,
  weederWidth: 6,
  reseedingWidth: 3,
  serverUrl: '',
  appIcon: 'standard',
  adminPhone: '436765624502',
  enableWhatsApp: true,
  farmId: '',
  farmPin: ''
};

