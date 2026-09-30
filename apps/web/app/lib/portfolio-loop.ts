// Wrap before assigning scrollLeft: browsers clamp negative offsets to zero.
export function wrapLoopPosition(position: number, loopWidth: number) {
  if (loopWidth <= 0) return 0;
  return ((position % loopWidth) + loopWidth) % loopWidth;
}
