import { HexColorPicker } from 'react-colorful';
import { ControllerProps } from './types';

export const Controller: React.FC<ControllerProps> = ({
  color,
  handleColorChange,
  isLooping,
  toggleColorLoop,
  intervalSpeed,
  startColor,
  endColor,
  handleSpeedChange,
  noiseThreshold,
  currentVolume,
  isBeatDetected,
  isMicrophoneActive,
  handleThresholdChange,
  toggleMicrophone,
  setStartColor,
  setEndColor,
  brightness,
  handleBrightnessChange,
}) => {
  return (
    <div className="card w-full">
      <div className="flex gap-x-12 justify-center items-start">
        <div>
          <h2>Color Control</h2>
          <HexColorPicker color={color} onChange={handleColorChange} />
          <div
            style={{
              width: '50px',
              height: '50px',
              backgroundColor: color,
              borderRadius: '8px',
              border: '2px solid #1a1a1a',
              marginTop: '10px',
            }}
          />
          <div style={{ marginTop: '20px' }}>
            <label htmlFor="brightness-slider" style={{ display: 'block', marginBottom: '10px' }}>
              Brightness: {brightness}%
            </label>
            <input
              id="brightness-slider"
              type="range"
              min="0"
              max="100"
              value={brightness}
              onChange={handleBrightnessChange}
              style={{ width: '100%' }}
            />
          </div>
        </div>

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
      </div>
    </div>
  );
};
