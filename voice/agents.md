# ElevenLabs agents: copy-paste setup

Keystone uses two ElevenLabs Conversational AI agents (also called "Agents" in the dashboard):

| Agent | Used by | Env var for its id |
|---|---|---|
| **Keystone Interviewer** | `/interview` (mock interview) | `ELEVENLABS_INTERVIEW_AGENT_ID` |
| **Keystone Onboarding Coach** | `VoiceOnboardButton` on `/onboard` | `ELEVENLABS_ONBOARD_AGENT_ID` |

The browser never sees the API key. It calls `GET /api/interview/config?userId=…&agent=interview|onboard`, and the server
returns a short-lived **signed URL** for the right agent. Without the key or agent id (or with `DEMO_MODE=true`), the
config returns `agentId: "text-mode"`: the interview falls back to text mode and the voice onboarding button hides itself.
The button asks for a fresh signed URL each time the student taps it, because signed URLs expire after about 15 minutes.

> **Heads-up:** the Onboarding Coach also needs `ELEVENLABS_INTERVIEW_AGENT_ID` to be set. The server's voice check
> (`voiceConfigured()` in `lib/voice/elevenlabs.ts`) looks for the API key **and** the interviewer's agent id, even for
> `agent=onboard`. If you set up only the coach, the config returns `text-mode` and the voice button stays hidden.

ElevenLabs renames dashboard menus now and then. If a label below doesn't match, look for the closest one. The dry run of
`voice/create-agents.mjs` (below) prints the API fields for the settings it sends, and the top of that script lists the
docs pages each one was checked against.

## Checklist: settings that must be right (checked against the ElevenLabs docs, Nov 2026)

Tick these on **both** agents unless a line says otherwise.

- [ ] **Security → Enable authentication (signed URLs): ON.** Do **not** also add an allowlist. The docs say: "Do not
      configure signed URLs and allowlists together on the same agent."
- [ ] **Security → Overrides: leave OFF.** Dynamic variables need no toggle, but the app must send every `{{var}}` used in
      the prompt or first message. Interviewer: `name`, `year`, `role`, `top_skills`, `gaps`, `project_title`,
      `week_focus`. Coach: `name`.
- [ ] **Coach only, Tools → client tool `save_dna`.** The name is case-sensitive and must be exactly `save_dna`. Add the
      parameters from section 2 and turn **Wait for response: ON**.
- [ ] **Advanced → Client events:** `user_transcript` and `agent_response` must be selected, because the live captions
      depend on them. Keep `audio` and `interruption` selected too (no sound or no barge-in without them), plus
      `agent_response_correction`, and `client_tool_call` on the coach.
- [ ] **Advanced → Call limits → Max conversation duration:** Interviewer `360` s, Coach `180` s.
- [ ] **Interviewer only, system tool End call: ON.** Dashboard agents get it by default; agents made through the API
      don't, unless it's added (the script below adds it).
- [ ] **Optional server tools** (`get_role_skills`, `log_interview` → `{APP_URL}/api/voice/tools/<tool>`): set header
      `x-keystone-secret` with type **Secret** (Create New Secret, value = `KEYSTONE_SHARED_SECRET`), not plain text.

## Create them with the script instead

`voice/create-agents.mjs` creates both agents through the ElevenLabs API, with the settings in the checklist, and writes
their ids into `.env.local`. It reads the first messages and system prompts from this file, so edit them here.

```bash
# 1. Put ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.local (section 0).
node voice/create-agents.mjs                 # dry run (default): prints the exact requests, sends nothing
node voice/create-agents.mjs --create        # creates the save_dna tool + both agents, writes
                                             # ELEVENLABS_INTERVIEW_AGENT_ID and ELEVENLABS_ONBOARD_AGENT_ID
node voice/create-agents.mjs --create --only onboard   # just one agent; add --force to replace an id that's already set
```

The key is sent only as the `xi-api-key` header and is never printed. The script leaves a few things for the dashboard,
and lists them when it finishes: the LLM (platform default), overrides (off) and the optional server tools (they need a
public `{APP_URL}` and a workspace secret). Run the test checklist in section 3 afterwards.

