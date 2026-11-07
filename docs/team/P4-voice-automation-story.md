# P4: Voice (ElevenLabs), automation (n8n), story (pitch, video, Devpost)

**Mission:** You make Keystone **feel alive and win the room**. You own:
- the **ElevenLabs** AI mock interviewer, voice onboarding and weekly audio briefing,
- the **n8n** automations that tie Keystone to Discord and the job market,
- **everything judges read and hear**: the 60-second pitch, the demo video, Devpost, the README and the launch campaign.

You're also the team's **liaison with Reply**.

**You own:**
- `lib/n8n.ts`, `lib/briefing.ts`, `lib/voice/{elevenlabs,interviewScoring}.ts`, `lib/schemas/voice.ts`
- `app/api/{interview/config,interview/feedback,voice/tools/[tool],tts,briefing/[userId],n8n/trigger/[workflow],n8n/callback}/route.ts`
- `app/(app)/interview/page.tsx`, `app/launch/page.tsx`, `components/voice/*` (including the slots `BriefingPlayer` and `VoiceOnboardButton`)
- `n8n/*.json`, `data/fixtures/{interview.feedback.aisha,briefing.aisha}.json`, `public/demo/*`
- `e2e/interview.spec.ts`, `README.md` (structure)

**Review buddy:** P5 reviews your PRs. You review P3's PRs. P3 is the critical path, so review their PRs fast.

Read `docs/team/00-shared-contract.md` first. The contract wins.

---

## At a glance

| # | Deliverable | Priority | Due | Unblocks |
|---|---|---|---|---|
| S0 | **Reply desk:** OpenAI keys, model name, submission rules → Discord | MUST | **14:30** | everyone (LLM), submission |
| PR1 | Fixtures, `lib/n8n.ts`, stub routes | MUST | 15:00 | P5 (pod-kickoff), P3 (slots) |
| — | **Reply workshop pitch** (15:00–15:45) | MUST | 15:45 | feedback for the team |
| PR2 | Mock interview (ElevenLabs) + `/interview` + scoring | MUST | 16:15 | demo beat 8, interview-ready badge |
| PR3 | n8n W3 pod-kickoff + W2 Monday briefing (+ W1) | SHOULD | 16:35 | demo "Discord lights up" |
| PR4 | TTS + briefing API + `BriefingPlayer` | SHOULD | 16:45 | dashboard slot |
| PR5 | `VoiceOnboardButton` | SHOULD | 16:55 | onboarding slot |
| PR6 | `/launch` campaign page | SHOULD | 17:05 | Reply level 3 |
| — | **Story pack:** README, Devpost, video, pitch, Q&A | MUST | 17:40 | submission |

**You consume:**
- P2: `llmJSON`, `llmText`, `getStore`, `emit` (14:55); roadmap and profile data.
- P5: the pod (`store.get("pods")`).
- P1: `getTrends`.
- P3: the shared components and screenshots (17:05).

**You provide:**
```ts
// lib/n8n.ts
export type WorkflowName = "pod-kickoff" | "monday-briefing" | "market-refresh" | "pod-nudge" | "opportunity-watcher" | "newcomer-welcome";
export async function triggerWorkflow(name: WorkflowName, payload: Record<string, unknown>): Promise<boolean>;
export function verifySecret(req: Request): boolean;
// lib/briefing.ts
export async function buildBriefing(userId: string): Promise<Briefing>;
// lib/voice/elevenlabs.ts
export async function tts(text: string, voiceId?: string): Promise<ArrayBuffer>;
export async function getSignedConversationUrl(agentId: string): Promise<string>;
// lib/voice/interviewScoring.ts
export async function scoreInterview(i: { userId: string; roleId: string; transcript: string; durationSec: number }): Promise<InterviewFeedback>;
export function fillerWordsPerMin(transcript: string, durationSec: number): number;
// components
export function BriefingPlayer({ userId }: { userId: string }): JSX.Element;                              // components/voice/BriefingPlayer.tsx
export function VoiceOnboardButton({ onComplete }: { onComplete: (dna: Partial<LearningDNA>) => void }): JSX.Element; // components/voice/VoiceOnboardButton.tsx
```

