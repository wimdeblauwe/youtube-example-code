# CLAUDE.md

This repository holds the example code for Wim Deblauwe's YouTube videos. Each top-level directory is a standalone project that belongs to one video (for example `spring-boot-thymeleaf`, `thymeleaf-webjars`, `form-handling-thymeleaf`), usually a Spring Boot + Thymeleaf application generated with `ttcli`.

## Video assets

Assets for the videos (intro motion graphics, thumbnails, renders, …) are not stored in this repo. They live on Google Drive at:

```
/Users/wdb/Library/CloudStorage/GoogleDrive-wim.deblauwe@gmail.com/My Drive/YouTube
```

Write generated video assets there, not into this repository. If that folder is not accessible (macOS privacy permissions), render locally and the user copies the file over.

## YouTube intro

`youtube-intro/` contains the sources of the video intro (HTML/CSS animation + a Playwright/ffmpeg renderer). It is not a Spring Boot project. To make the intro for a new episode, follow `youtube-intro/README.md` (`node render.mjs --title "… *Highlighted*"`).

## Visual style

Video graphics follow the style of the blog at `/Users/wdb/Projects/wimdeblauwe/wimdeblauwe.com` (see `assets/css/main.css` there): paper `#faf9f5`, navy `#13202f`, copper `#c2702e`; Barlow (display), Hanken Grotesk (body) and Geist Mono (labels); the copper diamond as recurring motif. Font files are in that repo's `static/fonts/`.
