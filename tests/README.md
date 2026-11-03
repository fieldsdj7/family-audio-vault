# Story-selection regression

Baseline: main at 2aa13533178e87dafd4a362068c5c8ae56901226 (after the rollback).

## Existing player lifecycle

Home owns one selectedTrack. fetchTracks selects the first permitted recording;
chooseVault selects the first track for that Vault and sets isPlaying false.
selectTrack replaces selectedTrack and sets isPlaying true.
The selected-story section contains one VaultAudioPlayer keyed by selectedTrack.id.
Changing the ID remounts that player, discarding the previous audio element and
its currentSeconds/playableDuration state. The audio element is also keyed by ID.
The player seeks to clip_start_seconds, bounds playback by clip_end_seconds,
reports clip-relative duration, and pauses at the clip end. Total audio time is
computed independently from personTracks, using clip lengths or cached metadata.
None of that production code is changed by the photo feature.

## Cause and fix

The previous photo insertion used the same sibling key as VaultAudioPlayer.
Adding that key again reproduced React duplicate-key warnings and two retained
audio elements. The regression failed on desktop and mobile. The photo component
now uses a distinct photos-<recording ID> key. The player keeps its original key.

## Test and results

Install: npm ci, then npx playwright install chromium.
Run: npm run test:e2e (starts a local Next development server on port 3100).
The test uses the real page and Chromium media APIs, with local member,
recording, photo and silent WAV fixtures. Cloudflare/R2 are not contacted.
It clicks Story A, B, then C and checks exactly one audio element, one visible
play/pause button and one seek slider, all for the selected story; A/B audio
must be absent at the end. It also checks the clip duration and viewport bounds.

Before production changes: 2 passed (desktop 1280px and mobile 375px).
After production changes: 4 passed (both viewports, with/without photos).
The photo cases verify captions, ordering, selected-story images and long-caption
wrapping. No duplicate-key warnings are allowed. The initial baseline test needed
its heading selector scoped to h2 because the page also has an h3 story heading.

npm run test:photos: passed. Uses real auth helper and route SQL against local
SQLite, with R2 mocked. Checks active membership, Vault grants, denied R2 reads,
trashed/split/orphan records, ordering, captions, private cache headers and
admin-only mutations. Requires a Node release with node:sqlite (tested on Node 24).

npm run build: passed (including Next TypeScript validation).
npx tsc --noEmit: passed.
Build emits the existing missing OPENAI_API_KEY warning in this local environment.
Live Cloudflare Access integration is not exercised by these local tests.
