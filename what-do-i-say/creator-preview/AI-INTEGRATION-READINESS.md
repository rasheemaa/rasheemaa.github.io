# Creator Studio AI integration gate

Status: **not approved for direct AI generation**. The preview remains local-only and hands off a user-reviewed prompt to the existing Sparkle chat.

## Existing interfaces confirmed from repository source
- `/what-do-i-say/index.html` loads `config.js`, `sparkle.js`, `sparkle-cloud-mobile.js`, and `chat-app.js`.
- The existing chat calls `window.Sparkle.generate(payload, { onStatus })` with `{ mode, tone, situation, personName, text, refine, currentMessage }`.
- On Apple mobile devices, `sparkle-cloud-mobile.js` replaces the generation implementation and sends the payload to `WDIS_API_BASE/api/generate`.
- The desktop `sparkle.js` implementation uses a local worker, with message-oriented processing.
- Creator Studio currently produces a reviewed prompt and transfers it via same-origin sessionStorage. No AI call occurs on the preview page.

## Must pass before enabling direct generation
1. Inspect the Cloudflare API repository's actual request schema, prompt policy, error contract, and rate limits. Confirm creator tasks are supported. A successful chat response alone is not proof.
2. Define a separate creator-task contract for content, growth, replies, sales, brand deals, digital products, and performance. Prevent unsupported analytics or posting claims.
3. Verify desktop worker behavior separately from the Apple mobile Cloudflare path; do not assume identical outputs or capabilities.
4. Add request cancellation, timeout, rate-limit, retry, and user-visible failure handling; never auto-post or auto-send messages.
5. Add tests for input size, prompt-injection attempts, invented claims, unsafe disclosures, and service failures.
6. Test on a physical iPhone and desktop browser, including network loss, keyboard and screen-reader navigation.
7. Review CSP, privacy disclosure, and production domain boundaries before changing any live route.

## Release boundary
Keep PR #14 draft and unmerged until all gates pass. Do not alter the approved voice reference, production Sparkle generation code, payments, or domain settings as a shortcut. A separate backend change may be necessary, pending inspection.
