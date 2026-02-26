/**
 * AudioEngine — chargement et lecture audio via Web Audio API
 */
class AudioEngine {
  constructor() {
    this._ctx          = null;    // AudioContext (lazy init)
    this._gainNode     = null;
    this._sourceNode   = null;
    this._audioBuffer  = null;

    this._isPlaying       = false;
    this._startAudioTime  = 0;    // audioCtx.currentTime au moment du start
    this._startPlaybackPos = 0;   // position song (s) au moment du start
    this._pausedAt        = 0;    // position song (s) lors du dernier pause

    this.volume = 0.8;

    this.loopEnabled = false;  // lecture en boucle

    // Callbacks
    this.onEnded       = null;    // fn()
    this.onLoop        = null;    // fn(info) — appelé si loop redémarre
    this.onTimeUpdate  = null;    // fn(currentTime)
    this.onLoading     = null;    // fn(progress 0-1)
    this.onLoaded      = null;    // fn(audioBuffer)
  }

  /* ── AudioContext lazy init ─────────────────────── */

  _ensureContext() {
    if (!this._ctx) {
      this._ctx      = new (window.AudioContext || window.webkitAudioContext)();
      this._gainNode = this._ctx.createGain();
      this._gainNode.connect(this._ctx.destination);
      this._gainNode.gain.value = this.volume;
    }
    return this._ctx;
  }

  get audioContext() { return this._ctx; }
  get audioBuffer()  { return this._audioBuffer; }
  get isPlaying()    { return this._isPlaying; }
  get duration()     { return this._audioBuffer ? this._audioBuffer.duration : 0; }

  /* ── Temps courant ──────────────────────────────── */

  get currentTime() {
    if (!this._isPlaying) return this._pausedAt;
    return this._startPlaybackPos + (this._ctx.currentTime - this._startAudioTime);
  }

  /* ── Chargement ─────────────────────────────────── */

  async loadFile(file) {
    this._ensureContext();

    if (this._isPlaying) this._stopSource();
    this._audioBuffer   = null;
    this._pausedAt      = 0;
    this._isPlaying     = false;

    if (this.onLoading) this.onLoading(0);

    const arrayBuffer = await file.arrayBuffer();
    if (this.onLoading) this.onLoading(0.5);

    let decoded;
    try {
      decoded = await this._ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      throw new Error('Impossible de décoder ce fichier audio : ' + err.message);
    }

    if (this.onLoading) this.onLoading(1);

    this._audioBuffer = decoded;
    if (this.onLoaded)  this.onLoaded(decoded);
  }

  /* ── Lecture ────────────────────────────────────── */

  /**
   * Démarre la lecture.
   * Retourne { audioStartTime, playbackStartPos } pour la sync du métronome.
   */
  play(fromTime = null) {
    if (!this._audioBuffer) return null;
    this._ensureContext();

    if (this._ctx.state === 'suspended') this._ctx.resume();
    if (this._isPlaying) this._stopSource();

    const pos = (fromTime !== null) ? fromTime : this._pausedAt;
    const clampedPos = Math.max(0, Math.min(this.duration, pos));

    const source = this._ctx.createBufferSource();
    source.buffer = this._audioBuffer;
    source.connect(this._gainNode);

    source.onended = () => {
      if (this._sourceNode === source) {
        this._isPlaying = false;
        if (this.loopEnabled) {
          // Redémarrage depuis le début
          const info = this.play(0);
          if (this.onLoop) this.onLoop(info);
        } else {
          this._pausedAt = 0;
          if (this.onEnded) this.onEnded();
        }
      }
    };

    // Lancer exactement maintenant
    const startAudioTime = this._ctx.currentTime;
    source.start(startAudioTime, clampedPos);

    this._sourceNode       = source;
    this._isPlaying        = true;
    this._startAudioTime   = startAudioTime;
    this._startPlaybackPos = clampedPos;

    return { audioStartTime: startAudioTime, playbackStartPos: clampedPos };
  }

  pause() {
    if (!this._isPlaying) return;
    this._pausedAt = this.currentTime;
    this._stopSource();
  }

  stop() {
    this._stopSource();
    this._pausedAt = 0;
  }

  seek(time) {
    const wasPlaying = this._isPlaying;
    if (wasPlaying) this._stopSource();
    this._pausedAt = Math.max(0, Math.min(this.duration, time));
    if (wasPlaying) return this.play(this._pausedAt);
    return null;
  }

  /* ── Volume ─────────────────────────────────────── */

  setVolume(v) {
    this.volume = v;
    if (this._gainNode) this._gainNode.gain.value = v;
  }

  /* ── Privé ──────────────────────────────────────── */

  _stopSource() {
    if (this._sourceNode) {
      try { this._sourceNode.stop(); } catch (_) {}
      this._sourceNode.onended = null;
      this._sourceNode = null;
    }
    this._isPlaying = false;
  }

  /** Retourne { audioStartTime, playbackStartPos } pour le métronome */
  getSyncInfo() {
    if (!this._isPlaying) return null;
    return {
      audioStartTime:    this._startAudioTime,
      playbackStartPos:  this._startPlaybackPos,
    };
  }
}