---

## S0 (14:20–14:35): Reply desk first, then accounts
1. **At Reply's desk**, ask:
   - (a) for OpenAI keys for the team, and **which model to use** (`LLM_MODEL`, plus a cheaper `LLM_MODEL_FAST`);
   - (b) **how to submit** for the Reply challenge: Devpost track, Student Tech Clash form (studentclash.reply.com), or both;
   - (c) whether the **60-second pitch is live or recorded**, and when;
   - (d) whether there's anything they especially want to see.

   Post the answers in `#keystone-dev`, and send the keys privately.
2. **ElevenLabs:** elevenlabs.io → API key into `ELEVENLABS_API_KEY`. Choose a warm British voice in the Voice Library and put its id in `ELEVENLABS_VOICE_ID`.
3. **ElevenLabs Agents** (Conversational AI, in the dashboard): create **"Keystone Interviewer"** and **"Keystone Onboarding Coach"** (config in PR2 and PR5) and copy their agent IDs into the env.
4. **n8n:** n8n.io Cloud trial gives you a workspace URL. Alternatively, run it locally with `docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n`, plus `ngrok http 5678` for a public URL. Set `N8N_WEBHOOK_BASE_URL` (for example `https://<you>.app.n8n.cloud/webhook`).
5. **Discord:**
   - Create the server "Keystone Demo" with the channels `#keystone-dev`, `#pods` and `#briefings`.
   - Add a webhook on `#pods` → `DISCORD_WEBHOOK_URL`.
   - Optional: create a bot (Discord Developer Portal → Bot → token; invite it with Manage Channels permission) for creating channels in n8n.
6. Generate the shared secret with `openssl rand -hex 24`, put it in `KEYSTONE_SHARED_SECRET`, and add it to the n8n credentials as a header.
7. Clone the repo:
   ```bash
   gh repo clone <owner>/keystone && cd keystone && npm ci && cp .env.example .env.local
   ```

---

## PR1 (MUST, due 15:00): fixtures, n8n client, stub routes
**Branch:** `p4/fixtures-stubs`

### Steps
1. **`data/fixtures/interview.feedback.aisha.json`:** scores `{content:4, structure:3, clarity:4, confidence:3}`, `fillerWordsPerMin: 6.2`.
   - strengths: ["Clear explanation of your pod's Docker setup","Good use of a concrete example"]
   - improvements: ["Structure answers as situation → action → result","Pause instead of saying 'um'"]
   - A short transcript.
2. **`data/fixtures/briefing.aisha.json`:** a script of about 140 words: "Morning Aisha! Here's your Keystone briefing for the week of 9 November. Docker demand held steady at 41% of ML engineer ads… your pod merged two PRs… this week: finish your Dockerfile and…".
   - topTasks: 3.
   - marketMoves: ["LLM evaluation up 38% a year","PyTorch steady at 52% of ads"].
   - audioUrl: `/demo/briefing-aisha.mp3`.
3. **`lib/n8n.ts`:**
   ```ts
   import "server-only";
   export async function triggerWorkflow(name: WorkflowName, payload: Record<string, unknown>) {
     if (process.env.DEMO_MODE === "true" && !process.env.N8N_WEBHOOK_BASE_URL) return true;
     try {
       const r = await fetch(`${process.env.N8N_WEBHOOK_BASE_URL}/${name}`, { method: "POST", headers: { "content-type": "application/json", "x-keystone-secret": process.env.KEYSTONE_SHARED_SECRET ?? "" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
       return r.ok;
     } catch { return false; }
   }
   export function verifySecret(req: Request) { const s = process.env.KEYSTONE_SHARED_SECRET; return !!s && req.headers.get("x-keystone-secret") === s; }
   ```
   After a successful trigger, call `emit({runId?, agent:"n8n", status:"done", message:\`triggered ${name}\`})` when a runId is passed in the payload.
