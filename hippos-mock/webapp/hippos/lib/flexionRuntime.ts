// webapp/hippos/lib/flexionRuntime.ts
// Streaming flexion estimator: calibrates once, then returns one angle per paired IMU frame.
// Parity switches (set to true ONLY if you need exact quirks from the pasted Python):
const USE_PY_TIME_QUIRK = false;          // Python used t_us / 100.0 (likely a bug). false => proper µs→ms (/1000).
const DUPLICATE_MINIMA_FOR_PARITY = false; // Python appended j1 minima twice instead of using j2 minima.

export type ImuRow = [
  t_us: number,      // microseconds since boot
  ax: number, ay: number, az: number,        // m/s^2
  gx_deg: number, gy_deg: number, gz_deg: number, // deg/s
  mx: number, my: number, mz: number,        // µT (unused in math)
  tempC: number
];

type Vec3 = [number, number, number];

// ------------------------- numeric helpers -------------------------
const dot = (a: Vec3, b: Vec3) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul3 = (a: Vec3, s: number): Vec3 => [a[0]*s, a[1]*s, a[2]*s];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0],
];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => {
  const n = norm(a) + 1e-12;
  return [a[0]/n, a[1]/n, a[2]/n];
};
const toRad = (deg: number) => (deg * Math.PI) / 180;

// ------------------------- filtering (4th-order butter + zero-phase) -------------------------
// RBJ biquad design for lowpass; two biquads cascaded => 4th order
type Biquad = { b0:number; b1:number; b2:number; a1:number; a2:number };
function designButterworthLP(fc: number, fs: number): [Biquad, Biquad] {
  // Two 2nd-order sections for Butterworth 4th order at normalized cutoff
  // We'll approximate using identical Qs for simplicity: Q1≈0.5412, Q2≈1.3065 (Butterworth 4th)
  const q1 = 0.5411961;
  const q2 = 1.3065629;
  const mk = (Q: number): Biquad => {
    const w0 = 2 * Math.PI * (fc / fs);
    const cos = Math.cos(w0);
    const sin = Math.sin(w0);
    const alpha = sin / (2 * Q);
    let b0 = (1 - cos) / 2;
    let b1 = 1 - cos;
    let b2 = (1 - cos) / 2;
    let a0 = 1 + alpha;
    let a1 = -2 * cos;
    let a2 = 1 - alpha;
    // normalize by a0
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    return { b0, b1, b2, a1, a2 };
  };
  return [mk(q1), mk(q2)];
}
function biquadFilterForward(data: number[], s: Biquad): number[] {
  const out = new Array<number>(data.length);
  let x1=0, x2=0, y1=0, y2=0;
  for (let i=0;i<data.length;i++){
    const x = data[i];
    const y = s.b0*x + s.b1*x1 + s.b2*x2 - s.a1*y1 - s.a2*y2;
    out[i] = y;
    x2=x1; x1=x; y2=y1; y1=y;
  }
  return out;
}
function zeroPhaseFilter3d(arr: number[][], fc: number, fs: number): number[][] {
  // arr: Nx3. Apply two cascaded LP biquads, forward then backward (filtfilt).
  const [s1, s2] = designButterworthLP(fc, fs);
  const N = arr.length;
  const out = Array.from({length:N}, ()=>[0,0,0] as Vec3);
  for (let c=0;c<3;c++){
    const col = arr.map(r => r[c]);
    // forward
    let y = biquadFilterForward(biquadFilterForward(col, s1), s2);
    // backward: filter reversed then reverse back
    y = y.reverse();
    y = biquadFilterForward(biquadFilterForward(y, s1), s2).reverse();
    for (let i=0;i<N;i++) out[i][c] = y[i];
  }
  return out;
}

