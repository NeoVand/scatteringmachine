<script lang="ts">
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { getSimState, ColorSource, SpectrumType, PlateStyle, DemoPattern, InputMode } from '$lib/stores/simulation.svelte.js';
	import { AudioInput } from '$lib/audio/input.js';
	import { AudioOutput } from '$lib/audio/output.js';
	import CurveEditor from './CurveEditor.svelte';

	const sourceLabels: { value: ColorSource; label: string }[] = [
		{ value: ColorSource.Speed, label: 'Speed' },
		{ value: ColorSource.Density, label: 'Density' },
		{ value: ColorSource.PosX, label: 'Pos X' },
		{ value: ColorSource.PosY, label: 'Pos Y' },
		{ value: ColorSource.Pressure, label: 'Pressure' },
		{ value: ColorSource.Acceleration, label: 'Accel' },
		{ value: ColorSource.None, label: 'None' }
	];

	const spectrumLabels: { value: SpectrumType; label: string; gradient: string }[] = [
		{ value: SpectrumType.Rainbow, label: 'Rainbow', gradient: 'linear-gradient(to right, hsl(0,85%,50%), hsl(60,85%,50%), hsl(120,85%,45%), hsl(180,85%,50%), hsl(240,85%,55%), hsl(300,85%,50%))' },
		{ value: SpectrumType.Chrome, label: 'Chrome', gradient: 'linear-gradient(to right, rgb(51,102,230), rgb(77,204,230), rgb(242,242,230), rgb(242,153,51), rgb(230,51,51))' },
		{ value: SpectrumType.Ocean, label: 'Ocean', gradient: 'linear-gradient(to right, rgb(77,107,199), rgb(64,166,179), rgb(89,191,140), rgb(235,199,89), rgb(224,128,115), rgb(166,107,166))' },
		{ value: SpectrumType.Bands, label: 'Bands', gradient: 'linear-gradient(to right, rgb(230,51,77) 0%, rgb(230,51,77) 16.6%, rgb(242,153,26) 16.7%, rgb(242,153,26) 33.3%, rgb(242,230,51) 33.4%, rgb(242,230,51) 50%, rgb(51,204,102) 50.1%, rgb(51,204,102) 66.6%, rgb(51,153,230) 66.7%, rgb(51,153,230) 83.3%, rgb(153,77,204) 83.4%, rgb(153,77,204) 100%)' },
		{ value: SpectrumType.Mono, label: 'Mono', gradient: 'linear-gradient(to right, rgb(102,97,92), rgb(179,170,161), rgb(255,242,230))' },
		{ value: SpectrumType.Inferno, label: 'Inferno', gradient: 'linear-gradient(to right, rgb(0,0,4), rgb(87,16,110), rgb(188,55,84), rgb(249,142,9), rgb(252,255,164))' },
		{ value: SpectrumType.Viridis, label: 'Viridis', gradient: 'linear-gradient(to right, rgb(68,1,84), rgb(59,82,139), rgb(33,145,140), rgb(94,201,98), rgb(253,231,37))' },
		{ value: SpectrumType.Magma, label: 'Magma', gradient: 'linear-gradient(to right, rgb(0,0,4), rgb(81,18,124), rgb(183,55,121), rgb(254,159,109), rgb(252,253,191))' },
		{ value: SpectrumType.Plasma, label: 'Plasma', gradient: 'linear-gradient(to right, rgb(13,8,135), rgb(126,3,168), rgb(204,71,120), rgb(248,149,64), rgb(240,249,33))' },
		{ value: SpectrumType.Turbo, label: 'Turbo', gradient: 'linear-gradient(to right, rgb(48,18,59), rgb(70,130,224), rgb(40,208,148), rgb(225,220,55), rgb(209,55,43))' },
		{ value: SpectrumType.Fire, label: 'Fire', gradient: 'linear-gradient(to right, rgb(0,0,0), rgb(127,0,0), rgb(255,100,0), rgb(255,220,50), rgb(255,255,200))' },
		{ value: SpectrumType.Sunset, label: 'Sunset', gradient: 'linear-gradient(to right, rgb(44,9,75), rgb(126,25,109), rgb(209,76,78), rgb(242,146,53), rgb(249,214,100))' }
	];

	const patternLabels: { value: DemoPattern; label: string }[] = [
		{ value: DemoPattern.Ripple, label: 'Ripple' },
		{ value: DemoPattern.Sweep, label: 'Sweep' },
		{ value: DemoPattern.Cascade, label: 'Cascade' },
		{ value: DemoPattern.Chladni, label: 'Chladni' },
		{ value: DemoPattern.Breathe, label: 'Breathe' }
	];

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
	let decayMs = $state(15);
	let freqMin = $state(120);
	let freqMax = $state(4000);
	let isOpen = $state(true);
	let fileInput: HTMLInputElement = $state(null!);

	// Accordion state — only one section open at a time
	let openSection = $state<'fluid' | 'plates' | 'audio-in' | 'audio-out' | 'colors'>('fluid');

	// Color UI state
	let showHueCurve = $state(false);
	let showSatCurve = $state(false);
	let showBrightCurve = $state(false);
	let spectrumDropdownOpen = $state(false);

	function toggleSection(section: typeof openSection) {
		openSection = section;
	}

	async function setAudioSource(source: 'none' | 'mic' | 'file') {
		if (source === 'none') {
			audioInput.stop();
			audioSource = 'none';
		} else if (source === 'mic') {
			try {
				await audioInput.startMicrophone();
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
		audioInput.loadFile(url).then(() => {
			audioSource = 'file';
		});
	}

	async function toggleAudioOutput() {
		if (audioOutEnabled) {
			audioOutput.stop();
			audioOutEnabled = false;
		} else {
			await audioOutput.start(simState.detectorCount, outputVolume);
			audioOutput.setDecay(decayMs / 1000);
			audioOutput.setFreqRange(freqMin, freqMax);
			audioOutEnabled = true;
		}
	}

	function handleVolumeChange(e: Event) {
		outputVolume = parseFloat((e.target as HTMLInputElement).value);
		audioOutput.setVolume(outputVolume);
	}

	function handleDecayChange(e: Event) {
		decayMs = parseFloat((e.target as HTMLInputElement).value);
		audioOutput.setDecay(decayMs / 1000);
	}

	function handleFreqMinChange(e: Event) {
		freqMin = parseInt((e.target as HTMLInputElement).value);
		if (freqMin >= freqMax) freqMax = freqMin + 100;
		audioOutput.setFreqRange(freqMin, freqMax);
	}

	function handleFreqMaxChange(e: Event) {
		freqMax = parseInt((e.target as HTMLInputElement).value);
		if (freqMax <= freqMin) freqMin = freqMax - 100;
		audioOutput.setFreqRange(freqMin, freqMax);
	}
</script>

<input type="file" accept="audio/*" class="hidden" bind:this={fileInput} onchange={handleFileSelect} />

<!-- Toggle button (always rendered, hidden when panel open) -->
<button
	class="toggle-btn"
	class:hidden={isOpen}
	onclick={() => isOpen = true}
	aria-label="Open controls"
>
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
		<circle cx="12" cy="12" r="3" />
		<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
	</svg>
</button>

<div class="panel" class:panel-closed={!isOpen}>
		<!-- Header -->
		<div class="panel-header">
			<span class="panel-title">Scattering Machine</span>
			<div class="header-actions">
				<button
					class="header-btn"
					class:active={simState.isPlaying}
					onclick={() => simState.isPlaying = !simState.isPlaying}
					title={simState.isPlaying ? 'Pause' : 'Play'}
				>
					{#if simState.isPlaying}
						<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>
					{/if}
				</button>
				<button
					class="header-btn"
					onclick={() => onReset?.()}
					title="Reset simulation"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<polyline points="1,4 1,10 7,10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
					</svg>
				</button>
				<button
					class="header-btn"
					onclick={() => isOpen = false}
					title="Close panel"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
		</div>

		<div class="header-divider"></div>

		<!-- Scrollable sections -->
		<div class="sections-scroll">

			<!-- ═══ FLUID ═══ -->
			<button class="section-header" onclick={() => toggleSection('fluid')}>
				<div class="section-title">
					<svg class="section-icon icon-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" opacity="0.4" /><circle cx="12" cy="12" r="10" opacity="0.2" />
					</svg>
					<span class="section-label">Fluid</span>
				</div>
				<svg class="section-chevron" class:open={openSection === 'fluid'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
			</button>

			{#if openSection === 'fluid'}
				<div class="section-content" transition:slide={{ duration: 150, easing: cubicOut }}>
					<div class="row">
						<span class="label">Particles</span>
						<input
							type="range" min="100" max="100000" step="100"
							value={simState.particleCount}
							oninput={(e) => simState.particleCount = parseInt(e.currentTarget.value)}
							class="slider"
						/>
						<span class="value">{simState.particleCount.toLocaleString()}</span>
					</div>
					<div class="row">
						<span class="label">Radius</span>
						<input
							type="range" min="1" max="10" step="0.5"
							value={simState.particleRadius}
							oninput={(e) => simState.particleRadius = parseFloat(e.currentTarget.value)}
							class="slider"
						/>
						<span class="value">{simState.particleRadius.toFixed(1)}</span>
					</div>
					<div class="row">
						<span class="label">Elasticity</span>
						<input
							type="range" min="0.5" max="1" step="0.01"
							value={simState.damping}
							oninput={(e) => simState.damping = parseFloat(e.currentTarget.value)}
							class="slider"
						/>
						<span class="value">{simState.damping.toFixed(2)}</span>
					</div>
					<div class="row">
						<span class="label">Stiffness</span>
						<input
							type="range" min="100" max="50000" step="100"
							value={simState.stiffness}
							oninput={(e) => simState.stiffness = parseInt(e.currentTarget.value)}
							class="slider"
						/>
						<span class="value">{simState.stiffness}</span>
					</div>
					<div class="row">
						<span class="label">Viscosity</span>
						<input
							type="range" min="0" max="200" step="1"
							value={simState.viscosity}
							oninput={(e) => simState.viscosity = parseInt(e.currentTarget.value)}
							class="slider"
						/>
						<span class="value">{simState.viscosity}</span>
					</div>
					<div class="row">
						<span class="label">Gravity</span>
						<input
							type="range" min="0" max="500" step="10"
							value={simState.gravity}
							oninput={(e) => simState.gravity = parseInt(e.currentTarget.value)}
							class="slider"
						/>
						<span class="value">{simState.gravity}</span>
					</div>
				</div>
			{/if}

			<div class="section-divider"></div>

			<!-- ═══ PLATES ═══ -->
			<div class="section-header" role="button" tabindex="0" onclick={() => toggleSection('plates')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('plates'); } }}>
				<div class="section-title">
					<svg class="section-icon icon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<rect x="3" y="10" width="3" height="10" rx="1" /><rect x="8" y="6" width="3" height="14" rx="1" /><rect x="13" y="8" width="3" height="12" rx="1" /><rect x="18" y="4" width="3" height="16" rx="1" />
					</svg>
					<span class="section-label">Plates</span>
				</div>
				<div class="section-right">
					<span
						class="toggle-chip"
						class:active={simState.platesVisible}
						role="button"
						tabindex="0"
						onclick={(e) => { e.stopPropagation(); simState.platesVisible = !simState.platesVisible; }}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); simState.platesVisible = !simState.platesVisible; } }}
					>
						{simState.platesVisible ? 'Visible' : 'Hidden'}
					</span>
					<svg class="section-chevron" class:open={openSection === 'plates'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
				</div>
			</div>

			{#if openSection === 'plates'}
				<div class="section-content" transition:slide={{ duration: 150, easing: cubicOut }}>
					<div class="row">
						<span class="label">Count</span>
						<input
							type="range" min="8" max="256" step="8"
							value={simState.plateCount}
							oninput={(e) => simState.plateCount = parseInt(e.currentTarget.value)}
							class="slider"
						/>
						<span class="value">{simState.plateCount}</span>
					</div>
					<div class="row">
						<span class="label">Reach</span>
						<input
							type="range" min="0.05" max="0.95" step="0.05"
							value={simState.plateReach}
							oninput={(e) => simState.plateReach = parseFloat(e.currentTarget.value)}
							class="slider"
						/>
						<span class="value">{Math.round(simState.plateReach * 100)}%</span>
					</div>
					<div class="row">
						<span class="label">Style</span>
						<div class="source-btns">
							<button
								class="source-btn"
								class:active={simState.plateStyle === PlateStyle.Bars}
								onclick={() => { simState.plateStyle = PlateStyle.Bars; }}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="source-icon"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="6" width="4" height="15" rx="1" /><rect x="17" y="9" width="4" height="12" rx="1" /></svg>
								Bars
							</button>
							<button
								class="source-btn"
								class:active={simState.plateStyle === PlateStyle.Curve}
								onclick={() => { simState.plateStyle = PlateStyle.Curve; }}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="source-icon"><path d="M3 20Q7 4 12 12Q17 20 21 4" stroke-linecap="round" /></svg>
								Curve
							</button>
						</div>
					</div>
					<div class="row">
						<span class="label">Pattern</span>
						<select
							class="channel-select"
							value={simState.demoPattern}
							onchange={(e) => { simState.demoPattern = parseInt(e.currentTarget.value); }}
						>
							{#each patternLabels as p (p.value)}
								<option value={p.value}>{p.label}</option>
							{/each}
						</select>
					</div>
				</div>
			{/if}

			<div class="section-divider"></div>

			<!-- ═══ AUDIO INPUT ═══ -->
			<button class="section-header" onclick={() => toggleSection('audio-in')}>
				<div class="section-title">
					<svg class="section-icon icon-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
					</svg>
					<span class="section-label">Audio In</span>
				</div>
				<div class="section-right">
					{#if audioSource !== 'none'}
						<span class="status-dot active"></span>
					{/if}
					<svg class="section-chevron" class:open={openSection === 'audio-in'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
				</div>
			</button>

			{#if openSection === 'audio-in'}
				<div class="section-content" transition:slide={{ duration: 150, easing: cubicOut }}>
					<div class="source-btns">
						<button
							class="source-btn" class:active={audioSource === 'none'}
							onclick={() => setAudioSource('none')}
						>Off</button>
						<button
							class="source-btn" class:active={audioSource === 'mic'}
							onclick={() => setAudioSource('mic')}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="source-icon">
								<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
							</svg>
							Mic
						</button>
						<button
							class="source-btn" class:active={audioSource === 'file'}
							onclick={() => setAudioSource('file')}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="source-icon">
								<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
							</svg>
							File
						</button>
					</div>
					{#if audioSource !== 'none'}
						<div class="sub-section" transition:slide={{ duration: 120, easing: cubicOut }}>
							<div class="row">
								<span class="label">Mode</span>
								<div class="source-btns">
									<button
										class="source-btn"
										class:active={simState.inputMode === InputMode.Frequency}
										onclick={() => { simState.inputMode = InputMode.Frequency; }}
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="source-icon"><rect x="3" y="12" width="3" height="9" rx="1" /><rect x="7" y="6" width="3" height="15" rx="1" /><rect x="11" y="9" width="3" height="12" rx="1" /><rect x="15" y="4" width="3" height="17" rx="1" /><rect x="19" y="10" width="3" height="11" rx="1" /></svg>
										Freq
									</button>
									<button
										class="source-btn"
										class:active={simState.inputMode === InputMode.TimeDomain}
										onclick={() => { simState.inputMode = InputMode.TimeDomain; }}
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="source-icon"><path d="M3 12Q6 4 9 12Q12 20 15 12Q18 4 21 12" stroke-linecap="round" /></svg>
										Wave
									</button>
								</div>
							</div>
							{#if simState.inputMode === InputMode.Frequency}
								<div class="row">
									<span class="label">Low freq</span>
									<input
										type="range" min="0" max="2000" step="10"
										value={simState.inputFreqMin}
										oninput={(e) => { simState.inputFreqMin = parseInt(e.currentTarget.value); if (simState.inputFreqMin >= simState.inputFreqMax) simState.inputFreqMax = simState.inputFreqMin + 100; }}
										class="slider"
									/>
									<span class="value">{simState.inputFreqMin}Hz</span>
								</div>
								<div class="row">
									<span class="label">High freq</span>
									<input
										type="range" min="500" max="22000" step="100"
										value={simState.inputFreqMax}
										oninput={(e) => { simState.inputFreqMax = parseInt(e.currentTarget.value); if (simState.inputFreqMax <= simState.inputFreqMin) simState.inputFreqMin = simState.inputFreqMax - 100; }}
										class="slider"
									/>
									<span class="value">{simState.inputFreqMax}Hz</span>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<div class="section-divider"></div>

			<!-- ═══ AUDIO OUTPUT ═══ -->
			<div class="section-header" role="button" tabindex="0" onclick={() => toggleSection('audio-out')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('audio-out'); } }}>
				<div class="section-title">
					<svg class="section-icon icon-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
					</svg>
					<span class="section-label">Audio Out</span>
				</div>
				<div class="section-right">
					<span
						class="toggle-chip"
						class:active={audioOutEnabled}
						role="button"
						tabindex="0"
						onclick={(e) => { e.stopPropagation(); toggleAudioOutput(); }}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleAudioOutput(); } }}
					>
						{audioOutEnabled ? 'On' : 'Off'}
					</span>
					<svg class="section-chevron" class:open={openSection === 'audio-out'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
				</div>
			</div>

			{#if openSection === 'audio-out'}
				<div class="section-content" transition:slide={{ duration: 150, easing: cubicOut }}>
					{#if audioOutEnabled}
						<div class="row">
							<span class="label">Volume</span>
							<input
								type="range" min="0" max="1" step="0.01"
								value={outputVolume}
								oninput={handleVolumeChange}
								class="slider"
							/>
							<span class="value">{(outputVolume * 100).toFixed(0)}%</span>
						</div>
						<div class="row">
							<span class="label">Decay</span>
							<input
								type="range" min="3" max="200" step="1"
								value={decayMs}
								oninput={handleDecayChange}
								class="slider"
							/>
							<span class="value">{decayMs}ms</span>
						</div>
						<div class="row">
							<span class="label">Low freq</span>
							<input
								type="range" min="20" max="2000" step="10"
								value={freqMin}
								oninput={handleFreqMinChange}
								class="slider"
							/>
							<span class="value">{freqMin}Hz</span>
						</div>
						<div class="row">
							<span class="label">High freq</span>
							<input
								type="range" min="500" max="12000" step="100"
								value={freqMax}
								oninput={handleFreqMaxChange}
								class="slider"
							/>
							<span class="value">{freqMax}Hz</span>
						</div>
					{:else}
						<div class="hint">Enable audio output to reveal controls</div>
					{/if}
				</div>
			{/if}

			<div class="section-divider"></div>

			<!-- ═══ COLORS (placeholder for future curve editors) ═══ -->
			<button class="section-header" onclick={() => toggleSection('colors')}>
				<div class="section-title">
					<svg class="section-icon icon-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<circle cx="13.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="10.5" r="2.5" /><circle cx="8.5" cy="7.5" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
					</svg>
					<span class="section-label">Colors</span>
				</div>
				<svg class="section-chevron" class:open={openSection === 'colors'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
			</button>

			{#if openSection === 'colors'}
				<div class="section-content" transition:slide={{ duration: 150, easing: cubicOut }}>
					<!-- Spectrum dropdown -->
					<div class="spectrum-dropdown-wrap">
						<button class="spectrum-dropdown-btn" onclick={() => spectrumDropdownOpen = !spectrumDropdownOpen}>
							<div class="spectrum-preview" style:background={spectrumLabels.find(s => s.value === simState.colorSpectrum)?.gradient}></div>
							<span class="spectrum-name">{spectrumLabels.find(s => s.value === simState.colorSpectrum)?.label}</span>
							<svg class="spectrum-chevron" class:open={spectrumDropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
						</button>
						{#if spectrumDropdownOpen}
							<div class="spectrum-dropdown" transition:slide={{ duration: 120, easing: cubicOut }}>
								{#each spectrumLabels as s (s.value)}
									<button
										class="spectrum-option"
										class:active={simState.colorSpectrum === s.value}
										onclick={() => { simState.colorSpectrum = s.value; spectrumDropdownOpen = false; }}
									>
										<div class="spectrum-option-bar" style:background={s.gradient}></div>
										<span class="spectrum-option-label">{s.label}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Hue row -->
					<div class="color-channel-row">
						<span class="channel-label">Hue</span>
						<select class="channel-select" value={simState.hueSource} onchange={(e) => simState.hueSource = parseInt(e.currentTarget.value)}>
							{#each sourceLabels as s (s.value)}
								<option value={s.value}>{s.label}</option>
							{/each}
						</select>
						<button class="curve-toggle" class:active={showHueCurve} onclick={() => showHueCurve = !showHueCurve} title="Toggle curve editor">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20Q7 4 12 12Q17 20 21 4" /></svg>
						</button>
					</div>
					{#if simState.hueSource !== ColorSource.None}
						<div class="intensity-row" transition:slide={{ duration: 100, easing: cubicOut }}>
							<input
								type="range" min="0.1" max="10" step="0.1"
								value={simState.hueIntensity}
								oninput={(e) => simState.hueIntensity = parseFloat(e.currentTarget.value)}
								class="slider intensity-slider"
							/>
							<span class="intensity-value">&times;{simState.hueIntensity.toFixed(1)}</span>
						</div>
					{/if}
					{#if showHueCurve}
						<div transition:slide={{ duration: 120, easing: cubicOut }}>
							<CurveEditor
								points={simState.hueCurvePoints}
								onPointsChange={(pts) => { simState.hueCurvePoints = pts; }}
								label="Hue Curve"
								type="hue"
								spectrum={simState.colorSpectrum}
							/>
						</div>
					{/if}

					<!-- Saturation row -->
					<div class="color-channel-row">
						<span class="channel-label">Sat</span>
						<select class="channel-select" value={simState.satSource} onchange={(e) => simState.satSource = parseInt(e.currentTarget.value)}>
							{#each sourceLabels as s (s.value)}
								<option value={s.value}>{s.label}</option>
							{/each}
						</select>
						<button class="curve-toggle" class:active={showSatCurve} onclick={() => showSatCurve = !showSatCurve} title="Toggle curve editor">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20Q7 4 12 12Q17 20 21 4" /></svg>
						</button>
					</div>
					{#if simState.satSource !== ColorSource.None}
						<div class="intensity-row" transition:slide={{ duration: 100, easing: cubicOut }}>
							<input
								type="range" min="0.1" max="10" step="0.1"
								value={simState.satIntensity}
								oninput={(e) => simState.satIntensity = parseFloat(e.currentTarget.value)}
								class="slider intensity-slider"
							/>
							<span class="intensity-value">&times;{simState.satIntensity.toFixed(1)}</span>
						</div>
					{/if}
					{#if showSatCurve}
						<div transition:slide={{ duration: 120, easing: cubicOut }}>
							<CurveEditor
								points={simState.satCurvePoints}
								onPointsChange={(pts) => { simState.satCurvePoints = pts; }}
								label="Saturation Curve"
								type="saturation"
								spectrum={simState.colorSpectrum}
							/>
						</div>
					{/if}

					<!-- Brightness row -->
					<div class="color-channel-row">
						<span class="channel-label">Bright</span>
						<select class="channel-select" value={simState.brightSource} onchange={(e) => simState.brightSource = parseInt(e.currentTarget.value)}>
							{#each sourceLabels as s (s.value)}
								<option value={s.value}>{s.label}</option>
							{/each}
						</select>
						<button class="curve-toggle" class:active={showBrightCurve} onclick={() => showBrightCurve = !showBrightCurve} title="Toggle curve editor">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20Q7 4 12 12Q17 20 21 4" /></svg>
						</button>
					</div>
					{#if simState.brightSource !== ColorSource.None}
						<div class="intensity-row" transition:slide={{ duration: 100, easing: cubicOut }}>
							<input
								type="range" min="0.1" max="10" step="0.1"
								value={simState.brightIntensity}
								oninput={(e) => simState.brightIntensity = parseFloat(e.currentTarget.value)}
								class="slider intensity-slider"
							/>
							<span class="intensity-value">&times;{simState.brightIntensity.toFixed(1)}</span>
						</div>
					{/if}
					{#if showBrightCurve}
						<div transition:slide={{ duration: 120, easing: cubicOut }}>
							<CurveEditor
								points={simState.brightCurvePoints}
								onPointsChange={(pts) => { simState.brightCurvePoints = pts; }}
								label="Brightness Curve"
								type="brightness"
								spectrum={simState.colorSpectrum}
							/>
						</div>
					{/if}
				</div>
			{/if}

		</div>
	</div>

<style>
	/* ─── Hidden utility ─── */
	.hidden {
		display: none !important;
	}

	/* ─── Toggle Button ─── */
	.toggle-btn {
		position: fixed;
		top: 12px;
		right: 12px;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		background: var(--bg-panel);
		border: 1px solid var(--border-muted);
		border-radius: 10px;
		color: var(--text-muted);
		cursor: pointer;
		backdrop-filter: blur(12px);
		transition:
			color var(--transition-normal),
			background var(--transition-normal),
			border-color var(--transition-normal);
	}
	.toggle-btn:hover {
		color: var(--text-primary);
		background: var(--bg-elevated);
		border-color: var(--border-default);
	}
	.toggle-btn svg {
		width: 16px;
		height: 16px;
	}

	/* ─── Panel ─── */
	.panel {
		position: fixed;
		top: 8px;
		right: 8px;
		z-index: 50;
		width: 264px;
		max-height: calc(100vh - 16px);
		display: flex;
		flex-direction: column;
		background: var(--bg-panel);
		border: 1px solid var(--border-subtle);
		border-radius: 14px;
		backdrop-filter: blur(16px);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		overflow: hidden;
		transform: translateX(0);
		opacity: 1;
		transition:
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
			opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.panel-closed {
		transform: translateX(280px);
		opacity: 0;
		pointer-events: none;
	}

	/* ─── Panel Header ─── */
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		flex-shrink: 0;
	}
	.panel-title {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-cyan) 50%, var(--accent-amber) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	.header-actions {
		display: flex;
		gap: 4px;
	}
	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: var(--bg-muted);
		border: 1px solid var(--border-subtle);
		border-radius: 7px;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color var(--transition-fast),
			background var(--transition-fast),
			border-color var(--transition-fast);
	}
	.header-btn:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
		border-color: var(--border-muted);
	}
	.header-btn.active {
		color: var(--accent-cyan);
		background: var(--accent-cyan-muted);
		border-color: rgba(34, 211, 238, 0.3);
	}
	.header-btn svg {
		width: 14px;
		height: 14px;
	}

	/* ─── Dividers ─── */
	.header-divider {
		height: 1px;
		background: var(--border-subtle);
		flex-shrink: 0;
	}
	.section-divider {
		height: 1px;
		background: var(--border-subtle);
		margin: 0;
	}

	/* ─── Scrollable area ─── */
	.sections-scroll {
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0 12px;
		flex: 1;
	}

	/* ─── Section Header ─── */
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: calc(100% + 24px);
		margin-left: -12px;
		padding: 9px 12px;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background var(--transition-normal);
	}
	.section-header:hover {
		background: var(--bg-subtle);
	}
	.section-title {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.section-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.section-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}
	.icon-blue { color: var(--accent-blue); }
	.icon-amber { color: var(--accent-amber); }
	.icon-green { color: var(--accent-green); }
	.icon-red { color: var(--accent-red); }
	.icon-purple { color: var(--accent-purple); }

	.section-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}
	.section-chevron {
		width: 14px;
		height: 14px;
		color: var(--text-subtle);
		transition: transform 0.2s ease;
		transform: rotate(-90deg);
		flex-shrink: 0;
	}
	.section-chevron.open {
		transform: rotate(0deg);
	}

	/* ─── Section Content ─── */
	.section-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 2px 0 6px;
	}

	/* ─── Row: label + slider + value ─── */
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 0;
	}
	.label {
		width: 56px;
		flex-shrink: 0;
		font-size: 10px;
		color: var(--text-muted);
	}
	.value {
		flex-shrink: 0;
		min-width: 40px;
		text-align: right;
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 9px;
		color: var(--text-subtle);
		white-space: nowrap;
	}

	/* ─── Styled Slider ─── */
	.slider {
		flex: 1;
		height: 4px;
		cursor: pointer;
		appearance: none;
		border-radius: 2px;
		background: linear-gradient(to right, rgba(161, 161, 170, 0.25), rgba(113, 113, 122, 0.15));
	}
	.slider::-webkit-slider-thumb {
		width: 14px;
		height: 14px;
		cursor: pointer;
		appearance: none;
		border-radius: 50%;
		background: rgb(10, 10, 16);
		border: 1.5px solid rgba(212, 212, 216, 0.7);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
		transition:
			transform var(--transition-fast),
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}
	.slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
		border-color: rgba(255, 255, 255, 0.9);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
	}
	.slider::-webkit-slider-thumb:active {
		transform: scale(1.2);
		border-color: #fff;
	}
	.slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		cursor: pointer;
		appearance: none;
		border-radius: 50%;
		background: rgb(10, 10, 16);
		border: 1.5px solid rgba(212, 212, 216, 0.7);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}
	.slider::-moz-range-thumb:active {
		border-color: #fff;
	}

	/* ─── Source Buttons (Audio In) ─── */
	.source-btns {
		display: flex;
		gap: 4px;
	}
	.source-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		padding: 6px 10px;
		font-size: 10px;
		font-weight: 500;
		color: var(--text-subtle);
		background: var(--bg-muted);
		border: 1px solid var(--border-subtle);
		border-radius: 6px;
		cursor: pointer;
		transition:
			color var(--transition-fast),
			background var(--transition-fast),
			border-color var(--transition-fast);
	}
	.source-btn:hover {
		color: var(--text-secondary);
		background: var(--bg-hover);
		border-color: var(--border-muted);
	}
	.source-btn.active {
		color: var(--accent-green);
		background: var(--accent-green-muted);
		border-color: rgba(52, 211, 153, 0.3);
	}
	.source-icon {
		width: 14px;
		height: 14px;
	}


	/* ─── Toggle Chip (Plates visible, Audio out) ─── */
	.toggle-chip {
		font-size: 9px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 4px;
		border: 1px solid var(--border-subtle);
		background: var(--bg-muted);
		color: var(--text-subtle);
		cursor: pointer;
		transition:
			color var(--transition-fast),
			background var(--transition-fast),
			border-color var(--transition-fast);
	}
	.toggle-chip:hover {
		color: var(--text-secondary);
		border-color: var(--border-muted);
	}
	.toggle-chip.active {
		color: var(--accent-cyan);
		background: var(--accent-cyan-muted);
		border-color: rgba(34, 211, 238, 0.3);
	}

	/* ─── Status Dot ─── */
	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-subtle);
	}
	.status-dot.active {
		background: var(--accent-green);
		box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
	}

	/* ─── Sub-section ─── */
	.sub-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 4px;
	}

	/* ─── Hint Text ─── */
	.hint {
		font-size: 9px;
		color: var(--text-subtle);
		padding: 6px 0;
		text-align: center;
	}

	/* ─── Color Controls ─── */

	/* Spectrum Dropdown */
	.spectrum-dropdown-wrap {
		position: relative;
		margin-bottom: 6px;
	}
	.spectrum-dropdown-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 5px 8px;
		background: var(--bg-muted);
		border: 1px solid var(--border-subtle);
		border-radius: 6px;
		cursor: pointer;
		transition: border-color var(--transition-fast);
	}
	.spectrum-dropdown-btn:hover {
		border-color: var(--border-muted);
	}
	.spectrum-preview {
		width: 48px;
		height: 14px;
		border-radius: 3px;
		flex-shrink: 0;
	}
	.spectrum-name {
		flex: 1;
		font-size: 10px;
		font-weight: 500;
		color: var(--text-secondary);
		text-align: left;
	}
	.spectrum-chevron {
		width: 12px;
		height: 12px;
		color: var(--text-subtle);
		transition: transform 0.15s ease;
		transform: rotate(-90deg);
		flex-shrink: 0;
	}
	.spectrum-chevron.open {
		transform: rotate(0deg);
	}
	.spectrum-dropdown {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 160px;
		overflow-y: auto;
		padding: 4px;
		margin-top: 4px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: 6px;
		backdrop-filter: blur(10px);
	}
	.spectrum-option {
		position: relative;
		display: flex;
		align-items: center;
		height: 20px;
		border-radius: 4px;
		border: 1.5px solid transparent;
		background: none;
		cursor: pointer;
		overflow: hidden;
		transition: border-color var(--transition-fast);
	}
	.spectrum-option:hover {
		border-color: var(--border-muted);
	}
	.spectrum-option.active {
		border-color: rgb(68, 170, 255);
	}
	.spectrum-option-bar {
		position: absolute;
		inset: 0;
		border-radius: 3px;
	}
	.spectrum-option-label {
		position: relative;
		z-index: 1;
		font-size: 9px;
		font-weight: 600;
		color: #fff;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
		padding: 0 6px;
	}

	/* H/S/B Channel Rows */
	.color-channel-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 0;
	}
	.channel-label {
		width: 36px;
		flex-shrink: 0;
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
	}
	.channel-select {
		flex: 1;
		padding: 3px 6px;
		font-size: 10px;
		color: var(--text-secondary);
		background: var(--bg-muted);
		border: 1px solid var(--border-subtle);
		border-radius: 5px;
		cursor: pointer;
		appearance: auto;
	}
	.channel-select:focus {
		outline: none;
		border-color: var(--accent-purple);
	}

	/* Curve Toggle Button */
	.curve-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		flex-shrink: 0;
		background: var(--bg-muted);
		border: 1px solid var(--border-subtle);
		border-radius: 5px;
		color: var(--text-subtle);
		cursor: pointer;
		transition:
			color var(--transition-fast),
			background var(--transition-fast),
			border-color var(--transition-fast);
	}
	.curve-toggle:hover {
		color: var(--text-secondary);
		border-color: var(--border-muted);
	}
	.curve-toggle.active {
		color: var(--accent-purple);
		background: var(--accent-purple-muted);
		border-color: rgba(167, 139, 250, 0.3);
	}
	.curve-toggle svg {
		width: 14px;
		height: 14px;
	}

	/* Intensity Row */
	.intensity-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 0 2px 36px;
	}
	.intensity-slider {
		flex: 1;
	}
	.intensity-value {
		flex-shrink: 0;
		min-width: 28px;
		text-align: right;
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 9px;
		color: var(--text-subtle);
	}
</style>
