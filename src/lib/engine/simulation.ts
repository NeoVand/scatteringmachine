import type { WebGPUContext } from '$lib/gpu/context.js';
import {
	createParticleBuffers,
	createGridBuffers,
	createIOBuffers,
	writeUniforms,
	writeGridInfo,
	writePrefixInfo,
	computeGridConfig,
	destroyBuffers,
	type ParticleBuffers,
	type GridBuffers,
	type IOBuffers,
	type GridConfig
} from '$lib/gpu/buffers.js';
import physicsShader from '$lib/shaders/physics.wgsl?raw';
import particleShader from '$lib/shaders/particle.wgsl?raw';
import backgroundShader from '$lib/shaders/background.wgsl?raw';
import clearShader from '$lib/shaders/clear.wgsl?raw';
import countShader from '$lib/shaders/count.wgsl?raw';
import prefixSumShader from '$lib/shaders/prefix_sum.wgsl?raw';
import scatterShader from '$lib/shaders/scatter.wgsl?raw';
import platesShader from '$lib/shaders/plates.wgsl?raw';
import detectorsShader from '$lib/shaders/detectors.wgsl?raw';
import clearDetectorsShader from '$lib/shaders/clear_detectors.wgsl?raw';

export interface Simulation {
	frame(): void;
	destroy(): void;
	resize(w: number, h: number): void;
	rebuild(count: number, radius: number): void;
	setDamping(v: number): void;
	setPlaying(v: boolean): void;
	setPlateForces(forces: Float32Array): void;
	getDetectorReadings(): Float32Array | null;
	plateCount: number;
	detectorCount: number;
}

