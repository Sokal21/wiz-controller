import { useCallback, useEffect, useRef, useState } from 'react';
import { notify, tapBeat } from './store';

const HISTORY = 43; // ~0.7 s of frames
const THRESHOLD = 1.45;
const MIN_GAP_MS = 220;
/** Kick drums live in the lowest bins. */
const BASS_BINS = 8;

/** Detects beats from the microphone: a bass-energy spike well above the recent average. */
export function useMicBeats() {
  const [listening, setListening] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify('The microphone is only available on localhost or over HTTPS.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      notify('Could not use the microphone. Allow access to it in the browser and try again.');
      return;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    context.createMediaStreamSource(stream).connect(analyser);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const history: number[] = [];
    let lastBeatAt = 0;
    let frame = 0;

    const analyse = () => {
      analyser.getByteFrequencyData(bins);
      let energy = 0;
      for (let i = 0; i < BASS_BINS; i++) energy += bins[i];
      energy /= BASS_BINS;

      const average = history.reduce((sum, value) => sum + value, 0) / (history.length || 1);
      const now = performance.now();
      if (history.length >= HISTORY / 2 && energy > 40 && energy > average * THRESHOLD && now - lastBeatAt > MIN_GAP_MS) {
        lastBeatAt = now;
        tapBeat();
      }

      history.push(energy);
      if (history.length > HISTORY) history.shift();
      frame = requestAnimationFrame(analyse);
    };
    frame = requestAnimationFrame(analyse);

    cleanup.current = () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
    };
    setListening(true);
  }, []);

  useEffect(() => stop, [stop]);

  return { listening, toggle: listening ? stop : start };
}
