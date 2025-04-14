export const getOffColor = (color: string) => {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    if (r >= g && r >= b) return '#010000';
    if (g >= r && g >= b) return '#000100';
    return '#000001';
};