// ------------------------- math from your Python -------------------------
function unit_from_sph(phi: number, theta: number): Vec3 {
  return [
    Math.cos(phi) * Math.cos(theta),
    Math.cos(phi) * Math.sin(theta),
    Math.sin(phi),
  ];
}
function gamma_g_o(g: Vec3, gp: Vec3, o: Vec3): Vec3 {
  // g x (g x o) + g' x o
  return add3(cross(g, cross(g, o)), cross(gp, o));
}

// 5-point central difference for G' (rad/s^2) along time vector (ms or ms/100 — whatever we pass in)
function calc_gg(G: number[][], time_ms_like: number[]): number[][] {
  const N = G.length;
  const out: number[][] = Array.from({length:N}, ()=>[0,0,0]);
  if (N < 5) return out; // too short; zeros

  // build dt per index (convert ms-like to seconds)
  const t = time_ms_like.map((x) => x / 1000.0);
  const DX = (i:number, c:number, k:number) => {
    const im2 = Math.max(0, i-2), im1 = Math.max(0, i-1);
    const ip1 = Math.min(N-1, i+1), ip2 = Math.min(N-1, i+2);
    // Using nominal dt at i from t[i]-t[i-1] (fallback to median if zero)
    const dt = i>0 ? (t[i] - t[i-1] || 1/57) : (t[1]-t[0] || 1/57);
    // classic 5-point stencil: f'(x0) ≈ ( -f(x+2h) + 8 f(x+h) - 8 f(x-h) + f(x-2h) ) / (12h)
    const term = (-G[ip2][c] + 8*G[ip1][c] - 8*G[im1][c] + G[im2][c]) / (12 * dt);
    return term;
  };
  for (let i=0;i<N;i++){
    out[i][0] = DX(i,0,1);
    out[i][1] = DX(i,1,1);
    out[i][2] = DX(i,2,1);
  }
  return out;
}

// residuals (Eq. 6) for joint axes search
function residuals(phi1:number, theta1:number, phi2:number, theta2:number, G1:number[][], G2:number[][]): number[] {
  const j1 = unit_from_sph(phi1, theta1);
  const j2 = unit_from_sph(phi2, theta2);
  const N = G1.length;
  const r = new Array<number>(N);
  for (let i=0;i<N;i++){
    const c1 = cross(G1[i] as Vec3, j1);  // arrays are [x,y,z]
    const c2 = cross(G2[i] as Vec3, j2);
    r[i] = Math.hypot(...c1) - Math.hypot(...c2);
  }
  return r;
}

