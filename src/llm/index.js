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

    // Extract candidate job role if present
    const roleMatch = systemPrompt.match(/Applied Position:\s*([^\n]+)/i) || systemPrompt.match(/Candidate's applied position:\s*([^\n]+)/i);
    const candidateRole = roleMatch ? roleMatch[1].trim() : "Software Engineer";

    const ansLower = lastCandidateAnswer.toLowerCase().trim().replace(/['’"”]/g, "");    function getTopicKeywords(title) {
      const t = title.toLowerCase();
      if (t.includes("monitoring") || t.includes("logging") || t.includes("observability")) {
        return ["prometheus", "log", "metric", "trace", "grafana", "kibana", "telemetry", "observability", "alert", "elk", "loki"];
      }
      if (t.includes("prompt")) {
        return ["prompt", "few-shot", "zero-shot", "system prompt", "temperature", "llm", "instruction", "output format"];
      }
      if (t.includes("docker") || t.includes("kubernetes") || t.includes("deployment")) {
        return ["docker", "kubernetes", "k8s", "container", "pod", "deployment", "image", "dockerfile", "yaml", "helm"];
      }
      if (t.includes("embeddings")) {
        return ["embedding", "vector", "semantic", "cosine", "similarity", "dimension", "distance", "representation"];
      }
      if (t.includes("vector database") || t.includes("chromadb") || t.includes("pgvector")) {
        return ["vector", "chroma", "pgvector", "pinecone", "database", "index", "hnsw", "similarity", "query"];
      }
      if (t.includes("retrieval") || t.includes("matching")) {
        return ["retrieval", "retrieve", "query", "search", "chunk", "overlap", "rerank", "hybrid"];
      }
      if (t.includes("mcp") || t.includes("model context")) {
        return ["mcp", "protocol", "server", "client", "tool", "resource", "schema", "context"];
      }
      if (t.includes("agent") || t.includes("orchestration")) {
        return ["agent", "orchestration", "langgraph", "langchain", "crewai", "autogen", "state", "loop", "routing"];
      }
      if (t.includes("backend") || t.includes("api") || t.includes("integration")) {
        return ["api", "backend", "express", "node", "fastapi", "endpoint", "rest", "json", "cors", "route"];
      }
      return ["code", "software", "development", "architecture", "system"];
    }

    const topicKeywords = getTopicKeywords(currentTopicTitle);
    const hasTopicKeywords = topicKeywords.some(kw => ansLower.includes(kw));
    const matchedTopicKeywords = topicKeywords.filter(kw => ansLower.includes(kw));

    const otherTechKeywords = [
      "prometheus", "log", "metric", "trace", "docker", "kubernetes", "k8s",
      "embedding", "vector", "prompt", "few-shot", "mcp", "agent", "retrieve", "matching",
      "fastapi", "react", "css", "layout", "styling", "compile", "html"
    ].filter(kw => !topicKeywords.includes(kw));
    const hasOtherKeywords = otherTechKeywords.some(kw => ansLower.includes(kw));
    const isOffTopic = hasOtherKeywords && !hasTopicKeywords && ansLower.length > 25;

    // 2. Classify response types
    const isDontKnowAnswer = ansLower === "i dont know" ||
                             ansLower === "i have no idea" ||
                             ansLower === "im not sure" ||
                             ansLower === "i dont remember" ||
                             ansLower === "no idea" ||
                             ansLower === "no clue" ||
                             ansLower === "cant remember" ||
                             ansLower === "i do not know" ||
                             ansLower.includes("don't know") ||
                             ansLower.includes("dont know") ||
                             ansLower.includes("not sure") ||
                             ansLower.includes("cant answer") ||
                             ansLower.includes("dont remember") ||
                             ansLower.includes("no idea");

    const insufficientWords = ["yes", "yeah", "okay", "ok", "correct", "no", "sure", "fine", "not really", "maybe", "yep", "yup"];
    const isInsufficient = insufficientWords.includes(ansLower) || ansLower.length < 6;

    // Claims without evidence, e.g. "yes I used it", "yeah I did", "yes I did that on my project", "I have used it"
    const isClaimOnly = (ansLower.startsWith("yes ") || ansLower.startsWith("yeah ") || ansLower.includes("used it") || ansLower.includes("have used") || ansLower.includes("did that")) &&
                        ansLower.length < 40 &&
                        !hasTopicKeywords;

    const isBoilerplate = ansLower.includes("i dont know") === false && (
                          ansLower.includes("i'd approach it by breaking the problem down") ||
                          ansLower.includes("validate with tests") ||
                          ansLower.includes("break down the problem") ||
                          ansLower.includes("test everything"));

    const isStrongDetailed = matchedTopicKeywords.length >= 2 && ansLower.length > 80;

    // Incorrect concepts match
    let isIncorrectContent = isOffTopic;
    if (currentTopicTitle.toLowerCase().includes("embedding")) {
      if (ansLower.includes("compile") || ansLower.includes("layout") || ansLower.includes("style")) {
        isIncorrectContent = true;
      }
    }
    if (currentTopicTitle.toLowerCase().includes("docker")) {
      if (ansLower.includes("layout") || ansLower.includes("styling") || ansLower.includes("css") || ansLower.includes("component")) {
        isIncorrectContent = true;
      }
    }

    let correctness = "Correct";
    let responseClassification = "KNOWLEDGE_DEMONSTRATED";
    let misconception = "none";
    let decision = "Deeper follow-up";
    let action = "follow_up";
    let question = "";
    let updatedWeaknessScore = 2;
    let conceptExplanation = "none";
    let missedConceptSummary = "none";

    if (isDontKnowAnswer) {
      correctness = "Incorrect";
      responseClassification = "DOES_NOT_KNOW";
      misconception = "Candidate stated they do not know the concept.";
      updatedWeaknessScore = 5;
      missedConceptSummary = `Core technical principles of ${currentTopicTitle}`;
      conceptExplanation = `In production architectures, ${currentTopicTitle} requires precise component orchestration, telemetry monitoring, and explicit configuration parameters rather than high-level generic statements.`;
      
      if (questionsAsked >= 1) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `Understood. Let's transition to our next topic: "${nextTopic.title}". Can you describe your experience with this?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Thank you, ${candidateName}. Those were all the questions I had for today. You did a great job walking me through your experience!`;
        }
      } else {
        decision = "Diagnostic question";
        action = "follow_up";
        question = `No worries. Let's try a simpler one: what is the basic purpose of ${currentTopicTitle} in a system architecture?`;
      }
    } else if (isInsufficient) {
      correctness = "Incorrect";
      responseClassification = "INCORRECT";
      misconception = "Candidate answer is empty or provides no technical context.";
      updatedWeaknessScore = 4;
      missedConceptSummary = `Core technical principles of ${currentTopicTitle}`;
      conceptExplanation = `In production architectures, ${currentTopicTitle} requires precise component orchestration, telemetry monitoring, and explicit configuration parameters rather than high-level generic statements.`;
      decision = "Diagnostic question";
      action = "follow_up";
      question = `I see. To help me verify your actual knowledge: could you explain what ${currentTopicTitle} is and what core problem it solves?`;
    } else if (isClaimOnly) {
      correctness = "Partial";
      responseClassification = "NEEDS_VERIFICATION";
      misconception = "Candidate claims experience but offers no technical evidence or specific examples.";
      updatedWeaknessScore = 4;
      missedConceptSummary = `Practical implementation depth in ${currentTopicTitle}`;
      conceptExplanation = `When discussing ${currentTopicTitle}, it is essential to detail the exact schema, tool parameters, or architectural trade-offs applied in your workflow.`;
      decision = "Diagnostic question";
      action = "follow_up";
      question = `You mentioned that you implemented it. What specific type of data did you process, and how did you configure ${currentTopicTitle} in your project?`;
    } else if (isIncorrectContent) {
      correctness = "Incorrect";
      responseClassification = "INCORRECT";
      misconception = "Candidate conflated the active topic with incorrect technical domains.";
      updatedWeaknessScore = 5;
      missedConceptSummary = `Core technical principles of ${currentTopicTitle}`;
      conceptExplanation = `In production architectures, ${currentTopicTitle} requires precise component orchestration, telemetry monitoring, and explicit configuration parameters rather than high-level generic statements.`;
      decision = "Diagnostic question";
      action = "follow_up";
      question = `It sounds like there might be a slight mix-up in how that concept works. Let's clarify: how does ${currentTopicTitle} relate to the core data flow in your backend, and what is its primary responsibility?`;
    } else if (isBoilerplate) {
      correctness = "Incorrect";
      responseClassification = "VAGUE";
      misconception = "Candidate relies on a generic problem-solving framework and avoids answering the specific technical details.";
      updatedWeaknessScore = 4;
      missedConceptSummary = `Core technical principles of ${currentTopicTitle}`;
      conceptExplanation = `In production architectures, ${currentTopicTitle} requires precise component orchestration, telemetry monitoring, and explicit configuration parameters rather than high-level generic statements.`;
      
      if (questionsAsked >= 2) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `Understood. Let's move forward to the next topic in our plan: "${nextTopic.title}". As a ${candidateRole}, how have you implemented this in production systems?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Thank you, ${candidateName}! That covers all our technical modules today.`;
        }
      } else {
        decision = "Diagnostic question";
        action = "follow_up";
        question = `I hear what you're saying about breaking down problems, but let's look at the actual technical mechanics. For ${currentTopicTitle}, what specific tools or code structures do you use?`;
      }
    } else if (isStrongDetailed) {
      correctness = "Correct";
      responseClassification = "STRONG_UNDERSTANDING";
      updatedWeaknessScore = 1;
      
      if (questionsAsked >= budget) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `That is an excellent, detailed explanation of your implementation. Let's transition to "${nextTopic.title}". In your role as a ${candidateRole}, how do you approach system design for this?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Excellent work, ${candidateName}! That completes all our technical assessment modules for today.`;
        }
      } else {
        decision = "Deeper follow-up";
        action = "follow_up";
        question = `That is an excellent point regarding production behavior. Diving deeper, as a ${candidateRole}, how do you handle edge cases and scale limits with ${currentTopicTitle}?`;
      }
    } else if (hasTopicKeywords) {
      correctness = "Correct";
      responseClassification = "KNOWLEDGE_DEMONSTRATED";
      updatedWeaknessScore = 2;
      
      if (questionsAsked >= budget) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `That's a solid explanation. Let's transition to "${nextTopic.title}". In your role as a ${candidateRole}, how do you approach system design for this?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Excellent work, ${candidateName}! That completes all our technical assessment modules for today.`;
        }
      } else {
        decision = "Deeper follow-up";
        action = "follow_up";
        question = `That is a correct definition. From a practical engineering standpoint, how or where would you configure and retrieve these ${currentTopicTitle} in a production-ready application?`;
      }
    } else {
      // Vague, short, or generic responses (no technical keywords, medium/short length)
      correctness = "Partial";
      responseClassification = "VAGUE";
      misconception = "Superficial answer lacking concrete technical evidence or examples.";
      updatedWeaknessScore = 3;
      missedConceptSummary = `Practical implementation depth in ${currentTopicTitle}`;
      conceptExplanation = `When discussing ${currentTopicTitle}, it is essential to detail the exact schema, tool parameters, or architectural trade-offs applied in your workflow.`;
      
      if (questionsAsked >= 2) {
        if (nextTopic) {
          decision = "Next topic transition";
          action = "next_topic";
          question = `Got it. Let's transition to our next core topic: "${nextTopic.title}". From your experience as a ${candidateRole}, can you outline your approach here?`;
        } else {
          decision = "Interview completion";
          action = "next_topic";
          question = `Thank you, ${candidateName}! That concludes our technical assessment session. Appreciate you sharing your insights!`;
        }
      } else {
        decision = "Clarification follow-up";
        action = "follow_up";
        question = `That is a general overview. Could you expand on how you applied this as a ${candidateRole}? What specific configuration, parameters, or library calls were involved?`;
      }
    }

    return JSON.stringify({
      analysis: {
        correctness,
        responseClassification,
        misconception,
        decision,
        reasoning: `Mock evaluation: Candidate answer classified as ${responseClassification} (${correctness}). Action: ${decision}.`,
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

