import { useEffect, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useChangeBulbColor } from '../../hooks/useChangeBulbColor';
import { ColorLoopProps } from './types';

const ColorLoop: React.FC<ColorLoopProps> = ({ selectedBulbs }) => {
  const [isLooping, setIsLooping] = useState(false);
  const [intervalSpeed, setIntervalSpeed] = useState(50);
  const [startColor, setStartColor] = useState('#ff0000');
  const [endColor, setEndColor] = useState('#000000');
  const loopInterval = useRef<NodeJS.Timeout | null>(null);
  const { changeBulbColor } = useChangeBulbColor();

  useEffect(() => {
    return () => {
      if (loopInterval.current) {
        clearInterval(loopInterval.current);
      }
    };
  }, []);

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

  return (
    <div>
      <h3>Loop Colors</h3>
      <div className="flex gap-x-20 justify-center">
        <div className="flex flex-col items-center">
          <label>Start Color</label>
          <HexColorPicker color={startColor} onChange={setStartColor} />
          <div
            style={{
              width: '50px',
              height: '50px',
              backgroundColor: startColor,
              borderRadius: '8px',
              border: '2px solid #1a1a1a',
              marginTop: '10px',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label>End Color</label>
          <HexColorPicker color={endColor} onChange={setEndColor} />
          <div
            style={{
              width: '50px',
              height: '50px',
              backgroundColor: endColor,
              borderRadius: '8px',
              border: '2px solid #1a1a1a',
              marginTop: '10px',
            }}
          />
        </div>
      </div>
      <div>
        <label htmlFor="speed-slider" style={{ display: 'block', marginBottom: '10px' }}>
          Animation Speed: {intervalSpeed}ms
        </label>
        <input
          id="speed-slider"
          type="range"
          min="10"
          max="1000"
          value={intervalSpeed}
          onChange={handleSpeedChange}
          style={{ width: '100%' }}
        />
      </div>
      <div>
        <button
          onClick={toggleColorLoop}
          style={{
            backgroundColor: isLooping ? '#ff0000' : '#1a1a1a',
            color: isLooping ? '#ffffff' : '#ffffff',
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isLooping ? 'Stop Color Loop' : 'Start Color Loop'}
        </button>
      </div>
    </div>
  );
};

export default ColorLoop;
