import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import {
  backendEnabled,
  currentBackendProfile,
  getBackendLeaderboard,
  loginBackend,
  logoutBackend,
  registerBackend,
  saveBackendRun,
} from "./backend.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage"),
  video = $("webcam"),
  target = $("target");

let landmarker,
  stream,
  raf,
  lastVideo = -1,
  mode = "menu",
  style = "human",
  baseline = {
    x: 0.5,
    y: 0.5,
    hx: 0,
    hy: 0,
    xTolerance: 0.006,
    yTolerance: 0.006,
    hxTolerance: 0.03,
    hyTolerance: 0.03,
  },
  lastRaw = null,
  wrongSince = 0,
  blinkSince = 0,
  wasBlinking = false,
  violationReason = "GAZE DIRECTION CHANGED",
  startedAt = 0,
  level = 1,
  blinks = 0,
  lastDistraction = 0,
  toleranceMs = 1250,
  debugMode = false,
  currentUser = localStorage.getItem("kk-current-user") || "",
  authMode = "register";

let remoteProfile = null;

const messages = [
  "LOOK LEFT.",
  "HEY, WHAT'S THAT?",
  "YOUR PHONE IS RINGING.",
  "Don't look at the timer.",
  "Are you seriously still staring?",
  "Blink if you're scared.",
  "LOOK DOWN.",
  "Something is behind you.",
];

function status(text, color = "var(--muted)") {
  $("status").firstChild.textContent = text;
  $("status").style.color = color;
}

function best() {
  const profile = getProfile();
  $("best-score").innerHTML = `${profile.bestScore || 0} <small>sec</small>`;
  $("best-level").textContent = profile.bestLevel || 0;
}

function getUsers() {
  return JSON.parse(localStorage.getItem("kk-users") || "{}");
}

function getProfile() {
  if (remoteProfile) return remoteProfile;
  const users = getUsers();
  return (
    users[currentUser] || {
      name: currentUser || "Anonymous Eye",
      password: "",
      bestScore: 0,
      bestLevel: 0,
      history: [],
    }
  );
}

function saveProfile(profile) {
  const users = getUsers();
  users[profile.name] = profile;
  localStorage.setItem("kk-users", JSON.stringify(users));
  currentUser = profile.name;
  localStorage.setItem("kk-current-user", currentUser);
}

function getLocalLeaderboard() {
  return Object.values(getUsers())
    .map((profile) => ({
      username: profile.name,
      best_score: Number(profile.bestScore || 0),
      best_level: Number(profile.bestLevel || 0),
    }))
    .sort(
      (a, b) =>
        b.best_score - a.best_score ||
        b.best_level - a.best_level ||
        a.username.localeCompare(b.username),
    )
    .slice(0, 25);
}

function leaderboardList(rows) {
  if (!rows.length) return "<li>No scores yet. Play a round to join.</li>";
  return rows
    .map(
      (row, index) =>
        `<li>${index + 1}. ${row.username} — ${Number(row.best_score || 0).toFixed(1)}s · Level ${Number(row.best_level || 0)}</li>`,
    )
    .join("");
}

function updateAuthButton() {
  const button = $("login-button");
  const loggedIn = Boolean(currentUser);
  button.textContent = loggedIn ? "LOGOUT" : "LOGIN";
  button.setAttribute("aria-label", loggedIn ? "Log out" : "Log in");
}

function requireLogin() {
  if (currentUser) return true;
  openAuth("login");
  return false;
}

function openAuth(nextMode = "login") {
  authMode = nextMode;
  $("login-modal").classList.remove("hidden");
  $("auth-title").textContent =
    nextMode === "login" ? "Welcome back, watcher." : "Who is staring?";
  $("auth-eyebrow").textContent =
    nextMode === "login" ? "Player login" : "Create player pass";
  $("save-login").textContent =
    nextMode === "login" ? "LOGIN" : "CREATE PROFILE";
  $("switch-auth").textContent =
    nextMode === "login" ? "CREATE NEW ACCOUNT" : "I HAVE AN ACCOUNT";
}

