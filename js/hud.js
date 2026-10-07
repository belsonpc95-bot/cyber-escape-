export function getMissionProgress(completedLevels) {
  return Math.max(0, Math.min(5, completedLevels)) * 20;
}
