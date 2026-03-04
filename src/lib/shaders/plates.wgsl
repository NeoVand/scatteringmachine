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

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read_write> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> plateForces: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= u.particleCount) { return; }

	var pos = positions[i];
	var vel = velocities[i];
	let r = u.particleRadius;

	// Plates extend from the bottom wall (y=boxSize.y) upward (decreasing y)
	let maxExtension = u.plateDepth * 0.85;
	let plateWidth = u.boxSize.x / f32(u.plateCount);

	// Which plate(s) could this particle overlap with?
	let pxMin = pos.x - r;
	let pxMax = pos.x + r;
	let plateIdxMin = max(0, i32(pxMin / plateWidth));
	let plateIdxMax = min(i32(u.plateCount) - 1, i32(pxMax / plateWidth));

	for (var pi = plateIdxMin; pi <= plateIdxMax; pi++) {
		let force = plateForces[pi];
		if (force < 0.01) { continue; }
		let extension = force * maxExtension;

		// Plate occupies: x in [pi*plateWidth, (pi+1)*plateWidth],
		//                  y in [boxSize.y - extension, boxSize.y]
		let plateLeft = f32(pi) * plateWidth;
		let plateRight = f32(pi + 1) * plateWidth;
		let plateTop = u.boxSize.y - extension; // top edge of plate (smallest y)

		// AABB vs circle
		let nearestX = clamp(pos.x, plateLeft, plateRight);
		let nearestY = clamp(pos.y, plateTop, u.boxSize.y);
		let dx = pos.x - nearestX;
		let dy = pos.y - nearestY;
		let dist2 = dx * dx + dy * dy;

		if (dist2 < r * r && dist2 > 0.0) {
			let dist = sqrt(dist2);
			let nx = dx / dist;
			let ny = dy / dist;
			let penetration = r - dist;

			// Push position out of plate
			pos += vec2(nx, ny) * penetration;

			// Plate velocity ~ how fast it's extending (upward = negative y)
			let plateVelY = -force * 300.0;

			// If particle is moving toward the plate, reflect + add plate momentum
			let vnRel = vel.x * nx + vel.y * ny;
			if (vnRel < plateVelY * ny) {
				vel.x += -vnRel * nx * 0.5;
				vel.y += (-vnRel + plateVelY) * ny * 0.5;
			}
		} else if (dist2 == 0.0 && extension > r) {
			// Particle center is inside plate — bounded push upward (toward smaller y)
			pos.y = max(pos.y - r * 2.0, plateTop - r);
			vel.y = min(vel.y, -force * 300.0);
		}
	}

	positions[i] = pos;
	velocities[i] = vel;
}