---

## 0. Environment variables

Set these in `.env.local` (and in Vercel for the deployed app). Never commit real values.

```bash
ELEVENLABS_API_KEY=            # elevenlabs.io → Profile → API keys (server only)
ELEVENLABS_VOICE_ID=           # Voice Library → a warm British voice → copy its voice id
ELEVENLABS_INTERVIEW_AGENT_ID= # from step 1 (agent id, starts with "agent_")
ELEVENLABS_ONBOARD_AGENT_ID=   # from step 2 (the coach also needs ELEVENLABS_INTERVIEW_AGENT_ID set, see the heads-up above)
KEYSTONE_SHARED_SECRET=        # openssl rand -hex 24; server tools send it as x-keystone-secret
NEXT_PUBLIC_APP_URL=           # public URL of the app, e.g. https://keystone.vercel.app (used as {APP_URL} below)
```

Server tools only work when `{APP_URL}` is reachable from the internet (Vercel, or `ngrok http 3000` locally).

---

## 1. Keystone Interviewer

Dashboard → **Agents** → **Create agent** → **Blank template** → name it `Keystone Interviewer`.

### Agent tab

**First message** (copy exactly):

```text
Hi {{name}}, thanks for joining. This is a five-minute practice interview for the {{role}} role. Ready? Tell me a little about yourself and what got you into computing.
```

**System prompt** (copy exactly):

```text
You are a friendly, professional interviewer for UK graduate and internship roles. You are interviewing {{name}}, a year {{year}} Computer Science student at the University of Manchester, for a {{role}} position.
Their strongest skills: {{top_skills}}. Skills they're building: {{gaps}}. Their current team project: "{{project_title}}". This week they're focusing on {{week_focus}}.
Ask exactly 5 questions, one at a time, and wait for the answer: (1) a warm intro question, (2) a technical question on one of their strongest skills, (3) a question about their team project, specifically what they did and a challenge, (4) a question about a skill they're building and how they're learning it, (5) a behavioural question about teamwork or feedback.
Use short follow-ups when answers are vague. Never answer for them. Keep each question under 30 words. Be encouraging. After question 5, thank them and say "That's the end of your practice interview. Your feedback is on screen." then end the call.
```

**Dynamic variables.** The app sends all of these as strings from `/api/interview/config`. In the dashboard, give each a
placeholder so the "Test AI agent" button works:

| Variable | Placeholder for testing |
|---|---|
| `name` | Aisha |
| `year` | 1 |
| `role` | ML engineer |
| `top_skills` | Python, Git, HTML and CSS |
| `gaps` | Docker, PyTorch, SQL |
| `project_title` | VisionAid: accessible image captioning API |
| `week_focus` | Docker |

**Language:** English. **LLM:** leave the default (or a fast model; answers are short).

### Voice tab
- Voice: paste the id from `ELEVENLABS_VOICE_ID`.

### Advanced tab
- **Max conversation duration** (under **Call limits**): `360` seconds.
- **Client events:** `user_transcript` and `agent_response` selected (captions), with `audio`, `interruption` and
  `agent_response_correction`.
- Turn timeout: leave the default.
- System tool **End call**: enabled (the prompt tells the agent to end the call after question 5). It's on by default for
  agents made in the dashboard.

### Security tab
- **Enable authentication: ON.** This is what makes the agent reachable only through a signed URL from our server, so the
  API key never reaches the browser. Don't add an allowlist as well. (The API field is `platform_settings.auth.enable_auth`.)
- **Overrides:** leave off. The app only sends dynamic variables, not prompt overrides.

### Tools tab (optional server tools)

The interview works without these: the page already scores the call through `POST /api/interview/feedback`.
Add them only if you want the agent to look things up live, or to log interviews held outside the page.

Every server tool uses:
- Type: **Webhook**, Method **POST**
- Header `x-keystone-secret`, header type **Secret** → **Create New Secret** with the value of `KEYSTONE_SHARED_SECRET` (never paste it as a plain-text header)
- Body: JSON with the parameters at the top level

