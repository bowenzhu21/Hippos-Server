const API_BASE = process.env.EXPO_PUBLIC_HIPPOS_API_BASE;

export type FlexionSampleOut = {
  ts: string;
  angle_deg: number;
};

export type IngestResponse = {
  inserted: number;
  updated: number;
};

function assertEnv() {
  if (!API_BASE) {
    throw new Error("EXPO_PUBLIC_HIPPOS_API_BASE is not configured");
  }
  if (!process.env.EXPO_PUBLIC_HIPPOS_API_KEY) {
    throw new Error("EXPO_PUBLIC_HIPPOS_API_KEY is not configured");
  }
}

function buildUrl(path: string): string {
  assertEnv();
  return `${API_BASE!.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function ingestFlexionSamples(
  sessionId: string,
  samples: FlexionSampleOut[]
): Promise<IngestResponse> {
  if (!sessionId) {
    throw new Error("Session ID is required");
  }
  if (samples.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const url = buildUrl(`/v1/sessions/${sessionId}/flexion-samples`);
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": process.env.EXPO_PUBLIC_HIPPOS_API_KEY ?? "",
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ samples }),
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const payload = await res.json();
      if (payload?.detail) detail = payload.detail;
    } catch {
      // ignore parse error; fall back to status text
    }
    throw new Error(`Ingest request failed: ${detail}`);
  }

  return (await res.json()) as IngestResponse;
}
