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
@group(0) @binding(2) var<storage, read_write> velocities: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> plateForces: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= u.particleCount) { return; }

	let pos = positions[i];
	var vel = velocities[i];
	let r = u.particleRadius;

	// Each plate extends from x=0 rightward by (force * plateDepth)
	let maxExtension = u.plateDepth * 0.85;
	let plateHeight = u.boxSize.y / f32(u.plateCount);

	// Which plate(s) could this particle overlap with?
	let pyCenter = pos.y;
	let pyMin = pyCenter - r;
	let pyMax = pyCenter + r;
	let plateIdxMin = max(0, i32(pyMin / plateHeight));
	let plateIdxMax = min(i32(u.plateCount) - 1, i32(pyMax / plateHeight));

	// Check overlap with each nearby plate bar
	for (var pi = plateIdxMin; pi <= plateIdxMax; pi++) {
		let force = plateForces[pi];
		let extension = force * maxExtension;

		// Plate occupies: x in [0, extension], y in [pi*plateHeight, (pi+1)*plateHeight]
		let plateRight = extension;
		let plateTop = f32(pi) * plateHeight;
		let plateBot = f32(pi + 1) * plateHeight;

		// Check if particle overlaps with this plate rectangle (AABB vs circle)
		let nearestX = clamp(pos.x, 0.0, plateRight);
		let nearestY = clamp(pos.y, plateTop, plateBot);
		let dx = pos.x - nearestX;
		let dy = pos.y - nearestY;
		let dist2 = dx * dx + dy * dy;

		if (dist2 < r * r && dist2 > 0.0) {
			// Push particle out of plate
			let dist = sqrt(dist2);
			let nx = dx / dist;
			let ny = dy / dist;
			let penetration = r - dist;

			// Plate velocity ~ how fast it's extending (proportional to force)
			let plateVelX = force * 400.0;

			// If particle is moving toward the plate, reflect + add plate momentum
			let vnRel = vel.x * nx + vel.y * ny;
			if (vnRel < plateVelX * nx) {
				vel.x += (-vnRel + plateVelX) * nx;
				vel.y += -vnRel * ny;
			}
		} else if (dist2 == 0.0 && plateRight > 0.0) {
			// Particle center is inside the plate — push rightward
			vel.x = max(vel.x, force * 400.0);
		}
	}

	velocities[i] = vel;
}
