# AI Interview Agent — ABTalks PS2

An adaptive interview agent that interviews a cohort candidate based on their
actual curriculum progress, follows up naturally, and produces structured
feedback. Built for the ABTalks vibecoding hackathon.

## Stack

- Node.js + Express (single service, single endpoint per spec)
- Claude (Anthropic) or Gemini for interview logic — swap via `LLM_PROVIDER`
- No database — in-memory session state, keyed by `sessionId` (persistent
  accounts are explicitly out of scope)

## The "thoughtful idea": weakness-weighted questioning

The agent doesn't just ask about days the candidate completed. It scores
every mission by a weakness signal:

| Signal | Score |
|---|---|
| Skipped entirely | 5 |
| Passed on 4+ attempts | 4 |
| Passed on 3 attempts | 3 |
| Passed on 2 attempts | 2 |
| Passed on first try | 1 |

The interview plan leads with the highest-weakness topics and gives them a
bigger question budget (up to 3 follow-ups), while first-try passes get a
single quick check. So a candidate who barely scraped through "Prompt
Engineering Fundamentals" on their 4th attempt gets probed much harder there
than someone who nailed it first try — that's the differentiator the spec
rewards, and it's driven entirely by the real signals in `candidates.json`,
not just pass/fail.

Curriculum objectives (from `curriculum.json`) are also injected into the
prompt per day, so questions are grounded in what was actually taught, not
just the day's title.

## Setup

```bash
npm install
cp .env.example .env
# fill in ANTHROPIC_API_KEY (or GEMINI_API_KEY + set LLM_PROVIDER=gemini)
npm start
```

Server runs on `http://localhost:3000` (override with `PORT`).

## Testing locally

```bash
# in one terminal
npm start

# in another
node test/manual-test.js        # interviews candidates.json[0]
node test/manual-test.js 3      # interviews candidates.json[3]
```

Or by hand with curl:

```bash
curl -X POST http://localhost:3000/api/interview \
  -H "content-type: application/json" \
  -d '{"sessionId":"demo-1","candidate": <one object from data/candidates.json>}'

curl -X POST http://localhost:3000/api/interview \
  -H "content-type: application/json" \
  -d '{"sessionId":"demo-1","message":"your answer here"}'
```

## Project structure

```
server.js                Express entry point
src/routes.js             POST /api/interview — start vs. turn dispatch
src/interviewEngine.js    Core flow: start / decide follow-up vs next topic / conclude
src/planBuilder.js        Weakness-weighted topic plan from candidate + curriculum
src/promptBuilder.js      System prompts for opening / turn decisions / feedback
src/llm/                  Provider adapters (anthropic.js, gemini.js) + router
src/store.js              In-memory session store
data/                     curriculum.json, candidates.json (as provided)
test/manual-test.js       End-to-end smoke test against a running server
```

## Deploying

Any Node host works (Render, Railway, Fly.io, a VPS). Set the env vars from
`.env.example` in the platform's dashboard, then `npm start` (or let the
platform run it via `package.json`'s `start` script). No build step needed.
