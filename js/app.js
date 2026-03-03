// ══ Molette sur sliders (incréments adaptés) ═════════════════════════════════
document.addEventListener('wheel', function(e) {
  const slider = e.target.closest('input[type="range"]');
  if (!slider) return;
  if (slider.disabled) return;
  e.preventDefault();
  let step = parseFloat(slider.step) || 1;
  let min = parseFloat(slider.min);
  let max = parseFloat(slider.max);
  let val = parseFloat(slider.value);
  let delta = e.deltaY > 0 ? -1 : 1;

  // BPM
  if (slider.id === 'bpm-slider') {
    step = 1;
  }
  // Offset
  else if (slider.id === 'offset-slider') {
    step = 0.010;
  }
  // Pourcentages (volume, amplitude, opacités, hauteurs)
  // Tous ces sliders affichent valeur × 100 = %, donc 5 points de % = 0.05 raw,
  // qu'ils aillent jusqu'à 100% (max=1) ou 400% (max=4).
  let snapStep = null;
  if (
    slider.id === 'volume-slider' ||
    slider.id === 'metro-vol-slider' ||
    slider.id === 'vol-panel-slider' ||
    slider.id.endsWith('opacity-slider') ||
    slider.id.endsWith('height-slider') ||
    slider.id === 'amplitude-slider'
  ) {
    step = 0.05; // toujours 5 points de % (0.05 × 100 = 5%)
    snapStep = 0.05;
  }

  // Appliquer — avec snap au multiple de step pour les sliders en %
  let newVal;
  if (snapStep !== null) {
    // Si la valeur courante n'est pas déjà un multiple de snapStep,
    // on saute au prochain multiple dans la direction voulue
    // (ε = 1e-9 pour absorber les erreurs flottantes)
    const eps = 1e-9;
    if (delta > 0) {
      newVal = (Math.floor(val / snapStep + eps) + 1) * snapStep;
    } else {
      newVal = (Math.ceil(val / snapStep - eps) - 1) * snapStep;
    }
    // Arrondi à 10 décimales pour éviter les résidus flottants (ex: 0.30000000004)
    newVal = Math.round(newVal / snapStep) * snapStep;
  } else {
    newVal = val + step * delta;
  }
  newVal = Math.max(min, Math.min(max, newVal));
  slider.value = newVal;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}, { passive: false });
/**
 * App — contrôleur principal de TempoMatcher
 */
