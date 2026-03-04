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

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> velocities: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> detectorReadings: array<atomic<i32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= u.particleCount) { return; }

	let pos = positions[i];
	let vel = velocities[i];
	let r = u.particleRadius;

	// Detect particles near the top wall (y near 0 = top of screen)
	// Moving upward = vel.y < 0 (decreasing y)
	let wallY = r;
	let hitZone = r * 3.0;
	if (pos.y > wallY + hitZone || vel.y >= 0.0) { return; }

	// Which detector bin? (binned by X position)
	let detWidth = u.boxSize.x / f32(u.detectorCount);
	let detIdx = min(u32(pos.x / detWidth), u.detectorCount - 1u);

	// Impact momentum = velocity toward wall (magnitude of negative y velocity)
	let closeness = 1.0 - max(0.0, pos.y - wallY) / hitZone;
	let momentum = -vel.y * closeness;
	let fixedPoint = i32(momentum * 1000.0);

	atomicAdd(&detectorReadings[detIdx], fixedPoint);
}
