<script lang="ts">
	import { onMount } from 'svelte';
	import { initWebGPU } from '$lib/gpu/context.js';
	import { createSimulation, type Simulation } from '$lib/engine/simulation.js';
	import { getSimState } from '$lib/stores/simulation.svelte.js';
	import { AudioInput } from '$lib/audio/input.js';
	import { AudioOutput } from '$lib/audio/output.js';
	import Controls from './Controls.svelte';

	let canvas = $state<HTMLCanvasElement>(null!);
	let errorMsg = $state('');
	let sim: Simulation | null = $state(null);
	const simState = getSimState();

	const audioInput = new AudioInput();
	const audioOutput = new AudioOutput();

	function handleReset() {
		simState.needsBufferRealloc = true;
	}

	onMount(() => {
		let rafId: number;
		let destroyed = false;

		async function init() {
			const dpr = window.devicePixelRatio || 1;
			canvas.width = canvas.clientWidth * dpr;
			canvas.height = canvas.clientHeight * dpr;

			const result = await initWebGPU(canvas);
			if (!result.ok) {
				errorMsg = result.error;
				return;
			}

			const gpu = result.value;
			sim = createSimulation(
				gpu,
				simState.particleCount,
				simState.particleRadius,
				simState.plateCount,
				simState.detectorCount
			);
			sim.resize(canvas.width, canvas.height);

			function loop() {
				if (destroyed) return;

				const dpr = window.devicePixelRatio || 1;
				const w = canvas.clientWidth * dpr;
				const h = canvas.clientHeight * dpr;
				if (canvas.width !== w || canvas.height !== h) {
					canvas.width = w;
					canvas.height = h;
					gpu.context.configure({
						device: gpu.device,
						format: gpu.format,
						alphaMode: 'opaque'
					});
					sim!.resize(w, h);
				}

				sim!.setPlaying(simState.isPlaying);
				sim!.setDamping(simState.damping);

				if (simState.needsBufferRealloc) {
					sim!.rebuild(simState.particleCount, simState.particleRadius);
					simState.needsBufferRealloc = false;
				}

				// Audio input → plate forces (or demo oscillation if no audio)
				if (audioInput.isActive) {
					const forces = audioInput.getFrequencyData(sim!.plateCount);
					sim!.setPlateForces(forces);
				} else {
					// Demo: travelling wave across plates (equal time extended for all)
					const t = performance.now() * 0.001;
					const forces = new Float32Array(sim!.plateCount);
					for (let i = 0; i < forces.length; i++) {
						const phase = (i / forces.length) * Math.PI * 4;
						forces[i] = Math.max(0, Math.sin(t * 3.0 + phase)) * 0.8;
					}
					sim!.setPlateForces(forces);
				}

				sim!.frame();

				// Audio output ← detector readings (only when playing)
				if (audioOutput.isActive) {
					if (simState.isPlaying) {
						const readings = sim!.getDetectorReadings();
						if (readings) {
							audioOutput.sendReadings(readings);
						}
					} else {
						audioOutput.clear();
					}
				}

				rafId = requestAnimationFrame(loop);
			}

			rafId = requestAnimationFrame(loop);
		}

		init();

		return () => {
			destroyed = true;
			cancelAnimationFrame(rafId);
			sim?.destroy();
			audioInput.destroy();
			audioOutput.destroy();
		};
	});
</script>

{#if errorMsg}
	<div class="flex h-screen items-center justify-center bg-gray-950 text-white">
		<div class="text-center">
			<h1 class="mb-2 text-2xl font-bold">WebGPU Not Available</h1>
			<p class="text-gray-400">{errorMsg}</p>
		</div>
	</div>
{:else}
	<canvas bind:this={canvas} class="h-screen w-screen"></canvas>
	<Controls {audioInput} {audioOutput} onReset={handleReset} />
{/if}
