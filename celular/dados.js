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
  var ARQ = { proj: 'projetos.json', est: 'estante.json' };
  var S = { proj: ler('cd-proj', null), est: ler('cd-est', null) };
  var FILA = { proj: ler('cd-fila-proj', []), est: ler('cd-fila-est', []) };
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
    ['proj', 'est'].forEach(function (q) {
      baixar(ARQ[q]).then(function (r) {
        var d = r.dados; FILA[q].forEach(function (a) { try { OPS[a.op](d, a); } catch (e) {} });
        S[q] = d; gravar('cd-' + q, d); render(); mostraStatus(FILA[q].length ? 'salvando' : 'ok');
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
    if (!imp.aberto) return '<div class="btns dois" style="margin-bottom:12px"><button class="b sel" data-cd="impAbre">Importar do PS5</button><button class="b" data-cd="sync">Atualizar</button></div>';
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
      ? '<p class="aviso">Projetos e estante conectados ao seu repositório privado. <span class="cd-sync"></span></p><div class="btns dois"><button class="b" data-cd="sync">Atualizar agora</button><button class="b" data-cd="esqTok">Esquecer chave</button></div>'
      : semChave();
    mostraStatus(status);
  }
  function render() { renderProj(); renderEst(); renderInicio(); renderConfig(); mostraStatus(status); }

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
    var f = e.target.closest('form.nova'); if (!f) return; e.preventDefault();
    var inp = f.querySelector('input'), v = inp.value.trim(); if (!v) return;
    op('proj', 'etapaNova', { p: f.dataset.p, t: v }); setTimeout(function () { var i2 = document.querySelector('form.nova[data-p="' + f.dataset.p + '"] input'); if (i2) i2.focus(); }, 30);
  });

  document.addEventListener('visibilitychange', function () { if (!document.hidden) atualizar(); });
  addEventListener('online', function () { ['proj', 'est'].forEach(function (q) { enviar(q); }); });
  setInterval(function () { if (!document.hidden && !FILA.proj.length && !FILA.est.length) atualizar(); }, 120000);

  window.CD = { render: render, inicio: renderInicio, atualizar: atualizar };
  document.addEventListener('DOMContentLoaded', function () { render(); atualizar(); });
})();