4. **`lib/schemas/voice.ts`:** `InterviewFeedbackZ`, `BriefingZ`, `FeedbackReqZ = z.object({ userId: z.string(), roleId: z.string(), transcript: z.string().min(1), durationSec: z.number().positive() })`, `TtsReqZ = z.object({ text: z.string().min(1).max(2500), voiceId: z.string().optional() })`.
5. **Stub routes:**
   - `GET /api/interview/config` → `{agentId:"demo", dynamicVariables:{name:"Aisha",role:"ML engineer",...}}`
   - `POST /api/interview/feedback` → the fixture
   - `POST /api/tts` → streams `public/demo/briefing-aisha.mp3` (generate it once in PR4; for now return 501 `{ok:false,error:{code:"not_ready"}}`)
   - `GET /api/briefing/[userId]` → the fixture (requires `verifySecret` **or** a same-origin request carrying the `ks_uid` cookie)
   - `POST /api/n8n/trigger/[workflow]` → `{triggered: await triggerWorkflow(...)}`
   - `POST /api/n8n/callback` → `verifySecret`, then `{ok:true}`
   - `POST /api/voice/tools/[tool]` → `verifySecret`, then `{}`

### Required tests
1. `triggerWorkflow` posts to `${base}/pod-kickoff` with the header `x-keystone-secret` (mock fetch) and returns true on 200 and false on a throw or timeout.
2. `verifySecret`: the correct header gives true, a wrong or missing one gives false, and false when the env var is unset.
3. `POST /api/n8n/callback` without the secret returns 401 `{ok:false}`.
4. `POST /api/interview/feedback` with an empty transcript returns 400.
5. The fixtures parse with their zod schemas.

**Ship it:**
```bash
npm run typecheck && npm run lint && npm test
git add -A && git commit -m "feat(voice): fixtures, n8n client + stub routes"
git push -u origin p4/fixtures-stubs
gh pr create --base main --title "feat(voice): fixtures, n8n client + stub routes" --body-file .github/pull_request_template.md --reviewer <P5-handle>
```

---

## 15:00–15:45: Reply workshop (MUST)
Go with one teammate if one can be spared. **Pitch Keystone in 60 seconds** using the script in `Keystone-Reply-GUH-2026.md` §17. Write down Reply's reactions, which words land, and what they ask. Post 3 bullets in Discord by 15:50 under "Reply feedback". Confirm the submission format again.

---

## PR2 (MUST, 15:45–16:15): AI mock interview
**Branch:** `p4/mock-interview` · **Files:** `lib/voice/elevenlabs.ts`, `lib/voice/interviewScoring.ts` (+ tests), real `GET /api/interview/config` and `POST /api/interview/feedback`, `app/(app)/interview/page.tsx`, `components/voice/{InterviewOrb,LiveCaptions,FeedbackCard,PreCallCard}.tsx` (+ tests), `e2e/interview.spec.ts`

### ElevenLabs Interviewer agent (configure it in the dashboard)
**System prompt:**
> You are a friendly, professional interviewer for UK graduate and internship roles. You are interviewing {{name}}, a year {{year}} Computer Science student at the University of Manchester, for a {{role}} position.
> Their strongest skills: {{top_skills}}. Skills they're building: {{gaps}}. Their current team project: "{{project_title}}". This week they're focusing on {{week_focus}}.
> Ask exactly 5 questions, one at a time, and wait for the answer: (1) a warm intro question, (2) a technical question on one of their strongest skills, (3) a question about their team project, specifically what they did and a challenge, (4) a question about a skill they're building and how they're learning it, (5) a behavioural question about teamwork or feedback.
> Use short follow-ups when answers are vague. Never answer for them. Keep each question under 30 words. Be encouraging. After question 5, thank them and say "That's the end of your practice interview. Your feedback is on screen." then end the call.

**First message:** "Hi {{name}}, thanks for joining. This is a five-minute practice interview for the {{role}} role. Ready? Tell me a little about yourself and what got you into computing."

**Settings:**
- Max duration 360 seconds.
- Language English.
- Voice = `ELEVENLABS_VOICE_ID`.
- **Enable authentication or signed URLs** (verify in docs) so the API key never reaches the browser.

