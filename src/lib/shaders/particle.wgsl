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

	// Hard circle edge
	let coreRadius = 1.0 / 2.5; // particleRadius / glowRadius
	let core = smoothstep(coreRadius + 0.05, coreRadius - 0.05, dist);

	// Soft glow falloff
	let glow = exp(-dist * dist * 3.0) * 0.6;

	// Color based on speed
	let t = clamp(in.speed / 300.0, 0.0, 1.0);
	let slowColor = vec3<f32>(0.2, 0.5, 1.0);  // blue
	let fastColor = vec3<f32>(1.0, 0.3, 0.1);  // orange-red
	let color = mix(slowColor, fastColor, t);

	let alpha = core + glow;
	if (alpha < 0.01) { discard; }

	return vec4<f32>(color * alpha, alpha);
}
