# Lyric Wall media helper for Windows (keep this file ASCII-only: PowerShell 5.1 reads it as ANSI).
# Reads the Spotify session from Windows.Media.Control (the media controls in the volume flyout),
# prints one JSON line per second while music plays (every 2 s otherwise)
# and accepts commands on stdin: toggle, next, prev, seek <seconds>, shuffle, volume <0-100>, mute.
# No Spotify login is needed. "volume" and "mute" change only Spotify (its slider in the volume mixer).
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$stdout.AutoFlush = $true

function Send($obj) {
  $stdout.WriteLine(($obj | ConvertTo-Json -Compress))
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
} catch {
  Send @{ state = 'error'; message = "Windows.Media.Control is not available: $($_.Exception.Message)" }
  exit 1
}

# Spotify's own volume: its audio session, the "Spotify" slider in the Windows volume mixer (Core Audio).
# Only Spotify gets louder or quieter, the system volume is not touched. The session appears once Spotify
# has played some sound; until then (or if this part fails) the volume is just not shown.
$audioOk = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
  int SetMasterVolume(float level, ref Guid context);
  int GetMasterVolume(out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i(); // IAudioSessionControl
  int j(); int k();
  int GetProcessId(out uint pid);
}
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
  int GetCount(out int count);
  int GetSession(int index, out IAudioSessionControl2 session);
}
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
  int a(); int b(); // IAudioSessionManager
  int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, IntPtr activationParams, out IAudioSessionManager2 manager);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int f();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class LyricWallAudio {
  // The sessions of Spotify.exe on the default speakers (usually one).
  static List<ISimpleAudioVolume> Spotify() {
    var found = new List<ISimpleAudioVolume>();
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    Guid iid = typeof(IAudioSessionManager2).GUID;
    IAudioSessionManager2 manager;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out manager));
    IAudioSessionEnumerator sessions;
    Marshal.ThrowExceptionForHR(manager.GetSessionEnumerator(out sessions));
    int count;
    Marshal.ThrowExceptionForHR(sessions.GetCount(out count));
    for (int n = 0; n < count; n++) {
      IAudioSessionControl2 session;
      uint pid;
      if (sessions.GetSession(n, out session) != 0 || session.GetProcessId(out pid) != 0 || pid == 0) continue;
      string name;
      try { name = Process.GetProcessById((int)pid).ProcessName; } catch { continue; }
      if (!name.Equals("Spotify", StringComparison.OrdinalIgnoreCase)) continue;
      var volume = session as ISimpleAudioVolume;
      if (volume != null) found.Add(volume);
    }
    return found;
  }
  // -1: Spotify has no sound session yet.
  public static int GetVolume() {
    foreach (var v in Spotify()) {
      float level; bool muted;
      Marshal.ThrowExceptionForHR(v.GetMasterVolume(out level));
      Marshal.ThrowExceptionForHR(v.GetMute(out muted));
      return muted ? 0 : (int)Math.Round(level * 100);
    }
    return -1;
  }
  public static void SetVolume(int percent) {
    Guid context = Guid.Empty;
    foreach (var v in Spotify()) {
      v.SetMasterVolume(Math.Max(0, Math.Min(100, percent)) / 100f, ref context);
      v.SetMute(false, ref context);
    }
  }
  public static void ToggleMute() {
    Guid context = Guid.Empty;
    var all = Spotify();
    if (all.Count == 0) return;
    bool muted;
    all[0].GetMute(out muted);
    foreach (var v in all) v.SetMute(!muted, ref context);
  }
}
'@
  $audioOk = $true
} catch {
  [Console]::Error.WriteLine("Spotify volume is not available: $($_.Exception.Message)")
}

function Get-Volume {
  if (-not $audioOk) { return $null }
  try {
    $v = [LyricWallAudio]::GetVolume()
    if ($v -lt 0) { return $null }
    return $v
  } catch { return $null }
}

# WinRT async calls are turned into .NET tasks and awaited.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  [void]$task.Wait(-1)
  $task.Result
}

$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Get-Spotify {
  foreach ($s in $manager.GetSessions()) {
    if ($s.SourceAppUserModelId -match 'spotify') { return $s }
  }
  return $null
}

