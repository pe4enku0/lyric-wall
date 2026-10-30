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
