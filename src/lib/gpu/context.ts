export interface WebGPUContext {
	device: GPUDevice;
	context: GPUCanvasContext;
	format: GPUTextureFormat;
	canvas: HTMLCanvasElement;
}

export type WebGPUResult =
	| { ok: true; value: WebGPUContext }
	| { ok: false; error: string };

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUResult> {
	if (!navigator.gpu) {
		return { ok: false, error: 'WebGPU is not supported in this browser.' };
	}

	const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
	if (!adapter) {
		return { ok: false, error: 'Failed to get GPU adapter.' };
	}

	const device = await adapter.requestDevice({
		requiredLimits: {
			maxStorageBuffersPerShaderStage: Math.min(
				10,
				adapter.limits.maxStorageBuffersPerShaderStage
			),
			maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
			maxBufferSize: adapter.limits.maxBufferSize
		}
	});

	device.lost.then((info) => {
		console.error('WebGPU device lost:', info.message);
	});

	const ctx = canvas.getContext('webgpu');
	if (!ctx) {
		return { ok: false, error: 'Failed to get WebGPU canvas context.' };
	}

	const format = navigator.gpu.getPreferredCanvasFormat();
	ctx.configure({ device, format, alphaMode: 'opaque' });

	return { ok: true, value: { device, context: ctx, format, canvas } };
}

export function createBuffer(
	device: GPUDevice,
	data: ArrayBuffer,
	usage: GPUBufferUsageFlags
): GPUBuffer {
	const buffer = device.createBuffer({
		size: data.byteLength,
		usage,
		mappedAtCreation: true
	});
	new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data));
	buffer.unmap();
	return buffer;
}

export function createEmptyBuffer(
	device: GPUDevice,
	size: number,
	usage: GPUBufferUsageFlags
): GPUBuffer {
	return device.createBuffer({ size, usage });
}
