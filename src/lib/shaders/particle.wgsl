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
	@location(1) speed: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> velocities: array<vec2<f32>>;

@vertex
fn vs(
	@builtin(vertex_index) vid: u32,
	@builtin(instance_index) iid: u32,
) -> VSOut {
	// Quad: 2 triangles, 6 vertices
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
	let speed = length(vel);

	// Scale quad to particle radius with glow margin
	let glowRadius = u.particleRadius * 2.5;
	let worldPos = center + uv * glowRadius;

	// Map world coords to clip space: [0, boxSize] -> [-1, 1]
	let clip = (worldPos / u.boxSize) * 2.0 - 1.0;

	var out: VSOut;
	out.pos = vec4<f32>(clip.x, -clip.y, 0.0, 1.0);
	out.uv = uv;
	out.speed = speed;
	return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
	let dist = length(in.uv);

	// Soft radial falloff — smooth watery blob
	let intensity = exp(-dist * dist * 3.0);

	// Color based on speed
	let t = clamp(in.speed / 300.0, 0.0, 1.0);
	let slowColor = vec3<f32>(0.1, 0.35, 0.9);   // deep blue
	let midColor = vec3<f32>(0.6, 0.25, 0.85);    // purple
	let fastColor = vec3<f32>(0.95, 0.25, 0.08);  // orange-red
	var color: vec3<f32>;
	if (t < 0.5) {
		color = mix(slowColor, midColor, t * 2.0);
	} else {
		color = mix(midColor, fastColor, (t - 0.5) * 2.0);
	}

	// Per-particle contribution — additive blending builds up in dense areas
	// This gives the watery luminous look without saturating to white
	let brightness = intensity * 0.55;
	if (brightness < 0.005) { discard; }

	return vec4<f32>(color * brightness, brightness);
}