export function createSimulation(
	gpu: WebGPUContext,
	particleCount: number,
	particleRadius: number,
	plateCount: number,
	detectorCount: number
): Simulation {
	const { device, context, format, canvas } = gpu;

	let boxWidth = canvas.width;
	let boxHeight = canvas.height;
	let count = particleCount;
	let radius = particleRadius;
	let nPlates = plateCount;
	let nDetectors = detectorCount;
	let damping = 0.999;
	let playing = true;
	let readFromA = true;
	let destroyed = false;
	let pendingReadback = false;
	let latestDetectorReadings: Float32Array | null = null;

	const plateDepthFraction = 0.12; // 12% of box width for plates/detectors
	function getPlateDepth() {
		return boxWidth * plateDepthFraction;
	}

	let grid: GridConfig = computeGridConfig(boxWidth, boxHeight, radius);
	let pBuf: ParticleBuffers = createParticleBuffers(
		device, count, boxWidth, boxHeight, radius, getPlateDepth()
	);
	let gBuf: GridBuffers = createGridBuffers(device, grid.totalCells, count);
	let ioBuf: IOBuffers = createIOBuffers(device, nPlates, nDetectors);

	// ===== PIPELINES =====

	// Clear (grid cells)
	const clearBGL = device.createBindGroupLayout({
		entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }]
	});
	const clearPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [clearBGL] }),
		compute: { module: device.createShaderModule({ code: clearShader }), entryPoint: 'main' }
	});

	// Count
	const countBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
		]
	});
	const countPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [countBGL] }),
		compute: { module: device.createShaderModule({ code: countShader }), entryPoint: 'main' }
	});

	// Prefix sum
	const prefixBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
		]
	});
	const prefixPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [prefixBGL] }),
		compute: { module: device.createShaderModule({ code: prefixSumShader }), entryPoint: 'main' }
	});

	// Scatter
	const scatterBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
		]
	});
	const scatterPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [scatterBGL] }),
		compute: { module: device.createShaderModule({ code: scatterShader }), entryPoint: 'main' }
	});

	// Plates (force injection — positions are read_write so plates can push particles out)
	const platesBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }
		]
	});
	const platesPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [platesBGL] }),
		compute: { module: device.createShaderModule({ code: platesShader }), entryPoint: 'main' }
	});

	// Detectors (momentum measurement)
	const detectorsBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
		]
	});
	const detectorsPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [detectorsBGL] }),
		compute: { module: device.createShaderModule({ code: detectorsShader }), entryPoint: 'main' }
	});

	// Clear detectors + convert
	const clearDetBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
		]
	});
	const clearDetModule = device.createShaderModule({ code: clearDetectorsShader });
	const clearDetPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [clearDetBGL] }),
		compute: { module: clearDetModule, entryPoint: 'clear' }
	});
	const convertDetPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [clearDetBGL] }),
		compute: { module: clearDetModule, entryPoint: 'convert' }
	});

	// Physics
	const physicsBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }
		]
	});
	const physicsPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [physicsBGL] }),
		compute: { module: device.createShaderModule({ code: physicsShader }), entryPoint: 'main' }
	});

	// Render: background (full-screen tri)
	const bgBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
		]
	});
	const bgPipeline = device.createRenderPipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [bgBGL] }),
		vertex: { module: device.createShaderModule({ code: backgroundShader }), entryPoint: 'vs' },
		fragment: {
			module: device.createShaderModule({ code: backgroundShader }),
			entryPoint: 'fs',
			targets: [{ format }]
		},
		primitive: { topology: 'triangle-list' }
	});

	// Render: particles
	const renderBGL = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
		]
	});
	const renderPipeline = device.createRenderPipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
		vertex: { module: device.createShaderModule({ code: particleShader }), entryPoint: 'vs' },
		fragment: {
			module: device.createShaderModule({ code: particleShader }),
			entryPoint: 'fs',
			targets: [{
				format,
				blend: {
					color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
					alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
				}
			}]
		},
		primitive: { topology: 'triangle-list' }
	});

	// ===== BIND GROUPS =====

	function makeClearBGs() {
		return {
			counts: device.createBindGroup({ layout: clearBGL, entries: [{ binding: 0, resource: { buffer: gBuf.cellCounts } }] }),
			offsets: device.createBindGroup({ layout: clearBGL, entries: [{ binding: 0, resource: { buffer: gBuf.cellOffsets } }] })
		};
	}

	function makeCountBGs() {
		return {
			A: device.createBindGroup({ layout: countBGL, entries: [
				{ binding: 0, resource: { buffer: gBuf.gridInfo } },
				{ binding: 1, resource: { buffer: pBuf.posA } },
				{ binding: 2, resource: { buffer: gBuf.cellCounts } }
			]}),
			B: device.createBindGroup({ layout: countBGL, entries: [
				{ binding: 0, resource: { buffer: gBuf.gridInfo } },
				{ binding: 1, resource: { buffer: pBuf.posB } },
				{ binding: 2, resource: { buffer: gBuf.cellCounts } }
			]})
		};
	}

	function makePrefixBG() {
		return device.createBindGroup({ layout: prefixBGL, entries: [
			{ binding: 0, resource: { buffer: gBuf.prefixInfo } },
			{ binding: 1, resource: { buffer: gBuf.cellCounts } },
			{ binding: 2, resource: { buffer: gBuf.prefixSums } }
		]});
	}

	function makeScatterBGs() {
		return {
			A: device.createBindGroup({ layout: scatterBGL, entries: [
				{ binding: 0, resource: { buffer: gBuf.gridInfo } },
				{ binding: 1, resource: { buffer: pBuf.posA } },
				{ binding: 2, resource: { buffer: gBuf.prefixSums } },
				{ binding: 3, resource: { buffer: gBuf.cellOffsets } },
				{ binding: 4, resource: { buffer: gBuf.sortedIndices } }
			]}),
			B: device.createBindGroup({ layout: scatterBGL, entries: [
				{ binding: 0, resource: { buffer: gBuf.gridInfo } },
				{ binding: 1, resource: { buffer: pBuf.posB } },
				{ binding: 2, resource: { buffer: gBuf.prefixSums } },
				{ binding: 3, resource: { buffer: gBuf.cellOffsets } },
				{ binding: 4, resource: { buffer: gBuf.sortedIndices } }
			]})
		};
	}

	function makePlatesBGs() {
		return {
			A: device.createBindGroup({ layout: platesBGL, entries: [
				{ binding: 0, resource: { buffer: pBuf.uniforms } },
				{ binding: 1, resource: { buffer: pBuf.posA } },
				{ binding: 2, resource: { buffer: pBuf.velA } },
				{ binding: 3, resource: { buffer: ioBuf.plateForces } }
			]}),
			B: device.createBindGroup({ layout: platesBGL, entries: [
				{ binding: 0, resource: { buffer: pBuf.uniforms } },
				{ binding: 1, resource: { buffer: pBuf.posB } },
				{ binding: 2, resource: { buffer: pBuf.velB } },
				{ binding: 3, resource: { buffer: ioBuf.plateForces } }
			]})
		};
	}

	function makeDetectorsBGs() {
		return {
			A: device.createBindGroup({ layout: detectorsBGL, entries: [
				{ binding: 0, resource: { buffer: pBuf.uniforms } },
				{ binding: 1, resource: { buffer: pBuf.posA } },
				{ binding: 2, resource: { buffer: pBuf.velA } },
				{ binding: 3, resource: { buffer: ioBuf.detectorReadings } }
			]}),
			B: device.createBindGroup({ layout: detectorsBGL, entries: [
				{ binding: 0, resource: { buffer: pBuf.uniforms } },
				{ binding: 1, resource: { buffer: pBuf.posB } },
				{ binding: 2, resource: { buffer: pBuf.velB } },
				{ binding: 3, resource: { buffer: ioBuf.detectorReadings } }
			]})
		};
	}

	function makeClearDetBG() {
		return device.createBindGroup({ layout: clearDetBGL, entries: [
			{ binding: 0, resource: { buffer: ioBuf.detectorReadings } },
			{ binding: 1, resource: { buffer: ioBuf.detectorDisplay } }
		]});
	}

	function makePhysicsBGs() {
		return {
			AtoB: device.createBindGroup({ layout: physicsBGL, entries: [
				{ binding: 0, resource: { buffer: pBuf.uniforms } },
				{ binding: 1, resource: { buffer: pBuf.posA } },
				{ binding: 2, resource: { buffer: pBuf.velA } },
				{ binding: 3, resource: { buffer: pBuf.posB } },
				{ binding: 4, resource: { buffer: pBuf.velB } },
				{ binding: 5, resource: { buffer: gBuf.prefixSums } },
				{ binding: 6, resource: { buffer: gBuf.cellCounts } },
				{ binding: 7, resource: { buffer: gBuf.sortedIndices } }
			]}),
			BtoA: device.createBindGroup({ layout: physicsBGL, entries: [
				{ binding: 0, resource: { buffer: pBuf.uniforms } },
				{ binding: 1, resource: { buffer: pBuf.posB } },
				{ binding: 2, resource: { buffer: pBuf.velB } },
				{ binding: 3, resource: { buffer: pBuf.posA } },
				{ binding: 4, resource: { buffer: pBuf.velA } },
				{ binding: 5, resource: { buffer: gBuf.prefixSums } },
				{ binding: 6, resource: { buffer: gBuf.cellCounts } },
				{ binding: 7, resource: { buffer: gBuf.sortedIndices } }
			]})
		};
	}

	function makeBgBG() {
		return device.createBindGroup({ layout: bgBGL, entries: [
			{ binding: 0, resource: { buffer: pBuf.uniforms } },
			{ binding: 1, resource: { buffer: ioBuf.plateForces } },
			{ binding: 2, resource: { buffer: ioBuf.detectorDisplay } }
		]});
	}

	function makeRenderBGs() {
		return {
			A: device.createBindGroup({ layout: renderBGL, entries: [
				{ binding: 0, resource: { buffer: pBuf.uniforms } },
				{ binding: 1, resource: { buffer: pBuf.posA } },
				{ binding: 2, resource: { buffer: pBuf.velA } }
			]}),
			B: device.createBindGroup({ layout: renderBGL, entries: [
				{ binding: 0, resource: { buffer: pBuf.uniforms } },
				{ binding: 1, resource: { buffer: pBuf.posB } },
				{ binding: 2, resource: { buffer: pBuf.velB } }
			]})
		};
	}

	let clearBGs = makeClearBGs();
	let countBGs = makeCountBGs();
	let prefixBG = makePrefixBG();
	let scatterBGs = makeScatterBGs();
	let platesBGs = makePlatesBGs();
	let detectorsBGs = makeDetectorsBGs();
	let clearDetBG = makeClearDetBG();
	let physicsBGs = makePhysicsBGs();
	let bgBG = makeBgBG();
	let renderBGs = makeRenderBGs();

	// ===== FRAME LOGIC =====

	function frame() {
		if (destroyed) return;

		const plateDepth = getPlateDepth();
		writeUniforms(device, pBuf.uniforms, {
			boxSize: [boxWidth, boxHeight],
			dt: 1 / 60,
			particleCount: count,
			particleRadius: radius,
			damping,
			gridW: grid.gridW,
			gridH: grid.gridH,
			cellSize: grid.cellSize,
			plateCount: nPlates,
			detectorCount: nDetectors,
			plateDepth
		});

		const encoder = device.createCommandEncoder();

		if (playing) {
			writeGridInfo(device, gBuf.gridInfo, grid.gridW, grid.gridH, grid.cellSize, count);
			writePrefixInfo(device, gBuf.prefixInfo, grid.totalCells);

			const wgP = Math.ceil(count / 256);
			const wgC = Math.ceil(grid.totalCells / 256);
			const wgD = Math.max(1, Math.ceil(nDetectors / 256));

			// 1. Clear grid cells + offsets
			let pass = encoder.beginComputePass();
			pass.setPipeline(clearPipeline);
			pass.setBindGroup(0, clearBGs.counts);
			pass.dispatchWorkgroups(wgC);
			pass.end();

			pass = encoder.beginComputePass();
			pass.setPipeline(clearPipeline);
			pass.setBindGroup(0, clearBGs.offsets);
			pass.dispatchWorkgroups(wgC);
			pass.end();

			// 2. Clear detectors
			pass = encoder.beginComputePass();
			pass.setPipeline(clearDetPipeline);
			pass.setBindGroup(0, clearDetBG);
			pass.dispatchWorkgroups(wgD);
			pass.end();

			// 3. Count particles per cell
			pass = encoder.beginComputePass();
			pass.setPipeline(countPipeline);
			pass.setBindGroup(0, readFromA ? countBGs.A : countBGs.B);
			pass.dispatchWorkgroups(wgP);
			pass.end();

			// 4. Prefix sum
			pass = encoder.beginComputePass();
			pass.setPipeline(prefixPipeline);
			pass.setBindGroup(0, prefixBG);
			pass.dispatchWorkgroups(1);
			pass.end();

			// 5. Scatter
			pass = encoder.beginComputePass();
			pass.setPipeline(scatterPipeline);
			pass.setBindGroup(0, readFromA ? scatterBGs.A : scatterBGs.B);
			pass.dispatchWorkgroups(wgP);
			pass.end();

			// 6. Plate forces (modify velocity in-place on current read buffer)
			pass = encoder.beginComputePass();
			pass.setPipeline(platesPipeline);
			pass.setBindGroup(0, readFromA ? platesBGs.A : platesBGs.B);
			pass.dispatchWorkgroups(wgP);
			pass.end();

			// 7. Physics (read from current, write to other)
			pass = encoder.beginComputePass();
			pass.setPipeline(physicsPipeline);
			pass.setBindGroup(0, readFromA ? physicsBGs.AtoB : physicsBGs.BtoA);
			pass.dispatchWorkgroups(wgP);
			pass.end();

			// After physics: readFromA flipped, so the WRITTEN buffer is the opposite
			// Detectors should read from the WRITTEN buffer
			// If readFromA was true: physics wrote to B, so read detectors from B
			// If readFromA was false: physics wrote to A, so read detectors from A

			// 8. Detectors (read from newly written buffer)
			pass = encoder.beginComputePass();
			pass.setPipeline(detectorsPipeline);
			pass.setBindGroup(0, readFromA ? detectorsBGs.B : detectorsBGs.A);
			pass.dispatchWorkgroups(wgP);
			pass.end();

			// 9. Convert detector i32 -> f32
			pass = encoder.beginComputePass();
			pass.setPipeline(convertDetPipeline);
			pass.setBindGroup(0, clearDetBG);
			pass.dispatchWorkgroups(wgD);
			pass.end();

			// 10. Copy to readback (only when not mapped)
			if (!pendingReadback) {
				encoder.copyBufferToBuffer(
					ioBuf.detectorDisplay, 0,
					ioBuf.detectorReadback, 0,
					nDetectors * 4
				);
			}

			// Flip ping-pong BEFORE render so render reads the newly written buffer
			readFromA = !readFromA;
		}

		// Render pass: background + particles (single pass)
		const texture = context.getCurrentTexture();
		const renderPass = encoder.beginRenderPass({
			colorAttachments: [{
				view: texture.createView(),
				loadOp: 'clear',
				storeOp: 'store',
				clearValue: { r: 0.03, g: 0.03, b: 0.06, a: 1 }
			}]
		});

		renderPass.setPipeline(bgPipeline);
		renderPass.setBindGroup(0, bgBG);
		renderPass.draw(3);

		renderPass.setPipeline(renderPipeline);
		renderPass.setBindGroup(0, readFromA ? renderBGs.A : renderBGs.B);
		renderPass.draw(6, count);

		renderPass.end();

		device.queue.submit([encoder.finish()]);

		// Async readback
		if (playing && !pendingReadback) {
			pendingReadback = true;
			ioBuf.detectorReadback.mapAsync(GPUMapMode.READ).then(() => {
				if (destroyed) return;
				const data = new Float32Array(ioBuf.detectorReadback.getMappedRange().slice(0));
				ioBuf.detectorReadback.unmap();
				latestDetectorReadings = data;
				pendingReadback = false;
			}).catch(() => {
				pendingReadback = false;
			});
		}
	}

	function rebuildAllBGs() {
		clearBGs = makeClearBGs();
		countBGs = makeCountBGs();
		prefixBG = makePrefixBG();
		scatterBGs = makeScatterBGs();
		platesBGs = makePlatesBGs();
		detectorsBGs = makeDetectorsBGs();
		clearDetBG = makeClearDetBG();
		physicsBGs = makePhysicsBGs();
		bgBG = makeBgBG();
		renderBGs = makeRenderBGs();
	}

	function resize(w: number, h: number) {
		boxWidth = w;
		boxHeight = h;
		grid = computeGridConfig(boxWidth, boxHeight, radius);
		destroyBuffers(gBuf);
		gBuf = createGridBuffers(device, grid.totalCells, count);
		rebuildAllBGs();
	}

	function rebuild(newCount: number, newRadius: number) {
		count = newCount;
		radius = newRadius;
		readFromA = true;
		grid = computeGridConfig(boxWidth, boxHeight, radius);
		destroyBuffers(pBuf, gBuf, ioBuf);
		pBuf = createParticleBuffers(device, count, boxWidth, boxHeight, radius, getPlateDepth());
		gBuf = createGridBuffers(device, grid.totalCells, count);
		ioBuf = createIOBuffers(device, nPlates, nDetectors);
		rebuildAllBGs();
	}

	function destroy() {
		destroyed = true;
		destroyBuffers(pBuf, gBuf, ioBuf);
	}

	return {
		frame,
		destroy,
		resize,
		rebuild,
		setDamping(v: number) { damping = v; },
		setPlaying(v: boolean) { playing = v; },
		setPlateForces(forces: Float32Array) {
			device.queue.writeBuffer(ioBuf.plateForces, 0, forces, 0, Math.min(forces.length, nPlates));
		},
		getDetectorReadings() { return latestDetectorReadings; },
		get plateCount() { return nPlates; },
		get detectorCount() { return nDetectors; }
	};
}
