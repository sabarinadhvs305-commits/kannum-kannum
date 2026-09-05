import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

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
  debugMode = false;

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
  $("best-score").innerHTML = `${getBestScore()} <small>sec</small>`;
  $("best-level").textContent = getBestLevel();
}

function getBestScore() {
  return Number(localStorage.getItem("kk-best-score") || 0);
}

function getBestLevel() {
  return Number(localStorage.getItem("kk-best-level") || 0);
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
  localStorage.setItem(
    "kk-best-score",
    String(Math.max(getBestScore(), Math.floor(seconds))),
  );
  localStorage.setItem("kk-best-level", String(Math.max(getBestLevel(), level)));
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
  const bestScore = getBestScore();
  const bestLevel = getBestLevel();
  const titles = {
    collection: "EYE COLLECTION",
    stats: "STATS",
  };
  const views = {
    collection: `<div class="portal-card collection-card"><span class="collection-eye human"><i></i></span><h3>Human</h3><p>Classic watcher. Available from level 1.</p><button class="ghost collection-select" data-collection-eye="human">USE THIS EYE</button></div><div class="portal-card collection-card"><span class="collection-eye cyclops"><i></i></span><h3>Cyclops</h3><p>${bestLevel >= 2 ? "Unlocked. One eye, zero excuses." : "Locked. Reach level 2."}</p><button class="ghost collection-select" data-collection-eye="cyclops" ${bestLevel >= 2 ? "" : "disabled"}>${bestLevel >= 2 ? "USE THIS EYE" : "LEVEL 2"}</button></div><div class="portal-card collection-card"><span class="collection-eye anime"><i></i></span><h3>Anime</h3><p>${bestLevel >= 3 ? "Unlocked. Maximum drama." : "Locked. Reach level 3."}</p><button class="ghost collection-select" data-collection-eye="anime" ${bestLevel >= 3 ? "" : "disabled"}>${bestLevel >= 3 ? "USE THIS EYE" : "LEVEL 3"}</button></div><div class="portal-card collection-card"><span class="collection-eye alien"><i></i></span><h3>Alien</h3><p>${bestLevel >= 5 ? "Unlocked. It has seen things." : "Locked. Reach level 5."}</p><button class="ghost collection-select" data-collection-eye="alien" ${bestLevel >= 5 ? "" : "disabled"}>${bestLevel >= 5 ? "USE THIS EYE" : "LEVEL 5"}</button></div>`,
    stats: `<div class="portal-card"><h3>Survival time</h3><strong>${bestScore}s</strong><p>Your longest eye contact on this device.</p></div><div class="portal-card"><h3>Best level</h3><strong>${bestLevel}</strong><p>The eye remembers.</p></div>`,
  };
  $("portal-title").textContent = titles[view];
  $("portal-content").innerHTML = views[view];
  document.querySelectorAll(".collection-select").forEach((button) => {
    button.onclick = () => {
      selectEyeStyle(button.dataset.collectionEye);
      setView("play");
    };
  });
}

function setView(view) {
  const portalViews = [
    "collection",
    "stats",
  ];
  const isPortal = portalViews.includes(view);
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
  const reached = Math.max(1, getBestLevel());
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
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    $("connection").textContent = "HTTPS REQUIRED";
    status("OPEN THROUGH LOCALHOST OR HTTPS", "var(--coral)");
    $("welcome").querySelector("p").textContent =
      "Camera access is blocked when this file is opened directly. Run it on localhost or deploy it to an HTTPS site, then try again.";
    return;
  }

  $("start").disabled = true;
  $("start").textContent = "OPENING CAMERA...";
  try {
    const cameraStopped = stream?.getVideoTracks().every((track) => track.readyState === "ended");
    if (!stream || cameraStopped) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      video.srcObject = stream;
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });
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
    const denied = e.name === "NotAllowedError" || e.name === "SecurityError";
    const missing = e.name === "NotFoundError" || e.name === "OverconstrainedError";
    $("connection").textContent = denied ? "CAMERA BLOCKED" : "CAMERA UNAVAILABLE";
    status(denied ? "ALLOW CAMERA ACCESS" : "CAMERA NOT FOUND", "var(--coral)");
    $("welcome").classList.remove("hidden");
    $("welcome").querySelector("p").textContent =
      denied
        ? "Allow camera permission for this site in your browser settings, then try again."
        : missing
          ? "No usable camera was found. Connect or enable a camera, then try again."
          : "The camera could not start. Close other apps using it, then try again.";
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
