# Video safety gate: mandatory before enabling Sparkle video generation

**Product decision:** no videos depicting minors at all. No child sexual abuse material (CSAM), sexual exploitation, sexual violence or nonconsensual sexual acts. This includes photorealistic, fictional, animated, stylized, generated, edited, transformed and age-modified content. Age ambiguity is a deny condition, not permission to infer adulthood. These video-specific prohibitions do not prevent Sparkle chat from providing non-graphic support for survivors.

## Threat model and enforcement

- **Untrusted inputs:** prompts (all fields and negative prompts), project names, filenames, metadata, reference images, uploaded videos, video audio/transcripts, edits, presets, example templates, stored project prompts, remote URLs and indirect prompt injection. Treat all as untrusted.
- **No public direct provider interface:** a user must not be able to generate by editing DOM controls, calling an external Gradio API, using an iframe, direct links, alternate API routes or a client-supplied job ID. A client-side keyword filter or a model instruction alone is inadequate.
- **Server authorization:** before allocating a GPU job, authenticate/authorize and rate-limit where appropriate; then submit all inputs to an age/safety classifier and policy engine under server control. If any screening service is missing, erroring, over quota, undecided or unverified, deny creation. Do not use a permissive fallback.
- **Upload controls:** check file signatures, size, type, duration and decompression limits; scan sampled and scene-change frames plus audio and transcript; reject ambiguous or prohibited content, including facial age alterations. Never assume safe solely because a prompt is innocuous.
- **Generation isolation:** approved jobs use server-controlled providers and private artifacts. Recheck every retry, regeneration, prompt change, media revision, seed/scene continuation, export and transformation. Reject provider paths that Sparkle cannot enforce, including uncontrolled embeds and direct handoffs.
- **Output gate:** classify generated video frames across the entire clip using appropriate temporal sampling and targeted checks, plus speech/audio and text overlays, before disclosing previews, thumbnails, playable URLs or downloads. If uncertain, withhold and revoke artifacts. Do not return URLs before review is complete. Deny if results violate minors or sexual-violence policies even when input passed.
- **Enforcement integrity:** version and audit policy configuration; pin model/provider revisions; deploy changes only through reviewed security tests. Do not accept client flags claiming content is safe, that characters are adults, or that safety checks were already completed.
- **Handling incidents:** minimize retention of uploads and blocked material; record structured event metadata without copying sensitive imagery into logs. Preserve evidence only when legally required and protected by access controls. Establish a lawful incident/reporting and escalation process, including applicable CSAM reporting obligations, with legal/safety review. Do not display, circulate or manually inspect suspected CSAM unnecessarily.
- **Privacy and costs:** consent and transparency for uploads; no paid service or billing added without separate approval. Free inference must still meet all safety controls; quota exhaustion fails closed.

## Acceptance tests before release

All tests must cover unauthorized clients and API requests, not just browser behavior:
1. Benign adult video passes screening only when all services are healthy.
2. A prompt containing a minor, childlike depiction, ambiguous age, age changes or bypass wording cannot create a job.
3. Sexual violence, exploitative or nonconsensual scenarios cannot create a job, including fictional/stylized requests.
4. Harmless prompt + unsafe image, video, audio, metadata or remote media is denied.
5. Harmless prompt + unsafe generated frames, audio or overlays cannot be previewed, downloaded, linked or cached.
6. Classifier outage, timeout, quota, malformed response or low confidence must deny without a generation call or leaked URL.
7. Job retries, edit requests, public endpoints, webhooks and storage paths cannot bypass screening.
8. No third-party embedded generation route; no SDK/client-side secrets, direct handoff, or permissive CORS.
9. Review false positives, detection gaps and accessibility on desktop and physical iPhone; document risk, do not claim a guarantee of perfect detection.
10. Independent red-team and owner acceptance before any merge or deployment that could re-enable generation.

## Current status

The video studio has **no generation backend or working end-to-end content moderation pipeline**. Therefore the only defensible setting is off. Current UI/CI tests can verify that the video preview stays off, but cannot certify future enabled generation. Reactivation requires implementing this entire gate, test evidence and Sheema's explicit release approval. Keep main, production Sparkle, billing, DNS, and the original approved voice unmodified.

## Backend implementation status (October 26, 2026)

An isolated draft backend safety gateway is now available in [Sparkle backend PR #9](https://github.com/rasheemaa/what-do-i-say-ai-sheema/pull/9). It blocks video API namespaces in all backend entry points and includes fail-closed lifecycle unit tests. **Its classifiers, media inspection services, GPU inference and private artifact storage are mocked or absent**, so this does not satisfy the above release criteria. Keep the video preview disabled and this PR unmerged until real end-to-end moderation, legal/incident review and independent adversarial evaluation are complete.
