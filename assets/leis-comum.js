/* =====================================================================
   Livro de leis — comum ao site (leis.html) e ao painel (Livro de leis)
   · Junta as normas cadastradas pela Procuradoria/Secretaria (lgll_v1) com as que nasceram
     no sistema (projeto aprovado → lei sancionada/promulgada, resolução, decreto legislativo).
   · Texto compilado: aplica as alterações registradas artigo por artigo (nova redação,
     acréscimo, revogação), no estilo do Planalto: o texto antigo aparece riscado.
   Hoje lê do navegador; com o servidor, virá da API.
   ===================================================================== */
(function (g) {
  const KEY = 'lgll_v1', PROT = 'legislagov_protocolos_v2_neves-paulista-sp';
  const MOSTRAR_EXEMPLOS = true; // exemplos marcados (EXEMPLO) para demonstrar o texto compilado; desligar quando as leis reais forem cadastradas
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  g.LEIS_CHAVE = KEY;

  const EXEMPLOS = [
    { id: 'ex-lei-a', exemplo: true, tipo: 'Lei', numero: '0001', ano: 2026, data: '2026-03-10', ementa: 'Institui o Programa Horta Comunitária no Município e dá outras providências. (EXEMPLO para demonstração)',
      texto: 'Art. 1º Fica instituído o Programa Horta Comunitária, destinado ao cultivo de hortaliças em áreas públicas ociosas.\nArt. 2º As áreas serão cedidas por prazo de até 2 (dois) anos, mediante termo de permissão de uso.\nArt. 3º As despesas decorrentes desta Lei correrão por conta de dotações próprias do orçamento vigente.\nArt. 4º Esta Lei entra em vigor na data de sua publicação.',
      alteracoes: [
        { id: 'ex-alt-1', porLei: 'Lei nº 0002/2026 (exemplo)', dispositivo: 'Art. 2º', acao: 'redacao', texto: 'Art. 2º As áreas serão cedidas por prazo de até 4 (quatro) anos, prorrogável uma vez, mediante termo de permissão de uso.', data: '2026-06-02' },
        { id: 'ex-alt-2', porLei: 'Lei nº 0002/2026 (exemplo)', dispositivo: 'Art. 2º-A', acao: 'acrescimo', texto: 'Art. 2º-A Terão prioridade as associações de moradores do bairro onde está a área.', data: '2026-06-02' },
      ] }
  ];

  function livro() { const d = ler(KEY, {}) || {}; d.cfg = d.cfg || { ultimaLei: 0 }; d.leis = Array.isArray(d.leis) ? d.leis : []; return d; }
  g.lgLivro = livro;
  const isoDeBR = br => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(br || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  function deProtocolo(p) {
    const m = /^(Lei Municipal|Lei Complementar|Resolução|Decreto Legislativo)\s*n[ºo°]?\s*([\d.]+)\/(\d{4})/i.exec(p.lei || ''); if (!m) return null;
    const tipo = /^Lei Municipal/i.test(m[1]) ? 'Lei' : m[1];
    return { id: 'p-' + p.id, origem: p.id, tipo, numero: m[2].replace(/\./g, ''), ano: +m[3], data: isoDeBR(p.publicacao) || new Date().toISOString().slice(0, 10), ementa: p.ementa || '', texto: p.texto || '', vigencia: p.vigencia || '', autor: p.autor || '', projeto: p.numero || '', alteracoes: [] };
  }
  g.lgLeisTodas = function () {
    const d = livro(); const prots = ler(PROT, []) || [];
    const out = d.leis.map(x => ({ ...x }));
    prots.filter(p => p.lei && p.status === 'concluido').forEach(p => { if (out.some(x => x.origem === p.id)) return; const n = deProtocolo(p); if (n) out.push(n); });
    if (MOSTRAR_EXEMPLOS) EXEMPLOS.forEach(e => { if (!out.some(x => x.id === e.id)) out.push(JSON.parse(JSON.stringify(e))); });
    out.forEach(x => { x.titulo = `${x.tipo} nº ${x.numero}/${x.ano}`; });
    // alterações registradas na lei alterada e "alterada por" na lei que altera
    // legislação do sistema anterior (SISCAM), trazida pelo servidor em assets/siscam.js
    ((g.SISCAM && g.SISCAM.leis) || []).forEach(r => {
      const tipo = /ordin/i.test(r.tipo) ? 'Lei' : /complementar/i.test(r.tipo) ? 'Lei Complementar' : /^resolu/i.test(r.tipo) ? 'Resolução'
        : /decreto legislativo/i.test(r.tipo) ? 'Decreto Legislativo' : /emenda/i.test(r.tipo) ? 'Emenda à Lei Orgânica' : /decreto/i.test(r.tipo) ? 'Decreto Municipal' : r.tipo;
      const numero = String(r.numero).replace(/\D/g, '');
      if (out.some(x => x.tipo === tipo && +x.numero === +numero && x.ano === r.ano)) return;
      out.push({ id: `sc-${tipo}-${numero}-${r.ano}`.replace(/\W+/g, '-'), siscam: true, tipo, numero, ano: r.ano, data: r.data, ementa: r.ementa,
        texto: 'O texto integral desta norma está no arquivo do sistema anterior da Câmara (SISCAM): https://nevespaulista.siscam.com.br/index/81/8', alteracoes: [] });
    });
    return out.sort((a, b) => (b.ano - a.ano) || (+b.numero - +a.numero));
  };
  g.lgLeisProximoNumero = function (tipo) {
    const d = livro(); const todas = g.lgLeisTodas().filter(x => !x.exemplo && x.tipo === (tipo || 'Lei'));
    const ano = new Date().getFullYear();
    if ((tipo || 'Lei') === 'Lei' || tipo === 'Lei Complementar') return String(Math.max(+d.cfg[tipo === 'Lei Complementar' ? 'ultimaLC' : 'ultimaLei'] || 0, ...todas.map(x => +x.numero || 0)) + 1);
    return String(Math.max(0, ...todas.filter(x => x.ano === ano).map(x => +x.numero || 0)) + 1).padStart(2, '0');
  };

  /* ---------- texto compilado ---------- */
  const chaveDisp = s => { const m = /art\.?\s*(\d+)\s*[º°o]?\s*(?:-\s*([a-z]))?/i.exec(s || ''); return m ? 'art' + m[1] + (m[2] ? '-' + m[2].toLowerCase() : '') : ''; };
  g.lgLeisChave = chaveDisp;
  function blocos(texto) {
    const out = []; let cur = { k: 'pre', linhas: [] };
    String(texto || '').split(/\n/).forEach(l => { const k = /^\s*["“]?\s*Art\.?\s*\d+/i.test(l) ? chaveDisp(l) : ''; if (k) { if (cur.linhas.length || cur.k !== 'pre') out.push(cur); cur = { k, linhas: [l] }; } else cur.linhas.push(l); });
    out.push(cur); return out.filter(b => b.linhas.join('').trim()).map(b => ({ k: b.k, texto: b.linhas.join('\n'), ant: [], nota: '', rev: false }));
  }
  g.lgLeisCompilar = function (lei, opts) {
    const bs = blocos(lei.texto); const alts = (lei.alteracoes || []).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
    alts.forEach(a => {
      const k = chaveDisp(a.dispositivo); const i = bs.findIndex(b => b.k === k);
      if (a.acao === 'redacao' && i >= 0) { bs[i].ant.push({ texto: bs[i].texto, nota: bs[i].nota }); bs[i].texto = a.texto; bs[i].nota = `(Redação dada pela ${a.porLei})`; }
      else if (a.acao === 'revogacao' && i >= 0) { bs[i].rev = true; bs[i].nota = `(Revogado pela ${a.porLei})`; }
      else if (a.acao === 'acrescimo' || i < 0) {
        const base = k.replace(/-[a-z]$/, ''); let j = -1; bs.forEach((b, x) => { if (b.k === base || b.k.startsWith(base + '-')) j = x; });
        const novo = { k, texto: a.texto, ant: [], nota: `(Incluído pela ${a.porLei})`, rev: false };
        if (j >= 0) bs.splice(j + 1, 0, novo); else bs.push(novo);
      }
    });
    const br = t => esc(t).replace(/\n/g, '<br>');
    return bs.map(b => `${b.ant.map(x => `<p class="ll-ant"><s>${br(x.texto)}</s>${x.nota ? ` <em>${esc(x.nota)}</em>` : ''}</p>`).join('')}<p class="${b.rev ? 'll-rev' : ''}${b.nota ? ' ll-alt' : ''}">${b.rev ? `<s>${br(b.texto)}</s>` : br(b.texto)}${b.nota ? ` <em>${esc(b.nota)}</em>` : ''}</p>`).join('');
  };
  g.lgLeisAlteradaPor = function (lei, todas) { return (todas || g.lgLeisTodas()).filter(x => (x.alteracoes || []).some(a => a.porLeiId === lei.id || (a.porLei || '').includes(lei.titulo))).map(x => x.titulo); };
})(window);
