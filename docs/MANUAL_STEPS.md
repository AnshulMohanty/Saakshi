# Manual steps

Everything Saakshi needs that code can't do: accounts, keys, console settings, a phone. Do the
steps in order. Each ends with a command that proves it worked. Local development needs none
of this: with no `.env`, every provider runs on its mock.

Put local secrets in `.env.local` (git-ignored; `next dev` and every `pnpm` script read it). Put
production secrets in the Vercel project settings. Never give a secret a `NEXT_PUBLIC_` prefix.

> **Append to this file** whenever something needs a human: a console setting, a key, a check
> that only a person can do (rule in docs/DEVELOPMENT.md).

---

## 0. Contact for API etiquette (2 min)

Wikimedia and Nominatim ask every client to identify itself with a contact, and anonymous clients
are throttled harder. Nobody has set one yet: the repo has no `APP_CONTACT_EMAIL`, no
`APP_REPO_URL` and no git remote, and the code never invents one.

- Set `APP_CONTACT_EMAIL` to a team address, and/or `APP_REPO_URL` to the public repo URL.
- Check: `pnpm verify:env --prod` no longer warns about `APP_CONTACT_EMAIL`.

## 1. Cloudinary (15 min)

1. Sign up at <https://cloudinary.com>. When it asks for a data center, **don't choose Asia
   Pacific**: `e_extract` (the litter and greenery masks) isn't available there. US or EU are fine.
2. Console → **Settings → API Keys**: copy the cloud name, API key and API secret into
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
3. Console → **Add-ons**: register the free tier of **Cloudinary AI Vision** (tagging and moderation
   questions) and **Cloudinary AI Content Analysis** (watermark detection). The Analyze API
   returns an error without them. Write down the free monthly quota the Console shows for each; the
   docs don't publish it (external-apis.md C8).
4. Console → **Settings → Security**:
   - Turn **Strict Transformations** on. Only signed URLs then produce images, so an unsigned or
     edited URL can't reveal an original or an unblurred face.
   - Free plan: turn **Allow delivery of PDF and ZIP files** on, or report PDFs can't be
     delivered. A blocked response may stay cached for a while after you change it.
5. Run `pnpm cld:setup --dry-run` to see what it will create, then `pnpm cld:setup`. It creates the
   structured metadata fields (`project_id`, `trust_score`, `trust_band`, `captured_at`) and the
   signed upload preset `saakshi_evidence`. It is safe to run again.
6. Check with `pnpm services:check`. Every
   Cloudinary line should be ✓. If one fails, its hint names the switch to set (for example
   `CLD_DELIVERY_TYPE=private`, `CLD_PDF_DELIVERY=download`, `CLD_COMPOSITE_MODE=server`).
   The switches are explained in docs/providers.md. Add `--no-extract` to skip the mask probe:
   one `e_extract` counts as 75 transformations.

## 2. OpenAI (10 min)

1. <https://platform.openai.com>: create a project and an API key for it → `OPENAI_API_KEY`.
2. **Billing**: add prepaid credits. Without them, calls fail with `insufficient_quota`, which the
   app never retries.
3. **Limits**: set a monthly budget limit on the project, e.g. a small number of dollars for a
   hackathon. Prices are in docs/external-apis.md. Every call's tokens and cost are logged in the
   `provider_usage` table.
4. The defaults are `gpt-5.6-luna` for vision, prose and search (`OPENAI_MODEL_FAST`), and
   `text-embedding-3-small` for embeddings. `OPENAI_MODEL_SMART` (default: the same as fast) can
   be set to `gpt-5.6-terra` for report prose. Make sure the project may use those models.
5. Check with `pnpm services:check` (add `--full` to make one real vision call on the probe image).

## 3. Supabase Postgres (10 min)

1. <https://supabase.com>: create a project, in a region near your users (e.g. Mumbai). Save the
   database password.
2. Project → **Connect** → copy the **Transaction pooler** URI (port **6543**, host
   `…pooler.supabase.com`, user `postgres.<project-ref>`) → `DATABASE_URL`. Don't use the direct
   `db.<ref>.supabase.co` host: it is IPv6-only unless you buy the IPv4 add-on.
3. `pnpm db:migrate` (with `DATABASE_URL` set) applies every migration and creates the `vector`
   extension.
4. Check with `pnpm services:check`: the Database lines show the Postgres version, pgvector and
   "N of N applied".
5. If queries ever hang or return odd rows in production, switch `DATABASE_URL` to the **Session
   pooler** (port 5432). Supabase warns that postgres.js pipelining over the transaction pooler can
   do this (external-apis.md).

## 4. Vercel (15 min)

1. <https://vercel.com> → **Add New → Project** → import the repository (framework: Next.js; the
   defaults are right).
