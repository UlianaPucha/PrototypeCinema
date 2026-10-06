(function () {
  var DECK_KEY = "seans.duel";
  var PREFS_KEY = "seans.prefs";

  var TIME_OPTIONS = [
    { id: "short", label: "До 1 ч 45 мин", hint: "успеть до полуночи", max: 105 },
    { id: "medium", label: "До 2 ч 15 мин", hint: "обычный вечер", max: 135 },
    { id: "any", label: "Неважно", hint: "вечер свободен", max: Infinity }
  ];

  var MOOD_OPTIONS = [
    { id: "light", label: "Лёгкое и тёплое", hint: "улыбнуться и выдохнуть", pattern: /(лёгк|легк|тёпл|тепл|нежн|волшебн)ое/i },
    { id: "thoughtful", label: "Задумчивое", hint: "медленно и красиво", pattern: /(созерцательн|меланхоличн|ностальгическ|чувственн)ое/i },
    { id: "intense", label: "Сильные эмоции", hint: "чтобы зацепило", pattern: /(напряжённ|напряженн|тревожн|скорбн|суров)ое/i },
    { id: "curious", label: "Узнать новое", hint: "документальное и любопытное", pattern: /(любопытн|любознательн)ое/i, documentary: true },
    { id: "any", label: "Любое", hint: "удивите меня" }
  ];

  function readStorage(storage, key) {
    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(storage, key, value) {
    try {
      if (value == null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch (error) {
      return;
    }
  }

  function movies() {
    var data = window.MOVIE_CATALOG;
    if (!data || !Array.isArray(data.movies)) return [];
    return data.movies;
  }

  function movieById(id) {
    var num = Number(id);
    if (!Number.isFinite(num)) return null;
    var list = movies();
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].identification && list[i].identification.kinopoisk_id === num) return list[i];
    }
    return null;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function asList(value) {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value];
  }

  function joinList(value) {
    return asList(value).join(", ");
  }

  function formatRuntime(minutes) {
    var value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return "";
    var hours = Math.floor(value / 60);
    var rest = value % 60;
    if (hours && rest) return hours + " ч " + rest + " мин";
    if (hours) return hours + " ч";
    return rest + " мин";
  }

  function formatDate(raw) {
    var text = String(raw || "");
    if (!/^\d{8}$/.test(text)) return "";
    return text.slice(0, 2) + "." + text.slice(2, 4) + "." + text.slice(4);
  }

  function formatScore(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number.toFixed(1).replace(".", ",");
  }

  function formatVotes(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return "";
    return String(Math.round(number)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function shortKind(movie) {
    var type = ((movie.identification && movie.identification.film_type) || "").toLowerCase();
    if (type.indexOf("документ") !== -1) return "документальный";
    if (type.indexOf("анимац") !== -1) return "анимация";
    return "";
  }

  function kicker(movie, limit) {
    var genres = asList(movie.details && movie.details.genres).slice(0, limit || 3);
    var kind = shortKind(movie);
    if (kind) {
      var stem = kind.slice(0, 6);
      var duplicate = genres.some(function (genre) {
        return String(genre).toLowerCase().indexOf(stem) !== -1;
      });
      if (duplicate) kind = "";
    }
    return [kind].concat(genres).filter(Boolean).join(", ");
  }

  function shortKicker(movie) {
    var two = kicker(movie, 2);
    return two.length > 22 ? kicker(movie, 1) : two;
  }

  function metaLine(movie) {
    var idn = movie.identification || {};
    var details = movie.details || {};
    var bits = [idn.year, formatRuntime(details.runtime_minutes)].filter(Boolean);
    var kp = movie.ratings && movie.ratings.kinopoisk;
    if (kp && kp.value != null) bits.push("КП " + formatScore(kp.value));
    return bits.join(" · ");
  }

  function posterSources(movie) {
    var poster = movie.poster || {};
    return [poster.path, poster.source_url].filter(Boolean);
  }

  function posterMarkup(movie, eager) {
    var idn = movie.identification || {};
    var title = idn.title_ru || "Фильм";
    var year = idn.year || "";
    var sources = posterSources(movie);
    var hue = Math.abs(Number(idn.kinopoisk_id) || 0) % 360;
    var image = sources.length
      ? '<img src="' + esc(sources[0]) + '"' + (sources[1] ? ' data-alt="' + esc(sources[1]) + '"' : "") +
        ' alt="" draggable="false" decoding="async"' + (eager ? "" : ' loading="lazy"') + ' referrerpolicy="no-referrer"' +
        " onerror=\"if(this.dataset.alt){this.src=this.dataset.alt;this.removeAttribute('data-alt')}else{this.closest('.poster').classList.add('is-fallback')}\">"
      : "";
    return (
      '<div class="poster' + (sources.length ? "" : " is-fallback") + '" style="--hue:' + hue + '">' +
      image +
      '<div class="poster-fallback" aria-hidden="true"><span>' + esc(title) + "</span><small>" + esc(year) + "</small></div>" +
      "</div>"
    );
  }

  function yearAndRuntime(movie) {
    return [movie.identification.year, formatRuntime(movie.details && movie.details.runtime_minutes)].filter(Boolean).join(" · ");
  }

  function kpValue(movie) {
    var kp = movie.ratings && movie.ratings.kinopoisk;
    return kp && kp.value != null ? Number(kp.value) : null;
  }

  function ratingTone(value) {
    if (value >= 7) return "is-good";
    if (value >= 5) return "is-mid";
    return "is-low";
  }

  function filmHref(movie, from) {
    return "film.html?id=" + movie.identification.kinopoisk_id + "&from=" + from;
  }

  function pickedId() {
    var state = loadDeck();
    return state && state.phase === "result" ? Number(state.winner) : null;
  }

  function filmCard(movie, from, picked) {
    var idn = movie.identification || {};
    var score = kpValue(movie);
    var isPicked = picked != null && Number(picked) === idn.kinopoisk_id;
    var logline = (movie.content && movie.content.logline) || "";
    return (
      '<a class="catalog-card' + (isPicked ? " is-picked" : "") + '" href="' + filmHref(movie, from) + '">' +
        '<div class="poster-wrap">' +
          posterMarkup(movie) +
          (score != null ? '<span class="rating ' + ratingTone(score) + '">' + formatScore(score) + "</span>" : "") +
          (isPicked ? '<span class="tag-picked">Выбран</span>' : "") +
          (logline ? '<div class="card-hover" aria-hidden="true"><p>' + esc(logline) + "</p><span>Подробнее →</span></div>" : "") +
        "</div>" +
        '<div class="catalog-body">' +
          '<h3 class="clamp-2">' + esc(idn.title_ru || "Фильм") + "</h3>" +
          '<p class="meta one-line">' + esc(yearAndRuntime(movie)) + "</p>" +
          '<p class="meta-genres one-line">' + esc(shortKicker(movie)) + "</p>" +
        "</div>" +
      "</a>"
    );
  }

  function backdropStyle(movie) {
    var sources = posterSources(movie);
    if (!sources.length) return "";
    return ' style="--backdrop:' + sources.map(function (src) { return "url('" + esc(src) + "')"; }).join(", ") + '"';
  }

  function loadDeck() {
    try {
      var raw = readStorage(sessionStorage, DECK_KEY);
      if (!raw) return null;
      var deck = JSON.parse(raw);
      if (!deck || !Array.isArray(deck.order)) return null;
      return deck;
    } catch (error) {
      return null;
    }
  }

  function saveDeck(deck) {
    writeStorage(sessionStorage, DECK_KEY, JSON.stringify(deck));
  }

  function clearDeck() {
    writeStorage(sessionStorage, DECK_KEY, null);
  }

  function announce(text) {
    var node = document.getElementById("live");
    if (node) node.textContent = text;
  }

  function countFilms(amount) {
    var mod10 = amount % 10;
    var mod100 = amount % 100;
    var word = "фильмов";
    if (mod10 === 1 && mod100 !== 11) word = "фильм";
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "фильма";
    return amount + " " + word;
  }

  function optionById(list, id) {
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i];
    }
    return list[list.length - 1];
  }

  function timeOption(id) {
    return optionById(TIME_OPTIONS, id);
  }

  function moodOption(id) {
    return optionById(MOOD_OPTIONS, id);
  }

  function runtime(movie) {
    var value = Number(movie.details && movie.details.runtime_minutes);
    return Number.isFinite(value) ? value : 0;
  }

  function fitsTime(movie, timeId) {
    return runtime(movie) <= timeOption(timeId).max;
  }

  function fitsMood(movie, moodId) {
    var option = moodOption(moodId);
    if (!option.pattern) return true;
    if (option.documentary && shortKind(movie) === "документальный") return true;
    return option.pattern.test((movie.content && movie.content.mood) || "");
  }

  function getPrefs() {
    try {
      var prefs = JSON.parse(readStorage(localStorage, PREFS_KEY) || "null");
      if (prefs && typeof prefs.time === "string" && typeof prefs.mood === "string") {
        return { time: timeOption(prefs.time).id, mood: moodOption(prefs.mood).id };
      }
    } catch (error) {
      return { time: "medium", mood: "any" };
    }
    return { time: "medium", mood: "any" };
  }

  function setPrefs(prefs) {
    writeStorage(localStorage, PREFS_KEY, JSON.stringify({ time: prefs.time, mood: prefs.mood }));
  }

  function normalize(text) {
    return String(text || "").toLowerCase().replace(/ё/g, "е").trim();
  }

  var SHORT_WORD = /(^|[\s(«"])([а-яёА-ЯЁ]{1,2}|для|без|под|над|при|про|через|из-за|что|как) (?=\S)/g;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, KBD: 1, CODE: 1 };

  function typo(text) {
    return text
      .replace(SHORT_WORD, "$1$2\u00a0")
      .replace(SHORT_WORD, "$1$2\u00a0")
      .replace(/ ([—–])/g, "\u00a0$1")
      .replace(/(\d) (?=(ч|мин|г\.|гг\.|млн|тыс|из|фильм|пар|оцен)[а-яё.]*)/g, "$1\u00a0")
      .replace(/([0-9a-zA-Zа-яёА-ЯЁ])-(?=[0-9a-zA-Zа-яёА-ЯЁ])/g, "$1-\u2060");
  }

  function typeset(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      var parent = root.parentNode;
      if (parent && !SKIP_TAGS[parent.nodeName]) {
        var next = typo(root.nodeValue);
        if (next !== root.nodeValue) root.nodeValue = next;
      }
      return;
    }
    if (root.nodeType !== 1 || SKIP_TAGS[root.nodeName]) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) typeset(node);
  }

  typeset(document.body);
  if (window.MutationObserver) {
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes, typeset);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.Seans = {
    movies: movies,
    movieById: movieById,
    esc: esc,
    asList: asList,
    joinList: joinList,
    formatRuntime: formatRuntime,
    formatDate: formatDate,
    formatScore: formatScore,
    formatVotes: formatVotes,
    shortKind: shortKind,
    kicker: kicker,
    shortKicker: shortKicker,
    metaLine: metaLine,
    posterMarkup: posterMarkup,
    backdropStyle: backdropStyle,
    yearAndRuntime: yearAndRuntime,
    kpValue: kpValue,
    ratingTone: ratingTone,
    filmHref: filmHref,
    pickedId: pickedId,
    filmCard: filmCard,
    loadDeck: loadDeck,
    saveDeck: saveDeck,
    clearDeck: clearDeck,
    announce: announce,
    countFilms: countFilms,
    TIME_OPTIONS: TIME_OPTIONS,
    MOOD_OPTIONS: MOOD_OPTIONS,
    timeOption: timeOption,
    moodOption: moodOption,
    runtime: runtime,
    fitsTime: fitsTime,
    fitsMood: fitsMood,
    getPrefs: getPrefs,
    setPrefs: setPrefs,
    normalize: normalize
  };
})();
