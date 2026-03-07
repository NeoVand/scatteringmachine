struct Uniforms {
	boxSize: vec2<f32>,
	dt: f32,
	particleCount: u32,
	particleRadius: f32,
	damping: f32,
	gridW: u32,
	gridH: u32,
	cellSize: f32,
	plateCount: u32,
	detectorCount: u32,
	plateDepth: f32,
	gravity: f32,
	detectorsActive: u32,
	platesVisible: u32,
	stiffness: f32,
	viscosity: f32,
	hueSource: u32,
	satSource: u32,
	brightSource: u32,
	colorSpectrum: u32,
	plateStyle: u32,
	hueIntensity: f32,
	satIntensity: f32,
	brightIntensity: f32,
	plateSpectrum: u32,
};

struct VSOut {
	@builtin(position) pos: vec4<f32>,
	@location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> plateForces: array<f32>;
@group(0) @binding(2) var<storage, read> detectorReadings: array<f32>;

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
	let positions = array<vec2<f32>, 3>(
		vec2<f32>(-1.0, -1.0),
		vec2<f32>(3.0, -1.0),
		vec2<f32>(-1.0, 3.0),
	);
	var out: VSOut;
	out.pos = vec4<f32>(positions[vid], 0.0, 1.0);
	out.uv = positions[vid] * 0.5 + 0.5;
	out.uv.y = 1.0 - out.uv.y;
	return out;
}

// Catmull-Rom interpolation for smooth curve mode
fn catmullRom(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
	let t2 = t * t;
	let t3 = t2 * t;
	return 0.5 * (
		(2.0 * p1) +
		(-p0 + p2) * t +
		(2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
		(-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
	);
}

// Get plate force by index with clamping
fn getForce(idx: i32) -> f32 {
	let ci = clamp(idx, 0, i32(u.plateCount) - 1);
	return abs(plateForces[ci]);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
	let worldPos = in.uv * u.boxSize;
	let maxExtension = u.plateDepth * 0.95;

	var color = vec3<f32>(0.0);

	// === PLATES (bottom of screen = large worldPos.y) ===
	if (u.platesVisible > 0u) {
		let plateWidth = u.boxSize.x / f32(u.plateCount);

		if (u.plateStyle == 0u) {
			// ===== BAR MODE =====
			let plateIdx = min(u32(worldPos.x / plateWidth), u.plateCount - 1u);
			let force = abs(plateForces[plateIdx]);
			let extension = force * maxExtension;
			let plateTop = u.boxSize.y - extension;

			// Hairline separator between bars
			let plateFrac = fract(worldPos.x / plateWidth);
			let separatorWidth = 1.5 / plateWidth;
			let separator = smoothstep(0.0, separatorWidth, plateFrac)
			              * smoothstep(0.0, separatorWidth, 1.0 - plateFrac);

			// The solid bar (full width, no inset)
			if (worldPos.y > plateTop) {
				let barT = clamp((u.boxSize.y - worldPos.y) / max(extension, 1.0), 0.0, 1.0);
				let barColor = getColorFromSpectrum(force, u.plateSpectrum);
				let brightness = mix(0.12, 0.7, barT * barT);
				let separatorDim = mix(0.3, 1.0, separator);

				// Subtle tip line (3px)
				let tipDist = worldPos.y - plateTop;
				let tipLine = smoothstep(3.0, 0.0, tipDist) * 0.15;

				let finalBar = barColor * brightness * separatorDim
				             + vec3<f32>(1.0) * tipLine * separatorDim;
				color = max(color, finalBar);
			}

			// Subtle base strip
			if (worldPos.y > u.boxSize.y - 3.0) {
				let baseColor = vec3<f32>(0.06, 0.07, 0.1) * separator;
				color = max(color, baseColor);
			}
		} else {
			// ===== CURVE MODE =====
			// Compute smooth curve height at this x using Catmull-Rom
			let exactPlateF = worldPos.x / plateWidth;
			let idx = i32(floor(exactPlateF));
			let t = fract(exactPlateF);

			let f0 = getForce(idx - 1);
			let f1 = getForce(idx);
			let f2 = getForce(idx + 1);
			let f3 = getForce(idx + 2);

			let interpForce = clamp(catmullRom(f0, f1, f2, f3, t), 0.0, 1.0);
			let extension = interpForce * maxExtension;
			let curveTop = u.boxSize.y - extension;

			// Fill below the curve
			if (worldPos.y > curveTop) {
				let fillT = clamp((u.boxSize.y - worldPos.y) / max(extension, 1.0), 0.0, 1.0);
				let fillColor = getColorFromSpectrum(interpForce, u.plateSpectrum);
				let brightness = mix(0.1, 0.6, fillT * fillT);

				let finalFill = fillColor * brightness;
				color = max(color, finalFill);
			}

			// Bright curve line at the surface (2px)
			let distToCurve = abs(worldPos.y - curveTop);
			if (distToCurve < 3.0 && interpForce > 0.005) {
				let lineAlpha = smoothstep(3.0, 0.5, distToCurve);
				let lineColor = getColorFromSpectrum(interpForce, u.plateSpectrum) * (0.6 + 0.4 * interpForce);
				color = max(color, lineColor * lineAlpha);
			}

			// Base strip
			if (worldPos.y > u.boxSize.y - 3.0) {
				color = max(color, vec3<f32>(0.06, 0.07, 0.1));
			}
		}
	}

	// === DETECTORS (top of screen = small worldPos.y) ===
	let detectorY = u.plateDepth;
	if (u.detectorsActive > 0u && worldPos.y < detectorY) {
		let detWidth = u.boxSize.x / f32(u.detectorCount);
		let detIdx = min(u32(worldPos.x / detWidth), u.detectorCount - 1u);
		let reading = abs(detectorReadings[detIdx]);

		let detFrac = fract(worldPos.x / detWidth);
		let edge = smoothstep(0.0, 0.015, detFrac) * smoothstep(0.0, 0.015, 1.0 - detFrac);

		// Sensor pad base
		color = vec3<f32>(0.05, 0.02, 0.03) * edge;

		// Glow proportional to reading
		let intensity = clamp(reading / 30.0, 0.0, 1.0);
		color += vec3<f32>(0.9, 0.25, 0.1) * intensity * 0.6 * edge;
	}

	// === Box border ===
	let border = 2.0;
	if (worldPos.x < border || worldPos.x > u.boxSize.x - border ||
		worldPos.y < border || worldPos.y > u.boxSize.y - border) {
		color = vec3<f32>(0.15, 0.2, 0.3);
	}

	let alpha = max(max(color.r, color.g), color.b);
	if (alpha < 0.001) { discard; }
	return vec4<f32>(color, 1.0);
}
