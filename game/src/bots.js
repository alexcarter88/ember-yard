// The bots: two allies who run lanes with you, three enemies who hold the sites.
// Each bot is a small state machine — patrol, combat, investigate, plant, defuse — with
// real line of sight (a ray against the world's walls), a reaction time before its first
// shot, and bursts whose accuracy falls with distance and a moving target. Gunfire is
// loud: a shot within 25 m gives every bot a last-known position to investigate.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './world.js';

const HEALTH = 100;
const WALK_SPEED = 4.2;
const COMBAT_SPEED = 2.6;
const SIGHT_RANGE = 32;
const SIGHT_HALF_ANGLE = 0.95;
const REACTION_MIN = 0.45;
const REACTION_MAX = 0.85;
const BURST_GAP = 0.14;
const BURST_LEN = 3;
const BURST_REST = 0.9;
const HEAR_RANGE = 25;

const ROUTES = {
  A: [[-10, 8], [-14, 0], [-13, -8], [-13, -13]],
  B: [[10, 8], [14, 0], [13, -8], [13, -13]],
  mid: [[0, 8], [0, 0], [0, -6], [0, -11]],
};
const DEFEND_POSTS = {
  A: [[-13, -10], [-10, -13], [-15, -13]],
  B: [[13, -10], [10, -13], [15, -13]],
  mid: [[0, -12], [-3, -9], [3, -9]],
};

