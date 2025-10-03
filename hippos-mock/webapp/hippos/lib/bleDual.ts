import { BleManager, BleError, Characteristic, Device } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { computeFlexion, IMUFrame } from "./computeFlexion";

// NUS UUIDs
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_CHAR = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

type Listener = (state: { status: string; angle?: number | null; calibrated?: boolean; error?: string; }) => void;

export class DualHX1 {
  private mgr = new BleManager();
  private leftId: string | null = null;
  private rightId: string | null = null;
  private onUpdate: Listener;

  constructor(onUpdate: Listener) { this.onUpdate = onUpdate; }

  async connectTwo() {
    this.onUpdate({ status: "scanning" });
    const found: Device[] = [];
    await new Promise<void>((resolve) => {
      this.mgr.startDeviceScan(null, { allowDuplicates: false }, (err: BleError | null, dev: Device | null) => {
        if (err) { this.onUpdate({ status:"error", error: err.message }); return; }
        if (!dev) return;
        if ((dev.name || "").includes("HX1") && !found.find(d => d.id === dev.id)) {
          found.push(dev);
          if (found.length >= 2) { this.mgr.stopDeviceScan(); resolve(); }
        }
      });
      setTimeout(() => { this.mgr.stopDeviceScan(); resolve(); }, 8000);
    });

    if (found.length < 2) { this.onUpdate({ status:"error", error:"Found fewer than 2 HX1 devices" }); return; }

    const left = found[0], right = found[1];
    this.leftId = left.id; this.rightId = right.id;

    const L = await left.connect(); try { await L.requestMTU(247); } catch {}
    await L.discoverAllServicesAndCharacteristics();

    const R = await right.connect(); try { await R.requestMTU(247); } catch {}
    await R.discoverAllServicesAndCharacteristics();

    const parse = (deviceId: string, base64: string): IMUFrame[] => {
      const s = Buffer.from(base64, "base64").toString("utf8");
      const out: IMUFrame[] = [];
      for (const line of s.split("\n")) {
        const p = line.trim().split(",");
        if (p.length < 11) continue;
        const t = Number(p[0]); // seconds with 6 decimals or microseconds
        const t_us = t < 1e6 ? Math.round(t * 1e6) : Math.round(t);
        const nums = p.slice(1).map(Number);
        const [ax,ay,az,gx,gy,gz,mx,my,mz,temp] = nums;
        if ([ax,ay,az,gx,gy,gz].some(n => !Number.isFinite(n))) continue;
        out.push({ deviceId, t_us_device: t_us, ax,ay,az,gx,gy,gz,mx,my,mz,temp });
      }
      return out;
    };

    const qL: IMUFrame[] = [];
    const qR: IMUFrame[] = [];
    const TOL_US = 10_000; // ±10 ms

    const tryPair = async () => {
      while (qL.length && qR.length) {
        const a = qL[0], b = qR[0];
        const dt = a.t_us_device - b.t_us_device;
        if (Math.abs(dt) <= TOL_US) {
          qL.shift(); qR.shift();
          try {
            const res = await computeFlexion(a, b);
            this.onUpdate({ status: "streaming", calibrated: res.calibrated, angle: res.angle ?? null });
          } catch (e:any) {
            this.onUpdate({ status: "error", error: e?.message || String(e) });
          }
        } else if (dt < 0) { qL.shift(); } else { qR.shift(); }
      }
    };

    L.monitorCharacteristicForService(NUS_SERVICE, NUS_TX_CHAR, (_e: BleError | null, c: Characteristic | null) => {
      if (!c?.value) return;
      qL.push(...parse(L.id, c.value)); tryPair();
    });
    R.monitorCharacteristicForService(NUS_SERVICE, NUS_TX_CHAR, (_e: BleError | null, c: Characteristic | null) => {
      if (!c?.value) return;
      qR.push(...parse(R.id, c.value)); tryPair();
    });

    this.onUpdate({ status: "connected" });
  }

  destroy() { try { this.mgr.destroy(); } catch {} }
}
