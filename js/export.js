/**
 * ExportManager — rendu offline + téléchargement WAV/MP3
 */
const ExportManager = (() => {

  /* ══ Encodeur WAV PCM 16 bits ═══════════════════════════════════ */
  function encodeWAV(buf) {
    const ch   = buf.numberOfChannels;
    const sr   = buf.sampleRate;
    const len  = buf.length;
    const bps  = 16;
    const ba   = ch * bps / 8;
    const data = len * ba;
    const ab   = new ArrayBuffer(44 + data);
    const dv   = new DataView(ab);
    const ws   = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    ws(0,  'RIFF'); dv.setUint32(4,  36 + data, true);
    ws(8,  'WAVE'); ws(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * ba, true); dv.setUint16(32, ba, true);
    dv.setUint16(34, bps, true); ws(36, 'data');
    dv.setUint32(40, data, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
        dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  /* ══ Déclencheur de téléchargement ═════════════════════════════ */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  /* ══ Rendu offline ══════════════════════════════════════════════ */
  // Génère un sample oscillateur (sine/square/sawtooth) à l'instant t
  function _oscSample(type, freq, t) {
    const phase = (t * freq) % 1.0;
    if (type === 'sine')     return Math.sin(2 * Math.PI * phase);
    if (type === 'square')   return phase < 0.5 ? 1.0 : -1.0;
    if (type === 'sawtooth') return 2.0 * phase - 1.0;
    return Math.sin(2 * Math.PI * phase);
  }

  // Pré-calcule un clic PCM complet pour un layer donné
  function _buildLayerClickPCM(sampleRate, layer, vol) {
    const nSamples = Math.ceil((layer.duration + 0.01) * sampleRate);
    const buf = new Float32Array(nSamples);
    const peakGain   = vol * layer.gain;
    const attackSamp = Math.round(layer.attack * sampleRate);
    const logRatio   = Math.log(0.0001); // cible expo decay
    for (let i = 0; i < nSamples; i++) {
      const t   = i / sampleRate;
      const raw = _oscSample(layer.type, layer.freq, t);
      let env;
      if (i < attackSamp) {
        env = attackSamp > 0 ? i / attackSamp : 1;
      } else {
        const decayT   = t - layer.attack;
        const decayDur = layer.duration - layer.attack;
        env = decayDur > 0 ? Math.exp(logRatio * decayT / decayDur) : 0;
      }
      buf[i] = raw * env * peakGain;
    }
    return buf;
  }

  // Rendu du métronome via PCM pré-calculé (un seul BufferSourceNode)
  function renderMetroClicks(offCtx, mp, dur, vol) {
    const { offset, beatInterval, beatsPerMeasure, measuresPerLoop, clickProfile } = mp;
    const total    = beatsPerMeasure * measuresPerLoop;
    const profile  = (typeof CLICK_PROFILES !== 'undefined' && CLICK_PROFILES[clickProfile])
                     ? CLICK_PROFILES[clickProfile] : CLICK_PROFILES['defaut'];
    const sampleRate   = offCtx.sampleRate;
    const totalSamples = offCtx.length;

    const clicks = {
      loop:     _buildLayerClickPCM(sampleRate, profile.loop,     vol),
      downbeat: _buildLayerClickPCM(sampleRate, profile.downbeat, vol),
      beat:     _buildLayerClickPCM(sampleRate, profile.beat,     vol),
    };

    const outBuf  = offCtx.createBuffer(1, totalSamples, sampleRate);
    const outData = outBuf.getChannelData(0);

    for (let i = 0; i < 500000; i++) {
      const t = offset + i * beatInterval;
      if (t > dur + 0.5) break;
      if (t < 0) continue;
      const bi   = ((i % total) + total) % total;
      const inM  = bi % beatsPerMeasure;
      const isLS = (bi === 0);
      const isDn = (!isLS && inM === 0);
      const click = isLS ? clicks.loop : (isDn ? clicks.downbeat : clicks.beat);
      const sOff  = Math.round(t * sampleRate);
      for (let j = 0; j < click.length; j++) {
        const si = sOff + j;
        if (si >= totalSamples) break;
        outData[si] += click[j];
      }
    }

    const src = offCtx.createBufferSource();
    src.buffer = outBuf;
    src.connect(offCtx.destination);
    src.start(0);
  }

  async function renderAudio(audioBuf, vol) {
    const off  = new OfflineAudioContext(audioBuf.numberOfChannels, audioBuf.length, audioBuf.sampleRate);
    const src  = off.createBufferSource();
    const gain = off.createGain();
    src.buffer = audioBuf; gain.gain.value = vol;
    src.connect(gain); gain.connect(off.destination); src.start(0);
    return off.startRendering();
  }

  async function renderMetro(audioBuf, mp) {
    const off = new OfflineAudioContext(audioBuf.numberOfChannels, audioBuf.length, audioBuf.sampleRate);
    renderMetroClicks(off, mp, audioBuf.duration, 1.0);
    return off.startRendering();
  }

  async function renderMix(audioBuf, vol, mp) {
    const off  = new OfflineAudioContext(audioBuf.numberOfChannels, audioBuf.length, audioBuf.sampleRate);
    const src  = off.createBufferSource();
    const gain = off.createGain();
    src.buffer = audioBuf; gain.gain.value = vol;
    src.connect(gain); gain.connect(off.destination); src.start(0);
    renderMetroClicks(off, mp, audioBuf.duration, mp.volume);
    return off.startRendering();
  }

  /* ══ État UI ═════════════════════════════════════════════════════ */
  let _p = {};  // params

  const $ = id => document.getElementById(id);

  function _ext()    { return $('exp-fmt-mp3')?.checked ? 'mp3' : 'wav'; }
  function _addTags(){ return !!$('exp-chk-tags')?.checked; }
  function _base()   {
    const v = $('exp-name-input')?.value?.trim();
    return v || 'export';
  }
  function _bpm()    { return Math.round(_p.metroParams?.bpm || 120); }

  function _buildName(suffix) {
    return `${_base()}_${_bpm()}bpm_${suffix}.${_ext()}`;
  }

  function _updatePreview() {
    const items = [];
    if ($('exp-chk-audio')?.checked) items.push(_buildName('audio'));
    if ($('exp-chk-metro')?.checked) items.push(_buildName('metro'));
    if ($('exp-chk-mix')?.checked)   items.push(_buildName('mix'));

    // Sync état tag ON/OFF
    const tagsState = $('exp-tags-state');
    if (tagsState) tagsState.textContent = $('exp-chk-tags')?.checked ? 'ON' : 'OFF';

    const list = $('exp-preview-list');
    if (list) {
      if (!items.length) {
        list.innerHTML = '<li class="exp-preview-empty">Sélectionnez au moins un contenu</li>';
      } else if (items.length === 1) {
        list.innerHTML = `<li class="exp-preview-item"><code>${items[0]}</code></li>`;
      } else {
        const zipName = `${_base()}_${_bpm()}bpm.zip`;
        list.innerHTML = `<li class="exp-preview-item exp-preview-item--zip"><code>${zipName}</code></li>`
          + items.map(n => `<li class="exp-preview-item exp-preview-item--sub"><span>└</span><code>${n}</code></li>`).join('');
      }
    }

    const btn   = $('exp-btn-download');
    const label = $('exp-btn-label');
    if (btn)   btn.disabled = items.length === 0;
    if (label) label.textContent = items.length > 1
      ? 'Télécharger le ZIP'
      : 'Télécharger';

    // Griser tags si WAV
    const tagsToggle = $('exp-chk-tags')?.closest('.exp-tags-toggle');
    if (tagsToggle) tagsToggle.classList.toggle('exp-row-disabled', _ext() === 'wav');
  }

  function _makeBlobFromRendered(rendered) {
    return encodeWAV(rendered);
  }

  function _setProgress(show, pct = 0, txt = '') {
    const wrap = $('export-progress-wrap');
    const bar  = $('export-progress-bar');
    const ttxt = $('export-progress-txt');
    if (!wrap) return;
    wrap.style.display = show ? '' : 'none';
    if (bar)  bar.style.width = (pct * 100) + '%';
    if (ttxt) ttxt.textContent = txt;
  }

  async function _run() {
    const { audioBuffer, audioVolume, metroParams } = _p;
    if (!audioBuffer) return;

    const tasks = [];
    if ($('exp-chk-audio')?.checked) tasks.push({ type: 'audio', name: _buildName('audio') });
    if ($('exp-chk-metro')?.checked) tasks.push({ type: 'metro', name: _buildName('metro') });
    if ($('exp-chk-mix')?.checked)   tasks.push({ type: 'mix',   name: _buildName('mix')   });
    if (!tasks.length) return;

    $('exp-btn-download').disabled = true;
    _setProgress(true, 0.05, tasks.length > 1
      ? `Rendu de ${tasks.length} pistes en parallèle…`
      : `Rendu en cours…`);

    try {
      // Rendu en parallèle (beaucoup plus rapide avec plusieurs pistes)
      const renderFn = t => {
        if (t.type === 'audio') return renderAudio(audioBuffer, audioVolume);
        if (t.type === 'metro') return renderMetro(audioBuffer, metroParams);
        if (t.type === 'mix')   return renderMix(audioBuffer, audioVolume, metroParams);
      };
      const buffers = await Promise.all(tasks.map(renderFn));

      _setProgress(true, 0.80, 'Encodage…');
      const blobs = [];
      for (let i = 0; i < buffers.length; i++) {
        const pct = 0.80 + (i / buffers.length) * 0.15;
        _setProgress(true, pct, `Encodage ${i + 1}/${buffers.length} (${tasks[i].type})…`);
        blobs.push(await _makeBlobFromRendered(buffers[i]));
      }

      if (tasks.length === 1) {
        // Un seul fichier → téléchargement direct
        _setProgress(true, 0.95, `Téléchargement de « ${tasks[0].name} »…`);
        download(blobs[0], tasks[0].name);
      } else if (typeof JSZip !== 'undefined') {
        // Plusieurs fichiers → archive ZIP
        _setProgress(true, 0.88, 'Création de l\'archive ZIP…');
        const zip = new JSZip();
        tasks.forEach((t, i) => zip.file(t.name, blobs[i]));
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        download(zipBlob, `${_base()}_${_bpm()}bpm.zip`);
      } else {
        // Fallback si JSZip absent : téléchargements séquentiels
        for (let i = 0; i < tasks.length; i++) {
          _setProgress(true, 0.88 + i * 0.04, `Téléchargement de « ${tasks[i].name} »…`);
          download(blobs[i], tasks[i].name);
          if (i < tasks.length - 1) await new Promise(r => setTimeout(r, 400));
        }
      }

      _setProgress(true, 1.0, tasks.length > 1 ? `Archive ZIP téléchargée ✓` : 'Téléchargé ✓');
      setTimeout(() => {
        _setProgress(false);
        $('exp-btn-download').disabled = false;
        _updatePreview();
      }, 2000);

    } catch (err) {
      _setProgress(true, 0, '⚠ Erreur : ' + err.message);

      $('exp-btn-download').disabled = false;
    }
  }

  /* ══ API publique ════════════════════════════════════════════════ */

  function open(audioBuffer, audioVolume, metroParams, fileName) {
    _p = { audioBuffer, audioVolume, metroParams };

    // Nom de base par défaut = nom du fichier sans extension
    const input = $('exp-name-input');
    if (input && !input._userEdited) {
      input.value = fileName.replace(/\.[^.]+$/, '');
    }

    _updatePreview();

    const modal = $('export-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('visible'));
  }

  function close() {
    const modal = $('export-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    modal.addEventListener('transitionend', () => modal.classList.add('hidden'), { once: true });
  }

  function init() {
    $('exp-btn-close')?.addEventListener('click', close);
    $('export-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
    $('exp-btn-download')?.addEventListener('click', _run);

    // Mise à jour de la prévisualisation à chaque changement
    ['exp-chk-audio','exp-chk-metro','exp-chk-mix',
     'exp-fmt-wav','exp-fmt-mp3',
     'exp-name-input','exp-chk-tags']
      .forEach(id => {
        const el = $(id);
        if (!el) return;
        const ev = el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change';
        el.addEventListener(ev, () => {
          if (id === 'exp-name-input') el._userEdited = el.value.trim().length > 0;
          _updatePreview();
        });
      });
  }

  return { open, close, init };

})();
