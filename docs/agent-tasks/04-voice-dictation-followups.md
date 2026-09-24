# 04 — Voice dictation: resume once the Google billing question is settled

**Status:** Paused 2026-09-24, by the user's choice — not a technical blocker. v1 (dictate into any focused text field, `Ctrl+D`) is built, merged to `main`, and working per its own "Verified" list. The user stopped here because enabling Google Cloud Speech-to-Text asked for a €25 payment they weren't expecting, and other work (the AI agent command layer, below) took priority. Nothing here needs to happen until the user says so.

A cold agent needs only this brief plus CLAUDE.md and the two docs it points to below.

## 0. Read first, in this order

1. The feature entry **"Voice dictation (`Ctrl+D`)"** in `docs/features/implemented-features.md` (search for it) — the authoritative record of what's built: the pipeline (`src/services/speech/`), the edge function (`api/speech-recognize.ts`), the usage-cap migration (`030_speech_usage.sql`, **Applied**), the UI (`VoiceIndicator`), what's verified and what isn't.
2. This file's section 2 (what changed since it was built) and section 3 (the billing question).
3. If actually resuming: `docs/ai/01-capability-inventory.md` and `docs/ai/02-command-layer.md` — the agent command layer didn't exist when voice dictation was designed, and it changes what "`Ctrl+D` with nothing focused" should do (section 2).

## 1. What's built, in one paragraph

Click into any text field, press `Ctrl+D`, speak, pause: the phrase is sent to `api/speech-recognize.ts` (Google's `speech:recognize` v1 REST, not streaming — Vercel Edge can't hold a gRPC stream), and the returned text is typed into the field. `Ctrl+D` again or plain `Enter` finishes; `Esc` cancels (via `useEscapeClose`, like every other overlay). It stops itself after 20 s of silence or 2 minutes total. The engine is swappable — `src/services/speech/dictation.ts` has one `engine` line — but only the Google engine (`engines/googleEngine.ts`) exists. Full detail, including what was verified and what wasn't, is the implemented-features entry in section 0.

**With nothing focused, `Ctrl+D` just says "click into a text field first."** The voice pane / AI-agent entry point described in the original design was deliberately not built — see section 2.

## 2. What changed since this was designed — read before resuming

Voice dictation was built and documented (2026-09-20) **before** the AI agent command layer existed. It does now: `src/agent/` (Chunk A, merged to `main` 2026-09-24) has `runCommand(name, input, opts)`, 22 commands across tasks/calendar/schedules/Endeavours/Purposes/Tags, risk tiers, an approval policy, and an audit log — see `docs/ai/02-command-layer.md`.

This matters directly to "`Ctrl+D` with nothing focused opens a voice pane whose destination is the agent" (BACKLOG.md → "AI Agent Integration" → "Voice → agent"): that pane's job is now concrete — take the transcript, get it in front of a model that can call `runCommand`, not a hypothetical future interface. Read `docs/ai/01-capability-inventory.md` section 7 (the tool plan) before designing it; don't build a second, parallel way of doing what the agent layer already does. There's no chat UI or model wiring yet either (`docs/agent-tasks/03-ai-assistant-next-steps.md` is that brief) — voice-to-agent likely depends on that landing first, or at least on deciding together which comes first.

## 3. The billing question — settled 2026-09-24

