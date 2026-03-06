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

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read_write> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> plateForces: array<f32>;

// Get plate force by index with clamping
fn getForce(idx: i32) -> f32 {
	let ci = clamp(idx, 0, i32(u.plateCount) - 1);
	return abs(plateForces[ci]);
}

// Catmull-Rom interpolation for smooth curve collision
fn catmullRom(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
	let t2 = t * t;
	let t3 = t2 * t;
	return 0.5 * (
		(2.0 * p1) +
		(-p0 + p2) * t +
		(2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
		(-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
	);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= u.particleCount) { return; }

	var pos = positions[i];
	var vel = velocities[i];
	let r = u.particleRadius;

	let maxExtension = u.plateDepth * 0.95;
	let plateWidth = u.boxSize.x / f32(u.plateCount);

	// Compute wall height at the particle's x position
	let exactPlateF = pos.x / plateWidth;
	let idx = i32(floor(exactPlateF));
	let t = fract(exactPlateF);

	var extension: f32;
	var plateVelY: f32;

	if (u.plateStyle == 0u) {
		// BAR MODE: wall height = max of two nearest columns (no gaps)
		let forceL = getForce(idx);
		let forceR = getForce(idx + 1);
		extension = max(forceL, forceR) * maxExtension;
		plateVelY = mix(-forceL, -forceR, t) * maxExtension * 8.0;
	} else {
		// CURVE MODE: smooth Catmull-Rom interpolation
		let f0 = getForce(idx - 1);
		let f1 = getForce(idx);
		let f2 = getForce(idx + 1);
		let f3 = getForce(idx + 2);
		let interpForce = clamp(catmullRom(f0, f1, f2, f3, t), 0.0, 1.0);
		extension = interpForce * maxExtension;
		plateVelY = -interpForce * maxExtension * 8.0;
	}

	let plateTop = u.boxSize.y - extension;

	// Heightfield collision: particle bottom edge below wall top
	if (pos.y + r > plateTop) {
		pos.y = plateTop - r;

		// Reflect downward velocity with damping
		if (vel.y > 0.0) {
			vel.y = -vel.y * 0.3;
		}

		// Transfer plate momentum (plate moving upward)
		if (plateVelY < 0.0 && vel.y > plateVelY * 0.5) {
			vel.y = min(vel.y, plateVelY * 0.7);
		}
	}

	// Push zone: particles just above the surface get a gentle nudge
	let pushZone = r * 2.0;
	let distAbove = plateTop - (pos.y + r);
	let activeForce = extension / max(maxExtension, 0.001);
	if (distAbove > 0.0 && distAbove < pushZone && activeForce > 0.05) {
		let proximity = 1.0 - distAbove / pushZone;
		let pushStrength = proximity * proximity * activeForce;
		vel.y += plateVelY * pushStrength * u.dt * 2.0;
	}

	positions[i] = pos;
	velocities[i] = vel;
}
