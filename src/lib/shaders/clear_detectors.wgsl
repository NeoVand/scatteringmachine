@group(0) @binding(0) var<storage, read_write> detectorReadings: array<atomic<i32>>;

@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= arrayLength(&detectorReadings)) { return; }
	atomicStore(&detectorReadings[i], 0);
}

// Convert fixed-point i32 detector readings to f32 for display/readback
@group(0) @binding(1) var<storage, read_write> detectorDisplay: array<f32>;

@compute @workgroup_size(256)
fn convert(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= arrayLength(&detectorReadings)) { return; }
	let raw = atomicLoad(&detectorReadings[i]);
	detectorDisplay[i] = f32(raw) / 1000.0;
}
