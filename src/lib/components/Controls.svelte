<script lang="ts">
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
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
	let decayMs = $state(15);
	let freqMin = $state(120);
	let freqMax = $state(4000);
	let isOpen = $state(true);
	let fileInput: HTMLInputElement = $state(null!);

	// Accordion state — only one section open at a time
	let openSection = $state<'fluid' | 'plates' | 'audio-in' | 'audio-out' | 'colors'>('fluid');

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
								<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
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
					<div class="hint">Curve editors for hue, saturation, and brightness coming soon.</div>
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
		gap: 4px;
		padding: 6px 0;
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
		width: 12px;
		height: 12px;
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
</style>
