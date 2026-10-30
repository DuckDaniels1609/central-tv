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
if (typeof module !== 'undefined') module.exports = ENTRADA;
