export class AudioInput {
	private ctx: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private source: MediaStreamAudioSourceNode | AudioBufferSourceNode | MediaElementAudioSourceNode | null = null;
	private stream: MediaStream | null = null;
	private freqData: Float32Array = new Float32Array(0);
	private binCount = 64;

	/** True when audio context is running (not suspended/closed) */
	get isActive(): boolean {
		return this.ctx !== null && this.ctx.state === 'running';
	}

	/** True when an audio source has been set up (even if paused) */
	get hasSource(): boolean {
		return this.analyser !== null;
	}

	get sampleRate(): number {
		return this.ctx?.sampleRate ?? 44100;
	}

	private ensureContext(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext();
		}
		return this.ctx;
	}

	private setupAnalyser(fftSize: number) {
		const ctx = this.ensureContext();
		this.analyser = ctx.createAnalyser();
		// FFT size must be power of 2, at least 2x the bin count we want
		this.analyser.fftSize = fftSize;
		this.analyser.smoothingTimeConstant = 0.3;
		this.freqData = new Float32Array(this.analyser.frequencyBinCount);
	}

	async startMicrophone(binCount: number): Promise<void> {
		this.stop();
		this.binCount = binCount;

		const fftSize = nearestPow2(binCount * 2);
		this.setupAnalyser(fftSize);

		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const ctx = this.ensureContext();
		this.source = ctx.createMediaStreamSource(this.stream);
		this.source.connect(this.analyser!);
	}

	async loadFile(url: string, binCount: number): Promise<void> {
		this.stop();
		this.binCount = binCount;

		const fftSize = nearestPow2(binCount * 2);
		this.setupAnalyser(fftSize);

		const ctx = this.ensureContext();
		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();
		const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

		const source = ctx.createBufferSource();
		source.buffer = audioBuffer;
		source.loop = true;
		source.connect(this.analyser!);
		this.analyser!.connect(ctx.destination);
		source.start();
		this.source = source;
	}

	connectElement(element: HTMLAudioElement | HTMLVideoElement, binCount: number): void {
		this.stop();
		this.binCount = binCount;

		const fftSize = nearestPow2(binCount * 2);
		this.setupAnalyser(fftSize);

		const ctx = this.ensureContext();
		this.source = ctx.createMediaElementSource(element);
		this.source.connect(this.analyser!);
		this.analyser!.connect(ctx.destination);
	}

	/** Pause audio playback (suspend the AudioContext) */
	pause() {
		if (this.ctx && this.ctx.state === 'running') {
			this.ctx.suspend();
		}
	}

	/** Resume audio playback */
	resume() {
		if (this.ctx && this.ctx.state === 'suspended') {
			this.ctx.resume();
		}
	}

	/** Returns normalized FFT magnitude bins in [0, 1] range, symmetric layout:
	 *  center plates = low frequency, edges = high frequency (mirrored).
	 *  freqMin/freqMax control which Hz range maps to the plates. */
	getFrequencyData(plateCount: number, freqMin = 0, freqMax = 0): Float32Array {
		const output = new Float32Array(plateCount);
		if (!this.analyser) return output;

		this.analyser.getFloatFrequencyData(this.freqData);

		const srcBins = this.analyser.frequencyBinCount;
		const nyquist = this.sampleRate / 2;
		if (freqMax <= 0) freqMax = nyquist;

		// Convert freq range to bin range
		const binMin = Math.floor((freqMin / nyquist) * srcBins);
		const binMax = Math.min(Math.ceil((freqMax / nyquist) * srcBins), srcBins);
		const rangeBins = Math.max(1, binMax - binMin);

		// Symmetric mapping: center = freqMin, edges = freqMax
		const half = plateCount / 2;

		for (let i = 0; i < Math.ceil(half); i++) {
			const freqFrac = i / half; // 0 at center, 1 at edge
			const srcStart = binMin + Math.floor(freqFrac * rangeBins);
			const srcEnd = binMin + Math.floor(((i + 1) / half) * rangeBins);
			let sum = 0;
			let count = 0;
			for (let j = srcStart; j < srcEnd && j < binMax; j++) {
				sum += this.freqData[j];
				count++;
			}
			if (count === 0) {
				sum = this.freqData[Math.min(srcStart, srcBins - 1)];
				count = 1;
			}
			const avgDb = sum / count;
			// Noise floor cutoff: anything below -85dB is silence
			const value = avgDb < -85 ? 0 : Math.max(0, Math.min(1, (avgDb + 85) / 75));

			// Right half
			const rightIdx = Math.floor(half) + i;
			if (rightIdx < plateCount) output[rightIdx] = value;

			// Left half (mirror)
			const leftIdx = Math.floor(half) - 1 - i;
			if (leftIdx >= 0) output[leftIdx] = value;
		}

		return output;
	}

	stop() {
		if (this.source) {
			if ('stop' in this.source && typeof this.source.stop === 'function') {
				try { this.source.stop(); } catch { /* already stopped */ }
			}
			this.source.disconnect();
			this.source = null;
		}
		if (this.stream) {
			this.stream.getTracks().forEach((t) => t.stop());
			this.stream = null;
		}
		this.analyser?.disconnect();
		this.analyser = null;
	}

	destroy() {
		this.stop();
		if (this.ctx) {
			this.ctx.close();
			this.ctx = null;
		}
	}
}

function nearestPow2(n: number): number {
	let v = 32; // minimum FFT size
	while (v < n) v *= 2;
	return Math.min(v, 32768); // max FFT size
}
