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

## Using the app

- **Starting it** turns the wallpaper on and opens no window: the app lives only in the **tray**
  (Windows, next to the clock — maybe under the **^** arrow) or the **menu bar** (Mac). No taskbar or Dock icon
  (on Windows only an open settings or control window shows one, so a minimized window can be found again).
  The first start shows a short notification saying so.
- **The tray / menu bar icon:** open Lyric Wall, wallpaper on/off, play/pause, next track, settings,
  wallpaper mode (Windows), language, start at login, open log, quit.
- **The control window** (tray → Open Lyric Wall, or start the app again): what is playing, playback buttons,
  wallpaper on/off and its CPU use, language, start at login, log, quit. Closing it keeps the wallpaper running.
- **Themes** (Settings → Theme): Dusty glass (the mockup), Pastel, Sakura, Night rain, Neon, AMOLED black, Warm vinyl,
  Matcha and Y2K chrome. A theme sets the whole look — background, glass, text, the current lyric line, the sound bars
  and the particles (snow, butterflies, petals, rain, stars, dust, leaves or glitter). Your picture and the blurred cover
  work with every theme; the colour backgrounds belong to Dusty glass.
- **Settings** (tray → Settings…, or "Background and snow…" in the control window): theme, background preset,
  colour from the cover, blurred cover, your own picture (copied into the app data folder), picture blur and dim,
  snow speed and amount, smoothness (30 / 20 / 15 frames per second), pausing on battery.
  Changes show right away and are saved.

### Buttons on the wallpaper

| Button | What it does |
|---|---|
| ⏮ ⏯ ⏭ | previous track, play / pause, next track |
| progress bar | click or drag: jump to that place in the song |
| volume bar · speaker | Spotify's volume (click, drag or mouse wheel, 5% per notch) · mute / unmute Spotify (other sounds and the system volume are not touched) |
| "Shuffle" | shuffle on / off |
| cover | open Spotify |
| white lyrics button | hide / show the lyrics |
| device ("MacBook" / "PC") | open the system sound settings |
| "…" | open the control window |
| a track in "Up next" | play it (skips forward to it, so the playlist and the queue stay) |
| ★ | like / unlike the track (after signing in to Spotify; filled when the track is in Liked Songs) |

The wallpaper lies under the desktop icons and gets no clicks itself. Invisible click areas sit over the buttons,
**behind all other windows**, like desktop widgets: when windows cover the wallpaper they get the clicks as
usual; on the free desktop the buttons work. Clicks next to the buttons still go to the desktop.

- **macOS:** a small native helper (`mac-helper/ClickLayer.swift`) makes non-activating panels over the buttons.
  macOS gives clicks only to normal windows, and a normal app window that takes a click would activate the app —
  which makes macOS bring back the windows it moved aside to show the desktop. These panels do not activate
  anything, stay in place when the desktop is shown and are left out of window cycling.
- **Windows:** an invisible window above the desktop icons takes clicks only while the pointer is over a button
  (the app checks the pointer position 50 times a second). A press gives it the focus for a moment (Windows throws
  away clicks on windows that cannot take it); right after, the focus goes back to the window that had it.
  It is removed while a game or another app is full screen.

## Spotify account (optional): "Up next" and likes

Signing in to Spotify (Settings → Spotify account) shows the next 3 tracks on the wallpaper and makes ★ like the
current track. It uses the Spotify Web API with your own free app on developer.spotify.com:

