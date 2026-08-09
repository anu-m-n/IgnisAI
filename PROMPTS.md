# IGNIS AI Hackathon Submission — AI Usage Log

This document serves as the complete, chronological AI usage log mapping the prompts, instructions, and engineering steps performed during the development of the **IGNIS AI Technical Assessment Platform**.

---

## Part 1: Chronological Prompts and AI-Assisted Tasks

### Task 1: Repository Cloning and Setup
* **User Prompt**:
  > `https://github.com/anu-m-n/IgnisAI.git pull the latest`
* **AI-Assisted Action**:
  - Cloned and fetched the latest commits from the remote repository to initialize the local workspaces (`interview-agent` and `IgnisAI`).
  - Configured dependencies and ran the local development server to establish the baseline.

### Task 2: Core Response Classification and Evasion Interceptor
* **User Prompt**:
  > `IMPORTANT: FIX THE AI INTERVIEWER'S RESPONSE LOGIC. The AI is incorrectly treating "I don't know" as if the candidate provided a meaningful/high-level answer. Determine the response type for EVERY answer. Possible classifications: KNOWLEDGE_DEMONSTRATED, PARTIAL_UNDERSTANDING, WEAK_UNDERSTANDING, INCORRECT, IRRELEVANT, VAGUE, DOES_NOT_KNOW, NO_PRACTICAL_EXPERIENCE, NEEDS_VERIFICATION, STRONG_UNDERSTANDING.`
* **AI-Assisted Action**:
  - Created an interception layer in `src/interviewEngine.js` using a helper function `isDontKnow()` to catch phrases indicating lack of knowledge.
  - Implemented logic that flags evasive or missing replies as `DOES_NOT_KNOW` under `responseClassification`, sets correctness to `Incorrect`, and caps the weakness score of the topic at `5`.
  - Cleaned up the prompt structure to teach the LLM to classify every user response into one of the 10 requested semantic groups.

### Task 3: Top Navigation Layout Binding
* **User Prompt**:
  > `IMPORTANT: DO NOT CHANGE THE CURRENT UI DESIGN. The pages and buttons already look good. The problem is that several navigation buttons are currently NOT FUNCTIONAL. Overview -> Overview page, Executive Dashboard -> Executive Analytics, Candidate Hub -> Selection Screen, Interview Workspace -> Interview Screen, Assessment Report -> Report Screen. Make ALL of these clickable and functional.`
* **AI-Assisted Action**:
  - Inspected `public/index.html` navigation buttons and screen container IDs.
  - Attached stateful toggle handlers (`showSelectionScreen`, `showOverviewScreen`, etc.) to all navbar buttons.
  - Bound navigation buttons to display the correct screens dynamically without reloading the browser.

### Task 4: Launch Assessment and Candidate Auto-Generation
* **User Prompt**:
  > `IMPORTANT: DO NOT CHANGE THE CURRENT EXECUTIVE DASHBOARD UI. I ONLY need the "Launch New Candidate Assessment" button to become functional. When I click: Launch New Candidate Assessment, open a proper "Create New Candidate Assessment" form/modal. The form should allow me to enter Candidate Name, Job Role, Experience, Education, Skills, Projects, Resume. Generate Candidate ID (CAND-XXX) and Session ID (IGNIS-INT-XXXXX).`
* **AI-Assisted Action**:
  - Modified the dashboard layout in `public/index.html` to integrate the "Create New Candidate Assessment" form interface.
  - Exposed a backend route `POST /api/candidates` in `src/routes.js` to parse candidate forms, dynamically calculate the next auto-incremented ID (e.g. `CAND-021`), generate a unique session code (`IGNIS-INT-XXXXX`), compile defaults for curriculum milestones, and persist updates locally to `data/candidates.json`.

### Task 5: Full-Page Candidate Assessment View
* **User Prompt**:
  > `IMPORTANT: DO NOT CHANGE THE EXISTING UI OR FUNCTIONALITY BEFORE THE "LAUNCH NEW CANDIDATE ASSESSMENT" BUTTON. I want ONLY ONE FLOW changed: Executive Dashboard -> Click "Launch New Candidate Assessment" -> Navigate to a NEW dedicated page. Keep everything before the click exactly the same.`
* **AI-Assisted Action**:
  - Replaced the modal layout for candidate creation with a dedicated full-page screen (`#create-candidate-screen`).
  - Synced navigation hooks so clicking "Launch New Candidate Assessment" toggles the active screen state to the dedicated creation page.
  - Programmed the form submission button to POST to the database, refresh the Candidate Hub cohort grid, and scroll the user to the newly registered card.

### Task 6: View Profile Navigation Context
* **User Prompt**:
  > `On the Executive Dashboard, there is a Recent Candidate Assessment History table. Clicking 'View Profile' navigates to the generic Candidate Hub, but it does NOT identify/highlight/open the specific candidate. When I click View Profile for Aarav Sharma -> Candidate Hub opens with Aarav Sharma selected.`
