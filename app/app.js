/* Central TV do Daniel: navegação pelo controle, relógio, apps e treinos */
(function () {
  'use strict';
  var D = window.DADOS;
  var $ = function (id) { return document.getElementById(id); };
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var DIAS_C = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var NPAG = 6, HOME = 2;
  var pagina = HOME, foco = null, ultimoFoco = {}, cfgAberto = false;
  var tizenOk = typeof window.tizen !== 'undefined';
  var appsTV = []; /* {id, name} dos apps instalados */

  /* ---------- personalização (salva na TV) ---------- */
  var PAGS = [['projetos', 'Fundo: Projetos'], ['inicio', 'Fundo: Início'], ['treino', 'Fundo: Treino'], ['exercicios', 'Fundo: Exercícios'], ['agenda', 'Fundo: Agenda']];
  var CENAS = [['noite', 'Noite'], ['entardecer', 'Entardecer'], ['dia', 'Dia'], ['praia', 'Praia'], ['img', 'Minha imagem']];
  var CORES = ['#FF7FA8', '#8FE3FF', '#FFD36E', '#9CF2A8', '#C8A6FF', '#FF9F6E'];
  var PADRAO = { cor: D.cor, fundo: { projetos: 'noite', inicio: 'entardecer', treino: 'dia', exercicios: 'praia', agenda: 'dia' }, escuro: 0, ocultos: {}, anim: true, musica: { on: true, vol: 40, ordem: 'seq' }, zoom: 100,
    modo: 'normal',
    despertar: { on: true, hora: '06:00', dias: [1, 2, 3, 4, 5], feriados: true, musica: 'musicas/07 - Standing Friends (Katekyo Hitman Reborn!).mp3', volIni: 10, volFim: 25, min: 10, janela: 45 } };
  var cfg = ler('cfg', null) || {};
  Object.keys(PADRAO).forEach(function (k) { if (cfg[k] === undefined) cfg[k] = JSON.parse(JSON.stringify(PADRAO[k])); });
  /* configuração vinda do Editor da Central TV (tvconfig.js): vale quando é mais nova que a da TV */
  var T = window.TVCFG;
  if (T && T.versao) {
    if (T.nome) D.nome = T.nome;
    if (T.apps && T.apps.length) {
      var ordem = T.apps.map(function (x) { return x.nome; });
      D.apps.sort(function (a, b) { var ia = ordem.indexOf(a.nome), ib = ordem.indexOf(b.nome); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    }
    if (cfg.versaoEditor !== T.versao) {
      cfg.versaoEditor = T.versao;
      gravar('desp-feito', '');
      if (T.cor) cfg.cor = T.cor;
      if (T.fundos) Object.keys(T.fundos).forEach(function (p) { cfg.fundo[p] = T.fundos[p]; });
      if (typeof T.escuro === 'number') cfg.escuro = T.escuro;
      if (typeof T.anim === 'boolean') cfg.anim = T.anim;
      if (T.modo) cfg.modo = T.modo;
      if (T.despertar) cfg.despertar = Object.assign({}, cfg.despertar, T.despertar);
      if (T.musica) cfg.musica = { on: T.musica.on !== false, vol: +T.musica.vol || 40, ordem: T.musica.ordem === 'aleatoria' ? 'aleatoria' : 'seq' };
      if (T.apps) { cfg.ocultos = {}; T.apps.forEach(function (x) { if (!x.visivel) cfg.ocultos[x.nome] = true; }); }
      gravar('cfg', cfg);
    }
  }
  var cenaSVG = {}, imgOk = {};
  function guardarCenas() {
    var mapa = { 'p-projetos': 'noite', 'p-inicio': 'entardecer', 'p-treino': 'dia', 'p-exercicios': 'praia' };
    Object.keys(mapa).forEach(function (id) { var s = document.querySelector('#' + id + ' svg.bg'); if (s) cenaSVG[mapa[id]] = s.outerHTML; });
  }
  function testarImagens(cb) {
    var lista = PAGS.concat([['discreto', '']]), faltam = lista.length;
    lista.forEach(function (p) {
      var tenta = ['fundos/' + p[0] + '.jpg', 'fundos/' + p[0] + '.png'];
      (function prox(i) {
        if (i >= tenta.length) { imgOk[p[0]] = null; if (--faltam === 0 && cb) cb(); return; }
        var im = new Image();
        im.onload = function () { imgOk[p[0]] = tenta[i]; if (--faltam === 0 && cb) cb(); };
        im.onerror = function () { prox(i + 1); };
        im.src = tenta[i];
      })(0);
    });
  }
  /* ---------- música de fundo (arquivos em musicas/) ---------- */
  var PAGNOME = ['agenda', 'projetos', 'inicio', 'treino', 'exercicios', 'lancamentos'];
  var players = [new Audio(), new Audio()], ativo = 0, srcAtual = null, fadeT = null, semMusica = {};
  players.forEach(function (p) { p.loop = true; p.preload = 'auto'; });
  function volAlvo() { return Math.max(0, Math.min(1, (cfg.musica.vol || 0) / 100)); }
  function fade(p, para, ms, fim) {
    var de = p.volume, t0 = Date.now();
    (function passo() {
      var k = Math.min(1, (Date.now() - t0) / ms); p.volume = de + (para - de) * k;
      if (k < 1) setTimeout(passo, 50); else if (fim) fim();
    })();
  }
  function achaSrc(nome, cb) {
    var lista = ['musicas/' + nome + '.mp3', 'musicas/geral.mp3'];
    (function prox(i) {
      if (i >= lista.length) return cb(null);
      if (semMusica[lista[i]]) return prox(i + 1);
      var t = new Audio(); t.preload = 'metadata';
      t.oncanplay = function () { t.oncanplay = t.onerror = null; cb(lista[i]); };
      t.onerror = function () { semMusica[lista[i]] = true; prox(i + 1); };
      t.src = lista[i];
    })(0);
  }
  /* playlist: o instalador lista os MP3 da pasta musicas/ em playlist.js */
  var LISTA_N = (window.PLAYLIST || []).filter(function (s) { return /\.mp3$/i.test(s); });
  var LISTA_D = (window.PLAYLIST_DISCRETO || []).filter(function (s) { return /\.mp3$/i.test(s); });
  var LISTA_A = (window.PLAYLIST_DESPERTAR || []).filter(function (s) { return /\.mp3$/i.test(s); });
  function escolherLista() { if (cfg.modo !== 'discreto') return LISTA_N; return LISTA_DC || (LISTA_D.length ? LISTA_D : LISTA_N); }
  var LISTA = escolherLista();
  var faixa = ler('faixa', 0) || 0, pl = players[0];
  if (LISTA_N.length || LISTA_D.length) {
    pl.loop = false;
    pl.addEventListener('ended', function () { proximaFaixa(); });
    pl.addEventListener('error', function () { if (LISTA.length > 1) setTimeout(proximaFaixa, 500); });
  }
  function carregarFaixa() {
    if (faixa >= LISTA.length || faixa < 0) faixa = 0;
    gravar('faixa', faixa);
    pl.src = encodeURI(LISTA[faixa]); pl.volume = volAlvo();
    pl.play().catch(function () {});
  }
  function proximaFaixa() {
    if (cfg.musica.ordem === 'aleatoria' && LISTA.length > 1) { var n; do { n = Math.floor(Math.random() * LISTA.length); } while (n === faixa); faixa = n; }
    else faixa = (faixa + 1) % LISTA.length;
    carregarFaixa();
  }
  function tocarPlaylist() {
    if (!cfg.musica.on || document.hidden) { pl.pause(); return; }
    pl.volume = volAlvo();
    if (!pl.getAttribute('src')) carregarFaixa(); else if (pl.paused) pl.play().catch(function () {});
  }
  function trocarLista() {
    var nova = escolherLista(); if (nova === LISTA) return;
    LISTA = nova; faixa = 0; pl.pause(); pl.removeAttribute('src');
  }
  function tocarMusica() {
    if (LISTA.length) { tocarPlaylist(); return; }
    if (!cfg.musica.on || document.hidden) { players.forEach(function (p) { p.pause(); }); srcAtual = null; return; }
    achaSrc(PAGNOME[pagina], function (src) {
      if (!src) { players.forEach(function (p) { if (!p.paused) fade(p, 0, 600, function () { p.pause(); }); }); srcAtual = null; return; }
      if (src === srcAtual) { var p0 = players[ativo]; p0.volume = volAlvo(); if (p0.paused) p0.play().catch(function () {}); return; }
      var velho = players[ativo]; ativo = 1 - ativo; var novo = players[ativo];
      novo.src = src; novo.volume = 0; srcAtual = src;
      novo.play().then(function () { fade(novo, volAlvo(), 1200); }).catch(function () {});
      if (!velho.paused) fade(velho, 0, 1200, function () { velho.pause(); });
    });
  }
  function registrar(msg) {
    try { var l = ler('registro', []); var d = new Date(); l.unshift(('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + msg); gravar('registro', l.slice(0, 12)); } catch (e) {}
  }
  var ajusteTimer = null;
  function ajustarTela() {
    var w = window.innerWidth || 0, h = window.innerHeight || 0;
    if (w < 200 || h < 150) {
      /* a TV ainda não informou o tamanho da tela (acontece logo depois de ligar): usa o tamanho padrão e tenta de novo */
      w = 1920; h = 1080;
      clearTimeout(ajusteTimer); ajusteTimer = setTimeout(ajustarTela, 1000);
    }
    var s = Math.min(w / 1920, h / 1080) * ((cfg.zoom || 100) / 100);
    var ox = (w - 1920 * s) / 2, oy = (h - 1080 * s) / 2;
    document.body.style.transformOrigin = '0 0';
    document.body.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
  }
  window.addEventListener('resize', ajustarTela);
  function aplicarCfg() {
    ajustarTela();
    document.documentElement.style.setProperty('--acc', cfg.cor);
    document.body.classList.toggle('semanim', !cfg.anim);
    document.body.classList.toggle('discreto', cfg.modo === 'discreto');
    var mb = document.querySelector('.modobtn'); if (mb) mb.textContent = 'Modo: ' + ({ normal: 'Normal', discreto: 'Discreto', ferias: 'Férias' }[cfg.modo] || 'Normal');
    if (!cfg.musica) cfg.musica = { on: true, vol: 40 };
    PAGS.forEach(function (p) {
      var sec = document.getElementById('p-' + p[0]); if (!sec) return;
      var velho = sec.querySelector('svg.bg, .bgimg'); var dim = sec.querySelector('.bgdim');
      var usaDisc = p[0] === 'inicio' && cfg.modo === 'discreto' && cfg.discreto && cfg.discreto.fundo;
      var esc = usaDisc ? cfg.discreto.fundo : cfg.fundo[p[0]], novo, chImg = usaDisc ? 'discreto' : p[0];
      if (esc === 'img' && imgOk[chImg]) {
        novo = document.createElement('div'); novo.className = 'bgimg'; novo.style.backgroundImage = 'linear-gradient(rgba(10,8,30,.62), rgba(10,8,30,0) 34%, rgba(10,8,30,0) 58%, rgba(10,8,30,.6)), url(' + imgOk[chImg] + ')';
      } else {
        var t = document.createElement('div'); t.innerHTML = cenaSVG[esc === 'img' ? PADRAO.fundo[p[0]] : esc] || cenaSVG[PADRAO.fundo[p[0]]]; novo = t.firstChild;
      }
      if (velho) sec.replaceChild(novo, velho); else sec.insertBefore(novo, sec.firstChild);
      if (!dim) { dim = document.createElement('div'); dim.className = 'bgdim'; novo.parentNode.insertBefore(dim, novo.nextSibling); }
      dim.style.opacity = (cfg.escuro || 0) / 100;
    });
  }

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hojeISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function ler(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var tTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.className = 'on'; clearTimeout(tTimer); tTimer = setTimeout(function () { t.className = ''; }, 4500); }
  function diasAte(iso) { var a = new Date(iso + 'T00:00:00'), h = new Date(hojeISO() + 'T00:00:00'); return Math.round((a - h) / 86400000); }

  /* ---------- relógio e clima ---------- */
  function relogio() {
    var d = new Date(), h = d.getHours();
    $('hora').textContent = ('0' + h).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    $('saudacao').textContent = (h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', ' + D.nome + '!';
    $('data').textContent = DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' · おかえり';
  }
  function clima() {
    var c = D.cidade;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon + '&current=temperature_2m&timezone=auto';
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      $('clima').textContent = Math.round(j.current.temperature_2m) + '° em ' + c.nome;
    }).catch(function () { $('clima').textContent = c.nome; });
  }

  /* ---------- apps ---------- */
  function icone(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>'; }
  function renderApps() {
    $('apps').innerHTML = D.apps.map(function (a, i) {
      if (cfg.ocultos[a.nome]) return '';
      return '<div class="app f" data-app="' + i + '" style="background:' + a.cor + '">' + icone(a.icone) + '<span>' + esc(a.nome) + '</span></div>';
    }).join('');
  }
  function carregarAppsTV() {
    if (!tizenOk) return;
    try { tizen.application.getAppsInfo(function (l) { appsTV = l.map(function (x) { return { id: x.id, name: (x.name || '').toLowerCase() }; }); }, function () {}); } catch (e) {}
  }
  function abrirApp(a) {
    window.ultimoLancamento = Date.now();
    if (a.tipo === 'ps5') { toast('Ligue o PS5 pelo botão PS do controle: com o Anynet+ ligado, a TV troca de entrada sozinha.'); return; }
    if (!tizenOk) { toast('Abriria o ' + a.nome + ' (na TV).'); return; }
    var achado = null;
    for (var i = 0; i < appsTV.length && !achado; i++) {
      for (var k = 0; k < a.match.length; k++) { if (appsTV[i].name.indexOf(a.match[k]) >= 0) { achado = appsTV[i].id; break; } }
    }
    var ids = [];
    if (achado) ids.push(achado);
    if (a.id) ids.push(a.id);
    if (!ids.length) { toast('Não achei o ' + a.nome + ' na TV. Instale pela loja de apps da Samsung.'); return; }
    (function tenta(n) {
      tizen.application.launch(ids[n], function () {}, function () {
        if (n + 1 < ids.length) tenta(n + 1); else toast('Não consegui abrir o ' + a.nome + '. Ele está instalado?');
      });
    })(0);
  }

  /* ---------- projetos ---------- */
  /* Projetos vêm do repositório privado central-dados (os mesmos do celular), quando a TV tem a chave
     (arquivo local dados_chave.js, criado pelo "Guardar chave dos dados.bat"). Sem chave, usa data.js. */
  var CORES_PJ = ['#FF7FA8', '#8FE3FF', '#FFD36E', '#9CF2A8', '#C8A6FF', '#FFB38A', '#7FD1C1', '#F59ACB'];
  function projetosSync() {
    var d = ler('dados-proj', null); if (!d || !d.projetos) return null;
    var antigos = {}; D.projetos.forEach(function (p) { antigos[p.nome.toLowerCase().slice(0, 12)] = p; });
    var TAGS = { automacao: 'Casa', simulador: 'Trabalho', 'skills-trabalho': 'Trabalho', tv: 'TV', ps5: 'Jogos', evo: 'SF6', analisador: 'SF6', canal: 'Twitch' };
    return Object.keys(d.projetos).map(function (k) { d.projetos[k]._id = k; return d.projetos[k]; })
      .filter(function (p) { return p.status === 'ativo'; })
      .sort(function (a, b) { return (a.ordem || 99) - (b.ordem || 99) || a.nome.localeCompare(b.nome); })
      .map(function (p, i) {
        var velho = antigos[p.nome.toLowerCase().slice(0, 12)] || {}, et = p.etapas || [];
        var feitas = et.filter(function (e) { return e.ok; }).length, prox = et.filter(function (e) { return !e.ok; })[0];
        return { nome: p.nome, tag: velho.tag || TAGS[p._id] || 'Projeto', cor: velho.cor || CORES_PJ[i % CORES_PJ.length], passo: prox ? prox.t : 'Tudo feito ✓', conta: feitas + '/' + et.length };
      });
  }
  function renderProjetos() {
    var lista = projetosSync() || D.projetos;
    $('projetos').className = 'grid4' + (lista.length > 4 ? ' muitos' : '');
    $('projetos').innerHTML = lista.slice(0, 8).map(function (p) {
      return '<div class="proj f"><span class="tag" style="background:' + p.cor + '">' + esc(p.tag) + '</span><span class="nome">' + esc(p.nome) + '</span><span class="lbl">Próximo passo' + (p.conta ? ' · ' + p.conta : '') + '</span><span class="passo">' + esc(p.passo) + '</span></div>';
    }).join('');
  }
  /* ---------- dados compartilhados com o celular (repositório privado central-dados) ----------
     Cada arquivo é lido a cada 5 min e quando a Central volta para a tela. Mudanças feitas na TV
     viram operações numa fila: lê a versão mais nova, aplica, grava (igual ao celular). */
  var GH_BASE = 'https://api.github.com/repos/DuckDaniels1609/central-dados/contents/';
  function ghHdr() { return { Authorization: 'Bearer ' + window.DADOS_GH, Accept: 'application/vnd.github+json' }; }
  function b64dec(t) { return decodeURIComponent(escape(atob(t.replace(/\s/g, '')))); }
  function b64enc(t) { return btoa(unescape(encodeURIComponent(t))); }
  function ghLer(arq) {
    return fetch(GH_BASE + arq + '?t=' + Date.now(), { headers: ghHdr(), cache: 'no-store' })
      .then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j) return { txt: '{}', dados: {}, sha: null }; var txt = b64dec(j.content); return { txt: txt, dados: JSON.parse(txt), sha: j.sha }; });
  }
  function ghGravar(arq, dados, sha) {
    dados.atualizado = new Date().toISOString();
    var h = ghHdr(); h['Content-Type'] = 'application/json';
    return fetch(GH_BASE + arq, { method: 'PUT', headers: h, body: JSON.stringify(sha ? { message: 'tv: ' + arq, content: b64enc(JSON.stringify(dados, null, 1)), sha: sha } : { message: 'tv: ' + arq, content: b64enc(JSON.stringify(dados, null, 1)) }) })
      .then(function (r) { if (r.status === 409 || r.status === 422) throw new Error('conflito'); if (!r.ok) throw new Error('HTTP ' + r.status); });
  }
  var GH_OPS = {
    modo: function (d, a) { if (a.em >= (d.modoEm || 0)) { d.modo = a.v; d.modoEm = a.em; } },
    marca: function (d, a) {
      d.dias = d.dias || {}; var dia = d.dias[a.d] || (d.dias[a.d] = {});
      if (a.v) dia[a.k] = true; else delete dia[a.k];
      var lim = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
      Object.keys(d.dias).forEach(function (k) { if (k < lim) delete d.dias[k]; });
    },
    inventario: function (d, a) { d.musicas = a.musicas; d.fundosImg = a.fundosImg; },
    agenda: function (d, a) { d.reunioes = a.lista; },
    diag: function (d, a) { d.linhas = a.linhas; d.em = new Date().toISOString(); },
    tarNova: function (d, a) { d.tarefas = d.tarefas || []; if (!d.tarefas.some(function (t) { return t.id === a.id; })) { var nt = { id: a.id, t: a.t, ok: false, criada: a.em, cat: a.cat || 'pessoal', cli: a.cli || '', resp: a.resp || [] }; if (a.data) nt.data = a.data; d.tarefas.push(nt); } },
    evNovo: function (d, a) { d.eventos = d.eventos || []; if (!d.eventos.some(function (e) { return e.id === a.id; })) d.eventos.push({ id: a.id, d: a.d, h: a.h || '', t: a.t, tipo: a.tipo, anual: !!a.anual }); },
    tarApaga: function (d, a) { d.tarefas = (d.tarefas || []).filter(function (t) { return t.id !== a.id; }); },
    tarOk: function (d, a) { (d.tarefas || []).forEach(function (t) { if (t.id === a.id) { t.ok = a.ok; if (a.ok) t.feita = a.em; } }); },
    evApaga: function (d, a) { d.eventos = (d.eventos || []).filter(function (e) { return e.id !== a.id; }); },
    cliNovo: function (d, a) { d.clientes = d.clientes || []; if (a.nome && !d.clientes.some(function (c) { return c.toLowerCase() === a.nome.toLowerCase(); })) d.clientes.push(a.nome); }
  };
  var ghFila = ler('gh-fila', {}), ghGravando = {}, ghTimer = {};
  function ghOp(arq, op) {
    if (!window.DADOS_GH) return;
    (ghFila[arq] = ghFila[arq] || []).push(op); gravar('gh-fila', ghFila);
    clearTimeout(ghTimer[arq]); ghTimer[arq] = setTimeout(function () { ghEnviar(arq, 0); }, 1500);
  }
  function ghEnviar(arq, tent) {
    var fila = ghFila[arq] || []; if (ghGravando[arq] || !fila.length) return;
    ghGravando[arq] = true; var lote = fila.slice();
    ghLer(arq).then(function (r) {
      lote.forEach(function (a) { try { GH_OPS[a.op](r.dados, a); } catch (e) {} });
      return ghGravar(arq, r.dados, r.sha);
    }).then(function () {
      ghFila[arq] = (ghFila[arq] || []).slice(lote.length); gravar('gh-fila', ghFila); ghGravando[arq] = false;
      if (ghFila[arq].length) ghEnviar(arq, 0);
    }).catch(function (e) {
      ghGravando[arq] = false;
      if (e.message === 'conflito' && tent < 3) setTimeout(function () { ghEnviar(arq, tent + 1); }, 800);
      else registrar('Dados: não consegui gravar ' + arq + ' (' + e.message + ')');
    });
  }
  /* lê um arquivo e entrega os dados já com as mudanças da TV que ainda estão na fila */
  function ghBuscar(arq, chaveLocal, cb) {
    ghLer(arq).then(function (r) {
      (ghFila[arq] || []).forEach(function (a) { try { GH_OPS[a.op](r.dados, a); } catch (e) {} });
      var txt = JSON.stringify(r.dados), mudou = txt !== localStorage.getItem(chaveLocal);
      if (mudou) localStorage.setItem(chaveLocal, txt);
      cb(r.dados, mudou);
    }).catch(function (e) { registrar('Dados: não consegui ler ' + arq + ' (' + e.message + ')'); });
  }

  /* modo: quem mudou por último (TV, celular ou Siri) vale, mesmo se a TV estava desligada */
  function estadoAplicar(d) {
    if (!d || !d.modoEm || d.modoEm <= (cfg.modoEm || 0)) return;
    cfg.modoEm = d.modoEm;
    if ((d.modo || 'normal') !== (cfg.modo || 'normal')) { mudarModo(d.modo || 'normal', true); registrar('Modo ' + d.modo + ' (escolhido no celular)'); }
    else gravar('cfg', cfg);
  }

  /* marcações do dia: mesmas chaves no celular — sf6-N, gym-N, fut, fim */
  function marcLocais(dia) {
    var h = hojeISO(), out = {}, sf = ler('sf6:' + h, {}), g = ler('gym:' + h, {});
    Object.keys(sf).forEach(function (i) { if (sf[i]) out['sf6-' + i] = true; });
    for (var n = 0; n < 40; n++) { var x = localStorage.getItem('gymx:' + h + ':' + n); if (x && JSON.parse(x)[0]) out['gym-' + n] = true; }
    if (g.fut) out.fut = true; if (g.fim) out.fim = true;
    return out;
  }
  function marcAplicar(d) {
    var h = hojeISO(), dia = (d && d.dias && d.dias[h]) || {};
    var antes = JSON.stringify(marcLocais());
    var sf = {}, g = ler('gym:' + h, {});
    Object.keys(dia).forEach(function (k) {
      if (k.indexOf('sf6-') === 0) sf[k.slice(4)] = true;
    });
    gravar('sf6:' + h, sf);
    for (var n = 0; n < 40; n++) { var k2 = 'gymx:' + h + ':' + n; if (dia['gym-' + n]) gravar(k2, { 0: true }); else if (localStorage.getItem(k2)) localStorage.removeItem(k2); }
    g.fut = !!dia.fut; g.fim = !!dia.fim; gravar('gym:' + h, g);
    if (JSON.stringify(marcLocais()) !== antes) {
      var fk = foco && (foco.getAttribute('data-chk') || foco.getAttribute('data-act'));
      renderTreino(); renderAcademia();
      if (fk && !cfgAberto) { var el = paginaEl(pagina).querySelector('[data-chk="' + fk + '"],[data-act="' + fk + '"]'); foco = null; focar(el || focoPadrao()); }
      registrar('Marcações atualizadas do celular');
    }
  }
  function marcChave(ck) {
    var p = ck.split('|'), base = p[0], i = p[1];
    if (base.indexOf('sf6:') === 0) return 'sf6-' + i;
    if (base.indexOf('gymx:') === 0) return 'gym-' + base.split(':')[2];
    return null;
  }

  /* tarefas e estante: cartões no Início */
  function renderTarefasTV() {
    var el = $('tv-tarefas'); if (!el) return;
    var d = ler('dados-tar', null), lista = d && d.tarefas ? d.tarefas.filter(function (t) { return !t.ok; }) : [];
    if (!d) { el.parentNode.style.display = 'none'; return; }
    el.parentNode.style.display = '';
    el.innerHTML = lista.length ? '<b>' + lista.length + (lista.length === 1 ? ' tarefa' : ' tarefas') + '</b> · ' + lista.slice(0, 2).map(function (t) { return esc(t.t); }).join(' · ') : 'Nenhuma tarefa pendente ✓';
  }
  function renderEvoPassos() {
    var el = $('evo-passos'); if (!el) return;
    var d = ler('dados-proj', null), p = d && d.projetos && d.projetos.evo;
    if (!p) { $('evo-passos-card').style.display = 'none'; return; }
    $('evo-passos-card').style.display = '';
    var falta = (p.etapas || []).filter(function (e) { return !e.ok; });
    el.innerHTML = falta.length ? falta.slice(0, 3).map(function (e) { return '<div class="passo-evo">• ' + esc(e.t) + '</div>'; }).join('') + (falta.length > 3 ? '<div class="passo-evo" style="opacity:.7">+' + (falta.length - 3) + ' etapas</div>' : '') : '<div class="passo-evo">Tudo feito ✓</div>';
  }
  var CAT_NOME = { trabalho: 'Trabalho', pessoal: 'Pessoal', condominio: 'Condomínio' };
  function renderTrabalhoTV() {
    var el = $('tv-trab'); if (!el) return;
    var d = ler('dados-tar', null);
    var L = d && d.tarefas ? d.tarefas.filter(function (t) { var r = t.resp || []; return !t.ok && (t.cat || 'pessoal') === 'trabalho' && (!r.length || r.indexOf('DBA') >= 0); }) : [];
    el.innerHTML = !d ? '–' : L.length ? '<b>' + L.length + '</b> · ' + L.slice(0, 2).map(function (t) { var r = (t.resp || []).filter(function (x) { return x !== 'DBA'; }); return (t.cli ? '<b>' + esc(t.cli) + '</b>: ' : '') + esc(t.t) + (r.length ? ' <span style="opacity:.7">(' + esc(r.join(', ')) + ')</span>' : ''); }).join(' · ') : 'nada pendente ✓';
  }
  function renderEstanteTV() {
    var el = $('tv-estante'); if (!el) return;
    var d = ler('dados-est', null); if (!d || !d.jogos) { el.parentNode.style.display = 'none'; return; }
    var P = d.progresso || {}, J = d.jogos;
    var ids = Object.keys(J).filter(function (k) { return (P[k] || {}).status === 'jogando' && (J[k].trophies || []).length; })
      .sort(function (a, b) { return (J[a].order || 99) - (J[b].order || 99); });
    el.parentNode.style.display = '';
    if (!ids.length) { el.textContent = 'Nenhum jogo em andamento'; return; }
    var g = J[ids[0]], tr = g.trophies, done = (P[ids[0]] || {}).done || {}, f = tr.filter(function (t) { return done[t.id]; }).length;
    el.innerHTML = '<b>' + esc(g.short || g.name) + '</b> · ' + f + '/' + tr.length + ' · faltam ' + (tr.length - f) + (ids.length > 1 ? ' <span style="opacity:.7">+' + (ids.length - 1) + '</span>' : '');
  }

  /* configuração vinda do Editor (artefato): modo discreto com fundo e músicas próprios */
  var LISTA_DC = null;
  function configAplicar(d) {
    if (!d) return;
    var exAntes = JSON.stringify(cfg.despertar.extras || {}), exNovo = d.despertarExtra || {};
    var hj = isoD(new Date()); Object.keys(exNovo).forEach(function (k) { if (k < hj) delete exNovo[k]; });
    if (JSON.stringify(exNovo) !== exAntes) { cfg.despertar.extras = exNovo; gravar('cfg', cfg); agendarAlarmeSistema(); registrar('Despertar extra: ' + (Object.keys(exNovo).map(function (k) { return k.split('-').reverse().slice(0, 2).join('/') + ' ' + exNovo[k]; }).join(', ') || 'nenhum')); }
    var disc = d.discreto || {}, antes = JSON.stringify(cfg.discreto || {});
    cfg.discreto = { fundo: disc.fundo || '', musicas: disc.musicas || [] };
    var nomes = cfg.discreto.musicas;
    LISTA_DC = nomes.length ? LISTA_N.filter(function (s) { var n = s.split('/').pop().replace(/\.mp3$/i, ''); return nomes.indexOf(n) >= 0; }) : null;
    if (LISTA_DC && !LISTA_DC.length) LISTA_DC = null;
    if (JSON.stringify(cfg.discreto) !== antes) {
      gravar('cfg', cfg); aplicarCfg();
      if (cfg.modo === 'discreto') { trocarLista(); srcAtual = null; tocarMusica(); }
      if (d.versao) registrar('Modo discreto atualizado pelo Editor');
    }
  }
  function agendaEnviar() {
    if (!window.DADOS_GH) return;
    var lista = EVENTOS.map(function (e) { return { d: isoD(e.ini), h: e.diaTodo ? '' : hhmm(e.ini), f: e.diaTodo ? '' : hhmm(e.fim), t: e.titulo, dt: !!e.diaTodo }; });
    var chave = JSON.stringify(lista); if (ler('ag-enviada', '') === chave) return;
    gravar('ag-enviada', chave); ghOp('agenda.json', { op: 'agenda', lista: lista });
  }
  function inventarioEnviar() {
    var musicas = LISTA_N.map(function (s) { return s.split('/').pop().replace(/\.mp3$/i, ''); });
    var fundosImg = Object.keys(imgOk).filter(function (k) { return imgOk[k]; });
    var chave = JSON.stringify([musicas, fundosImg]);
    if (ler('inv-enviado', '') === chave) return;
    gravar('inv-enviado', chave); ghOp('tv-inventario.json', { op: 'inventario', musicas: musicas, fundosImg: fundosImg });
  }

  /* caixa de entrada (Siri): issues abertos no repositório viram tarefa, evento ou troca de modo */
  /* Caixa de entrada da Central (Siri): interpreta uma frase ditada e devolve as operações.
     Usado igual no celular (dados.js) e na TV (app.js). Sem dependências. */
  /* Caixa de entrada da Central (Siri): interpreta uma frase ditada e devolve as operações.
     Usado igual no celular (dados.js) e na TV (app.js). Sem dependências. */
  var ENTRADA = (function () {
    var DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    var MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    var GENERICAS = ('servicos maritimos maritima maritimo consultoria energia energy petroleo oleo gas navegacao transporte transportes brasil brazil brasileira comercio industria engenharia participacoes investimentos logistica offshore group grupo holding sociedade empresa internacional international services service shipping marine oil the de do da dos das e and sa ltda importacao exportacao contrato contratos revisar parecer memorando consulta reuniao equipe tributario tributaria fiscal juridico legal').split(' ');
    function sem(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
    function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    /* troca um trecho achado no texto normalizado pelo mesmo trecho no original (mesmo tamanho) */
    function corta(o, n, ini, fim) { return { o: o.slice(0, ini) + ' ' + o.slice(fim), n: n.slice(0, ini) + ' ' + n.slice(fim) }; }
    function acha(T, re) { var m = re.exec(T.n); if (!m) return null; var r = corta(T.o, T.n, m.index, m.index + m[0].length); T.o = r.o; T.n = r.n; return m; }

    function interpretar(texto, hoje, clientes) {
      hoje = hoje || new Date(); hoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      var T = { o: ' ' + String(texto || '').replace(/\s+/g, ' ').trim() + ' ' }; T.n = sem(T.o);
      if (T.n.trim().length < 2) return null;

      /* modo da TV */
      var mm = /\bmodo\s+(normal|discreto|ferias)\b/.exec(T.n);
      if (mm && T.n.replace(/\b(tv|televisao|coloca|coloque|bota|botar|deixa|deixar|a|o|em|no|na|modo|normal|discreto|ferias)\b/g, '').trim().length < 3) return { tipo: 'modo', v: mm[1] };

      /* apagar / concluir: "apaga o aniversário de amanhã", "feito: pedir remédio" */
      var acao = null;
      if (acha(T, /^\s*(por favor )?(apaga|apagar|apague|exclui|excluir|exclua|remove|remover|remova|deleta|deletar|cancela|cancelar|desmarca|desmarcar)\b[:,]?/)) acao = 'apagar';
      else if (acha(T, /^\s*(feito|feita|conclui|concluir|concluido|concluida|terminei|finalizei|ja fiz|marca(r)? como (feito|feita|concluido|concluida))\b[:,]?/)) acao = 'feito';
      if (acao) acha(T, /^\s*(a |o |as |os )?(minha |meu )?/);

      /* tipo */
      var tipo = 'tarefa', cat = 'pessoal';
      var mAn = acha(T, /^\s*(novo |nova |um |uma )?aniversario( de| do| da)?\b[:,]?/), prepAn = '';
      if (mAn) { tipo = 'aniversario'; prepAn = (mAn[2] || ' de').trim(); }
      else if (acha(T, /^\s*(novo |nova |um |uma )?(evento|compromisso)\b[:,]?/)) tipo = 'evento';
      else if (acha(T, /^\s*(novo |nova |um |uma )?(lembrete|me lembra(r)? de|lembrar de)\b[:,]?/)) tipo = 'lembrete';
      else acha(T, /^\s*(nova |uma )?tarefa\b[:,]?/);
      if (tipo === 'tarefa') {
        if (acha(T, /^\s*(de |do |da )?(trabalho|escritorio)\b[:,]?/) || /\b(trabalho|escritorio)\b/.test(T.n)) { cat = 'trabalho'; acha(T, /\b(entrou (um |uma )?(novo |nova )?)?(trabalho|escritorio)( novo)?\b( (do|no|de) escritorio)?[:,]?/); }
        else if (acha(T, /^\s*(de |do |da )?condominio\b[:,]?/)) cat = 'condominio';
        else acha(T, /^\s*(de |do |da )?pessoal\b[:,]?/);
      }

      /* data */
      var data = null, m;
      if ((m = acha(T, /\b(para |pra |ate |no |na |em )?(depois de amanha)\b/))) data = new Date(hoje.getTime() + 2 * 864e5);
      else if ((m = acha(T, /\b(para |pra |ate )?amanha\b/))) data = new Date(hoje.getTime() + 864e5);
      else if ((m = acha(T, /\b(para |pra |ate )?hoje\b/))) data = new Date(hoje);
      else if ((m = acha(T, /\b(para |pra |ate |no |na |em |dia )*(dia )?(\d{1,2})\s*(\/|de)\s*(\d{1,2}|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(\s*(\/|de)\s*(\d{2,4}))?\b/))) {
        var mes = /^\d+$/.test(m[5]) ? +m[5] - 1 : MESES.indexOf(m[5]), ano = m[8] ? (m[8].length === 2 ? 2000 + +m[8] : +m[8]) : hoje.getFullYear();
        data = new Date(ano, mes, +m[3]); if (!m[8] && data < hoje && tipo !== 'aniversario') data.setFullYear(ano + 1);
      }
      else if ((m = acha(T, /\b(para |pra |ate |no |na |nessa |nesta |essa |esta |proxima |proximo )*(segunda|terca|quarta|quinta|sexta|sabado|domingo)(-feira)?( que vem)?\b/))) {
        var alvo = DIAS.indexOf(m[2]), dd = (alvo - hoje.getDay() + 7) % 7 || 7; data = new Date(hoje.getTime() + dd * 864e5);
      }
      else if ((m = acha(T, /\b(para |pra |ate |no |em )?dia (\d{1,2})\b/))) {
        data = new Date(hoje.getFullYear(), hoje.getMonth(), +m[2]); if (data < hoje) data = new Date(hoje.getFullYear(), hoje.getMonth() + 1, +m[2]);
      }
      var hora = '';
      if ((m = acha(T, /\b(as |a partir das |de )?(\d{1,2})(:|h| horas?\s?e?\s?)(\d{2})?( horas?)?\b/))) { var h = +m[2]; if (h < 24) hora = ('0' + h).slice(-2) + ':' + (m[4] || '00'); }

      /* responsáveis (só trabalho) */
      var resp = [];
      if (cat === 'trabalho') {
        ['mss', 'paa', 'dba'].forEach(function (r) { var re = new RegExp('\\b(com |e |para |pra )?(' + r + '|' + r.split('').join(' ') + ')\\b'); if (acha(T, re)) resp.push(r.toUpperCase()); });
        if (resp.indexOf('DBA') < 0) resp.unshift('DBA');
      }

      /* cliente: o nome mais longo da lista que aparece na frase */
      var cli = '';
      if (cat === 'trabalho' && clientes && clientes.length) {
        var melhor = null;
        clientes.forEach(function (c) {
          var cn = sem(c).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
            .replace(/\s+(ltda|s a|sa|s\/a|eireli|me|epp|limited|ltd|inc|llc|gmbh|bv|as|asa|plc|pte|co)$/g, '').replace(/\s+(e participacoes|participacoes|do brasil|brasil)$/g, '').trim();
          if (cn.length < 3) return;
          var pal = cn.split(' '), alvos = [cn];
          if (pal.length > 2) alvos.push(pal.slice(0, 2).join(' '));
          if (pal.length > 3) alvos.push(pal.slice(0, 3).join(' '));
          if (pal.length > 1 && pal[0].length >= 6) alvos.push(pal[0]);
          alvos.forEach(function (alvo, k) {
            if (alvo.length < 4) return;
            if (k > 0 && alvo.split(' ').every(function (w) { return GENERICAS.indexOf(w) >= 0 || w.length < 3; })) return;
            var i = T.n.replace(/[^a-z0-9 ]/g, ' ').indexOf(' ' + alvo + ' ');
            if (i >= 0 && (!melhor || alvo.length > melhor.len)) melhor = { nome: c, i: i + 1, len: alvo.length };
          });
        });
        if (melhor) { cli = melhor.nome; var r2 = corta(T.o, T.n, melhor.i, melhor.i + melhor.len); T.o = r2.o; T.n = r2.n; }
      }
      if (cat === 'trabalho' && !cli && (m = acha(T, /\b(do |da |de |para o |para a |pro |pra )?cliente\s+([a-z0-9][^,;.]*?)(?=\s*(,|;|\.|$| para | pra | ate | dia | com ))/))) cli = T.o.slice(0, 0) + m[2].replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim();
      else acha(T, /\b(do |da |de |para o |para a )?cliente\b/);

      if (acao) {
        var alvo = sem(T.o).replace(/[^a-z0-9 ]/g, ' ').replace(/\b(a|o|as|os|de|do|da|que|tem|esta|marcado|marcada|no|na|para|pra|tarefa|evento|lembrete)\b/g, ' ').replace(/\s+/g, ' ').trim();
        return { tipo: acao, alvo: alvo, data: data ? iso(data) : '', tipoAlvo: tipo === 'tarefa' && !/\btarefa\b/.test(sem(texto)) ? '' : tipo };
      }
      var titulo = T.o.replace(/\s+([,;.])/g, '$1').replace(/^[\s,;:.\-]+|[\s,;:.\-]+$/g, '').replace(/\s{2,}/g, ' ').replace(/^(de|do|da|que|e)\s+/i, '').replace(/^[\s,;:.\-]+/, '');
      if (tipo === 'aniversario') titulo = 'Aniversário ' + prepAn + ' ' + (titulo || '');
      if (!titulo) titulo = 'Sem título';
      titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
      if (tipo === 'tarefa') return { tipo: 'tarefa', t: titulo, cat: cat, cli: cli, resp: resp, data: data ? iso(data) : '' };
      return { tipo: tipo, t: titulo, d: iso(data || hoje), h: tipo === 'aniversario' ? '' : hora, anual: tipo === 'aniversario', semData: !data };
    }
    /* acha a tarefa ou evento que a frase quer apagar/concluir */
    function achar(r, tarefas, eventos) {
      var palavras = r.alvo ? r.alvo.split(' ').filter(function (w) { return w.length > 2; }) : [];
      var cands = [];
      (tarefas || []).forEach(function (t) { if (r.tipo === 'feito' && t.ok) return; cands.push({ kind: 'tar', id: t.id, t: t.t + ' ' + (t.cli || ''), d: t.data || '', tp: 'tarefa', anual: false }); });
      if (r.tipo === 'apagar') (eventos || []).forEach(function (e) { cands.push({ kind: 'ev', id: e.id, t: e.t, d: e.d, tp: e.tipo || 'evento', anual: !!e.anual }); });
      cands.forEach(function (c) {
        var tn = ' ' + sem(c.t).replace(/[^a-z0-9 ]/g, ' ') + ' ', hit = 0;
        palavras.forEach(function (w) { if (tn.indexOf(' ' + w) >= 0) hit++; });
        c.score = palavras.length ? hit / palavras.length : 0;
        var mesmoDia = r.data && (c.d === r.data || (c.anual && c.d.slice(5) === r.data.slice(5)));
        if (mesmoDia) c.score += palavras.length ? 0.5 : 1;
        if (r.tipoAlvo && c.tp === r.tipoAlvo) c.score += 0.3;
        if (r.data && !mesmoDia && c.d) c.score -= 0.4;
      });
      cands.sort(function (a, b) { return b.score - a.score; });
      var top = cands[0]; if (!top || top.score < 0.6) return null;
      if (cands[1] && Math.abs(cands[1].score - top.score) < 0.01) return null;
      return top;
    }
    return { interpretar: interpretar, achar: achar };
  })();

  var lendoEntrada = false;
  function aplicaLocal(chave, op) { var d = ler(chave, null); if (!d) return; try { GH_OPS[op.op](d, op); localStorage.setItem(chave, JSON.stringify(d)); } catch (e) {} }
  function entradaTV() {
    if (lendoEntrada || !window.DADOS_GH || document.hidden) return;
    lendoEntrada = true;
    var base = 'https://api.github.com/repos/DuckDaniels1609/central-dados/issues';
    fetch(base + '?state=open&per_page=30&t=' + Date.now(), { headers: ghHdr(), cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (L) {
      L = L.filter(function (x) { return !x.pull_request; }).sort(function (a, b) { return a.number - b.number; });
      var mudou = false;
      L.forEach(function (x) {
        var em = Date.parse(x.created_at), cli = (ler('dados-cli', null) || {}).clientes || [], r = ENTRADA.interpretar(x.title + (x.body ? ' ' + x.body : ''), new Date(em), cli), o;
        if (r && (r.tipo === 'apagar' || r.tipo === 'feito')) {
          var al = ENTRADA.achar(r, (ler('dados-tar', null) || {}).tarefas || [], (ler('dados-ev', null) || {}).eventos || []);
          if (!al) registrar('Siri: não achei "' + (r.alvo || x.title) + '"');
          else { o = r.tipo === 'feito' ? { op: 'tarOk', id: al.id, ok: true, em: em } : { op: al.kind === 'tar' ? 'tarApaga' : 'evApaga', id: al.id }; var arq = al.kind === 'tar' ? 'tarefas.json' : 'eventos.json'; ghOp(arq, o); aplicaLocal(al.kind === 'tar' ? 'dados-tar' : 'dados-ev', o); toast((r.tipo === 'feito' ? 'Feito: ' : 'Apaguei: ') + al.t.trim()); registrar('Siri: ' + r.tipo + ' ' + al.t.trim()); mudou = true; }
        }
        else if (r && r.tipo === 'modo') { if ((cfg.modo || 'normal') !== r.v) mudarModo(r.v, true); cfg.modoEm = em; gravar('cfg', cfg); ghOp('estado.json', { op: 'modo', v: r.v, em: em }); registrar('Siri: modo ' + r.v); }
        else if (r && r.tipo === 'tarefa') { o = { op: 'tarNova', id: 's' + x.number, t: r.t, em: em, cat: r.cat, cli: r.cli, resp: r.resp, data: r.data }; ghOp('tarefas.json', o); aplicaLocal('dados-tar', o); if (r.cli) ghOp('clientes.json', { op: 'cliNovo', nome: r.cli }); registrar('Siri: tarefa ' + r.t); toast('Nova tarefa: ' + r.t); mudou = true; }
        else if (r) { o = { op: 'evNovo', id: 's' + x.number, d: r.d, h: r.h, t: r.t, tipo: r.tipo, anual: r.anual }; ghOp('eventos.json', o); aplicaLocal('dados-ev', o); registrar('Siri: ' + r.t); toast('No calendário: ' + r.t); mudou = true; }
        var h2 = ghHdr(); h2['Content-Type'] = 'application/json';
        fetch(base + '/' + x.number, { method: 'PATCH', headers: h2, body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) }).catch(function () {});
      });
      if (mudou) { renderTarefasTV(); renderTrabalhoTV(); renderAgenda(); }
      lendoEntrada = false;
    }).catch(function () { lendoEntrada = false; });
  }

  /* lançamentos de jogos: próximos 8, com capa (Wikipedia) */
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

  var PLAT_COR = { 'PS5': '#4F86F7', 'Xbox': '#5CC46B', 'PC': '#C9CFF0', 'Switch 2': '#FF5A5F', 'Switch': '#FF8A8C' };
  function renderLancTV() {
    var el = $('lanc-grid'); if (!el) return;
    var d = ler('dados-lanc', null); if (!d || !d.jogos) { el.innerHTML = '<div class="card"><span class="vazio">Os lançamentos aparecem aqui quando a TV tiver a chave dos dados.</span></div>'; return; }
    var hj = isoD(new Date()), h0 = new Date(); h0.setHours(0, 0, 0, 0);
    var L = d.jogos.filter(function (j) { return j.d >= hj; }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (b.meu ? 1 : 0) - (a.meu ? 1 : 0); }).slice(0, 8);
    el.innerHTML = L.map(function (j) {
      var p = j.d.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]), falta = Math.round((dt - h0) / 864e5);
      return '<div class="lanc-card' + (j.meu ? ' meu' : '') + '"><div class="lanc-capa" data-capa="' + j.id + '"><span>' + esc(j.nome) + '</span></div><div class="lanc-info"><b>' + (j.meu ? '★ ' : '') + esc(j.nome) + '</b><small>' + DIAS_C[dt.getDay()] + ' ' + p[2] + '/' + p[1] + (falta === 0 ? ' · hoje!' : falta === 1 ? ' · amanhã' : ' · em ' + falta + ' dias') + '</small><div class="plats-tv">' + j.plat.map(function (x) { return '<i style="border-color:' + (PLAT_COR[x] || '#888') + ';color:' + (PLAT_COR[x] || '#ddd') + '">' + esc(x) + '</i>'; }).join('') + '</div></div></div>';
    }).join('');
    CAPAS.aplicar(el, d.jogos);
  }

  /* ---------- botão Home → Central ----------
     A Samsung não deixa trocar a tela inicial. Truque: com a Central rodando em segundo plano, quando a tela inicial
     da Samsung fica ativa, a Central se abre de novo. O botão "Menu Samsung" da Central libera o menu de verdade.
     Diagnóstico vai para diag.json no repositório (só nomes de apps e horários). */
  var diagL = [], diagT = null, menuSamsung = false, voltas = [], homeDesligadoAte = 0, bgAvisos = 0;
  function diagAdd(t) {
    var d = new Date(); diagL.push(('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + ' ' + t);
    if (diagL.length > 80) diagL.shift();
    clearTimeout(diagT); diagT = setTimeout(function () { ghOp('diag.json', { op: 'diag', linhas: diagL.slice() }); }, 4000);
  }
  function ehHomeSamsung(id) { var lista = ler('home-ids', null); if (lista && lista.length) return lista.indexOf(id) >= 0; return /csfs|homescreen|launcher|smarthub|home/i.test(id) && id.indexOf('CtrlTv') < 0; }
  function voltarParaCentral(motivo) {
    if (menuSamsung || Date.now() < homeDesligadoAte || despAtivo) return;
    voltas = voltas.filter(function (t) { return Date.now() - t < 20000; }); voltas.push(Date.now());
    if (voltas.length > 3) { homeDesligadoAte = Date.now() + 10 * 60000; diagAdd('muitas voltas seguidas: pausa de 10 min'); return; }
    diagAdd('voltando para a Central (' + motivo + ')');
    try { tizen.application.launch(tizen.application.getCurrentApplication().appInfo.id, function () {}, function (e) { diagAdd('falhou ao reabrir: ' + (e && e.message)); }); } catch (e) { diagAdd('erro ao reabrir: ' + e.message); }
  }
  (function () {
    if (!window.tizen || !tizen.application) return;
    try {
      tizen.application.addAppStatusChangeListener(function (appId, ativo) {
        diagAdd('app ' + appId + (ativo ? ' ATIVO' : ' inativo'));
        if (ativo && document.hidden && ehHomeSamsung(appId)) setTimeout(function () { voltarParaCentral(appId); }, 300);
      });
      diagAdd('escuta de apps ligada');
    } catch (e) { diagAdd('escuta de apps indisponível: ' + e.message); }
    var ultimaLista = '';
    function listaApps(rotulo) {
      try {
        tizen.application.getAppsContext(function (ctxs) {
          var ids = ctxs.map(function (c) { return c.appId; }).sort().join(', ');
          if (ids !== ultimaLista || rotulo) { diagAdd((rotulo || 'mudou') + ': ' + ids); ultimaLista = ids; }
        }, function (e) { diagAdd('lista de apps falhou: ' + (e && e.message)); });
      } catch (e) { diagAdd('lista de apps indisponível: ' + e.message); }
      try { if (tizen.tvwindow && tizen.tvwindow.getSource) diagAdd('entrada: ' + JSON.stringify(tizen.tvwindow.getSource())); } catch (e2) {}
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { bgAvisos = 0; diagAdd('Central saiu da tela' + (menuSamsung ? ' (Menu Samsung)' : '') + (Date.now() - (window.ultimoLancamento || 0) < 5000 ? ' (abriu app pela Central)' : '')); }
      else { menuSamsung = false; diagAdd('Central voltou para a tela'); }
    });
  })();

  function dadosSync() {
    if (!window.DADOS_GH) return;
    ghBuscar('projetos.json', 'dados-proj', function (d, mudou) { if (mudou) { renderProjetos(); renderEvoPassos(); registrar('Projetos atualizados do celular'); } });
    ghBuscar('estado.json', 'dados-estado', function (d) { estadoAplicar(d); });
    ghBuscar('marcacoes.json', 'dados-marc', function (d) { marcAplicar(d); });
    ghBuscar('tarefas.json', 'dados-tar', function (d, mudou) { if (mudou) { renderTarefasTV(); renderTrabalhoTV(); renderAgenda(); } });
    ghBuscar('estante.json', 'dados-est', function (d, mudou) { if (mudou) renderEstanteTV(); });
    ghBuscar('config.json', 'dados-cfg', function (d) { configAplicar(d); });
    ghBuscar('eventos.json', 'dados-ev', function (d, mudou) { if (mudou) renderAgenda(); });
    ghBuscar('clientes.json', 'dados-cli', function () {});
    ghBuscar('lancamentos.json', 'dados-lanc', function (d, mudou) { if (mudou) renderLancTV(); });
    Object.keys(ghFila).forEach(function (a) { ghEnviar(a, 0); });
  }

  /* ---------- treino SF6 ---------- */
  function checklist(lista, chave) {
    var feitos = ler(chave, {});
    return lista.map(function (it, i) {
      var t = typeof it === 'string' ? it : it[0], d = typeof it === 'string' ? '' : it[1];
      var ok = !!feitos[i];
      return '<div class="chk f' + (ok ? ' ok' : '') + '" data-chk="' + chave + '|' + i + '"><span class="box">' + (ok ? '✓' : '') + '</span><span class="t">' + esc(t) + '</span>' + (d ? '<span class="d">' + esc(d) + '</span>' : '') + '</div>';
    }).join('');
  }
  function renderTreino() {
    var dow = new Date().getDay(), dia = D.sf6[dow];
    $('treino-titulo').textContent = 'Evo Brazil 2027';
    $('treino-sub').textContent = 'Treino de hoje · ' + DIAS[dow];
    renderEvoPassos();
    $('sf6-tarefas').innerHTML = checklist(dia.tarefas, 'sf6:' + hojeISO());
    $('sf6-semana').innerHTML = D.sf6.map(function (s, i) {
      var j = (i + 1) % 7; s = D.sf6[j]; /* começa na segunda */
      return '<div class="dia' + (j === dow ? ' hoje' : '') + '"><b>' + DIAS_C[j] + '</b><span>' + esc(s.curto) + '</span></div>';
    }).join('');
    var hoje = hojeISO(), fase = null;
    D.fases.forEach(function (f) { if (hoje >= f.ini && hoje <= f.fim) fase = f.nome; });
    if (!fase && hoje < D.fases[0].ini) fase = 'Pré-temporada: a Fase 1 começa em ' + D.fases[0].ini.slice(8) + '/' + D.fases[0].ini.slice(5, 7);
    if (!fase) fase = 'Semana da Evo!';
    $('fase').textContent = fase;
    var n = diasAte(D.evo);
    $('evo1').textContent = n > 0 ? n : 0;
    if (!D.erros.lista.length) {
      $('erros-tit').textContent = 'Meus erros mais comuns';
      $('erros').innerHTML = '<span class="vazio">Ainda sem partidas analisadas. Depois da primeira sessão, os erros aparecem aqui.</span>';
      $('meta').textContent = D.erros.meta;
      $('hoje-sf6').textContent = 'SF6: ' + dia.curto;
      return;
    }
    var max = D.erros.lista[0][1];
    $('erros-tit').textContent = 'Meus erros mais comuns · sessão de ' + D.erros.sessao;
    $('erros').innerHTML = D.erros.lista.map(function (e, i) {
      return '<div class="erro"><div class="l"><span>' + esc(e[0]) + '</span><b style="font-size:22px">' + e[1] + '</b></div><div class="bar"><i style="width:' + Math.round(e[1] / max * 100) + '%' + (i === 0 ? ';background:var(--acc)' : '') + '"></i></div></div>';
    }).join('');
    $('meta').textContent = D.erros.meta;
    $('hoje-sf6').textContent = 'SF6: ' + dia.curto;
  }

  /* ---------- academia ---------- */
  function renderAcademia() {
    var dow = new Date().getDay(), A = D.academia, s = A.semana[dow], hoje = hojeISO();
    var est = ler('gym:' + hoje, {});
    if (!s.t) {
      $('gym-titulo').textContent = 'Descanso';
      $('gym-aviso').textContent = 'Domingo é dia de descansar.';
      $('gym-lista').className = 'card col';
      $('gym-lista').innerHTML = '<h3>Sem treino hoje</h3><span class="sub">Alongar 10 minutos já ajuda.</span>';
      $('gym-fim').style.display = 'none';
      $('hoje-gym').textContent = 'Academia: descanso';
    } else {
      var p = A.planos[s.t];
      $('gym-titulo').textContent = 'Treino ' + s.t + ' · ' + p.nome;
      $('gym-aviso').textContent = s.j ? (s.t === 'A' ? 'Dia de futevôlei: treine antes do jogo ou em outro horário.' : 'Dia de futevôlei: este treino é opcional.') : 'Bom treino!';
      var itens = [], html = '';
      p.g.forEach(function (g) {
        html += '<h4>' + esc(g[0]) + '</h4>';
        g[1].forEach(function (x) { html += checklist([x], 'gymx:' + hoje + ':' + itens.length).replace('|0', '|0'); itens.push(x); });
      });
      $('gym-lista').className = 'card col' + (itens.length > 7 ? ' duas' : '');
      $('gym-lista').innerHTML = html;
      $('gym-fim').style.display = '';
      $('gym-fim').textContent = est.fim ? 'Treino concluído ✓' : 'Acabei o treino';
      $('gym-fim').className = 'bigbtn acc-bg f' + (est.fim ? ' feito' : '') + (foco === $('gym-fim') ? ' focus' : '');
      $('hoje-gym').textContent = 'Academia: Treino ' + s.t + (s.j ? ' + futevôlei' : '');
    }
    var fut = !!est.fut;
    $('fut').innerHTML = '<h3 style="color:#FFD36E">Futevôlei' + (s.j ? ' · dia de jogo' : '') + '</h3>' +
      '<div class="chk f' + (fut ? ' ok' : '') + '" data-act="fut"><span class="box">' + (fut ? '✓' : '') + '</span><span class="t">Joguei futevôlei hoje</span></div>' +
      (s.j ? '<span style="font-size:23px;line-height:1.4;color:#DCE6F7">Leve água e água de coco. Se a última refeição foi há mais de 3 h, coma 1 banana uns 60 min antes.</span>' : '');
    $('gym-semana').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (j) {
      var x = A.semana[j];
      return '<div class="dia' + (j === dow ? ' hoje' : '') + '"><b>' + DIAS_C[j] + '</b><span class="t">' + (x.t || '–') + '</span><span>' + (x.j ? 'futevôlei' : x.t ? '' : 'descanso') + '</span></div>';
    }).join('');
  }


  /* ---------- agenda (link ICS publicado no Outlook) ---------- */
  var EVENTOS = [], agErro = null, agAtualizado = null;
  function icsData(v, params) {
    /* 20261029T140000Z | 20261029T140000 (hora local / TZID) | 20261029 (dia inteiro) */
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(v || '');
    if (!m) return null;
    if (!m[4]) return { d: new Date(+m[1], +m[2] - 1, +m[3]), diaTodo: true };
    if (m[7]) return { d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))) };
    return { d: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) };
  }
  function lerICS(txt) {
    var linhas = txt.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/), evs = [], ev = null;
    linhas.forEach(function (l) {
      if (l === 'BEGIN:VEVENT') { ev = { ex: [] }; return; }
      if (l === 'END:VEVENT') { if (ev) evs.push(ev); ev = null; return; }
      if (!ev) return;
      var i = l.indexOf(':'); if (i < 0) return;
      var chave = l.slice(0, i), val = l.slice(i + 1), nome = chave.split(';')[0];
      if (nome === 'SUMMARY') ev.titulo = val.replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\n/gi, ' ').replace(/\\\\/g, '\\');
      else if (nome === 'DTSTART') ev.ini = icsData(val);
      else if (nome === 'DTEND') ev.fim = icsData(val);
      else if (nome === 'RRULE') ev.rrule = val;
      else if (nome === 'EXDATE') val.split(',').forEach(function (x) { var d = icsData(x); if (d) ev.ex.push(d.d.getTime()); });
      else if (nome === 'RECURRENCE-ID') ev.recId = icsData(val);
      else if (nome === 'UID') ev.uid = val;
      else if (nome === 'STATUS') ev.status = val;
      else if (nome === 'TRANSP') ev.transp = val;
    });
    return evs;
  }
  function expandir(evs, de, ate) {
    var out = [], trocas = {};
    evs.forEach(function (e) { if (e.recId && e.uid) trocas[e.uid + '|' + e.recId.d.getTime()] = true; });
    var DIAS_ICS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    evs.forEach(function (e) {
      if (!e.ini || e.status === 'CANCELLED') return;
      if (/^\s*(cancelad[oa]s?|canceled|cancelled)\b\s*[:\-–]?/i.test(e.titulo || '')) return;
      var dur = e.fim ? e.fim.d - e.ini.d : (e.ini.diaTodo ? 86400000 : 3600000);
      function add(d) {
        var t = d.getTime();
        if (e.ex.indexOf(t) >= 0) return;
        if (!e.recId && e.uid && trocas[e.uid + '|' + t]) return;
        if (t + dur < de.getTime() || t > ate.getTime()) return;
        out.push({ ini: new Date(t), fim: new Date(t + dur), titulo: e.titulo || '(sem título)', diaTodo: !!e.ini.diaTodo });
      }
      if (!e.rrule || e.recId) { add(e.ini.d); return; }
      var r = {}; e.rrule.split(';').forEach(function (p) { var kv = p.split('='); r[kv[0]] = kv[1]; });
      var freq = r.FREQ, inter = +(r.INTERVAL || 1), cont = r.COUNT ? +r.COUNT : Infinity;
      var ateR = r.UNTIL ? icsData(r.UNTIL).d : null, base = e.ini.d, n = 0;
      var dias = r.BYDAY ? r.BYDAY.split(',').map(function (x) { return DIAS_ICS[x.slice(-2)]; }) : null;
      for (var k = 0; k < 2000 && n < cont; k++) {
        var cand = [];
        if (freq === 'DAILY') cand.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + k * inter, base.getHours(), base.getMinutes()));
        else if (freq === 'WEEKLY') {
          var ini = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay() + k * 7 * inter, base.getHours(), base.getMinutes());
          (dias || [base.getDay()]).slice().sort().forEach(function (dw) { cand.push(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + dw, ini.getHours(), ini.getMinutes())); });
        } else if (freq === 'MONTHLY') cand.push(new Date(base.getFullYear(), base.getMonth() + k * inter, base.getDate(), base.getHours(), base.getMinutes()));
        else if (freq === 'YEARLY') cand.push(new Date(base.getFullYear() + k * inter, base.getMonth(), base.getDate(), base.getHours(), base.getMinutes()));
        else { add(base); break; }
        var parar = false;
        for (var c = 0; c < cand.length; c++) {
          var d = cand[c];
          if (d < base) continue;
          if (ateR && d > ateR) { parar = true; break; }
          if (n >= cont) { parar = true; break; }
          n++;
          if (d > ate) { parar = true; break; }
          add(d);
        }
        if (parar) break;
      }
    });
    return out.sort(function (x, y) { return x.ini - y.ini; });
  }
  function hhmm(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function carregarAgenda() {
    var url = (window.AGENDA_ICS || '').trim();
    if (!url) { agErro = 'sem-link'; renderAgenda(); return; }
    url = url.replace(/^webcal:/i, 'https:');
    fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); }).then(function (t) {
      var hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
      var fimJ = new Date(hoje0.getTime() + 61 * 86400000), iniJ = new Date(hoje0.getTime() - 7 * 86400000);
      EVENTOS = expandir(lerICS(t), iniJ, fimJ); agErro = null; agAtualizado = new Date();
      agendaEnviar();
      gravar('agenda-cache', { em: agAtualizado.getTime(), ev: EVENTOS.map(function (e) { return [e.ini.getTime(), e.fim.getTime(), e.titulo, e.diaTodo]; }) });
      renderAgenda();
    }).catch(function () {
      var c = ler('agenda-cache', null);
      if (c && c.ev) { EVENTOS = c.ev.map(function (x) { return { ini: new Date(x[0]), fim: new Date(x[1]), titulo: x[2], diaTodo: x[3] }; }); agAtualizado = new Date(c.em); }
      agErro = 'rede'; renderAgenda();
    });
  }
  /* calendário: reuniões + eventos (aniversário repete todo ano) + tarefas com prazo */
  var COR_CAL = { feriado: '#FF9F6E', reuniao: '#C8A6FF', aniversario: '#FF7FA8', evento: '#8FE3FF', lembrete: '#FFD36E', tarefa: '#9CF2A8' };
  function isoD(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function itensDia(a) {
    var b = new Date(a.getTime() + 86400000), id = isoD(a), md = id.slice(5), out = [], agora = new Date(), fer = feriado(a);
    if (fer) out.push({ k: 'feriado', h: '', t: fer });
    EVENTOS.forEach(function (e) { if (e.ini < b && e.fim > a) out.push({ k: 'reuniao', h: e.diaTodo ? '' : hhmm(e.ini), f: e.diaTodo ? '' : hhmm(e.fim), t: e.titulo, passou: !e.diaTodo && e.fim < agora, agora: !e.diaTodo && e.ini <= agora && e.fim > agora }); });
    var ev = ler('dados-ev', null);
    ((ev && ev.eventos) || []).forEach(function (e) { if (e.d === id || (e.anual && e.d.slice(5) === md && e.d <= id)) out.push({ k: e.tipo || 'evento', h: e.h || '', t: e.t }); });
    var tr = ler('dados-tar', null);
    ((tr && tr.tarefas) || []).forEach(function (t) { var r = t.resp || []; if (t.data === id && !t.ok && !((t.cat || 'pessoal') === 'trabalho' && r.length && r.indexOf('DBA') < 0)) out.push({ k: 'tarefa', h: '', t: (t.cli ? t.cli + ': ' : '') + t.t }); });
    return out.sort(function (x, y) { return (x.h || '') < (y.h || '') ? -1 : (x.h || '') > (y.h || '') ? 1 : 0; });
  }
  function renderMes() {
    var el = $('ag-mes'); if (!el) return;
    var h0 = new Date(); h0.setHours(0, 0, 0, 0);
    var y = h0.getFullYear(), m = h0.getMonth(), ini = new Date(y, m, 1), d0 = new Date(y, m, 1 - ini.getDay());
    var g = '<h3 style="color:#C8A6FF;text-transform:capitalize">' + MESES[m] + ' ' + y + '</h3><div class="mes-tv">' + ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function (x) { return '<b>' + x + '</b>'; }).join('');
    for (var i = 0; i < 42; i++) {
      var dd = new Date(y, m, 1 - ini.getDay() + i); if (i === 35 && dd.getMonth() !== m) break;
      var tipos = []; itensDia(dd).forEach(function (x) { if (tipos.indexOf(x.k) < 0) tipos.push(x.k); });
      g += '<span class="' + (dd.getMonth() !== m ? 'fora' : '') + (dd.getTime() === h0.getTime() ? ' hoje' : '') + '">' + dd.getDate() + '<i>' + tipos.slice(0, 4).map(function (k) { return '<u style="background:' + COR_CAL[k] + '"></u>'; }).join('') + '</i></span>';
    }
    el.innerHTML = g + '</div>';
  }
  function renderAgenda() {
    var agora = new Date(), hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    function linha(e, grande) {
      var h = e.h ? e.h + (grande && e.f ? '–' + e.f : '') : (e.k === 'reuniao' ? 'Dia todo' : '');
      return '<div class="ev' + (e.passou ? ' passou' : e.agora ? ' agora' : '') + '"><span class="h" style="color:' + COR_CAL[e.k] + '">' + (h || '●') + '</span><span class="t">' + esc(e.t) + '</span></div>';
    }
    renderMes();
    if (agErro === 'sem-link' && !EVENTOS.length) $('ag-status').textContent = 'Reuniões: falta o link do Outlook';
    else $('ag-status').textContent = agErro === 'rede' ? 'Sem conexão: reuniões da última atualização' + (agAtualizado ? ' (' + hhmm(agAtualizado) + ')' : '') : 'Atualizado às ' + (agAtualizado ? hhmm(agAtualizado) : '--:--');
    var hj = itensDia(hoje0);
    $('ag-hoje').innerHTML = '<h3 style="color:#C8A6FF">今日 · Hoje, ' + DIAS[hoje0.getDay()] + '</h3>' + (hj.length ? hj.slice(0, 5).map(function (e) { return linha(e, true); }).join('') + (hj.length > 5 ? '<span class="vazio">+' + (hj.length - 5) + '</span>' : '') : '<span class="vazio">Nada marcado para hoje.</span>');
    var prox = '';
    for (var off = 1, mostrados = 0; off <= 14 && mostrados < 2; off++) {
      var dd = new Date(hoje0.getTime() + off * 86400000), l = itensDia(dd); if (!l.length) continue; mostrados++;
      prox += '<div class="card dia-ag col"><h3>' + (off === 1 ? 'Amanhã' : DIAS_C[dd.getDay()] + ' ' + dd.getDate() + '/' + (dd.getMonth() + 1)) + '</h3>' + l.slice(0, 3).map(function (e) { return linha(e, false); }).join('') + '</div>';
    }
    $('ag-prox').innerHTML = prox || '<div class="card dia-ag"><span class="vazio">Nada marcado nas próximas 2 semanas.</span></div>';
    if (agErro === 'sem-link') { $('prox-reuniao').textContent = 'Agenda: falta o link'; return; }
    var futura = EVENTOS.filter(function (e) { return !e.diaTodo && e.fim > agora; })[0];
    $('prox-reuniao').textContent = futura ? (futura.ini <= agora ? 'Agora: ' : (futura.ini.toDateString() === agora.toDateString() ? hhmm(futura.ini) + ' ' : DIAS_C[futura.ini.getDay()] + ' ' + hhmm(futura.ini) + ' ')) + futura.titulo : 'Sem reuniões à vista';
  }


  /* ---------- despertador (seg a sex, sem feriados) ---------- */
  function pascoa(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }
  function feriado(d) {
    var y = d.getFullYear(), md = ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    var fixos = { '01-01': 'Confraternização Universal', '01-20': 'São Sebastião (Rio)', '04-21': 'Tiradentes', '04-23': 'São Jorge (RJ)', '05-01': 'Dia do Trabalho', '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal' };
    if (fixos[md]) return fixos[md];
    var p = pascoa(y).getTime(), dia = 86400000, t = new Date(y, d.getMonth(), d.getDate()).getTime();
    var moveis = [[-48, 'Carnaval'], [-47, 'Carnaval'], [-2, 'Sexta-feira Santa'], [60, 'Corpus Christi']];
    for (var i = 0; i < moveis.length; i++) if (Math.round((t - p) / dia) === moveis[i][0]) return moveis[i][1];
    var extras = (cfg.despertar.folgas || []);
    var iso = y + '-' + md; if (extras.indexOf(iso) >= 0) return 'Folga';
    return null;
  }
  var despAtivo = false, despInicio = 0, despTimer = null, despAudio = null, volAntes = null;
  function tvVolume(v) { try { if (window.tizen && tizen.tvaudiocontrol) { tizen.tvaudiocontrol.setMute(false); tizen.tvaudiocontrol.setVolume(Math.round(v)); return true; } } catch (e) {} return false; }
  /* despertar extra num dia específico (ex.: sábado 31/10 às 05:30): vale mesmo fora dos dias normais, em feriado ou modo discreto */
  function extraDe(d) { var x = (cfg.despertar && cfg.despertar.extras) || {}; return x[isoD(d)] || null; }
  function horaTxt(dow) { var hs = cfg.despertar.horas || {}; return hs[dow] || cfg.despertar.hora || '06:00'; }
  function horaDesp(agora) { var p = horaTxt((agora || new Date()).getDay()).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function deveDespertar(agora) {
    var D2 = cfg.despertar, ex = extraDe(agora);
    if (ex) { var pe = ex.split(':'), me = agora.getHours() * 60 + agora.getMinutes(), he = +pe[0] * 60 + (+pe[1] || 0); return me >= he && me <= he + ((D2 && D2.janela) || 45) && ler('desp-feito', '') !== hojeISO(); }
    if (!D2 || !D2.on || (cfg.modo && cfg.modo !== 'normal')) return false;
    if (D2.dias.indexOf(agora.getDay()) < 0) return false;
    if (D2.feriados && feriado(agora)) return false;
    var min = agora.getHours() * 60 + agora.getMinutes(), h0 = horaDesp(agora);
    if (min < h0 || min > h0 + (D2.janela || 45)) return false;
    return ler('desp-feito', '') !== hojeISO();
  }
  var imgDesp = null;
  (function () { var tenta = ['fundos/despertar.jpg', 'fundos/despertar.png']; (function prox(i) { if (i >= tenta.length) return; var im = new Image(); im.onload = function () { imgDesp = tenta[i]; }; im.onerror = function () { prox(i + 1); }; im.src = tenta[i]; })(0); })();
  function fundoDesp() {
    var el = $('desp'), velho = el.querySelector('.bg-desp'); if (velho) el.removeChild(velho);
    var f = cfg.fundo.despertar || 'aurora';
    el.style.backgroundImage = '';
    if (f === 'img' && imgDesp) { el.style.backgroundImage = 'linear-gradient(rgba(10,8,30,.55), rgba(10,8,30,.35), rgba(10,8,30,.6)), url(' + imgDesp + ')'; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; return; }
    if (cenaSVG[f]) { var t = document.createElement('div'); t.innerHTML = cenaSVG[f]; var s = t.firstChild; s.setAttribute('class', 'bg bg-desp'); s.style.position = 'absolute'; s.style.zIndex = '-1'; el.insertBefore(s, el.firstChild); }
  }
  function iniciarDespertador(teste) {
    if (despAtivo) return;
    var el = $('desp'), D2 = cfg.despertar;
    despAtivo = true; despInicio = Date.now(); stAgendar('despertou'); if (!teste) gravar('desp-feito', hojeISO()); registrar(teste ? 'Despertador: teste' : 'Despertador tocou');
    var cfgBox = $('cfg'); if (cfgBox && cfgBox.className.indexOf('hidden') < 0) cfgBox.className += ' hidden';
    el.className = ''; el.style.display = 'flex'; el.style.zIndex = '9999';
    function passo(nome, f) { try { f(); } catch (err) { registrar('Erro no despertador (' + nome + '): ' + (err && err.message)); } }
    passo('fundo', fundoDesp);
    passo('pausar', function () { players.forEach(function (p) { p.pause(); }); });
    passo('textos', function () {
      var hj = (EVENTOS || []).filter(function (e) { return !e.diaTodo && e.ini.toDateString() === new Date().toDateString(); })[0];
      var dow = new Date().getDay(), g = D.academia.semana[dow];
      $('desp-reuniao').textContent = hj ? 'Primeira reunião: ' + hhmm(hj.ini) + ' ' + hj.titulo : 'Nenhuma reunião hoje';
      $('desp-treino').textContent = 'SF6: ' + D.sf6[dow].curto + (g && g.t ? ' · Academia: Treino ' + g.t : '');
      relogioDesp();
    });
    var temTV = false;
    passo('música', function () {
      var arq = LISTA_A.length ? LISTA_A[Math.floor(Date.now() / 86400000) % LISTA_A.length] : D2.musica;
      despAudio = new Audio(encodeURI(arq)); despAudio.loop = true;
      despAudio.onerror = function () { registrar('Música do despertador não abriu'); };
      temTV = tvVolume(D2.volIni);
      despAudio.volume = temTV ? 1 : D2.volIni / 100;
      var pr = despAudio.play(); if (pr && pr.catch) pr.catch(function (err) { registrar('Música do despertador bloqueada: ' + (err && err.name)); });
    });
    var t0 = Date.now(), dur = (D2.min || 10) * 60000;
    despTimer = setInterval(function () {
      try {
        var k = Math.min(1, (Date.now() - t0) / dur), v = D2.volIni + (D2.volFim - D2.volIni) * k;
        if (temTV) tvVolume(v); else if (despAudio) despAudio.volume = Math.min(1, v / 100);
        relogioDesp();
      } catch (err) {}
      if (Date.now() - t0 > 60 * 60000) pararDespertador();
    }, 5000);
    setTimeout(function () { try { var r = el.getBoundingClientRect(); registrar('Tela de despertar: ' + getComputedStyle(el).display + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + (despAudio && !despAudio.paused ? ', música tocando' : ', música parada')); } catch (err) {} }, 3000);
  }
  function relogioDesp() { var d = new Date(); $('desp-hora').textContent = hhmm(d); $('desp-data').textContent = DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function pararDespertador(tecla) {
    if (!despAtivo) return;
    despAtivo = false; clearInterval(despTimer); registrar(tecla ? 'Despertador desligado pelo controle (' + (tecla === 13 ? 'OK' : 'Voltar') + ')' : 'Despertador desligado sozinho (1 hora)');
    if (despAudio) { despAudio.pause(); despAudio = null; }
    $('desp').className = 'hidden'; $('desp').style.display = '';
    srcAtual = null; tocarMusica();
  }
  /* alarme do sistema da TV: pede para o Tizen abrir a Central no horário (pode ligar a TV, depende do modelo) */

  /* ---------- SmartThings: a Central decide quando a TV liga sozinha ----------
     Mantém UMA rotina "Central TV - despertar" na nuvem da Samsung, sempre apontando
     para o próximo despertar (dia útil, sem feriado, modo Normal). Sem despertar, apaga a rotina.
     As chaves ficam só na TV (smartthings.js + localStorage). */
  var ST = window.ST_CFG || null, stTimer = null, stOcupado = false;
  var DIAS_ST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function stHttp(metodo, url, corpo, cab, cb) {
    try {
      var x = new XMLHttpRequest(); x.open(metodo, url, true); x.timeout = 15000;
      Object.keys(cab || {}).forEach(function (k) { x.setRequestHeader(k, cab[k]); });
      x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} cb(x.status, j); };
      x.onerror = x.ontimeout = function () { cb(0, null); };
      x.send(corpo || null);
    } catch (e) { cb(0, null); }
  }
  function stToken(cb) {
    var t = ler('st-acc', null);
    if (t && t.exp > Date.now() + 60000) return cb(t.tok);
    var ref = ler('st-ref', null) || ST.refresh;
    var corpo = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(ref) + '&client_id=' + encodeURIComponent(ST.clientId);
    stHttp('POST', ST.tokenUrl, corpo, { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(ST.clientId + ':' + ST.clientSecret) }, function (st, j) {
      if (st === 200 && j && j.access_token) {
        if (j.refresh_token) gravar('st-ref', j.refresh_token);
        gravar('st-acc', { tok: j.access_token, exp: Date.now() + ((j.expires_in || 86400) - 300) * 1000 });
        cb(j.access_token);
      } else { registrar('SmartThings: chave recusada (' + st + '); pode ser preciso autorizar de novo'); cb(null); }
    });
  }
  function despertarNoDia(d) {
    var ex = extraDe(d); if (ex) { var pe = ex.split(':'); return { dow: d.getDay(), h: +pe[0], m: +pe[1] || 0, extra: true }; }
    var D2 = cfg.despertar; if (!D2 || !D2.on || (cfg.modo && cfg.modo !== 'normal')) return null;
    if (D2.dias.indexOf(d.getDay()) < 0) return null;
    if (D2.feriados && feriado(d)) return null;
    var p = horaTxt(d.getDay()).split(':'); return { dow: d.getDay(), h: +p[0], m: +p[1] || 0 };
  }
  function proximoDespertar() {
    var agora = new Date();
    for (var i = 0; i < 8; i++) {
      var d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i, 12);
      var a = despertarNoDia(d); if (!a) continue;
      if (i === 0 && (agora.getHours() * 60 + agora.getMinutes() >= a.h * 60 + a.m - 2 || ler('desp-feito', '') === hojeISO())) continue;
      a.data = d; return a;
    }
    return null;
  }
  function stSync(motivo) {
    if (!ST || stOcupado) return;
    var alvo = proximoDespertar();
    var chave = alvo ? DIAS_ST[alvo.dow] + ' ' + ('0' + alvo.h).slice(-2) + ':' + ('0' + alvo.m).slice(-2) + ' utc' : 'nenhum';
    var atual = ler('st-regra', null);
    if (atual && atual.chave === chave && Date.now() - (atual.em || 0) < 6 * 3600000) return;
    stOcupado = true;
    stToken(function (tok) {
      if (!tok) { stOcupado = false; return; }
      var H = { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'Accept': 'application/json' };
      var base = 'https://api.smartthings.com/v1/rules';
      function criar() {
        if (!alvo) { gravar('st-regra', { chave: chave, id: null, em: Date.now() }); registrar('SmartThings: sem despertar programado'); stOcupado = false; return; }
        /* A regra do SmartThings conta a hora em UTC (30/10: pedimos 06:00 e ela ligou às 03:00 do Rio).
           Por isso convertemos o horário do Rio para UTC, inclusive o dia da semana quando vira o dia. */
        var quando = new Date(alvo.data.getFullYear(), alvo.data.getMonth(), alvo.data.getDate(), alvo.h, alvo.m);
        var minUTC = quando.getUTCHours() * 60 + quando.getUTCMinutes(), diaUTC = quando.getUTCDay();
        var regra = { name: 'Central TV - despertar', actions: [{ every: { specific: { reference: 'Midnight', offset: { value: { integer: minUTC }, unit: 'Minute' }, daysOfWeek: [DIAS_ST[diaUTC]] },
          actions: [{ command: { devices: [ST.deviceId], commands: [{ component: 'main', capability: 'switch', command: 'on' }] } }] } }] };
        stHttp('POST', base + '?locationId=' + ST.locationId, JSON.stringify(regra), H, function (st, j) {
          if ((st === 200 || st === 201) && j && j.id) {
            gravar('st-regra', { chave: chave, id: j.id, em: Date.now() });
            registrar('SmartThings: TV liga ' + DIAS[alvo.dow].slice(0, 3) + ' ' + chave.split(' ')[1] + ' (Rio)');
          } else registrar('SmartThings: erro ao programar (' + st + ')');
          stOcupado = false;
        });
      }
      function apagarAntigas(cb) {
        stHttp('GET', base + '?locationId=' + ST.locationId, null, H, function (st, j) {
          var minhas = (j && j.items || []).filter(function (r) { return r.name === 'Central TV - despertar'; });
          var faltam = minhas.length; if (!faltam) return cb();
          minhas.forEach(function (r) { stHttp('DELETE', base + '/' + r.id + '?locationId=' + ST.locationId, null, H, function () { if (--faltam === 0) cb(); }); });
        });
      }
      apagarAntigas(criar);
    });
  }

  /* ---------- Celular: recebe comandos do app da Central no iPhone ----------
     Canal ntfy.sh com nome secreto (código mostrado em Personalizar). A TV também publica
     um resumo do estado (modo, próximo despertar, música) para o celular mostrar. */
  function codigoCelular() {
    var c = ler('cel-codigo', null);
    if (!c) {
      var base = (window.ST_CFG && ST_CFG.clientSecret) || (Math.random().toString(36) + Date.now().toString(36) + Math.random().toString(36));
      var out = '';
      for (var k = 0; k < 4; k++) { var h = 2166136261 + k; for (var i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } out += ('000' + (h % 46656).toString(36)).slice(-3); }
      c = out.toUpperCase(); gravar('cel-codigo', c);
    }
    return c;
  }
  function codigoFmt() { var c = codigoCelular(); return c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8, 12); }
  var CEL_URL = 'https://ntfy.sh/centraltv-' + codigoCelular().toLowerCase();
  var celOcupado = false, estadoUltimo = '';
  function celEstado(forcar) {
    var a = proximoDespertar ? proximoDespertar() : null;
    var est = { modo: cfg.modo || 'normal', musica: !!cfg.musica.on, desp: a ? DIAS[a.dow] + ' ' + ('0' + a.h).slice(-2) + ':' + ('0' + a.m).slice(-2) : null, versao: window.CENTRAL_ORIGEM || '' };
    var txt = JSON.stringify(est);
    if (!forcar && txt === estadoUltimo) return;
    estadoUltimo = txt;
    try { var x = new XMLHttpRequest(); x.open('POST', CEL_URL + '-estado', true); x.setRequestHeader('Cache', 'yes'); x.send(JSON.stringify({ tipo: 'estado', em: Date.now(), estado: est })); } catch (e) {}
  }
  function celComando(m) {
    var c = m.c, v = m.v;
    registrar('Celular: ' + c + (v ? ' ' + v : ''));
    if (c === 'modo' && /^(normal|discreto|ferias)$/.test(v)) mudarModo(v);
    else if (c === 'musica') {
      if (v === 'pausar') { cfg.musica.on = false; gravar('cfg', cfg); tocarMusica(); toast('Música pausada pelo celular'); }
      else if (v === 'tocar') { cfg.musica.on = true; semMusica = {}; gravar('cfg', cfg); srcAtual = null; tocarMusica(); toast('Música ligada pelo celular'); }
      else if (v === 'proxima' && LISTA.length) { if (!cfg.musica.on) { cfg.musica.on = true; gravar('cfg', cfg); } proximaFaixa(); toast('Próxima música'); }
    }
    else if (c === 'despertador' && v === 'testar') iniciarDespertador(true);
    else if (c === 'ping') toast('Celular conectado à Central');
    setTimeout(function () { celEstado(true); }, 1500);
  }
  function celOuvir() {
    if (document.hidden || celOcupado) return;
    celOcupado = true;
    var desde = ler('cel-ultimo', null) || String(Math.floor(Date.now() / 1000) - 120);
    try {
      var x = new XMLHttpRequest(); x.open('GET', CEL_URL + '/json?poll=1&since=' + encodeURIComponent(desde), true); x.timeout = 10000;
      x.onload = function () {
        celOcupado = false;
        (x.responseText || '').split('\n').forEach(function (l) {
          if (!l.trim()) return; var ev; try { ev = JSON.parse(l); } catch (e) { return; }
          if (ev.event !== 'message') return;
          gravar('cel-ultimo', ev.id);
          var m; try { m = JSON.parse(ev.message); } catch (e) { return; }
          /* troca de modo vale mesmo se chegou com a TV desligada (ntfy guarda até 12 h); o resto só se for recente */
          if (Date.now() / 1000 - ev.time > (m && m.c === 'modo' ? 12 * 3600 : 180)) return;
          if (m && m.c) celComando(m);
        });
      };
      x.onerror = x.ontimeout = function () { celOcupado = false; };
      x.send();
    } catch (e) { celOcupado = false; }
  }
  function stAgendar(motivo) { clearTimeout(stTimer); stTimer = setTimeout(function () { stSync(motivo); }, 4000); }
  function agendarAlarmeSistema() {
    try { gravar('st-regra', null); stAgendar('config'); } catch (e) {}
    try {
      if (!window.tizen || !tizen.alarm || !tizen.AlarmAbsolute) return;
      var D2 = cfg.despertar, meuId = tizen.application.getCurrentApplication().appInfo.id;
      tizen.alarm.getAll().forEach(function (al) { try { tizen.alarm.remove(al); } catch (e) {} });
      if (!D2.on || !D2.dias.length || (cfg.modo && cfg.modo !== 'normal')) return;
      var NOMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], p = (D2.hora || '06:00').split(':');
      var d = new Date(); d.setHours(+p[0], +p[1] || 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1);
      tizen.alarm.add(new tizen.AlarmAbsolute(d, D2.dias.map(function (x) { return NOMES[x]; })), meuId);
    } catch (e) {}
  }
  function checarDespertador() { if (deveDespertar(new Date())) iniciarDespertador(false); }

  function renderDots() {
    Array.prototype.forEach.call(document.querySelectorAll('.dots'), function (el) {
      var i = +el.getAttribute('data-i'), h = '';
      for (var k = 0; k < NPAG; k++) h += '<span' + (k === i ? ' class="on"' : '') + '></span>';
      el.innerHTML = h;
    });
  }

  function renderTudo() { renderProjetos(); renderApps(); renderTreino(); renderAcademia(); renderDots(); }

  /* ---------- navegação ---------- */
  function paginaEl(i) { return document.querySelectorAll('.page')[i]; }
  function raiz() { return cfgAberto ? $('cfg') : paginaEl(pagina); }
  function focaveis() { return Array.prototype.slice.call(raiz().querySelectorAll('.f')).filter(function (e) { return e.offsetParent !== null; }); }
  function focar(el) {
    if (foco) foco.classList.remove('focus');
    foco = el;
    if (el && cfgAberto && el.scrollIntoView) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(false); } }
    if (el) { el.classList.add('focus'); ultimoFoco[pagina] = el.getAttribute('data-chk') || el.getAttribute('data-app') || el.textContent; }
  }
  function focoPadrao() {
    var l = focaveis();
    if (pagina === HOME) { var yt = document.querySelector('[data-app="1"]'); return yt || l[0]; }
    return l[0];
  }
  function irPara(i, lado) {
    if (i < 0 || i >= NPAG) return;
    if (cfg.modo === 'discreto' && i !== HOME) return;
    pagina = i;
    $('track').style.transform = 'translateX(' + (-1920 * i) + 'px)';
    tocarMusica();
    var l = focaveis(), alvo = null;
    if (lado === 'esq') alvo = l.filter(function (e) { return e.classList.contains('navbtn'); }).pop();
    if (lado === 'dir') alvo = l.filter(function (e) { return e.classList.contains('navbtn'); })[0];
    focar(alvo || focoPadrao());
  }
  function centro(e) { var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r }; }
  function mover(dir) {
    if (!foco) { focar(focoPadrao()); return; }
    var c = centro(foco), melhor = null, nota = Infinity, melhorLinha = null, notaLinha = Infinity, lateral = dir === 'dir' || dir === 'esq';
    focaveis().forEach(function (e) {
      if (e === foco) return;
      var o = centro(e), dx = o.x - c.x, dy = o.y - c.y, p, q;
      if (dir === 'dir') { p = dx; q = Math.abs(dy); } else if (dir === 'esq') { p = -dx; q = Math.abs(dy); }
      else if (dir === 'baixo') { p = dy; q = Math.abs(dx); } else { p = -dy; q = Math.abs(dx); }
      if (p <= 8) return;
      var s = p + q * 2.2;
      if (s < nota) { nota = s; melhor = e; }
      /* mesma linha (setas para o lado) ou mesma coluna (setas para cima/baixo): tem preferência */
      var alinhado = lateral ? (o.r.top < c.r.bottom - 4 && o.r.bottom > c.r.top + 4) : (o.r.left < c.r.right - 4 && o.r.right > c.r.left + 4);
      if (alinhado && s < notaLinha) { notaLinha = s; melhorLinha = e; }
    });
    if (lateral && melhorLinha) melhor = melhorLinha;
    if (melhor) { focar(melhor); return; }
    if (cfgAberto) return;
    if (dir === 'dir') irPara(pagina + 1);
    if (dir === 'esq') irPara(pagina - 1);
  }
  function ok() {
    if (!foco) return;
    var go = foco.getAttribute('data-go');
    if (go !== null) { var n = +go; irPara(n, n > pagina ? 'dir' : 'esq'); return; }
    var ap = foco.getAttribute('data-app');
    if (ap !== null) { abrirApp(D.apps[+ap]); return; }
    var ck = foco.getAttribute('data-chk');
    if (ck) {
      var partes = ck.split('|'), m = ler(partes[0], {});
      m[partes[1]] = !m[partes[1]]; gravar(partes[0], m);
      var mk = marcChave(ck); if (mk) ghOp('marcacoes.json', { op: 'marca', d: hojeISO(), k: mk, v: !!m[partes[1]] });
      foco.classList.toggle('ok');
      var box = foco.querySelector('.box'); box.textContent = m[partes[1]] ? '✓' : '';
      return;
    }
    var cf = foco.getAttribute('data-cfg');
    if (cf) { mudarCfg(cf); return; }
    var act = foco.getAttribute('data-act'), k = 'gym:' + hojeISO(), est = ler(k, {});
    if (act === 'cfg') { abrirCfg(); return; }
    if (act === 'samsung') { menuSamsung = true; registrar('Abriu o menu da Samsung'); if (tizenOk) { try { tizen.application.launch('com.samsung.tv.csfs', function () {}, function () { toast('Não consegui abrir o menu da Samsung'); }); } catch (e) { toast('Não consegui abrir o menu da Samsung'); } } return; }
    if (act === 'modo') { var ord = ['normal', 'discreto', 'ferias']; mudarModo(ord[(ord.indexOf(cfg.modo || 'normal') + 1) % ord.length]); return; }
    if (act === 'fut') { est.fut = !est.fut; gravar(k, est); ghOp('marcacoes.json', { op: 'marca', d: hojeISO(), k: 'fut', v: est.fut }); refazerMantendoFoco(); }
    if (act === 'fim') { est.fim = !est.fim; gravar(k, est); ghOp('marcacoes.json', { op: 'marca', d: hojeISO(), k: 'fim', v: est.fim }); refazerMantendoFoco(); if (est.fim) toast('Boa, Daniel! Treino concluído. お疲れさま!'); }
  }
  function refazerMantendoFoco() {
    var act = foco && foco.getAttribute('data-act');
    renderAcademia();
    var el = act ? paginaEl(pagina).querySelector('[data-act="' + act + '"]') : null;
    foco = null; focar(el || focoPadrao());
  }
  function mudarModo(m, remoto) {
    cfg.modo = m;
    if (!remoto) { cfg.modoEm = Date.now(); ghOp('estado.json', { op: 'modo', v: m, em: cfg.modoEm }); }
    gravar('cfg', cfg); aplicarCfg(); agendarAlarmeSistema();
    trocarLista(); srcAtual = null; tocarMusica();
    if (remoto && pagina !== HOME && m === 'discreto') irPara(HOME);
    var mb = document.querySelector('.modobtn'); if (mb && !remoto) { foco = null; focar(mb); }
    toast({ normal: 'Modo Normal', discreto: 'Modo Discreto: só o Início, sem despertador', ferias: 'Modo Férias: sem despertador' }[m]);
  }
  /* ---------- tela Personalizar ---------- */
  function linhaCfg(nome, ops) { return '<div class="cfg-l"><span class="nome">' + nome + '</span><div class="ops">' + ops + '</div></div>'; }
  function renderCfg() {
    var h = linhaCfg('Cor de destaque', CORES.map(function (c) { return '<span class="op sw f' + (cfg.cor === c ? ' sel' : '') + '" data-cfg="cor|' + c + '" style="background:' + c + '"></span>'; }).join(''));
    PAGS.forEach(function (p) {
      h += linhaCfg(p[1], CENAS.map(function (c) {
        return '<span class="op f' + (cfg.fundo[p[0]] === c[0] ? ' sel' : '') + '" data-cfg="fundo|' + p[0] + '|' + c[0] + '">' + c[1] + '</span>';
      }).join(''));
    });
    h += linhaCfg('Escurecer o fundo', [0, 20, 40, 60].map(function (v) { return '<span class="op f' + (cfg.escuro === v ? ' sel' : '') + '" data-cfg="escuro|' + v + '">' + (v ? v + '%' : 'Não') + '</span>'; }).join(''));
    h += linhaCfg('Apps na tela', D.apps.map(function (ap) { return '<span class="op f' + (cfg.ocultos[ap.nome] ? ' off' : ' sel') + '" data-cfg="app|' + ap.nome + '">' + esc(ap.nome) + '</span>'; }).join(''));
    h += linhaCfg('Música de fundo', '<span class="op f' + (cfg.musica.on ? ' sel' : '') + '" data-cfg="mus|1">Ligada</span><span class="op f' + (!cfg.musica.on ? ' sel' : '') + '" data-cfg="mus|0">Desligada</span>' + [20, 40, 60, 80, 100].map(function (v) { return '<span class="op f' + (cfg.musica.vol === v ? ' sel' : '') + '" data-cfg="vol|' + v + '">' + v + '%</span>'; }).join('') + (LISTA.length > 1 ? '<span class="op f' + (cfg.musica.ordem !== 'aleatoria' ? ' sel' : '') + '" data-cfg="ordem|seq">Em ordem</span><span class="op f' + (cfg.musica.ordem === 'aleatoria' ? ' sel' : '') + '" data-cfg="ordem|aleatoria">Aleatória</span><span class="op f" data-cfg="pular|1">Próxima música</span>' : ''));
    h += linhaCfg('Modo', [['normal', 'Normal'], ['discreto', 'Discreto'], ['ferias', 'Férias']].map(function (m) { return '<span class="op f' + ((cfg.modo || 'normal') === m[0] ? ' sel' : '') + '" data-cfg="modo|' + m[0] + '">' + m[1] + '</span>'; }).join(''));
    var dd = cfg.despertar, fer = feriado(new Date());
    var hsTxt = Object.keys(dd.horas || {}).map(function (k) { return ['dom','seg','ter','qua','qui','sex','sáb'][k] + ' ' + dd.horas[k]; }).join(', ');
    h += linhaCfg('Despertador (seg a sex' + (hsTxt ? '; ' + hsTxt : '') + ')', '<span class="op f' + (dd.on ? ' sel' : '') + '" data-cfg="desp|1">Ligado</span><span class="op f' + (!dd.on ? ' sel' : '') + '" data-cfg="desp|0">Desligado</span>' + ['05:30', '06:00', '06:30', '07:00'].map(function (v) { return '<span class="op f' + (dd.hora === v ? ' sel' : '') + '" data-cfg="dhora|' + v + '">' + v + '</span>'; }).join('') + '<span class="op f" data-cfg="dteste|1">Testar agora</span>');
    h += linhaCfg('Tamanho na tela', [100, 97, 94, 90, 85].map(function (v) { return '<span class="op f' + ((cfg.zoom || 100) === v ? ' sel' : '') + '" data-cfg="zoom|' + v + '">' + v + '%</span>'; }).join(''));
    h += linhaCfg('Animações', '<span class="op f' + (cfg.anim ? ' sel' : '') + '" data-cfg="anim|1">Ligadas</span><span class="op f' + (!cfg.anim ? ' sel' : '') + '" data-cfg="anim|0">Desligadas</span>');
    h += linhaCfg('Código do celular', '<span style="font-size:30px;letter-spacing:4px;color:#FFD36E;font-weight:800">' + codigoFmt() + '</span><span style="font-size:20px;color:#C9CFF0;margin-left:18px">Digite no app da Central no iPhone</span>');
    h += linhaCfg('Registro', '<span style="font-size:20px;line-height:1.5;color:#C9CFF0">' + (ler('registro', []).slice(0, 6).map(esc).join('<br>') || 'Nada ainda') + '</span>');
    h += linhaCfg('', '<span class="op f" data-cfg="padrao|1">Voltar ao padrão</span><span class="op f sel" data-cfg="fechar|1">Pronto</span>');
    $('cfg-linhas').innerHTML = h;
  }
  function abrirCfg() { cfgAberto = true; renderCfg(); $('cfg').className = ''; focar(raiz().querySelector('.op.sel') || focaveis()[0]); }
  function fecharCfg() { cfgAberto = false; $('cfg').className = 'hidden'; foco = null; focar(paginaEl(pagina).querySelector('.cfgbtn') || focoPadrao()); }
  function mudarCfg(v) {
    var p = v.split('|'), alvo = v;
    if (p[0] === 'fechar') { fecharCfg(); return; }
    if (p[0] === 'cor') cfg.cor = p[1];
    if (p[0] === 'fundo') {
      cfg.fundo[p[1]] = p[2];
      if (p[2] === 'img' && !imgOk[p[1]]) toast('Coloque a imagem em CentralTV\\fundos\\' + p[1] + '.jpg no PC e rode o instalador de novo.');
    }
    if (p[0] === 'escuro') cfg.escuro = +p[1];
    if (p[0] === 'app') { cfg.ocultos[p[1]] = !cfg.ocultos[p[1]]; }
    if (p[0] === 'anim') cfg.anim = p[1] === '1';
    if (p[0] === 'mus') { cfg.musica.on = p[1] === '1'; if (cfg.musica.on) semMusica = {}; }
    if (p[0] === 'vol') cfg.musica.vol = +p[1];
    if (p[0] === 'ordem') cfg.musica.ordem = p[1];
    if (p[0] === 'zoom') cfg.zoom = +p[1];
    if (p[0] === 'modo') { cfg.modo = p[1]; cfg.modoEm = Date.now(); ghOp('estado.json', { op: 'modo', v: p[1], em: cfg.modoEm }); setTimeout(function () { agendarAlarmeSistema(); trocarLista(); srcAtual = null; tocarMusica(); }, 300); }
    if (p[0] === 'desp') cfg.despertar.on = p[1] === '1';
    if (p[0] === 'dhora') cfg.despertar.hora = p[1];
    if (p[0] === 'desp' || p[0] === 'dhora') setTimeout(agendarAlarmeSistema, 500);
    if (p[0] === 'dteste') { gravar('cfg', cfg); fecharCfg(); iniciarDespertador(true); return; }
    if (p[0] === 'pular' && LISTA.length) { proximaFaixa(); var fx = LISTA[faixa].split('/').pop().replace(/\.mp3$/i, ''); toast('Tocando: ' + fx); }
    if (p[0] === 'padrao') { cfg = JSON.parse(JSON.stringify(PADRAO)); }
    gravar('cfg', cfg); aplicarCfg(); renderApps(); renderCfg(); if (p[0] === 'mus' || p[0] === 'vol' || p[0] === 'padrao') { srcAtual = p[0] === 'vol' ? srcAtual : null; tocarMusica(); }
    var el = raiz().querySelector('[data-cfg="' + alvo.replace(/"/g, '') + '"]'); foco = null; focar(el || focaveis()[0]);
  }
  function voltar() {
    if (cfgAberto) { fecharCfg(); return; }
    if (pagina !== HOME) { irPara(HOME); return; }
    /* no Início o Voltar não esconde mais a Central (ela vai ser a tela inicial da TV) */
    toast('Para o menu da Samsung, use o botão Menu Samsung');
  }

  document.addEventListener('keydown', function (e) {
    if (despAtivo) { e.preventDefault(); if (Date.now() - despInicio < 5000) { registrar('Tecla ignorada no despertador (' + e.keyCode + ')'); return; } if (e.keyCode === 13 || e.keyCode === 10009) pararDespertador(e.keyCode); return; }
    switch (e.keyCode) {
      case 37: mover('esq'); break;
      case 39: mover('dir'); break;
      case 38: mover('cima'); break;
      case 40: mover('baixo'); break;
      case 13: ok(); break;
      case 427: if (!cfgAberto) irPara(pagina + 1, 'dir'); break;  /* CH + */
      case 428: if (!cfgAberto) irPara(pagina - 1, 'esq'); break;  /* CH - */
      case 10009: case 8: case 27: voltar(); break; /* Voltar */
      default: return;
    }
    e.preventDefault();
  });
  /* mouse/ponteiro (Smart Remote) e teste no PC */
  document.addEventListener('mouseover', function (e) { var el = e.target.closest && e.target.closest('.f'); if (el && el !== foco && raiz().contains(el)) focar(el); });
  document.addEventListener('click', function (e) { var el = e.target.closest && e.target.closest('.f'); if (el) { focar(el); ok(); } });

  if (tizenOk) {
    try { tizen.tvinputdevice.registerKey('ChannelUp'); tizen.tvinputdevice.registerKey('ChannelDown'); } catch (e) {}
  }

  /* virada do dia: refaz os treinos */
  var diaAtual = hojeISO();
  setInterval(function () {
    relogio();
    if (hojeISO() !== diaAtual) { diaAtual = hojeISO(); renderTreino(); renderAcademia(); }
  }, 10000);
  setInterval(clima, 30 * 60000);
  document.addEventListener('visibilitychange', function () { registrar(document.hidden ? 'Central em segundo plano' : 'Central na tela (' + window.innerWidth + 'x' + window.innerHeight + ')'); if (!document.hidden) { ajustarTela(); setTimeout(ajustarTela, 1500); setTimeout(checarDespertador, 1500); } if (!despAtivo) tocarMusica(); if (!document.hidden) { relogio(); carregarAppsTV(); carregarAgenda(); stAgendar('tela'); dadosSync(); } });

  registrar('Central abriu (' + window.innerWidth + 'x' + window.innerHeight + ')' + (window.CENTRAL_ORIGEM ? ' · ' + window.CENTRAL_ORIGEM : ''));
  setTimeout(dadosSync, 4000); setInterval(dadosSync, 5 * 60000); setTimeout(entradaTV, 7000); setInterval(entradaTV, 30000); setTimeout(function () { if (window.DADOS_GH) inventarioEnviar(); }, 9000);
  renderTarefasTV(); renderEstanteTV(); renderTrabalhoTV(); renderLancTV();
  [1000, 3000, 8000, 20000].forEach(function (t) { setTimeout(ajustarTela, t); });
  guardarCenas(); aplicarCfg(); testarImagens(aplicarCfg);
  renderTudo(); relogio(); clima(); carregarAppsTV(); carregarAgenda();
  setInterval(carregarAgenda, 15 * 60000);
  window.addEventListener('error', function (ev) { registrar('Erro: ' + (ev.message || '?')); });
  setInterval(checarDespertador, 30000);
  setTimeout(checarDespertador, 3000);
  setTimeout(agendarAlarmeSistema, 4000);
  setTimeout(function () { stSync('abriu'); }, 6000);
  setInterval(function () { stSync('periodico'); }, 2 * 3600000);
  setInterval(celOuvir, 4000); setTimeout(celOuvir, 2500);
  setTimeout(function () { celEstado(true); }, 9000); setInterval(function () { celEstado(false); }, 60000); setInterval(function () { celEstado(true); }, 30 * 60000);
  setInterval(renderAgenda, 60000);
  irPara(HOME);
})();
