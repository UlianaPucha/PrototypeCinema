(function () {
  var app = document.getElementById("app");

  function paragraphs(text) {
    if (!text) return "";
    return String(text).split(/\n{2,}/).map(function (part) {
      var trimmed = part.trim();
      if (!trimmed) return "";
      return "<p>" + Seans.esc(trimmed) + "</p>";
    }).join("");
  }

  function longestWord(text) {
    return String(text).split(/\s+/).reduce(function (max, word) { return Math.max(max, word.length); }, 1);
  }

  function passport(movie) {
    var idn = movie.identification || {};
    var details = movie.details || {};
    var premiere = movie.release && movie.release.world_premiere;
    var premiereText = "";
    if (premiere) {
      premiereText = [Seans.formatDate(premiere.date) || premiere.year, premiere.event].filter(Boolean).join(" · ");
    }
    var ratings = (details.age_ratings || []);
    var ru = null;
    for (var i = 0; i < ratings.length; i += 1) {
      if (ratings[i].country === "Россия") ru = ratings[i];
    }
    if (!ru && ratings.length) ru = ratings[0];
    var rows = [
      ["Год", idn.year],
      ["Хронометраж", Seans.formatRuntime(details.runtime_minutes)],
      ["Тип", idn.film_type],
      ["Страны", Seans.joinList(details.countries)],
      ["Языки", Seans.joinList(details.languages)],
      ["Возраст", ru && ru.rating],
      ["Цвет", details.color],
      ["Кадр", details.aspect_ratio],
      ["Премьера", premiereText]
    ].filter(function (row) { return row[1]; });
    if (!rows.length) return "";
    return (
      "<dl class=\"passport\">" +
      rows.map(function (row) {
        return "<div><dt>" + row[0] + "</dt><dd>" + Seans.esc(row[1]) + "</dd></div>";
      }).join("") +
      "</dl>"
    );
  }

  function crew(movie) {
    var creators = movie.creators || {};
    var rows = [
      ["Режиссура", creators.directors],
      ["Сценарий", creators.screenwriters],
      ["Оператор", creators.cinematographers],
      ["Композитор", creators.composers],
      ["Монтаж", creators.editors],
      ["Продюсеры", creators.producers],
      ["Производство", creators.production_companies]
    ].map(function (row) {
      return [row[0], Seans.joinList(row[1])];
    }).filter(function (row) { return row[1]; });
    if (!rows.length) return "";
    return (
      "<dl class=\"passport\">" +
      rows.map(function (row) {
        return "<div><dt>" + row[0] + "</dt><dd>" + Seans.esc(row[1]) + "</dd></div>";
      }).join("") +
      "</dl>"
    );
  }

  function castList(movie) {
    var people = movie.cast || [];
    if (!people.length) return "";
    return (
      '<ul class="people">' +
      people.map(function (person) {
        var name = person.name_ru || person.name_original || "Без имени";
        var initials = name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
        var kind = person.participation_type && person.participation_type !== "актёр" ? person.participation_type : "";
        var role = person.role ? person.role : kind;
        return (
          '<li><span class="avatar" aria-hidden="true">' + Seans.esc(initials) + "</span>" +
          "<div><strong>" + Seans.esc(name) + "</strong>" +
          (role ? "<small>" + Seans.esc(role) + "</small>" : "") + "</div></li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function awardsList(movie) {
    var awards = (movie.recognition && movie.recognition.awards) || [];
    if (!awards.length) return "";
    return (
      '<ul class="awards">' +
      awards.map(function (award) {
        var result = award.result === "win" ? "победа" : award.result === "nomination" ? "номинация" : (award.result || "");
        var cls = award.result === "win" ? "is-win" : "is-nom";
        var place = [award.event, award.year].filter(Boolean).join(", ");
        var who = award.recipient ? " · " + award.recipient : "";
        return (
          '<li><span class="pill ' + cls + '">' + Seans.esc(result) + "</span><div>" +
          "<strong>" + Seans.esc(award.category || award.event || "Награда") + "</strong>" +
          "<span>" + Seans.esc(place + who) + "</span></div></li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function factsList(movie) {
    var facts = (movie.context && movie.context.facts) || [];
    var items = facts.filter(function (fact) { return fact && fact.text; });
    if (!items.length) return "";
    return '<ul class="facts">' + items.map(function (fact) {
      return "<li>" + Seans.esc(fact.text) + "</li>";
    }).join("") + "</ul>";
  }

  function backLink() {
    var from = new URLSearchParams(location.search).get("from");
    var toPick = from === "pick";
    var href = toPick ? "index.html#pick" : "index.html#catalog-section";
    var label = toPick ? "Вернуться к подбору" : "К каталогу";
    return (
      '<a class="back-btn" id="back-btn" href="' + href + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"></path></svg>' + label +
      "</a>"
    );
  }

  function bindBack() {
    var link = document.getElementById("back-btn");
    if (!link) return;
    link.addEventListener("click", function (event) {
      var referrer = document.referrer;
      var sameSite = referrer && referrer.indexOf(location.origin) === 0 && /index\.html|\/$/.test(referrer.split(/[?#]/)[0]);
      if (sameSite && history.length > 1) {
        event.preventDefault();
        history.back();
      }
    });
  }

  function heroFacts(movie) {
    var idn = movie.identification || {};
    var details = movie.details || {};
    var ratings = movie.ratings || {};
    var items = [];
    if (ratings.kinopoisk && ratings.kinopoisk.value != null) items.push('<li class="score-chip ' + Seans.ratingTone(Number(ratings.kinopoisk.value)) + '"><b>' + Seans.esc(Seans.formatScore(ratings.kinopoisk.value)) + "</b> <small>Кинопоиск</small></li>");
    if (ratings.imdb && ratings.imdb.value != null) items.push("<li>" + Seans.esc(Seans.formatScore(ratings.imdb.value)) + " <small>IMDb</small></li>");
    if (idn.year) items.push("<li>" + Seans.esc(idn.year) + "</li>");
    if (details.runtime_minutes) items.push("<li>" + Seans.esc(Seans.formatRuntime(details.runtime_minutes)) + "</li>");
    var age = (details.age_ratings || []).filter(function (rating) { return rating.country === "Россия"; })[0];
    if (age && age.rating) items.push("<li>" + Seans.esc(age.rating) + "</li>");
    return items.length ? '<ul class="facts-row">' + items.join("") + "</ul>" : "";
  }

  function heroActions(movie) {
    var idn = movie.identification || {};
    var trailer = movie.links && movie.links.official_trailer && movie.links.official_trailer.url;
    var buttons = [];
    if (trailer) buttons.push('<a class="btn btn-primary btn-lg" href="' + Seans.esc(trailer) + '" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>Трейлер</a>');
    if (idn.kinopoisk_url) buttons.push('<a class="btn btn-secondary btn-lg" href="' + Seans.esc(idn.kinopoisk_url) + '" target="_blank" rel="noopener noreferrer">Кинопоиск</a>');
    if (idn.imdb_url) buttons.push('<a class="btn btn-secondary btn-lg" href="' + Seans.esc(idn.imdb_url) + '" target="_blank" rel="noopener noreferrer">IMDb</a>');
    return buttons.length ? '<div class="hero-actions">' + buttons.join("") + "</div>" : "";
  }

  function block(id, title, body) {
    if (!body) return "";
    return '<section class="block" id="' + id + '" aria-labelledby="' + id + '-title"><h2 id="' + id + '-title">' + title + "</h2>" + body + "</section>";
  }

  function similarFilms(movie) {
    var genres = Seans.asList(movie.details && movie.details.genres);
    var moods = Seans.MOOD_OPTIONS.filter(function (option) {
      return option.pattern && Seans.fitsMood(movie, option.id);
    });
    var list = Seans.movies().filter(function (other) {
      return other !== movie;
    }).map(function (other) {
      var shared = Seans.asList(other.details && other.details.genres).filter(function (genre) {
        return genres.indexOf(genre) !== -1;
      }).length;
      var sameMood = moods.some(function (option) { return Seans.fitsMood(other, option.id); }) ? 1 : 0;
      return { movie: other, score: shared * 2 + sameMood + (Seans.kpValue(other) || 0) / 100 };
    }).sort(function (a, b) {
      return b.score - a.score;
    }).slice(0, 4);
    if (!list.length) return "";
    var picked = Seans.pickedId();
    return (
      '<section class="similar film-wrap" aria-labelledby="similar-title">' +
        '<h2 id="similar-title">Похожие фильмы</h2>' +
        '<div class="catalog-grid similar-grid">' +
          list.map(function (item) { return Seans.filmCard(item.movie, "catalog", picked); }).join("") +
        "</div>" +
      "</section>"
    );
  }

  function render() {
    var params = new URLSearchParams(location.search);
    var movie = Seans.movieById(params.get("id"));
    if (!movie) {
      document.title = "Фильм не найден — Сеанс";
      app.innerHTML =
        '<div class="film-wrap">' + backLink() +
        '<div class="panel empty-state"><h1>Такого фильма нет</h1>' +
        "<p>В каталоге десять картин, и этой среди них нет.</p>" +
        '<a class="btn btn-primary" href="index.html#catalog-section">Открыть каталог</a></div></div>';
      bindBack();
      return;
    }

    var idn = movie.identification || {};
    var content = movie.content || {};
    var title = idn.title_ru || "Фильм";
    var original = idn.title_original && idn.title_original !== title ? idn.title_original : "";
    var directors = Seans.joinList(movie.creators && movie.creators.directors);
    var themes = Seans.asList(content.themes);
    var notes = "";
    if (content.mood || content.visual_style) {
      notes =
        '<div class="notes">' +
        (content.mood ? '<div class="note"><h3>Настроение</h3><p>' + Seans.esc(content.mood) + "</p></div>" : "") +
        (content.visual_style ? '<div class="note"><h3>Как выглядит</h3><p>' + Seans.esc(content.visual_style) + "</p></div>" : "") +
        "</div>";
    }
    var about =
      (content.synopsis ? '<div class="prose">' + paragraphs(content.synopsis) + "</div>" : "") +
      notes +
      (themes.length ? '<ul class="chips">' + themes.map(function (theme) {
        return '<li class="chip chip-static">' + Seans.esc(theme) + "</li>";
      }).join("") + "</ul>" : "");
    var people = castList(movie);
    var crewBlock = crew(movie);
    var awards = awardsList(movie);
    var contextText = movie.context && movie.context.text ? '<div class="prose">' + paragraphs(movie.context.text) + "</div>" : "";
    var facts = factsList(movie);

    var tabs = [
      ["about", "О фильме", about],
      ["people", "Актёры", people],
      ["crew", "Команда", crewBlock],
      ["awards", "Награды", awards],
      [contextText ? "context" : "facts", "Контекст", contextText || facts]
    ].filter(function (tab) { return tab[2]; });

    document.title = title + " — Сеанс";
    app.innerHTML =
      '<article class="film">' +
        '<header class="film-hero">' +
          '<div class="film-backdrop"' + Seans.backdropStyle(movie) + ' aria-hidden="true"></div>' +
          '<div class="film-wrap">' +
            backLink() +
            '<div class="hero-grid">' +
              '<div class="hero-poster">' + Seans.posterMarkup(movie, true) + "</div>" +
              '<div class="hero-info">' +
                '<p class="eyebrow">' + Seans.esc(Seans.kicker(movie)) + "</p>" +
                '<h1 class="film-title" style="--longest:' + longestWord(title) + '">' + Seans.esc(title) + "</h1>" +
                (original ? '<p class="original">' + Seans.esc(original) + "</p>" : "") +
                heroFacts(movie) +
                (directors ? '<p class="director">Режиссёр: <strong>' + Seans.esc(directors) + "</strong></p>" : "") +
                (content.logline ? '<p class="lead">' + Seans.esc(content.logline) + "</p>" : "") +
                heroActions(movie) +
              "</div>" +
            "</div>" +
          "</div>" +
        "</header>" +
        (tabs.length > 1
          ? '<nav class="film-tabs" aria-label="Разделы карточки"><div class="film-wrap">' +
              tabs.map(function (tab) { return '<a href="#' + tab[0] + '">' + tab[1] + "</a>"; }).join("") +
            "</div></nav>"
          : "") +
        '<div class="film-wrap film-content">' +
          '<div class="film-main">' +
            block("about", "О фильме", about) +
            block("people", "Актёры", people) +
            block("awards", "Награды", awards) +
            block("context", "Контекст", contextText) +
            block("facts", "Любопытные факты", facts) +
          "</div>" +
          '<aside class="film-aside">' +
            block("passport", "Паспорт", passport(movie)) +
            block("crew", "Команда", crewBlock) +
          "</aside>" +
        "</div>" +
        similarFilms(movie) +
      "</article>";
    bindBack();
  }

  render();
})();
