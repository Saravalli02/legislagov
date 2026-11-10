/* =====================================================================
   LegislaGov — COMISSÕES PERMANENTES (tramitação conforme o guia do processo legislativo)
   · A Procuradoria define, na aba Usuários, quem é Presidente, Vice e Relator de cada comissão.
   · O Presidente da Câmara distribui a matéria às comissões (Justiça e Redação sempre; Finanças e
     Assuntos Gerais quando couber).
   · Em cada comissão: o presidente da comissão designa o relator → o relator elabora e assina o
     parecer (favorável, favorável com emenda, contrário ou pedido de diligência) → os membros votam
     o parecer → aprovado, segue para a próxima comissão ou, concluídas todas, para o Plenário.
     Se a maioria rejeitar o parecer do relator, o presidente da comissão designa relator do voto vencedor.
   · Cada vereador só vê e só age nas comissões de que é membro (Portal do Vereador → Minhas comissões).
   · Parecer contrário não arquiva sozinho: a decisão final é do Plenário (confirmar no Regimento Interno).
   ===================================================================== */
(function () {
  const A = () => window.lgvrAPI;
  const $ = (s, el = document) => el.querySelector(s);
  const CONCL = {
    favoravel: ['Favorável', 'ok'], emenda: ['Favorável com emenda', 'ok'], contrario: ['Contrário', 'er'], diligencia: ['Pedido de diligência', 'av'],
  };
  const CARGOS = [['presidente', 'Presidente'], ['vice', 'Vice-Presidente'], ['relator', 'Relator']];

  /* ---------- composição ---------- */
  const comissoes = () => A().comp().comissoes || [];
  const comissao = nome => comissoes().find(c => c.nome === nome);
  const membros = c => CARGOS.map(([k]) => c && c[k]).filter(Boolean).filter((x, i, l) => l.indexOf(x) === i);
  const cargoEm = (c, vid) => { const k = CARGOS.find(([k]) => c[k] === vid); return k ? k[1] : ''; };
  const nomeV = id => (A().verPorId(id) || {}).nome || '— vago —';
  const minhasComissoes = v => comissoes().filter(c => membros(c).includes(v.id));
  const maioria = c => Math.floor(membros(c).length / 2) + 1;

  /* ---------- estado da matéria em cada comissão ---------- */
  function trab(p, nome) { p.comTrab = p.comTrab || {}; return (p.comTrab[nome] = p.comTrab[nome] || { inicio: new Date().toISOString(), votos: {} }); }
  function fase(p, nome) {
    const t = (p.comTrab || {})[nome];
    if (t && t.resultado) return 'concluida';
    if (p.status === 'comissao' && p.comissao === nome) {
      if (!t || !t.relator) return 'relator';
      if (t.diligencia && !t.diligencia.respondida) return 'diligencia';
      return t.parecer ? 'votacao' : 'parecer';
    }
    if (['votacao', 'aguardando_exec', 'concluido', 'rejeitado'].includes(p.status) && !(p.status === 'votacao' && !(p.pareceresComissoes || []).length && !p.comTrab)) return 'concluida';
    return 'aguardando';
  }
  const FASE_TXT = { relator: 'Aguardando designação do relator', parecer: 'Relator elaborando o parecer', diligencia: 'Em diligência (aguardando informações)', votacao: 'Parecer em votação na comissão', concluida: 'Parecer aprovado pela comissão', aguardando: 'Aguardando a vez' };

  /* entra na primeira comissão da rota (chamado no despacho ou após o parecer jurídico) */
  window.lgcmIniciar = function (p) {
    const rota = (p.comissoesRota && p.comissoesRota.length ? p.comissoesRota : ['Justiça e Redação']);
    p.comissoesRota = rota; p.status = 'comissao'; p.comissao = rota[0]; p.etapaComissao = 0; trab(p, rota[0]);
    p.timeline.push({ date: A().agoraTL(), label: `Encaminhado à Comissão de ${rota[0]}` });
  };

  /* o que o vereador precisa fazer nas comissões dele */
  window.lgcmPendencias = function (v) {
    const out = [];
    A().listaProt().filter(p => p.status === 'comissao' && p.comissao).forEach(p => {
      const c = comissao(p.comissao); if (!c || !membros(c).includes(v.id)) return;
      const f = fase(p, p.comissao), t = (p.comTrab || {})[p.comissao] || {};
      if (f === 'relator' && c.presidente === v.id) out.push({ p, c, acao: 'Designar relator' });
      else if ((f === 'parecer' || f === 'diligencia') && t.relator === v.id) out.push({ p, c, acao: f === 'diligencia' ? 'Retomar após diligência' : 'Elaborar parecer' });
      else if (f === 'votacao' && t.relator !== v.id && !t.votos[v.id]) out.push({ p, c, acao: 'Votar o parecer' });
    });
    return out;
  };

  /* ---------- tela: Minhas comissões ---------- */
  let aba = 'pendentes';
  window.lgcmTela = function (a, sel) {
    const api = A(), v = a.v, esc = api.esc, minhas = minhasComissoes(v), pend = lgcmPendencias(v);
    const prot = api.listaProt();
    const naComissao = nome => prot.filter(p => p.status === 'comissao' && p.comissao === nome);
    const concluidas = prot.filter(p => minhas.some(c => ((p.comTrab || {})[c.nome] || {}).resultado));
    const corpo = !minhas.length
      ? `<div class="lgt-card"><p class="lgt-p"><b>Você não faz parte de nenhuma comissão permanente.</b><br>A composição das comissões é definida pela Procuradoria na aba Usuários. Você pode acompanhar todas as matérias em “Acompanhar matérias”.</p></div>`
      : `<div class="lgcm-minhas">${minhas.map(c => `<div class="lgcm-com"><small>Comissão de</small><b>${esc(c.nome)}</b><span class="lgcm-cargo">${esc(cargoEm(c, v.id))}</span><p>${membros(c).map(id => `${esc(nomeV(id))} <i>${esc(cargoEm(c, id))}</i>`).join(' · ')}</p><em>${naComissao(c.nome).length} matéria(s) na comissão</em></div>`).join('')}</div>
        <div class="lgf-abas" role="tablist">${[['pendentes', 'Para você agir', pend.length], ['todas', 'Na comissão', minhas.reduce((n, c) => n + naComissao(c.nome).length, 0)], ['concluidas', 'Pareceres concluídos', concluidas.length]].map(([k, n, q]) => `<button type="button" role="tab" aria-selected="${aba === k}" onclick="lgcmAba('${k}')">${n} <b>${q}</b></button>`).join('')}</div>
        <div class="lgcm-lista">${(aba === 'pendentes' ? pend.map(x => cartao(x.p, x.c, v, x.acao)) : aba === 'todas' ? minhas.flatMap(c => naComissao(c.nome).map(p => cartao(p, c, v))) : concluidas.map(p => cartao(p, minhas.find(c => ((p.comTrab || {})[c.nome] || {}).resultado), v))).join('') ||
          `<p class="lgt-p lgcm-vazio">${aba === 'pendentes' ? 'Nada aguardando você nas comissões.' : 'Nenhuma matéria aqui.'}</p>`}</div>`;
    $(sel).innerHTML = api.faixaDemo(a) + api.cab('Minhas comissões', 'Matérias distribuídas às comissões de que você faz parte') +
      api.regra('Na comissão: o <b>presidente da comissão</b> designa o relator; o <b>relator</b> estuda a matéria e apresenta o parecer (favorável, favorável com emenda, contrário ou pedido de diligência); os <b>membros</b> votam o parecer. Aprovado pela maioria, a matéria segue para a próxima comissão ou para o Plenário. O parecer orienta, mas quem decide é o Plenário.') + corpo;
  };
  window.lgcmAba = k => { aba = k; A().redesenhar(); };

  function cartao(p, c, v, acao) {
    const api = A(), esc = api.esc; if (!c) return '';
    const t = (p.comTrab || {})[c.nome] || { votos: {} }; const f = fase(p, c.nome);
    const ehPresCom = c.presidente === v.id, ehRel = t.relator === v.id;
    let botoes = '';
    if (f === 'relator' && ehPresCom) botoes = `<button class="lgt-mini primario" type="button" data-edita onclick="lgcmDesignar('${p.id}')">Designar relator</button>`;
    if (f === 'parecer' && ehRel) botoes = `<button class="lgt-mini primario" type="button" data-edita onclick="lgcmParecer('${p.id}')">Elaborar parecer</button>`;
    if (f === 'diligencia' && (ehRel || ehPresCom)) botoes = `<button class="lgt-mini primario" type="button" data-edita onclick="lgcmRetomar('${p.id}')">Informações recebidas</button>`;
    if (f === 'votacao' && !ehRel && !t.votos[v.id]) botoes = `<button class="lgt-mini primario" type="button" data-edita onclick="lgcmVotar('${p.id}')">Votar o parecer</button>`;
    if ((f === 'relator' || f === 'parecer') && ehPresCom && t.relator) botoes += `<button class="lgt-mini" type="button" data-edita onclick="lgcmDesignar('${p.id}')">Trocar relator</button>`;
    const votos = Object.entries(t.votos || {});
    return `<article class="lgvr-desp lgcm-card"><header><b>${esc(p.numero)}</b><span class="lgvr-tag t-${f === 'concluida' ? 'ok' : f === 'diligencia' ? 'av' : 'an'}">${esc(FASE_TXT[f])}</span></header>
      <h4>${esc(p.ementa)}</h4><p>${esc(p.tipoNome || 'Projeto de Lei')} · ${esc(p.autor || '')} · Comissão de ${esc(c.nome)}</p>
      <ul class="lgcm-pass">
        <li class="${t.relator ? 'ok' : f === 'relator' ? 'agora' : ''}">Relator: <b>${t.relator ? esc(nomeV(t.relator)) : '—'}</b></li>
        <li class="${t.parecer ? 'ok' : f === 'parecer' || f === 'diligencia' ? 'agora' : ''}">Parecer: <b>${t.parecer ? esc(CONCL[t.parecer.conclusao][0]) : t.diligencia && !t.diligencia.respondida ? 'diligência pedida' : '—'}</b></li>
        <li class="${t.resultado ? 'ok' : f === 'votacao' ? 'agora' : ''}">Votação: <b>${t.resultado ? esc(t.resultado.placar) : votos.length ? votos.length + ' voto(s)' : '—'}</b></li>
      </ul>
      ${acao ? `<p class="lgcm-acao">${A().ic('seta')} ${esc(acao)}</p>` : ''}
      <footer><button class="lgt-mini" type="button" onclick="lgvrVer('${p.id}')">Ler matéria</button>${t.parecer ? `<button class="lgt-mini" type="button" onclick="lgcmVerParecer('${p.id}','${esc(c.nome)}')">Ver parecer</button>` : ''}${botoes}</footer></article>`;
  }

  /* ---------- quem pode agir ---------- */
  function contexto(id) {
    const api = A(); const a = api.atual(); const p = api.listaProt().find(x => x.id === id);
    if (!a || !p || p.status !== 'comissao') { api.UI().aviso('Matéria não está em comissão.', 'erro'); return null; }
    if (!api.podeEditar()) { api.UI().aviso('Seu acesso é somente consulta.', 'erro'); return null; }
    const c = comissao(p.comissao); if (!c) { api.UI().aviso('Comissão não encontrada na composição.', 'erro'); return null; }
    if (!membros(c).includes(a.v.id)) { api.UI().aviso(`Você não é membro da Comissão de ${c.nome}.`, 'erro'); return null; }
    return { api, a, p, c, t: trab(p, c.nome) };
  }
  const fim = (api, p, evento) => { api.persistirProt(evento, p); api.UI().fecharModal(); api.redesenhar(); };

  /* presidente da comissão designa o relator */
  window.lgcmDesignar = function (id) {
    const x = contexto(id); if (!x) return; const { api, a, p, c, t } = x; const esc = api.esc;
    if (c.presidente !== a.v.id) return api.UI().aviso(`Só o presidente da Comissão de ${c.nome} designa o relator.`, 'erro');
    const sug = t.vencido && !t.relator ? (Object.entries(t.vencido.votos || {}).find(([vid, vt]) => vt === 'contra') || [c.relator])[0] : (t.relator || c.relator);
    api.UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Designar relator · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <p class="lgt-p cheio"><b>Comissão de ${esc(c.nome)}</b><br>${esc(p.ementa)}</p>
      ${t.vencido ? `<p class="lgvr-regra cheio">O parecer de ${esc(nomeV(t.vencido.relator))} foi rejeitado pela comissão. Designe o relator do <b>voto vencedor</b>, normalmente quem votou contra.</p>` : ''}
      <fieldset class="cheio lgvr-opts"><legend>Relator *</legend>${membros(c).map(m => `<label><input type="radio" name="rel" value="${m}" ${m === sug ? 'checked' : ''}> ${esc(nomeV(m))} <small style="color:var(--lg28-muted)">${esc(cargoEm(c, m))}</small></label>`).join('')}</fieldset>
      <label class="cheio"><span>Prazo para o parecer</span><input name="prazo" type="date" value="${new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10)}"></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Designar</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = e => { e.preventDefault(); const rel = f.rel.value; if (!rel) return; t.relator = rel; t.designadoPor = a.v.id; t.designadoEm = new Date().toISOString(); t.prazo = f.prazo.value;
      p.timeline.push({ date: api.agoraTL(), label: `Comissão de ${c.nome}: ${nomeV(rel)} designado(a) relator(a)${t.vencido ? ' do voto vencedor' : ''} por ${a.v.nome}` });
      api.UI().aviso('Relator designado.'); fim(api, p, 'Relator designado'); };
  };

  /* relator elabora o parecer e assina */
  window.lgcmParecer = function (id) {
    const x = contexto(id); if (!x) return; const { api, a, p, c, t } = x; const esc = api.esc;
    if (t.relator !== a.v.id) return api.UI().aviso('Só o relator designado elabora o parecer.', 'erro');
    const ant = t.rascunho || {};
    api.UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Parecer · Comissão de ${esc(c.nome)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <p class="lgt-p cheio"><b>${esc(p.numero)}</b> — ${esc(p.ementa)}<br><small>O que esta comissão analisa: ${esc(c.area || '')}</small></p>
      <fieldset class="cheio lgvr-opts lgcm-concl"><legend>Conclusão *</legend>${Object.entries(CONCL).map(([k, [n]]) => `<label><input type="radio" name="concl" value="${k}" ${k === (ant.conclusao || 'favoravel') ? 'checked' : ''}> ${n}</label>`).join('')}</fieldset>
      <label class="cheio"><span>Relatório (o que a matéria propõe) *</span><textarea name="relatorio" rows="3" required>${esc(ant.relatorio || '')}</textarea></label>
      <label class="cheio lgcm-voto"><span>Voto do relator (análise e fundamentos) *</span><textarea name="voto" rows="4" required>${esc(ant.voto || '')}</textarea></label>
      <label class="cheio lgcm-emenda" hidden><span>Texto da emenda proposta *</span><textarea name="emenda" rows="3">${esc(ant.emenda || '')}</textarea></label>
      <label class="cheio lgcm-dilig" hidden><span>Informações ou documentos pedidos *</span><textarea name="dilig" rows="3" placeholder="Ex.: estimativa de impacto orçamentário-financeiro e declaração de adequação orçamentária."></textarea></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn" value="rasc">Salvar rascunho</button><button type="submit" class="lgt-btn primario" value="ok" id="lgcm-ok">Assinar e enviar à comissão</button></div></form>`);
    const f = $('#lgt-modal form');
    const vis = () => { const k = f.concl.value; $('.lgcm-emenda', f).hidden = k !== 'emenda'; $('.lgcm-dilig', f).hidden = k !== 'diligencia'; $('.lgcm-voto', f).hidden = k === 'diligencia'; f.relatorio.closest('label').hidden = k === 'diligencia'; $('#lgcm-ok').textContent = k === 'diligencia' ? 'Pedir diligência' : 'Assinar e enviar à comissão'; };
    f.querySelectorAll('[name=concl]').forEach(r => r.onchange = vis); vis();
    f.onsubmit = e => { e.preventDefault(); const k = f.concl.value, err = f.querySelector('.lgt-erro');
      const dados = { conclusao: k, relatorio: f.relatorio.value.trim(), voto: f.voto.value.trim(), emenda: f.emenda.value.trim() };
      if (e.submitter && e.submitter.value === 'rasc') { t.rascunho = dados; api.persistirProt('Rascunho de parecer', p); api.UI().aviso('Rascunho do parecer salvo.'); api.UI().fecharModal(); return; }
      if (k === 'diligencia') { const d = f.dilig.value.trim(); if (!d) { err.textContent = 'Descreva as informações pedidas.'; return; }
        t.diligencia = { texto: d, data: new Date().toISOString(), por: a.v.id }; p.timeline.push({ date: api.agoraTL(), label: `Comissão de ${c.nome}: diligência pedida pelo relator — ${d}` });
        api.UI().aviso('Diligência registrada. A tramitação fica parada até as informações chegarem.'); return fim(api, p, 'Diligência'); }
      if (!dados.relatorio || !dados.voto) { err.textContent = 'Preencha o relatório e o voto.'; return; }
      if (k === 'emenda' && !dados.emenda) { err.textContent = 'Escreva o texto da emenda.'; return; }
      api.UI().fecharModal();
      const slug = c.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]+/g, '-').toLowerCase();
      api.assinarDoc({ titulo: `Parecer da Comissão de ${c.nome} — ${p.numero}`, arquivo: api.arq(`Parecer ${c.nome} ${p.numero}`), docId: `${p.id}-parecer-${slug}`,
        doc: { tipo: `Parecer da Comissão de ${c.nome}`, numero: p.numero, ementa: p.ementa, texto: `RELATÓRIO\n${dados.relatorio}\n\nVOTO DO RELATOR\n${dados.voto}${k === 'emenda' ? `\n\nEMENDA PROPOSTA\n${dados.emenda}` : ''}\n\nCONCLUSÃO: ${CONCL[k][0].toUpperCase()}` },
        signatarios: [{ nome: (A().verPorId(a.v.id) || a.v).completo || a.v.nome, cargo: `Relator(a) — Comissão de ${c.nome}` }] }, a.v, ass => {
        t.parecer = { ...dados, relator: a.v.id, data: new Date().toISOString(), assinatura: ass }; delete t.rascunho; t.votos = { [a.v.id]: 'acompanha' };
        p.timeline.push({ date: api.agoraTL(), label: `Comissão de ${c.nome}: parecer do relator ${a.v.nome} — ${CONCL[k][0].toLowerCase()} (assinado)` });
        p.docs = [...new Set([...(p.docs || []), `Parecer Comissão de ${c.nome}.pdf`])];
        api.UI().aviso('Parecer assinado e enviado aos membros da comissão.'); conferir(api, p, c); fim(api, p, 'Parecer de comissão');
      });
    };
  };

  window.lgcmRetomar = function (id) {
    const x = contexto(id); if (!x) return; const { api, a, p, c, t } = x;
    if (t.relator !== a.v.id && c.presidente !== a.v.id) return api.UI().aviso('Só o relator ou o presidente da comissão.', 'erro');
    t.diligencia.respondida = new Date().toISOString(); p.timeline.push({ date: api.agoraTL(), label: `Comissão de ${c.nome}: informações da diligência recebidas; prazo do relator retomado` });
    api.UI().aviso('Diligência concluída. O relator já pode emitir o parecer.'); fim(api, p, 'Diligência respondida');
  };

  /* membros votam o parecer do relator */
  window.lgcmVotar = function (id) {
    const x = contexto(id); if (!x) return; const { api, a, p, c, t } = x; const esc = api.esc;
    if (!t.parecer) return api.UI().aviso('O relator ainda não apresentou o parecer.', 'erro');
    if (t.relator === a.v.id) return api.UI().aviso('O relator já votou ao assinar o parecer.', 'erro');
    if (t.votos[a.v.id]) return api.UI().aviso('Você já votou este parecer.', 'erro');
    api.UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Votar parecer · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgvr-det">${htmlParecer(p, c.nome)}</div><div class="lgt-campos">
      <fieldset class="cheio lgvr-opts"><legend>Seu voto *</legend><label><input type="radio" name="voto" value="acompanha" checked> Acompanho o relator</label><label><input type="radio" name="voto" value="contra"> Voto contrário ao parecer</label></fieldset>
      <label class="cheio"><span>Observação (opcional)</span><textarea name="obs" rows="2"></textarea></label></div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Registrar voto</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = e => { e.preventDefault(); t.votos[a.v.id] = f.voto.value; if (f.obs.value.trim()) { t.obs = t.obs || {}; t.obs[a.v.id] = f.obs.value.trim(); }
      p.timeline.push({ date: api.agoraTL(), label: `Comissão de ${c.nome}: ${a.v.nome} ${f.voto.value === 'acompanha' ? 'acompanhou o relator' : 'votou contra o parecer'}` });
      api.UI().aviso('Voto registrado.'); conferir(api, p, c); fim(api, p, 'Voto na comissão'); };
  };

  /* maioria formada? aprova o parecer e avança, ou devolve para voto vencedor */
  function conferir(api, p, c) {
    const t = trab(p, c.nome); const v = Object.values(t.votos || {}); const sim = v.filter(x => x === 'acompanha').length, nao = v.filter(x => x === 'contra').length, m = maioria(c);
    if (sim >= m) {
      t.resultado = { aprovado: true, placar: `${sim} a ${nao}`, data: new Date().toISOString() };
      p.pareceresComissoes = [...(p.pareceresComissoes || []).filter(x => x.comissao !== c.nome), { comissao: c.nome, texto: t.parecer.voto, conclusao: t.parecer.conclusao, relator: nomeV(t.parecer.relator), data: t.resultado.data }];
      p.timeline.push({ date: api.agoraTL(), label: `Parecer da Comissão de ${c.nome} aprovado (${sim} a ${nao}): ${CONCL[t.parecer.conclusao][0].toLowerCase()}` });
      const rota = p.comissoesRota || [c.nome]; const prox = rota[rota.indexOf(c.nome) + 1];
      if (prox) { p.comissao = prox; p.etapaComissao = rota.indexOf(prox); trab(p, prox); p.timeline.push({ date: api.agoraTL(), label: `Encaminhado à Comissão de ${prox}` }); }
      else { p.status = 'votacao'; p.resultado = ''; p.comissao = ''; p.timeline.push({ date: api.agoraTL(), label: 'Pareceres das comissões concluídos — pronto para discussão e votação em Plenário' }); }
    } else if (nao >= m) {
      t.vencido = { relator: t.relator, parecer: t.parecer, votos: { ...t.votos }, data: new Date().toISOString() }; t.parecer = null; t.relator = ''; t.votos = {};
      p.timeline.push({ date: api.agoraTL(), label: `Comissão de ${c.nome}: parecer do relator rejeitado (${nao} contrários); aguardando relator do voto vencedor` });
    }
  }

  /* ---------- leitura do parecer ---------- */
  function htmlParecer(p, nome) {
    const esc = A().esc; const t = (p.comTrab || {})[nome]; if (!t || !t.parecer) return '';
    const pr = t.parecer; const c = comissao(nome) || { nome };
    return `<div class="lgcm-parecer"><p class="lgvr-tipo-l">Comissão de ${esc(nome)} · relator(a) ${esc(nomeV(pr.relator))} · ${new Date(pr.data).toLocaleDateString('pt-BR')}</p>
      <p><span class="lgvr-tag t-${CONCL[pr.conclusao][1]}">${esc(CONCL[pr.conclusao][0])}</span></p>
      <h4>Relatório</h4><div class="lgvr-texto">${esc(pr.relatorio).replace(/\n/g, '<br>')}</div><h4>Voto do relator</h4><div class="lgvr-texto">${esc(pr.voto).replace(/\n/g, '<br>')}</div>
      ${pr.emenda ? `<h4>Emenda proposta</h4><div class="lgvr-texto">${esc(pr.emenda).replace(/\n/g, '<br>')}</div>` : ''}
      ${Object.keys(t.votos || {}).length ? `<h4>Votos na comissão</h4><p class="lgt-p">${Object.entries(t.votos).map(([id, vt]) => `${esc(nomeV(id))}: ${vt === 'acompanha' ? 'acompanha o relator' : 'contrário'}`).join(' · ')}${t.resultado ? ` — <b>aprovado ${esc(t.resultado.placar)}</b>` : ` — faltam ${Math.max(0, maioria(c) - Object.values(t.votos).filter(x => x === 'acompanha').length)} voto(s) para a maioria`}</p>` : ''}</div>`;
  }
  window.lgcmVerParecer = function (id, nome) {
    const api = A(); const p = api.listaProt().find(x => x.id === id); if (!p) return;
    const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]+/g, '-').toLowerCase(); const doc = `${p.id}-parecer-${slug}`;
    api.UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Parecer · ${api.esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgvr-det">${htmlParecer(p, nome)}</div>
      <div class="lgt-modal-rod">${window.lgsTemPDF && lgsTemPDF(doc) ? `<button type="button" class="lgt-btn" onclick="lgsBaixarPDF('${doc}','Parecer-${slug}-${api.esc((p.numero || '').replace(/[^A-Za-z0-9]+/g, '-'))}.pdf')">PDF assinado</button>` : ''}<button type="button" class="lgt-btn primario" onclick="lgtFechar()">Fechar</button></div></div>`);
  };

  /* resumo no detalhe da matéria (Portal do Vereador) */
  window.lgcmResumo = function (p) {
    const esc = A().esc; const rota = p.comissoesRota || []; if (!rota.length) return '';
    return `<h4>Comissões</h4><ol class="lgcm-rota">${rota.map(n => { const f = fase(p, n), t = (p.comTrab || {})[n] || {};
      return `<li class="f-${f}"><b>Comissão de ${esc(n)}</b><span>${esc(FASE_TXT[f])}${t.relator ? ' · relator(a) ' + esc(nomeV(t.relator)) : ''}${t.parecer ? ' · ' + esc(CONCL[t.parecer.conclusao][0].toLowerCase()) : ''}${t.resultado ? ' (' + esc(t.resultado.placar) + ')' : ''}</span>${t.parecer ? `<button type="button" class="lgt-mini" onclick="lgcmVerParecer('${p.id}','${esc(n)}')">Parecer</button>` : ''}</li>`; }).join('')}</ol>`;
  };

  window.lgcmCardInicio = function (v) {
    const esc = A().esc; const pend = lgcmPendencias(v); const minhas = minhasComissoes(v); if (!minhas.length) return '';
    return `<div class="lgt-card lgcm-ini"><div class="lgvr-card-cab"><h3>${A().ic('comissoes')} Minhas comissões</h3><button class="lgt-mini" type="button" onclick="lgvrAbrir('comissoes')">Abrir</button></div>
      <p class="lgt-p">${minhas.map(c => `${esc(cargoEm(c, v.id))} da Comissão de <b>${esc(c.nome)}</b>`).join(' · ')}</p>
      ${pend.length ? pend.slice(0, 4).map(x => `<button type="button" class="lgvr-linha" onclick="lgvrAbrir('comissoes')"><b>${esc(x.p.numero)}</b><span>${esc(x.acao)} — Comissão de ${esc(x.c.nome)}</span><small>${esc(x.p.ementa)}</small></button>`).join('') : '<p class="lgt-p" style="margin:6px 0 0">Nada aguardando você nas comissões.</p>'}</div>`;
  };

  /* ---------- USUÁRIOS: Procuradoria define a composição das comissões ---------- */
  function desenharComposicao() {
    const api = A(); if (!api) return; const box = $('#lgvr-comp'); if (!box) return;
    let el = $('#lgcm-comp'); if (!el) { el = document.createElement('div'); el.id = 'lgcm-comp'; box.appendChild(el); }
    const c = api.comp(), pode = api.ehGestor(), esc = api.esc;
    el.innerHTML = `<div class="lgt-card lgvr-comp lgcm-comp"><div class="lgvr-card-cab"><div><h3>${api.ic('comissoes')} Comissões permanentes</h3><p class="lgt-p">Defina quem é Presidente, Vice-Presidente e Relator de cada comissão. Cada vereador só vê e só age nas comissões em que estiver aqui. Mandato de 01/01/2025 a 31/12/2026.</p></div></div>
      <form id="lgcm-f"><div class="lgcm-grade">${c.comissoes.map((x, i) => `<fieldset class="lgcm-f"><legend>Comissão de ${esc(x.nome)}</legend><small>${esc(x.area || '')}</small>
        ${CARGOS.map(([k, n]) => `<label><span>${n}</span><select name="${k}-${i}" ${pode ? '' : 'disabled'}><option value="">— vago —</option>${c.vereadores.map(v => `<option value="${v.id}" ${x[k] === v.id ? 'selected' : ''}>${esc(v.nome)}${v.id === c.presidente ? ' (Presidente da Câmara)' : ''}</option>`).join('')}</select></label>`).join('')}
        <label><span>Eleita em</span><input name="el-${i}" value="${esc(x.eleicao || '')}" ${pode ? '' : 'disabled'} placeholder="dd/mm/aaaa"></label></fieldset>`).join('')}</div>
      ${pode ? '<div class="lgt-acoes lgvr-comp-acoes"><button class="lgt-btn primario" type="submit">Salvar comissões</button></div>' : '<p class="lgvr-regra">Somente a Procuradoria ou o administrador alteram as comissões.</p>'}</form></div>`;
    const f = $('#lgcm-f'); if (!f) return;
    f.onsubmit = e => { e.preventDefault(); if (!api.ehGestor()) return api.UI().aviso('Somente a Procuradoria ou o administrador.', 'erro');
      const cc = api.comp(); const mud = [];
      for (let i = 0; i < cc.comissoes.length; i++) { const x = cc.comissoes[i]; const novos = CARGOS.map(([k]) => f[`${k}-${i}`].value);
        const preench = novos.filter(Boolean); if (new Set(preench).size !== preench.length) return api.UI().aviso(`Comissão de ${x.nome}: o mesmo vereador em dois cargos.`, 'erro');
        CARGOS.forEach(([k, n], j) => { if ((x[k] || '') !== novos[j]) mud.push(`${x.nome} — ${n}: ${nomeV(x[k]) } → ${nomeV(novos[j])}`); x[k] = novos[j]; }); x.eleicao = f[`el-${i}`].value.trim(); }
      const por = (api.usuario() || {}).nome || ''; mud.forEach(t => cc.historico.push({ data: new Date().toISOString(), texto: 'Comissão de ' + t, por }));
      api.gravar(api.COMP_KEY, cc); api.UI().log('Composição da Câmara', mud.length ? 'Comissões alteradas' : 'Comissões conferidas');
      api.UI().aviso(mud.length ? `Comissões salvas (${mud.length} alteração(ões)). Já valem para os usuários dos vereadores.` : 'Nada mudou.'); desenharComposicao(); };
  }
  /* aparece logo abaixo do quadro de vereadores e Presidente */
  new MutationObserver(() => { const box = $('#lgvr-comp'); if (box && box.firstElementChild && !$('#lgcm-comp', box)) desenharComposicao(); }).observe(document.documentElement, { childList: true, subtree: true });

  /* ---------- Painel Administrativo: mesma regra (comissões reais; parecer só pelo relator) ---------- */
  function integrar() {
    window.lg24Etapas = p => (p.comissoesRota && p.comissoesRota.length ? p.comissoesRota : ['Justiça e Redação', 'Finanças e Orçamento']);
    window.lg24ParecerJuridico = function (id) {
      const p = protocolos.find(x => x.id === id); if (!p || p.status !== 'analise') return;
      const texto = document.getElementById('lg24-juridico')?.value.trim(); if (!texto) { alert('Registre o parecer da Procuradoria antes de encaminhar.'); return; }
      p.parecerJuridico = texto; p.comissoesRota = lg24Etapas(p);
      p.timeline.push({ date: A().agoraTL(), label: 'Parecer jurídico da Procuradoria Legislativa: ' + texto });
      lgcmIniciar(p); sincronizarProtocolo(p, 'Parecer jurídico registrado'); try { notificar(p, 'Encaminhado à Comissão de ' + p.comissao); } catch (e) { }
      renderAll(); abrirDetalheCam(id);
    };
    window.anexarParecer = () => alert('O parecer da comissão é emitido pelo relator no Portal do Vereador e votado pelos membros da comissão.');
    const orig = window.renderAcaoLateral;
    if (typeof orig === 'function' && !orig.__lgcm) {
      const w = function (p) {
        if (!p || (p.status !== 'comissao' && p.status !== 'analise')) return orig.call(this, p);
        const esc = A().esc; const rota = lg24Etapas(p);
        const docs = `<div class="side-card"><h3>Documentos</h3><div class="doc-list">${(p.docs || []).map(d => `<div class="doc-row"><span class="doc-name">${esc(d)}</span></div>`).join('')}</div></div>`;
        const rotaHtml = `<div class="side-card"><h3>Comissões (despacho do Presidente)</h3><ol class="lgcm-rota">${rota.map(n => { const f = fase(p, n), t = (p.comTrab || {})[n] || {}; return `<li class="f-${f}"><b>${esc(n)}</b><span>${esc(FASE_TXT[f])}${t.relator ? ' · relator(a) ' + esc(nomeV(t.relator)) : ''}${t.parecer ? ' · ' + esc(CONCL[t.parecer.conclusao][0].toLowerCase()) : ''}</span></li>`; }).join('')}</ol>
          <p class="note">Cada comissão: o presidente designa o relator, o relator emite e assina o parecer no Portal do Vereador e os membros votam. Esta tela só acompanha.</p></div>`;
        if (p.status === 'analise') return `<div class="side-card"><h3>Procuradoria Legislativa</h3><p class="note">Registre o parecer jurídico. Em seguida a matéria vai à Comissão de ${esc(rota[0])}.</p><textarea id="lg24-juridico" placeholder="Resumo do parecer jurídico" style="width:100%;min-height:95px;margin:12px 0"></textarea><button class="btn-primary" style="width:100%" onclick="lg24ParecerJuridico('${p.id}')">Registrar parecer e enviar à comissão</button></div>` + rotaHtml + docs;
        return rotaHtml + docs;
      }; w.__lgcm = true; window.renderAcaoLateral = w;
    }
    window.renderComissoes = function () {
      const g = document.getElementById('comissoes-grid'); if (!g) return; const esc = A().esc;
      g.innerHTML = comissoes().map(c => { const pend = protocolos.filter(p => p.status === 'comissao' && p.comissao === c.nome);
        return `<div class="comissao-card"><h3>Comissão de ${esc(c.nome)}</h3><div class="count">${CARGOS.map(([k, n]) => `${n}: ${esc(nomeV(c[k]))}`).join(' · ')}</div><div class="count">${pend.length} matéria(s) na comissão</div>
          <div class="mini-list">${pend.length ? pend.map(p => `<div style="cursor:pointer" onclick="abrirDetalheCam('${p.id}')"><span class="n">${esc(p.numero)}</span> ${esc(p.ementa)} <em style="opacity:.75">— ${esc(FASE_TXT[fase(p, c.nome)])}</em></div>`).join('') : '<div style="color:var(--ink-soft);">Nenhuma matéria pendente</div>'}</div></div>`; }).join('');
    };
  }

  const css = document.createElement('style'); css.textContent = `
  .lgcm-minhas{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:14px}
  .lgcm-com{padding:14px 16px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel)}
  .lgcm-com small{display:block;color:var(--lg28-muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}.lgcm-com b{display:block;font-size:16px;margin:2px 0 6px}
  .lgcm-cargo{display:inline-block;padding:2px 9px;border-radius:20px;background:rgba(226,170,28,.16);color:#b8860b;font-size:11.5px;font-weight:700}
  .lgcm-com p{margin:8px 0 4px;font-size:12.5px;color:var(--lg28-ink);line-height:1.5}.lgcm-com p i{color:var(--lg28-muted);font-style:normal}
  .lgcm-com em{font-size:12px;color:var(--lg28-muted);font-style:normal}
  .lgcm-lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-top:12px}
  .lgcm-vazio{grid-column:1/-1}
  .lgcm-pass{list-style:none;margin:2px 0 0;padding:0;display:grid;gap:4px;font-size:12.5px;color:var(--lg28-muted)}
  .lgcm-pass li{padding-left:18px;position:relative}.lgcm-pass li::before{content:"";position:absolute;left:2px;top:5px;width:8px;height:8px;border-radius:50%;border:2px solid var(--lg28-stroke)}
  .lgcm-pass li.ok::before{background:#2fbf71;border-color:#2fbf71}.lgcm-pass li.agora::before{background:#e2aa1c;border-color:#e2aa1c}.lgcm-pass b{color:var(--lg28-ink);font-weight:600}
  .lgcm-acao{margin:4px 0 0!important;color:#b8860b!important;font-weight:700;font-size:12.5px!important;display:flex;align-items:center;gap:6px}.lgcm-acao .lgv31-ic{width:14px;height:14px}
  .lgcm-rota{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:6px}
  .lgcm-rota li{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:8px 10px;border-radius:9px;border:1px solid var(--lg28-stroke,#ddd);font-size:13px}
  .lgcm-rota li span{flex:1;min-width:160px;color:var(--lg28-muted,#666);font-size:12.5px}.lgcm-rota li .lgt-mini{margin:0}
  .lgcm-rota li.f-concluida{border-color:rgba(47,191,113,.45)}.lgcm-rota li.f-relator,.lgcm-rota li.f-parecer,.lgcm-rota li.f-votacao,.lgcm-rota li.f-diligencia{border-color:rgba(226,170,28,.55)}
  .lgcm-parecer h4{margin:12px 0 6px!important}
  .lgcm-concl{flex-direction:row!important;flex-wrap:wrap}
  .lgcm-ini{margin-bottom:14px}
  .lgcm-comp{margin-top:14px}
  .lgcm-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
  .lgcm-f{border:1px solid var(--lg28-stroke);border-radius:12px;padding:12px 14px;margin:0;display:grid;gap:8px}
  .lgcm-f legend{font-weight:700;font-size:14px;padding:0 6px;color:var(--lg28-ink)}.lgcm-f > small{color:var(--lg28-muted);font-size:12px;line-height:1.4}
  .lgcm-f label{display:grid;gap:4px;font-size:12.5px;font-weight:600;color:var(--lg28-muted)}
  .lgcm-f select,.lgcm-f input{height:36px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:0 8px;font:inherit;font-size:14px}
  @media(max-width:600px){.lgcm-lista{grid-template-columns:1fr}.lgcm-f select,.lgcm-f input{font-size:16px}}`;
  document.head.appendChild(css);

  function iniciar() { if (!A()) return setTimeout(iniciar, 120); A().comp(); integrar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 140)); else setTimeout(iniciar, 140);
})();
