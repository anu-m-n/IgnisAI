import { Router } from "express";
import { getSession, createSession, updateSession } from "./store.js";
import { startInterview, handleTurn, forceConcludeInterview, calculateSessionStats } from "./interviewEngine.js";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidatesData = JSON.parse(
  readFileSync(path.join(__dirname, "..", "data", "candidates.json"), "utf-8")
).candidates;

const router = Router();

router.get("/candidates", (req, res) => {
  res.json(candidatesData);
});

// POST /api/interview
// Handles both "start" (sessionId + candidate), "turn" (sessionId + message),
// and "conclude" (sessionId + conclude: true) requests.
router.post("/interview", async (req, res) => {
  const { sessionId, candidate, message, conclude } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    const existing = getSession(sessionId);

    // --- Conclude Interview Early ---
    if (conclude) {
      if (!existing) {
        return res.status(400).json({ error: "No session found to conclude" });
      }
      if (existing.done) {
        return res.json({
          reply: "This interview has already been completed.",
          done: true,
          feedback: existing.feedback,
          stats: existing.stats,
        });
      }

      const result = await forceConcludeInterview(existing);
      updateSession(sessionId, result.state);
      return res.json({
        reply: result.reply,
        done: true,
        feedback: result.feedback,
        stats: result.state.stats,
      });
    }

    // --- Start Interview ---
    if (!existing) {
      if (!candidate) {
        return res.status(400).json({
          error: "No session found for this sessionId, and no 'candidate' was provided to start one",
        });
      }

      const { state, reply } = await startInterview(candidate);
      createSession(sessionId, state);
      const stats = calculateSessionStats(state);
      return res.json({ reply, done: false, plan: state.plan, currentIndex: state.currentIndex, stats, difficulty: state.difficulty, difficultyHistory: state.difficultyHistory });
    }

    // --- Conversation Turn ---
    if (existing.done) {
      return res.json({
        reply: "This interview has already been completed.",
        done: true,
        feedback: existing.feedback,
        stats: existing.stats,
      });
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "message is required to continue an in-progress interview" });
    }

    const result = await handleTurn(existing, message);
    updateSession(sessionId, result.state);

    const stats = calculateSessionStats(result.state);

    if (result.done) {
      return res.json({
        reply: result.reply,
        conceptExplanation: result.conceptExplanation,
        done: true,
        feedback: result.feedback,
        analysis: result.analysis,
        stats,
        difficulty: result.state.difficulty,
        difficultyHistory: result.state.difficultyHistory,
      });
    }

    return res.json({
      reply: result.reply,
      conceptExplanation: result.conceptExplanation,
      done: false,
      analysis: result.analysis,
      plan: result.state.plan,
      currentIndex: result.state.currentIndex,
      stats,
      difficulty: result.state.difficulty,
      difficultyHistory: result.state.difficultyHistory,
    });
  } catch (err) {
    console.error("Interview error:", err);
    return res.status(500).json({
      error: "Something went wrong running the interview.",
      details: err.message,
    });
  }
});

export default router;
