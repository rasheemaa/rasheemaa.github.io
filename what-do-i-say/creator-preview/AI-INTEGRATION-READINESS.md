# Sparkle Creator Studio release gates

Creator Studio is isolated on PR #14. Nothing in this branch is approved for production deployment.

## Implemented

The Studio uses The Sheema Edit's cream, pink, lilac and plum palette with Playfair Display and DM Sans. The existing Sparkle writing and voice interfaces retain their layout and engines.

Projects include their own drafts. Saved work is never silently discarded because of age or unreadable storage. Cross-tab conflicts create a separate copy with confirmation. Recent unsaved output can be recovered from the same tab; a JSON project backup is available.

The AI client sends only task, idea, audience, tone and the saved Creator Brain, after a deliberate Generate action. Profiles are sent in full within the shared 1,600-character limit and the 8,000-byte request budget. All responses render as text. Cancellation, changed inputs, project switches and late responses preserve current work. Clipboard failures show a separate manual-copy field.

Creator AI has its own configuration and defaults off. A preview package can enable a verified same-origin backend. Merely setting a generic message API URL does not enable Creator AI. No-index metadata reduces discovery; it is not authentication or a promise of private hosting.

## Verification

Run the four existing Node suites in this directory. The single browser harness in smoke.test.cjs covers Chromium and WebKit at 360, 375, 390, 430, 1280 and 1440 pixels, seven task requests, persistence, copy, deletion confirmation, network recovery, touch targets, keyboard entry and axe accessibility rules. Browser tests use deterministic API responses and are explicitly distinct from live inference and physical-device acceptance.

The standard public-repository CI runner and open source tests introduce no new paid service. Diagnostic screenshots expire after one day.

## Required before release

1. Verify Cloudflare account access, Workers AI binding, the chosen model, a genuinely free billing boundary, and the isolated endpoint.
2. Run actual inference for all seven tasks and review output quality, quota handling, failures and duration.
3. Confirm the packaged standalone frontend and Creator API work together with exact frontend and backend revisions.
4. Complete physical iPhone checks, including keyboard use and preserved drafts. Voice acceptance still requires two consecutive hands-free turns and recovery after a deliberately failed reopen.
5. Confirm sparklerma.com DNS, HTTPS and ownership independently of source-code checks.
6. Review the final immutable diffs and rollback procedure, then obtain Sheema's explicit final release approval.

No production merge, domain switch, paid service, voice-reference replacement or automatic publishing is authorized by this document.

## Mandatory video safety gate (October 26, 2026)

Sparkle Creator Studio must **not** enable or link to video generation until end-to-end protection is implemented. In particular, no uncontrolled iframe, external generation shortcut, or client-only keyword filter may be used to evade the controls. All depictions of minors in generated videos, as well as child sexual exploitation and sexual violence (including fictional, animated and age-manipulated variants), are prohibited.

Any future video capability requires enforceable server-side screening of every prompt and reference upload, safety checks on generated frames/audio before any preview or download, failed or uncertain classifications denied, secure isolation of artifacts and adversarial bypass tests. Existing text drafting features and the original approved voice are distinct; this requirement does not authorize changes to their engines. The experimental video branch has been changed to a disabled safety hold in frontend PR #7. Its safety gate is `what-do-i-say/video-studio/VIDEO-SAFETY-GATE.md` on that branch, and it must be incorporated and independently validated before any enabled video release.

This is a release blocker, **not** a claim that moderation infrastructure is operational or that safety can be guaranteed. Do not deploy or activate video generation without explicit owner release approval.

The video backend safety hold now has a draft implementation in [backend PR #9](https://github.com/rasheemaa/what-do-i-say-ai-sheema/pull/9). API requests are denied before reaching any generator, and adversarial tests cover bypass routes and fail-closed orchestration. **This is not evidence of real video-content detection:** no production classifier, media scan or output-release service has been connected. Treat the video launch gate as unsatisfied.
