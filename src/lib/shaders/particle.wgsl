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
};

struct VSOut {
	@builtin(position) pos: vec4<f32>,
	@location(0) uv: vec2<f32>,
	@location(1) speed: f32,
	@location(2) density: f32,
	@location(3) pressure: f32,
	@location(4) acceleration: f32,
	@location(5) normPosX: f32,
	@location(6) normPosY: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> velocities: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> densities: array<f32>;
@group(0) @binding(4) var<storage, read> pressures: array<f32>;
@group(0) @binding(5) var<storage, read> accelerations: array<f32>;
@group(0) @binding(6) var<storage, read> curveSamples: array<f32>;

// Get normalized source value for a given source type
fn getSourceValue(source: u32, speed: f32, density: f32, pressure: f32, accel: f32, posX: f32, posY: f32) -> f32 {
	switch (source) {
		case 0u: { return clamp(speed / 300.0, 0.0, 1.0); } // SOURCE_SPEED
		case 1u: { // SOURCE_DENSITY
			let h = u.cellSize;
			let maxDensity = 4.0 / (3.14159265 * h * h * h * h * h * h * h * h) * h * h * h * h * h * h * 12.0;
			return clamp(density / maxDensity, 0.0, 1.0);
		}
		case 2u: { return clamp(posX / u.boxSize.x, 0.0, 1.0); } // SOURCE_POS_X
		case 3u: { return clamp(posY / u.boxSize.y, 0.0, 1.0); } // SOURCE_POS_Y
		case 4u: { return clamp(pressure / (u.stiffness * 2.0), 0.0, 1.0); } // SOURCE_PRESSURE
		case 5u: { return clamp(accel / 500.0, 0.0, 1.0); } // SOURCE_ACCEL
		default: { return 0.5; } // SOURCE_NONE — fixed middle value
	}
}

@vertex
fn vs(
	@builtin(vertex_index) vid: u32,
	@builtin(instance_index) iid: u32,
) -> VSOut {
	let quadVerts = array<vec2<f32>, 6>(
		vec2<f32>(-1.0, -1.0),
		vec2<f32>( 1.0, -1.0),
		vec2<f32>(-1.0,  1.0),
		vec2<f32>(-1.0,  1.0),
		vec2<f32>( 1.0, -1.0),
		vec2<f32>( 1.0,  1.0),
	);

	let uv = quadVerts[vid];
	let center = positions[iid];
	let vel = velocities[iid];

	let glowRadius = u.particleRadius * 2.5;
	let worldPos = center + uv * glowRadius;
	let clip = (worldPos / u.boxSize) * 2.0 - 1.0;

	var out: VSOut;
	out.pos = vec4<f32>(clip.x, -clip.y, 0.0, 1.0);
	out.uv = uv;
	out.speed = length(vel);
	out.density = densities[iid];
	out.pressure = pressures[iid];
	out.acceleration = accelerations[iid];
	out.normPosX = center.x;
	out.normPosY = center.y;
	return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
	let dist = length(in.uv);

	// Soft radial falloff
	let intensity = exp(-dist * dist * 3.0);

	// === HUE: source → intensity → curve → spectrum color ===
	let hueRaw = getSourceValue(u.hueSource, in.speed, in.density, in.pressure, in.acceleration, in.normPosX, in.normPosY);
	let hueScaled = clamp(hueRaw * u.hueIntensity, 0.0, 1.0);
	let hue = lookupCurve(CURVE_HUE, hueScaled);
	var color = getColorFromSpectrum(hue, u.colorSpectrum);

	// === SATURATION: source → intensity → curve → desaturate ===
	let satRaw = getSourceValue(u.satSource, in.speed, in.density, in.pressure, in.acceleration, in.normPosX, in.normPosY);
	let satScaled = clamp(satRaw * u.satIntensity, 0.0, 1.0);
	let saturation = lookupCurve(CURVE_SAT, satScaled);
	let lum = dot(color, vec3<f32>(0.299, 0.587, 0.114));
	color = mix(vec3<f32>(lum), color, saturation);

	// === BRIGHTNESS: source → intensity → curve → scale ===
	let brightRaw = getSourceValue(u.brightSource, in.speed, in.density, in.pressure, in.acceleration, in.normPosX, in.normPosY);
	let brightScaled = clamp(brightRaw * u.brightIntensity, 0.0, 1.0);
	let bright = lookupCurve(CURVE_BRIGHT, brightScaled);
	color *= bright;

	// Per-particle contribution with additive blending
	let brightness = intensity * 0.55;
	if (brightness < 0.005) { discard; }

	return vec4<f32>(color * brightness, brightness);
}
