/* =====================================================================
   PROPOSITURAS — página pública (proposituras.html)
   Mostra os projetos protocolados no LegislaGov: quem propôs, onde está
   agora e todo o histórico de tramitação até a decisão da Câmara.
   Hoje lê os dados do painel guardados neste navegador; na próxima fase
   lê da API do servidor (mesmos campos).
   ===================================================================== */
(function () {
  const CHAVE_PAINEL = 'legislagov_protocolos_v2_neves-paulista-sp';
  const MOSTRAR_EXEMPLOS = true; // demonstração: desligar quando houver dados reais

  const TIPOS = {
    PL: { nome: 'Projeto de Lei', plural: 'Projetos de Lei', fluxo: 'sancao' },
    PLC: { nome: 'Projeto de Lei Complementar', plural: 'Projetos de Lei Complementar', fluxo: 'sancao' },
    PR: { nome: 'Projeto de Resolução', plural: 'Projetos de Resolução', fluxo: 'promulga' },
    PDL: { nome: 'Projeto de Decreto Legislativo', plural: 'Projetos de Decreto Legislativo', fluxo: 'promulga' },
    IND: { nome: 'Indicação', plural: 'Indicações', fluxo: 'simples' },
    REQ: { nome: 'Requerimento', plural: 'Requerimentos', fluxo: 'simples' },
    MOC: { nome: 'Moção', plural: 'Moções', fluxo: 'simples' },
  };
  const ETAPAS = {
    sancao: ['Protocolo', 'Parecer jurídico', 'Comissões', 'Plenário', 'Sanção do Prefeito', 'Lei publicada'],
    promulga: ['Protocolo', 'Parecer jurídico', 'Comissões', 'Plenário', 'Promulgação'],
    simples: ['Protocolo', 'Despacho do Presidente', 'Plenário', 'Encaminhamento'],
  };
  const SITUACAO = {
    enviado: ['Aguardando recebimento', 'and'], protocolado: ['Protocolado', 'and'], analise: ['Em análise jurídica', 'and'],
    comissao: ['Em comissão', 'and'], votacao: ['Na Ordem do Dia', 'and'], aguardando_exec: ['Aprovado · aguardando sanção', 'apr'],
    devolvido: ['Devolvido ao autor', 'dev'], rejeitado: ['Rejeitado', 'rej'], concluido: ['Concluído', 'ok'],
  };

  /* ---------- exemplos (só na demonstração) ---------- */
  const EXEMPLOS = [
    { id: 'ex-pl024', numero: 'PL 024/2026', autor: 'Prefeito Municipal', ementa: 'Reforma administrativa da Secretaria Municipal de Obras', comissao: 'Justiça e Redação', status: 'comissao', data: '18/09/2026', docs: ['Projeto de Lei.pdf', 'Justificativa.pdf'],
      timeline: [{ date: '18/09 15:42', label: 'Enviado à Câmara pelo Poder Executivo' }, { date: '18/09 16:03', label: 'Recebido e protocolado pela Secretaria Legislativa' }, { date: '18/09 16:40', label: 'Despacho do Presidente: à Procuradoria Legislativa' }, { date: '19/09 08:50', label: 'Parecer jurídico favorável anexado' }, { date: '19/09 09:15', label: 'Encaminhado à Comissão de Justiça e Redação' }] },
    { id: 'ex-pl026', numero: 'PL 026/2026', autor: 'Prefeito Municipal', ementa: 'Cria o cargo de Psicólogo no quadro da rede municipal de saúde', comissao: 'Justiça e Redação', status: 'aguardando_exec', data: '10/09/2026', docs: ['Projeto de Lei.pdf', 'Justificativa.pdf', 'Autógrafo.pdf'], votacao: { favor: 7, contra: 1, abst: 0, sessao: '17ª Sessão Ordinária' },
      timeline: [{ date: '10/09 09:33', label: 'Enviado à Câmara pelo Poder Executivo' }, { date: '10/09 15:58', label: 'Recebido e protocolado pela Secretaria Legislativa' }, { date: '11/09 08:30', label: 'Parecer jurídico favorável anexado' }, { date: '11/09 10:00', label: 'Encaminhado à Comissão de Justiça e Redação' }, { date: '15/09 14:20', label: 'Parecer da Comissão de Justiça e Redação — favorável' }, { date: '16/09 10:10', label: 'Parecer da Comissão de Finanças e Orçamento — favorável' }, { date: '19/09 09:00', label: 'Incluído na Ordem do Dia' }, { date: '22/09 20:45', label: 'Aprovado em votação (7 a favor, 1 contra) — 17ª Sessão Ordinária' }, { date: '23/09 09:10', label: 'Autógrafo assinado pelo Presidente e enviado ao Prefeito para sanção' }] },
    { id: 'ex-pl027', numero: 'PL 027/2026', autor: 'Prefeito Municipal', ementa: 'Altera o quadro de cargos efetivos da Guarda Municipal', comissao: 'Justiça e Redação', status: 'concluido', data: '02/09/2026', lei: 'Lei Municipal nº 1842/2026', docs: ['Projeto de Lei.pdf', 'Justificativa.pdf', 'Lei Municipal 1842-2026.pdf'], votacao: { favor: 8, contra: 0, abst: 0, sessao: '15ª Sessão Ordinária' },
      timeline: [{ date: '02/09 08:55', label: 'Enviado à Câmara pelo Poder Executivo' }, { date: '02/09 13:10', label: 'Recebido e protocolado pela Secretaria Legislativa' }, { date: '03/09 08:40', label: 'Parecer jurídico favorável anexado' }, { date: '03/09 09:00', label: 'Encaminhado à Comissão de Justiça e Redação' }, { date: '05/09 10:00', label: 'Parecer da Comissão — favorável' }, { date: '08/09 20:30', label: 'Aprovado em votação (8 a favor) — 15ª Sessão Ordinária' }, { date: '09/09 09:00', label: 'Autógrafo enviado ao Prefeito para sanção' }, { date: '11/09 16:00', label: 'Sancionado pelo Prefeito' }, { date: '12/09 09:00', label: 'Publicado como Lei Municipal nº 1842/2026' }] },
    { id: 'ex-pl031', numero: 'PL 031/2026', tipo: 'PL', autorId: 16, coautores: [44], ementa: 'Institui a Semana Municipal de Conscientização sobre o Autismo', comissao: 'Assuntos Gerais', status: 'comissao', data: '06/10/2026', docs: ['Projeto de Lei.pdf'],
      timeline: [{ date: '06/10 10:12', label: 'Projeto de Lei assinado digitalmente pelos autores' }, { date: '06/10 10:12', label: 'Protocolado: PL 031/2026' }, { date: '07/10 09:30', label: 'Despacho do Presidente: à Procuradoria Legislativa' }, { date: '14/10 15:00', label: 'Parecer jurídico favorável anexado' }, { date: '15/10 09:00', label: 'Parecer da Comissão de Justiça e Redação — favorável' }, { date: '15/10 09:05', label: 'Encaminhado à Comissão de Assuntos Gerais' }] },
    { id: 'ex-req045', numero: 'REQ 045/2026', tipo: 'REQ', autorId: 48, ementa: 'Requer ao Executivo informações sobre o cronograma de manutenção das estradas rurais do município', status: 'votacao', data: '29/10/2026', docs: ['Requerimento.pdf'],
      timeline: [{ date: '29/10 14:20', label: 'Requerimento assinado digitalmente pelo autor' }, { date: '29/10 14:20', label: 'Protocolado: REQ 045/2026' }, { date: '30/10 09:00', label: 'Despacho do Presidente: incluir na Ordem do Dia' }, { date: '03/11 18:00', label: 'Incluído na Ordem do Dia da próxima sessão' }] },
    { id: 'ex-ind112', numero: 'IND 112/2026', tipo: 'IND', autorId: 32, ementa: 'Indica ao Executivo a instalação de bebedouros para animais nas praças públicas', status: 'concluido', data: '08/10/2026', docs: ['Indicação.pdf', 'Ofício ao Prefeito.pdf'], votacao: { favor: 9, contra: 0, abst: 0, sessao: '19ª Sessão Ordinária' },
      timeline: [{ date: '08/10 11:05', label: 'Indicação assinada digitalmente pela autora' }, { date: '08/10 11:05', label: 'Protocolado: IND 112/2026' }, { date: '09/10 09:00', label: 'Despacho do Presidente: incluir no Expediente' }, { date: '13/10 20:15', label: 'Aprovada em plenário — 19ª Sessão Ordinária' }, { date: '14/10 10:00', label: 'Encaminhada ao Prefeito por ofício' }] },
    { id: 'ex-moc019', numero: 'MOC 019/2026', tipo: 'MOC', autorId: 56, ementa: 'Moção de aplauso aos atletas do município pela participação nos Jogos Regionais', status: 'concluido', data: '20/10/2026', docs: ['Moção.pdf'], votacao: { favor: 9, contra: 0, abst: 0, sessao: '20ª Sessão Ordinária' },
      timeline: [{ date: '20/10 16:30', label: 'Moção assinada digitalmente pelo autor' }, { date: '20/10 16:30', label: 'Protocolado: MOC 019/2026' }, { date: '21/10 09:00', label: 'Despacho do Presidente: incluir na Ordem do Dia' }, { date: '27/10 20:40', label: 'Aprovada por unanimidade — 20ª Sessão Ordinária' }, { date: '28/10 10:00', label: 'Encaminhada aos homenageados' }] },
    { id: 'ex-pr002', numero: 'PR 002/2026', tipo: 'PR', autor: 'Mesa Diretora', ementa: 'Dispõe sobre a transmissão das sessões e a publicação dos votos nominais no site da Câmara', status: 'analise', data: '04/11/2026', docs: ['Projeto de Resolução.pdf'],
      timeline: [{ date: '04/11 09:40', label: 'Projeto de Resolução assinado pela Mesa Diretora' }, { date: '04/11 09:40', label: 'Protocolado: PR 002/2026' }, { date: '04/11 11:00', label: 'Despacho do Presidente: à Procuradoria Legislativa' }] },
  ].map(p => ({ ...p, exemplo: true }));

  /* ---------- dados ---------- */
  function lerPainel() {
    try {
      let raw = localStorage.getItem(CHAVE_PAINEL);
      if (!raw) for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('legislagov_protocolos_v2_') && k.includes('neves')) { raw = localStorage.getItem(k); break; } }
      const l = JSON.parse(raw || '[]'); return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }
  function todas() {
    const reais = lerPainel().filter(p => p && p.numero && p.status !== 'rascunho');
    const nums = new Set(reais.map(p => p.numero));
    const ex = MOSTRAR_EXEMPLOS ? EXEMPLOS.filter(p => !nums.has(p.numero)) : [];
    return [...reais, ...ex].map(enriquecer).sort((a, b) => b.ultimaOrd - a.ultimaOrd);
  }
  const tipoDe = p => { const t = p.tipo || String(p.numero || '').split(/[\s-]/)[0].toUpperCase(); return TIPOS[t] ? t : 'PL'; };
  const anoDe = p => (String(p.data || '').match(/(\d{4})/) || [])[1] || String(new Date().getFullYear());
  function ordem(dt, ano) { const m = String(dt || '').match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?\s*(\d{2})?:?(\d{2})?/); if (!m) return 0; return +((m[3] || ano) + m[2] + m[1] + (m[4] || '00') + (m[5] || '00')); }
  function autoresDe(p) {
    const ids = [p.autorId, ...(p.coautores || [])].filter(x => x != null);
    let vs = ids.map(verPorId).filter(Boolean);
    if (!vs.length && /^ver(\.|eador)/i.test(p.autor || '')) { const n = norm(p.autor).replace(/^ver(\.|eadora?)\s*/, '').replace(/\s+e outros$/, ''); const v = VEREADORES.find(x => norm(x.nome) === n || norm(x.completo) === n); if (v) vs = [v]; }
    return vs;
  }
  function enriquecer(p) {
    const t = tipoDe(p), T = TIPOS[t], ano = anoDe(p), tl = (p.timeline || []);
    const vs = autoresDe(p);
    const autorTxt = vs.length ? vs.map(v => (v.f ? 'Vereadora ' : 'Vereador ') + v.nome).join(', ') : (p.autor || 'Não informado');
    const ult = tl[tl.length - 1];
    return { ...p, t, T, ano, vs, autorTxt, origemAutor: vs.length ? 'vereador' : (/prefeit|executivo|secretaria/i.test(p.autor || '') ? 'executivo' : 'outros'), ultima: ult, ultimaOrd: ult ? ordem(ult.date, ano) : ordem(p.data, ano) };
  }
  function etapaAtual(p) {
    const f = p.T.fluxo, n = ETAPAS[f].length; const s = p.status;
    if (s === 'concluido') return { i: n, fim: true };
    if (s === 'rejeitado') return { i: f === 'simples' ? 2 : 3, rej: true };
    const mapa = f === 'simples' ? { enviado: 0, protocolado: 0, devolvido: 0, analise: 1, comissao: 1, votacao: 2, aguardando_exec: 3 }
      : { enviado: 0, protocolado: 0, devolvido: 0, analise: 1, comissao: 2, votacao: 3, aguardando_exec: 4 };
    return { i: mapa[s] ?? 0 };
  }
  function ondeEsta(p) {
    const s = p.status, f = p.T.fluxo;
    const com = p.comissao && p.comissao !== '—' ? (/^comiss/i.test(p.comissao) ? p.comissao : 'Comissão de ' + p.comissao) : 'Comissões permanentes';
    return ({
      enviado: 'Aguardando recebimento pela Secretaria Legislativa', protocolado: 'Aguardando despacho do Presidente da Câmara', devolvido: 'Devolvido ao autor para ajustes',
      analise: 'Procuradoria Legislativa — parecer jurídico', comissao: f === 'simples' ? 'Aguardando despacho do Presidente' : com, votacao: 'Plenário — incluído na Ordem do Dia',
      aguardando_exec: f === 'sancao' ? 'Com o Prefeito, para sanção ou veto' : (f === 'promulga' ? 'Aguardando promulgação pelo Presidente' : 'Encaminhamento ao destinatário'),
      rejeitado: 'Arquivado — rejeitado em plenário', concluido: p.lei ? 'Concluído — virou ' + p.lei : (f === 'simples' ? 'Concluído — aprovado e encaminhado' : 'Concluído'),
    })[s] || 'Em tramitação';
  }
  const grupoSit = p => p.status === 'rejeitado' ? 'rejeitadas' : (p.status === 'concluido' || p.status === 'aguardando_exec' ? 'aprovadas' : 'tramitando');
  const chipSit = p => { const [l, c] = SITUACAO[p.status] || ['Em tramitação', 'and']; return `<span class="pp-sit ${c}">${esc(l)}</span>`; };
  const dataTL = (dt, ano) => { const m = String(dt || '').match(/(\d{2})\/(\d{2})(?:\/\d{4})?\s*(\d{2}:\d{2})?/); return m ? `${m[1]}/${m[2]}/${ano}${m[3] ? ' · ' + m[3] : ''}` : esc(dt); };

  function avatar(p, tam) {
    if (p.vs.length) return `<span class="pp-av${tam ? ' ' + tam : ''}">${img(fotoVer(p.vs[0]), '', '', iniciais(p.vs[0].completo))}</span>`;
    return `<span class="pp-av pp-av-ic${tam ? ' ' + tam : ''}">${ic(p.origemAutor === 'executivo' ? 'predio' : 'grupo')}</span>`;
  }
  function trilho(p, compacto) {
    const e = ETAPAS[p.T.fluxo], a = etapaAtual(p);
    return `<ol class="pp-trilho${compacto ? ' mini' : ''}${a.rej ? ' rej' : ''}" aria-label="Etapas da tramitação">${e.map((nome, k) => {
      const st = a.fim || k < a.i ? 'feito' : (k === a.i ? (a.rej ? 'parou' : 'atual') : 'falta');
      const rot = st === 'feito' ? 'concluída' : st === 'atual' ? 'etapa atual' : st === 'parou' ? 'rejeitado nesta etapa' : 'a seguir';
      return `<li class="${st}"><span class="pp-bola" aria-hidden="true">${st === 'feito' ? '✓' : st === 'parou' ? '✕' : k + 1}</span><span class="pp-et">${esc(nome)}<span class="sr-only"> — ${rot}</span></span></li>`;
    }).join('')}</ol>`;
  }

  /* ---------- lista ---------- */
  function lista(app) {
    const estado = { q: param('q') || '', tipo: param('tipo') || '', sit: param('sit') || '', autor: param('autor') || '', ano: param('ano') || '', pag: 1 };
    const L = todas();
    const anos = [...new Set(L.map(p => p.ano))].sort().reverse();
    const tram = L.filter(p => grupoSit(p) === 'tramitando').length, apr = L.filter(p => grupoSit(p) === 'aprovadas').length, leis = L.filter(p => p.lei).length;
    const vAutor = estado.autor && verPorId(estado.autor);
    app.innerHTML = `<div class="cab-pag"><div class="wrap"><nav class="trilha" aria-label="Você está em"><a href="index.html">Início</a><span aria-hidden="true">›</span><span>Legislativo</span><span aria-hidden="true">›</span><span>Proposituras</span></nav>
      <h1>Proposituras</h1><p>Projetos de lei, indicações, requerimentos e moções: quem propôs, onde cada um está agora e todo o caminho até a decisão da Câmara.</p></div></div>
      <div class="wrap conteudo">
        <div class="pp-kpis"><div><b>${tram}</b><span>em tramitação</span></div><div><b>${apr}</b><span>aprovadas</span></div><div><b>${leis}</b><span>viraram norma</span></div><div><b>${L.length}</b><span>no total</span></div></div>
        <div class="filtros pp-filtros">
          <label class="campo-busca">${ic('busca')}<span class="sr-only">Pesquisar</span><input id="pp-q" placeholder="Pesquisar por assunto ou número (ex.: saúde, PL 024)" value="${esc(estado.q)}"></label>
          <label class="sr-only" for="pp-tipo">Tipo</label><select class="sel" id="pp-tipo"><option value="">Todos os tipos</option>${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}"${k === estado.tipo ? ' selected' : ''}>${t.plural}</option>`).join('')}</select>
          <label class="sr-only" for="pp-sit">Situação</label><select class="sel" id="pp-sit">${[['', 'Todas as situações'], ['tramitando', 'Em tramitação'], ['aprovadas', 'Aprovadas'], ['rejeitadas', 'Rejeitadas']].map(([v, l]) => `<option value="${v}"${v === estado.sit ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <label class="sr-only" for="pp-autor">Autor</label><select class="sel" id="pp-autor"><option value="">Todos os autores</option><option value="executivo"${estado.autor === 'executivo' ? ' selected' : ''}>Poder Executivo</option><option value="outros"${estado.autor === 'outros' ? ' selected' : ''}>Mesa Diretora e comissões</option><optgroup label="Vereadores">${VEREADORES.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(v => `<option value="${v.id}"${String(v.id) === estado.autor ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}</optgroup></select>
          <label class="sr-only" for="pp-ano">Ano</label><select class="sel" id="pp-ano"><option value="">Todos os anos</option>${anos.map(a => `<option${a === estado.ano ? ' selected' : ''}>${a}</option>`).join('')}</select>
        </div>
        ${vAutor ? `<div class="pp-autor-fil">${img(fotoVer(vAutor), '', '', iniciais(vAutor.completo))}<span>Proposituras de <b>${esc(vAutor.nome)}</b> (como autor ou coautor)</span><button type="button" class="btn btn-claro" id="pp-limpa-autor">Ver todas</button></div>` : ''}
        <p class="contador" id="pp-cont" role="status"></p>
        <div class="pp-lista" id="pp-lista"></div>
        <nav class="paginacao" id="pp-pag" aria-label="Páginas"></nav>
        ${L.some(p => p.exemplo) ? '<p class="nota pp-nota">Demonstração: os registros marcados como <b>exemplo</b> são fictícios e servem só para mostrar como a página funciona. As proposituras protocoladas no LegislaGov aparecem aqui automaticamente.</p>' : ''}
        <div class="aviso" style="margin-top:22px">Procurando proposituras de anos anteriores? <a href="${CONFIG.propositurasAntigo}" target="_blank" rel="noopener">Consulte o arquivo do sistema anterior</a>.</div>
      </div>`;
    const filtrar = () => {
      const q = norm(estado.q);
      return L.filter(p => (!estado.tipo || p.t === estado.tipo) && (!estado.sit || grupoSit(p) === estado.sit) && (!estado.ano || p.ano === estado.ano) &&
        (!estado.autor || (estado.autor === 'executivo' || estado.autor === 'outros' ? p.origemAutor === estado.autor : p.vs.some(v => String(v.id) === estado.autor))) &&
        (!q || norm([p.numero, p.ementa, p.autorTxt, p.T.nome, p.lei].join(' ')).includes(q) || norm(p.numero).replace(/\s/g, '').includes(q.replace(/\s/g, ''))));
    };
    const desenhar = () => {
      const l = filtrar(), porPag = 10, total = Math.max(1, Math.ceil(l.length / porPag)); estado.pag = Math.min(estado.pag, total);
      $('#pp-cont').textContent = `${l.length} propositura(s)`;
      $('#pp-lista').innerHTML = l.length ? l.slice((estado.pag - 1) * porPag, estado.pag * porPag).map(card).join('') :
        `<div class="pp-vazio">${ic('doc')}<b>Nenhuma propositura encontrada.</b><span>Tente outro termo ou limpe os filtros.</span></div>`;
      $('#pp-pag').innerHTML = total > 1 ? Array.from({ length: total }, (_, k) => `<button type="button" data-p="${k + 1}"${k + 1 === estado.pag ? ' aria-current="true"' : ''}>${k + 1}</button>`).join('') : '';
      const u = new URLSearchParams(); ['q', 'tipo', 'sit', 'autor', 'ano'].forEach(k => estado[k] && u.set(k, estado[k]));
      history.replaceState(null, '', 'proposituras.html' + (u.toString() ? '?' + u : ''));
    };
    $('#pp-q').oninput = e => { estado.q = e.target.value; estado.pag = 1; desenhar(); };
    [['#pp-tipo', 'tipo'], ['#pp-sit', 'sit'], ['#pp-autor', 'autor'], ['#pp-ano', 'ano']].forEach(([s, k]) => $(s).onchange = e => { estado[k] = e.target.value; estado.pag = 1; desenhar(); if (k === 'autor') lista(app); });
    const lim = $('#pp-limpa-autor'); if (lim) lim.onclick = () => { history.replaceState(null, '', 'proposituras.html'); lista(app); };
    $('#pp-pag').onclick = e => { const b = e.target.closest('button[data-p]'); if (b) { estado.pag = +b.dataset.p; desenhar(); $('#pp-lista').scrollIntoView({ block: 'start' }); } };
    desenhar();
  }
  function card(p) {
    return `<a class="pp-card" href="proposituras.html?id=${encodeURIComponent(p.id)}">
      <div class="pp-card-cab"><span class="pp-tipo">${esc(p.T.nome)}</span><b class="pp-num">${esc(p.numero)}</b>${p.exemplo ? '<span class="pp-ex">exemplo</span>' : ''}${chipSit(p)}</div>
      <h2 class="pp-ementa">${esc(p.ementa)}</h2>
      <div class="pp-card-info">
        <div class="pp-quem">${avatar(p)}<span><small>Autoria</small><b>${esc(p.autorTxt)}</b></span></div>
        <div class="pp-onde"><small>Onde está agora</small><b>${esc(ondeEsta(p))}</b></div>
      </div>
      ${trilho(p, true)}
      <div class="pp-card-rod"><span>${ic('relogio')} Última movimentação: ${p.ultima ? dataTL(p.ultima.date, p.ano) + ' — ' + esc(p.ultima.label) : 'apresentado em ' + esc(p.data)}</span><span class="pp-ver">Ver andamento ${ic('seta')}</span></div>
    </a>`;
  }

  /* ---------- detalhe ---------- */
  function detalhe(app, id) {
    const p = todas().find(x => x.id === id || x.numero === id);
    if (!p) { app.innerHTML = `<div class="cab-pag"><div class="wrap"><nav class="trilha"><a href="index.html">Início</a><span>›</span><a href="proposituras.html">Proposituras</a></nav><h1>Propositura não encontrada</h1><p>Ela pode ter sido retirada ou o endereço está incorreto.</p></div></div><div class="wrap conteudo"><a class="btn" href="proposituras.html">Ver todas as proposituras</a></div>`; return; }
    document.title = `${p.numero} — Proposituras — Câmara Municipal de Neves Paulista`;
    const tl = (p.timeline || []);
    const v = p.votacao;
    const temPDF = (() => { try { return !!localStorage.getItem('lgs_pdf_' + p.id); } catch (e) { return false; } })();
    app.innerHTML = `<div class="cab-pag"><div class="wrap"><nav class="trilha" aria-label="Você está em"><a href="index.html">Início</a><span aria-hidden="true">›</span><a href="proposituras.html">Proposituras</a><span aria-hidden="true">›</span><span>${esc(p.numero)}</span></nav>
      <p class="pp-cab-tipo">${esc(p.T.nome)}${p.exemplo ? ' · exemplo' : ''}</p><h1>${esc(p.numero)}</h1><p class="pp-cab-ementa">${esc(p.ementa)}</p></div></div>
      <div class="wrap conteudo pp-det">
        <div>
          <section class="pp-agora" aria-labelledby="pp-agora-t">
            <div class="pp-agora-topo"><div><small id="pp-agora-t">Onde está agora</small><b>${esc(ondeEsta(p))}</b></div>${chipSit(p)}</div>
            ${trilho(p)}
          </section>
          <h2 class="pp-h2">Histórico de tramitação</h2>
          ${tl.length ? `<ol class="pp-hist">${tl.map((t, k) => `<li${k === tl.length - 1 ? ' class="ult"' : ''}><time>${dataTL(t.date, p.ano)}</time><span>${esc(t.label)}</span></li>`).join('')}</ol>` : '<p class="nota">Sem movimentações registradas.</p>'}
          <div class="acoes"><a class="btn btn-claro" href="proposituras.html">${ic('esq')} Todas as proposituras</a><button class="btn btn-claro" type="button" onclick="print()">${ic('imprimir')} Imprimir</button><button class="btn btn-claro" type="button" id="pp-comp">${ic('compartilhar')} Compartilhar</button></div>
        </div>
        <aside class="pp-ficha">
          <h2>Autoria</h2>
          ${p.vs.length ? p.vs.map((x, k) => `<a class="pp-autor" href="vereador.html?id=${x.id}">${img(fotoVer(x), '', '', iniciais(x.completo))}<span><b>${esc(x.nome)}</b><small>${k ? 'Coautor' + (x.f ? 'a' : '') : 'Autor' + (x.f ? 'a' : '')} · ${esc(x.partido)}</small></span></a>`).join('')
            : `<div class="pp-autor">${avatar(p)}<span><b>${esc(p.autor || 'Não informado')}</b><small>${p.origemAutor === 'executivo' ? 'Poder Executivo' : 'Autoria institucional'}</small></span></div>`}
          <h2>Dados</h2>
          <dl>
            <dt>Tipo</dt><dd>${esc(p.T.nome)}</dd>
            <dt>Apresentado em</dt><dd>${esc(p.data || '—')}</dd>
            ${p.T.fluxo !== 'simples' && p.comissao && p.comissao !== '—' ? `<dt>Comissão</dt><dd>${esc(p.comissao)}</dd>` : ''}
            <dt>Situação</dt><dd>${esc((SITUACAO[p.status] || ['Em tramitação'])[0])}</dd>
            ${v ? `<dt>Votação</dt><dd>${v.favor} a favor · ${v.contra} contra${v.abst ? ' · ' + v.abst + ' abstenção(ões)' : ''}${v.sessao ? `<br><small>${esc(v.sessao)}</small>` : ''}</dd>` : ''}
            ${p.lei ? `<dt>Norma gerada</dt><dd><b>${esc(p.lei)}</b></dd>` : ''}
          </dl>
          ${(p.docs || []).length || temPDF ? `<h2>Documentos</h2><ul class="pp-docs">${temPDF ? `<li><button type="button" id="pp-pdf">${ic('doc')} Texto assinado (PDF)</button></li>` : ''}${(p.docs || []).map(d => `<li>${ic('doc')} ${esc(d)}</li>`).join('')}</ul><p class="nota">Cópias dos documentos podem ser pedidas à Secretaria Legislativa ou pelo e-SIC.</p>` : ''}
        </aside>
      </div>`;
    const b = $('#pp-pdf'); if (b) b.onclick = () => { try { const s = localStorage.getItem('lgs_pdf_' + p.id); const bin = atob(s.includes(',') ? s.split(',')[1] : s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })); a.download = p.numero.replace(/[\s/]+/g, '-') + '.pdf'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { } };
    $('#pp-comp').onclick = async () => { const dados = { title: p.numero, text: p.ementa, url: location.href }; try { if (navigator.share) await navigator.share(dados); else { await navigator.clipboard.writeText(location.href); $('#pp-comp').lastChild.textContent = ' Link copiado'; } } catch (e) { } };
  }

  function iniciar() {
    const app = $('#pp-app'); if (!app) return;
    const id = param('id'); id ? detalhe(app, id) : lista(app);
  }
  window.iniciarProposituras = iniciar;
  addEventListener('storage', e => { if (e.key && e.key.startsWith('legislagov_protocolos_v2_')) iniciar(); });
})();
