# Face Morphing Demo

## Preview

![Screen recording of the Face Morphing Demo: main viewer, sidebar, and film strip](images/demo-preview.gif)

## Run

From this folder, start the local server and open the demo in your default browser:

```bash
python serve.py
```

The app is served at `http://127.0.0.1:8000/`. Press **Ctrl+C** in the terminal to stop. Use `python serve.py --no-open` if you do not want a browser tab opened automatically. Another port: `python serve.py -p 8080`.

## Folder Structure

```text
images/
  <Identity>/
    <Trait>/
      frame_0001.png
      frame_0002.png
      ...
```

- Identity = first folder level (example: `Asian`, `Black`)
- Trait = second folder level (example: `dominant`, `trustworthy`)
- Frames inside each trait folder are the morphing continuum

## Controls

- `Left Arrow`: move toward first frame (stops at first frame)
- `Right Arrow`: move toward last frame (stops at last frame)
- `A`: previous trait (wraps)
- `D`: next trait (wraps)
- `Space`: next identity (wraps)
