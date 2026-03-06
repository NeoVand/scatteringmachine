// Color utilities — constants, conversions, spectrum palettes, curve lookup
// Concatenated with particle.wgsl at load time

// Color source constants
const SOURCE_SPEED: u32 = 0u;
const SOURCE_DENSITY: u32 = 1u;
const SOURCE_POS_X: u32 = 2u;
const SOURCE_POS_Y: u32 = 3u;
const SOURCE_PRESSURE: u32 = 4u;
const SOURCE_ACCEL: u32 = 5u;
const SOURCE_NONE: u32 = 6u;

// Spectrum constants
const SPECTRUM_RAINBOW: u32 = 0u;
const SPECTRUM_CHROME: u32 = 1u;
const SPECTRUM_OCEAN: u32 = 2u;
const SPECTRUM_BANDS: u32 = 3u;
const SPECTRUM_MONO: u32 = 4u;

// Curve indices
const CURVE_HUE: u32 = 0u;
const CURVE_SAT: u32 = 1u;
const CURVE_BRIGHT: u32 = 2u;

// HSV to RGB conversion
fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
	let h = hsv.x;
	let s = hsv.y;
	let v = hsv.z;

	let c = v * s;
	let x = c * (1.0 - abs((h * 6.0) % 2.0 - 1.0));
	let m = v - c;

	var rgb: vec3<f32>;
	let hi = i32(h * 6.0) % 6;

	switch (hi) {
		case 0: { rgb = vec3<f32>(c, x, 0.0); }
		case 1: { rgb = vec3<f32>(x, c, 0.0); }
		case 2: { rgb = vec3<f32>(0.0, c, x); }
		case 3: { rgb = vec3<f32>(0.0, x, c); }
		case 4: { rgb = vec3<f32>(x, 0.0, c); }
		default: { rgb = vec3<f32>(c, 0.0, x); }
	}

	return rgb + m;
}

// Get color from spectrum palette
fn getColorFromSpectrum(t: f32, spectrum: u32) -> vec3<f32> {
	let tt = clamp(t, 0.0, 1.0);

	switch (spectrum) {
		case SPECTRUM_RAINBOW: {
			return hsv2rgb(vec3<f32>(tt, 0.85, 0.9));
		}
		case SPECTRUM_CHROME: {
			if (tt < 0.25) {
				return mix(vec3<f32>(0.2, 0.4, 0.9), vec3<f32>(0.3, 0.8, 0.9), tt * 4.0);
			} else if (tt < 0.5) {
				return mix(vec3<f32>(0.3, 0.8, 0.9), vec3<f32>(0.95, 0.95, 0.9), (tt - 0.25) * 4.0);
			} else if (tt < 0.75) {
				return mix(vec3<f32>(0.95, 0.95, 0.9), vec3<f32>(0.95, 0.6, 0.2), (tt - 0.5) * 4.0);
			} else {
				return mix(vec3<f32>(0.95, 0.6, 0.2), vec3<f32>(0.9, 0.2, 0.2), (tt - 0.75) * 4.0);
			}
		}
		case SPECTRUM_OCEAN: {
			if (tt < 0.167) {
				return mix(vec3<f32>(0.3, 0.42, 0.78), vec3<f32>(0.25, 0.65, 0.7), tt * 6.0);
			} else if (tt < 0.333) {
				return mix(vec3<f32>(0.25, 0.65, 0.7), vec3<f32>(0.35, 0.75, 0.55), (tt - 0.167) * 6.0);
			} else if (tt < 0.5) {
				return mix(vec3<f32>(0.35, 0.75, 0.55), vec3<f32>(0.92, 0.78, 0.35), (tt - 0.333) * 6.0);
			} else if (tt < 0.667) {
				return mix(vec3<f32>(0.92, 0.78, 0.35), vec3<f32>(0.88, 0.5, 0.45), (tt - 0.5) * 6.0);
			} else if (tt < 0.833) {
				return mix(vec3<f32>(0.88, 0.5, 0.45), vec3<f32>(0.65, 0.42, 0.65), (tt - 0.667) * 6.0);
			} else {
				return mix(vec3<f32>(0.65, 0.42, 0.65), vec3<f32>(0.3, 0.42, 0.78), (tt - 0.833) * 6.0);
			}
		}
		case SPECTRUM_BANDS: {
			let band = u32(tt * 6.0);
			let bandT = fract(tt * 6.0);
			let blend = smoothstep(0.85, 1.0, bandT);

			var c1: vec3<f32>;
			var c2: vec3<f32>;
			switch (band) {
				case 0u: { c1 = vec3<f32>(0.9, 0.2, 0.3); c2 = vec3<f32>(0.95, 0.6, 0.1); }
				case 1u: { c1 = vec3<f32>(0.95, 0.6, 0.1); c2 = vec3<f32>(0.95, 0.9, 0.2); }
				case 2u: { c1 = vec3<f32>(0.95, 0.9, 0.2); c2 = vec3<f32>(0.2, 0.8, 0.4); }
				case 3u: { c1 = vec3<f32>(0.2, 0.8, 0.4); c2 = vec3<f32>(0.2, 0.6, 0.9); }
				case 4u: { c1 = vec3<f32>(0.2, 0.6, 0.9); c2 = vec3<f32>(0.6, 0.3, 0.8); }
				default: { c1 = vec3<f32>(0.6, 0.3, 0.8); c2 = vec3<f32>(0.9, 0.2, 0.3); }
			}
			return mix(c1, c2, blend);
		}
		case SPECTRUM_MONO: {
			let brightness = 0.4 + tt * 0.6;
			return vec3<f32>(brightness, brightness * 0.95, brightness * 0.9);
		}
		default: {
			return vec3<f32>(1.0);
		}
	}
}

// Linear interpolation lookup into curve samples buffer
fn lookupCurve(curveId: u32, t: f32) -> f32 {
	let base = curveId * 64u;
	let pos = clamp(t, 0.0, 1.0) * 63.0;
	let idx0 = u32(floor(pos));
	let idx1 = min(idx0 + 1u, 63u);
	let frac = pos - f32(idx0);
	return mix(curveSamples[base + idx0], curveSamples[base + idx1], frac);
}