function rawGaze(result) {
  if (!result.faceLandmarks?.length) return null;
  const face = result.faceLandmarks[0];
  const avg = (ids) =>
    ids.reduce(
      (point, index) => ({
        x: point.x + face[index].x / ids.length,
        y: point.y + face[index].y / ids.length,
      }),
      { x: 0, y: 0 },
    );
  const leftIris = avg([468, 469, 470, 471, 472]);
  const rightIris = avg([473, 474, 475, 476, 477]);
  const leftSpan = Math.max(0.01, face[133].x - face[33].x);
  const rightSpan = Math.max(0.01, face[263].x - face[362].x);
  const leftCornerMid = {
    x: (face[33].x + face[133].x) / 2,
    y: (face[33].y + face[133].y) / 2,
  };
  const rightCornerMid = {
    x: (face[362].x + face[263].x) / 2,
    y: (face[362].y + face[263].y) / 2,
  };
  const eyeMid = {
    x: (leftCornerMid.x + rightCornerMid.x) / 2,
    y: (leftCornerMid.y + rightCornerMid.y) / 2,
  };
  const eyeSpan = (leftSpan + rightSpan) / 2;
  const leftX = (leftIris.x - face[33].x) / leftSpan;
  const rightX = (rightIris.x - face[362].x) / rightSpan;
  const leftY = (leftIris.y - leftCornerMid.y) / leftSpan;
  const rightY = (rightIris.y - rightCornerMid.y) / rightSpan;
  const openness =
    ((face[145].y - face[159].y) / leftSpan +
      (face[374].y - face[386].y) / rightSpan) /
    2;
  return {
    eyesOpen: openness > 0.22,
    raw: {
      x: Math.max(0, Math.min(1, (leftX + rightX) / 2)),
      y: (leftY + rightY) / 2,
      hx: (face[1].x - eyeMid.x) / eyeSpan,
      hy: (face[1].y - eyeMid.y) / eyeSpan,
    },
  };
}

function detect() {
  if (video.readyState >= 2 && video.currentTime !== lastVideo) {
    lastVideo = video.currentTime;
    const sample = rawGaze(landmarker.detectForVideo(video, performance.now()));
    if (sample?.eyesOpen === false) {
      if (!blinkSince) {
        blinkSince = Date.now();
        if (!wasBlinking) blinks++;
      }
      wasBlinking = true;
      if (mode === "playing" && !isJumpscaring)
        gameOver("BLINKING DETECTED");
    } else if (sample) {
      blinkSince = 0;
      wasBlinking = false;
      lastRaw = lastRaw
        ? {
            x: lastRaw.x * 0.72 + sample.raw.x * 0.28,
            y: lastRaw.y * 0.72 + sample.raw.y * 0.28,
            hx: lastRaw.hx * 0.72 + sample.raw.hx * 0.28,
            hy: lastRaw.hy * 0.72 + sample.raw.hy * 0.28,
          }
        : sample.raw;
      const headX =
        Math.abs(lastRaw.hx - baseline.hx) > 0.08
          ? (lastRaw.hx - baseline.hx) * 0.4
          : 0;
      const headY =
        Math.abs(lastRaw.hy - baseline.hy) > 0.08
          ? (lastRaw.hy - baseline.hy) * 0.3
          : 0;
      const pupilShift = Math.hypot(
          (lastRaw.x - baseline.x) * 3.2,
          (lastRaw.y - baseline.y) * 5,
        ),
        headShift = Math.hypot(headX, headY);
      if (headShift > pupilShift && headShift > 0.05)
        violationReason = "HEAD MOVEMENT DETECTED";
      else violationReason = "GAZE DIRECTION CHANGED";
      const verticalLook = (lastRaw.y - baseline.y) * 6.5 + headY;
      const screen = {
        x: Math.max(
          0,
          Math.min(1, 0.5 + (lastRaw.x - baseline.x) * 3.2 + headX),
        ),
        y: Math.max(0, Math.min(1, 0.5 + verticalLook)),
      };
      $("gaze-dot").style.left = `${screen.x * 100}%`;
      $("gaze-dot").style.top = `${screen.y * 100}%`;
      if (mode === "playing" && !isJumpscaring) checkGaze();
      if (debugMode)
        $("debug").innerHTML =
          `GAZE: ${screen.x < 0.4 ? "LEFT" : screen.x > 0.6 ? "RIGHT" : screen.y < 0.4 ? "UP" : screen.y > 0.6 ? "DOWN" : "CENTER"}<br>IRIS X: ${lastRaw.x.toFixed(3)}<br>IRIS Y: ${lastRaw.y.toFixed(3)}<br>HEAD X: ${lastRaw.hx.toFixed(3)}<br>HEAD Y: ${lastRaw.hy.toFixed(3)}<br>EYES: OPEN<br>ZONE: ${mode === "playing" && !wrongSince ? "SAFE" : "WATCHING"}<br>LOOK-AWAY: ${wrongSince ? ((Date.now() - wrongSince) / 1000).toFixed(1) + "s" : "0.0s"}`;
    } else if (mode === "playing" && !isJumpscaring) {
      if (!blinkSince) blinkSince = Date.now();
      if (Date.now() - blinkSince > 1800) gameOver("FACE TRACKING LOST");
    }
  }
  raf = requestAnimationFrame(detect);
}

