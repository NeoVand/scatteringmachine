/**
 * Audio output via AudioWorklet.
 * Receives detector readings (frequency-domain magnitudes) and synthesizes audio
 * using additive synthesis (sum of sine oscillators).
 */
export class AudioOutput {
	private ctx: AudioContext | null = null;
	private workletNode: AudioWorkletNode | null = null;
	private gainNode: GainNode | null = null;
	private ready = false;

	get isActive(): boolean {
		return this.ready;
	}

	async start(detectorCount: number, volume = 0.3): Promise<void> {
		this.stop();

		this.ctx = new AudioContext({ sampleRate: 44100 });
		await this.ctx.audioWorklet.addModule(
			new URL('./worklet.ts', import.meta.url).href
		);

		this.workletNode = new AudioWorkletNode(this.ctx, 'detector-synth', {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			outputChannelCount: [1],
			processorOptions: { detectorCount }
		});

		this.gainNode = this.ctx.createGain();
		this.gainNode.gain.value = volume;

		this.workletNode.connect(this.gainNode);
		this.gainNode.connect(this.ctx.destination);
		this.ready = true;
	}

	/** Send detector readings to the synth worklet */
	sendReadings(readings: Float32Array) {
		if (!this.workletNode || !this.ready) return;
		this.workletNode.port.postMessage(readings);
	}

	setVolume(v: number) {
		if (this.gainNode) {
			this.gainNode.gain.value = Math.max(0, Math.min(1, v));
		}
	}

	stop() {
		this.ready = false;
		this.workletNode?.disconnect();
		this.workletNode = null;
		this.gainNode?.disconnect();
		this.gainNode = null;
	}

	destroy() {
		this.stop();
		if (this.ctx) {
			this.ctx.close();
			this.ctx = null;
		}
	}
}
