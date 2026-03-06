<script lang="ts">
	import { onMount } from 'svelte';
	import { initWebGPU } from '$lib/gpu/context.js';
	import { createSimulation, type Simulation } from '$lib/engine/simulation.js';
	import { getSimState, sampleAllCurves, DemoPattern } from '$lib/stores/simulation.svelte.js';
	import { AudioInput } from '$lib/audio/input.js';
	import { AudioOutput } from '$lib/audio/output.js';
	import Controls from './Controls.svelte';

	let canvas = $state<HTMLCanvasElement>(null!);
	let errorMsg = $state('');
	let sim: Simulation | null = $state(null);
	const simState = getSimState();

	const audioInput = new AudioInput();
	const audioOutput = new AudioOutput();

	let wasPlaying = true;

	// ─── Demo pattern generators (when no audio source) ───

	function demoRipple(forces: Float32Array, t: number): void {
		const center = (forces.length - 1) / 2;
		for (let i = 0; i < forces.length; i++) {
			const dist = Math.abs(i - center) / center;
			const phase = dist * Math.PI * 4;
			forces[i] = Math.max(0, Math.sin(t * 3.0 + phase)) * 0.8;
		}
	}

	function demoSweep(forces: Float32Array, t: number): void {
		const n = forces.length;
		const period = 4.0;
		const raw = (t % period) / period;
		const pos = raw < 0.5 ? raw * 2 : 2 - raw * 2;
		const center = pos * (n - 1);
		const width = n * 0.08;
		for (let i = 0; i < n; i++) {
			const d = (i - center) / width;
			forces[i] = Math.exp(-d * d * 0.5) * 0.9;
		}
	}

	function demoCascade(forces: Float32Array, t: number): void {
		const n = forces.length;
		const groupCount = 7;
		const groupSize = n / groupCount;
		const cyclePeriod = 3.0;
		for (let i = 0; i < n; i++) {
			const groupIdx = Math.floor(i / groupSize);
			const groupDelay = (groupIdx / groupCount) * cyclePeriod;
			const localT = ((t - groupDelay) % cyclePeriod + cyclePeriod) % cyclePeriod;
			const activeDuration = 0.6;
			const phase = localT / activeDuration;
			if (phase >= 0 && phase < 1) {
				forces[i] = Math.sin(phase * Math.PI) * 0.85;
			} else {
				forces[i] = 0;
			}
		}
	}

	function demoChladni(forces: Float32Array, t: number): void {
		const n = forces.length;
		for (let i = 0; i < n; i++) {
			const x = i / (n - 1);
			const wave1 = Math.sin(x * Math.PI * 6 - t * 2.0);
			const wave2 = Math.sin(x * Math.PI * 10 + t * 1.5);
			const envelope = 0.5 + 0.5 * Math.sin(x * Math.PI * 2 + t * 0.4);
			const combined = (wave1 + wave2) * 0.5 * envelope;
			forces[i] = Math.max(0, combined) * 0.85;
		}
	}

	function demoBreathe(forces: Float32Array, t: number): void {
		const n = forces.length;
		const breath = Math.max(0, Math.sin(t * Math.PI * 2 / 5.0));
		const pulse = Math.max(0, Math.sin(t * 4.0)) * 0.3;
		for (let i = 0; i < n; i++) {
			const x = i / (n - 1);
			const edgeness = 2.0 * Math.abs(x - 0.5);
			const shape = edgeness * edgeness;
			forces[i] = (breath + pulse) * shape * 0.9;
		}
	}

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
				sim!.setGravity(simState.gravity);
				sim!.setPlateReach(simState.plateReach);
				sim!.setDetectorsActive(audioOutput.isActive);
				sim!.setPlatesVisible(simState.platesVisible);
				sim!.setPlateStyle(simState.plateStyle);
				sim!.setStiffness(simState.stiffness);
				sim!.setViscosity(simState.viscosity);
				sim!.setColorConfig(simState.hueSource, simState.satSource, simState.brightSource, simState.colorSpectrum);
				sim!.setIntensity(simState.hueIntensity, simState.satIntensity, simState.brightIntensity);

				if (simState.curvesDirty) {
					const samples = sampleAllCurves(simState.hueCurvePoints, simState.satCurvePoints, simState.brightCurvePoints);
					sim!.setCurveSamples(samples);
					simState.curvesDirty = false;
				}

				// Pause/resume audio input when play state changes
				if (simState.isPlaying !== wasPlaying) {
					if (simState.isPlaying) {
						audioInput.resume();
					} else {
						audioInput.pause();
					}
					wasPlaying = simState.isPlaying;
				}

				if (simState.needsBufferRealloc) {
					sim!.rebuild(simState.particleCount, simState.particleRadius, simState.plateCount, simState.detectorCount);
					simState.needsBufferRealloc = false;
					simState.curvesDirty = true; // re-upload curve samples to new buffer
				}

				// Audio input → plate forces (or demo oscillation if no audio)
				if (audioInput.hasSource) {
					const forces = audioInput.isActive
						? audioInput.getFrequencyData(
							sim!.plateCount,
							simState.inputFreqMin,
							simState.inputFreqMax
						)
						: new Float32Array(sim!.plateCount); // zeros when paused
					sim!.setPlateForces(forces);
				} else {
					const t = performance.now() * 0.001;
					const forces = new Float32Array(sim!.plateCount);
					switch (simState.demoPattern) {
						case DemoPattern.Sweep: demoSweep(forces, t); break;
						case DemoPattern.Cascade: demoCascade(forces, t); break;
						case DemoPattern.Chladni: demoChladni(forces, t); break;
						case DemoPattern.Breathe: demoBreathe(forces, t); break;
						default: demoRipple(forces, t); break;
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
