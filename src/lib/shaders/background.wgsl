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

// Color palette: maps a 0-1 value to a cool→warm gradient
fn spectrumColor(t: f32) -> vec3<f32> {
	// Deep blue → cyan → green → yellow → orange → hot pink
	let c0 = vec3<f32>(0.05, 0.08, 0.35); // deep blue
	let c1 = vec3<f32>(0.0, 0.55, 0.7);   // cyan
	let c2 = vec3<f32>(0.1, 0.8, 0.3);    // green
	let c3 = vec3<f32>(0.9, 0.8, 0.1);    // yellow
	let c4 = vec3<f32>(1.0, 0.35, 0.1);   // orange
	let c5 = vec3<f32>(1.0, 0.1, 0.4);    // hot pink

	let s = clamp(t, 0.0, 1.0) * 5.0;
	if (s < 1.0) { return mix(c0, c1, s); }
	if (s < 2.0) { return mix(c1, c2, s - 1.0); }
	if (s < 3.0) { return mix(c2, c3, s - 2.0); }
	if (s < 4.0) { return mix(c3, c4, s - 3.0); }
	return mix(c4, c5, s - 4.0);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
	let worldPos = in.uv * u.boxSize;
	let maxExtension = u.plateDepth * 0.85;

	var color = vec3<f32>(0.0);

	// === PLATES (bottom of screen = large worldPos.y) ===
	if (u.platesVisible > 0u) {
		let plateWidth = u.boxSize.x / f32(u.plateCount);
		let plateIdx = min(u32(worldPos.x / plateWidth), u.plateCount - 1u);
		let force = abs(plateForces[plateIdx]);
		let extension = force * maxExtension;
		let plateTop = u.boxSize.y - extension;

		// Position within this plate cell
		let plateFrac = fract(worldPos.x / plateWidth);
		// Inset: bars are 70% of cell width, centered
		let barInset = 0.15;
		let inBar = step(barInset, plateFrac) * step(barInset, 1.0 - plateFrac);
		// Smooth edges within the bar
		let barEdge = smoothstep(barInset, barInset + 0.05, plateFrac)
		            * smoothstep(barInset, barInset + 0.05, 1.0 - plateFrac);

		// Glow aura around the tip (extends beyond the bar)
		if (force > 0.001) {
			let tipY = plateTop;
			let distToTip = max(0.0, tipY - worldPos.y); // above tip
			let distFromBottom = max(0.0, worldPos.y - tipY); // below tip (inside bar region)
			let lateralDist = abs(plateFrac - 0.5) * plateWidth;
			let glowRadius = max(plateWidth * 0.8, 8.0);

			// Vertical glow above the tip
			if (distToTip < glowRadius * 2.0) {
				let glowFalloff = exp(-(distToTip * distToTip + lateralDist * lateralDist * 0.5) / (glowRadius * glowRadius));
				let glowColor = spectrumColor(force) * force * 0.4 * glowFalloff;
				color += glowColor;
			}
		}

		// The solid bar
		if (worldPos.y > plateTop && inBar > 0.0) {
			// barT: 0 at bottom wall, 1 at tip
			let barT = clamp((u.boxSize.y - worldPos.y) / max(extension, 1.0), 0.0, 1.0);

			// Base color from spectrum based on force intensity
			let barColor = spectrumColor(force);

			// Darken toward the base, brighten toward the tip
			let brightness = mix(0.15, 0.9, barT * barT);

			// Inner highlight: lighter stripe down the center
			let centerHighlight = exp(-pow((plateFrac - 0.5) * 6.0, 2.0)) * 0.3;

			// Tip cap: bright highlight at the very tip
			let tipDist = abs(worldPos.y - plateTop);
			let tipHighlight = exp(-tipDist * 0.15) * 0.5 * force;

			let finalBar = barColor * brightness * barEdge
			             + barColor * centerHighlight * barEdge
			             + vec3<f32>(1.0) * tipHighlight * barEdge;

			color = max(color, finalBar);
		}

		// Subtle base strip at very bottom
		if (worldPos.y > u.boxSize.y - 3.0) {
			let baseColor = vec3<f32>(0.06, 0.07, 0.1) * barEdge;
			color = max(color, baseColor);
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
