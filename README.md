# Kannum Kannum

> A gaze endurance game: keep looking at the center eye while the game does everything it can to distract you.

**Live demo:** Add the deployed URL here after launch.

![Kannum Kannum logo](gpt-image-2_create_a_funny_doodle_like_logo_with_title_%E0%B4%95%E0%B4%A3%E0%B5%8D%E0%B4%A3%E0%B5%81%E0%B4%82_%E0%B4%95%E0%B4%A3%E0%B5%8D%E0%B4%A3%E0%B5%81%E0%B4%82-0.jpg)

## About

Kannum Kannum uses your webcam and MediaPipe face landmarks to tell whether your gaze remains on the target. A round ends when you look away or blink for too long. The longer you hold on, the higher your score and level.

Camera analysis runs entirely in the browser. Video is not recorded or uploaded by the game.

## Features

- Real-time gaze and blink detection with MediaPipe Face Landmarker
- Calibration before each round for more reliable tracking
- Increasing levels, distractions, score history, and best-run stats
- Unlockable eye styles plus custom-eye uploads
- Browser-local player profiles and leaderboard out of the box
- Optional Supabase authentication, persistent run history, and shared leaderboard
- A small jump-scare finale for distraction

## Tech Stack

- HTML, CSS, and vanilla JavaScript
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) for browser-side face landmarks
- [Supabase](https://supabase.com/) for the optional hosted backend
- Supabase JavaScript client, loaded from ESM

## Deploy

Kannum Kannum is a static web application: there is no build step or server runtime. The deployment host must provide HTTPS because browsers only allow webcam access from secure origins. `localhost` is also accepted for development.

### 1. Prepare the Production Backend

The game works without a backend, but player data then stays only in each browser's `localStorage`. Complete these steps before deploying if you want accounts, a shared leaderboard, and persistent run history:

1. Create a Supabase project.
2. Run the contents of [`supabase-schema.sql`](supabase-schema.sql) in the Supabase SQL Editor.
3. In [`supabase-config.js`](supabase-config.js), add the project URL and anon key from **Project Settings > API**:

   ```js
   window.KK_SUPABASE_CONFIG = {
     url: "https://your-project.supabase.co",
     anonKey: "your-anon-key",
   };
   ```

4. Save the file. The Supabase URL and anon key are public browser configuration, so never place a service-role key in this project.

At this point, the application has its production backend configuration. After the website is deployed, finish the authentication settings in step 3 below.

The schema enables Row Level Security. Players can add and read their own runs, while the leaderboard is returned through the `get_leaderboard` database function.

### 2. Publish the Project with Netlify

Netlify is the simplest route for this repository because it serves static files directly and automatically provides HTTPS.

1. Create a new GitHub repository and push this project to it:

   ```powershell
   git init
   git add .
   git commit -m "Initial Kannum Kannum deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

2. Sign in to [Netlify](https://app.netlify.com/) with GitHub.
3. Choose **Add new project > Import an existing project**, then select the repository.
4. Use these deployment settings:

   | Setting | Value |
   | --- | --- |
   | Branch to deploy | `main` |
   | Build command | Leave empty |
   | Publish directory | `.` |

5. Select **Deploy site**. Netlify will provide an HTTPS URL such as `https://your-site.netlify.app`.
6. Open that URL, allow camera access, and play one round to confirm gaze tracking works.

Every later push to `main` triggers a new deployment automatically.

### 3. Finish Supabase for the Deployed Site

Skip this section when using local-only profiles.

1. In Supabase, open **Authentication > URL Configuration**.
2. Set **Site URL** to the Netlify HTTPS URL.
3. Add the same URL to **Redirect URLs**. Add a custom domain too if you use one.
4. Under **Authentication > Providers**, enable and configure Email authentication.
5. On the deployed site, create a test account, sign in, finish a game, and confirm the leaderboard displays the result.

### Alternative Hosts

- **Vercel:** Import the GitHub repository, leave the framework preset as **Other**, leave the build command empty, and set the output directory to `.`.
- **Cloudflare Pages:** Connect the repository, choose **None** as the framework preset, leave the build command empty, and set the build output directory to `.`.
- **GitHub Pages:** In the GitHub repository, open **Settings > Pages**, choose **Deploy from a branch**, and select `main` with the `/ (root)` folder. Use the generated HTTPS URL in the Supabase settings above.

### Launch Checklist

- Replace the **Live demo** placeholder above with the production URL.
- Confirm `supabase-config.js` contains the correct project URL and anon key if using Supabase.
- Confirm the deployed domain is listed in Supabase Auth redirect URLs.
- Open the deployed HTTPS site on desktop and mobile, allow camera access, and complete a round.
- Test account creation, login, score saving, and the leaderboard when Supabase is enabled.
- Confirm the browser displays the camera-permission prompt and that no production page is served through HTTP.

## Run Locally

For local testing, serve the project directory instead of opening `index.html` directly:

```powershell
npx serve .
```

Or:

```powershell
python -m http.server 8000
```

Open the URL printed by the server, then allow camera access when prompted.

## Project Structure

| File | Purpose |
| --- | --- |
| `index.html` | Game interface, navigation, modals, and webcam element |
| `styles.css` | Responsive doodle-style visual design and game effects |
| `game.js` | Gaze tracking, calibration, game flow, scoring, and local profiles |
| `backend.js` | Optional Supabase authentication, run persistence, and leaderboard calls |
| `supabase-config.js` | Place to add optional Supabase public configuration |
| `supabase-schema.sql` | Database tables, policies, and leaderboard function |
| `assets/jumpscare.png` | End-of-round scare graphic |

## How It Works

1. The browser requests webcam permission when a game begins.
2. MediaPipe derives eye-iris and head-position landmarks from the live video.
3. Calibration records your neutral, center-facing gaze.
4. During play, the app compares new landmark positions against that baseline.
5. Looking away or keeping your eyes closed beyond the selected tolerance ends the run and saves the result.

## Privacy

- Webcam frames are processed in the browser for real-time tracking.
- The application does not implement video recording or video uploads.
- In local-only mode, profile data and results stay in your browser's local storage.
- With Supabase enabled, only account/profile information and score metadata are stored remotely; webcam video is still not uploaded.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| The camera does not start | Allow camera permission and open the site through `localhost` or HTTPS, not directly from the file system. |
| Gaze detection feels inaccurate | Keep your face well lit, stay centered in the preview, and complete calibration while looking at the dot. |
| Login or leaderboard does not work | Confirm both Supabase values are present in `supabase-config.js` and that `supabase-schema.sql` has been run. |
| The app stays in local mode | This is expected while `url` and `anonKey` in `supabase-config.js` are empty. |

## Team

Built for TinkerHub Useless Projects.
