import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const curriculum = JSON.parse(
  readFileSync(path.join(__dirname, "..", "data", "curriculum.json"), "utf-8")
);
const dayLookup = new Map(curriculum.days.map((d) => [d.day, d]));

// This is the "thoughtful idea" differentiator: the agent doesn't just pick
// days the candidate completed, it weights toward days where the signals
// suggest shakier understanding (more attempts, or skipped entirely), and
// probes those harder with extra follow-up budget.
//
// weaknessScore heuristic:
//   skipped              -> 5  (never demonstrated the skill at all)
//   attempts >= 4         -> 4
//   attempts == 3         -> 3
//   attempts == 2         -> 2
//   attempts == 1 (or 0)  -> 1  (first-try pass, strong signal)

const MIN_DAYS = 4;
const MIN_QUESTIONS = 8;
const MAX_QUESTIONS_PER_DAY = 3;

function weaknessScore(mission) {
  if (mission.skipped) return 5;
  const attempts = mission.attempts ?? 1;
  if (attempts >= 4) return 4;
  if (attempts === 3) return 3;
  if (attempts === 2) return 2;
  return 1;
}

function questionBudget(score) {
  // Weak topics get more follow-up room, strong topics get a quick check.
  if (score >= 4) return 3;
  if (score >= 2) return 2;
  return 1;
}

/**
 * Builds an ordered interview plan for a candidate.
 * Mixes weak-signal days (probed harder) with a couple of strong-signal
 * days (probed lightly), so the interview covers breadth as well as depth.
 */
export function buildPlan(candidate) {
  const missions = candidate.missions || [];

  const scored = missions
    .map((m) => ({
      day: m.day,
      title: m.title,
      skipped: !!m.skipped,
      attempts: m.attempts ?? 0,
      passed: m.passed ?? false,
      score: weaknessScore(m),
    }))
    .sort((a, b) => b.score - a.score);

  // Take enough days to guarantee >= MIN_DAYS and >= MIN_QUESTIONS total budget,
  // leading with the weakest signals first.
  const plan = [];
  let totalQuestions = 0;

  for (const item of scored) {
    if (plan.length >= 8) break; // sanity cap, don't let interviews run forever
    const budget = Math.min(questionBudget(item.score), MAX_QUESTIONS_PER_DAY);
    const curriculumDay = dayLookup.get(item.day);
    plan.push({
      day: item.day,
      title: item.title,
      skipped: item.skipped,
      attempts: item.attempts,
      weaknessScore: item.score,
      questionBudget: budget,
      questionsAsked: 0,
      tools: curriculumDay?.tools || [],
      objectives: curriculumDay?.objectives || [],
    });
    totalQuestions += budget;

    if (plan.length >= MIN_DAYS && totalQuestions >= MIN_QUESTIONS) break;
  }

  // Edge case: candidate has fewer than MIN_DAYS missions total. Use what exists.
  return plan;
}

export function currentTopic(plan, index) {
  return plan[index] || null;
}