// finite-diff Gauss–Newton (two variables) as in Python
function gauss_newton(optInit:[number,number], fixed:[number,number], fixed_is_j1:boolean, G1:number[][], G2:number[][], tol=1e-8, maxIter=50): {p:[number,number], cost:number} {
  let p = [optInit[0], optInit[1]];
  const h = 1e-6;
  for (let it=0; it<maxIter; it++){
    const [phi1,theta1,phi2,theta2] = fixed_is_j1
      ? [fixed[0], fixed[1], p[0], p[1]]
      : [p[0], p[1], fixed[0], fixed[1]];
    const r = residuals(phi1,theta1,phi2,theta2,G1,G2);
    const JTJ = [[0,0],[0,0]];
    const JTr = [0,0];
    for (let j=0;j<2;j++){
      const pp = [...p] as [number,number];
      pp[j] += h;
      const rPlus = fixed_is_j1
        ? residuals(fixed[0], fixed[1], pp[0], pp[1], G1, G2)
        : residuals(pp[0], pp[1], fixed[0], fixed[1], G1, G2);
      for (let i=0;i<r.length;i++){
        const d = (rPlus[i]-r[i]) / h;
        // build JᵀJ and Jᵀr on the fly
        JTJ[0][j] += (j===0?d:0) * d; // will fill properly below
        JTJ[1][j] += (j===1?d:0) * d;
      }
    }
    // Properly build JᵀJ and Jᵀr: recompute J columns then accumulate
    const J = [new Array<number>(r.length), new Array<number>(r.length)];
    for (let j=0;j<2;j++){
      const pp = [...p] as [number,number];
      pp[j] += h;
      const rPlus = fixed_is_j1
        ? residuals(fixed[0], fixed[1], pp[0], pp[1], G1, G2)
        : residuals(pp[0], pp[1], fixed[0], fixed[1], G1, G2);
      for (let i=0;i<r.length;i++) J[j][i] = (rPlus[i]-r[i]) / h;
    }
    // JTJ and JTr:
    const JTJ2 = [[0,0],[0,0]];
    const JTr2 = [0,0];
    for (let i=0;i<r.length;i++){
      JTJ2[0][0] += J[0][i]*J[0][i];
      JTJ2[0][1] += J[0][i]*J[1][i];
      JTJ2[1][0] += J[1][i]*J[0][i];
      JTJ2[1][1] += J[1][i]*J[1][i];
      JTr2[0] += J[0][i]*r[i];
      JTr2[1] += J[1][i]*r[i];
    }
    const det = JTJ2[0][0]*JTJ2[1][1] - JTJ2[0][1]*JTJ2[1][0];
    if (Math.abs(det) < 1e-20) break;
    const inv = [
      [ JTJ2[1][1]/det, -JTJ2[0][1]/det ],
      [ -JTJ2[1][0]/det, JTJ2[0][0]/det ],
    ];
    const delta: [number,number] = [
      inv[0][0]*JTr2[0] + inv[0][1]*JTr2[1],
      inv[1][0]*JTr2[0] + inv[1][1]*JTr2[1],
    ];
    const pNew: [number,number] = [p[0]-delta[0], p[1]-delta[1]];
    const step = Math.hypot(delta[0], delta[1]);
    p = pNew;
    if (step < tol) break;
  }
  // cost
  const [phi1,theta1,phi2,theta2] = fixed_is_j1
    ? [fixed[0], fixed[1], p[0], p[1]]
    : [p[0], p[1], fixed[0], fixed[1]];
  const rr = residuals(phi1,theta1,phi2,theta2,G1,G2);
  const cost = rr.reduce((s,v)=>s+v*v,0);
  return { p: [p[0], p[1]], cost };
}

function psi_surface_for_j(phiVals:number[], thetaVals:number[], G1:number[][], G2:number[][], which:number): number[][] {
  const M = phiVals.length, N = thetaVals.length;
  const Psi = Array.from({length:M}, ()=>new Array<number>(N).fill(0));
  for (let i=0;i<M;i++){
    for (let j=0;j<N;j++){
      const phi = phiVals[i], theta = thetaVals[j];
      const { cost } = gauss_newton([0,0], [phi,theta], which===1, G1, G2);
      Psi[i][j] = cost;
    }
  }
  return Psi;
}

// local minima (2 best) like skimage. We search minima of Psi (not edges).
function find_two_minima_on_surface(Psi:number[][], phiVals:number[], thetaVals:number[]):
  Array<[phi:number, theta:number, cost:number]> {
  const M = Psi.length, N = Psi[0].length;
  const mins: Array<[number, number, number]> = [];
  for (let i=1;i<M-1;i++){
    for (let j=1;j<N-1;j++){
      const v = Psi[i][j];
      // local minimum vs 8-neighborhood
      let isMin = true;
      for (let di=-1; di<=1; di++){
        for (let dj=-1; dj<=1; dj++){
          if (di===0 && dj===0) continue;
          if (Psi[i+di][j+dj] <= v) { isMin = false; break; }
        }
        if (!isMin) break;
      }
      if (isMin) mins.push([phiVals[i], thetaVals[j], v]);
    }
  }
  mins.sort((a,b)=>a[2]-b[2]);
  return mins.slice(0,2);
}

function pick_c_perp(j: Vec3): Vec3 {
  const ex:Vec3 = [1,0,0], ey:Vec3=[0,1,0];
  const v = Math.abs(dot(j,ex)) < 0.9 ? ex : ey;
  const proj = mul3(j, dot(v,j));
  const c = sub3(v, proj);
  return normalize(c);
}

