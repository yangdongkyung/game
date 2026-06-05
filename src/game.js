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
  playerModeButtons: [...document.querySelectorAll("[data-player-mode]")],
  difficultyButtons: [...document.querySelectorAll("[data-difficulty]")],
  dpadButtons: [...document.querySelectorAll("[data-dir]")]
};

const world = { width: 960, height: 620 };
const relay = { x: world.width / 2, y: world.height / 2, radius: 50 };

const difficultySettings = {
  chill: { time: 72, hazards: 4, cores: 6, speed: 0.86, multiplier: 0.9 },
  standard: { time: 60, hazards: 6, cores: 7, speed: 1, multiplier: 1 },
  chaos: { time: 52, hazards: 8, cores: 8, speed: 1.18, multiplier: 1.25 },
  hell: { time: 45, hazards: 11, cores: 8, speed: 1.36, multiplier: 1.55 }
};

const MAX_VISUAL_LEVEL = 15;
const shipPalette = [
  { body: "#f7f7f2", canopy: "#28c7b7", accent: "#f5b942", engine: "#f5b942" },
  { body: "#f5b942", canopy: "#111317", accent: "#28c7b7", engine: "#76d05c" },
  { body: "#76d05c", canopy: "#111317", accent: "#f7f7f2", engine: "#28c7b7" },
  { body: "#28c7b7", canopy: "#111317", accent: "#f5b942", engine: "#ff6b4a" },
  { body: "#ff6b4a", canopy: "#f7f7f2", accent: "#28c7b7", engine: "#f5b942" }
];

const boostStages = Array.from({ length: MAX_VISUAL_LEVEL }, (_, index) => {
  const level = index + 1;
  const colors = shipPalette[index % shipPalette.length];
  return {
    ...colors,
    speed: 1 + index * 0.055,
    length: 20 + index * 0.9,
    wing: 12 + index * 0.65,
    trail: Math.min(8, Math.floor(index / 2))
  };
});

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
let playerMode = "solo";
let lastTime = 0;
let submitLocked = false;

const player = {
  id: "p1",
  label: "P1",
  x: relay.x,
  y: relay.y + 118,
  vx: 0,
  vy: 0,
  radius: 15,
  angle: -Math.PI / 2,
  invulnerable: 0,
  accent: "#f5b942",
  secondary: "#28c7b7",
  active: true
};

const playerTwo = {
  id: "p2",
  label: "P2",
  x: relay.x,
  y: relay.y - 118,
  vx: 0,
  vy: 0,
  radius: 15,
  angle: Math.PI / 2,
  invulnerable: 0,
  accent: "#76d05c",
  secondary: "#ff6b4a",
  active: false
};

const game = {
  state: "idle",
  score: 0,
  time: difficultySettings.standard.time,
  charge: 0,
  boostLevel: 1,
  maxBoostLevel: 1,
  hazardSpeedScale: 1,
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

function visualLevel() {
  return clamp(game.boostLevel, 1, MAX_VISUAL_LEVEL);
}

function currentBoostStage() {
  return boostStages[visualLevel() - 1];
}

function activePlayers() {
  return playerMode === "duo" ? [player, playerTwo] : [player];
}

function hazardSpeedScaleForLevel(level) {
  return 1 + Math.max(0, level - MAX_VISUAL_LEVEL) * 0.075;
}

function targetHazardCount(level = game.boostLevel) {
  const baseHazards = difficultySettings[difficulty].hazards;
  const preOverdriveHazards = Math.floor(Math.min(level, MAX_VISUAL_LEVEL) / 2);
  const overdriveHazards = Math.max(0, level - MAX_VISUAL_LEVEL);
  return baseHazards + preOverdriveHazards + overdriveHazards;
}

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
  els.combo.textContent = `Lv ${game.boostLevel}`;
  els.submitScore.disabled = game.state !== "gameover" || submitLocked;
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
    const awayFromPlayers = activePlayers().every((pilot) => distance(core, pilot) > 130);
    if (awayFromRelay && awayFromPlayers) break;
  }
  return core;
}

