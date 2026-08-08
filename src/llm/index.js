import { callAnthropic } from "./anthropic.js";
import { callGemini } from "./gemini.js";

function evaluateTranscript(candidateLines) {
  if (candidateLines.length === 0) return { isPassed: true, reasons: [], boilerplateCount: 0, evasiveCount: 0 };

  const reasons = [];
  let evasiveCount = 0;
  let boilerplateCount = 0;

  // Key terms indicating a substantive answer (at least one should match for topics)
  const techKeywords = [
    "prometheus", "log", "metric", "trace", "python", "docker", "kubernetes", "k8s",
    "embedding", "vector", "prompt", "few-shot", "mcp", "agent", "retrieve", "matching",
    "fastapi", "react", "latency", "scale", "health", "security", "guardrail", "eval"
  ];

  candidateLines.forEach(line => {
    const text = line.toLowerCase();
    
    // Check for automated boilerplate
    if (text.includes("i'd approach it by breaking the problem down") || text.includes("validate with tests")) {
      boilerplateCount++;
      return;
    }

    // Check for too short (e.g. "yes", "i did it", "sure")
    if (text.length < 40) {
      evasiveCount++;
      reasons.push(`Answers are too brief ("${line}"). Interview probing requires a detailed technical explanation of how you applied the technology.`);
      return;
    }

    // Check for shallow answers lacking technical terms
    const hasTechTerm = techKeywords.some(keyword => text.includes(keyword));
    if (!hasTechTerm && (text.includes("yes") || text.includes("implemented") || text.includes("project") || text.includes("did it") || text.includes("applied") || text.includes("sure"))) {
      evasiveCount++;
      reasons.push(`Shallow technical response: "${line}". You claimed implementation but did not explain *how* it was configured or used.`);
    }
  });

  const totalFlagged = evasiveCount + boilerplateCount;
  // fail if 35% or more of responses are flagged as boilerplate/evasive
  const isPassed = totalFlagged < (candidateLines.length * 0.35);

  return {
    isPassed,
    reasons,
    boilerplateCount,
    evasiveCount
  };
}

