export enum ColorSource {
	Speed = 0,
	Density = 1,
	PosX = 2,
	PosY = 3,
	Pressure = 4,
	Acceleration = 5,
	None = 6
}

export enum SpectrumType {
	Rainbow = 0,
	Chrome = 1,
	Ocean = 2,
	Bands = 3,
	Mono = 4
}

export interface CurvePoint {
	x: number;
	y: number;
}

export const CURVE_SAMPLES = 64;

let particleCount = $state(33900);
let particleRadius = $state(3.5);
let isPlaying = $state(true);
let damping = $state(1);
let plateCount = $state(112);
let detectorCount = $state(112);
let gravity = $state(130);
let plateReach = $state(0.95);
let inputFreqMin = $state(20);
let inputFreqMax = $state(8000);
let potentialType = $state<'hard' | 'soft' | 'lennard-jones'>('hard');
let platesVisible = $state(true);
let stiffness = $state(8000);
let viscosity = $state(75);

let hueSource = $state<ColorSource>(ColorSource.Speed);
let satSource = $state<ColorSource>(ColorSource.None);
let brightSource = $state<ColorSource>(ColorSource.Speed);
let colorSpectrum = $state<SpectrumType>(SpectrumType.Rainbow);
let hueCurvePoints = $state<CurvePoint[]>([
	{ x: 0, y: 0 },
	{ x: 1, y: 1 }
]);
let satCurvePoints = $state<CurvePoint[]>([
	{ x: 0, y: 0.8 },
	{ x: 1, y: 0.8 }
]);
let brightCurvePoints = $state<CurvePoint[]>([
	{ x: 0, y: 0.3 },
	{ x: 0.5, y: 0.7 },
	{ x: 1, y: 1 }
]);
let curvesDirty = $state(true);

let needsBufferRealloc = $state(false);

/**
 * Monotonic cubic Hermite interpolation (Fritsch-Carlson method).
 */
export function monotonicCubicInterpolation(points: CurvePoint[], xVal: number): number {
	const n = points.length;
	if (n === 0) return 0;
	if (n === 1) return points[0].y;

	const sorted = [...points].sort((a, b) => a.x - b.x);

	if (xVal <= sorted[0].x) return sorted[0].y;
	if (xVal >= sorted[n - 1].x) return sorted[n - 1].y;

	let i = 0;
	while (i < n - 1 && sorted[i + 1].x < xVal) i++;

	const deltas: number[] = [];
	const slopes: number[] = [];
	for (let j = 0; j < n - 1; j++) {
		const dx = sorted[j + 1].x - sorted[j].x;
		deltas.push(dx);
		slopes.push(dx === 0 ? 0 : (sorted[j + 1].y - sorted[j].y) / dx);
	}

	const tangents: number[] = [];
	for (let j = 0; j < n; j++) {
		if (j === 0) {
			tangents.push(slopes[0]);
		} else if (j === n - 1) {
			tangents.push(slopes[n - 2]);
		} else {
			const m0 = slopes[j - 1];
			const m1 = slopes[j];
			if (m0 * m1 <= 0) {
				tangents.push(0);
			} else {
				const w0 = 2 * deltas[j] + deltas[j - 1];
				const w1 = deltas[j] + 2 * deltas[j - 1];
				tangents.push((w0 + w1) / (w0 / m0 + w1 / m1));
			}
		}
	}

	for (let j = 0; j < n - 1; j++) {
		const m = slopes[j];
		if (m === 0) {
			tangents[j] = 0;
			tangents[j + 1] = 0;
		} else {
			const alpha = tangents[j] / m;
			const beta = tangents[j + 1] / m;
			const tau = alpha * alpha + beta * beta;
			if (tau > 9) {
				const s = 3 / Math.sqrt(tau);
				tangents[j] = s * alpha * m;
				tangents[j + 1] = s * beta * m;
			}
		}
	}

	const x0 = sorted[i].x;
	const x1 = sorted[i + 1].x;
	const y0 = sorted[i].y;
	const y1 = sorted[i + 1].y;
	const h = x1 - x0;
	const t = (xVal - x0) / h;
	const t2 = t * t;
	const t3 = t2 * t;

	const h00 = 2 * t3 - 3 * t2 + 1;
	const h10 = t3 - 2 * t2 + t;
	const h01 = -2 * t3 + 3 * t2;
	const h11 = t3 - t2;

	return h00 * y0 + h10 * h * tangents[i] + h01 * y1 + h11 * h * tangents[i + 1];
}

