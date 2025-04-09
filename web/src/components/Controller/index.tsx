import { ControllerProps } from './types';
import ColorSetter from '../ColorSetter';
import ColorLoop from '../ColorLoop';
import SoundBeat from '../SoundBeat';
import { useState } from 'react';
import { Pad } from '../Pad';
import ChainLoop from '../ChainLoop';

export const Controller: React.FC<ControllerProps> = ({ selectedBulbs }) => {
  const [color, setColor] = useState('#000000');

  return (
    <div className="card w-full">
      <div className="flex gap-x-12 justify-center items-start">
        <ColorSetter selectedBulbs={selectedBulbs} onColorChange={setColor} />
        <ColorLoop selectedBulbs={selectedBulbs} />
        <SoundBeat selectedBulbs={selectedBulbs} color={color} />
      </div>
      <Pad selectedBulbs={selectedBulbs} />
      <ChainLoop selectedBulbs={selectedBulbs} color={color} />
    </div>
  );
};
