# Lyric Wall media helper for Windows (keep this file ASCII-only: PowerShell 5.1 reads it as ANSI).
# Reads the Spotify session from Windows.Media.Control (the media controls in the volume flyout),
# prints one JSON line per second while music plays (every 2 s otherwise)
# and accepts commands on stdin: toggle, next, prev.
# No Spotify login is needed. Spotify volume is not available here, so "volume" is always null.
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
  if ($null -eq $props.Thumbnail) { return '' }
  $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
  $mem = New-Object System.IO.MemoryStream
  $net.CopyTo($mem)
  $type = $stream.ContentType
  if (-not $type) { $type = 'image/jpeg' }
  return 'data:' + $type + ';base64,' + [Convert]::ToBase64String($mem.ToArray())
}

$lastArtKey = ''
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
    volume = $null
    shuffle = $info.IsShuffleActive
  }
  # The cover is sent only when the track changes (it is big).
  if ($key -ne $script:lastArtKey) {
    try { $out.art = Get-Art $props } catch { $out.art = '' }
    if ($out.art) { $script:lastArtKey = $key }
  }
  Send $out
}

function Send-MediaCommand($cmd) {
  $s = Get-Spotify
  if ($null -eq $s) { return }
  switch ($cmd) {
    'toggle' { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
    'next' { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
    'prev' { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
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
