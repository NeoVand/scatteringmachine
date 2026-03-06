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

	// Bar inset must match the rendering in background.wgsl (barInset = 0.15)
	let barInset = 0.15;

	// Which plate column is this particle in?
	let plateIdx = clamp(i32(pos.x / plateWidth), 0, i32(u.plateCount) - 1);

	// Check this plate and immediate neighbors (particle radius can overlap)
	let checkMin = max(0, plateIdx - 1);
	let checkMax = min(i32(u.plateCount) - 1, plateIdx + 1);

	for (var pi = checkMin; pi <= checkMax; pi++) {
		let force = plateForces[pi];
		let extension = force * maxExtension;
		if (extension < 0.5) { continue; }

		// Bar edges (matching rendered bar width)
		let cellLeft = f32(pi) * plateWidth;
		let barLeft = cellLeft + plateWidth * barInset;
		let barRight = cellLeft + plateWidth * (1.0 - barInset);
		let plateTop = u.boxSize.y - extension;

		// Plate upward velocity
		let plateVelY = -force * maxExtension * 8.0;

		// AABB vs circle: find nearest point on bar rectangle to particle center
		let nearestX = clamp(pos.x, barLeft, barRight);
		let nearestY = clamp(pos.y, plateTop, u.boxSize.y);
		let dx = pos.x - nearestX;
		let dy = pos.y - nearestY;
		let dist2 = dx * dx + dy * dy;

		// === SOLID COLLISION: particle overlaps bar ===
		if (dist2 < r * r) {
			if (dist2 > 0.0001) {
				// Particle center is outside bar — push along normal
				let dist = sqrt(dist2);
				let nx = dx / dist;
				let ny = dy / dist;
				let penetration = r - dist;

				pos += vec2<f32>(nx, ny) * penetration;

				// Reflect velocity component into bar + transfer plate momentum
				let vn = vel.x * nx + vel.y * ny;
				if (vn < 0.0) {
					// Remove inward velocity and add bounce
					vel -= vec2<f32>(nx, ny) * vn * 1.3;
				}
				// Transfer upward plate momentum
				if (ny < -0.3 && vel.y > plateVelY * 0.5) {
					vel.y = plateVelY * 0.7;
				}
			} else {
				// Particle center is inside bar — eject upward
				pos.y = plateTop - r;
				if (vel.y > plateVelY) {
					vel.y = plateVelY;
				}
			}
		}

		// === PUSH ZONE: particles just above the plate tip get swept along ===
		let pushZone = r * 3.0;
		let distAbove = plateTop - pos.y - r;
		let inBarX = pos.x > barLeft - r && pos.x < barRight + r;
		if (inBarX && distAbove > 0.0 && distAbove < pushZone && force > 0.05) {
			let proximity = 1.0 - distAbove / pushZone;
			let pushStrength = proximity * proximity * force;
			vel.y += plateVelY * pushStrength * u.dt * 2.0;
		}
	}

	positions[i] = pos;
	velocities[i] = vel;
}
