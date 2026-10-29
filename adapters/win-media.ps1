# Lyric Wall media helper for Windows (keep this file ASCII-only: PowerShell 5.1 reads it as ANSI).
# Reads the Spotify session from Windows.Media.Control (the media controls in the volume flyout),
# prints one JSON line per second while music plays (every 2 s otherwise)
# and accepts commands on stdin: toggle, next, prev, seek <seconds>, shuffle, volume <0-100>, mute.
# No Spotify login is needed. Spotify's own volume is not available here, so "volume" is the system volume.
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

# System volume (Core Audio). If this part fails, the volume is just not shown.
$audioOk = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float level, Guid context);
  int j();
  int GetMasterVolumeLevelScalar(out float level);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid context);
  int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume endpoint);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int f();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class LyricWallAudio {
  static IAudioEndpointVolume Endpoint() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice device = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    IAudioEndpointVolume endpoint = null;
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, 0, out endpoint));
    return endpoint;
  }
  public static int GetVolume() {
    var e = Endpoint(); float v; bool muted;
    Marshal.ThrowExceptionForHR(e.GetMasterVolumeLevelScalar(out v));
    Marshal.ThrowExceptionForHR(e.GetMute(out muted));
    return muted ? 0 : (int)Math.Round(v * 100);
  }
  public static void SetVolume(int percent) {
    var e = Endpoint();
    Marshal.ThrowExceptionForHR(e.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, percent)) / 100f, Guid.Empty));
    Marshal.ThrowExceptionForHR(e.SetMute(false, Guid.Empty));
  }
  public static void ToggleMute() {
    var e = Endpoint(); bool muted;
    Marshal.ThrowExceptionForHR(e.GetMute(out muted));
    Marshal.ThrowExceptionForHR(e.SetMute(!muted, Guid.Empty));
  }
}
'@
  $audioOk = $true
} catch {
  [Console]::Error.WriteLine("System volume is not available: $($_.Exception.Message)")
}

function Get-Volume {
  if (-not $audioOk) { return $null }
  try { return [LyricWallAudio]::GetVolume() } catch { return $null }
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
  # Volume works even without Spotify (it is the system volume).
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
