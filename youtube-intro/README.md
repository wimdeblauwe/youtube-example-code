# YouTube intro

The 5-second intro for the YouTube videos, in the style of wimdeblauwe.com:

1. A copper diamond spins in on navy and moves to the left.
2. A copper light bar wipes in “Wim Deblauwe”.
3. The diamond flips over like a coin and lands as the portrait (rounded square with copper ring).
4. The episode title rises in from below and pushes photo + name up into a small header; the title ends just below the centre of the frame.
5. The last frame holds until the end (no fade), so the video can cut straight to the episode.

## Make the intro for a new episode

Requires Node, ffmpeg and Google Chrome (the renderer drives your installed Chrome, no browser download).

```sh
cd youtube-intro
npm install                     # first time only
node render.mjs --title "Form handling with *Thymeleaf*"
```

- Words between `*asterisks*` are coloured copper. Highlight the technology or key word, usually the last one.
- The output goes to `out/intro-<slugified-title>.mp4` (1920×1080, 60 fps, H.264). `out/` is gitignored.
  Copy the file to the Google Drive folder `My Drive/YouTube` afterwards.
- The title is auto-sized: as big as possible on two lines, smaller (up to three lines) for long titles.
- Frames are rendered at 2× (3840×2160) and downscaled with lanczos for sharp text and photo. Rendering takes about 7 minutes.

To check a long title without rendering the whole video, render only the final frame (takes a few seconds):

```sh
node render.mjs --title "Testing Spring Boot applications with *Testcontainers*" --still 5000
```

Options:

| Option | Default | Meaning |
|---|---|---|
| `--title` | (required) | Episode title, `*word*` = copper |
| `--out` | `out/intro-<slug>.mp4` | Output path |
| `--still <ms>` | | Write a single PNG at that moment instead of a video |
| `--duration` | `5000` | Total length in ms; the final frame is held until then |
| `--fps` | `60` | Frame rate |
| `--scale` | `2` | Supersampling factor (1 = faster, softer) |
| `--name-size` | `48` | Final name size in px (the photo scales along) |
| `--header-lift` | `32` | Extra px between the header (photo + name) and the title |
| `--title-shift` | `20` | Px the title sits below the exact centre of the frame |

## Preview and tweaking

Open `intro.html` directly in a browser to watch it live (click to replay). Add a title with
`intro.html?title=Your%20*Title*`.

- All timings are in the `build()` function in `intro.html`, as `anim(element, keyframes, startMs, durationMs, easing)` calls.
- Colours and font are copied from the blog (`wimdeblauwe.com/assets/css/main.css`); the font is in `assets/fonts/`.
- `assets/portrait.jpg` is a 1024×1024 crop of a 4032×3024 photo (not in the repo), made with:
  `ffmpeg -i <photo>.jpg -vf "crop=2200:2200:1340:150,scale=1024:1024:flags=lanczos,unsharp=5:5:0.4" -q:v 2 assets/portrait.jpg`
  To swap the photo, make a square crop of at least 1024 px around the face and replace `portrait.jpg`.
- Sizes are animated as width/height/font-size rather than `transform: scale`, so Chrome redraws text and photo sharply each frame.
- The renderer pauses every Web Animation and seeks it to each frame's time (`window.seek(ms)`), so the result is
  identical on every run and independent of machine speed.
