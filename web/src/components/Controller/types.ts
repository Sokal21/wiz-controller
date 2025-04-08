export interface ControllerProps {
  color: string;
  handleColorChange: (color: string) => void;
  isLooping: boolean;
  toggleColorLoop: () => void;
  intervalSpeed: number;
  setIntervalSpeed: (speed: number) => void;
  startColor: string;
  endColor: string;
  handleSpeedChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  noiseThreshold: number;
  currentVolume: number;
  isBeatDetected: boolean;
  isMicrophoneActive: boolean;
  setStartColor: (color: string) => void;
  setEndColor: (color: string) => void;
  toggleMicrophone: () => void;
  handleThresholdChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  brightness: number;
  handleBrightnessChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}