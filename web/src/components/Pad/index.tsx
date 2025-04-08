import { useCallback, useEffect, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { PadProps } from './types';

interface PadSquare {
  letter: string;
  color: string;
  isPickerOpen: boolean;
}

export const Pad: React.FC<PadProps> = ({ onPadPress, timeout, setTimeout }) => {
  const [squares, setSquares] = useState<PadSquare[]>([
    { letter: 'q', color: '#ffffff', isPickerOpen: false },
    { letter: 'w', color: '#ffffff', isPickerOpen: false }, 
    { letter: 'e', color: '#ffffff', isPickerOpen: false },
    { letter: 'a', color: '#ffffff', isPickerOpen: false },
    { letter: 's', color: '#ffffff', isPickerOpen: false },
    { letter: 'd', color: '#ffffff', isPickerOpen: false },
    { letter: 'z', color: '#ffffff', isPickerOpen: false },
    { letter: 'x', color: '#ffffff', isPickerOpen: false },
    { letter: 'c', color: '#ffffff', isPickerOpen: false }
  ]);

  const handleSquareClick = (index: number) => {
    setSquares(squares.map((square, i) => 
      i === index ? {...square, isPickerOpen: true} : square
    ));
  };

  const handleColorChange = (color: string, index: number) => {
    setSquares(squares.map((square, i) => 
      i === index ? {...square, color} : square
    ));
  };

  const handlePickerClose = (index: number) => {
    setSquares(squares.map((square, i) => 
      i === index ? {...square, isPickerOpen: false} : square
    ));
  };

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    const square = squares.find(s => s.letter === event.key.toLowerCase());
    if (square) {
      onPadPress(square.color);
    }
  }, [squares, onPadPress]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  return (
    <div className="grid grid-cols-3 gap-2 w-fit">
      {squares.map((square, index) => (
        <div key={square.letter} className="relative">
          <button
            onClick={() => handleSquareClick(index)}
            style={{ backgroundColor: square.color }}
            className="w-20 h-20 border-2 border-gray-800 rounded flex items-center justify-center text-xl font-bold"
          >
            {square.letter.toUpperCase()}
          </button>
          
          {square.isPickerOpen && (
            <div className="absolute z-10 top-full left-0 mt-2">
              <div className="fixed inset-0" onClick={() => handlePickerClose(index)} />
              <HexColorPicker 
                color={square.color} 
                onChange={(color) => handleColorChange(color, index)} 
              />
            </div>
          )}
        </div>
      ))}
      <div className="col-span-3 mt-4">
        <label htmlFor="timeout-slider" className="block mb-2">
          Light Timeout: {timeout}ms
        </label>
        <input
          id="timeout-slider"
          type="range"
          min="0"
          max="1000"
          value={timeout}
          onChange={(e) => setTimeout(parseInt(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
};
