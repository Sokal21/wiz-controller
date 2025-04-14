import { useCallback, useEffect, useRef, useState } from 'react';
import { useChangeBulbColor } from '../../hooks/useChangeBulbColor';
import { SoundBeatProps } from './types';
import { useMicrophone } from '../../hooks/useMicrophone';
import { getOffColor } from '../../utils/getOffColor';
const SoundBeat: React.FC<SoundBeatProps> = ({ selectedBulbs, color }) => {
  const { changeBulbColor } = useChangeBulbColor();
  const [isBeatDetected, setIsBeatDetected] = useState(false);
  const [isRandomMode, setIsRandomMode] = useState(false);
  const beatTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getRandomBulbs = useCallback(() => {
    const shuffled = [...selectedBulbs].sort(() => 0.5 - Math.random());
    const noise = Math.sin(Date.now() * 0.001) * 0.5 + 0.5; // Simple oscillating value between 0-1
    const randomCount = Math.max(1, Math.min(Math.floor(noise * selectedBulbs.length), selectedBulbs.length));
    return shuffled.slice(0, randomCount);
  }, [selectedBulbs]);

  const onBeatDetected = useCallback(() => {
    setIsBeatDetected(true);
    const bulbsToLight = isRandomMode ? getRandomBulbs() : selectedBulbs;
    bulbsToLight.forEach((bulbId) => {
      changeBulbColor(bulbId, color);
    });
  }, [changeBulbColor, selectedBulbs, color, isRandomMode, getRandomBulbs]);

  const onBeatEnded = useCallback(() => {
    setIsBeatDetected(false);
    selectedBulbs.forEach((bulbId) => {
      changeBulbColor(bulbId, getOffColor(color));
    });
  }, [changeBulbColor, selectedBulbs]);

  const { 
    isMicrophoneActive,
    currentVolume,
    noiseThreshold,
    toggleMicrophone,
    stopMicrophone,
    setNoiseThreshold
  } = useMicrophone(
    onBeatDetected,
    onBeatEnded
  );

  useEffect(() => {
    return () => {
      if (beatTimeoutRef.current) {
        clearTimeout(beatTimeoutRef.current);
      }
      stopMicrophone();
    };
  }, [stopMicrophone]);

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNoiseThreshold(parseInt(e.target.value));
  };

  return (
    <div>
      <h3>Sound Control</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label htmlFor="threshold-slider" style={{ display: 'block', marginBottom: '10px' }}>
            Beat Sensitivity: {noiseThreshold}%
          </label>
          <input
            id="threshold-slider"
            type="range"
            min="0"
            max="100"
            value={noiseThreshold}
            onChange={handleThresholdChange}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '100px',
              height: '20px',
              backgroundColor: '#1a1a1a',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${currentVolume}%`,
                height: '100%',
                backgroundColor: isBeatDetected ? '#ff0000' : '#00ff00',
                transition: 'width 0.1s',
              }}
            />
          </div>
          <span>Volume: {Math.round(currentVolume)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="random-mode">Random Mode:</label>
          <input
            id="random-mode"
            type="checkbox"
            checked={isRandomMode}
            onChange={(e) => setIsRandomMode(e.target.checked)}
          />
        </div>
        <button
          onClick={toggleMicrophone}
          style={{
            backgroundColor: isMicrophoneActive ? '#ff0000' : '#1a1a1a',
            color: isMicrophoneActive ? '#ffffff' : '#ffffff',
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isMicrophoneActive ? 'Stop Beat Detection' : 'Start Beat Detection'}
        </button>
      </div>
    </div>
  );
};

export default SoundBeat;