1. Open [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and sign in.
2. **Create app** → any name and description; **Redirect URIs**: `http://127.0.0.1:43821/callback`; tick **Web API**; save.
3. Open the app's **Settings**, copy the **Client ID** into Lyric Wall → **Sign in to Spotify** → allow in the browser.

Spotify's rules since February 2026: such apps work only while the **app owner has Spotify Premium**, and for at most
**5 users** — friends are added under **User Management** by their Spotify email. The sign-in uses PKCE (no secret key);
the login is stored encrypted (macOS Keychain / Windows data protection) and never written to the log.

## Spotify

- **macOS:** the Spotify desktop app is read through AppleScript. On first start macOS asks whether
  Lyric Wall may control Spotify. If you said no: System Settings → Privacy & Security → Automation →
  Lyric Wall → turn on Spotify.
- **Windows:** Spotify is read through Windows media controls (the same as the volume flyout).
  No Spotify login is needed. The volume bar is Spotify's slider in the Windows volume mixer; it appears once
  Spotify has played some sound.
  If Windows gives no cover, it is looked up in the public iTunes catalog by artist and title.

## Lyrics and performance

- Synced lyrics from [LRCLIB](https://lrclib.net) follow the song with a blur/focus effect. The search and
  LRCLIB's own database are asked at the same time, so lyrics usually appear in 0.1–0.3 s. Found lyrics are
  cached in the app data folder; without synced lyrics plain lyrics scroll with the song.
- The **Sound** card only shows, it has no buttons: its bars are the spectrum of the computer's sound (bass on
  the left, treble on the right), so they move exactly with the music. The sound is only analysed on the spot:
  **nothing is recorded, saved or sent anywhere**. Windows needs no permission; macOS 14.2 or newer asks once
  for "System Audio Recording". Without it the bars move in a calm wave; while the music is paused they rest.
- The wallpaper draws at most 60 frames per second (45, 30, 20 or 15 in the settings), sleeps when nothing moves
  (music paused) and stops completely when the screen is locked, the computer sleeps, a game or another app
  is full screen (Windows) or, if turned on in the settings, while running on battery.
- The control window shows how much CPU the app uses. On a MacBook: about 1% of one CPU core with the music
  paused; while music plays and the wallpaper is fully visible, about 34% at 30 frames and 21% at 15 frames.

## Log

Everything important goes to `lyric-wall.log` in the app data folder (tray → **Open log**):
start (system, screen), how the wallpaper window was placed, Spotify tracks and commands, lyrics, pauses
(locked screen, game, battery), button presses, errors in any window and crashed processes.
Every button press gets a request id (`h1`, `h2`… from the wallpaper, `t1`… from the tray) that follows it
through the log: click layer → wallpaper → main process → Windows helper → its answer with the time it took.
A press that never reached the click layer is logged with the window Windows had under the cursor.
The log stays on the computer; over 1 MB it is moved to `lyric-wall.log.old`.

App data folder: Mac `~/Library/Application Support/Lyric Wall/`, Windows `%APPDATA%\Lyric Wall\`.

## Checking on Windows after installing

1. The installer runs without admin rights; a "Lyric Wall" shortcut appears on the desktop and in Start.
2. Start it: no window opens, a notification says Lyric Wall is running, the icon is in the tray (maybe under **^**).
3. The wallpaper is **behind the desktop icons**, the icons and desktop clicks work as before.
4. Play music in Spotify: track, cover, moving progress bar and synced lyrics appear.
5. The volume bar moves Spotify's slider in the volume mixer (Win+Ctrl+V), not the system volume; the Sound bars move with the music.
6. Wallpaper buttons: ⏯, ⏭, progress bar, volume, "Shuffle" work; the cursor turns into a hand over them.
7. Start a game full screen: the log shows `Render paused (+fullscreen)`; FPS is not lower than without the app.
8. Tray → Wallpaper off: the normal Windows wallpaper comes back.
9. If the wallpaper is black or missing: tray → Wallpaper mode → Below all windows, then send the log.

## Run from source (Mac)

```bash
cd ~/lyric-wall
npm install      # once, after downloading the project
npm start        # start the wallpaper (an icon appears in the menu bar)
npm run window   # show the wallpaper in a normal window to look at the design
```

On macOS `npm start` also builds the click helper (`mac-helper/ClickLayer.swift`); it needs the
Xcode Command Line Tools (`xcode-select --install`). Without them the buttons use a simpler click layer.

## Project layout

| Folder | Contents |
|---|---|
| `main/` | main process: windows, tray, player, lyrics, system sound, Spotify Web API, settings, log, languages, click layer |
| `renderer/` | the wallpaper UI (look taken from `mockup.html`), the control and settings windows |
| `adapters/` | `mac.js` and `win.js` (+ `win-media.ps1`); each system loads only its own file |
| `mac-helper/` | native macOS helper that makes the wallpaper buttons clickable |
| `scripts/` | build script for the helper |
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
