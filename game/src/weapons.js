// The armoury: pistol, rifle, SMG and one grenade. Each weapon owns its numbers, its view
// model and its spread; main.js owns the ray and the damage. Spread grows with movement, so
// stopping to aim pays; recoil kicks the view up and sideways.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'Pistol', price: 0, mag: 12, reserve: 36, gap: 0.16, reload: 1.4,
    damage: 34, headDamage: 100, spreadStill: 0.003, spreadMoving: 0.02, auto: false, kick: 0.03,
  },
  rifle: {
    name: 'Rifle', price: 2700, mag: 30, reserve: 90, gap: 0.096, reload: 1.9,
    damage: 34, headDamage: 100, spreadStill: 0.0022, spreadMoving: 0.028, auto: true, kick: 0.055,
  },
  smg: {
    name: 'SMG', price: 1500, mag: 25, reserve: 100, gap: 0.07, reload: 1.6,
    damage: 22, headDamage: 66, spreadStill: 0.005, spreadMoving: 0.034, auto: true, kick: 0.035,
  },
};
export const GRENADE = { name: 'Grenade', price: 300, damage: 90, radius: 5.5, fuse: 2.0 };

const MOVE_REFERENCE = 5.2;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.1 });

  // One view model, rebuilt per weapon: a receiver, a barrel and a stock, sized by the gun.
  const model = new THREE.Group();
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);
  let parts = [];

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // The grenade: a small sphere the player lobs. It arcs, bounces once, then bursts.
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    accent,
  );
  grenadeMesh.visible = false;
  camera.parent.add(grenadeMesh);

  const state = {
    id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
    grenades: 0, grenadeFlying: null,
  };

  function buildModel(id) {
    for (const part of parts) model.remove(part);
    parts = [];
    const spec = id === 'pistol'
      ? { receiver: [0.07, 0.09, 0.24], barrel: [0.04, 0.04, 0.18], stock: [0.06, 0.07, 0.1] }
      : id === 'smg'
        ? { receiver: [0.08, 0.09, 0.34], barrel: [0.04, 0.04, 0.26], stock: [0.07, 0.08, 0.16] }
        : { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] };
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), grip);
    barrel.position.set(0, 0.025, -spec.receiver[2] / 2 - spec.barrel[2] / 2 + 0.06);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(...spec.stock), grip);
    stock.position.set(0, -0.02, spec.receiver[2] / 2 + spec.stock[2] / 2 - 0.06);
    parts = [receiver, barrel, stock];
    model.add(...parts);
  }
  buildModel('pistol');

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    if (state.grenadeFlying) {
      const g = state.grenadeFlying;
      g.velocity.y -= 14 * dt;
      g.position.addScaledVector(g.velocity, dt);
      if (g.position.y < 0.09) {
        g.position.y = 0.09;
        g.velocity.y *= -0.35;
        g.velocity.x *= 0.6;
        g.velocity.z *= 0.6;
      }
      g.fuse -= dt;
      grenadeMesh.position.copy(g.position);
      if (g.fuse <= 0) {
        grenadeMesh.visible = false;
        state.grenadeFlying = null;
        state.burstAt = g.position.clone();
      }
    }
  }

  function current() {
    return WEAPONS[state.id];
  }

  return {
    state,
    step,
    current,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current().gap;
      state.flash = 0.06;
      state.kick = current().kick;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === current().mag || state.reserve === 0) return;
      state.reloadLeft = current().reload;
    },
    spread(speed) {
      const spec = current();
      return spec.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * spec.spreadMoving;
    },
    equip(id) {
      state.id = id;
      state.mag = WEAPONS[id].mag;
      state.reserve = WEAPONS[id].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      buildModel(id);
    },
    refill() {
      state.mag = current().mag;
      state.reserve = current().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.grenadeFlying = null;
      grenadeMesh.visible = false;
    },
    throwGrenade(origin, direction) {
      if (state.grenades <= 0 || state.grenadeFlying) return false;
      state.grenades -= 1;
      state.grenadeFlying = {
        position: origin.clone(),
        velocity: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: GRENADE.fuse,
      };
      grenadeMesh.position.copy(origin);
      grenadeMesh.visible = true;
      return true;
    },
    takeBurst() {
      const burst = state.burstAt || null;
      state.burstAt = null;
      return burst;
    },
  };
}
