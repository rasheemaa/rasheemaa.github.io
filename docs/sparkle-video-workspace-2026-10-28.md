# Sparkle video workspace: October 28, 2026

## Product status

This increment adds a free video planning workspace and a video entry on Creator Studio. It produces a manually edited shot plan, text brief and JSON backup. It does not generate video, images, sound or AI suggestions. The existing video generation safety hold remains in force.

The workspace supports 1 to 8 ordered scenes, 15, 30 and 60 second targets, vertical, landscape and square framing, visual direction, continuity notes, camera direction and sound notes. Fit timing distributes whole seconds exactly across the current scenes. Full text export requires a title, idea, described shots and matching duration. Incomplete projects can still be saved and backed up.

Projects use a separate browser store. Tab recovery retains edits. Imports validate supported fields, limits and version, then open an unsaved plan; they do not replace stored projects. Conflicting edits of the same saved record create a separate copy. Web Locks serialize cooperating writers where available. Local record IDs are not access tokens.

The planner has no generator credentials, provider URL, network client, upload service, media renderer or embedded generator. Its CSP denies connections, frames, objects and form submission. Its backup projection carries no moderator approval flags or provider URLs. Text is rendered with DOM text APIs. This isolation does not establish moderation accuracy for a future generator.

## Verification recorded in this increment

1. Nine model, backup and packaging policy tests pass, including all 24 target length and scene count combinations, incomplete exports, unsupported backups, size limits, Unicode, additional field removal and HTTP preview ID compatibility.
2. Existing Creator static, storage, draft, AI client and 16 backup tests pass. Existing free access checks pass across local and cloud mode simulations. These are simulations, not new live inference results.
3. Cloud Chromium interaction checks confirm sample loading, frame and target controls, scene addition and reordering, timing validation and fitting, text plan review, saving, reload recovery, loading a saved project, and separate copies after conflicting edits in two tabs.
4. A browser backup download was restored through the file chooser. The restore opened the correct unsaved plan and retained the saved project list.
5. The home and planner layouts were inspected at desktop and narrow framed widths. A 360 pixel planner frame and 390 pixel home frame had no horizontal overflow. Framed desktop Chromium checks do not establish physical iPhone Safari or VoiceOver acceptance.
6. The owner review package validates local links, disabled live AI, private indexing, approved WAV size and hash, and the unchanged voice source. The preview's no-connection planner policy is stricter than the other review pages' same-origin policy.

## Webby direction and evidence still needed

The intended primary category is AI Experiences & Applications: Creative Tools. The current category descriptions and judging criteria are at https://www.webbyawards.com/about/categories/ and https://www.webbyawards.com/judging-criteria/ . The AI criteria cover concept, execution, ethical practices and overall experience. This planning increment alone is not evidence of a competitive AI video generator.

Before making a Webby entry, retain actual generation examples, reproducible settings, unedited source outputs, failure rates, completion times, quality reviews and consented user feedback. Evaluate prompt adherence, temporal consistency, natural movement, identity and object consistency, lighting, sound synchronization when offered, and creative control. Record limitations and rejected outputs as well as successful examples. Do not claim 4K source quality from upscaling or claim measured impact without data.

## Next engineering dependency

Implement and validate a private generation pipeline with a verified zero charge boundary, server owned input and reference inspection, frame, audio and text review of outputs, private artifact ownership and release, and denial on uncertainty or service failure. The strict policy excludes all minor depictions, including ambiguous age and fictional or animated minors, and sexual violence. No public generator embed or direct unmoderated provider handoff is permitted.

No production moderation service, private GPU generator or measured output quality is established by this increment. No paid model, fallback, upgrade, domain change, merge, deployment or award entry is authorized by this document. Existing approval requirements apply before release.
