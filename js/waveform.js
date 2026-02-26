/**
 * WaveformRenderer — affichage de la forme d'onde sur canvas
 * - Zoom / pan à la molette et glisser-déposer
 * - Marqueurs de beats colorés
 * - Playhead animé
 * - Règle temporelle
 */
class WaveformRenderer {
  constructor(waveCanvas, rulerCanvas, metronome) {
    this.waveCanvas  = waveCanvas;
    this.rulerCanvas = rulerCanvas;
    this.wctx        = waveCanvas.getContext('2d');
    this.rctx        = rulerCanvas.getContext('2d');
    this.metronome   = metronome;

    this.audioBuffer  = null;
    this.duration     = 0;
    this._peaksMin    = null;   // Float32Array
    this._peaksMax    = null;   // Float32Array
    this._peakCount   = 0;

    // Vue : zoom et scroll
    this.zoom        = 1.0;    // 1 = tout affiché, >1 = zoomé
    this.scrollTime  = 0;      // temps de départ de la fenêtre visible (s)

    // Playhead
    this.playheadTime  = 0;
    this.isPlaying     = false;

    // Callbacks
    this.onSeek        = null;  // fn(time)

    // Couleurs des beats
    this.COLORS = {
      loopStart : '#ff3355',
      downbeat  : '#ff8800',
      beat2     : '#ffe033',
      beat3     : '#33dd88',
      beat4     : '#4499ff',
    };
    this.BEAT_COLORS = [
      null,           // index 0 = loopStart géré séparément
      this.COLORS.downbeat,
      this.COLORS.beat2,
      this.COLORS.beat3,
      this.COLORS.beat4,
    ];

    // Drag pan
    this._drag = { active: false, startX: 0, startScroll: 0, moved: false };

    // Bandes de groupes de boucles
    this.loopsPerGroup = 4;

    // Amplitude (zoom vertical)
    this.amplitudeScale = 0.5;

    // Couleur et opacité de la waveform
    this.waveColorFill   = '#1e3d5c';
    this.waveColorStroke = '#3d8edd';
    this.waveOpacity     = 1.0;

    // Visibilité des marqueurs de beats
    this.showLoopMarkers    = true;
    this.showMeasureMarkers = true;
    this.showBeatMarkers    = true;

    // Couleurs configurables des marqueurs
    this.markerColorLoop    = '#ff3355';
    this.markerColorMeasure = '#ff8800';
    this.markerColorBeat    = '#33dd88';

    this._animFrame = null;
    this._dirty     = true;

    this._setupListeners();
    this._startRenderLoop();
  }

  /* ── Initialisation ─────────────────────────────── */

  setAudio(audioBuffer) {
    this.audioBuffer = audioBuffer;
    this.duration    = audioBuffer.duration;
    this.zoom        = 1;
    this.scrollTime  = 0;
    this._computePeaks();
    this._dirty = true;
  }

  /** Pré-calcule les pics (min/max) à haute résolution */
  _computePeaks() {
    const buf      = this.audioBuffer;
    const sampleRate = buf.sampleRate;
    const totalSamples = buf.length;

    // Nombre cible de pics : 4× la largeur canvas
    // => bonne résolution à forte zoom
    const TARGET = Math.min(totalSamples, this._dpr() * this.waveCanvas.clientWidth * 8);
    const step   = Math.max(1, Math.floor(totalSamples / TARGET));
    const count  = Math.ceil(totalSamples / step);

    this._peaksMin   = new Float32Array(count);
    this._peaksMax   = new Float32Array(count);

    // Mixdown multicanal → mono
    const numChannels = buf.numberOfChannels;
    const channels    = [];
    for (let c = 0; c < numChannels; c++) channels.push(buf.getChannelData(c));

    for (let i = 0; i < count; i++) {
      let mn =  1, mx = -1;
      const start = i * step;
      const end   = Math.min(start + step, totalSamples);
      for (let j = start; j < end; j++) {
        let s = 0;
        for (const ch of channels) s += ch[j];
        s /= numChannels;
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }
      this._peaksMin[i] = mn;
      this._peaksMax[i] = mx;
    }

    this._peakCount = count;
  }

  /* ── Vue ────────────────────────────────────────── */

  get visibleDuration() {
    return this.duration / this.zoom;
  }