function checkGaze() {
  // Compare against the player's calibration rather than a generic screen
  // radius. This keeps the center-eye requirement strict but personal.
  const gazeDistance = Math.hypot(
      (lastRaw.x - baseline.x) / baseline.xTolerance,
      (lastRaw.y - baseline.y) / baseline.yTolerance,
    ),
    headDistance = Math.hypot(
      (lastRaw.hx - baseline.hx) / baseline.hxTolerance,
      (lastRaw.hy - baseline.hy) / baseline.hyTolerance,
    ),
    limit = Math.max(0.62, 1 - (level - 1) * 0.045),
    distance = Math.max(gazeDistance, headDistance),
    ok = distance < limit;
  const elapsed = (Date.now() - startedAt) / 1000;
  $("timer").textContent =
    `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${(elapsed % 60).toFixed(2).padStart(5, "0")}`;
  $("score").textContent = String(
    Math.floor(elapsed * 10 + level * 5),
  ).padStart(3, "0");
  $("meter-fill").style.transform =
    `scaleX(${Math.max(0, Math.min(1, 1 - distance / limit))})`;
  $("meter-fill").style.background = ok ? "var(--mint-deep)" : "var(--coral)";
  if (ok) {
    wrongSince = 0;
    status(level > 3 ? "THE EYE IS IMPRESSED." : "HOLD YOUR GAZE");
  } else {
    wrongSince = Date.now();
    status("GAZE MOVED", "var(--coral)");
    gameOver(violationReason);
  }
  if (elapsed > level * 10) {
    level = Math.min(9, Math.floor(elapsed / 10) + 1);
    $("round-label").textContent = `LEVEL ${level}`;
  }
}

function distract() {
  if (mode !== "playing" || Date.now() - lastDistraction < 3200) return;
  const elapsed = (Date.now() - startedAt) / 1000;
  if (elapsed < 8 || Math.random() > 0.34 + level * 0.04) return;
  lastDistraction = Date.now();
  const d = document.createElement("div");
  d.className = `distraction ${Math.random() > 0.7 ? "alert" : ""}`;
  d.textContent = messages[Math.floor(Math.random() * messages.length)];
  d.style.left = `${8 + Math.random() * 70}%`;
  d.style.top = `${13 + Math.random() * 68}%`;
  if (Math.abs(parseFloat(d.style.left) - 50) < 18) d.style.left = "8%";
  stage.appendChild(d);
  if (level > 4 && Math.random() > 0.5) stage.classList.add("screen-flash");
  setTimeout(() => d.remove(), Math.min(4200, 1800 + level * 230));
  setTimeout(() => stage.classList.remove("screen-flash"), 450);
}

function audio(pitch = 320) {
  try {
    const c = getAudioContext(),
      o = c.createOscillator(),
      g = c.createGain();
    o.frequency.value = pitch;
    g.gain.setValueAtTime(0.04, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.18);
  } catch {}
}