function spawnHazard(index, settings) {
  const edge = index % 4;
  const speed = randomRange(78, 126) * settings.speed * game.hazardSpeedScale;
  const angle = randomRange(0, Math.PI * 2);
  const hazard = {
    x: edge === 0 ? 82 : edge === 1 ? world.width - 82 : randomRange(90, world.width - 90),
    y: edge === 2 ? 82 : edge === 3 ? world.height - 82 : randomRange(90, world.height - 90),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: randomRange(17, 24),
    spin: randomRange(0, Math.PI * 2)
  };

  if (activePlayers().some((pilot) => distance(hazard, pilot) < 180)) {
    hazard.x = world.width - hazard.x;
    hazard.y = world.height - hazard.y;
  }

  return hazard;
}

function addHazard(settings) {
  const hazard = spawnHazard(hazards.length, settings);
  hazards.push(hazard);
  burst(hazard.x, hazard.y, "#ff6b4a", 8);
}

function syncHazardsForLevel(previousLevel) {
  const settings = difficultySettings[difficulty];
  const previousScale = game.hazardSpeedScale;
  const nextScale = hazardSpeedScaleForLevel(game.boostLevel);

  game.hazardSpeedScale = nextScale;

  if (game.boostLevel > MAX_VISUAL_LEVEL && previousScale > 0) {
    const speedRatio = nextScale / previousScale;
    hazards.forEach((hazard) => {
      hazard.vx *= speedRatio;
      hazard.vy *= speedRatio;
    });
  }

  const target = targetHazardCount();
  while (hazards.length < target) {
    addHazard(settings);
  }

  if (target > targetHazardCount(previousLevel)) {
    burst(relay.x, relay.y, "#ff6b4a", 10);
  }
}

