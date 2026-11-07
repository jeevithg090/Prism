# Keystone n8n workflows

Three workflows connect Keystone to Discord, ElevenLabs and the job market. They were built and tested on n8n **2.46.6** (`n8nio/n8n:latest`). They use only core nodes: Webhook 2.1, Set 3.4, Code 2, IF 2.2, HTTP Request 4.2, Respond to Webhook 1.1, Schedule Trigger 1.2 and Manual Trigger 1.

| File | Trigger | What you see |
|---|---|---|
| `W3-pod-kickoff.json` | App → `POST /webhook/pod-kickoff` | A "🚀 <pod> is live!" message in Discord |
| `W2-monday-briefing.json` | Mondays at 08:00 Europe/London, or the Manual Trigger | An MP3 voice briefing plus the top 3 tasks in `#briefings` |
| `W1-market-refresh.json` | Sundays at 22:00, or the Manual Trigger | A callback that re-plans roadmaps, plus a "market moved" message in Discord |

The JSON files contain **no secrets**. You set everything in two places:

1. The **Config** node, which is the first node after the trigger in every workflow. It holds the URLs and IDs, and you only edit this node.
2. Two **Header Auth credentials**, which hold the secrets.

## One-time setup

### Import
In n8n, open **Workflows → Import from file** (or **⋯ → Import from file** inside an empty workflow) and pick the JSON file. Repeat for each workflow.

### Credentials
Go to **Credentials → Add credential → Header Auth** and create these two:

| Credential name (use exactly this) | Header name | Value |
|---|---|---|
| `Keystone shared secret` | `x-keystone-secret` | the app's `KEYSTONE_SHARED_SECRET` |
| `ElevenLabs API key` | `xi-api-key` | your ElevenLabs API key |

After you import a workflow, open each node that shows a credential warning and select the matching credential:

- **Webhook** (W3) and **Get briefing** (W2) use `Keystone shared secret`.
- **ElevenLabs TTS** (W2) uses `ElevenLabs API key`.
- **Notify Keystone callback** (W1) uses `Keystone shared secret`.

The exported files reference placeholder credential IDs, so n8n will ask you to choose the credential once.

### App env (Keystone side)
- `N8N_WEBHOOK_BASE_URL` is the production webhook base, for example `https://<you>.app.n8n.cloud/webhook` or `https://<ngrok>/webhook`. The app posts to `${N8N_WEBHOOK_BASE_URL}/pod-kickoff`.
- `KEYSTONE_SHARED_SECRET` must match the `Keystone shared secret` credential.
- `APP_URL` in the Config nodes must be reachable **from n8n**. On n8n Cloud, use the deployed app URL or an ngrok URL for the app, not `localhost`.

---

## W3: pod kickoff (live in the demo)

**What it does**

1. The Webhook node receives `POST /webhook/pod-kickoff`. It requires the `x-keystone-secret` header and returns **403** when the header is wrong or missing.
2. **Build Discord message** reads the request body and builds the message. The body looks like this:
   ```json
   { "podId": "pod-42", "podName": "Docker Dragons", "repoUrl": "https://github.com/org/repo",
     "members": ["Aisha Khan", "Sam Lee"], "title": "Campus Lost & Found API",
     "pitch": "One-paragraph pitch", "runId": "optional" }
   ```
   The message content reads: "🚀 **Docker Dragons is live!**", followed by the project, the members, the repo, and "First step: pick your issue and open a PR. Your reviewer is waiting." The embed is built as `{ title, description: pitch, url: repoUrl, color: 6514417, fields: one per member + "First step" }`. Every field is optional.
