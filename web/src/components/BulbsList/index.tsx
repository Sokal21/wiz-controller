import { BulbsListProps } from "./types"
import classnames from "classnames";

export const BulbsList: React.FC<BulbsListProps> = ({ bulbs, selectedBulbs, onClickBulb }) => {
  return (
    <div className="card">
    <h2>Available Bulbs</h2>
    {bulbs.length === 0 ? (
      <p>No bulbs found. Make sure your bulbs are connected to the network.</p>
    ) : (
      <ul className="flex gap-x-6 justify-center">
        {bulbs.map((bulb) => (
          <li className="bg-gray-700 p-4 rounded-md" key={bulb.id}>
            <strong>ID:</strong> {bulb.id}<br />
            <button 
              onClick={() => onClickBulb(bulb.id)}
              className={
                classnames({
                  'mt-2': true,
                  'bg-blue-500': selectedBulbs.includes(bulb.id),
                  'bg-[#1a1a1a]': !selectedBulbs.includes(bulb.id),
                })
              }
            >
              {selectedBulbs.includes(bulb.id) ? 'Selected' : 'Select'}
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
  )
}