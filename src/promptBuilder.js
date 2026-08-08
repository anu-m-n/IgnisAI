import { difficultyLabel } from "./difficultyEngine.js";

function candidateSummary(candidate) {
  const m = candidate.member || {};
  
  // Calculate skills, technologies, weak areas
  const roleSkills = {
    "AI Engineer": "LLMs, RAG, Python, Prompting, Multi-Agent Systems",
    "Data Engineer": "Data Pipelines, ETL, Spark, SQL, Big Data",
    "Senior Data Engineer": "Data Pipelines, ETL, Spark, SQL, Observability",
    "Backend Software Engineer": "Node.js, Express, SQL, API Integration, Docker",
    "DevOps Engineer": "CI/CD, Kubernetes, Docker, Terraform, Telemetry",
    "Architect": "Cloud Architecture, System Design, Security, Scalability",
    "Business Analyst": "Requirement Elicitation, Agile, SQL, Data Analysis"
  };
  const primarySkills = roleSkills[m.jobRole] || "Software Engineering, Python, Git";

  const tech = [];
  (candidate.missions || []).forEach(miss => {
    if (miss.passed) {
      if (miss.title.includes("Embeddings") || miss.title.includes("Vector")) tech.push("ChromaDB", "pgvector");
      if (miss.title.includes("Retrieval") || miss.title.includes("RAG")) tech.push("LangChain", "LlamaIndex");
      if (miss.title.includes("API") || miss.title.includes("Backend")) tech.push("FastAPI", "REST");
      if (miss.title.includes("Docker") || miss.title.includes("Deployment")) tech.push("Docker", "Kubernetes");
      if (miss.title.includes("MCP")) tech.push("MCP");
      if (miss.title.includes("Agent") || miss.title.includes("Orchestration")) tech.push("LangGraph");
    }
  });
  const keyTechnologies = [...new Set(tech)].slice(0, 4).join(", ") || "Python, Git";

  const weak = [];
  (candidate.missions || []).forEach(miss => {
    if (miss.skipped) {
      weak.push(`${miss.title} (Skipped)`);
    } else if (miss.attempts >= 4) {
      weak.push(`${miss.title} (${miss.attempts} tries)`);
    }
  });
  const weakAreas = weak.length > 0 ? weak.join(", ") : "None detected";

  const missionsSummary = (candidate.missions || []).map(miss => {
    return `- ${miss.title}: ${miss.skipped ? "Skipped" : `Passed in ${miss.attempts} attempt(s)`}`;
  }).join("\n");

  return `Name: ${m.name}
Role: ${m.jobRole}
Experience: ${m.yearsExperience} years
Education: ${m.education}
Primary Skills: ${primarySkills}
Key Technologies: ${keyTechnologies}
Current Weak Areas: ${weakAreas}
Missions Curriculum History:
${missionsSummary}`;
}

function planSummary(plan) {
  return plan
    .map((p) => {
      const objectives = (p.objectives || []).slice(0, 4).map((o) => `    • ${o}`).join("\n");
      return `- Day ${p.day}: "${p.title}" | signal: ${
        p.skipped ? "SKIPPED (never demonstrated)" : `${p.attempts} attempt(s) to pass`
      } | weakness score ${p.weaknessScore}/5 | question budget: ${p.questionBudget}
  Tools: ${(p.tools || []).join(", ") || "n/a"}
  What this day actually taught:
${objectives}`;
    })
    .join("\n\n");
}

export function openingSystemPrompt(candidate, plan) {
  return `You are a warm, sharp technical interviewer conducting a spoken-style interview for an AI/ML cohort graduate.

CANDIDATE
${candidateSummary(candidate)}

INTERVIEW PLAN (in order, do not deviate from this topic order)
${planSummary(plan)}

DYNAMIC QUESTION GENERATION RULES
- Do NOT use pre-planned, static, or canned questions.
- Dynamically frame your first question to match the candidate's applied position (${candidate.member?.jobRole || 'Engineer'}), their experience level (${candidate.member?.yearsExperience || 0} years), and the first topic in the plan.
- Ask exactly ONE question at a time. Never bundle multiple questions.
- Start by welcoming the candidate by name using this exact format: "Hello ${candidate.member?.name || 'Candidate'}. Welcome to your IGNIS AI Technical Assessment. Based on your profile as a ${candidate.member?.jobRole || 'Software Engineer'}, I will conduct an adaptive technical assessment tailored to your background." Then ask your dynamically framed first question about the FIRST topic in the plan above.
- Keep your tone encouraging but rigorous.
- Respond with ONLY the welcome + first question as plain text. No preamble, no JSON, no markdown formatting.`;
}

