import { useEffect, useRef, useState } from 'react';

const AudioPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1.0);
  const [beatDetected, setBeatDetected] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const setupAudio = async () => {
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

          process(inputs, outputs, parameters) {
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

      analyserNode.fftSize = 512; // Pequeña ventana para detectar golpes rápidos
      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      workletNode.connect(gainNode).connect(analyserNode).connect(context.destination);

      audioContextRef.current = context;
      workletNodeRef.current = workletNode;
      gainNodeRef.current = gainNode;
      analyserNodeRef.current = analyserNode;
      dataArrayRef.current = dataArray;

      startBeatDetection();
    };

    setupAudio();

    return () => {
      disconnectWebSocket();
      cleanupAudio();
    };
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setError(null);
    wsRef.current = new WebSocket('ws://192.168.100.34:5000'); // Cambiar IP si hace falta
    wsRef.current.binaryType = 'arraybuffer';

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error. Please try again.');
      setIsConnected(false);
    };

    wsRef.current.onmessage = (event) => {
      if (workletNodeRef.current) {
        workletNodeRef.current.port.postMessage(event.data);
      }
    };
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const cleanupAudio = () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (analyserNodeRef.current) {
      analyserNodeRef.current.disconnect();
      analyserNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startBeatDetection = () => {
    const detect = () => {
      if (!analyserNodeRef.current || !dataArrayRef.current) return;

      analyserNodeRef.current.getByteTimeDomainData(dataArrayRef.current);

      // Calculamos la "energía" del audio actual
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const val = (dataArrayRef.current[i] - 128) / 128; // normalizar
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArrayRef.current.length);

      // Threshold simple para detectar beat
      if (rms > 0.2) { // Ajustá este valor según sensibilidad
        setBeatDetected(true);
        setTimeout(() => setBeatDetected(false), 100); // Parpadear
      }

      requestAnimationFrame(detect);
    };

    detect();
  };

  const togglePlay = async () => {
    if (isPlaying) {
      // Stop streaming
      disconnectWebSocket();
      cleanupAudio();
      setIsPlaying(false);
      setIsConnected(false);
    } else {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        await setupAudio(); // Re-setup if previously closed
      } else if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      connectWebSocket();
      setIsPlaying(true);
    }
  };

  const setupAudio = async () => {
    // Este código ya está en el primer useEffect
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <button
        onClick={togglePlay}
        className={`px-4 py-2 rounded transition-colors ${
          isConnected ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'
        } text-white`}
      >
        {isPlaying ? 'Stop' : 'Start Streaming'}
      </button>
      <div className="text-sm text-gray-600">
        {isConnected ? (isPlaying ? 'Streaming audio...' : 'Connected, ready to stream') : 'Disconnected'}
      </div>

      {/* Visualizador de BEAT */}
      <div className="w-32 h-8 mt-4 flex items-center justify-center border rounded bg-gray-100">
        {beatDetected ? <span className="text-red-500 font-bold animate-ping">💥 BEAT!</span> : 'No beat'}
      </div>

      {/* Control de volumen */}
      <div className="flex items-center gap-2">
        <label htmlFor="volume" className="text-sm text-gray-600">Volume:</label>
        <input
          type="range"
          id="volume"
          min="0"
          max="2"
          step="0.1"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-32"
        />
        <span className="text-sm text-gray-600">{Math.round(volume * 100)}%</span>
      </div>

      {/* Errores */}
      {error && (
        <div className="text-sm text-red-500">{error}</div>
      )}
    </div>
  );
};

export default AudioPlayer;
