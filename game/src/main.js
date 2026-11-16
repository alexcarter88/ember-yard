// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// Rounds run buy -> live -> planted -> over; the player attacks with the ember, two ally
// bots run the lanes, three enemy bots hold the sites. The simulation only advances while
// the pointer is locked; a round ending exits the lock and shows its overlay, and the next
// click starts the next round's buy phase. ?shot=start|play|buy|end with &seed=N sets up
// a deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, ATTACK_SPAWN, DEFEND_SPAWNS, ALLY_SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, PLANT_TIME } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world.colliders, world.shootables);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const rounds = createRounds();
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const direction = new THREE.Vector3();
// shootables is rebuilt every round: spawnRound clears and refills bots.hitMeshes, and a
// concat made once would keep the empty first copy.
let shootables = world.shootables.concat(bots.hitMeshes);
function refreshShootables() {
  shootables = world.shootables.concat(bots.hitMeshes);
}

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
let score = 0;
let elapsed = 0;
let frozen = false;
let running = false;
let suppressPause = false;
let accumulator = 0;
let lastTime = performance.now();
let planting = false;
let plantHeld = 0;

hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setScore(0);
hud.setHealth(body.health, body.armor);
hud.setMoney(rounds.state.money);
hud.setRounds(0, 0);
hud.setTeams(3, 3);
hud.setBomb('Ember on you — plant at A or B');
hud.onPlay(() => {
  if (shot) return;
  if (rounds.state.matchOver) restartMatch();
  input.requestLock();
});
hud.onBuy((id) => buy(id));

bots.onKill((victim, source) => {
  const name = victim.team === 'enemy' ? 'Enemy' : 'Ally';
  if (source === 'player') {
    score += 100;
    rounds.state.money += 300;
    hud.setScore(score);
    hud.setMoney(rounds.state.money);
    hud.killFeed(`You ▸ ${name}`);
  } else if (source === 'grenade') {
    score += 100;
    hud.setScore(score);
    hud.killFeed(`Grenade ▸ ${name}`);
  } else if (source && source.team === 'ally') {
    hud.killFeed(`Ally ▸ ${name}`);
  } else {
    hud.killFeed(`${name} down`);
  }
  hud.setTeams(bots.alive('ally') + (body.alive ? 1 : 0), bots.alive('enemy'));
});

player.onHurt(() => {
  hud.damageFlash();
  hud.setHealth(body.health, body.armor);
  if (!body.alive) {
    rounds.endRound(false, 'You were eliminated.');
  }
});

function buy(id) {
  if (rounds.state.phase !== 'buy') return;
  if (id === 'rifle' || id === 'smg') {
    const spec = WEAPONS[id];
    if (rounds.state.money < spec.price || weapon.state.id === id) return;
    rounds.state.money -= spec.price;
    weapon.equip(id);
  } else if (id === 'grenade') {
    if (rounds.state.money < GRENADE.price || weapon.state.grenades >= 2) return;
    rounds.state.money -= GRENADE.price;
    weapon.state.grenades += 1;
  } else if (id === 'armor') {
    if (rounds.state.money < 650 || body.armor >= 100) return;
    rounds.state.money -= 650;
    body.armor = 100;
  }
  hud.setMoney(rounds.state.money);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(body.health, body.armor);
}

function nextRound() {
  bots.spawnRound(ALLY_SPAWNS, DEFEND_SPAWNS);
  bots.resetDefuse();
  refreshShootables();
  player.respawn(ATTACK_SPAWN, Math.PI);
  weapon.equip('pistol');
  weapon.refill();
  planting = false;
  plantHeld = 0;
  rounds.startRound();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(rounds.state.money);
  hud.setRounds(rounds.state.wins, rounds.state.losses);
  hud.setTeams(3, 3);
  hud.setBomb('Ember on you — plant at A or B');
  hud.hidePlant();
}

function restartMatch() {
  score = 0;
  rounds.state.wins = 0;
  rounds.state.losses = 0;
  rounds.state.round = 1;
  rounds.state.money = 800;
  rounds.state.matchOver = false;
  rounds.state.matchWon = false;
  rounds.state.roundEnded = false;
  hud.setScore(0);
  nextRound();
  hud.showOverlay('start', 'Round 1. Press B to buy, then take the ember to A or B.');
}