function mockLLMResponse({ systemPrompt, messages }) {
  // Extract candidate name
  const nameMatch = systemPrompt.match(/Name:\s*([^\r\n]+)/);
  const candidateName = nameMatch ? nameMatch[1].trim() : "Candidate";

  // Check if it's the feedback prompt
  if (systemPrompt.includes("final structured feedback") || systemPrompt.includes("feedbackSystemPrompt")) {
    // Parse candidate responses from the prompt text
    const candidateLines = [];
    const lines = systemPrompt.split("\n");
    for (const line of lines) {
      if (line.toUpperCase().startsWith("CANDIDATE:")) {
        candidateLines.push(line.slice(10).trim());
      }
    }

    const evaluation = evaluateTranscript(candidateLines);
    const decision = evaluation.isPassed ? "PASSED" : "FAILED";
    
    let summary, conceptUnderstanding, reasoningQuality, consistencyScore, strongTopics, weakTopics, personalizedSuggestions;

    if (decision === "FAILED") {
      summary = `The assessment resulted in a FAILED status. ${candidateName} failed to provide relatable, concrete explanations. Many answers were evasive, generic claims (such as simply saying it was implemented) without demonstrating how they applied the technologies.`;
      conceptUnderstanding = `Demonstrated superficial familiarity with terms but lacked operational understanding of logging libraries, container metrics, and prompt configurations.`;
      reasoningQuality = `Extremely low. Relied heavily on generic filler phrases ('breaking the problem down') instead of applying logical analysis to specific technical scenarios.`;
      consistencyScore = `15/100`;
      
      strongTopics = [
        "Polite conversational structure"
      ];

      weakTopics = evaluation.boilerplateCount > 0 
        ? [
            "Observability logging models",
            "Prerequisite diagnostic validation steps",
            "Technical plan adherence"
          ]
        : [
            "Prometheus configuration syntax",
            "Docker containerization parameters"
          ];
      
      // Add specific parsed reasons to weak topics if available
      if (evaluation.reasons.length > 0) {
        weakTopics.push(...evaluation.reasons.slice(0, 1).map(r => r.substring(0, 60) + "..."));
      }

      personalizedSuggestions = [
        "Retake all curriculum modules, focusing on writing raw Python/Prometheus metrics instrumentation.",
        "Practice explaining *how* you applied technologies in your Capstone or daily tasks, referencing actual libraries, schema layouts, and error-handling steps.",
        "Avoid making empty assertions (like 'yes I did that'); always follow up with concrete technical context."
      ];
    } else {
      summary = `Overall, the assessment resulted in a PASSED status. ${candidateName} demonstrated solid understanding by explaining how they applied embeddings, vector databases, and observability tools in their cohort projects.`;
      conceptUnderstanding = `Solid. Clearly articulated the difference between LLM latency and tool latency, and explained vector database indexing architectures.`;
      reasoningQuality = `High. Proactively discussed system design trade-offs, scale limitations, and performance optimization choices.`;
      consistencyScore = `85/100`;

      strongTopics = [
        "Monitoring, Logging & Observability",
        "Prompt Engineering Fundamentals",
        "Docker & Kubernetes Deployment",
        "Retrieval & Matching Engine"
      ];

      weakTopics = [
        "Advanced scale trade-offs under high concurrency limits"
      ];

      personalizedSuggestions = [
        "Focus on system design patterns for high-throughput messaging structures.",
        "Explore advanced telemetry visualizations."
      ];
    }

    const overallScore = decision === "FAILED" ? 15 : 85;
    const scoreLabel = decision === "FAILED" ? "Unsatisfactory Performance" : "Excellent Performance";
    const recommendation = decision === "FAILED" ? "Not Recommended" : "Recommended";
    const executiveSummary = `${summary}\n\nConcept Understanding: ${conceptUnderstanding}\n\nReasoning Quality: ${reasoningQuality}`;
    const strengths = strongTopics.map(t => `Demonstrated understanding of ${t}`);
    const areasForGrowth = weakTopics.map(t => `Weak understanding of ${t}`);
    const topicBreakdown = (strongTopics.concat(weakTopics)).map((t, idx) => {
      const isStrong = idx < strongTopics.length;
      return {
        topicName: t,
        score: isStrong ? 9 : 2,
        explanation: isStrong 
          ? `Candidate demonstrated clear proficiency and answered questions about ${t} accurately.`
          : `Candidate struggled to explain core concepts related to ${t} and provided generic responses.`
      };
    });

    return JSON.stringify({
      decision,
      summary,
      conceptUnderstanding,
      reasoningQuality,
      consistencyScore,
      strongTopics,
      weakTopics,
      personalizedSuggestions,
      overallScore,
      scoreLabel,
      recommendation,
      executiveSummary,
      topicBreakdown,
      strengths,
      areasForGrowth
    }, null, 2);
  }

  // Check if it's the turn decision prompt
  if (systemPrompt.includes("Decide the next move") || systemPrompt.includes("CURRENT TOPIC") || systemPrompt.includes("Evaluate the candidate")) {
    // Extract current topic title
    const currentTopicMatch = systemPrompt.match(/CURRENT TOPIC:\s*Day\s*\d+\s*-\s*"([^"]+)"/);
    const currentTopicTitle = currentTopicMatch ? currentTopicMatch[1] : "the current topic";

    // Extract questions asked and budget
    const budgetMatch = systemPrompt.match(/Questions already asked on this topic:\s*(\d+)\s*\/\s*budget\s*(\d+)/);
    const questionsAsked = budgetMatch ? parseInt(budgetMatch[1], 10) : 1;
    const budget = budgetMatch ? parseInt(budgetMatch[2], 10) : 3;

    // Parse all topics in the plan to know what's next
    const topics = [];
    const lines = systemPrompt.split("\n");
    for (const line of lines) {
      const topicMatch = line.match(/^-\s*Day\s*(\d+):\s*"([^"]+)"/);
      if (topicMatch) {
        topics.push({ day: topicMatch[1], title: topicMatch[2] });
      }
    }

    // Determine current index in topics
    const currentIndex = topics.findIndex(t => t.title === currentTopicTitle);
    const nextTopic = topics[currentIndex + 1];

    // Extract candidate last response
    let lastCandidateAnswer = "";
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].toUpperCase().startsWith("CANDIDATE:")) {
        lastCandidateAnswer = lines[i].slice(10).trim();
        break;
      }
    }

    // Check features of answer
    const isBoilerplate = lastCandidateAnswer.toLowerCase().includes("i'd approach it by breaking the problem down") ||
                          lastCandidateAnswer.toLowerCase().includes("validate with tests");
    const isVeryShort = lastCandidateAnswer.trim().length > 0 && lastCandidateAnswer.trim().length < 40;
    const hasTechKeywords = [
      "prometheus", "log", "metric", "trace", "python", "docker", "kubernetes", "k8s",
      "embedding", "vector", "prompt", "few-shot", "mcp", "agent", "retrieve", "matching",
      "fastapi", "react", "latency", "scale", "health", "security", "guardrail", "eval"
    ].some(kw => lastCandidateAnswer.toLowerCase().includes(kw));

    let correctness = "Correct";
    let misconception = "none";
    let decision = "Deeper follow-up";
    let action = "follow_up";
    let question = "";

    if (isBoilerplate) {
      correctness = "Incorrect";
      misconception = "Candidate relies on a generic problem-solving framework and avoids answering the specific technical details.";
      // If we are already beyond the diagnostic turn (e.g., questionsAsked >= 2), transition to the next topic.
      if (questionsAsked >= 2) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `Thanks for that. Let's move on to the next topic in our plan: "${nextTopic.title}". Can you give me an overview of your experience with this and how you applied it?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Thank you, ${candidateName}. Those were all the questions I had for today. You did a great job walking me through your experience!`;
        }
      } else {
        decision = "Diagnostic question";
        action = "follow_up";
        question = `Let's take a step back. Before going into details of ${currentTopicTitle}, can you explain the fundamental prerequisite of how this concept works in a simpler, high-level scenario?`;
      }
    } else if (isVeryShort) {
      correctness = "Partial";
      misconception = "Superficial answer lacking concrete technical evidence or examples.";
      if (questionsAsked >= 2) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `Thanks for that explanation. Let's move on to the next topic in our plan: "${nextTopic.title}". Can you give me an overview of your experience with this and how you applied it?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Thank you, ${candidateName}. Those were all the questions I had for today. You did a great job walking me through your experience!`;
        }
      } else {
        decision = "Clarification follow-up";
        action = "follow_up";
        question = `Could you clarify how exactly you implemented this? Please share a concrete example or configuration detail.`;
      }
    } else if (!hasTechKeywords && lastCandidateAnswer.trim().length > 0) {
      correctness = "Incorrect";
      misconception = "Candidate gives generic confirmation/claims of implementation but lacks specific technical terminology.";
      if (questionsAsked >= 2) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `Thanks. Let's move on to the next topic in our plan: "${nextTopic.title}". Can you give me an overview of your experience with this and how you applied it?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Thank you, ${candidateName}. Those were all the questions I had for today. You did a great job walking me through your experience!`;
        }
      } else {
        decision = "Diagnostic question";
        action = "follow_up";
        question = `I'd like to trace the basics of this. What is the fundamental problem that ${currentTopicTitle} is designed to solve in a standard architecture?`;
      }
    } else {
      // Correct technical response!
      if (questionsAsked >= budget) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `Excellent description. Let's move on to the next topic in our plan: "${nextTopic.title}". Can you give me an overview of your experience with this and how you applied it?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Thank you, ${candidateName}. Those were all the questions I had for today. You did a great job walking me through your experience!`;
        }
      } else {
        decision = "Deeper follow-up";
        action = "follow_up";
        question = `That is correct. Let's dive deeper: when deploying this in production, what specific trade-offs or edge cases did you encounter, and how did you resolve them?`;
      }
    }

    let updatedWeaknessScore = 3;
    let conceptExplanation = "none";
    let missedConceptSummary = "none";

    if (correctness === "Correct") {
      updatedWeaknessScore = 2;
    } else if (correctness === "Incorrect") {
      updatedWeaknessScore = 5;
      missedConceptSummary = `Core technical principles of ${currentTopicTitle}`;
      conceptExplanation = `In production architectures, ${currentTopicTitle} requires precise component orchestration, telemetry monitoring, and explicit configuration parameters rather than high-level generic statements.`;
    } else if (correctness === "Partial") {
      updatedWeaknessScore = 4;
      missedConceptSummary = `Practical implementation depth in ${currentTopicTitle}`;
      conceptExplanation = `When discussing ${currentTopicTitle}, it is essential to detail the exact schema, tool parameters, or architectural trade-offs applied in your workflow.`;
    }

    return JSON.stringify({
      analysis: {
        correctness,
        misconception,
        decision,
        reasoning: `Mock evaluation: Candidate answer detected as ${correctness}. Selecting pedagogical action: ${decision}.`,
        updatedWeaknessScore
      },
      conceptExplanation,
      missedConceptSummary,
      action,
      question
    }, null, 2);
  }

  // Default to opening prompt
  // Extract all topics
  const topics = [];
  const lines = systemPrompt.split("\n");
  for (const line of lines) {
    const topicMatch = line.match(/^-\s*Day\s*(\d+):\s*"([^"]+)"/);
    if (topicMatch) {
      topics.push({ day: topicMatch[1], title: topicMatch[2] });
    }
  }
  const firstTopicTitle = topics.length > 0 ? topics[0].title : "the first topic";
  return `Hello ${candidateName}. Welcome to your IGNIS AI Technical Assessment. Based on your profile and curriculum progress, I will conduct an adaptive technical interview tailored to your learning journey. Let's start with "${firstTopicTitle}". Could you describe your experience with this and how you implemented it in your work?`;
}

/**
 * Calls the configured LLM provider (LLM_PROVIDER env var: "anthropic" | "gemini").
 * Falls back to mock provider if keys are not set.
 */
export async function callLLM(args) {
  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  
  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      console.log("⚠️ GEMINI_API_KEY not found. Running in MOCK/DEMO mode with simulated responses.");
      return mockLLMResponse(args);
    }
    try {
      return await callGemini(args);
    } catch (err) {
      console.log(`⚠️ Gemini API Error: ${err.message}. Falling back to MOCK mode.`);
      return mockLLMResponse(args);
    }
  }

  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log("⚠️ ANTHROPIC_API_KEY not found. Running in MOCK/DEMO mode with simulated responses.");
      return mockLLMResponse(args);
    }
    try {
      return await callAnthropic(args);
    } catch (err) {
      console.log(`⚠️ Anthropic API Error: ${err.message}. Falling back to MOCK mode.`);
      return mockLLMResponse(args);
    }
  }

  // For any other provider (e.g. "mock")
  return mockLLMResponse(args);
}

