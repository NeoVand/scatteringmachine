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

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
	let worldPos = in.uv * u.boxSize;
	let maxExtension = u.plateDepth * 0.85;

	var color = vec3<f32>(0.0);

	// === PLATES (left side) — solid bars extending rightward ===
	let plateHeight = u.boxSize.y / f32(u.plateCount);
	let plateIdx = min(u32(worldPos.y / plateHeight), u.plateCount - 1u);
	let force = abs(plateForces[plateIdx]);
	let extension = force * maxExtension;

	// Plate track/rail (always visible behind plates)
	if (worldPos.x < u.plateDepth * 0.15) {
		color = vec3<f32>(0.03, 0.04, 0.06);
		let plateFrac = fract(worldPos.y / plateHeight);
		let edge = smoothstep(0.0, 0.015, plateFrac) * smoothstep(0.0, 0.015, 1.0 - plateFrac);
		color *= edge;
	}

	// The solid plate bar itself
	if (worldPos.x < extension) {
		let plateFrac = fract(worldPos.y / plateHeight);
		let edge = smoothstep(0.0, 0.01, plateFrac) * smoothstep(0.0, 0.01, 1.0 - plateFrac);

		// Bar body — metallic blue-gray
		let barT = worldPos.x / max(extension, 1.0);
		let barColor = mix(
			vec3<f32>(0.12, 0.18, 0.28),  // base
			vec3<f32>(0.2, 0.35, 0.55),   // tip highlight
			barT
		);

		// Leading edge highlight
		let tipDist = abs(worldPos.x - extension);
		let tipGlow = exp(-tipDist * tipDist * 0.01) * force * 0.4;
		color = barColor * edge + vec3<f32>(0.3, 0.6, 1.0) * tipGlow;
	}

	// === DETECTORS (right side) — sensor pads ===
	let detectorX = u.boxSize.x - u.plateDepth;
	if (worldPos.x > detectorX) {
		let detHeight = u.boxSize.y / f32(u.detectorCount);
		let detIdx = min(u32(worldPos.y / detHeight), u.detectorCount - 1u);
		let reading = abs(detectorReadings[detIdx]);

		let detFrac = fract(worldPos.y / detHeight);
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
