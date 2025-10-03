export type IMUFrame = {
  deviceId: string;
  t_us_device: number; // microseconds since device boot
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number; // deg/s
  mx: number; my: number; mz: number;
  temp: number;
};

const BASE = process.env.EXPO_PUBLIC_FLEXION_BASE ?? "https://hippos-api.ddns.net"; // set via env
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

  const res = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: SESSION_ID, thigh: toRow(left), shank: toRow(right) }),
  });

  if (!res.ok) throw new Error(`Flexion service HTTP ${res.status}`);
  return res.json(); // { calibrated, angle }
}