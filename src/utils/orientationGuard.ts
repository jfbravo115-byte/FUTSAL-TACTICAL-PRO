export const shouldShowOrientationOverlay = (
  width: number,
  height: number,
  hasCoarsePointer: boolean,
) => hasCoarsePointer && width > height;