function flexion_from_accel(
  acc1:number[][], acc2:number[][],
  gamma1:number[][], gamma2:number[][],
  j1:Vec3, j2:Vec3, c:Vec3
): number[] {
  const N = acc1.length;
  const j1n = normalize(j1), j2n = normalize(j2), cn = normalize(c);
  const ma1 = acc1.map((a,i)=> sub3(a as Vec3, gamma1[i] as Vec3));
  const ma2 = acc2.map((a,i)=> sub3(a as Vec3, gamma2[i] as Vec3));

  const x1 = normalize(cross(j1n, cn)); const y1 = normalize(cross(j1n, x1));
  const x2 = normalize(cross(j2n, cn)); const y2 = normalize(cross(j2n, x2));

  const v1 = ma1.map(v => [dot(v as Vec3, x1), dot(v as Vec3, y1)]);
  const v2 = ma2.map(v => [dot(v as Vec3, x2), dot(v as Vec3, y2)]);

  const out = new Array<number>(N);
  for (let i=0;i<N;i++){
    const d = v1[i][0]*v2[i][0] + v1[i][1]*v2[i][1];
    const cr = v1[i][0]*v2[i][1] - v1[i][1]*v2[i][0];
    out[i] = (Math.atan2(cr, d) * 180) / Math.PI;
  }
  return out;
}

function flexion_from_gyro(
  G1:number[][], G2:number[][], j1:Vec3, j2:Vec3,
  time_ms_like:number[], alpha0=0
): number[] {
  const N = G1.length;
  const integ = new Array<number>(N);
  for (let i=0;i<N;i++){
    integ[i] = (G1[i][0]*j1[0] + G1[i][1]*j1[1] + G1[i][2]*j1[2])
             - (G2[i][0]*j2[0] + G2[i][1]*j2[1] + G2[i][2]*j2[2]);
  }
  const t = time_ms_like.map((x)=> x / 1000.0); // seconds
  // integrate with cumulative trapezoid
  const alphaRad = new Array<number>(N).fill(0);
  for (let n=1;n<N;n++){
    const dt = t[n] - t[n-1];
    alphaRad[n] = alphaRad[n-1] + 0.5 * (integ[n-1] + integ[n]) * dt;
  }
  const alphaDeg = alphaRad.map(r => alpha0 + (r * 180) / Math.PI);
  return alphaDeg;
}

function compute_alpha_final(Aa:number[], Ag:number[], _dt:number, w=0.01): number[] {
  const n = Aa.length;
  const out = new Array<number>(n);
  out[0] = Aa[0];
  for (let t=1;t<n;t++){
    out[t] = w*Aa[t] + (1-w)*( out[t-1] + (Ag[t] - 1.008*Ag[t-1]) );
  }
  return out;
}

// ------------------------- Main runtime class -------------------------
export class FlexionEstimator {
  private fs: number;
  private calibNeeded: number;
  private accelCut: number;
  private winLen: number;

  private bufThigh: ImuRow[] = [];
  private bufShank: ImuRow[] = [];

  private j1a: Vec3 | null = null;
  private j2a: Vec3 | null = null;
  private p1: Vec3 | null = null;
  private p2: Vec3 | null = null;

  public calibrated = false;
  public lastAngle: number | null = null;

  constructor(opts?: { fs?: number; calibSeconds?: number; accelCutoffHz?: number; windowSeconds?: number }) {
    this.fs = opts?.fs ?? 57;
    this.calibNeeded = Math.round(this.fs * (opts?.calibSeconds ?? 10)); // ~570
    this.accelCut = opts?.accelCutoffHz ?? 5;
    this.winLen = Math.max(64, Math.round(this.fs * (opts?.windowSeconds ?? 1.0)));
  }

  reset() {
    this.bufThigh = []; this.bufShank = [];
    this.j1a = this.j2a = this.p1 = this.p2 = null;
    this.calibrated = false;
    this.lastAngle = null;
  }