**`get_role_skills`**
- URL: `{APP_URL}/api/voice/tools/get_role_skills`
- Description: `Look up the most in-demand skills for a role, with the share of UK job ads that ask for each. Use it to pick a relevant technical question.`
- Body parameters:

```json
{
  "type": "object",
  "properties": {
    "roleId": {
      "type": "string",
      "description": "Role id: one of ml-engineer, software-engineer, data-analyst. Use ml-engineer if unsure."
    }
  },
  "required": ["roleId"]
}
```

**`log_interview`** (skip this one if the call always happens on `/interview`, or each interview is stored twice)
- URL: `{APP_URL}/api/voice/tools/log_interview`
- Description: `Save the finished interview so the student gets feedback. Call once, after the last question.`
- Body parameters:

```json
{
  "type": "object",
  "properties": {
    "userId": { "type": "string", "description": "The student's user id, e.g. aisha." },
    "roleId": { "type": "string", "description": "Role id: ml-engineer, software-engineer or data-analyst." },
    "transcript": { "type": "string", "description": "The conversation as lines starting with 'ai:' or 'user:'." },
    "durationSec": { "type": "number", "description": "Length of the call in seconds." }
  },
  "required": ["userId", "roleId", "transcript", "durationSec"]
}
```

Copy the agent id (top of the agent page, or **Widget** tab) into `ELEVENLABS_INTERVIEW_AGENT_ID`.

---

## 2. Keystone Onboarding Coach

Dashboard → **Agents** → **Create agent** → **Blank template** → name it `Keystone Onboarding Coach`.

### Agent tab

**First message:**

```text
Hi {{name}}! I'm your Keystone coach. In about two minutes I'll ask a few quick questions, then fill in your setup form for you to check. What kind of role are you aiming for?
```

Dynamic variable placeholder: `name` = `there`. The app sends only `name` (from `/api/interview/config?agent=onboard`).

**System prompt** (the PR5 prompt, plus guard rails so the values map cleanly):

```text
Have a friendly 2-minute chat to learn the student's target role, timeline, hours per week, whether they prefer theory or practice, budget, and any constraints. When you have enough, call the client tool save_dna with the values, then say 'Got it! Check the form and tap Continue.'

Guidelines:
- Ask one short question at a time, in plain, kind, second-person English. Keep the whole chat under 2 minutes.
- Target role: Keystone supports three roles. Map what they say to the ids ml-engineer, software-engineer or data-analyst. At most 2 roles; the first is their main one.
- Timeline: a short label in their words, e.g. "Placement applications Sept 2027".
- Hours per week: a whole number from 1 to 40.
- Theory or practice: a number from 0 (all theory) to 100 (all practice). 50 means an even mix.
- Budget: "free" if they only want free resources, "paid-ok" if paying for a course is fine.
- Constraints: short phrases such as "part-time job", "caring", "commuting". Use an empty list if there are none.
- If they don't know an answer, make a sensible guess, say it out loud and move on.
- You never submit anything yourself. The student checks the form and taps Continue.
- If you're told the student wants to change something, ask what to change, then call save_dna again with all the values.
```

**Language:** English.

### Voice tab
- Voice: the same `ELEVENLABS_VOICE_ID`.

### Advanced tab
- **Max conversation duration** (under **Call limits**): `180` seconds.
- **Client events:** the same as the Interviewer (`user_transcript`, `agent_response`, `audio`, `interruption`,
  `agent_response_correction`), plus `client_tool_call` so `save_dna` reaches the browser.

### Security tab
- **Enable authentication: ON** (signed URLs only, same as the Interviewer; no allowlist).
- **Overrides:** leave off.

### Tools tab: client tool `save_dna`

**Add tool** → Type **Client** (runs in the browser, not a webhook).
- Name: `save_dna` (case-sensitive: it must match `clientTools.save_dna` in `VoiceOnboardButton.tsx`)
- Description: `Save the student's onboarding answers so they can check them on screen. Call once you know the role, timeline, hours per week, theory or practice preference, budget and constraints.`
- **Wait for response: ON.** The browser replies `"saved"`, then the agent says "Got it! Check the form and tap Continue."
- Parameters:

