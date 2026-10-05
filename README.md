# CloudFrame v1.0
A digital photo frame for any tablet or laptop, running on Cloudflare (Worker + D1 + R2). Home/family use, protected by a username, password and 8-digit PIN.

## Features
- **Frame screen** (`/`): fullscreen slideshow (fullscreen button, F key or double-click) with crossfade, swipe/arrow-key controls, album quick-switch, pause, fullscreen, wake-lock.
- **Overlay:** translucent rounded box with date, time, weather, temperature and photo info; on/off, one corner or split across all four corners, adjustable opacity.
- **Photos and albums:** upload (photos over 4 megapixels are shrunk in the browser, smaller ones untouched), thumbnails, captions, bulk move/delete, choose which albums are shown.
- **Background music:** audio files (mp3, m4a, aac, ogg, wav, flac) in the `BGM/` folder of the R2 bucket. Music starts after the first tap; each device has a mute button.
- **Storage tab:** browse the R2 bucket, upload audio files, make folders, play, download and delete from the browser. Photo files are hidden and protected there.
- **Installable and offline:** installs as an app; photos are cached so the frame keeps cycling if the connection drops (music and weather need a connection).
- **Lite frame** (`/lite`): a tiny page for older tablets (written for iPad 2 / iOS 9). Plain-form PIN sign-in, no modern JavaScript, weather and time supplied by the Worker. No music or offline cache. Its Fullscreen button works where the browser allows it; iOS 9 doesn't, so add the page to the Home Screen instead (the button explains how).
- **Direct links:** the admin Overview lists copyable links to the standard frame, the frame sign-in page and the lite frame.
- **Admin:** Overview, Photos, Albums, Display, Storage; light/dark theme; settings save automatically.
- **Login modes:** *Admin* (username + password + PIN) or *Open frame* (username + PIN, view-only, 90 days).
- **Security:** credentials are Worker secrets; failed-login lockout (5 failures in 15 min locks for 30 min, configurable in `wrangler.toml`); HMAC-signed HttpOnly session cookies; CSP and security headers.

## Deploy from the browser (GitHub > Cloudflare, no CLI)
1. **R2:** Cloudflare dashboard > R2 > create a bucket named `cloudframe`.
2. **D1:** Storage & Databases > D1 > create a database named `cloudframe`. Open its **Console** tab, paste the contents of `schema.sql` and run it. Copy the **Database ID**.
3. **GitHub:** create a repo and upload this folder's contents (keep `src/` and `public/`). In the GitHub web editor, paste the Database ID into `database_id` in `wrangler.toml`. The build fails until you do.
4. **Connect:** Workers & Pages > Create > Import a repository, pick the repo. Leave the build command empty and use the default deploy command (`npx wrangler deploy`). The Worker name must stay `cloudframe`. Menu labels can vary slightly as the dashboard changes.
5. **Secrets:** open the deployed Worker > Settings > Variables and Secrets and add these as type **Secret**: `FRAME_USERNAME`, `FRAME_PASSWORD`, `FRAME_PIN` (exactly 8 digits), `SESSION_SECRET` (any long random string). Secrets survive redeploys. Login won't work until they exist.
6. Every later commit to the repo redeploys automatically.

## Deploy from the command line (alternative)
```
npx wrangler d1 create cloudframe          # copy database_id into wrangler.toml
npx wrangler r2 bucket create cloudframe
npx wrangler d1 execute cloudframe --remote --file=schema.sql
npx wrangler secret put FRAME_USERNAME
npx wrangler secret put FRAME_PASSWORD
npx wrangler secret put FRAME_PIN          # exactly 8 digits
npx wrangler secret put SESSION_SECRET     # e.g. output of: openssl rand -base64 32
npx wrangler deploy
```

## Use
- `/admin`: manage photos, albums, display settings and storage.
- `/`: the frame. Open it on the tablet, sign in with *Open frame*, tap once for fullscreen and keep-awake, then install it as an app.
