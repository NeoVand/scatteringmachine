import { createBuffer, createEmptyBuffer } from './context.js';

export interface ParticleBuffers {
	posA: GPUBuffer;
	posB: GPUBuffer;
	velA: GPUBuffer;
	velB: GPUBuffer;
	density: GPUBuffer;
	pressure: GPUBuffer;
	acceleration: GPUBuffer;
	curveSamples: GPUBuffer;
	uniforms: GPUBuffer;
}

export interface GridBuffers {
	cellCounts: GPUBuffer;
	cellOffsets: GPUBuffer;
	prefixSums: GPUBuffer;
	sortedIndices: GPUBuffer;
	gridInfo: GPUBuffer;
	prefixInfo: GPUBuffer;
}

export interface IOBuffers {
	plateForces: GPUBuffer;
	detectorReadings: GPUBuffer;
	detectorReadback: GPUBuffer;
	detectorDisplay: GPUBuffer; // non-atomic copy for rendering
}

export interface GridConfig {
	gridW: number;
	gridH: number;
	cellSize: number;
	totalCells: number;
}

export interface UniformData {
	boxSize: [number, number];
	dt: number;
	particleCount: number;
	particleRadius: number;
	damping: number;
	gridW: number;
	gridH: number;
	cellSize: number;
	plateCount: number;
	detectorCount: number;
	plateDepth: number;
	gravity: number;
	detectorsActive: boolean;
	platesVisible: boolean;
	stiffness: number;
	viscosity: number;
	hueSource: number;
	satSource: number;
	brightSource: number;
	colorSpectrum: number;
	plateStyle: number;
	hueIntensity: number;
	satIntensity: number;
	brightIntensity: number;
}

export function computeGridConfig(boxWidth: number, boxHeight: number, radius: number): GridConfig {
	const cellSize = radius * 4;
	const gridW = Math.max(1, Math.ceil(boxWidth / cellSize));
	const gridH = Math.max(1, Math.ceil(boxHeight / cellSize));
	return { gridW, gridH, cellSize, totalCells: gridW * gridH };
}

export function createParticleBuffers(
	device: GPUDevice,
	count: number,
	boxWidth: number,
	boxHeight: number,
	radius: number,
	plateDepth: number
): ParticleBuffers {
	const posData = new Float32Array(count * 2);
	const velData = new Float32Array(count * 2);

	// Spawn particles across the full box
	const margin = radius * 2;
	for (let i = 0; i < count; i++) {
		posData[i * 2] = margin + Math.random() * (boxWidth - margin * 2);
		posData[i * 2 + 1] = margin + Math.random() * (boxHeight - margin * 2);

		const angle = Math.random() * Math.PI * 2;
		const speed = 30 + Math.random() * 120;
		velData[i * 2] = Math.cos(angle) * speed;
		velData[i * 2 + 1] = Math.sin(angle) * speed;
	}

	const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

	return {
		posA: createBuffer(device, posData.buffer, storageUsage),
		posB: createEmptyBuffer(device, posData.byteLength, storageUsage),
		velA: createBuffer(device, velData.buffer, storageUsage),
		velB: createEmptyBuffer(device, velData.byteLength, storageUsage),
		density: createEmptyBuffer(device, count * 4, storageUsage),
		pressure: createEmptyBuffer(device, count * 4, storageUsage),
		acceleration: createEmptyBuffer(device, count * 4, storageUsage),
		curveSamples: createEmptyBuffer(device, 768, storageUsage), // 3 curves × 64 samples × 4 bytes
		uniforms: createEmptyBuffer(device, 128, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
	};
}

export function createGridBuffers(
	device: GPUDevice,
	totalCells: number,
	particleCount: number
): GridBuffers {
	const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

	return {
		cellCounts: createEmptyBuffer(device, totalCells * 4, storageUsage),
		cellOffsets: createEmptyBuffer(device, totalCells * 4, storageUsage),
		prefixSums: createEmptyBuffer(device, totalCells * 4, storageUsage),
		sortedIndices: createEmptyBuffer(device, particleCount * 4, storageUsage),
		gridInfo: createEmptyBuffer(device, 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
		prefixInfo: createEmptyBuffer(device, 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
	};
}

export function createIOBuffers(
	device: GPUDevice,
	plateCount: number,
	detectorCount: number
): IOBuffers {
	const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

	return {
		plateForces: createEmptyBuffer(device, Math.max(plateCount * 4, 4), storageUsage),
		detectorReadings: createEmptyBuffer(
			device,
			Math.max(detectorCount * 4, 4),
			storageUsage
		),
		detectorReadback: createEmptyBuffer(
			device,
			Math.max(detectorCount * 4, 4),
			GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
		),
		detectorDisplay: createEmptyBuffer(device, Math.max(detectorCount * 4, 4), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC)
	};
}

export function writeUniforms(device: GPUDevice, buffer: GPUBuffer, data: UniformData) {
	const arr = new Float32Array(32);
	const u32 = new Uint32Array(arr.buffer);
	arr[0] = data.boxSize[0];
	arr[1] = data.boxSize[1];
	arr[2] = data.dt;
	u32[3] = data.particleCount;
	arr[4] = data.particleRadius;
	arr[5] = data.damping;
	u32[6] = data.gridW;
	u32[7] = data.gridH;
	arr[8] = data.cellSize;
	u32[9] = data.plateCount;
	u32[10] = data.detectorCount;
	arr[11] = data.plateDepth;
	arr[12] = data.gravity;
	u32[13] = data.detectorsActive ? 1 : 0;
	u32[14] = data.platesVisible ? 1 : 0;
	arr[15] = data.stiffness;
	arr[16] = data.viscosity;
	u32[17] = data.hueSource;
	u32[18] = data.satSource;
	u32[19] = data.brightSource;
	u32[20] = data.colorSpectrum;
	u32[21] = data.plateStyle;
	arr[22] = data.hueIntensity;
	arr[23] = data.satIntensity;
	arr[24] = data.brightIntensity;
	device.queue.writeBuffer(buffer, 0, arr);
}

export function updateCurveSamples(device: GPUDevice, buffer: GPUBuffer, samples: Float32Array) {
	device.queue.writeBuffer(buffer, 0, samples);
}

export function writeGridInfo(
	device: GPUDevice,
	buffer: GPUBuffer,
	gridW: number,
	gridH: number,
	cellSize: number,
	particleCount: number
) {
	const arr = new ArrayBuffer(16);
	const u32 = new Uint32Array(arr);
	const f32 = new Float32Array(arr);
	u32[0] = gridW;
	u32[1] = gridH;
	f32[2] = cellSize;
	u32[3] = particleCount;
	device.queue.writeBuffer(buffer, 0, arr);
}

export function writePrefixInfo(device: GPUDevice, buffer: GPUBuffer, totalCells: number) {
	const arr = new Uint32Array([totalCells, 0, 0, 0]);
	device.queue.writeBuffer(buffer, 0, arr);
}

export function destroyBuffers(...bufferSets: Record<string, GPUBuffer>[]) {
	for (const set of bufferSets) {
		for (const buf of Object.values(set)) {
			buf.destroy();
		}
	}
}
