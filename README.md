# CloudFrame v1.6
A digital photo frame for any tablet or laptop, running on Cloudflare (Worker + D1 + R2). Home/family use, protected by a username, password and 8-digit PIN.

## Features
- **Frame screen** (`/`): fullscreen slideshow (fullscreen button, F key or double-click) with crossfade, swipe/arrow-key controls, album quick-switch, pause, fullscreen, wake-lock.
- **Sleep mode:** during sleep hours (default 8pm-6am, set under Display; uses the Display timezone) the photos dim to 5% brightness (adjustable) and the overlay becomes a large centred clock with the time, day, date, weather, temperature and tomorrow's forecast. Works on the standard and lite frames.
- **Music off at night:** a Sleep mode toggle (on by default) pauses the music during sleep hours and resumes it afterwards.
- **Auto brightness (optional):** where a browser exposes an ambient light sensor (some Android/Chromium devices; not iPads or most laptops), the frame dims the photos in software to match the room, never below the minimum you set. The frame's control bar shows whether a sensor was found.
- **Nowcast and UV (optional):** the NEA 2-hour nowcast for the forecast area nearest your weather location (or an area you pick), and the current UV index with NEA's bands. Both refresh every 30 minutes. UV shows in daylight hours only.
- **Text size:** Display > Overlay > Text size scales all the overlay text (60-180%), on both frames and in the preview.
- **PSI (optional):** shows (in daylight hours only, refreshed hourly) NEA's official 24-hour PSI (the readings published on haze.gov.sg) for the whole of Singapore or one region, with its band colour. The Worker reads it from data.gov.sg and caches it for 15 minutes. If you hit rate limits, add an optional `DATA_GOV_SG_API_KEY` secret.
- **Overlay:** translucent rounded box with date, time, weather, temperature and photo info; on/off, one corner or split across all four corners, adjustable opacity.
- **Photos and albums:** upload (photos over 4 megapixels are shrunk in the browser, smaller ones untouched), thumbnails, captions, bulk move/delete, choose which albums are shown.
- **Upload buttons:** the Media tab has clear Upload photos and Upload videos buttons (plus drag-and-drop), and the Overview has an Upload videos shortcut.
- **Short videos (up to 5 minutes):** upload videos like photos. In the browser they are checked, then compressed to 1080p H.264 MP4 at about 5 Mbps (real time, so a 5-minute clip takes about 5 minutes; keep the tab open and visible), then uploaded in 16 MB chunks. Videos already at or under 1080p and 6 Mbps are uploaded as they are, and browsers that can't record MP4 (e.g. Firefox) upload the original. On the frame they play to the end (or a max-seconds limit) and then cycle on; sound is off by default. A Display setting picks photos, videos or both, with a per-device switch on the frame. Videos are not cached offline.
- **Background music:** audio files (mp3, m4a, aac, ogg, wav, flac) in the `BGM/` folder of the R2 bucket. Music starts after the first tap; each device has a mute button.
- **Storage tab:** browse the R2 bucket, upload audio files, make folders, play, download and delete from the browser. Photo files are hidden and protected there.
- **Delete:** remove photos and videos from the Media tab (🗑 on each card, in the full-size viewer, or select several and Delete) and from Storage > Photos & videos (🗑 per row, Delete selected). Deleting is permanent and also removes the thumbnail; the frame drops the item on its next refresh. Frame-only logins can't delete.
- **Photo export:** in Admin > Storage, open *Photos & videos* to browse your albums as folders, download any single item, or download selected items, one album, or everything as a zip that keeps the album folders. Files are named date_caption_id (original filenames aren't kept). Zips are built in your browser (keep the tab open) and split into parts of about 1.8 GB.
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

## Upgrading from v1.0
Run `migration-v1.1.sql` once in the D1 Console (adds the video columns), then redeploy.

## Use
- `/admin`: manage photos, albums, display settings and storage.
- `/`: the frame. Open it on the tablet, sign in with *Open frame*, tap once for fullscreen and keep-awake, then install it as an app.