  isCalibrated() { return this.calibrated; }

  private asArrays(rowsThigh: ImuRow[], rowsShank: ImuRow[]) {
    const T = rowsThigh.length;
    if (T !== rowsShank.length || T < 2) throw new Error("Mismatched or too-short windows");

    const t_us = rowsThigh.map(r => r[0]);
    // parity switch for Python's /100.0 vs real µs→ms (/1000)
    const time_ms_like = t_us.map(us => us / (USE_PY_TIME_QUIRK ? 100.0 : 1000.0));

    const A1 = rowsThigh.map(r => [r[1], r[2], r[3]]);
    const A2 = rowsShank.map(r => [r[1], r[2], r[3]]);
    const A1f = zeroPhaseFilter3d(A1, this.accelCut, this.fs);
    const A2f = zeroPhaseFilter3d(A2, this.accelCut, this.fs);

    // gyro deg/s → rad/s
    const G1 = rowsThigh.map(r => [toRad(r[4]), toRad(r[5]), toRad(r[6])]);
    const G2 = rowsShank.map(r => [toRad(r[4]), toRad(r[5]), toRad(r[6])]);

    const GP1 = calc_gg(G1, time_ms_like);
    const GP2 = calc_gg(G2, time_ms_like);

    return { time_ms_like, A1: A1f, A2: A2f, G1, G2, GP1, GP2 };
  }

  private calibrateIfReady() {
    if (this.calibrated) return;
    if (this.bufThigh.length < this.calibNeeded || this.bufShank.length < this.calibNeeded) return;

    const rowsThigh = this.bufThigh.slice(0, this.calibNeeded);
    const rowsShank = this.bufShank.slice(0, this.calibNeeded);

    const { time_ms_like, A1, A2, G1, G2, GP1, GP2 } = this.asArrays(rowsThigh, rowsShank);

    // grid search surfaces
    const phiVals = linspace(-Math.PI/2, Math.PI/2, 20);
    const thetaVals = linspace(-Math.PI, Math.PI, 20);
    const Psi_j1 = psi_surface_for_j(phiVals, thetaVals, G1, G2, 1);
    const Psi_j2 = psi_surface_for_j(phiVals, thetaVals, G1, G2, 2);

    const min1 = find_two_minima_on_surface(Psi_j1, phiVals, thetaVals);
    const min2 = find_two_minima_on_surface(Psi_j2, phiVals, thetaVals);

    const axes: Vec3[] = [];
    for (const [phi,theta] of min1) axes.push(unit_from_sph(phi*Math.PI, theta*Math.PI));
    if (DUPLICATE_MINIMA_FOR_PARITY) {
      for (const [phi,theta] of min1) axes.push(unit_from_sph(phi*Math.PI, theta*Math.PI));
    } else {
      for (const [phi,theta] of min2) axes.push(unit_from_sph(phi*Math.PI, theta*Math.PI));
    }

    const j1a = normalize(axes[0]);
    const j2a = normalize(axes[2]);

    // Solve o1,o2 then apply Eq.9 shift to p1,p2 via simple GN on 6 vars
    const { p1, p2 } = estimate_joint_positions(A1, A2, G1, G2, GP1, GP2, j1a, j2a);

    this.j1a = j1a; this.j2a = j2a; this.p1 = p1; this.p2 = p2;
    this.calibrated = true;

    // Trim buffers to keep runtime light
    this.bufThigh = this.bufThigh.slice(-this.winLen);
    this.bufShank = this.bufShank.slice(-this.winLen);
  }