2. **Settings → Environment Variables**, for Production (and Preview if you use it):

   | Variable | Value |
   | --- | --- |
   | `APP_URL` | the production URL, `https://…` (set it after the first deploy if you don't know it yet) |
   | `CAPTURE_TOKEN_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `DEMO_ADMIN_SECRET` | another random string (guards demo reset, report generation, pairing overrides, project edits) |
   | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from step 1 |
   | `OPENAI_API_KEY` | from step 2 |
   | `DATABASE_URL` | from step 3 |
   | `APP_CONTACT_EMAIL` | from step 0 |
   | `STAGE_LAT`, `STAGE_LNG` | the stage venue (for the try-to-fool-it sandbox and `pnpm demo:stage`) |
   | any `CLD_*` switch services:check asked for | |

   Inngest's keys come from step 5.
3. Check locally: copy the production values into `.env.production.local` and run
   `pnpm verify:env --prod`. It must say **OK**.
4. Deploy. If `APP_URL` was unknown, set it now and **redeploy**: environment changes apply only to
   new deployments.
5. Run `pnpm cld:setup` again with the production `APP_URL` in your env. The `saakshi_evidence`
   preset then gets its `notification_url` (`<APP_URL>/api/webhooks/cloudinary`), so uploads made
   from the Cloudinary Console reach the same ingest path.

## 5. Inngest (10 min)

1. <https://www.inngest.com>: create an account.
2. Install the **Vercel integration** from Inngest and connect it to the project. It sets
   `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel and syncs the app on every deploy.
3. Vercel → **Settings → Deployment Protection**: turn it off for production, or set up "Protection
   Bypass for Automation", otherwise Inngest can't reach `/api/inngest`.
4. Redeploy, then check Inngest → **Apps**: `saakshi` is synced with the function
   `evidence-pipeline`. If it isn't, use **Sync app** with `<APP_URL>/api/inngest`.
5. Check with `pnpm services:check` (with `APP_URL` and the Inngest keys in your env): "Inngest endpoint
   /api/inngest: serving".

## 6. Demo data in production (10 min)

With the production `DATABASE_URL` and Cloudinary keys in your env:

1. `pnpm demo:reset --online`. This uploads the archive photos (Wikimedia Commons, credited) and
   the planted test inputs to Cloudinary, runs the pipeline with the real providers, and prints
   the trust bands and pairs.
2. `pnpm demo:remeasure` measures again with real `e_extract` masks (`--reanalyze` also re-runs
   the analysis and AI steps). Look at the hero pair (DEMO_HERO, default Tiruppur) and one real
   mask: white should mean "litter". If it's inverted, see external-apis.md C3. Then choose the
   final `DEMO_HERO`.
3. `pnpm services:check`: everything ✓.

## 7. Phone test (10 min)

1. On a phone, open `<APP_URL>/capture?project=demo-hero-cleanup`, or the stage project after
   `pnpm demo:stage`.
2. Allow camera and location. Take a photo at the venue.
3. Check:
   - `/library` shows it with a trust score within a minute;
   - `/e/<assetId>` shows the evidence page (face-blurred, signed image, QR);
   - Inngest shows the run.
4. Try an internet image in the sandbox: it must not verify.

## 8. Design parity (when the design exports arrive)

1. Put design exports in `design/export/`, keeping their file names, and handoff notes in
   `design/handoff/` (see design/README.md).
2. Video capture needs Playwright's ffmpeg once: `npx playwright install ffmpeg`. It works with the
   installed Microsoft Edge (`channel: "msedge"`); no browser download is needed.
3. Run `pnpm design:capture`, then `pnpm parity:capture <route>`, then `pnpm parity:report`, and
   open `design/parity/report.html`.

## 9. Before publishing the preview videos (10 min)

1. **Music licence.** The videos use "Happy Beats / Business Moves" Vols. 1, 10 and 11 by ende.app,
   bundled with the brag skill without written licence terms. Check the terms at https://ende.app/en
   and put them in video/preview/DESCRIPTION.md; if they don't allow it, swap the track in
   `scripts/video/render.ts` and run `pnpm video:render`. The tracks and their `cues/` folder are read
   from `BRAG_MUSIC_DIR` (default `.data/music`): copy them there from the brag skill's `assets/music`.
2. **Android vibration.** On an Android phone, take a photo on `/capture`: a short buzz on the shutter
   and a double buzz on the score (iOS has no vibration API). It has only run in emulation.
3. **Re-record with real data** once the live providers are connected and `pnpm demo:remeasure` has
   run: `pnpm video:final --real` (needs `CAPTURE_TOKEN_SECRET`, the key the demo was imported with).

## Still to confirm with real keys (Phase 10)

The UNVERIFIED items in docs/external-apis.md. Each has a fallback switch, and `pnpm services:check`
checks C1, C2, C4, C6 and C7 directly. C3 (mask polarity) needs one look at a real mask; C8 (add-on
quotas) needs the Console.
