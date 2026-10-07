const HISTORY = 8;
const MIN_INTERVAL_MS = 250; // 240 BPM
const MAX_INTERVAL_MS = 2_000; // 30 BPM

/** Counts beats and estimates the tempo from the gaps between the last few. */
export class BeatTracker {
  count = 0;
  /** Time of the last beat in ms, or -Infinity before the first one. */
  lastAt = -Infinity;
  private intervals: number[] = [];

  beat(now: number): void {
    const interval = now - this.lastAt;

    if (interval > MAX_INTERVAL_MS) {
      // The music stopped or this is the first beat: old gaps say nothing about the new tempo.
      this.intervals = [];
    } else if (interval >= MIN_INTERVAL_MS) {
      this.intervals.push(interval);
      if (this.intervals.length > HISTORY) this.intervals.shift();
    }

    this.count += 1;
    this.lastAt = now;
  }

  get bpm(): number | null {
    if (this.intervals.length < 2) return null;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
    return Math.round(60_000 / median);
  }
}
