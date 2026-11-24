(function (root, factory) {
  const engine = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = engine;
  root.GoingThrice = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLORS = [
    { name: "Turquoise", short: "T", color: "#42c5bd", symbol: "●" },
    { name: "Magenta", short: "M", color: "#ed75a1", symbol: "◆" },
    { name: "Golden", short: "G", color: "#e8b94f", symbol: "▲" }
  ];
  const CHARACTERS = [
    "Marty", "Dottie", "Vince", "Juniper", "Earl", "Rosa", "Nikhil", "Bev", "Gus", "Tess",
    "Oscar", "Mei", "Lenny", "Amina", "Frankie", "Howard", "Priya", "Cal", "Wanda", "Diego",
    "Yuri", "Simone", "Archie", "Zelda", "Hank", "Cleo", "Basil", "Ivy", "Marco", "Nora"
  ];
  const BEHAVIORS = ["All-Rounder", "Bargain Hunter", "Collector", "High Roller", "Table Reader", "Patient Planner", "Opportunist"];
  const OBJECTIVES = [
    ["empire", "Little Empire", "Build a small kingdom of matching low numbers.", "2 same · 5 pts", "3 · 10", "4 · 20"],
    ["ladder", "Step Ladder", "Collect distinct consecutive numbers in any colors.", "3 in a row · 8 pts", "4 · 12", "5 · 18"],
    ["odd", "Odd Squad", "Gather distinct odd numbers.", "3 · 8 pts", "4 · 14"],
    ["even", "Even Better", "Gather distinct even numbers.", "3 · 8 pts", "4 · 14"],
    ["color", "Color Crush", "Collect cards in one color. Numbers may repeat.", "3 · 6 pts", "4 · 10", "5 · 15"],
    ["triple", "Triple Threat", "One number in each of the three colors.", "All three · 15 pts"],
    ["ten", "Perfect Ten", "Make disjoint pairs that add up to ten.", "1 pair · 6 pts", "2 · 15"],
    ["small", "Small Fortune", "Collect distinct numbers from one to five.", "3 · 10 pts", "4 · 16", "5 · 24"],
    ["high", "Two of a Kind", "Match high numbers from six to ten.", "2 same · 4 pts", "3 · 9", "4 · 16"],
    ["pairs", "Double Trouble", "Make pairs of two different numbers.", "Two pairs · 14 pts"],
    ["house", "Full House", "Three of one number and two of another.", "Full house · 25 pts"],
    ["rainbow", "Rainbow Run", "Three consecutive numbers, one in each color.", "Run · 16 pts"],
    ["eleven", "Lucky Eleven", "Make disjoint pairs that add up to eleven.", "1 pair · 5 pts", "2 · 13"],
    ["split", "Split Decision", "Two distinct low and two distinct high numbers.", "Four cards · 12 pts"],
    ["twins", "Color Twins", "Two pairs matching in both number and color.", "Two pairs · 20 pts"],
    ["grand", "Grand Stash", "Five consecutive numbers in one color.", "Run of five · 40 pts"]
  ].map(([id, name, description, ...tiers]) => ({ id, name, description, tiers }));

  const OBJECTIVE_BY_ID = Object.fromEntries(OBJECTIVES.map(goal => [goal.id, goal]));
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  const clone = value => JSON.parse(JSON.stringify(value));

  function shuffle(items, random = Math.random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function newDeck(random = Math.random) {
    return shuffle(COLORS.flatMap((_, color) =>
      Array.from({ length: 10 }, (_, value) =>
        [0, 1].map(copy => ({ id: `${color}-${value + 1}-${copy}`, number: value + 1, color }))
      ).flat()
    ), random);
  }

  function objectivePool(round, random = Math.random) {
    const ids = OBJECTIVES.filter(goal => goal.id !== "grand" || round >= 2).flatMap(goal => [goal.id, goal.id]);
    return shuffle(ids, random);
  }

  function combinations(items, size) {
    const out = [];
    function walk(start, picked) {
      if (picked.length === size) { out.push(picked.slice()); return; }
      for (let i = start; i <= items.length - (size - picked.length); i++) {
        picked.push(items[i]);
        walk(i + 1, picked);
        picked.pop();
      }
    }
    walk(0, []);
    return out;
  }

  function bestGoal(cards, goalId, carriedIds = new Set(), variant = "classic") {
    const goal = OBJECTIVE_BY_ID[goalId];
    if (!goal || !cards.length) return { bonus: 0, used: [] };
    const options = [];
    const record = (subset, bonus) => { if (bonus > 0) options.push({ subset, bonus }); };
    const nums = subset => subset.map(card => card.number);
    const uniqueCount = subset => new Set(nums(subset)).size;
    const sameValue = subset => new Set(nums(subset)).size === 1;
    const tiers = (count, steps) => steps.reduce((value, [atLeast, points]) => count >= atLeast ? points : value, 0);

    for (let size = 1; size <= Math.min(5, cards.length); size++) {
      for (const subset of combinations(cards, size)) {
        const n = nums(subset);
        const unique = uniqueCount(subset);
        let bonus = 0;
        switch (goalId) {
          case "empire":
            if (n[0] <= 5 && sameValue(subset)) bonus = tiers(size, [[2, 5], [3, 10], [4, 20]]);
            break;
          case "ladder":
            if (unique === size && n.every((value, i) => i === 0 || n.slice().sort((a, b) => a - b)[i] === n.slice().sort((a, b) => a - b)[i - 1] + 1)) {
              bonus = tiers(size, [[3, 8], [4, 12], [5, 18]]);
            }
            break;
          case "odd":
            if (unique === size && n.every(value => value % 2 === 1)) bonus = tiers(size, [[3, 8], [4, 14]]);
            break;
          case "even":
            if (unique === size && n.every(value => value % 2 === 0)) bonus = tiers(size, [[3, 8], [4, 14]]);
            break;
          case "color":
            if (subset.every(card => card.color === subset[0].color)) bonus = tiers(size, [[3, 6], [4, 10], [5, 15]]);
            break;
          case "triple":
            if (size === 3 && sameValue(subset) && new Set(subset.map(card => card.color)).size === 3) bonus = 15;
            break;
          case "ten":
          case "eleven": {
            const target = goalId === "ten" ? 10 : 11;
            const pairCount = size / 2;
            if (size % 2 === 0 && combinations(subset, 2).some(pair => pair[0].number + pair[1].number === target)) {
              function paired(remaining, pairs) {
                if (!remaining.length) return pairs === pairCount;
                const first = remaining[0];
                for (let i = 1; i < remaining.length; i++) {
                  if (first.number + remaining[i].number === target &&
                      paired(remaining.slice(1, i).concat(remaining.slice(i + 1)), pairs + 1)) return true;
                }
                return false;
              }
              if (paired(subset, 0)) bonus = goalId === "ten" ? tiers(pairCount, [[1, 6], [2, 15]]) : tiers(pairCount, [[1, 5], [2, 13]]);
            }
            break;
          }
          case "small":
            if (unique === size && n.every(value => value <= 5)) bonus = tiers(size, [[3, 10], [4, 16], [5, 24]]);
            break;
          case "high":
            if (n[0] >= 6 && sameValue(subset)) bonus = tiers(size, [[2, 4], [3, 9], [4, 16]]);
            break;
          case "pairs": {
            const counts = [...new Set(n)].map(value => n.filter(num => num === value).length);
            if (size === 4 && counts.length === 2 && counts.every(count => count === 2)) bonus = 14;
            break;
          }
          case "house": {
            const counts = [...new Set(n)].map(value => n.filter(num => num === value).length).sort((a, b) => a - b);
            if (size === 5 && counts.join(",") === "2,3") bonus = 25;
            break;
          }
          case "rainbow": {
            const sorted = n.slice().sort((a, b) => a - b);
            if (size === 3 && unique === 3 && sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1 &&
                new Set(subset.map(card => card.color)).size === 3) bonus = 16;
            break;
          }
          case "split":
            if (size === 4 && unique === 4 && n.filter(value => value <= 5).length === 2 && n.filter(value => value >= 6).length === 2) bonus = 12;
            break;
          case "twins": {
            const groups = new Map();
            subset.forEach(card => {
              const key = `${card.number}-${card.color}`;
              groups.set(key, (groups.get(key) || 0) + 1);
            });
            if (size === 4 && [...groups.values()].length === 2 && [...groups.values()].every(count => count === 2)) bonus = 20;
            break;
          }
          case "grand": {
            const sorted = n.slice().sort((a, b) => a - b);
            if (size === 5 && unique === 5 && sorted.every((value, i) => i === 0 || value === sorted[i - 1] + 1) &&
                subset.every(card => card.color === subset[0].color)) bonus = 40;
            break;
          }
        }
        record(subset, bonus);
      }
    }

    const valueRestored = card => carryPenalty(card.number, variant);
    options.sort((a, b) => b.bonus - a.bonus ||
      b.subset.reduce((sum, card) => sum + (carriedIds.has(card.id) ? valueRestored(card) : 0), 0) -
      a.subset.reduce((sum, card) => sum + (carriedIds.has(card.id) ? valueRestored(card) : 0), 0));
    const best = options[0];
    if (!best) return { bonus: 0, used: [] };
    return { bonus: best.bonus, used: best.subset.filter(card => carriedIds.has(card.id)).map(card => card.id) };
  }

  function carriedValue(number, variant) {
    if (variant === "battle") return number * 2;
    return Math.floor(number / 2);
  }

  function carryPenalty(number, variant) {
    const restoredValue = carriedValue(number, variant);
    return variant === "battle" ? restoredValue - number : number - restoredValue;
  }

  function calculateScore(cards, goalId, carriedIds, variant) {
    const held = new Set(carriedIds || []);
    const objective = bestGoal(cards, goalId, held, variant);
    const printed = cards.reduce((sum, card) => sum + card.number, 0);
    const exposedPenalty = cards.reduce((sum, card) => sum + (held.has(card.id) ? carryPenalty(card.number, variant) : 0), 0);
    const restored = objective.used.reduce((sum, id) => {
      const card = cards.find(item => item.id === id);
      return sum + (card ? carryPenalty(card.number, variant) : 0);
    }, 0);
    const penalty = Math.max(0, exposedPenalty - restored);
    const total = variant === "battle"
      ? printed + penalty - objective.bonus
      : printed - penalty + objective.bonus;
    return { printed, penalty, bonus: objective.bonus, total, exempt: objective.used };
  }

  function createGame(options = {}) {
    const random = options.random || Math.random;
    const playerCount = clamp(Number(options.playerCount) || 3, 3, 6);
    const characters = shuffle(CHARACTERS.map((_, i) => i), random);
    if (Number.isInteger(options.character) && options.character >= 0 && options.character < CHARACTERS.length) {
      characters.splice(characters.indexOf(options.character), 1);
      characters.unshift(options.character);
    }
    const players = Array.from({ length: playerCount }, (_, seat) => ({
      seat,
      name: seat === 0 ? (options.name || "You").trim().slice(0, 24) || "You" : CHARACTERS[characters[seat]],
      character: characters[seat],
      behavior: BEHAVIORS[Math.floor(random() * BEHAVIORS.length)],
      isHuman: seat === 0,
      credits: Number(options.credits) || 20,
      total: 0,
      cards: [],
      heldIds: [],
      objective: null,
      choices: [],
      roundScore: null
    }));
    return {
      version: 1,
      variant: ["classic", "battle", "frenzy"].includes(options.variant) ? options.variant : "classic",
      target: clamp(Number(options.target) || 100, 1, 10000),
      roundLimit: clamp(Number(options.roundLimit) || 3, 1, Math.max(1, Math.floor(60 / (3 * playerCount)))),
      round: 0,
      players,
      phase: "setup",
      deck: [],
      deckCursor: 0,
      market: [],
      lotIndex: 0,
      highBid: 0,
      leader: null,
      active: null,
      passed: [],
      history: [],
      frenzyTurns: 0,
      frenzyMoves: [],
      frenzyBids: {},
      pendingGift: null,
      startedAt: Date.now(),
      winner: null,
      endReason: null
    };
  }

  function startRound(state, random = Math.random) {
    state.round += 1;
    if (!state.deck.length) state.deck = newDeck(random);
    const pool = objectivePool(state.round, random);
    state.players.forEach(player => {
      player.credits = state.round === 1 ? player.credits : state.startingCredits;
      player.choices = [pool.pop(), pool.pop()];
      player.objective = player.isHuman ? null : chooseBotGoal(player);
      player.roundScore = null;
    });
    const lots = state.players.length * 3;
    state.market = state.deck.slice(state.deckCursor, state.deckCursor + lots).map((card, index) => ({ ...card, lot: index, status: "upcoming" }));
    state.deckCursor += lots;
    state.lotIndex = 0;
    state.highBid = 0;
    state.leader = null;
    state.passed = [];
    state.frenzyTurns = 0;
    state.frenzyMoves = [];
    state.frenzyBids = {};
    state.pendingGift = null;
    state.phase = "choose";
    state.history.push({ round: state.round, type: "round", text: `Round ${state.round} begins. ${lots} cards enter the market.` });
    if (state.players.every(player => player.objective)) startAuctions(state);
  }

  function chooseBotGoal(player) {
    return player.choices.slice().sort((a, b) => goalAffinity(player.cards, b) - goalAffinity(player.cards, a))[0] || player.choices[0];
  }

  function goalAffinity(cards, goalId) {
    const numbers = cards.map(card => card.number);
    const counts = numbers.reduce((map, number) => map.set(number, (map.get(number) || 0) + 1), new Map());
    const goal = OBJECTIVE_BY_ID[goalId];
    if (!goal) return 0;
    switch (goalId) {
      case "empire": return Math.max(0, ...[1, 2, 3, 4, 5].map(number => counts.get(number) || 0)) * 2;
      case "high": return Math.max(0, ...[6, 7, 8, 9, 10].map(number => counts.get(number) || 0)) * 2;
      case "color": return Math.max(0, ...COLORS.map((_, index) => cards.filter(card => card.color === index).length));
      case "odd": return new Set(numbers.filter(number => number % 2)).size;
      case "even": return new Set(numbers.filter(number => number % 2 === 0)).size;
      case "small": return new Set(numbers.filter(number => number <= 5)).size;
      case "ladder":
      case "grand":
      case "rainbow": return Math.min(5, new Set(numbers).size) + (goalId === "grand" ? cards.length / 5 : 0);
      case "triple": return Math.max(0, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(number => new Set(cards.filter(card => card.number === number).map(card => card.color)).size));
      case "ten": return cards.filter(card => card.number <= 9).length / 2;
      case "eleven": return cards.length / 2;
      case "pairs": return Math.max(0, ...[...counts.values()].map(count => count >= 2 ? count : 0));
      case "house": return cards.length / 3;
      case "split": return Math.min(2, numbers.filter(number => number <= 5).length) + Math.min(2, numbers.filter(number => number >= 6).length);
      case "twins": return cards.length / 2;
      default: return 0;
    }
  }

  function chooseGoal(state, seat, goalId) {
    assertPhase(state, "choose");
    const player = state.players[seat];
    if (!player || !player.isHuman || !player.choices.includes(goalId)) throw new Error("That objective is not available.");
    player.objective = goalId;
    player.choices = [];
    if (state.players.every(item => item.objective)) {
      startAuctions(state);
      state.history.push({ round: state.round, type: "goal", text: "The table has chosen its objectives." });
    }
  }

  function startAuctions(state) {
    if (state.variant === "frenzy") {
      state.phase = "frenzy";
      state.active = 0;
    } else {
      state.phase = "auction";
      state.active = (state.round - 1) % state.players.length;
      activateLot(state);
    }
  }

  function assertPhase(state, expected) {
    if (state.phase !== expected) throw new Error(`Action not available during ${state.phase}.`);
  }

  function activateLot(state) {
    const lot = state.market[state.lotIndex];
    if (!lot) { state.phase = "bank"; return; }
    state.phase = "auction";
    lot.status = "live";
    state.highBid = 0;
    state.leader = null;
    state.passed = [];
    state.active = nextEligible(state, (state.round - 1 + state.lotIndex) % state.players.length);
    if (state.active === null) settleLot(state);
  }

  function nextEligible(state, fromSeat) {
    for (let offset = 0; offset < state.players.length; offset++) {
      const seat = (fromSeat + offset) % state.players.length;
      if (seat !== state.leader && !state.passed.includes(seat) && state.players[seat].credits > state.highBid) return seat;
    }
    return null;
  }

  function bid(state, seat, amount) {
    assertPhase(state, "auction");
    assertTurn(state, seat);
    const player = state.players[seat];
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= state.highBid || value > player.credits) throw new Error("Bid higher than the table bid, up to your available credits.");
    state.highBid = value;
    state.leader = seat;
    state.history.push({ round: state.round, type: "bid", seat, text: `${player.name} bids ${value}.`, lot: state.lotIndex });
    advanceAuction(state, seat);
  }

  function pass(state, seat) {
    assertPhase(state, "auction");
    assertTurn(state, seat);
    state.passed.push(seat);
    state.history.push({ round: state.round, type: "pass", seat, text: `${state.players[seat].name} passes.`, lot: state.lotIndex });
    advanceAuction(state, seat);
  }

  function assertTurn(state, seat) {
    if (seat !== state.active) throw new Error("It is not this player's turn.");
  }

  function advanceAuction(state, fromSeat) {
    const next = nextEligible(state, (fromSeat + 1) % state.players.length);
    if (next === null) settleLot(state);
    else state.active = next;
  }

  function settleLot(state) {
    const lot = state.market[state.lotIndex];
    if (!lot) { finishAuctions(state); return; }
    if (state.leader !== null) {
      const winner = state.players[state.leader];
      winner.credits -= state.highBid;
      lot.winner = winner.seat;
      lot.price = state.highBid;
      if (state.variant === "battle") {
        lot.status = "pending-gift";
        state.pendingGift = { card: { id: lot.id, number: lot.number, color: lot.color, lot: state.lotIndex }, fromSeat: winner.seat, lotIndex: state.lotIndex };
        state.phase = "give";
        state.active = winner.seat;
        state.history.push({ round: state.round, type: "sold", seat: winner.seat, text: `${winner.name} wins the ${COLORS[lot.color].name.toLowerCase()} ${lot.number} for ${state.highBid}. Choose a recipient.`, lot: state.lotIndex });
        return;
      }
      winner.cards.push({ id: lot.id, number: lot.number, color: lot.color });
      lot.status = "sold";
      state.history.push({ round: state.round, type: "sold", seat: winner.seat, text: `${winner.name} wins the ${COLORS[lot.color].name.toLowerCase()} ${lot.number} for ${state.highBid}.`, lot: state.lotIndex });
    } else {
      lot.status = "passed";
      state.history.push({ round: state.round, type: "discard", text: `The ${COLORS[lot.color].name.toLowerCase()} ${lot.number} goes unsold.`, lot: state.lotIndex });
    }
    completeLot(state);
  }

  function completeLot(state) {
    state.lotIndex += 1;
    if (state.lotIndex >= state.market.length) finishAuctions(state);
    else activateLot(state);
  }

  function give(state, fromSeat, toSeat) {
    assertPhase(state, "give");
    const pending = state.pendingGift;
    if (!pending || fromSeat !== state.active || fromSeat !== pending.fromSeat) throw new Error("It is not this player's gifting turn.");
    if (!Number.isInteger(toSeat) || toSeat < 0 || toSeat >= state.players.length || toSeat === fromSeat) {
      throw new Error("Give the card to another player.");
    }
    const recipient = state.players[toSeat];
    recipient.cards.push(pending.card);
    state.market[pending.lotIndex].status = "sold";
    state.market[pending.lotIndex].recipient = toSeat;
    state.history.push({ round: state.round, type: "gift", seat: toSeat, text: `${state.players[fromSeat].name} gives the ${pending.card.number} to ${recipient.name}.`, lot: pending.lotIndex });
    state.pendingGift = null;
    completeLot(state);
  }

  function applyBotGive(state) {
    if (state.phase !== "give" || state.players[state.active]?.isHuman) return false;
    const pending = state.pendingGift;
    const card = pending.card;
    const recipient = state.players.filter(player => player.seat !== pending.fromSeat).sort((a, b) => {
      const scoreA = a.total + a.cards.reduce((sum, item) => sum + item.number, 0) +
        goalAffinity(a.cards.concat(card), a.objective) * 2.5;
      const scoreB = b.total + b.cards.reduce((sum, item) => sum + item.number, 0) +
        goalAffinity(b.cards.concat(card), b.objective) * 2.5;
      return scoreB - scoreA;
    })[0];
    give(state, pending.fromSeat, recipient.seat);
    return true;
  }

  function finishAuctions(state) {
    state.phase = "bank";
    state.active = state.players.find(player => player.isHuman)?.seat ?? null;
    state.history.push({ round: state.round, type: "bank", text: "Auctions close. Choose what to carry forward." });
  }

  function bank(state, seat, carryIds = []) {
    assertPhase(state, "bank");
    const player = state.players[seat];
    if (!player || !player.isHuman || seat !== state.active) throw new Error("Only the local player can make this bank decision.");
    commitBank(state, player, carryIds);
    state.active = null;
    resolveBanking(state);
  }

  function resolveBanking(state) {
    if (state.phase === "bank" && state.players.every(item => item.roundScore)) resolveRound(state);
  }

  function commitBank(state, player, carryIds = []) {
    const allowedCarry = state.round < state.roundLimit && state.round * 3 < state.roundLimit * 3;
    const selected = [...new Set(carryIds)];
    if (!allowedCarry && selected.length) throw new Error("There is no carry after the final round.");
    if (selected.length > 2 || selected.some(id => !player.cards.some(card => card.id === id))) throw new Error("Carry up to two cards from your collection.");
    const scoredCards = player.cards.filter(card => !selected.includes(card.id));
    const score = calculateScore(scoredCards, player.objective, new Set(player.heldIds), state.variant);
    player.total += score.total;
    player.roundScore = { ...score, goal: player.objective, cards: scoredCards.map(card => card.id), carried: selected.slice() };
    player.heldIds = selected.slice();
    player.cards = player.cards.filter(card => selected.includes(card.id));
    player.objective = null;
    if (player.isHuman) player.choices = [];
    state.history.push({ round: state.round, type: "score", seat: player.seat, text: `${player.name} scores ${score.total} points${score.bonus ? `, including a ${score.bonus}-point objective` : ""}.` });
  }

  function resolveRound(state) {
    const hitTarget = state.players.some(player => player.total >= state.target);
    if (state.round >= state.roundLimit || hitTarget) {
      state.players.forEach(player => {
        if (player.cards.length) {
          const extra = calculateScore(player.cards, null, new Set(player.heldIds), state.variant);
          player.total += extra.total;
          player.cards = [];
          player.heldIds = [];
          player.roundScore.finalCarry = extra.total;
        }
      });
      const best = state.variant === "battle"
        ? Math.min(...state.players.map(player => player.total))
        : Math.max(...state.players.map(player => player.total));
      state.winner = state.players.filter(player => player.total === best).map(player => player.seat);
      state.endReason = hitTarget ? "target" : "rounds";
      state.phase = "finished";
      state.history.push({ round: state.round, type: "finish", text: hitTarget ? "The score target is reached. Final standings are set." : "The final round is complete." });
    } else {
      state.phase = "results";
      state.active = 0;
    }
  }

  function advanceRound(state, random = Math.random) {
    assertPhase(state, "results");
    state.players.forEach(player => {
      player.credits = state.startingCredits;
      player.cards = player.cards.slice();
      player.heldIds = player.heldIds.filter(id => player.cards.some(card => card.id === id));
    });
    startRound(state, random);
  }

  function begin(state, random = Math.random) {
    if (state.phase !== "setup") throw new Error("The game has already started.");
    state.startingCredits = state.players[0].credits;
    state.deck = newDeck(random);
    startRound(state, random);
  }

  function applyBotAuction(state) {
    if (state.phase !== "auction" || state.players[state.active]?.isHuman) return false;
    const player = state.players[state.active];
    const card = state.market[state.lotIndex];
    const cap = botCap(state, player, card);
    if (cap > state.highBid) bid(state, player.seat, Math.min(cap, state.highBid + botStep(player.behavior, state.highBid, cap)));
    else pass(state, player.seat);
    return true;
  }

  function frenzyAvailable(state, seat, lotIndex) {
    const player = state.players[seat];
    const reserved = Object.values(state.frenzyBids)
      .filter(entry => entry.seat === seat)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const ownBid = state.frenzyBids[lotIndex]?.seat === seat ? state.frenzyBids[lotIndex].amount : 0;
    return player.credits - reserved + ownBid;
  }

  function frenzyBid(state, seat, lotIndex, amount) {
    assertPhase(state, "frenzy");
    assertTurn(state, seat);
    const lot = state.market[lotIndex];
    const current = state.frenzyBids[lotIndex];
    const value = Number(amount);
    if (!lot || !Number.isInteger(value) || value <= (current?.amount || 0) || value > frenzyAvailable(state, seat, lotIndex)) {
      throw new Error("Choose a live lot and a higher bid within your unreserved credits.");
    }
    state.frenzyBids[lotIndex] = { seat, amount: value };
    lot.status = "live";
    state.frenzyMoves.push({ seat, lot: lotIndex, amount: value, type: "bid" });
    state.history.push({ round: state.round, type: "frenzyBid", seat, text: `${state.players[seat].name} bids ${value} on the ${COLORS[lot.color].name.toLowerCase()} ${lot.number}.`, lot: lotIndex });
    advanceFrenzy(state);
  }

  function frenzySkip(state, seat) {
    assertPhase(state, "frenzy");
    assertTurn(state, seat);
    state.frenzyMoves.push({ seat, type: "skip" });
    state.history.push({ round: state.round, type: "frenzySkip", seat, text: `${state.players[seat].name} skips a turn.` });
    advanceFrenzy(state);
  }

  function advanceFrenzy(state) {
    state.frenzyTurns += 1;
    const totalMoves = state.players.length * state.players.length * 2;
    if (state.frenzyTurns >= totalMoves) {
      Object.entries(state.frenzyBids).forEach(([index, entry]) => {
        const lot = state.market[Number(index)];
        const winner = state.players[entry.seat];
        winner.credits -= entry.amount;
        winner.cards.push({ id: lot.id, number: lot.number, color: lot.color });
        lot.status = "sold";
        lot.winner = entry.seat;
        lot.price = entry.amount;
      });
      state.market.forEach(lot => { if (!state.frenzyBids[lot.lot]) lot.status = "passed"; });
      state.history.push({ round: state.round, type: "settlement", text: "Frenzy settles. Only the leading bids are paid." });
      finishAuctions(state);
    } else state.active = state.frenzyTurns % state.players.length;
  }

  function applyBotFrenzy(state) {
    if (state.phase !== "frenzy" || state.players[state.active]?.isHuman) return false;
    const player = state.players[state.active];
    let best = null;
    state.market.forEach((card, index) => {
      const current = state.frenzyBids[index];
      if (current?.seat === player.seat) return;
      const cap = Math.min(frenzyAvailable(state, player.seat, index), botCap(state, player, card));
      const amount = Math.max(1, (current?.amount || 0) + 1);
      if (amount <= cap) {
        const value = (card.number * 0.6 + (goalAffinity(player.cards.concat(card), player.objective) - goalAffinity(player.cards, player.objective)) * 2.5) / amount;
        if (!best || value > best.value) best = { index, amount, value };
      }
    });
    if (best) frenzyBid(state, player.seat, best.index, best.amount);
    else frenzySkip(state, player.seat);
    return true;
  }

  function botStep(behavior, current, cap) {
    if (behavior === "High Roller" && current === 0) return Math.min(cap, 5);
    if (behavior === "Collector" && current === 0) return Math.min(cap, 3);
    return current + 1;
  }

  function botCap(state, player, card) {
    const goal = player.objective;
    const oldAffinity = goalAffinity(player.cards, goal);
    const newAffinity = goalAffinity(player.cards.concat(card), goal);
    const useful = newAffinity > oldAffinity;
    const roomLots = Math.max(1, state.market.length - state.lotIndex);
    const reserve = Math.min(5, Math.floor(player.credits / Math.max(3, roomLots / 2)));
    const multipliers = {
      "All-Rounder": 1.05, "Bargain Hunter": 0.78, Collector: 1.0,
      "High Roller": 1.2, "Table Reader": 1.08, "Patient Planner": 0.82, Opportunist: 0.95
    };
    const faceWorth = card.number * (useful ? 0.92 : 0.68);
    const goalWorth = (newAffinity - oldAffinity) * 2.8;
    const budget = Math.max(0, player.credits - (roomLots > 1 ? reserve : 0));
    return Math.min(budget, Math.floor((faceWorth + goalWorth) * (multipliers[player.behavior] || 1)));
  }

  function applyBotBank(state, player) {
    if (!player.cards.length) { commitBank(state, player, []); return; }
    if (state.round >= state.roundLimit) { commitBank(state, player, []); return; }
    const max = Math.min(2, player.cards.length);
    let best = { score: -Infinity, ids: [] };
    const held = new Set(player.heldIds);
    const cardSets = [[]].concat(...Array.from({ length: max }, (_, i) => combinations(player.cards, i + 1)));
    for (const ids of cardSets) {
      const carried = new Set(ids.map(card => card.id));
      const scoring = player.cards.filter(card => !carried.has(card.id));
      const scoreNow = calculateScore(scoring, player.objective, held, state.variant).total;
      const affinity = ids.reduce((sum, card) => sum + Math.max(0, goalAffinity([card], player.objective)), 0);
      const future = ids.reduce((sum, card) => sum + Math.min(card.number, goalAffinity([card], player.objective) * 2), 0);
      const carryPenalty = ids.reduce((sum, card) => sum + (state.variant === "battle" ? card.number : Math.ceil(card.number / 2)), 0);
      const value = scoreNow - affinity * 0.4 + future * 0.32 - carryPenalty * 0.15;
      if (value > best.score) best = { score: value, ids: ids.map(card => card.id) };
    }
    commitBank(state, player, best.ids);
  }

  function visibleState(state, viewerSeat = 0) {
    const copy = clone(state);
    copy.players.forEach(player => {
      if (player.seat !== viewerSeat && state.phase !== "results" && state.phase !== "finished") {
        player.objective = player.objective ? "hidden" : null;
        player.choices = [];
      }
    });
    return copy;
  }

  return {
    COLORS, CHARACTERS, BEHAVIORS, OBJECTIVES, OBJECTIVE_BY_ID,
    shuffle, newDeck, combinations, bestGoal, calculateScore, carriedValue,
    createGame, begin, startRound, chooseGoal, bid, pass, bank, advanceRound,
    frenzyAvailable, frenzyBid, frenzySkip,
    give, applyBotGive, applyBotAuction, applyBotFrenzy, applyBotBank, resolveBanking, visibleState, goalAffinity
  };
});
