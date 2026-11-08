// Lyric Wall click helper for macOS.
//
// The wallpaper lies below the desktop icons and gets no clicks. macOS gives clicks only to windows at the
// normal level or higher, and an Electron window that takes a click activates the app — which makes macOS
// bring back the windows it moved aside to show the desktop. This helper puts small invisible
// non-activating panels over the wallpaper's buttons, behind all other windows (like desktop widgets),
// and reports the clicks without activating anything.
//
// stdin:  one JSON line per update: [{"id":"pp","x":10,"y":20,"w":30,"h":30}, ...]
//         (screen points, top-left origin of the main screen, like Electron)
// stdout: one JSON line per mouse event (fx: where in the button, 0 = left edge, 1 = right edge; it goes past
//         0..1 when a drag leaves the button):
//         {"type":"press","id":"volume","fx":0.5}   mouse button down
//         {"type":"drag","id":"volume","fx":0.7}    moved with the button down (at most 30 times a second)
//         {"type":"release","id":"volume","fx":0.8} button up, wherever the mouse is
//         {"type":"click","id":"pp","fx":0.5}       button up inside the button it went down on
//         {"type":"wheel","id":"volume","dy":1}     scroll; dy > 0 = wheel away / fingers up, 1 = one wheel notch
// The helper quits when stdin closes (the app quit).
//
// "lyric-wall-clicks --coverage" is a second, separate mode: see runCoverage below.
import AppKit

final class ButtonPanel: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

final class ButtonView: NSView {
  let id: String

  init(id: String, size: NSSize) {
    self.id = id
    super.init(frame: NSRect(origin: .zero, size: size))
  }

  required init?(coder: NSCoder) { nil }

  var lastDrag = 0.0

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  func fx(_ event: NSEvent) -> Double {
    Double(convert(event.locationInWindow, from: nil).x / bounds.width)
  }

  override func mouseDown(with event: NSEvent) {
    emit(["type": "press", "id": id, "fx": fx(event)])
  }

  // macOS keeps sending these to this view while the button is down, even outside it.
  override func mouseDragged(with event: NSEvent) {
    guard event.timestamp - lastDrag >= 1.0 / 30 else { return }
    lastDrag = event.timestamp
    emit(["type": "drag", "id": id, "fx": fx(event)])
  }

  override func mouseUp(with event: NSEvent) {
    let x = fx(event)
    emit(["type": "release", "id": id, "fx": x])
    if bounds.contains(convert(event.locationInWindow, from: nil)) { emit(["type": "click", "id": id, "fx": x]) }
    window?.orderBack(nil) // stay behind the other windows
  }

  override func scrollWheel(with event: NSEvent) {
    // The direction of the hand, whatever "natural scrolling" is set to.
    var dy = Double(event.scrollingDeltaY)
    if event.isDirectionInvertedFromDevice { dy = -dy }
    if dy == 0 { return }
    // A trackpad sends many small steps (in points), a mouse wheel one step per notch.
    emit(["type": "wheel", "id": id, "dy": event.hasPreciseScrollingDeltas ? dy / 30 : (dy > 0 ? 1.0 : -1.0)])
  }
}

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object),
        let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

var panels: [NSPanel] = []

func show(_ items: [[String: Any]]) {
  panels.forEach { $0.orderOut(nil) }
  panels.removeAll()
  guard let screen = NSScreen.screens.first else { return }
  let top = screen.frame.maxY
  for item in items {
    guard let id = item["id"] as? String,
          let x = item["x"] as? Double, let y = item["y"] as? Double,
          let w = item["w"] as? Double, let h = item["h"] as? Double, w > 0, h > 0 else { continue }
    let frame = NSRect(x: x, y: top - y - h, width: w, height: h)
    let panel = ButtonPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.isOpaque = false
    panel.backgroundColor = NSColor(white: 0, alpha: 0.004) // invisible, but every pixel takes clicks
    panel.hasShadow = false
    panel.hidesOnDeactivate = false
    panel.level = .normal
    // On all Spaces, stays in place when macOS shows the desktop, left out of window cycling.
    panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
    panel.contentView = ButtonView(id: id, size: frame.size)
    panel.orderBack(nil)
    panels.append(panel)
  }
}

// ---------- --coverage: how much of the wallpaper other windows cover ----------
//
// The app pauses the wallpaper while normal windows hide (almost) all of it. This mode runs as its own process,
// started by adapters/mac.js apart from the click panels (those are stopped while the wallpaper is paused, and
// the app must still notice when the wallpaper is uncovered again). It reads only the windows' bounds, which
// needs no permission (their names would need Screen Recording).
// stdin:  one JSON line per change: {"area":{"x":0,"y":25,"width":1440,"height":805},"skip":[123,456],"threshold":0.95}
//         area: the main screen's work area (Electron's workArea: points, top-left origin, like the window bounds);
//         skip: processes whose windows do not count (the app itself, the click helper)
// stdout: {"type":"coverage","value":0.97} after each stdin line, then when the value moves by 2% or more or
//         crosses the threshold (checked twice a second); {"type":"log","text":"..."} once with the check's cost.
// It quits when stdin closes (the app quit).

