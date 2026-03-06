<script lang="ts">
	import { type CurvePoint, type SpectrumType, monotonicCubicInterpolation } from '$lib/stores/simulation.svelte.js';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		points: CurvePoint[];
		onPointsChange: (points: CurvePoint[]) => void;
		label?: string;
		type?: 'hue' | 'saturation' | 'brightness';
		spectrum?: SpectrumType;
	}

	let {
		points,
		onPointsChange,
		label = 'Curve',
		type = 'brightness',
		spectrum = 0
	}: Props = $props();

	const width = 220;
	const height = 120;
	const padding = { top: 10, right: 4, bottom: 18, left: 4 };
	const plotWidth = width - padding.left - padding.right;
	const plotHeight = height - padding.top - padding.bottom;
	const visualInset = 6;

	let svgElement: SVGSVGElement | null = $state(null);
	let draggingIndex: number | null = $state(null);
	let hoverIndex: number | null = $state(null);
	let presetDropdownOpen = $state(false);

	function toSvgX(x: number): number {
		const innerWidth = plotWidth - visualInset * 2;
		return padding.left + visualInset + x * innerWidth;
	}

	function toSvgY(y: number): number {
		const innerHeight = plotHeight - visualInset * 2;
		return padding.top + visualInset + (1 - y) * innerHeight;
	}

	function fromSvgX(svgX: number): number {
		const innerWidth = plotWidth - visualInset * 2;
		return Math.max(0, Math.min(1, (svgX - padding.left - visualInset) / innerWidth));
	}

	function fromSvgY(svgY: number): number {
		const innerHeight = plotHeight - visualInset * 2;
		return Math.max(0, Math.min(1, 1 - (svgY - padding.top - visualInset) / innerHeight));
	}

	function isAnchorX(index: number): boolean {
		const p = points[index];
		return p.x === 0 || p.x === 1;
	}

	function getCurvePath(): string {
		if (points.length < 2) return '';
		const samples = 50;
		let path = '';
		for (let i = 0; i <= samples; i++) {
			const x = i / samples;
			const y = monotonicCubicInterpolation(points, x);
			const svgX = toSvgX(x);
			const svgY = toSvgY(y);
			path += i === 0 ? `M ${svgX} ${svgY}` : ` L ${svgX} ${svgY}`;
		}
		return path;
	}

	function getFillPath(): string {
		if (points.length < 2) return '';
		const samples = 50;
		const bottomY = toSvgY(0);
		let path = `M ${toSvgX(0)} ${bottomY}`;
		for (let i = 0; i <= samples; i++) {
			const x = i / samples;
			const y = monotonicCubicInterpolation(points, x);
			path += ` L ${toSvgX(x)} ${toSvgY(y)}`;
		}
		path += ` L ${toSvgX(1)} ${bottomY} Z`;
		return path;
	}

	function updateDragPosition(clientX: number, clientY: number) {
		if (draggingIndex === null || !svgElement) return;
		const rect = svgElement.getBoundingClientRect();
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		const svgX = (clientX - rect.left) * scaleX;
		const svgY = (clientY - rect.top) * scaleY;
		let newX = fromSvgX(svgX);
		const newY = fromSvgY(svgY);

		const sortedWithIndex = points
			.map((p, i) => ({ ...p, originalIndex: i }))
			.sort((a, b) => a.x - b.x);
		const sortedPos = sortedWithIndex.findIndex((p) => p.originalIndex === draggingIndex);

		if (!isAnchorX(draggingIndex)) {
			const prevPoint = sortedPos > 0 ? sortedWithIndex[sortedPos - 1] : null;
			const nextPoint = sortedPos < sortedWithIndex.length - 1 ? sortedWithIndex[sortedPos + 1] : null;
			const minX = prevPoint ? prevPoint.x + 0.02 : 0.02;
			const maxX = nextPoint ? nextPoint.x - 0.02 : 0.98;
			newX = Math.max(minX, Math.min(maxX, newX));
		} else {
			newX = points[draggingIndex].x;
		}

		const newPoints = [...points];
		newPoints[draggingIndex] = { x: newX, y: newY };
		onPointsChange(newPoints);
	}

	function handlePointMouseDown(index: number, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		draggingIndex = index;
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(e: MouseEvent) {
		updateDragPosition(e.clientX, e.clientY);
	}

	function handleMouseUp() {
		draggingIndex = null;
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	}

	function handlePointTouchStart(index: number, e: TouchEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (e.touches.length !== 1) return;
		draggingIndex = index;
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd);
		window.addEventListener('touchcancel', handleTouchEnd);
	}

	function handleTouchMove(e: TouchEvent) {
		e.preventDefault();
		if (e.touches.length !== 1) return;
		updateDragPosition(e.touches[0].clientX, e.touches[0].clientY);
	}

	function handleTouchEnd() {
		draggingIndex = null;
		window.removeEventListener('touchmove', handleTouchMove);
		window.removeEventListener('touchend', handleTouchEnd);
		window.removeEventListener('touchcancel', handleTouchEnd);
	}

	function handleSvgInteraction(clientX: number, clientY: number, isTouch: boolean) {
		if (!svgElement) return false;
		const rect = svgElement.getBoundingClientRect();
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		const svgX = (clientX - rect.left) * scaleX;
		const svgY = (clientY - rect.top) * scaleY;

		if (svgX < padding.left || svgX > width - padding.right || svgY < padding.top || svgY > height - padding.bottom) {
			return false;
		}

		const newX = fromSvgX(svgX);
		const newY = fromSvgY(svgY);

		const closePointIndex = points.findIndex((p) => Math.abs(p.x - newX) < 0.08);
		if (closePointIndex !== -1) {
			draggingIndex = closePointIndex;
			if (isTouch) {
				window.addEventListener('touchmove', handleTouchMove, { passive: false });
				window.addEventListener('touchend', handleTouchEnd);
				window.addEventListener('touchcancel', handleTouchEnd);
			} else {
				window.addEventListener('mousemove', handleMouseMove);
				window.addEventListener('mouseup', handleMouseUp);
			}
			return true;
		}

		const newPoints = [...points, { x: newX, y: newY }].sort((a, b) => a.x - b.x);
		const newIndex = newPoints.findIndex((p) => p.x === newX && p.y === newY);
		onPointsChange(newPoints);
		draggingIndex = newIndex;
		if (isTouch) {
			window.addEventListener('touchmove', handleTouchMove, { passive: false });
			window.addEventListener('touchend', handleTouchEnd);
			window.addEventListener('touchcancel', handleTouchEnd);
		} else {
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
		}
		return true;
	}

	function handleSvgMouseDown(e: MouseEvent) {
		handleSvgInteraction(e.clientX, e.clientY, false);
	}

	function handleSvgTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		e.preventDefault();
		handleSvgInteraction(e.touches[0].clientX, e.touches[0].clientY, true);
	}

	function handlePointDoubleClick(index: number, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (isAnchorX(index)) return;
		if (points.length <= 2) return;
		onPointsChange(points.filter((_, i) => i !== index));
	}

	function getPointRadius(index: number): number {
		if (draggingIndex === index) return 8;
		if (hoverIndex === index) return 7;
		return 6;
	}

	const presets = [
		{ id: 'linear', name: 'Linear', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] as CurvePoint[] },
		{ id: 'soft', name: 'S-curve', points: [{ x: 0, y: 0 }, { x: 0.25, y: 0.1 }, { x: 0.75, y: 0.9 }, { x: 1, y: 1 }] as CurvePoint[] },
		{ id: 'sqrt', name: 'Boost Low', points: [{ x: 0, y: 0 }, { x: 0.25, y: 0.5 }, { x: 1, y: 1 }] as CurvePoint[] },
		{ id: 'pow', name: 'Boost High', points: [{ x: 0, y: 0 }, { x: 0.75, y: 0.5 }, { x: 1, y: 1 }] as CurvePoint[] },
		{ id: 'inverted', name: 'Inverted', points: [{ x: 0, y: 1 }, { x: 1, y: 0 }] as CurvePoint[] }
	];

	function applyPreset(preset: (typeof presets)[0]) {
		onPointsChange([...preset.points]);
		presetDropdownOpen = false;
	}

	function getPresetPath(presetPoints: CurvePoint[]): string {
		const samples = 20;
		let path = '';
		for (let i = 0; i <= samples; i++) {
			const x = i / samples;
			const y = monotonicCubicInterpolation(presetPoints, x);
			const px = 2 + x * 32;
			const py = 2 + (1 - y) * 12;
			path += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
		}
		return path;
	}

	function hslToRgb(h: number, s: number, l: number): string {
		const c = (1 - Math.abs(2 * l - 1)) * s;
		const x = c * (1 - Math.abs((h * 6) % 2 - 1));
		const m = l - c / 2;
		let r = 0, g = 0, b = 0;
		const hue = h * 6;
		if (hue < 1) { r = c; g = x; }
		else if (hue < 2) { r = x; g = c; }
		else if (hue < 3) { g = c; b = x; }
		else if (hue < 4) { g = x; b = c; }
		else if (hue < 5) { r = x; b = c; }
		else { r = c; b = x; }
		return `rgb(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)})`;
	}

	function getSpectrumColor(t: number): string {
		const tt = Math.max(0, Math.min(1, t));
		// spectrum: 0=Rainbow, 1=Chrome, 2=Ocean, 3=Bands, 4=Mono
		if (spectrum === 0) {
			return hslToRgb(tt * 0.85, 0.85, 0.55);
		} else if (spectrum === 1) {
			let r: number, g: number, b: number;
			if (tt < 0.25) { const f = tt * 4; r = 0.2 + f * 0.1; g = 0.4 + f * 0.4; b = 0.9; }
			else if (tt < 0.5) { const f = (tt - 0.25) * 4; r = 0.3 + f * 0.65; g = 0.8 + f * 0.15; b = 0.9; }
			else if (tt < 0.75) { const f = (tt - 0.5) * 4; r = 0.95; g = 0.95 - f * 0.35; b = 0.9 - f * 0.7; }
			else { const f = (tt - 0.75) * 4; r = 0.95 - f * 0.05; g = 0.6 - f * 0.4; b = 0.2; }
			return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
		} else if (spectrum === 2) {
			let r: number, g: number, b: number;
			if (tt < 0.167) { const f = tt * 6; r = 0.3 - f * 0.05; g = 0.42 + f * 0.23; b = 0.78 - f * 0.08; }
			else if (tt < 0.333) { const f = (tt - 0.167) * 6; r = 0.25 + f * 0.1; g = 0.65 + f * 0.1; b = 0.7 - f * 0.15; }
			else if (tt < 0.5) { const f = (tt - 0.333) * 6; r = 0.35 + f * 0.57; g = 0.75 + f * 0.03; b = 0.55 - f * 0.2; }
			else if (tt < 0.667) { const f = (tt - 0.5) * 6; r = 0.92 - f * 0.04; g = 0.78 - f * 0.28; b = 0.35 + f * 0.1; }
			else if (tt < 0.833) { const f = (tt - 0.667) * 6; r = 0.88 - f * 0.23; g = 0.5 - f * 0.08; b = 0.45 + f * 0.2; }
			else { const f = (tt - 0.833) * 6; r = 0.65 - f * 0.35; g = 0.42; b = 0.65 + f * 0.13; }
			return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
		} else if (spectrum === 3) {
			const colors = [[230,51,77],[242,153,26],[242,230,51],[51,204,102],[51,153,230],[153,77,204]];
			const idx = Math.min(Math.floor(tt * 6), 5);
			return `rgb(${colors[idx][0]}, ${colors[idx][1]}, ${colors[idx][2]})`;
		} else {
			const brightness = 0.4 + tt * 0.6;
			return `rgb(${Math.round(brightness * 255)}, ${Math.round(brightness * 0.95 * 255)}, ${Math.round(brightness * 0.9 * 255)})`;
		}
	}

	function getGradientStops(): { offset: string; color: string }[] {
		if (type === 'hue') {
			const stops: { offset: string; color: string }[] = [];
			for (let i = 0; i <= 10; i++) {
				const t = i / 10;
				stops.push({ offset: `${t * 100}%`, color: getSpectrumColor(t) });
			}
			return stops;
		} else if (type === 'saturation') {
			return [
				{ offset: '0%', color: 'rgba(100,100,100,0.7)' },
				{ offset: '100%', color: 'rgba(80,160,255,0.7)' }
			];
		} else {
			return [
				{ offset: '0%', color: 'rgba(20,20,25,0.9)' },
				{ offset: '100%', color: 'rgba(255,250,245,0.7)' }
			];
		}
	}

	function getKnobColor(y: number): string {
		if (type === 'hue') {
			return getSpectrumColor(y);
		} else if (type === 'saturation') {
			const gray = 100 + y * 50;
			return `rgb(${Math.round(gray - y * 40)}, ${Math.round(gray)}, ${Math.round(150 + y * 105)})`;
		} else {
			const v = Math.round(60 + y * 195);
			return `rgb(${v}, ${v}, ${Math.round(v * 0.97)})`;
		}
	}

	const curvePath = $derived(getCurvePath());
	const fillPath = $derived(getFillPath());
	const gradientStops = $derived(getGradientStops());
	const instanceId = $derived(`curve-${label.toLowerCase().replace(/\s+/g, '-')}`);