```json
{
  "type": "object",
  "properties": {
    "targetRoles": {
      "type": "array",
      "description": "1 or 2 role ids, main role first.",
      "items": { "type": "string", "enum": ["ml-engineer", "software-engineer", "data-analyst"] }
    },
    "timelineLabel": {
      "type": "string",
      "description": "Short label for their goal and timing, e.g. 'Placement applications Sept 2027'."
    },
    "hoursPerWeek": {
      "type": "number",
      "description": "Hours they can spend each week, a whole number from 1 to 40."
    },
    "theoryPractice": {
      "type": "number",
      "description": "0 = all theory, 100 = all practice, 50 = even mix."
    },
    "budget": {
      "type": "string",
      "enum": ["free", "paid-ok"],
      "description": "'free' for free resources only, 'paid-ok' if paid courses are fine."
    },
    "constraints": {
      "type": "array",
      "description": "Things to plan around, e.g. 'part-time job', 'caring', 'commuting'. Empty if none.",
      "items": { "type": "string" }
    }
  },
  "required": ["targetRoles", "timelineLabel", "hoursPerWeek", "theoryPractice", "budget", "constraints"]
}
```

Do **not** add the `save_dna` **server** tool (`/api/voice/tools/save_dna`) to this agent: the coach must not write
anything. The browser handles `save_dna`, shows the answers in a confirmation sheet, and only the student's
**Apply to form** puts them into the form. `lib/voice/dna.ts` (`mapToDNA`) cleans the values again anyway: it clamps
hours to 1–40 and theory/practice to 0–100, keeps only known role ids (max 2), maps phrases like "free only" or "paid ok",
and drops anything it can't use.

Copy the agent id into `ELEVENLABS_ONBOARD_AGENT_ID`.

---

## 3. Two-minute test checklist

1. **Env:** restart `npm run dev` after editing `.env.local`. `DEMO_MODE` must not be `true` for live voice.
2. **Config, interviewer:** open `/api/interview/config?userId=aisha` and check you get `agentId: "agent_…"`, a `signedUrl`
   starting with `wss://`, and all 7 `dynamicVariables`. `agentId: "text-mode"` means a key or agent id is missing.
3. **Config, coach:** open `/api/interview/config?userId=aisha&agent=onboard` and check you get the coach's agent id and a `signedUrl`.
   If you get `text-mode`, check that `ELEVENLABS_API_KEY`, `ELEVENLABS_ONBOARD_AGENT_ID` **and** `ELEVENLABS_INTERVIEW_AGENT_ID` are all set.
4. **Interview:** on `/interview`, tap **Start interview** and allow the mic. You should hear "Hi Aisha… ML engineer role…",
   see live captions, and the orb should pulse while the agent talks. Answer once, tap **End interview**, and check the feedback card appears.
5. **Coach:** on `/onboard`, tap **🎙 Talk to the coach instead**. Say "ML engineer, placements next September, about 8 hours a week,
   mostly practical, free stuff only, I have a part-time job." Check the sheet lists those answers with ticks, tap **Edit**
   (the chat keeps going), then tap **Apply to form** after the next save and check the form fields update. Nothing should be submitted until you tap Continue.
   If the chat ends while the sheet is open, the button reads **Close**: your answers stay, and **Review your answers** reopens them.
6. **Fallback:** remove `ELEVENLABS_ONBOARD_AGENT_ID` (or set `DEMO_MODE=true`), reload `/onboard`, and check the voice button is gone and the form still works.
7. **Server tools (if added):** `curl -X POST {APP_URL}/api/voice/tools/get_role_skills -H "content-type: application/json" -H "x-keystone-secret: $KEYSTONE_SHARED_SECRET" -d '{"roleId":"ml-engineer"}'` returns `{ "ok": true, … }`; without the header it returns 401.
