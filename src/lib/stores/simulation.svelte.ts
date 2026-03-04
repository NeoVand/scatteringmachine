let particleCount = $state(2000);
let particleRadius = $state(3);
let isPlaying = $state(true);
let damping = $state(0.995);
let plateCount = $state(64);
let detectorCount = $state(64);
let gravity = $state(0);
let plateReach = $state(0.25);
let inputFreqMin = $state(20);
let inputFreqMax = $state(8000);
let potentialType = $state<'hard' | 'soft' | 'lennard-jones'>('hard');
let platesVisible = $state(true);
let stiffness = $state(2000);
let viscosity = $state(10);

let needsBufferRealloc = $state(false);

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
			plateReach = Math.max(0.05, Math.min(0.5, v));
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