### `lib/voice/elevenlabs.ts`
- **`getSignedConversationUrl(agentId)`:** a server `fetch` to ElevenLabs' get-signed-URL endpoint for Conversational AI with the header `xi-api-key` (at the time of writing `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=…`; **verify in docs**). Return `signed_url`.
- **`tts(text, voiceId)`:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId ?? env}` with headers `xi-api-key` and `accept: audio/mpeg` and body `{ text, model_id: "<multilingual model per docs>" }` (verify the model id in docs). Return an `ArrayBuffer`. Throw `VoiceError` on a non-200 response.

### `GET /api/interview/config?userId&roleId`
1. Load the profile, the roadmap (current week focus) and the pod (`store.list("pods",{userId})[0]`). Load the map from `store.get("maps", \`${userId}:${roleId}\`)`, falling back to the fixture, to get the top 3 proven skills and top 3 gaps.
2. Build `dynamicVariables` as strings: `{ name, year, role: roleName, top_skills, gaps, project_title, week_focus }`.
3. If `ELEVENLABS_API_KEY` and `ELEVENLABS_INTERVIEW_AGENT_ID` are set, include `signedUrl`. Otherwise return `{ agentId: "text-mode", dynamicVariables }`, and the page uses text mode.

### `lib/voice/interviewScoring.ts`
- **`fillerWordsPerMin(transcript, durationSec)`:**
  - Count only the **user's** lines (transcript lines prefixed `user:`).
  - Fillers are the regexes `\b(um+|uh+|erm+|you know|sort of|kind of|basically|literally)\b`, plus `\blike\b` **only** when it's surrounded by commas or comes at the start of a clause (`(^|, )like,`).
  - Return `round(count / (durationSec/60), 1)`.
- **`scoreInterview(i)`:** `llmJSON` with:
  - **system:** "You are an encouraging interview coach for university students. Score the CANDIDATE's answers only, 1-5 each for content (accuracy, depth), structure (clear situation→action→result), clarity (plain, concise), confidence (decisive, ownership). Give 2 specific strengths and 2 specific, actionable improvements quoting their words where possible."
  - **user:** `ROLE: ${roleName}\nTRANSCRIPT:\n${transcript.slice(0, 12000)}`
  - **schema:** `z.object({ scores: z.object({ content: z.number().int().min(1).max(5), structure: …, clarity: …, confidence: … }), strengths: z.array(z.string()).length(2), improvements: z.array(z.string()).length(2) })`
  - Merge in `fillerWordsPerMin`, `userId`, `roleId`, `transcript` and `createdAt`.
  - Save with `store.upsert("interviews", \`${userId}_${Date.now()}\`, fb, userId)` and `store.upsert("momentum_events", nanoid(), { id, userId, kind: "mock-interview", ts }, userId)`.
  - If the LLM fails, use neutral 3s, generic tips and the computed filler rate.

### `/interview` page UX (excellent, voice-first)
```
PageHeader "Practise your interview" — "5 minutes · voice · tailored to your ML engineer roadmap and pod project"

[PreCallCard]
  Role: ML engineer ▾        What to expect: 5 questions · ~5 min · feedback at the end
  🎙 Mic check: [Test microphone] → level meter bar → "Sounds good ✓"
  Privacy: "We don't store audio, only the transcript, so you can see your feedback."
  [Start interview]  (primary, large)        Prefer typing? [Use text mode]

[In call]
        ◯  InterviewOrb (240px): idle = soft breathing; agent speaking = indigo pulse rings;
           user speaking = teal ripple; connecting = spinner ring
        "Question 2 of 5"   04:12 remaining
  LiveCaptions (aria-live="polite"): alternating bubbles "Interviewer" / "You", latest at bottom, auto-scroll
  [Mute 🎙]  [End interview ⏹] (destructive outline)

[After call → FeedbackCard]
  "Nice work, Aisha!"   4 score bars (Content 4/5 …) with labels   Filler words: 6.2/min (aim < 4)
  ✓ Strengths (2)       ↗ Try next time (2)
  [Practise again]  [See it on your passport]   badge toast if avg ≥ 3.5: "🎤 Interview-ready unlocked!"
```

**Implementation:**
- `import { useConversation } from "@elevenlabs/react"`
- `const conv = useConversation({ onMessage: m => append(m), onError: e => toast.error("Voice connection dropped. Switching to text mode.") })`
- Start: `await navigator.mediaDevices.getUserMedia({audio:true})`, then `conv.startSession({ signedUrl, dynamicVariables })` (verify the option names against the installed SDK README).
- Use `conv.status` and `conv.isSpeaking` for the orb.
- Build the transcript from the `onMessage` events (`source` "ai" or "user"), formatted as `ai:` / `user:` lines.
- On end (by the agent or the user): `conv.endSession()`, then `apiPost("/api/interview/feedback", {userId, roleId, transcript, durationSec})`.

**Text mode** (no mic, no key, or an error):
- The same layout. The interviewer messages come from `llmText`, through a tiny server action `nextQuestion(history, vars)`, using the same system prompt.
- The user types answers.
- Questions are spoken with `speechSynthesis` if available.
- Feedback works the same way.

**States:**
- Mic denied → "We couldn't access your microphone." with [Use text mode].
- Connecting → orb spinner with "Connecting to your interviewer…".
- Error → ErrorState.
- Feedback loading → a skeleton bar group with "Scoring your answers…".

**Accessibility:** the orb is decorative (`aria-hidden`), with the status in an `sr-only` live region; buttons have labels; Space toggles mute; the motion respects reduced motion (static coloured ring).

### Required tests
1. `fillerWordsPerMin`: "user: um I think, like, it was basically fine" over 60 seconds gives 3.0. "user: I like Python" gives 0 (not a filler). AI lines are ignored.
2. `scoreInterview` with a mocked LLM merges the filler rate and stores both the interview and the momentum event (mock the store).
3. `scoreInterview` falls back to neutral 3s when the LLM throws.
4. The config route builds `dynamicVariables` with `project_title` from the pod and `week_focus` from the roadmap. With no ElevenLabs env it returns `agentId: "text-mode"`.
5. FeedbackCard renders 4 labelled bars, "6.2/min" and the improvements list.
6. Page: with `useConversation` mocked, status "connected" plus `isSpeaking` true gives the orb `data-state="agent"`; End calls `endSession` and posts feedback.
7. Mic denied (getUserMedia rejects) shows the "Use text mode" button.
8. e2e (`e2e/interview.spec.ts`, DEMO_MODE): `/interview?demo=1` shows the PreCallCard; text mode → answer one question → End → FeedbackCard visible; axe passes.

**Ship it:** commit `feat(interview): ElevenLabs mock interview with feedback`. Open the PR with `--reviewer <P5-handle>`, including a GIF and screenshots.

---

## PR3 (SHOULD, 16:15–16:35): n8n workflows (build W3 and W2 first)
**Branch:** `p4/n8n` · **Files:** `n8n/W3-pod-kickoff.json`, `n8n/W2-monday-briefing.json`, `n8n/W1-market-refresh.json` (exported, **with credentials removed**), `n8n/README.md`, and the real `POST /api/n8n/callback`

### W3 pod-kickoff (live in the demo)
1. **Webhook** node: POST at path `pod-kickoff`, authentication "Header Auth" (`x-keystone-secret`), respond "Using 'Respond to Webhook' node".
2. **Code** node: build the Discord message from `{{$json.body}}`: title `🚀 ${podName} is live!`, pitch, members, "Repo: ${repoUrl}", "First step: pick your issue and open a PR. Your reviewer is waiting."
3. **Branch A** (if a bot token is configured): a **Discord** node (Bot) with "Create channel" named `pod-${slug}` under the category "Pods", then a Discord "Send message" node into the new channel.
   **Branch B** (fallback): an **HTTP Request** node, POST `DISCORD_WEBHOOK_URL` with body `{ content, embeds:[{ title, description: pitch, url: repoUrl, color: 6514417, fields: members.map(...) }] }`.
4. **Respond to Webhook** node: `{ "discordChannelUrl": "<channel url or #pods url>" }`.

### W2 monday-briefing
1. **Schedule Trigger** (Mon 08:00 Europe/London) **plus** a **Manual Trigger**, so you can fire it live in the demo.
2. **HTTP Request:** GET `{APP_URL}/api/briefing/aisha` with header `x-keystone-secret`, giving JSON `Briefing`.
3. **HTTP Request:** POST `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` with header `xi-api-key`, body `{ text: {{$json.data.script}} }`, response format **File** (binary). Verify the model param in the docs.
4. **Discord** node or **HTTP Request** (multipart to the webhook URL with `file` = the binary, and `payload_json` = `{content: "🎧 Your Keystone briefing for this week"}`) posting to `#briefings`.

### W1 market-refresh (if time allows)
1. Schedule (Sun 22:00).
2. HTTP GET `{APP}/api/market/{role}?refresh=1` for each of the 3 roles (a Split In Batches loop).
3. Code: compare with the previous run (static data `$getWorkflowStaticData('global')`) and output the skills that moved more than 10%.
4. IF any moved: HTTP POST `{APP}/api/n8n/callback` with the header and `{ workflow:"market-refresh", result:{ moved:[…] } }`, then a Discord message.

### `POST /api/n8n/callback` (real)
1. `verifySecret`, returning 401 if it fails.
2. If `workflow === "market-refresh"`: for each profile whose primary role skills include a moved skill, call P2's `generateRoadmap` through `fetch(\`${APP}/api/roadmap/generate\`, {method:"POST", body:{userId, roleId}})` (don't import P2 internals). Emit `{agent:"n8n", status:"done", message:\`market moved: re-planned ${n} roadmaps\`}`.
3. Return `{ok:true, data:{replanned:n}}`.