export function createBots(scene, colliders, shootables) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE;
  const tmpDirection = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  const allyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6, metalness: 0.05 });
  const enemyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.1 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.5, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.5);

  const bots = [];
  const hitMeshes = [];
  let now = 0;
  let noise = null;
  let onKillHandler = null;

  function makeBot(team, spawn, route) {
    const group = new THREE.Group();
    group.position.copy(spawn);
    const material = team === 'ally' ? allyMaterial : enemyMaterial;
    const torso = new THREE.Mesh(torsoGeometry, material);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const legL = new THREE.Mesh(legGeometry, darkMaterial);
    legL.position.set(-0.14, 0.25, 0);
    const legR = new THREE.Mesh(legGeometry, darkMaterial);
    legR.position.set(0.14, 0.25, 0);
    const gun = new THREE.Mesh(gunGeometry, darkMaterial);
    gun.position.set(0.2, 1.05, -0.3);
    group.add(torso, head, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      group, torso, head, team, route,
      position: group.position,
      health: HEALTH, alive: true,
      yaw: team === 'ally' ? Math.PI : 0,
      waypoint: 0, state: team === 'ally' ? 'patrol' : 'hold',
      target: null, seenAt: 0, reactionAt: 0,
      burstLeft: 0, burstAt: 0, restUntil: 0,
      investigateAt: null, investigateUntil: 0,
      plantAt: 0, defuseAt: 0, fall: 0,
      speed: WALK_SPEED,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnRound(allySpawns, enemySpawns) {
    for (const bot of bots) scene.remove(bot.group);
    bots.length = 0;
    hitMeshes.length = 0;
    makeBot('ally', allySpawns[0], ROUTES.A);
    makeBot('ally', allySpawns[1], ROUTES.B);
    makeBot('enemy', enemySpawns[0], ROUTES.A);
    makeBot('enemy', enemySpawns[1], ROUTES.B);
    makeBot('enemy', enemySpawns[2], ROUTES.mid);
    // Defenders hold their posts; the first waypoint of each route is their post.
    for (const bot of bots) {
      if (bot.team === 'enemy') {
        bot.state = 'hold';
        bot.post = DEFEND_POSTS[bot.route === ROUTES.A ? 'A' : bot.route === ROUTES.B ? 'B' : 'mid'];
        bot.postIndex = 0;
      }
    }
    noise = null;
  }

  function hear(position) {
    noise = { position: position.clone(), until: now + 4 };
  }

  function canSee(bot, point) {
    tmpDirection.copy(point).sub(bot.position).setY(point.y - 1.4);
    const distance = tmpDirection.length();
    if (distance > SIGHT_RANGE) return false;
    tmpDirection.normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (facing.dot(tmpDirection) < Math.cos(SIGHT_HALF_ANGLE)) return false;
    raycaster.set(new THREE.Vector3(bot.position.x, 1.4, bot.position.z), tmpDirection);
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit || hit.distance >= distance - 0.4;
  }

  function moveToward(bot, point, dt, speed) {
    tmpTarget.set(point.x - bot.position.x, 0, point.z - bot.position.z);
    const distance = tmpTarget.length();
    if (distance < 0.3) return true;
    tmpTarget.normalize();
    const step = Math.min(distance, speed * dt);
    const nextX = bot.position.x + tmpTarget.x * step;
    const nextZ = bot.position.z + tmpTarget.z * step;
    if (!overlaps(nextX, bot.position.z)) bot.position.x = nextX;
    if (!overlaps(bot.position.x, nextZ)) bot.position.z = nextZ;
    bot.yaw = Math.atan2(-tmpTarget.x, -tmpTarget.z);
    return distance < 0.6;
  }

  const probe = new THREE.Box3();
  function overlaps(x, z) {
    probe.min.set(x - 0.34, 0.04, z - 0.34);
    probe.max.set(x + 0.34, 1.68, z + 0.34);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function damage(bot, amount, source) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    if (onKillHandler) onKillHandler(bot, source);
    return true;
  }

  function step(dt, time, player, plantedSite) {
    now = time;
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      bot.group.rotation.x = 0;
      bot.group.position.y = 0;

      // Who can this bot see? The player first, then the nearest living enemy bot.
      let seen = null;
      let seenPoint = null;
      if (player.state.alive && canSee(bot, player.eyePosition())) {
        seen = player;
        seenPoint = player.eyePosition();
      } else {
        for (const other of bots) {
          if (other === bot || other.team === bot.team || !other.alive) continue;
          const point = new THREE.Vector3(other.position.x, 1.4, other.position.z);
          if (canSee(bot, point)) {
            seen = other;
            seenPoint = point;
            break;
          }
        }
      }

      if (seen) {
        if (bot.target !== seen) {
          bot.target = seen;
          bot.reactionAt = now + REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN);
          bot.burstLeft = 0;
        }
        bot.seenAt = now;
        bot.state = 'combat';
      } else if (bot.target && now - bot.seenAt < 2.5) {
        // Lost sight a moment ago: keep the combat stance, look at the last spot.
        bot.state = 'combat';
      } else {
        bot.target = null;
        if (bot.team === 'enemy' && plantedSite) bot.state = 'defuse';
        else if (noise && now < noise.until && bot.team === 'enemy') bot.state = 'investigate';
        else if (bot.team === 'enemy') bot.state = 'hold';
        else bot.state = 'patrol';
      }

      if (bot.state === 'combat' && bot.target) {
        // Face the target, strafe slowly, fire in bursts once the reaction time passes.
        const targetPoint = bot.target === player ? player.eyePosition() : new THREE.Vector3(bot.target.position.x, 1.4, bot.target.position.z);
        const dx = targetPoint.x - bot.position.x;
        const dz = targetPoint.z - bot.position.z;
        bot.yaw = Math.atan2(-dx, -dz);
        if (now >= bot.reactionAt) {
          if (bot.burstLeft > 0 && now >= bot.burstAt) {
            bot.burstLeft -= 1;
            bot.burstAt = now + BURST_GAP;
            fireAt(bot, bot.target, targetPoint, player);
          } else if (bot.burstLeft === 0 && now >= bot.restUntil) {
            bot.burstLeft = BURST_LEN;
            bot.burstAt = now;
            bot.restUntil = now + BURST_LEN * BURST_GAP + BURST_REST;
          }
        }
        // Strafe a little so a bot is not a static turret.
        const strafe = Math.sin(now * 1.3 + bot.position.x) * 0.5;
        moveToward(bot, new THREE.Vector3(bot.position.x + Math.cos(bot.yaw) * strafe, 0, bot.position.z - Math.sin(bot.yaw) * strafe), dt, COMBAT_SPEED);
      } else if (bot.state === 'defuse' && plantedSite) {
        const site = SITES[plantedSite];
        if (moveToward(bot, site.position, dt, WALK_SPEED)) {
          bot.defuseAt += dt;
          if (bot.defuseAt >= 5) {
            bot.defuseAt = 0;
            bot.defused = true;
          }
        }
      } else if (bot.state === 'investigate' && noise) {
        if (moveToward(bot, noise.position, dt, WALK_SPEED)) {
          noise = null;
          bot.investigateUntil = now + 2;
        }
      } else if (bot.state === 'hold' && bot.post) {
        const post = bot.post[bot.postIndex];
        if (moveToward(bot, new THREE.Vector3(post[0], 0, post[1]), dt, WALK_SPEED * 0.5)) {
          bot.postIndex = (bot.postIndex + 1) % bot.post.length;
        }
      } else if (bot.state === 'patrol' && bot.route) {
        const point = bot.route[bot.waypoint];
        if (moveToward(bot, new THREE.Vector3(point[0], 0, point[1]), dt, WALK_SPEED)) {
          bot.waypoint = Math.min(bot.waypoint + 1, bot.route.length - 1);
        }
      }
      bot.group.position.copy(bot.position);
      bot.group.rotation.y = bot.yaw;
    }
  }

  // A bot's shot: a real ray at the target with spread. A wall in the way eats it; a hit
  // lands with a probability that falls with distance and a moving target.
  function fireAt(bot, target, targetPoint, player) {
    const origin = new THREE.Vector3(bot.position.x, 1.4, bot.position.z);
    tmpDirection.copy(targetPoint).sub(origin);
    const distance = tmpDirection.length();
    tmpDirection.normalize();
    tmpDirection.x += (Math.random() * 2 - 1) * 0.02;
    tmpDirection.y += (Math.random() * 2 - 1) * 0.02;
    tmpDirection.z += (Math.random() * 2 - 1) * 0.02;
    tmpDirection.normalize();
    raycaster.set(origin, tmpDirection);
    const hit = raycaster.intersectObjects(shootables, false)[0];
    if (hit && hit.distance < distance - 0.5) return;
    const moving = target === player ? player.speed() : 2;
    const chance = Math.max(0.08, 0.55 - distance * 0.012 - moving * 0.03);
    if (Math.random() < chance) {
      const head = Math.random() < 0.12;
      if (target === player) target.hurt(head ? 24 : 12, bot);
      else damage(target, head ? 24 : 12, bot);
    }
  }

  return {
    bots,
    hitMeshes,
    spawnRound,
    hear,
    damage,
    step,
    alive(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
    defused() {
      return bots.some((bot) => bot.defused);
    },
    resetDefuse() {
      for (const bot of bots) bot.defused = false;
    },
    onKill(handler) {
      onKillHandler = handler;
    },
  };
}