export function sampleCurve(points: CurvePoint[]): Float32Array {
	const samples = new Float32Array(CURVE_SAMPLES);
	if (!points || points.length < 2) {
		for (let i = 0; i < CURVE_SAMPLES; i++) {
			samples[i] = i / (CURVE_SAMPLES - 1);
		}
		return samples;
	}
	for (let i = 0; i < CURVE_SAMPLES; i++) {
		const x = i / (CURVE_SAMPLES - 1);
		const y = monotonicCubicInterpolation(points, x);
		samples[i] = Math.max(0, Math.min(1, y));
	}
	return samples;
}

export function sampleAllCurves(
	hue: CurvePoint[],
	sat: CurvePoint[],
	bright: CurvePoint[]
): Float32Array {
	const allSamples = new Float32Array(CURVE_SAMPLES * 3);
	allSamples.set(sampleCurve(hue), 0);
	allSamples.set(sampleCurve(sat), CURVE_SAMPLES);
	allSamples.set(sampleCurve(bright), CURVE_SAMPLES * 2);
	return allSamples;
}

export function getSimState() {
	return {
		get particleCount() {
			return particleCount;
		},
		set particleCount(v: number) {
			particleCount = Math.max(1, Math.min(100000, v));
			needsBufferRealloc = true;
		},
		get particleRadius() {
			return particleRadius;
		},
		set particleRadius(v: number) {
			particleRadius = Math.max(1, Math.min(20, v));
		},
		get isPlaying() {
			return isPlaying;
		},
		set isPlaying(v: boolean) {
			isPlaying = v;
		},
		get damping() {
			return damping;
		},
		set damping(v: number) {
			damping = Math.max(0.5, Math.min(1, v));
		},
		get plateCount() {
			return plateCount;
		},
		set plateCount(v: number) {
			plateCount = Math.max(1, Math.min(512, v));
			needsBufferRealloc = true;
		},
		get detectorCount() {
			return detectorCount;
		},
		set detectorCount(v: number) {
			detectorCount = Math.max(1, Math.min(512, v));
		},
		get gravity() {
			return gravity;
		},
		set gravity(v: number) {
			gravity = Math.max(0, Math.min(500, v));
		},
		get plateReach() {
			return plateReach;
		},
		set plateReach(v: number) {
			plateReach = Math.max(0.05, Math.min(0.95, v));
		},
		get inputFreqMin() {
			return inputFreqMin;
		},
		set inputFreqMin(v: number) {
			inputFreqMin = Math.max(0, Math.min(22000, v));
		},
		get inputFreqMax() {
			return inputFreqMax;
		},
		set inputFreqMax(v: number) {
			inputFreqMax = Math.max(100, Math.min(22000, v));
		},
		get potentialType() {
			return potentialType;
		},
		set potentialType(v: 'hard' | 'soft' | 'lennard-jones') {
			potentialType = v;
		},
		get platesVisible() {
			return platesVisible;
		},
		set platesVisible(v: boolean) {
			platesVisible = v;
		},
		get stiffness() {
			return stiffness;
		},
		set stiffness(v: number) {
			stiffness = Math.max(100, Math.min(50000, v));
		},
		get viscosity() {
			return viscosity;
		},
		set viscosity(v: number) {
			viscosity = Math.max(0, Math.min(200, v));
		},
		get hueSource() {
			return hueSource;
		},
		set hueSource(v: ColorSource) {
			hueSource = v;
		},
		get satSource() {
			return satSource;
		},
		set satSource(v: ColorSource) {
			satSource = v;
		},
		get brightSource() {
			return brightSource;
		},
		set brightSource(v: ColorSource) {
			brightSource = v;
		},
		get colorSpectrum() {
			return colorSpectrum;
		},
		set colorSpectrum(v: SpectrumType) {
			colorSpectrum = v;
		},
		get hueCurvePoints() {
			return hueCurvePoints;
		},
		set hueCurvePoints(v: CurvePoint[]) {
			hueCurvePoints = v;
			curvesDirty = true;
		},
		get satCurvePoints() {
			return satCurvePoints;
		},
		set satCurvePoints(v: CurvePoint[]) {
			satCurvePoints = v;
			curvesDirty = true;
		},
		get brightCurvePoints() {
			return brightCurvePoints;
		},
		set brightCurvePoints(v: CurvePoint[]) {
			brightCurvePoints = v;
			curvesDirty = true;
		},
		get curvesDirty() {
			return curvesDirty;
		},
		set curvesDirty(v: boolean) {
			curvesDirty = v;
		},
		get needsBufferRealloc() {
			return needsBufferRealloc;
		},
		set needsBufferRealloc(v: boolean) {
			needsBufferRealloc = v;
		},
		togglePlay() {
			isPlaying = !isPlaying;
		},
		reset() {
			needsBufferRealloc = true;
		}
	};
}
