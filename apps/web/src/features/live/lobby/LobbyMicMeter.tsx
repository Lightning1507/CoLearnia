import { useEffect, useRef } from 'react';

export function LobbyMicMeter({ stream }: { stream: MediaStream | null }) {
  const bar = useRef<HTMLMeterElement>(null);
  useEffect(() => {
    const meter = bar.current;
    if (!stream || !meter || typeof AudioContext === 'undefined') return;

    let context: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let frame: number | undefined;
    const close = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      source?.disconnect();
      if (context) void context.close().catch(() => {});
      meter.value = 0;
    };
    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const samples = new Float32Array(analyser.fftSize);
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      // Observe the borrowed preview stream without connecting it to an output.
      function sample() {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
        );
        meter!.value = Math.min(1, rms * 4);
        frame = requestAnimationFrame(sample);
      }
      void context.resume().catch(() => {});
      sample();
    } catch {
      close();
      return;
    }
    return close;
  }, [stream]);
  return (
    <div className="lobby-mic-meter">
      <span>Tín hiệu mic</span>
      <meter aria-label="Mức tín hiệu mic xem trước" min={0} max={1} defaultValue={0} ref={bar} />
      {!stream && <small>Mic tắt</small>}
    </div>
  );
}
