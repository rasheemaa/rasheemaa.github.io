# Sparkle Video Studio: child safety hold

**State: Disabled. Do not merge or publish as an operational video generator.**

The experimental embedded LTX video generator exposed an uncontrolled third-party generation path. Because Sparkle could not enforce child-protection and sexual-violence restrictions inside that provider, the iframe, direct provider link, prompt builder/export and any automated provider generation workflow have been disabled in this draft.

The preview is now a static safety-hold page. It does not accept prompts, upload media, call a generation API, open a provider iframe, or offer an external generation link. Its restrictive Content Security Policy disallows connections, frames, forms and scripts. It is still **draft and unmerged**, so this is not a claim about what is currently deployed.

## Mandatory release criteria

See [VIDEO-SAFETY-GATE.md](VIDEO-SAFETY-GATE.md). Any future video product must use a server-controlled generation pipeline that:
1. Refuses any generated depiction of minors, including fictional, animated, age-altered, face-swapped, or ambiguous-age people.
2. Refuses child sexual abuse material, sexual exploitation, sexual violence, nonconsensual sexual content, and related evasion attempts.
3. Checks all prompt fields, reference uploads, audio and generated outputs at the server before showing or sharing results.
4. Fails closed on errors, uncertainty, unavailable moderation, provider failures, delayed jobs and attempted prompt injection.
5. Cannot call third-party generators, release download URLs, or reveal job artifacts through alternative routes.
6. Has tested safeguards for all supported video modes, including edits, inpainting, image-to-video and video-to-video.
7. Preserves Sparkle's separate chat and approved voice without changing billing, production traffic, DNS or live deployment.

Tests in `.github/scripts/video-studio-smoke.mjs` and `.github/workflows/video-studio-preview.yml` enforce the currently **disabled** UI. They are not evidence that a future enabled model's moderation is effective. Independent safety review, adversarial testing, provider controls and explicit owner release approval are required before reactivation.
