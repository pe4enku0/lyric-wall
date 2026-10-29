# Lyric Wall

**English** · [Русский](README.ru.md)

A music wallpaper for macOS and Windows: the current Spotify track and synced lyrics right on your desktop.
The system wallpaper is never changed — the wallpaper is the app's own window placed behind your windows
(on Windows, behind the desktop icons, like Wallpaper Engine / Lively).

The app speaks English and Russian (tray menu → Language / Язык).

## Download

- **Latest build:** the **Actions** tab → the top green run → **Artifacts** at the bottom →
  `windows-exe` (Windows installer) or `mac-app` (Mac app). You get a zip with the file inside.
- **Versions:** the **Releases** section on the right of the repository page.
  A new release is published when a tag is pushed: `git tag v0.1.0 && git push --tags`.

The builds are not signed with a paid certificate:
- Windows shows "Windows protected your PC" → **More info** → **Run anyway**.
- macOS may refuse to open it → **System Settings → Privacy & Security → Open Anyway**.

## Spotify

- **macOS:** the Spotify desktop app is read through AppleScript. On first start macOS asks whether
  Lyric Wall may control Spotify. If you said no: System Settings → Privacy & Security → Automation →
  Lyric Wall → turn on Spotify.
- **Windows:** Spotify is read through Windows media controls (the same as the volume flyout).
  No Spotify login is needed. Spotify's own volume is not available there, so the number is hidden.

## Lyrics and performance

- Synced lyrics from [LRCLIB](https://lrclib.net) follow the song with a blur/focus effect; the word being sung
  pops up and glows. Exact word times are used when the lyrics have them, otherwise they are estimated
  from the line timing. Found lyrics are cached in the app data folder.
- The wallpaper draws at most 30 frames per second, sleeps when nothing moves (music paused) and stops
  completely when the screen is locked, the computer sleeps, a game or another app is full screen (Windows)
  or, if turned on in the settings, while running on battery.
- The control window shows how much CPU the app uses. Idle (music paused) it is about 0.5% of one CPU core
  on a MacBook.

## Run from source (Mac)

```bash
cd ~/lyric-wall
npm install      # once, after downloading the project
npm start        # start the wallpaper (an icon appears in the menu bar)
npm run window   # show the wallpaper in a normal window to look at the design
```

Opening the app (or clicking its icon again while it runs) shows the **control window**:
what is playing, playback buttons, wallpaper on/off, language, start at login, log, quit.
**Background and snow…** (or **Settings…** in the tray) opens the settings: background preset,
colour from the cover, blurred cover, your own picture (copied into the app data folder), picture blur
and dim, snow speed and amount. Changes show right away and are saved.
You can close the window — the wallpaper keeps running. The same controls are in the menu bar icon (Mac)
or the tray icon (Windows). When started at login the app stays in the background without a window.
The log and settings live in the app data folder:
Mac `~/Library/Application Support/Lyric Wall/`, Windows `%APPDATA%\Lyric Wall\`.

## Project layout

| Folder | Contents |
|---|---|
| `main/` | main process: windows, tray, player, settings, log, languages |
| `renderer/` | the wallpaper UI (look taken from `mockup.html`), the control and settings windows |
| `adapters/` | `mac.js` and `win.js` (+ `win-media.ps1`); each system loads only its own file |
| `locales/` | UI text in English (`en.json`) and Russian (`ru.json`) |
| `assets/` | app icon (`icon-mac.png`, `icon-win.png`), menu bar and tray icons |
| `mockup.html` | the original design mockup |

## Sending changes to GitHub

```bash
cd ~/lyric-wall
git add -A
git commit -m "What changed"
git push
```
