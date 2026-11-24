const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const card = (number, color = 0, copy = 0) => ({ id: `${color}-${number}-${copy}`, number, color });
const seededRandom = seed => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

function chooseObjectives(state) {
  const humanGoal = state.players[0].choices[0];
  G.chooseGoal(state, 0, humanGoal);
}

test("the number deck has 60 unique physical cards and two copies per suit/value", () => {
  const deck = G.newDeck(seededRandom(17));
  assert.equal(deck.length, 60);
  assert.equal(new Set(deck.map(item => item.id)).size, 60);
  for (let color = 0; color < 3; color++) {
    for (let number = 1; number <= 10; number++) {
      assert.equal(deck.filter(item => item.color === color && item.number === number).length, 2);
    }
  }
});
test("goal tiers award only the highest reached tier", () => {
  assert.equal(G.bestGoal([card(3,0,0), card(3,1,0), card(3,2,0), card(3,0,1)], "empire").bonus, 20);
  assert.equal(G.bestGoal([card(2), card(3), card(4), card(5)], "ladder").bonus, 12);
  assert.equal(G.bestGoal([card(1), card(3), card(5), card(7)], "odd").bonus, 14);
  assert.equal(G.bestGoal([card(2), card(4), card(6), card(8), card(10)], "even").bonus, 14);
  assert.equal(G.bestGoal([card(1,1), card(1,1,1), card(4,1)], "color").bonus, 6);
  assert.equal(G.bestGoal([card(5,0), card(5,1), card(5,2)], "triple").bonus, 15);
  assert.equal(G.bestGoal([card(1), card(9), card(4), card(6)], "ten").bonus, 15);
  assert.equal(G.bestGoal([card(1), card(2), card(4), card(5), card(3)], "small").bonus, 24);
  assert.equal(G.bestGoal([card(8,0), card(8,1), card(8,2)], "high").bonus, 9);
  assert.equal(G.bestGoal([card(3,0), card(3,1), card(6,0), card(6,1)], "pairs").bonus, 14);
  assert.equal(G.bestGoal([card(3,0), card(3,1), card(3,2), card(7,0), card(7,1)], "house").bonus, 25);
  assert.equal(G.bestGoal([card(4,0), card(5,1), card(6,2)], "rainbow").bonus, 16);
  assert.equal(G.bestGoal([card(1), card(10), card(3), card(8)], "eleven").bonus, 13);
  assert.equal(G.bestGoal([card(1), card(4), card(7), card(9)], "split").bonus, 12);
  assert.equal(G.bestGoal([card(4,0,0), card(4,0,1), card(7,1,0), card(7,1,1)], "twins").bonus, 20);
  assert.equal(G.bestGoal([card(2,1), card(3,1), card(4,1), card(5,1), card(6,1)], "grand").bonus, 40);
});

test("carried-card penalties preserve half-floor and Battle double value", () => {
  const nine = card(9);
  assert.equal(G.calculateScore([nine], null, new Set([nine.id]), "classic").total, 4);
  assert.equal(G.calculateScore([nine], null, new Set([nine.id]), "battle").total, 18);
  assert.equal(G.calculateScore([card(1)], null, new Set([card(1).id]), "classic").total, 0);
});

test("a completed objective can exempt an old carried card from its penalty", () => {
  const collection = [card(2,0), card(2,1), card(2,2)];
  const held = new Set([collection[0].id]);
  const result = G.calculateScore(collection, "triple", held, "classic");
  assert.equal(result.bonus, 15);
  assert.equal(result.penalty, 0);
  assert.deepEqual(result.exempt, [collection[0].id]);
});

test("Classic auctions allow a player to win more than three cards", () => {
  const state = G.createGame({ playerCount: 3, credits: 20, random: seededRandom(20) });
  G.begin(state, seededRandom(21));
  chooseObjectives(state);
  state.players.slice(1).forEach(player => { player.credits = 0; });
  let wins = 0;
  while (state.phase === "auction" && wins < 4) {
    const active = state.players[state.active];
    if (active.seat === 0) G.bid(state, 0, state.highBid + 1);
    else G.pass(state, active.seat);
    if (state.market[state.lotIndex - 1]?.winner === 0) wins++;
  }
  assert.equal(wins, 4);
  assert.equal(state.players[0].cards.length, 4);
});