function gameOver(reason) {
  if (mode !== "playing") return;
  mode = "over";

  // Cleanup jumpscare state
  document.body.classList.remove('in-game');
  clearTimeout(jumpscareTimer);

  target.classList.add("annoyed");
  $("timer").classList.add("hidden");
  $("zone").classList.add("hidden");
  $("gaze-dot").classList.add("hidden");
  const seconds = (Date.now() - startedAt) / 1000;
  const profile = getProfile();
  profile.bestScore = Math.max(profile.bestScore || 0, Math.floor(seconds));
  profile.bestLevel = Math.max(profile.bestLevel || 0, level);
  profile.history = profile.history || [];
  profile.history.unshift({
    time: seconds,
    level,
    reason,
    date: new Date().toLocaleDateString(),
  });
  profile.history = profile.history.slice(0, 12);
  saveProfile(profile);
  saveBackendRun({ time: seconds, level, reason }).catch(() => status("SCORE SYNC FAILED", "var(--coral)"));
  updateEyeLocks();
  best();
  audio(130);
  $("welcome").classList.remove("hidden");
  $("round-label").textContent = "RESULTS";
  $("welcome").innerHTML =
    `<div><div class="eyebrow">${reason}</div><h2>GAZE LOST.</h2><p>I saw that. You survived <b>${seconds.toFixed(2)} seconds</b>, reached level ${level}, and blinked ${blinks} time${blinks === 1 ? "" : "s"}. The eye wins this round.</p><button class="primary" id="retry">RETRY <span aria-hidden="true">↗</span></button><button class="ghost" id="menu">MAIN MENU</button></div>`;
  $("retry").onclick = () => {
    menu();
    begin();
  };
  $("menu").onclick = menu;
}

