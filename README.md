# Face Morphing Demo

Interactive face morph viewer with:
- Identity switching (`Space`)
- Trait switching (`A` / `D`)
- Continuous morph scrubbing across frames (`Left` / `Right`)

All images are preloaded before interaction for smooth playback.

## Quick Start

1. Put frames under `images/` using the structure below.
2. Start a local server from this folder:

```powershell
python -m http.server 8000
```

3. Open `http://localhost:8000`.

## Folder Structure

Use this hierarchy:

```text
images/
  <Identity>/
    <Trait>/
      frame_0001.png
      frame_0002.png
      ...
```

Example:

```text
images/
  Asian/
    dominant/
      frame_0001.png
      ...
    trustworthy/
      frame_0001.png
      ...
  Black/
    dominant/
      frame_0001.png
      ...
```

Meaning:
- Identity = first folder level (for example `Asian`, `Black`)
- Trait = second folder level (for example `dominant`, `trustworthy`)
- Morphing continuum = ordered frame sequence inside a trait folder

Tips:
- Keep frame names sequential (`frame_0001.png` ... `frame_0059.png`).
- Identity and trait labels shown in the UI are extracted from folder names.

## Optional Per-Trait `manifest.json`

To force exact frame order, place a `manifest.json` inside a trait folder:

```json
[
  "frame_0001.png",
  "frame_0002.png",
  "frame_0003.png"
]
```

If missing (or empty), files are auto-discovered and naturally sorted.

## Keyboard Controls

- `Left Arrow`: move toward first frame (stops at first frame)
- `Right Arrow`: move toward last frame (stops at last frame)
- `A`: previous trait (wraps around within current identity)
- `D`: next trait (wraps around within current identity)
- `Space`: next identity (wraps around)

Behavior on switching:
- Trait switch resets to the middle frame of that trait.
- Identity switch also lands on the middle frame of the selected trait.

## UI Guide

- Center panel: active morphing continuum
- Left panel: first frame of current trait
- Right panel: last frame of current trait
- Top legend: current identity and trait
- Direction cue: large arrow indicator while morphing left/right

## Performance Notes

- All frames are preloaded and decoded before controls are active.
- Animation uses `requestAnimationFrame` for smoother updates.
