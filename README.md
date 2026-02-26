# TempoMatcher

**TempoMatcher** is a browser-based audio analysis tool designed for musicians, producers, and DJs who need to visually align a music track to a rhythmic grid.

🌐 **[Live Demo → Lotter-35.github.io/TempoMatcher](https://Lotter-35.github.io/TempoMatcher)**

---

## Features

- 🎵 **Audio loading** — drag & drop or file picker (MP3, WAV, OGG, FLAC…)
- 📊 **Interactive waveform** — zoom (scroll wheel), pan (drag), click to seek
- 🥁 **Precision metronome** — Web Audio API look-ahead scheduling for rock-solid timing
- 🎯 **BPM detection** — automatic tempo estimation from the audio
- 🖱️ **Tap tempo** — tap the button to set BPM manually
- 📐 **Beat grid** — configurable beats per measure, measures per loop, loop groups
- 🔖 **Visual markers** — colored lines for loop starts, measure downbeats and individual beats
- ⏱️ **Time ruler** — adaptive ruler with sub-tick resolution
- 🔊 **3-tier click sound** — distinct tones for loop start (1400 Hz), downbeat (880 Hz) and beats (440 Hz)
- 🎨 **Waveform styling** — custom color, opacity and amplitude zoom

## How to Use

1. Open `index.html` in any modern browser (Chrome / Firefox / Edge)
2. Drag & drop an audio file onto the waveform area (or click **Charger**)
3. Adjust the **BPM** with the slider, tap tempo or hit **Detect**
4. Set **beats per measure** and **measures per loop** to match the track structure
5. Use the **offset** knob to align the grid to the first beat of the music
6. Press **Play** — the metronome click and the waveform grid will stay in sync

## Project Structure

```
TempoMatcher/
├── index.html          # Main HTML layout
├── style.css           # Dark-theme UI styles
└── js/
    ├── metronome.js    # Metronome engine (Web Audio API, look-ahead scheduling)
    ├── waveform.js     # Waveform renderer (Canvas 2D, peaks, beat markers)
    ├── audio.js        # Audio engine (decoding, playback, seek, loop)
    └── app.js          # Main controller (wires everything together)
```

## Tech Stack

- **Vanilla JavaScript** — no framework, no dependencies
- **Web Audio API** — audio decoding, playback and metronome clicks
- **Canvas 2D** — waveform and ruler rendering
- Zero build step — just open the HTML file

## License

MIT
