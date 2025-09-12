import { Platform } from 'react-native';

const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE = `http://${HOST}:5050`;

// Optional remote FastAPI base (set via Expo env at build/run time)
// Example: EXPO_PUBLIC_HIPPOS_API_BASE=https://api.your-domain.com
// Example: EXPO_PUBLIC_HIPPOS_API_KEY=hippos_dev_key_123
const REMOTE_API_BASE = process.env.EXPO_PUBLIC_HIPPOS_API_BASE || '';
export const INGEST_BASE = REMOTE_API_BASE || API_BASE;

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

// Ingest to FastAPI /v1/ingest. Falls back to local mock if REMOTE is unset.
export type IngestSample = {
  session_id: string; // UUID per session
  device_timestamp_ms: number; // ms
  values: Record<string, number>;
};

export async function ingestSamples(samples: IngestSample[]): Promise<{ inserted: number; received: number }> {
  const apiKey = process.env.EXPO_PUBLIC_HIPPOS_API_KEY || 'hippos_dev_key_123';
  const res = await fetch(`${INGEST_BASE}/v1/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ samples }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ingest failed: ${res.status} ${text}`);
  }
  return res.json();
}
