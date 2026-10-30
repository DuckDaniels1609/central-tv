/* Capas dos jogos: imagem principal do artigo do jogo na Wikipedia (carregada na hora, guardada por 7 dias).
   Só aceita a página se ela for de um jogo, para não pegar a foto de outra coisa com o mesmo nome. */
var CAPAS = (function () {
  function ler(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var fila = [], ativos = 0;
  function proximo() {
    if (ativos >= 3 || !fila.length) return;
    var t = fila.shift(); ativos++;
    t(function () { ativos--; proximo(); });
    proximo();
  }
  function buscar(j, cb) {
    var k = 'capa2-' + j.id, c = ler(k);
    if (c && Date.now() - c.em < (c.u ? 7 : 1) * 864e5) { cb(c.u); return; }
    fila.push(function (fim) {
      var base = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages|description&piprop=thumbnail&pithumbsize=480&pilicense=any&';
      var url = base + (j.wiki ? 'titles=' + encodeURIComponent(j.wiki) : 'generator=search&gsrlimit=3&gsrsearch=' + encodeURIComponent('"' + j.nome + '" video game'));
      fetch(url).then(function (r) { return r.json(); }).then(function (r) {
        var pages = r && r.query && r.query.pages ? Object.keys(r.query.pages).map(function (x) { return r.query.pages[x]; }) : [];
        pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
        var palavra = j.nome.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; })[0] || j.nome.toLowerCase();
        var ok = pages.filter(function (p) { return p.thumbnail && (j.wiki || (/game/i.test(p.description || '') && p.title.toLowerCase().indexOf(palavra) >= 0)); })[0];
        var u = ok ? ok.thumbnail.source : '';
        gravar(k, { u: u, em: Date.now() }); cb(u); fim();
      }).catch(function () { cb(''); fim(); });
    });
    proximo();
  }
  /* coloca a capa em todos os elementos com data-capa="id" */
  function aplicar(raiz, jogos) {
    var por = {}; (jogos || []).forEach(function (j) { por[j.id] = j; });
    Array.prototype.forEach.call((raiz || document).querySelectorAll('[data-capa]'), function (el) {
      var j = por[el.getAttribute('data-capa')]; if (!j || el.getAttribute('data-ok')) return;
      el.setAttribute('data-ok', '1');
      buscar(j, function (u) { if (u) { el.style.backgroundImage = 'url("' + u + '")'; el.classList.add('tem'); } });
    });
  }
  return { buscar: buscar, aplicar: aplicar };
})();
