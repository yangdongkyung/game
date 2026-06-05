import { Leaderboard } from "./leaderboard.js";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const els = {
  score: document.querySelector("#score"),
  time: document.querySelector("#time"),
  charge: document.querySelector("#charge"),
  combo: document.querySelector("#combo"),
  overlay: document.querySelector("#overlay"),
  overlayKicker: document.querySelector("#overlayKicker"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlayMeta: document.querySelector("#overlayMeta"),
  overlayStart: document.querySelector("#overlayStart"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  resetButton: document.querySelector("#resetButton"),
  submitScore: document.querySelector("#submitScore"),
  pilotName: document.querySelector("#pilotName"),
  leaderboardList: document.querySelector("#leaderboardList"),
  leaderboardStatus: document.querySelector("#leaderboardStatus"),
  difficultyButtons: [...document.querySelectorAll("[data-difficulty]")],
  dpadButtons: [...document.querySelectorAll("[data-dir]")]
};

const world = { width: 960, height: 620 };
const relay = { x: world.width / 2, y: world.height / 2, radius: 50 };

const difficultySettings = {
  chill: { time: 72, hazards: 7, cores: 6, speed: 0.86, multiplier: 0.9 },
  standard: { time: 60, hazards: 9, cores: 7, speed: 1, multiplier: 1 },
  chaos: { time: 52, hazards: 11, cores: 8, speed: 1.18, multiplier: 1.25 }
};

const boostStages = [
  { speed: 1, body: "#f7f7f2", canopy: "#28c7b7", accent: "#f5b942", engine: "#f5b942", length: 20, wing: 12, trail: 0 },
  { speed: 1.14, body: "#f5b942", canopy: "#111317", accent: "#28c7b7", engine: "#76d05c", length: 22, wing: 14, trail: 1 },
  { speed: 1.3, body: "#76d05c", canopy: "#111317", accent: "#f7f7f2", engine: "#28c7b7", length: 24, wing: 16, trail: 2 },
  { speed: 1.48, body: "#28c7b7", canopy: "#111317", accent: "#f5b942", engine: "#ff6b4a", length: 26, wing: 18, trail: 3 },
  { speed: 1.7, body: "#ff6b4a", canopy: "#f7f7f2", accent: "#28c7b7", engine: "#f5b942", length: 29, wing: 20, trail: 4 }
];

const keys = new Set();
const touchDirs = new Set();
const particles = [];
const sparks = Array.from({ length: 90 }, () => ({
  x: Math.random() * world.width,
  y: Math.random() * world.height,
  size: Math.random() * 1.8 + 0.4,
  drift: Math.random() * 18 + 8,
  alpha: Math.random() * 0.5 + 0.2
}));

let cores = [];
let hazards = [];
let animationId = 0;
let difficulty = "standard";
let lastTime = 0;
let submitLocked = false;

const player = {
  x: relay.x,
  y: relay.y + 118,
  vx: 0,
  vy: 0,
  radius: 15,
  angle: -Math.PI / 2,
  invulnerable: 0
};

const game = {
  state: "idle",
  score: 0,
  time: difficultySettings.standard.time,
  charge: 0,
  boostStage: 1,
  maxBoostStage: 1,
  delivered: 0,
  lastScore: 0
};

const leaderboard = new Leaderboard({
  listEl: els.leaderboardList,
  statusEl: els.leaderboardStatus
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const randomRange = (min, max) => Math.random() * (max - min) + min;

function showOverlay(kicker, title, meta, buttonText = "Start") {
  els.overlayKicker.textContent = kicker;
  els.overlayTitle.textContent = title;
  els.overlayMeta.textContent = meta;
  els.overlayStart.textContent = buttonText;
  els.overlay.classList.add("is-active");
}

function hideOverlay() {
  els.overlay.classList.remove("is-active");
}

function updateHud() {
  els.score.textContent = Math.round(game.score).toLocaleString();
  els.time.textContent = Math.max(0, game.time).toFixed(1);
  els.charge.textContent = String(game.charge);
  els.combo.textContent = `Lv ${game.boostStage}/5`;
  els.submitScore.disabled = game.lastScore <= 0 || game.state !== "gameover" || submitLocked;
  els.pauseButton.disabled = game.state !== "running" && game.state !== "paused";
}

function spawnCore() {
  let core = null;
  for (let tries = 0; tries < 80; tries += 1) {
    core = {
      x: randomRange(74, world.width - 74),
      y: randomRange(74, world.height - 74),
      radius: randomRange(10, 15),
      spin: randomRange(0, Math.PI * 2),
      hue: Math.random() > 0.5 ? "#f5b942" : "#76d05c"
    };
    const awayFromRelay = distance(core, relay) > 150;
    const awayFromPlayer = distance(core, player) > 130;
    if (awayFromRelay && awayFromPlayer) break;
  }
  return core;
}

function spawnHazard(index, settings) {
  const edge = index % 4;
  const speed = randomRange(78, 126) * settings.speed;
  const angle = randomRange(0, Math.PI * 2);
  const hazard = {
    x: edge === 0 ? 82 : edge === 1 ? world.width - 82 : randomRange(90, world.width - 90),
    y: edge === 2 ? 82 : edge === 3 ? world.height - 82 : randomRange(90, world.height - 90),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: randomRange(17, 24),
    spin: randomRange(0, Math.PI * 2)
  };

  if (distance(hazard, player) < 180) {
    hazard.x = world.width - hazard.x;
    hazard.y = world.height - hazard.y;
  }

  return hazard;
}

function resetGame() {
  const settings = difficultySettings[difficulty];
  game.state = "idle";
  game.score = 0;
  game.time = settings.time;
  game.charge = 0;
  game.boostStage = 1;
  game.maxBoostStage = 1;
  game.delivered = 0;
  game.lastScore = 0;
  submitLocked = false;

  player.x = relay.x;
  player.y = relay.y + 118;
  player.vx = 0;
  player.vy = 0;
  player.angle = -Math.PI / 2;
  player.invulnerable = 0;

  cores = Array.from({ length: settings.cores }, spawnCore);
  hazards = Array.from({ length: settings.hazards }, (_, index) => spawnHazard(index, settings));
  particles.length = 0;

  updateHud();
  showOverlay("Relay idle", "Ready", `Best local run: ${leaderboard.bestScore().toLocaleString()}`);
  draw(0);
}

function startGame() {
  if (game.state === "running") return;
  if (game.state === "gameover" || game.state === "idle") {
    resetGame();
  }
  game.state = "running";
  hideOverlay();
  lastTime = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
  updateHud();
}

function pauseGame() {
  if (game.state === "running") {
    game.state = "paused";
    showOverlay("Relay paused", "Paused", `Score: ${Math.round(game.score).toLocaleString()}`, "Resume");
    updateHud();
    return;
  }

  if (game.state === "paused") {
    game.state = "running";
    hideOverlay();
    lastTime = performance.now();
    animationId = requestAnimationFrame(loop);
    updateHud();
  }
}

function gameOver(kicker = "Relay dark", title = "Run complete", burstColor = "#f5b942") {
  if (game.state === "gameover") return;
  game.state = "gameover";
  game.lastScore = Math.round(game.score);
  showOverlay(kicker, title, `Score: ${game.lastScore.toLocaleString()} / Boost Lv ${game.boostStage}`, "Play again");
  burst(player.x, player.y, burstColor, 30);
  updateHud();
}

function collectCore(index) {
  const core = cores[index];
  game.charge = clamp(game.charge + 1, 0, 5);
  game.score += 12 * difficultySettings[difficulty].multiplier;
  burst(core.x, core.y, core.hue, 14);
  cores[index] = spawnCore();
}

function deliverCharge() {
  if (game.charge === 0) return;
  const settings = difficultySettings[difficulty];
  const gain = game.charge * (105 + game.boostStage * 35) * settings.multiplier;
  game.score += gain;
  game.delivered += game.charge;
  game.time += Math.min(4.5, game.charge * 1.1);
  game.charge = 0;
  game.boostStage = clamp(game.boostStage + 1, 1, 5);
  game.maxBoostStage = Math.max(game.maxBoostStage, game.boostStage);
  burst(relay.x, relay.y, boostStages[game.boostStage - 1].engine, 28 + game.boostStage * 5);
}

function takeHit(hazard) {
  if (game.state !== "running") return;
  game.charge = 0;
  player.vx += (player.x - hazard.x) * 4;
  player.vy += (player.y - hazard.y) * 4;
  burst(hazard.x, hazard.y, "#ff6b4a", 18);
  gameOver("Impact", "Ship destroyed", "#ff6b4a");
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = randomRange(0, Math.PI * 2);
    const speed = randomRange(60, 260);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomRange(1.5, 4),
      life: randomRange(0.35, 0.9),
      maxLife: 0.9,
      color
    });
  }
}

function getMovementVector() {
  const left = keys.has("ArrowLeft") || keys.has("KeyA") || touchDirs.has("left");
  const right = keys.has("ArrowRight") || keys.has("KeyD") || touchDirs.has("right");
  const up = keys.has("ArrowUp") || keys.has("KeyW") || touchDirs.has("up");
  const down = keys.has("ArrowDown") || keys.has("KeyS") || touchDirs.has("down");
  let x = Number(right) - Number(left);
  let y = Number(down) - Number(up);
  const length = Math.hypot(x, y) || 1;
  x /= length;
  y /= length;
  return { x, y, active: left || right || up || down };
}

function update(dt) {
  const settings = difficultySettings[difficulty];
  game.time -= dt;
  if (game.time <= 0) {
    game.time = 0;
    gameOver();
    return;
  }

  const move = getMovementVector();
  const boost = boostStages[game.boostStage - 1];
  const targetSpeed = 292 * boost.speed;
  const acceleration = move.active ? 13 + game.boostStage * 1.6 : 7 + game.boostStage * 0.6;
  player.vx += (move.x * targetSpeed - player.vx) * Math.min(1, dt * acceleration);
  player.vy += (move.y * targetSpeed - player.vy) * Math.min(1, dt * acceleration);
  player.x = clamp(player.x + player.vx * dt, player.radius + 8, world.width - player.radius - 8);
  player.y = clamp(player.y + player.vy * dt, player.radius + 8, world.height - player.radius - 8);
  player.invulnerable = Math.max(0, player.invulnerable - dt);

  if (Math.hypot(player.vx, player.vy) > 8) {
    player.angle = Math.atan2(player.vy, player.vx);
  }

  cores.forEach((core, index) => {
    core.spin += dt * 2.8;
    if (distance(player, core) < player.radius + core.radius) collectCore(index);
  });

  if (distance(player, relay) < player.radius + relay.radius) {
    deliverCharge();
  }

  hazards.forEach((hazard) => {
    hazard.x += hazard.vx * dt;
    hazard.y += hazard.vy * dt;
    hazard.spin += dt * 3;

    if (hazard.x < hazard.radius || hazard.x > world.width - hazard.radius) hazard.vx *= -1;
    if (hazard.y < hazard.radius || hazard.y > world.height - hazard.radius) hazard.vy *= -1;

    const dx = relay.x - hazard.x;
    const dy = relay.y - hazard.y;
    const pull = 10 * settings.speed;
    hazard.vx += (dx / Math.max(120, Math.hypot(dx, dy))) * pull * dt;
    hazard.vy += (dy / Math.max(120, Math.hypot(dx, dy))) * pull * dt;

    if (distance(player, hazard) < player.radius + hazard.radius) takeHit(hazard);
  });

  particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 1 - dt * 2.2;
    particle.vy *= 1 - dt * 2.2;
    particle.life -= dt;
  });

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  sparks.forEach((spark) => {
    spark.y += spark.drift * dt;
    spark.x += Math.sin((spark.y + performance.now() * 0.02) * 0.015) * dt * 9;
    if (spark.y > world.height + 10) {
      spark.y = -10;
      spark.x = Math.random() * world.width;
    }
  });

  updateHud();
}

