(function () {
  "use strict";
  const G = window.GoingThrice;
  const app = document.getElementById("app");
  const SAVE_KEY = "going-thrice-remake-v1";
  const PREF_KEY = "going-thrice-remake-preferences-v1";
  const initials = name => String(name || "?").slice(0, 1).toUpperCase();
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const money = n => `${Number(n).toLocaleString()} cr`;
  const byId = id => G.OBJECTIVE_BY_ID[id];
  const color = index => G.COLORS[index];

  let game = null;
  let view = "home";
  let watcher = false;
  let modal = "";
  let selectedCarry = new Set();
  let selectedLot = 0;
  let bidInput = 1;
  let setup = { playerCount: 4, variant: "classic", credits: 20, target: 100, roundLimit: 3, name: "", character: 0 };
  let preferences = { sound: true };
  let botTimer = null;
  let noticeTimer = null;
  let pumping = false;
  let audioContext = null;

  try {
    const savedPreferences = JSON.parse(localStorage.getItem(PREF_KEY) || "null");
    if (savedPreferences) preferences = { ...preferences, ...savedPreferences };
  } catch (error) {
    console.warn("Saved preferences could not be read.", error);
  }

  const savedState = () => {
    try {
      const state = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (state && state.version === 1 && Array.isArray(state.players) && state.phase !== "finished" && !state.watch) {
        return state;
      }
    } catch (error) {
      console.warn("Saved game could not be read.", error);
    }
    return null;
  };

  function persist() {
    if (!game || watcher) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); }
    catch (error) { notify("This browser could not save the game. Your current table will continue until you leave."); console.warn("Game save failed.", error); }
  }

  function notify(message) {
    let node = document.querySelector(".notice");
    if (!node) {
      node = document.createElement("div");
      node.className = "notice";
      node.setAttribute("role", "alert");
      document.body.appendChild(node);
    }
    node.textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => node.remove(), 3400);
  }

  function safeAction(action) {
    try {
      action();
      persist();
      render();
      clickSound();
    } catch (error) {
      notify(error.message || "That move is not available.");
    }
  }

  function clickSound() {
    if (!preferences.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      if (audioContext.state === "suspended") audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.045);
      gain.gain.setValueAtTime(0.026, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.06);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + 0.065);
    } catch (error) { console.warn("The click sound could not play.", error); }
  }

  function createNewGame(asWatcher) {
    watcher = asWatcher;
    game = G.createGame({
      playerCount: setup.playerCount,
      variant: setup.variant,
      credits: Number(setup.credits),
      target: Number(setup.target),
      roundLimit: Number(setup.roundLimit),
      name: setup.name,
      character: Number(setup.character)
    });
    if (watcher) {
      game.watch = true;
      game.players.forEach(player => {
        player.isHuman = false;
        player.name = G.CHARACTERS[player.character];
      });
    }
    selectedCarry = new Set();
    selectedLot = 0;
    G.begin(game);
    view = "game";
    persist();
    render();
  }

  function resetToHome() {
    if (game && !watcher && game.phase !== "finished") persist();
    game = null;
    watcher = false;
    view = "home";
    modal = "";
    render();
  }

  function goalChoiceMarkup(goalId) {
    const goal = byId(goalId);
    return `<button class="goal-choice" data-action="choose-goal" data-goal="${goalId}">
      <strong>${escapeHtml(goal.name)}</strong><span>${escapeHtml(goal.description)}<br>${goal.tiers.map(escapeHtml).join(" · ")}</span>
    </button>`;
  }

  function landingMarkup() {
    const hasSave = !!savedState();
    return `<main class="landing">
      <div class="landing-inner">
        <div class="landing-top">
          <div class="brand"><span class="brand-mark">Ⅲ</span><span>THE AUCTION TABLE</span></div>
          <button class="icon-button" aria-label="Audio settings" data-action="sound">${preferences.sound ? "♫" : "♪̸"}</button>
        </div>
        <div class="landing-grid">
          <section class="hero-copy">
            <div class="eyebrow">A game of nerve &amp; good timing</div>
            <h1>Going<br><em>Thrice.</em></h1>
            <p>Bid boldly. Build cleverly. Then decide which cards are worth keeping close—and which are better left on the table.</p>
            <div class="hero-actions">
              <button class="button primary" data-action="new-game">Take a seat <span aria-hidden="true">→</span></button>
              <button class="button" data-action="watch">Watch the table</button>
              ${hasSave ? `<button class="button quiet" data-action="resume">Resume game</button>` : ""}
            </div>
            <div class="hero-note"><span>✦</span><span>3–6 players</span><span>·</span><span>Three ways to play</span><span>·</span><span>Easy to learn, hard to leave</span></div>
          </section>
          <div class="table-preview" aria-hidden="true">
            <div class="table-orbit"></div>
            <div class="preview-card"><strong>7</strong><i>●</i></div>
            <div class="floating-chip chip-a">20</div><div class="floating-chip chip-b">BID</div>
            <span class="preview-spark spark-a">✳</span><span class="preview-spark spark-b">✦</span>
          </div>
        </div>
        <footer class="landing-foot"><span>First to the bid · last to blink</span><span>Local play · saves on this device</span></footer>
      </div>
    </main>${modal ? modalMarkup() : ""}`;
  }

  function setupMarkup() {
    const capacity = Math.floor(60 / (3 * Number(setup.playerCount)));
    return `<main class="landing">
      <section class="setup-card">
        <header class="setup-head"><div><div class="eyebrow">${watcher ? "The spectator's seat" : "Pull up a chair"}</div><h1>${watcher ? "Watch the table" : "Set the table."}</h1></div>
          <button class="button quiet small" data-action="home">← Back</button>
        </header>
        <div class="setup-grid">
          ${watcher ? "" : `<div class="field"><label for="player-name">Your name</label><input id="player-name" data-setup="name" maxlength="24" placeholder="A name for the scorecard" value="${escapeHtml(setup.name)}"></div>`}
          <div class="field"><label for="player-character">${watcher ? "Seat 1 character" : "Your character"}</label><select id="player-character" data-setup="character">${G.CHARACTERS.map((name, index) => `<option value="${index}" ${Number(setup.character) === index ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select><span class="hint">A cosmetic choice. It never changes the rules.</span></div>
          <div class="field"><label for="player-count">Seats at the table</label><select id="player-count" data-setup="playerCount">${[3,4,5,6].map(count => `<option value="${count}" ${Number(setup.playerCount) === count ? "selected" : ""}>${count} players</option>`).join("")}</select></div>
          <div class="field" style="grid-column:1/-1"><label>Choose your game</label><div class="variant-options">
            ${[
              ["classic","Classic","The highest score takes the table."],
              ["battle","Battle","Win the auction. Gift the card. Lowest score wins."],
              ["frenzy","Frenzy","Bid across every lot at once. Watch your reserves."]
            ].map(([id,name,description]) => `<button class="variant-option ${setup.variant === id ? "active" : ""}" data-action="variant" data-variant="${id}"><strong>${name}</strong><small>${description}</small></button>`).join("")}
          </div></div>
          <div class="field"><label for="credits">Starting credits</label><input id="credits" data-setup="credits" type="number" min="1" max="1000" value="${escapeHtml(setup.credits)}"><span class="hint">Refreshed at the start of each round.</span></div>
          <div class="field"><label for="target-score">Score target</label><input id="target-score" data-setup="target" type="number" min="1" max="10000" value="${escapeHtml(setup.target)}"><span class="hint">The table ends when anyone reaches it.</span></div>
          <div class="field"><label for="round-count">Maximum rounds</label><select id="round-count" data-setup="roundLimit">${Array.from({ length: capacity }, (_, i) => i + 1).map(count => `<option value="${count}" ${Number(setup.roundLimit) === count ? "selected" : ""}>${count} ${count === 1 ? "round" : "rounds"}</option>`).join("")}</select><span class="hint">A 60-card deck means up to ${capacity} rounds with ${setup.playerCount} seats.</span></div>
          <div class="field"><label>At a glance</label><div class="setup-sample"><strong>${setup.playerCount * 3} cards</strong> go up for auction each round.<br>Everyone starts with <strong>${escapeHtml(setup.credits)} credits.</strong></div></div>
        </div>
        <div class="setup-foot"><div class="form-error" id="setup-error"></div><button class="button primary" data-action="start">${watcher ? "Start watching" : "Deal the first hand"} <span aria-hidden="true">→</span></button></div>
      </section>
    </main>`;
  }

  function getHuman() { return game?.players.find(player => player.isHuman) || null; }
  function goalName(goalId) { return byId(goalId)?.name || "Secret objective"; }
  function currentLot() { return game?.market[game.lotIndex] || null; }

  function cardMarkup(card, extraClass = "") {
    const suit = color(card.color);
    return `<div class="auction-card ${extraClass}" style="--card-color:${suit.color}">
      <div class="card-top"><span>GT</span><span class="card-suit" style="color:${suit.color}">${suit.symbol}</span></div>
      <strong class="card-number">${card.number}</strong>
      <div class="card-bottom"><span>${suit.short}</span><span>LOT ${String((card.lot ?? 0) + 1).padStart(2,"0")}</span></div>
    </div>`;
  }

  function activeLabel() {
    if (game.phase === "choose") return "Choose your objective";
    if (game.phase === "auction" || game.phase === "frenzy") return game.players[game.active]?.isHuman ? "Your move" : `${game.players[game.active]?.name || "The table"} is thinking`;
    if (game.phase === "bank") return game.players.some(player => player.isHuman && !player.roundScore) ? "Choose your carry" : "The table is banking";
    if (game.phase === "results") return "Round complete";
    if (game.phase === "finished") return "Final standings";
    return "The table";
  }

  function marketMarkup() {
    return `<div class="market-strip" aria-label="Round market">
      ${game.market.map((lot, index) => {
        const ownerSeat = lot.recipient === undefined ? lot.winner : lot.recipient;
        const owner = ownerSeat === undefined ? null : game.players[ownerSeat];
        const current = game.phase === "auction" || game.phase === "give"
          ? index === (game.phase === "give" ? game.pendingGift.lotIndex : game.lotIndex)
          : game.phase === "frenzy" && index === selectedLot;
        return `<button class="market-item ${current ? "current" : ""} ${lot.status === "sold" ? "sold" : ""} ${lot.status === "passed" ? "passed" : ""}" data-action="select-lot" data-lot="${index}" ${game.phase === "frenzy" ? "" : "disabled"}>
          ${lot.price ? `<span class="market-price">${lot.price} cr</span>` : ""}
          <span class="market-symbol" style="color:${color(lot.color).color}">${color(lot.color).symbol}</span>
          <span class="market-num">${lot.number}</span><span class="market-meta">${color(lot.color).short} · ${String(index + 1).padStart(2,"0")}</span>
          ${owner ? `<span class="market-winner">${escapeHtml(owner.name)}</span>` : ""}
        </button>`;
      }).join("")}
    </div>`;
  }

  function seatMarkup(player) {
    const isActive = game.active === player.seat && ["auction", "frenzy", "give"].includes(game.phase);
    const isWinner = game.phase === "finished" && game.winner.includes(player.seat);
    const goalVisible = watcher || ["results", "finished"].includes(game.phase) || player.isHuman;
    const goal = player.objective && player.objective !== "hidden" ? goalName(player.objective) : null;
    const collection = player.cards || [];
    const hue = (player.character * 47 + 15) % 360;
    return `<article class="seat-card ${isActive ? "active-seat" : ""} ${isWinner ? "winner-seat" : ""}">
      <div class="seat-head"><span class="avatar" style="--avatar-hue:${hue}">${initials(player.name)}</span><div class="seat-name-wrap"><span class="seat-name">${escapeHtml(player.name)}</span><span class="seat-role">${player.isHuman ? "YOU" : escapeHtml(player.behavior)}</span></div></div>
      <div class="seat-scoreline"><strong>${player.total}</strong><span>${player.credits} cr</span></div>
      <div class="seat-collection" aria-label="${collection.length} collected cards">${collection.map(card => {
        const held = player.heldIds.includes(card.id);
        return `<span class="mini-card ${held ? "mini-held" : ""}" title="${held ? "Carried card · " : ""}${card.number} ${color(card.color).name}" style="--card-color:${color(card.color).color}">${card.number}</span>`;
      }).join("") || `<span class="hint">No cards yet</span>`}</div>
      ${goalVisible && goal ? `<div class="seat-objective">${escapeHtml(goal)}</div>` : goalVisible && player.isHuman && game.phase === "choose" ? `<div class="seat-objective">Choose your secret goal</div>` : ""}
    </article>`;
  }

  function objectivePanelMarkup() {
    const human = getHuman();
    if (!human) return `<div class="objective-hidden"><span class="secret-icon">Ⅲ</span><div><strong>All goals are in play</strong><small>Every objective is visible from the rail.</small></div></div>`;
    if (game.phase === "choose") return `<div class="objective-panel"><div class="eyebrow">Choose one · keep it secret</div><h2>Your objective</h2><p>The whole market is on the table. Pick the goal that gives your collection a direction.</p></div>`;
    if (!human.objective) return `<div class="objective-hidden"><span class="secret-icon">Ⅲ</span><div><strong>Your objective is set</strong><small>Keep collecting toward your bonus.</small></div></div>`;
    const goal = byId(human.objective);
    return `<div class="objective-panel"><div class="eyebrow">Your private objective</div><h2>${escapeHtml(goal.name)}</h2><p>${escapeHtml(goal.description)}</p><div class="objective-tiers">${goal.tiers.map(tier => `<span class="objective-tier">${escapeHtml(tier)}</span>`).join("")}</div></div>`;
  }

  function myHandMarkup() {
    const human = getHuman();
    const cards = human?.cards || [];
    const canSelect = !watcher && game.phase === "bank" && human && !human.roundScore;
    const canCarry = game.round < game.roundLimit;
    return `<div class="human-top"><strong>${watcher ? "Table collections" : "Your collection"}</strong><span>${cards.length} ${cards.length === 1 ? "card" : "cards"} · ${human ? money(human.credits) : ""}</span></div>
      <div class="hand-row">${cards.length ? cards.map(card => {
        const selected = selectedCarry.has(card.id);
        const held = human?.heldIds.includes(card.id);
        return `<button class="hand-card ${held ? "held" : ""} ${selected ? "carry-selected" : ""}" data-action="toggle-carry" data-card="${card.id}" ${canSelect && canCarry ? "" : "disabled"} title="${held ? "Carried from last round · " : ""}${card.number} ${color(card.color).name}${canSelect ? " · select to carry" : ""}" style="--card-color:${color(card.color).color}"><small>${color(card.color).symbol}</small>${card.number}</button>`;
      }).join("") : `<span class="hand-card empty-hand">Win cards at auction to build your collection</span>`}</div>`;
  }

  function actionMarkup() {
    const human = getHuman();
    const isHumanTurn = human && game.active === human.seat;
    if (!human && game.phase === "frenzy") return `<div class="action-note">Spectating · ${game.players[game.active]?.name} has the next move.</div>`;
    if (game.phase === "give") {
      if (!game.players[game.active]?.isHuman) return `<div class="action-note">The Battle winner is choosing who receives the card.</div>`;
      return `<div class="human-top"><strong>Choose who gets the card</strong><span>You paid ${game.market[game.pendingGift.lotIndex].price} credits to win it.</span></div>
        <div class="action-row"><div class="action-left"><span class="action-note">In Battle, a won card must go to another player.</span></div><div class="action-right">${game.players.filter(player => player.seat !== game.active).map(player => `<button class="button" data-action="give" data-recipient="${player.seat}">Give to ${escapeHtml(player.name)}</button>`).join("")}</div></div>`;
    }
    if (game.phase === "choose" && human) {
      return `<div class="human-top"><strong>Pick the goal that fits your plan.</strong><span>Only you will see your choice.</span></div><div class="choose-grid">${human.choices.map(goalChoiceMarkup).join("")}</div>`;
    }
    if (game.phase === "auction" && isHumanTurn) {
      const lot = currentLot();
      const min = game.highBid + 1;
      return `<div class="human-top"><strong>Your bid</strong><span>${game.leader === null ? "Opening bid · minimum 1 credit" : `Current lead: ${escapeHtml(game.players[game.leader].name)} at ${game.highBid}`}</span></div>
        <div class="action-row"><div class="action-left"><div class="bid-input-wrap"><button data-action="bid-minus" aria-label="Decrease bid">−</button><input id="bid-amount" type="number" min="${min}" max="${human.credits}" step="1" value="${Math.max(min, Math.min(Number(bidInput) || min, human.credits))}" aria-label="Bid amount"><button data-action="bid-plus" aria-label="Increase bid">+</button></div><button class="button primary" data-action="bid" ${human.credits < min ? "disabled" : ""}>Place bid</button><button class="button" data-action="pass">Pass on lot</button></div><div class="action-right"><span class="action-note">${lot ? `${lot.number} ${color(lot.color).name} · ${human.credits} credits available` : ""}</span></div></div>`;
    }
    if (game.phase === "frenzy" && isHumanTurn) {
      const current = game.frenzyBids[selectedLot];
      const available = G.frenzyAvailable(game, human.seat, selectedLot);
      const min = (current?.amount || 0) + 1;
      return `<div class="human-top"><strong>Your frenzy turn</strong><span>${Math.max(0, game.players.length * 2 - Math.floor(game.frenzyTurns / game.players.length) - (game.active > game.frenzyTurns % game.players.length ? 1 : 0))} turns left · ${available} unreserved credits</span></div>
        <div class="action-row"><div class="action-left"><div class="bid-input-wrap"><button data-action="bid-minus" aria-label="Decrease bid">−</button><input id="bid-amount" type="number" min="${min}" max="${available}" step="1" value="${Math.max(min, Math.min(Number(bidInput) || min, Math.max(min, available)))}" aria-label="Bid amount"><button data-action="bid-plus" aria-label="Increase bid">+</button></div><button class="button primary" data-action="frenzy-bid" ${available < min ? "disabled" : ""}>Bid on selected lot</button><button class="button" data-action="frenzy-skip">Skip turn</button></div><div class="action-right"><span class="action-note">${current ? `Leading bid: ${current.amount} · ${game.players[current.seat].name}` : "No bid on this lot yet"}</span></div></div>`;
    }
    if (game.phase === "bank" && human && !human.roundScore) {
      const remaining = Math.max(0, 2 - selectedCarry.size);
      const lastRound = game.round >= game.roundLimit;
      return `<div class="human-top"><strong>${lastRound ? "Final bank" : "Carry up to two cards"}</strong><span class="carry-count">${lastRound ? "Everything scores now" : `${selectedCarry.size} selected · ${remaining} remaining`}</span></div>
        <div class="action-row"><div class="action-left"><span class="action-note">${lastRound ? "No cards can be carried from the final round." : "Tap a card above to carry it. Carried cards score less if they return unused."}</span></div><div class="action-right"><button class="button primary" data-action="bank">Bank collection <span aria-hidden="true">→</span></button></div></div>`;
    }
    if (game.phase === "results") {
      return `<div class="human-top"><strong>Round ${game.round} is in the books.</strong><span>Credits refresh for the next round.</span></div><div class="action-row"><span class="action-note">Carry choices are locked in. The next market stays a surprise.</span><button class="button primary" data-action="continue">Next round →</button></div>`;
    }
    if (game.phase === "finished") {
      return `<div class="human-top"><strong>The final bell.</strong><span>${game.endReason === "target" ? "The score target stopped the game." : "The last round is complete."}</span></div><div class="action-row"><span class="action-note">${game.variant === "battle" ? "Battle winner: lowest total." : "Winner: highest total."}</span><div class="action-right"><button class="button" data-action="home">Main menu</button><button class="button primary" data-action="rematch">Play again</button></div></div>`;
    }
    if (game.phase === "bank" && human?.roundScore) return `<div class="action-note">Your bank is locked. The table is finishing the round.</div>`;
    return `<div class="action-note">${game.phase === "auction" ? "The other players are bidding. Keep an eye on the queue." : "The table is moving."}</div>`;
  }

  function eventLogMarkup() {
    const events = game.history.slice(-7).reverse();
    return `<div class="side-panel log-panel"><div class="panel-heading"><h2>At the table</h2><span>ROUND ${String(game.round).padStart(2,"0")}</span></div><div class="log-list">${events.map(event => `<div class="log-item" data-type="${event.type}"><span class="log-dot"></span><span>${escapeHtml(event.text)}</span></div>`).join("") || `<div class="hint" style="padding:10px 0">The first bids are yet to come.</div>`}</div></div>`;
  }

  function currentTableMarkup() {
    if (game.phase === "results") return roundResultMarkup();
    if (game.phase === "finished") return finalResultMarkup();
    if (game.phase === "give") {
      const pending = game.pendingGift;
      return `<div class="table-topline"><span class="tag">Battle · card transfer</span><span class="queue-count">Winner chooses the recipient</span></div><div class="auction-center">
        <div class="turn-copy"><span class="small-copy">The winner paid for control.</span><strong>${escapeHtml(game.players[pending.fromSeat].name)}</strong><span class="small-copy">Now give it away.</span></div>
        <div class="auction-card-wrap">${cardMarkup(pending.card)}<div class="bid-pill">${game.market[pending.lotIndex].price} credits</div></div>
        <div class="turn-copy left"><span class="small-copy">No self-gifting</span><strong>Choose another seat</strong><span class="small-copy">Card points go to its recipient.</span></div>
      </div><div class="auction-footer"><span>Recipient keeps the card in their collection</span></div>`;
    }
    if (game.phase === "choose") return `<div class="table-topline"><span class="tag">Round ${game.round} · objective selection</span><span class="queue-count">${game.market.length} cards in the market</span></div><div class="auction-center"><div class="turn-copy"><span class="small-copy">The full market is visible.</span><strong>Pick your plan.</strong></div><div class="auction-card empty-card"><strong>?</strong><span>SECRET GOAL</span></div><div class="turn-copy left"><span class="small-copy">Your rivals have their own aims.</span><strong>Watch their bids.</strong></div></div><div class="auction-footer"><span>Choose carefully</span><span>·</span><span>Goals stay private until scoring</span></div>`;
    if (game.phase === "bank") return `<div class="table-topline"><span class="tag">Round ${game.round} · collection bank</span><span class="queue-count">Auction complete</span></div><div class="auction-center"><div class="turn-copy"><span class="small-copy">Keep up to two cards for next time.</span><strong>Carry or cash in?</strong></div><div class="auction-card empty-card"><strong>Ⅱ</strong><span>THE BANK</span></div><div class="turn-copy left"><span class="small-copy">Everything else scores now.</span><strong>Make it count.</strong></div></div><div class="auction-footer"><span>Carry cards do not score this round</span></div>`;
    const frenzy = game.phase === "frenzy";
    const lot = frenzy ? game.market[selectedLot] : currentLot();
    const actor = game.players[game.active];
    const leader = frenzy ? game.frenzyBids[selectedLot] : game.leader === null ? null : { seat: game.leader, amount: game.highBid };
    const bidNow = leader ? leader.amount : 0;
    return `<div class="table-topline"><span class="tag">${frenzy ? "All lots open · Frenzy" : `Lot ${Math.min(game.lotIndex + 1, game.market.length)} of ${game.market.length}`}</span><span class="queue-count">${frenzy ? `${game.frenzyTurns} / ${game.players.length * game.players.length * 2} turns` : `${game.market.length - game.lotIndex - 1} lots after this`}</span></div>
      <div class="auction-center">
        <div class="turn-copy"><span class="small-copy">${leader ? "Current leader" : "No opening bid"}</span><strong>${leader ? escapeHtml(game.players[leader.seat].name) : "The table is open"}</strong><span class="small-copy">${leader ? `${leader.amount} credits on the felt` : "Opening at one credit"}</span></div>
        <div class="auction-card-wrap">${lot ? cardMarkup(lot) : `<div class="auction-card empty-card"><strong>✓</strong><span>ALL SOLD</span></div>`}${lot && bidNow ? `<div class="bid-pill">${bidNow} credits</div>` : ""}</div>
        <div class="turn-copy left"><span class="small-copy">${frenzy ? "Turn belongs to" : "On the clock"}</span><strong>${escapeHtml(actor?.name || "The table")}</strong><span class="small-copy">${actor?.isHuman ? "Your move" : "Considering the lot"}</span></div>
      </div>
      <div class="auction-footer"><span>Card value <strong>${lot?.number || "—"}</strong></span><span>·</span><span>Best bid <strong>${bidNow || "—"}</strong></span><span>·</span><span>${frenzy ? "Cash is reserved until settlement" : "Only the winner pays"}</span></div>`;
  }

  function scoreDetail(player) {
    const score = player.roundScore;
    if (!score) return "";
    const parts = [`${score.printed} printed`];
    if (score.penalty) parts.push(`${score.penalty} carry penalty`);
    if (score.bonus) parts.push(`+${score.bonus} ${goalName(score.goal)}`);
    return parts.join(" · ");
  }

  function roundResultMarkup() {
    const ordered = game.players.slice().sort((a, b) => game.variant === "battle" ? a.total - b.total : b.total - a.total);
    return `<div class="table-topline"><span class="tag">Round ${game.round} · the scores are in</span><span class="queue-count">${game.variant === "battle" ? "Low score leads" : "High score leads"}</span></div>
      <div style="position:relative;z-index:1;overflow:auto;max-height:286px;padding:8px clamp(17px,5vw,55px) 18px">
        <h2 class="serif" style="font-size:27px;margin:6px 0 10px">A little tallying.</h2>
        ${ordered.map((player,index) => `<div class="result-row"><span class="rank">0${index+1}</span><span class="result-name">${escapeHtml(player.name)}<small>${escapeHtml(scoreDetail(player))}</small></span><span class="result-points">${player.roundScore?.total ?? 0}</span><span class="result-total">${player.total} total</span></div>`).join("")}
      </div>`;
  }

  function finalResultMarkup() {
    const ordered = game.players.slice().sort((a, b) => game.variant === "battle" ? a.total - b.total : b.total - a.total);
    const winnerNames = game.winner.map(seat => game.players[seat].name).join(" & ");
    return `<div class="table-topline"><span class="tag">The final hand</span><span class="queue-count">${game.endReason === "target" ? "Target reached" : "Rounds complete"}</span></div>
      <div style="position:relative;z-index:1;overflow:auto;max-height:286px;padding:8px clamp(17px,5vw,55px) 18px">
        <div class="eyebrow">That was a fine game</div><h2 class="serif" style="font-size:33px;margin:6px 0 12px">The last word.</h2>
        <div class="winner-banner"><strong>${escapeHtml(winnerNames)} ${game.winner.length > 1 ? "share" : "wins"} the table.</strong><span>${game.variant === "battle" ? "The lowest total takes it." : "Highest total takes it."}</span></div>
        ${ordered.map((player,index) => `<div class="result-row"><span class="rank">0${index+1}</span><span class="result-name">${escapeHtml(player.name)}<small>${player.isHuman ? "Your final score" : escapeHtml(player.behavior)}</small></span><span class="result-points">${player.total}</span><span class="result-total">${game.winner.includes(player.seat) ? "WINNER" : "FINAL"}</span></div>`).join("")}
      </div>`;
  }

  function modalMarkup() {
    if (modal !== "help") return "";
    return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <button class="icon-button modal-close" data-action="close-modal" aria-label="Close help">×</button><div class="eyebrow">A quick seat-side guide</div><h2 id="help-title">How to play.</h2>
      <p>Every round, everyone gets a fresh purse and a secret objective. Cards appear one at a time; bid only what you can afford, and pass when the price is wrong.</p>
      <div class="help-grid">
        <div class="help-tile"><strong>01 · Choose a goal</strong><span>Pick one of two private objectives. Your market is public; your scoring plan is not.</span></div>
        <div class="help-tile"><strong>02 · Win the lot</strong><span>Bid above the table or pass. Only the winning player pays, and there is no three-card limit.</span></div>
        <div class="help-tile"><strong>03 · Bank your haul</strong><span>At round end, score everything or carry up to two cards. An unused carried card comes back diminished.</span></div>
        <div class="help-tile"><strong>04 · Take the table</strong><span>Classic and Frenzy reward high scores. In Battle, gift each won card and aim for the lowest score.</span></div>
      </div><p>Colors also carry a symbol, so the deck stays readable without relying on color alone. Your table is saved on this device.</p>
      <button class="button primary" data-action="close-modal">Got it</button>
    </section></div>`;
  }

  function gameMarkup() {
    const human = getHuman();
    const seat = human || game.players[0];
    const leading = game.variant === "battle" ? "BATTLE" : game.variant === "frenzy" ? "FRENZY" : "CLASSIC";
    const currentObjective = human?.objective;
    return `<div class="game-shell">
      <header class="game-header"><div class="game-brand"><span class="brand-mark">Ⅲ</span><span class="game-brand-name">GOING THRICE</span><span class="pill"><span class="pill-dot"></span>${leading}</span></div>
        <div class="game-header-right"><button class="button quiet small" data-action="help">How to play</button><button class="icon-button" aria-label="Toggle sound" data-action="sound">${preferences.sound ? "♫" : "♪̸"}</button><div class="round-indicator"><span class="eyebrow">Round</span><strong>${game.round} / ${game.roundLimit}</strong></div></div>
      </header>
      <main class="game-main">
        <section class="table-column">
          <div class="table-surface">${currentTableMarkup()}</div>
          ${marketMarkup()}
          <div class="player-row">${game.players.map(seatMarkup).join("")}</div>
          <section class="human-panel">
            ${myHandMarkup()}<div class="action-row-wrap">${actionMarkup()}</div>
          </section>
        </section>
        <aside class="side-column">
          <div class="side-panel">${objectivePanelMarkup()}</div>
          <div class="side-panel finance-panel">
            <div class="finance-stat"><span class="stat-label">${watcher ? "Seat 1 score" : "Your score"}</span><strong>${seat.total}</strong></div>
            <div class="finance-stat"><span class="stat-label">${watcher ? "Seat 1 purse" : "Your purse"}</span><strong class="money">${seat.credits}</strong></div>
          </div>
          ${eventLogMarkup()}
          <div class="side-actions"><button class="button small" data-action="home">Save &amp; leave</button><button class="button small" data-action="help">Rules</button></div>
        </aside>
      </main>${watcher ? `<div class="online-note">Spectator table · CPU decisions are shown as they happen</div>` : ""}${modal ? modalMarkup() : ""}
    </div>`;
  }

  function render() {
    if (view === "home") app.innerHTML = landingMarkup();
    else if (view === "setup") app.innerHTML = setupMarkup();
    else if (game) app.innerHTML = gameMarkup();
    else app.innerHTML = landingMarkup();
    scheduleBots();
  }

  function scheduleBots() {
    if (!game || pumping || botTimer) return;
    if (game.phase === "auction" && !game.players[game.active]?.isHuman) {
      botTimer = setTimeout(() => {
        botTimer = null;
        try { G.applyBotAuction(game); persist(); render(); }
        catch (error) { notify(error.message); console.error("Bot auction action failed.", error); }
      }, watcher ? 450 : 520);
      return;
    }
    if (game.phase === "give" && !game.players[game.active]?.isHuman) {
      botTimer = setTimeout(() => {
        botTimer = null;
        try { G.applyBotGive(game); persist(); render(); }
        catch (error) { notify(error.message); console.error("Bot recipient choice failed.", error); }
      }, watcher ? 450 : 520);
      return;
    }
    if (game.phase === "frenzy" && !game.players[game.active]?.isHuman) {
      botTimer = setTimeout(() => {
        botTimer = null;
        try { G.applyBotFrenzy(game); persist(); render(); }
        catch (error) { notify(error.message); console.error("Bot frenzy action failed.", error); }
      }, watcher ? 360 : 460);
      return;
    }
    if (game.phase === "bank") {
      pumping = true;
      try {
        game.players.filter(player => !player.isHuman && !player.roundScore).forEach(player => G.applyBotBank(game, player));
        G.resolveBanking(game);
      } catch (error) { notify(error.message); console.error("Bot bank action failed.", error); }
      finally { pumping = false; }
      persist();
      if (watcher && game.phase === "results") {
        render();
        botTimer = setTimeout(() => {
          botTimer = null;
          if (game?.phase === "results") { G.advanceRound(game); persist(); render(); }
        }, 1900);
      } else render();
      return;
    }
  }

  function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "close-modal") {
      if (event.target === button || button.classList.contains("modal-close") || button.tagName === "BUTTON") { modal = ""; render(); }
      return;
    }
    if (action === "sound") {
      preferences.sound = !preferences.sound;
      try { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); } catch (error) { console.warn("Sound preference could not be saved.", error); }
      render(); clickSound(); return;
    }
    if (action === "help") { modal = "help"; render(); return; }
    if (action === "new-game") { watcher = false; view = "setup"; render(); return; }
    if (action === "watch") { watcher = true; view = "setup"; render(); return; }
    if (action === "home") { resetToHome(); return; }
    if (action === "resume") {
      const saved = savedState();
      if (!saved) { notify("There is no saved game to resume."); render(); return; }
      game = saved; watcher = false; view = "game"; selectedCarry = new Set(); render(); return;
    }
    if (action === "variant") { setup.variant = button.dataset.variant; render(); return; }
    if (action === "start") {
      setup.name = document.querySelector("#player-name")?.value || "";
      setup.character = Number(document.querySelector("#player-character")?.value ?? setup.character);
      setup.playerCount = Number(document.querySelector("#player-count")?.value || setup.playerCount);
      setup.credits = Number(document.querySelector("#credits")?.value);
      setup.target = Number(document.querySelector("#target-score")?.value);
      setup.roundLimit = Number(document.querySelector("#round-count")?.value || setup.roundLimit);
      const error = document.querySelector("#setup-error");
      if (!Number.isInteger(setup.credits) || setup.credits < 1 || setup.credits > 1000 || !Number.isInteger(setup.target) || setup.target < 1 || setup.target > 10000) {
        if (error) error.textContent = "Credits must be 1–1,000 and target must be 1–10,000.";
        return;
      }
      createNewGame(watcher); return;
    }
    if (!game) return;
    if (action === "choose-goal") {
      safeAction(() => G.chooseGoal(game, 0, button.dataset.goal)); return;
    }
    if (action === "select-lot") {
      if (game.phase === "frenzy") {
        selectedLot = Number(button.dataset.lot);
        const current = game.frenzyBids[selectedLot];
        bidInput = (current?.amount || 0) + 1;
        render();
      }
      return;
    }
    if (action === "bid-minus" || action === "bid-plus") {
      const input = document.querySelector("#bid-amount");
      const min = Number(input?.min || 1);
      const max = Number(input?.max || 1000);
      bidInput = Math.max(min, Math.min(max, Number(input?.value || bidInput) + (action === "bid-plus" ? 1 : -1)));
      render(); return;
    }
    if (action === "bid") {
      const amount = Number(document.querySelector("#bid-amount")?.value || bidInput);
      safeAction(() => G.bid(game, 0, amount)); return;
    }
    if (action === "pass") { safeAction(() => G.pass(game, 0)); return; }
    if (action === "frenzy-bid") {
      const amount = Number(document.querySelector("#bid-amount")?.value || bidInput);
      safeAction(() => G.frenzyBid(game, 0, selectedLot, amount)); return;
    }
    if (action === "frenzy-skip") { safeAction(() => G.frenzySkip(game, 0)); return; }
    if (action === "give") { safeAction(() => G.give(game, 0, Number(button.dataset.recipient))); return; }
    if (action === "toggle-carry") {
      if (game.phase !== "bank") return;
      const id = button.dataset.card;
      if (selectedCarry.has(id)) selectedCarry.delete(id);
      else if (selectedCarry.size < 2) selectedCarry.add(id);
      else { notify("You can carry up to two cards."); return; }
      render(); return;
    }
    if (action === "bank") {
      const ids = [...selectedCarry];
      selectedCarry = new Set();
      safeAction(() => G.bank(game, 0, ids));
      return;
    }
    if (action === "continue") {
      selectedCarry = new Set(); selectedLot = 0; bidInput = 1;
      safeAction(() => G.advanceRound(game));
      return;
    }
    if (action === "rematch") {
      if (game) { setup.playerCount = game.players.length; setup.variant = game.variant; setup.credits = game.startingCredits; setup.target = game.target; setup.roundLimit = game.roundLimit; setup.character = game.players[0].character; }
      view = "setup"; game = null; watcher = false; render(); return;
    }
  }

  app.addEventListener("click", handleClick);
  app.addEventListener("input", event => {
    if (event.target.id === "bid-amount") bidInput = Number(event.target.value);
    if (event.target.dataset.setup) setup[event.target.dataset.setup] = event.target.value;
  });
  app.addEventListener("change", event => {
    const field = event.target.dataset.setup;
    if (field) {
      setup[field] = field === "name" ? event.target.value : Number(event.target.value);
      if (field === "playerCount") {
        const maxRounds = Math.floor(60 / (3 * setup.playerCount));
        setup.roundLimit = Math.min(setup.roundLimit, maxRounds);
        render();
      }
    }
  });

  render();
})();
