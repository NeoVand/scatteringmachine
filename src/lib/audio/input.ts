export class AudioInput {
	private ctx: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private source: MediaStreamAudioSourceNode | AudioBufferSourceNode | MediaElementAudioSourceNode | null = null;
	private stream: MediaStream | null = null;
	private freqData: Float32Array = new Float32Array(0);
	private binCount = 64;

	get isActive(): boolean {
		return this.ctx !== null && this.ctx.state === 'running';
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

	/** Returns normalized FFT magnitude bins in [0, 1] range, resampled to match plate count */
	getFrequencyData(plateCount: number): Float32Array {
		const output = new Float32Array(plateCount);
		if (!this.analyser) return output;

		this.analyser.getFloatFrequencyData(this.freqData);

		// freqData is in dB (typically -100 to 0)
		// Resample to plateCount bins and normalize to [0, 1]
		const srcBins = this.analyser.frequencyBinCount;
		for (let i = 0; i < plateCount; i++) {
			// Map plate index to frequency bin range
			const srcStart = Math.floor((i / plateCount) * srcBins);
			const srcEnd = Math.floor(((i + 1) / plateCount) * srcBins);
			let sum = 0;
			let count = 0;
			for (let j = srcStart; j < srcEnd && j < srcBins; j++) {
				sum += this.freqData[j];
				count++;
			}
			if (count === 0) {
				sum = this.freqData[Math.min(srcStart, srcBins - 1)];
				count = 1;
			}
			const avgDb = sum / count;
			// Normalize: -100dB → 0, -10dB → 1 (with clamp)
			output[i] = Math.max(0, Math.min(1, (avgDb + 100) / 90));
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
