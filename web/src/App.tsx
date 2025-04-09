import { useState } from 'react';
import { useGetBulbs } from './hooks/useGetBulbs';
import { BulbsList } from './components/BulbsList';
import { Controller } from './components/Controller';

import './App.css';

function App() {
  const { bulbs } = useGetBulbs();
  const [selectedBulbs, setSelectedBulbs] = useState<string[]>([]);


  const toggleBulbSelection = (bulbId: string) => {
    setSelectedBulbs((prev) => {
      if (prev.includes(bulbId)) {
        return prev.filter((id) => id !== bulbId);
      } else {
        return [...prev, bulbId];
      }
    });
  };

  return (
    <>
      <h1>Wiz Bulb Controller</h1>
      <BulbsList 
        bulbs={bulbs} 
        selectedBulbs={selectedBulbs} 
        onClickBulb={toggleBulbSelection} 
      />
      <Controller
        selectedBulbs={selectedBulbs}
      />
    </>
  );
}

export default App;
