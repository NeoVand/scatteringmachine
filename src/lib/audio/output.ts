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

	sendReadings(readings: Float32Array) {
		if (!this.workletNode || !this.ready) return;
		this.workletNode.port.postMessage(readings);
	}

	/** Immediately silence all ringing envelopes */
	clear() {
		if (!this.workletNode || !this.ready) return;
		this.workletNode.port.postMessage({ type: 'clear' });
	}

	/** Set decay time in seconds (e.g. 0.01 = 10ms, 0.1 = 100ms) */
	setDecay(seconds: number) {
		if (!this.workletNode || !this.ready) return;
		this.workletNode.port.postMessage({ type: 'setDecay', value: seconds });
	}

	/** Set frequency range for detector bin mapping */
	setFreqRange(min: number, max: number) {
		if (!this.workletNode || !this.ready) return;
		this.workletNode.port.postMessage({ type: 'setFreqRange', min, max });
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
