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
@group(0) @binding(1) var<storage, read> velOld: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> velNew: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> curls: array<f32>;

const PI: f32 = 3.14159265;
const HALF_PI: f32 = 1.57079632;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= u.particleCount) { return; }

	let vOld = velOld[i];
	let vNew = velNew[i];

	// Only compute curl for particles that are actually moving
	let speedOld = length(vOld);
	let speedNew = length(vNew);
	let minSpeed = 1.0; // threshold to avoid noise from nearly-stationary particles

	var rawCurl: f32 = 0.0;
	if (speedOld > minSpeed && speedNew > minSpeed) {
		// Heading angles
		let angleOld = atan2(vOld.y, vOld.x);
		let angleNew = atan2(vNew.y, vNew.x);

		// Angular difference with wrapping to [-π, π]
		var dAngle = angleNew - angleOld;
		if (dAngle > PI) { dAngle -= 2.0 * PI; }
		if (dAngle < -PI) { dAngle += 2.0 * PI; }

		// Sqrt-compressed absolute angular velocity
		// 90° (π/2) turn = full intensity; sqrt amplifies small turns
		let linear = clamp(abs(dAngle) / HALF_PI, 0.0, 1.0);
		rawCurl = sqrt(linear);
	}

	// Temporal smoothing: 30% new, 70% previous
	let prevCurl = curls[i];
	curls[i] = mix(prevCurl, rawCurl, 0.3);
}
