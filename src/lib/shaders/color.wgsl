// Color utilities — source constants, curve lookup
// Concatenated with spectrum.wgsl + particle.wgsl at load time

// Color source constants
const SOURCE_SPEED: u32 = 0u;
const SOURCE_DENSITY: u32 = 1u;
const SOURCE_POS_X: u32 = 2u;
const SOURCE_POS_Y: u32 = 3u;
const SOURCE_PRESSURE: u32 = 4u;
const SOURCE_ACCEL: u32 = 5u;
const SOURCE_NONE: u32 = 6u;

// Curve indices
const CURVE_HUE: u32 = 0u;
const CURVE_SAT: u32 = 1u;
const CURVE_BRIGHT: u32 = 2u;

// Linear interpolation lookup into curve samples buffer
fn lookupCurve(curveId: u32, t: f32) -> f32 {
	let base = curveId * 64u;
	let pos = clamp(t, 0.0, 1.0) * 63.0;
	let idx0 = u32(floor(pos));
	let idx1 = min(idx0 + 1u, 63u);
	let frac = pos - f32(idx0);
	return mix(curveSamples[base + idx0], curveSamples[base + idx1], frac);
}
