<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />

![Kannum Kannum logo](gpt-image-2_create_a_funny_doodle_like_logo_with_title_%E0%B4%95%E0%B4%A3%E0%B5%8D%E0%B4%A3%E0%B5%81%E0%B4%82_%E0%B4%95%E0%B4%A3%E0%B5%8D%E0%B4%A3%E0%B5%81%E0%B4%82-0.jpg)

# Kannum Kannum


## Basic Details
### Team Name: Nisaa


### Team Members
- Team Lead: Neehara Anna Bince - Model Engineering College,Cochin
- Member 2: Sabarinadh V S - Model Engineering College,Cochin


### Project Description
Kannum Kannum is a gaze-endurance browser game where the player must keep looking at a target while the game tries to distract them. It uses the device camera and MediaPipe face landmarks to detect gaze changes and blinks in real time.

Players can choose different eye styles, adjust the look-away tolerance, view their stats and game history, and share a score after a run. The game works locally with browser storage and can optionally use Supabase for accounts, saved runs, and a shared leaderboard.

### The Problem (that doesn't exist)
People keep looking away from screens at the exact moment they are challenged not to. Kannum Kannum turns that familiar lack of focus into a competitive game.

### The Solution (that nobody asked for)
We point a camera at the player, track their face and eye direction in the browser, and introduce increasingly distracting prompts. Look away, blink at the wrong moment, or lose focus for too long and the run ends.

## Technical Details
### Technologies/Components Used
For Software:
- HTML, CSS, and JavaScript (ES modules)
- MediaPipe Tasks Vision Face Landmarker
- Supabase Auth and Postgres (optional online features)
- Browser MediaDevices API for camera access
- CDN imports from jsDelivr and esm.sh
- GitHub Pages, Netlify, or Vercel for static hosting

For Hardware:
- A desktop or mobile device with a front-facing camera
- A modern browser with camera permissions enabled
- No additional hardware is required

### Implementation
For Software:
# Installation
This project has no build step or package installation. Clone or download the repository and serve the project directory through a local HTTP server.

```bash
git clone <repository-url>
cd kannum-kannum
python -m http.server 8000
```

Open `http://localhost:8000` in a modern browser. Opening `index.html` directly may prevent camera access because browsers restrict camera APIs on insecure `file://` pages.

# Run
1. Open the deployed site or local server URL.
2. Allow camera access when the browser asks for permission.
3. Press **START**, complete the short calibration, and keep your gaze on the target.
4. Use **EYE STYLE** and **SETTINGS** before starting a run when needed.

### Project Documentation
For Software:

# Screenshots
![Kannum Kannum dashboard](screenshots/Screenshot%202026-09-05%20055803.png)
*Dashboard view showing the player's current doodle, best run, and quick links. Screenshot captured from the Kannum Kannum application.*

![Kannum Kannum play screen](screenshots/Screenshot%202026-09-05%20055824.png)
*Play view showing the gaze target, camera status, score panel, and start controls. Screenshot captured from the Kannum Kannum application.*

![Kannum Kannum eye collection](screenshots/Screenshot%202026-09-05%20060109.png)
*Eye Collection view showing the available Human, Cyclops, Anime, and Alien target styles. Screenshot captured from the Kannum Kannum application.*

![Kannum Kannum leaderboard](screenshots/Screenshot%202026-09-05%20060119.png)
*Leaderboard view showing local player scores and the leaderboard rules. Screenshot captured from the Kannum Kannum application.*

![Kannum Kannum stats](screenshots/Screenshot%202026-09-05%20060129.png)
*Stats view showing survival time, best level, and total logged runs. Screenshot captured from the Kannum Kannum application.*

![Kannum Kannum game history](screenshots/Screenshot%202026-09-05%20060140.png)
*Game History view showing recent runs and the reasons each run ended. Screenshot captured from the Kannum Kannum application.*

*Image source: screenshots captured by the Kannum Kannum project team and stored in the repository's `screenshots/` directory.*

# Diagrams
![Kannum Kannum workflow diagram](assets/workflow-diagram.svg)
*The browser loads the static game, MediaPipe processes camera landmarks locally, and Supabase is used only when online persistence is configured.*

### Project Demo
# Video
[Watch the Kannum Kannum demo video](assets/demo.mp4)
*The demo shows camera calibration, a complete gaze-endurance run, distraction detection, and the score screen.*

# Additional Demos
[Add the deployed site URL, presentation, or additional demo materials here]

## Team Contributions
- Neehara Anna Bince: Game concept, interaction design, and frontend implementation
- Sabarinadh V S: Camera-based gaze detection and gameplay logic. Supabase integration, testing, and deployment

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)