### `n8n/README.md`
For each workflow: what it does, how to import it (n8n → Workflows → Import from file), which credentials to create (Header Auth, Discord Bot or webhook, ElevenLabs key as Header Auth `xi-api-key`), and how to demo it.

### Required tests (for the callback route)
1. No secret returns 401.
2. A market-refresh with moved `["docker"]` triggers a regenerate fetch for the profiles whose role skills include docker (mock the store and fetch), and the response shows the replanned count.
3. An unknown workflow returns 200 `{replanned:0}`.

**Manual check (paste screenshots in the PR):** trigger W3 from P5's "Start project" and see the message in Discord. Run W2 manually and see the MP3 in `#briefings`.

**Ship it:** commit `feat(n8n): pod kickoff, monday briefing, market refresh workflows`.

---

## PR4 (SHOULD, 16:35–16:45): TTS, briefing, `BriefingPlayer`
**Branch:** `p4/briefing`
1. **`buildBriefing(userId)`:**
   - Gather: the roadmap's current week (focus and tasks), the momentum `changePct` (from `GET /api/momentum/[userId]` or the store), the rising skills among the user's role skills (P1 `getTrends`), and the pod name with any merged PRs.
   - Call `llmText`:
     - **system:** "You are a warm, upbeat radio host giving a student a 60-second weekly career briefing. ~140 words. Plain English. Mention 1-2 market moves with numbers, their pod, and this week's 3 tasks. End with an encouraging line."
     - **user:** the JSON of the gathered data.
   - Return the `Briefing` with `topTasks` and `marketMoves`.
