export type IMUFrame = {
  deviceId: string;
  t_us_device: number; // microseconds since device boot
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number; // deg/s
  mx: number; my: number; mz: number;
  temp: number;
};

const BASE = process.env.EXPO_PUBLIC_FLEXION_BASE ?? "http://YOUR-LAN-IP:8000"; // set via env
const SESSION_ID = process.env.EXPO_PUBLIC_FLEXION_SESSION ?? "default-session";

export async function computeFlexion(left: IMUFrame, right: IMUFrame): Promise<{ calibrated: boolean; angle: number | null; }> {
  // Build rows exactly as server expects:
  const toRow = (f: IMUFrame) => ([
    Math.round(f.t_us_device),
    f.ax, f.ay, f.az,
    f.gx, f.gy, f.gz,
    f.mx, f.my, f.mz,
    f.temp,
  ]);

  const base = BASE.replace(/\/+$/, "");
  const url = `${base}/ingest`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: SESSION_ID, thigh: toRow(left), shank: toRow(right) }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Flexion service request failed (${url}): ${msg}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const msg = detail ? `Flexion service HTTP ${res.status}: ${detail}` : `Flexion service HTTP ${res.status}`;
    throw new Error(`${msg} (POST ${url})`);
  }
  return res.json(); // { calibrated, angle }
}
