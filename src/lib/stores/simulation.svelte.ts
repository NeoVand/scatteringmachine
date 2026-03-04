let particleCount = $state(2000);
let particleRadius = $state(3);
let isPlaying = $state(true);
let damping = $state(0.995);
let plateCount = $state(64);
let detectorCount = $state(64);
let gravity = $state(0);
let potentialType = $state<'hard' | 'soft' | 'lennard-jones'>('hard');

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
		get potentialType() {
			return potentialType;
		},
		set potentialType(v: 'hard' | 'soft' | 'lennard-jones') {
			potentialType = v;
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
