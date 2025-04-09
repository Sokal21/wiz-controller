import { useState, useEffect, useRef } from "react";
import { useChangeBulbColor } from "../../hooks/useChangeBulbColor";
import { ChainLoopProps } from "./types";

const ChainLoop: React.FC<ChainLoopProps> = ({ selectedBulbs, color }) => {
    const [sequence, setSequence] = useState<string[]>([]);
    const [lightDuration, setLightDuration] = useState(1000); // milliseconds
    const [transitionTime, setTransitionTime] = useState(500); // milliseconds
    const [isPlaying, setIsPlaying] = useState(false);
    const { changeBulbColor } = useChangeBulbColor();
    const currentIndexRef = useRef(0);

    // Initialize sequence when selectedBulbs changes
    useEffect(() => {
        setSequence(selectedBulbs);
    }, [selectedBulbs]);

    // Handle the lighting loop
    useEffect(() => {
        if (!isPlaying || sequence.length === 0) return;

        const transitionInterval = setInterval(() => {
          const bulbId = sequence[currentIndexRef.current];
          changeBulbColor(bulbId, color);
          currentIndexRef.current = (currentIndexRef.current + 1) % sequence.length;

          setTimeout(() => {
            changeBulbColor(bulbId, '#000001');
          }, lightDuration);
        }, transitionTime);

        return () => {
          clearInterval(transitionInterval);
        };
    }, [
      isPlaying,
      sequence,
      currentIndexRef,
      color,
      lightDuration,
      transitionTime,
      changeBulbColor
    ]);

    const handleSequenceChange = (index: number, newBulbId: string) => {
        const newSequence = [...sequence];
        newSequence[index] = newBulbId;
        setSequence(newSequence);
    };

    return (
        <div>
            <h2>Chain Loop Control</h2>
            
            <div style={{ marginBottom: '20px' }}>
                <h3>Sequence Order</h3>
                {sequence.map((bulbId, index) => (
                    <div key={index} style={{ marginBottom: '10px' }}>
                        <label>Step {index + 1}:</label>
                        <select
                            value={bulbId}
                            onChange={(e) => handleSequenceChange(index, e.target.value)}
                        >
                            {selectedBulbs.map((id) => (
                                <option key={id} value={id}>
                                    Bulb {id}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>

            <div style={{ marginBottom: '20px' }}>
                <h3>Timing Controls</h3>
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '10px' }}>
                        Light Duration: {lightDuration}ms
                    </label>
                    <input
                        type="range"
                        value={lightDuration}
                        onChange={(e) => setLightDuration(Number(e.target.value))}
                        min="0"
                        max="1000"
                        step="1"
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '10px' }}>
                        Transition Time: {transitionTime}ms
                    </label>
                    <input
                        type="range"
                        value={transitionTime}
                        onChange={(e) => setTransitionTime(Number(e.target.value))}
                        min="0"
                        max="2000"
                        step="100"
                        style={{ width: '100%' }}
                    />
                </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <button onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? 'Pause' : 'Play'}
                </button>
            </div>
        </div>
    );
};

export default ChainLoop;
