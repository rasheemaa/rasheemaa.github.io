# Sparkle Video Studio: mandatory safety lock

**Status: LOCKED, experimental, not launch ready.** The draft Video Studio cannot
generate video, open an embedded provider, or prepare generator prompts. No changes
to Sparkle's live site, existing voice, chat, payments, or Cloudflare workers.

## Strict prohibited content: no exceptions

1. All video depictions of minors, even in ordinary, nonsexual scenes.
   This includes real people, fictional people, animation, age-regressed figures,
   images that appear to depict minors, and depictions with uncertain ages.
2. Any child sexual abuse material, exploitation or sexualization of a minor,
   including fictional, synthetic, stylized, morphed, or edited content.
3. Sexual violence, rape, sexual assault, coerced sexual activity,
   exploitation, or implied or simulated sexual abuse, regardless of victim age.
4. Attempts to circumvent these prohibitions via coded language, visual
   euphemisms, prompt chaining, reference media, editing, sound or animation.

A user claiming a subject is an adult is not sufficient to override a
visual appearance of a child or unresolved age uncertainty.

## Immediate control implemented in this draft

- Removed the public third-party LTX iframe and provider escape link.
- Set frame-src to 'none', disabling third-party frames in this page.
- Removed all prompt entry, upload, and video generation controls from the HTML.
- Removed prompt construction and left the former JavaScript helper intentionally inert.
- Replaced the former unaudited live generation workflow with a lock check.
- Added responsive Chromium and WebKit safety-lock assertions and a CI
  check that fails if an iframe or provider is reintroduced.

This is a **temporary all-generation block** rather than an assertion that
a keyword filter can reliably recognize every forbidden image. The provider
cannot be trusted with this policy until Sparkle controls enforcement end to end.
Client-side checks alone are never sufficient.

## Required controls before ANY video generation is reenabled

- **Server authorization and policy:** only accept jobs through an owned
  authenticated or rate-limited server endpoint. Apply mandatory policy checks
  on every submission and every edit/extend/remix/retry, independent of UI code.
  Default deny if moderation is missing, times out, fails, or is uncertain.
- **Input scanning:** classify the entire prompt, negative prompts, storyboards,
  reference images, uploaded videos, audio transcripts, text visible in images
  and metadata. Use robust text and multimodal moderation; do not rely on a
  keyword list, ages supplied by the requester, or prompt-based refusals.
- **Model & provider contract:** do not embed a provider or send jobs directly
  from the browser. Use only model hosts with enforceable content controls,
  verifiable capability and clear abuse/reporting policies.
- **Generation quarantine:** generated files are not public or downloadable
  until output review passes. Check multiple representative video frames,
  thumbnails and generated speech/audio/transcripts, including scene boundaries
  and significant temporal changes. Refuse ambiguous or unclassifiable outputs
  rather than releasing them.
- **Access & storage controls:** prevent sharing and exporting blocked output,
  avoid publishing generation previews before checks, expire sensitive artifacts,
  keep minimal secure audit metadata, and have a documented process for handling
  suspected child exploitation and applicable reporting obligations without
  redistributing the content.
- **Abuse resilience:** enforce safe per-user and per-IP rate limits, retry
  controls, incident monitoring, repeat offender restrictions, no fallback
  providers without equivalent safeguards, and clear error codes on refusals.
- **Regression coverage:** test straightforward, indirect and adversarial
  requests, uploads and generated output. Include minor-looking subjects even
  when prompted as "18+", ambiguous ages, age regression, implied sexual
  assault, prompt injection, multilingual/euphemistic prompts, animation and
  avatar edits. Also test normal adult videos for false positives.
- **Go/no-go:** independent review and test evidence covering input moderation,
  provider responses, output moderation, failure cases and user-facing controls.
  The generation route must remain off unless ALL are verified.

## CI checks

- `.github/workflows/video-studio-preview.yml`
- `.github/workflows/video-studio-live-test.yml` (formerly live generation; now only enforces lock)
- `.github/scripts/video-studio-smoke.mjs`

The Studio still cannot provide real generated video. No claim of complete safety
is possible until server moderation and independent real-generation tests pass.
This branch must remain draft and unmerged until Sheema explicitly approves a
reviewed launch.
