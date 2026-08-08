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

RULES
- Ask exactly ONE question at a time. Never bundle multiple questions.
- Start by welcoming the candidate by name using this exact format: "Hello [Candidate Name]. Welcome to your IGNIS AI Technical Assessment. Based on your profile and curriculum progress, I will conduct an adaptive technical interview tailored to your learning journey." Then ask your first question about the FIRST topic in the plan above.
- Topics with a higher weakness score and skipped topics deserve tougher, more specific probing — don't be afraid to ask something that would expose a shallow understanding.
- Keep your tone encouraging but rigorous. This is a real assessment, not small talk.
- Respond with ONLY the welcome + first question as plain text. No preamble, no JSON, no markdown formatting.`;
}

export function turnDecisionSystemPrompt({ candidate, plan, currentTopic, questionsAskedForTopic, transcript }) {
  return `You are a warm, sharp technical interviewer continuing an in-progress technical interview.

CANDIDATE
${candidateSummary(candidate)}

FULL PLAN
${planSummary(plan)}

CURRENT TOPIC: Day ${currentTopic.day} - "${currentTopic.title}"
Current Weakness Level: ${currentTopic.weaknessScore}/5
Questions already asked on this topic: ${questionsAskedForTopic} / budget ${currentTopic.questionBudget}

TRANSCRIPT SO FAR (most recent last)
${transcript.map((t) => `${t.role === "assistant" ? "INTERVIEWER" : "CANDIDATE"}: ${t.content}`).join("\n")}

Evaluate the candidate's most recent answer internally:
- Does the candidate actually understand the concept?
- Is the answer technically correct and relevant to the question?
- Is the candidate explaining the concept in their own understanding or just repeating a generic textbook definition?
- Does the answer appear copied or AI-generated rather than demonstrating genuine practical understanding? (Do NOT automatically flag well-written answers; look for lack of specific details or failure to explain why/how).
- Can the candidate explain WHY, not just WHAT?
- Assess what concepts they understand and what areas are weak or missing.

Respond with ONLY a JSON object (no markdown fences, no extra text) in exactly this shape:

{
  "analysis": {
    "correctness": "Correct" | "Partial" | "Incorrect",
    "misconception": "none" | "short description of the diagnosed root misconception if Incorrect/Partial, otherwise 'none'",
    "decision": "Deeper follow-up" | "Clarification follow-up" | "Diagnostic question" | "Next topic transition" | "Interview completion",
    "reasoning": "Detailed internal analysis of the candidate's conceptual understanding, tech correctness, vagueness, memorization, or copied indicators, and your choice of next question.",
    "updatedWeaknessScore": 1 | 2 | 3 | 4 | 5 // Assign the new weakness score (1=Excellent/No Weakness, 5=Severe Weakness/Complete Misconception) based on this answer and previous interactions.
  },
  "action": "follow_up" | "next_topic",
  "question": "the exact next question to ask, dynamically generated based on the previous answer and analysis"
}

Pedagogical Rules:
1. "correctness": Evaluate the last candidate response:
   - "Correct": Technically accurate, complete, and directly answers the question demonstrating genuine understanding.
   - "Partial": Vague, memorized/textbook definition without explanation, missing key details, or contains minor inaccuracies.
   - "Incorrect": Flatly incorrect, evasive, or showing complete lack of understanding of the topic.
2. "updatedWeaknessScore":
   - If Correct and they answered a challenging probe well: decrease the weakness score (e.g. set to 1 or 2).
   - If Partial/generic and they struggled to explain why/how: keep or increase the weakness score (e.g. set to 3 or 4).
   - If Incorrect or completely evasive: increase the weakness score to 4 or 5.
3. "decision" and recovery logic:
   - If Correct: Choose "Deeper follow-up" to ask a more advanced practical scenario or probe deeper (trade-offs, design choices, trade-offs, code details), OR "Next topic transition" if budget is exhausted or mastery is demonstrated.
   - If Partial: Choose "Clarification follow-up" (or deeper check) to probe the specific missing details or verify if they actually understand.
   - If Incorrect: Choose "Diagnostic question" to ask a simpler prerequisite question testing the fundamental concept before moving on.
4. "action" mapping:
   - If decision is "Deeper follow-up", "Clarification follow-up", or "Diagnostic question", set "action" to "follow_up".
   - If decision is "Next topic transition" or "Interview completion", set "action" to "next_topic".
5. Dynamic Generation:
   - Construct a natural, dynamic conversation. Never ask more than one question. Avoid generic template phrasing.`;
}

export function feedbackSystemPrompt({ candidate, plan, transcript, stats }) {
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

  return `You are a technical interviewer writing up final structured feedback after completing an interview.

CANDIDATE
${candidateSummary(candidate)}

PLAN COVERED
${planSummary(plan)}
${statsSummary}

FULL TRANSCRIPT
${transcript.map((t) => `${t.role === "assistant" ? "INTERVIEWER" : "CANDIDATE"}: ${t.content}`).join("\n")}

Write the final feedback. Respond with ONLY a JSON object (no markdown fences, no extra text) in exactly this shape:

{
  "overallScore": 50, // overall numerical score out of 100 based on their performance
  "scoreLabel": "Satisfactory Performance", // overall label: e.g. "Excellent Performance", "Satisfactory Performance", "Needs Improvement", or "Unsatisfactory Performance"
  "recommendation": "Recommended" | "Maybe Recommended" | "Not Recommended",
  "executiveSummary": "A concise final assessment explaining: 1) overall candidate performance, 2) technical strengths, 3) major weaknesses, 4) how well the candidate matched the role, and 5) whether they demonstrated sufficient technical knowledge.",
  "topicBreakdown": [
    {
      "topicName": "Topic Name",
      "score": 7, // score out of 10
      "explanation": "Short explanation based on the candidate's actual answer"
    }
  ],
  "strengths": [
    "Demonstrated strong understanding of...",
    "Clearly explained...",
    "Correctly applied..."
  ],
  "areasForGrowth": [
    "Weak understanding of...",
    "Unable to explain...",
    "Missing knowledge of..."
  ]
}

Be specific and reference actual moments from the transcript. If the candidate exited early, reflect this in the decision, overallScore, status, and explain it clearly in the executiveSummary.`;
}
