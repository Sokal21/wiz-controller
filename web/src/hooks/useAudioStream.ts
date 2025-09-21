// hooks/useAudioStream.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAudioStream(
  onBeatDetected: () => void,
  onBeatEnded: () => void
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [noiseThreshold, setNoiseThreshold] = useState(20); // %

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const beatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const setupAudio = useCallback(async () => {
    const context = new AudioContext({ sampleRate: 16000 });

    const processorCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = [];
          this.port.onmessage = (event) => {
            this.buffer.push(...new Int16Array(event.data));
          };
        }
        process(inputs, outputs) {
          const output = outputs[0];
          const channel = output[0];
          for (let i = 0; i < channel.length; i++) {
            if (this.buffer.length > 0) {
              channel[i] = this.buffer.shift() / 32768;
            } else {
              channel[i] = 0;
            }
          }
          return true;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    `;
    const blob = new Blob([processorCode], { type: 'application/javascript' });
    const blobURL = URL.createObjectURL(blob);

    await context.audioWorklet.addModule(blobURL);

    const workletNode = new AudioWorkletNode(context, 'pcm-processor');
    const gainNode = context.createGain();
    const analyserNode = context.createAnalyser();

    analyserNode.fftSize = 512;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    workletNode.connect(gainNode).connect(analyserNode).connect(context.destination);

    audioContextRef.current = context;
    workletNodeRef.current = workletNode;
    gainNodeRef.current = gainNode;
    analyserNodeRef.current = analyserNode;
    dataArrayRef.current = dataArray;
  }, []);

  const connectWebSocket = useCallback(() => {
    wsRef.current = new WebSocket('ws://192.168.100.34:5000'); // cambiar IP si hace falta
    wsRef.current.binaryType = 'arraybuffer';

    wsRef.current.onmessage = (event) => {
      if (workletNodeRef.current) {
        workletNodeRef.current.port.postMessage(event.data);
      }
    };
  }, []);

  const toggleStreaming = useCallback(async () => {
    if (isStreaming) {
      stopStreaming();
    } else {
      if (!audioContextRef.current) {
        await setupAudio();
      }
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      connectWebSocket();
      setIsStreaming(true);
      startAnalyzing();
    }
  }, [isStreaming, connectWebSocket, setupAudio]);

  const stopStreaming = useCallback(() => {
    wsRef.current?.close();
    audioContextRef.current?.close();
    wsRef.current = null;
    audioContextRef.current = null;
    analyserNodeRef.current = null;
    gainNodeRef.current = null;
    workletNodeRef.current = null;
    setIsStreaming(false);
    setCurrentVolume(0);
  }, []);

  const startAnalyzing = useCallback(() => {
    const analyze = () => {
      if (!analyserNodeRef.current || !dataArrayRef.current) return;

      analyserNodeRef.current.getByteTimeDomainData(dataArrayRef.current);

      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const val = (dataArrayRef.current[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArrayRef.current.length);
      const volume = Math.min(1, rms) * 100;
      setCurrentVolume(volume);

      console.log('Volume:', volume);
      console.log('Noise threshold:', noiseThreshold);

      if (volume > noiseThreshold) {
        if (!beatTimeoutRef.current) {
          console.log('Beat detected');
          onBeatDetected();
          beatTimeoutRef.current = setTimeout(() => {
            beatTimeoutRef.current = null;
            onBeatEnded();
          }, 100);
        }
      }

      requestAnimationFrame(analyze);
    };
    analyze();
  }, [noiseThreshold, onBeatDetected, onBeatEnded]);

  return {
    isStreaming,
    currentVolume,
    noiseThreshold,
    toggleStreaming,
    stopStreaming,
    setNoiseThreshold,
  };
}
