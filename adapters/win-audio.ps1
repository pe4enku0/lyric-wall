# Lyric Wall sound helper for Windows (keep this file ASCII-only: PowerShell 5.1 reads it as ANSI).
# Listens to what the default output device plays (WASAPI loopback) in the device's own format, so
# 5.1 / 7.1 headsets work too (the loopback built into Electron opens the device in stereo and is
# refused by such devices). The sound is mixed down to mono, made about 8 dB louder (GAIN) and turned
# into a spectrum the same way the browser's AnalyserNode does it (fftSize 4096, smoothing 0.5,
# -80..-22 dB). Nothing is recorded, saved or sent anywhere.
# Output, one line each:
#   F <sample rate> <fft size> <channels> <bits>   the device was opened (again)
#   S <base64 bytes>                               the spectrum, bins 0..up to 16 kHz, 50 times a second
#   E <text>                                       a problem (no output device, the device went away...)
# The helper exits when stdin closes (the app quit).
$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class LwDeviceEnumerator {}

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ILwDeviceEnumerator {
  void EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
  void GetDefaultAudioEndpoint(int flow, int role, out ILwDevice device);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ILwDevice {
  void Activate(ref Guid iid, int context, IntPtr prms, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  void OpenPropertyStore(int access, out IntPtr store);
  void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}

[ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ILwAudioClient {
  void Initialize(int shareMode, int flags, long bufferDuration, long periodicity, IntPtr format, IntPtr session);
  void GetBufferSize(out uint frames);
  void GetStreamLatency(out long latency);
  void GetCurrentPadding(out uint padding);
  void IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
  void GetMixFormat(out IntPtr format);
  void GetDevicePeriod(out long period, out long minPeriod);
  void Start();
  void Stop();
  void Reset();
  void SetEventHandle(IntPtr handle);
  void GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ILwCaptureClient {
  void GetBuffer(out IntPtr data, out uint frames, out uint flags, out long position, out long qpc);
  void ReleaseBuffer(uint frames);
  void GetNextPacketSize(out uint frames);
}

public static class LwLoopback {
  const int FFT = 4096;
  const double MIN_DB = -80, MAX_DB = -22, SMOOTHING = 0.5, TOP_HZ = 16000;
  const int TICK_MS = 20;
  // The sound is taken after Spotify's own volume, so the bars were low: about +8 dB makes them livelier.
  const float GAIN = 2.5f;
  static readonly Guid FLOAT = new Guid("00000003-0000-0010-8000-00AA00389B71");

  static StreamWriter output;
  static readonly float[] ring = new float[FFT];
  static int ringPos;
  static long received;          // mono samples put into the ring since the device was opened
  static readonly double[] window = new double[FFT];
  static readonly double[] smooth = new double[FFT / 2];
  static readonly double[] re = new double[FFT], im = new double[FFT];

  [DllImport("winmm.dll")] static extern int timeBeginPeriod(int ms);

  public static void Run() {
    timeBeginPeriod(1); // Sleep(5) would last about 15 ms otherwise

    output = new StreamWriter(Console.OpenStandardOutput());
    output.AutoFlush = true;
    // stdin closes when the app exits: then this helper exits too.
    var stdin = new Thread(() => {
      var r = new StreamReader(Console.OpenStandardInput());
      while (r.ReadLine() != null) {}
      Environment.Exit(0);
    });
    stdin.IsBackground = true;
    stdin.Start();
    for (int i = 0; i < FFT; i++) window[i] = 0.42 - 0.5 * Math.Cos(2 * Math.PI * i / FFT) + 0.08 * Math.Cos(4 * Math.PI * i / FFT);

    string lastError = null;
    while (true) {
      try {
        Listen();
        lastError = null;
      } catch (Exception e) {
        string text = e is COMException ? string.Format("0x{0:X8} {1}", ((COMException)e).ErrorCode, e.Message) : e.Message;
        // The same problem again and again is reported once.
        if (text != lastError) output.WriteLine("E " + text.Replace("\r", " ").Replace("\n", " "));
        lastError = text;
      }
      Thread.Sleep(1000);
    }
  }

  // Opens the default output device and sends spectra until it changes or goes away.
  static void Listen() {
    var devices = (ILwDeviceEnumerator)new LwDeviceEnumerator();
    ILwDevice device;
    devices.GetDefaultAudioEndpoint(0, 1, out device); // render, multimedia
    string id;
    device.GetId(out id);
    Guid iid = typeof(ILwAudioClient).GUID;
    object o;
    device.Activate(ref iid, 1, IntPtr.Zero, out o); // CLSCTX_INPROC_SERVER
    var client = (ILwAudioClient)o;
    IntPtr fmt;
    client.GetMixFormat(out fmt);
    int tag = Marshal.ReadInt16(fmt, 0) & 0xFFFF, channels = Marshal.ReadInt16(fmt, 2), rate = Marshal.ReadInt32(fmt, 4);
    int block = Marshal.ReadInt16(fmt, 12), bits = Marshal.ReadInt16(fmt, 14);
    bool isFloat = tag == 3;
    if (tag == 0xFFFE) {
      byte[] g = new byte[16];
      Marshal.Copy(new IntPtr(fmt.ToInt64() + 24), g, 0, 16);
      isFloat = new Guid(g) == FLOAT;
    }
    if (!isFloat && bits != 16 && bits != 24 && bits != 32) throw new Exception("unsupported device format: " + bits + " bit");
    // Shared mode, loopback, 200 ms buffer.
    client.Initialize(0, 0x00020000, 2000000, 0, fmt, IntPtr.Zero);
    Marshal.FreeCoTaskMem(fmt);
    Guid cid = typeof(ILwCaptureClient).GUID;
    client.GetService(ref cid, out o);
    var capture = (ILwCaptureClient)o;
    client.Start();
    output.WriteLine(string.Format("F {0} {1} {2} {3}", rate, FFT, channels, bits));

    Array.Clear(ring, 0, FFT);
    Array.Clear(smooth, 0, smooth.Length);
    received = 0;
    int top = Math.Min(FFT / 2, (int)(TOP_HZ * FFT / rate) + 1);
    byte[] bytes = new byte[top];
    byte[] raw = new byte[0];
    var clock = Stopwatch.StartNew();
    long nextTick = 0, nextCheck = 1000;
    try {
      while (true) {
        uint packet;
        capture.GetNextPacketSize(out packet);
        while (packet > 0) {
          IntPtr data; uint frames, flags; long pos, qpc;
          capture.GetBuffer(out data, out frames, out flags, out pos, out qpc);
          int size = (int)frames * block;
          if (raw.Length < size) raw = new byte[size];
          bool silent = (flags & 2) != 0; // AUDCLNT_BUFFERFLAGS_SILENT
          if (!silent) Marshal.Copy(data, raw, 0, size);
          capture.ReleaseBuffer(frames);
          for (int f = 0; f < frames; f++) Put(silent ? 0f : Mono(raw, f * block, channels, bits, isFloat));
          capture.GetNextPacketSize(out packet);
        }
        long now = clock.ElapsedMilliseconds;
        if (now >= nextTick) {
          // Windows sends nothing while nothing plays: count that time as silence.
          long due = now * rate / 1000;
          if (due - received > rate / 25) while (received < due) Put(0f);
          Spectrum(bytes);
          output.WriteLine("S " + Convert.ToBase64String(bytes));
          nextTick = now + TICK_MS;
        }
        if (now >= nextCheck) {
          // Another output device was chosen in Windows: open that one.
          ILwDevice current;
          string currentId;
          devices.GetDefaultAudioEndpoint(0, 1, out current);
          current.GetId(out currentId);
          Marshal.ReleaseComObject(current);
          if (currentId != id) return;
          nextCheck = now + 1000;
        }
        Thread.Sleep(5);
      }
    } finally {
      try { client.Stop(); } catch {}
      Marshal.ReleaseComObject(capture);
      Marshal.ReleaseComObject(client);
      Marshal.ReleaseComObject(device);
      Marshal.ReleaseComObject(devices);
    }
  }

  // One frame mixed down like the browser does for stereo: (left + right) / 2, then GAIN.
  // In 5.1 / 7.1 the first two channels are front left and right, where music plays.
  static float Mono(byte[] b, int at, int channels, int bits, bool isFloat) {
    float l = Sample(b, at, bits, isFloat);
    if (channels < 2) return l * GAIN;
    return (l + Sample(b, at + bits / 8, bits, isFloat)) / 2 * GAIN;
  }

  static float Sample(byte[] b, int at, int bits, bool isFloat) {
    if (isFloat) return BitConverter.ToSingle(b, at);
    if (bits == 16) return BitConverter.ToInt16(b, at) / 32768f;
    if (bits == 24) return ((b[at] << 8 | b[at + 1] << 16 | b[at + 2] << 24) >> 8) / 8388608f;
    return BitConverter.ToInt32(b, at) / 2147483648f;
  }

  static void Put(float v) {
    ring[ringPos] = v;
    ringPos = (ringPos + 1) % FFT;
    received++;
  }

  // AnalyserNode.getByteFrequencyData: Blackman window, FFT, |X| / N, smoothing over time, dB, bytes.
  static void Spectrum(byte[] bytes) {
    for (int i = 0; i < FFT; i++) { re[i] = ring[(ringPos + i) % FFT] * window[i]; im[i] = 0; }
    Fft();
    double k = 255 / (MAX_DB - MIN_DB);
    for (int i = 0; i < bytes.Length; i++) {
      double mag = Math.Sqrt(re[i] * re[i] + im[i] * im[i]) / FFT;
      smooth[i] = SMOOTHING * smooth[i] + (1 - SMOOTHING) * mag;
      double db = smooth[i] > 0 ? 20 * Math.Log10(smooth[i]) : MIN_DB;
      bytes[i] = (byte)Math.Max(0, Math.Min(255, Math.Floor(k * (db - MIN_DB))));
    }
  }

  // In-place radix-2 FFT of re/im.
  static void Fft() {
    for (int i = 1, j = 0; i < FFT; i++) {
      int bit = FFT >> 1;
      for (; (j & bit) != 0; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { double t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (int len = 2; len <= FFT; len <<= 1) {
      double a = -2 * Math.PI / len, wr = Math.Cos(a), wi = Math.Sin(a);
      for (int i = 0; i < FFT; i += len) {
        double cr = 1, ci = 0;
        for (int j = 0; j < len / 2; j++) {
          int p = i + j, q = p + len / 2;
          double tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
          re[q] = re[p] - tr; im[q] = im[p] - ti;
          re[p] += tr; im[p] += ti;
          double n = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = n;
        }
      }
    }
  }
}
'@
} catch {
  [Console]::Out.WriteLine("E the sound helper could not start: $($_.Exception.Message)")
  exit 1
}
[LwLoopback]::Run()
