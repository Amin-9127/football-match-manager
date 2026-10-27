# Football Match Manager

A football management game: an HTML/JS web app, also packaged as an Android APK (WebView wrapper) that is built automatically with GitHub Actions.

## Project structure

- `web/` – the game (HTML, CSS, JS). Progress is saved in the browser's localStorage.
- `app/` – Android WebView wrapper. It uses `web/` directly as its assets folder, so there is only one copy of the game.
- `.github/workflows/build-apk.yml` – builds the debug APK on every push to `main`, on pull requests, and on manual runs.

## Play in the browser

Open `web/index.html` in any modern browser.

## Get the Android APK

1. Open the **Actions** tab and select the latest successful **Build APK** run.
2. Download the `football-match-manager-debug-apk` artifact and unzip it.
3. Copy the `.apk` to your phone and install it. You may need to allow installs from unknown sources.

This is a debug build, so it is not signed for Play Store release.

## Build locally

Requires JDK 17 and the Android SDK:

```
gradle assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/`.