2. **`POST /api/tts`:** validate with `TtsReqZ`, call `tts()`, and return `new Response(buf, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } })`. In DEMO_MODE (or on error), stream `public/demo/briefing-aisha.mp3`.
3. **Generate the demo audio once** and commit it: `curl` your `/api/tts` with the fixture script > `public/demo/briefing-aisha.mp3`.
4. **`BriefingPlayer({userId})`** (dashboard card):
   - The header "🎧 Your weekly briefing" with "Week of 9 Nov".
   - A big round Play/Pause button (48px), a progress bar with time, and a speed toggle (1× / 1.25×).
   - The transcript collapsed under "Read instead" (accessibility).
   - States: loading skeleton; error "Couldn't load your briefing." with [Retry]; empty "Your first briefing arrives Monday."
   - It fetches `GET /api/briefing/${userId}`, then plays `audioUrl`, or falls back to `POST /api/tts` with the script as a blob URL.

**Tests:** BriefingPlayer toggles play and pause on an `HTMLAudioElement` mock and shows the transcript under "Read instead". With the LLM mocked, buildBriefing includes the focus skill and the momentum % in the prompt data. In DEMO_MODE, `/api/tts` returns `audio/mpeg`.

**Ship it:** commit `feat(briefing): weekly audio briefing + player`.

