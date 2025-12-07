export interface Version {
  version: string;
  date: string;
  changes: string[];
  status: 'stable' | 'beta' | 'deprecated';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isCode?: boolean;
  timestamp: number;
}

export enum Tab {
  HOME = 'HOME',
  DEV_LAB = 'DEV_LAB',
  CHANGELOG = 'CHANGELOG'
}