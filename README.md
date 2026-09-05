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
- Increasing levels, distractions, and best-run stats
- Unlockable eye styles plus custom-eye uploads
- No accounts, logins, or online leaderboard
- A small jump-scare finale for distraction

## Tech Stack

- HTML, CSS, and vanilla JavaScript
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) for browser-side face landmarks
- Browser `localStorage` for device-local best-score and best-level stats

## Deploy

Kannum Kannum is a static web application: there is no build step or server runtime. The deployment host must provide HTTPS because browsers only allow webcam access from secure origins. `localhost` is also accepted for development.

### 1. Publish the Project with Netlify

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

### Alternative Hosts

- **Vercel:** Import the GitHub repository, leave the framework preset as **Other**, leave the build command empty, and set the output directory to `.`.
- **Cloudflare Pages:** Connect the repository, choose **None** as the framework preset, leave the build command empty, and set the build output directory to `.`.
- **GitHub Pages:** In the GitHub repository, open **Settings > Pages**, choose **Deploy from a branch**, and select `main` with the `/ (root)` folder.

### Launch Checklist

- Replace the **Live demo** placeholder above with the production URL.
- Open the deployed HTTPS site on desktop and mobile, allow camera access, and complete a round.
- Play a round and confirm that the local best score and level update.
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
| `game.js` | Gaze tracking, calibration, game flow, and scoring |
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
- Best score and best level stay only in this browser's local storage.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| The camera does not start | Allow camera permission and open the site through `localhost` or HTTPS, not directly from the file system. |
| Gaze detection feels inaccurate | Keep your face well lit, stay centered in the preview, and complete calibration while looking at the dot. |
| Scores are missing on another device | Best scores are stored only in the current browser and do not sync between devices. |

## Team

Built for TinkerHub Useless Projects.
