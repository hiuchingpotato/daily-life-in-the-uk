(() => {
  "use strict";

  const DAILY_COUNT = 5;
  const DAILY_EPOCH = new Date(2026, 0, 1); // Daily #1
  const KEYS = "ABCD";
  const MOCK_COUNT = 24;
  const MOCK_PASS = 18;
  const MOCK_MINUTES = 45;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const COPY = {
    correct: ["Spot on!", "Brilliant!", "Smashing!", "Jolly good!", "Top marks!", "Cracking!"],
    wrong: ["Oh dear.", "Not quite.", "Blimey, no.", "Close, but no biscuit.", "Oops-a-daisy."],
    timeout: "Time's up! Your tea's gone cold.",
    daily: [
      "Even the pigeons in Trafalgar Square know more. Revise and return!",
      "A start. Put the kettle on and hit the books.",
      "Mustn't grumble… but do revise.",
      "Not bad at all. Quietly respectable.",
      "Jolly good show!",
      "Flawless. Have a biscuit. 🇬🇧",
    ],
    pass: "You're officially good enough to be British. Celebrate with a cup of tea and a mild complaint about the weather.",
    fail: `Not good enough to be British… yet. You needed ${MOCK_PASS}. Put the kettle on and try again.`,
    gaveUp: "Giving up halfway? Very un-British. We'd have kept calm and carried on.",
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    home: $("home"), game: $("game"),
    settings: $("settings"), results: $("results"),
    dailyChip: $("daily-chip"), qCount: $("q-count"),
    roundLabel: $("badge-round-label"), round: $("badge-round"), score: $("badge-score"), scoreLabel: $("badge-score-label"),
    streakCell: $("badge-streak-cell"), streak: $("badge-streak"),
    cat: $("q-cat"), hint: $("q-hint"), text: $("q-text"), options: $("options"),
    timer: $("timer"), timerFill: $("timer-fill"), timerText: $("timer-text"),
    panelBody: $("panel-body"), status: $("panel-status"), submit: $("submit"),
    reveal: $("reveal"), revealTitle: $("reveal-title"), revealExplain: $("reveal-explain"), next: $("next"),
    endInstant: $("end-instant"),
    rTitle: $("results-title"), rVerdict: $("results-verdict"), rScore: $("results-score"), rSub: $("results-sub"),
    rEmoji: $("results-emoji"), rList: $("results-list"), rCountdown: $("results-countdown"),
    rShare: $("results-share"), rAgain: $("results-again"), rHome: $("results-home"), toast: $("toast"),
  };

  // ── Storage (best effort; the game works without it) ─────────────
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  // ── Dates & seeded randomness ────────────────────────────────────
  const todayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const dailyNumber = (d = new Date()) => {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((start - DAILY_EPOCH) / 86400000) + 1;
  };

  const msUntilMidnight = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return midnight - now;
  };

  const formatCountdown = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  };

  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Returns a question with its options in play order and answer indexes remapped.
  function prepare(q, rand) {
    const order = q.type === "t" ? [0, 1] : shuffle(q.options.map((_, i) => i), rand);
    return {
      ...q,
      options: order.map((i) => q.options[i]),
      answer: q.answer.map((a) => order.indexOf(a)).sort(),
    };
  }

  function dailyQuestions(key = todayKey()) {
    const rand = mulberry32(hashString(`life-in-uk:${key}`));
    return shuffle(QUESTIONS, rand).slice(0, DAILY_COUNT).map((q) => prepare(q, rand));
  }

  // ── State ────────────────────────────────────────────────────────
  let game = null;      // { mode, questions, index, score, streak, bestStreak, history, timerSeconds }
  let selected = [];
  let answered = false;
  let timerHandle = null;
  let mockHandle = null;
  let countdownHandle = null;
  let instantDeck = [];
  let timerSetting = Number(store.get("lituk:timer", 0)) || 0;

  function nextInstantQuestion() {
    if (instantDeck.length === 0) {
      const recent = new Set(game ? game.history.slice(-20).map((h) => h.id) : []);
      instantDeck = shuffle(QUESTIONS.filter((q) => !recent.has(q.id)));
    }
    return prepare(instantDeck.pop());
  }

  // ── Screens ──────────────────────────────────────────────────────
  function show(screen) {
    for (const s of [el.home, el.game]) s.classList.toggle("active", s === screen);
    window.scrollTo(0, 0);
  }

  function goHome() {
    stopTimer();
    stopMockClock();
    closeModal(el.results);
    game = null;
    renderHome();
    show(el.home);
  }

  function openModal(m) {
    m.hidden = false;
    const box = m.querySelector(".modal");
    if (box) box.scrollTop = 0;
  }
  function closeModal(m) { m.hidden = true; }

  function renderHome() {
    el.qCount.textContent = QUESTIONS.length;
    const daily = store.get(`lituk:daily:${todayKey()}`, null);
    clearInterval(countdownHandle);
    if (daily && daily.done) {
      const tick = () => {
        if (daily.key !== todayKey()) return renderHome();
        el.dailyChip.textContent = `${daily.score}/${DAILY_COUNT} · next in ${formatCountdown(msUntilMidnight())}`;
      };
      el.dailyChip.classList.add("done");
      tick();
      countdownHandle = setInterval(tick, 1000);
    } else {
      el.dailyChip.classList.remove("done");
      el.dailyChip.textContent = daily ? `In progress · ${daily.history.length}/${DAILY_COUNT}` : `#${dailyNumber()}`;
    }
  }

  // ── Starting games ───────────────────────────────────────────────
  function startInstant() {
    closeModal(el.settings);
    game = { mode: "instant", index: 0, score: 0, streak: 0, bestStreak: 0, history: [], timerSeconds: timerSetting };
    instantDeck = [];
    game.current = nextInstantQuestion();
    show(el.game);
    renderQuestion();
  }

  function startDaily() {
    const key = todayKey();
    const saved = store.get(`lituk:daily:${key}`, null);
    if (saved && saved.done) return showDailyResults(saved);

    const questions = dailyQuestions(key);
    game = {
      mode: "daily", key, questions,
      index: saved ? saved.history.length : 0,
      score: saved ? saved.score : 0,
      streak: 0, bestStreak: 0,
      history: saved ? saved.history : [],
      timerSeconds: 0,
    };
    game.current = questions[game.index];
    show(el.game);
    renderQuestion();
  }

  function startMock() {
    const questions = shuffle(QUESTIONS).slice(0, MOCK_COUNT).map((q) => prepare(q));
    game = {
      mode: "mock", questions, index: 0, score: 0, streak: 0, bestStreak: 0, history: [], timerSeconds: 0,
      deadline: Date.now() + MOCK_MINUTES * 60 * 1000,
    };
    game.current = questions[0];
    show(el.game);
    renderQuestion();
    startMockClock();
  }

  // One clock for the whole mock test, shown in the badge.
  function startMockClock() {
    stopMockClock();
    const tick = () => {
      const left = Math.max(0, game.deadline - Date.now());
      el.score.textContent = formatCountdown(left).slice(3); // mm:ss
      if (left <= 0) finishMock("timeout");
    };
    tick();
    mockHandle = setInterval(tick, 250);
  }

  function stopMockClock() { clearInterval(mockHandle); mockHandle = null; }

  // ── Rendering a question ─────────────────────────────────────────
  function renderQuestion() {
    const q = game.current;
    selected = [];
    answered = false;

    el.scoreLabel.textContent = "Score";
    if (game.mode === "daily") {
      el.roundLabel.textContent = "Round";
      el.round.textContent = `${game.index + 1}/${DAILY_COUNT}`;
      el.streakCell.hidden = true;
      el.endInstant.hidden = true;
    } else if (game.mode === "mock") {
      el.roundLabel.textContent = "Question";
      el.round.textContent = `${game.index + 1}/${MOCK_COUNT}`;
      el.scoreLabel.textContent = "Time left";
      el.streakCell.hidden = true;
      el.endInstant.hidden = false;
      el.endInstant.textContent = "Give up (very un-British)";
    } else {
      el.roundLabel.textContent = "Question";
      el.round.textContent = game.index + 1;
      el.streakCell.hidden = false;
      el.streak.textContent = game.streak;
      el.endInstant.hidden = false;
      el.endInstant.textContent = "End game";
    }
    if (game.mode !== "mock") el.score.textContent = game.score;

    el.cat.textContent = q.cat;
    el.hint.textContent = q.type === "m" ? "Choose TWO answers" : q.type === "t" ? "True or false?" : "";
    el.text.textContent = q.type === "t" ? `Is this statement true or false? “${q.q}”` : q.q;

    el.options.innerHTML = "";
    q.options.forEach((text, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "option";
      b.dataset.index = i;
      b.innerHTML = `<span class="option-key">${KEYS[i]}</span><span class="option-text"></span>`;
      b.querySelector(".option-text").textContent = text;
      b.addEventListener("click", () => toggleOption(i));
      el.options.appendChild(b);
    });

    // Re-trigger the entrance animation.
    const card = el.options.closest(".q-card");
    card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";

    el.reveal.hidden = true;
    el.panelBody.hidden = false;
    updateSubmitState();
    startTimer();
  }

  function needed() { return game.current.type === "m" ? 2 : 1; }

  function toggleOption(i) {
    if (answered) return;
    if (needed() === 1) {
      selected = [i];
    } else if (selected.includes(i)) {
      selected = selected.filter((s) => s !== i);
    } else {
      selected = [...selected, i].slice(-2);
    }
    for (const b of el.options.children) b.classList.toggle("selected", selected.includes(Number(b.dataset.index)));
    updateSubmitState();
  }

  function updateSubmitState() {
    const n = needed();
    el.submit.disabled = selected.length !== n;
    el.status.textContent = selected.length === n
      ? "Ready to submit"
      : n === 2 ? `Select ${2 - selected.length} more answer${selected.length === 1 ? "" : "s"}` : "Select an answer";
  }

  // ── Timer (Instant Play only) ────────────────────────────────────
  function startTimer() {
    stopTimer();
    if (!game.timerSeconds) { el.timer.hidden = true; return; }
    el.timer.hidden = false;
    const total = game.timerSeconds;
    const end = Date.now() + total * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      el.timerText.textContent = `${left}s`;
      el.timerFill.style.width = `${(left / total) * 100}%`;
      if (left <= 0) { stopTimer(); submit(true); }
    };
    el.timerFill.style.transition = "none";
    el.timerFill.style.width = "100%";
    void el.timerFill.offsetWidth;
    el.timerFill.style.transition = "";
    tick();
    timerHandle = setInterval(tick, 250);
  }

  function stopTimer() { clearInterval(timerHandle); timerHandle = null; }

  // ── Submitting ───────────────────────────────────────────────────
  function submit(timedOut = false) {
    if (answered) return;
    if (!timedOut && selected.length !== needed()) return;
    answered = true;
    stopTimer();

    const q = game.current;
    const picked = selected.slice().sort();
    const correct = !timedOut && picked.length === q.answer.length && picked.every((v, i) => v === q.answer[i]);
    const record = { id: q.id, correct, q: q.q, answer: q.answer.map((i) => q.options[i]).join(" & ") };

    // Like the real test, the mock gives no feedback until the end.
    if (game.mode === "mock") {
      if (correct) game.score++;
      game.history.push(record);
      return next();
    }

    for (const b of el.options.children) {
      const i = Number(b.dataset.index);
      b.disabled = true;
      b.classList.remove("selected");
      if (q.answer.includes(i)) b.classList.add("correct");
      else if (picked.includes(i)) b.classList.add("wrong");
      else b.classList.add("dim");
    }

    if (correct) {
      game.score++;
      game.streak++;
      game.bestStreak = Math.max(game.bestStreak, game.streak);
      bump(el.score);
    } else {
      game.streak = 0;
    }
    el.score.textContent = game.score;
    el.streak.textContent = game.streak;

    game.history.push(record);

    el.revealTitle.textContent = correct ? pick(COPY.correct) : timedOut ? COPY.timeout : pick(COPY.wrong);
    el.revealTitle.className = `reveal-title ${correct ? "good" : "bad"}`;
    el.revealExplain.textContent = q.explain;
    const last = game.mode === "daily" && game.index + 1 >= DAILY_COUNT;
    el.next.textContent = last ? "See results" : "Next";
    el.panelBody.hidden = true;
    el.reveal.hidden = false;
    el.next.focus({ preventScroll: true });

    if (game.mode === "daily") saveDaily(false);
  }

  function bump(node) {
    node.classList.remove("bump"); void node.offsetWidth; node.classList.add("bump");
  }

  function next() {
    if (!answered) return;
    game.index++;
    if (game.mode === "mock") {
      if (game.index >= MOCK_COUNT) return finishMock("done");
      game.current = game.questions[game.index];
    } else if (game.mode === "daily") {
      if (game.index >= DAILY_COUNT) {
        const saved = saveDaily(true);
        return showDailyResults(saved);
      }
      game.current = game.questions[game.index];
    } else {
      game.current = nextInstantQuestion();
    }
    renderQuestion();
  }

  function saveDaily(done) {
    const data = { key: game.key, number: dailyNumber(), score: game.score, history: game.history, done };
    store.set(`lituk:daily:${game.key}`, data);
    return data;
  }

  // ── Results ──────────────────────────────────────────────────────
  function renderList(history) {
    el.rList.innerHTML = "";
    for (const h of history) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="dot ${h.correct ? "good" : "bad"}">${h.correct ? "✓" : "✕"}</span><span><span class="qq"></span><span class="ans"></span></span>`;
      li.querySelector(".qq").textContent = h.q;
      li.querySelector(".ans").textContent = `Answer: ${h.answer}`;
      el.rList.appendChild(li);
    }
  }

  function showDailyResults(data) {
    stopTimer();
    clearInterval(countdownHandle);
    el.rTitle.textContent = `Daily #${data.number}`;
    el.rVerdict.hidden = true;
    el.rScore.textContent = `${data.score}/${DAILY_COUNT}`;
    el.rSub.textContent = COPY.daily[data.score];
    el.rEmoji.textContent = data.history.map((h) => (h.correct ? "🟩" : "🟥")).join("");
    renderList(data.history);
    el.rShare.hidden = false;
    el.rAgain.textContent = "Instant Play";
    el.rAgain.onclick = () => { closeModal(el.results); openSettings(); };
    const tick = () => {
      if (data.key !== todayKey()) {
        el.rCountdown.innerHTML = "A new Daily is ready!";
        return;
      }
      el.rCountdown.innerHTML = `Next Daily in <strong>${formatCountdown(msUntilMidnight())}</strong>`;
    };
    tick();
    countdownHandle = setInterval(tick, 1000);
    el.rShare.onclick = () => share(
      `Life in the UK Daily #${data.number} — ${data.score}/${DAILY_COUNT}\n${el.rEmoji.textContent}`
    );
    el.toast.textContent = "";
    openModal(el.results);
  }

  function showInstantResults() {
    stopTimer();
    clearInterval(countdownHandle);
    const total = game.history.length;
    el.rTitle.textContent = "Instant Play";
    el.rVerdict.hidden = true;
    el.rScore.textContent = `${game.score}/${total}`;
    el.rSub.textContent = total
      ? `${Math.round((game.score / total) * 100)}% correct · best streak ${game.bestStreak}`
      : "Not a single question? Bold strategy.";
    el.rEmoji.textContent = "";
    renderList(game.history.filter((h) => !h.correct));
    el.rCountdown.textContent = "";
    el.rShare.hidden = total === 0;
    el.rShare.onclick = () => share(
      `I scored ${game.score}/${total} on Life in the UK Instant Play (best streak ${game.bestStreak})`
    );
    el.rAgain.textContent = "Play again";
    el.rAgain.onclick = () => { closeModal(el.results); startInstant(); };
    el.toast.textContent = "";
    if (el.rList.children.length) {
      const heading = document.createElement("li");
      heading.className = "list-heading";
      heading.textContent = "Questions to review:";
      el.rList.prepend(heading);
    }
    openModal(el.results);
  }

  function finishMock(reason) {
    if (!game || game.mode !== "mock" || game.finished) return;
    game.finished = true;
    stopMockClock();
    stopTimer();
    clearInterval(countdownHandle);

    const unanswered = game.questions.slice(game.history.length).map((q) => ({
      correct: false, q: q.q, answer: `${q.answer.map((i) => q.options[i]).join(" & ")} (not answered)`,
    }));
    const passed = reason !== "gaveUp" && game.score >= MOCK_PASS;
    const mins = Math.max(0, Math.round((MOCK_MINUTES * 60000 - (game.deadline - Date.now())) / 60000));

    el.rTitle.textContent = "Mock Test";
    el.rVerdict.hidden = false;
    el.rVerdict.textContent = passed ? "PASS" : "FAIL";
    el.rVerdict.className = `verdict ${passed ? "pass" : "fail"}`;
    el.rScore.textContent = `${game.score}/${MOCK_COUNT}`;
    el.rSub.textContent = reason === "gaveUp" ? COPY.gaveUp
      : `${reason === "timeout" ? "Time ran out! " : ""}${passed ? COPY.pass : COPY.fail}`;
    el.rEmoji.textContent = "";
    renderList([...game.history.filter((h) => !h.correct), ...unanswered]);
    if (el.rList.children.length) {
      const heading = document.createElement("li");
      heading.className = "list-heading";
      heading.textContent = "Questions to review:";
      el.rList.prepend(heading);
    }
    el.rCountdown.textContent = `Pass mark: ${MOCK_PASS}/${MOCK_COUNT} · Time taken: ${mins} min`;
    el.rShare.hidden = false;
    el.rShare.onclick = () => share(passed
      ? `I passed the Life in the UK mock test with ${game.score}/${MOCK_COUNT}. Officially good enough to be British 🇬🇧☕`
      : `I scored ${game.score}/${MOCK_COUNT} on the Life in the UK mock test. Not British enough… yet 🫖`);
    el.rAgain.textContent = "Try again";
    el.rAgain.onclick = () => { closeModal(el.results); startMock(); };
    el.toast.textContent = "";
    openModal(el.results);
  }

  async function share(text) {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      el.toast.textContent = "Copied to clipboard";
    } catch {
      el.toast.textContent = "Couldn't share — try again";
    }
  }

  // ── Settings modal ───────────────────────────────────────────────
  function openSettings() {
    for (const b of el.settings.querySelectorAll("[data-timer]")) {
      b.setAttribute("aria-checked", String(Number(b.dataset.timer) === timerSetting));
    }
    openModal(el.settings);
    $("start-instant").focus();
  }

  // ── Wiring ───────────────────────────────────────────────────────
  $("card-instant").addEventListener("click", openSettings);
  $("card-daily").addEventListener("click", startDaily);
  $("card-mock").addEventListener("click", startMock);
  $("start-instant").addEventListener("click", startInstant);
  $("game-home").addEventListener("click", goHome);
  el.rHome.addEventListener("click", goHome);
  el.submit.addEventListener("click", () => submit());
  el.next.addEventListener("click", next);
  el.endInstant.addEventListener("click", () => (game.mode === "mock" ? finishMock("gaveUp") : showInstantResults()));

  for (const b of el.settings.querySelectorAll("[data-timer]")) {
    b.addEventListener("click", () => {
      timerSetting = Number(b.dataset.timer);
      store.set("lituk:timer", timerSetting);
      for (const o of el.settings.querySelectorAll("[data-timer]")) o.setAttribute("aria-checked", String(o === b));
    });
  }
  for (const m of [el.settings, el.results]) {
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-close]")) {
        closeModal(m);
        if (m === el.results && game && game.mode !== "instant") goHome();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!el.settings.hidden) closeModal(el.settings);
      else if (!el.results.hidden) goHome();
      return;
    }
    if (!el.game.classList.contains("active") || !el.results.hidden) return;
    const k = e.key.toUpperCase();
    const idx = KEYS.indexOf(k);
    if (idx >= 0 && idx < game.current.options.length && !answered) { toggleOption(idx); return; }
    if (e.key === "Enter") {
      if (answered) next(); else submit();
      e.preventDefault();
    }
  });

  renderHome();
})();