  ingest(thigh: ImuRow, shank: ImuRow): { angle: number | null; calibrated: boolean } {
    this.bufThigh.push(thigh);
    this.bufShank.push(shank);

    const maxKeep = this.calibNeeded + this.winLen;
    if (this.bufThigh.length > maxKeep) this.bufThigh.shift();
    if (this.bufShank.length > maxKeep) this.bufShank.shift();

    this.calibrateIfReady();
    if (!this.calibrated || !this.j1a || !this.j2a || !this.p1 || !this.p2) {
      return { angle: null, calibrated: false };
    }

    const n = Math.min(this.bufThigh.length, this.bufShank.length, this.winLen);
    const rowsThigh = this.bufThigh.slice(-n);
    const rowsShank = this.bufShank.slice(-n);

    const { time_ms_like, A1, A2, G1, G2, GP1, GP2 } = this.asArrays(rowsThigh, rowsShank);

    const gamma1 = G1.map((_,i)=> gamma_g_o(G1[i] as Vec3, GP1[i] as Vec3, this.p1!));
    const gamma2 = G2.map((_,i)=> gamma_g_o(G2[i] as Vec3, GP2[i] as Vec3, this.p2!));

    const c1 = pick_c_perp(this.j1a!);
    const c2 = pick_c_perp(this.j2a!);
    const cAvg: Vec3 = normalize([ (c1[0]+c2[0])/2, (c1[1]+c2[1])/2, (c1[2]+c2[2])/2 ]);

    const alphaB2 = flexion_from_accel(A1, A2, gamma1, gamma2, this.j1a!, this.j2a!, cAvg);
    const alpha0 = alphaB2[0];
    const alphaB1 = flexion_from_gyro(G1, G2, this.j1a!, this.j2a!, time_ms_like, alpha0);

    // sign flip heuristic
    const varMinus = variance(diffArrays(alphaB2, alphaB1));
    const varPlus  = variance(sumArrays(alphaB2, alphaB1));
    let alphaB1Fixed = alphaB1;
    if (varMinus > varPlus) alphaB1Fixed = alphaB1.map(v => -v);

    const dt = (time_ms_like[1] - time_ms_like[0]) / 1000.0; // seconds
    const alpha = compute_alpha_final(alphaB2, alphaB1Fixed, dt, 0.01);
    const angle = alpha[alpha.length-1];

    this.lastAngle = angle;
    return { angle, calibrated: true };
  }
}

// ------------------------- remaining helpers -------------------------
function variance(arr: number[]): number {
  const n = arr.length; if (n === 0) return 0;
  const m = arr.reduce((s,v)=>s+v,0)/n;
  return arr.reduce((s,v)=>s+(v-m)*(v-m),0)/n;
}
function diffArrays(a:number[], b:number[]) { return a.map((v,i)=> v - b[i]); }
function sumArrays(a:number[], b:number[]) { return a.map((v,i)=> v + b[i]); }
function linspace(start:number, end:number, n:number): number[] {
  if (n<=1) return [start];
  const step = (end - start) / (n - 1);
  return Array.from({length:n}, (_,i)=> start + i*step);
}

// ---------- joint position (Gauss–Newton on 6 vars) + Eq.9 shift ----------
function residuals_o(
  A1:number[][], A2:number[][], G1:number[][], G2:number[][],
  GP1:number[][], GP2:number[][], o1:Vec3, o2:Vec3
): number[] {
  const N = G1.length;
  const r = new Array<number>(N);
  for (let t=0;t<N;t++){
    const pred1 = gamma_g_o(G1[t] as Vec3, GP1[t] as Vec3, o1);
    const pred2 = gamma_g_o(G2[t] as Vec3, GP2[t] as Vec3, o2);
    const e1 = sub3(A1[t] as Vec3, pred1);
    const e2 = sub3(A2[t] as Vec3, pred2);
    r[t] = Math.hypot(...e1) - Math.hypot(...e2);
  }
  return r;
}