function renderPortal(view) {
  const profile = getProfile();
  const name = profile.name || "Anonymous Eye";
  const history = profile.history || [];
  const bestScore = profile.bestScore || 0;
  const bestLevel = profile.bestLevel || 0;
  const titles = {
    dashboard: "DASHBOARD",
    collection: "EYE COLLECTION",
    leaderboard: "LEADERBOARD",
    stats: "STATS",
    history: "GAME HISTORY",
  };
  const views = {
    dashboard: `<div class="portal-card dashboard-welcome"><span class="tiny-eye">👀</span><img class="dashboard-poster" src="gpt-image-2_create_a_funny_doodle_like_logo_with_title_%E0%B4%95%E0%B4%A3%E0%B5%8D%E0%B4%A3%E0%B5%81%E0%B4%82_%E0%B4%95%E0%B4%A3%E0%B5%8D%E0%B4%A3%E0%B5%81%E0%B4%82-0.jpg" alt="Kannum Kannum poster" /><h3>Hi, ${name}!</h3><p>Your eyes are warmed up. Ready to cause some chaos?</p><button class="primary portal-play" type="button">PLAY NOW →</button></div><div class="portal-card"><h3>Current doodle</h3><p>Best run</p><strong>${bestScore}s</strong><p>Level ${bestLevel} reached. Suspiciously focused.</p></div><div class="portal-card"><h3>Quick links</h3><ul class="portal-list"><li>Collect weird eyes</li><li>Climb the leaderboard</li><li>Prove you can stare</li></ul></div>`,
    collection: `<div class="portal-card collection-card"><span class="collection-eye human"><i></i></span><h3>Human</h3><p>Classic watcher. Available from level 1.</p><button class="ghost collection-select" data-collection-eye="human">USE THIS EYE</button></div><div class="portal-card collection-card"><span class="collection-eye cyclops"><i></i></span><h3>Cyclops</h3><p>${bestLevel >= 2 ? "Unlocked. One eye, zero excuses." : "Locked. Reach level 2."}</p><button class="ghost collection-select" data-collection-eye="cyclops" ${bestLevel >= 2 ? "" : "disabled"}>${bestLevel >= 2 ? "USE THIS EYE" : "LEVEL 2"}</button></div><div class="portal-card collection-card"><span class="collection-eye anime"><i></i></span><h3>Anime</h3><p>${bestLevel >= 3 ? "Unlocked. Maximum drama." : "Locked. Reach level 3."}</p><button class="ghost collection-select" data-collection-eye="anime" ${bestLevel >= 3 ? "" : "disabled"}>${bestLevel >= 3 ? "USE THIS EYE" : "LEVEL 3"}</button></div><div class="portal-card collection-card"><span class="collection-eye alien"><i></i></span><h3>Alien</h3><p>${bestLevel >= 5 ? "Unlocked. It has seen things." : "Locked. Reach level 5."}</p><button class="ghost collection-select" data-collection-eye="alien" ${bestLevel >= 5 ? "" : "disabled"}>${bestLevel >= 5 ? "USE THIS EYE" : "LEVEL 5"}</button></div>`,
    leaderboard: `<div class="portal-card"><h3>Local legends</h3><ol class="portal-list">${leaderboardList(getLocalLeaderboard())}</ol></div><div class="portal-card"><h3>Leaderboard rule</h3><p>These scores are from accounts saved in this browser.</p></div>`,
    stats: `<div class="portal-card"><h3>Survival time</h3><strong>${bestScore}s</strong><p>Your longest eye contact.</p></div><div class="portal-card"><h3>Best level</h3><strong>${bestLevel}</strong><p>The eye remembers.</p></div><div class="portal-card"><h3>Runs logged</h3><strong>${history.length}</strong><p>Every loss is research.</p></div>`,
    history: history.length
      ? `<div class="portal-card"><h3>Recent staring</h3><ul class="portal-list">${history.map((run) => `<li>${run.date}: ${run.time.toFixed(1)}s — ${run.reason}</li>`).join("")}</ul></div>`
      : `<div class="portal-card"><span class="tiny-eye">👀</span><h3>No history yet</h3><p>Play a round and the eyes will write it down.</p></div>`,
  };
  $("portal-title").textContent = titles[view];
  $("portal-content").innerHTML = views[view];
  if (view === "leaderboard" && backendEnabled) {
    getBackendLeaderboard()
      .then((rows) => {
        $("portal-content").innerHTML =
          `<div class="portal-card"><h3>Shared eye legends</h3><ol class="portal-list">${leaderboardList(rows)}</ol></div><div class="portal-card"><h3>Live leaderboard</h3><p>Scores synced through Supabase.</p></div>`;
      })
      .catch(() => {
        $("portal-content").innerHTML =
          '<div class="portal-card"><h3>Shared leaderboard unavailable</h3><p>Run the latest <code>supabase-schema.sql</code> in your Supabase SQL editor, then reload.</p></div>';
      });
  }
  const play = $("portal-content").querySelector(".portal-play");
  if (play) play.onclick = () => setView("play");
  document.querySelectorAll(".collection-select").forEach((button) => {
    button.onclick = () => {
      selectEyeStyle(button.dataset.collectionEye);
      setView("play");
    };
  });
}

function setView(view) {
  const portalViews = [
    "dashboard",
    "collection",
    "leaderboard",
    "stats",
    "history",
  ];
  const isPortal = portalViews.includes(view);
  if (!requireLogin()) return;
  $("portal").classList.toggle("hidden", !isPortal);
  document.querySelector("main").classList.toggle("hidden", view !== "play");
  document
    .querySelectorAll(".nav-link[data-view]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === view),
    );
  if (isPortal) renderPortal(view);
  if (view === "play") {
    $("round-label").textContent =
      mode === "menu" ? "MAIN MENU" : $("round-label").textContent;
  }
}

const unlockLevels = { human: 1, cyclops: 2, anime: 3, alien: 5 };
function updateEyeLocks() {
  const reached = getProfile().bestLevel || 0;
  document.querySelectorAll(".choice").forEach((button) => {
    const unlocked = reached >= unlockLevels[button.dataset.eye];
    button.disabled = !unlocked;
    button.title = unlocked
      ? "Unlocked"
      : `Reach level ${unlockLevels[button.dataset.eye]} to unlock`;
  });
}

document
  .querySelectorAll(".nav-link[data-view]")
  .forEach((button) => (button.onclick = () => setView(button.dataset.view)));