test("Frenzy reserves the leading bid and lets its owner raise it", () => {
  const state = G.createGame({ playerCount: 3, variant: "frenzy", credits: 20, random: seededRandom(30) });
  G.begin(state, seededRandom(31));
  chooseObjectives(state);
  G.frenzyBid(state, 0, 0, 5);
  assert.equal(G.frenzyAvailable(state, 0, 0), 20);
  G.frenzySkip(state, 1);
  G.frenzySkip(state, 2);
  assert.equal(state.active, 0);
  G.frenzyBid(state, 0, 0, 6);
  assert.equal(Object.values(state.frenzyBids).reduce((sum, item) => sum + item.amount, 0), 6);
  assert.equal(state.players[0].credits, 20);
});

test("Grand Stash is absent from round one objective options", () => {
  const state = G.createGame({ playerCount: 6, random: seededRandom(40) });
  G.begin(state, seededRandom(41));
  assert.equal(state.players.some(player => player.choices.includes("grand")), false);
  assert.equal(state.market.length, 18);
});

test("the selected character is unique and the remaining CPU lineup stays unique", () => {
  const state = G.createGame({ playerCount: 6, character: 17, random: seededRandom(42) });
  assert.equal(state.players[0].character, 17);
  assert.equal(new Set(state.players.map(player => player.character)).size, 6);
});

test("Battle winners must gift the card to a different player", () => {
  const state = G.createGame({ playerCount: 3, variant: "battle", credits: 20, random: seededRandom(51) });
  G.begin(state, seededRandom(52));
  chooseObjectives(state);
  state.players.slice(1).forEach(player => { player.credits = 0; });
  while (state.active !== 0) G.pass(state, state.active);
  G.bid(state, 0, 1);
  assert.equal(state.phase, "give");
  assert.equal(state.players[0].cards.length, 0);
  assert.throws(() => G.give(state, 0, 0), /another player/);
  const cardId = state.pendingGift.card.id;
  G.give(state, 0, 1);
  assert.equal(state.players[1].cards[0].id, cardId);
  assert.equal(state.players[0].cards.length, 0);
  assert.equal(state.market[0].status, "sold");
  assert.equal(state.phase, "auction");
});

test("Frenzy gives each player exactly two opportunities per opponent", () => {
  const state = G.createGame({ playerCount: 3, variant: "frenzy", credits: 20, random: seededRandom(61) });
  state.players.forEach(player => { player.isHuman = false; });
  G.begin(state, seededRandom(62));
  while (state.phase === "frenzy") G.applyBotFrenzy(state);
  assert.equal(state.frenzyMoves.length, 18);
  assert.equal(state.frenzyTurns, 18);
  assert.equal(state.phase, "bank");
  state.players.forEach(player => {
    const paid = state.market.filter(lot => lot.winner === player.seat).reduce((sum, lot) => sum + lot.price, 0);
    assert.ok(player.credits >= 0);
    assert.equal(player.credits + paid, 20);
  });
});

test("private objectives stay out of an opponent's active-round view", () => {
  const state = G.createGame({ playerCount: 3, random: seededRandom(71) });
  G.begin(state, seededRandom(72));
  chooseObjectives(state);
  const view = G.visibleState(state, 0);
  assert.equal(view.players[0].objective, state.players[0].objective);
  assert.equal(view.players[1].objective, "hidden");
  assert.deepEqual(view.players[1].choices, []);
});

test("Battle target endings stop play but still award the lowest total", () => {
  const state = G.createGame({ playerCount: 3, variant: "battle", target: 10, roundLimit: 3, random: seededRandom(81) });
  G.begin(state, seededRandom(82));
  chooseObjectives(state);
  state.phase = "bank";
  state.players[0].total = 15;
  state.players[1].total = 3;
  state.players[2].total = 8;
  state.players.slice(1).forEach(player => G.applyBotBank(state, player));
  G.bank(state, 0, []);
  assert.equal(state.phase, "finished");
  assert.equal(state.endReason, "target");
  assert.deepEqual(state.winner, [1]);
});

test("all three variants can complete a CPU-only round", () => {
  for (const variant of ["classic", "battle", "frenzy"]) {
    const state = G.createGame({ playerCount: 3, variant, roundLimit: 1, random: seededRandom(91) });
    state.players.forEach(player => { player.isHuman = false; });
    G.begin(state, seededRandom(92));
    let safety = 0;
    while (["auction", "give", "frenzy"].includes(state.phase) && safety++ < 250) {
      if (state.phase === "auction") G.applyBotAuction(state);
      else if (state.phase === "give") G.applyBotGive(state);
      else G.applyBotFrenzy(state);
    }
    assert.equal(state.phase, "bank", `${variant} auctions should settle`);
    state.players.forEach(player => G.applyBotBank(state, player));
    G.resolveBanking(state);
    assert.equal(state.phase, "finished", `${variant} should finish its final round`);
    assert.ok(state.winner.length > 0);
  }
});
