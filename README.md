# TempoMatcher

**TempoMatcher** is a browser-based audio analysis tool for musicians, producers and DJs who need to visually align a track to a rhythmic grid.

🌐 **[Live Demo → Lotter-35.github.io/TempoMatcher](https://Lotter-35.github.io/TempoMatcher)**

---

## Features

### Audio
- **Drag & drop or file picker** — MP3, WAV, OGG, FLAC and more
- **Playback** — play / pause / stop, loop mode, seek by clicking the waveform or the ruler
- **Volume control** — main slider + VU meter panel
- **Export** — render to MP3 or WAV: mixed (audio + metronome), metronome only, or audio only

### Waveform
- **Interactive canvas** — zoom (scroll wheel or buttons), pan (drag or middle-click), auto-follow playhead
- **Spectral mode** — switch between classic waveform and spectrogram view
- **Amplitude zoom** — scale the waveform height independently of the beat markers
- **Section painter** — brush tool (B) to color individual measures; supports undo / redo (Ctrl+Z / Ctrl+Y)

### Beat Grid & Metronome
- **BPM** — slider, numeric input, ±1/±5 nudge buttons, tap tempo, auto-detect
- **Time signature** — beats per measure (2 / 3 / 4 / 6), measures per loop, loops per colored band
- **Offset** — align the grid to any beat with the offset slider or by snapping to the playhead
- **Pin markers** — place markers on the ruler; lock the grid to a pin so BPM changes keep it pinned
- **Metronome click** — 5 profiles (Défaut, Bois, Électro, Doux, Cloche), independent volume, preview without playback
- **Beat counter** — visual display of current loop / measure / beat

### Markers panel
- **Per-layer visibility toggle** — show or hide Loop, Measure, Beat and Band markers independently
- **Per-layer height** — individual sliders for each marker type
- **Per-layer color** — color pickers for Loop, Measure, Beat, Band and Waveform
- **Per-layer opacity** — individual opacity sliders
- **Visual profiles** — 5 built-in presets (Défaut, Nocturne, Vif, Pastel, Monochrome)
- **Custom profiles** — when you tweak any style control the selector automatically switches to *Personnalisé*; click **+** to save the current style as a named profile (inline text input, no dialog)
- **Delete custom profiles** — a trash button appears next to the selector when a user-created profile is selected; built-in profiles are protected
- **Reset buttons** — reset all heights, all colors or all opacities to the active profile's values in one click; double-click any slider to reset it individually

### Miscellaneous
- **Resizable & reorderable panels** — drag the handles between panels to resize; drag the panel title to reorder
- **Keyboard shortcuts** — Space (play/pause), S (stop), B (brush), H / Escape (pan), +/- (zoom), F (fit), ←/→ (±1 s, ±5 s with Shift)
- **Dark theme** — single CSS file, no framework

---

## How to Use

1. Open `index.html` in any modern browser (Chrome / Firefox / Edge)
2. Drag & drop an audio file onto the waveform, or click **Charger**
3. Set the **BPM** with the slider, tap tempo button, or **Auto-Détect**
4. Configure **beats per measure** and **measures per loop** to match the track
5. Use the **Offset** slider (or *Caler sur la tête de lecture*) to align the grid
6. Press **Play** — the beat grid and metronome stay in sync
7. Optionally: paint sections with the **brush tool** (B), add **pin markers** on the ruler, and tweak **marker colors / heights / opacities** in the Marqueurs panel

---

## Project Structure

```
TempoMatcher/
├── index.html        # HTML layout
├── style.css         # Dark-theme styles
└── js/
    ├── metronome.js  # Metronome engine (Web Audio API, look-ahead scheduling)
    ├── waveform.js   # Canvas renderer (waveform, spectrogram, markers, brush)
    ├── audio.js      # Audio engine (decoding, playback, seek, loop, VU meter)
    ├── export.js     # Export engine (MP3 / WAV render)
    └── app.js        # Main controller
```

## Tech Stack

- **Vanilla JavaScript** — no framework, no build step
- **Web Audio API** — decoding, playback, metronome scheduling, VU metering, export render
- **Canvas 2D** — waveform, spectrogram, ruler and all marker rendering
- Open `index.html` directly in the browser — that's it

---

## License

MIT
