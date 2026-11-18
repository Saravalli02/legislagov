/* =====================================================================
   LegislaGov — RELATÓRIOS
   Relatórios por período (mês, ano, intervalo ou desde o início do sistema):
   · Visão geral: resumo do período, produção por vereador
   · Proposições: todas, Projetos de Lei, Indicações, Requerimentos, Moções, Resoluções/Decretos,
     matérias em tramitação, votações, pareceres das comissões
   · Protocolo: protocolos, ofícios, atendimento ao público, protocolos em aberto, expedientes
   · Plenário: sessões, presença  · Normas e transparência: leis e normas, Ouvidoria e e-SIC
   Só o procurador vê o menu (e a equipe LegislaGov, para suporte).
   Cada relatório mostra totais, quantidade por tipo, por situação e por mês, e a lista completa.
   Imprimir / PDF com cabeçalho da Câmara (para o Tribunal de Contas e prestação de contas)
   e Baixar planilha (CSV que abre no Excel).
   Lê os mesmos dados das telas: Protocolo (lgv9_numeracao_v1), Matérias, Sessão plenária e Livro de leis.
   ===================================================================== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const UI = () => window.lgtUI;
  const aviso = (m, t, ti) => UI() ? UI().aviso(m, t, ti) : alert(m);
  const A = () => window.lgvrAPI;
  const eu = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const municipio = () => { try { return (typeof municipioAtual !== 'undefined' && municipioAtual) ? municipioAtual.replace(/\s[—-]\s[A-Z]{2}$/, '') : 'Neves Paulista'; } catch (e) { return 'Neves Paulista'; } };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const p2 = n => String(n).padStart(2, '0');
  const isoLocal = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hoje = () => isoLocal(new Date());
  /* data de qualquer formato usado no sistema → 'AAAA-MM-DD' (dia local) */
  const dia = v => {
    if (!v) return '';
    if (v instanceof Date) return isNaN(v) ? '' : isoLocal(v);
    const s = String(v);
    let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s); return isNaN(d) ? '' : isoLocal(d);
  };
  const dBR = iso => iso ? iso.split('-').reverse().join('/') : '—';
  const hora = v => { const d = new Date(v); return isNaN(d) || /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const mesNome = am => { const [a, m] = am.split('-'); return `${MESES[+m - 1]}/${a}`; };

  /* ================= fontes de dados ================= */
  const protocolos = () => ler('lgv9_numeracao_v1', []).filter(r => r && r.id);
  const ehReserva = r => ['reservado', 'rascunho'].includes(r.status) || /^\(reserva cancelada\)/.test(r.subject || '');
  const ST_PROT = r => /^\(reserva cancelada\)/.test(r.subject || '') ? 'Reserva cancelada' : ({ registrado: 'Em andamento', encaminhado: 'Em andamento', concluido: 'Concluído', reservado: 'Número reservado', rascunho: 'Número reservado' })[r.status] || '—';
  const materias = () => { try { return (A() ? A().listaProt() : []).filter(p => p && p.numero); } catch (e) { return []; } };
  const siglaDe = p => p.tipo || (/^([A-Z]+)\b/.exec(p.numero || '') || [])[1] || 'PL';
  const nomeTipo = p => { const s = siglaDe(p); try { return (A().TIPOS[s] || {}).nome || p.tipoNome || s; } catch (e) { return p.tipoNome || s; } };
  const situacao = p => {
    switch (p.status) {
      case 'protocolado': case 'enviado': case 'analise': case 'comissao': return 'Em tramitação';
      case 'votacao': return p.resultado === 'aprovado' ? 'Aprovado' : p.resultado === 'rejeitado' ? 'Rejeitado' : 'Na Ordem do Dia';
      case 'aguardando_exec': return 'Aprovado';
      case 'concluido': return p.resultado === 'rejeitado' ? 'Rejeitado' : 'Aprovado';
      case 'rejeitado': return 'Rejeitado';
      case 'devolvido': return 'Devolvido ao autor';
      default: return 'Em tramitação';
    }
  };
  const autorDe = p => String(p.autor || '—').replace(/ e outros$/, '');
  const sessoesTodas = () => { try { return window.lgplDados ? (lgplDados().sessoes || []) : []; } catch (e) { return []; } };
  const vereadores = () => { try { return A() ? A().comp().vereadores : []; } catch (e) { return []; } };
  const leisTodas = () => { try { return (window.lgLeisTodas ? lgLeisTodas() : []).filter(x => !x.exemplo); } catch (e) { return []; } };
  const faleConosco = () => ler('site_mensagens', []).filter(m => m && m.data);
  const msgInternas = () => ler('lgv10_messages_v1', []).filter(m => m && m.date);
  const semAc = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const PRAZO = i => i.canal === 'esic' ? (i.prorrogado ? 30 : 20) : (i.prorrogado ? 60 : 30);   // LAI art. 11 · Lei 13.460 art. 16
  const tipoOuv = i => String(i.categoria || 'Solicitação').replace(/^Recurso — /, '');
  const ouvidoria = () => { const d = ler('lgo_v1', {}) || {}; return Array.isArray(d.itens) ? d.itens : []; };
  const expedientes = () => { const m = (() => { try { return municipioAtual; } catch (e) { return ''; } })(); return ler('legislagov_expedientes_v1', []).filter(e => e && (!m || !e.municipio || e.municipio === m)); };
  const dataExp = e => { const t = +String(e.id || '').replace(/^exp-/, ''); return t > 1e12 ? isoLocal(new Date(t)) : dia(((e.timeline || [])[0] || {}).date); };
  const dias = (de, ate) => { const a = Date.parse(de), b = Date.parse(ate || new Date().toISOString()); return isNaN(a) || isNaN(b) ? '' : Math.max(0, Math.round((b - a) / 864e5)); };
  const media = l => { const v = l.filter(x => typeof x === 'number'); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };
  const CONCL = { favoravel: 'Favorável', contrario: 'Contrário', emenda: 'Favorável com emenda', diligencia: 'Diligência', substitutivo: 'Substitutivo' };
  const ehDoVereador = (p, v) => p.autorId === v.id || (!p.autorId && new RegExp('\\b' + String(v.nome).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(p.autor || ''));
  const ST_SESSAO = s => ({ encerrada: 'Realizada', agendada: 'Agendada', aberta: 'Em andamento', andamento: 'Em andamento', cancelada: 'Cancelada' })[s.status] || 'Agendada';

  /* ================= textos escritos pela Ouvidoria (análise, providências…) ================= */
  const TXT_KEY = 'lgrl_textos_v1';
  const chaveTxt = (campo, per) => `${est.rel}|${per[0]}|${per[1]}|${campo}`;
  const lerTxt = (campo, per) => (ler(TXT_KEY, {}) || {})[chaveTxt(campo, per)] || '';
  const gravarTxt = (campo, per, v) => { try { const o = ler(TXT_KEY, {}) || {}; o[chaveTxt(campo, per)] = v; localStorage.setItem(TXT_KEY, JSON.stringify(o)); } catch (e) { } };

  /* ================= período ================= */
  const est = { rel: 'resumo', per: 'ano', de: '', ate: '', tipo: '', q: '' };
  function inicioSistema() {
    const ds = [
      ...protocolos().map(r => dia(r.createdAt)), ...materias().map(p => dia(p.data)),
      ...sessoesTodas().map(s => dia(s.quando)), ...leisTodas().map(l => dia(l.data))
    ].filter(Boolean).sort();
    return ds[0] || `${new Date().getFullYear()}-01-01`;
  }
  function intervalo() {
    const d = new Date(), a = d.getFullYear(), m = d.getMonth();
    switch (est.per) {
      case 'mes': return [`${a}-${p2(m + 1)}-01`, isoLocal(new Date(a, m + 1, 0))];
      case 'mesant': return [`${m ? a : a - 1}-${p2(m ? m : 12)}-01`, isoLocal(new Date(a, m, 0))];
      case 'ano': return [`${a}-01-01`, `${a}-12-31`];
      case 'anoant': return [`${a - 1}-01-01`, `${a - 1}-12-31`];
      case 'inicio': return [inicioSistema(), hoje()];
      default: return [est.de || `${a}-01-01`, est.ate || hoje()];
    }
  }
  const noPeriodo = (iso, [de, ate]) => !!iso && iso >= de && iso <= ate;
  function fraseP(per) { const t = textoPeriodo(per); return /^Ano de/.test(t) ? 'no a' + t.slice(1) : /^De /.test(t) ? 'no período de ' + t.slice(3) : /^Desde/.test(t) ? t.toLowerCase() : 'em ' + t.toLowerCase(); }
  function textoPeriodo([de, ate]) {
    if (est.per === 'inicio') return `Desde o início do sistema (${dBR(de)}) até ${dBR(ate)}`;
    if (/^\d{4}-01-01$/.test(de) && ate === de.slice(0, 4) + '-12-31') return `Ano de ${de.slice(0, 4)}`;
    if (de.slice(8) === '01' && de.slice(0, 7) === ate.slice(0, 7) && ate === isoLocal(new Date(+de.slice(0, 4), +de.slice(5, 7), 0))) return `${MESES_L[+de.slice(5, 7) - 1]} de ${de.slice(0, 4)}`.replace(/^./, c => c.toUpperCase());
    return `De ${dBR(de)} a ${dBR(ate)}`;
  }
  /* meses do período, para a tabela "por mês" */
  function mesesDo([de, ate]) {
    const out = []; let a = +de.slice(0, 4), m = +de.slice(5, 7); const fa = +ate.slice(0, 4), fm = +ate.slice(5, 7);
    while ((a < fa || (a === fa && m <= fm)) && out.length < 240) { out.push(`${a}-${p2(m)}`); m++; if (m > 12) { m = 1; a++; } }
    return out;
  }
  const contar = (lista, chave) => { const o = {}; lista.forEach(x => { const k = chave(x) || '—'; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
  const porMes = (lista, dataDe, per) => { const ms = mesesDo(per); const o = Object.fromEntries(ms.map(k => [k, 0])); lista.forEach(x => { const k = (dataDe(x) || '').slice(0, 7); if (k in o) o[k]++; }); return ms.map(k => [mesNome(k), o[k]]); };

  /* ================= montagem de cada relatório ================= */
  const GRUPOS = [
    ['Visão geral', {
      resumo: { nome: 'Resumo do período', desc: 'Tudo o que foi feito, em números' },
      vereador: { nome: 'Produção por vereador', desc: 'Proposições, aprovações e presença de cada um' } }],
    ['Proposições', {
      proposicoes: { nome: 'Todas as proposições', desc: 'Por tipo, situação, autor e mês' },
      pl: { nome: 'Projetos de Lei', desc: 'Apresentados, aprovados, rejeitados e leis geradas', siglas: ['PL'] },
      ind: { nome: 'Indicações', desc: 'Pedidos ao Prefeito e respostas', siglas: ['IND'] },
      req: { nome: 'Requerimentos', desc: 'Pedidos de informação e providência', siglas: ['REQ'] },
      moc: { nome: 'Moções', desc: 'Aplauso, apoio, pesar ou repúdio', siglas: ['MOC'] },
      res: { nome: 'Resoluções e decretos legislativos', desc: 'Projetos de Resolução e de Decreto Legislativo', siglas: ['PR', 'PDL'] },
      tramitacao: { nome: 'Matérias em tramitação', desc: 'Onde está cada uma e há quantos dias' },
      votacoes: { nome: 'Votações', desc: 'Matérias votadas, resultado e placar' },
      pareceres: { nome: 'Pareceres das comissões', desc: 'Comissão, relator e conclusão' } }],
    ['Protocolo e documentos', {
      protocolos: { nome: 'Protocolos', desc: 'Por tipo, situação, setor, usuário e mês' },
      oficios: { nome: 'Ofícios', desc: 'Protocolados e enviados ao Prefeito, com respostas' },
      externos: { nome: 'Atendimento ao público', desc: 'Documentos entregues por pessoas e órgãos de fora' },
      pendentes: { nome: 'Protocolos em aberto', desc: 'O que ainda não foi concluído e há quantos dias' },
      expedientes: { nome: 'Expedientes', desc: 'Comunicações internas e com a Prefeitura' } }],
    ['Plenário', {
      sessoes: { nome: 'Sessões plenárias', desc: 'Realizadas por tipo e mês, com a pauta' },
      presenca: { nome: 'Presença dos vereadores', desc: 'Presenças, faltas e percentual' } }],
    ['Comunicação e atendimento', {
      ouvgestao: { nome: 'Relatório de gestão da Ouvidoria', desc: 'Modelo da Lei 13.460/2017, art. 15 — anual, para o Presidente e o site', modelo: true },
      lai: { nome: 'Relatório estatístico do e-SIC', desc: 'Modelo da LAI, art. 30, III — recebidos, atendidos e indeferidos', modelo: true },
      ouvidoria: { nome: 'Ouvidoria e e-SIC — lista', desc: 'Todos os pedidos e manifestações, com prazos' },
      faleconosco: { nome: 'Mensagens do Fale Conosco', desc: 'Mensagens enviadas pelo site' },
      mensagens: { nome: 'Mensagens internas', desc: 'Comunicação entre setores e usuários (sem o conteúdo)' } }],
    ['Normas', {
      leis: { nome: 'Leis e normas', desc: 'Leis, resoluções e decretos publicados' } }],
  ];
  const REL = Object.assign({}, ...GRUPOS.map(g => g[1]));

  function dadosProtocolos(per, soTipo) {
    const todos = protocolos().filter(r => noPeriodo(dia(r.createdAt), per));
    const reservas = todos.filter(ehReserva);
    let l = todos.filter(r => !ehReserva(r));
    if (soTipo) l = l.filter(r => r.type === soTipo);
    return { l, reservas };
  }
  function oficiosLista(per) {
    const prot = protocolos().filter(r => !ehReserva(r) && /^of[ií]cio/i.test(r.type || '') && noPeriodo(dia(r.createdAt), per))
      .map(r => ({ origem: 'Protocolo', numero: `${r.type} ${r.number}`, data: dia(r.createdAt), hora: hora(r.createdAt), assunto: r.subject || '', para: r.pessoa || r.to || '', situacao: ST_PROT(r), por: r.user || '' }));
    const ped = materias().filter(p => p.oficio && (p.oficio.enviado || p.oficio.numero) && noPeriodo(dia(p.oficio.enviado), per))
      .map(p => ({ origem: 'Ao Prefeito', numero: p.oficio.numero ? 'Ofício nº ' + p.oficio.numero : 'Ofício', data: dia(p.oficio.enviado), hora: '', assunto: `${p.numero} — ${p.ementa || ''}`, para: 'Prefeito Municipal', situacao: p.resposta ? 'Respondido' : 'Aguardando resposta', por: autorDe(p) }));
    return prot.concat(ped).sort((a, b) => a.data.localeCompare(b.data));
  }
  function montar() {
    const per = intervalo(), R = { per, titulo: REL[est.rel].nome, kpis: [], blocos: [], lista: null };
    const q = est.q.trim().toLowerCase(), busca = (...c) => !q || c.join(' ').toLowerCase().includes(q);
    if (est.rel === 'resumo') {
      const { l: pr, reservas } = dadosProtocolos(per);
      const mt = materias().filter(p => noPeriodo(dia(p.data), per));
      const of = oficiosLista(per), ss = sessoesTodas().filter(s => noPeriodo(dia(s.quando), per)), real = ss.filter(s => s.status === 'encerrada');
      const lei = leisTodas().filter(x => noPeriodo(dia(x.data), per));
      const pl = mt.filter(p => siglaDe(p) === 'PL');
      R.kpis = [[pr.length, 'protocolos'], [mt.length, 'proposições'], [pl.length, 'projetos de lei'], [of.length, 'ofícios'], [real.length, 'sessões realizadas'], [lei.length, 'leis e normas']];
      R.blocos.push({ t: 'Protocolos por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(pr, r => r.type), total: true });
      R.blocos.push({ t: 'Proposições por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(mt, nomeTipo), total: true });
      R.blocos.push({ t: 'Proposições por situação', cab: ['Situação', 'Quantidade'], linhas: contar(mt, situacao), total: true });
      R.blocos.push({ t: 'Leis e normas por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(lei, x => x.tipo || 'Lei'), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Protocolos', 'Proposições', 'Ofícios', 'Sessões', 'Leis'], largo: true,
        linhas: mesesDo(per).map(k => [mesNome(k), pr.filter(r => dia(r.createdAt).startsWith(k)).length, mt.filter(p => dia(p.data).startsWith(k)).length, of.filter(o => o.data.startsWith(k)).length, real.filter(s => dia(s.quando).startsWith(k)).length, lei.filter(x => dia(x.data).startsWith(k)).length]), total: true });
      if (reservas.length) R.nota = `${reservas.length} número(s) reservado(s) ou cancelado(s) no período não entram na contagem de protocolos.`;
    }
    if (est.rel === 'protocolos') {
      const { l: base, reservas } = dadosProtocolos(per, est.tipo);
      const l = base.filter(r => busca(r.type, r.number, r.subject, r.pessoa, r.from, r.to, r.user)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      R.tipos = [...new Set(protocolos().filter(r => !ehReserva(r)).map(r => r.type))].sort();
      R.kpis = [[l.length, est.tipo ? 'protocolos do tipo ' + est.tipo : 'protocolos'], [l.filter(r => r.status === 'concluido').length, 'concluídos'], [l.filter(r => r.status !== 'concluido').length, 'em andamento'], [l.filter(r => r.pessoa).length, 'vindos de fora']];
      R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, r => r.type), total: true });
      R.blocos.push({ t: 'Por situação', cab: ['Situação', 'Quantidade'], linhas: contar(l, ST_PROT), total: true });
      R.blocos.push({ t: 'Onde estão agora', cab: ['Setor', 'Quantidade'], linhas: contar(l.filter(r => r.status !== 'concluido'), r => r.to), total: true });
      R.blocos.push({ t: 'Quem protocolou', cab: ['Usuário', 'Quantidade'], linhas: contar(l, r => r.user), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Quantidade'], linhas: porMes(l, r => dia(r.createdAt), per), total: true });
      R.lista = { cab: ['Número', 'Data', 'Hora', 'Assunto', 'Veio de', 'Está com', 'Situação', 'Protocolado por'],
        linhas: l.map(r => [`${r.type} ${r.number}`, dBR(dia(r.createdAt)), hora(r.createdAt), r.subject, r.pessoa || r.from || '', r.status === 'concluido' ? '—' : (r.to || ''), ST_PROT(r), r.user || '']) };
      if (reservas.length) R.nota = `${reservas.length} número(s) reservado(s) ou cancelado(s) no período não entram na contagem.`;
    }
    if (est.rel === 'oficios') {
      const l = oficiosLista(per).filter(o => busca(o.numero, o.assunto, o.para, o.por));
      R.kpis = [[l.length, 'ofícios no período'], [l.filter(o => o.origem === 'Protocolo').length, 'protocolados'], [l.filter(o => o.origem === 'Ao Prefeito').length, 'enviados ao Prefeito'], [l.filter(o => o.situacao === 'Aguardando resposta').length, 'aguardando resposta']];
      R.blocos.push({ t: 'Por origem', cab: ['Origem', 'Quantidade'], linhas: contar(l, o => o.origem === 'Protocolo' ? 'Protocolados (recebidos ou enviados)' : 'Enviados ao Prefeito (indicações e requerimentos)'), total: true });
      R.blocos.push({ t: 'Por situação', cab: ['Situação', 'Quantidade'], linhas: contar(l, o => o.situacao), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Quantidade'], linhas: porMes(l, o => o.data, per), total: true });
      R.lista = { cab: ['Ofício', 'Data', 'Assunto', 'Destino / origem', 'Situação', 'Responsável'], linhas: l.map(o => [o.numero, dBR(o.data) + (o.hora ? ' ' + o.hora : ''), o.assunto, o.para, o.situacao, o.por]) };
    }
    if (est.rel === 'sessoes') {
      const l = sessoesTodas().filter(s => noPeriodo(dia(s.quando), per) && busca(s.titulo, s.tipo)).sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
      const real = l.filter(s => s.status === 'encerrada');
      R.kpis = [[real.length, 'sessões realizadas'], [real.filter(s => /ordin/i.test(s.tipo || '') && !/extra/i.test(s.tipo || '')).length, 'ordinárias'], [real.filter(s => /extra/i.test(s.tipo || '')).length, 'extraordinárias'], [real.reduce((n, s) => n + (s.itens || []).length, 0), 'itens na pauta']];
      R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Realizadas'], linhas: contar(real, s => s.tipo || 'Ordinária'), total: true });
      const vs = vereadores();
      if (vs.length) R.blocos.push({ t: 'Presença dos vereadores', cab: ['Vereador', 'Presenças', 'Faltas'], linhas: vs.map(v => { const n = real.filter(s => (s.presenca || {})[v.id]).length; return [v.nome, n, real.length - n]; }) });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Realizadas'], linhas: porMes(real, s => dia(s.quando), per), total: true });
      R.lista = { cab: ['Sessão', 'Data', 'Hora', 'Situação', 'Itens na pauta', 'Presentes'], linhas: l.map(s => [s.titulo || 'Sessão', dBR(dia(s.quando)), hora(s.quando), ST_SESSAO(s), (s.itens || []).length, Object.values(s.presenca || {}).filter(Boolean).length || '—']) };
    }
    if (est.rel === 'leis') {
      const l = leisTodas().filter(x => noPeriodo(dia(x.data), per) && busca(x.tipo, x.numero, x.ementa)).sort((a, b) => dia(a.data).localeCompare(dia(b.data)));
      R.kpis = [[l.length, 'leis e normas'], [l.filter(x => /^lei/i.test(x.tipo || 'Lei')).length, 'leis'], [l.filter(x => /resolu/i.test(x.tipo || '')).length, 'resoluções'], [l.filter(x => /decreto/i.test(x.tipo || '')).length, 'decretos legislativos']];
      R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, x => x.tipo || 'Lei'), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Quantidade'], linhas: porMes(l, x => dia(x.data), per), total: true });
      R.lista = { cab: ['Norma', 'Data', 'Ementa'], linhas: l.map(x => [`${x.tipo || 'Lei'} nº ${x.numero || '—'}${x.ano ? '/' + x.ano : ''}`, dBR(dia(x.data)), x.ementa || '']) };
    }

    if (REL[est.rel].siglas || est.rel === 'proposicoes') {
      const sig = REL[est.rel].siglas;
      const todas = materias().filter(p => noPeriodo(dia(p.data), per) && (!sig || sig.includes(siglaDe(p))));
      if (!sig) R.tipos = [...new Set(materias().map(nomeTipo))].sort();
      const l = todas.filter(p => (sig || !est.tipo || nomeTipo(p) === est.tipo) && busca(p.numero, p.ementa, p.autor)).sort((a, b) => dia(a.data).localeCompare(dia(b.data)) || String(a.numero).localeCompare(String(b.numero)));
      const sit = l.map(situacao), nome = sig ? REL[est.rel].nome.toLowerCase() : (est.tipo ? est.tipo : 'proposições');
      R.kpis = [[l.length, nome], [sit.filter(s => s === 'Aprovado').length, 'aprovadas'], [sit.filter(s => s === 'Rejeitado').length, 'rejeitadas'], [sit.filter(s => s === 'Em tramitação' || s === 'Na Ordem do Dia').length, 'em tramitação']];
      if (est.rel === 'pl') R.kpis.push([l.filter(p => p.lei).length, 'viraram lei']);
      if (est.rel === 'ind' || est.rel === 'req') { const env = l.filter(p => p.oficio); R.kpis.push([env.length, 'ofícios enviados'], [env.filter(p => p.resposta).length, 'respondidas pela Prefeitura']); }
      if (!sig && !est.tipo) R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, nomeTipo), total: true });
      if (sig && sig.length > 1) R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, nomeTipo), total: true });
      R.blocos.push({ t: 'Por situação', cab: ['Situação', 'Quantidade'], linhas: contar(l, situacao), total: true });
      R.blocos.push({ t: 'Por autor', cab: ['Autor', 'Quantidade'], linhas: contar(l, autorDe), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Quantidade'], linhas: porMes(l, p => dia(p.data), per), total: true });
      const extra = est.rel === 'pl' ? [['Lei', p => p.lei || '—']] : (est.rel === 'ind' || est.rel === 'req') ? [['Ofício', p => p.oficio ? (p.oficio.numero || 'enviado') : '—'], ['Resposta', p => p.resposta ? dBR(dia(p.resposta.data)) : (p.oficio ? 'aguardando' : '—')]] : [];
      R.lista = { cab: ['Número', 'Tipo', 'Data', 'Ementa', 'Autor', 'Situação', ...extra.map(x => x[0])], linhas: l.map(p => [p.numero, nomeTipo(p), dBR(dia(p.data)), p.ementa || '', autorDe(p), situacao(p), ...extra.map(x => x[1](p))]) };
    }
    if (est.rel === 'vereador') {
      const real = sessoesTodas().filter(s => s.status === 'encerrada' && noPeriodo(dia(s.quando), per));
      const mt = materias().filter(p => noPeriodo(dia(p.data), per));
      const linhas = vereadores().map(v => {
        const m = mt.filter(p => ehDoVereador(p, v)), n = sg => m.filter(p => siglaDe(p) === sg).length;
        return [v.nome, n('PL'), n('IND'), n('REQ'), n('MOC'), m.filter(p => !['PL', 'IND', 'REQ', 'MOC'].includes(siglaDe(p))).length, m.length, m.filter(p => situacao(p) === 'Aprovado').length, mt.filter(p => (p.coautores || []).includes(v.id)).length, real.filter(s => (s.presenca || {})[v.id]).length];
      }).filter(l => busca(l[0]));
      R.kpis = [[linhas.length, 'vereadores'], [mt.length, 'proposições'], [real.length, 'sessões realizadas']];
      R.blocos.push({ t: 'Produção de cada vereador', largo: true, cab: ['Vereador', 'PL', 'IND', 'REQ', 'MOC', 'Outras', 'Total', 'Aprovadas', 'Coautorias', 'Presenças'], linhas, total: true });
      R.nota = 'Conta as proposições pela data do protocolo e a presença só nas sessões realizadas (encerradas) no período.';
    }
    if (est.rel === 'tramitacao') {
      const l = materias().filter(p => noPeriodo(dia(p.data), per) && ['Em tramitação', 'Na Ordem do Dia'].includes(situacao(p)) && busca(p.numero, p.ementa, p.autor))
        .map(p => ({ p, d: dias(dia(p.data)) })).sort((a, b) => b.d - a.d);
      const onde = p => { try { return A().statusTxt(p); } catch (e) { return situacao(p); } };
      R.kpis = [[l.length, 'matérias em tramitação'], [l.filter(x => x.d > 30).length, 'há mais de 30 dias'], [l.filter(x => x.d > 90).length, 'há mais de 90 dias'], [media(l.map(x => x.d)), 'dias em média']];
      R.blocos.push({ t: 'Onde estão', cab: ['Etapa', 'Quantidade'], linhas: contar(l, x => onde(x.p).replace(/ · .*/, '')), total: true });
      R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, x => nomeTipo(x.p)), total: true });
      R.lista = { cab: ['Número', 'Ementa', 'Autor', 'Protocolada em', 'Onde está', 'Dias'], linhas: l.map(x => [x.p.numero, x.p.ementa || '', autorDe(x.p), dBR(dia(x.p.data)), onde(x.p), x.d]) };
    }
    if (est.rel === 'votacoes') {
      const l = materias().filter(p => p.votacao && noPeriodo(dia(p.votacao.data), per) && busca(p.numero, p.ementa, p.autor)).sort((a, b) => String(a.votacao.data).localeCompare(String(b.votacao.data)));
      const res = p => p.resultado === 'rejeitado' ? 'Rejeitado' : p.resultado === 'aprovado' || p.votacao.favor > p.votacao.contra ? 'Aprovado' : '—';
      const vet = materias().filter(p => p.veto && p.veto.votacao && noPeriodo(dia(p.veto.votacao.data), per));
      R.kpis = [[l.length, 'matérias votadas'], [l.filter(p => res(p) === 'Aprovado').length, 'aprovadas'], [l.filter(p => res(p) === 'Rejeitado').length, 'rejeitadas'], [vet.length, 'vetos apreciados']];
      R.blocos.push({ t: 'Por resultado', cab: ['Resultado', 'Quantidade'], linhas: contar(l, res), total: true });
      R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, nomeTipo), total: true });
      R.lista = { cab: ['Data', 'Matéria', 'Ementa', 'Resultado', 'Placar'], linhas: l.map(p => [dBR(dia(p.votacao.data)), p.numero, p.ementa || '', res(p), `${p.votacao.favor ?? '—'} a ${p.votacao.contra ?? '—'}${p.votacao.abstencao ? ` (${p.votacao.abstencao} abst.)` : ''}`])
        .concat(vet.map(p => [dBR(dia(p.veto.votacao.data)), 'Veto ao ' + p.numero, p.ementa || '', p.veto.resultado === 'rejeitado' ? 'Veto derrubado' : 'Veto mantido', `${p.veto.votacao.favor ?? '—'} a ${p.veto.votacao.contra ?? '—'}`])) };
    }
    if (est.rel === 'pareceres') {
      const l = []; materias().forEach(p => (p.pareceresComissoes || []).forEach(x => { if (noPeriodo(dia(x.data), per) && busca(p.numero, p.ementa, x.comissao, x.relator)) l.push({ p, x }); }));
      l.sort((a, b) => String(a.x.data).localeCompare(String(b.x.data)));
      const con = x => CONCL[x.conclusao] || (x.conclusao ? String(x.conclusao).replace(/^./, c => c.toUpperCase()) : '—');
      R.kpis = [[l.length, 'pareceres'], [l.filter(y => /favor/i.test(con(y.x))).length, 'favoráveis'], [l.filter(y => /contr/i.test(con(y.x))).length, 'contrários']];
      R.blocos.push({ t: 'Por comissão', cab: ['Comissão', 'Quantidade'], linhas: contar(l, y => y.x.comissao), total: true });
      R.blocos.push({ t: 'Por relator', cab: ['Relator', 'Quantidade'], linhas: contar(l, y => y.x.relator), total: true });
      R.lista = { cab: ['Data', 'Comissão', 'Matéria', 'Ementa', 'Relator', 'Conclusão'], linhas: l.map(y => [dBR(dia(y.x.data)), y.x.comissao || '', y.p.numero, y.p.ementa || '', y.x.relator || '', con(y.x)]) };
    }
    if (est.rel === 'externos' || est.rel === 'pendentes') {
      const { l: base } = dadosProtocolos(per, est.tipo);
      R.tipos = [...new Set(protocolos().filter(r => !ehReserva(r)).map(r => r.type))].sort();
      if (est.rel === 'externos') {
        const l = base.filter(r => r.pessoa && busca(r.type, r.number, r.subject, r.pessoa, r.to)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        R.kpis = [[l.length, 'atendimentos'], [new Set(l.map(r => r.pessoa.trim().toLowerCase())).size, 'pessoas ou órgãos'], [l.filter(r => r.status === 'concluido').length, 'concluídos']];
        R.blocos.push({ t: 'Quem mais protocolou', cab: ['Pessoa ou órgão', 'Quantidade'], linhas: contar(l, r => r.pessoa.trim()).slice(0, 15), total: true });
        R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, r => r.type), total: true });
        R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Quantidade'], linhas: porMes(l, r => dia(r.createdAt), per), total: true });
        R.lista = { cab: ['Número', 'Data', 'Hora', 'Apresentado por', 'Assunto', 'Encaminhado para', 'Situação'], linhas: l.map(r => [`${r.type} ${r.number}`, dBR(dia(r.createdAt)), hora(r.createdAt), r.pessoa, r.subject || '', r.to || '', ST_PROT(r)]) };
        R.nota = 'Telefone e e-mail de quem protocolou não aparecem no relatório (LGPD).';
      } else {
        const ult = r => { const a = (r.andamento || []).slice(-1)[0]; return (a && a.em) || r.createdAt; };
        const l = base.filter(r => r.status !== 'concluido' && busca(r.type, r.number, r.subject, r.pessoa, r.to)).map(r => ({ r, d: dias(r.createdAt), p: dias(ult(r)) })).sort((a, b) => b.d - a.d);
        R.kpis = [[l.length, 'protocolos em aberto'], [l.filter(x => x.p > 15).length, 'parados há mais de 15 dias'], [l.filter(x => x.d > 30).length, 'abertos há mais de 30 dias'], [media(l.map(x => x.d)), 'dias em média']];
        R.blocos.push({ t: 'Com qual setor', cab: ['Setor', 'Quantidade'], linhas: contar(l, x => x.r.to), total: true });
        R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, x => x.r.type), total: true });
        R.lista = { cab: ['Número', 'Assunto', 'Protocolado em', 'Está com', 'Última movimentação', 'Dias aberto', 'Dias parado'], linhas: l.map(x => [`${x.r.type} ${x.r.number}`, x.r.subject || '', dBR(dia(x.r.createdAt)), x.r.to || '', dBR(dia(ult(x.r))), x.d, x.p]) };
      }
    }
    if (est.rel === 'expedientes') {
      const l = expedientes().filter(e => noPeriodo(dataExp(e), per) && busca(e.numero, e.assunto, e.origem, e.destino, e.tipo)).sort((a, b) => dataExp(a).localeCompare(dataExp(b)));
      const st = e => ({ enviado: 'Enviado', recebido: 'Recebido', respondido: 'Respondido', concluido: 'Concluído', arquivado: 'Arquivado', devolvido: 'Devolvido' })[e.status] || (e.status ? String(e.status).replace(/^./, c => c.toUpperCase()) : '—');
      R.kpis = [[l.length, 'expedientes'], [l.filter(e => /conclu|arquiv|respond/i.test(e.status || '')).length, 'concluídos ou respondidos']];
      R.blocos.push({ t: 'Por tipo', cab: ['Tipo', 'Quantidade'], linhas: contar(l, e => e.tipo), total: true });
      R.blocos.push({ t: 'Por destino', cab: ['Destino', 'Quantidade'], linhas: contar(l, e => e.destino), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Quantidade'], linhas: porMes(l, dataExp, per), total: true });
      R.lista = { cab: ['Número', 'Data', 'Tipo', 'Assunto', 'De → Para', 'Situação', 'Prazo'], linhas: l.map(e => [e.numero || '', dBR(dataExp(e)), e.tipo || '', e.assunto || '', `${e.origem || ''} → ${e.destino || ''}`, st(e), e.prazo ? dBR(dia(e.prazo)) : '—']) };
    }
    if (est.rel === 'presenca') {
      const real = sessoesTodas().filter(s => s.status === 'encerrada' && noPeriodo(dia(s.quando), per));
      const linhas = vereadores().map(v => { const n = real.filter(s => (s.presenca || {})[v.id]).length; return [v.nome, real.length, n, real.length - n, real.length ? Math.round(n * 100 / real.length) + '%' : '—']; }).filter(l => busca(l[0]));
      R.kpis = [[real.length, 'sessões realizadas'], [real.length && linhas.length ? Math.round(linhas.reduce((a, l) => a + l[2], 0) * 100 / (real.length * linhas.length)) + '%' : '—', 'presença média']];
      R.blocos.push({ t: 'Presença de cada vereador', largo: true, cab: ['Vereador', 'Sessões', 'Presenças', 'Faltas', 'Presença'], linhas });
      R.lista = { cab: ['Sessão', 'Data', 'Presentes', 'Ausentes'], linhas: real.map(s => { const pres = vereadores().filter(v => (s.presenca || {})[v.id]); return [s.titulo || 'Sessão', dBR(dia(s.quando)), pres.map(v => v.nome).join(', ') || '—', vereadores().filter(v => !(s.presenca || {})[v.id]).map(v => v.nome).join(', ') || '—']; }) };
    }
    if (est.rel === 'ouvidoria') {
      const l = ouvidoria().filter(i => noPeriodo(dia(i.data), per) && busca(i.protocolo, i.assunto, i.categoria)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const resp = l.filter(i => i.status === 'respondido' && i.resposta), tempo = i => i.resposta ? dias(i.data, i.resposta.data) : '';
      R.kpis = [[l.length, 'pedidos e manifestações'], [l.filter(i => i.canal === 'esic').length, 'pedidos de informação (e-SIC)'], [l.filter(i => i.canal !== 'esic').length, 'manifestações da Ouvidoria'], [resp.length, 'respondidos'], [l.length - resp.length, 'em aberto'], [media(resp.map(tempo)), 'dias em média para responder']];
      R.blocos.push({ t: 'Por canal', cab: ['Canal', 'Quantidade'], linhas: contar(l, i => i.canal === 'esic' ? 'e-SIC (Lei de Acesso à Informação)' : 'Ouvidoria'), total: true });
      R.blocos.push({ t: 'Por categoria', cab: ['Categoria', 'Quantidade'], linhas: contar(l, i => i.categoria), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Quantidade'], linhas: porMes(l, i => dia(i.data), per), total: true });
      R.lista = { cab: ['Protocolo', 'Data', 'Canal', 'Categoria', 'Assunto', 'Situação', 'Respondido em', 'Dias'], linhas: l.map(i => [i.protocolo || '', dBR(dia(i.data)), i.canal === 'esic' ? 'e-SIC' : 'Ouvidoria', i.categoria || '', i.assunto || '', i.status === 'respondido' ? 'Respondido' : 'Em aberto', i.resposta ? dBR(dia(i.resposta.data)) : '—', tempo(i)]) };
      R.nota = 'Nome, e-mail e telefone de quem fez o pedido não aparecem no relatório (LGPD).';
    }

    if (est.rel === 'ouvgestao') {
      const l = ouvidoria().filter(i => i.canal !== 'esic' && noPeriodo(dia(i.data), per));
      const [de, ate] = per, dur = Date.parse(ate) - Date.parse(de) + 864e5;
      const antDe = isoLocal(new Date(Date.parse(de + 'T12:00') - dur)), antAte = isoLocal(new Date(Date.parse(de + 'T12:00') - 864e5));
      const ant = ouvidoria().filter(i => i.canal !== 'esic' && noPeriodo(dia(i.data), [antDe, antAte])).length;
      const resp = l.filter(i => i.resposta), noPrazo = resp.filter(i => dias(i.data, i.resposta.data) <= PRAZO(i));
      const abertos = l.filter(i => !i.resposta), vencidos = abertos.filter(i => dias(i.data) > PRAZO(i));
      const assuntos = {}; l.forEach(i => { const k = semAc(i.assunto); if (!k) return; (assuntos[k] = assuntos[k] || { t: i.assunto, n: 0, tipos: new Set() }).n++; assuntos[k].tipos.add(tipoOuv(i)); });
      const recorr = Object.values(assuntos).filter(a => a.n > 1).sort((a, b) => b.n - a.n);
      R.kpis = [[l.length, 'manifestações recebidas'], [resp.length, 'respondidas'], [resp.length ? Math.round(noPrazo.length * 100 / resp.length) + '%' : '—', 'respondidas no prazo'], [media(resp.map(i => dias(i.data, i.resposta.data))), 'dias em média para responder'], [abertos.length, 'em aberto']];
      R.secoes = [
        { t: 'Apresentação', base: 'Constituição Federal, art. 37, § 3º, I · Lei nº 13.460/2017, arts. 13 a 17', auto: `A Ouvidoria da Câmara Municipal de ${municipio()} recebe, analisa e responde às manifestações dos usuários dos serviços da Câmara: solicitações, sugestões, elogios, reclamações e denúncias. Este relatório consolida as manifestações recebidas ${fraseP(per)}, aponta os pontos que se repetiram e as providências adotadas, como pede o art. 15 da Lei nº 13.460/2017. Canais: formulário eletrônico no site da Câmara (Ouvidoria), atendimento presencial e telefone.`, campo: { id: 'apresentacao', dica: 'Se quiser, complete: quem é o ouvidor, horário de atendimento, ato que criou a Ouvidoria…' } },
        { t: 'I. Número de manifestações recebidas', base: 'Lei nº 13.460/2017, art. 15, I', auto: `Foram recebidas ${l.length} manifestação(ões) no período${ant || l.length ? `, contra ${ant} no período anterior de mesma duração (${dBR(antDe)} a ${dBR(antAte)})` : ''}.`,
          blocos: [{ t: 'Por mês', cab: ['Mês', 'Manifestações'], linhas: porMes(l, i => dia(i.data), per), total: true }] },
        { t: 'II. Motivos das manifestações', base: 'Lei nº 13.460/2017, art. 15, II',
          blocos: [{ t: 'Por tipo', cab: ['Tipo de manifestação', 'Quantidade'], linhas: ['Solicitação', 'Sugestão', 'Elogio', 'Reclamação', 'Denúncia'].map(t => [t, l.filter(i => tipoOuv(i) === t).length]).concat(contar(l.filter(i => !['Solicitação', 'Sugestão', 'Elogio', 'Reclamação', 'Denúncia'].includes(tipoOuv(i))), tipoOuv)), total: true },
            { t: 'Assuntos', cab: ['Assunto', 'Quantidade'], linhas: Object.values(assuntos).sort((a, b) => b.n - a.n || a.t.localeCompare(b.t)).slice(0, 20).map(a => [a.t, a.n]), total: true }] },
        { t: 'III. Análise dos pontos recorrentes', base: 'Lei nº 13.460/2017, art. 15, III',
          auto: recorr.length ? `${recorr.length} assunto(s) apareceram mais de uma vez no período. O mais frequente foi “${recorr[0].t}” (${recorr[0].n} vezes).` : 'Nenhum assunto se repetiu no período.',
          blocos: recorr.length ? [{ t: 'Assuntos que se repetiram', cab: ['Assunto', 'Tipos', 'Vezes'], linhas: recorr.map(a => [a.t, [...a.tipos].join(', '), a.n]) }] : [],
          campo: { id: 'recorrentes', dica: 'Escreva a análise: por que esses assuntos se repetem, que serviço ou setor envolvem, se há falha a corrigir.' } },
        { t: 'IV. Providências adotadas', base: 'Lei nº 13.460/2017, art. 15, IV · prazo de resposta: art. 16 (30 dias, prorrogáveis por mais 30)',
          auto: `${resp.length} manifestação(ões) respondida(s); ${noPrazo.length} dentro do prazo legal. Tempo médio de resposta: ${media(resp.map(i => dias(i.data, i.resposta.data)))} dia(s). ${l.filter(i => i.prorrogado).length} prorrogação(ões) com justificativa. ${abertos.length} em aberto ao fim do período${vencidos.length ? `, das quais ${vencidos.length} com prazo vencido` : ''}.`,
          blocos: [{ t: 'Situação das manifestações', cab: ['Situação', 'Quantidade'], linhas: [['Respondidas no prazo', noPrazo.length], ['Respondidas fora do prazo', resp.length - noPrazo.length], ['Em aberto, no prazo', abertos.length - vencidos.length], ['Em aberto, prazo vencido', vencidos.length]], total: true }],
          campo: { id: 'providencias', dica: 'Descreva o que a Câmara fez a partir das manifestações: correções, encaminhamentos, mudanças de procedimento, melhorias no atendimento.' } },
        { t: 'V. Recomendações da Ouvidoria', base: 'Lei nº 13.460/2017, art. 14, II', campo: { id: 'recomendacoes', dica: 'Liste as recomendações para melhorar o serviço (uma por linha).' } },
        { t: 'Encaminhamento e publicação', base: 'Lei nº 13.460/2017, art. 15, parágrafo único', auto: `Este relatório é encaminhado à autoridade máxima da Câmara (Presidente) e disponibilizado integralmente na internet, no Portal da Transparência.` }
      ];
      R.lista = { cab: ['Protocolo', 'Data', 'Tipo', 'Assunto', 'Situação', 'Respondido em', 'Dias', 'No prazo'], linhas: l.map(i => [i.protocolo || '', dBR(dia(i.data)), tipoOuv(i), i.assunto || '', i.resposta ? 'Respondida' : 'Em aberto', i.resposta ? dBR(dia(i.resposta.data)) : '—', i.resposta ? dias(i.data, i.resposta.data) : dias(i.data), i.resposta ? (dias(i.data, i.resposta.data) <= PRAZO(i) ? 'Sim' : 'Não') : (dias(i.data) > PRAZO(i) ? 'Vencido' : '—')]) };
      R.publicar = { cat: 'ouvidoria', sub: 'Relatório anual da Ouvidoria', titulo: 'Relatório de gestão da Ouvidoria' };
      R.nota = 'Nomes, e-mails e telefones de quem se manifestou não aparecem no relatório (LGPD).';
    }
    if (est.rel === 'lai') {
      const l = ouvidoria().filter(i => i.canal === 'esic' && noPeriodo(dia(i.data), per));
      const resp = l.filter(i => i.resposta), rt = i => (i.resposta && i.resposta.tipo) || '';
      const at = resp.filter(i => /^Atendido$/.test(rt(i))).length, parc = resp.filter(i => /parcial/i.test(rt(i))).length, neg = resp.filter(i => /^Negado/i.test(rt(i))).length,
        inex = resp.filter(i => /inexistente/i.test(rt(i))).length, enc = resp.filter(i => /compet/i.test(rt(i))).length;
      const noPrazo = resp.filter(i => dias(i.data, i.resposta.data) <= PRAZO(i));
      R.kpis = [[l.length, 'pedidos recebidos'], [at + parc, 'atendidos'], [neg, 'indeferidos'], [l.length - resp.length, 'em aberto'], [media(resp.map(i => dias(i.data, i.resposta.data))), 'dias em média para responder']];
      const perfis = contar(l, i => i.perfil || 'Não informado');
      R.secoes = [
        { t: 'Pedidos de informação recebidos, atendidos e indeferidos', base: 'Lei nº 12.527/2011 (LAI), art. 30, III',
          blocos: [{ t: 'Resultado dos pedidos', cab: ['Situação', 'Quantidade'], linhas: [['Recebidos', l.length], ['Atendidos integralmente', at], ['Atendidos parcialmente', parc], ['Indeferidos (negados: sigilo ou informação pessoal)', neg], ['Informação inexistente', inex], ['Não é competência da Câmara (encaminhados)', enc], ['Em aberto', l.length - resp.length]] },
            { t: 'Por mês', cab: ['Mês', 'Pedidos'], linhas: porMes(l, i => dia(i.data), per), total: true }] },
        { t: 'Prazos e recursos', base: 'LAI, art. 11 (20 dias, prorrogáveis por mais 10) e art. 15 (recurso)',
          auto: `Tempo médio de resposta: ${media(resp.map(i => dias(i.data, i.resposta.data)))} dia(s). ${noPrazo.length} de ${resp.length} resposta(s) dentro do prazo legal.`,
          blocos: [{ t: 'Prazos', cab: ['Indicador', 'Quantidade'], linhas: [['Respondidos no prazo', noPrazo.length], ['Respondidos fora do prazo', resp.length - noPrazo.length], ['Prazos prorrogados', l.filter(i => i.prorrogado).length], ['Recursos apresentados', l.filter(i => i.recurso).length]] }] },
        { t: 'Informações genéricas sobre os solicitantes', base: 'LAI, art. 30, III',
          auto: `${new Set(l.map(i => semAc(i.email)).filter(Boolean)).size} solicitante(s) diferente(s) no período.`,
          blocos: [{ t: 'Perfil do solicitante', cab: ['Perfil', 'Pedidos'], linhas: perfis, total: true }, { t: 'Como quis receber a resposta', cab: ['Forma', 'Pedidos'], linhas: contar(l, i => i.forma || 'Pelo site (consulta do protocolo)'), total: true }] },
        { t: 'Informações classificadas e desclassificadas', base: 'LAI, art. 30, I e II', campo: { id: 'classificadas', dica: 'Informe o rol de informações classificadas em grau de sigilo e as desclassificadas nos últimos 12 meses. Se não houver, escreva: “Não houve informações classificadas ou desclassificadas no período.”' } },
        { t: 'Observações', base: '', campo: { id: 'obs', dica: 'Observações da autoridade de monitoramento da LAI (opcional).' } }
      ];
      R.lista = { cab: ['Protocolo', 'Data', 'Assunto', 'Perfil', 'Resultado', 'Respondido em', 'Dias', 'Recurso'], linhas: l.map(i => [i.protocolo || '', dBR(dia(i.data)), i.assunto || '', i.perfil || '—', i.resposta ? rt(i) : 'Em aberto', i.resposta ? dBR(dia(i.resposta.data)) : '—', i.resposta ? dias(i.data, i.resposta.data) : dias(i.data), i.recurso ? 'Sim' : '—']) };
      R.publicar = { cat: 'sic', sub: 'Relatório estatístico do SIC', titulo: 'Relatório estatístico do SIC' };
      R.nota = 'Nomes, e-mails e telefones dos solicitantes não aparecem no relatório (LGPD).';
    }
    if (est.rel === 'faleconosco') {
      const l = faleConosco().filter(m => noPeriodo(dia(m.data), per) && busca(m.assunto, m.nome, m.protocolo)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      R.kpis = [[l.length, 'mensagens recebidas'], [new Set(l.map(m => semAc(m.email)).filter(Boolean)).size, 'pessoas diferentes']];
      R.blocos.push({ t: 'Por assunto', cab: ['Assunto', 'Quantidade'], linhas: contar(l, m => m.assunto || 'Sem assunto'), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Quantidade'], linhas: porMes(l, m => dia(m.data), per), total: true });
      R.lista = { cab: ['Protocolo', 'Data', 'Hora', 'Nome', 'Assunto'], linhas: l.map(m => [m.protocolo || '', dBR(dia(m.data)), hora(m.data), m.nome || '', m.assunto || '']) };
      R.nota = 'E-mail, telefone e o texto das mensagens não aparecem no relatório (LGPD). As mensagens chegam pelo formulário “Fale conosco” do site.';
    }
    if (est.rel === 'mensagens') {
      const dest = m => { const t = String(m.to || ''); return t === '*' ? 'Todos os usuários' : /^setor:/i.test(t) ? 'Setor: ' + t.slice(6) : 'Pessoa'; };
      const l = msgInternas().filter(m => noPeriodo(dia(m.date), per) && busca(m.from, m.to));
      R.kpis = [[l.length, 'mensagens enviadas'], [new Set(l.map(m => m.from)).size, 'pessoas enviaram'], [l.filter(m => (m.files || []).length).length, 'com anexo']];
      R.blocos.push({ t: 'Quem enviou', cab: ['Usuário', 'Mensagens'], linhas: contar(l, m => m.from), total: true });
      R.blocos.push({ t: 'Para quem', cab: ['Destino', 'Mensagens'], linhas: contar(l, dest), total: true });
      R.blocos.push({ t: 'Por mês', cab: ['Mês', 'Mensagens'], linhas: porMes(l, m => dia(m.date), per), total: true });
      R.nota = 'Por privacidade, o relatório mostra só quantidades: o assunto e o texto das mensagens não aparecem.';
    }
    const SING = { 'protocolos': 'protocolo', 'proposições': 'proposição', 'projetos de lei': 'projeto de lei', 'ofícios': 'ofício', 'sessões realizadas': 'sessão realizada', 'leis e normas': 'lei ou norma', 'concluídos': 'concluído', 'vindos de fora': 'vindo de fora', 'aprovadas': 'aprovada', 'rejeitadas': 'rejeitada', 'ofícios no período': 'ofício no período', 'protocolados': 'protocolado', 'enviados ao Prefeito': 'enviado ao Prefeito', 'ordinárias': 'ordinária', 'extraordinárias': 'extraordinária', 'leis': 'lei', 'resoluções': 'resolução', 'decretos legislativos': 'decreto legislativo', 'itens na pauta': 'item na pauta', 'viraram lei': 'virou lei', 'ofícios enviados': 'ofício enviado', 'respondidas pela Prefeitura': 'respondida pela Prefeitura', 'matérias em tramitação': 'matéria em tramitação', 'matérias votadas': 'matéria votada', 'vetos apreciados': 'veto apreciado', 'pareceres': 'parecer', 'favoráveis': 'favorável', 'contrários': 'contrário', 'atendimentos': 'atendimento', 'pessoas ou órgãos': 'pessoa ou órgão', 'protocolos em aberto': 'protocolo em aberto', 'expedientes': 'expediente', 'concluídos ou respondidos': 'concluído ou respondido', 'pedidos e manifestações': 'pedido ou manifestação', 'respondidos': 'respondido', 'vereadores': 'vereador', 'dias em média': 'dia em média', 'dias em média para responder': 'dia em média para responder', 'projetos de lei': 'projeto de lei', 'indicações': 'indicação', 'requerimentos': 'requerimento', 'moções': 'moção', 'manifestações recebidas': 'manifestação recebida', 'respondidas': 'respondida', 'pedidos recebidos': 'pedido recebido', 'atendidos': 'atendido', 'indeferidos': 'indeferido', 'mensagens recebidas': 'mensagem recebida', 'pessoas diferentes': 'pessoa', 'mensagens enviadas': 'mensagem enviada', 'pessoas enviaram': 'pessoa enviou' };
    R.kpis = R.kpis.map(([n, t]) => [n, n === 1 && SING[t] ? SING[t] : t]);
    return R;
  }

  /* ================= quem pode ================= */
  const SUPORTE = ['ricardo', 'geraldo'];
  window.lgrlPode = function () {
    const u = eu(); if (!u) return false;
    const login = String(u.usuario || u.login || '').toLowerCase();
    if (SUPORTE.includes(login)) return true;
    try { return (window.lgPerfil ? lgPerfil(u) : '') === 'procurador'; } catch (e) { return false; }
  };

  /* ================= tela ================= */
  function criarView() {
    if ($('#view-lgrl')) return;
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main) return;
    main.insertAdjacentHTML('beforeend', '<section class="view lgt lgrl" id="view-lgrl" style="display:none"></section>');
    const nav = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    if (nav) { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lgrl'; b.hidden = true; b.style.display = 'none'; nav.appendChild(b); }
  }
  window.lgrlAbrir = function (rel, per) {
    if (!lgrlPode()) { aviso('Os relatórios são da Procuradoria. Peça ao procurador.', 'erro'); return; }
    criarView();
    if (rel && REL[rel]) { if (rel !== est.rel) { est.tipo = ''; est.q = ''; } est.rel = rel; }
    if (per) est.per = per;
    if (typeof gotoShared === 'function') gotoShared('lgrl'); else { document.querySelectorAll('section.view').forEach(s => s.style.display = 'none'); $('#view-lgrl').style.display = 'block'; }
    if (window.lgv31Mark) lgv31Mark('relatorios');
    scrollTo(0, 0); desenhar();
  };
  const tabela = (b, cls = '') => {
    const tot = b.total && b.linhas.length ? b.cab.slice(1).map((_, i) => b.linhas.reduce((n, l) => n + (+l[i + 1] || 0), 0)) : null;
    const num = b.cab.map((_, i) => i > 0 && b.linhas.every(l => typeof l[i] === 'number'));
    return b.linhas.length ? `<div class="lgt-tabela-wrap"><table class="lgt-tabela ${cls}"><thead><tr>${b.cab.map((c, i) => `<th${num[i] ? ' class="lgrl-n"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.linhas.map(l => `<tr${l.slice(1).every(c => c === 0) ? ' class="lgrl-zero"' : ''}>${l.map((c, i) => `<td${i && typeof c === 'number' ? ' class="lgrl-n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>${tot ? `<tfoot><tr><th>Total</th>${tot.map(n => `<th class="lgrl-n">${n}</th>`).join('')}</tr></tfoot>` : ''}</table></div>${b.linhas.some(l => l.slice(1).every(c => c === 0)) ? '<p class="lgrl-dica-zero">No celular, os meses sem nada ficam escondidos.</p>' : ''}` : '<p class="lgrl-vazio">Nada no período.</p>';
  };
  function desenhar() {
    const el = $('#view-lgrl'); if (!el) return;
    const R = montar(), [de, ate] = R.per;
    const PER = [['mes', 'Este mês'], ['mesant', 'Mês passado'], ['ano', 'Este ano'], ['anoant', 'Ano passado'], ['inicio', 'Desde o início'], ['datas', 'Escolher datas']];
    const temFiltroTipo = !!R.tipos, temLista = !!R.lista;
    el.innerHTML = `
      <div class="letterhead"><div><h1>Relatórios</h1><div class="date">Escolha o relatório e o período. Imprima com o cabeçalho da Câmara (para o Tribunal de Contas, a Mesa ou quem pedir) ou baixe a planilha.</div></div></div>
      <label class="lgrl-sel-cel">Relatório<select id="lgrl-sel">${GRUPOS.map(([g, it]) => `<optgroup label="${esc(g)}">${Object.entries(it).map(([k, r]) => `<option value="${k}" ${est.rel === k ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <div class="lgrl-catalogo">${GRUPOS.map(([g, it]) => `<div class="lgrl-grupo"><h2>${esc(g)}</h2><div class="lgrl-escolha" role="radiogroup" aria-label="${esc(g)}">${Object.entries(it).map(([k, r]) => `<button type="button" role="radio" class="lgrl-tipo" aria-checked="${est.rel === k}" data-rel="${k}"><b>${esc(r.nome)}</b><small>${esc(r.desc)}</small></button>`).join('')}</div></div>`).join('')}</div>
      <div class="lgrl-filtros">
        <div class="lgrl-per" role="group" aria-label="Período">${PER.map(([k, t]) => `<button type="button" class="lgpr-chip" aria-pressed="${est.per === k}" data-per="${k}">${t}</button>`).join('')}</div>
        <div class="lgrl-campos">
          <label ${est.per === 'datas' ? '' : 'hidden'}>De<input type="date" id="lgrl-de" value="${de}"></label>
          <label ${est.per === 'datas' ? '' : 'hidden'}>Até<input type="date" id="lgrl-ate" value="${ate}"></label>
          ${temFiltroTipo ? `<label>Tipo<select id="lgrl-tipo"><option value="">Todos</option>${R.tipos.map(t => `<option ${est.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}
          ${temLista ? `<label class="lgrl-q">Buscar<input type="search" id="lgrl-q" value="${esc(est.q)}" placeholder="Número, assunto, nome…" autocomplete="off"></label>` : ''}
        </div>
      </div>
      <div class="lgrl-cabrel"><div><h2>${esc(R.titulo)}${est.tipo ? ' — ' + esc(est.tipo) : ''}</h2><p>${esc(textoPeriodo(R.per))}</p></div>
        <div class="lgrl-acoes"><button type="button" class="lgt-btn primario" onclick="lgrlImprimir()">${ic('externo')}Imprimir / PDF</button><button type="button" class="lgt-btn" onclick="lgrlPlanilha()">Baixar planilha</button>${R.publicar && typeof transpLer === 'function' ? '<button type="button" class="lgt-btn lgok-livre" onclick="lgrlPublicar()">Publicar no Portal da Transparência</button>' : ''}</div></div>
      <div class="lgrl-kpis">${R.kpis.map(([n, t]) => `<div><b>${n}</b><span>${esc(t)}</span></div>`).join('')}</div>
      ${REL[est.rel].modelo ? `<p class="lgrl-modelo">Modelo conforme ${esc(est.rel === 'lai' ? 'a Lei de Acesso à Informação (Lei nº 12.527/2011, art. 30)' : 'o Código de Defesa do Usuário do Serviço Público (Lei nº 13.460/2017, arts. 14 e 15)')}. Os números saem sozinhos do sistema; os campos de texto são para a Ouvidoria completar antes de imprimir ou publicar. ${est.per !== 'anoant' ? 'O relatório anual costuma usar o <b>ano passado</b>.' : ''}</p>` : ''}
      ${(R.secoes || []).map((sc, si) => `<section class="lgt-card lgrl-secao"><h3>${esc(sc.t)}</h3>${sc.base ? `<p class="lgrl-base">${esc(sc.base)}</p>` : ''}${sc.auto ? `<p>${esc(sc.auto)}</p>` : ''}${(sc.blocos || []).length ? `<div class="lgrl-grade">${sc.blocos.map(b => `<div class="${b.t === 'Por mês' || sc.blocos.length === 1 ? 'lgrl-largo' : ''}"><h4>${esc(b.t)}</h4>${tabela(b)}</div>`).join('')}</div>` : ''}${sc.campo ? `<label class="lgrl-campo"><span>${esc(sc.campo.dica)}</span><textarea data-campo="${sc.campo.id}" rows="4">${esc(lerTxt(sc.campo.id, R.per))}</textarea></label>` : ''}</section>`).join('')}
      <div class="lgrl-grade">${R.blocos.map(b => `<div class="lgt-card ${b.largo || b.t === 'Por mês' ? 'lgrl-largo' : ''}"><h3>${esc(b.t)}</h3>${tabela(b)}</div>`).join('')}</div>
      ${temLista ? `<div class="lgt-card lgrl-lista"><h3>${R.secoes ? 'Anexo — lista' : 'Lista completa'} (${R.lista.linhas.length})</h3>${tabela(R.lista, 'lgrl-det')}</div>` : ''}
      ${R.nota ? `<p class="lgrl-nota">${esc(R.nota)}</p>` : ''}`;
    el.querySelectorAll('textarea[data-campo]').forEach(t => t.oninput = () => gravarTxt(t.dataset.campo, R.per, t.value));
    const sc = $('#lgrl-sel'); if (sc) sc.onchange = () => { est.rel = sc.value; est.tipo = ''; est.q = ''; desenhar(); $('#lgrl-sel').focus(); };
    el.querySelectorAll('[data-rel]').forEach(b => b.onclick = () => { if (est.rel !== b.dataset.rel) { est.tipo = ''; est.q = ''; } est.rel = b.dataset.rel; desenhar(); $(`[data-rel="${est.rel}"]`)?.focus(); });
    el.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { if (b.dataset.per === 'datas' && est.per !== 'datas') { const [d0, d1] = intervalo(); est.de = d0; est.ate = d1; } est.per = b.dataset.per; desenhar(); $(`[data-per="${est.per}"]`)?.focus(); });
    const di = $('#lgrl-de'), da = $('#lgrl-ate');
    if (di) di.onchange = () => { est.de = di.value; if (est.ate && est.de > est.ate) est.ate = est.de; desenhar(); };
    if (da) da.onchange = () => { est.ate = da.value; if (est.de && est.ate < est.de) est.de = est.ate; desenhar(); };
    const ti = $('#lgrl-tipo'); if (ti) ti.onchange = () => { est.tipo = ti.value; desenhar(); };
    const qi = $('#lgrl-q'); if (qi) qi.oninput = () => { est.q = qi.value; const pos = qi.selectionStart; desenhar(); const n = $('#lgrl-q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } };
  }

  /* ================= imprimir e planilha ================= */
  const emitidoPor = () => { const u = eu(); return u ? (u.nome || u.usuario || '') + (u.usuario && u.nome ? ` (${u.usuario})` : '') : ''; };
  window.lgrlImprimir = function () {
    const R = montar(), agora = new Date();
    const w = window.open('', '_blank'); if (!w) { aviso('Permita janelas deste site para imprimir.', 'erro'); return; }
    const tab = b => {
      const tot = b.total && b.linhas.length ? b.cab.slice(1).map((_, i) => b.linhas.reduce((n, l) => n + (+l[i + 1] || 0), 0)) : null;
      return b.linhas.length ? `<table><thead><tr>${b.cab.map((c, i) => `<th${i && b.linhas.every(l => typeof l[i] === 'number') ? ' class="n"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.linhas.map(l => `<tr>${l.map((c, i) => `<td${i && typeof c === 'number' ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>${tot ? `<tfoot><tr><th>Total</th>${tot.map(n => `<th class="n">${n}</th>`).join('')}</tr></tfoot>` : ''}</table>` : '<p class="p">Nada no período.</p>';
    };
    const titulo = `${R.titulo}${est.tipo ? ' — ' + est.tipo : ''}`;
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} — ${esc(textoPeriodo(R.per))}</title><style>
      @page{size:A4;margin:16mm 14mm 18mm}
      body{font:12.5px/1.45 Arial,Helvetica,sans-serif;color:#111;max-width:780px;margin:20px auto;padding:0 16px}
      .cab{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;gap:16px;align-items:flex-end}
      .cab h1{font-size:17px;margin:0}.cab .p{margin:2px 0 0}.cab .r{text-align:right}
      h2{font-size:16px;margin:0 0 2px}h3{font-size:13.5px;margin:18px 0 6px;break-after:avoid}
      .kpis{display:grid;grid-template-columns:repeat(${Math.min(R.kpis.length, 6)},1fr);gap:8px;margin:12px 0 6px}
      .kpis div{border:1px solid #999;border-radius:6px;padding:8px 10px}.kpis b{display:block;font-size:20px}.kpis span{font-size:11.5px;color:#333}
      table{width:100%;border-collapse:collapse;margin-bottom:4px}thead{display:table-header-group}tr{break-inside:avoid}
      td,th{border:1px solid #999;padding:4px 7px;text-align:left;vertical-align:top;font-size:11.5px}th{background:#eee}.n{text-align:right;font-variant-numeric:tabular-nums}
      .grade{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.grade>div{break-inside:avoid}
      h3.sec{font-size:14px;border-bottom:1px solid #999;padding-bottom:3px;margin-top:22px}h4{font-size:12.5px;margin:10px 0 4px}.base{margin:0 0 6px;font-style:italic}.txt{border-left:3px solid #999;padding:4px 10px;margin:8px 0}
      .p{color:#444;font-size:11.5px}.rod{margin-top:22px;border-top:1px solid #999;padding-top:6px;display:flex;justify-content:space-between;gap:12px}
      .ass{margin-top:48px;display:flex;justify-content:center}.ass div{width:300px;border-top:1px solid #111;text-align:center;padding-top:4px;font-size:11.5px}
      @media print{button{display:none}body{margin:0;max-width:none}}</style></head><body>
      <div class="cab"><div><h1>Câmara Municipal de ${esc(municipio())}</h1><div class="p">Estado de São Paulo</div></div><div class="r"><h2>${esc(titulo)}</h2><div class="p">${esc(textoPeriodo(R.per))}</div></div></div>
      <div class="kpis">${R.kpis.map(([n, t]) => `<div><b>${n}</b><span>${esc(t)}</span></div>`).join('')}</div>
      ${(R.secoes || []).map(sc => `<h3 class="sec">${esc(sc.t)}</h3>${sc.base ? `<p class="p base">${esc(sc.base)}</p>` : ''}${sc.auto ? `<p>${esc(sc.auto)}</p>` : ''}${(sc.blocos || []).map(b => `<h4>${esc(b.t)}</h4>${tab(b)}`).join('')}${sc.campo ? (lerTxt(sc.campo.id, R.per).trim() ? `<div class="txt">${esc(lerTxt(sc.campo.id, R.per)).replace(/\n/g, '<br>')}</div>` : (sc.auto || (sc.blocos || []).length ? '' : '<p class="p">Nada registrado.</p>')) : ''}`).join('')}
      <div class="grade">${R.blocos.filter(b => !(b.largo || b.t === 'Por mês')).map(b => `<div><h3>${esc(b.t)}</h3>${tab(b)}</div>`).join('')}</div>
      ${R.blocos.filter(b => b.largo || b.t === 'Por mês').map(b => `<h3>${esc(b.t)}</h3>${tab(b)}`).join('')}
      ${R.lista ? `<h3${R.secoes ? ' class="sec"' : ''}>${R.secoes ? 'Anexo — lista' : 'Lista completa'} (${R.lista.linhas.length})</h3>${tab(R.lista)}` : ''}
      ${R.nota ? `<p class="p">${esc(R.nota)}</p>` : ''}
      <div class="ass"><div>${est.rel === 'ouvgestao' ? 'Ouvidor(a) da Câmara' : est.rel === 'lai' ? 'Autoridade de monitoramento da LAI' : 'Responsável'}</div></div>
      <div class="rod p"><span>Emitido em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${emitidoPor() ? ' por ' + esc(emitidoPor()) : ''}</span><span>Gerado pelo sistema LegislaGov</span></div>
      <p><button onclick="print()">Imprimir</button></p></body></html>`);
    w.document.close(); setTimeout(() => { try { w.print(); } catch (e) { } }, 400);
    try { window.registrarLog && registrarLog('Relatório emitido', `${titulo} — ${textoPeriodo(R.per)}`); } catch (e) { }
  };
  window.lgrlPlanilha = function () {
    const R = montar();
    const cel = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const linhas = [[`Câmara Municipal de ${municipio()}`], [`${R.titulo}${est.tipo ? ' — ' + est.tipo : ''}`], [textoPeriodo(R.per)], []];
    if (R.lista) { linhas.push(R.lista.cab); R.lista.linhas.forEach(l => linhas.push(l)); }
    else { linhas.push(['Indicador', 'Quantidade']); R.kpis.forEach(([n, t]) => linhas.push([t, n])); R.blocos.forEach(b => { linhas.push([]); linhas.push([b.t]); linhas.push(b.cab); b.linhas.forEach(l => linhas.push(l)); }); }
    const csv = '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
    const nome = `relatorio-${est.rel}${est.tipo ? '-' + est.tipo.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-') : ''}-${R.per[0]}-a-${R.per[1]}.csv`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  function textoRelatorio(R) {
    const L = [`CÂMARA MUNICIPAL DE ${municipio().toUpperCase()}`, R.titulo.toUpperCase(), textoPeriodo(R.per), ''];
    L.push(R.kpis.map(([n, t]) => `${t}: ${n}`).join(' · '), '');
    (R.secoes || []).forEach(sc => { L.push(sc.t.toUpperCase() + (sc.base ? ` (${sc.base})` : '')); if (sc.auto) L.push(sc.auto); (sc.blocos || []).forEach(b => { L.push(b.t + ':'); b.linhas.filter(l => !l.slice(1).every(c => c === 0) || b.t !== 'Por mês').forEach(l => L.push('  · ' + l[0] + ': ' + l.slice(1).join(' · '))); }); const t = sc.campo && lerTxt(sc.campo.id, R.per).trim(); if (t) L.push(t); L.push(''); });
    if (R.nota) L.push(R.nota);
    return L.join('\n');
  }
  window.lgrlPublicar = function () {
    const R = montar(); if (!R.publicar || typeof transpLer !== 'function') return;
    const ano = R.per[0].slice(0, 4) === R.per[1].slice(0, 4) ? R.per[0].slice(0, 4) : R.per[0].slice(0, 4) + '–' + R.per[1].slice(0, 4);
    const titulo = `${R.publicar.titulo} — ${/^Ano de /.test(textoPeriodo(R.per)) ? ano : textoPeriodo(R.per)}`;
    const texto = textoRelatorio(R), id = `lgrl-${est.rel}-${R.per[0]}-${R.per[1]}`;
    const go = () => { const agora = new Date().toISOString(); const l = transpLer().filter(x => x.id !== id);
      l.push({ id, origem: 'sistema', publicado: true, criadoEm: agora, atualizadoEm: agora, competencia: R.per[1].slice(0, 7), cat: R.publicar.cat, sub: R.publicar.sub, titulo, descricao: R.kpis.map(([n, t]) => `${t}: ${n}`).join(' · '), texto, data: hoje() });
      try { transpSalvar(l); aviso('Relatório publicado no Portal da Transparência.'); try { window.registrarLog && registrarLog('Relatório publicado', titulo); } catch (e) { } } catch (e) { aviso('Não foi possível publicar agora.', 'erro'); } };
    const U = window.lgtUI;
    if (U && U.confirmarPublicacao) U.confirmarPublicacao({ titulo, resumo: R.kpis.map(([n, t]) => `${t}: ${n}`).join(' · '), selo: 'Portal da Transparência · ' + R.publicar.sub, texto: 'Depois de confirmar, o relatório completo aparece no Portal da Transparência, para todos os visitantes, na hora. Se já existir um relatório deste mesmo período, ele é substituído.', ok: go });
    else if (confirm('Publicar no Portal da Transparência?')) go();
  };
  window.lgrlDados = montar;   // usado nos testes

  /* ================= estilo ================= */
  const css = document.createElement('style'); css.id = 'lgrl-style'; css.textContent = `
  .lgrl-catalogo{display:flex;flex-direction:column;gap:14px;margin:6px 0 16px}
  .lgrl-grupo h2{font-size:13px!important;font-weight:650;color:var(--lg28-muted);margin:0 0 6px}
  .lgrl-escolha{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
  .lgrl-tipo{display:flex;flex-direction:column;gap:2px;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);cursor:pointer;font:inherit}
  .lgrl-tipo b{font-size:14.5px}.lgrl-tipo small{color:var(--lg28-muted);font-size:12.5px;line-height:1.35}
  .lgrl-tipo[aria-checked="true"]{border:2px solid #1f4e79;padding:9px 11px;background:color-mix(in srgb,#1f4e79 7%,var(--lg28-panel))}
  .lgrl-sel-cel{display:none}
  .lgrl-tipo:focus-visible,.lgrl-per .lgpr-chip:focus-visible{outline:3px solid #1f4e7966;outline-offset:2px}
  .lgrl-per .lgpr-chip[aria-pressed="true"]{background:#1f4e79;border-color:#1f4e79;color:#fff}
  .lgrl-filtros{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
  .lgrl-per{display:flex;gap:8px;flex-wrap:wrap}
  .lgrl-campos{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
  .lgrl-campos label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--lg28-muted)}
  .lgrl-campos label[hidden]{display:none}
  .lgrl-campos input,.lgrl-campos select{height:42px;border-radius:9px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);padding:0 10px;font-size:15px;min-width:160px}
  .lgrl-q{flex:1;min-width:200px}.lgrl-q input{width:100%}
  .lgrl-cabrel{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;border-top:1px solid var(--lg28-stroke);padding-top:14px;margin-bottom:12px}
  .lgrl-cabrel h2{margin:0;font-size:19px!important}.lgrl-cabrel p{margin:2px 0 0;color:var(--lg28-muted);font-size:14px}
  .lgrl-acoes{display:flex;gap:8px;flex-wrap:wrap}
  .lgrl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}
  .lgrl-kpis div{padding:12px 14px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel)}
  .lgrl-kpis b{display:block;font-size:26px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}.lgrl-kpis span{color:var(--lg28-muted);font-size:13px}
  .lgrl-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.lgrl-grade>*{min-width:0}
  .lgrl-grade .lgt-card h3,.lgrl-lista h3{margin-top:0}
  .lgrl-largo{grid-column:1/-1}
  .lgrl-lista{margin-top:14px}
  .lgrl-grade .lgt-tabela{min-width:0}.lgrl-lista .lgt-tabela{min-width:720px}.lgrl-lista .lgt-tabela-wrap{overflow-x:auto!important}
  .lgrl .lgt-tabela .lgrl-n{text-align:right!important;font-variant-numeric:tabular-nums}.lgrl .lgt-tabela tfoot th{text-transform:none;letter-spacing:0}
  .lgrl-vazio{color:var(--lg28-muted);margin:4px 0}
  .lgrl-nota{color:var(--lg28-muted);font-size:13px;margin-top:10px}
  .lgrl-det td{font-size:13px}
    .lgrl-modelo{padding:12px 14px;border-radius:10px;border:1px solid #1f4e7955;background:color-mix(in srgb,#1f4e79 6%,var(--lg28-panel));font-size:14px;line-height:1.45;margin:0 0 14px}
  .lgrl-secao{margin-bottom:14px}.lgrl-secao h3{margin:0 0 2px}.lgrl-secao h4{margin:6px 0 6px;font-size:14px}
  .lgrl-base{margin:0 0 8px;color:var(--lg28-muted);font-size:13px;font-style:italic}
  .lgrl-secao>p{line-height:1.5}
  .lgrl-campo{display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:13.5px;color:var(--lg28-muted)}
  .lgrl-campo textarea{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);padding:10px 12px;font:inherit;font-size:15px;resize:vertical}
  .lgrl-dica-zero{display:none}
  @media(max-width:640px){.lgrl-catalogo{display:none}.lgrl-sel-cel{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--lg28-muted);margin:4px 0 12px}.lgrl-sel-cel select{height:48px;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);padding:0 10px;font-size:16px}.lgrl-zero{display:none!important}.lgrl-dica-zero{display:block;color:var(--lg28-muted);font-size:12.5px;margin:6px 0 0}.lgrl-grade{grid-template-columns:1fr}.lgrl-campos label{flex:1 1 45%}.lgrl-campos input,.lgrl-campos select{min-width:0;width:100%}.lgrl-acoes,.lgrl-acoes .lgt-btn{width:100%;justify-content:center}}`;
  document.head.appendChild(css);
})();
