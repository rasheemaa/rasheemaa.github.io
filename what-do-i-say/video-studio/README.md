# Sparkle Video Studio: free GPU preview

**Status:** Experimental integration for review. No paid API calls, subscriptions, usage billing, or changes to Sparkle's existing AI backend.

## Architecture

- New route: `/what-do-i-say/video-studio/`
- Static HTML, CSS, and JavaScript hosted alongside The Sheema Edit.
- Local-only prompt composer that prepares cinematic directions and copies them to the clipboard.
- Real text-to-video (and optional image-to-video) generation supplied by the public Lightricks LTX 2.3 Distilled Gradio Space embedded via an iframe: `https://lightricks-ltx-2-3.hf.space/`.
- Explicit fallback link to `https://huggingface.co/spaces/Lightricks/LTX-2-3` for browsers that restrict third-party iframe login/cookies.
- **No direct API calls** or account credentials. Prompts are not sent from Sparkle's composer; users paste the prompt into the public generator and start generation there.

## Hard zero-charge boundary

Sparkle itself has no GPU, provider subscription, paid AI endpoint, or billing for this preview. Video processing takes place in the independently operated Hugging Face Space. Visitors must avoid paid upgrades or credit purchases. The third-party provider imposes queues, rate limits, daily quotas and can change or disable its service; therefore video availability and Google Flow/Veo quality are **not guaranteed**.

## Privacy and reliability

The embedded provider processes any information supplied to it under its own policies. No Sparkle access tokens are passed to the iframe. The only cross-origin frame allowed by this new page's CSP is the verified Lightricks Space domain. No `allow-same-origin` sandbox exception or additional tracking scripts are introduced.

## Manual verification before merging

1. Confirm the main Sparkle communication page still opens and sends/revises messages unaffected.
2. Confirm the 'Video Studio ✦' entry link opens the new route on desktop and mobile.
3. Fill the prompt and settings, prepare the prompt, edit a setting, and confirm stale prepared output is hidden.
4. Copy prepared prompt; confirm it is ready to paste, including iOS clipboard fallback.
5. Confirm the Lightricks embed is visible and can produce a test video **subject to the visitor's free quota**; if iframe sign-in fails, use the 'Open official' fallback.
6. Confirm no paid checkout, third-party API key, or payment credentials are used.
7. Review Lightricks/Hugging Face terms and privacy, and verify mobile responsiveness and accessibility.

This is a working external generator embed, **not** a custom-hosted video engine or an automatic prompt-to-generation API integration. Later versions can replace the engine only if a technically sound and free provider becomes available.