The user's Google Cloud Console showed: *"Your service requires a one-time payment of at least €25.00 to become active"* under a **Postpay** billing account — pay-as-you-go with a €100 threshold, no further charge until usage reaches that threshold, but the account itself won't activate without this initial payment. **This is real** — Google requires a minimum initial payment to activate a Postpay billing account in at least some regions, separate from and in addition to the general "$300 free-trial credit for new customers" framing (that trial evidently wasn't offered, or didn't apply, to this account/region — nobody has determined why, and it doesn't matter now). It isn't a scam, a one-off card-verification hold, or an error to work around — it's the account-activation cost as Google currently presents it. The €25 would become spendable balance, not a pure loss, but the user chose not to spend it to unblock a feature that otherwise costs cents a month, and that's the end of the investigation — **don't re-litigate this** if picked back up later; if Google is revisited, budget for this real €25 up front.

**Decision (2026-09-24): use Windows' built-in dictation (`Win+H`) instead, for now**, not Google. Win+H types into whatever text field has focus, system-wide, entirely offline, in any app including this one — it needs no app code, no server, no key, and already worked before this project existed. It operates below the app layer, so it is **not** wired to `Ctrl+D`; see section 4 for what that means and the options that were considered.

If Google is ever revisited, or avoiding it specifically (not just its cost) becomes the goal, the two engine alternatives already named in BACKLOG.md "Voice → agent" are: a **Web Speech API** engine (free, no key — but per the original design research, unreliable in Tauri's WebView2, the primary target here) and **local Whisper** (free, offline, heavier build — C++/CMake plus a 150–500 MB model). Neither is built.

## 4. `Ctrl+D` and Windows dictation — what was decided 2026-09-24

`Ctrl+D` was **left pointed at the existing (unconfigured) Google pipeline**, not repointed at Windows dictation. Three shapes were considered:

1. **Do nothing — the user presses `Win+H` directly whenever they want to dictate.** Chosen. Zero new code, zero platform branching, and it doesn't foreclose anything — the whole `SpeechEngine` architecture stays exactly as built, ready to point at Google (once/if paid for), a Web Speech engine, or a real Windows-native engine (below) later, with no code written now to undo or work around. The only change made was cosmetic: the `not-configured` error message (shown if `Ctrl+D` is pressed while nothing is set up) now suggests Win+H on a Windows `navigator.userAgent`, in `errorMessage()` in `src/services/speech/dictation.ts`.
2. **`Ctrl+D` simulates the `Win+H` keypress** (a small native addition — Tauri/Rust sending a synthetic key event). Rejected as unnecessary complexity for a capability that already works without any linking: Windows dictation isn't scoped to whichever app has focus, so there is nothing to "link" for it to work inside this app. It would also pop Windows' own separate mic UI (not `VoiceIndicator`), bypass every file in `src/services/speech/` entirely, and need a platform fallback for non-Windows builds (macOS/Linux Tauri, the PWA, Android) — real scope for a convenience nobody asked for beyond the hotkey matching.
3. **A genuine Windows-native `SpeechEngine`**, backed by the OS's own Speech Recognition API (WinRT, via a new Rust/Tauri command) instead of Google's. This is the option that actually keeps the built UX (`VoiceIndicator`, the level meter, `Enter`/`Esc` handling) working through `Ctrl+D`, completely free, and Windows-only — but it is **real new work**, not a one-line engine swap: WinRT's `SpeechRecognizer` wants to own microphone capture itself and streams results continuously (with its own built-in end-of-phrase detection), which doesn't match the current `SpeechEngine.transcribe(pcm, opts): Promise<text>` shape (a function that takes PCM *we* captured and returns one block of text) — audio capture and utterance detection would need to move into Rust for this path, alongside real WinRT/COM threading work. Not built. Worth doing only if free, native, in-app dictation (not just "the OS has a shortcut for this too") turns out to matter enough to justify it — ask the user before starting, since it's a new native dependency.

## 5. Decisions already made — do not re-open

- Signed-in only; dictated-text privacy is not a concern for this use case (the user's own words).
- Recording/meeting-minutes is deferred, and will be a **paid** feature when built, with audio kept local first.
- Local Whisper is a later engine, not the first — Google was chosen for v1 specifically for lower setup cost, which is what's now in question (section 3).
- The `SpeechEngine` swap point stays a one-line change in `dictation.ts` — don't restructure this to add a second concept for "which engine" without a reason.
- `Ctrl+D`, `Enter`-to-finish, `Esc`-to-cancel via `useEscapeClose`, the 20 s idle / 2 min total caps: all confirmed with the user, not defaults to reconsider without asking.
- `Ctrl+D` stays pointed at the (unconfigured) `SpeechEngine` pipeline, not at Windows dictation — see section 4 for the three shapes considered and why.

## 6. Not built (besides the voice pane/agent wiring in section 2)

- Android: no mic button, no `RECORD_AUDIO` permission.
- Spoken-command handling ("new line", "period") and custom vocabulary (Acronym entries, Endeavour names).
- Recordings (see section 3 and BACKLOG.md).

---

## When done

If this brief is picked back up and finished or substantially changed:

1. Update this file's `Status:` line (`In progress (started YYYY-MM-DD)`, then `Done YYYY-MM-DD — outcome`) — don't delete it, per CLAUDE.md's agent-brief rule.
2. Log the work in `docs/features/implemented-features.md`, editing the existing "Voice dictation" entry in place rather than adding a second, contradictory one (CLAUDE.md "One truth per topic").
3. Update BACKLOG.md's "Voice → agent" entry (or remove it if fully built) and its two open sub-items if either lands.
4. If a new migration was added: **Pending** until the user confirms they ran it, per CLAUDE.md "Live migration status" — never mark it Applied yourself.
5. Tell the user, plainly: what changed, what was verified vs. not, and what they need to decide or run.
