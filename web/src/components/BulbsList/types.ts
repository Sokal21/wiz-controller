import { Bulb } from "../../hooks/useGetBulbs";

export interface BulbsListProps {
  bulbs: Bulb[];
  selectedBulbs: string[];
  onClickBulb: (bulbId: string) => void;
  onIdentifyBulb: (bulbId: string) => void;
}