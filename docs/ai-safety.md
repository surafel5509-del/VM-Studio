# AI safety model

FRAMEFORGE STUDIO treats AI as an invited, confirmed collaborator over a user's real project — not an autonomous editor.

## Rules

1. **Preview before execute.** Every AI-proposed action shows a human-readable plan with every action spelled out.
2. **Destructive ops require confirmation.** Deletes, ripple deletes, trims and "make a short" actions are flagged `needsConfirmation: true` in the plan — no confirmation, no action.
3. **Undoable by construction.** AI applies changes through the same store operations the user can undo with Ctrl+Z. No silent history bypass.
4. **Honest completion.** An AI tool only claims an edit succeeded when the underlying Supabase/engine operation returned success. Failures surface as errors, never as green checkmarks.
5. **Validated args.** All MCP tool arguments are zod-validated. Invalid or unsafe input is rejected with a readable error, not clamped or guessed.
6. **Scoped permissions.** MCP keys carry explicit scopes (read/write per domain). A key with `read:timeline` cannot edit the timeline.
7. **Provider-dependent features are labeled.** Voiceover, auto-subtitles, LLM planning and cloud generation are plainly marked "needs provider keys". The local planner is deterministic and never pretends to understand beyond its grammar.
8. **No direct execution of untrusted text.** The AI never runs shell commands or arbitrary queries. It plans against the timeline model and applies typed, validated operations.
9. **Audit trail.** Every MCP tool call writes an `audit_logs` entry (action, target, fingerprint of the key — never the key itself).

## What the local planner can do (deterministic)

Split at playhead, add/label marker, duplicate/delete selected clip (with ripple), set speed/volume/opacity, add text/solid layer, zoom timeline, "make a N-second short", remove silent sections.

## What needs a provider

Natural-language planning beyond the deterministic grammar (cinematic style, storyboards, scripts), voiceover, auto-subtitles, music, thumbnails. Until a provider is configured, these are reported as unsupported — never faked.
