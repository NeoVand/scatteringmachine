/**
 * AudioWorklet processor: detector impacts → short percussive pings.
 *
 * Each detector bin maps to a frequency. When a reading arrives (particle hit
 * the right wall), it adds energy to that bin's decaying envelope. The result
 * is a short "ping" that dies out quickly — like a struck marimba bar.
 */
class DetectorSynth extends AudioWorkletProcessor {
	private envelopes: Float32Array;
	private phases: Float32Array;
	private frequencies: Float32Array;
	private detectorCount: number;
	private decay: number;

	constructor(options: AudioWorkletNodeOptions) {
		super();
		this.detectorCount = options.processorOptions?.detectorCount ?? 64;
		this.envelopes = new Float32Array(this.detectorCount);
		this.phases = new Float32Array(this.detectorCount);

		// Map detector bins to frequencies (80Hz to 6000Hz, log-spaced)
		this.frequencies = new Float32Array(this.detectorCount);
		const minFreq = 80;
		const maxFreq = 6000;
		for (let i = 0; i < this.detectorCount; i++) {
			const t = i / Math.max(1, this.detectorCount - 1);
			this.frequencies[i] = minFreq * Math.pow(maxFreq / minFreq, t);
		}

		// Decay per sample: ~40ms decay time (amplitude drops to 1/e in 40ms)
		// decay = exp(-1 / (sampleRate * decayTime))
		this.decay = Math.exp(-1 / (sampleRate * 0.04));

		this.port.onmessage = (e: MessageEvent) => {
			const readings = e.data as Float32Array;
			for (let i = 0; i < this.detectorCount && i < readings.length; i++) {
				// Each reading is an impulse — add its energy to the envelope
				const impact = Math.abs(readings[i]);
				if (impact > 0.1) {
					// Scale impact to reasonable amplitude and ADD to envelope
					this.envelopes[i] += Math.min(impact / 50.0, 1.0);
				}
			}
		};
	}

	process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
		const output = outputs[0][0];
		if (!output) return true;

		const dt = 1 / sampleRate;
		const decay = this.decay;

		for (let s = 0; s < output.length; s++) {
			let sample = 0;

			for (let i = 0; i < this.detectorCount; i++) {
				if (this.envelopes[i] < 0.0001) continue;

				// Sine oscillator * decaying envelope
				sample += Math.sin(this.phases[i]) * this.envelopes[i];
				this.phases[i] += 2 * Math.PI * this.frequencies[i] * dt;

				// Exponential decay
				this.envelopes[i] *= decay;
			}

			output[s] = sample * 0.12;
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
