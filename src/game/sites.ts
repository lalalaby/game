// Cyber Partisan operation sites — historical order for the campaign.
// 2020 BelTA/ONT → 2021 MVD/Akrestsina → 2022 BCh → Azot → 2023 KGB → border → Minsk-2 (2025 Aeroflot).

export type ThemeId = 'belta' | 'mvd' | 'okrestina' | 'railway' | 'azot' | 'kgb' | 'border' | 'aeroflot';

export const CAMPAIGN_THEMES: ThemeId[] = [
  'belta', 'mvd', 'okrestina', 'railway', 'azot', 'kgb', 'border', 'aeroflot',
];

export interface SiteMeta {
  skyTop: string;
  skyBot: string;
  ground: string;
  groundTop: string;
  flag: { x: number; top: number; base: number };
  svg: string;
  plane?: boolean;
  overlay: 'wire' | 'tanks' | 'smoke' | 'search' | 'none';
}

const GY = 660;

export const SITES: Record<ThemeId, SiteMeta> = {
  belta: {
    skyTop: '#7d8ca3', skyBot: '#c9bfa8', ground: '#6b6f76', groundTop: '#82868d',
    flag: { x: 1030, top: 318, base: 410 },
    svg: './assets/sites/belta.svg', overlay: 'wire',
  },
  mvd: {
    skyTop: '#4a5564', skyBot: '#9aa3ad', ground: '#5a5e64', groundTop: '#6e737a',
    flag: { x: 1168, top: 268, base: 420 },
    svg: './assets/sites/mvd.svg', overlay: 'none',
  },
  okrestina: {
    skyTop: '#2c3038', skyBot: '#6a6460', ground: '#3e3c3a', groundTop: '#524e4a',
    flag: { x: 1188, top: 300, base: GY },
    svg: './assets/sites/okrestina.svg', overlay: 'search',
  },
  railway: {
    skyTop: '#3d4a63', skyBot: '#c97b4a', ground: '#4a4f57', groundTop: '#5d636c',
    flag: { x: 348, top: 428, base: GY },
    svg: './assets/sites/railway.svg', overlay: 'tanks',
  },
  azot: {
    skyTop: '#5d6d72', skyBot: '#b8a98c', ground: '#5d5a4e', groundTop: '#716d5e',
    flag: { x: 980, top: 228, base: 400 },
    svg: './assets/sites/azot.svg', overlay: 'smoke',
  },
  kgb: {
    skyTop: '#1e2430', skyBot: '#6a5a52', ground: '#3a3a40', groundTop: '#4c4c54',
    flag: { x: 1110, top: 248, base: 380 },
    svg: './assets/sites/kgb.svg', overlay: 'none',
  },
  border: {
    skyTop: '#5a7a8a', skyBot: '#c5c0a8', ground: '#6a684e', groundTop: '#7e7a5c',
    flag: { x: 1210, top: 390, base: GY },
    svg: './assets/sites/border.svg', overlay: 'none',
  },
  aeroflot: {
    skyTop: '#4f8fd0', skyBot: '#bcd9ee', ground: '#48607a', groundTop: '#5a7590',
    flag: { x: 1193, top: 148, base: 318 },
    svg: './assets/sites/aeroflot.svg', overlay: 'none', plane: true,
  },
};

export const FLAG_POLE: Record<ThemeId, { x: number; top: number; base: number }> = {
  belta: SITES.belta.flag,
  mvd: SITES.mvd.flag,
  okrestina: SITES.okrestina.flag,
  railway: SITES.railway.flag,
  azot: SITES.azot.flag,
  kgb: SITES.kgb.flag,
  border: SITES.border.flag,
  aeroflot: SITES.aeroflot.flag,
};