function showRoundEnd() {
  const won = rounds.state.lastWon;
  if (rounds.state.matchOver) {
    hud.showOverlay(rounds.state.matchWon ? 'matchWon' : 'matchLost',
      `${rounds.state.lastResult} Match ${rounds.state.wins} — ${rounds.state.losses}.`);
  } else {
    hud.showOverlay(won ? 'roundWon' : 'roundLost', rounds.state.lastResult);
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    running = true;
    hud.hideOverlay();
    if (rounds.state.phase === 'buy') hud.openBuy(rounds.state.money);
  } else {
    running = false;
    if (suppressPause) {
      suppressPause = false;
      return;
    }
    if (!rounds.state.matchOver) {
      hud.closeBuy();
      hud.showOverlay('paused', 'Paused. Click to resume.');
    }
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const spec = weapon.current();
    const killed = bots.damage(bot, hit.object.userData.part === 'head' ? spec.headDamage : spec.damage, 'player');
    score += killed ? 0 : 10;
    hud.setScore(score);
    hud.hitMarker(killed, markerHoldMs);
  }
  bots.hear(body.position);
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function nearestSite() {
  for (const key of Object.keys(SITES)) {
    const site = SITES[key];
    const dx = body.position.x - site.position.x;
    const dz = body.position.z - site.position.z;
    if (Math.hypot(dx, dz) < 2.6) return key;
  }
  return null;
}

function step(dt) {
  elapsed += dt;
  rounds.step(dt);
  if (rounds.state.roundEnded) {
    rounds.state.roundEnded = false;
    suppressPause = true;
    if (document.pointerLockElement) document.exitPointerLock();
    showRoundEnd();
    return;
  }
  if (rounds.state.phase === 'buy' && rounds.state.timeLeft <= 0) {
    hud.closeBuy();
  }
  player.step(dt, input.state.keys);
  weapon.step(dt);
  bots.step(dt, elapsed, player, rounds.state.plantedSite);

  // Grenade bursts: area damage with falloff, to bots and to the player.
  const burst = weapon.takeBurst();
  if (burst) {
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const distance = bot.position.distanceTo(burst);
      if (distance < GRENADE.radius) {
        bots.damage(bot, Math.round(GRENADE.damage * (1 - distance / GRENADE.radius)), 'grenade');
      }
    }
    const playerDistance = body.position.distanceTo(burst);
    if (playerDistance < GRENADE.radius && body.alive) {
      player.hurt(Math.round(GRENADE.damage * 0.5 * (1 - playerDistance / GRENADE.radius)), null);
    }
  }

  // Planting: hold E on a site pad for 3 s. Moving off the pad resets it.
  if (rounds.state.phase === 'live' && body.alive) {
    const site = nearestSite();
    if (site && input.state.keys.has('KeyE')) {
      planting = true;
      plantHeld += dt;
      hud.showPlant(`Planting the ember at ${site}…`, plantHeld / PLANT_TIME);
      if (plantHeld >= PLANT_TIME) {
        planting = false;
        plantHeld = 0;
        hud.hidePlant();
        rounds.plant(site);
        score += 150;
        hud.setScore(score);
        hud.setBomb(`Ember live at ${site} — ${Math.ceil(rounds.state.timeLeft)}s to detonation`);
        hud.killFeed(`Ember planted at ${site}`);
      }
    } else {
      if (planting) hud.hidePlant();
      planting = false;
      plantHeld = 0;
    }
  }

  // A defuse completes: the round is lost.
  if (rounds.state.plantedSite && bots.defused()) {
    bots.resetDefuse();
    rounds.endRound(false, 'The defenders defused the ember.');
    return;
  }
  // All enemies down: the round is won.
  if (rounds.state.phase === 'live' && bots.alive('enemy') === 0) {
    rounds.endRound(true, 'Yard cleared — every defender is down.');
    score += 500;
    hud.setScore(score);
    return;
  }

  hud.setTimer(rounds.state.timeLeft, rounds.state.phase);
  if (rounds.state.plantedSite) {
    hud.setBomb(`Ember live at ${rounds.state.plantedSite} — ${Math.ceil(rounds.state.timeLeft)}s`);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && running) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const clicked = input.takeClick();
    const spec = weapon.current();
    const wantFire = spec.auto ? input.state.firing : clicked;
    if (wantFire && weapon.ready() && body.alive && rounds.state.phase !== 'buy') {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    }
    if (input.state.keys.has('KeyR')) weapon.reload();
    if (input.state.keys.has('KeyG') && weapon.state.grenades > 0) {
      camera.getWorldDirection(direction);
      weapon.throwGrenade(camera.position, direction);
    }
    if (input.state.keys.has('KeyB') && rounds.state.phase === 'buy') {
      if (!hud.isBuyOpen()) hud.openBuy(rounds.state.money);
    } else if (input.state.keys.has('Escape')) {
      hud.closeBuy();
    }
    if (input.state.keys.has('Digit1') && rounds.state.phase === 'buy') buy('rifle');
    if (input.state.keys.has('Digit2') && rounds.state.phase === 'buy') buy('smg');
    if (input.state.keys.has('Digit3') && rounds.state.phase === 'buy') buy('grenade');
    if (input.state.keys.has('Digit4') && rounds.state.phase === 'buy') buy('armor');
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setSpread(4 + weapon.spread(player.groundSpeed()) * 900);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.closeBuy();
  body.pitch = 0;
  body.yaw = Math.PI;
  if (name === 'start') {
    nextRound();
    body.position.set(0, 0, 16);
    body.yaw = Math.PI;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -10));
    hud.showOverlay('start', 'Round 1. Press B to buy, then take the ember to A or B.');
  } else if (name === 'play') {
    nextRound();
    rounds.startLive();
    body.position.set(0, 0, 8);
    settle(30);
    const enemy = bots.bots.find((bot) => bot.team === 'enemy');
    if (enemy) {
      enemy.position.set(-2.5, 0, -5);
      enemy.group.position.copy(enemy.position);
      aimAt(new THREE.Vector3(enemy.position.x, 1.0, enemy.position.z));
      shoot(0);
      settle(6);
      shoot(0);
      settle(6);
    }
    hud.setHealth(body.health, body.armor);
  } else if (name === 'buy') {
    nextRound();
    rounds.state.money = 2700;
    hud.setMoney(2700);
    body.position.set(0, 0, 16);
    body.yaw = Math.PI;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -10));
    hud.openBuy(2700);
  } else {
    nextRound();
    rounds.startLive();
    body.position.set(0, 0, 8);
    settle(20);
    for (const bot of bots.bots) {
      if (bot.team === 'enemy') bots.damage(bot, 200, 'player');
    }
    rounds.endRound(true, 'Yard cleared — every defender is down.');
    rounds.state.roundEnded = false;
    hud.showOverlay('roundWon', rounds.state.lastResult);
  }
  hud.setScore(score);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

bots.spawnRound(ALLY_SPAWNS, DEFEND_SPAWNS);
refreshShootables();
syncCamera();
if (shot) runShot(shot);
else {
  nextRound();
  hud.showOverlay('start', 'Round 1. Press B to buy, then take the ember to A or B.');
  requestAnimationFrame(frame);
}