(function () {
  'use strict';

  /* ══ Persistance navigateur (localStorage) ══════════════════════ */
  /**
   * TM_Storage — module de persistance modulaire par section.
   * Chaque section est une clé indépendante dans un objet JSON stocké
   * sous la clé localStorage 'tempomatcher_prefs'.
   * Pour ajouter une nouvelle section, appeler simplement :
   *   TM_Storage.save('maSectionId', data)
   *   TM_Storage.load('maSectionId')
   */
  const TM_Storage = (() => {
    const STORAGE_KEY = 'tempomatcher_prefs';
    function _read() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
      catch { return {}; }
    }
    function _write(data) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    }
    return {
      /** Enregistre une section (id unique) avec la valeur donnée. */
      save(section, value) {
        const all = _read(); all[section] = value; _write(all);
      },
      /** Lit une section ; retourne `fallback` si absente. */
      load(section, fallback = undefined) {
        const all = _read();
        return Object.prototype.hasOwnProperty.call(all, section) ? all[section] : fallback;
      },
      /** Supprime une section. */
      remove(section) {
        const all = _read(); delete all[section]; _write(all);
      },
    };
  })();

  /**
   * TM_SongStorage — données liées à chaque piste audio (clé = nom de fichier).
   * Piggybacked sur TM_Storage sous la section 'songs'.
   * Usage : TM_SongStorage.save(fileName, data) / TM_SongStorage.load(fileName)
   */
  const TM_SongStorage = (() => {
    function _normKey(name) { return name.trim().toLowerCase(); }
    return {
      /** Sauvegarde toutes les données d'une piste d'un coup. */
      save(fileName, data) {
        const all = TM_Storage.load('songs', {});
        all[_normKey(fileName)] = data;
        TM_Storage.save('songs', all);
      },
      /** Lit les données d'une piste ; null si absente. */
      load(fileName) {
        const all = TM_Storage.load('songs', {});
        return all[_normKey(fileName)] ?? null;
      },
    };
  })();

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
  const btnExport      = $('btn-export');
  const iconPlay       = $('icon-play');
  const iconPause      = $('icon-pause');
  const timeCurrent    = $('time-current');
  const timeTotal      = $('time-total');
  const volumeSlider   = $('volume-slider');
  const volumePct      = $('volume-pct');

  const btnZoomIn      = $('btn-zoom-in');
  const btnZoomOut     = $('btn-zoom-out');
  const btnZoomFit     = $('btn-zoom-fit');
  const btnAutoFollow  = $('btn-auto-follow');
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
  const offsetGroup    = $('offset-group');

  const btnMetroToggle  = $('btn-metro-toggle');
  const metroVolSlider  = $('metro-vol-slider');
  const metroVolPct     = $('metro-vol-pct');
  const clickProfileSel = $('click-profile');
  const btnMetroPreview      = $('btn-metro-preview');
  const metroPreviewIconPlay = $('metro-preview-icon-play');
  const metroPreviewIconPause= $('metro-preview-icon-pause');
  const mcBeatsRow = $('mc-beats-row');
  const mcMeasure  = $('mc-measure');
  const mcLoop     = $('mc-loop');

  // Compteur de boucles
  let _loopCount   = 0;
  let _flashTimers = [];
  let _skipFirstLoop = false;
  let _onBeatSeq   = 0;        // incrémenté à chaque (re)démarrage : invalide les anciens setTimeout onBeat
  let _lastFiredAbsBeatIndex = 0; // index absolu du dernier beat affiché (référence pour les resyncs)

  /* ── Slots beats ─────────────────────────────── */
  function buildBeatSlots() {
    mcBeatsRow.innerHTML = '';
    const n  = metro.beatsPerMeasure;
    // À partir de 6 temps : réduire la police MAIS conserver la hauteur du slot (44px)
    // pour que le compteur ne change pas de taille selon la métrique
    const fs = n >= 6 ? Math.max(16, Math.round(44 * 4 / (n + 1))) : null;
    const gp = n >= 6 ? 4 : 10;
    mcBeatsRow.style.gap = gp + 'px';
    for (let i = 0; i < n; i++) {
      const slot = document.createElement('div');
      slot.className = 'mc-slot';
      if (i === 0) slot.classList.add('mc-slot-measure');
      slot.dataset.beat = i;
      if (fs !== null) {
        slot.style.fontSize  = fs + 'px';
        slot.style.height    = '44px';   // hauteur identique à la taille par défaut
        slot.style.minHeight = '44px';
      }
      const label = i === 0 ? '\u2013' : (i + 1);
      slot.innerHTML = `<span class="mc-slot-num">${label}</span>`;
      mcBeatsRow.appendChild(slot);
    }
  }
  buildBeatSlots();

  function setActiveBeat(beatInMeasure, measureIdx, loopCount) {
    const slots = mcBeatsRow.querySelectorAll('.mc-slot');
    // Mettre à jour le premier slot avec le numéro de mesure courant
    if (slots[0]) slots[0].querySelector('.mc-slot-num').textContent = measureIdx + 1;
    slots.forEach(s => s.classList.remove('active', 'mc-flash'));

    const target = slots[beatInMeasure];
    if (target) {
      target.classList.add('active');
      _flashTimers.forEach(t => clearTimeout(t));
      _flashTimers = [];
      target.classList.add('mc-flash');
      _flashTimers.push(setTimeout(() => target.classList.remove('mc-flash'), 80));
    }
    if (mcMeasure) mcMeasure.textContent = `${measureIdx + 1} / ${metro.measuresPerLoop}`;
    if (mcLoop)    mcLoop.textContent    = loopCount;
  }

  function updateCounterFromPosition(time) {
    if (metro.beatInterval <= 0) return;
    const rawBeat     = (time - metro.offset) / metro.beatInterval;
    const absIdx      = Math.max(0, Math.floor(rawBeat));
    const totalBeats  = metro.beatsPerMeasure * metro.measuresPerLoop;
    const beatInLoop  = ((absIdx % totalBeats) + totalBeats) % totalBeats;
    const measureIdx  = Math.floor(beatInLoop / metro.beatsPerMeasure);
    const beatInMeas  = beatInLoop % metro.beatsPerMeasure;
    const loopCount   = Math.floor(absIdx / totalBeats) + 1;
    _loopCount = loopCount;
    setActiveBeat(beatInMeas, measureIdx, loopCount);
  }

  function resetMetroCounter() {
    _loopCount = 0;
    _skipFirstLoop = false;
    _onBeatSeq++;            // invalider tous les setTimeout onBeat en attente
    buildBeatSlots();
    if (mcMeasure) mcMeasure.textContent = '\u2013';
    if (mcLoop)    mcLoop.textContent    = '\u2013';
  }

  metro.onBeat = (beatInMeasure, measureIdx, audioTime, absBeatIndex) => {
    const isLoopStart = (beatInMeasure === 0 && measureIdx === 0);
    const activeCtx   = audio.isPlaying ? audio.audioContext
                      : (_previewActive ? _previewCtx : null);
    const delayMs = activeCtx ? Math.max(0, (audioTime - activeCtx.currentTime) * 1000) : 0;
    const seq = _onBeatSeq;

    setTimeout(() => {
      if (seq !== _onBeatSeq) return;
      _lastFiredAbsBeatIndex = absBeatIndex;
      if (isLoopStart) {
        if (_skipFirstLoop) { _skipFirstLoop = false; }
        else { _loopCount++; }
      }
      setActiveBeat(beatInMeasure, measureIdx, _loopCount);
    }, delayMs);
  };

  let _previewCtx    = null;
  let _previewActive = false;

  function _setPreviewUI(active) {
    _previewActive = active;
    metroPreviewIconPlay.style.display  = active ? 'none'  : '';
    metroPreviewIconPause.style.display = active ? ''      : 'none';
    btnMetroPreview.classList.toggle('active', active);
  }

  function stopMetroPreview() {
    if (!_previewActive) return;
    metro.stop();
    if (_previewCtx) { _previewCtx.close(); _previewCtx = null; }
    _setPreviewUI(false);
    resetMetroCounter();
  }

  /**
   * Réinitialise le preview depuis le temps 1 (changement de signature rythmique).
   * À appeler après avoir mis à jour metro.beatsPerMeasure ou metro.measuresPerLoop.
   */
  function _previewRestartFromZero() {
    if (!_previewActive || !_previewCtx) return;
    resetMetroCounter();   // rebuild slots + display –
    _loopCount      = 1;   // la 1ère boucle sera la #1
    _skipFirstLoop  = true; // le 1er isLoopStart ne doit pas incrémenter à nouveau
    metro.stop();
    metro.start(_previewCtx, _previewCtx.currentTime, 0);
  }

  const amplitudeSlider  = $('amplitude-slider');
  const amplitudePct     = $('amplitude-pct');
  const measureBarHeightSlider = $('measure-bar-height-slider');
  const measureBarHeightPct    = $('measure-bar-height-pct');
  const waveColorPicker  = $('wave-color-picker');
  const waveOpacitySlider= $('wave-opacity-slider');
  const waveOpacityPct   = $('wave-opacity-pct');
  const btnShowWave      = $('btn-show-wave');

  const btnShowLoop    = $('btn-show-loop');
  const btnShowMeasure = $('btn-show-measure');
  const btnShowBeat    = $('btn-show-beat');
  const btnShowBands   = $('btn-show-bands');

  /* ══ État ═══════════════════════════════════════════════════════ */

  let audioLoaded  = false;
  let _loadedFileName = '';
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

    // Si un pin est verrouillé, recaler l'offset pour que la grille reste fixe
    _applyLockOffset();

    // Resync métronome si en lecture
    resyncMetronome();
    waveform.markDirty();
    _saveSongData();
  }

  function setOffset(offset) {
    // Si l'utilisateur force un décalage manuel alors qu'un pin est verrouillé, déverrouiller
    if (_lockedPinIdx >= 0 && !_settingLockOffset) {
      _unlockPin();
    }
    offset = Math.round(offset * 1000) / 1000;
    offset = Math.max(parseFloat(offsetSlider.min), Math.min(parseFloat(offsetSlider.max), offset));
    metro.offset          = offset;
    offsetSlider.value    = offset;
    offsetInput.value     = offset.toFixed(3);

    resyncMetronome();
    updateCounterFromPosition(waveform.playheadTime);
    waveform.markDirty();
    _saveSongData();
  }

  function resyncMetronome() {
    if (_bpmSliderDragging) return;
    // Preview actif : reprendre depuis le beat suivant le dernier affiché
    if (_previewActive && _previewCtx) {
      const newPlaybackPos = metro.offset + (_lastFiredAbsBeatIndex + 0.5) * metro.beatInterval;
      _onBeatSeq++;
      metro.resync(_previewCtx, _previewCtx.currentTime, newPlaybackPos);
      return;
    }
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
    btnPlay.disabled   = !on;
    btnStop.disabled   = !on;
    btnLoop.disabled   = !on;
    btnExport.disabled = !on;
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

  /* ══ Indicateur de sauvegarde + reset morceau ═════════════════════ */

  const _saveIndicator = $('save-indicator');
  const btnResetSong   = $('btn-reset-song');
  let _saveFlashTimer  = null;

  function _flashSaveIndicator() {
    if (!_saveIndicator) return;
    // Redémarrer l'animation : retirer la classe, forcer le reflow, la remettre
    _saveIndicator.classList.remove('spinning');
    void _saveIndicator.offsetWidth;
    _saveIndicator.classList.add('spinning');
    if (_saveFlashTimer) clearTimeout(_saveFlashTimer);
    _saveFlashTimer = setTimeout(() => _saveIndicator.classList.remove('spinning'), 600);
  }

  function _resetSongData() {
    if (!_loadedFileName) return;

    // Supprimer du stockage
    const all = TM_Storage.load('songs', {});
    delete all[_loadedFileName.trim().toLowerCase()];
    TM_Storage.save('songs', all);

    // Réinitialiser : métrique, offset, clic, sections (identique à une nouvelle piste)
    _restoringData = true;
    setBPM(120);
    beatsPerMeasureGroup.querySelector('.seg-btn[data-val="4"]')?.click();
    measuresPerLoopGroup.querySelector('.seg-btn[data-val="4"]')?.click();
    loopsPerGroupGroup.querySelector('.seg-btn[data-val="4"]')?.click();
    setOffset(0);
    clickProfileSel.value = 'defaut';  metro.clickProfile = 'defaut';
    metroVolSlider.value  = 1;         metro.volume       = 1;    metroVolPct.textContent = pct(1);
    waveform.brushPalette  = [];
    waveform.measureColors = new Map();
    waveform._paletteIdCounter = 0;
    waveform.pins          = [];
    _lockedPinIdx          = -1;
    waveform.lockedPinTime = null;
    offsetGroup.classList.remove('locked');
    applyProfile('defaut');
    markerProfileSelect.value = 'defaut';
    renderBrushPalette();
    waveform.markDirty();
    _restoringData = false;

    // Masquer le bouton reset, lancer l'auto-détect
    btnResetSong.style.display = 'none';
    btnDetect.disabled = true;
    showLoading('Détection BPM…', 0.95);
    detectBPM(audio.audioBuffer)
      .then(bpm => setBPM(bpm))
      .catch(() => {})
      .finally(() => { btnDetect.disabled = false; hideLoading(); });
  }

  btnResetSong.addEventListener('click', _resetSongData);

  /* ══ Persistance par piste (BPM, métrique, offset, clic, sections) ════════ */

  let _restoringData = false; // vrai pendant _restoreSongData → bloque _saveSongData

  function _saveSongData() {
    if (!_loadedFileName || _restoringData) return;
    TM_SongStorage.save(_loadedFileName, {
      bpm:             metro.bpm,
      beatsPerMeasure: metro.beatsPerMeasure,
      measuresPerLoop: metro.measuresPerLoop,
      loopsPerGroup:   waveform.loopsPerGroup,
      offset:          metro.offset,
      clickProfile:    clickProfileSel.value,
      metroVol:        parseFloat(metroVolSlider.value),
      sections: {
        palette:       waveform.brushPalette.map(e => ({ ...e })),
        measureColors: Array.from(waveform.measureColors.entries()),
      },
      pins:          waveform.pins.map(p => ({ ...p })),
      lockedPinTime: _lockedPinIdx >= 0 && _lockedPinIdx < waveform.pins.length
                       ? waveform.pins[_lockedPinIdx].time
                       : null,
      markerProfile: markerProfileSelect.value !== 'personnalise' ? markerProfileSelect.value : null,
      markerParams: {
        loopColor:     waveform.markerColorLoop,
        measureColor:  waveform.markerColorMeasure,
        beatColor:     waveform.markerColorBeat,
        bandsColor:    waveform.loopBandColor,
        waveColor:     waveform.waveColorStroke,
        loopHeight:    waveform.loopBarHeight,
        measureHeight: waveform.measureBarHeight,
        beatHeight:    waveform._isSineMode && _sineSavedHeight != null
                         ? _sineSavedHeight * waveform.amplitudeScale * 2.0
                         : parseFloat(beatBarHeightSlider.value),
        bandsHeight:   waveform.loopBandHeightScale,
        loopOpacity:   waveform.loopOpacity,
        measureOpacity: waveform.measureOpacity,
        beatOpacity:   waveform._isSineMode && _sineSavedOpacity != null
                         ? _sineSavedOpacity
                         : waveform.beatOpacity,
        bandsOpacity:  waveform.bandOpacity,
        waveOpacity:   waveform.waveOpacity,
      },
    });
    _flashSaveIndicator();
    btnResetSong.style.display = '';
  }

  function _restoreSongData(data) {
    _restoringData = true;
    // 1. BPM (avant métrique/offset : l'offset range en dépend)
    if (data.bpm != null) setBPM(data.bpm);
    // 2. Métrique — cliquer les boutons déclenche les callbacks complets
    if (data.beatsPerMeasure != null) {
      const m = beatsPerMeasureGroup.querySelector(`.seg-btn[data-val="${data.beatsPerMeasure}"]`);
      if (m) m.click();
    }
    if (data.measuresPerLoop != null) {
      const m = measuresPerLoopGroup.querySelector(`.seg-btn[data-val="${data.measuresPerLoop}"]`);
      if (m) m.click();
    }
    if (data.loopsPerGroup != null) {
      const m = loopsPerGroupGroup.querySelector(`.seg-btn[data-val="${data.loopsPerGroup}"]`);
      if (m) m.click();
    }
    // 3. Offset (après offset range mis à jour par BPM + métrique)
    if (data.offset != null) setOffset(data.offset);
    // 4. Profil de clic métronome
    if (data.clickProfile != null) {
      clickProfileSel.value = data.clickProfile;
      metro.clickProfile    = data.clickProfile;
    }
    // 5. Volume métronome
    if (data.metroVol != null) {
      const v = data.metroVol;
      metroVolSlider.value    = v;
      metro.volume            = v;
      metroVolPct.textContent = pct(v);
    }
    // 6. Sections pinceau
    if (data.sections) {
      waveform.brushPalette  = (data.sections.palette      || []).map(e => ({ ...e }));
      waveform.measureColors = new Map(data.sections.measureColors || []);
      // Recaler le compteur d'ID pour éviter les collisions
      const maxId = waveform.brushPalette.reduce((max, e) => Math.max(max, e.id ?? 0), 0);
      waveform._paletteIdCounter = maxId + 1;
    }
    // 7. Pins (marqueurs règle + verrou)
    _lockedPinIdx          = -1;
    waveform.lockedPinTime = null;
    offsetGroup.classList.remove('locked');
    if (data.pins && data.pins.length > 0) {
      waveform.pins = data.pins.map(p => ({ ...p }));
      if (data.lockedPinTime != null) {
        const li = waveform.pins.findIndex(p => p.time === data.lockedPinTime);
        if (li >= 0) {
          _lockedPinIdx = li;
          waveform.lockedPinTime = data.lockedPinTime;
          offsetGroup.classList.add('locked');
        }
      }
    } else {
      waveform.pins = [];
    }
    // 8. Preset de marqueurs visuels (nom ou paramètres bruts)
    if (data.markerProfile && MARKER_PROFILES[data.markerProfile]) {
      // Preset nommé connu : l'appliquer normalement
      applyProfile(data.markerProfile);
      markerProfileSelect.value = data.markerProfile;
    } else if (data.markerParams) {
      // Preset personnalisé ou preset supprimé : restaurer les paramètres bruts
      _applyProfileData(data.markerParams);
      markerProfileSelect.value = 'personnalise';
      _baseProfileKey = 'defaut';
    } else {
      applyProfile('defaut');
      markerProfileSelect.value = 'defaut';
    }
    renderBrushPalette();
    waveform.markDirty();
    _restoringData = false;
    _saveSongData(); // une seule sauvegarde finale avec l'état complet restauré
  }

  /* ══ Chargement fichier ═════════════════════════════════════════ */

  async function loadAudioFile(file) {
    if (!file || !file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) {
      alert('Format non supporté. Utilisez MP3, WAV, OGG, FLAC ou AAC.');
      return;
    }

    // Arrêter le métronome (preview ou lecture) avant de charger une nouvelle piste
    stopMetroPreview();
    metro.stop();
    audio.stop();
    waveform.isPlaying    = false;
    waveform.playheadTime = 0;
    timeCurrent.textContent = formatTime(0);
    updatePlayIcons();
    resetMetroCounter();
    waveform.markDirty();

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
    _loadedFileName = file.name;

    // Réinitialiser les données visuelles (ancienne piste)
    waveform.measureColors.clear();
    waveform.brushPalette = [];

    fileName.textContent    = file.name;
    timeTotal.textContent   = formatTime(audio.duration);
    timeCurrent.textContent = formatTime(0);

    dropOverlay.classList.add('hidden');
    setTransportEnabled(true);

    waveform.setAudio(audio.audioBuffer);
    startUpdateLoop();

    // Restaurer les données sauvegardées pour cette piste
    const _savedSong = TM_SongStorage.load(file.name);
    if (_savedSong) {
      btnResetSong.style.display = '';
      _restoreSongData(_savedSong);
    } else {
      btnResetSong.style.display = 'none';
      renderBrushPalette(); // Afficher la palette vide
    }

    // Auto-détection BPM uniquement si aucun BPM sauvegardé pour cette piste
    if (!_savedSong?.bpm) {
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
      // Couper le preview si actif avant de lancer la lecture
      stopMetroPreview();
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
    resetMetroCounter();
    updatePlayIcons();
    waveform.markDirty();
  });

  audio.onEnded = () => {
    metro.stop();
    waveform.isPlaying    = false;
    waveform.playheadTime = 0;
    resetMetroCounter();
    updatePlayIcons();
    waveform.markDirty();
  };

  // Seek depuis la waveform
  waveform.onSeek = (time) => {
    const wasPlaying = audio.isPlaying;
    const info = audio.seek(time);
    if (wasPlaying && info) {
      metro.start(audio.audioContext, info.audioStartTime, info.playbackStartPos);
    } else if (!wasPlaying && !_previewActive) {
      // Ne couper le métronome que si le preview n'est pas actif
      metro.stop();
    }
    // Ne mettre à jour le compteur depuis la position que si le preview n'est pas actif
    if (!_previewActive) updateCounterFromPosition(time);
    waveform.playheadTime = time;
    waveform.markDirty();
  };

  /* ══ Volume ═════════════════════════════════════════════════════ */

  function pct(v) { return Math.round(v * 100) + '%'; }
  function syncVolDisplays(v) {
    volumePct.textContent = pct(v);
    const ps = document.getElementById('vol-panel-slider');
    const pp = document.getElementById('vol-panel-pct');
    if (ps) ps.value = v;
    if (pp) pp.textContent = pct(v);
    TM_Storage.save('volume', v);
  }

  // Restaurer le volume depuis localStorage
  (function _restoreVolume() {
    const saved = TM_Storage.load('volume');
    if (saved == null) return;
    const v = parseFloat(saved);
    if (isNaN(v)) return;
    audio.setVolume(v);
    volumeSlider.value = v;
    syncVolDisplays(v);
  })();

  volumeSlider.addEventListener('input', () => {
    const v = parseFloat(volumeSlider.value);
    audio.setVolume(v);
    syncVolDisplays(v);
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
  btnAutoFollow.addEventListener('click', () => {
    waveform.autoFollow = !waveform.autoFollow;
    btnAutoFollow.classList.toggle('active', waveform.autoFollow);
    btnAutoFollow.title = waveform.autoFollow
      ? 'Auto-recentrage (désactiver)'
      : 'Auto-recentrage (activer)';
  });

  /* ══ Mode de visualisation ══════════════════════════════════════════════ */

  const viewModeSelect = $('view-mode-select');
  if (viewModeSelect) {
    viewModeSelect.addEventListener('change', () => {
      waveform.viewMode = viewModeSelect.value;
      if (viewModeSelect.value === 'spectral') {
        deactivateBrush();
        btnBrushToggle.disabled = true;
        btnBrushToggle.title    = 'Non disponible en mode Spectral';
      } else {
        btnBrushToggle.disabled = false;
        btnBrushToggle.title    = 'Outil pinceau – colorier par mesure (B)';
      }
      waveform.markDirty();
    });
  }

  // Mettre à jour le label de zoom lors du zoom molette
  const _origZoomIn  = waveform.zoomIn.bind(waveform);
  const _origZoomOut = waveform.zoomOut.bind(waveform);
  waveform.zoomIn  = (...args) => { _origZoomIn(...args);  updateZoomLabel(); };
  waveform.zoomOut = (...args) => { _origZoomOut(...args); updateZoomLabel(); };

  /* ══ BPM ═════════════════════════════════════════════════════════ */

  let _bpmSliderDragging = false;
  let _pausedElapsed     = 0; // position capturée au moment du freeze
  let _pausedAbsBeatIndex = 0; // index absolu du beat affiché au moment du freeze (avec l'ancien BPM)

  // Pendant le drag : freezer le métronome et mémoriser la position exacte
  bpmSlider.addEventListener('mousedown', () => {
    if (!_previewActive) return;
    _bpmSliderDragging = true;
    _pausedAbsBeatIndex = Math.floor(Math.max(0, _pausedElapsed - metro.offset) / metro.beatInterval);
    metro.stop();
  });
  document.addEventListener('mouseup', () => {
    if (!_bpmSliderDragging) return;
    _bpmSliderDragging = false;
    if (_previewActive && _previewCtx) {
      const ref = _lastFiredAbsBeatIndex;
      const newPlaybackPos = metro.offset + (ref + 0.5) * metro.beatInterval;
      _onBeatSeq++;
      metro.start(_previewCtx, _previewCtx.currentTime, newPlaybackPos);
    }
  });

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
    if (_previewActive) {
      _previewRestartFromZero(); // reset complet + repart du temps 1
    } else {
      buildBeatSlots();
      if (audio.isPlaying) updateCounterFromPosition(waveform.playheadTime);
      resyncMetronome();
    }
    updateOffsetRange();
    _applyLockOffset();
    waveform.markDirty();
    _saveSongData();
  });

  initSegBtnGroup(measuresPerLoopGroup, val => {
    metro.measuresPerLoop = val;
    if (_previewActive) {
      _previewRestartFromZero(); // reset complet + repart du temps 1
    } else {
      if (audio.isPlaying) updateCounterFromPosition(waveform.playheadTime);
      resyncMetronome();
    }
    updateOffsetRange();
    _applyLockOffset();
    waveform.markDirty();
    _saveSongData();
  });

  initSegBtnGroup(loopsPerGroupGroup, val => {
    waveform.loopsPerGroup = val;
    waveform.markDirty();
    _saveSongData();
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

  clickProfileSel.addEventListener('change', () => {
    metro.clickProfile = clickProfileSel.value;
    // Pas de resync nécessaire : le profil est lu au moment du clic audio
    _saveSongData();
  });

  btnMetroPreview.addEventListener('click', () => {
    if (_previewActive) {
      stopMetroPreview();
      return;
    }
    // Si la musique joue : ne pas lancer le preview, la musique a la priorité
    if (audio.isPlaying) return;
    _previewCtx = new AudioContext();
    _loopCount = 1;
    _skipFirstLoop = true;
    if (mcLoop) mcLoop.textContent = 1;
    // Résoudre l'état suspended possible avant de démarrer
    _previewCtx.resume().then(() => {
      metro.start(_previewCtx, _previewCtx.currentTime, 0);
      _setPreviewUI(true);
    });
  });

  btnMetroToggle.addEventListener('click', () => {
    metro.enabled = !metro.enabled;
    btnMetroToggle.textContent = metro.enabled ? 'ON' : 'OFF';
    btnMetroToggle.classList.toggle('off', !metro.enabled);
  });

  metroVolSlider.addEventListener('input', () => {
    const v = parseFloat(metroVolSlider.value);
    metro.volume = v;
    metroVolPct.textContent = pct(v);
    _saveSongData();
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
    // Synchroniser le slider TEMPS (hauteur effective = beatBarHeight * amplitude * 2)
    const effBeat = Math.min(1, waveform.beatBarHeight * v * 2.0);
    beatBarHeightSlider.value = effBeat;
    beatBarHeightPct.textContent = pct(effBeat);
    waveform.markDirty();
  });

  btnShowWave.addEventListener('click', () => {
    waveform.showWaveform = !waveform.showWaveform;
    btnShowWave.classList.toggle('active', waveform.showWaveform);
    waveform.markDirty();
  });

  measureBarHeightSlider.addEventListener('input', () => {
    const v = parseFloat(measureBarHeightSlider.value);
    waveform.measureBarHeight = v;
    measureBarHeightPct.textContent = pct(v);
    waveform.markDirty();
    updateProfileSelect();
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
    updateProfileSelect();
  });

  $('wave-color-reset-btn').addEventListener('click', () => {
    const p   = _getActiveProfile();
    const def = p.waveColor;
    waveColorPicker.value = def;
    const r = parseInt(def.slice(1,3),16), g = parseInt(def.slice(3,5),16), b = parseInt(def.slice(5,7),16);
    waveform.waveColorStroke = def;
    waveform.waveColorFill   = `rgb(${Math.round(r*0.45)},${Math.round(g*0.45)},${Math.round(b*0.45)})`;
    waveform.markDirty();
    updateProfileSelect();
  });

  waveOpacitySlider.addEventListener('input', () => {
    const v = parseFloat(waveOpacitySlider.value);
    waveform.waveOpacity = v;
    waveOpacityPct.textContent = pct(v);
    waveform.markDirty();
    updateProfileSelect();
  });

  /* ══ Outil pinceau (coloration par mesure) ═══════════════════════════ */

  const btnBrushToggle   = $('btn-brush-toggle');
  const btnToolPan       = $('btn-tool-pan');
  const brushColorPicker = $('brush-color-picker');

  // Curseur SVG pinceau encodé en base64
  const BRUSH_CURSOR_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
         fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 3a3 3 0 0 1 0 4.243l-9.9 9.9a3 3 0 0 1-1.415.793l-4 1 1-4
               a3 3 0 0 1 .793-1.415L14.757 3A3 3 0 0 1 18 3z"/>
      <path d="M15 6l3 3"/>
    </svg>`;
  const BRUSH_CURSOR_URL = 'data:image/svg+xml;base64,' + btoa(BRUSH_CURSOR_SVG);

  function activateBrush() {
    // Bloqué en mode spectral
    if (waveform.viewMode === 'spectral') return;
    waveform.paintBrushMode  = true;
    waveform.paintBrushColor = brushColorPicker.value;
    btnBrushToggle.classList.add('active');
    btnToolPan.classList.remove('active');
    waveform.waveCanvas.style.cursor = `url("${BRUSH_CURSOR_URL}") 0 24, crosshair`;
  }

  function deactivateBrush() {
    waveform.paintBrushMode = false;
    waveform._brushPainting = false;
    waveform._brushErasing  = false;
    waveform.hideBrushCursor();
    btnBrushToggle.classList.remove('active');
    btnToolPan.classList.add('active');
    waveform.waveCanvas.style.cursor = 'crosshair';
  }

  btnToolPan.addEventListener('click', () => deactivateBrush());

  // Radio : cliquer sur pinceau l’active toujours (pas de toggle-off par clic)
  btnBrushToggle.addEventListener('click', () => activateBrush());

  // Après relâchement du clic molette (pan temporaire), restaurer le curseur pinceau si actif
  waveform.waveCanvas.addEventListener('mouseup', (e) => {
    if (e.button === 1 && waveform.paintBrushMode) {
      waveform.waveCanvas.style.cursor = `url("${BRUSH_CURSOR_URL}") 0 24, crosshair`;
    }
  });

  // ── Undo / Redo pinceau ─────────────────────────────────────────────────
  // Capture : measureColors (Map) + brushPalette (tableau d'objets)

  const _brushHistory = [];
  const _brushFuture  = [];
  const BRUSH_HISTORY_MAX = 80;

  function _captureBrushState() {
    return {
      colors:  new Map(waveform.measureColors),
      palette: waveform.brushPalette.map(e => ({ ...e })),
    };
  }

  function brushPushUndo() {
    _brushHistory.push(_captureBrushState());
    if (_brushHistory.length > BRUSH_HISTORY_MAX) _brushHistory.shift();
    _brushFuture.length = 0;
  }

  function _brushRestoreState(state) {
    waveform.measureColors = new Map(state.colors);
    waveform.brushPalette  = state.palette.map(e => ({ ...e }));
    renderBrushPalette();
    waveform.markDirty();
  }

  function brushUndo() {
    if (_brushHistory.length === 0) return;
    _brushFuture.push(_captureBrushState());
    _brushRestoreState(_brushHistory.pop());
  }

  function brushRedo() {
    if (_brushFuture.length === 0) return;
    _brushHistory.push(_captureBrushState());
    _brushRestoreState(_brushFuture.pop());
  }

  // Brancher le callback : snapshot avant chaque trait de pinceau ou effacement
  waveform.onBrushStrokeStart = () => brushPushUndo();
  // Sauvegarder les couleurs de mesures après chaque trait de pinceau
  waveform.waveCanvas.addEventListener('pointerup', () => {
    if (_loadedFileName && waveform.paintBrushMode) _saveSongData();
  });

  // ─────────────────────────────────────────────────────────────────────────

  brushColorPicker.addEventListener('input', () => {
    let hex = brushColorPicker.value;
    // Détection : si la couleur correspond au fill assombri (×0.45) d'une entrée palette
    // (cas pipette sur l'intérieur de la waveform), on restaure la couleur d'origine
    const rr = parseInt(hex.slice(1,3),16);
    const gg = parseInt(hex.slice(3,5),16);
    const bb = parseInt(hex.slice(5,7),16);
    const THRESH = 22;
    for (const entry of waveform.brushPalette) {
      const er = parseInt(entry.color.slice(1,3),16);
      const eg = parseInt(entry.color.slice(3,5),16);
      const eb = parseInt(entry.color.slice(5,7),16);
      const fr = Math.round(er * 0.45);
      const fg = Math.round(eg * 0.45);
      const fb = Math.round(eb * 0.45);
      if (Math.abs(rr-fr) <= THRESH && Math.abs(gg-fg) <= THRESH && Math.abs(bb-fb) <= THRESH) {
        hex = entry.color;
        brushColorPicker.value = hex;
        break;
      }
    }
    waveform.paintBrushColor = hex;
  });

  // ── Palette de sections ──────────────────────────────────────────────

  let _paletteDragId = null; // id de l'entrée en cours de glisser

  /** Convertit teinte/saturation/luminosité en hex #rrggbb */
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
    return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  /** Crée une nouvelle section vide et ouvre l'édition du nom */
  function addSection() {
    brushPushUndo();  // snapshot avant ajout
    const id    = waveform._paletteIdCounter++;
    const hue   = (waveform.brushPalette.length * 53 + 17) % 360;
    const color = hslToHex(hue, 78, 56);
    waveform.brushPalette.push({ id, color, name: 'Section ' + (waveform.brushPalette.length + 1) });
    // Sélectionner automatiquement cette couleur et activer le pinceau
    brushColorPicker.value   = color;
    waveform.paintBrushColor = color;
    activateBrush();
    renderBrushPalette(id);
    _saveSongData();
  }

  function renderBrushPalette(autoFocusId) {
    const list = $('brush-palette-list');
    list.innerHTML = '';

    if (waveform.brushPalette.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = 'Peignez ou appuyez sur + pour créer une section';
      list.appendChild(empty);
      return;
    }

    for (const entry of waveform.brushPalette) {
      const row = document.createElement('div');
      row.className = 'palette-row';
      row.dataset.id = entry.id;
      row.draggable = true;

      // Poignée de glisser-déposer
      const grip = document.createElement('span');
      grip.className = 'palette-grip';
      grip.innerHTML = `<svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
        <circle cx="2" cy="2" r="1.1"/><circle cx="6" cy="2" r="1.1"/>
        <circle cx="2" cy="6" r="1.1"/><circle cx="6" cy="6" r="1.1"/>
        <circle cx="2" cy="10" r="1.1"/><circle cx="6" cy="10" r="1.1"/>
      </svg>`;

      // Événements drag
      row.addEventListener('dragstart', (ev) => {
        _paletteDragId = entry.id;
        row.classList.add('dragging');
        ev.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        list.querySelectorAll('.palette-row').forEach(r => r.classList.remove('drag-over'));
      });
      row.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        if (_paletteDragId === entry.id) return;
        list.querySelectorAll('.palette-row').forEach(r => r.classList.remove('drag-over'));
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', (ev) => {
        ev.preventDefault();
        row.classList.remove('drag-over');
        if (_paletteDragId === null || _paletteDragId === entry.id) return;
        brushPushUndo();  // snapshot avant réordonnancement
        const palette = waveform.brushPalette;
        const fromIdx = palette.findIndex(e => e.id === _paletteDragId);
        const toIdx   = palette.findIndex(e => e.id === entry.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = palette.splice(fromIdx, 1);
        palette.splice(toIdx, 0, moved);
        _paletteDragId = null;
        renderBrushPalette();
        _saveSongData();
      });

      // Carré couleur (clic → sélectionner cette couleur dans le pinceau)
      const swatch = document.createElement('button');
      swatch.className = 'palette-swatch';
      swatch.style.background = entry.color;
      swatch.style.borderColor = entry.color;
      swatch.title = 'Prendre cette couleur et activer le pinceau';

      // Icône pipette — toujours visible (overlay semi-transparent)
      const pipette = document.createElement('span');
      pipette.className = 'palette-pipette';
      pipette.innerHTML =
        `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 22l7-7"/>
          <path d="M16.67 2.5c1.17-1.17 3.07-1.17 4.24 0 1.17 1.17 1.17 3.07 0 4.24L7.33 20.17
            c-.39.39-.9.59-1.42.59H3v-2.91c0-.53.21-1.03.59-1.42L16.67 2.5z"/>
        </svg>`;
      swatch.appendChild(pipette);

      swatch.addEventListener('click', () => {
        brushColorPicker.value   = entry.color;
        waveform.paintBrushColor = entry.color;
        if (!waveform.paintBrushMode) activateBrush();
        // Mettre en évidence la ligne active
        list.querySelectorAll('.palette-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
      });

      // Nom cliquable → champ d'édition inline
      const nameSpan = document.createElement('span');
      nameSpan.className   = 'palette-name';
      nameSpan.textContent = entry.name;
      nameSpan.title       = 'Cliquer pour renommer';

      nameSpan.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type      = 'text';
        input.value     = entry.name;
        input.className = 'palette-name-input';
        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        const commit = () => {
          const v = input.value.trim();
          if (v && v !== entry.name) {
            brushPushUndo();  // snapshot avant renommage
            entry.name = v;
          }
          waveform.markDirty();
          renderBrushPalette();
          _saveSongData();
        };
        input.addEventListener('blur',   commit);
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter')  { input.blur(); }
          if (ev.key === 'Escape') { input.value = entry.name; input.blur(); }
          ev.stopPropagation();
        });
      });

      // ── Bouton édition couleur (icône crayon, visible au survol) ──
      const editBtn = document.createElement('button');
      editBtn.className = 'palette-edit-btn';
      editBtn.title     = 'Modifier la couleur de cette section';
      editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>`;

      // Input couleur caché associé à ce bouton
      const colorInput = document.createElement('input');
      colorInput.type      = 'color';
      colorInput.value     = entry.color;
      colorInput.className = 'palette-color-input';
      // Positionner en absolute dans row (row doit être position:relative)
      row.style.position = 'relative';
      row.appendChild(colorInput);

      editBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        colorInput.click();
      });

      // 'input' = live pendant que l'utilisateur déplace les sliders du picker
      // On met à jour en place SANS reconstruire le DOM (sinon le picker natif se ferme)
      let prevColor = entry.color;
      let _colorSnapDone = false;  // snapshot pris une seule fois par session picker
      colorInput.addEventListener('input', () => {
        if (!_colorSnapDone) { brushPushUndo(); _colorSnapDone = true; }  // snapshot avant 1er changement
        const oldColor = prevColor;
        const newColor = colorInput.value;
        entry.color = newColor;
        prevColor   = newColor;

        // Remapper toutes les mesures peintes avec l'ancienne couleur
        for (const [measureIdx, col] of waveform.measureColors.entries()) {
          if (col === oldColor) waveform.measureColors.set(measureIdx, newColor);
        }

        // Mettre à jour le swatch en place (sans rebuild DOM)
        swatch.style.background = newColor;
        swatch.style.borderColor = newColor;

        // Mettre à jour le sélecteur de couleur actif si nécessaire
        if (brushColorPicker.value === oldColor) {
          brushColorPicker.value   = newColor;
          waveform.paintBrushColor = newColor;
        }

        waveform.markDirty();
      });

      // 'change' = picker fermé → rebuild complet de la palette
      colorInput.addEventListener('change', () => {
        _colorSnapDone = false;  // réinitialiser pour la prochaine session picker
        renderBrushPalette();
        _saveSongData();
      });

      row.appendChild(swatch);
      row.appendChild(nameSpan);
      row.appendChild(editBtn);

      // ── Bouton supprimer (icône corbeille, visible au survol) ──
      const delBtn = document.createElement('button');
      delBtn.className = 'palette-del-btn';
      delBtn.title     = 'Supprimer cette section';
      delBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>`;
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        brushPushUndo();  // snapshot avant suppression
        const color = entry.color;
        // Retirer l'entrée de la palette
        const idx = waveform.brushPalette.indexOf(entry);
        if (idx !== -1) waveform.brushPalette.splice(idx, 1);
        // Effacer toutes les mesures peintes avec cette couleur
        for (const [measureIdx, col] of waveform.measureColors.entries()) {
          if (col === color) waveform.measureColors.delete(measureIdx);
        }
        // Si la couleur active était celle supprimée, basculer en mode déplacer
        if (brushColorPicker.value === color) deactivateBrush();
        waveform.markDirty();
        renderBrushPalette();
        _saveSongData();
      });
      row.appendChild(delBtn);

      // Poignée en premier dans le DOM (visuellement à gauche)
      row.insertBefore(grip, row.firstChild);

      list.appendChild(row);

      // Auto-ouvrir l'édition du nom si c'est la section qui vient d'être créée
      if (entry.id === autoFocusId) {
        setTimeout(() => nameSpan.click(), 30);
      }
    }
  }

  $('btn-add-section').addEventListener('click', () => addSection());

  waveform.onPaletteChange = renderBrushPalette;
  renderBrushPalette(); // init (affiche le placeholder vide)

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
  markerToggle(btnShowBands,   'showLoopBands');

  // Couleurs des marqueurs
  const colorLoop    = $('color-loop');
  const colorMeasure = $('color-measure');
  const colorBeat    = $('color-beat');
  const colorBands   = $('color-bands');

  colorBands.addEventListener('input', () => {
    waveform.loopBandColor = colorBands.value;
    waveform.markDirty();
    updateProfileSelect();
  });

  // Sliders de hauteur des marqueurs
  const loopBarHeightSlider  = $('loop-bar-height-slider');
  const loopBarHeightPct     = $('loop-bar-height-pct');
  const beatBarHeightSlider  = $('beat-bar-height-slider');
  const beatBarHeightPct     = $('beat-bar-height-pct');
  const bandHeightSlider     = $('band-height-slider');
  const bandHeightPct        = $('band-height-pct');

  // Sliders d'opacité des marqueurs
  const loopOpacitySlider    = $('loop-opacity-slider');
  const loopOpacityPct       = $('loop-opacity-pct');
  const measureOpacitySlider = $('measure-opacity-slider');
  const measureOpacityPct    = $('measure-opacity-pct');
  const beatOpacitySlider    = $('beat-opacity-slider');
  const beatOpacityPct       = $('beat-opacity-pct');
  const bandOpacitySlider    = $('band-opacity-slider');
  const bandOpacityPct       = $('band-opacity-pct');
  const markerProfileSelect  = $('marker-profile');
  const btnProfileReset      = $('btn-profile-reset');
  const btnAddProfile        = $('btn-add-profile');
  const btnDelProfile        = $('btn-del-profile');
  const profileSelectWrap    = $('profile-select-wrap');
  const profileNameWrap      = $('profile-name-wrap');
  const profileNameInput     = $('profile-name-input');
  const btnProfileNameOk     = $('btn-profile-name-ok');
  const btnProfileNameCancel = $('btn-profile-name-cancel');
  const btnResetHeights      = $('btn-reset-heights');
  const btnResetOpacities    = $('btn-reset-opacities');
  const btnResetColors       = $('btn-reset-colors');

  loopBarHeightSlider.addEventListener('input', () => {
    const v = parseFloat(loopBarHeightSlider.value);
    waveform.loopBarHeight  = v;
    loopBarHeightPct.textContent = pct(v);
    waveform.markDirty();
    updateProfileSelect();
  });
  beatBarHeightSlider.addEventListener('input', () => {
    const v = parseFloat(beatBarHeightSlider.value);
    // Le slider montre la hauteur effective ; on déduit beatBarHeight de base
    waveform.beatBarHeight = v / Math.max(0.001, waveform.amplitudeScale * 2.0);
    beatBarHeightPct.textContent = pct(v);
    waveform.markDirty();
    updateProfileSelect();
  });
  bandHeightSlider.addEventListener('input', () => {
    const v = parseFloat(bandHeightSlider.value);
    waveform.loopBandHeightScale = v;
    bandHeightPct.textContent = pct(v);
    waveform.markDirty();
    updateProfileSelect();
  });

  // Boutons reset couleur
  const COLOR_DEFAULTS = {
    'color-loop':    { picker: colorLoop,    prop: 'markerColorLoop',    profileKey: 'loopColor'    },
    'color-measure': { picker: colorMeasure, prop: 'markerColorMeasure', profileKey: 'measureColor' },
    'color-beat':    { picker: colorBeat,    prop: 'markerColorBeat',    profileKey: 'beatColor'    },
    'color-bands':   { picker: colorBands,   prop: 'loopBandColor',      profileKey: 'bandsColor'   },
  };
  document.querySelectorAll('.color-reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const entry  = COLOR_DEFAULTS[target];
      if (!entry) return;
      const p   = _getActiveProfile();
      const col = p[entry.profileKey] || btn.dataset.default;
      entry.picker.value   = col;
      waveform[entry.prop] = col;
      waveform.markDirty();
      updateProfileSelect();
    });
  });

  colorLoop.addEventListener('input', () => {
    waveform.markerColorLoop = colorLoop.value;
    waveform.markDirty();
    updateProfileSelect();
  });
  colorMeasure.addEventListener('input', () => {
    waveform.markerColorMeasure = colorMeasure.value;
    waveform.markDirty();
    updateProfileSelect();
  });
  colorBeat.addEventListener('input', () => {
    waveform.markerColorBeat = colorBeat.value;
    waveform.markDirty();
    updateProfileSelect();
  });

  // Sliders d'opacité des marqueurs
  loopOpacitySlider.addEventListener('input', () => {
    waveform.loopOpacity = parseFloat(loopOpacitySlider.value);
    loopOpacityPct.textContent = pct(waveform.loopOpacity);
    waveform.markDirty();
    updateProfileSelect();
  });
  measureOpacitySlider.addEventListener('input', () => {
    waveform.measureOpacity = parseFloat(measureOpacitySlider.value);
    measureOpacityPct.textContent = pct(waveform.measureOpacity);
    waveform.markDirty();
    updateProfileSelect();
  });
  beatOpacitySlider.addEventListener('input', () => {
    waveform.beatOpacity = parseFloat(beatOpacitySlider.value);
    beatOpacityPct.textContent = pct(waveform.beatOpacity);
    waveform.markDirty();
    updateProfileSelect();
  });
  bandOpacitySlider.addEventListener('input', () => {
    waveform.bandOpacity = parseFloat(bandOpacitySlider.value);
    bandOpacityPct.textContent = pct(waveform.bandOpacity);
    waveform.markDirty();
    updateProfileSelect();
  });

  /* ══ Pins (marqueurs utilisateur sur la règle) ══════════════════ */

  const pinPopup      = $('pin-popup');
  const pinColorInput = $('pin-color');
  const pinBtnSnap    = $('pin-btn-snap');
  const pinBtnDelete  = $('pin-btn-delete');
  const pinBtnClose   = $('pin-btn-close');

  let _activePinIdx       = -1;
  let _pinPopupJustOpened = false;
  let _lockedPinIdx       = -1;   // index du pin dont la grille est verrouillie
  let _settingLockOffset  = false; // vrai pendant _applyLockOffset (ignore le déverrouillage auto)

  function _unlockPin() {
    _lockedPinIdx          = -1;
    waveform.lockedPinTime = null;
    offsetGroup.classList.remove('locked');
    if (_activePinIdx >= 0) {
      pinBtnSnap.textContent = 'Caler la grille ici';
      pinBtnSnap.classList.remove('locked');
    }
  }

  function _applyLockOffset() {
    if (_lockedPinIdx < 0 || _lockedPinIdx >= waveform.pins.length) return;
    const pinTime    = waveform.pins[_lockedPinIdx].time;
    waveform.lockedPinTime = pinTime;
    const secPerLoop = (60 / metro.bpm) * metro.beatsPerMeasure * metro.measuresPerLoop;
    let newOffset = ((pinTime % secPerLoop) + secPerLoop) % secPerLoop;
    if (newOffset > secPerLoop / 2) newOffset -= secPerLoop;
    _settingLockOffset = true;
    setOffset(newOffset);
    _settingLockOffset = false;
  }

  function showPinPopup(idx, screenX, screenY) {
    _activePinIdx       = idx;
    _pinPopupJustOpened = true;
    pinColorInput.value = waveform.pins[idx].color;

    // Mettre à jour l'état du bouton verrou
    const isLocked = (_lockedPinIdx === idx);
    pinBtnSnap.textContent = isLocked ? '🔒 Déverrouiller la grille' : 'Caler la grille ici';
    pinBtnSnap.classList.toggle('locked', isLocked);
    offsetGroup.classList.toggle('locked', isLocked);

    // Positionnement : éviter de sortir de l'écran
    const PW = 188, PH = 135;
    let left = screenX + 24;
    let top  = screenY - Math.round(PH / 2);
    left = Math.min(left, window.innerWidth  - PW - 6);
    top  = Math.max(top,  6);
    top  = Math.min(top,  window.innerHeight - PH - 6);
    pinPopup.style.left = left + 'px';
    pinPopup.style.top  = top  + 'px';
    pinPopup.classList.remove('hidden');
  }

  function closePinPopup() {
    pinPopup.classList.add('hidden');
    _activePinIdx = -1;
  }

  waveform.onPinClick = (idx, sx, sy) => showPinPopup(idx, sx, sy);

  // Transition mode sinusoïdal : sauvegarde/restaure hauteur et opacité des barres de temps
  let _sineSavedHeight  = null;
  let _sineSavedOpacity = null;
  waveform.onSineModeChange = (isSine) => {
    if (isSine) {
      _sineSavedHeight  = waveform.beatBarHeight;
      _sineSavedOpacity = waveform.beatOpacity;
      // Passer à 60% effectif et opacité 90%
      waveform.beatBarHeight = 0.60 / Math.max(0.001, waveform.amplitudeScale * 2.0);
      waveform.beatOpacity   = 0.90;
      beatBarHeightSlider.value    = 0.60;
      beatBarHeightPct.textContent = pct(0.60);
      beatOpacitySlider.value      = 0.90;
      beatOpacityPct.textContent   = pct(0.90);
    } else {
      if (_sineSavedHeight  !== null) waveform.beatBarHeight = _sineSavedHeight;
      if (_sineSavedOpacity !== null) waveform.beatOpacity   = _sineSavedOpacity;
      const effH = Math.min(1, waveform.beatBarHeight * waveform.amplitudeScale * 2.0);
      beatBarHeightSlider.value    = effH;
      beatBarHeightPct.textContent = pct(effH);
      beatOpacitySlider.value      = waveform.beatOpacity;
      beatOpacityPct.textContent   = pct(waveform.beatOpacity);
      _sineSavedHeight  = null;
      _sineSavedOpacity = null;
    }
    waveform.markDirty();
  };

  // Bouton "Caler sur la tête de lecture" : pose un pin sur le playhead et le verrouille
  $('btn-snap-playhead').addEventListener('click', () => {
    if (!waveform.audioBuffer) return;
    const t = waveform.playheadTime ?? 0;
    // Poser le pin
    const pin = { time: t, color: waveform._randomPinColor() };
    waveform.pins.push(pin);
    // Verrouiller immédiatement ce pin
    _lockedPinIdx = waveform.pins.length - 1;
    waveform.lockedPinTime = t;
    offsetGroup.classList.add('locked');
    _applyLockOffset();
    waveform.markDirty();
    _saveSongData();
  });

  // Mise à jour du verrou lors d'une suppression par clic droit
  waveform.onPinDelete = (idx) => {
    if (idx === _lockedPinIdx) {
      _lockedPinIdx          = -1;
      waveform.lockedPinTime = null;
      offsetGroup.classList.remove('locked');
    } else if (idx < _lockedPinIdx) {
      _lockedPinIdx--;
    }
  };

  pinBtnClose.addEventListener('click', closePinPopup);

  pinColorInput.addEventListener('input', () => {
    if (_activePinIdx < 0 || _activePinIdx >= waveform.pins.length) return;
    waveform.pins[_activePinIdx].color = pinColorInput.value;
    waveform.markDirty();
    _saveSongData();
  });

  pinBtnDelete.addEventListener('click', () => {
    if (_activePinIdx < 0 || _activePinIdx >= waveform.pins.length) return;
    // Libérer le verrou si le pin supprimé était verrouillé
    if (_activePinIdx === _lockedPinIdx) {
      _lockedPinIdx          = -1;
      waveform.lockedPinTime = null;
      offsetGroup.classList.remove('locked');
    } else if (_activePinIdx < _lockedPinIdx) {
      // L'indice des pins suivants décale d'un cran
      _lockedPinIdx--;
    }
    waveform.pins.splice(_activePinIdx, 1);
    waveform.markDirty();
    _saveSongData();
    closePinPopup();
  });

  pinBtnSnap.addEventListener('click', () => {
    if (_activePinIdx < 0 || _activePinIdx >= waveform.pins.length) return;

    if (_lockedPinIdx === _activePinIdx) {
      // Déverrouiller
      _lockedPinIdx          = -1;
      waveform.lockedPinTime = null;
      offsetGroup.classList.remove('locked');
    } else {
      // Verrouiller ce pin et caler la grille
      _lockedPinIdx = _activePinIdx;
      offsetGroup.classList.add('locked');
      _applyLockOffset();
    }

    waveform.markDirty();
    _saveSongData();
    closePinPopup();
  });

  // Mise à jour en temps réel quand le pin verrouillé est glissé
  waveform.onPinDragMove = (idx) => {
    if (idx !== _lockedPinIdx) return;
    _applyLockOffset();
  };

  // Sauvegarde après tout changement de pin (création, suppression, fin de drag)
  waveform.onPinChange = () => _saveSongData();

  // Fermer le popup sur clic extérieur
  document.addEventListener('mousedown', (e) => {
    if (_pinPopupJustOpened) { _pinPopupJustOpened = false; return; }
    if (!pinPopup.classList.contains('hidden') && !pinPopup.contains(e.target)) {
      closePinPopup();
    }
  });

  /* ══ Menu contextuel règle (clic droit zone vide) ════════════════════ */

  const rulerCtxMenu       = $('ruler-ctx-menu');
  const rulerCtxDeleteAll  = $('ruler-ctx-delete-all');
  let   _ctxMenuJustOpened = false;

  function showRulerCtxMenu(sx, sy) {
    _ctxMenuJustOpened = true;
    const MW = 210, MH = 36;
    let left = Math.min(sx, window.innerWidth  - MW - 6);
    let top  = Math.min(sy, window.innerHeight - MH - 6);
    rulerCtxMenu.style.left = left + 'px';
    rulerCtxMenu.style.top  = top  + 'px';
    rulerCtxMenu.classList.remove('hidden');
  }

  function closeRulerCtxMenu() {
    rulerCtxMenu.classList.add('hidden');
  }

  waveform.onRulerEmptyRightClick = (sx, sy) => {
    if (waveform.pins.length > 0) {
      const hasLock = _lockedPinIdx >= 0 && _lockedPinIdx < waveform.pins.length;
      rulerCtxDeleteAll.textContent = hasLock
        ? 'Supprimer tous les marqueurs (sauf le verrou)'
        : 'Supprimer tous les marqueurs';
      showRulerCtxMenu(sx, sy);
    }
  };

  rulerCtxDeleteAll.addEventListener('click', () => {
    if (_lockedPinIdx >= 0 && _lockedPinIdx < waveform.pins.length) {
      // Garder uniquement le pin verrouillé
      const lockedPin = waveform.pins[_lockedPinIdx];
      waveform.pins.length = 0;
      waveform.pins.push(lockedPin);
      _lockedPinIdx = 0;
    } else {
      // Pas de verrou : tout supprimer
      _lockedPinIdx          = -1;
      waveform.lockedPinTime = null;
      waveform.pins.length   = 0;
    }
    waveform.markDirty();
    _saveSongData();
    closeRulerCtxMenu();
  });

  document.addEventListener('mousedown', (e) => {
    if (_ctxMenuJustOpened) { _ctxMenuJustOpened = false; return; }
    if (!rulerCtxMenu.classList.contains('hidden') && !rulerCtxMenu.contains(e.target)) {
      closeRulerCtxMenu();
    }
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
  const WAVE_H_KEY    = 'tempomatcher_wave_height';

  // Restaurer la hauteur sauvegardée de la waveform
  (function _restoreWaveHeight() {
    const saved = parseInt(localStorage.getItem(WAVE_H_KEY), 10);
    if (saved >= MIN_WAVE_H && saved <= MAX_WAVE_H) {
      waveSection.style.flex   = `0 0 ${saved}px`;
      waveSection.style.height = saved + 'px';
    }
  })();

  let _resizing      = false;
  let _resizeStartY  = 0;
  let _resizeStartH  = 0;

  resizeHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    // Épingler immédiatement la hauteur courante pour éviter le saut au premier mousemove
    const h = waveSection.offsetHeight;
    waveSection.style.flex   = `0 0 ${h}px`;
    waveSection.style.height = h + 'px';
    _resizing      = true;
    _resizeStartY  = e.clientY;
    _resizeStartH  = h;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor     = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!_resizing) return;
    const dy   = e.clientY - _resizeStartY;
    const newH = Math.max(MIN_WAVE_H, Math.min(MAX_WAVE_H, _resizeStartH + dy));
    // Désactiver flex grow/shrink pour que height soit respecté
    waveSection.style.flex   = `0 0 ${newH}px`;
    waveSection.style.height = newH + 'px';
    waveform.markDirty();
  });

  document.addEventListener('mouseup', () => {
    if (!_resizing) return;
    _resizing = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    // Sauvegarder la hauteur pour la prochaine session
    localStorage.setItem(WAVE_H_KEY, waveSection.offsetHeight);
    waveform.markDirty();
  });

  /* ══ Double-clic sliders → valeur initiale ═══════════════════════ */

  function dblReset(slider, defaultVal, onReset) {
    slider.addEventListener('dblclick', () => {
      const v = typeof defaultVal === 'function' ? defaultVal() : defaultVal;
      slider.value = v;
      onReset(v);
    });
  }

  dblReset(bpmSlider,              120,  v => setBPM(v));
  dblReset(offsetSlider,             0,  v => setOffset(v));
  dblReset(volumeSlider,           0.8,  v => { audio.setVolume(v); syncVolDisplays(v); });
  dblReset(metroVolSlider,         1.0,  v => { metro.volume = v; metroVolPct.textContent = pct(v); });
  dblReset(amplitudeSlider,        0.5,  v => { waveform.amplitudeScale = v; amplitudePct.textContent = pct(v); waveform.markDirty(); });
  dblReset(measureBarHeightSlider, () => _getActiveProfile().measureHeight, v => { waveform.measureBarHeight    = v; measureBarHeightPct.textContent = pct(v); waveform.markDirty(); updateProfileSelect(); });
  dblReset(loopBarHeightSlider,    () => _getActiveProfile().loopHeight,    v => { waveform.loopBarHeight       = v; loopBarHeightPct.textContent    = pct(v); waveform.markDirty(); updateProfileSelect(); });
  dblReset(beatBarHeightSlider,    () => _getActiveProfile().beatHeight,    v => {
    waveform.beatBarHeight = v / Math.max(0.001, waveform.amplitudeScale * 2.0);
    beatBarHeightPct.textContent = pct(v);
    waveform.markDirty();
    updateProfileSelect();
  });
  dblReset(bandHeightSlider,       () => _getActiveProfile().bandsHeight,   v => { waveform.loopBandHeightScale = v; bandHeightPct.textContent       = pct(v); waveform.markDirty(); updateProfileSelect(); });
  dblReset(waveOpacitySlider,      () => _getActiveProfile().waveOpacity,   v => { waveform.waveOpacity    = v; waveOpacityPct.textContent    = pct(v); waveform.markDirty(); updateProfileSelect(); });
  dblReset(loopOpacitySlider,      () => _getActiveProfile().loopOpacity,   v => { waveform.loopOpacity    = v; loopOpacityPct.textContent    = pct(v); waveform.markDirty(); updateProfileSelect(); });
  dblReset(measureOpacitySlider,   () => _getActiveProfile().measureOpacity,v => { waveform.measureOpacity = v; measureOpacityPct.textContent = pct(v); waveform.markDirty(); updateProfileSelect(); });
  dblReset(beatOpacitySlider,      () => _getActiveProfile().beatOpacity,   v => { waveform.beatOpacity    = v; beatOpacityPct.textContent    = pct(v); waveform.markDirty(); updateProfileSelect(); });
  dblReset(bandOpacitySlider,      () => _getActiveProfile().bandsOpacity,  v => { waveform.bandOpacity    = v; bandOpacityPct.textContent    = pct(v); waveform.markDirty(); updateProfileSelect(); });

  // Labels non-profil
  amplitudePct.textContent = pct(0.5);
  // volumePct est initialisé par _restoreVolume() → syncVolDisplays(), pas besoin ici
  metroVolPct.textContent  = pct(1.0);

  /* ══ Profils visuels marqueurs ══════════════════════════════════ */

  // Clés des profils natifs (jamais supprimables, non écrasables)
  const BUILT_IN_PROFILES = new Set(['defaut', 'nocturne', 'vif', 'pastel', 'mono', 'personnalise']);

  // ── Persistance des profils marqueurs ──────────────────────────────

  /** Sauvegarde les profils utilisateur + la clé active dans localStorage. */
  function _saveProfiles() {
    const userProfiles = {};
    for (const [key, val] of Object.entries(MARKER_PROFILES)) {
      if (!BUILT_IN_PROFILES.has(key)) userProfiles[key] = val;
    }
    // Ne sauvegarder que les profils utilisateur, pas la sélection active
    // (le preset est restauré par morceau via TM_SongStorage)
    TM_Storage.save('markerProfiles', { profiles: userProfiles });
  }

  /**
   * Restaure les profils utilisateur + la sélection depuis localStorage.
   * Doit être appelée après MARKER_PROFILES et le DOM.
   * Retourne la clé du profil à appliquer au démarrage.
   */
  function _restoreProfiles() {
    const saved = TM_Storage.load('markerProfiles');
    if (!saved) return 'defaut';
    // Réinjecter les profils utilisateur
    const profiles = saved.profiles || {};
    for (const [name, data] of Object.entries(profiles)) {
      if (BUILT_IN_PROFILES.has(name)) continue;
      MARKER_PROFILES[name] = data;
      const personnaliseOpt = markerProfileSelect.querySelector('option[value="personnalise"]');
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = '★ ' + name;
      opt.style.color = '#f0b94a';
      opt.style.fontStyle = 'italic';
      markerProfileSelect.insertBefore(opt, personnaliseOpt);
    }
    // Toujours démarrer sur le preset par défaut au chargement de la page.
    // Le preset spécifique au morceau sera restauré par _restoreSongData.
    return 'defaut';
  }

  // ── État de gestion des profils ──────────────────────────────────
  let _applyingProfile = false;   // vrai pendant applyProfile() → bloque updateProfileSelect
  let _baseProfileKey  = 'defaut'; // dernier profil nommé sélectionné (hors "personnalise")

  // Renvoie le profil actif (profil courant ou, si "personnalise", le dernier profil nommé)
  function _getActiveProfile() {
    const pk = markerProfileSelect.value;
    return MARKER_PROFILES[pk] || MARKER_PROFILES[_baseProfileKey] || MARKER_PROFILES['defaut'];
  }

  // Lit l'état courant de tous les contrôles de style des marqueurs
  function _getCurrentMarkerState() {
    return {
      loopColor:     colorLoop.value,
      measureColor:  colorMeasure.value,
      beatColor:     colorBeat.value,
      bandsColor:    colorBands.value,
      waveColor:     waveColorPicker.value,
      loopHeight:    parseFloat(loopBarHeightSlider.value),
      measureHeight: parseFloat(measureBarHeightSlider.value),
      beatHeight:    parseFloat(beatBarHeightSlider.value),
      bandsHeight:   parseFloat(bandHeightSlider.value),
      loopOpacity:   parseFloat(loopOpacitySlider.value),
      measureOpacity:parseFloat(measureOpacitySlider.value),
      beatOpacity:   parseFloat(beatOpacitySlider.value),
      bandsOpacity:  parseFloat(bandOpacitySlider.value),
      waveOpacity:   parseFloat(waveOpacitySlider.value),
    };
  }

  // Compare un état courant avec un profil (tolérance sur les flottants)
  function _profileStrictMatch(state, p) {
    const EPS = 0.011;
    const ceq = (a, b) => a.toLowerCase() === b.toLowerCase();
    return ceq(state.loopColor,    p.loopColor)
        && ceq(state.measureColor, p.measureColor)
        && ceq(state.beatColor,    p.beatColor)
        && ceq(state.bandsColor,   p.bandsColor)
        && ceq(state.waveColor,    p.waveColor)
        && Math.abs(state.loopHeight     - p.loopHeight)     < EPS
        && Math.abs(state.measureHeight  - p.measureHeight)  < EPS
        && Math.abs(state.beatHeight     - p.beatHeight)     < EPS
        && Math.abs(state.bandsHeight    - p.bandsHeight)    < EPS
        && Math.abs(state.loopOpacity    - p.loopOpacity)    < EPS
        && Math.abs(state.measureOpacity - p.measureOpacity) < EPS
        && Math.abs(state.beatOpacity    - p.beatOpacity)    < EPS
        && Math.abs(state.bandsOpacity   - p.bandsOpacity)   < EPS
        && Math.abs(state.waveOpacity    - p.waveOpacity)    < EPS;
  }

  // Met à jour visuellement le bouton "+" et le bouton poubelle
  function _syncAddProfileBtn() {
    const cur      = markerProfileSelect.value;
    const isCustom = (cur === 'personnalise');
    const isUser   = !BUILT_IN_PROFILES.has(cur);  // profil créé par l'utilisateur
    // "+" : actif seulement en mode Personnalisé
    btnAddProfile.disabled = !isCustom;
    btnAddProfile.classList.toggle('active-hint', isCustom);
    // Poubelle : visible uniquement sur les profils utilisateur
    btnDelProfile.style.display = isUser ? '' : 'none';
    // Colorer le select fermé en orange si profil utilisateur sélectionné
    markerProfileSelect.classList.toggle('profile-select--custom', isUser);
  }

  // Détecte si l'état courant correspond à un profil connu ; sinon → "Personnalisé"
  function updateProfileSelect() {
    if (_applyingProfile) return;
    const state = _getCurrentMarkerState();
    for (const [name, p] of Object.entries(MARKER_PROFILES)) {
      if (name === 'personnalise') continue;
      if (_profileStrictMatch(state, p)) {
        markerProfileSelect.value = name;
        _baseProfileKey = name;
        _syncAddProfileBtn();
        return;
      }
    }
    markerProfileSelect.value = 'personnalise';
    _syncAddProfileBtn();
  }

  const MARKER_PROFILES = {
    defaut: {
      loopColor: '#ff3355', measureColor: '#ff8800', beatColor: '#33dd88',
      bandsColor: '#ffffff', waveColor: '#3d8edd',
      loopHeight: 1.0, measureHeight: 0.70, beatHeight: 0.05, bandsHeight: 1.0,
      loopOpacity: 0.7, measureOpacity: 0.4, beatOpacity: 0.50,
      bandsOpacity: 0.07, waveOpacity: 1.0,
    },
    nocturne: {
      loopColor: '#6655ff', measureColor: '#9966cc', beatColor: '#44aacc',
      bandsColor: '#334477', waveColor: '#2255bb',
      loopHeight: 0.80, measureHeight: 0.55, beatHeight: 0.08, bandsHeight: 1.0,
      loopOpacity: 0.7, measureOpacity: 0.4, beatOpacity: 0.35,
      bandsOpacity: 0.10, waveOpacity: 0.75,
    },
    vif: {
      loopColor: '#ff0066', measureColor: '#ffcc00', beatColor: '#00ffaa',
      bandsColor: '#ff6600', waveColor: '#00ccff',
      loopHeight: 1.0, measureHeight: 0.85, beatHeight: 0.05, bandsHeight: 1.0,
      loopOpacity: 0.7, measureOpacity: 0.4, beatOpacity: 0.4,
      bandsOpacity: 0.12, waveOpacity: 1.0,
    },
    pastel: {
      loopColor: '#ffaabb', measureColor: '#ffddaa', beatColor: '#aaffcc',
      bandsColor: '#bbccff', waveColor: '#99bbff',
      loopHeight: 1.0, measureHeight: 0.70, beatHeight: 0.05, bandsHeight: 1.0,
      loopOpacity: 0.7, measureOpacity: 0.4, beatOpacity: 0.55,
      bandsOpacity: 0.05, waveOpacity: 0.70,
    },
    mono: {
      loopColor: '#ffffff', measureColor: '#cccccc', beatColor: '#999999',
      bandsColor: '#ffffff', waveColor: '#dddddd',
      loopHeight: 1.0, measureHeight: 0.60, beatHeight: 0.08, bandsHeight: 1.0,
      loopOpacity: 0.7, measureOpacity: 0.4, beatOpacity: 0.70,
      bandsOpacity: 0.04, waveOpacity: 0.80,
    },
  };

  function _applyHexToWave(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    waveform.waveColorStroke = hex;
    waveform.waveColorFill   = `rgb(${Math.round(r*0.45)},${Math.round(g*0.45)},${Math.round(b*0.45)})`;
  }

  function _applyProfileData(p) {
    _applyingProfile = true;
    // Couleurs
    colorLoop.value          = p.loopColor;    waveform.markerColorLoop    = p.loopColor;
    colorMeasure.value       = p.measureColor; waveform.markerColorMeasure = p.measureColor;
    colorBeat.value          = p.beatColor;    waveform.markerColorBeat    = p.beatColor;
    colorBands.value         = p.bandsColor;   waveform.loopBandColor      = p.bandsColor;
    waveColorPicker.value    = p.waveColor;    _applyHexToWave(p.waveColor);
    // Hauteurs
    loopBarHeightSlider.value     = p.loopHeight;    waveform.loopBarHeight       = p.loopHeight;    loopBarHeightPct.textContent    = pct(p.loopHeight);
    measureBarHeightSlider.value  = p.measureHeight; waveform.measureBarHeight    = p.measureHeight; measureBarHeightPct.textContent = pct(p.measureHeight);
    beatBarHeightSlider.value     = p.beatHeight;
    waveform.beatBarHeight = p.beatHeight / Math.max(0.001, waveform.amplitudeScale * 2.0);
    beatBarHeightPct.textContent  = pct(p.beatHeight);
    bandHeightSlider.value        = p.bandsHeight;   waveform.loopBandHeightScale = p.bandsHeight;   bandHeightPct.textContent       = pct(p.bandsHeight);
    // Opacités
    loopOpacitySlider.value       = p.loopOpacity;    waveform.loopOpacity    = p.loopOpacity;    loopOpacityPct.textContent    = pct(p.loopOpacity);
    measureOpacitySlider.value    = p.measureOpacity; waveform.measureOpacity = p.measureOpacity; measureOpacityPct.textContent = pct(p.measureOpacity);
    beatOpacitySlider.value       = p.beatOpacity;    waveform.beatOpacity    = p.beatOpacity;    beatOpacityPct.textContent    = pct(p.beatOpacity);
    bandOpacitySlider.value       = p.bandsOpacity;   waveform.bandOpacity    = p.bandsOpacity;   bandOpacityPct.textContent    = pct(p.bandsOpacity);
    waveOpacitySlider.value       = p.waveOpacity;    waveform.waveOpacity    = p.waveOpacity;    waveOpacityPct.textContent    = pct(p.waveOpacity);
    // Si en mode sinus : conserver les overrides 60%/90%, sauvegarder les valeurs du profil
    if (waveform._isSineMode) {
      _sineSavedHeight  = p.beatHeight / Math.max(0.001, waveform.amplitudeScale * 2.0);
      _sineSavedOpacity = p.beatOpacity;
      waveform.beatBarHeight = 0.60 / Math.max(0.001, waveform.amplitudeScale * 2.0);
      waveform.beatOpacity   = 0.90;
      beatBarHeightSlider.value    = 0.60;
      beatBarHeightPct.textContent = pct(0.60);
      beatOpacitySlider.value      = 0.90;
      beatOpacityPct.textContent   = pct(0.90);
    }
    waveform.markDirty();
    _applyingProfile = false;
  }

  function applyProfile(name) {
    const p = MARKER_PROFILES[name]; if (!p) return;
    if (name !== 'personnalise') _baseProfileKey = name;
    _applyProfileData(p);
  }

  markerProfileSelect.addEventListener('change', () => {
    const name = markerProfileSelect.value;
    if (name !== 'personnalise') {
      _baseProfileKey = name;
      applyProfile(name);
      _saveSongData();
    }
    _syncAddProfileBtn();
    _saveProfiles();
  });

  btnProfileReset.addEventListener('click', () => {
    // En mode personnalisé, réinitialise vers le dernier profil nommé
    const key = MARKER_PROFILES[markerProfileSelect.value] ? markerProfileSelect.value : _baseProfileKey;
    applyProfile(key);
    markerProfileSelect.value = key;
    _syncAddProfileBtn();
  });

  // Restaurer les profils utilisateur depuis localStorage, puis appliquer le dernier
  const _startProfile = _restoreProfiles();
  applyProfile(_startProfile);
  markerProfileSelect.value = _startProfile;
  _syncAddProfileBtn();

  // ── Input inline : afficher / cacher ───────────────────────────────
  function _showProfileNameInput() {
    profileSelectWrap.style.display = 'none';
    profileNameWrap.style.display   = 'flex';
    profileNameInput.value = '';
    profileNameInput.classList.remove('profile-name-error');
    setTimeout(() => profileNameInput.focus(), 0);
  }

  function _hideProfileNameInput() {
    profileNameWrap.style.display   = 'none';
    profileSelectWrap.style.display = '';
    profileNameInput.value = '';
    profileNameInput.classList.remove('profile-name-error');
  }

  function _flashNameError() {
    profileNameInput.classList.remove('profile-name-error');
    void profileNameInput.offsetWidth; // reflow pour relancer l'anim
    profileNameInput.classList.add('profile-name-error');
    profileNameInput.addEventListener('animationend', () =>
      profileNameInput.classList.remove('profile-name-error'), { once: true });
    profileNameInput.focus();
    profileNameInput.select();
  }

  // ── Confirmation du nom ──────────────────────────────────────────
  function _confirmProfileName() {
    const name = profileNameInput.value.trim();
    if (!name) { _flashNameError(); return; }

    // Noms réservés
    if (BUILT_IN_PROFILES.has(name.toLowerCase())) { _flashNameError(); return; }

    // Profil écrasé ?
    const alreadyExists = Object.prototype.hasOwnProperty.call(MARKER_PROFILES, name);
    if (alreadyExists) {
      const ok = window.confirm(`Le profil « ${name} » existe déjà. Voulez-vous l’écraser ?`);
      if (!ok) { profileNameInput.focus(); return; }
    }

    // Snapshot de l'état courant
    const s = _getCurrentMarkerState();
    MARKER_PROFILES[name] = {
      loopColor: s.loopColor, measureColor: s.measureColor, beatColor: s.beatColor,
      bandsColor: s.bandsColor, waveColor: s.waveColor,
      loopHeight: s.loopHeight, measureHeight: s.measureHeight, beatHeight: s.beatHeight, bandsHeight: s.bandsHeight,
      loopOpacity: s.loopOpacity, measureOpacity: s.measureOpacity, beatOpacity: s.beatOpacity, bandsOpacity: s.bandsOpacity,
      waveOpacity: s.waveOpacity,
    };

    // DOM : ajouter ou recycler l'option
    if (!alreadyExists) {
      const personnaliseOpt = markerProfileSelect.querySelector('option[value="personnalise"]');
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = '★ ' + name;
      opt.style.color = '#f0b94a';
      opt.style.fontStyle = 'italic';
      markerProfileSelect.insertBefore(opt, personnaliseOpt);
    }

    _hideProfileNameInput();
    markerProfileSelect.value = name;
    _baseProfileKey = name;
    _syncAddProfileBtn();
    _saveProfiles();
  }

  btnAddProfile.addEventListener('click', () => {
    if (markerProfileSelect.value !== 'personnalise') return;
    _showProfileNameInput();
  });

  btnProfileNameOk.addEventListener('click', _confirmProfileName);

  btnProfileNameCancel.addEventListener('click', _hideProfileNameInput);

  profileNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); _confirmProfileName(); }
    if (e.key === 'Escape') { e.preventDefault(); _hideProfileNameInput(); }
  });

  // ── Suppression d'un profil utilisateur ────────────────────────────
  btnDelProfile.addEventListener('click', () => {
    const name = markerProfileSelect.value;
    if (BUILT_IN_PROFILES.has(name)) return; // sécurité supplémentaire
    // Supprimer du registre
    delete MARKER_PROFILES[name];
    // Supprimer du DOM
    const opt = markerProfileSelect.querySelector(`option[value="${CSS.escape(name)}"]`);
    if (opt) opt.remove();
    // Repasser en Personnalisé (les valeurs affichées restent intactes)
    markerProfileSelect.value = 'personnalise';
    _baseProfileKey = 'defaut';
    _syncAddProfileBtn();
    _saveProfiles();
  });

  btnResetHeights.addEventListener('click', () => {
    const p = _getActiveProfile();
    loopBarHeightSlider.value     = p.loopHeight;    waveform.loopBarHeight       = p.loopHeight;    loopBarHeightPct.textContent    = pct(p.loopHeight);
    measureBarHeightSlider.value  = p.measureHeight; waveform.measureBarHeight    = p.measureHeight; measureBarHeightPct.textContent = pct(p.measureHeight);
    beatBarHeightSlider.value     = p.beatHeight;
    waveform.beatBarHeight = p.beatHeight / Math.max(0.001, waveform.amplitudeScale * 2.0);
    beatBarHeightPct.textContent  = pct(p.beatHeight);
    bandHeightSlider.value        = p.bandsHeight;   waveform.loopBandHeightScale = p.bandsHeight;   bandHeightPct.textContent = pct(p.bandsHeight);
    // Si en mode sinus : conserver l'override 60%, sauvegarder la valeur du profil
    if (waveform._isSineMode) {
      _sineSavedHeight = p.beatHeight / Math.max(0.001, waveform.amplitudeScale * 2.0);
      waveform.beatBarHeight = 0.60 / Math.max(0.001, waveform.amplitudeScale * 2.0);
      beatBarHeightSlider.value    = 0.60;
      beatBarHeightPct.textContent = pct(0.60);
    }
    waveform.markDirty();
    updateProfileSelect();
  });

  btnResetOpacities.addEventListener('click', () => {
    const p = _getActiveProfile();
    loopOpacitySlider.value    = p.loopOpacity;    waveform.loopOpacity    = p.loopOpacity;    loopOpacityPct.textContent    = pct(p.loopOpacity);
    measureOpacitySlider.value = p.measureOpacity; waveform.measureOpacity = p.measureOpacity; measureOpacityPct.textContent = pct(p.measureOpacity);
    beatOpacitySlider.value    = p.beatOpacity;    waveform.beatOpacity    = p.beatOpacity;    beatOpacityPct.textContent    = pct(p.beatOpacity);
    bandOpacitySlider.value    = p.bandsOpacity;   waveform.bandOpacity    = p.bandsOpacity;   bandOpacityPct.textContent    = pct(p.bandsOpacity);
    waveOpacitySlider.value    = p.waveOpacity;    waveform.waveOpacity    = p.waveOpacity;    waveOpacityPct.textContent    = pct(p.waveOpacity);
    // Si en mode sinus : conserver l'override 90%, sauvegarder la valeur du profil
    if (waveform._isSineMode) {
      _sineSavedOpacity = p.beatOpacity;
      waveform.beatOpacity = 0.90;
      beatOpacitySlider.value    = 0.90;
      beatOpacityPct.textContent = pct(0.90);
    }
    waveform.markDirty();
    updateProfileSelect();
  });

  btnResetColors.addEventListener('click', () => {
    const p = _getActiveProfile();
    colorLoop.value    = p.loopColor;    waveform.markerColorLoop    = p.loopColor;
    colorMeasure.value = p.measureColor; waveform.markerColorMeasure = p.measureColor;
    colorBeat.value    = p.beatColor;    waveform.markerColorBeat    = p.beatColor;
    colorBands.value   = p.bandsColor;   waveform.loopBandColor      = p.bandsColor;
    waveColorPicker.value = p.waveColor; _applyHexToWave(p.waveColor);
    waveform.markDirty();
    updateProfileSelect();
  });

  /* ══ Clavier ═════════════════════════════════════════════════════ */

  // Ctrl+Z / Ctrl+Y en phase de CAPTURE pour court-circuiter le undo natif du navigateur
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      brushUndo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      brushRedo();
    }
  }, true);  // ← phase de capture

  document.addEventListener('keydown', e => {
    // Ignorer si focus sur un input
    if (e.target.tagName === 'INPUT') return;

    // Ctrl+Z / Ctrl+Y — gérés par le listener capture ci-dessus, ignorer ici
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) return;

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
      case 'KeyB':
        activateBrush();
        break;
      case 'KeyH':
      case 'Escape':
        deactivateBrush();
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

  /* ══ Panneaux redimensionnables + réordonnables ══════════════════ */
  (function initPanelInteract() {
    const section = document.getElementById('metronome-section');
    const MIN_W = 120;

    function getGroups() {
      return [...section.querySelectorAll(':scope > .metro-group')];
    }
    function clearHandles() {
      section.querySelectorAll(':scope > .metro-resize-handle').forEach(h => h.remove());
    }
    function injectHandles() {
      clearHandles();
      const groups = getGroups();
      // Figer les largeurs actuelles si pas encore définies
      groups.forEach(g => {
        const w = g.offsetWidth;
        if (!g.dataset.initWidth) g.dataset.initWidth = w;
        if (!g.style.width) g.style.width = w + 'px';
      });
      // Insérer un handle entre chaque groupe
      for (let i = 0; i < groups.length - 1; i++) {
        const h = document.createElement('div');
        h.className = 'metro-resize-handle';
        groups[i].insertAdjacentElement('afterend', h);
      }
        // Toujours ajouter un handle à droite du dernier groupe
        if (groups.length > 0) {
          const h = document.createElement('div');
          h.className = 'metro-resize-handle';
          groups[groups.length - 1].insertAdjacentElement('afterend', h);
        }
    }
    function injectGrips() {
      getGroups().forEach(group => {
        if (group.querySelector('.panel-top-hover')) return;
        const zone = document.createElement('div');
        zone.className = 'panel-top-hover';
        const grip = document.createElement('div');
        grip.className = 'panel-drag-grip';
        grip.title = 'Glisser pour réordonner';
        grip.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.4"/><circle cx="7.5" cy="2.5" r="1.4"/><circle cx="2.5" cy="7" r="1.4"/><circle cx="7.5" cy="7" r="1.4"/><circle cx="2.5" cy="11.5" r="1.4"/><circle cx="7.5" cy="11.5" r="1.4"/></svg>`;
        zone.appendChild(grip);
        group.insertBefore(zone, group.firstChild);

        // Révèle le grip via mousemove (l'overlay est pointer-events:none,
        // donc on écoute sur le groupe parent pour ne pas bloquer les clics)
        group.addEventListener('mousemove', e => {
          const rect = group.getBoundingClientRect();
          const inTopZone = (e.clientY - rect.top) <= 34;
          group.classList.toggle('panel-top-hovered', inTopZone);
        });
        group.addEventListener('mouseleave', () => {
          group.classList.remove('panel-top-hovered');
        });
      });
    }

    injectHandles();
    injectGrips();

    // ── Double-clic handle → reset largeur initiale ──────────────────
    section.addEventListener('dblclick', e => {
      const h = e.target.closest('.metro-resize-handle');
      if (!h) return;
      const left = h.previousElementSibling;
      if (!left || !left.classList.contains('metro-group')) return;
      if (left.dataset.initWidth) left.style.width = left.dataset.initWidth + 'px';
    });

    // ── Resize ──────────────────────────────────────────────────────
    let _rs = null;
    section.addEventListener('mousedown', e => {
      const h = e.target.closest('.metro-resize-handle');
      if (!h) return;
      e.preventDefault();
      const left = h.previousElementSibling;
      if (!left || !left.classList.contains('metro-group')) return;
      _rs = { startX: e.clientX, startW: left.offsetWidth, left };
      h.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
      if (!_rs) return;
      // Calcul de la largeur max : espace du conteneur - somme des autres panneaux - poignées
      const allGroups  = [...section.querySelectorAll(':scope > .metro-group')];
      const allHandles = [...section.querySelectorAll(':scope > .metro-resize-handle')];
      const othersW = allGroups
        .filter(g => g !== _rs.left)
        .reduce((sum, g) => sum + g.offsetWidth, 0);
      const handlesW = allHandles.reduce((sum, h) => sum + h.offsetWidth, 0);
      const maxW = section.clientWidth - othersW - handlesW;
      // Largeur minimale = largeur initiale
      const minW = parseInt(_rs.left.dataset.initWidth) || MIN_W;
      const w = Math.min(Math.max(minW, _rs.startW + e.clientX - _rs.startX), Math.max(minW, maxW));
      _rs.left.style.width = w + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!_rs) return;
      section.querySelectorAll('.metro-resize-handle.active').forEach(h => h.classList.remove('active'));
      _rs = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });

    // ── Drag & Drop réordonnancement ────────────────────────────────
    let _dnd = null;
    section.addEventListener('pointerdown', e => {
      const grip = e.target.closest('.panel-drag-grip');
      if (!grip) return;
      const group = grip.closest('.metro-group');
      if (!group) return;
      e.preventDefault();
      const rect = group.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'panel-drag-ghost';
      ghost.style.cssText = `width:${rect.width}px;height:${rect.height}px;top:${rect.top}px;left:${rect.left}px;`;
      document.body.appendChild(ghost);
      group.classList.add('drag-source');
      _dnd = { group, ghost, offsetX: e.clientX - rect.left, pointerId: e.pointerId };
      try { section.setPointerCapture(e.pointerId); } catch(_) {}
    });
    section.addEventListener('pointermove', e => {
      if (!_dnd) return;
      _dnd.ghost.style.left = (e.clientX - _dnd.offsetX) + 'px';
      const others = getGroups().filter(g => g !== _dnd.group);
      let before = null;
      for (const g of others) {
        const r = g.getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) { before = g; break; }
      }
      others.forEach(g => g.classList.remove('drag-over', 'drag-over-after'));
      if (before) before.classList.add('drag-over');
      else if (others.length) others[others.length - 1].classList.add('drag-over-after');
    });
    function finishDnd(e) {
      if (!_dnd) return;
      const others = getGroups().filter(g => g !== _dnd.group);
      let before = null;
      if (e) {
        for (const g of others) {
          const r = g.getBoundingClientRect();
          if (e.clientX < r.left + r.width / 2) { before = g; break; }
        }
      }
      clearHandles();
      if (before) section.insertBefore(_dnd.group, before);
      else section.appendChild(_dnd.group);
      _dnd.ghost.remove();
      _dnd.group.classList.remove('drag-source');
      others.forEach(g => g.classList.remove('drag-over', 'drag-over-after'));
      _dnd = null;
      injectHandles();
      injectGrips();
    }
    section.addEventListener('pointerup', finishDnd);
    section.addEventListener('pointercancel', () => finishDnd(null));
  })();

  /* ══ VU-mètre + slider volume panneau ════════════════════════ */
  (function initVUMeter() {
    const canvas        = document.getElementById('vu-meter-canvas');
    const volPanSlider  = document.getElementById('vol-panel-slider');
    const volPanPct     = document.getElementById('vol-panel-pct');
    if (!canvas || !volPanSlider) return;

    // — Slider vertical sync bidirectionnel ——————————————————
    volPanSlider.addEventListener('input', () => {
      const v = parseFloat(volPanSlider.value);
      audio.setVolume(v);
      volumeSlider.value         = v;
      syncVolDisplays(v);
    });
    dblReset(volPanSlider, 0.8, v => {
      audio.setVolume(v);
      volumeSlider.value    = v;
      syncVolDisplays(v);
    });

    // — Canvas resize via ResizeObserver ——————————————————
    let _cvW = 0, _cvH = 0;
    const ro = new ResizeObserver(([e]) => {
      _cvW = Math.round(e.contentRect.width);
      _cvH = Math.round(e.contentRect.height);
      canvas.width  = _cvW;
      canvas.height = _cvH;
    });
    ro.observe(canvas);

    // — Utilitaires niveau ———————————————————————————
    const _tdBuf = { L: null, R: null };
    function getRMS(analyser, side) {
      if (!analyser) return 0;
      if (!_tdBuf[side] || _tdBuf[side].length !== analyser.fftSize)
        _tdBuf[side] = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(_tdBuf[side]);
      let s = 0;
      for (let i = 0; i < _tdBuf[side].length; i++) s += _tdBuf[side][i] ** 2;
      return Math.sqrt(s / _tdBuf[side].length);
    }
    function toNorm(rms) {
      // -60 dB → 0 dB  mapped to  0 → 1
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      return Math.max(0, Math.min(1, (db + 60) / 60));
    }

    // — Peak hold ——————————————————————————————————
    const HOLD_MS   = 1400;
    const FALL_SPD  = 0.0025; // normalisé/ms
    let pkL = 0, pkR = 0, pkLt = 0, pkRt = 0;

    // — Boucle rendu ————————————————————————————————
    let lastT = 0;
    function drawFrame(ts) {
      requestAnimationFrame(drawFrame);
      const dt = ts - lastT; lastT = ts;
      const W = _cvW, H = _cvH;
      if (W < 4 || H < 4) return;

      const ctx = canvas.getContext('2d');

      // Niveaux
      const lvlL = toNorm(getRMS(audio.analyserL, 'L'));
      const lvlR = toNorm(getRMS(audio.analyserR, 'R'));

      // Peak hold
      if (lvlL >= pkL) { pkL = lvlL; pkLt = ts; }
      else if (ts - pkLt > HOLD_MS) pkL = Math.max(0, pkL - FALL_SPD * (ts - pkLt - HOLD_MS));
      if (lvlR >= pkR) { pkR = lvlR; pkRt = ts; }
      else if (ts - pkRt > HOLD_MS) pkR = Math.max(0, pkR - FALL_SPD * (ts - pkRt - HOLD_MS));

      // Layout
      const DB_H    = 16;  // zone texte dB en haut
      const LABEL_H = 11;
      const barH    = H - DB_H - LABEL_H - 2;
      const gap     = 3;
      const barW    = Math.max(2, Math.floor((W - gap * 3) / 2));

      // Fond
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, W, H);

      // Gradient (bottom=vert, top=rouge) — réutilisé pour L et R
      const grad = ctx.createLinearGradient(0, LABEL_H, 0, LABEL_H + barH);
      grad.addColorStop(0.00, '#ff1a1a');
      grad.addColorStop(0.12, '#ff5500');
      grad.addColorStop(0.35, '#ffdd00');
      grad.addColorStop(0.65, '#44ee44');
      grad.addColorStop(1.00, '#1a991a');

      function drawBar(x, level, peak) {
        // Track sombre
        ctx.fillStyle = '#151515';
        ctx.fillRect(x, DB_H, barW, barH);

        // Barre de niveau
        const fillH = Math.max(0, Math.round(barH * level));
        if (fillH > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, DB_H + barH - fillH, barW, fillH);
          ctx.clip();
          ctx.fillStyle = grad;
          ctx.fillRect(x, DB_H, barW, barH);
          ctx.restore();
        }

        // Segments (grille discrète visuelle)
        const SEG = 3; // px par segment
        ctx.fillStyle = '#080808';
        for (let y = DB_H + SEG; y < DB_H + barH; y += SEG + 1)
          ctx.fillRect(x, y, barW, 1);

        // Ligne peak hold
        if (peak > 0.01) {
          const py = DB_H + barH - Math.round(barH * peak);
          ctx.fillStyle = peak > 0.82 ? '#ff4444' :
                          peak > 0.60 ? '#ffdd00' : '#55ee55';
          ctx.fillRect(x, Math.max(DB_H, py - 1), barW, 2);
        }
      }

      drawBar(gap,             lvlL, pkL);
      drawBar(gap * 2 + barW, lvlR, pkR);

      // Niveau en temps réel (zone DB_H en haut) — 0 = silence, 100 = plein
      const peakNorm = Math.max(lvlL, lvlR);
      if (peakNorm > 0.001) {
        const lvlVal  = Math.round(peakNorm * 100);
        const dbColor = peakNorm > 0.82 ? '#ff4444' : peakNorm > 0.60 ? '#ffdd00' : '#55ee55';
        ctx.fillStyle    = dbColor;
        ctx.font         = 'bold 8px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lvlVal, W / 2, DB_H / 2);
      }

      // Labels L / R
      ctx.fillStyle    = '#444';
      ctx.font         = '8px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('L', gap + barW / 2,             H);
      ctx.fillText('R', gap * 2 + barW + barW / 2,  H);
    }
    requestAnimationFrame(drawFrame);
  })();

  // ── Export ──────────────────────────────────────────────────────
  ExportManager.init();

  btnExport.addEventListener('click', () => {
    if (!audio.audioBuffer) return;
    ExportManager.open(
      audio.audioBuffer,
      audio.volume,
      {
        offset:           metro.offset,
        beatInterval:     metro.beatInterval,
        beatsPerMeasure:  metro.beatsPerMeasure,
        measuresPerLoop:  metro.measuresPerLoop,
        clickProfile:     metro.clickProfile,
        volume:           metro.volume,
        bpm:              metro.bpm,
      },
      _loadedFileName || 'export'
    );
  });

})();
