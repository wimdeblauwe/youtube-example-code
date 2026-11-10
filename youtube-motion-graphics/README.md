# YouTube motion graphics

Motion graphics for the YouTube videos, in the style of wimdeblauwe.com (navy, copper, Barlow, the copper diamond):

- **The intro** (`intro.html`, `render.mjs`): the same 5-second intro for every episode, with the episode title. See below.
- **The music and the final video** (`intro-music.mjs`, `add-music.mjs`): the intro and outro music, and the script
  that puts intro, music and a Wrap export together. See [Music and final video](#music-and-final-video).
- **Per-video graphics** in a directory named after the video's project, e.g. `form-handling-thymeleaf/`. See
  [Per-video graphics](#per-video-graphics).

## The intro

The 5-second intro:

1. A copper diamond spins in on navy and moves to the left.
2. A copper light bar wipes in “Wim Deblauwe”.
3. The diamond flips over like a coin and lands as the portrait (rounded square with copper ring).
4. The episode title rises in from below and pushes photo + name up into a small header; the title ends just below the centre of the frame.
5. The last frame holds until the end (no fade), so the video can cut straight to the episode.

### Make the intro for a new episode

Requires Node, ffmpeg and Google Chrome (the renderer drives your installed Chrome, no browser download).

```sh
cd youtube-motion-graphics
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

### Preview and tweaking

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

## Music and final video

The intro and outro share one theme, a marimba arpeggio that builds up at 120 BPM so its accents fall on the intro
animation (name wipe at 1.0 s, coin flip at 1.95 s, title at 3.0 s):

- **Intro** (5 s): the build ends in an upward marimba strum when the title lands.
- **Outro** (7.5 s): the same build, but the strum lands on a different chord (A) and then settles on a slow, low
  downward strum on E.

The music is synthesized in code by `intro-music.mjs` (pure Node, no samples), so there is nothing to license.

### Make the final video for an episode

Requires Node, ffmpeg and ffprobe.

1. Export the video from Wrap, with chapters and captions as separate files.
2. Look up when your last word ends in that export (for example in the `.srt`, or in the Wrap transcript).
3. Run:

   ```sh
   node add-music.mjs \
     --video "/Users/wdb/Movies/Wrap/<Project>.wrap/exports/<Name> - youtube.mp4" \
     --intro out/intro-<slug>.mp4 \
     --last-word 13:27.1
   ```

This writes `<Name> - youtube - with intro and music.mp4` next to the export (the export itself is not changed):

- The intro is prepended, with the intro music.
- The voice-over is brought to −14 LUFS, the level YouTube plays at. A Wrap export already peaks at 0 dBFS, so this is
  done with a compressor and a limiter rather than with gain alone.
- The outro music plays quietly under your last sentences; the final strum lands right after the last word, at full
  level, and fades out with the video. Leave 2 seconds or more of video after the last word so it can ring out.
- `.chapters.txt`, `.srt` and `.vtt` files next to the export are copied with all times moved by the length of the
  intro (the first chapter stays at 0:00).
- The whole video is re-encoded (H.264, CRF 17) to join the intro to it. This takes less than a minute.

Options:

| Option | Default | Meaning |
|---|---|---|
| `--video` | (required) | The Wrap export |
| `--intro` | (required) | The intro made with `render.mjs` |
| `--last-word` | | When the last word ends, in the export (`m:ss.s` or seconds). Without it there is no outro music |
| `--out` | `<video> - with intro and music.mp4` | Output path |
| `--voice-lufs` | `-14` | Loudness of the voice-over |
| `--music-lufs` | `-17` | Loudness of the intro music and of the final strum of the outro |
| `--outro-duck` | `12` | dB the outro music is lowered while you are still talking |
| `--crf` | `17` | Video quality (lower = better and bigger) |

### Changing the music

`node intro-music.mjs` writes every option that was tried to `out/intro-music/` as WAV, to listen to them:
`a`–`f` are six different styles, `e1`–`e5` are endings of the marimba build, `o1` and `o2` are outros. Pass the short
names to write only some of them (`node intro-music.mjs e2 o2`). In use are `e2` (intro) and `o2` (outro); to switch,
change `INTRO_MUSIC` and `OUTRO_MUSIC` at the top of `add-music.mjs`.

## Per-video graphics

Each graphic is an HTML page with Web Animations, timed to the words in the recording, and is rendered frame by
frame with headless Chrome like the intro (`window.ready`, `window.seek(ms)`, `window.CLIP_DURATION`). Open a page
directly in a browser to preview it (click to replay); add `?bg` to the overlays to see them over a reference frame
(the reference frames are not in the repo: put them in `out/stills/`).

- **Opaque graphics** that replace the screen (like the sequence diagram) have their own renderer next to them and
  render to H.264.
- **Transparent overlays** (highlights, callouts) render with `render-alpha.mjs` to ProRes 4444 with alpha, for
  Wrap's Animations bin:

  ```sh
  node render-alpha.mjs --page form-handling-thymeleaf/dependencies-highlight.html --stills 1700,3400 --bg  # check
  node render-alpha.mjs --page form-handling-thymeleaf/dependencies-highlight.html                         # render
  ```

Timing: each page has a `T(...)` function that maps seconds in the Wrap take to clip time, skipping the parts that are
cut. Take times come from the Wrap transcript (word timings). Wrap plays an overlay from `media_in` at the first kept
frame and fades it at every place where the kept footage changes, so a graphic that spans several takes has to
replace the screen recording instead of being an overlay.

### form-handling-thymeleaf

| File | Chapter / moment | How it is used in Wrap |
|---|---|---|
| `form-submission.html` + `render-form-submission.mjs` | "How form submission works": sequence diagram Browser / Spring Boot / Database, GET – POST – REDIRECT | 1728×1118 (aspect of the screen recording), cut per take and used as the screen recording of takes 4, 5, 6 and 8 |
| `dependencies-highlight.html` | start.spring.io: highlights Spring Web, Thymeleaf and Validation as they are named | Overlay on take 10 (`place: screen`) |
| `book-checklist.html` | "Level up your forms" checklist that folds into the Taming Thymeleaf cover | Overlay on take 29 (`place: full`, over the full-frame camera) |
| `book-callout.html` | Simpler version: only the Taming Thymeleaf cover | Not used |

`assets/taming-thymeleaf-cover.png` is the cover from the book page on wimdeblauwe.com.
