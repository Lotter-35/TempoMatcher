/**
 * Metronome — scheduling précis via Web Audio API
 * Utilise le pattern "look-ahead" pour une précision maximale.
 */
/* Profils sonores du clic */
const CLICK_PROFILES = {
  defaut: {
    loop:     { freq: 2500, duration: 0.06, type: 'square',   attack: 0.002, gain: 1.00 },
    downbeat: { freq: 1400, duration: 0.05, type: 'square',   attack: 0.003, gain: 0.55 },
    beat:     { freq:  880, duration: 0.04, type: 'square',   attack: 0.003, gain: 0.45 },
  },
  bois: {
    loop:     { freq: 1800, duration: 0.04, type: 'sawtooth', attack: 0.001, gain: 1.00 },
    downbeat: { freq: 1200, duration: 0.035,type: 'sawtooth', attack: 0.001, gain: 0.60 },
    beat:     { freq:  800, duration: 0.03, type: 'sawtooth', attack: 0.001, gain: 0.45 },
  },
  electro: {
    loop:     { freq: 3200, duration: 0.025,type: 'square',   attack: 0.001, gain: 1.00 },
    downbeat: { freq: 1600, duration: 0.020,type: 'square',   attack: 0.001, gain: 0.65 },
    beat:     { freq:  900, duration: 0.015,type: 'square',   attack: 0.001, gain: 0.50 },
  },
  doux: {
    loop:     { freq: 2000, duration: 0.09, type: 'sine',     attack: 0.005, gain: 1.00 },
    downbeat: { freq: 1200, duration: 0.07, type: 'sine',     attack: 0.005, gain: 0.60 },
    beat:     { freq:  700, duration: 0.06, type: 'sine',     attack: 0.005, gain: 0.45 },
  },
  cloche: {
    loop:     { freq: 2800, duration: 0.22, type: 'sine',     attack: 0.003, gain: 1.00 },
    downbeat: { freq: 1800, duration: 0.16, type: 'sine',     attack: 0.003, gain: 0.60 },
    beat:     { freq: 1100, duration: 0.12, type: 'sine',     attack: 0.003, gain: 0.45 },
  },
};

class Metronome {
  constructor() {
    this.bpm            = 120;
    this.beatsPerMeasure = 4;
    this.measuresPerLoop = 4;
    this.offset         = 0.0;   // décalage en secondes
    this.volume         = 1.0;
    this.enabled        = true;
    this.clickProfile   = 'defaut';

    // Scheduling look-ahead
    this._LOOKAHEAD_MS  = 25;    // intervalle de l'interval JS
    this._AHEAD_S       = 0.12;  // combien de secondes on planifie en avance

    this._audioCtx      = null;
    this._timerID       = null;
    this._isRunning     = false;

    // État de scheduling
    this._nextBeatAudioTime  = 0;   // prochain beat exprimé en audioCtx.currentTime
    this._nextBeatIndex      = 0;   // index absolu du prochain beat à planifier
    this._audioStartTime     = 0;   // audioCtx.currentTime au moment du start
    this._playbackStartPos   = 0;   // position song (s) au moment du start

    // Callback déclenché sur chaque beat (pour la visualisation)
    // fn(beatInMeasure: number, measureIdx: number, audioTime: number)
    this.onBeat = null;
  }

  /* ── Cycle ─────────────────────────────────────── */

  get beatInterval() { return 60 / this.bpm; }
  get totalBeats()   { return this.beatsPerMeasure * this.measuresPerLoop; }

  /**
   * Démarre le métronome.
   * @param {AudioContext} audioCtx
   * @param {number} audioStartTime   audioCtx.currentTime du début de lecture
   * @param {number} playbackStartPos position dans la chanson en secondes
   */
  start(audioCtx, audioStartTime, playbackStartPos) {
    this.stop();

    this._audioCtx         = audioCtx;
    this._audioStartTime   = audioStartTime;
    this._playbackStartPos = playbackStartPos;
    this._isRunning        = true;

    // Calculer l'index du premier beat à partir de playbackStartPos
    // beatTime(n) = offset + n * beatInterval
    // => n = (playbackStartPos - offset) / beatInterval
    const rawBeat = (playbackStartPos - this.offset) / this.beatInterval;
    const firstBeat = Math.max(0, Math.ceil(rawBeat - 0.001));

    this._nextBeatIndex     = firstBeat;
    this._nextBeatAudioTime = this._beatIndexToAudioTime(firstBeat);

    this._schedule();
  }