---

## PR5 (SHOULD, 16:45–16:55): `VoiceOnboardButton`
**Branch:** `p4/voice-onboard`
- **ElevenLabs "Onboarding Coach" agent:**
  - Prompt: "Have a friendly 2-minute chat to learn the student's target role, timeline, hours per week, whether they prefer theory or practice, budget, and any constraints. When you have enough, call the client tool save_dna with the values, then say 'Got it! Check the form and tap Continue.'"
  - Add a **client tool** `save_dna` with parameters `{ targetRoles: string[], timelineLabel: string, hoursPerWeek: number, theoryPractice: number, budget: "free"|"paid-ok", constraints: string[] }`.
- **Component:**
  - Use `useConversation({ clientTools: { save_dna: async (p) => { setPending(p); return "saved"; } } })`.
  - The button reads "🎙 Talk to the coach instead" and turns into a small orb with live captions while active.
  - On `save_dna`, show a **confirmation sheet** listing the extracted fields with checkmarks, plus [Apply to form] (which calls `onComplete(mapToDNA(p))`) and [Edit].
  - **The coach never submits anything itself.**
  - If voice isn't available, the component renders nothing (P3's slot handles absence).

**Tests:** the mapping clamps `hoursPerWeek` to 1–40 and `theoryPractice` to 0–100. [Apply] calls `onComplete` with a Partial<LearningDNA>. With no ELEVENLABS env, it renders null.

---

