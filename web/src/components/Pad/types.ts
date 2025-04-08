export interface PadProps {
    onPadPress: (color: string) => void;
    timeout: number;
    setTimeout: (timeout: number) => void;
}