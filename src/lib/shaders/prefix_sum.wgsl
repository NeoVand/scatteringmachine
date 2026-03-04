// Simple sequential prefix sum — works for grid sizes up to ~million cells.
// For larger grids, replace with Blelloch parallel scan.

struct Info {
	totalCells: u32,
};

@group(0) @binding(0) var<uniform> info: Info;
@group(0) @binding(1) var<storage, read> cellCounts: array<u32>;
@group(0) @binding(2) var<storage, read_write> prefixSums: array<u32>;

@compute @workgroup_size(1)
fn main() {
	var sum = 0u;
	for (var i = 0u; i < info.totalCells; i++) {
		prefixSums[i] = sum;
		sum += cellCounts[i];
	}
}