  stop() {
    this._isRunning = false;
    if (this._timerID !== null) {
      clearTimeout(this._timerID);
      this._timerID = null;
    }
  }

  /* ── Helpers ───────────────────────────────────── */

  /** Convertit un index de beat absolu en audioCtx time */
  _beatIndexToAudioTime(beatIndex) {
    const beatSongTime = this.offset + beatIndex * this.beatInterval;
    return this._audioStartTime + (beatSongTime - this._playbackStartPos);
  }

  /* ── Boucle de scheduling ───────────────────────── */

  _schedule() {
    if (!this._isRunning || !this._audioCtx) return;

    const now          = this._audioCtx.currentTime;
    const scheduleUntil = now + this._AHEAD_S;

    while (this._nextBeatAudioTime < scheduleUntil) {
      // Ne pas jouer les beats déjà passés (sauf très légèrement)
      if (this._nextBeatAudioTime >= now - 0.01) {
        const bi        = ((this._nextBeatIndex % this.totalBeats) + this.totalBeats) % this.totalBeats;
        const meas      = Math.floor(bi / this.beatsPerMeasure);
        const beatInM   = bi % this.beatsPerMeasure;
        const isLoopStart = (bi === 0);
        // Downbeat = début de mesure HORS début de boucle
        const isDownbeat  = (!isLoopStart && beatInM === 0);

        if (this.enabled) {
          this._fireClick(this._nextBeatAudioTime, isLoopStart, isDownbeat, beatInM);
        }

        if (this.onBeat) {
          this.onBeat(beatInM, meas, this._nextBeatAudioTime, this._nextBeatIndex);
        }
      }

      this._nextBeatIndex++;
      this._nextBeatAudioTime = this._beatIndexToAudioTime(this._nextBeatIndex);
    }

    this._timerID = setTimeout(() => this._schedule(), this._LOOKAHEAD_MS);
  }

  /* ── Génération du clic ─────────────────────────── */

  _fireClick(time, isLoopStart, isDownbeat, beatInMeasure) {
    if (!this._audioCtx) return;

    const osc = this._audioCtx.createOscillator();
    const env = this._audioCtx.createGain();

    osc.connect(env);
    env.connect(this._audioCtx.destination);

    // Sélection du profil et de la couche (loop / downbeat / beat)
    const profile = CLICK_PROFILES[this.clickProfile] || CLICK_PROFILES.defaut;
    const layer   = isLoopStart ? profile.loop : (isDownbeat ? profile.downbeat : profile.beat);

    osc.type = layer.type;
    osc.frequency.value = layer.freq;

    const peakGain = this.volume * layer.gain;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peakGain, time + layer.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, time + layer.duration);

    osc.start(time);
    osc.stop(time + layer.duration + 0.005);
  }

  /* ── Mise à jour à chaud ────────────────────────── */

  /** Recalcule la prochaine planification (appelé si BPM ou offset change pendant la lecture) */
  resync(audioCtx, audioStartTime, playbackStartPos) {
    const wasRunning = this._isRunning;
    this.stop();
    if (wasRunning) {
      this.start(audioCtx, audioStartTime, playbackStartPos);
    }
  }

  /* ── Utilitaire : positions des beats pour l'affichage ─ */

  /**
   * Retourne tous les beats dans la fenêtre [startSongTime, endSongTime].
   * @returns {Array<{time:number, beatInMeasure:number, measureIdx:number, isLoopStart:boolean}>}
   */
  getBeatPositions(startSongTime, endSongTime) {
    const result = [];
    if (this.bpm <= 0 || this.beatInterval <= 0) return result;

    const rawStart  = (startSongTime - this.offset) / this.beatInterval;
    const rawEnd    = (endSongTime   - this.offset) / this.beatInterval;
    const iStart    = Math.floor(rawStart);   // pas de Math.max(0) : on génère aussi les beats avant l'offset
    const iEnd      = Math.ceil(rawEnd);

    for (let i = iStart; i <= iEnd; i++) {
      const t = this.offset + i * this.beatInterval;
      if (t < 0 || t < startSongTime || t > endSongTime) continue;

      const bi          = ((i % this.totalBeats) + this.totalBeats) % this.totalBeats;
      const measureIdx  = Math.floor(bi / this.beatsPerMeasure);
      const beatInMeasure = bi % this.beatsPerMeasure;
      const isLoopStart = (bi === 0);

      result.push({ time: t, beatInMeasure, measureIdx, isLoopStart });
    }
    return result;
  }
}
