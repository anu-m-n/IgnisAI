// Quick manual smoke test — drives one full interview end to end against a
// locally running server (npm start) using one real candidate from
// data/candidates.json. Not a unit test framework, just a fast sanity check.
//
// Usage: node test/manual-test.js [candidateIndex]

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidates = JSON.parse(
  readFileSync(path.join(__dirname, "..", "data", "candidates.json"), "utf-8")
).candidates;

const idx = Number(process.argv[2] || 0);
const candidate = candidates[idx];
const sessionId = `test-${Date.now()}`;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function post(body) {
  const res = await fetch(`${BASE_URL}/api/interview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log(`Interviewing: ${candidate.member.name} (${candidate.member.jobRole})\n`);

  let result = await post({ sessionId, candidate });
  console.log("INTERVIEWER:", result.reply, "\n");

  let turns = 0;
  const MAX_TURNS = 30; // safety cap

  while (!result.done && turns < MAX_TURNS) {
    const fakeAnswer =
      "I'd approach it by breaking the problem down, considering trade-offs, and validating with tests. " +
      "In practice I've run into edge cases around scale and had to adjust my approach.";
    console.log("CANDIDATE:", fakeAnswer, "\n");

    // Add a delay to respect Gemini API rate limits (max 15 requests per minute)
    await new Promise((resolve) => setTimeout(resolve, 4000));

    result = await post({ sessionId, message: fakeAnswer });
    if (result.analysis) {
      console.log(`[ANALYSIS] Correctness: ${result.analysis.correctness} | Misconception: ${result.analysis.misconception} | Decision: ${result.analysis.decision}`);
    }
    console.log("INTERVIEWER:", result.reply, "\n");
    turns += 1;
  }

  if (result.done) {
    console.log("=== FEEDBACK ===");
    console.log(JSON.stringify(result.feedback, null, 2));
    console.log("=== STATS ===");
    console.log(JSON.stringify(result.stats, null, 2));
  } else {
    console.log("Hit MAX_TURNS safety cap without the interview concluding — check the engine's loop logic.");
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