3. **Bot token configured?** chooses where the message goes:
   - **Bot branch.** This runs when `DISCORD_BOT_TOKEN` **and** `DISCORD_GUILD_ID` are set. The bot creates the text channel `pod-<slug-of-podName>` under `DISCORD_PODS_CATEGORY_ID` (if that is set) and posts the message there.
   - **Webhook branch.** This is the default. It posts the message to `DISCORD_WEBHOOK_URL` (the #pods webhook).
4. **Respond to Webhook** returns this JSON with HTTP 200:
   ```json
   { "discordChannelUrl": "https://discord.com/channels/<guild>/<channel>", "posted": true, "mode": "webhook" }
   ```
   - In bot mode, `discordChannelUrl` is the new channel.
   - In webhook mode, it is `PODS_CHANNEL_URL`.
   - If Discord fails, the workflow still responds 200 with `posted: false` and the #pods URL, so the app's 5-second trigger never hangs.

**Config node**

| Key | Example | Notes |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/…` | Webhook on `#pods` |
| `PODS_CHANNEL_URL` | `https://discord.com/channels/<guild>/<pods-channel>` | Right-click #pods → Copy Link |
| `DISCORD_BOT_TOKEN` | *(empty)* | Optional. **This is a secret stored in the Config node.** If you fill it in, don't re-export or commit the workflow without clearing it first. Leave it empty to use the webhook. |
| `DISCORD_GUILD_ID` | *(empty)* | Needed for bot mode. Turn on Developer Mode, then right-click the server → Copy ID. |
| `DISCORD_PODS_CATEGORY_ID` | *(empty)* | Optional "Pods" category for the new channels |
| `DISCORD_API_BASE` | `https://discord.com/api/v10` | Leave as is. It only exists so you can test against a mock. |
| `APP_URL` | `https://YOUR-APP-URL` | Not used yet. It is kept for consistency. |

For bot mode, invite the bot with the **Manage Channels**, **View Channel** and **Send Messages** permissions.

**Go live:** save the workflow, then click **Publish** (on older n8n versions this is the **Active** toggle). The production URL is `<n8n>/webhook/pod-kickoff`. The test URL `/webhook-test/pod-kickoff` only works while the editor is listening.

**Demo:** in the app, click **Start project** on a pod. Discord shows the pod announcement within about a second, and the app gets `discordChannelUrl` back.

To fire it by hand:
```bash
curl -X POST "$N8N_WEBHOOK_BASE_URL/pod-kickoff" \
  -H 'content-type: application/json' -H "x-keystone-secret: $KEYSTONE_SHARED_SECRET" \
  -d '{"podId":"pod-42","podName":"Docker Dragons","repoUrl":"https://github.com/keystone-demo/docker-dragons","members":["Aisha Khan","Sam Lee","Priya Patel"],"title":"Campus Lost & Found API","pitch":"Matches lost items to found reports."}'
```

---

## W2: Monday voice briefing

**What it does**

1. **Every Monday 08:00** (cron `0 8 * * 1`, workflow timezone Europe/London) **or Run now (demo)** starts the workflow.
2. **Config** supplies the settings.
3. **Get briefing** calls `GET {APP_URL}/api/briefing/{BRIEFING_USER_ID}` with `x-keystone-secret`. The response is the `ApiResult<Briefing>` envelope.
4. **Extract script** takes `data.script` and `data.topTasks`. It fails loudly if the response is not `ok:true`.
5. **ElevenLabs TTS** calls `POST https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128` with the `xi-api-key` header. The body is `{ "text": script, "model_id": "eleven_multilingual_v2" }`, and the response is saved as a binary file.
6. **Name the MP3** names the file `keystone-briefing-<user>-<weekOf>.mp3` with type `audio/mpeg`, so Discord shows an inline player.
7. **Post MP3 to #briefings** sends a multipart POST to the Discord webhook. It carries `files[0]` (the MP3) and `payload_json`, which is `{"content":"🎧 Your Keystone briefing for this week\n• task1\n• task2\n• task3"}`.

**Config node:** `APP_URL`, `BRIEFING_USER_ID` (default `aisha`), `DISCORD_WEBHOOK_URL` (a webhook on **#briefings**), `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` (default `eleven_multilingual_v2`) and `ELEVENLABS_API_BASE` (leave as is).

**Demo:** open the workflow and click **Execute workflow** on **Run now (demo)**. About 5–10 seconds later, `#briefings` shows the MP3 and the 3 tasks.

To have it run on Mondays by itself, publish the workflow.

---

## W1: weekly market refresh (lower priority)

**What it does**

1. **Every Sunday 22:00** (or **Run now (test)**) starts the workflow.
2. **Config** supplies the settings, and **Roles** turns `ROLES` into one item per role.
3. **Fetch market demand** calls `GET {APP_URL}/api/market/{role}?refresh=1` for each role. If one role fails, the other roles still run.
4. **Compare with last run** compares each skill's `share` with the previous run, which is kept in `$getWorkflowStaticData('global')`.
   - A skill "moved" if its share changed **relatively** by more than `MOVE_THRESHOLD`. The default `0.1` means 10%, so 0.41 → 0.52 counts as +26.8%.
   - The **first run only stores a baseline.**
5. **Any skill moved?** If yes, the workflow continues:
   - **Notify Keystone callback** calls `POST {APP_URL}/api/n8n/callback` with `x-keystone-secret` and this body:
     ```json
     { "workflow": "market-refresh",
       "result": { "moved": ["docker"],
                   "details": [{ "roleId": "ml-engineer", "skillId": "docker", "from": 0.41, "to": 0.52, "changePct": 26.8 }] } }
     ```
     `moved` is a deduplicated list of `skillId`s.
   - **Post to Discord** sends a summary, plus "🔁 Re-planned N roadmaps" taken from the callback's `data.replanned`.

**Config node:** `APP_URL`, `DISCORD_WEBHOOK_URL`, `ROLES` (default `ml-engineer,software-engineer,data-analyst`) and `MOVE_THRESHOLD` (default `0.1`).

**Note:** n8n may not save workflow static data for manual runs in the editor. Publish the workflow so the Sunday runs build the history. To demo it, run it twice through the CLI (`n8n execute --id=<id>`, which does persist static data) with changed market data in between.

---

## How these were validated
These checks ran in a throwaway `n8nio/n8n:latest` (2.46.6) container.

- `n8n import:workflow --input=<file>` imported all three files cleanly.
- **W3 end to end.** The Header Auth credential was imported with `n8n import:credentials`, the workflow was published, and `n8n start` was run. A local mock server stood in for Discord, and the sample payload was POSTed:
  - With no secret or a wrong secret, the webhook returned **403**.
  - With the correct secret, it returned **200** `{"discordChannelUrl":"…/channels/123/456","posted":true,"mode":"webhook"}`, and the mock received the expected `{content, embeds}`.
  - In bot mode, the mock received `POST /guilds/123/channels` `{name:"pod-docker-dragons", type:0, parent_id:"789"}` with `Authorization: Bot …`, then `POST /channels/<id>/messages`. The response carried the new channel URL.
  - With Discord unreachable, the webhook still returned 200 with `posted:false`.
- **W2 end to end**, run with `n8n execute` against the mock app, ElevenLabs and Discord:
  - The briefing GET carried `x-keystone-secret`.
  - The TTS POST carried `xi-api-key` and `{text, model_id}`.
  - Discord received multipart `files[0]` (`keystone-briefing-aisha-2026-11-09.mp3`, `audio/mpeg`) and `payload_json` with the 3 tasks.
- **W1 end to end**, run with `n8n execute` twice. The first run stored the baseline and posted nothing. On the second run, docker moved 0.41 → 0.52, so the workflow sent the callback with `moved:["docker"]` and then the Discord summary.
- Not tested against the real Discord or ElevenLabs APIs; only the mocks were used.