function Get-Art($props) {
  if ($null -eq $props.Thumbnail) { throw 'Spotify gave no cover to Windows media controls' }
  $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
  $mem = New-Object System.IO.MemoryStream
  $net.CopyTo($mem)
  $type = $stream.ContentType
  if (-not $type) { $type = 'image/jpeg' }
  return 'data:' + $type + ';base64,' + [Convert]::ToBase64String($mem.ToArray())
}

$lastArtKey = ''
$artNoteKey = ''
$script:playing = $false

function Send-State {
  $s = Get-Spotify
  $script:playing = $false
  if ($null -eq $s) { Send @{ state = 'not-running' }; return }
  $info = $s.GetPlaybackInfo()
  $status = [int]$info.PlaybackStatus  # 4 = Playing, 5 = Paused
  if ($status -ne 4 -and $status -ne 5) { Send @{ state = 'stopped' }; return }
  $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $tl = $s.GetTimelineProperties()
  $playing = ($status -eq 4)
  $script:playing = $playing
  $duration = ($tl.EndTime - $tl.StartTime).TotalSeconds
  $position = ($tl.Position - $tl.StartTime).TotalSeconds
  # Spotify updates the timeline rarely; add the time passed since its last update.
  if ($playing) { $position += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalSeconds }
  if ($duration -gt 0 -and $position -gt $duration) { $position = $duration }
  $key = $props.Title + '|' + $props.Artist + '|' + $props.AlbumTitle
  $out = @{
    state = $(if ($playing) { 'playing' } else { 'paused' })
    playing = $playing
    title = $props.Title
    artist = $props.Artist
    album = $props.AlbumTitle
    id = $key
    duration = $duration
    position = $position
    volume = (Get-Volume)
    shuffle = $info.IsShuffleActive
  }
  # The cover is sent only when the track changes (it is big).
  if ($key -ne $script:lastArtKey) {
    try { $out.art = Get-Art $props } catch {
      $out.art = ''
      # Once per track: why there is no cover (goes to the app log).
      if ($key -ne $script:artNoteKey) { [Console]::Error.WriteLine("Cover: $($_.Exception.Message)"); $script:artNoteKey = $key }
    }
    if ($out.art) { $script:lastArtKey = $key }
  }
  Send $out
}

function Send-MediaCommand($line) {
  $parts = $line.Split(' ')
  $cmd = $parts[0]
  $arg = 0.0
  if ($parts.Count -gt 1) { $arg = [double]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture) }
  # Spotify's sound session, found by its process; works without the media controls session too.
  if ($cmd -eq 'volume') { if ($audioOk) { [LyricWallAudio]::SetVolume([int][math]::Round($arg)) }; return }
  if ($cmd -eq 'mute') { if ($audioOk) { [LyricWallAudio]::ToggleMute() }; return }
  $s = Get-Spotify
  if ($null -eq $s) { return }
  switch ($cmd) {
    'toggle' { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
    'next' { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
    'prev' { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
    'seek' {
      $ticks = [long]($arg * 10000000) + $s.GetTimelineProperties().StartTime.Ticks
      [void](Await ($s.TryChangePlaybackPositionAsync($ticks)) ([bool]))
    }
    'shuffle' {
      $current = $s.GetPlaybackInfo().IsShuffleActive
      [void](Await ($s.TryChangeShuffleActiveAsync(-not $current)) ([bool]))
    }
  }
}

$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$pending = $reader.ReadLineAsync()
while ($true) {
  try { Send-State } catch { Send @{ state = 'error'; message = $_.Exception.Message } }
  # Wait for a command (1 s while playing, 2 s otherwise); stdin closes when the app exits.
  $waitMs = 2000
  if ($script:playing) { $waitMs = 1000 }
  if ($pending.Wait($waitMs)) {
    $cmd = $pending.Result
    if ($null -eq $cmd) { break }
    try { Send-MediaCommand $cmd.Trim() } catch { Send @{ state = 'error'; message = $_.Exception.Message } }
    Start-Sleep -Milliseconds 300
    $pending = $reader.ReadLineAsync()
  }
}
