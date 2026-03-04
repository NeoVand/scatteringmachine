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
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> prefixSums: array<u32>;
@group(0) @binding(3) var<storage, read> cellCounts: array<u32>;
@group(0) @binding(4) var<storage, read> sortedIndices: array<u32>;
@group(0) @binding(5) var<storage, read_write> densities: array<f32>;

const PI: f32 = 3.14159265;

fn getCellIndex(cx: u32, cy: u32) -> u32 {
	return cy * u.gridW + cx;
}

// Poly6 kernel (2D): W(r, h) = (4 / (π h^8)) * (h² - r²)³
fn poly6(r2: f32, h: f32) -> f32 {
	let h2 = h * h;
	if (r2 >= h2) { return 0.0; }
	let diff = h2 - r2;
	let h8 = h2 * h2 * h2 * h2;
	return 4.0 / (PI * h8) * diff * diff * diff;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= u.particleCount) { return; }

	let pos = positions[i];
	let h = u.cellSize; // smoothing radius = cell size

	let myCX = min(u32(pos.x / u.cellSize), u.gridW - 1u);
	let myCY = min(u32(pos.y / u.cellSize), u.gridH - 1u);

	let startX = select(0u, myCX - 1u, myCX > 0u);
	let startY = select(0u, myCY - 1u, myCY > 0u);
	let endX = min(myCX + 1u, u.gridW - 1u);
	let endY = min(myCY + 1u, u.gridH - 1u);

	var density = 0.0;

	for (var cy = startY; cy <= endY; cy++) {
		for (var cx = startX; cx <= endX; cx++) {
			let ci = getCellIndex(cx, cy);
			let start = prefixSums[ci];
			let count = cellCounts[ci];

			for (var k = 0u; k < count; k++) {
				let j = sortedIndices[start + k];
				let pj = positions[j];
				let delta = pos - pj;
				let r2 = dot(delta, delta);
				density += poly6(r2, h); // mass = 1, includes self (j==i gives W(0,h))
			}
		}
	}

	densities[i] = density;
}
