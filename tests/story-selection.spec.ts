import { expect, test } from "@playwright/test";

// Serve real, silent WAV data so metadata, autoplay and seeking use browser media APIs.
function silentWav() {
  const samples = 8000 * 4;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
}

for (const withPhotos of [false, true]) {
test(`Story A → Story B → Story C leaves only Story C's audio player (${withPhotos ? "with photos" : "without photos"})`, async ({ page }) => {
  const reactKeyErrors: string[] = [];
  page.on("console", (message) => {
    if (/same key|unique.*key/i.test(message.text())) reactKeyErrors.push(message.text());
  });
  const tracks = ["A", "B", "C"].map((letter) => ({
    id: `story-${letter.toLowerCase()}`,
    title: `Story ${letter}`,
    speaker: "Dad",
    category: "General",
    vault_person: "Dad",
    created_at: "2026-01-01T12:00:00Z",
    transcript: `Transcript ${letter}`,
    story_chapter: `Family story ${letter}`,
    source_track_id: "original",
    clip_start_seconds: 1,
    clip_end_seconds: 3,
  }));
  await page.route("**/api/cloudflare/member", (route) => route.fulfill({ json: {
    member: { email: "family@example.com", isAdmin: false, allowedVaults: ["Dad"] },
  } }));
  await page.route("**/api/cloudflare/recordings", (route) => route.fulfill({ json: { recordings: tracks } }));
  await page.route("**/api/cloudflare/audio/*", (route) => route.fulfill({ contentType: "audio/wav", body: silentWav() }));
  await page.route("**/api/cloudflare/photos?*", (route) => {
    const id = new URL(route.request().url()).searchParams.get("recordingId");
    return route.fulfill({ json: { photos: withPhotos ? [
      { id: `${id}-first`, caption: `${id} first caption` },
      { id: `${id}-second`, caption: `${id} ${"longcaption".repeat(20)}` },
    ] : [] } });
  });
  await page.route("**/api/cloudflare/photos/*", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="tan"/></svg>',
  }));
  await page.goto("/");

  for (const letter of ["A", "B", "C"]) {
    await page.getByRole("button", { name: new RegExp(`Story ${letter}`) }).click();
    await expect(page.getByRole("heading", { name: `Story ${letter}`, exact: true, level: 2 })).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(1);
    await expect(page.locator("audio")).toHaveAttribute("src", `/api/cloudflare/audio/story-${letter.toLowerCase()}`);
    await expect(page.getByRole("slider", { name: "Recording position" })).toHaveAttribute("max", "2");
    await expect(page.getByRole("button", { name: /^(Play|Pause) recording$/ })).toBeVisible();
    if (withPhotos) {
      const id = `story-${letter.toLowerCase()}`;
      const gallery = page.getByRole("region", { name: "Story photos" });
      await expect(gallery.locator("figcaption")).toHaveText([
        `${id} first caption`, `${id} ${"longcaption".repeat(20)}`,
      ]);
      await expect(gallery.locator("img")).toHaveCount(2);
      await expect(gallery.locator("img").first()).toHaveAttribute("src", `/api/cloudflare/photos/${id}-first`);
    }
  }

  // The native audio element has custom visible controls. Count both to catch leftover players.
  await expect(page.locator("audio")).toHaveCount(1);
  await expect(page.locator("audio")).toHaveAttribute("src", "/api/cloudflare/audio/story-c");
  await expect(page.locator('audio[src$="story-a"], audio[src$="story-b"]')).toHaveCount(0);
  const controls = page.getByRole("button", { name: /^(Play|Pause) recording$/ });
  await expect(controls).toHaveCount(1);
  await expect(controls).toBeVisible();
  await expect(page.getByRole("slider", { name: "Recording position" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /^Story [AB]$/, exact: true })).toHaveCount(0);
  await expect(page.getByText("0 min total audio", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(reactKeyErrors).toEqual([]);
  const bounds = await page.getByRole("slider", { name: "Recording position" }).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
}