function gauss_newton_o(
  A1:number[][], A2:number[][], G1:number[][], G2:number[][], GP1:number[][], GP2:number[][],
  o1Init:Vec3, o2Init:Vec3, maxIter=50, tolStep=1e-8, tolCost=1e-10, h=1e-6, damping=1e-4
): {o1:Vec3, o2:Vec3} {
  let p = [...o1Init, ...o2Init]; // length 6
  const N = G1.length;
  const unpack = (arr:number[]): [Vec3,Vec3] => [[arr[0],arr[1],arr[2]], [arr[3],arr[4],arr[5]]];
  let [o1, o2] = unpack(p);
  let r = residuals_o(A1,A2,G1,G2,GP1,GP2,o1,o2);
  let cost = r.reduce((s,v)=>s+v*v,0);

  for (let it=0; it<maxIter; it++){
    const J = Array.from({length:N}, ()=> new Array<number>(6).fill(0));
    for (let j=0;j<6;j++){
      const pp = [...p]; pp[j] += h;
      const [o1p, o2p] = unpack(pp);
      const rp = residuals_o(A1,A2,G1,G2,GP1,GP2,o1p,o2p);
      for (let i=0;i<N;i++) J[i][j] = (rp[i]-r[i]) / h;
    }
    // JTJ (6x6) and JTr (6)
    const JTJ = Array.from({length:6}, ()=> new Array<number>(6).fill(0));
    const JTr = new Array<number>(6).fill(0);
    for (let i=0;i<N;i++){
      for (let c=0;c<6;c++){
        JTr[c] += J[i][c]*r[i];
        for (let d=0; d<6; d++) JTJ[c][d] += J[i][c]*J[i][d];
      }
    }
    for (let d=0; d<6; d++) JTJ[d][d] += damping;

    // Solve (JTJ) delta = JTr
    const delta = solveSymmetric6(JTJ, JTr);
    for (let j=0;j<6;j++) p[j] = p[j] - delta[j];
    [o1,o2] = unpack(p);
    const rNew = residuals_o(A1,A2,G1,G2,GP1,GP2,o1,o2);
    const costNew = rNew.reduce((s,v)=>s+v*v,0);

    const step = Math.hypot(...delta);
    if (Math.abs(cost - costNew) < tolCost || step < tolStep) { r = rNew; cost = costNew; break; }
    r = rNew; cost = costNew;
  }
  return { o1, o2 };
}

function solveSymmetric6(A:number[][], b:number[]): number[] {
  // naive Gaussian elimination for small 6x6
  const n=6; const M = A.map((row,i)=> [...row, b[i]]);
  for (let i=0;i<n;i++){
    // pivot
    let piv = i;
    for (let r=i+1;r<n;r++) if (Math.abs(M[r][i])>Math.abs(M[piv][i])) piv=r;
    if (piv!==i) [M[i],M[piv]] = [M[piv],M[i]];
    const div = M[i][i] || 1e-12;
    for (let c=i;c<=n;c++) M[i][c] /= div;
    for (let r=0;r<n;r++){
      if (r===i) continue;
      const f = M[r][i];
      for (let c=i;c<=n;c++) M[r][c] -= f*M[i][c];
    }
  }
  return M.map(row=> row[n]);
}

function apply_axis_shift(o1:Vec3, o2:Vec3, j1a:Vec3, j2a:Vec3): [Vec3,Vec3] {
  const s = (dot(o1,j1a) + dot(o2,j2a)) / 2.0;
  const p1 = sub3(o1, mul3(j1a, s));
  const p2 = sub3(o2, mul3(j2a, s));
  return [p1, p2];
}

function estimate_joint_positions(
  A1:number[][], A2:number[][], G1:number[][], G2:number[][], GP1:number[][], GP2:number[][],
  j1a:Vec3, j2a:Vec3
): { p1:Vec3, p2:Vec3 } {
  const { o1, o2 } = gauss_newton_o(
    A1, A2, G1, G2, GP1, GP2,
    [0,0,0], [0,0,0], 60, 1e-8, 1e-10, 1e-6, 1e-4
  );
  const [p1, p2] = apply_axis_shift(o1, o2, j1a, j2a);
  return { p1, p2 };
}