export function turnDecisionSystemPrompt({ candidate, plan, currentTopic, questionsAskedForTopic, transcript, difficulty }) {
  return `You are a warm, sharp technical interviewer continuing an in-progress technical interview.

CANDIDATE
${candidateSummary(candidate)}

FULL PLAN
${planSummary(plan)}

CURRENT TOPIC: Day ${currentTopic.day} - "${currentTopic.title}"
Current Weakness Level: ${currentTopic.weaknessScore}/5
Questions already asked on this topic: ${questionsAskedForTopic} / budget ${currentTopic.questionBudget}
CURRENT DIFFICULTY LEVEL: ${difficulty}/5 — ${difficultyLabel(difficulty)}

TRANSCRIPT SO FAR (most recent last)
${transcript.map((t) => `${t.role === "assistant" ? "INTERVIEWER" : "CANDIDATE"}: ${t.content}`).join("\n")}

DYNAMIC QUESTION FRAMING & ADAPTIVITY INSTRUCTIONS:
1. DO NOT ask canned, static, or repetitive textbook questions.
2. Dynamically frame every question based on:
   - Candidate's applied position: ${candidate.member?.jobRole || 'Technical Candidate'}
   - Candidate's experience level: ${candidate.member?.yearsExperience || 0} years
   - Specific technical nuances or gaps in their PREVIOUS answer
   - Active difficulty level (${difficulty}/5 — ${difficultyLabel(difficulty)})
3. Vary scenario phrasing every time so questions are fresh, practical, and highly realistic.

IN-FLIGHT CONCEPT REMEDIATION & MISSING KNOWLEDGE RULE:
If the candidate's last answer is "Incorrect" or "Partial" (or evasive/incomplete):
- You MUST provide a clear, supportive 1-2 sentence educational explanation of the missing or misconstrued core concept in the "conceptExplanation" field.
- This ensures the candidate learns the missing concept immediately before answering the next question.

Respond with ONLY a JSON object (no markdown fences, no extra text) in exactly this shape:

{
  "analysis": {
    "correctness": "Correct" | "Partial" | "Incorrect",
    "misconception": "none" | "short description of the diagnosed root misconception if Incorrect/Partial, otherwise 'none'",
    "decision": "Deeper follow-up" | "Clarification follow-up" | "Diagnostic question" | "Next topic transition" | "Interview completion",
    "reasoning": "Detailed internal analysis of candidate response, conceptual depth, role calibration, and next question logic.",
    "updatedWeaknessScore": 1 | 2 | 3 | 4 | 5
  },
  "conceptExplanation": "If Incorrect or Partial, provide a clear 1-2 sentence educational explanation of the missing concept to teach the candidate before the next question. If Correct, set to 'none'.",
  "missedConceptSummary": "If Incorrect or Partial, name the key concept that was missing or misconstrued (e.g. 'LLM Context Window Limits'). If Correct, set to 'none'.",
  "action": "follow_up" | "next_topic",
  "question": "the exact next dynamically framed question to ask, calibrated to candidate role, prior response, and difficulty level"
}

Pedagogical Rules:
1. "correctness": Evaluate the last candidate response:
   - "Correct": Technically accurate, complete, and directly answers the question demonstrating genuine understanding.
   - "Partial": Vague, memorized/textbook definition without explanation, missing key details, or contains minor inaccuracies.
   - "Incorrect": Flatly incorrect, evasive, or showing complete lack of understanding of the topic.
2. "updatedWeaknessScore":
   - If Correct and they answered a challenging probe well: decrease the weakness score (set to 1 or 2).
   - If Partial/generic and they struggled to explain why/how: keep or increase weakness score (set to 3 or 4).
   - If Incorrect or completely evasive: set weakness score to 4 or 5.
3. "action" mapping:
   - If decision is "Deeper follow-up", "Clarification follow-up", or "Diagnostic question", set "action" to "follow_up".
   - If decision is "Next topic transition" or "Interview completion", set "action" to "next_topic".`;
}

export function feedbackSystemPrompt({ candidate, plan, transcript, stats, missedConcepts = [] }) {
  const statsSummary = stats ? `
INTERVIEW STATISTICS:
- Total Questions in Plan: ${stats.totalQuestions}
- Questions Answered: ${stats.questionsAnswered}
- Questions Skipped: ${stats.questionsSkipped}
- Completion Percentage: ${stats.completionPercentage}%
- Technical Score (based ONLY on answered questions): ${stats.technicalScore}%
- Current Status: ${stats.status}
- Session Duration: ${stats.durationStr}
` : '';

  const missedSummaryText = missedConcepts.length > 0
    ? missedConcepts.map((m, idx) => `${idx + 1}. [${m.topic}] ${m.concept}: ${m.explanation}`).join('\n')
    : 'No critical missed concepts recorded during the session.';

  return `You are a technical interviewer writing up final structured feedback after completing an interview.

CANDIDATE
${candidateSummary(candidate)}

PLAN COVERED
${planSummary(plan)}
${statsSummary}

MISSED CONCEPTS & IN-FLIGHT REMEDIATIONS RECORDED DURING SESSION:
${missedSummaryText}

FULL TRANSCRIPT
${transcript.map((t) => `${t.role === "assistant" ? "INTERVIEWER" : "CANDIDATE"}: ${t.content}`).join("\n")}

Write the final feedback. Respond with ONLY a JSON object (no markdown fences, no extra text) in exactly this shape:

{
  "overallScore": 85, // overall numerical score out of 100 based on performance
  "scoreLabel": "Excellent Performance", // "Excellent Performance", "Satisfactory Performance", "Needs Improvement", or "Unsatisfactory Performance"
  "recommendation": "Recommended" | "Maybe Recommended" | "Not Recommended",
  "executiveSummary": "A concise final assessment explaining: 1) overall candidate performance, 2) technical strengths, 3) key weaknesses or missed concepts, 4) how well candidate matched the applied position (${candidate.member?.jobRole}), and 5) hiring verdict.",
  "topicBreakdown": [
    {
      "topicName": "Topic Name",
      "score": 8, // score out of 10
      "explanation": "Short explanation based on the candidate's actual answers"
    }
  ],
  "missedConcepts": [
    {
      "topic": "Topic Name",
      "concept": "Specific concept name",
      "explanation": "Brief summary of concept gap and remediation provided"
    }
  ],
  "strengths": [
    "Demonstrated strong understanding of...",
    "Clearly explained..."
  ],
  "areasForGrowth": [
    "Weak understanding of...",
    "Needs improvement in..."
  ]
}

Be specific and reference actual moments from the transcript. If candidate exited early, reflect this in overallScore, status, and executiveSummary.`;
}