  get pixelsPerSecond() {
    return (this.waveCanvas.clientWidth || 1) / this.visibleDuration;
  }

  timeToX(time) {
    return (time - this.scrollTime) * this.pixelsPerSecond;
  }

  xToTime(x) {
    return x / this.pixelsPerSecond + this.scrollTime;
  }

  _clampScroll() {
    const maxScroll = this.duration - this.visibleDuration + this.visibleDuration * 0.9; // autorise scroll après la fin
    const minScroll = -this.visibleDuration * 0.9; // autorise un scroll avant t=0
    this.scrollTime = Math.max(minScroll, Math.min(this.scrollTime, maxScroll));
  }

  zoomIn(factor = 2, pivotTime = null) {
    if (pivotTime === null) pivotTime = this.scrollTime + this.visibleDuration / 2;
    this.zoom = Math.min(2000, this.zoom * factor);
    // Garder pivotTime au même x
    this.scrollTime = pivotTime - this.visibleDuration / 2;
    this._clampScroll();
    this._dirty = true;
  }

  zoomOut(factor = 2, pivotTime = null) {
    if (pivotTime === null) pivotTime = this.scrollTime + this.visibleDuration / 2;
    this.zoom = Math.max(0.1, this.zoom / factor);
    this.scrollTime = pivotTime - this.visibleDuration / 2;
    this._clampScroll();
    this._dirty = true;
  }

  zoomFit() {
    this.zoom       = 1;
    this.scrollTime = 0;
    this._dirty     = true;
  }

  /** Assure que le playhead reste visible (auto-scroll) */
  followPlayhead() {
    if (!this.isPlaying) return;
    if (this.zoom < 2.5) return; // pas d'auto-scroll en dessous de 250%
    const pht = this.playheadTime;
    const end = this.scrollTime + this.visibleDuration;

    // Si on approche du bord droit (> 85%), avancer le scroll
    if (pht > this.scrollTime + this.visibleDuration * 0.85) {
      this.scrollTime = pht - this.visibleDuration * 0.15;
      this._clampScroll();
      this._dirty = true;
    }
    // Si playhead est hors de vue à gauche
    if (pht < this.scrollTime) {
      this.scrollTime = Math.max(0, pht - this.visibleDuration * 0.1);
      this._dirty = true;
    }
  }

  /* ── Rendu ──────────────────────────────────────── */

  _dpr() { return window.devicePixelRatio || 1; }

  /** Resize le canvas si le conteneur a changé de taille */
  _syncSize() {
    const dpr = this._dpr();

    const W = this.waveCanvas.clientWidth;
    const H = this.waveCanvas.clientHeight;
    const rH = this.rulerCanvas.clientHeight;

    if (this.waveCanvas.width !== W * dpr || this.waveCanvas.height !== H * dpr) {
      this.waveCanvas.width  = W * dpr;
      this.waveCanvas.height = H * dpr;
      this.wctx.scale(dpr, dpr);
      this._dirty = true;
      // Recalc peaks si audio chargé
      if (this.audioBuffer) this._computePeaks();
    }

    if (this.rulerCanvas.width !== W * dpr || this.rulerCanvas.height !== rH * dpr) {
      this.rulerCanvas.width  = W * dpr;
      this.rulerCanvas.height = rH * dpr;
      this.rctx.scale(dpr, dpr);
      this._dirty = true;
    }
  }

  _startRenderLoop() {
    const loop = () => {
      this._syncSize();
      if (this._dirty || this.isPlaying) {
        this._draw();
        this._dirty = false;
      }
      this._animFrame = requestAnimationFrame(loop);
    };
    this._animFrame = requestAnimationFrame(loop);
  }

  _draw() {
    this._drawWaveform();
    this._drawRuler();
  }

  _drawWaveform() {
    const ctx = this.wctx;
    const W   = this.waveCanvas.clientWidth;
    const H   = this.waveCanvas.clientHeight;

    ctx.clearRect(0, 0, W, H);

    // Fond
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    if (!this.audioBuffer) return;

    // ── Bandes de 4 mesures alternées ──
    this._drawMeasureGroupBands(ctx, W, H);

    // Ligne centrale
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // ── Waveform ──
    this._drawWaveShape(ctx, W, H);

    // ── Marqueurs de beats ──
    this._drawBeatMarkers(ctx, W, H);

    // ── Début / fin du morceau ──
    this._drawBoundaryMarkers(ctx, W, H);

    // ── Playhead ──
    this._drawPlayhead(ctx, W, H);
  }