$("login-button").onclick = async () => {
  if (!currentUser) {
    openAuth("login");
    return;
  }
  try {
    await logoutBackend();
  } catch (error) {
    return status(error.message || "LOGOUT FAILED", "var(--coral)");
  }
  currentUser = "";
  remoteProfile = null;
  localStorage.removeItem("kk-current-user");
  updateAuthButton();
  $("portal").classList.add("hidden");
  document.querySelector("main").classList.remove("hidden");
  best();
  updateEyeLocks();
  status("LOGGED OUT");
  openAuth("login");
};

$("close-login").onclick = () => $("login-modal").classList.add("hidden");
$("switch-auth").onclick = () =>
  openAuth(authMode === "login" ? "register" : "login");

$("save-login").onclick = async () => {
  const value = $("player-name").value.trim();
  const email = $("player-email").value.trim();
  const password = $("player-password").value;
  if (!value || !email || password.length < 6)
    return status(
      "USERNAME, EMAIL + 6 CHARACTER PASSWORD REQUIRED",
      "var(--coral)",
    );
  if (backendEnabled) {
    try {
      remoteProfile =
        authMode === "register"
          ? await registerBackend(email, password, value)
          : await loginBackend(email, password);
      currentUser = remoteProfile.name;
      localStorage.setItem("kk-current-user", currentUser);
    } catch (error) {
      return status(error.message || "BACKEND LOGIN FAILED", "var(--coral)");
    }
  }
  const users = getUsers();
  if (authMode === "register") {
    if (users[value] && !backendEnabled)
      return status("THAT USERNAME IS TAKEN", "var(--coral)");
    saveProfile({
      name: value,
      password,
      bestScore: 0,
      bestLevel: 1,
      history: [],
    });
  } else {
    if (
      !backendEnabled &&
      (!users[value] || users[value].password !== password)
    )
      return status("WRONG USERNAME OR PASSWORD", "var(--coral)");
    saveProfile(users[value]);
  }
  $("login-modal").classList.add("hidden");
  updateAuthButton();
  updateEyeLocks();
  renderPortal("dashboard");
  setView("dashboard");
};

async function calibrate() {
  mode = "calibrating";
  $("round-label").textContent = "CALIBRATION";
  $("welcome").classList.add("hidden");
  const dot = $("cal-dot");
  dot.classList.remove("hidden");
  dot.style.left = "50%";
  dot.style.top = "50%";
  status("LOOK DIRECTLY AT THE CENTER");
  let sum = { x: 0, y: 0, hx: 0, hy: 0 },
    sumSquares = { x: 0, y: 0, hx: 0, hy: 0 },
    samples = 0;
  await new Promise((resolve) => setTimeout(resolve, 700));
  const end = Date.now() + 2200;
  while (Date.now() < end) {
    if (lastRaw) {
      sum.x += lastRaw.x;
      sum.y += lastRaw.y;
      sum.hx += lastRaw.hx;
      sum.hy += lastRaw.hy;
      sumSquares.x += lastRaw.x ** 2;
      sumSquares.y += lastRaw.y ** 2;
      sumSquares.hx += lastRaw.hx ** 2;
      sumSquares.hy += lastRaw.hy ** 2;
      samples++;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  dot.classList.add("hidden");
  const average = (value, fallback) => (samples ? value / samples : fallback);
  const spread = (value, squared) =>
    samples
      ? Math.sqrt(Math.max(0, squared / samples - (value / samples) ** 2))
      : 0;
  baseline = {
    x: average(sum.x, 0.5),
    y: average(sum.y, 0.5),
    hx: average(sum.hx, 0),
    hy: average(sum.hy, 0),
    // Four standard deviations absorb normal webcam noise without allowing a
    // deliberate glance away from the center eye.
    xTolerance: Math.max(0.006, spread(sum.x, sumSquares.x) * 4),
    yTolerance: Math.max(0.006, spread(sum.y, sumSquares.y) * 4),
    hxTolerance: Math.max(0.03, spread(sum.hx, sumSquares.hx) * 4),
    hyTolerance: Math.max(0.03, spread(sum.hy, sumSquares.hy) * 4),
  };
  mode = "playing";
  startedAt = Date.now();
  level = 1;
  blinks = 0;
  wasBlinking = false;
  wrongSince = 0;

  // Set active game state and trigger mid-game jumpscare timer
  document.body.classList.add('in-game');
  scheduleMidGameJumpscare();

  $("timer").classList.remove("hidden");
  $("zone").classList.remove("hidden");
  $("gaze-dot").classList.remove("hidden");
  $("round-label").textContent = "LEVEL 1";
  status("HOLD YOUR GAZE");
  audio(520);
}

async function begin() {
  if (!requireLogin()) return;
  $("start").disabled = true;
  $("start").textContent = "OPENING CAMERA...";
  try {
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
    }
    $("connection").textContent = "CAMERA ONLINE";
    status("LOADING FACE MODEL");
    if (!landmarker)
      landmarker = await FaceLandmarker.createFromOptions(
        await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
        ),
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        },
      );
    if (!raf) detect();
    await calibrate();
  } catch (e) {
    console.error(e);
    $("connection").textContent = "CAMERA NEEDED";
    status("CAMERA BLOCKED", "var(--coral)");
    $("welcome").classList.remove("hidden");
    $("welcome").querySelector("p").textContent =
      "Face tracking needs camera permission. Allow access, sit in front of the camera, then try again.";
    $("start").disabled = false;
    $("start").textContent = "TRY CAMERA AGAIN →";
  }
}

