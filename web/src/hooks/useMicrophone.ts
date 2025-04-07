import { useCallback, useRef, useState } from 'react';

export const useMicrophone = (onBeatDetected?: () => void, onBeatEnded?: () => void) => {
  const microphoneRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const beatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [noiseThreshold, setNoiseThreshold] = useState(0);
  const energyHistoryRef = useRef<number[]>([]);

  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();

      gainNode.gain.value = 1;

      analyserRef.current = analyser;

      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.2;

      source.connect(gainNode);
      gainNode.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        const currentEnergy = average;
        const energyHistory = energyHistoryRef.current;

        energyHistory.push(currentEnergy);
        if (energyHistory.length > 20) {
          energyHistory.shift();
        }

        const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;

        const isBeat = currentEnergy > avgEnergy * 1.5 && currentEnergy > noiseThreshold;

        if (isBeat) {
          onBeatDetected?.();

          if (beatTimeoutRef.current) {
            clearTimeout(beatTimeoutRef.current);
          }

          beatTimeoutRef.current = setTimeout(() => {
            onBeatEnded?.();
          }, 100);
        }

        const normalizedVolume = Math.min(100, (average / 128) * 200);
        setCurrentVolume(normalizedVolume);

        requestAnimationFrame(checkVolume);
      };

      checkVolume();
      setIsMicrophoneActive(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please ensure you have granted microphone permissions.');
    }
  }, [noiseThreshold, onBeatDetected, onBeatEnded]);

  const stopMicrophone = useCallback(() => {
    if (microphoneRef.current) {
      microphoneRef.current.getTracks().forEach((track) => track.stop());
      microphoneRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (beatTimeoutRef.current) {
      clearTimeout(beatTimeoutRef.current);
      beatTimeoutRef.current = null;
    }
    analyserRef.current = null;
    setIsMicrophoneActive(false);
  }, [microphoneRef, audioContextRef, beatTimeoutRef, analyserRef]);

  const toggleMicrophone = useCallback(() => {
    if (isMicrophoneActive) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  }, [isMicrophoneActive, startMicrophone, stopMicrophone]);

  return {
    startMicrophone,
    stopMicrophone,
    isMicrophoneActive,
    currentVolume,
    toggleMicrophone,
    setNoiseThreshold,
    noiseThreshold,
  };
};
