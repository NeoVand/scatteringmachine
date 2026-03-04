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

	// Only detect particles hitting the right wall:
	// within 1 radius of the wall AND moving rightward (into the wall)
	let wallX = u.boxSize.x - r;
	let hitZone = r * 3.0; // small zone near wall
	if (pos.x < wallX - hitZone || vel.x <= 0.0) { return; }

	// Which detector bin?
	let detHeight = u.boxSize.y / f32(u.detectorCount);
	let detIdx = min(u32(pos.y / detHeight), u.detectorCount - 1u);

	// Impact momentum = velocity toward wall (positive x)
	// Stronger signal for faster particles closer to the wall
	let closeness = 1.0 - max(0.0, wallX - pos.x) / hitZone;
	let momentum = vel.x * closeness;
	let fixedPoint = i32(momentum * 1000.0);

	atomicAdd(&detectorReadings[detIdx], fixedPoint);
}