var coverArea = CGRect.zero
var coverSkip: Set<pid_t> = []
var coverThreshold = 0.95
var coverLast = -1.0
var coverTimer: DispatchSourceTimer?
var coverTimes: [Double] = []

// The same grid as main/coverage.js: 64×36 cell centers, a cell is covered when its center is inside a window.
func coveredFraction(_ area: CGRect, _ rects: [CGRect]) -> Double {
  guard area.width > 0, area.height > 0 else { return 0 }
  let inside = rects.map { $0.intersection(area) }.filter { !$0.isNull && $0.width > 0 && $0.height > 0 }
  if inside.isEmpty { return 0 }
  let cols = 64, rows = 36
  let cw = area.width / CGFloat(cols), ch = area.height / CGFloat(rows)
  var covered = 0
  for j in 0..<rows {
    let y = area.minY + (CGFloat(j) + 0.5) * ch
    let row = inside.filter { y >= $0.minY && y < $0.maxY }
    if row.isEmpty { continue }
    for i in 0..<cols {
      let x = area.minX + (CGFloat(i) + 0.5) * cw
      if row.contains(where: { x >= $0.minX && x < $0.maxX }) { covered += 1 }
    }
  }
  return Double(covered) / Double(cols * rows)
}

// Normal windows (layer 0, not fully transparent) of other apps that are on screen now. Windows of other Spaces
// and minimized ones are not on screen; "Show Desktop" moves windows off the screen, so they fall outside the area.
func measureCoverage() -> Double {
  guard coverArea.width > 0, coverArea.height > 0,
        let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
  else { return 0 }
  var rects: [CGRect] = []
  for info in list {
    guard let layer = info[kCGWindowLayer as String] as? NSNumber, layer.intValue == 0,
          let alpha = info[kCGWindowAlpha as String] as? NSNumber, alpha.doubleValue > 0,
          let owner = info[kCGWindowOwnerPID as String] as? NSNumber, !coverSkip.contains(owner.int32Value),
          let bounds = info[kCGWindowBounds as String] as? NSDictionary,
          let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary),
          rect.width > 0, rect.height > 0
    else { continue }
    rects.append(rect)
  }
  return coveredFraction(coverArea, rects)
}

func checkCoverage(force: Bool) {
  let start = DispatchTime.now().uptimeNanoseconds
  let value = measureCoverage()
  if coverTimes.count < 20 {
    coverTimes.append(Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000)
    if coverTimes.count == 20 {
      let later = coverTimes.dropFirst()
      let avg = later.reduce(0, +) / Double(later.count)
      emit(["type": "log", "text": String(format: "covered check takes %.3f ms on average, %.3f ms at most (first %.3f ms)",
                                          avg, later.max() ?? 0, coverTimes[0])])
    }
  }
  let crossed = (value >= coverThreshold) != (coverLast >= coverThreshold)
  guard force || coverLast < 0 || crossed || abs(value - coverLast) >= 0.02 else { return }
  coverLast = value
  emit(["type": "coverage", "value": (value * 1000).rounded() / 1000])
}

func configureCoverage(_ config: [String: Any]) {
  if let a = config["area"] as? [String: Any],
     let x = a["x"] as? Double, let y = a["y"] as? Double,
     let w = a["width"] as? Double, let h = a["height"] as? Double {
    coverArea = CGRect(x: x, y: y, width: w, height: h)
  }
  if let skip = config["skip"] as? [NSNumber] { coverSkip = Set(skip.map { $0.int32Value }) }
  coverSkip.insert(getpid())
  if let t = config["threshold"] as? Double { coverThreshold = t }
  checkCoverage(force: true)
}

func runCoverage() -> Never {
  coverSkip.insert(getpid())
  DispatchQueue.global().async {
    while let line = readLine() {
      guard let data = line.data(using: .utf8),
            let config = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
      DispatchQueue.main.async { configureCoverage(config) }
    }
    DispatchQueue.main.async { exit(0) }
  }
  let timer = DispatchSource.makeTimerSource(queue: .main)
  timer.schedule(deadline: .now() + 0.5, repeating: 0.5)
  timer.setEventHandler { checkCoverage(force: false) }
  timer.resume()
  coverTimer = timer
  dispatchMain()
}

if CommandLine.arguments.contains("--coverage") { runCoverage() }

// ---------- the click panels ----------

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // no Dock icon, no menu bar

DispatchQueue.global().async {
  while let line = readLine() {
    guard let data = line.data(using: .utf8),
          let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { continue }
    DispatchQueue.main.async { show(items) }
  }
  DispatchQueue.main.async { exit(0) }
}

app.run()
