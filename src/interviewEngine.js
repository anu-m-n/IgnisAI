import { buildPlan } from "./planBuilder.js";
import { callLLM } from "./llm/index.js";
import { openingSystemPrompt, turnDecisionSystemPrompt, feedbackSystemPrompt } from "./promptBuilder.js";
import { INITIAL_DIFFICULTY, nextDifficulty } from "./difficultyEngine.js";
import { classifyDuration, timingLabel } from "./timingTracker.js";
import { parseJsonLoose } from "./util.js";

export function isDontKnow(message) {
  if (!message) return false;
  const msg = message.toLowerCase().trim().replace(/['’"”]/g, "").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
  const phrases = [
    "i dont know",
    "i dont know this",
    "i have no idea",
    "im not sure",
    "i cant answer that",
    "i dont remember",
    "no idea",
    "i havent learned this",
    "dont know",
    "not sure",
    "no clue",
    "cant remember",
    "i do not know",
    "i do not know this",
    "i can not answer that",
    "i have not learned this",
    "no",
    "nay",
    "nope",
    "not really",
    "i dont have experience with this",
    "i dont have experience",
    "i haven't worked with this",
    "i havent worked with this",
    "i haven't worked with it",
    "i havent worked with it",
    "never used it",
    "never worked with it"
  ];
  return phrases.some(p => msg === p || msg.includes(p));
}

export function calculateSessionStats(session) {
  const plan = session.plan || [];
  const transcript = session.transcript || [];
  const evaluations = session.evaluations || [];

  const totalQuestions = plan.reduce((sum, p) => sum + p.questionBudget, 0);
  const questionsAnswered = transcript.filter(t => t.role === "user").length;
  const questionsSkipped = Math.max(0, totalQuestions - questionsAnswered);

  const completionPercentage = totalQuestions > 0
    ? Math.round((questionsAnswered / totalQuestions) * 100)
    : 0;

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

/**
 * Deterministically calculate final score from actual evaluation data.
 * This overrides whatever the LLM returns to prevent hallucinated scores.
 */
export function calcFinalScore(stats) {
  if (!stats || stats.questionsAnswered === 0) return 0;

  const techScore = stats.technicalScore;       // 0-100, based only on correct/partial/incorrect evaluations
  const completion = stats.completionPercentage; // 0-100

  // Apply completion penalty: incomplete interviews score lower
  if (completion >= 90) return techScore;
  if (completion >= 70) return Math.round(techScore * 0.90);
  if (completion >= 50) return Math.round(techScore * 0.78);
  if (completion >= 30) return Math.round(techScore * 0.60);
  if (completion >= 10) return Math.round(techScore * 0.40);
  return Math.round(techScore * 0.20);
}

/**
 * Override the LLM-generated feedback fields with programmatically correct values.
 * The LLM frequently hallucinates scores (e.g. always returning 85).
 * We trust our own evaluation data over the LLM's number.
 */
export function overrideFeedbackScore(feedback, stats) {
  const score = calcFinalScore(stats);

  feedback.overallScore = score;

  if (score >= 80) feedback.scoreLabel = "Excellent Performance";
  else if (score >= 60) feedback.scoreLabel = "Satisfactory Performance";
  else if (score >= 40) feedback.scoreLabel = "Needs Improvement";
  else feedback.scoreLabel = "Unsatisfactory Performance";

  if (score >= 75) feedback.recommendation = "Recommended";
  else if (score >= 50) feedback.recommendation = "Maybe Recommended";
  else feedback.recommendation = "Not Recommended";

  return feedback;
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
      missedConcepts: [],
      difficulty: INITIAL_DIFFICULTY,
      difficultyHistory: [INITIAL_DIFFICULTY],
    },
    reply: opening.trim(),
  };
}

export function generateNextTopicQuestion(candidate, nextTopic) {
  const m = candidate.member || {};
  const role = m.jobRole || "Engineer";
  const name = m.name || "Candidate";
  const title = nextTopic.title;

  if (title.includes("Embeddings")) {
    return `Let's move to our next module: "Embeddings Explained". As a ${role}, how would you approach converting textual data into vector embeddings, and what semantic search benefits does that provide?`;
  }
  if (title.includes("Vector Databases")) {
    return `Let's transition to "Vector Databases Overview". In your projects, how would you store and query high-dimensional vectors, and what vector database index configurations (like HNSW) are relevant?`;
  }
  if (title.includes("Retrieval") || title.includes("Matching")) {
    return `Let's shift focus to "Retrieval & Matching Engine". When building a retrieval system, how do you handle similarity queries, and what strategies do you use for chunking and overlap parameters?`;
  }
  if (title.includes("Prompt Engineering")) {
    return `Let's move to "Prompt Engineering Fundamentals". For a production classification task, how do you design system prompts, and what is the difference between zero-shot and few-shot prompting?`;
  }
  if (title.includes("MCP") || title.includes("Model Context")) {
    return `Let's transition to "Model Context Protocol (MCP)". How do you use the MCP framework to connect LLMs to external data sources, tools, and servers?`;
  }
  if (title.includes("Multi-Agent") || title.includes("Agent")) {
    return `Let's move to "Multi-Agent Orchestration". How do you orchestrate multiple agents collaborating on a task, and how do you design state machines or routing rules using tools like LangGraph?`;
  }
  if (title.includes("Docker") || title.includes("Kubernetes") || title.includes("Deployment")) {
    return `Let's transition to "Docker & Kubernetes Deployment". As a ${role}, how do you containerize your microservices, and how do you configure deployment manifests, replicas, and pod scheduling?`;
  }
  if (title.includes("Monitoring") || title.includes("Logging") || title.includes("Observability")) {
    return `Let's move to "Monitoring, Logging & Observability". How do you instrument your backend for logging and telemetry metrics, and what tools (like Prometheus or Grafana) do you use to trace latency?`;
  }
  if (title.includes("API") || title.includes("Backend") || title.includes("Integration")) {
    return `Let's transition to "Chatbot Backend & API Integration". How do you integrate an LLM streaming response into an Express or Node.js backend API, and what error-handling parameters do you configure?`;
  }
  return `Let's transition to "${title}". From your background in ${role}, how have you worked with this, and what is your overall approach?`;
}

export async function handleTurn(session, candidateMessage, answerDurationMs) {
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
    difficulty: session.difficulty ?? INITIAL_DIFFICULTY,
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

  const timing = answerDurationMs != null
    ? { durationMs: answerDurationMs, classification: classifyDuration(answerDurationMs), label: timingLabel(classifyDuration(answerDurationMs)) }
    : null;
  analysis.timing = timing;

  // Safeguard Override for "I don't know" / "No" / lack of knowledge answers
  if (isDontKnow(candidateMessage)) {
    analysis.correctness = "Incorrect";
    analysis.responseClassification = "DOES_NOT_KNOW";
    analysis.updatedWeaknessScore = 5;
    
    // Immediately transition to next topic!
    const nextTopic = plan[currentIndex + 1];
    decision.action = "next_topic";
    decision.decision = "Next topic transition";
    if (nextTopic) {
      decision.question = generateNextTopicQuestion(candidate, nextTopic);
    } else {
      decision.decision = "Interview completion";
      decision.question = `Thank you, ${candidate.member?.name || 'Candidate'}. Those were all the questions I had for today.`;
    }
  }

  // Safeguard: Budget exhaustion or repeated failure override
  const isWeakAnswer = analysis.correctness === "Incorrect" || analysis.correctness === "Partial" || analysis.responseClassification === "VAGUE" || analysis.responseClassification === "NEEDS_VERIFICATION";
  if (decision.action === "follow_up") {
    // If budget is exhausted OR if we have asked 2 or more questions on this topic and candidate struggles, transition immediately!
    if (currentTopic.questionsAsked >= currentTopic.questionBudget || (currentTopic.questionsAsked >= 2 && isWeakAnswer)) {
      const nextTopic = plan[currentIndex + 1];
      decision.action = "next_topic";
      decision.decision = "Next topic transition";
      if (nextTopic) {
        decision.question = generateNextTopicQuestion(candidate, nextTopic);
      } else {
        decision.decision = "Interview completion";
        decision.question = `Thank you, ${candidate.member?.name || 'Candidate'}. Those were all the questions I had for today.`;
      }
    }
  }

  // Avoid duplicate questions by checking transcript history
  const askedQuestions = transcript.filter(t => t.role === "assistant").map(t => t.content.toLowerCase().trim());
  if (decision.question && askedQuestions.includes(decision.question.toLowerCase().trim())) {
    decision.question = decision.question + " Additionally, could you share a practical project scenario where you applied this?";
  }

  if (analysis) {
    if (typeof analysis.updatedWeaknessScore === 'number' || isDontKnow(candidateMessage)) {
      currentTopic.weaknessScore = isDontKnow(candidateMessage) ? 5 : Math.max(1, Math.min(5, analysis.updatedWeaknessScore));
    } else {
      if (analysis.correctness === "Correct") {
        currentTopic.weaknessScore = Math.max(1, currentTopic.weaknessScore - 1);
      } else if (analysis.correctness === "Incorrect") {
        currentTopic.weaknessScore = Math.min(5, currentTopic.weaknessScore + 1);
      }
    }
  }

  const conceptExplanation = (decision.conceptExplanation && decision.conceptExplanation !== "none")
    ? decision.conceptExplanation
    : null;

  const missedConcepts = [...(session.missedConcepts || [])];
  if ((analysis.correctness === "Incorrect" || analysis.correctness === "Partial") && conceptExplanation) {
    missedConcepts.push({
      topic: currentTopic.title,
      question: decision.question || "Topic question",
      candidateAnswer: candidateMessage,
      concept: decision.missedConceptSummary || analysis.misconception || currentTopic.title,
      explanation: conceptExplanation,
    });
  }

  const difficulty = nextDifficulty(session.difficulty ?? INITIAL_DIFFICULTY, analysis.correctness);
  const evaluations = [...(session.evaluations || []), analysis.correctness];

  if (decision.action === "follow_up") {
    currentTopic.questionsAsked += 1;
    transcript.push({ role: "assistant", content: decision.question });
    return {
      state: {
        ...session,
        plan,
        currentIndex,
        transcript,
        done: false,
        evaluations,
        missedConcepts,
        difficulty,
        difficultyHistory: [...(session.difficultyHistory || []), difficulty],
      },
      reply: decision.question,
      conceptExplanation,
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

    const feedbackPrompt = feedbackSystemPrompt({ candidate, plan, transcript, stats, missedConcepts });
    const feedbackRaw = await callLLM({
      systemPrompt: feedbackPrompt,
      messages: [{ role: "user", content: "Write the final feedback JSON now." }],
      maxTokens: 2048,
    });
    const feedback = parseJsonLoose(feedbackRaw);

    if (!feedback.missedConcepts || feedback.missedConcepts.length === 0) {
      feedback.missedConcepts = missedConcepts;
    }

    // IMPORTANT: Override LLM score with deterministic calculation from actual evaluations
    // The LLM frequently hallucinates scores regardless of prompt instructions
    overrideFeedbackScore(feedback, stats);

    if (feedback.consistencyScore) {
      stats.consistencyScore = feedback.consistencyScore;
    }

    return {
      state: {
        ...session,
        plan,
        currentIndex,
        transcript,
        done: true,
        evaluations,
        missedConcepts,
        stats,
        difficulty,
        difficultyHistory: [...(session.difficultyHistory || []), difficulty],
      },
      reply: decision.question || "Interview completed.",
      conceptExplanation,
      done: true,
      feedback,
      analysis,
    };
  }

  plan[nextIndex].questionsAsked = 1;
  transcript.push({ role: "assistant", content: decision.question });

  return {
    state: {
      ...session,
      plan,
      currentIndex: nextIndex,
      transcript,
      done: false,
      evaluations,
      missedConcepts,
      difficulty,
      difficultyHistory: [...(session.difficultyHistory || []), difficulty],
    },
    reply: decision.question,
    conceptExplanation,
    done: false,
    analysis,
  };
}

export async function forceConcludeInterview(session) {
  const { candidate, plan, transcript, evaluations, missedConcepts = [] } = session;

  const stats = calculateSessionStats({ ...session, done: true });

  const feedbackPrompt = feedbackSystemPrompt({ candidate, plan, transcript, stats, missedConcepts });
  const feedbackRaw = await callLLM({
    systemPrompt: feedbackPrompt,
    messages: [{ role: "user", content: "Write the final feedback JSON now." }],
    maxTokens: 2048,
  });
  const feedback = parseJsonLoose(feedbackRaw);

  if (!feedback.missedConcepts || feedback.missedConcepts.length === 0) {
    feedback.missedConcepts = missedConcepts;
  }

  const finalStats = calculateSessionStats({ ...session, done: true, evaluations });

  // IMPORTANT: Override LLM score with deterministic calculation from actual evaluations
  overrideFeedbackScore(feedback, finalStats);

  if (feedback.consistencyScore) {
    finalStats.consistencyScore = feedback.consistencyScore;
  }

  return {
    state: { ...session, done: true, feedback, stats: finalStats, evaluations, missedConcepts },
    reply: "Interview concluded early by candidate request.",
    done: true,
    feedback,
    stats: finalStats,
  };
}