## PR6 (SHOULD, 16:55–17:05): Launch campaign `/launch` (Reply level 3)
**Branch:** `p4/launch`
- **Hero:** a deep indigo gradient with the slogan "Your degree is the foundation. **Build the bridge.**", the subtitle "Bridge Week · University of Manchester · first 500 students, 100 pods, 6 weeks", and CTAs [Join the waitlist] (an email input that stores to `store.upsert("waitlist", …)`, with consent text) and [Become a Trajectory ambassador].
- **Bridge Week timeline:** 5 steps (Week 0 launch at freshers' groups and the CS society → Week 1 pods formed → Weeks 2–5 build → Week 6 demo day + passports).
- **3 poster cards** (designed as actual posters, aspect 3:4, bold type):
  - "Don't pay for a course your degree already teaches."
  - "Proof, not claims."
  - "Find your pod."
  Each has a QR code (add `qrcode.react` through a `chore(deps)` PR, or embed a pre-generated SVG) pointing to the landing URL.
- **Ambassador section:** "Seniors: share your journey, earn 🤝 Helper and a certificate."
- **Success metrics band:** readiness change, verified skills per student, pods with merged PRs, newcomer help response time.
- **30-second video section:** an embed placeholder plus the ElevenLabs voiceover script (below).
- **Accessibility:** the posters have real text, not images of text.

**30-second voiceover script:**
> "Your degree teaches you a lot. But nobody tells you what it covers, what industry wants, and what to learn next. Keystone reads your syllabus, the live job market and your real code, then builds your bridge. Learn in a pod. Prove every skill. Your degree is the foundation. Build the bridge."

**Tests:** the waitlist rejects invalid emails; the poster headings render as text; axe passes.

---

## Story pack (MUST, 17:05–17:40): what judges read and hear
1. **README.md** (structure; each owner adds their section by 17:20):
   - Title, one line, badges (Reply · Firecrawl · n8n · ElevenLabs).
   - Problem (with the ISE stats).
   - Solution, screenshots (from P3).
   - **Architecture** (the mermaid diagram from the master plan §5.2) and the **agents table**.
   - **Sponsor tech:** Firecrawl (syllabus, ads, resources), n8n (6 workflows), ElevenLabs (interviewer, coach, briefings), OpenAI (via Reply).
   - How to run: `npm ci`, `.env.local`, `npm run dev`, and `DEMO_MODE=true`.
   - Testing (`npm test`, `npm run test:e2e`).
   - Ethics and privacy (master plan §20).
   - Team.
2. **Devpost** (fill every field):
   - Name "Keystone". Tagline "Your degree is the foundation. Keystone builds the bridge to industry."
   - Story sections: Inspiration / What it does / How we built it / Challenges / Accomplishments / What we learned / What's next.
   - Built with: nextjs, typescript, tailwind, openai, firecrawl, n8n, elevenlabs, supabase, github-api, adzuna, recharts.
   - Links: the repo, the live URL, the video.
   - **Tracks:** Reply challenge + Firecrawl, n8n and ElevenLabs sponsor prizes, if offered.
3. **Demo video** (2–3 minutes, recorded 17:05–17:30 with QuickTime or OBS at 1080p): follow master plan §17 beats 1–9 with a voiceover. Use DEMO_MODE so it's smooth. Export and upload (YouTube unlisted).
4. **60-second pitch** (final, from master plan §17), adjusted to the Reply workshop feedback. Rehearse it 3 times and time it.
5. **Judge Q&A cheat sheet:** print master plan §21 and add Reply's workshop questions.
6. **Submission checklist:** Devpost submitted by 17:45 **and** Reply's own process (from S0); the repo is public; the video link works in a private window.

---

## 16:15 integration checkpoint (your part)
- [ ] `/interview` works in voice mode on a laptop with a mic, and text mode works without one.
- [ ] P5's Start project triggers W3, and the message appears in Discord.
- [ ] The `BriefingPlayer` slot renders on the dashboard.

## Bug bash (16:50–17:05)
Test **P3's** `/onboard`, `/map`, `/roadmap` and `/dashboard`: keyboard-only navigation, mobile at 375px, dark mode, the 4 states, and axe. File issues in Discord with screenshots.

## Demo role
You're the **narrator**: give the hook, beat 8 (live mock interview, 20 seconds), and the close. Fire W2 manually so the audio briefing pops into Discord. **Fallback:** text-mode interview plus the committed MP3.

## Cut list (in this order)
W1 → `/launch` QR codes → VoiceOnboardButton → the BriefingPlayer's live TTS (use the committed MP3) → n8n bot channel creation (use the webhook embed). **Never cut:** the Reply desk answers, the mock interview (at least text mode), W3, the story pack, the submission.

## Risks
- **Venue Wi-Fi kills voice:** text mode plus a pre-recorded interview clip in the video.
- **ElevenLabs API changes:** wrap the SDK, mark "verify in docs", test at 15:50.
- **n8n Cloud trial limits:** fall back to local Docker + ngrok.
- **Late submission:** submit a draft on Devpost at 17:30 and update it before 17:50.

---

## PASTE THIS INTO YOUR CODING AGENT
> You are P4's coding agent on the Keystone hackathon repo. Read `docs/team/00-shared-contract.md` fully, then `docs/team/P4-voice-automation-story.md`. Execute PR1 → PR6 in order (S0, the workshop and the story pack are done by me). For each:
> 1. `git switch main && git pull --ff-only && git switch -c <branch>`
> 2. Write the listed tests first. Mock fetch, `@/lib/llm`, `@/lib/store`, and `@elevenlabs/react` (`useConversation`).
> 3. Implement exactly the signatures in "You provide". Check `node_modules/@elevenlabs/react/README.md` for the current `useConversation` option names, and keep the API key server-side only.
> 4. Run `npm run typecheck && npm run lint && npm test`.
> 5. Commit, push, then `gh pr create --base main --title "<title>" --body-file .github/pull_request_template.md --reviewer <P5-handle>`, with the test output and screenshots or GIFs.
> 6. Give me the PR URL and stop.
>
> Never push to `main`. Only edit P4-owned files. Every JSON route returns the `ApiResult` envelope with zod input validation. Secret-protected routes use `verifySecret`. Honour `DEMO_MODE` (fixtures, committed MP3, text mode). UI follows contract §9 (shared components, tokens, the 4 states, keyboard and aria, mobile, reduced motion, axe). Export n8n workflows with credentials stripped. If something in my file conflicts with the contract, follow the contract and tell me.
