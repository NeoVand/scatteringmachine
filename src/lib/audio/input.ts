export class AudioInput {
	private ctx: AudioContext | null = null;
	private analyserL: AnalyserNode | null = null;
	private analyserR: AnalyserNode | null = null;
	private splitter: ChannelSplitterNode | null = null;
	private merger: ChannelMergerNode | null = null;
	private source: MediaStreamAudioSourceNode | AudioBufferSourceNode | MediaElementAudioSourceNode | null = null;
	private stream: MediaStream | null = null;
	private freqDataL: Float32Array = new Float32Array(0);
	private freqDataR: Float32Array = new Float32Array(0);
	private timeDataL: Float32Array = new Float32Array(0);
	private timeDataR: Float32Array = new Float32Array(0);
	private sourceChannels: number = 2;

	// File playback state
	private _audioBuffer: AudioBuffer | null = null;
	private _startOffset: number = 0;
	private _startedAt: number = 0;
	private _isFilePlaying: boolean = false;

	/** True when audio context is running (not suspended/closed) */
	get isActive(): boolean {
		return this.ctx !== null && this.ctx.state === 'running';
	}

	/** True when an audio source has been set up (even if paused) */
	get hasSource(): boolean {
		return this.analyserL !== null;
	}

	get sampleRate(): number {
		return this.ctx?.sampleRate ?? 44100;
	}

	/** Size of the analyser time-domain buffer (fftSize) */
	get bufferSize(): number {
		return this.analyserL?.fftSize ?? 32768;
	}

	/** True when a decoded audio file is available for playback */
	get hasFile(): boolean {
		return this._audioBuffer !== null;
	}

	/** True when a file is actively playing (not paused) */
	get isFilePlaying(): boolean {
		return this._isFilePlaying;
	}

	/** Duration of the loaded file in seconds */
	get fileDuration(): number {
		return this._audioBuffer?.duration ?? 0;
	}

	/** Current playback position in seconds */
	get filePosition(): number {
		if (!this._audioBuffer) return 0;
		if (this._isFilePlaying && this.ctx) {
			const elapsed = this.ctx.currentTime - this._startedAt;
			return (this._startOffset + elapsed) % this._audioBuffer.duration;
		}
		return this._startOffset % this._audioBuffer.duration;
	}

	private ensureContext(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext();
		}
		return this.ctx;
	}

	private setupAnalysers() {
		const ctx = this.ensureContext();

		this.analyserL = ctx.createAnalyser();
		this.analyserL.fftSize = 32768;
		this.analyserL.smoothingTimeConstant = 0.3;

		this.analyserR = ctx.createAnalyser();
		this.analyserR.fftSize = 32768;
		this.analyserR.smoothingTimeConstant = 0.3;

		this.splitter = ctx.createChannelSplitter(2);
		this.merger = ctx.createChannelMerger(2);

		this.freqDataL = new Float32Array(this.analyserL.frequencyBinCount);
		this.freqDataR = new Float32Array(this.analyserR.frequencyBinCount);
		this.timeDataL = new Float32Array(this.analyserL.fftSize);
		this.timeDataR = new Float32Array(this.analyserR.fftSize);
	}

	/** Connect source through splitter → per-channel analysers → merger → destination.
	 *  Handles mono sources by mirroring channel 0 to both analysers. */
	private connectStereoChain(connectToDestination: boolean) {
		if (!this.source || !this.splitter || !this.analyserL || !this.analyserR || !this.merger) return;
		const ctx = this.ensureContext();

		this.source.connect(this.splitter);
		this.splitter.connect(this.analyserL, 0); // left / mono channel

		if (this.sourceChannels >= 2) {
			this.splitter.connect(this.analyserR, 1); // right channel
		} else {
			// Mono: mirror channel 0 to both analysers
			this.splitter.connect(this.analyserR, 0);
		}

		if (connectToDestination) {
			// Recombine for playback
			this.analyserL.connect(this.merger, 0, 0);
			this.analyserR.connect(this.merger, 0, 1);
			this.merger.connect(ctx.destination);
		}
	}

	/** Disconnect and destroy the current source node without touching analysers/splitter/merger */
	private disconnectSource() {
		if (this.source) {
			if ('stop' in this.source && typeof this.source.stop === 'function') {
				try { this.source.stop(); } catch { /* already stopped */ }
			}
			this.source.disconnect();
			this.source = null;
		}
	}

	async startMicrophone(): Promise<void> {
		this.stop();
		this.setupAnalysers();

		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const ctx = this.ensureContext();
		this.source = ctx.createMediaStreamSource(this.stream);
		this.sourceChannels = this.stream.getAudioTracks()[0]?.getSettings()?.channelCount ?? 1;
		this.connectStereoChain(false); // mic doesn't need playback
	}

	async loadFile(url: string): Promise<void> {
		this.stop();
		this.setupAnalysers();

		const ctx = this.ensureContext();
		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();
		this._audioBuffer = await ctx.decodeAudioData(arrayBuffer);
		this.sourceChannels = this._audioBuffer.numberOfChannels;
		this._startOffset = 0;
		this.playFile();
	}

	/** Start or resume file playback from _startOffset */
	playFile() {
		if (!this._audioBuffer) return;
		const ctx = this.ensureContext();

		// Disconnect any existing source without tearing down the analyser chain
		this.disconnectSource();

		// Reconnect the analyser chain (splitter/merger may have been disconnected)
		this.analyserL?.disconnect();
		this.analyserR?.disconnect();
		this.splitter?.disconnect();
		this.merger?.disconnect();

		const source = ctx.createBufferSource();
		source.buffer = this._audioBuffer;
		source.loop = true;
		this.source = source;
		this.connectStereoChain(true);

		// Handle looping offset: modulo the duration
		const offset = this._startOffset % this._audioBuffer.duration;
		source.start(0, offset);
		this._startedAt = ctx.currentTime;
		this._isFilePlaying = true;

		// Ensure context is running
		if (ctx.state === 'suspended') {
			ctx.resume();
		}
	}

	/** Pause file playback, recording position for later resume */
	pauseFile() {
		if (!this._audioBuffer || !this._isFilePlaying) return;
		// Record where we are
		if (this.ctx) {
			const elapsed = this.ctx.currentTime - this._startedAt;
			this._startOffset = (this._startOffset + elapsed) % this._audioBuffer.duration;
		}
		this.disconnectSource();
		this._isFilePlaying = false;
	}

	/** Seek to a specific time (seconds). If playing, restarts from new position. */
	seekFile(time: number) {
		if (!this._audioBuffer) return;
		this._startOffset = Math.max(0, Math.min(time, this._audioBuffer.duration));
		if (this._isFilePlaying) {
			this.playFile();
		}
	}

	/** Restart file playback from the stored AudioBuffer (used when switching back to file source) */
	restartFile() {
		if (!this._audioBuffer) return;
		this.stop();
		this.setupAnalysers();
		this.sourceChannels = this._audioBuffer.numberOfChannels;
		this.playFile();
	}

	connectElement(element: HTMLAudioElement | HTMLVideoElement): void {
		this.stop();
		this.setupAnalysers();

		const ctx = this.ensureContext();
		this.source = ctx.createMediaElementSource(element);
		// MediaElement channels aren't known upfront; default to 2, Web Audio upmixes mono automatically
		this.sourceChannels = 2;
		this.connectStereoChain(true);
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

	/** Returns normalized FFT magnitude bins in [0, 1] range.
	 *  Left plates = left audio channel, right plates = right audio channel.
	 *  Each half: center = low frequency, edge = high frequency.
	 *  freqMin/freqMax control which Hz range maps to the plates. */
	getFrequencyData(plateCount: number, freqMin = 0, freqMax = 0): Float32Array {
		const output = new Float32Array(plateCount);
		if (!this.analyserL || !this.analyserR) return output;

		this.analyserL.getFloatFrequencyData(this.freqDataL);
		this.analyserR.getFloatFrequencyData(this.freqDataR);

		const srcBins = this.analyserL.frequencyBinCount;
		const nyquist = this.sampleRate / 2;
		if (freqMax <= 0) freqMax = nyquist;

		const binMin = Math.floor((freqMin / nyquist) * srcBins);
		const binMax = Math.min(Math.ceil((freqMax / nyquist) * srcBins), srcBins);
		const rangeBins = Math.max(1, binMax - binMin);

		const half = Math.floor(plateCount / 2);

		// Left half: left channel, index 0 = left edge (high freq), index half-1 = center (low freq)
		// Right half: right channel, index half = center (low freq), index plateCount-1 = right edge (high freq)
		for (let i = 0; i < half; i++) {
			const freqFrac = i / half; // 0 at center, 1 at edge
			const srcStart = binMin + Math.floor(freqFrac * rangeBins);
			const srcEnd = binMin + Math.floor(((i + 1) / half) * rangeBins);

			// Left channel
			let sumL = 0, countL = 0;
			for (let j = srcStart; j < srcEnd && j < binMax; j++) {
				sumL += this.freqDataL[j];
				countL++;
			}
			if (countL === 0) { sumL = this.freqDataL[Math.min(srcStart, srcBins - 1)]; countL = 1; }
			const avgDbL = sumL / countL;
			const valueL = avgDbL < -80 ? 0 : Math.max(0, Math.min(1, (avgDbL + 80) / 55));

			// Right channel
			let sumR = 0, countR = 0;
			for (let j = srcStart; j < srcEnd && j < binMax; j++) {
				sumR += this.freqDataR[j];
				countR++;
			}
			if (countR === 0) { sumR = this.freqDataR[Math.min(srcStart, srcBins - 1)]; countR = 1; }
			const avgDbR = sumR / countR;
			const valueR = avgDbR < -80 ? 0 : Math.max(0, Math.min(1, (avgDbR + 80) / 55));

			// Left half: high freq at left edge (index 0), low freq at center (index half-1)
			const leftIdx = half - 1 - i;
			if (leftIdx >= 0) output[leftIdx] = valueL;

			// Right half: low freq at center (index half), high freq at right edge
			const rightIdx = half + i;
			if (rightIdx < plateCount) output[rightIdx] = valueR;
		}

		return output;
	}

	/** Returns waveform amplitude mapped to plates in [0, 1] range.
	 *  Same stereo layout as getFrequencyData: left channel → left half, right → right half.
	 *  Waveform samples are in [-1, 1]; we use abs() for displacement.
	 *  timeStart/timeEnd are fractions [0, 1] of the buffer to window into. */
	getTimeDomainData(plateCount: number, timeStart = 0, timeEnd = 1): Float32Array {
		const output = new Float32Array(plateCount);
		if (!this.analyserL || !this.analyserR) return output;

		this.analyserL.getFloatTimeDomainData(this.timeDataL);
		this.analyserR.getFloatTimeDomainData(this.timeDataR);

		const srcLen = this.analyserL.fftSize;
		const half = Math.floor(plateCount / 2);

		// Window into a portion of the buffer
		const winStart = Math.floor(Math.max(0, Math.min(1, timeStart)) * srcLen);
		const winEnd = Math.floor(Math.max(0, Math.min(1, timeEnd)) * srcLen);
		const winLen = Math.max(1, winEnd - winStart);

		for (let i = 0; i < half; i++) {
			const srcStart = winStart + Math.floor((i / half) * winLen);
			const srcEnd = winStart + Math.floor(((i + 1) / half) * winLen);

			// Left channel
			let sumL = 0, countL = 0;
			for (let j = srcStart; j < srcEnd && j < winEnd; j++) {
				sumL += Math.abs(this.timeDataL[j]);
				countL++;
			}
			const valueL = countL > 0 ? Math.min(1, (sumL / countL) * 2.5) : 0;

			// Right channel
			let sumR = 0, countR = 0;
			for (let j = srcStart; j < srcEnd && j < winEnd; j++) {
				sumR += Math.abs(this.timeDataR[j]);
				countR++;
			}
			const valueR = countR > 0 ? Math.min(1, (sumR / countR) * 2.5) : 0;

			// Left half: index 0 = left edge, index half-1 = center
			const leftIdx = half - 1 - i;
			if (leftIdx >= 0) output[leftIdx] = valueL;

			// Right half: index half = center, index plateCount-1 = right edge
			const rightIdx = half + i;
			if (rightIdx < plateCount) output[rightIdx] = valueR;
		}

		return output;
	}

	stop() {
		this.disconnectSource();
		if (this.stream) {
			this.stream.getTracks().forEach((t) => t.stop());
			this.stream = null;
		}
		this.analyserL?.disconnect();
		this.analyserR?.disconnect();
		this.splitter?.disconnect();
		this.merger?.disconnect();
		this.analyserL = null;
		this.analyserR = null;
		this.splitter = null;
		this.merger = null;
		this._isFilePlaying = false;
	}

	/** Full stop including clearing the stored audio buffer */
	stopAndClear() {
		this.stop();
		this._audioBuffer = null;
		this._startOffset = 0;
	}

	destroy() {
		this.stopAndClear();
		if (this.ctx) {
			this.ctx.close();
			this.ctx = null;
		}
	}
}