</script>

<div class="curve-editor">
	<div class="header">
		<span class="curve-label">{label}</span>
		<div class="preset-dropdown">
			<button class="preset-btn" onclick={() => (presetDropdownOpen = !presetDropdownOpen)}>
				Presets
			</button>
			{#if presetDropdownOpen}
				<div class="preset-menu" transition:slide={{ duration: 100, easing: cubicOut }}>
					{#each presets as preset (preset.name)}
						<button class="preset-item" onclick={() => applyPreset(preset)}>
							<svg viewBox="0 0 36 16" class="preset-preview">
								<path d={getPresetPath(preset.points)} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
							{preset.name}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<svg
		bind:this={svgElement}
		{width}
		{height}
		viewBox="0 0 {width} {height}"
		class="curve-svg"
		role="application"
		tabindex="0"
		aria-label="Curve editor - click to add points, drag to adjust"
		onmousedown={handleSvgMouseDown}
		ontouchstart={handleSvgTouchStart}
	>
		<defs>
			<linearGradient id="{instanceId}-fill" x1="0%" y1="100%" x2="0%" y2="0%">
				{#each gradientStops as stop (stop.offset)}
					<stop offset={stop.offset} stop-color={stop.color} />
				{/each}
			</linearGradient>
			<linearGradient id="{instanceId}-stroke" x1="0%" y1="100%" x2="0%" y2="0%">
				{#each gradientStops as stop (stop.offset)}
					<stop offset={stop.offset} stop-color={stop.color} />
				{/each}
			</linearGradient>
			<filter id="{instanceId}-shadow" x="-100%" y="-100%" width="300%" height="300%">
				<feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.5)" />
			</filter>
		</defs>

		<rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="rgba(15,18,24,0.9)" rx="6" />

		<line x1={toSvgX(0.5)} y1={padding.top + 4} x2={toSvgX(0.5)} y2={height - padding.bottom - 4} stroke="rgba(255,255,255,0.04)" stroke-width="1" />
		<line x1={padding.left + 4} y1={toSvgY(0.5)} x2={width - padding.right - 4} y2={toSvgY(0.5)} stroke="rgba(255,255,255,0.04)" stroke-width="1" />

		<line x1={toSvgX(0)} y1={toSvgY(0)} x2={toSvgX(1)} y2={toSvgY(1)} stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="3,3" />

		<path d={fillPath} fill="url(#{instanceId}-fill)" opacity="0.5" />
		<path d={curvePath} fill="none" stroke="url(#{instanceId}-stroke)" stroke-width="6" stroke-linecap="round" opacity="0.35" />
		<path d={curvePath} fill="none" stroke="url(#{instanceId}-stroke)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

		{#each points as point, index (index)}
			{@const isActive = draggingIndex === index || hoverIndex === index}
			{@const r = getPointRadius(index)}
			{@const knobColor = getKnobColor(point.y)}
			<circle
				cx={toSvgX(point.x)}
				cy={toSvgY(point.y)}
				{r}
				fill={knobColor}
				stroke={isActive ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)'}
				stroke-width={isActive ? 2 : 1.5}
				filter="url(#{instanceId}-shadow)"
				class="control-point"
				class:active={isActive}
				role="button"
				tabindex="0"
				aria-label="Control point {index + 1}"
				onmousedown={(e) => handlePointMouseDown(index, e)}
				ontouchstart={(e) => handlePointTouchStart(index, e)}
				ondblclick={(e) => handlePointDoubleClick(index, e)}
				onmouseenter={() => hoverIndex = index}
				onmouseleave={() => hoverIndex = null}
			/>
		{/each}

		<text x={toSvgX(0)} y={height - 3} fill="rgba(255,255,255,0.25)" font-size="8" font-family="system-ui, sans-serif" text-anchor="middle">0</text>
		<text x={toSvgX(1)} y={height - 3} fill="rgba(255,255,255,0.25)" font-size="8" font-family="system-ui, sans-serif" text-anchor="middle">1</text>
	</svg>

	<div class="hint">click to add · double-click to remove</div>
</div>

<style>
	.curve-editor {
		background: rgba(0,0,0,0.15);
		border-radius: 8px;
		padding: 8px;
		margin-top: 6px;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.curve-label {
		font-size: 10px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.preset-dropdown {
		position: relative;
	}

	.preset-btn {
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 9px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.preset-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.7);
	}

	.preset-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		background: #1e2128;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 3px;
		z-index: 100;
		min-width: 100px;
		box-shadow: 0 6px 20px rgba(0,0,0,0.5);
	}

	.preset-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		background: none;
		border: none;
		padding: 5px 8px;
		font-size: 9px;
		color: rgba(255, 255, 255, 0.65);
		text-align: left;
		cursor: pointer;
		border-radius: 4px;
		transition: background 0.1s;
	}

	.preset-item:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.preset-preview {
		width: 28px;
		height: 12px;
		opacity: 0.5;
	}

	.preset-item:hover .preset-preview {
		opacity: 0.9;
	}

	.curve-svg {
		display: block;
		width: 100%;
		height: auto;
		cursor: crosshair;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
	}

	.control-point {
		cursor: grab;
		pointer-events: all;
	}

	.control-point.active {
		cursor: grabbing;
	}

	@media (pointer: coarse) {
		.control-point {
			stroke-width: 3px;
		}
	}

	.hint {
		font-size: 8px;
		color: rgba(255, 255, 255, 0.2);
		text-align: center;
		margin-top: 4px;
	}
</style>
