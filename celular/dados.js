/* Central no celular: projetos e estante sincronizados com o repositório privado central-dados.
   A chave (token do GitHub) fica só neste aparelho. Cada mudança vira uma "operação" que é
   aplicada na hora na tela e depois gravada no GitHub (lê a versão mais nova, aplica, grava). */
(function () {
  var REPO = 'https://api.github.com/repos/DuckDaniels1609/central-dados/contents/';
  var $ = function (id) { return document.getElementById(id); };
  function ler(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var tT; function toast(m) { var t = $('toast'); if (!t) return; t.textContent = m; t.className = 'toast on'; clearTimeout(tT); tT = setTimeout(function () { t.className = 'toast'; }, 2600); }

  function token() { return ler('gh-token', ''); }
  function b64dec(s) { var bin = atob(s.replace(/\s/g, '')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
  function b64enc(txt) { var u = new TextEncoder().encode(txt), s = ''; for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }
  function hdr() { return { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }

  function baixar(arq) {
    return fetch(REPO + arq + '?t=' + Date.now(), { headers: hdr(), cache: 'no-store' }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error('chave');
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) { return { dados: JSON.parse(b64dec(j.content)), sha: j.sha }; });
  }
  function subir(arq, dados, sha, msg) {
    dados.atualizado = new Date().toISOString();
    return fetch(REPO + arq, { method: 'PUT', headers: hdr(), body: JSON.stringify({ message: msg || ('celular: ' + arq), content: b64enc(JSON.stringify(dados, null, 1)), sha: sha }) })
      .then(function (r) { if (r.status === 409 || r.status === 422) throw new Error('conflito'); if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) { return j.content.sha; });
  }

  /* estado local + fila de operações por arquivo */
  var ARQ = { proj: 'projetos.json', est: 'estante.json', estado: 'estado.json', marc: 'marcacoes.json', tar: 'tarefas.json', cli: 'clientes.json', ev: 'eventos.json', ag: 'agenda.json', lanc: 'lancamentos.json' };
  var S = {}, FILA = {};
  Object.keys(ARQ).forEach(function (q) { S[q] = ler('cd-' + q, null); FILA[q] = ler('cd-fila-' + q, []); });
  var timer = {}, gravando = {};
  var status = 'parado';

  var OPS = {
    etapaOk: function (d, a) { var p = d.projetos[a.p]; if (p && p.etapas[a.i] && p.etapas[a.i].t === a.t) p.etapas[a.i].ok = a.ok; },
    etapaNova: function (d, a) { var p = d.projetos[a.p]; if (p) p.etapas.push({ ok: false, t: a.t }); },
    etapaTexto: function (d, a) { var p = d.projetos[a.p]; if (p && p.etapas[a.i] && p.etapas[a.i].t === a.antes) p.etapas[a.i].t = a.t; },
    etapaApaga: function (d, a) { var p = d.projetos[a.p]; if (p && p.etapas[a.i] && p.etapas[a.i].t === a.t) p.etapas.splice(a.i, 1); },
    etapaMove: function (d, a) { var p = d.projetos[a.p]; if (!p || !p.etapas[a.i] || p.etapas[a.i].t !== a.t) return; var j = a.i + a.dir; if (j < 0 || j >= p.etapas.length) return; var x = p.etapas.splice(a.i, 1)[0]; p.etapas.splice(j, 0, x); },
    projNovo: function (d, a) { if (!d.projetos[a.id]) d.projetos[a.id] = { nome: a.nome, objetivo: a.obj || '', ordem: a.ordem, status: 'ativo', etapas: [] }; },
    projCampo: function (d, a) { var p = d.projetos[a.p]; if (p) p[a.campo] = a.v; },
    trofeu: function (d, a) { var g = d.progresso[a.g] || (d.progresso[a.g] = { custom: [], done: {}, notes: '', status: 'fila' }); g.done = g.done || {}; if (a.ok) g.done[a.t] = true; else delete g.done[a.t]; },
    importa: function (d, a) {
      var g = d.progresso[a.g] || (d.progresso[a.g] = { custom: [], done: {}, notes: '', status: 'fila' }); g.done = g.done || {};
      a.ids.forEach(function (t) { g.done[t] = true; });
      if (a.ids.length && (!g.status || g.status === 'fila')) g.status = 'jogando';
      if (a.npwr && d.jogos[a.g] && !d.jogos[a.g].npwr) d.jogos[a.g].npwr = a.npwr;
    },
    modo: function (d, a) { if (a.em >= (d.modoEm || 0)) { d.modo = a.v; d.modoEm = a.em; } },
    marca: function (d, a) {
      d.dias = d.dias || {}; var dia = d.dias[a.d] || (d.dias[a.d] = {});
      if (a.v) dia[a.k] = true; else delete dia[a.k];
      var lim = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
      Object.keys(d.dias).forEach(function (k) { if (k < lim) delete d.dias[k]; });
    },
    tarNova: function (d, a) { d.tarefas = d.tarefas || []; if (!d.tarefas.some(function (t) { return t.id === a.id; })) { var nt = { id: a.id, t: a.t, ok: false, criada: a.em, cat: a.cat || 'pessoal', cli: a.cli || '', resp: a.resp || [] }; if (a.data) nt.data = a.data; d.tarefas.push(nt); } },
    tarResp: function (d, a) { (d.tarefas || []).forEach(function (t) { if (t.id === a.id) t.resp = a.resp; }); },
    tarData: function (d, a) { (d.tarefas || []).forEach(function (t) { if (t.id === a.id) { if (a.data) t.data = a.data; else delete t.data; } }); },
    evNovo: function (d, a) { d.eventos = d.eventos || []; if (!d.eventos.some(function (e) { return e.id === a.id; })) d.eventos.push({ id: a.id, d: a.d, h: a.h || '', t: a.t, tipo: a.tipo, anual: !!a.anual }); },
    evMuda: function (d, a) { (d.eventos || []).forEach(function (e) { if (e.id === a.id) { e.t = a.t; e.d = a.d; e.h = a.h || ''; } }); },
    evApaga: function (d, a) { d.eventos = (d.eventos || []).filter(function (e) { return e.id !== a.id; }); },
    lancMeu: function (d, a) { (d.jogos || []).forEach(function (j) { if (j.id === a.id) j.meu = a.v; }); },
    tarCli: function (d, a) { (d.tarefas || []).forEach(function (t) { if (t.id === a.id) t.cli = a.cli; }); },
    cliNovo: function (d, a) { d.clientes = d.clientes || []; if (a.nome && !d.clientes.some(function (c) { return c.toLowerCase() === a.nome.toLowerCase(); })) { d.clientes.push(a.nome); d.clientes.sort(function (x, y) { return x.localeCompare(y, 'pt'); }); } },
    tarCat: function (d, a) { (d.tarefas || []).forEach(function (t) { if (t.id === a.id) t.cat = a.cat; }); },
    tarOk: function (d, a) { (d.tarefas || []).forEach(function (t) { if (t.id === a.id) { t.ok = a.ok; if (a.ok) t.feita = a.em; else delete t.feita; } }); },
    tarTexto: function (d, a) { (d.tarefas || []).forEach(function (t) { if (t.id === a.id) t.t = a.t; }); },
    tarApaga: function (d, a) { d.tarefas = (d.tarefas || []).filter(function (t) { return t.id !== a.id; }); },
    jogoStatus: function (d, a) { var g = d.progresso[a.g] || (d.progresso[a.g] = { custom: [], done: {}, notes: '', status: 'fila' }); g.status = a.v; }
  };

  function op(qual, tipo, args) {
    if (!S[qual]) return;
    args.op = tipo; OPS[tipo](S[qual], args); gravar('cd-' + qual, S[qual]);
    FILA[qual].push(args); gravar('cd-fila-' + qual, FILA[qual]);
    render(); clearTimeout(timer[qual]); timer[qual] = setTimeout(function () { enviar(qual); }, 1200);
  }

  function enviar(qual, tent) {
    if (gravando[qual] || !FILA[qual].length || !token()) return;
    gravando[qual] = true; mostraStatus('salvando');
    var lote = FILA[qual].slice();
    baixar(ARQ[qual]).then(function (r) {
      lote.forEach(function (a) { try { OPS[a.op](r.dados, a); } catch (e) {} });
      return subir(ARQ[qual], r.dados, r.sha).then(function () { return r.dados; });
    }).then(function (novo) {
      FILA[qual] = FILA[qual].slice(lote.length); gravar('cd-fila-' + qual, FILA[qual]);
      FILA[qual].forEach(function (a) { try { OPS[a.op](novo, a); } catch (e) {} });
      S[qual] = novo; gravar('cd-' + qual, novo); gravando[qual] = false;
      mostraStatus(FILA[qual].length ? 'salvando' : 'ok'); render();
      if (FILA[qual].length) enviar(qual);
    }).catch(function (e) {
      gravando[qual] = false;
      if (e.message === 'conflito' && (tent || 0) < 3) return setTimeout(function () { enviar(qual, (tent || 0) + 1); }, 700);
      mostraStatus(e.message === 'chave' ? 'chave' : 'erro');
    });
  }

  function atualizar() {
    if (!token()) { render(); return; }
    mostraStatus('baixando');
    Object.keys(ARQ).forEach(function (q) {
      baixar(ARQ[q]).then(function (r) {
        var d = r.dados; FILA[q].forEach(function (a) { try { OPS[a.op](d, a); } catch (e) {} });
        S[q] = d; gravar('cd-' + q, d); render(); mostraStatus(FILA[q].length ? 'salvando' : 'ok');
        if (q === 'tar' || q === 'ev') setTimeout(entrada, 500);
        if (FILA[q].length) enviar(q);
      }).catch(function (e) { mostraStatus(e.message === 'chave' ? 'chave' : 'off'); render(); });
    });
  }

  function mostraStatus(s) {
    status = s;
    var txt = { ok: 'Sincronizado ✓', salvando: 'Salvando…', baixando: 'Atualizando…', erro: 'Não consegui salvar. Tento de novo depois.', off: 'Sem internet: mostrando a última cópia', chave: 'A chave não funcionou. Cole de novo na aba TV.', parado: '' }[s] || '';
    document.querySelectorAll('.cd-sync').forEach(function (el) { el.textContent = txt; el.className = 'cd-sync ' + s; });
  }

  /* ------- telas ------- */
  var aberto = ler('cd-aberto', {}), filtroFaltam = ler('cd-faltam', true);
  function semChave() {
    return '<div class="card"><h2>Conectar seus dados</h2><p class="aviso">Para ver e editar projetos e a estante, cole a chave do GitHub (começa com <b>github_pat_</b>). Ela fica guardada só neste iPhone.</p>' +
      '<input class="cod cd-tok" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false" style="font-size:15px;letter-spacing:0">' +
      '<div class="btns dois" style="margin-top:10px"><button class="b sel" data-cd="salvaTok">Conectar</button><span></span></div></div>';
  }

  function projetosOrd() {
    var d = S.proj && S.proj.projetos || {};
    return Object.keys(d).map(function (k) { var p = d[k]; p._id = k; return p; })
      .sort(function (a, b) { var sa = a.status === 'concluido' ? 1 : 0, sb = b.status === 'concluido' ? 1 : 0; return sa - sb || (a.ordem || 99) - (b.ordem || 99) || a.nome.localeCompare(b.nome); });
  }
  var CORES = ['#FF7FA8', '#8FE3FF', '#FFD36E', '#9CF2A8', '#C9A7FF', '#FFB38A', '#7FD1C1', '#F59ACB'];
  function cor(i) { return CORES[i % CORES.length]; }

  function renderProj() {
    var el = $('pj-dados'); if (!el) return;
    if (!token()) { el.innerHTML = semChave(); return; }
    if (!S.proj) { el.innerHTML = '<div class="card aviso">Carregando projetos…</div>'; return; }
    var lista = projetosOrd();
    el.innerHTML = lista.map(function (p, n) {
      var feitas = p.etapas.filter(function (e) { return e.ok; }).length, tot = p.etapas.length, ab = !!aberto[p._id];
      var prox = p.etapas.filter(function (e) { return !e.ok; })[0];
      var st = { ativo: '', pausado: '<span class="chip">pausado</span>', concluido: '<span class="chip on">concluído</span>' }[p.status] || '';
      var h = '<div class="card pj' + (ab ? ' ab' : '') + '"><button class="pj-cab" data-cd="abre" data-p="' + p._id + '">' +
        '<span class="dot" style="background:' + cor(n) + '"></span><span class="pj-n">' + esc(p.nome) + ' ' + st + '</span><span class="pj-c">' + feitas + '/' + tot + '</span></button>' +
        '<div class="barra"><i style="width:' + (tot ? Math.round(feitas / tot * 100) : 0) + '%;background:' + cor(n) + '"></i></div>' +
        (!ab ? '<div class="aviso" style="margin-top:8px">' + (prox ? 'Próximo: ' + esc(prox.t) : 'Tudo feito ✓') + '</div>' : '');
      if (ab) {
        if (p.objetivo) h += '<div class="aviso" style="margin:8px 0 2px">Objetivo: ' + esc(p.objetivo) + '</div>';
        h += p.etapas.map(function (e, i) {
          return '<div class="et' + (e.ok ? ' ok' : '') + '"><button class="box" data-cd="etOk" data-p="' + p._id + '" data-i="' + i + '" aria-label="Marcar">' + (e.ok ? '✓' : '') + '</button>' +
            '<span class="tx">' + esc(e.t) + '</span><button class="mais" data-cd="etMenu" data-p="' + p._id + '" data-i="' + i + '" aria-label="Editar">⋯</button></div>';
        }).join('');
        h += '<form class="nova" data-p="' + p._id + '"><input placeholder="Nova etapa…" enterkeyhint="done"><button class="b sel">+</button></form>' +
          '<div class="btns" style="margin-top:10px"><button class="b" data-cd="pjNome" data-p="' + p._id + '">Renomear</button>' +
          '<button class="b" data-cd="pjObj" data-p="' + p._id + '">Objetivo</button>' +
          '<button class="b" data-cd="pjStatus" data-p="' + p._id + '">' + (p.status === 'ativo' ? 'Pausar' : p.status === 'pausado' ? 'Concluir' : 'Reativar') + '</button></div>';
      }
      return h + '</div>';
    }).join('') + '<button class="b novo" data-cd="pjNovo">+ Novo projeto</button>';
  }

  var TIPO = { platina: ['◆', '#B9E6FF'], ouro: ['●', '#FFD36E'], prata: ['●', '#D9DCE8'], bronze: ['●', '#D79A6A'] };
  var STJ = { jogando: 'Jogando', fila: 'Na fila', pausado: 'Pausado', platinado: 'Platinado', lancamento: 'Lançamento' };
  function renderEst() {
    var el = $('est-dados'); if (!el) return;
    if (!token()) { el.innerHTML = semChave(); return; }
    if (!S.est) { el.innerHTML = '<div class="card aviso">Carregando a estante…</div>'; return; }
    var J = S.est.jogos, P = S.est.progresso || {};
    var ids = Object.keys(J).sort(function (a, b) { return (J[a].order || 99) - (J[b].order || 99); });
    el.innerHTML = renderImport(J, ids) + ids.map(function (id) {
      var g = J[id], pr = P[id] || {}, done = pr.done || {}, tr = g.trophies || [];
      var feitos = tr.filter(function (t) { return done[t.id]; }).length, plat = tr.filter(function (t) { return t.type === 'platina'; })[0];
      var st = g.tbd ? 'lancamento' : (plat && done[plat.id] ? 'platinado' : (pr.status || 'fila'));
      var ab = !!aberto['g-' + id];
      var info = g.tbd ? 'Lança em ' + (g.release || '?').split('-').reverse().join('/') : [g.main && 'História ' + g.main, g.full && '100% ' + g.full].filter(Boolean).join(' · ');
      var h = '<div class="card pj' + (ab ? ' ab' : '') + '"><button class="pj-cab" data-cd="abre" data-p="g-' + id + '">' +
        '<span class="pj-n">' + esc(g.short || g.name) + ' <span class="chip' + (st === 'jogando' ? ' on' : '') + '">' + (STJ[st] || st) + '</span></span>' +
        '<span class="pj-c">' + (tr.length ? feitos + '/' + tr.length : '') + '</span></button>' +
        (tr.length ? '<div class="barra"><i style="width:' + Math.round(feitos / tr.length * 100) + '%;background:var(--ouro)"></i></div>' : '') +
        '<div class="aviso" style="margin-top:8px">' + esc(g.platform || '') + (info ? ' · ' + esc(info) : '') + '</div>';
      if (ab && tr.length) {
        h += '<div class="btns" style="margin:10px 0 4px">' + ['jogando', 'fila', 'pausado'].map(function (s) { return '<button class="b' + ((pr.status || 'fila') === s ? ' sel' : '') + '" data-cd="jgSt" data-g="' + id + '" data-v="' + s + '">' + STJ[s] + '</button>'; }).join('') + '</div>' +
          '<div class="btns dois" style="margin:8px 0 4px"><button class="b' + (filtroFaltam ? ' sel' : '') + '" data-cd="faltam">Só os que faltam</button><button class="b' + (!filtroFaltam ? ' sel' : '') + '" data-cd="todos">Todos</button></div>';
        h += tr.filter(function (t) { return !filtroFaltam || !done[t.id]; }).sort(function (x, y) { return (x.type === 'platina') - (y.type === 'platina'); }).map(function (t) {
          var tp = TIPO[t.type] || TIPO.bronze, ok = !!done[t.id];
          return '<div class="et' + (ok ? ' ok' : '') + '"><button class="box" data-cd="tr" data-g="' + id + '" data-t="' + t.id + '" aria-label="Marcar">' + (ok ? '✓' : '') + '</button>' +
            '<span class="tx"><span style="color:' + tp[1] + '">' + tp[0] + '</span> ' + esc(t.name) + (t.missable ? ' <span class="chip off">perdível</span>' : '') +
            '<small>' + (t.hidden && !ok ? 'Oculto · toque para ver' : esc(t.desc)) + '</small></span></div>';
        }).join('') || '<div class="aviso" style="padding:10px 0">Nenhum troféu faltando 🎉</div>';
        if (g.cheats && g.cheats.state) h += '<div class="aviso" style="margin-top:8px">Cheats: ' + esc(g.cheats.state) + '</div>';
      }
      return h + '</div>';
    }).join('');
  }

  /* ---- importar troféus do PS5 (TRPTITLE.DAT), igual ao botão da Estante no PC ---- */
  var PS5 = 'http://192.168.7.5:8888', PS5_DIR = '/user/home/13b5b6f1/trophy2/nobackup/data/';
  var imp = { aberto: false, itens: [], msg: '' };
  function parseTrp(buf) {
    var b = new Uint8Array(buf);
    if (b.length < 0x80 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'T2PD') throw new Error('não é um TRPTITLE.DAT');
    var partes = [b.subarray(0, 0x40)];
    for (var o = 0x40; o < b.length; o += 0x420) partes.push(b.subarray(o, Math.min(o + 0x400, b.length)));
    var len = 0; partes.forEach(function (x) { len += x.length; });
    var d = new Uint8Array(len), p = 0; partes.forEach(function (x) { d.set(x, p); p += x.length; });
    var dv = new DataView(d.buffer), txt = '';
    for (var i = 0; i < b.length; i++) txt += String.fromCharCode(b[i]);
    var m = txt.match(/NPWR\d{5}_\d{2}/), npwr = m ? m[0] : null;
    function acha(sig) { var out = []; for (var i = 0; i + 8 <= d.length; i += 4) { var ok = true; for (var k = 0; k < 8; k++) if (d[i + k] !== sig[k]) { ok = false; break; } if (ok) out.push(i); } return out; }
    var r5 = acha([0, 0, 5, 0, 0, 0, 0, 0xc0]).slice(1), r8 = acha([0, 0, 8, 0, 0, 0, 0, 0x50]).slice(1), abertos = [];
    r8.forEach(function (o) { if (o + 0x40 <= d.length && (dv.getUint32(o + 0x14) & 0x10)) abertos.push(dv.getUint32(o + 0x10)); });
    return { npwr: npwr, total: r5.length, abertos: abertos };
  }
  function adivinha(r) {
    var J = S.est.jogos, ids = Object.keys(J);
    for (var i = 0; i < ids.length; i++) if (J[ids[i]].npwr && J[ids[i]].npwr === r.npwr) return ids[i];
    var mesmos = ids.filter(function (k) { return !J[k].npwr && !J[k].tbd && (J[k].trophies || []).length === r.total; });
    return mesmos.length === 1 ? mesmos[0] : '';
  }
  function plano(it) {
    var g = S.est.jogos[it.g]; if (!g) return null;
    var mapa = {}; (g.trophies || []).forEach(function (t, i) { mapa[t.psnId != null ? t.psnId : i] = t.id; });
    var done = ((S.est.progresso[it.g] || {}).done) || {};
    var ids = it.abertos.map(function (n) { return mapa[n]; }).filter(Boolean);
    return { ids: ids, novos: ids.filter(function (t) { return !done[t]; }), semPar: it.abertos.length - ids.length };
  }
  function renderImport(J, ids) {
    if (!imp.aberto) return '<button class="b novo" style="margin:0 0 10px" data-cd="irLanc">🎮 Lançamentos de jogos</button><div class="btns dois" style="margin-bottom:12px"><button class="b sel" data-cd="impAbre">Importar do PS5</button><button class="b" data-cd="sync">Atualizar</button></div>';
    var links = ids.filter(function (k) { return J[k].npwr; }).map(function (k) {
      return '<a class="b" style="display:block;text-align:center;text-decoration:none" href="' + PS5 + '/fs?path=' + encodeURIComponent(PS5_DIR + J[k].npwr + '/TRPTITLE.DAT') + '" target="_blank" rel="noopener">Baixar · ' + esc(J[k].short || J[k].name) + '</a>';
    }).join('');
    var opc = function (sel) { return '<option value="">— qual jogo? —</option>' + ids.filter(function (k) { return !J[k].tbd; }).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(J[k].short || J[k].name) + '</option>'; }).join(''); };
    var linhas = imp.itens.map(function (it, i) {
      if (it.erro) return '<div class="aviso" style="color:var(--acc);padding:8px 0">' + esc(it.nome) + ': ' + esc(it.erro) + '</div>';
      var pl = plano(it);
      return '<div class="et" style="display:block"><b>' + esc(it.npwr || it.nome) + '</b> <span class="aviso">· ' + it.abertos.length + ' de ' + it.total + ' no PS5</span>' +
        '<select class="impsel" data-i="' + i + '" style="display:block;width:100%;margin:6px 0;font:inherit;font-size:16px;padding:8px;border-radius:10px;background:rgba(0,0,0,.25);color:var(--tinta);border:1px solid var(--linha)">' + opc(it.g) + '</select>' +
        '<div class="aviso">' + (pl ? pl.novos.length + ' troféus novos para marcar' + (pl.semPar ? ' · ' + pl.semPar + ' sem par na lista' : '') + ((S.est.jogos[it.g].trophies || []).length !== it.total ? ' · Atenção: quantidade de troféus diferente, confira o jogo' : '') : 'Escolha o jogo deste arquivo.') + '</div></div>';
    }).join('');
    return '<div class="card" style="margin-bottom:12px"><h2>Importar troféus do PS5</h2>' +
      '<p class="aviso">1. Em casa, no Wi-Fi, com o jailbreak ativo, toque em <b>Baixar</b> no jogo (abre o Safari e salva o arquivo em Arquivos › Downloads). Para outro jogo, use o gerenciador: <a style="color:var(--azul)" href="' + PS5 + '" target="_blank" rel="noopener">abrir o PS5</a>.<br>2. Volte aqui e toque em <b>Escolher arquivos</b>. Pode escolher vários. Só marca; nada é desmarcado.</p>' +
      '<div style="display:grid;gap:8px;margin:10px 0">' + links + '</div>' + linhas +
      '<div class="btns" style="margin-top:10px"><button class="b' + (imp.itens.length ? '' : ' sel') + '" data-cd="impEscolhe">Escolher arquivos</button>' +
      (imp.itens.length ? '<button class="b sel" data-cd="impAplica">Aplicar</button>' : '<span></span>') + '<button class="b" data-cd="impFecha">Fechar</button></div>' +
      (imp.msg ? '<p class="aviso" style="color:var(--verde);margin:10px 0 0">' + esc(imp.msg) + '</p>' : '') +
      '<input type="file" id="impArq" multiple hidden></div>';
  }
  document.addEventListener('change', function (e) {
    if (e.target.id === 'impArq') {
      var fs = Array.prototype.slice.call(e.target.files || []); imp.itens = []; imp.msg = '';
      Promise.all(fs.map(function (f) {
        return f.arrayBuffer().then(function (buf) { var r = parseTrp(buf); r.nome = f.name; r.g = adivinha(r); imp.itens.push(r); })
          .catch(function (er) { imp.itens.push({ nome: f.name, erro: er.message || 'arquivo inválido' }); });
      })).then(render);
    } else if (e.target.classList.contains('impsel')) { imp.itens[+e.target.dataset.i].g = e.target.value; render(); }
  });

  function renderInicio() {
    var el = $('h-proj'); if (!el || !S.proj) return;
    el.innerHTML = projetosOrd().filter(function (p) { return p.status === 'ativo'; }).slice(0, 4).map(function (p, n) {
      var prox = p.etapas.filter(function (e) { return !e.ok; })[0];
      return '<div class="proj"><div class="n"><span class="dot" style="background:' + cor(n) + '"></span>' + esc(p.nome) + '</div><div class="p">' + esc(prox ? prox.t : 'Tudo feito ✓') + '</div></div>';
    }).join('');
  }
  function renderConfig() {
    var el = $('cd-config'); if (!el) return;
    el.innerHTML = token()
      ? '<p class="aviso">Projetos e estante conectados ao seu repositório privado. <span class="cd-sync"></span></p><div class="btns dois"><button class="b" data-cd="sync">Atualizar agora</button><button class="b" data-cd="esqTok">Esquecer chave</button></div>' +
        '<button class="b novo" data-cd="copiaTok">Copiar chave para o atalho da Siri</button><p class="aviso" style="margin:6px 0 0">Copia "Bearer github_pat_…" pronto para colar no cabeçalho Authorization.</p>'
      : semChave();
    mostraStatus(status);
  }
  /* ---- tarefas ---- */
  var CATS = [['trabalho', 'Trabalho', '#FFD36E'], ['pessoal', 'Pessoal', '#8FE3FF'], ['condominio', 'Condomínio', '#C8A6FF']];
  function catInfo(c) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === c) return CATS[i]; return CATS[1]; }
  var catNova = ler('cd-cat-nova', 'trabalho'), catFiltro = ler('cd-cat-filtro', '');
  function chipCat(t) { var c = catInfo(t.cat || 'pessoal'); return '<button class="chip catchip" data-cd="tarCat" data-id="' + t.id + '" style="background:' + c[2] + '22;color:' + c[2] + '">' + c[1] + '</button>'; }
  var verArq = false;
  function dmy(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }
  function chipData(t) { if (!t.data && t.ok) return ''; var at = t.data && !t.ok && t.data < hoje(); return t.data ? '<button class="data-chip' + (at ? ' atraso' : '') + '" data-cd="tarData" data-id="' + t.id + '">' + (at ? 'atrasada · ' : '') + dmy(t.data) + '</button>' : '<button class="data-chip" style="background:none;color:var(--suave)" data-cd="tarData" data-id="' + t.id + '">+ data</button>'; }
  function lerData(txt, base) {
    txt = (txt || '').trim(); if (!txt) return '';
    var m = txt.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/); if (!m) return null;
    var y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +(base || hoje()).slice(0, 4);
    var d = new Date(y, +m[2] - 1, +m[1]); if (d.getMonth() !== +m[2] - 1) return null;
    if (!m[3] && iso(d) < hoje()) d.setFullYear(y + 1);
    return iso(d);
  }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  var cliFiltro = '', respFiltro = '', RESP = ['DBA', 'MSS', 'PAA'], respNova = ler('cd-resp-nova', ['DBA']);
  function chipsResp(t) { var r = t.resp || []; return '<button class="resp" data-cd="tarResp" data-id="' + t.id + '">' + (r.length ? r.map(function (x) { return '<i' + (x === 'DBA' ? ' class="eu"' : '') + '>' + esc(x) + '</i>'; }).join('') : '<i class="vazio">+ resp.</i>') + '</button>'; }
  function listaClientes() {
    var base = (S.cli && S.cli.clientes) || [], extra = usados();
    extra.forEach(function (c) { if (base.indexOf(c) < 0) base = base.concat([c]); });
    return base;
  }
  function usados() { var o = []; ((S.tar && S.tar.tarefas) || []).forEach(function (t) { if (t.cli && o.indexOf(t.cli) < 0) o.push(t.cli); }); return o.sort(function (a, b) { return a.localeCompare(b, 'pt'); }); }
  function nomeCliente(v) { v = (v || '').trim(); if (!v) return ''; var L = listaClientes(); for (var i = 0; i < L.length; i++) if (L[i].toLowerCase() === v.toLowerCase()) return L[i]; return v; }
  document.addEventListener('change', function (e) { if (e.target.id === 'cliFiltro') { cliFiltro = e.target.value; render(); } });
  function renderTar() {
    var el = $('tar-dados'); if (!el) return;
    if (!token()) { el.innerHTML = semChave(); return; }
    if (!S.tar) { el.innerHTML = '<div class="card aviso">Carregando tarefas…</div>'; return; }
    var guardaT = document.querySelector('#tarNova input'), guardaC = $('tarCliIn'), vT = guardaT ? guardaT.value : '', vC = guardaC ? guardaC.value : '', foc = document.activeElement && document.activeElement.id;
    var L = S.tar.tarefas || [], sem = Date.now() - 7 * 86400000;
    var filt = function (t) { return (!catFiltro || (t.cat || 'pessoal') === catFiltro) && (catFiltro !== 'trabalho' || ((!cliFiltro || t.cli === cliFiltro) && (!respFiltro || (t.resp || []).indexOf(respFiltro) >= 0))); };
    var pend = L.filter(function (t) { return !t.ok && filt(t); });
    var feitas = L.filter(function (t) { return t.ok && filt(t); }).sort(function (a, b) { return (b.feita || 0) - (a.feita || 0); });
    function quando(t) { if (!t.feita) return ''; var d = new Date(t.feita); return '<small style="display:block;color:var(--suave);font-size:12px">feita em ' + ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '</small>'; }
    function linha(t) {
      return '<div class="et' + (t.ok ? ' ok' : '') + '"><button class="box" data-cd="tarOk" data-id="' + t.id + '" aria-label="Marcar">' + (t.ok ? '✓' : '') + '</button>' +
        '<span class="tx">' + ((t.cat || 'pessoal') === 'trabalho' ? '<span class="linha-cli"><button class="cli" data-cd="tarCli" data-id="' + t.id + '">' + (t.cli ? esc(t.cli) : '+ cliente') + '</button>' + chipsResp(t) + '</span>' : '') + esc(t.t) + ' ' + chipCat(t) + chipData(t) + '</span><button class="mais" data-cd="tarMenu" data-id="' + t.id + '" aria-label="Editar">⋯</button></div>';
    }
    var conta = function (c) { return L.filter(function (t) { return !t.ok && (!c || (t.cat || 'pessoal') === c); }).length; };
    el.innerHTML = '<div class="filtros">' + [['', 'Todas']].concat(CATS).map(function (c) { return '<button class="b' + (catFiltro === c[0] ? ' sel' : '') + '" data-cd="tarFiltro" data-v="' + c[0] + '"><span>' + conta(c[0]) + '</span>' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="card"><form class="nova" id="tarNova" style="margin-top:0"><input placeholder="Nova tarefa…" enterkeyhint="done"><button class="b sel">+</button></form>' +
      '<div class="cats">' + CATS.map(function (c) { return '<button class="b' + (catNova === c[0] ? ' sel' : '') + '" data-cd="tarCatNova" data-v="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="linha2" style="margin:6px 0"><input type="date" id="tarDataIn" form="tarNova" aria-label="Prazo (opcional)"></div>' +
      (catNova === 'trabalho' ? '<input class="cli-in" id="tarCliIn" list="cliLista" placeholder="Cliente (opcional)" autocomplete="off" form="tarNova">' +
        '<div class="cats"><span class="aviso" style="align-self:center">Responsáveis:</span>' + RESP.map(function (r) { return '<button class="b' + (respNova.indexOf(r) >= 0 ? ' sel' : '') + '" data-cd="respNova" data-v="' + r + '">' + r + '</button>'; }).join('') + '</div>' : '') +
      '<datalist id="cliLista">' + listaClientes().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      (catFiltro === 'trabalho' ? '<div class="cats"><span class="aviso" style="align-self:center">Ver de:</span>' + [''].concat(RESP).map(function (r) { return '<button class="b' + (respFiltro === r ? ' sel' : '') + '" data-cd="respFiltro" data-v="' + r + '">' + (r || 'Todos') + '</button>'; }).join('') + '</div>' : '') +
      (catFiltro === 'trabalho' && usados().length ? '<select class="cli-in" id="cliFiltro"><option value="">Todos os clientes</option>' + usados().map(function (c) { return '<option' + (c === cliFiltro ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' : '') +
      (pend.length ? pend.map(linha).join('') : '<div class="aviso" style="padding:12px 0 2px">Nada pendente ✓</div>') + '</div>' +
      (feitas.length ? '<button class="b novo" data-cd="verArq">' + (verArq ? 'Esconder arquivadas' : 'Arquivadas (' + feitas.length + ')') + '</button>' +
        (verArq ? '<div class="card" style="margin-top:10px"><h2>Arquivadas <small>toque no ✓ para reabrir</small></h2>' + feitas.map(function (t) { return linha(t).replace('</span><button class="mais"', quando(t) + '</span><button class="mais"'); }).join('') + '</div>' : '') : '');
    var nT = document.querySelector('#tarNova input'), nC = $('tarCliIn');
    if (nT && vT && !nT.value) nT.value = vT; if (nC && vC) nC.value = vC; if (foc === 'tarCliIn' && nC) nC.focus();
    var todas = L.filter(function (t) { return !t.ok; });
    var h = $('h-tar'); if (h) h.innerHTML = todas.length ? todas.slice(0, 4).map(function (t) { var c = catInfo(t.cat || 'pessoal'); return '<div class="proj"><div class="p" style="color:var(--tinta);font-size:14px"><span style="color:' + c[2] + ';font-weight:800">' + c[1] + '</span> · ' + (t.cli ? '<b>' + esc(t.cli) + '</b>: ' : '') + esc(t.t) + '</div></div>'; }).join('') + (todas.length > 4 ? '<div class="aviso">+' + (todas.length - 4) + ' outras</div>' : '') : '<div class="aviso">Nada pendente ✓</div>';
  }
  /* ---- calendário: reuniões (copiadas pela TV), eventos (aniversário repete todo ano) e tarefas com prazo ---- */
  var CORES_CAL = { feriado: '#FF9F6E', reuniao: '#C8A6FF', aniversario: '#FF7FA8', evento: '#8FE3FF', lembrete: '#FFD36E', tarefa: '#9CF2A8' };
  var NOME_TIPO = { feriado: 'Feriado', reuniao: 'Reunião', aniversario: 'Aniversário', evento: 'Evento', lembrete: 'Lembrete', tarefa: 'Tarefa' };
  var MESES_N = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var calMes = null, calDia = null, tipoNovo = 'evento';
  /* feriados nacionais e do Rio (mesma lista do despertador da TV) */
  function pascoa(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }
  var FIXOS = { '01-01': 'Confraternização Universal', '01-20': 'São Sebastião (Rio)', '04-21': 'Tiradentes', '04-23': 'São Jorge (RJ)', '05-01': 'Dia do Trabalho', '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal' };
  function feriado(dia) {
    if (FIXOS[dia.slice(5)]) return FIXOS[dia.slice(5)];
    var p = dia.split('-'), y = +p[0], t = new Date(y, +p[1] - 1, +p[2]).getTime(), off = Math.round((t - pascoa(y).getTime()) / 86400000);
    return { '-48': 'Carnaval', '-47': 'Carnaval', '-2': 'Sexta-feira Santa', '60': 'Corpus Christi' }[off] || null;
  }
  function itensDoDia(dia) {
    var out = [], md = dia.slice(5), fer = feriado(dia);
    if (fer) out.push({ k: 'feriado', h: '', t: fer });
    ((S.ag && S.ag.reunioes) || []).forEach(function (r) { if (r.d === dia) out.push({ k: 'reuniao', h: r.dt ? '' : r.h, t: r.t, fim: r.f }); });
    ((S.ev && S.ev.eventos) || []).forEach(function (e) { if (e.d === dia || (e.anual && e.d.slice(5) === md && e.d <= dia)) out.push({ k: e.tipo || 'evento', h: e.h, t: e.t, id: e.id, ev: e }); });
    ((S.tar && S.tar.tarefas) || []).forEach(function (t) { if (t.data === dia) out.push({ k: 'tarefa', h: '', t: (t.cli ? t.cli + ': ' : '') + t.t, id: t.id, ok: t.ok, cat: t.cat }); });
    return out.sort(function (a, b) { return (a.h || '') < (b.h || '') ? -1 : (a.h || '') > (b.h || '') ? 1 : 0; });
  }
  function renderCal() {
    var el = $('cal-dados'); if (!el) return;
    if (!token()) { el.innerHTML = semChave(); return; }
    if (!S.ev || !S.tar) { el.innerHTML = '<div class="card aviso">Carregando o calendário…</div>'; return; }
    var hj = hoje(); if (!calDia) calDia = hj; if (!calMes) calMes = hj.slice(0, 7);
    var y = +calMes.slice(0, 4), m = +calMes.slice(5, 7) - 1, ini = new Date(y, m, 1), d0 = new Date(y, m, 1 - ini.getDay());
    var g = '<div class="mes">' + ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function (x) { return '<div class="ds">' + x + '</div>'; }).join('');
    for (var i = 0; i < 42; i++) {
      var dd = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i), id = iso(dd);
      if (i === 35 && dd.getMonth() !== m) break;
      var its = itensDoDia(id), tipos = [];
      its.forEach(function (x) { if (!x.ok && tipos.indexOf(x.k) < 0) tipos.push(x.k); });
      g += '<button data-cd="calDia" data-v="' + id + '" class="' + (dd.getMonth() !== m ? 'fora ' : '') + (id === hj ? 'hoje ' : '') + (id === calDia ? 'sel' : '') + '">' + dd.getDate() +
        '<span class="pts">' + tipos.slice(0, 4).map(function (k) { return '<i style="background:' + CORES_CAL[k] + '"></i>'; }).join('') + '</span></button>';
    }
    g += '</div>';
    var lista = itensDoDia(calDia), p = calDia.split('-'), dSel = new Date(+p[0], +p[1] - 1, +p[2]);
    var DS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    var itens = lista.map(function (x) {
      var acao = x.k === 'tarefa' ? '<button class="box" data-cd="tarOk" data-id="' + x.id + '" style="all:unset;width:22px;height:22px;border-radius:7px;border:2px solid var(--suave);display:grid;place-items:center;font-size:13px;font-weight:800;color:#1B2A1D;' + (x.ok ? 'background:var(--verde);border-color:var(--verde)' : '') + '">' + (x.ok ? '✓' : '') + '</button>'
        : x.ev ? '<button class="mais" data-cd="evMenu" data-id="' + x.id + '" style="all:unset;color:var(--suave);font-size:20px;padding:0 4px;cursor:pointer">⋯</button>' : '';
      return '<div class="item' + (x.ok ? ' ok' : '') + '"><span class="barra-c" style="background:' + CORES_CAL[x.k] + '"></span><span class="hr">' + esc(x.h || '') + '</span>' +
        '<span class="tx">' + esc(x.t) + '<small>' + NOME_TIPO[x.k] + (x.fim ? ' · até ' + esc(x.fim) : '') + '</small></span>' + acao + '</div>';
    }).join('');
    var semAg = !S.ag || !(S.ag.reunioes || []).length;
    el.innerHTML = '<div class="card"><div class="mes-cab"><button data-cd="calMes" data-v="-1" aria-label="Mês anterior">‹</button><h2>' + MESES_N[m] + ' ' + y + '</h2><button data-cd="calMes" data-v="1" aria-label="Próximo mês">›</button></div>' + g +
      '<div class="aviso" style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap">' + Object.keys(CORES_CAL).map(function (k) { return '<span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + CORES_CAL[k] + '"></i> ' + NOME_TIPO[k] + '</span>'; }).join('') + '</div></div>' +
      '<div class="card" style="margin-top:10px"><h2>' + (calDia === hj ? 'Hoje · ' : '') + DS[dSel.getDay()] + ', ' + dSel.getDate() + ' de ' + MESES_N[dSel.getMonth()] + '</h2>' +
      (itens || '<div class="aviso">Nada neste dia.</div>') +
      '<form class="nova" id="calNovo"><input placeholder="Adicionar neste dia…" enterkeyhint="done"><button class="b sel">+</button></form>' +
      '<div class="tipos">' + ['evento', 'aniversario', 'lembrete', 'tarefa'].map(function (k) { return '<button class="b' + (tipoNovo === k ? ' sel' : '') + '" data-cd="tipoNovo" data-v="' + k + '">' + NOME_TIPO[k] + '</button>'; }).join('') + '</div>' +
      (tipoNovo !== 'aniversario' && tipoNovo !== 'tarefa' ? '<div class="linha2"><input type="time" id="calHora" aria-label="Hora (opcional)"></div>' : '') +
      (tipoNovo === 'tarefa' ? '<p class="aviso" style="margin:4px 0 0">Entra em Tarefas como ' + catInfo(catNova)[1] + ', com prazo neste dia.</p>' : '') +
      (tipoNovo === 'aniversario' ? '<p class="aviso" style="margin:4px 0 0">Repete todo ano.</p>' : '') + '</div>' +
      (semAg ? '<p class="aviso" style="margin:10px 4px">As reuniões do Outlook aparecem aqui depois que a TV ligar com a versão nova da Central.</p>' : '');
  }
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'calNovo') return; e.preventDefault();
    var inp = e.target.querySelector('input'), t = inp.value.trim(); if (!t) return; inp.value = '';
    var hr = $('calHora') ? $('calHora').value : '';
    if (tipoNovo === 'tarefa') op('tar', 'tarNova', { id: 't' + Date.now().toString(36), t: t, em: Date.now(), cat: catNova, cli: '', resp: catNova === 'trabalho' ? respNova.slice() : [], data: calDia });
    else op('ev', 'evNovo', { id: 'e' + Date.now().toString(36), d: calDia, h: hr, t: t, tipo: tipoNovo, anual: tipoNovo === 'aniversario' });
  });

  /* ---- lançamentos de jogos: calendário com capas + lista ---- */
  var PLAT_COR = { 'PS5': '#4F86F7', 'Xbox': '#5CC46B', 'PC': '#B9B6DA', 'Switch 2': '#FF5A5F', 'Switch': '#FF8A8C' };
  var lMes = null, lDia = null, lFiltro = ler('cd-lanc-filtro', '');
  function lancFiltrados() {
    var J = (S.lanc && S.lanc.jogos) || [];
    return J.filter(function (j) { return !lFiltro || (lFiltro === 'meu' ? j.meu : j.plat.indexOf(lFiltro) >= 0); }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  }
  function renderLanc() {
    var el = $('lanc-dados'); if (!el) return;
    if (!token()) { el.innerHTML = semChave(); return; }
    if (!S.lanc) { el.innerHTML = '<div class="card aviso">Carregando lançamentos…</div>'; return; }
    var hj = hoje(), L = lancFiltrados(); if (!lMes) lMes = (L.filter(function (j) { return j.d >= hj; })[0] || { d: hj }).d.slice(0, 7);
    var y = +lMes.slice(0, 4), m = +lMes.slice(5, 7) - 1, ini = new Date(y, m, 1), porDia = {};
    L.forEach(function (j) { (porDia[j.d] = porDia[j.d] || []).push(j); });
    var g = '<div class="mes lanc-mes">' + ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function (x) { return '<div class="ds">' + x + '</div>'; }).join('');
    for (var i = 0; i < 42; i++) {
      var dd = new Date(y, m, 1 - ini.getDay() + i), id = iso(dd); if (i === 35 && dd.getMonth() !== m) break;
      var js = porDia[id] || [], j0 = js.filter(function (x) { return x.meu; })[0] || js[0];
      g += '<button data-cd="lDia" data-v="' + id + '" class="' + (dd.getMonth() !== m ? 'fora ' : '') + (id === hj ? 'hoje ' : '') + (id === lDia ? 'sel ' : '') + (j0 ? 'tem-jogo' : '') + '"' + (j0 ? ' data-capa="' + j0.id + '"' : '') + '><span class="n">' + dd.getDate() + '</span>' + (js.length > 1 ? '<span class="qt">' + js.length + '</span>' : '') + '</button>';
    }
    g += '</div>';
    var lista = lDia ? (porDia[lDia] || []) : L.filter(function (j) { return j.d >= hj; });
    var DSC = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    var itens = lista.map(function (j) {
      var p = j.d.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]), falta = Math.round((dt - new Date(hj.replace(/-/g, '/'))) / 864e5);
      return '<div class="jogo"><div class="capa" data-capa="' + j.id + '"><span>' + esc(j.nome) + '</span></div><div class="info"><b><button class="estrela' + (j.meu ? ' on' : '') + '" data-cd="lMeu" data-id="' + j.id + '" aria-label="Quero jogar">' + (j.meu ? '★' : '☆') + '</button> ' + esc(j.nome) + '</b>' +
        '<small>' + DSC[dt.getDay()] + ', ' + p[2] + '/' + p[1] + '/' + p[0] + (falta === 0 ? ' · hoje!' : falta === 1 ? ' · amanhã' : falta > 1 ? ' · em ' + falta + ' dias' : ' · já saiu') + '</small>' +
        '<div class="plats">' + j.plat.map(function (x) { return '<i style="border-color:' + (PLAT_COR[x] || '#888') + ';color:' + (PLAT_COR[x] || '#ccc') + '">' + esc(x) + '</i>'; }).join('') + '</div></div></div>';
    }).join('');
    el.innerHTML = '<div class="filtros lanc-f">' + [['', 'Todos'], ['meu', '★ Quero'], ['PS5', 'PS5'], ['Switch 2', 'Switch 2'], ['PC', 'PC']].map(function (f) { return '<button class="b' + (lFiltro === f[0] ? ' sel' : '') + '" data-cd="lFiltro" data-v="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<div class="card"><div class="mes-cab"><button data-cd="lMes" data-v="-1" aria-label="Mês anterior">‹</button><h2>' + MESES_N[m] + ' ' + y + '</h2><button data-cd="lMes" data-v="1" aria-label="Próximo mês">›</button></div>' + g + '</div>' +
      '<div class="card" style="margin-top:10px"><h2>' + (lDia ? 'Dia ' + lDia.split('-').reverse().slice(0, 2).join('/') + ' <button class="data-chip" data-cd="lDia" data-v="">ver todos</button>' : 'Próximos lançamentos') + '</h2>' + (itens || '<div class="aviso">Nenhum lançamento.</div>') + '</div>' +
      '<p class="aviso" style="margin:10px 4px">Capas: Wikipedia. Datas: VGC, releasecalendar.games e gamegator (atualizado em ' + ((S.lanc.atualizado || '').slice(8, 10) + '/' + (S.lanc.atualizado || '').slice(5, 7)) + ').</p>';
    if (window.CAPAS) CAPAS.aplicar(el, S.lanc.jogos);
  }

  /* ---- marcações do dia: espelha no armazenamento do app (marc-AAAA-MM-DD) ---- */
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function espelhaMarc() {
    if (!S.marc) return;
    var h = hoje(), dia = (S.marc.dias || {})[h] || {}, k = 'marc-' + h;
    if (JSON.stringify(ler(k, {})) !== JSON.stringify(dia)) { gravar(k, dia); if (window.CEL && CEL.refazer) CEL.refazer(); }
  }
  /* ---- modo escolhido (vale mesmo com a TV desligada) ---- */
  function renderModo() {
    var m = S.estado && S.estado.modo; if (!m) return;
    document.querySelectorAll('#modos button').forEach(function (b) { b.classList.toggle('sel', b.dataset.v === m); if (token()) b.disabled = false; });
    var av = $('modo-repo'); if (av) av.textContent = 'Modo escolhido: ' + ({ normal: 'Normal', discreto: 'Discreto', ferias: 'Férias' }[m] || m) + '. Se a TV estiver desligada, ela entra nesse modo quando ligar.';
  }
  function render() { renderProj(); renderEst(); renderTar(); renderCal(); renderLanc(); renderInicio(); renderConfig(); espelhaMarc(); renderModo(); mostraStatus(status); }

  function novoId(nome) { var b = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'projeto', id = b, n = 2; while (S.proj.projetos[id]) id = b + '-' + n++; return id; }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cd]'); if (!b) return;
    var a = b.dataset.cd, P = S.proj && S.proj.projetos, pid = b.dataset.p, i = +b.dataset.i;
    if (a === 'salvaTok') {
      var v = (b.closest('.card').querySelector('.cd-tok').value || '').trim();
      if (!/^(github_pat_|ghp_)/.test(v)) { toast('A chave começa com github_pat_'); return; }
      gravar('gh-token', v); toast('Conectando…'); atualizar(); render();
    } else if (a === 'esqTok') { if (confirm('Esquecer a chave neste iPhone?')) { gravar('gh-token', ''); render(); } }
    else if (a === 'sync') atualizar();
    else if (a === 'copiaTok') {
      var txt = 'Bearer ' + token();
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Copiado! Cole no Authorization do atalho'); })
        .catch(function () { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copiado! Cole no Authorization do atalho'); } catch (e) { toast('Não consegui copiar'); } document.body.removeChild(ta); });
      fetch('https://api.github.com/user', { headers: hdr() }).then(function (r) { if (r.status === 401) toast('Atenção: o GitHub recusou esta chave também'); }).catch(function () {});
    }
    else if (a === 'abre') { aberto[pid] = !aberto[pid]; gravar('cd-aberto', aberto); render(); }
    else if (a === 'etOk') { var et = P[pid].etapas[i]; op('proj', 'etapaOk', { p: pid, i: i, t: et.t, ok: !et.ok }); }
    else if (a === 'etMenu') {
      var et2 = P[pid].etapas[i];
      var r = prompt('Editar a etapa (apague o texto para excluir). Para mover, escreva ↑ ou ↓:', et2.t);
      if (r === null) return; r = r.trim();
      if (r === '') { if (confirm('Excluir esta etapa?')) op('proj', 'etapaApaga', { p: pid, i: i, t: et2.t }); }
      else if (r === '↑' || r === '↓') op('proj', 'etapaMove', { p: pid, i: i, t: et2.t, dir: r === '↑' ? -1 : 1 });
      else if (r !== et2.t) op('proj', 'etapaTexto', { p: pid, i: i, antes: et2.t, t: r });
    }
    else if (a === 'pjNome') { var n1 = prompt('Nome do projeto:', P[pid].nome); if (n1 && n1.trim()) op('proj', 'projCampo', { p: pid, campo: 'nome', v: n1.trim() }); }
    else if (a === 'pjObj') { var o1 = prompt('Objetivo do projeto:', P[pid].objetivo || ''); if (o1 !== null) op('proj', 'projCampo', { p: pid, campo: 'objetivo', v: o1.trim() }); }
    else if (a === 'pjStatus') { var s0 = P[pid].status; op('proj', 'projCampo', { p: pid, campo: 'status', v: s0 === 'ativo' ? 'pausado' : s0 === 'pausado' ? 'concluido' : 'ativo' }); }
    else if (a === 'pjNovo') {
      var nm = prompt('Nome do novo projeto:'); if (!nm || !nm.trim()) return;
      var ob = prompt('Objetivo (pode deixar em branco):') || '';
      var id = novoId(nm.trim()), mx = 0; Object.keys(P).forEach(function (k) { mx = Math.max(mx, P[k].ordem || 0); });
      op('proj', 'projNovo', { id: id, nome: nm.trim(), obj: ob.trim(), ordem: mx + 1 }); aberto[id] = true; gravar('cd-aberto', aberto); render();
    }
    else if (a === 'tr') {
      var g = b.dataset.g, t = b.dataset.t, dn = ((S.est.progresso[g] || {}).done || {});
      op('est', 'trofeu', { g: g, t: t, ok: !dn[t] });
    }
    else if (a === 'tarOk') { var t0 = (S.tar.tarefas || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (t0) op('tar', 'tarOk', { id: t0.id, ok: !t0.ok, em: Date.now() }); }
    else if (a === 'tarFiltro') { catFiltro = b.dataset.v; gravar('cd-cat-filtro', catFiltro); render(); }
    else if (a === 'tarCatNova') { catNova = b.dataset.v; gravar('cd-cat-novo', catNova); gravar('cd-cat-nova', catNova); render(); }
    else if (a === 'tarCat') { var t2 = (S.tar.tarefas || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (!t2) return; var ord = CATS.map(function (c) { return c[0]; }); op('tar', 'tarCat', { id: t2.id, cat: ord[(ord.indexOf(t2.cat || 'pessoal') + 1) % ord.length] }); }
    else if (a === 'respNova') { var rv = b.dataset.v, ix = respNova.indexOf(rv); if (ix >= 0) respNova.splice(ix, 1); else respNova.push(rv); respNova.sort(function (x, y) { return RESP.indexOf(x) - RESP.indexOf(y); }); gravar('cd-resp-nova', respNova); render(); }
    else if (a === 'tarData') {
      var t5 = (S.tar.tarefas || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (!t5) return;
      var r5 = prompt('Prazo (dia/mês, ex.: 05/11). Apague para tirar:', t5.data ? dmy(t5.data) : ''); if (r5 === null) return;
      var d5 = lerData(r5); if (d5 === null) { toast('Data inválida. Use dia/mês, ex.: 05/11'); return; }
      op('tar', 'tarData', { id: t5.id, data: d5 });
    }
    else if (a === 'lMeu') { var jm = ((S.lanc && S.lanc.jogos) || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (jm) op('lanc', 'lancMeu', { id: jm.id, v: !jm.meu }); }
    else if (a === 'lDia') { lDia = b.dataset.v || null; render(); }
    else if (a === 'lMes') { var pl = lMes.split('-'), nl = new Date(+pl[0], +pl[1] - 1 + +b.dataset.v, 1); lMes = iso(nl).slice(0, 7); lDia = null; render(); }
    else if (a === 'lFiltro') { lFiltro = b.dataset.v; gravar('cd-lanc-filtro', lFiltro); lMes = null; lDia = null; render(); }
    else if (a === 'irLanc') { if (window.CEL_ABA) CEL_ABA('lanc'); }
    else if (a === 'calDia') { calDia = b.dataset.v; if (calDia.slice(0, 7) !== calMes) calMes = calDia.slice(0, 7); render(); }
    else if (a === 'calMes') { var pm = calMes.split('-'), nm = new Date(+pm[0], +pm[1] - 1 + +b.dataset.v, 1); calMes = iso(nm).slice(0, 7); render(); }
    else if (a === 'tipoNovo') { tipoNovo = b.dataset.v; render(); }
    else if (a === 'evMenu') {
      var e6 = ((S.ev && S.ev.eventos) || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (!e6) return;
      var r6 = prompt('Editar (apague o texto para excluir):', e6.t); if (r6 === null) return; r6 = r6.trim();
      if (!r6) { if (confirm('Excluir "' + e6.t + '"?')) op('ev', 'evApaga', { id: e6.id }); return; }
      var dd6 = prompt('Data (dia/mês):', dmy(e6.d)); if (dd6 === null) return; var d6 = lerData(dd6, e6.d); if (!d6) { toast('Data inválida'); return; }
      if (e6.anual) d6 = e6.d.slice(0, 4) + d6.slice(4);
      var h6 = e6.tipo === 'aniversario' ? '' : prompt('Hora (ex.: 14:30), ou vazio:', e6.h || ''); if (h6 === null) return;
      op('ev', 'evMuda', { id: e6.id, t: r6, d: d6, h: (h6 || '').trim() });
    }
    else if (a === 'verArq') { verArq = !verArq; render(); }
    else if (a === 'respFiltro') { respFiltro = b.dataset.v; render(); }
    else if (a === 'tarResp') {
      var t4 = (S.tar.tarefas || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (!t4) return;
      var r4 = prompt('Responsáveis (DBA, MSS, PAA), separados por espaço:', (t4.resp || []).join(' ')); if (r4 === null) return;
      var lista4 = []; r4.toUpperCase().split(/[^A-Z]+/).forEach(function (x) { if (RESP.indexOf(x) >= 0 && lista4.indexOf(x) < 0) lista4.push(x); });
      lista4.sort(function (x, y) { return RESP.indexOf(x) - RESP.indexOf(y); }); op('tar', 'tarResp', { id: t4.id, resp: lista4 });
    }
    else if (a === 'tarCli') {
      var t3 = (S.tar.tarefas || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (!t3) return;
      var r3 = prompt('Cliente desta tarefa (apague para tirar):', t3.cli || ''); if (r3 === null) return;
      var nm3 = nomeCliente(r3); op('tar', 'tarCli', { id: t3.id, cli: nm3 }); if (nm3 && S.cli) op('cli', 'cliNovo', { nome: nm3 });
    }
    else if (a === 'tarMenu') {
      var t1 = (S.tar.tarefas || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (!t1) return;
      var r1 = prompt('Editar a tarefa (apague o texto para excluir):', t1.t); if (r1 === null) return; r1 = r1.trim();
      if (!r1) { if (confirm('Excluir esta tarefa?')) op('tar', 'tarApaga', { id: t1.id }); } else if (r1 !== t1.t) op('tar', 'tarTexto', { id: t1.id, t: r1 });
    }
    else if (a === 'impAbre') { imp.aberto = true; imp.itens = []; imp.msg = ''; render(); }
    else if (a === 'impFecha') { imp.aberto = false; imp.itens = []; render(); }
    else if (a === 'impEscolhe') { var f = $('impArq'); if (f) { f.value = ''; f.click(); } }
    else if (a === 'impAplica') {
      var n = 0, jg = 0;
      imp.itens.forEach(function (it) { if (it.erro || !it.g) return; var pl = plano(it); if (!pl) return; n += pl.novos.length; jg++; op('est', 'importa', { g: it.g, ids: pl.ids, npwr: it.npwr }); });
      imp.itens = []; imp.msg = 'Pronto: ' + n + ' troféus novos marcados em ' + jg + ' jogo(s).'; render();
    }
    else if (a === 'jgSt') op('est', 'jogoStatus', { g: b.dataset.g, v: b.dataset.v });
    else if (a === 'faltam' || a === 'todos') { filtroFaltam = a === 'faltam'; gravar('cd-faltam', filtroFaltam); render(); }
  });
  /* tocar no texto do troféu oculto revela a descrição */
  document.addEventListener('click', function (e) {
    var sm = e.target.closest('.et small'); if (!sm || sm.textContent.indexOf('Oculto') !== 0) return;
    var bx = sm.closest('.et').querySelector('[data-cd="tr"]'); if (!bx) return;
    var tro = S.est.jogos[bx.dataset.g].trophies.filter(function (x) { return x.id === bx.dataset.t; })[0]; if (tro) sm.textContent = tro.desc;
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'tarNova') {
      e.preventDefault(); var ti = e.target.querySelector('input'), tv = ti.value.trim(); if (!tv || !S.tar) return;
      var ci = $('tarCliIn'), nmC = catNova === 'trabalho' && ci ? nomeCliente(ci.value) : '';
      var di = $('tarDataIn'), dt = di && di.value ? di.value : '';
      ti.value = ''; if (ci) ci.value = ''; if (di) di.value = '';
      op('tar', 'tarNova', { id: 't' + Date.now().toString(36), t: tv, em: Date.now(), cat: catNova, cli: nmC, resp: catNova === 'trabalho' ? respNova.slice() : [], data: dt });
      if (nmC && S.cli) op('cli', 'cliNovo', { nome: nmC }); setTimeout(function () { var i3 = document.querySelector('#tarNova input'); if (i3) i3.focus(); }, 30); return;
    }
    var f = e.target.closest('form.nova'); if (!f) return; e.preventDefault();
    var inp = f.querySelector('input'), v = inp.value.trim(); if (!v) return;
    op('proj', 'etapaNova', { p: f.dataset.p, t: v }); setTimeout(function () { var i2 = document.querySelector('form.nova[data-p="' + f.dataset.p + '"] input'); if (i2) i2.focus(); }, 30);
  });

  document.addEventListener('visibilitychange', function () { if (!document.hidden) atualizar(); });
  addEventListener('online', function () { Object.keys(ARQ).forEach(function (q) { enviar(q); }); });
  setInterval(function () { if (!document.hidden && !Object.keys(FILA).some(function (q) { return FILA[q].length; })) atualizar(); }, 120000);

  document.addEventListener('click', function (e) {
    var b = e.target.closest('#modos button'); if (!b || !token() || !S.estado) return;
    op('estado', 'modo', { v: b.dataset.v, em: Date.now() });
  });
  function marcar(k, v) { if (S.marc) op('marc', 'marca', { d: hoje(), k: k, v: !!v }); }
  /* ---- caixa de entrada (Siri): o atalho do iPhone cria um "issue" no repositório; aqui vira tarefa/evento/modo ---- */
  var ISSUES = 'https://api.github.com/repos/DuckDaniels1609/central-dados/issues', lendoEntrada = false;
  function entrada() {
    if (lendoEntrada || !token() || !S.tar || !S.ev || !S.estado || !window.ENTRADA) return;
    lendoEntrada = true;
    fetch(ISSUES + '?state=open&per_page=30&t=' + Date.now(), { headers: hdr(), cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(function (L) {
      L = L.filter(function (x) { return !x.pull_request; }).sort(function (a, b) { return a.number - b.number; });
      var feitos = [];
      L.forEach(function (x) {
        var em = Date.parse(x.created_at), r = ENTRADA.interpretar(x.title + (x.body ? ' ' + x.body : ''), new Date(em), (S.cli && S.cli.clientes) || []);
        if (r && (r.tipo === 'apagar' || r.tipo === 'feito')) {
          var al = ENTRADA.achar(r, (S.tar && S.tar.tarefas) || [], (S.ev && S.ev.eventos) || []);
          if (!al) feitos.push('não achei "' + (r.alvo || x.title) + '"');
          else if (r.tipo === 'feito') { op('tar', 'tarOk', { id: al.id, ok: true, em: em }); feitos.push('Feito: ' + al.t.trim()); }
          else if (al.kind === 'tar') { op('tar', 'tarApaga', { id: al.id }); feitos.push('Apaguei: ' + al.t.trim()); }
          else { op('ev', 'evApaga', { id: al.id }); feitos.push('Apaguei: ' + al.t.trim()); }
        }
        else if (r && r.tipo === 'modo') { op('estado', 'modo', { v: r.v, em: em }); feitos.push('Modo ' + r.v); }
        else if (r && r.tipo === 'tarefa') { op('tar', 'tarNova', { id: 's' + x.number, t: r.t, em: em, cat: r.cat, cli: r.cli, resp: r.resp, data: r.data }); if (r.cli && S.cli) op('cli', 'cliNovo', { nome: r.cli }); feitos.push('Tarefa: ' + r.t); }
        else if (r) { op('ev', 'evNovo', { id: 's' + x.number, d: r.d, h: r.h, t: r.t, tipo: r.tipo, anual: r.anual }); feitos.push(r.t); }
        var h2 = hdr(); h2['Content-Type'] = 'application/json';
        fetch(ISSUES + '/' + x.number, { method: 'PATCH', headers: h2, body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) }).catch(function () {});
      });
      if (feitos.length) toast('Da Siri: ' + feitos.join(' · '));
      lendoEntrada = false;
    }).catch(function () { lendoEntrada = false; });
  }
  setInterval(function () { if (!document.hidden) entrada(); }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(entrada, 2500); });

  window.CD = { render: render, inicio: renderInicio, atualizar: atualizar, marcar: marcar, temChave: function () { return !!token(); } };
  document.addEventListener('DOMContentLoaded', function () { render(); atualizar(); });
})();
