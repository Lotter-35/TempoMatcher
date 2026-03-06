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
    this._rawSamples  = null;   // Float32Array mono mixdown
    this._sampleRate  = 44100;

    // Mode de visualisation : 'classic' | 'spectral'
    this.viewMode  = 'classic';
    this._specBass    = null;   // Float32Array RMS basses par chunk
    this._specMid     = null;   // Float32Array RMS médiums par chunk
    this._specHigh    = null;   // Float32Array RMS aigus par chunk

    // Vue : zoom et scroll
    this.zoom        = 1.0;    // 1 = tout affiché, >1 = zoomé
    this.scrollTime  = 0;      // temps de départ de la fenêtre visible (s)

    // Playhead
    this.playheadTime  = 0;
    this.isPlaying     = false;
    this.autoFollow    = false;  // auto-scroll désactivé par défaut

    // Callbacks
    this.onSeek           = null;  // fn(time)
    this.onPinClick       = null;  // fn(pinIndex, screenX, screenY)
    this.onPinDragMove    = null;  // fn(pinIndex)  — appelé pendant le drag
    this.onPinChange      = null;  // fn()  — appelé après création / suppression / fin de drag
    this.onSineModeChange = null;  // fn(isSine) — transition entrée/sortie mode sinusoïdal
    this._isSineMode      = false; // état courant

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
    this._drag    = { active: false, startX: 0, startScroll: 0, moved: false };
    this._midDrag = { active: false, startX: 0, startScroll: 0 };  // pan clic molette

    // Callback pinceau — app.js peut brancher le système undo/redo ici
    this.onBrushStrokeStart = null;

    // Mode pinceau
    this.paintBrushMode    = false;   // activé depuis app.js
    this.paintBrushColor   = '#ff8800';
    this._brushPainting    = false;
    this._brushErasing     = false;
    this._lastBrushX       = null;   // interpolation entre events mousemove

    // Mode seek temporaire (espace maintenu en mode pinceau)
    this.spaceSeekMode     = false;
    this._spaceSeekCursorX = null;

    // Mode export PNG : masque playhead, click marker, marqueurs de battement/mesure/boucle
    this.exportMode  = false;
    // Facteur de mise à l'échelle pour l'export (textes, traits, pins) — 1 = normal, 2 = 4K
    this.exportScale = 1;

    // Curseur pinceau : div absolu mis à jour directement dans mousemove (pas de rAF = zéro latence)
    this._brushCursorEl = document.createElement('div');
    Object.assign(this._brushCursorEl.style, {
      position: 'absolute', top: '0', left: '-9999px',
      width: '2px', height: '0',
      pointerEvents: 'none', display: 'none',
      opacity: '0.75',
      willChange: 'left',
    });
    waveCanvas.parentElement.appendChild(this._brushCursorEl);

    // Palette de sections [{id, color, name}]
    this.brushPalette      = [];
    this._paletteIdCounter = 0;
    this.onPaletteChange   = null;  // fn() → app.js re-rend la liste

    // Bandes de groupes de boucles
    this.loopsPerGroup  = 4;
    this.showLoopBands  = false;
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
    this.measureColors     = new Map();
    // Ordre de rendu : boucle+mesure+bandes toujours SOUS la waveform, tempo toujours PAR-DESSUS

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
    this.beatBarHeight       = 0.05; // temps   : fraction de H (synchro amplitude)
    this.loopBandHeightScale = 1.0;  // bandes  : pleine hauteur

    this._animFrame = null;
    this._dirty     = true;

    // ResizeObserver : resize canvas uniquement quand le conteneur change vraiment
    // (évite le layout reflow à chaque frame de la boucle rAF)
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const W  = this.waveCanvas.clientWidth;
      const H  = this.waveCanvas.clientHeight;
      const rH = this.rulerCanvas.clientHeight;
      if (this.waveCanvas.width !== Math.round(W * dpr) || this.waveCanvas.height !== Math.round(H * dpr)) {
        this.waveCanvas.width  = Math.round(W * dpr);
        this.waveCanvas.height = Math.round(H * dpr);
        this.wctx.scale(dpr, dpr);
        this._brushCursorEl.style.height = H + 'px';
        if (this.audioBuffer) this._computePeaks();
      }
      if (this.rulerCanvas.width !== Math.round(W * dpr) || this.rulerCanvas.height !== Math.round(rH * dpr)) {
        this.rulerCanvas.width  = Math.round(W * dpr);
        this.rulerCanvas.height = Math.round(rH * dpr);
        this.rctx.scale(dpr, dpr);
      }
      this._dirty = true;
    });
    ro.observe(this.waveCanvas);
    ro.observe(this.rulerCanvas);

    this._setupListeners();
    this._startRenderLoop();
  }

  /* ── Initialisation ─────────────────────────────── */

  setAudio(audioBuffer) {
    this.audioBuffer = audioBuffer;
    this.duration    = audioBuffer.duration;
    this.zoom        = 1;
    this.scrollTime  = 0;
    this._sampleRate = audioBuffer.sampleRate;
    // Stocker un mono mixdown brut pour la vue sinusoïdale
    const numCh = audioBuffer.numberOfChannels;
    const len   = audioBuffer.length;
    this._rawSamples = new Float32Array(len);
    if (numCh === 1) {
      this._rawSamples.set(audioBuffer.getChannelData(0));
    } else {
      const invCh = 1 / numCh;
      for (let c = 0; c < numCh; c++) {
        const ch = audioBuffer.getChannelData(c);
        for (let i = 0; i < len; i++) this._rawSamples[i] += ch[i] * invCh;
      }
    }
    this._computePeaks();
    this._computeSpectral();
    this._dirty = true;
  }

  /** Pré-calcule les pics (min/max) à haute résolution */
  _computePeaks() {
    const buf      = this.audioBuffer;
    const sampleRate = buf.sampleRate;
    const totalSamples = buf.length;

    // Nombre cible de pics : 4× la largeur canvas
    // => bonne résolution à forte zoom
    const TARGET = Math.min(totalSamples, this._cW() * 8);
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

  /**
   * Pré-calcule l'énergie spectrale par chunk (basses / médiums / aigus)
   * via filtres IIR passe-bas causal — O(N), aucune allocation large.
   * Bass  : 0 – 200 Hz
   * Mid   : 200 – 4000 Hz
   * High  : 4000 Hz+
   */
  _computeSpectral() {
    const sr  = this._sampleRate;
    const buf = this._rawSamples;
    if (!buf) return;
    const N   = buf.length;
    const count = this._peakCount;
    const step  = Math.max(1, Math.floor(N / count));

    // Coefficients IIR premier ordre
    const aB = 1 - Math.exp(-2 * Math.PI * 200  / sr);  // coupe-bas 200 Hz
    const aH = 1 - Math.exp(-2 * Math.PI * 4000 / sr);  // coupe-bas 4000 Hz

    this._specBass = new Float32Array(count);
    this._specMid  = new Float32Array(count);
    this._specHigh = new Float32Array(count);

    let yb = 0, yh = 0;  // états des filtres (continus entre chunks)

    for (let ci = 0; ci < count; ci++) {
      const start = ci * step;
      const end   = Math.min(start + step, N);
      let sb = 0, sm = 0, sh = 0;
      for (let i = start; i < end; i++) {
        const x = buf[i];
        yb += aB * (x - yb);   // passe-bas → basses
        yh += aH * (x - yh);   // passe-bas → basses + médiums
        const b = yb;           // basses
        const m = yh - yb;      // médiums (différence)
        const h = x - yh;       // aigus
        sb += b * b;
        sm += m * m;
        sh += h * h;
      }
      const n = end - start;
      this._specBass[ci] = Math.sqrt(sb / n);
      this._specMid[ci]  = Math.sqrt(sm / n);
      this._specHigh[ci] = Math.sqrt(sh / n);
    }
  }



  /**
   * Visualisation spectrale style Rekordbox — O(W) par frame via ImageData.
   * Basses = bleu, Médiums = orange, Aigus = blanc.
   * Chaque colonne de pixel est colorée selon la dominante fréquentielle.
   */
  /**
   * Visualisation spectrale style Rekordbox — bandes EMPILÉES.
   * Du centre vers l'extérieur :
   *   ① Aigus  (blanc)  — innermost, au centre
   *   ② Médiums (orange) — milieu
   *   ③ Basses  (bleu)  — outermost, aux bords
   * Symétrique haut/bas. O(W×H) via ImageData.
   */
  _drawSpectral(ctx, W, H) {
    const pps      = this.pixelsPerSecond;   // CSS px / s
    const startSec = this.scrollTime;
    const peakStep = this.duration / this._peakCount;
    const alpha255 = Math.round(this.waveOpacity * 255);

    // createImageData / putImageData opèrent en PIXELS PHYSIQUES (bypass du transform dpr).
    // On doit donc travailler dans l'espace device-pixel.
    const dpr  = this._dpr();
    const cW   = ctx.canvas.width;   // pixels physiques
    const cH   = ctx.canvas.height;  // pixels physiques
    const midY = cH / 2;             // centre en pixels physiques
    const hH   = (midY - 2 * dpr) * this.amplitudeScale * 1.8;

    const imageData = ctx.createImageData(cW, cH);
    const data      = imageData.data;

    // Couleurs des 3 bandes
    const BASS  = [20,  100, 230];   // bleu profond
    const MID   = [220, 140,  30];   // orange chaud
    const HIGH  = [200, 215, 255];   // blanc bleuté

    // Boucle sur les colonnes physiques
    for (let cpx = 0; cpx < cW; cpx++) {
      // Convertir colonne physique → temps (via CSS px)
      const t = startSec + (cpx / dpr) / pps;
      if (t < 0 || t > this.duration) continue;

      const pi = Math.min(this._peakCount - 1, Math.max(0, Math.floor(t / peakStep)));

      // Hauteur totale en pixels physiques
      const ampMax = Math.min(1,  this._peaksMax[pi]);
      const ampMin = Math.max(-1, this._peaksMin[pi]);
      const amp    = (ampMax - ampMin) * 0.5;
      const barH   = Math.max(1, amp * hH);

      // Proportions spectrales (somme = 1)
      const bass  = this._specBass[pi];
      const mid   = this._specMid[pi];
      const high  = this._specHigh[pi];
      const total = bass + mid + high + 1e-9;

      const highH = barH * (high / total);
      const midH  = barH * (mid  / total);

      const yTop    = Math.max(0,      Math.floor(midY - barH));
      const yBottom = Math.min(cH - 1, Math.ceil (midY + barH));

      for (let py = yTop; py <= yBottom; py++) {
        const dist = Math.abs(py - midY);

        let r, g, b;
        if (dist <= highH) {
          const t2 = dist / (highH + 0.5);
          const bright = 0.55 + 0.45 * t2;
          r = Math.round(HIGH[0] * bright);
          g = Math.round(HIGH[1] * bright);
          b = Math.round(HIGH[2] * bright);
        } else if (dist <= highH + midH) {
          const t2 = (dist - highH) / (midH + 0.5);
          const bright = 0.45 + 0.55 * t2;
          r = Math.round(MID[0] * bright);
          g = Math.round(MID[1] * bright);
          b = Math.round(MID[2] * bright);
        } else {
          const t2 = (dist - highH - midH) / (barH - highH - midH + 0.5);
          const bright = 0.30 + 0.70 * t2;
          r = Math.round(BASS[0] * bright);
          g = Math.round(BASS[1] * bright);
          b = Math.round(BASS[2] * bright);
        }

        const idx = (py * cW + cpx) * 4;
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = alpha255;
      }
    }

    // putImageData ignore le transform — on reset temporairement pour placer à (0,0) physique
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
  }

  /* ── Vue ────────────────────────────────────────── */

  get visibleDuration() {
    return this.duration / this.zoom;
  }

  get pixelsPerSecond() {
    return (this._cW() || 1) / this.visibleDuration;
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
    const visBefore = this.visibleDuration;
    if (pivotTime === null) pivotTime = this.scrollTime + visBefore / 2;
    // Ratio de position du pivot dans la fenêtre visible (conservé après zoom)
    const ratio = (pivotTime - this.scrollTime) / visBefore;
    this.zoom = Math.min(2000, this.zoom * factor);
    this.scrollTime = pivotTime - ratio * this.visibleDuration;
    this._clampScroll();
    this._dirty = true;
  }

  zoomOut(factor = 2, pivotTime = null) {
    const visBefore = this.visibleDuration;
    if (pivotTime === null) pivotTime = this.scrollTime + visBefore / 2;
    const ratio = (pivotTime - this.scrollTime) / visBefore;
    this.zoom = Math.max(0.1, this.zoom / factor);
    this.scrollTime = pivotTime - ratio * this.visibleDuration;
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
    // Auto-follow actif uniquement si la durée visible est ≤ au seuil configurable
    // Modifier AUTO_FOLLOW_MAX_VISIBLE_SEC pour changer le seuil
    const AUTO_FOLLOW_MAX_VISIBLE_SEC = 2; // secondes
    if (this.visibleDuration > AUTO_FOLLOW_MAX_VISIBLE_SEC) return;
    const pht = this.playheadTime;
    const vis = this.visibleDuration;

    // Si le playhead est complètement hors de vue, ne pas téléporter : l'utilisateur
    // a volontairement scrollé ailleurs, on respecte sa position.
    if (pht < this.scrollTime || pht > this.scrollTime + vis) return;

    // Playhead visible : l'accompagner si il approche du bord droit (> 85%)
    if (pht > this.scrollTime + vis * 0.85) {
      this.scrollTime = pht - vis * 0.15;
      this._clampScroll();
      this._dirty = true;
    }
  }

  /* ── Rendu ──────────────────────────────────────── */

  _dpr() { return window.devicePixelRatio || 1; }

  // Helpers dimensions CSS : retournent clientWidth/Height ou canvas.width en fallback
  // (les canvases offscreen hors-DOM ont clientWidth=0 mais width=dimension physique)
  _cW()  { return this.waveCanvas.clientWidth   || this.waveCanvas.width; }
  _cH()  { return this.waveCanvas.clientHeight  || this.waveCanvas.height; }
  _crH() { return this.rulerCanvas.clientHeight || this.rulerCanvas.height; }

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
    // Mettre à jour la hauteur du curseur pinceau
    this._brushCursorEl.style.height = H + 'px';

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
      // Animation du losange (dirty seulement pendant la transition)
      const target = this._markerHovered ? 1 : 0;
      if (this._markerAnim !== target) {
        const dir   = target > this._markerAnim ? 1 : -1;
        this._markerAnim = Math.max(0, Math.min(1, this._markerAnim + dir * ANIM_SPEED));
        this._dirty = true;
      }

      // Pulsation du pin verrouillé : time-based via performance.now() — pas de dirty forcé
      const needLockAnim = this.lockedPinTime !== null;

      if (this._dirty || this.isPlaying || this._pinDrag.active || needLockAnim) {
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
    const W   = this._cW();
    const H   = this._cH();

    ctx.clearRect(0, 0, W, H);

    // Fond
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    if (!this.audioBuffer) return;

    // En mode spectral, les marqueurs sont tous dessinés PAR-DESSUS (le spectre est opaque)
    const isSpectral = this.viewMode === 'spectral' && !!this._specBass;

    // Détection mode sinusoïdal + callback de transition
    // Passe en sinusoïde si la durée visible ≤ seuil configurable (en secondes)
    const SINE_MODE_MAX_VISIBLE_SEC = 2; // ← modifier ici pour changer le seuil
    const _spx       = W / this.visibleDuration;
    const isSineNow  = !isSpectral && !!this._rawSamples && this.visibleDuration <= SINE_MODE_MAX_VISIBLE_SEC;
    if (isSineNow !== this._isSineMode) {
      this._isSineMode = isSineNow;
      if (this.onSineModeChange) this.onSineModeChange(isSineNow);
    }

    // ── Passe SOUS la waveform ──
    if (!isSpectral) {
      if (isSineNow) {
        // Mode sinus : vert en premier (sous orange/rouge), puis orange/rouge par-dessus vert
        this._drawMeasureGroupBands(ctx, W, H, true);
        this._drawBeatMarkers(ctx, W, H, false); // vert en dessous
        this._drawBeatMarkers(ctx, W, H, true);  // orange/rouge par-dessus vert
      } else {
        // Mode normal : orange/rouge sous la waveform
        this._drawMeasureGroupBands(ctx, W, H, true);
        this._drawBeatMarkers(ctx, W, H, true);
      }
    }

    // ── Waveform ──
    this._drawWaveShape(ctx, W, H);

    // Ligne centrale horizontale (colorée selon les sections pinceau)
    if (this.audioBuffer) {
      const pps    = this.pixelsPerSecond;
      const startT = this.scrollTime;
      const midY   = H / 2;
      const xStart = Math.max(0, Math.floor(this.timeToX(0)));
      const xEnd   = Math.min(W, Math.ceil(this.timeToX(this.audioBuffer.duration)));

      ctx.save();
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.7;

      if (this.measureColors.size === 0) {
        // Pas de sections : trait uniforme
        ctx.strokeStyle = this.waveColorStroke;
        ctx.beginPath();
        ctx.moveTo(xStart, midY);
        ctx.lineTo(xEnd,   midY);
        ctx.stroke();
      } else {
        // Construire les segments contigus de même couleur
        const secPerMeasure = this.metronome && this.metronome.bpm > 0
          ? (60 / this.metronome.bpm) * this.metronome.beatsPerMeasure
          : 0;

        let segStart = xStart;
        let segColor = null;

        const _colorAt = (px) => {
          if (!secPerMeasure) return this.waveColorStroke;
          const t = startT + px / pps;
          const m = Math.floor((t - this.metronome.offset) / secPerMeasure);
          const c = this.measureColors.get(m);
          return c || this.waveColorStroke;
        };

        const _flush = (px, color) => {
          if (px <= segStart) return;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(segStart, midY);
          ctx.lineTo(px,       midY);
          ctx.stroke();
        };

        segColor = _colorAt(xStart);
        for (let px = xStart + 1; px <= xEnd; px++) {
          const c = _colorAt(px);
          if (c !== segColor) {
            _flush(px, segColor);
            segStart = px;
            segColor = c;
          }
        }
        _flush(xEnd, segColor);
      }

      ctx.restore();
    }

    // ── Passe PAR-DESSUS ──
    // En spectral : bandes + barres boucle/mesure visibles par-dessus le spectre
    if (isSpectral) {
      this._drawMeasureGroupBands(ctx, W, H, true);
      this._drawBeatMarkers(ctx, W, H, true);
    }
    // Mode normal : vert par-dessus la waveform. Mode sinus : déjà dessiné sous la wave.
    if (!isSineNow) {
      this._drawBeatMarkers(ctx, W, H, false);
    }
    this._drawMeasureGroupBands(ctx, W, H, false);

    // ── Début / fin du morceau ──
    this._drawBoundaryMarkers(ctx, W, H);

    // ── Barres pointillées des pins ──
    this._drawPinLinesOnWave(ctx, W, H);

    // ── Barre pointée (clic waveform ou drag de pin) ──
    if (!this.exportMode) this._drawClickMarkerOnWave(ctx, W, H);

    // ── Playhead ──
    if (!this.exportMode) this._drawPlayhead(ctx, W, H);

    // ── Barre curseur mode seek (espace maintenu) ──
    if (!this.exportMode && this.spaceSeekMode && this._spaceSeekCursorX !== null) {
      const x = this._spaceSeekCursorX;
      if (x >= 0 && x <= W) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

  }

  hideBrushCursor() {
    this._brushCursorEl.style.display = 'none';
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

    // ── Dispatch selon viewMode ──
    switch (this.viewMode) {
      case 'spectral':
        if (this._specBass) { this._drawSpectral(ctx, W, H); return; }
        break;

    }

    // ── Couche de base : couleur par défaut (classic) ──
    this._drawWaveShapeColored(ctx, W, H, this.waveColorFill, this.waveColorStroke, null, null);

    // ── Couche pinceau : segments colorés — O(largeur segment) au lieu de O(W×N) ──
    if (this.measureColors.size > 0) {
      const visibleMeasures = this._getVisibleMeasureRanges(W);
      for (const { measureIdx, xStart, xEnd } of visibleMeasures) {
        const color = this.measureColors.get(measureIdx);
        if (!color) continue;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const fill = `rgb(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)})`;
        this._drawWaveShapeColored(ctx, W, H, fill, color, xStart, xEnd);
      }
    }
  }

  /**
   * Dessine la forme d'onde avec les couleurs données.
   * clipX0/clipX1 (optionnel) : restreint le rendu à cette tranche de pixels — O(segment) au lieu de O(W).
   */
  _drawWaveShapeColored(ctx, W, H, fillColor, strokeColor, clipX0, clipX1) {
    const visD     = this.visibleDuration;
    const pps      = W / visD;
    const midY     = H / 2;
    const hH       = (midY - 4) * this.amplitudeScale;
    const startSec = this.scrollTime;

    // ── Mode sinusoïdal ──
    const SINE_MODE_MAX_VISIBLE_SEC = 2; // même seuil que dans _drawWaveform
    if (this._rawSamples && this.visibleDuration <= SINE_MODE_MAX_VISIBLE_SEC) {
      if (clipX0 !== null) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX0, 0, clipX1 - clipX0, H);
        ctx.clip();
        this._drawWaveSine(ctx, W, H, midY, hH, pps, startSec, fillColor, strokeColor);
        ctx.restore();
      } else {
        this._drawWaveSine(ctx, W, H, midY, hH, pps, startSec, fillColor, strokeColor);
      }
      return;
    }

    // ── Mode peaks : itérer uniquement les pixels de la tranche ──
    const pxStart  = clipX0 !== null ? Math.max(0, Math.floor(clipX0)) : 0;
    const pxEnd    = clipX1 !== null ? Math.min(W, Math.ceil(clipX1))  : W;
    const peakStep = this.duration / this._peakCount;

    ctx.globalAlpha = this.waveOpacity;
    ctx.fillStyle   = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1;

    // Précalcul des Y pour éviter de double-boucler
    const yTop = new Float32Array(pxEnd - pxStart);
    const yBot = new Float32Array(pxEnd - pxStart);
    for (let px = pxStart; px < pxEnd; px++) {
      const t  = startSec + px / pps;
      const pi = (t < 0 || t > this.duration) ? -1
        : Math.min(this._peakCount - 1, Math.max(0, Math.floor(t / peakStep)));
      yTop[px - pxStart] = pi < 0 ? midY : midY - Math.min(this._peaksMax[pi] * hH,  midY);
      yBot[px - pxStart] = pi < 0 ? midY : midY - Math.max(this._peaksMin[pi] * hH, -midY);
    }

    // ── Fill (chemin fermé) ──
    ctx.beginPath();
    ctx.moveTo(pxStart, midY);
    for (let px = pxStart; px < pxEnd; px++) ctx.lineTo(px, yTop[px - pxStart]);
    for (let px = pxEnd - 1; px >= pxStart; px--) ctx.lineTo(px, yBot[px - pxStart]);
    ctx.closePath();
    ctx.fill();

    // ── Stroke : deux chemins ouverts (haut + bas) — pas de bords verticaux ──
    ctx.beginPath();
    ctx.moveTo(pxStart, yTop[0]);
    for (let px = pxStart + 1; px < pxEnd; px++) ctx.lineTo(px, yTop[px - pxStart]);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pxStart, yBot[0]);
    for (let px = pxStart + 1; px < pxEnd; px++) ctx.lineTo(px, yBot[px - pxStart]);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  /**
   * Vue sinusoïdale — O(W) : on itère par PIXEL, pas par sample.
   * Interpolation linéaire pour obtenir la valeur exacte à chaque pixel.
   * Jamais plus de ~1200 itérations quelle que soit la résolution audio.
   */
  _drawWaveSine(ctx, W, H, midY, hH, pps, startSec, fillColor, strokeColor) {
    const sr      = this._sampleRate;
    const samples = this._rawSamples;
    const len     = samples.length;
    const spp     = sr / pps;   // samples par pixel

    // Interpolation linéaire entre deux samples
    const lerp = (t) => {
      const fi = t * sr;
      const i0 = Math.floor(fi);
      if (i0 < 0)       return 0;
      if (i0 >= len)    return 0;
      const frac = fi - i0;
      const s1   = i0 + 1 < len ? samples[i0 + 1] : samples[i0];
      return samples[i0] + frac * (s1 - samples[i0]);
    };

    // Construire les Y pour chaque pixel en un seul passage O(W)
    const ys = new Float32Array(W);
    for (let px = 0; px < W; px++) {
      const t = startSec + px / pps;
      if (t < 0 || t > this.duration) { ys[px] = midY; continue; }
      const v = Math.max(-1, Math.min(1, lerp(t)));
      ys[px] = midY - v * hH;
    }

    ctx.globalAlpha = this.waveOpacity;
    ctx.fillStyle   = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1.5;

    // ── Fill : zone entre la courbe et l'axe ──
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let px = 0; px < W; px++) ctx.lineTo(px, ys[px]);
    ctx.lineTo(W - 1, midY);
    ctx.closePath();
    ctx.fill();

    // ── Stroke : courbe lisse ──
    ctx.beginPath();
    ctx.moveTo(0, ys[0]);
    for (let px = 1; px < W; px++) ctx.lineTo(px, ys[px]);
    ctx.stroke();

    // ── Points aux samples quand très zoomé (< 0.5 samples/pixel) ──
    if (spp < 0.5) {
      const iStart = Math.max(0,       Math.floor(startSec * sr));
      const iEnd   = Math.min(len - 1, Math.ceil((startSec + W / pps) * sr));
      ctx.fillStyle = strokeColor;
      for (let i = iStart; i <= iEnd; i++) {
        const x = (i / sr - startSec) * pps;
        if (x < -4 || x > W + 4) continue;
        const y = midY - Math.max(-1, Math.min(1, samples[i])) * hH;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

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
      // Clamp aux bornes réelles du morceau pour éviter le débordement visuels
      const tLc = Math.max(0, tL);
      const tRc = Math.min(this.duration, tR);
      if (tRc <= tLc) continue;
      const xStart = Math.max(0, (tLc - startT) * pps);
      const xEnd   = Math.min(W, (tRc - startT) * pps);
      if (xEnd <= xStart) continue;
      result.push({ measureIdx: m, xStart, xEnd });
    }
    return result;
  }

  _drawMeasureGroupBands(ctx, W, H, underPass) {
    if (!this.metronome || !this.audioBuffer) return;
    if (!this.showLoopBands) return;
    if (!underPass) return;   // bandes toujours sous la waveform (hardcoded)

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

  _drawBeatMarkers(ctx, W, H, underPass) {
    if (!this.audioBuffer) return;
    // En mode export : masquer mesure et tempo, garder uniquement les barres de boucle
    if (this.exportMode && !underPass) return;
    if (this.exportMode && underPass && !this.showLoopMarkers) return;
    if (!this.showLoopMarkers && !this.showMeasureMarkers && !this.showBeatMarkers) return;

    const startT = this.scrollTime;
    const endT   = this.scrollTime + this.visibleDuration;
    const beats  = this.metronome.getBeatPositions(startT, endT);
    const pps    = this.pixelsPerSecond;

    ctx.save();

    for (const b of beats) {
      if (b.time > this.duration) continue;
      const x = (b.time - startT) * pps;
      if (x < 0 || x > W) continue;

      const isMeasureStart = b.beatInMeasure === 0;

      if (underPass) {
        // ── PASSE SOUS : boucle (orange) et mesure (rouge), avec étiquettes ──
        let color, lineH, lineW, alpha, drawn = false;

        if (b.isLoopStart && this.showLoopMarkers) {
          color = this.markerColorLoop; lineH = H * this.loopBarHeight; lineW = 2 * this.exportScale; alpha = this.exportMode ? 0.20 : this.loopOpacity; drawn = true;
        } else if (isMeasureStart && this.showMeasureMarkers && !this.exportMode) {
          color = this.markerColorMeasure; lineH = H * this.measureBarHeight; lineW = 1.5 * this.exportScale; alpha = this.measureOpacity; drawn = true;
        }

        if (!drawn) continue;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth   = lineW;
        ctx.beginPath();
        ctx.moveTo(x, (H - lineH) / 2);
        ctx.lineTo(x, (H + lineH) / 2);
        ctx.stroke();

        // Étiquette
        ctx.globalAlpha = 0.7;
        ctx.fillStyle   = color;
        ctx.textAlign   = 'left';
        if (b.isLoopStart) {
          const loopDuration = this.metronome.totalBeats * this.metronome.beatInterval;
          const loopNum = loopDuration > 0
            ? Math.floor((b.time - this.metronome.offset) / loopDuration) + 1
            : 1;
          const loopPrefix = (typeof i18n !== 'undefined') ? i18n.t('canvas_loop_prefix') : 'L';
          ctx.font = `${Math.round(9 * this.exportScale)}px monospace`;
          ctx.fillText(`${loopPrefix}${loopNum}`, x + 3 * this.exportScale, 11 * this.exportScale);
        } else {
          const measurePrefix = (typeof i18n !== 'undefined') ? i18n.t('canvas_measure_prefix') : 'M';
          ctx.font = `${Math.round(10 * this.exportScale)}px monospace`;
          ctx.fillText(`${measurePrefix}${b.measureIdx + 1}`, x + 3 * this.exportScale, 11 * this.exportScale);
        }

      } else {
        // ── PASSE SUR : tempo (vert) sur TOUTES les positions, y compris boucle/mesure ──
        if (!this.showBeatMarkers) continue;

        const lineH = H * this.beatBarHeight * this.amplitudeScale * 2.0;
        ctx.globalAlpha = this.beatOpacity;
        ctx.strokeStyle = this.markerColorBeat;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(x, (H - lineH) / 2);
        ctx.lineTo(x, (H + lineH) / 2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawBoundaryMarkers(ctx, W, H) {
    const es = this.exportScale;
    const boundaries = [
      { time: 0,             color: '#ffffff', label: (typeof i18n !== 'undefined' ? i18n.t('canvas_start') : 'START') },
      { time: this.duration, color: '#ffffff', label: (typeof i18n !== 'undefined' ? i18n.t('canvas_end')   : 'END')   },
    ];

    for (const { time, color, label } of boundaries) {
      const x = this.timeToX(time);
      if (x < -2 || x > W + 2) continue;

      // Trait vertical pleine hauteur
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2 * es;
      ctx.setLineDash([5 * es, 3 * es]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Étiquette
      ctx.globalAlpha = 0.9;
      ctx.fillStyle   = color;
      ctx.font        = `bold ${Math.round(11 * es)}px monospace`;
      ctx.textAlign   = time === 0 ? 'left' : 'right';
      ctx.fillText(label, time === 0 ? x + 4 * es : x - 4 * es, H - 6 * es);
      ctx.restore();
    }
  }

  _drawSectionLabels(ctx, W, H) {
    // Dessiné dans le canvas de la règle : position y = haut de la règle
    if (this.measureColors.size === 0 || this.brushPalette.length === 0) return;

    const visibleMeasures = this._getVisibleMeasureRanges(W);
    if (visibleMeasures.length === 0) return;

    const es = this.exportScale;
    ctx.save();
    ctx.font      = `bold ${Math.round(9 * es)}px monospace`;
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
      const x       = xStart + 3 * es;
      const y       = 9 * es; // haut de la règle

      const metrics = ctx.measureText(label);
      const tw      = metrics.width + 6 * es;

      // Petit rectangle coloré fond
      ctx.globalAlpha = 0.85;
      ctx.fillStyle   = color;
      ctx.fillRect(x - 2 * es, y - 8 * es, tw, 11 * es);

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
    const W   = this._cW();
    const H   = this._crH();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    if (!this.audioBuffer) return;

    const es = this.exportScale;
    ctx.fillStyle   = '#555';
    ctx.strokeStyle = '#444';
    ctx.font        = `${Math.round(9 * es)}px monospace`;
    ctx.textAlign   = 'left';

    const visD = this.visibleDuration;
    const pps  = W / visD;

    // Choisir un bon intervalle de ticks
    const niceIntervals = [
      0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5,
      1, 2, 5, 10, 15, 30, 60, 120, 300
    ];
    const minPxBetweenTicks = 50 * es;
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
      ctx.lineWidth   = 1 * es;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();

      ctx.fillStyle = '#555';
      ctx.fillText(this._formatTime(t, interval), x + 3 * es, H - 4 * es);
    }

    // Sub-ticks
    const subInterval = interval / 4;
    if (subInterval * pps > 8 * es) {
      const subFirst = Math.ceil(startT / subInterval) * subInterval;
      for (let t = subFirst; t <= endT; t += subInterval) {
        // Sauter les ticks principaux
        if (Math.abs(t % interval) < 1e-9) continue;
        const x = (t - startT) * pps;
        ctx.strokeStyle = '#222';
        ctx.lineWidth   = 1 * es;
        ctx.beginPath();
        ctx.moveTo(x, H / 2);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
    }

    // Playhead sur la règle
    if (!this.exportMode) {
      const phX = (this.playheadTime - startT) * pps;
      if (phX >= 0 && phX <= W) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(phX - 0.5, 0, 1, H);
      }
    }

    // Barre pointillée du marqueur de clic
    if (!this.exportMode && !this._pinDrag.active && this.clickMarkerTime !== null) {
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
    const es     = this.exportScale;
    const r      = 7 * es;      // rayon de la partie circulaire
    const cY     = H - r - 1 * es; // centre du cercle (bas)
    const tipY   = 1 * es;         // pointe haute

    for (const pin of this.pins) {
      const x      = (pin.time - startT) * pps;
      if (x < -r - 4 || x > W + r + 4) continue;

      const locked = (pin.time === this.lockedPinTime);
      const color  = pin.color || '#ffffff';

      // ─ Halo de base coloré (pulsant si verrouillé)
      if (locked) {
        const pulse     = 0.5 + 0.5 * Math.sin(performance.now() * 0.002618);
        ctx.shadowColor = color;
        ctx.shadowBlur  = (18 + 10 * pulse) * es;
      } else {
        ctx.shadowColor = color;
        ctx.shadowBlur  = 14 * es;
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
      if (locked && !this.exportMode) {
        const pulse   = 0.5 + 0.5 * Math.sin(performance.now() * 0.002618);
        ctx.shadowColor = color;
        ctx.shadowBlur  = (10 + 8 * pulse) * es;
        ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.20 * pulse})`;
        ctx.lineWidth   = 2.5 * es;
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
      this._lastBrushX    = null;
      this._brushCursorEl.style.display = 'none';
      // Annuler le drag sans seek quand le curseur sort
      if (this._drag.active) {
        this._drag.active = false;
        this._drag.moved  = false;
        this.waveCanvas.style.cursor = 'crosshair';
      }
      // Annuler le pan clic molette aussi
      if (this._midDrag && this._midDrag.active) {
        this._midDrag.active = false;
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
    // Clic molette (button=1) : pan tempéraire, même en mode pinceau
    if (e.button === 1) {
      e.preventDefault();
      this._midDrag = { active: true, startX: this._getClientX(this.waveCanvas, e), startScroll: this.scrollTime };
      this._brushCursorEl.style.display = 'none';  // masquer pendant le pan
      return;
    }
    if (this.paintBrushMode) {
      if (e.button === 0) {
        if (this.onBrushStrokeStart) this.onBrushStrokeStart();
        this._brushPainting = true;
        const x = this._getClientX(this.waveCanvas, e);
        this._paintMeasureAtX(x);
        this._lastBrushX = x;
      } else if (e.button === 2) {
        // Clic droit : démarrer l'effacement continu par glisser
        if (this.onBrushStrokeStart) this.onBrushStrokeStart();
        this._brushErasing = true;
        const x    = this._getClientX(this.waveCanvas, e);
        const time = this.xToTime(x);
        if (time >= 0 && time <= this.duration) {
          this.measureColors.delete(this.getMeasureAtTime(time));
          this._dirty = true;
        }
        this._lastBrushX = x;
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
    // Pan via clic molette (prioritaire)
    if (this._midDrag && this._midDrag.active) {
      const dx = this._getClientX(this.waveCanvas, e) - this._midDrag.startX;
      this.scrollTime = this._midDrag.startScroll - dx / this.pixelsPerSecond;
      this._clampScroll();
      this._dirty = true;
      this.waveCanvas.style.cursor = 'grabbing';
      return;
    }
    if (this.spaceSeekMode) {
      this._spaceSeekCursorX = this._getClientX(this.waveCanvas, e);
      this._dirty = true;
    }
    if (this.paintBrushMode) {
      // Curseur ligne verticale : mise à jour directe DOM (zéro latence)
      const x = this._getClientX(this.waveCanvas, e);
      this._brushCursorEl.style.left       = (x - 1) + 'px';
      this._brushCursorEl.style.background = this.paintBrushColor;
      this._brushCursorEl.style.display    = 'block';
      if (this._brushPainting) {
        if (this._lastBrushX !== null) {
          // Interpoler : peindre toutes les mesures entre lastBrushX et x
          const t0 = this.xToTime(this._lastBrushX);
          const t1 = this.xToTime(x);
          const tA = Math.max(0, Math.min(this.duration, Math.min(t0, t1)));
          const tB = Math.max(0, Math.min(this.duration, Math.max(t0, t1)));
          const m0 = this.getMeasureAtTime(tA);
          const m1 = this.getMeasureAtTime(tB);
          for (let m = m0; m <= m1; m++) this._paintMeasureAtIndex(m);
        } else {
          this._paintMeasureAtX(x);
        }
        this._lastBrushX = x;
      } else if (this._brushErasing) {
        if (this._lastBrushX !== null) {
          // Interpoler : effacer toutes les mesures entre lastBrushX et x
          const t0 = this.xToTime(this._lastBrushX);
          const t1 = this.xToTime(x);
          const tA = Math.max(0, Math.min(this.duration, Math.min(t0, t1)));
          const tB = Math.max(0, Math.min(this.duration, Math.max(t0, t1)));
          const m0 = this.getMeasureAtTime(tA);
          const m1 = this.getMeasureAtTime(tB);
          for (let m = m0; m <= m1; m++) {
            if (this.measureColors.has(m)) { this.measureColors.delete(m); this._dirty = true; }
          }
        } else {
          const time = this.xToTime(x);
          if (time >= 0 && time <= this.duration) {
            const mIdx = this.getMeasureAtTime(time);
            if (this.measureColors.has(mIdx)) { this.measureColors.delete(mIdx); this._dirty = true; }
          }
        }
        this._lastBrushX = x;
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
    // Relâchement clic molette
    if (e.button === 1 && this._midDrag) {
      this._midDrag.active = false;
      // Restaurer le curseur selon le mode actif (app.js gère le curseur pinceau)
      this.waveCanvas.style.cursor = 'crosshair';
      return;
    }
    if (this.paintBrushMode) {
      this._brushPainting = false;
      this._brushErasing  = false;
      this._lastBrushX    = null;
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
          if (this.onPinChange) this.onPinChange();
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
        if (this.onPinChange) this.onPinChange();
        this._dirty = true;
        return;
      }
    }

    // Priorité 3 : nouveau pin à l'endroit cliqué
    const t = this.xToTime(x);
    const clamped = Math.max(0, Math.min(this.duration, t));
    this.pins.push({ time: clamped, color: this._randomPinColor() });
    if (this.onPinChange) this.onPinChange();
    this._dirty = true;
  }

  _onRulerMouseUp(e) {
    if (!this._pinDrag.active) return;
    if (!this._pinDrag.moved) {
      // Clic court → popup
      if (this.onPinClick) this.onPinClick(this._pinDrag.idx, e.clientX, e.clientY);
    } else {
      // Fin de drag → notifier
      if (this.onPinChange) this.onPinChange();
    }
    this._pinDrag.active = false;
    this._pinDrag.moved  = false;
    this.rulerCanvas.style.cursor = 'default';
    this._dirty = true;
  }

  _paintMeasureAtIndex(mIdx) {
    const color = this.paintBrushColor;
    if (this.measureColors.get(mIdx) === color) return;
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

  _paintMeasureAtX(x) {
    const time = this.xToTime(x);
    if (time < 0 || time > this.duration) return;
    this._paintMeasureAtIndex(this.getMeasureAtTime(time));
  }

  _seekToX(x) {
    const t = this.xToTime(x);
    const clamped = Math.max(0, Math.min(this.duration, t));
    if (this.onSeek) this.onSeek(clamped);
  }

  _onWheel(e) {
    e.preventDefault();
    if (!this.audioBuffer) return;

    const pivot = this.xToTime(this._getClientX(this.waveCanvas, e));

    if (e.deltaY < 0) this.zoomIn(1.25, pivot);
    else               this.zoomOut(1.25, pivot);
  }

  /* ── Helpers ────────────────────────────────────── */

  _formatTime(sec, interval = 1) {
    const sign = sec < 0 ? '-' : '';
    const abs  = Math.abs(sec);
    const m    = Math.floor(abs / 60);
    const s    = abs % 60;         // secondes avec décimales
    const sInt = Math.floor(s);
    const mm   = String(m).padStart(1, '0');
    const ss   = String(sInt).padStart(2, '0');

    // Précision déterminée par l'intervalle entre ticks
    if (interval >= 1) {
      // Précision à la seconde
      if (abs >= 60) return `${sign}${mm}m${ss}s`;
      return `${sign}${sInt}s`;
    }
    if (interval >= 0.1) {
      // 1 décimale
      const d1 = Math.floor((s % 1) * 10);
      if (abs >= 60) return `${sign}${mm}m${ss}.${d1}s`;
      return `${sign}${sInt}.${d1}s`;
    }
    if (interval >= 0.01) {
      // 2 décimales
      const d2 = String(Math.floor((s % 1) * 100)).padStart(2, '0');
      if (abs >= 60) return `${sign}${mm}m${ss}.${d2}s`;
      return `${sign}${sInt}.${d2}s`;
    }
    // < 10ms : millisecondes
    const ms = Math.round((s % 1) * 1000);
    if (abs >= 60) return `${sign}${mm}m${ss}.${String(ms).padStart(3, '0')}s`;
    return `${sign}${sInt}.${String(ms).padStart(3, '0')}s`;
  }

  markDirty() { this._dirty = true; }

  _randomPinColor() {
    // Rotation par angle d'or : chaque nouvelle couleur est à ~137.5° de la précédente
    const GOLDEN_ANGLE = 137.508;
    const hue = Math.round(this._pinNextHue);
    this._pinNextHue = (this._pinNextHue + GOLDEN_ANGLE) % 360;
    // Retourne du hex pour compatibilité <input type="color"> et canvas
    return this._hslToHex(hue, 78, 62);
  }

  _hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const x = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
  }
}
