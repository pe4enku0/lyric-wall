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

## Run from source (Mac)

```bash
cd ~/lyric-wall
npm install      # once, after downloading the project
npm start        # start the wallpaper (an icon appears in the menu bar)
npm run window   # show the wallpaper in a normal window to look at the design
```

Control everything from the menu bar icon (Mac) or the tray icon (Windows):
wallpaper on/off, play/pause, next track, language, start at login, log, quit.
The log and settings live in the app data folder:
Mac `~/Library/Application Support/Lyric Wall/`, Windows `%APPDATA%\Lyric Wall\`.

## Project layout

| Folder | Contents |
|---|---|
| `main/` | main process: windows, tray, player, settings, log, languages |
| `renderer/` | the wallpaper UI (look taken from `mockup.html`) |
| `adapters/` | `mac.js` and `win.js` (+ `win-media.ps1`); each system loads only its own file |
| `locales/` | UI text in English (`en.json`) and Russian (`ru.json`) |
| `assets/` | menu bar and tray icons |
| `mockup.html` | the original design mockup |

## Sending changes to GitHub

```bash
cd ~/lyric-wall
git add -A
git commit -m "What changed"
git push
```
