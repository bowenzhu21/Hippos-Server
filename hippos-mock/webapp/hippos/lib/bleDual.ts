import { BleManager, BleError, Characteristic, Device, State, Subscription } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { FlexionEstimator, ImuRow } from "@/lib/flexionRuntime";

export type IMUFrame = {
  deviceId: string;
  t_us_device: number;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  mx: number; my: number; mz: number;
  temp: number;
};

// NUS UUIDs
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_CHAR = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const PERIOD_MS = 60;
const SAMPLE_RATE_HZ = 1000 / PERIOD_MS;
const PAIR_TOL_MS = 20;
const PAIR_TOL_US = PAIR_TOL_MS * 1000;
const MAX_QUEUE = 120;
const UI_EMIT_INTERVAL_MS = 150;

type Listener = (state: {
  status?: string;
  angle?: number | null;
  calibrated?: boolean;
  error?: string;
  leftFrame?: IMUFrame;
  rightFrame?: IMUFrame;
  leftDeviceName?: string;
  rightDeviceName?: string;
}) => void;

export class DualHX1 {
  private mgr: BleManager | null = null;
  private leftId: string | null = null;
  private rightId: string | null = null;
  private onUpdate: Listener;
  private stateSub: Subscription | null = null;
  private estimator = new FlexionEstimator({ fs: SAMPLE_RATE_HZ, calibSeconds: 10, accelCutoffHz: 5, windowSeconds: 1 });
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private latestAngle: number | null = null;
  private latestCalibrated = false;
  private latestStatus: "idle" | "scanning" | "connecting" | "calibrating" | "streaming" | "error" | "bluetooth-off" = "idle";
  private latestLeftFrame: IMUFrame | null = null;
  private latestRightFrame: IMUFrame | null = null;
  private latestLeftName: string | null = null;
  private latestRightName: string | null = null;

  constructor(onUpdate: Listener) { this.onUpdate = onUpdate; }

  private startEmitLoop() {
    if (this.emitTimer) return;
    this.emitTimer = setInterval(() => {
      this.onUpdate({
        status: this.latestStatus,
        calibrated: this.latestCalibrated,
        angle: this.latestCalibrated ? this.latestAngle ?? null : null,
        leftFrame: this.latestLeftFrame ?? undefined,
        rightFrame: this.latestRightFrame ?? undefined,
        leftDeviceName: this.latestLeftName ?? undefined,
        rightDeviceName: this.latestRightName ?? undefined,
      });
    }, UI_EMIT_INTERVAL_MS);
  }

  private getManager(): BleManager {
    if (this.mgr) return this.mgr;
    try {
      this.mgr = new BleManager();
      return this.mgr;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onUpdate({ status: "error", error: message });
      throw err;
    }
  }