* **AI-Assisted Action**:
  - Seeded static assessment rows (`Aarav Sharma`, `Diya Patel`, `Rohan Mehta`) into the core JSON databases to ensure they render in the Candidate Hub grid.
  - Modified the dashboard row action buttons in `public/index.html` to pass candidate IDs (`CAND-021`, `CAND-022`, `CAND-023`) to `selectCandidate()`.
  - Enhanced `selectCandidate` to automatically parse IDs, smooth-scroll the grid to the target card, and apply a high-end glowing selection outline.

### Task 7: Session Verification and Adaptive Answer Evaluation
* **User Prompt**:
  > `1. SESSION VERIFICATION BEFORE INTERVIEW: When the user clicks Launch Interview, do NOT immediately start. First show session verification screen to confirm name, ID, role, skills, etc.\n2. AI ANSWER EVALUATION: AI must evaluate semantic quality. Vague answers get clarification follow-up. Memorized answers get scenario-based follow-up. Lack of knowledge marks skill weak.\n3. FINAL ASSESSMENT REPORT: Calculation must reflect actual weakness scores and responses.`
* **AI-Assisted Action**:
  - Checked routing configuration: Launch Interview triggers `verification-screen` rendering, displaying candidate metadata and requiring verification of the Session ID before spawning the live workspace.
  - Formulated strict turn-decision guidelines in `src/promptBuilder.js` forcing the LLM turn classifier to perform semantic depth checks.
  - Fixed scoring formulas in `src/interviewEngine.js` to map weakness scores directly from interview turns to final assessment grades.

### Task 8: Mock-Mode Tech-Keyword and Off-Topic Resolution
* **User Prompt**:
  > `CRITICAL BUG STILL EXISTS. FIX ONLY THE AI ANSWER EVALUATION/NEXT-QUESTION LOGIC. "yes" does NOT demonstrate a high-level understanding. The system is still assuming every candidate answer is meaningful and using the generic deeper-follow-up response. A vague answer should get a clarification follow-up. An incorrect answer should check the misconception. "I don't know" must not receive positive evaluation.`
* **AI-Assisted Action**:
  - Identified that API rate limits caused the system to fall back to the mock LLM generator (`src/llm/index.js`), which was defaulting short answers (like `"yes"`) to `Partial` correct status and printing generic follow-ups.
  - Re-wrote the mock turn classifier in `src/llm/index.js` to implement dynamic keyword-to-topic mapping.
  - Added an `isOffTopic` validation check. If a candidate replies with concepts from an unrelated domain, the system classifies it as `INCORRECT` and triggers a diagnostic topic redirect.
  - Configured strict semantic fallbacks for `"yes"`, `"I don't know"`, and claims without evidence.

### Task 9: Multi-Topic Transitions and Question Budget Enforcement
* **User Prompt**:
  > `CRITICAL FUNCTIONAL CORRECTION — ADAPTIVE INTERVIEW QUESTION SELECTION. If the candidate says "I don't know" or "No", mark topic weak and move to a DIFFERENT relevant topic. Do not repeatedly ask the same question or topic. The "Budget" and "Asked" values must actually control question selection.`
* **AI-Assisted Action**:
  - Refined `handleTurn()` in `src/interviewEngine.js` to insert programmatic transition guards.
  - Programmed the classifier to immediately transition to the next topic in the plan (`action: "next_topic"`) upon encountering any negative answers (like `"No"` or `"I don't know"`), bypassing diagnostic questions on the same skill.
  - Implemented budget checks: if a topic budget is exhausted, or if `2` or more questions have been asked on a topic and the candidate's responses are consistently weak (Partial/Vague/Claim-only), the interviewer terminates the topic and selects the next relevant milestone.
  - Structured `generateNextTopicQuestion()` to create custom, role-specific questions for each transition topic.
  - Stored assistant question content in a cache to prevent any duplicate questions from being asked.

---

## Part 2: Technical Summary of AI-Assisted Architecture

The AI assistance was leveraged as a pair programmer to build the underlying logical and state-transition engine of IGNIS AI. The development focused entirely on backend logic and programmatic guards, leaving the premium UI intact:

```
[Candidate Submission]
          │
          ▼
[isLackOfKnowledge / isDontKnow Interceptor] (Instantly flags negative answers)
          │
          ├─► Yes ──► Update Weakness = 5 ──► Transition to Next Topic
          │
          └─► No ───► [Semantic Classifier (llm/index.js)]
                            │
                            ▼
                      Check Relevance:
                      - Match topic keywords
                      - Detect off-topic domains
                            │
                            ├─► Off-Topic ─────► Flag INCORRECT ──► Clarification Redirect
                            ├─► Claim-Only ─────► Flag NEEDS_VERIF ─► Request Evidence
                            ├─► Tech-Detailed ──► Flag STRONG ──────► Increase Difficulty
                            └─► Vague ──────────► Flag VAGUE ───────► Ask Scenario Probe
                                      │
                                      ▼
                      [Budget & Repeated Failure Guard]
                      - Force next topic if budget is exhausted
                      - Force transition after 2 failed probes
```

This ensures that the interview adapts dynamically to the user's responses, updating their profile metrics and scoring report in real time while maintaining a natural, spoken-style conversation.
