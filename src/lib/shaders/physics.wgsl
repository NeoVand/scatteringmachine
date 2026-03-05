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
@group(0) @binding(1) var<storage, read> posIn: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> velIn: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> posOut: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> velOut: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read> prefixSums: array<u32>;
@group(0) @binding(6) var<storage, read> cellCounts: array<u32>;
@group(0) @binding(7) var<storage, read> sortedIndices: array<u32>;
@group(0) @binding(8) var<storage, read> densities: array<f32>;

const PI: f32 = 3.14159265;

fn getCellIndex(cx: u32, cy: u32) -> u32 {
	return cy * u.gridW + cx;
}

// Poly6 kernel (2D) — needed for rest density computation
fn poly6(r2: f32, h: f32) -> f32 {
	let h2 = h * h;
	if (r2 >= h2) { return 0.0; }
	let diff = h2 - r2;
	let h8 = h2 * h2 * h2 * h2;
	return 4.0 / (PI * h8) * diff * diff * diff;
}

// Spiky kernel gradient magnitude (2D): |∇W| = 30/(πh⁵) * (h-r)²
// Returns positive magnitude; multiply by direction separately
fn spikyGradMag(r: f32, h: f32) -> f32 {
	if (r >= h || r < 0.0001) { return 0.0; }
	let diff = h - r;
	let h5 = h * h * h * h * h;
	return 30.0 / (PI * h5) * diff * diff;
}

// Viscosity kernel Laplacian (2D): ∇²W = 40/(πh⁵) * (h-r)
fn viscLap(r: f32, h: f32) -> f32 {
	if (r >= h) { return 0.0; }
	let h5 = h * h * h * h * h;
	return 40.0 / (PI * h5) * (h - r);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= u.particleCount) { return; }

	var pos = posIn[i];
	var vel = velIn[i];
	let r = u.particleRadius;
	let h = u.cellSize; // smoothing radius

	let rho_i = max(densities[i], 0.0001);

	// Rest density: self-contribution scaled by expected neighbor factor
	// This means a particle alone has zero pressure; pressure builds with crowding
	let rho0 = poly6(0.0, h) * 6.0;

	// Equation of state: only repulsive (clamped, no tensile instability)
	let P_i = u.stiffness * max(0.0, rho_i - rho0);

	// Grid lookup
	let myCX = min(u32(pos.x / u.cellSize), u.gridW - 1u);
	let myCY = min(u32(pos.y / u.cellSize), u.gridH - 1u);

	let startX = select(0u, myCX - 1u, myCX > 0u);
	let startY = select(0u, myCY - 1u, myCY > 0u);
	let endX = min(myCX + 1u, u.gridW - 1u);
	let endY = min(myCY + 1u, u.gridH - 1u);

	var fPressure = vec2<f32>(0.0);
	var fViscosity = vec2<f32>(0.0);

	for (var cy = startY; cy <= endY; cy++) {
		for (var cx = startX; cx <= endX; cx++) {
			let ci = getCellIndex(cx, cy);
			let start = prefixSums[ci];
			let count = cellCounts[ci];

			for (var k = 0u; k < count; k++) {
				let j = sortedIndices[start + k];
				if (j == i) { continue; }

				let pj = posIn[j];
				let vj = velIn[j];
				let delta = pos - pj;
				let dist = length(delta);

				if (dist < h && dist > 0.0001) {
					let dir = delta / dist;
					let rho_j = max(densities[j], 0.0001);
					let P_j = u.stiffness * max(0.0, rho_j - rho0);

					// Pressure: a = -Σ (P_i/ρ_i² + P_j/ρ_j²) * ∇W
					// ∇W points toward j (negative gradient), so -pressureCoeff * ∇W pushes away
					let pressureCoeff = P_i / (rho_i * rho_i) + P_j / (rho_j * rho_j);
					fPressure += dir * spikyGradMag(dist, h) * pressureCoeff;

					// Viscosity: μ * Σ (v_j - v_i)/ρ_j * ∇²W
					fViscosity += (vj - vel) / rho_j * viscLap(dist, h);

					// Short-range repulsion for deep overlaps (prevents interpenetration)
					let minDist = 2.0 * r;
					if (dist < minDist) {
						let overlap = (minDist - dist) / minDist; // normalized 0-1
						let repulsion = dir * overlap * overlap * u.stiffness * 2.0;
						fPressure += repulsion;
					}
				}
			}
		}
	}

	// Total acceleration
	let accel = fPressure + u.viscosity * fViscosity + vec2<f32>(0.0, u.gravity);
	vel += accel * u.dt;

	// Velocity cap + NaN protection
	let speed = length(vel);
	if (speed > 500.0 || speed != speed) {
		vel = select(vel * (500.0 / speed), vec2<f32>(0.0), speed != speed);
	}

	// Integrate position
	pos += vel * u.dt;

	// Wall collisions
	let wallDamp = u.damping;
	if (pos.x - r < 0.0) {
		pos.x = r;
		vel.x = abs(vel.x) * wallDamp;
	}
	if (pos.x + r > u.boxSize.x) {
		pos.x = u.boxSize.x - r;
		vel.x = -abs(vel.x) * wallDamp;
	}
	if (pos.y - r < 0.0) {
		pos.y = r;
		vel.y = abs(vel.y) * wallDamp;
	}
	if (pos.y + r > u.boxSize.y) {
		pos.y = u.boxSize.y - r;
		vel.y = -abs(vel.y) * wallDamp;
	}

	// NaN protection
	if (pos.x != pos.x || pos.y != pos.y) {
		pos = u.boxSize * 0.5;
		vel = vec2<f32>(0.0);
	}

	posOut[i] = pos;
	velOut[i] = vel;
}