  private async ensurePoweredOn() {
    const mgr = this.getManager();
    const current = await mgr.state();
    if (current === State.PoweredOn) return;

    this.latestStatus = "bluetooth-off";
    this.startEmitLoop();
    this.onUpdate({ status: "bluetooth-off" });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stateSub?.remove();
        this.stateSub = null;
        reject(new Error("Bluetooth not powered on"));
      }, 8000);

      this.stateSub = mgr.onStateChange((state) => {
        if (state === State.PoweredOn) {
          clearTimeout(timeout);
          this.stateSub?.remove();
          this.stateSub = null;
          resolve();
        } else if (state === State.Unsupported) {
          clearTimeout(timeout);
          this.stateSub?.remove();
          this.stateSub = null;
          reject(new Error("Bluetooth unsupported"));
        }
      }, true);
    });
  }

  async connectTwo() {
    try {
      await this.ensurePoweredOn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onUpdate({ status: "error", error: message });
      this.latestStatus = "error";
      throw err;
    }

    this.estimator.reset();
    this.latestAngle = null;
    this.latestCalibrated = false;
    this.latestLeftFrame = null;
    this.latestRightFrame = null;
    this.latestLeftName = null;
    this.latestRightName = null;
    this.latestStatus = "scanning";
    this.startEmitLoop();
    this.onUpdate({ status: "scanning" });
    const mgr = this.getManager();
    const found: Device[] = [];
    await new Promise<void>((resolve) => {
      mgr.startDeviceScan(null, { allowDuplicates: false }, (err: BleError | null, dev: Device | null) => {
        if (err) {
          this.latestStatus = "error";
          this.onUpdate({ status:"error", error: err.message });
          return;
        }
        if (!dev) return;
        if ((dev.name || "").includes("HX1") && !found.find(d => d.id === dev.id)) {
          found.push(dev);
          if (found.length >= 2) { mgr.stopDeviceScan(); resolve(); }
        }
      });
      setTimeout(() => { mgr.stopDeviceScan(); resolve(); }, 8000);
    });

    if (found.length < 2) {
      this.latestStatus = "error";
      this.latestCalibrated = false;
      this.latestAngle = null;
      this.onUpdate({ status:"error", error:"Found fewer than 2 HX1 devices" });
      return;
    }

    const left = found[0], right = found[1];
    this.leftId = left.id; this.rightId = right.id;
    this.latestLeftName = left.name ?? left.id;
    this.latestRightName = right.name ?? right.id;
    this.latestStatus = "connecting";
    this.onUpdate({
      status: "connecting",
      leftDeviceName: this.latestLeftName,
      rightDeviceName: this.latestRightName,
    });

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
        const t_us = Math.round(parseFloat(p[0]) * 1e6);
        const nums = p.slice(1).map(Number);
        const [ax,ay,az,gx,gy,gz,mx,my,mz,temp] = nums;
        if ([ax,ay,az,gx,gy,gz].some(n => !Number.isFinite(n))) continue;
        out.push({ deviceId, t_us_device: t_us, ax,ay,az,gx,gy,gz,mx,my,mz,temp });
      }
      return out;
    };

    const qL: IMUFrame[] = [];
    const qR: IMUFrame[] = [];

    const frameToRow = (f: IMUFrame): ImuRow => ([
      f.t_us_device,
      f.ax, f.ay, f.az,
      f.gx, f.gy, f.gz,
      f.mx, f.my, f.mz,
      f.temp,
    ]);

    const tryPair = () => {
      while (qL.length && qR.length) {
        const a = qL[0], b = qR[0];
        const dt = a.t_us_device - b.t_us_device;
        if (Math.abs(dt) <= PAIR_TOL_US) {
          qL.shift(); qR.shift();
          try {
            const thighRow = frameToRow(a);
            const shankRow = frameToRow(b);
            const { angle, calibrated } = this.estimator.ingest(thighRow, shankRow);
            if (calibrated && typeof angle === "number") {
              this.latestAngle = angle;
            }
            this.latestCalibrated = calibrated;
            this.latestStatus = calibrated ? "streaming" : "calibrating";
          } catch (e: any) {
            this.latestStatus = "error";
            this.latestCalibrated = false;
            this.latestAngle = null;
            this.onUpdate({ status: "error", error: e?.message || String(e) });
          }
        } else if (dt < 0) { qL.shift(); } else { qR.shift(); }
      }
    };

    L.monitorCharacteristicForService(NUS_SERVICE, NUS_TX_CHAR, (_e: BleError | null, c: Characteristic | null) => {
      if (!c?.value) return;
      const frames = parse(L.id, c.value);
      if (frames.length) {
        qL.push(...frames);
        while (qL.length > MAX_QUEUE) qL.shift();
        this.latestLeftFrame = frames[frames.length - 1];
        tryPair();
      }
    });
    R.monitorCharacteristicForService(NUS_SERVICE, NUS_TX_CHAR, (_e: BleError | null, c: Characteristic | null) => {
      if (!c?.value) return;
      const frames = parse(R.id, c.value);
      if (frames.length) {
        qR.push(...frames);
        while (qR.length > MAX_QUEUE) qR.shift();
        this.latestRightFrame = frames[frames.length - 1];
        tryPair();
      }
    });

    this.latestStatus = "calibrating";
    this.latestCalibrated = false;
    this.onUpdate({
      status: "connected",
      leftDeviceName: this.latestLeftName ?? left.id,
      rightDeviceName: this.latestRightName ?? right.id,
    });
  }

  destroy() {
    try {
      this.stateSub?.remove();
      this.stateSub = null;
    } catch {}
    try {
      this.mgr?.destroy();
      this.mgr = null;
    } catch {}
    if (this.emitTimer) {
      clearInterval(this.emitTimer);
      this.emitTimer = null;
    }
    this.latestAngle = null;
    this.latestCalibrated = false;
    this.latestStatus = "idle";
    this.latestLeftFrame = null;
    this.latestRightFrame = null;
    this.latestLeftName = null;
    this.latestRightName = null;
    try {
      this.estimator.reset();
    } catch {}
  }
}
