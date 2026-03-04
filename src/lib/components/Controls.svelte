<script lang="ts">
	import { getSimState } from '$lib/stores/simulation.svelte.js';
	import { AudioInput } from '$lib/audio/input.js';
	import { AudioOutput } from '$lib/audio/output.js';

	interface Props {
		audioInput: AudioInput;
		audioOutput: AudioOutput;
		onReset?: () => void;
	}

	let { audioInput, audioOutput, onReset }: Props = $props();

	const simState = getSimState();

	let audioSource = $state<'none' | 'mic' | 'file'>('none');
	let audioOutEnabled = $state(false);
	let outputVolume = $state(0.3);
	let collapsed = $state(false);
	let fileInput: HTMLInputElement = $state(null!);

	async function setAudioSource(source: 'none' | 'mic' | 'file') {
		if (source === 'none') {
			audioInput.stop();
			audioSource = 'none';
		} else if (source === 'mic') {
			try {
				await audioInput.startMicrophone(simState.plateCount);
				audioSource = 'mic';
			} catch {
				audioSource = 'none';
			}
		} else if (source === 'file') {
			fileInput?.click();
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const url = URL.createObjectURL(file);
		audioInput.loadFile(url, simState.plateCount).then(() => {
			audioSource = 'file';
		});
	}

	async function toggleAudioOutput() {
		if (audioOutEnabled) {
			audioOutput.stop();
			audioOutEnabled = false;
		} else {
			await audioOutput.start(simState.detectorCount, outputVolume);
			audioOutEnabled = true;
		}
	}

	function handleVolumeChange(e: Event) {
		outputVolume = parseFloat((e.target as HTMLInputElement).value);
		audioOutput.setVolume(outputVolume);
	}
</script>

<input type="file" accept="audio/*" class="hidden" bind:this={fileInput} onchange={handleFileSelect} />

<div class="fixed right-4 top-4 z-50 select-none font-mono text-xs">
	<button
		class="mb-1 rounded bg-gray-800/80 px-2 py-1 text-gray-400 backdrop-blur-sm hover:text-white"
		onclick={() => collapsed = !collapsed}
	>
		{collapsed ? '+ controls' : '- controls'}
	</button>

	{#if !collapsed}
		<div class="w-64 rounded-lg bg-gray-900/90 p-3 text-gray-300 shadow-xl backdrop-blur-sm">
			<!-- Playback -->
			<div class="mb-3 flex gap-2">
				<button
					class="flex-1 rounded px-2 py-1 {simState.isPlaying ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}"
					onclick={() => simState.isPlaying = !simState.isPlaying}
				>
					{simState.isPlaying ? 'Pause' : 'Play'}
				</button>
				<button
					class="rounded bg-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-600"
					onclick={() => onReset?.()}
				>
					Reset
				</button>
			</div>

			<!-- Particles -->
			<div class="mb-3">
				<span class="mb-1 block text-gray-500">Particles: {simState.particleCount}</span>
				<input
					type="range"
					min="100"
					max="20000"
					step="100"
					value={simState.particleCount}
					oninput={(e) => simState.particleCount = parseInt(e.currentTarget.value)}
					class="w-full accent-blue-500"
				/>
			</div>

			<div class="mb-3">
				<span class="mb-1 block text-gray-500">Radius: {simState.particleRadius}</span>
				<input
					type="range"
					min="1"
					max="10"
					step="0.5"
					value={simState.particleRadius}
					oninput={(e) => simState.particleRadius = parseFloat(e.currentTarget.value)}
					class="w-full accent-blue-500"
				/>
			</div>

			<div class="mb-3">
				<span class="mb-1 block text-gray-500">Damping: {simState.damping.toFixed(3)}</span>
				<input
					type="range"
					min="0.9"
					max="1"
					step="0.001"
					value={simState.damping}
					oninput={(e) => simState.damping = parseFloat(e.currentTarget.value)}
					class="w-full accent-blue-500"
				/>
			</div>

			<!-- Audio Input -->
			<div class="mb-3 border-t border-gray-700 pt-2">
				<span class="mb-1 block text-gray-500">Audio Input</span>
				<div class="flex gap-1">
					<button
						class="flex-1 rounded px-2 py-1 {audioSource === 'none' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400'}"
						onclick={() => setAudioSource('none')}
					>Off</button>
					<button
						class="flex-1 rounded px-2 py-1 {audioSource === 'mic' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}"
						onclick={() => setAudioSource('mic')}
					>Mic</button>
					<button
						class="flex-1 rounded px-2 py-1 {audioSource === 'file' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}"
						onclick={() => setAudioSource('file')}
					>File</button>
				</div>
			</div>

			<!-- Audio Output -->
			<div class="mb-2 border-t border-gray-700 pt-2">
				<div class="mb-1 flex items-center justify-between">
					<span class="text-gray-500">Audio Output</span>
					<button
						class="rounded px-2 py-0.5 {audioOutEnabled ? 'bg-red-600/80 text-white' : 'bg-gray-800 text-gray-400'}"
						onclick={toggleAudioOutput}
					>
						{audioOutEnabled ? 'On' : 'Off'}
					</button>
				</div>
				{#if audioOutEnabled}
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={outputVolume}
						oninput={handleVolumeChange}
						class="w-full accent-red-500"
					/>
				{/if}
			</div>
		</div>
	{/if}
</div>
