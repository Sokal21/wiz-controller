import { useChangeBulbColor } from "../../hooks/useChangeBulbColor";
import { BulbsListProps } from "./types"
import classnames from "classnames";

export const BulbsList: React.FC<BulbsListProps> = ({ bulbs, selectedBulbs, onClickBulb }) => {
  const allSelected = bulbs.length > 0 && selectedBulbs.length === bulbs.length;
  const { changeBulbColor } = useChangeBulbColor();


  const identifyBulb = (bulbId: string) => {
    changeBulbColor(bulbId, '#ffffff');
    setTimeout(() => {
      changeBulbColor(bulbId, '#010101');
    }, 100);
  };
  
  const handleSelectAll = () => {
    if (allSelected) {
      // Deselect all bulbs
      bulbs.forEach(bulb => {
        if (selectedBulbs.includes(bulb.id)) {
          onClickBulb(bulb.id);
        }
      });
    } else {
      // Select all bulbs
      bulbs.forEach(bulb => {
        if (!selectedBulbs.includes(bulb.id)) {
          onClickBulb(bulb.id);
        }
      });
    }
  };

  return (
    <div className="card">
      <h2>Available Bulbs</h2>
      {bulbs.length > 0 && (
        <button
          onClick={handleSelectAll}
          className={classnames('mb-4 px-4 py-2 rounded-md', {
            'bg-blue-500': allSelected,
            'bg-[#1a1a1a]': !allSelected,
          })}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      )}
      {bulbs.length === 0 ? (
        <p>No bulbs found. Make sure your bulbs are connected to the network.</p>
      ) : (
        <ul className="flex gap-x-6 justify-center">
          {bulbs.map((bulb) => (
            <li className="bg-gray-700 p-4 rounded-md" key={bulb.id}>
              <strong>ID:</strong> {bulb.id}<br />
              <div className="flex gap-2 mt-2">
                <button 
                  onClick={() => onClickBulb(bulb.id)}
                  className={
                    classnames('px-4 py-2 rounded-md', {
                      'bg-blue-500': selectedBulbs.includes(bulb.id),
                      'bg-[#1a1a1a]': !selectedBulbs.includes(bulb.id),
                    })
                  }
                >
                  {selectedBulbs.includes(bulb.id) ? 'Selected' : 'Select'}
                </button>
                <button
                  onClick={() => identifyBulb(bulb.id)}
                  className="px-4 py-2 rounded-md bg-yellow-500 hover:bg-yellow-600"
                >
                  Identify
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}