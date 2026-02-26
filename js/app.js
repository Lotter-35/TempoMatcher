/**
 * App — contrôleur principal de TempoMatcher
 */
(function () {
  'use strict';

  /* ══ Instances ══════════════════════════════════════════════════ */

  const audio    = new AudioEngine();
  const metro    = new Metronome();
  const waveform = new WaveformRenderer(
    document.getElementById('waveform-canvas'),
    document.getElementById('ruler-canvas'),
    metro
  );

  /* ══ Éléments DOM ═══════════════════════════════════════════════ */

  const $  = id => document.getElementById(id);

  const dropOverlay    = $('drop-overlay');
  const fileInput      = $('file-input');
  const btnLoad        = $('btn-load-file');
  const fileName       = $('file-name');
  const loadingOverlay = $('loading-overlay');
  const loadingBar     = $('loading-bar');
  const loadingLabel   = $('loading-label');

  const btnPlay        = $('btn-play');
  const btnStop        = $('btn-stop');
  const btnLoop        = $('btn-loop');
  const iconPlay       = $('icon-play');
  const iconPause      = $('icon-pause');
  const timeCurrent    = $('time-current');
  const timeTotal      = $('time-total');
  const volumeSlider   = $('volume-slider');
  const volumePct      = $('volume-pct');

  const btnZoomIn      = $('btn-zoom-in');
  const btnZoomOut     = $('btn-zoom-out');
  const btnZoomFit     = $('btn-zoom-fit');
  const zoomLabel      = $('zoom-label');

  const bpmSlider      = $('bpm-slider');
  const bpmInput       = $('bpm-input');
  const bpmDecBig      = $('bpm-dec-big');
  const bpmDec         = $('bpm-dec');
  const bpmInc         = $('bpm-inc');
  const bpmIncBig      = $('bpm-inc-big');
  const btnTap         = $('btn-tap');
  const btnDetect      = $('btn-detect');
  const btnBpmHalf     = $('btn-bpm-half');
  const btnBpmDouble   = $('btn-bpm-double');

  const beatsPerMeasureGroup   = $('beats-per-measure');
  const measuresPerLoopGroup   = $('measures-per-loop');
  const loopsPerGroupGroup      = $('loops-per-group');

  const offsetSlider   = $('offset-slider');
  const offsetInput    = $('offset-input');
  const offsetDec      = $('offset-dec');
  const offsetInc      = $('offset-inc');

  const btnMetroToggle = $('btn-metro-toggle');
  const metroVolSlider = $('metro-vol-slider');
  const metroVolPct    = $('metro-vol-pct');

  const amplitudeSlider  = $('amplitude-slider');
  const amplitudePct     = $('amplitude-pct');
  const waveColorPicker  = $('wave-color-picker');
  const waveOpacitySlider= $('wave-opacity-slider');
  const waveOpacityPct   = $('wave-opacity-pct');

  const btnShowLoop    = $('btn-show-loop');
  const btnShowMeasure = $('btn-show-measure');
  const btnShowBeat    = $('btn-show-beat');

  /* ══ État ═══════════════════════════════════════════════════════ */

  let audioLoaded  = false;
  let rafUpdate    = null;

  /* ══ Tap tempo ══════════════════════════════════════════════════ */

  const TAP_MAX_GAP_MS = 2500;
  let tapTimes = [];

  /* ══ Helpers ════════════════════════════════════════════════════ */

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00.000';
    const m   = Math.floor(sec / 60);
    const s   = Math.floor(sec % 60);
    const ms  = Math.floor((sec % 1) * 1000);
    return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function clampBPM(v) { return Math.max(20, Math.min(320, v)); }

  function updateOffsetRange() {
    const loopDuration = (60 / metro.bpm) * metro.beatsPerMeasure * metro.measuresPerLoop;
    const range = Math.round(loopDuration * 1000) / 1000;
    offsetSlider.min = -range;
    offsetSlider.max =  range;
    offsetInput.min  = -range;
    offsetInput.max  =  range;
  }

  function setBPM(bpm) {
    bpm = Math.round(bpm * 10) / 10;
    bpm = clampBPM(bpm);
    metro.bpm      = bpm;
    bpmSlider.value = bpm;
    bpmInput.value  = bpm;
    updateOffsetRange();

    // Resync métronome si en lecture
    resyncMetronome();
    waveform.markDirty();
  }

  function setOffset(offset) {
    offset = Math.round(offset * 1000) / 1000;
    offset = Math.max(parseFloat(offsetSlider.min), Math.min(parseFloat(offsetSlider.max), offset));
    metro.offset          = offset;
    offsetSlider.value    = offset;
    offsetInput.value     = offset.toFixed(3);

    resyncMetronome();
    waveform.markDirty();
  }

  function resyncMetronome() {
    if (!audio.isPlaying) return;
    const info = audio.getSyncInfo();
    if (!info) return;
    metro.resync(audio.audioContext, info.audioStartTime, info.playbackStartPos);
  }

  function updateZoomLabel() {
    zoomLabel.textContent = Math.round(waveform.zoom * 100) + '%';
  }

  function showLoading(msg, progress) {
    loadingOverlay.classList.add('visible');
    loadingLabel.textContent = msg;
    loadingBar.style.width   = (progress * 100) + '%';
  }

  function hideLoading() {
    loadingOverlay.classList.remove('visible');
  }

  function setTransportEnabled(on) {
    btnPlay.disabled = !on;
    btnStop.disabled = !on;
    btnLoop.disabled = !on;
  }

  function updatePlayIcons() {
    if (audio.isPlaying) {
      iconPlay.style.display  = 'none';
      iconPause.style.display = '';
    } else {
      iconPlay.style.display  = '';
      iconPause.style.display = 'none';
    }
  }

  /* ══ Boucle d'affichage temps ═══════════════════════════════════ */

  function startUpdateLoop() {
    if (rafUpdate) return;
    const loop = () => {
      const ct = audio.currentTime;
      timeCurrent.textContent = formatTime(ct);

      waveform.playheadTime = ct;
      waveform.isPlaying    = audio.isPlaying;

      if (audio.isPlaying) waveform.followPlayhead();

      rafUpdate = requestAnimationFrame(loop);
    };
    rafUpdate = requestAnimationFrame(loop);
  }

  /* ══ Chargement fichier ═════════════════════════════════════════ */

  async function loadAudioFile(file) {
    if (!file || !file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) {
      alert('Format non supporté. Utilisez MP3, WAV, OGG, FLAC ou AAC.');
      return;
    }

    showLoading('Chargement…', 0);

    audio.onLoading = p => {
      showLoading(p < 0.5 ? 'Lecture du fichier…' : 'Décodage audio…', p);
      loadingBar.style.width = (p * 100) + '%';
    };

    try {
      await audio.loadFile(file);
    } catch (err) {
      hideLoading();
      alert(err.message);
      return;
    }

    hideLoading();
    audioLoaded = true;

    fileName.textContent    = file.name;
    timeTotal.textContent   = formatTime(audio.duration);
    timeCurrent.textContent = formatTime(0);

    dropOverlay.classList.add('hidden');
    setTransportEnabled(true);

    waveform.setAudio(audio.audioBuffer);
    startUpdateLoop();

    // Auto-détection BPM
    btnDetect.disabled = true;
    showLoading('Détection BPM…', 0.95);
    try {
      const detectedBPM = await detectBPM(audio.audioBuffer);
      setBPM(detectedBPM);
    } catch (_) {
      // silencieux
    } finally {
      btnDetect.disabled = false;
      hideLoading();
    }
  }

  /* ══ Drag & Drop ════════════════════════════════════════════════ */

  const dropTarget = document.getElementById('waveform-section');

  document.addEventListener('dragover',  e => { e.preventDefault(); });
  document.addEventListener('dragleave', e => { dropOverlay.classList.remove('drag-over'); });

  dropTarget.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
    dropOverlay.classList.remove('hidden');
    dropOverlay.classList.add('drag-over');
  });

  dropTarget.addEventListener('dragleave', e => {
    dropOverlay.classList.remove('drag-over');
    if (audioLoaded) dropOverlay.classList.add('hidden');
  });

  dropTarget.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    dropOverlay.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) loadAudioFile(f);
  });

  // Glisser n'importe où sur la page si pas de fichier chargé
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (!audioLoaded) {
      const f = e.dataTransfer.files[0];
      if (f) loadAudioFile(f);
    }
  });

  btnLoad.addEventListener('click', () => fileInput.click());

  // Cliquer sur l'overlay (zone noire au démarrage) → ouvrir le sélecteur de fichier
  dropOverlay.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadAudioFile(fileInput.files[0]);
  });

  /* ══ Transport ══════════════════════════════════════════════════ */

  btnPlay.addEventListener('click', () => {
    if (!audioLoaded) return;
    if (audio.isPlaying) {
      audio.pause();
      metro.stop();
    } else {
      const info = audio.play();
      if (info) {
        metro.start(audio.audioContext, info.audioStartTime, info.playbackStartPos);
      }
    }
    updatePlayIcons();
  });

  btnStop.addEventListener('click', () => {
    if (!audioLoaded) return;
    audio.stop();
    metro.stop();
    waveform.playheadTime = 0;
    waveform.isPlaying    = false;
    timeCurrent.textContent = formatTime(0);
    updatePlayIcons();
    waveform.markDirty();
  });

  audio.onEnded = () => {
    metro.stop();
    waveform.isPlaying    = false;
    waveform.playheadTime = 0;
    updatePlayIcons();
    waveform.markDirty();
  };

  // Seek depuis la waveform
  waveform.onSeek = (time) => {
    const wasPlaying = audio.isPlaying;
    const info = audio.seek(time);
    if (wasPlaying && info) {
      metro.start(audio.audioContext, info.audioStartTime, info.playbackStartPos);
    } else if (!wasPlaying) {
      metro.stop();
    }
    waveform.playheadTime = time;
    waveform.markDirty();
  };

  /* ══ Volume ═════════════════════════════════════════════════════ */

  function pct(v) { return Math.round(v * 100) + '%'; }

  volumeSlider.addEventListener('input', () => {
    const v = parseFloat(volumeSlider.value);
    audio.setVolume(v);
    volumePct.textContent = pct(v);
  });

  /* ══ Zoom ════════════════════════════════════════════════════════ */

  btnZoomIn.addEventListener('click', () => {
    waveform.zoomIn(); updateZoomLabel();
  });
  btnZoomOut.addEventListener('click', () => {
    waveform.zoomOut(); updateZoomLabel();
  });
  btnZoomFit.addEventListener('click', () => {
    waveform.zoomFit(); updateZoomLabel();
  });

  // Mettre à jour le label de zoom lors du zoom molette
  const _origZoomIn  = waveform.zoomIn.bind(waveform);
  const _origZoomOut = waveform.zoomOut.bind(waveform);
  waveform.zoomIn  = (...args) => { _origZoomIn(...args);  updateZoomLabel(); };
  waveform.zoomOut = (...args) => { _origZoomOut(...args); updateZoomLabel(); };

  /* ══ BPM ═════════════════════════════════════════════════════════ */

  bpmSlider.addEventListener('input', () => setBPM(parseFloat(bpmSlider.value)));

  bpmInput.addEventListener('change', () => setBPM(parseFloat(bpmInput.value) || 120));
  bpmInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') setBPM(parseFloat(bpmInput.value) || 120);
  });

  bpmDecBig.addEventListener('click', () => setBPM(metro.bpm - 5));
  bpmDec.addEventListener('click',    () => setBPM(metro.bpm - 1));
  bpmInc.addEventListener('click',    () => setBPM(metro.bpm + 1));
  bpmIncBig.addEventListener('click', () => setBPM(metro.bpm + 5));
  btnBpmHalf.addEventListener('click',   () => setBPM(metro.bpm / 2));
  btnBpmDouble.addEventListener('click', () => setBPM(metro.bpm * 2));

  /* ── Tap tempo ────────────────────────────────────────────────── */

  btnTap.addEventListener('click', () => {
    const now = performance.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > TAP_MAX_GAP_MS) {
      tapTimes = [];
    }
    tapTimes.push(now);

    if (tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimes.length; i++) {
        intervals.push(tapTimes[i] - tapTimes[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = 60000 / avg;
      setBPM(bpm);
    }

    // Flash visuel
    btnTap.style.background = '#2a5a3a';
    setTimeout(() => { btnTap.style.background = ''; }, 80);
  });

  /* ── Auto-détect BPM ──────────────────────────────────────────── */

  btnDetect.addEventListener('click', async () => {
    if (!audioLoaded) return;
    btnDetect.disabled = true;
    try {
      const bpm = await detectBPM(audio.audioBuffer);
      setBPM(bpm);
    } catch (e) {
      // silencieux
    } finally {
      btnDetect.disabled = false;
    }
  });

  /* ══ Armure rythmique ════════════════════════════════════════════ */

  function initSegBtnGroup(container, onChange) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      container.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(parseInt(btn.dataset.val, 10));
    });
  }

  initSegBtnGroup(beatsPerMeasureGroup, val => {
    metro.beatsPerMeasure = val;
    updateOffsetRange();
    resyncMetronome();
    waveform.markDirty();
  });

  initSegBtnGroup(measuresPerLoopGroup, val => {
    metro.measuresPerLoop = val;
    updateOffsetRange();
    resyncMetronome();
    waveform.markDirty();
  });

  initSegBtnGroup(loopsPerGroupGroup, val => {
    waveform.loopsPerGroup = val;
    waveform.markDirty();
  });

  /* ══ Offset ══════════════════════════════════════════════════════ */

  offsetSlider.addEventListener('input', () => setOffset(parseFloat(offsetSlider.value)));

  offsetInput.addEventListener('change', () => setOffset(parseFloat(offsetInput.value) || 0));
  offsetInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') setOffset(parseFloat(offsetInput.value) || 0);
  });

  offsetDec.addEventListener('click', () => setOffset(metro.offset - 0.010));
  offsetInc.addEventListener('click', () => setOffset(metro.offset + 0.010));

  /* ══ Métronome toggle & volume ═══════════════════════════════════ */

  btnMetroToggle.addEventListener('click', () => {
    metro.enabled = !metro.enabled;
    btnMetroToggle.textContent = metro.enabled ? 'ON' : 'OFF';
    btnMetroToggle.classList.toggle('off', !metro.enabled);
  });

  metroVolSlider.addEventListener('input', () => {
    const v = parseFloat(metroVolSlider.value);
    metro.volume = v;
    metroVolPct.textContent = pct(v);
  });

  /* ══ Bouton Loop ════════════════════════════════════════════════════ */

  btnLoop.addEventListener('click', () => {
    audio.loopEnabled = !audio.loopEnabled;
    btnLoop.classList.toggle('active', audio.loopEnabled);
  });

  // Quand la boucle redémarre, resync le métronome
  audio.onLoop = (info) => {
    if (info) metro.start(audio.audioContext, info.audioStartTime, info.playbackStartPos);
    updatePlayIcons();
    waveform.isPlaying = true;
  };

  /* ══ Amplitude waveform ═════════════════════════════════════════════ */

  amplitudeSlider.addEventListener('input', () => {
    const v = parseFloat(amplitudeSlider.value);
    waveform.amplitudeScale = v;
    amplitudePct.textContent = pct(v);
    waveform.markDirty();
  });

  /* ══ Couleur & opacité waveform ══════════════════════════════════════ */

  waveColorPicker.addEventListener('input', () => {
    const hex = waveColorPicker.value;
    waveform.waveColorStroke = hex;
    // Fill : même couleur mais plus sombre (50% luminosité réduite via opacity)
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    waveform.waveColorFill = `rgb(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)})`;
    waveform.markDirty();
  });

  waveOpacitySlider.addEventListener('input', () => {
    const v = parseFloat(waveOpacitySlider.value);
    waveform.waveOpacity = v;
    waveOpacityPct.textContent = pct(v);
    waveform.markDirty();
  });

  /* ══ Visibilité marqueurs ═══════════════════════════════════════════════ */

  function markerToggle(btn, prop) {
    btn.addEventListener('click', () => {
      waveform[prop] = !waveform[prop];
      btn.classList.toggle('active', waveform[prop]);
      btn.classList.toggle('off',   !waveform[prop]);
      waveform.markDirty();
    });
  }

  markerToggle(btnShowLoop,    'showLoopMarkers');
  markerToggle(btnShowMeasure, 'showMeasureMarkers');
  markerToggle(btnShowBeat,    'showBeatMarkers');

  // Couleurs des marqueurs
  const colorLoop    = $('color-loop');
  const colorMeasure = $('color-measure');
  const colorBeat    = $('color-beat');

  colorLoop.addEventListener('input', () => {
    waveform.markerColorLoop = colorLoop.value;
    waveform.markDirty();
  });
  colorMeasure.addEventListener('input', () => {
    waveform.markerColorMeasure = colorMeasure.value;
    waveform.markDirty();
  });
  colorBeat.addEventListener('input', () => {
    waveform.markerColorBeat = colorBeat.value;
    waveform.markDirty();
  });

  /* ══ BPM Detection via autocorrélation ══════════════════════════ */

  function detectBPM(buffer) {
    return new Promise((resolve, reject) => {
      try {
        // Travail sur le premier canal, échantillonner à 22050 Hz si possible
        const sampleRate  = buffer.sampleRate;
        const srcData     = buffer.getChannelData(0);

        // Utiliser au max 30 secondes de début du morceau
        const maxSamples = Math.min(srcData.length, sampleRate * 30);

        // Décimer si trop de données (réduire à ~8000 Hz)
        const decFactor   = Math.max(1, Math.floor(sampleRate / 8000));
        const decSamples  = Math.ceil(maxSamples / decFactor);
        const decRate     = sampleRate / decFactor;

        const data = new Float32Array(decSamples);
        for (let i = 0; i < decSamples; i++) {
          data[i] = srcData[i * decFactor];
        }

        // Enveloppe : RMS sur fenêtres de 10ms
        const winSize = Math.round(decRate * 0.010);
        const envLen  = Math.floor(decSamples / winSize);
        const env     = new Float32Array(envLen);
        for (let i = 0; i < envLen; i++) {
          let s = 0;
          const base = i * winSize;
          for (let j = 0; j < winSize && base + j < decSamples; j++) {
            s += data[base + j] * data[base + j];
          }
          env[i] = Math.sqrt(s / winSize);
        }

        // Onset strength : différence positive
        const onset = new Float32Array(envLen);
        for (let i = 1; i < envLen; i++) {
          onset[i] = Math.max(0, env[i] - env[i - 1]);
        }

        // Autocorrélation de onset pour trouver le BPM
        const envRate = decRate / winSize; // en « frames » par seconde
        const minBPM  = 60,  maxBPM = 200;
        const minLag  = Math.floor(envRate * 60 / maxBPM);
        const maxLag  = Math.ceil(envRate  * 60 / minBPM);
        const lagN    = maxLag - minLag + 1;

        const acor = new Float32Array(lagN);
        const N    = Math.min(envLen, 8000); // limiter le calcul

        let bestAcor = -Infinity, bestLag = minLag;

        for (let li = 0; li < lagN; li++) {
          const lag = minLag + li;
          let s = 0;
          for (let i = 0; i < N - lag; i++) {
            s += onset[i] * onset[i + lag];
          }
          // Normaliser par harmonique inférieure (évite de rater la demie-fois)
          acor[li] = s;
          if (s > bestAcor) { bestAcor = s; bestLag = lag; }
        }

        // Vérifier la demi-période (double-tempo)
        const halfLag = Math.round(bestLag / 2);
        if (halfLag >= minLag && halfLag <= maxLag) {
          const halfIdx = halfLag - minLag;
          if (acor[halfIdx] > bestAcor * 0.9) {
            bestLag = halfLag;
          }
        }

        const bpm = (envRate * 60) / bestLag;
        resolve(Math.round(bpm * 10) / 10);
      } catch (e) {
        reject(e);
      }
    });
  }

  /* ══ Resize waveform section ═══════════════════════════════════ */

  const waveSection   = document.getElementById('waveform-section');
  const resizeHandle  = document.getElementById('wave-resize-handle');
  const MIN_WAVE_H    = 60;
  const MAX_WAVE_H    = 600;

  let _resizing      = false;
  let _resizeStartY  = 0;
  let _resizeStartH  = 0;

  resizeHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    _resizing      = true;
    _resizeStartY  = e.clientY;
    _resizeStartH  = waveSection.offsetHeight;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor     = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!_resizing) return;
    const dy   = e.clientY - _resizeStartY;
    const newH = Math.max(MIN_WAVE_H, Math.min(MAX_WAVE_H, _resizeStartH + dy));
    waveSection.style.height = newH + 'px';
    waveform.markDirty();
  });

  document.addEventListener('mouseup', () => {
    if (!_resizing) return;
    _resizing = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    waveform.markDirty();
  });

  /* ══ Double-clic sliders → valeur initiale ═══════════════════════ */

  function dblReset(slider, defaultVal, onReset) {
    slider.addEventListener('dblclick', () => {
      slider.value = defaultVal;
      onReset(defaultVal);
    });
  }

  dblReset(bpmSlider,         120,   v => setBPM(v));
  dblReset(offsetSlider,        0,   v => setOffset(v));
  dblReset(volumeSlider,      0.8,   v => { audio.setVolume(v); volumePct.textContent = pct(v); });
  dblReset(metroVolSlider,    1.0,   v => { metro.volume = v; metroVolPct.textContent = pct(v); });
  dblReset(amplitudeSlider,   0.5,   v => { waveform.amplitudeScale = v; amplitudePct.textContent = pct(v); waveform.markDirty(); });
  dblReset(waveOpacitySlider,   1,   v => { waveform.waveOpacity = v; waveOpacityPct.textContent = pct(v); waveform.markDirty(); });

  // Initialiser les labels avec les valeurs par défaut
  amplitudePct.textContent   = pct(0.5);
  volumePct.textContent      = pct(0.8);
  metroVolPct.textContent    = pct(1.0);

  /* ══ Clavier ═════════════════════════════════════════════════════ */

  document.addEventListener('keydown', e => {
    // Ignorer si focus sur un input
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        btnPlay.click();
        break;
      case 'KeyS':
        btnStop.click();
        break;
      case 'Equal':
      case 'NumpadAdd':
        waveform.zoomIn(); updateZoomLabel();
        break;
      case 'Minus':
      case 'NumpadSubtract':
        waveform.zoomOut(); updateZoomLabel();
        break;
      case 'KeyF':
        waveform.zoomFit(); updateZoomLabel();
        break;
      case 'ArrowLeft':
        if (audioLoaded) {
          const t = Math.max(0, audio.currentTime - (e.shiftKey ? 5 : 1));
          waveform.onSeek(t);
        }
        break;
      case 'ArrowRight':
        if (audioLoaded) {
          const t = Math.min(audio.duration, audio.currentTime + (e.shiftKey ? 5 : 1));
          waveform.onSeek(t);
        }
        break;
    }
  });

  /* ══ Init ════════════════════════════════════════════════════════ */

  updateZoomLabel();
  updateOffsetRange();
  setTransportEnabled(false);
  startUpdateLoop();

  console.log('[TempoMatcher] Prêt.');
})();
