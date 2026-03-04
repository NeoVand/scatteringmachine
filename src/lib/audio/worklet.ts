/**
 * AudioWorklet processor: detector impacts → short percussive pings.
 *
 * Each detector bin maps to a frequency. Impacts add energy to a decaying
 * envelope, producing short pings that die out quickly.
 */
class DetectorSynth extends AudioWorkletProcessor {
	private envelopes: Float32Array;
	private phases: Float32Array;
	private frequencies: Float32Array;
	private detectorCount: number;
	private decay: number;
	private minFreq: number;
	private maxFreq: number;

	constructor(options: AudioWorkletNodeOptions) {
		super();
		this.detectorCount = options.processorOptions?.detectorCount ?? 64;
		this.envelopes = new Float32Array(this.detectorCount);
		this.phases = new Float32Array(this.detectorCount);
		this.frequencies = new Float32Array(this.detectorCount);

		this.minFreq = 120;
		this.maxFreq = 4000;
		this.rebuildFrequencies();

		// Default ~15ms decay
		this.decay = Math.exp(-1 / (sampleRate * 0.015));

		this.port.onmessage = (e: MessageEvent) => {
			const msg = e.data;

			// Handle control messages
			if (msg && typeof msg === 'object' && msg.type) {
				if (msg.type === 'clear') {
					this.envelopes.fill(0);
					return;
				}
				if (msg.type === 'setDecay') {
					// msg.value is decay time in seconds
					this.decay = Math.exp(-1 / (sampleRate * msg.value));
					return;
				}
				if (msg.type === 'setFreqRange') {
					this.minFreq = msg.min;
					this.maxFreq = msg.max;
					this.rebuildFrequencies();
					return;
				}
				return;
			}

			// Float32Array = detector readings (impulses)
			const readings = msg as Float32Array;
			for (let i = 0; i < this.detectorCount && i < readings.length; i++) {
				const impact = Math.abs(readings[i]);
				if (impact > 0.5) {
					// Add impulse energy, cap per-bin envelope to prevent blowup
					this.envelopes[i] = Math.min(this.envelopes[i] + impact / 80.0, 1.5);
				}
			}
		};
	}

	private rebuildFrequencies() {
		for (let i = 0; i < this.detectorCount; i++) {
			const t = i / Math.max(1, this.detectorCount - 1);
			this.frequencies[i] = this.minFreq * Math.pow(this.maxFreq / this.minFreq, t);
		}
	}

	process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
		const output = outputs[0][0];
		if (!output) return true;

		const dt = 1 / sampleRate;
		const decay = this.decay;

		for (let s = 0; s < output.length; s++) {
			let sample = 0;

			for (let i = 0; i < this.detectorCount; i++) {
				if (this.envelopes[i] < 0.0001) {
					this.envelopes[i] = 0;
					continue;
				}

				sample += Math.sin(this.phases[i]) * this.envelopes[i];
				this.phases[i] += 2 * Math.PI * this.frequencies[i] * dt;
				this.envelopes[i] *= decay;
			}

			output[s] = sample * 0.1;
		}

		// Keep phases bounded
		for (let i = 0; i < this.detectorCount; i++) {
			if (this.phases[i] > 6.2832) {
				this.phases[i] -= 6.2832 * Math.floor(this.phases[i] / 6.2832);
			}
		}

		return true;
	}
}

registerProcessor('detector-synth', DetectorSynth);
