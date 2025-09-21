import { useCallback, useEffect, useRef, useState } from 'react';

export function useBeatStream(
  onBeatDetected: () => void,
  onBeatEnded: () => void
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const beatTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectWebSocket = useCallback(() => {
    wsRef.current = new WebSocket('ws://192.168.100.34:5000'); // Cambia la IP si hace falta

    wsRef.current.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsStreaming(true);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'beat') {
          console.log('🎵 Beat received!', message);

          if (!beatTimeoutRef.current) {
            onBeatDetected();
            beatTimeoutRef.current = setTimeout(() => {
              beatTimeoutRef.current = null;
              onBeatEnded();
            }, 100); // Duración que parpadea el beat
          }
        }
      } catch (err) {
        console.error('❌ Error parsing WebSocket message:', err);
      }
    };

    wsRef.current.onclose = () => {
      console.log('👋 WebSocket disconnected');
      setIsStreaming(false);
    };

    wsRef.current.onerror = (err) => {
      console.error('💥 WebSocket error:', err);
      setIsStreaming(false);
    };
  }, [onBeatDetected, onBeatEnded]);

  const toggleStreaming = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    } else {
      connectWebSocket();
    }
  }, [isStreaming, connectWebSocket]);

  const stopStreaming = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, [stopStreaming]);

  return {
    isStreaming,
    toggleStreaming,
    stopStreaming,
  };
}
