# Demo Shot List — 30s video

Voiceover source: `ADS/copy.json` → `video_script` (unchanged).
Footage source: `demo-footage.cjs` → `/tmp/agentflow-demo/` (re-run anytime).
Stills: `shots/beat-*.png` next to the video. Trim the `.webm` to 30s in edit.

| Beat | Time | Visual (file) | VO | Edit notes |
|---|---|---|---|---|
| 1 | 0–3s | `beat-1-empty.png` — empty canvas, rail LED | "One canvas." | Cold open on the instrument. LED pulses amber. |
| 2 | 3–7s | `beat-2-modules.png` — 5 modules land one by one | "You wire it — drag, connect, feel the flow take shape." | Footage shows agent-placed modules + YOU-tagged ToolLog lines; equivalent framing for a human-drag take. |
| 3 | 7–12s | `beat-3-wired.png` — wires + `true`/`false` labels | "Your agent drives it — same canvas, same tools, no guessing." | Linger on the AGENT-tagged `add_node` / `connect_nodes` ToolLog lines. |
| 4 | 12–18s | video mid-section — readout flips IDLE → COMPLETE | "Amber is you. Cyan is your agent. Watch every signal march." | Slow to 0.5× over the signal march if needed. |
| 5 | 18–24s | `beat-4-complete.png` — COMPLETE + "Workflow complete — 799ms" + replay timeline | "Fifteen modules. Nineteen tools. One shared engine." | Banner + timeline are the proof shot. Do not cut before the banner lands. |
| 6 | 24–30s | `beat-5-cta.png` — hold on logo + canvas | "AgentFlow. Open the instrument — agentflow-hackathon.pages.dev" | End card: overlay the tool URL + repo URL. |

Regenerate: `AGENTFLOW_URL=https://agentflow-hackathon.pages.dev/ node demo-footage.cjs`
