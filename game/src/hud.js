// The DOM HUD: crosshair with dynamic spread, hit marker, health, ammo, money, the round
// timer, the round score, the teams alive, the bomb status, the kill feed and the buy menu.
// It never touches the simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADE } from './weapons.js';

const COPY = {
  start: {
    title: 'Ember Yard',
    copy: 'Plant the ember at A or B, or wipe the defenders out. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'Ember Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundWon: {
    title: 'Round won',
    copy: '',
    action: 'Next round',
  },
  roundLost: {
    title: 'Round lost',
    copy: '',
    action: 'Next round',
  },
  matchWon: {
    title: 'Match won',
    copy: '',
    action: 'Play again',
  },
  matchLost: {
    title: 'Match lost',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const scoreValue = document.getElementById('score-value');
  const hitmarker = document.getElementById('hitmarker');
  const healthFill = document.getElementById('health-fill');
  const healthValue = document.getElementById('health-value');
  const moneyValue = document.getElementById('money-value');
  const timerValue = document.getElementById('timer-value');
  const roundsValue = document.getElementById('rounds-value');
  const teamsValue = document.getElementById('teams-value');
  const bombValue = document.getElementById('bomb');
  const feed = document.getElementById('feed');
  const crosshair = document.getElementById('crosshair');
  const damageFlash = document.getElementById('damage');
  const buyMenu = document.getElementById('buy');
  const buyItems = document.getElementById('buy-items');
  const buyMoney = document.getElementById('buy-money');
  const plantBar = document.getElementById('plant-bar');
  const plantFill = document.getElementById('plant-fill');
  const plantLabel = document.getElementById('plant-label');
  let hitTimer = 0;
  let last = {};
  let buyOpen = false;
  let buyHandler = null;

  function setText(element, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value;
  }

  return {
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      ammo.classList.toggle('empty', mag === 0);
    },
    setScore(value) {
      setText(scoreValue, 'score', String(value));
    },
    setHealth(value, armor) {
      setText(healthValue, 'health', String(value));
      healthFill.style.width = `${Math.max(0, value)}%`;
      healthFill.classList.toggle('low', value <= 30);
      setText(document.getElementById('armor-value'), 'armor', armor > 0 ? `+${armor}` : '');
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value}`);
      setText(buyMoney, 'buyMoney', `$${value}`);
    },
    setTimer(seconds, phase) {
      const value = `${Math.max(0, Math.ceil(seconds))}`;
      setText(timerValue, 'timer', value);
      timerValue.classList.toggle('urgent', seconds <= 10 && phase !== 'buy');
      setText(document.getElementById('phase-value'), 'phase', phase === 'buy' ? 'BUY' : phase === 'planted' ? 'EMBER LIVE' : 'LIVE');
    },
    setRounds(wins, losses) {
      setText(roundsValue, 'rounds', `${wins} — ${losses}`);
    },
    setTeams(allies, enemies) {
      setText(teamsValue, 'teams', `You ${allies} · Them ${enemies}`);
    },
    setBomb(text) {
      setText(bombValue, 'bomb', text);
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 140);
    },
    killFeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 4) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showPlant(label, progress) {
      plantBar.hidden = false;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hidePlant() {
      plantBar.hidden = true;
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = detail || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    openBuy(money) {
      buyOpen = true;
      buyMenu.hidden = false;
      buyMoney.textContent = `$${money}`;
      buyItems.innerHTML = '';
      const items = [
        { key: '1', id: 'rifle', label: `Rifle — $${WEAPONS.rifle.price}` },
        { key: '2', id: 'smg', label: `SMG — $${WEAPONS.smg.price}` },
        { key: '3', id: 'grenade', label: `Grenade — $${GRENADE.price}` },
        { key: '4', id: 'armor', label: 'Armour — $650' },
      ];
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.textContent = `[${item.key}] ${item.label}`;
        row.addEventListener('click', () => {
          if (buyHandler) buyHandler(item.id);
        });
        buyItems.appendChild(row);
      }
    },
    closeBuy() {
      buyOpen = false;
      buyMenu.hidden = true;
    },
    isBuyOpen() {
      return buyOpen;
    },
    onBuy(handler) {
      buyHandler = handler;
    },
  };
}