  _drawWaveShape(ctx, W, H) {
    if (!this._peaksMax) return;

    const visD   = this.visibleDuration;
    const pps    = W / visD;
    const midY   = H / 2;
    const hH     = (midY - 4) * this.amplitudeScale;  // zoom vertical

    ctx.globalAlpha = this.waveOpacity;
    ctx.fillStyle   = this.waveColorFill;
    ctx.strokeStyle = this.waveColorStroke;
    ctx.lineWidth   = 1;

    // On dessine pixel par pixel en interpolant les pics
    const startSec = this.scrollTime;
    const peakStep = this.duration / this._peakCount; // secondes par pic

    ctx.beginPath();
    let first = true;

    // Chemin supérieur (max) de gauche à droite
    for (let px = 0; px < W; px++) {
      const t = startSec + px / pps;
      if (t < 0 || t > this.duration) {
        // zone silencieuse : tracé à la ligne centrale
        const y = midY;
        if (first) { ctx.moveTo(px, y); first = false; }
        else        ctx.lineTo(px, y);
        continue;
      }
      const pi    = Math.min(this._peakCount - 1, Math.max(0, Math.floor(t / peakStep)));
      const piEnd = Math.min(this._peakCount - 1, Math.ceil((t + 1 / pps) / peakStep));

      let mx = this._peaksMax[pi];
      for (let k = pi; k <= piEnd; k++) {
        if (this._peaksMax[k] > mx) mx = this._peaksMax[k];
      }
      const y = midY - Math.min(mx * hH, midY);
      if (first) { ctx.moveTo(px, y); first = false; }
      else        ctx.lineTo(px, y);
    }

    // Chemin inférieur (min) de droite à gauche
    for (let px = W - 1; px >= 0; px--) {
      const t = startSec + px / pps;
      if (t < 0 || t > this.duration) {
        ctx.lineTo(px, midY);
        continue;
      }
      const pi    = Math.min(this._peakCount - 1, Math.max(0, Math.floor(t / peakStep)));
      const piEnd = Math.min(this._peakCount - 1, Math.ceil((t + 1 / pps) / peakStep));

      let mn = this._peaksMin[pi];
      for (let k = pi; k <= piEnd; k++) {
        if (this._peaksMin[k] < mn) mn = this._peaksMin[k];
      }
      const y = midY - Math.max(mn * hH, -midY);
      ctx.lineTo(px, y);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  _drawMeasureGroupBands(ctx, W, H) {
    if (!this.metronome || !this.audioBuffer) return;

    const bpm             = this.metronome.bpm;
    const beatsPerMeasure = this.metronome.beatsPerMeasure;
    const offset          = this.metronome.offset;
    if (bpm <= 0 || beatsPerMeasure <= 0) return;

    const secPerMeasure = (60 / bpm) * beatsPerMeasure;
    const secPerGroup   = secPerMeasure * this.metronome.measuresPerLoop * this.loopsPerGroup;

    const pps    = this.pixelsPerSecond;
    const startT = this.scrollTime;
    const endT   = startT + W / pps;

    // Indices de groupes absolus depuis l'offset (origine de la grille)
    const gStart = Math.floor((startT - offset) / secPerGroup) - 1;
    const gEnd   = Math.ceil((endT   - offset) / secPerGroup) + 1;

    const COLOR_A = 'rgba(255,255,255,0.055)';

    for (let g = gStart; g <= gEnd; g++) {
      // Modulo sûr pour les indices négatifs
      if (((g % 2) + 2) % 2 === 0) continue; // groupes pairs = fond normal

      const tStart = offset + g * secPerGroup;
      const tEnd   = Math.min(this.duration, tStart + secPerGroup);
      if (tEnd <= 0 || tStart >= this.duration) continue;

      // Ne pas afficher avant le début du morceau ni avant le début de la grille (offset)
      const tStartClamped = Math.max(0, offset, tStart);
      const cx0 = Math.max(0, (tStartClamped - startT) * pps);
      const cx1 = Math.min(W, (tEnd          - startT) * pps);
      if (cx1 <= cx0) continue;

      ctx.fillStyle   = COLOR_A;
      ctx.globalAlpha = 1;
      ctx.fillRect(cx0, 0, cx1 - cx0, H);
    }
    ctx.globalAlpha = 1;
  }

  _drawBeatMarkers(ctx, W, H) {
    if (!this.audioBuffer) return;
    if (!this.showLoopMarkers && !this.showMeasureMarkers && !this.showBeatMarkers) return;

    const startT = this.scrollTime;
    const endT   = this.scrollTime + this.visibleDuration;
    const beats  = this.metronome.getBeatPositions(startT, endT);
    const pps    = this.pixelsPerSecond;

    for (const b of beats) {
      if (b.time > this.duration) continue;  // ne pas dépasser la fin du morceau
      const x = (b.time - startT) * pps;
      if (x < 0 || x > W) continue;

      let color, lineH, lineW;

      if (b.isLoopStart) {
        if (!this.showLoopMarkers) continue;
        color = this.markerColorLoop; lineH = H; lineW = 2;
      } else if (b.beatInMeasure === 0) {
        if (!this.showMeasureMarkers) continue;
        color = this.markerColorMeasure; lineH = H * 0.85; lineW = 1.5;
      } else {
        if (!this.showBeatMarkers) continue;
        color  = this.markerColorBeat;
        lineH  = Math.min(H, H * 0.6 * this.amplitudeScale);
        lineW  = 1;
      }

      const alpha = b.isLoopStart ? 0.9 : (b.beatInMeasure === 0 ? 0.75 : 0.55);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth   = lineW;
      ctx.beginPath();
      ctx.moveTo(x, (H - lineH) / 2);
      ctx.lineTo(x, (H + lineH) / 2);
      ctx.stroke();

      // Étiquette numéro de mesure au début de chaque mesure
      if (b.beatInMeasure === 0) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle   = color;
        ctx.font        = '10px monospace';
        ctx.textAlign   = 'left';
        const measureNum = b.measureIdx + 1;
        ctx.fillText(`M${measureNum}`, x + 3, 11);
      }
    }

    ctx.globalAlpha = 1;
  }

  _drawBoundaryMarkers(ctx, W, H) {
    const boundaries = [
      { time: 0,             color: '#ffffff', label: 'DEBUT' },
      { time: this.duration, color: '#ffffff', label: 'FIN' },
    ];

    for (const { time, color, label } of boundaries) {
      const x = this.timeToX(time);
      if (x < -2 || x > W + 2) continue;

      // Trait vertical pleine hauteur
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Étiquette
      ctx.globalAlpha = 0.9;
      ctx.fillStyle   = color;
      ctx.font        = 'bold 11px monospace';
      ctx.textAlign   = time === 0 ? 'left' : 'right';
      ctx.fillText(label, time === 0 ? x + 4 : x - 4, H - 6);
      ctx.restore();
    }
  }

  _drawPlayhead(ctx, W, H) {
    const x = this.timeToX(this.playheadTime);
    if (x < 0 || x > W) return;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();

    // Triangle en haut
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x, 8);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  /* ── Règle ──────────────────────────────────────── */

  _drawRuler() {
    const ctx = this.rctx;
    const W   = this.rulerCanvas.clientWidth;
    const H   = this.rulerCanvas.clientHeight;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    if (!this.audioBuffer) return;

    ctx.fillStyle   = '#555';
    ctx.strokeStyle = '#444';
    ctx.font        = '9px monospace';
    ctx.textAlign   = 'left';

    const visD = this.visibleDuration;
    const pps  = W / visD;

    // Choisir un bon intervalle de ticks
    const niceIntervals = [
      0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5,
      1, 2, 5, 10, 15, 30, 60, 120, 300
    ];
    const minPxBetweenTicks = 50;
    let interval = niceIntervals[niceIntervals.length - 1];
    for (const iv of niceIntervals) {
      if (iv * pps >= minPxBetweenTicks) { interval = iv; break; }
    }

    const startT = this.scrollTime;
    const endT   = this.scrollTime + visD;
    const first  = Math.ceil(startT / interval) * interval;

    for (let t = first; t <= endT; t += interval) {
      const x = (t - startT) * pps;
      ctx.strokeStyle = '#333';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();

      ctx.fillStyle = '#555';
      ctx.fillText(this._formatTime(t), x + 3, H - 4);
    }

    // Sub-ticks
    const subInterval = interval / 4;
    if (subInterval * pps > 8) {
      const subFirst = Math.ceil(startT / subInterval) * subInterval;
      for (let t = subFirst; t <= endT; t += subInterval) {
        // Sauter les ticks principaux
        if (Math.abs(t % interval) < 1e-9) continue;
        const x = (t - startT) * pps;
        ctx.strokeStyle = '#222';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(x, H / 2);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
    }

    // Playhead sur la règle
    const phX = (this.playheadTime - startT) * pps;
    if (phX >= 0 && phX <= W) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(phX - 0.5, 0, 1, H);
    }
  }

  /* ── Interactions souris ────────────────────────── */

  _setupListeners() {
    const wc = this.waveCanvas;
    const rc = this.rulerCanvas;

    // Clic pour seek
    wc.addEventListener('mousedown', (e) => this._onMouseDown(e));
    wc.addEventListener('mousemove', (e) => this._onMouseMove(e));
    wc.addEventListener('mouseup',   (e) => this._onMouseUp(e));
    wc.addEventListener('mouseleave',(e) => {
      // Annuler le drag sans seek quand le curseur sort
      if (this._drag.active) {
        this._drag.active = false;
        this._drag.moved  = false;
        this.waveCanvas.style.cursor = 'crosshair';
      }
    });

    rc.addEventListener('mousedown', (e) => this._onRulerClick(e));

    // Zoom à la molette
    wc.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    rc.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
  }

  _getClientX(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return e.clientX - rect.left;
  }

  _onMouseDown(e) {
    if (!this.audioBuffer) return;
    if (e.button === 0) {
      const x = this._getClientX(this.waveCanvas, e);
      this._drag.active      = true;
      this._drag.startX      = x;
      this._drag.startScroll = this.scrollTime;
      this._drag.moved       = false;
    }
  }

  _onMouseMove(e) {
    if (!this._drag.active) return;
    const x  = this._getClientX(this.waveCanvas, e);
    const dx = x - this._drag.startX;
    if (Math.abs(dx) > 5) {
      this._drag.moved    = true;
      const dt            = -dx / this.pixelsPerSecond;
      this.scrollTime     = this._drag.startScroll + dt;
      this._clampScroll();
      this._dirty         = true;
      this.waveCanvas.style.cursor = 'grabbing';
    }
  }

  _onMouseUp(e) {
    if (!this._drag.active) return;
    if (!this._drag.moved) {
      // Clic simple → seek
      const x = this._getClientX(this.waveCanvas, e);
      this._seekToX(x);
    }
    this._drag.active = false;
    this._drag.moved  = false;
    this.waveCanvas.style.cursor = 'crosshair';
  }

  _onRulerClick(e) {
    if (!this.audioBuffer) return;
    const x = this._getClientX(this.rulerCanvas, e);
    const t = this.xToTime(x);
    if (this.onSeek) this.onSeek(Math.max(0, Math.min(this.duration, t)));
  }

  _seekToX(x) {
    const t = this.xToTime(x);
    const clamped = Math.max(0, Math.min(this.duration, t));
    if (this.onSeek) this.onSeek(clamped);
  }

  _onWheel(e) {
    e.preventDefault();
    if (!this.audioBuffer) return;

    // Position du souris en temps
    const W   = this.waveCanvas.clientWidth;
    const x   = this._getClientX(this.waveCanvas, e);
    const tAtMouse = this.xToTime(x);

    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    if (e.deltaY < 0) this.zoomIn(1.25, tAtMouse);
    else               this.zoomOut(1.25, tAtMouse);
  }

  /* ── Helpers ────────────────────────────────────── */

  _formatTime(sec) {
    const m  = Math.floor(sec / 60);
    const s  = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    if (sec >= 60)
      return `${m}:${String(s).padStart(2,'0')}`;
    if (sec >= 1)
      return `${s}.${String(Math.floor((sec % 1) * 10))[0]}`;
    return `${(sec * 1000).toFixed(0)}ms`;
  }

  markDirty() { this._dirty = true; }
}
