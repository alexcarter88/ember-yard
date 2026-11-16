// The match: rounds, money and the ember. A round runs buy (20 s) -> live (100 s) ->
// planted (35 s) -> over, and the first side to 5 rounds takes the match. Money is the
// economy: kills and round wins pay, losses pay a smaller bonus, and the buy menu spends
// it on rifles, SMGs, grenades and armour. The player always attacks; the bots defend.
export const BUY_SECONDS = 20;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 35;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;

export function createRounds() {
  const state = {
    phase: 'buy',
    round: 1,
    wins: 0,
    losses: 0,
    money: START_MONEY,
    timeLeft: BUY_SECONDS,
    plantedSite: null,
    plantProgress: 0,
    defuseProgress: 0,
    matchOver: false,
    matchWon: false,
    lastResult: '',
    lastWon: false,
    roundEnded: false,
  };

  function startRound() {
    state.phase = 'buy';
    state.timeLeft = BUY_SECONDS;
    state.plantedSite = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
  }

  function startLive() {
    state.phase = 'live';
    state.timeLeft = ROUND_SECONDS;
  }

  function plant(site) {
    state.plantedSite = site;
    state.phase = 'planted';
    state.timeLeft = PLANT_SECONDS;
    state.money += PLANT_REWARD;
  }

  function endRound(won, reason) {
    state.lastResult = reason;
    state.lastWon = won;
    state.roundEnded = true;
    if (won) {
      state.wins += 1;
      state.money += WIN_REWARD;
    } else {
      state.losses += 1;
      state.money += LOSS_REWARD;
    }
    state.round += 1;
    if (state.wins >= WIN_ROUNDS || state.losses >= WIN_ROUNDS) {
      state.matchOver = true;
      state.matchWon = state.wins >= WIN_ROUNDS;
      state.phase = 'over';
    } else {
      startRound();
    }
  }

  function step(dt) {
    if (state.phase === 'over') return;
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      if (state.phase === 'buy') startLive();
      else if (state.phase === 'live') endRound(false, 'Time expired — the defenders held the yard.');
      else if (state.phase === 'planted') endRound(true, 'The ember went off. Site cleared.');
    }
  }

  return { state, startRound, startLive, plant, endRound, step };
}