function menu() {
  mode = "menu";
  $("welcome").classList.remove("hidden");
  $("round-label").textContent = "MAIN MENU";
  $("timer").classList.add("hidden");
  $("zone").classList.add("hidden");
  $("gaze-dot").classList.add("hidden");
  $("target").classList.remove("annoyed");
  $("welcome").innerHTML =
    '<div><div class="eyebrow">KANNUM KANNUM</div><h2>How long can you keep looking?</h2><p>Camera processing stays in this browser. No video is recorded or uploaded.</p><button class="primary" id="start">START <span aria-hidden="true">→</span></button><button class="ghost" id="style-button">EYE STYLE</button><button class="ghost" id="settings-button">SETTINGS</button></div>';
  bindMenu();
}

function bindMenu() {
  $("start").onclick = begin;
  $("style-button").onclick = () => $("style-modal").classList.remove("hidden");
  $("settings-button").onclick = () =>
    $("settings-modal").classList.remove("hidden");
}

document.querySelectorAll(".choice").forEach(
  (button) =>
    (button.onclick = () => {
      if (button.disabled) return;
      selectEyeStyle(button.dataset.eye);
    }),
);

function selectEyeStyle(nextStyle) {
  style = nextStyle;
  target.dataset.style = style;
  target.querySelector(".iris").style.backgroundImage = "";
  document
    .querySelectorAll(".choice")
    .forEach((choice) => choice.classList.toggle("active", choice.dataset.eye === style));
}

$("close-style").onclick = () => $("style-modal").classList.add("hidden");
$("close-settings").onclick = () => {
  toleranceMs = +$("tolerance-input").value;
  debugMode = $("debug-input").checked;
  $("debug").classList.toggle("hidden", !debugMode);
  $("settings-modal").classList.add("hidden");
};

bindMenu();
best();
updateEyeLocks();
updateAuthButton();

if (backendEnabled) {
  currentUser = "";
  localStorage.removeItem("kk-current-user");
  updateAuthButton();
  openAuth("login");
  currentBackendProfile()
    .then((profile) => {
      if (!profile) return;
      remoteProfile = profile;
      currentUser = profile.name;
      localStorage.setItem("kk-current-user", currentUser);
      updateAuthButton();
      updateEyeLocks();
      best();
      $("login-modal").classList.add("hidden");
      setView("dashboard");
    })
    .catch(() => {});
} else if (currentUser) {
  setView("dashboard");
} else {
  openAuth("login");
}

setInterval(distract, 900);