function resetGame() {
  const settings = difficultySettings[difficulty];
  game.state = "idle";
  game.score = 0;
  game.time = settings.time;
  game.charge = 0;
  game.boostLevel = 1;
  game.maxBoostLevel = 1;
  game.hazardSpeedScale = hazardSpeedScaleForLevel(1);
  game.delivered = 0;
  game.lastScore = 0;
  submitLocked = false;
  els.submitScore.textContent = "Submit score";

  player.x = relay.x;
  player.y = relay.y + 118;
  player.vx = 0;
  player.vy = 0;
  player.angle = -Math.PI / 2;
  player.invulnerable = 0;
  player.active = true;

  playerTwo.x = relay.x;
  playerTwo.y = relay.y - 118;
  playerTwo.vx = 0;
  playerTwo.vy = 0;
  playerTwo.angle = Math.PI / 2;
  playerTwo.invulnerable = 0;
  playerTwo.active = playerMode === "duo";

  cores = Array.from({ length: settings.cores }, spawnCore);
  hazards = Array.from({ length: targetHazardCount(1) }, (_, index) => spawnHazard(index, settings));
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

function gameOver(kicker = "Relay dark", title = "Run complete", burstColor = "#f5b942", source = player) {
  if (game.state === "gameover") return;
  game.state = "gameover";
  game.lastScore = Math.round(game.score);
  showOverlay(kicker, title, `Score: ${game.lastScore.toLocaleString()} / Boost Lv ${game.boostLevel}`, "Play again");
  burst(source.x, source.y, burstColor, 30);
  updateHud();
}

function collectCore(index, pilot) {
  const core = cores[index];
  game.charge = clamp(game.charge + 1, 0, 5);
  game.score += 12 * difficultySettings[difficulty].multiplier;
  burst(pilot.x, pilot.y, pilot.accent, 5);
  burst(core.x, core.y, core.hue, 14);
  cores[index] = spawnCore();
}

function deliverCharge(pilot) {
  if (game.charge === 0) return;
  const settings = difficultySettings[difficulty];
  const previousLevel = game.boostLevel;
  const gain = game.charge * (105 + visualLevel() * 26 + Math.max(0, game.boostLevel - MAX_VISUAL_LEVEL) * 12) * settings.multiplier;
  game.score += gain;
  game.delivered += game.charge;
  game.time += Math.min(4.5, game.charge * 1.1);
  game.charge = 0;
  game.boostLevel += 1;
  game.maxBoostLevel = Math.max(game.maxBoostLevel, game.boostLevel);
  syncHazardsForLevel(previousLevel);
  burst(pilot.x, pilot.y, pilot.secondary, 14);
  burst(relay.x, relay.y, currentBoostStage().engine, 28 + visualLevel() * 3);
}

function takeHit(hazard, pilot) {
  if (game.state !== "running") return;
  game.charge = 0;
  pilot.vx += (pilot.x - hazard.x) * 4;
  pilot.vy += (pilot.y - hazard.y) * 4;
  burst(hazard.x, hazard.y, "#ff6b4a", 18);
  gameOver("Impact", `${pilot.label} destroyed`, "#ff6b4a", pilot);
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

function getMovementVector(pilot) {
  const arrowsEnabled = playerMode === "solo" || pilot.id === "p2";
  const wasdEnabled = pilot.id === "p1";
  const touchEnabled = pilot.id === "p1";
  const left = (arrowsEnabled && keys.has("ArrowLeft")) || (wasdEnabled && keys.has("KeyA")) || (touchEnabled && touchDirs.has("left"));
  const right = (arrowsEnabled && keys.has("ArrowRight")) || (wasdEnabled && keys.has("KeyD")) || (touchEnabled && touchDirs.has("right"));
  const up = (arrowsEnabled && keys.has("ArrowUp")) || (wasdEnabled && keys.has("KeyW")) || (touchEnabled && touchDirs.has("up"));
  const down = (arrowsEnabled && keys.has("ArrowDown")) || (wasdEnabled && keys.has("KeyS")) || (touchEnabled && touchDirs.has("down"));
  let x = Number(right) - Number(left);
  let y = Number(down) - Number(up);
  const length = Math.hypot(x, y) || 1;
  x /= length;
  y /= length;
  return { x, y, active: left || right || up || down };
}

function updatePlayer(pilot, dt) {
  const move = getMovementVector(pilot);
  const boost = currentBoostStage();
  const targetSpeed = 292 * boost.speed;
  const acceleration = move.active ? 13 + visualLevel() * 0.65 : 7 + visualLevel() * 0.28;
  pilot.vx += (move.x * targetSpeed - pilot.vx) * Math.min(1, dt * acceleration);
  pilot.vy += (move.y * targetSpeed - pilot.vy) * Math.min(1, dt * acceleration);
  pilot.x = clamp(pilot.x + pilot.vx * dt, pilot.radius + 8, world.width - pilot.radius - 8);
  pilot.y = clamp(pilot.y + pilot.vy * dt, pilot.radius + 8, world.height - pilot.radius - 8);
  pilot.invulnerable = Math.max(0, pilot.invulnerable - dt);

  if (Math.hypot(pilot.vx, pilot.vy) > 8) {
    pilot.angle = Math.atan2(pilot.vy, pilot.vx);
  }

  cores.forEach((core, index) => {
    if (distance(pilot, core) < pilot.radius + core.radius) collectCore(index, pilot);
  });

  if (distance(pilot, relay) < pilot.radius + relay.radius) {
    deliverCharge(pilot);
  }
}

function update(dt) {
  const settings = difficultySettings[difficulty];
  game.time -= dt;
  if (game.time <= 0) {
    game.time = 0;
    gameOver();
    return;
  }

  cores.forEach((core) => {
    core.spin += dt * 2.8;
  });

  activePlayers().forEach((pilot) => updatePlayer(pilot, dt));

  hazards.forEach((hazard) => {
    hazard.x += hazard.vx * dt;
    hazard.y += hazard.vy * dt;
    hazard.spin += dt * 3;

    if (hazard.x < hazard.radius || hazard.x > world.width - hazard.radius) hazard.vx *= -1;
    if (hazard.y < hazard.radius || hazard.y > world.height - hazard.radius) hazard.vy *= -1;

    const dx = relay.x - hazard.x;
    const dy = relay.y - hazard.y;
    const pull = 10 * settings.speed * game.hazardSpeedScale;
    hazard.vx += (dx / Math.max(120, Math.hypot(dx, dy))) * pull * dt;
    hazard.vy += (dy / Math.max(120, Math.hypot(dx, dy))) * pull * dt;

    const maxHazardSpeed = (158 + Math.max(0, game.boostLevel - MAX_VISUAL_LEVEL) * 12) * settings.speed * game.hazardSpeedScale;
    const hazardSpeed = Math.hypot(hazard.vx, hazard.vy);
    if (hazardSpeed > maxHazardSpeed) {
      hazard.vx = (hazard.vx / hazardSpeed) * maxHazardSpeed;
      hazard.vy = (hazard.vy / hazardSpeed) * maxHazardSpeed;
    }

    activePlayers().forEach((pilot) => {
      if (distance(pilot, hazard) < pilot.radius + hazard.radius) takeHit(hazard, pilot);
    });
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

function drawPlayer(pilot) {
  const blink = pilot.invulnerable > 0 && Math.floor(performance.now() / 90) % 2 === 0;
  if (blink) return;

  const stage = currentBoostStage();
  const level = visualLevel();
  const stageIndex = level - 1;
  const overdrive = Math.max(0, game.boostLevel - MAX_VISUAL_LEVEL);
  const bodyColor = pilot.id === "p2" ? pilot.accent : stage.body;
  const canopyColor = pilot.id === "p2" ? pilot.secondary : stage.canopy;
  const accentColor = pilot.id === "p2" ? stage.body : stage.accent;
  const engineColor = pilot.id === "p2" ? pilot.secondary : stage.engine;

  ctx.save();
  ctx.translate(pilot.x, pilot.y);
  ctx.rotate(pilot.angle);
  ctx.shadowColor = engineColor;
  ctx.shadowBlur = 16 + level * 2.2 + Math.min(overdrive * 2, 18);

  if (stage.trail > 0) {
    ctx.globalAlpha = 0.18 + stage.trail * 0.08;
    ctx.fillStyle = engineColor;
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

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(stage.length, 0);
  ctx.lineTo(-stage.length * 0.62, -stage.wing);
  ctx.lineTo(-stage.length * 0.28, 0);
  ctx.lineTo(-stage.length * 0.62, stage.wing);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = canopyColor;
  ctx.beginPath();
  ctx.ellipse(2, 0, 7 + stageIndex, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-stage.length * 0.28, -stage.wing * 0.52);
  ctx.lineTo(stage.length * 0.46, 0);
  ctx.lineTo(-stage.length * 0.28, stage.wing * 0.52);
  ctx.stroke();

  if (game.boostLevel >= 3) {
    ctx.fillStyle = accentColor;
    ctx.fillRect(-stage.length * 0.72, -stage.wing - 3, 10 + stageIndex * 2, 4);
    ctx.fillRect(-stage.length * 0.72, stage.wing - 1, 10 + stageIndex * 2, 4);
  }

  if (game.boostLevel >= MAX_VISUAL_LEVEL) {
    ctx.strokeStyle = "#f7f7f2";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, stage.length * 0.92 + Math.min(overdrive, 12), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = pilot.accent;
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
  activePlayers().forEach(drawPlayer);
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
  if (game.state !== "gameover" || submitLocked) return;

  submitLocked = true;
  updateHud();
  els.submitScore.textContent = "Saving...";

  try {
    await leaderboard.submit({
      name: els.pilotName.value,
      score: game.lastScore,
      difficulty,
      playerMode,
      maxBoostLevel: game.maxBoostLevel,
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

function selectPlayerMode(nextMode) {
  playerMode = nextMode;
  els.playerModeButtons.forEach((button) => {
    const selected = button.dataset.playerMode === playerMode;
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

  els.playerModeButtons.forEach((button) => {
    button.addEventListener("click", () => selectPlayerMode(button.dataset.playerMode));
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
