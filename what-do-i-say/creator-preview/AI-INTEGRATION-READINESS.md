# Creator Studio AI integration and release gates

Status: **draft, unmerged, not approved for live Creator AI generation.**

## Implemented
- Private `noindex` Creator Studio route with seven workflows, locally saved Creator Brain, saved projects, editable draft output, and user-reviewed handoff to existing Sparkle chat.
- The `Generate with AI` button can POST to `${window.WDIS_API_BASE}/api/creator/generate` with task, idea, audience, tone, and a bounded Creator Brain profile only after a user click. Requests do **not** post or send messages automatically.
- The companion backend PR #7 in `rasheemaa/what-do-i-say-ai-sheema` provides the separate Creator endpoint, input validation, explicit free-plan rollout gate, CORS/origin isolation, rate limiting, request timeouts, and sanitized error responses.
- The backend `CREATOR_AI_ENABLED` setting defaults to `false`. A client button and passing mocked tests **do not prove live inference is available**.
- Scripted static tests, API-client tests, persistence tests, and simulated Chromium mobile browser tests run in the frontend PR. The build protects existing drafts from failed requests and clipboard fallback.

## Unfinished release gates
1. Verify the actual Cloudflare account, target Worker, model entitlement, free-plan billing boundary, rate-limit binding, and domain/HTTPS state without enabling paid plans.
2. Test **all seven tasks** using real Cloudflare inference in a separate, approved nonproduction Worker, including quota, error, timeout, CORS and free-plan limits. Mocked API/browser tests are not a substitute.
3. Complete physical iPhone, desktop Safari, VoiceOver/keyboard and offline/recovery acceptance. A browser viewport simulation is not a physical device test.
4. Confirm frontend CSP, privacy disclosures, live Worker origin config, and any standalone `sparklerma.com` configuration after real environment verification.
5. Review both PRs and obtain explicit approval before merging or deploying user-facing changes.

## Production protections
Do **not** modify the approved original voice WAV, audio engine, paid APIs, payments, domains, or existing Sparkle chat route. Keep the Creator Studio PR draft and production untouched until the checks and final release approval are complete.

The branch was recovered from an accidental whole-tree deletion on October 23, 2026. Verify the PR remains scoped to Creator Studio, the workflow and the narrow chat handoff change; reject unexpected site-wide removals.
