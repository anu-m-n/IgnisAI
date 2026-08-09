export function classifyDuration(durationMs) {
  if (durationMs < 3000) {
    return "suspiciously-fast";
  } else if (durationMs <= 120000) {
    return "normal";
  } else {
    return "slow";
  }
}

export function timingLabel(classification) {
  switch (classification) {
    case "suspiciously-fast":
      return "Answered very quickly";
    case "normal":
      return "Normal pace";
    case "slow":
      return "Took a while to respond";
    default:
      return "Normal pace";
  }
}
