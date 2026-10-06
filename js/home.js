(function () {
  var stage = document.getElementById("pick");
  var catalog = document.getElementById("catalog");
  var sheet = document.getElementById("quick-view");
  var FILTERS_KEY = "seans.catalog";
  var MIN_POOL = 4;
  var state = null;
  var keyHandler = null;
  var busy = false;

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function idOf(movie) {
    return movie.identification.kinopoisk_id;
  }

  function titleOf(movie) {
    return (movie && movie.identification && movie.identification.title_ru) || "Фильм";
  }

  var yearAndRuntime = Seans.yearAndRuntime;
  var kpValue = Seans.kpValue;
  var filmHref = Seans.filmHref;

  function countPairs(amount) {
    var mod10 = amount % 10;
    var mod100 = amount % 100;
    var word = "пар";
    if (mod10 === 1 && mod100 !== 11) word = "пара";
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "пары";
    return amount + " " + word;
  }

  function buildPool(prefs, randomize) {
    var all = Seans.movies();
    var inTime = all.filter(function (movie) { return Seans.fitsTime(movie, prefs.time); });
    var matched = inTime.filter(function (movie) { return Seans.fitsMood(movie, prefs.mood); });
    var order = matched.slice();
    var extra = inTime.filter(function (movie) { return matched.indexOf(movie) === -1; });
    if (randomize) {
      shuffle(order);
      shuffle(extra);
    }
    order = order.concat(extra.slice(0, Math.max(0, MIN_POOL - order.length)));
    if (order.length < 2) {
      var spare = all.filter(function (movie) { return order.indexOf(movie) === -1; });
      spare.sort(function (a, b) { return Seans.runtime(a) - Seans.runtime(b); });
      order = order.concat(spare.slice(0, 2 - order.length));
    }
    return {
      order: order.map(idOf),
      matched: matched.map(idOf),
      exact: order.filter(function (movie) { return matched.indexOf(movie) !== -1; }).length
    };
  }

  function createState(prefs) {
    var pool = buildPool(prefs, true);
    state = {
      version: 2,
      prefs: prefs,
      order: pool.order,
      matched: pool.matched,
      champion: pool.order[0],
      queue: pool.order.slice(1),
      round: 1,
      total: pool.order.length - 1,
      history: [],
      phase: "duel",
      winner: null,
      runnerUp: null
    };
    Seans.saveDeck(state);
  }

  function validState(saved) {
    if (!saved || saved.version !== 2 || !Array.isArray(saved.order) || saved.order.length < 2) return false;
    if (!saved.prefs || typeof saved.prefs.time !== "string" || typeof saved.prefs.mood !== "string") return false;
    if (!Array.isArray(saved.queue) || !Array.isArray(saved.history) || !Array.isArray(saved.matched)) return false;
    var known = saved.order.every(function (id) { return Boolean(Seans.movieById(id)); });
    if (!known) return false;
    if (saved.phase === "result") return Boolean(Seans.movieById(saved.winner));
    return saved.phase === "duel" && Boolean(Seans.movieById(saved.champion)) && saved.queue.length > 0 &&
      saved.queue.every(function (id) { return Boolean(Seans.movieById(id)); });
  }

  function focusHeading() {
    var heading = stage.querySelector("h1");
    if (!heading) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    var top = stage.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) {
      stage.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    }
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function restart() {
    Seans.clearDeck();
    state = null;
    renderSetup(Seans.getPrefs());
    renderCatalog();
    focusHeading();
  }

  function steps(current) {
    var labels = ["Вечер", "Дуэли", "Фильм"];
    return (
      '<ol class="steps" aria-label="Шаги подбора">' +
      labels.map(function (label, index) {
        var cls = index < current ? "is-done" : index === current ? "is-current" : "";
        return '<li class="' + cls + '"' + (index === current ? ' aria-current="step"' : "") + "><span>" + (index + 1) + "</span>" + label + "</li>";
      }).join("") +
      "</ol>"
    );
  }

  function choiceGroup(name, legend, options, current) {
    return (
      '<fieldset class="choice-group">' +
        "<legend>" + legend + "</legend>" +
        '<div class="choices choices-' + name + '">' +
          options.map(function (option) {
            return (
              '<label class="choice">' +
                '<input type="radio" name="' + name + '" value="' + option.id + '"' + (option.id === current ? " checked" : "") + ">" +
                '<span class="choice-title">' + Seans.esc(option.label) + "</span>" +
                '<span class="choice-hint">' + Seans.esc(option.hint) + "</span>" +
              "</label>"
            );
          }).join("") +
        "</div>" +
      "</fieldset>"
    );
  }

  function poolSummary(prefs) {
    var pool = buildPool(prefs, false);
    var films = pool.order.length;
    var pairs = countPairs(films - 1);
    var text;
    if (prefs.mood === "any" || pool.exact === films) {
      text = Seans.countFilms(films) + " · " + pairs;
    } else if (pool.exact) {
      text = "Под настроение — " + Seans.countFilms(pool.exact) + ", и ещё " + (films - pool.exact) + " по времени · " + pairs;
    } else {
      text = "Точно под настроение ничего нет — возьмём " + Seans.countFilms(films) + " по времени · " + pairs;
    }
    return { text: text, pool: pool };
  }

  function previewMarkup(pool) {
    return pool.order.slice(0, 5).map(function (id, index) {
      var offset = index === 0 ? 0 : (index % 2 ? -1 : 1) * Math.ceil(index / 2);
      return '<div class="preview-item" style="--o:' + offset + ";--d:" + Math.abs(offset) + '">' + Seans.posterMarkup(Seans.movieById(id), true) + "</div>";
    }).join("");
  }

  function posterWall() {
    var list = Seans.movies();
    var cells = "";
    for (var i = 0; i < 24; i += 1) cells += Seans.posterMarkup(list[(i * 7) % list.length], i < 12);
    return '<div class="scene-bg is-wall" aria-hidden="true"><div class="poster-wall">' + cells + "</div></div>";
  }

  function duelScene(left, right) {
    return (
      '<div class="scene-bg is-duel" aria-hidden="true">' +
        '<div class="scene-half is-left"' + Seans.backdropStyle(left) + "></div>" +
        '<div class="scene-half is-right"' + Seans.backdropStyle(right) + "></div>" +
      "</div>"
    );
  }

  function renderSetup(prefs) {
    keyHandler = null;
    stage.className = "stage is-setup";
    stage.innerHTML =
      posterWall() +
      '<div class="panel setup">' +
        '<div class="setup-main">' +
          steps(0) +
          "<h1>Что посмотрим сегодня?</h1>" +
          '<p class="lead">Два вопроса — и мы покажем фильмы парами. Выбирайте тот, что интереснее: он остаётся и встречает следующего. Последний победитель — ваш фильм на вечер.</p>' +
          '<form id="setup-form">' +
            choiceGroup("time", "Сколько есть времени", Seans.TIME_OPTIONS, prefs.time) +
            choiceGroup("mood", "Какое настроение", Seans.MOOD_OPTIONS, prefs.mood) +
            '<div class="setup-footer">' +
              '<button type="submit" class="btn btn-primary btn-lg">Начать выбор<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>' +
              '<p class="setup-count" id="setup-count" aria-live="polite"></p>' +
            "</div>" +
          "</form>" +
        "</div>" +
        '<div class="setup-preview" aria-hidden="true"><div class="preview-stack" id="preview"></div></div>' +
      "</div>";

    var form = document.getElementById("setup-form");
    var countNode = document.getElementById("setup-count");
    var preview = document.getElementById("preview");

    function current() {
      return {
        time: form.querySelector('input[name="time"]:checked').value,
        mood: form.querySelector('input[name="mood"]:checked').value
      };
    }

    function update() {
      var summary = poolSummary(current());
      countNode.textContent = summary.text;
      preview.innerHTML = previewMarkup(summary.pool);
    }

    form.addEventListener("change", update);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var prefs = current();
      Seans.setPrefs(prefs);
      createState(prefs);
      renderDuel();
      focusHeading();
    });
    update();
  }

  function duelCard(movie, side) {
    var id = idOf(movie);
    var title = titleOf(movie);
    var outsideMood = state.prefs.mood !== "any" && state.matched.indexOf(id) === -1;
    var isChampion = side === "left" && state.history.length > 0;
    var score = kpValue(movie);
    return (
      '<article class="duel-card" data-card="' + side + '">' +
        '<button type="button" class="duel-pick" data-side="' + side + '" tabindex="-1" aria-hidden="true">' +
          Seans.posterMarkup(movie, true) +
        "</button>" +
        '<div class="duel-badges">' +
          (isChampion ? '<span class="badge badge-gold" title="Победил в прошлой паре">Прошёл дальше</span>' : "") +
          (outsideMood ? '<span class="badge" title="Не совсем под выбранное настроение">Вне настроения</span>' : "") +
        "</div>" +
        '<div class="duel-body">' +
          '<h2 class="clamp-2">' + Seans.esc(title) + "</h2>" +
          '<p class="meta one-line">' + (score != null ? '<span class="score ' + Seans.ratingTone(score) + '">' + Seans.formatScore(score) + "</span> " : "") + Seans.esc(yearAndRuntime(movie)) + "</p>" +
          '<p class="meta-genres one-line">' + Seans.esc(Seans.shortKicker(movie)) + "</p>" +
        "</div>" +
        '<div class="duel-actions">' +
          '<button type="button" class="btn btn-primary" data-side="' + side + '" aria-label="Выбрать «' + Seans.esc(title) + '»">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg>Выбрать' +
          "</button>" +
          '<button type="button" class="btn btn-secondary" data-info="' + id + '" data-info-side="' + side + '" aria-label="Подробнее о фильме «' + Seans.esc(title) + '»">Подробнее</button>' +
        "</div>" +
        (side === "left" ? '<span class="duel-vs" aria-hidden="true">или</span>' : "") +
      "</article>"
    );
  }

  function renderDuel() {
    var left = Seans.movieById(state.champion);
    var right = Seans.movieById(state.queue[0]);
    var isFinal = state.round === state.total;
    var segments = "";
    for (var i = 1; i <= state.total; i += 1) {
      segments += '<span class="' + (i < state.round ? "is-done" : i === state.round ? "is-current" : "") + '"></span>';
    }
    stage.className = "stage is-duel";
    stage.innerHTML =
      duelScene(left, right) +
      '<div class="panel duel">' +
        '<div class="duel-top">' +
          steps(1) +
          '<div class="duel-tools">' +
            '<button type="button" class="btn btn-ghost btn-sm" id="undo-btn"' + (state.history.length ? "" : " disabled") + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"></path><path d="M4 9h11a5 5 0 0 1 0 10h-3"></path></svg>Прошлая пара</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="restart-btn">Начать заново</button>' +
          "</div>" +
        "</div>" +
        '<div class="duel-head">' +
          "<h1>" + (isFinal ? "Финал: какой из двух?" : "Какой интереснее?") + "</h1>" +
          '<p class="duel-sub">' + (state.total > 1 ? "Пара " + state.round + " из " + state.total : "Одна пара") + "</p>" +
          (state.total > 1 ? '<div class="segments" aria-hidden="true">' + segments + "</div>" : "") +
        "</div>" +
        '<div class="duel-grid">' +
          duelCard(left, "left") +
          duelCard(right, "right") +
        "</div>" +
        '<p class="duel-hint">Можно выбирать стрелками <kbd>←</kbd> и <kbd>→</kbd> на клавиатуре</p>' +
      "</div>";

    stage.querySelectorAll("[data-side]").forEach(function (button) {
      button.addEventListener("click", function () {
        choose(button.getAttribute("data-side"));
      });
    });
    stage.querySelectorAll("[data-info]").forEach(function (button) {
      button.addEventListener("click", function () {
        openSheet(Seans.movieById(button.getAttribute("data-info")), button.getAttribute("data-info-side"));
      });
    });
    document.getElementById("restart-btn").addEventListener("click", restart);
    document.getElementById("undo-btn").addEventListener("click", undo);
    keyHandler = function (direction) {
      choose(direction < 0 ? "left" : "right");
    };
    Seans.announce((isFinal ? "Финал. " : "Пара " + state.round + " из " + state.total + ". ") + "«" + titleOf(left) + "» или «" + titleOf(right) + "».");
  }

  function choose(side) {
    if (busy || !state || state.phase !== "duel") return;
    var winner = side === "left" ? state.champion : state.queue[0];
    var loser = side === "left" ? state.queue[0] : state.champion;
    busy = true;
    closeSheet();

    function advance() {
      busy = false;
      state.history.push({ champion: state.champion, queue: state.queue.slice(), round: state.round });
      state.queue.shift();
      state.champion = winner;
      if (!state.queue.length) {
        state.phase = "result";
        state.winner = winner;
        state.runnerUp = loser;
        Seans.saveDeck(state);
        renderResult();
        renderCatalog();
        focusHeading();
        return;
      }
      state.round += 1;
      Seans.saveDeck(state);
      renderDuel();
      focusHeading();
    }

    if (reducedMotion()) {
      advance();
      return;
    }
    stage.querySelector('[data-card="' + side + '"]').classList.add("is-winner");
    stage.querySelector('[data-card="' + (side === "left" ? "right" : "left") + '"]').classList.add("is-loser");
    window.setTimeout(advance, 420);
  }

  function undo() {
    if (busy || !state || !state.history.length) return;
    var previous = state.history.pop();
    state.champion = previous.champion;
    state.queue = previous.queue;
    state.round = previous.round;
    state.phase = "duel";
    state.winner = null;
    state.runnerUp = null;
    Seans.saveDeck(state);
    renderDuel();
    focusHeading();
  }

  function renderResult() {
    keyHandler = null;
    var movie = Seans.movieById(state.winner);
    var runner = Seans.movieById(state.runnerUp);
    var idn = movie.identification || {};
    var title = titleOf(movie);
    var original = idn.title_original && idn.title_original !== title ? idn.title_original : "";
    var logline = (movie.content && movie.content.logline) || "";
    var directors = Seans.joinList(movie.creators && movie.creators.directors);
    var trailer = movie.links && movie.links.official_trailer && movie.links.official_trailer.url;
    var score = kpValue(movie);
    stage.className = "stage is-result";
    stage.innerHTML =
      '<div class="scene-bg is-result" aria-hidden="true"><div class="scene-img"' + Seans.backdropStyle(movie) + "></div></div>" +
      '<div class="panel result">' +
        '<div class="result-inner">' +
          steps(3) +
          '<div class="result-layout">' +
            '<a class="result-poster" href="' + filmHref(movie, "pick") + '" tabindex="-1" aria-hidden="true">' + Seans.posterMarkup(movie, true) + "</a>" +
            '<div class="result-info">' +
              '<p class="eyebrow">Ваш фильм на вечер</p>' +
              "<h1>" + Seans.esc(title) + "</h1>" +
              (original ? '<p class="original">' + Seans.esc(original) + "</p>" : "") +
              '<ul class="facts-row">' +
                (score != null ? '<li class="score-chip ' + Seans.ratingTone(score) + '"><b>' + Seans.formatScore(score) + "</b> <small>Кинопоиск</small></li>" : "") +
                "<li>" + Seans.esc(yearAndRuntime(movie)) + "</li>" +
                "<li>" + Seans.esc(Seans.kicker(movie)) + "</li>" +
              "</ul>" +
              (directors ? '<p class="director">Режиссёр: ' + Seans.esc(directors) + "</p>" : "") +
              (logline ? '<p class="lead">' + Seans.esc(logline) + "</p>" : "") +
              '<div class="result-actions">' +
                '<a class="btn btn-primary btn-lg" href="' + filmHref(movie, "pick") + '">Подробнее о фильме</a>' +
                (trailer ? '<a class="btn btn-secondary btn-lg" href="' + Seans.esc(trailer) + '" target="_blank" rel="noopener noreferrer">Трейлер</a>' : "") +
              "</div>" +
              '<div class="result-more">' +
                (runner ? '<p>Второе место — «' + Seans.esc(titleOf(runner)) + '» <button type="button" class="link-btn" data-info="' + idOf(runner) + '">Подробнее</button></p>' : "") +
                '<button type="button" class="btn btn-ghost" id="restart-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6"></path><path d="M20 12a8 8 0 0 0-14.3-5L4 10"></path><path d="M20 20v-6h-6"></path><path d="M4 12a8 8 0 0 0 14.3 5l1.7-3"></path></svg>Подобрать заново</button>' +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";
    document.getElementById("restart-btn").addEventListener("click", restart);
    stage.querySelectorAll("[data-info]").forEach(function (button) {
      button.addEventListener("click", function () {
        openSheet(Seans.movieById(button.getAttribute("data-info")), null);
      });
    });
    Seans.announce("Фильм на вечер: «" + title + "».");
  }

  function openSheet(movie, side) {
    if (!movie || !sheet) return;
    var title = titleOf(movie);
    var content = movie.content || {};
    var directors = Seans.joinList(movie.creators && movie.creators.directors);
    var cast = (movie.cast || []).slice(0, 4).map(function (person) { return person.name_ru || person.name_original; }).filter(Boolean).join(", ");
    var score = kpValue(movie);
    sheet.innerHTML =
      '<div class="sheet-inner">' +
        '<button type="button" class="sheet-close" data-close aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg></button>' +
        '<div class="sheet-layout">' +
          '<div class="sheet-poster">' + Seans.posterMarkup(movie, true) + "</div>" +
          '<div class="sheet-head">' +
            '<p class="eyebrow">' + Seans.esc(Seans.kicker(movie)) + "</p>" +
            '<h2 id="qv-title">' + Seans.esc(title) + "</h2>" +
            '<p class="meta">' + (score != null ? '<span class="score ' + Seans.ratingTone(score) + '">' + Seans.formatScore(score) + "</span> " : "") + Seans.esc(yearAndRuntime(movie)) + "</p>" +
          "</div>" +
          '<div class="sheet-body">' +
            (content.logline ? "<p>" + Seans.esc(content.logline) + "</p>" : "") +
            (content.mood ? '<p class="muted">' + Seans.esc(content.mood) + "</p>" : "") +
            '<dl class="sheet-people">' +
              (directors ? "<div><dt>Режиссёр</dt><dd>" + Seans.esc(directors) + "</dd></div>" : "") +
              (cast ? "<div><dt>В ролях</dt><dd>" + Seans.esc(cast) + "</dd></div>" : "") +
            "</dl>" +
          "</div>" +
        "</div>" +
        '<div class="sheet-actions">' +
          (side ? '<button type="button" class="btn btn-primary" data-sheet-pick="' + side + '">Выбрать этот фильм</button>' : "") +
          '<a class="btn btn-secondary" href="' + filmHref(movie, "pick") + '">Полная карточка</a>' +
        "</div>" +
      "</div>";
    sheet.querySelector("[data-close]").addEventListener("click", closeSheet);
    var pick = sheet.querySelector("[data-sheet-pick]");
    if (pick) {
      pick.addEventListener("click", function () {
        choose(pick.getAttribute("data-sheet-pick"));
      });
    }
    if (typeof sheet.showModal === "function") sheet.showModal();
    else sheet.setAttribute("open", "");
  }

  function closeSheet() {
    if (!sheet || !sheet.open) return;
    if (typeof sheet.close === "function") sheet.close();
    else sheet.removeAttribute("open");
  }

  if (sheet) {
    sheet.addEventListener("click", function (event) {
      if (event.target === sheet) closeSheet();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (!keyHandler || (sheet && sheet.open)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    var target = event.target;
    if (target && target.closest && target.closest("input, select, textarea, [contenteditable], [role=listbox], .dropdown-btn")) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      keyHandler(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      keyHandler(1);
    }
  });

  var tools = document.getElementById("catalog-tools");
  var queryInput = document.getElementById("f-query");
  var genreRow = document.getElementById("f-genres");
  var timeSelect = document.getElementById("f-time");
  var sortSelect = document.getElementById("f-sort");
  var countNode = document.getElementById("catalog-count");
  var activeGenre = "";

  function fillGenres() {
    var counts = {};
    Seans.movies().forEach(function (movie) {
      Seans.asList(movie.details && movie.details.genres).forEach(function (genre) {
        counts[genre] = (counts[genre] || 0) + 1;
      });
    });
    var genres = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b, "ru");
    });
    genreRow.innerHTML = [""].concat(genres).map(function (genre) {
      return '<button type="button" class="chip" data-genre="' + Seans.esc(genre) + '">' + Seans.esc(genre || "Все жанры") + "</button>";
    }).join("");
    genreRow.addEventListener("click", function (event) {
      var button = event.target.closest("[data-genre]");
      if (!button) return;
      activeGenre = button.getAttribute("data-genre");
      renderCatalog();
    });
  }

  function syncGenreChips() {
    genreRow.querySelectorAll("[data-genre]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-genre") === activeGenre));
    });
  }

  function readFilters() {
    return { query: queryInput.value, genre: activeGenre, time: timeSelect.value, sort: sortSelect.value };
  }

  function restoreFilters() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(FILTERS_KEY) || "null");
      if (!saved) return;
      queryInput.value = saved.query || "";
      activeGenre = genreRow.querySelector('[data-genre="' + String(saved.genre || "").replace(/"/g, "") + '"]') ? saved.genre || "" : "";
      [[timeSelect, saved.time], [sortSelect, saved.sort]].forEach(function (pair) {
        var value = pair[1] || "";
        var exists = Array.prototype.some.call(pair[0].options, function (option) { return option.value === value; });
        pair[0].value = exists ? value : "";
      });
    } catch (error) {
      return;
    }
  }

  function saveFilters(filters) {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch (error) {
      return;
    }
  }

  function haystack(movie) {
    var idn = movie.identification || {};
    var parts = [idn.title_ru, idn.title_original].concat(Seans.asList(idn.alternative_titles));
    parts = parts.concat(Seans.asList(movie.creators && movie.creators.directors));
    (movie.cast || []).forEach(function (person) {
      parts.push(person.name_ru, person.name_original);
    });
    return Seans.normalize(parts.filter(Boolean).join(" "));
  }

  function passesFilters(movie, filters) {
    var query = Seans.normalize(filters.query);
    if (query && haystack(movie).indexOf(query) === -1) return false;
    if (filters.genre && Seans.asList(movie.details && movie.details.genres).indexOf(filters.genre) === -1) return false;
    var minutes = Seans.runtime(movie);
    if (filters.time === "short" && minutes > 105) return false;
    if (filters.time === "medium" && minutes > 135) return false;
    if (filters.time === "long" && minutes <= 135) return false;
    return true;
  }

  function sortMovies(list, sort) {
    var sorted = list.slice();
    var year = function (movie) { return Number(movie.identification.year) || 0; };
    var score = function (movie) { var value = kpValue(movie); return value == null ? -1 : value; };
    if (sort === "rating") sorted.sort(function (a, b) { return score(b) - score(a); });
    if (sort === "new") sorted.sort(function (a, b) { return year(b) - year(a); });
    if (sort === "old") sorted.sort(function (a, b) { return year(a) - year(b); });
    if (sort === "short") sorted.sort(function (a, b) { return Seans.runtime(a) - Seans.runtime(b); });
    return sorted;
  }

  function renderCatalog() {
    var picked = state && state.phase === "result" ? state.winner : null;
    var filters = readFilters();
    var all = Seans.movies();
    var list = sortMovies(all.filter(function (movie) {
      return passesFilters(movie, filters);
    }), filters.sort);
    var filtered = Boolean(filters.query.trim() || filters.genre || filters.time);

    saveFilters(filters);
    syncGenreChips();
    dropdowns.forEach(function (dropdown) { dropdown.sync(); });
    countNode.innerHTML = filtered
      ? "Найдено " + list.length + " из " + all.length + ' <button type="button" class="link-btn" id="f-reset">Сбросить</button>'
      : Seans.countFilms(all.length) + " в программе";
    var reset = document.getElementById("f-reset");
    if (reset) reset.addEventListener("click", resetFilters);
    catalog.innerHTML = list.length
      ? list.map(function (movie) { return Seans.filmCard(movie, "catalog", picked); }).join("")
      : '<div class="catalog-empty"><p>Под эти условия ничего не нашлось.</p><button type="button" class="btn btn-secondary" id="empty-reset">Сбросить фильтры</button></div>';
    var emptyReset = document.getElementById("empty-reset");
    if (emptyReset) emptyReset.addEventListener("click", resetFilters);
  }

  function resetFilters() {
    tools.reset();
    activeGenre = "";
    renderCatalog();
    queryInput.focus();
  }

  tools.addEventListener("submit", function (event) {
    event.preventDefault();
  });
  queryInput.addEventListener("input", renderCatalog);
  [timeSelect, sortSelect].forEach(function (select) {
    select.addEventListener("change", renderCatalog);
  });

  var dropdowns = [timeSelect, sortSelect].map(function (select) {
    var root = select.parentNode;
    var name = select.getAttribute("aria-label");
    var listId = select.id + "-list";
    select.classList.add("visually-hidden");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    root.insertAdjacentHTML("beforeend",
      '<button type="button" class="dropdown-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + listId + '">' +
        '<span class="dropdown-value"></span>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>' +
      "</button>" +
      '<ul class="dropdown-list" id="' + listId + '" role="listbox" aria-label="' + Seans.esc(name) + '" hidden>' +
        Array.prototype.map.call(select.options, function (option) {
          return '<li role="option" tabindex="-1" data-value="' + Seans.esc(option.value) + '">' + Seans.esc(option.text) + "</li>";
        }).join("") +
      "</ul>");
    var button = root.querySelector(".dropdown-btn");
    var list = root.querySelector(".dropdown-list");
    var items = Array.prototype.slice.call(list.children);

    function sync() {
      var current = select.options[select.selectedIndex];
      root.querySelector(".dropdown-value").textContent = current.text;
      button.setAttribute("aria-label", name + ": " + current.text);
      root.classList.toggle("is-set", select.value !== "");
      items.forEach(function (item) {
        item.setAttribute("aria-selected", String(item.getAttribute("data-value") === select.value));
      });
    }

    function open() {
      dropdowns.forEach(function (other) { if (other.root !== root) other.close(); });
      list.hidden = false;
      root.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
      (list.querySelector('[aria-selected="true"]') || items[0]).focus();
    }

    function close(returnFocus) {
      if (list.hidden) return;
      list.hidden = true;
      root.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      if (returnFocus) button.focus();
    }

    function pick(item) {
      select.value = item.getAttribute("data-value");
      select.dispatchEvent(new Event("change", { bubbles: true }));
      close(true);
    }

    button.addEventListener("click", function () {
      if (list.hidden) open();
      else close(true);
    });
    button.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open();
      }
    });
    list.addEventListener("click", function (event) {
      var item = event.target.closest("[role=option]");
      if (item) pick(item);
    });
    list.addEventListener("keydown", function (event) {
      var index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        var step = event.key === "ArrowDown" ? 1 : -1;
        items[(index + step + items.length) % items.length].focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        items[event.key === "Home" ? 0 : items.length - 1].focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (index !== -1) pick(items[index]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      } else if (event.key === "Tab") {
        close(false);
      }
    });
    return { root: root, sync: sync, close: close };
  });

  document.addEventListener("click", function (event) {
    dropdowns.forEach(function (dropdown) {
      if (!dropdown.root.contains(event.target)) dropdown.close(false);
    });
  });

  function init() {
    if (!Seans.movies().length) {
      stage.innerHTML = '<div class="panel empty-state"><h1>Каталог не открылся</h1><p>Файл с фильмами не подключился.</p></div>';
      return;
    }
    fillGenres();
    restoreFilters();

    var saved = Seans.loadDeck();
    if (validState(saved)) {
      state = saved;
    } else {
      Seans.clearDeck();
    }
    renderCatalog();
    if (!state) renderSetup(Seans.getPrefs());
    else if (state.phase === "result") renderResult();
    else renderDuel();
  }

  init();
})();
