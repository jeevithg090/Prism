# Demo audio

`briefing-aisha.mp3` is Aisha's weekly audio briefing, generated once from the script in `data/fixtures/briefing.aisha.json` and committed so the demo never depends on ElevenLabs being up. `POST /api/tts` streams this file in `DEMO_MODE` (or whenever ElevenLabs fails or its per-process budget is spent), and `buildBriefing` sets Aisha's `audioUrl` to `/demo/briefing-aisha.mp3` only when the file exists.

**Status: not generated yet.** It needs a live ElevenLabs key, so until someone runs the command below, the demo briefing falls back to the transcript ("Read instead") and `/api/tts` returns 501 in `DEMO_MODE`. Generate it before the demo.

To (re)generate it, run the dev server in live mode (`DEMO_MODE` unset, with `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `.env.local`), then run the command below from the repo root and commit the result.

- The command deletes the old file first. Otherwise, if ElevenLabs fails, `/api/tts` would quietly serve the old file and the run would look like it worked.
- `--fail` stops curl from saving a JSON error (501) as an `.mp3`.
- Check the printed header: it must say `x-keystone-audio-source: elevenlabs`, not `demo`.
- `file` must say "MPEG" or "Audio". If it doesn't, delete the file and check the server log.

```bash
rm -f public/demo/briefing-aisha.mp3 && \
curl --fail -sS -X POST http://localhost:3000/api/tts \
  -H 'content-type: application/json' \
  --data "$(jq '{text: .script}' data/fixtures/briefing.aisha.json)" \
  -D - -o public/demo/briefing-aisha.mp3 | grep -i '^x-keystone-audio-source' && \
file public/demo/briefing-aisha.mp3
```