document.addEventListener("pointermove", (event) => {
  document.querySelectorAll(".logo-eye i").forEach((pupil) => {
    const eye = pupil.parentElement.getBoundingClientRect();
    const angle = Math.atan2(
      event.clientY - (eye.top + eye.height / 2),
      event.clientX - (eye.left + eye.width / 2),
    );
    const distance = Math.min(
      4,
      Math.hypot(
        event.clientX - (eye.left + eye.width / 2),
        event.clientY - (eye.top + eye.height / 2),
      ) / 80,
    );
    pupil.style.transform = `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px))`;
  });
});

// ==========================================
// AUDIO CONTEXT MANAGER & JUMPSCARE AUDIO
// ==========================================
let audioCtx = null;
let scareAudioBuffer = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Unlock Web Audio policy on the player's first gesture
document.addEventListener('click', () => {
  getAudioContext();
}, { once: true });

async function loadScareAudio() {
  try {
    const response = await fetch('assets/jumpscare.mp3');
    const arrayBuffer = await response.arrayBuffer();
    const ctx = getAudioContext();
    scareAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn('Scare audio failed to load:', err);
  }
}
loadScareAudio();

function playScareSound() {
  if (!scareAudioBuffer) return;
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = scareAudioBuffer;
  source.connect(ctx.destination);
  source.start(0);
}

// ==========================================
// MID-GAME RANDOM JUMPSCARE CONTROLLER
// ==========================================
let jumpscareTimer = null;
let isJumpscaring = false;

function scheduleMidGameJumpscare() {
  clearTimeout(jumpscareTimer);
  
// Trigger early enough to occur in an ordinary successful round, while
  // keeping the exact moment unpredictable.
  const randomDelayMs = 5000 + Math.random() * 3000;

  // Never trigger before 30 seconds; select a random moment from 30–60s.
//const randomDelayMs = 30000 + Math.random() * 30000;
  
  jumpscareTimer = setTimeout(() => {
    if (document.body.classList.contains('in-game')) {
      // The scare is only a distraction. It does not automatically end a
      // round; normal blink and gaze checks resume when it disappears.
      triggerJumpscare();
    }
  }, randomDelayMs);
}

function triggerJumpscare(callback) {
  if (isJumpscaring) return;
  isJumpscaring = true;

  const overlay = document.getElementById('jumpscare-overlay');
  const eyeContainer = document.getElementById('jumpscare-eye-container');
  const activeTarget = document.querySelector('.stage-wrap .target');

  if (eyeContainer && activeTarget) {
    eyeContainer.innerHTML = '';
    const clonedEye = activeTarget.cloneNode(true);
    eyeContainer.appendChild(clonedEye);
  }

  playScareSound();

  if (overlay) {
    overlay.classList.remove('jumpscare-hidden');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }

  setTimeout(() => {
    if (overlay) {
      overlay.classList.remove('active');
      overlay.classList.add('jumpscare-hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (eyeContainer) {
      eyeContainer.innerHTML = '';
    }
    isJumpscaring = false;
    if (typeof callback === 'function') callback();
  }, 850);
}

// Global hook for debugging in browser console (F12)
window.triggerJumpscare = triggerJumpscare;

// ==========================================
// CUSTOM EYE UPLOAD & SHARE HANDLERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const eyeInput = document.getElementById('custom-eye-input');
  if (eyeInput) {
    eyeInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const iris = target.querySelector('.iris');
        if (!iris) return;
        style = 'custom';
        target.dataset.style = style;
        iris.style.backgroundImage = `url(${loadEvent.target.result})`;
        iris.style.backgroundSize = 'cover';
        iris.style.backgroundPosition = 'center';
        document
          .querySelectorAll('.choice')
          .forEach((choice) => choice.classList.remove('active'));
      };
      reader.readAsDataURL(file);
    });
  }

  const shareBtn = document.getElementById('btn-share-run');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const score = document.getElementById('final-score')?.innerText || '0';
      if (navigator.share) {
        navigator.share({
          title: 'Kannum-Kannum Gaze Challenge',
          text: `I scored ${score} points before jumping out of my seat in Kannum-Kannum! Can you beat me?`,
          url: window.location.href
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(`I scored ${score} in Kannum-Kannum! Try it here: ${window.location.href}`);
        alert('Score copied to clipboard!');
      }
    });
  }
});
