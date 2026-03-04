struct Uniforms {
	boxSize: vec2<f32>,
	dt: f32,
	particleCount: u32,
	particleRadius: f32,
	damping: f32, // coefficient of restitution (1.0 = elastic, <1 = energy loss on collision)
	gridW: u32,
	gridH: u32,
	cellSize: f32,
	plateCount: u32,
	detectorCount: u32,
	plateDepth: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> posIn: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> velIn: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> posOut: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> velOut: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read> prefixSums: array<u32>;
@group(0) @binding(6) var<storage, read> cellCounts: array<u32>;
@group(0) @binding(7) var<storage, read> sortedIndices: array<u32>;

fn getCellIndex(cx: u32, cy: u32) -> u32 {
	return cy * u.gridW + cx;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= u.particleCount) { return; }

	var pos = posIn[i];
	var vel = velIn[i];
	let r = u.particleRadius;
	let minDist = 2.0 * r;
	let e = u.damping; // coefficient of restitution

	// My cell coordinates
	let myCX = min(u32(pos.x / u.cellSize), u.gridW - 1u);
	let myCY = min(u32(pos.y / u.cellSize), u.gridH - 1u);

	// Search 3x3 neighborhood
	let startX = select(0u, myCX - 1u, myCX > 0u);
	let startY = select(0u, myCY - 1u, myCY > 0u);
	let endX = min(myCX + 1u, u.gridW - 1u);
	let endY = min(myCY + 1u, u.gridH - 1u);

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
				let dist2 = dot(delta, delta);

				if (dist2 < minDist * minDist && dist2 > 0.0001) {
					let dist = sqrt(dist2);
					let normal = delta / dist;
					let overlap = minDist - dist;

					// Collision with coefficient of restitution (equal mass)
					let relVel = vel - vj;
					let vnRel = dot(relVel, normal);

					if (vnRel < 0.0) {
						vel -= (1.0 + e) * 0.5 * vnRel * normal;
					}

					// Separate overlap
					pos += normal * overlap * 0.5;
				}
			}
		}
	}

	// Velocity cap + NaN protection
	let speed = length(vel);
	if (speed > 500.0 || speed != speed) {
		vel = select(vel * (500.0 / speed), vec2<f32>(0.0), speed != speed);
	}

	// Integration
	pos += vel * u.dt;

	// Wall collisions with restitution — AFTER integration
	if (pos.x - r < 0.0) {
		pos.x = r;
		vel.x = abs(vel.x) * e;
	}
	if (pos.x + r > u.boxSize.x) {
		pos.x = u.boxSize.x - r;
		vel.x = -abs(vel.x) * e;
	}
	if (pos.y - r < 0.0) {
		pos.y = r;
		vel.y = abs(vel.y) * e;
	}
	if (pos.y + r > u.boxSize.y) {
		pos.y = u.boxSize.y - r;
		vel.y = -abs(vel.y) * e;
	}

	// NaN protection for position
	if (pos.x != pos.x || pos.y != pos.y) {
		pos = u.boxSize * 0.5;
		vel = vec2<f32>(0.0);
	}

	posOut[i] = pos;
	velOut[i] = vel;
}
