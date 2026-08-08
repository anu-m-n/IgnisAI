export const INITIAL_DIFFICULTY = 3;

export function nextDifficulty(currentDifficulty, correctness) {
  if (correctness === "Correct") {
    return Math.min(5, currentDifficulty + 1);
  } else if (correctness === "Incorrect") {
    return Math.max(1, currentDifficulty - 1);
  } else if (correctness === "Partial") {
    return currentDifficulty;
  }
  return currentDifficulty;
}

export function difficultyLabel(level) {
  switch (level) {
    case 1:
      return "foundational/definitional — ask something a beginner could answer";
    case 2:
      return "basic applied — simple practical scenario";
    case 3:
      return "standard applied — realistic scenario requiring solid understanding";
    case 4:
      return "advanced — requires nuanced tradeoff reasoning";
    case 5:
      return "expert/edge-case — probe edge cases, failure modes, or design tradeoffs";
    default:
      return "standard applied — realistic scenario requiring solid understanding";
  }
}