function drawGrid(time) {
  const pulse = Math.sin(time * 0.0015) * 0.5 + 0.5;
  const gradient = ctx.createLinearGradient(0, 0, world.width, world.height);
  gradient.addColorStop(0, "#111317");
  gradient.addColorStop(0.55, "#18201d");
  gradient.addColorStop(1, "#201713");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#f7f7f2";
  ctx.lineWidth = 1;
  for (let x = 0; x <= world.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x + pulse * 4, 0);
    ctx.lineTo(x - pulse * 4, world.height);
    ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y - pulse * 4);
    ctx.lineTo(world.width, y + pulse * 4);
    ctx.stroke();
  }
  ctx.restore();

  sparks.forEach((spark) => {
    ctx.globalAlpha = spark.alpha;
    ctx.fillStyle = "#f7f7f2";
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawRelay(time) {
  const pulse = Math.sin(time * 0.006) * 5;
  ctx.save();
  ctx.translate(relay.x, relay.y);
  ctx.shadowColor = "#28c7b7";
  ctx.shadowBlur = 22;
  ctx.strokeStyle = "#28c7b7";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, relay.radius + pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f7f7f2";
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff6b4a";
  ctx.beginPath();
  ctx.arc(0, 0, 11 + Math.max(0, game.charge), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCore(core) {
  ctx.save();
  ctx.translate(core.x, core.y);
  ctx.rotate(core.spin);
  ctx.shadowColor = core.hue;
  ctx.shadowBlur = 16;
  ctx.fillStyle = core.hue;
  ctx.beginPath();
  ctx.moveTo(0, -core.radius * 1.3);
  ctx.lineTo(core.radius, 0);
  ctx.lineTo(0, core.radius * 1.3);
  ctx.lineTo(-core.radius, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#111317";
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
}

function drawHazard(hazard) {
  ctx.save();
  ctx.translate(hazard.x, hazard.y);
  ctx.rotate(hazard.spin);
  ctx.shadowColor = "#ff6b4a";
  ctx.shadowBlur = 15;
  ctx.fillStyle = "#ff6b4a";
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const radius = i % 2 === 0 ? hazard.radius * 1.25 : hazard.radius * 0.72;
    const angle = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#111317";
  ctx.beginPath();
  ctx.arc(0, 0, hazard.radius * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const blink = player.invulnerable > 0 && Math.floor(performance.now() / 90) % 2 === 0;
  if (blink) return;

  const stage = boostStages[game.boostStage - 1];
  const stageIndex = game.boostStage - 1;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.shadowColor = stage.engine;
  ctx.shadowBlur = 16 + game.boostStage * 4;

  if (stage.trail > 0) {
    ctx.globalAlpha = 0.18 + stage.trail * 0.08;
    ctx.fillStyle = stage.engine;
    for (let i = 0; i < stage.trail; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-stage.length - i * 7, 0);
      ctx.lineTo(-stage.length - 14 - i * 8, -5 - i);
      ctx.lineTo(-stage.length - 14 - i * 8, 5 + i);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = stage.body;
  ctx.beginPath();
  ctx.moveTo(stage.length, 0);
  ctx.lineTo(-stage.length * 0.62, -stage.wing);
  ctx.lineTo(-stage.length * 0.28, 0);
  ctx.lineTo(-stage.length * 0.62, stage.wing);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = stage.canopy;
  ctx.beginPath();
  ctx.ellipse(2, 0, 7 + stageIndex, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = stage.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-stage.length * 0.28, -stage.wing * 0.52);
  ctx.lineTo(stage.length * 0.46, 0);
  ctx.lineTo(-stage.length * 0.28, stage.wing * 0.52);
  ctx.stroke();

  if (game.boostStage >= 3) {
    ctx.fillStyle = stage.accent;
    ctx.fillRect(-stage.length * 0.72, -stage.wing - 3, 10 + stageIndex * 2, 4);
    ctx.fillRect(-stage.length * 0.72, stage.wing - 1, 10 + stageIndex * 2, 4);
  }

  if (game.boostStage === 5) {
    ctx.strokeStyle = "#f7f7f2";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, stage.length * 0.92, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#f5b942";
  for (let i = 0; i < game.charge; i += 1) {
    ctx.beginPath();
    ctx.arc(-stage.length - 5 - i * 6, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function draw(time) {
  drawGrid(time);
  drawRelay(time);
  cores.forEach(drawCore);
  hazards.forEach(drawHazard);
  drawParticles();
  drawPlayer();
}

function loop(time) {
  if (game.state !== "running") return;
  const dt = clamp((time - lastTime) / 1000, 0, 0.033);
  lastTime = time;
  update(dt);
  draw(time);
  if (game.state === "running") animationId = requestAnimationFrame(loop);
}

async function submitScore() {
  if (game.lastScore <= 0 || submitLocked) return;

  submitLocked = true;
  updateHud();
  els.submitScore.textContent = "Saving...";

  try {
    await leaderboard.submit({
      name: els.pilotName.value,
      score: game.lastScore,
      difficulty,
      maxBoostStage: game.maxBoostStage,
      delivered: game.delivered
    });
    els.submitScore.textContent = "Saved";
  } catch (error) {
    console.error("Unable to submit score.", error);
    els.submitScore.textContent = "Try again";
    submitLocked = false;
  }

  updateHud();
}

function selectDifficulty(nextDifficulty) {
  difficulty = nextDifficulty;
  els.difficultyButtons.forEach((button) => {
    const selected = button.dataset.difficulty === difficulty;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  resetGame();
}

function bindEvents() {
  els.startButton.addEventListener("click", startGame);
  els.overlayStart.addEventListener("click", () => {
    if (game.state === "paused") pauseGame();
    else startGame();
  });
  els.pauseButton.addEventListener("click", pauseGame);
  els.resetButton.addEventListener("click", resetGame);
  els.submitScore.addEventListener("click", submitScore);

  els.difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty));
  });

  window.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"].includes(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (game.state === "running" || game.state === "paused") pauseGame();
      else startGame();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  els.dpadButtons.forEach((button) => {
    const dir = button.dataset.dir;
    const activate = (event) => {
      event.preventDefault();
      touchDirs.add(dir);
    };
    const release = (event) => {
      event.preventDefault();
      touchDirs.delete(dir);
    };
    button.addEventListener("pointerdown", activate);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  });
}

async function boot() {
  bindEvents();
  await leaderboard.init();
  resetGame();
}

boot();
