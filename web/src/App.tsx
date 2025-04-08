import { useState, useEffect, useRef, useCallback } from 'react';
import { useGetBulbs } from './hooks/useGetBulbs';
import { useChangeBulbColor } from './hooks/useChangeBulbColor';
import { useMicrophone } from './hooks/useMicrophone';
import { BulbsList } from './components/BulbsList';
import { Controller } from './components/Controller';
import { useChangeBulbBrightness } from './hooks/useChangeBulbBrigthness';
import { Pad } from './components/Pad';

import './App.css';

function App() {
  const { bulbs } = useGetBulbs();
  const { changeBulbColor } = useChangeBulbColor();
  const { changeBulbBrightness } = useChangeBulbBrightness(); 
  const [selectedBulbs, setSelectedBulbs] = useState<string[]>([]);
  const [isBeatDetected, setIsBeatDetected] = useState(false);
  const [brightness, setBrightness] = useState(50);
  const [color, setColor] = useState('#ffffff');
  const [isLooping, setIsLooping] = useState(false);
  const [intervalSpeed, setIntervalSpeed] = useState(50);
  const [startColor, setStartColor] = useState('#ff0000');
  const [endColor, setEndColor] = useState('#000000');
  const loopInterval = useRef<NodeJS.Timeout | null>(null);
  const beatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const padTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [padTimeout, setPadTimeout] = useState(1000);

  const onBeatDetected = useCallback(() => {
    setIsBeatDetected(true);
    selectedBulbs.forEach((bulbId) => {
      changeBulbColor(bulbId, color);
    });
  }, [changeBulbColor, selectedBulbs, color]);

  const onBeatEnded = useCallback(() => {
    setIsBeatDetected(false);
    selectedBulbs.forEach((bulbId) => {
      changeBulbColor(bulbId, '#010000');
    });
  }, [changeBulbColor, selectedBulbs]);

  const { isMicrophoneActive, currentVolume, noiseThreshold, toggleMicrophone, stopMicrophone, setNoiseThreshold } = useMicrophone(
    onBeatDetected,
    onBeatEnded
  );

  useEffect(() => {
    return () => {
      if (loopInterval.current) {
        clearInterval(loopInterval.current);
      }
      if (beatTimeoutRef.current) {
        clearTimeout(beatTimeoutRef.current);
      }
      stopMicrophone();
    };
  }, [stopMicrophone]);

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    if (selectedBulbs.length > 0) {
      selectedBulbs.forEach((bulbId) => {
        changeBulbColor(bulbId, newColor);
      });
    }
  };

  const handlePadPress = (color: string) => {
    if (selectedBulbs.length > 0) {
      selectedBulbs.forEach((bulbId) => {
        changeBulbColor(bulbId, color);
      }); 
    }
    if (padTimeoutRef.current) {
      clearTimeout(padTimeoutRef.current);
    }
    padTimeoutRef.current = setTimeout(() => {
      selectedBulbs.forEach((bulbId) => {
        changeBulbColor(bulbId, '#010000');
      });
    }, padTimeout);
  };

  const toggleColorLoop = () => {
    if (isLooping) {
      // Stop the loop
      if (loopInterval.current) {
        clearInterval(loopInterval.current);
        loopInterval.current = null;
      }
      setIsLooping(false);
    } else if (selectedBulbs.length > 0) {
      // Start the loop
      setIsLooping(true);
      let isStartColor = true;

      loopInterval.current = setInterval(() => {
        if (selectedBulbs.length > 0) {
          const currentColor = isStartColor ? startColor : endColor;

          selectedBulbs.forEach((bulbId) => {
            changeBulbColor(bulbId, currentColor);
          });
          isStartColor = !isStartColor;
        }
      }, intervalSpeed);
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseInt(e.target.value);
    setIntervalSpeed(newSpeed);

    // If loop is running, restart it with new speed
    if (isLooping && loopInterval.current) {
      clearInterval(loopInterval.current);
      let isStartColor = true;

      loopInterval.current = setInterval(() => {
        if (selectedBulbs.length > 0) {
          const currentColor = isStartColor ? startColor : endColor;

          selectedBulbs.forEach((bulbId) => {
            changeBulbColor(bulbId, currentColor);
          });
          isStartColor = !isStartColor;
        }
      }, newSpeed);
    }
  };

  const toggleBulbSelection = (bulbId: string) => {
    setSelectedBulbs((prev) => {
      if (prev.includes(bulbId)) {
        return prev.filter((id) => id !== bulbId);
      } else {
        return [...prev, bulbId];
      }
    });
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNoiseThreshold(parseInt(e.target.value));
  };

  const handleBrightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBrightness(parseInt(e.target.value));
    selectedBulbs.forEach((bulbId) => {
      changeBulbBrightness(bulbId, parseInt(e.target.value));
    });
  };

  return (
    <>
      <h1>Wiz Bulb Controller</h1>
      <BulbsList bulbs={bulbs} selectedBulbs={selectedBulbs} onClickBulb={toggleBulbSelection} />
      <Controller
        color={color}
        handleColorChange={handleColorChange}
        isLooping={isLooping}
        toggleColorLoop={toggleColorLoop}
        intervalSpeed={intervalSpeed}
        setIntervalSpeed={setIntervalSpeed}
        startColor={startColor}
        endColor={endColor}
        handleSpeedChange={handleSpeedChange}
        noiseThreshold={noiseThreshold}
        currentVolume={currentVolume}
        isBeatDetected={isBeatDetected}
        isMicrophoneActive={isMicrophoneActive}
        setStartColor={setStartColor}
        setEndColor={setEndColor}
        toggleMicrophone={toggleMicrophone}
        handleThresholdChange={handleThresholdChange}
        brightness={brightness}
        handleBrightnessChange={handleBrightnessChange}
      />
      <Pad onPadPress={handlePadPress} timeout={padTimeout} setTimeout={setPadTimeout} />
    </>
  );
}

export default App;
