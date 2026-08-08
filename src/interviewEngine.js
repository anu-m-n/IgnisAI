import { buildPlan } from "./planBuilder.js";
import { callLLM } from "./llm/index.js";
import { openingSystemPrompt, turnDecisionSystemPrompt, feedbackSystemPrompt } from "./promptBuilder.js";
import { parseJsonLoose } from "./util.js";

export function calculateSessionStats(session) {
  const plan = session.plan || [];
  const transcript = session.transcript || [];
  const evaluations = session.evaluations || [];

  const totalQuestions = plan.reduce((sum, p) => sum + p.questionBudget, 0);
  const questionsAnswered = transcript.filter(t => t.role === "user").length;
  const questionsSkipped = Math.max(0, totalQuestions - questionsAnswered);

  const completionPercentage = Math.round((questionsAnswered / totalQuestions) * 100);

  const evaluatedCount = evaluations.length;
  let technicalScore = 0;
  if (evaluatedCount > 0) {
    const totalPoints = evaluations.reduce((sum, val) => {
      if (val === "Correct") return sum + 100;
      if (val === "Partial") return sum + 50;
      return sum;
    }, 0);
    technicalScore = Math.round(totalPoints / evaluatedCount);
  }

  // Duration
  const startTime = session.startTime || Date.now();
  const durationMs = Date.now() - startTime;
  const mins = Math.floor(durationMs / 60000);
  const secs = Math.round((durationMs % 60000) / 1000);
  const durationStr = `${mins}m ${secs}s`;

  // Status mapping
  let status = "In Progress";
  if (session.done) {
    const isCompletedPlan = completionPercentage >= 95;
    if (isCompletedPlan) {
      status = technicalScore >= 60 ? "Passed" : "Failed";
    } else {
      status = technicalScore >= 50 ? "Incomplete" : "Failed";
    }
  }

  return {
    totalQuestions,
    questionsAnswered,
    questionsSkipped,
    completionPercentage,
    technicalScore,
    durationStr,
    status
  };
}

export async function startInterview(candidate) {
  const plan = buildPlan(candidate);
  if (plan.length === 0) {
    throw new Error("Candidate has no missions to build an interview plan from");
  }

  const systemPrompt = openingSystemPrompt(candidate, plan);
  const opening = await callLLM({
    systemPrompt,
    messages: [{ role: "user", content: "Begin the interview now." }],
    maxTokens: 1024,
  });

  plan[0].questionsAsked = 1;

  const transcript = [{ role: "assistant", content: opening.trim() }];

  return {
    state: {
      candidate,
      plan,
      currentIndex: 0,
      transcript,
      done: false,
      startTime: Date.now(),
      evaluations: [],
    },
    reply: opening.trim(),
  };
}

export async function handleTurn(session, candidateMessage) {
  const { candidate, plan } = session;
  let currentIndex = session.currentIndex;
  const transcript = [...session.transcript, { role: "user", content: candidateMessage }];

  const currentTopic = plan[currentIndex];

  const decisionPrompt = turnDecisionSystemPrompt({
    candidate,
    plan,
    currentTopic,
    questionsAskedForTopic: currentTopic.questionsAsked,
    transcript,
  });

  const raw = await callLLM({
    systemPrompt: decisionPrompt,
    messages: [{ role: "user", content: "Decide the next move and respond with the JSON object only." }],
    maxTokens: 1024,
  });

  console.log("--- DEBUG RAW LLM RESPONSE ---");
  console.log(raw);
  console.log("------------------------------");

  const decision = parseJsonLoose(raw);

  const analysis = decision.analysis || {
    correctness: decision.action === "follow_up" ? "Partial" : "Correct",
    misconception: "none",
    decision: decision.action === "follow_up" ? "Deeper follow-up" : "Next topic transition",
    reasoning: decision.reasoning || "Proceeding with pedagogical flow"
  };

  if (analysis) {
    if (typeof analysis.updatedWeaknessScore === 'number') {
      currentTopic.weaknessScore = Math.max(1, Math.min(5, analysis.updatedWeaknessScore));
    } else {
      if (analysis.correctness === "Correct") {
        currentTopic.weaknessScore = Math.max(1, currentTopic.weaknessScore - 1);
      } else if (analysis.correctness === "Incorrect") {
        currentTopic.weaknessScore = Math.min(5, currentTopic.weaknessScore + 1);
      }
    }
  }

  const evaluations = [...(session.evaluations || []), analysis.correctness];

  if (decision.action === "follow_up") {
    currentTopic.questionsAsked += 1;
    transcript.push({ role: "assistant", content: decision.question });
    return {
      state: { ...session, plan, currentIndex, transcript, done: false, evaluations },
      reply: decision.question,
      done: false,
      analysis,
    };
  }

  // Move to next topic (or budget exhausted, forced move).
  const nextIndex = currentIndex + 1;

  if (nextIndex >= plan.length) {
    // Interview complete — generate final feedback.
    transcript.push({ role: "assistant", content: decision.question });

    const stats = calculateSessionStats({ ...session, plan, transcript, evaluations, done: true });

    const feedbackPrompt = feedbackSystemPrompt({ candidate, plan, transcript, stats });
    const feedbackRaw = await callLLM({
      systemPrompt: feedbackPrompt,
      messages: [{ role: "user", content: "Write the final feedback JSON now." }],
      maxTokens: 2048,
    });
    const feedback = parseJsonLoose(feedbackRaw);

    if (feedback.consistencyScore) {
      stats.consistencyScore = feedback.consistencyScore;
    }

    return {
      state: { ...session, plan, currentIndex, transcript, done: true, evaluations, stats },
      reply: decision.question || "Interview completed.",
      done: true,
      feedback,
      analysis,
    };
  }

  plan[nextIndex].questionsAsked = 1;
  transcript.push({ role: "assistant", content: decision.question });

  return {
    state: { ...session, plan, currentIndex: nextIndex, transcript, done: false, evaluations },
    reply: decision.question,
    done: false,
    analysis,
  };
}

export async function forceConcludeInterview(session) {
  const { candidate, plan, transcript, evaluations } = session;

  const stats = calculateSessionStats({ ...session, done: true });

  const feedbackPrompt = feedbackSystemPrompt({ candidate, plan, transcript, stats });
  const feedbackRaw = await callLLM({
    systemPrompt: feedbackPrompt,
    messages: [{ role: "user", content: "Write the final feedback JSON now." }],
    maxTokens: 2048,
  });
  const feedback = parseJsonLoose(feedbackRaw);

  const finalStats = calculateSessionStats({ ...session, done: true, evaluations });
  if (feedback.consistencyScore) {
    finalStats.consistencyScore = feedback.consistencyScore;
  }

  return {
    state: { ...session, done: true, feedback, stats: finalStats, evaluations },
    reply: "Interview concluded early by candidate request.",
    done: true,
    feedback,
  };
}
