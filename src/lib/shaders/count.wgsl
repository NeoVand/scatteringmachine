struct GridInfo {
	gridW: u32,
	gridH: u32,
	cellSize: f32,
	particleCount: u32,
};

@group(0) @binding(0) var<uniform> grid: GridInfo;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> cellCounts: array<atomic<u32>>;

fn cellIndex(pos: vec2<f32>) -> u32 {
	let cx = min(u32(pos.x / grid.cellSize), grid.gridW - 1u);
	let cy = min(u32(pos.y / grid.cellSize), grid.gridH - 1u);
	return cy * grid.gridW + cx;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= grid.particleCount) { return; }
	let ci = cellIndex(positions[i]);
	atomicAdd(&cellCounts[ci], 1u);
}
