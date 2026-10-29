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
// stdout: one JSON line per click: {"id":"pp","fx":0.5}  (fx: where in the button, 0..1 from the left)
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

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func mouseDown(with event: NSEvent) {}

  override func mouseUp(with event: NSEvent) {
    let p = convert(event.locationInWindow, from: nil)
    guard bounds.contains(p) else { return }
    emit(["id": id, "fx": Double(p.x / bounds.width)])
    window?.orderBack(nil) // stay behind the other windows
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
