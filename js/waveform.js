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
    this.autoFollow    = true;   // auto-scroll actif par défaut

    // Callbacks
    this.onSeek        = null;  // fn(time)
    this.onPinClick    = null;  // fn(pinIndex, screenX, screenY)
    this.onPinDragMove = null;  // fn(pinIndex)  — appelé pendant le drag

    // Marqueurs utilisateur (pins)
    this.pins          = [];    // [{time, color}]
    this.lockedPinTime = null;  // temps du pin dont la grille est verrouillée

    // Barre pointillée (dernier clic waveform)
    this.clickMarkerTime = null;

    // Drag d'un pin sur la règle
    this._pinDrag = { active: false, idx: -1, moved: false, startX: 0, currentTime: 0 };

    // Système de couleurs cyclées par angle d'or (écart ~137.5° entre consécutifs)
    this._pinNextHue = Math.floor(Math.random() * 360);

    // Survol du losange marker
    this._markerHovered = false;
    this._markerAnim    = 0;   // 0 = petit, 1 = grand (interpolé)

    // Animation halo du pin verrouillé
    this._lockPulse = 0;  // phase (0→360)

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

    // Mode pinceau
    this.paintBrushMode    = false;   // activé depuis app.js
    this.paintBrushColor   = '#ff8800';
    this._brushPainting    = false;
    this._brushErasing     = false;

    // Palette de sections [{id, color, name}]
    this.brushPalette      = [];
    this._paletteIdCounter = 0;
    this.onPaletteChange   = null;  // fn() → app.js re-rend la liste

    // Bandes de groupes de boucles
    this.loopsPerGroup  = 4;
    this.showLoopBands  = true;
    this.loopBandColor  = '#ffffff';

    // Amplitude (zoom vertical)
    this.amplitudeScale = 0.5;
    this.showWaveform   = true;   // afficher / masquer la forme d'onde

    // Couleur et opacité de la waveform
    this.waveColorFill   = '#1e3d5c';
    this.waveColorStroke = '#3d8edd';
    this.waveOpacity     = 1.0;

    // Opacités configurables par type de marqueur (0 → 1)
    // Valeurs par défaut = alpha de base utilisé à l'origine dans le code de dessin
    this.loopOpacity    = 0.90;  // était 0.9 hardcodé
    this.measureOpacity = 0.75;  // était 0.75 hardcodé
    this.beatOpacity    = 0.55;  // était 0.55 hardcodé
    this.bandOpacity    = 0.07;  // était 0.07 hardcodé

    // Outil pinceau : couleurs par index de mesure
    // Map<measureIdx: int, color: string>
    this.measureColors   = new Map();

    // Visibilité des marqueurs de beats
    this.showLoopMarkers    = true;
    this.showMeasureMarkers = true;
    this.showBeatMarkers    = true;

    // Hauteur relative des barres de mesure (0 → 1)
    this.measureBarHeight = 0.70;

    // Couleurs configurables des marqueurs
    this.markerColorLoop    = '#ff3355';
    this.markerColorMeasure = '#ff8800';
    this.markerColorBeat    = '#33dd88';

    // Hauteurs relatives des marqueurs (0 → 1 = 0% → 100% du canvas)
    this.loopBarHeight       = 1.0;  // boucle  : pleine hauteur
    this.beatBarHeight       = 0.10; // temps   : fraction de H (synchro amplitude)
    this.loopBandHeightScale = 1.0;  // bandes  : pleine hauteur

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
    if (!this.autoFollow) return;
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
    const ANIM_SPEED = 0.10; // pas par frame (~6 frames pour 60fps)
    const loop = () => {
      this._syncSize();

      // Avancer l'animation du losange
      const target = this._markerHovered ? 1 : 0;
      if (this._markerAnim !== target) {
        const dir   = target > this._markerAnim ? 1 : -1;
        this._markerAnim = Math.max(0, Math.min(1, this._markerAnim + dir * ANIM_SPEED));
        this._dirty = true;
      }

      // Avancer la pulsation du pin verrouillé
      if (this.lockedPinTime !== null) {
        this._lockPulse = (this._lockPulse + 2.5) % 360;
        this._dirty = true;
      }

      if (this._dirty || this.isPlaying || this._pinDrag.active) {
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

    // ── Waveform ──
    this._drawWaveShape(ctx, W, H);

    // Ligne centrale horizontale — axe du waveform sur toute la durée du morceau
    // Dessinée après le waveform pour rester visible par-dessus le remplissage
    ctx.save();
    if (this.audioBuffer) {
      const xStart = this.timeToX(0);
      const xEnd   = this.timeToX(this.audioBuffer.duration);
      ctx.strokeStyle = this.waveColorStroke;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(xStart, H / 2);
      ctx.lineTo(xEnd,   H / 2);
      ctx.stroke();
    }
    ctx.restore();

    // ── Marqueurs de beats ──
    this._drawBeatMarkers(ctx, W, H);

    // ── Début / fin du morceau ──
    this._drawBoundaryMarkers(ctx, W, H);

    // ── Barres pointillées des pins ──
    this._drawPinLinesOnWave(ctx, W, H);

    // ── Barre pointée (clic waveform ou drag de pin) ──
    this._drawClickMarkerOnWave(ctx, W, H);

    // ── Playhead ──
    this._drawPlayhead(ctx, W, H);
  }

  _drawPinLinesOnWave(ctx, W, H) {
    if (this.pins.length === 0) return;
    const startT = this.scrollTime;
    const pps    = this.pixelsPerSecond;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    for (const pin of this.pins) {
      const x = (pin.time - startT) * pps;
      if (x < -2 || x > W + 2) continue;
      ctx.strokeStyle = pin.color || '#ffffff';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawClickMarkerOnWave(ctx, W, H) {
    const t = this._pinDrag.active ? this._pinDrag.currentTime : this.clickMarkerTime;
    if (t === null) return;
    const x = (t - this.scrollTime) * this.pixelsPerSecond;
    if (x < 0 || x > W) return;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.50)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.restore();
  }

  _drawWaveShape(ctx, W, H) {
    if (!this._peaksMax) return;
    if (!this.showWaveform) return;

    // ── Couche de base : couleur par défaut ──
    this._drawWaveShapeColored(ctx, W, H, this.waveColorFill, this.waveColorStroke, null, null);

    // ── Couche pinceau : surcharge par mesure ──
    if (this.measureColors.size > 0) {
      const visibleMeasures = this._getVisibleMeasureRanges(W);
      for (const { measureIdx, xStart, xEnd } of visibleMeasures) {
        const color = this.measureColors.get(measureIdx);
        if (!color) continue;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const fill = `rgb(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)})`;
        ctx.save();
        ctx.beginPath();
        ctx.rect(xStart, 0, xEnd - xStart, H);
        ctx.clip();
        this._drawWaveShapeColored(ctx, W, H, fill, color, null, null);
        ctx.restore();
      }
    }
  }

  /**
   * Dessine la forme d'onde avec les couleurs données.
   * Si clipX0/clipX1 sont fournis, seule cette tranche est dessinée.
   */
  _drawWaveShapeColored(ctx, W, H, fillColor, strokeColor, clipX0, clipX1) {
    const visD     = this.visibleDuration;
    const pps      = W / visD;
    const midY     = H / 2;
    const hH       = (midY - 4) * this.amplitudeScale;
    const startSec = this.scrollTime;
    const peakStep = this.duration / this._peakCount;

    ctx.globalAlpha = this.waveOpacity;
    ctx.fillStyle   = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1;

    ctx.beginPath();
    let first = true;

    for (let px = 0; px < W; px++) {
      const t = startSec + px / pps;
      if (t < 0 || t > this.duration) {
        const y = midY;
        if (first) { ctx.moveTo(px, y); first = false; }
        else        ctx.lineTo(px, y);
        continue;
      }
      const pi    = Math.min(this._peakCount - 1, Math.max(0, Math.floor(t / peakStep)));
      const piEnd = Math.min(this._peakCount - 1, Math.ceil((t + 1 / pps) / peakStep));
      let mx = this._peaksMax[pi];
      for (let k = pi; k <= piEnd; k++) if (this._peaksMax[k] > mx) mx = this._peaksMax[k];
      const y = midY - Math.min(mx * hH, midY);
      if (first) { ctx.moveTo(px, y); first = false; }
      else        ctx.lineTo(px, y);
    }

    for (let px = W - 1; px >= 0; px--) {
      const t = startSec + px / pps;
      if (t < 0 || t > this.duration) { ctx.lineTo(px, midY); continue; }
      const pi    = Math.min(this._peakCount - 1, Math.max(0, Math.floor(t / peakStep)));
      const piEnd = Math.min(this._peakCount - 1, Math.ceil((t + 1 / pps) / peakStep));
      let mn = this._peaksMin[pi];
      for (let k = pi; k <= piEnd; k++) if (this._peaksMin[k] < mn) mn = this._peaksMin[k];
      const y = midY - Math.max(mn * hH, -midY);
      ctx.lineTo(px, y);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * Retourne l'index de mesure absolu pour un temps donné.
   * Les mesures sont numérotées depuis l'offset (peut être négatif).
   */
  getMeasureAtTime(time) {
    if (!this.metronome || this.metronome.bpm <= 0) return 0;
    const secPerMeasure = (60 / this.metronome.bpm) * this.metronome.beatsPerMeasure;
    return Math.floor((time - this.metronome.offset) / secPerMeasure);
  }

  /**
   * Retourne les limites temporelles d'une mesure donnée.
   */
  getMeasureTimeRange(measureIdx) {
    const secPerMeasure = (60 / this.metronome.bpm) * this.metronome.beatsPerMeasure;
    const tStart = this.metronome.offset + measureIdx * secPerMeasure;
    return { tStart, tEnd: tStart + secPerMeasure };
  }

  /**
   * Calcule les plages de mesures visibles avec leurs positions en pixels.
   * Retourne [{measureIdx, xStart, xEnd}]
   */
  _getVisibleMeasureRanges(W) {
    if (!this.metronome || this.metronome.bpm <= 0) return [];
    const secPerMeasure = (60 / this.metronome.bpm) * this.metronome.beatsPerMeasure;
    const pps           = this.pixelsPerSecond;
    const startT        = this.scrollTime;
    const endT          = startT + W / pps;

    const mStart = Math.floor((startT - this.metronome.offset) / secPerMeasure) - 1;
    const mEnd   = Math.ceil( (endT   - this.metronome.offset) / secPerMeasure) + 1;

    const result = [];
    for (let m = mStart; m <= mEnd; m++) {
      const tL = this.metronome.offset + m * secPerMeasure;
      const tR = tL + secPerMeasure;
      if (tR <= 0 || tL >= this.duration) continue;
      const xStart = Math.max(0,  (tL - startT) * pps);
      const xEnd   = Math.min(W,  (tR - startT) * pps);
      if (xEnd <= xStart) continue;
      result.push({ measureIdx: m, xStart, xEnd });
    }
    return result;
  }

  _drawMeasureGroupBands(ctx, W, H) {
    if (!this.metronome || !this.audioBuffer) return;
    if (!this.showLoopBands) return;

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

      ctx.fillStyle   = this.loopBandColor;
      ctx.globalAlpha = this.bandOpacity;
      const bandH = H * this.loopBandHeightScale;
      ctx.fillRect(cx0, (H - bandH) / 2, cx1 - cx0, bandH);
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
      if (b.time > this.duration) continue;
      const x = (b.time - startT) * pps;
      if (x < 0 || x > W) continue;

      // ── Système de fallback par priorité décroissante ──────────────
      // Tier 1 (rouge)  : marqueur de boucle
      // Tier 2 (orange) : début de mesure
      // Tier 3 (vert)   : temps intermédiaire
      // Si un tier est masqué, on dessine le tier inférieur visible suivant.

      let color, lineH, lineW, alpha;
      const isMeasureStart = b.beatInMeasure === 0;

      if (b.isLoopStart) {
        if (this.showLoopMarkers) {
          color = this.markerColorLoop; lineH = H * this.loopBarHeight; lineW = 2; alpha = this.loopOpacity;
        } else if (this.showMeasureMarkers) {
          color = this.markerColorMeasure; lineH = H * this.measureBarHeight; lineW = 1.5; alpha = this.measureOpacity;
        } else if (this.showBeatMarkers) {
          color = this.markerColorBeat; lineH = H * this.beatBarHeight * this.amplitudeScale * 2.0; lineW = 1; alpha = this.beatOpacity;
        } else {
          continue;
        }
      } else if (isMeasureStart) {
        if (this.showMeasureMarkers) {
          color = this.markerColorMeasure; lineH = H * this.measureBarHeight; lineW = 1.5; alpha = this.measureOpacity;
        } else if (this.showBeatMarkers) {
          color = this.markerColorBeat; lineH = H * this.beatBarHeight * this.amplitudeScale * 2.0; lineW = 1; alpha = this.beatOpacity;
        } else {
          continue;
        }
      } else {
        if (!this.showBeatMarkers) continue;
        color = this.markerColorBeat;
        lineH = H * this.beatBarHeight * this.amplitudeScale * 2.0;
        lineW = 1; alpha = this.beatOpacity;
      }

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth   = lineW;
      ctx.beginPath();
      ctx.moveTo(x, (H - lineH) / 2);
      ctx.lineTo(x, (H + lineH) / 2);
      ctx.stroke();

      // Étiquette (toujours avec la couleur effective du tier affiché)
      if (isMeasureStart || b.isLoopStart) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle   = color;
        ctx.textAlign   = 'left';

        if (b.isLoopStart) {
          // Numéro de boucle calculé depuis le temps absolu
          const loopDuration = this.metronome.totalBeats * this.metronome.beatInterval;
          const loopNum = loopDuration > 0
            ? Math.floor((b.time - this.metronome.offset) / loopDuration) + 1
            : 1;
          ctx.font = '9px monospace';
          ctx.fillText(`B${loopNum}`, x + 3, 11);
        } else {
          // "MN" — numéro de mesure classique
          ctx.font = '10px monospace';
          ctx.fillText(`M${b.measureIdx + 1}`, x + 3, 11);
        }
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

  _drawSectionLabels(ctx, W, H) {
    // Dessiné dans le canvas de la règle : position y = haut de la règle
    if (this.measureColors.size === 0 || this.brushPalette.length === 0) return;

    const visibleMeasures = this._getVisibleMeasureRanges(W);
    if (visibleMeasures.length === 0) return;

    ctx.save();
    ctx.font      = 'bold 9px monospace';
    ctx.textAlign = 'left';

    for (const { measureIdx, xStart } of visibleMeasures) {
      const color = this.measureColors.get(measureIdx);
      if (!color) continue;

      // Première mesure d'une section : couleur différente de la précédente
      const prevColor = this.measureColors.get(measureIdx - 1);
      if (prevColor === color) continue;

      const entry = this.brushPalette.find(e => e.color === color);
      if (!entry || !entry.name) continue;

      const label   = entry.name.toUpperCase();
      const x       = xStart + 3;
      const y       = 9; // haut de la règle (24px hauteur)

      const metrics = ctx.measureText(label);
      const tw      = metrics.width + 6;

      // Petit rectangle coloré fond
      ctx.globalAlpha = 0.85;
      ctx.fillStyle   = color;
      ctx.fillRect(x - 2, y - 8, tw, 11);

      // Texte blanc
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#000';
      ctx.fillText(label, x, y);
    }
    ctx.restore();
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

    // Barre pointillée du marqueur de clic
    if (!this._pinDrag.active && this.clickMarkerTime !== null) {
      const cx = (this.clickMarkerTime - startT) * pps;
      if (cx >= -12 && cx <= W + 12) {
        // Trait pointillé blanc
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
        ctx.stroke();
        ctx.restore();
        // Losange animé au survol
        const t  = this._markerAnim;
        const s  = 5 + 3 * t;                         // 5 → 8
        const blur = 7 + 5 * t;                        // 7 → 12
        const cy = H / 2;
        ctx.fillStyle   = 'rgba(255,220,80,0.90)';
        ctx.shadowColor = 'rgba(255,200,40,0.70)';
        ctx.shadowBlur  = blur;
        ctx.beginPath();
        ctx.moveTo(cx,     cy - s);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx,     cy + s);
        ctx.lineTo(cx - s, cy);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Barres pointillées pour chaque pin sur la règle
    if (this.pins.length > 0) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      for (const pin of this.pins) {
        const cx = (pin.time - startT) * pps;
        if (cx < -2 || cx > W + 2) continue;
        ctx.strokeStyle = pin.color || '#ffffff';
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Labels de sections pinceau (en haut de la règle, avant les pins)
    this._drawSectionLabels(ctx, W, H);

    // Pins utilisateur
    this._drawPins(ctx, W, H);
  }

  _drawPins(ctx, W, H) {
    const startT = this.scrollTime;
    const pps    = this.pixelsPerSecond;
    const r      = 7;          // rayon de la partie circulaire
    const cY     = H - r - 1; // centre du cercle (bas)
    const tipY   = 1;          // pointe haute

    for (const pin of this.pins) {
      const x      = (pin.time - startT) * pps;
      if (x < -r - 4 || x > W + r + 4) continue;

      const locked = (pin.time === this.lockedPinTime);
      const color  = pin.color || '#ffffff';

      // ─ Halo de base coloré (pulsant si verrouillé)
      if (locked) {
        const pulse     = 0.5 + 0.5 * Math.sin(this._lockPulse * Math.PI / 180);
        ctx.shadowColor = color;
        ctx.shadowBlur  = 18 + 10 * pulse;
      } else {
        ctx.shadowColor = color;
        ctx.shadowBlur  = 14;
      }

      // ─ Forme goutte d'eau (remplie)
      ctx.beginPath();
      ctx.moveTo(x, tipY);
      ctx.bezierCurveTo(x + r * 0.5, tipY + (cY - tipY) * 0.5,
                        x + r,       cY - r * 0.5,
                        x + r,       cY);
      ctx.arc(x, cY, r, 0, Math.PI, false);
      ctx.bezierCurveTo(x - r,       cY - r * 0.5,
                        x - r * 0.5, tipY + (cY - tipY) * 0.5,
                        x,           tipY);
      ctx.closePath();
      ctx.fillStyle   = color;
      ctx.globalAlpha = 0.92;
      ctx.fill();

      // ─ Contour épais pour le pin verrouillé (blanc semi-transparent = toujours plus clair que le remplissage)
      if (locked) {
        const pulse   = 0.5 + 0.5 * Math.sin(this._lockPulse * Math.PI / 180);
        ctx.shadowColor = color;
        ctx.shadowBlur  = 10 + 8 * pulse;
        ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.20 * pulse})`;
        ctx.lineWidth   = 2.5;
        ctx.globalAlpha = 1;
        ctx.stroke();

        // ─ Icône cadenas dans le cercle
        ctx.shadowBlur = 0;
        this._drawLockIcon(ctx, x, cY, r, pulse);
      }

      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
    }
  }

  /** Dessine un petit cadenas dans le cercle de la goutte verrouillée */
  _drawLockIcon(ctx, cx, cy, r, pulse = 0.75) {
    const bW = r * 0.72;
    const bH = r * 0.58;
    const bX = cx - bW / 2;
    const bY = cy - bH * 0.3;
    const arcR = bW * 0.38;
    const alpha = 0.55 + 0.20 * pulse;

    ctx.globalAlpha = alpha;
    ctx.fillStyle   = 'rgba(255,255,255,1)';
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth   = 1;

    // Corps rect arrondi
    const br = 1.5;
    ctx.beginPath();
    ctx.moveTo(bX + br, bY);
    ctx.lineTo(bX + bW - br, bY);
    ctx.quadraticCurveTo(bX + bW, bY, bX + bW, bY + br);
    ctx.lineTo(bX + bW, bY + bH - br);
    ctx.quadraticCurveTo(bX + bW, bY + bH, bX + bW - br, bY + bH);
    ctx.lineTo(bX + br, bY + bH);
    ctx.quadraticCurveTo(bX, bY + bH, bX, bY + bH - br);
    ctx.lineTo(bX, bY + br);
    ctx.quadraticCurveTo(bX, bY, bX + br, bY);
    ctx.closePath();
    ctx.fill();

    // Anse du cadenas (demi-cercle)
    ctx.beginPath();
    ctx.arc(cx, bY, arcR, Math.PI, 0, false);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  /* ── Interactions souris ────────────────────────── */

  _setupListeners() {
    const wc = this.waveCanvas;
    const rc = this.rulerCanvas;

    // Clic pour seek
    wc.addEventListener('mousedown', (e) => this._onMouseDown(e));
    wc.addEventListener('mousemove', (e) => this._onMouseMove(e));
    wc.addEventListener('mouseup',   (e) => this._onMouseUp(e));
    wc.addEventListener('contextmenu', (e) => {
      if (this.paintBrushMode) e.preventDefault();
    });
    wc.addEventListener('mouseleave',(e) => {
      this._brushPainting = false;
      this._brushErasing  = false;
      // Annuler le drag sans seek quand le curseur sort
      if (this._drag.active) {
        this._drag.active = false;
        this._drag.moved  = false;
        this.waveCanvas.style.cursor = 'crosshair';
      }
    });

    rc.addEventListener('mousedown', (e) => this._onRulerMouseDown(e));
    rc.addEventListener('mouseup',   (e) => this._onRulerMouseUp(e));
    rc.addEventListener('contextmenu', (e) => e.preventDefault());
    rc.addEventListener('mouseleave', () => {
      if (this._markerHovered) { this._markerHovered = false; this._dirty = true; }
    });

    // Curseur sur la règle : pointer quand on survole un pin ou le marker
    rc.addEventListener('mousemove', (e) => {
      if (!this.audioBuffer) return;
      const x   = this._getClientX(rc, e);
      const pps = this.pixelsPerSecond;

      // Si drag de pin en cours → mettre à jour la position
      if (this._pinDrag.active) {
        const newT = this.xToTime(x);
        this._pinDrag.currentTime = Math.max(0, Math.min(this.duration, newT));
        this.pins[this._pinDrag.idx].time = this._pinDrag.currentTime;
        this._pinDrag.moved = true;
        if (this.onPinDragMove) this.onPinDragMove(this._pinDrag.idx);
        this._dirty = true;
        return;
      }

      const HIT       = 11;
      const hitPin    = this.pins.some(p => Math.abs((p.time - this.scrollTime) * pps - x) <= HIT);
      const hitMarker = this.clickMarkerTime !== null &&
                        Math.abs((this.clickMarkerTime - this.scrollTime) * pps - x) <= HIT;

      // Effet survol du losange
      const newHovered = hitMarker && !hitPin;
      if (newHovered !== this._markerHovered) {
        this._markerHovered = newHovered;
        this._dirty = true;
      }

      rc.style.cursor = (hitPin || hitMarker) ? 'pointer' : (this._pinDrag.active ? 'ew-resize' : 'default');
    });

    // Fin drag pin si souris relâchée hors du canvas règle
    document.addEventListener('mouseup', (e) => {
      if (this._pinDrag.active) this._onRulerMouseUp(e);
    });

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
    if (this.paintBrushMode) {
      if (e.button === 0) {
        this._brushPainting = true;
        this._paintMeasureAtX(this._getClientX(this.waveCanvas, e));
      } else if (e.button === 2) {
        // Clic droit : démarrer l'effacement continu par glisser
        this._brushErasing = true;
        const x    = this._getClientX(this.waveCanvas, e);
        const time = this.xToTime(x);
        if (time >= 0 && time <= this.duration) {
          this.measureColors.delete(this.getMeasureAtTime(time));
          this._dirty = true;
        }
      }
      return;
    }
    if (e.button === 0) {
      const x = this._getClientX(this.waveCanvas, e);
      this._drag.active      = true;
      this._drag.startX      = x;
      this._drag.startScroll = this.scrollTime;
      this._drag.moved       = false;
    }
  }

  _onMouseMove(e) {
    if (this.paintBrushMode) {
      if (this._brushPainting) {
        this._paintMeasureAtX(this._getClientX(this.waveCanvas, e));
      } else if (this._brushErasing) {
        const x    = this._getClientX(this.waveCanvas, e);
        const time = this.xToTime(x);
        if (time >= 0 && time <= this.duration) {
          const mIdx = this.getMeasureAtTime(time);
          if (this.measureColors.has(mIdx)) {
            this.measureColors.delete(mIdx);
            this._dirty = true;
          }
        }
      }
      return;
    }
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
    if (this.paintBrushMode) {
      this._brushPainting = false;
      this._brushErasing  = false;
      return;
    }
    if (!this._drag.active) return;
    if (!this._drag.moved) {
      // Clic simple → seek + poser la barre pointillée
      const x = this._getClientX(this.waveCanvas, e);
      const t = this.xToTime(x);
      this.clickMarkerTime = Math.max(0, Math.min(this.duration, t));
      this._seekToX(x);
    }
    this._drag.active = false;
    this._drag.moved  = false;
    this.waveCanvas.style.cursor = 'crosshair';
  }

  _onRulerMouseDown(e) {
    if (!this.audioBuffer) return;
    const x   = this._getClientX(this.rulerCanvas, e);
    const pps = this.pixelsPerSecond;
    const HIT = 11;

    // Clic droit → supprimer le pin survolé, sinon menu vide
    if (e.button === 2) {
      for (let i = 0; i < this.pins.length; i++) {
        const px = (this.pins[i].time - this.scrollTime) * pps;
        if (Math.abs(px - x) <= HIT) {
          if (this.onPinDelete) this.onPinDelete(i);
          this.pins.splice(i, 1);
          this._dirty = true;
          return;
        }
      }
      // Aucun pin touché → menu contextuel général
      if (this.onRulerEmptyRightClick) this.onRulerEmptyRightClick(e.clientX, e.clientY);
      return;
    }

    if (e.button !== 0) return;

    // Priorité 1 : clic/drag sur un pin existant
    for (let i = 0; i < this.pins.length; i++) {
      const px = (this.pins[i].time - this.scrollTime) * pps;
      if (Math.abs(px - x) <= HIT) {
        this._pinDrag = {
          active:      true,
          idx:         i,
          moved:       false,
          startX:      e.clientX,
          currentTime: this.pins[i].time,
        };
        this.rulerCanvas.style.cursor = 'ew-resize';
        return;
      }
    }

    // Priorité 2 : clic sur le marqueur clickMarkerTime → poser un pin là
    if (this.clickMarkerTime !== null) {
      const cmX = (this.clickMarkerTime - this.scrollTime) * pps;
      if (Math.abs(cmX - x) <= HIT) {
        this.pins.push({ time: this.clickMarkerTime, color: this._randomPinColor() });
        this.clickMarkerTime = null;
        this._dirty = true;
        return;
      }
    }

    // Priorité 3 : nouveau pin à l'endroit cliqué
    const t = this.xToTime(x);
    const clamped = Math.max(0, Math.min(this.duration, t));
    this.pins.push({ time: clamped, color: this._randomPinColor() });
    this._dirty = true;
  }

  _onRulerMouseUp(e) {
    if (!this._pinDrag.active) return;
    if (!this._pinDrag.moved) {
      // Clic court → popup
      if (this.onPinClick) this.onPinClick(this._pinDrag.idx, e.clientX, e.clientY);
    }
    this._pinDrag.active = false;
    this._pinDrag.moved  = false;
    this.rulerCanvas.style.cursor = 'default';
    this._dirty = true;
  }

  _paintMeasureAtX(x) {
    const time  = this.xToTime(x);
    if (time < 0 || time > this.duration) return;
    const mIdx  = this.getMeasureAtTime(time);
    const color = this.paintBrushColor;
    const oldColor = this.measureColors.get(mIdx);
    if (oldColor === color) return;
    this.measureColors.set(mIdx, color);
    // Ajouter à la palette si absent
    const inPalette = this.brushPalette.some(e => e.color === color);
    if (!inPalette) {
      const num = this.brushPalette.length + 1;
      this.brushPalette.push({ id: ++this._paletteIdCounter, color, name: 'Section ' + num });
      if (this.onPaletteChange) this.onPaletteChange();
    }
    this._dirty = true;
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

  _randomPinColor() {
    // Rotation par angle d'or : chaque nouvelle couleur est à ~137.5° de la précédente
    // => couleurs toujours bien écartées et cycle complet avant répétition
    const GOLDEN_ANGLE = 137.508;
    const hue = Math.round(this._pinNextHue);
    this._pinNextHue = (this._pinNextHue + GOLDEN_ANGLE) % 360;
    return `hsl(${hue},82%,62%)`;
  }
}
