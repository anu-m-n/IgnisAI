import { Router } from "express";
import { getSession, createSession, updateSession } from "./store.js";
import { startInterview, handleTurn, forceConcludeInterview, calculateSessionStats } from "./interviewEngine.js";
import { readFileSync, writeFileSync } from "fs";
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

router.post("/candidates", (req, res) => {
  const { name, jobRole, yearsExperience, education, skills, projects, resumeInfo } = req.body || {};
  if (!name || !jobRole) {
    return res.status(400).json({ error: "Candidate Name and Target Role are required" });
  }

  // Generate Candidate ID CAND-XXX
  const maxNum = candidatesData.reduce((max, c) => {
    const match = c.member?.id?.match(/CAND-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }
    return max;
  }, 0);
  const nextId = `CAND-${String(maxNum + 1).padStart(3, '0')}`;

  // Generate Session ID
  const randNum = Math.floor(10000 + Math.random() * 90000);
  const nextSessionId = `IGNIS-INT-${randNum}`;

  const skillsArr = Array.isArray(skills) ? skills : (skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : []);
  const projectsArr = Array.isArray(projects) ? projects : (projects ? projects.split(',').map(p => p.trim()).filter(Boolean) : []);

  const newCandidate = {
    member: {
      id: nextId,
      name,
      jobRole,
      yearsExperience: Number(yearsExperience) || 0,
      education: education || "",
      status: "COMPLETED"
    },
    sessionId: nextSessionId,
    missions: [
      { "day": 7, "title": "Embeddings Explained", "passed": true, "attempts": 1 },
      { "day": 8, "title": "Vector Databases Overview", "passed": true, "attempts": 1 },
      { "day": 10, "title": "Retrieval & Matching Engine", "passed": true, "attempts": 1 },
      { "day": 12, "title": "Prompt Engineering Fundamentals", "passed": true, "attempts": 1 },
      { "day": 16, "title": "Chatbot Backend & API Integration", "passed": true, "attempts": 1 },
      { "day": 22, "title": "Multi-Agent Orchestration", "passed": true, "attempts": 1 },
      { "day": 23, "title": "Model Context Protocol (MCP)", "passed": true, "attempts": 1 },
      { "day": 28, "title": "Docker & Kubernetes Deployment", "passed": true, "attempts": 1 },
      { "day": 29, "title": "Monitoring, Logging & Observability", "passed": true, "attempts": 1 },
      { "day": 31, "title": "Capstone Project & Final Demo", "passed": true, "attempts": 1 }
    ],
    signals: {
      commitDays: 20,
      missionsCompleted: 10,
      missionsFirstTry: 10
    },
    skills: skillsArr,
    projects: projectsArr,
    resumeInfo: resumeInfo || ""
  };

  candidatesData.push(newCandidate);

  try {
    const filePath = path.join(__dirname, "..", "data", "candidates.json");
    writeFileSync(filePath, JSON.stringify({ candidates: candidatesData }, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist new candidate:", err);
  }

  res.json(newCandidate);
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
