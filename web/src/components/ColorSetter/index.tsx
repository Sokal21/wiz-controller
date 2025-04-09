import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useChangeBulbColor } from "../../hooks/useChangeBulbColor";
import { useChangeBulbBrightness } from "../../hooks/useChangeBulbBrigthness";
import { ColorSetterProps } from "./types";

const ColorSetter: React.FC<ColorSetterProps> = ({ selectedBulbs, onColorChange }) => {
    const [brightness, setBrightness] = useState(50);
    const [color, setColor] = useState('#ffffff');
    const { changeBulbColor } = useChangeBulbColor();
    const { changeBulbBrightness } = useChangeBulbBrightness();

    const handleBrightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBrightness(parseInt(e.target.value));
        selectedBulbs.forEach((bulbId) => {
          changeBulbBrightness(bulbId, parseInt(e.target.value));
        });
      };


    const handleColorChange = (newColor: string) => {
        setColor(newColor);
        onColorChange(newColor);
        if (selectedBulbs.length > 0) {
          selectedBulbs.forEach((bulbId) => {
            changeBulbColor(bulbId, newColor);
          });
        }
      };

  return (<div>
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
  );
};

export default ColorSetter;
