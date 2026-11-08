export type ReviewSourceFrameRate = {
  fps: number;
  variable: boolean;
};

const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

export function reviewFrameRateOptions(sourceFps: number | null) {
  if (
    sourceFps === null ||
    !Number.isFinite(sourceFps) ||
    sourceFps < 1 ||
    sourceFps > 1000
  )
    return [];
  // Keep the exact detected cadence, including fractional and uncommon rates.
  // Replace a nearby preset so 24000/1001 doesn't produce two "23.976" entries.
  return [
    ...FRAME_RATES.filter(
      (rate) => rate < sourceFps && Math.abs(rate - sourceFps) > 0.001,
    ),
    sourceFps,
  ];
}

export function formatReviewFrameRate(fps: number) {
  return String(Number(fps.toFixed(3)));
}
