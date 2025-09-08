import { Platform } from 'react-native';

const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE = `http://${HOST}:5050`;

export type ProcessedPoint = {
  timestamp: number; // seconds
  combined_average: number; // angle
};

export async function getLatestProcessed(): Promise<ProcessedPoint | null> {
  try {
    const res = await fetch(`${API_BASE}/latest_processed`);
    if (!res.ok) return null;
    const json = (await res.json()) as { timestamp?: number; combined_average?: number };
    if (json?.timestamp == null || json?.combined_average == null) return null;
    return { timestamp: Number(json.timestamp), combined_average: Number(json.combined_average) };
  } catch {
    return null;
  }
}

export async function getHistory(): Promise<ProcessedPoint[]> {
  try {
    const res = await fetch(`${API_BASE}/history`);
    if (!res.ok) return [];
    const arr = (await res.json()) as ProcessedPoint[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

