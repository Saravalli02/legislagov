/* =====================================================================
   Site — serviços ao cidadão
   · Ouvidoria e e-SIC (ouvidoria.html): manifestação, pedido de informação e consulta por protocolo.
   · Leis municipais (leis.html): busca dentro do texto e texto compilado.
   · Acompanhar uma propositura: novidades neste aparelho + cadastro de e-mail (envio na versão com servidor).
   · Sessões (sessoes.html): pautas publicadas, resultados das votações e atas da Sessão plenária.
   Na demonstração tudo fica neste navegador; com o servidor, vem da API.
   ===================================================================== */
(function () {
  const lsj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lss = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const P = k => new URLSearchParams(location.search).get(k);
  const I = (n, c) => (typeof ic === 'function' ? ic(n, c) : '');
  const dBR = iso => iso ? new Date(String(iso).length === 10 ? iso + 'T12:00' : iso).toLocaleDateString('pt-BR') : '—';
  const C = () => (typeof CONFIG !== 'undefined' ? CONFIG : {});
  const trilha = (...l) => `<nav class="trilha" aria-label="Você está em"><a href="index.html">Início</a>${l.map(x => `<span aria-hidden="true">›</span>${x}`).join('')}</nav>`;

  /* ================= acompanhar proposituras ================= */
  const SEG = 'lgc_seguindo_v1', INS = 'lgc_inscricoes_v1';
  window.lgcSeguindo = () => lsj(SEG, {});
  window.lgcNovidades = p => { const s = lsj(SEG, {})[p.id]; return s ? Math.max(0, (p.timeline || []).length - s.visto) : 0; };
  window.lgcCaixaSeguir = function (p) {
    const s = lsj(SEG, {})[p.id]; const n = (p.timeline || []).length;
    if (s && s.visto !== n) { const m = lsj(SEG, {}); m[p.id].visto = n; lss(SEG, m); }
    return `<div class="pp-seguir" id="pp-seguir">${s ? `<p><b>${I('sino')} Você acompanha este projeto neste aparelho.</b> Quando houver movimentação, ele aparece com o selo “novidade” na lista de proposituras.</p>
      <button type="button" class="btn btn-claro" onclick="lgcDeixar('${E(p.id)}')">Deixar de acompanhar</button>` :
      `<p><b>Acompanhe este projeto</b> e saiba de cada movimentação.</p><button type="button" class="btn" onclick="lgcSeguir('${E(p.id)}',${n})">${I('sino')} Acompanhar este projeto</button>`}
      <form class="pp-seguir-email" onsubmit="return lgcEmail(event,'${E(p.id)}')"><label for="pp-email">Receber por e-mail</label><div><input id="pp-email" type="email" required placeholder="seu@email.com" autocomplete="email"><button class="btn btn-claro" type="submit">Cadastrar</button></div><small>Usamos o e-mail só para avisar sobre este projeto (LGPD). O envio automático começa com a versão definitiva do sistema.</small></form>
      <p class="pp-seguir-ok" role="status" hidden></p></div>`;
  };
  window.lgcSeguir = (id, n) => { const m = lsj(SEG, {}); m[id] = { visto: n, desde: new Date().toISOString() }; lss(SEG, m); if (typeof iniciarProposituras === 'function') iniciarProposituras(); };
  window.lgcDeixar = id => { const m = lsj(SEG, {}); delete m[id]; lss(SEG, m); if (typeof iniciarProposituras === 'function') iniciarProposituras(); };
  window.lgcEmail = function (e, id) {
    e.preventDefault(); const f = e.target; const em = f.querySelector('input').value.trim(); const l = lsj(INS, []);
    if (!l.some(x => x.email === em && x.pid === id)) l.push({ email: em, pid: id, data: new Date().toISOString() }); lss(INS, l);
    const ok = document.querySelector('.pp-seguir-ok'); ok.hidden = false; ok.textContent = 'E-mail cadastrado. Você receberá os avisos deste projeto quando o envio automático estiver ativo.'; f.reset(); return false;
  };

  /* ================= Ouvidoria e e-SIC ================= */
  const OUV = 'lgo_v1';
  const ouv = () => { const d = lsj(OUV, {}) || {}; d.itens = Array.isArray(d.itens) ? d.itens : []; return d; };
  function novoProtocolo(canal) { const d = ouv(); const ano = new Date().getFullYear(); const pre = canal === 'esic' ? 'SIC' : 'OUV'; const n = d.itens.filter(i => i.protocolo.startsWith(`${pre}-${ano}-`)).length + 1; return `${pre}-${ano}-${String(n).padStart(4, '0')}`; }
  function prazoTxt(i) { const dias = (i.canal === 'esic' ? 20 : 30) + (i.prorrogado ? (i.canal === 'esic' ? 10 : 30) : 0); const v = new Date(i.data); v.setDate(v.getDate() + dias); return dBR(v.toISOString()); }
  let abaOuv = 'ouvidoria';
  function montarOuvidoria() {
    const app = document.getElementById('ouv-app'); if (!app) return;
    if (location.hash === '#esic') abaOuv = 'esic'; if (location.hash === '#consulta' || P('protocolo')) abaOuv = 'consulta';
    const c = C();
    app.innerHTML = `<div class="cab-pag"><div class="wrap">${trilha('<span>Atendimento</span>', '<span>Ouvidoria e e-SIC</span>')}<h1>Ouvidoria e acesso à informação</h1><p>Fale com a Câmara, peça informações públicas e acompanhe a resposta pelo número do protocolo.</p></div></div>
      <div class="wrap conteudo"><div class="duas-col">
        <aside class="lateral ouv-info"><h3>Atendimento presencial</h3><p>${E(c.endereco || '')}<br>${E(c.cidade || '')}</p><p>${I('tel')} <a href="tel:${E(c.telefoneLink || '')}">${E(c.telefone || '')}</a></p><p>${I('relogio')} ${E(c.horario || '')}</p>
          <h3>Prazos de resposta</h3><ul class="lista"><li><b>Pedido de informação</b> (Lei 12.527/2011): até 20 dias, prorrogáveis por mais 10 com justificativa.</li><li><b>Ouvidoria</b> (Lei 13.460/2017): até 30 dias, prorrogáveis por mais 30.</li><li><b>Recurso</b>: se o pedido for negado, você pode recorrer em até 10 dias à autoridade superior, que decide em até 5 dias (LAI, art. 15).</li></ul>
          <p class="nota">Unidade responsável: Secretaria Legislativa. Não é preciso dizer o motivo do pedido de informação.</p></aside>
        <div>
          <div class="ouv-abas" role="tablist">${[['ouvidoria', 'Ouvidoria'], ['esic', 'Pedido de informação (e-SIC)'], ['consulta', 'Consultar protocolo']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${abaOuv === k}" onclick="lgcAbaOuv('${k}')">${n}</button>`).join('')}</div>
          <div id="ouv-corpo"></div>
          <div class="aviso" style="margin-top:18px">Versão de demonstração: o pedido fica registrado neste navegador e aparece no painel da Câmara aberto neste mesmo computador. Na versão definitiva, chega à Câmara pela internet e a resposta vai por e-mail.</div>
        </div></div></div>`;
    corpoOuv();
  }
  window.lgcAbaOuv = k => { abaOuv = k; history.replaceState(null, '', 'ouvidoria.html' + (k === 'ouvidoria' ? '' : '#' + k)); document.querySelectorAll('.ouv-abas button').forEach(b => b.setAttribute('aria-selected', String(b.getAttribute('onclick').includes(`'${k}'`)))); corpoOuv(); };
  function corpoOuv() {
    const el = document.getElementById('ouv-corpo'); if (!el) return;
    const ident = (obrig, anon) => `<label>Nome${obrig ? ' *' : ''}<input name="nome" autocomplete="name" ${obrig ? 'required' : ''}></label><label>E-mail${obrig ? ' *' : ''}<input name="email" type="email" autocomplete="email" ${obrig ? 'required' : ''}></label><label>Telefone<input name="telefone" type="tel" autocomplete="tel"></label>${anon ? '<label class="cheio ouv-anon"><input type="checkbox" name="anonimo"> Quero fazer uma denúncia sem me identificar (você não poderá acompanhar por e-mail, só pelo protocolo)</label>' : ''}`;
    if (abaOuv === 'ouvidoria') el.innerHTML = `<form class="form" id="form-ouv"><label>Tipo de manifestação *<select name="categoria" required><option>Solicitação</option><option>Sugestão</option><option>Elogio</option><option>Reclamação</option><option>Denúncia</option></select></label>${ident(true, true)}<label class="cheio">Assunto *<input name="assunto" required maxlength="140"></label><label class="cheio">Descreva sua manifestação *<textarea name="texto" required></textarea></label><label class="cheio ouv-lgpd"><input type="checkbox" required> Autorizo o uso dos meus dados apenas para tratar desta manifestação (LGPD). A identidade de quem denuncia é preservada.</label><div class="cheio"><button class="btn" type="submit">Enviar manifestação</button></div></form>`;
    if (abaOuv === 'esic') el.innerHTML = `<form class="form" id="form-ouv"><input type="hidden" name="categoria" value="Pedido de informação">${ident(true, false)}<label class="cheio">Qual informação você quer? *<input name="assunto" required maxlength="140" placeholder="Ex.: Contratos de manutenção do prédio da Câmara em 2026"></label><label class="cheio">Detalhes do pedido *<textarea name="texto" required placeholder="Seja específico: período, documento, assunto."></textarea></label><label>Como prefere receber<select name="forma"><option>Por e-mail</option><option>Retirar na Câmara</option></select></label><label class="cheio ouv-lgpd"><input type="checkbox" required> Autorizo o uso dos meus dados apenas para responder a este pedido (LGPD).</label><div class="cheio"><button class="btn" type="submit">Enviar pedido de informação</button></div></form>`;
    if (abaOuv === 'consulta') { el.innerHTML = `<form class="form" id="form-cons"><label class="cheio">Número do protocolo<input name="p" required placeholder="Ex.: SIC-2026-0001" value="${E(P('protocolo') || '')}" style="text-transform:uppercase"></label><div class="cheio"><button class="btn" type="submit">Consultar</button></div></form><div id="ouv-res" role="status"></div>`;
      const f = document.getElementById('form-cons'); f.onsubmit = e => { e.preventDefault(); consulta(f.p.value.trim().toUpperCase()); }; if (P('protocolo')) consulta(P('protocolo').toUpperCase()); return; }
    const f = document.getElementById('form-ouv');
    if (f.anonimo) f.anonimo.onchange = () => { ['nome', 'email'].forEach(k => { f[k].required = !f.anonimo.checked; f[k].disabled = f.anonimo.checked; }); };
    f.onsubmit = e => { e.preventDefault(); const canal = abaOuv; const d = ouv(); const anon = !!(f.anonimo && f.anonimo.checked);
      if (anon && f.categoria.value !== 'Denúncia') { alert('O anonimato é aceito apenas para denúncias.'); return; }
      const it = { protocolo: novoProtocolo(canal), canal, categoria: f.categoria.value, nome: anon ? '' : f.nome.value.trim(), email: anon ? '' : f.email.value.trim(), telefone: anon ? '' : (f.telefone.value || '').trim(), anonimo: anon, assunto: f.assunto.value.trim(), texto: f.texto.value.trim(), forma: f.forma ? f.forma.value : '', data: new Date().toISOString(), status: 'aberto' };
      d.itens.push(it); lss(OUV, d);
      el.innerHTML = `<div class="sucesso ouv-ok"><b>Recebemos ${canal === 'esic' ? 'seu pedido de informação' : 'sua manifestação'}.</b><p>Anote o protocolo: <strong class="ouv-prot">${E(it.protocolo)}</strong></p><p>Prazo de resposta: até ${prazoTxt(it)}. Consulte a resposta em “Consultar protocolo”.</p><p><a class="btn btn-claro" href="ouvidoria.html?protocolo=${encodeURIComponent(it.protocolo)}#consulta">Consultar agora</a></p></div>`; };
  }
  function consulta(prot) {
    const el = document.getElementById('ouv-res'); const i = ouv().itens.find(x => x.protocolo === prot);
    if (!i) { el.innerHTML = `<div class="aviso">Protocolo “${E(prot)}” não encontrado. Confira o número.</div>`; return; }
    const st = i.status === 'respondido' ? 'Respondido' : i.status === 'prorrogado' ? 'Prazo prorrogado' : 'Em análise';
    el.innerHTML = `<div class="ouv-cons"><div class="ouv-cons-cab"><b>${E(i.protocolo)}</b><span class="ouv-st ${i.status}">${st}</span></div><dl><dt>Tipo</dt><dd>${E(i.categoria)}</dd><dt>Registrado em</dt><dd>${dBR(i.data)}</dd><dt>Assunto</dt><dd>${E(i.assunto)}</dd>${i.status !== 'respondido' ? `<dt>Prazo</dt><dd>até ${prazoTxt(i)}${i.prorrogado ? ` — prorrogado: ${E(i.prorrogado.motivo)}` : ''}</dd>` : ''}</dl>
      ${i.resposta ? `<h3>Resposta da Câmara</h3><p>${E(i.resposta.texto).replace(/\n/g, '<br>')}</p><p class="nota">${E(i.resposta.tipo || '')} · ${dBR(i.resposta.data)}</p>${i.canal === 'esic' && /Negado|inexistente/i.test(i.resposta.tipo || '') && !i.recurso ? `<button type="button" class="btn btn-claro" onclick="lgcRecurso('${E(i.protocolo)}')">Apresentar recurso</button>` : ''}${i.recurso ? `<p class="nota">Recurso apresentado em ${dBR(i.recurso.data)}.</p>` : ''}` : ''}</div>`;
  }
  window.lgcRecurso = function (prot) {
    const motivo = prompt('Explique por que você discorda da resposta (recurso à autoridade superior, LAI art. 15):'); if (!motivo) return;
    const d = ouv(); const i = d.itens.find(x => x.protocolo === prot); i.recurso = { data: new Date().toISOString(), motivo }; i.status = 'aberto'; i.categoria = 'Recurso — ' + (i.categoria || ''); i.resposta = null; lss(OUV, d); consulta(prot);
  };

  /* ================= Leis municipais ================= */
  function montarLeis() {
    const app = document.getElementById('leis-app'); if (!app || !window.lgLeisTodas) return;
    const id = P('id'); const todas = lgLeisTodas();
    if (id) { const lei = todas.find(x => x.id === id); if (lei) return detalheLei(app, lei, todas); }
    const est = { q: P('q') || '', tipo: '', ano: '' };
    const anos = [...new Set(todas.map(x => x.ano))].sort().reverse();
    app.innerHTML = `<div class="cab-pag"><div class="wrap">${trilha('<span>Legislativo</span>', '<span>Leis municipais</span>')}<h1>Leis municipais</h1><p>Pesquise pelo número, pelo assunto ou por qualquer palavra do texto. As leis alteradas aparecem com o texto atualizado (compilado).</p></div></div>
      <div class="wrap conteudo"><div class="filtros pp-filtros"><label class="campo-busca">${I('busca')}<span class="sr-only">Pesquisar</span><input id="lei-q" placeholder="Ex.: horta, denominação, 1850" value="${E(est.q)}"></label>
        <label class="sr-only" for="lei-tipo">Tipo</label><select class="sel" id="lei-tipo"><option value="">Todos os tipos</option>${['Lei', 'Lei Complementar', 'Resolução', 'Decreto Legislativo'].map(t => `<option>${t}</option>`).join('')}</select>
        <label class="sr-only" for="lei-ano">Ano</label><select class="sel" id="lei-ano"><option value="">Todos os anos</option>${anos.map(a => `<option>${a}</option>`).join('')}</select></div>
        <p class="contador" id="lei-cont" role="status"></p><div id="lei-lista" class="lei-lista"></div>
        ${todas.some(x => x.exemplo) ? '<p class="nota">As normas marcadas como <b>exemplo</b> servem só para demonstrar o texto compilado.</p>' : ''}
        <div class="aviso" style="margin-top:22px">Leis anteriores ao novo sistema: <a href="${E(C().legislacao || '#')}" target="_blank" rel="noopener">consulte o arquivo do sistema anterior</a>. Elas entram aqui à medida que forem cadastradas.</div></div>`;
    const go = () => { const q = N(est.q); const l = todas.filter(x => (!est.tipo || x.tipo === est.tipo) && (!est.ano || String(x.ano) === est.ano) && (!q || N([x.titulo, x.ementa, x.texto, (x.alteracoes || []).map(a => a.texto).join(' ')].join(' ')).includes(q)));
      document.getElementById('lei-cont').textContent = `${l.length} norma(s)`;
      document.getElementById('lei-lista').innerHTML = l.map(x => { const i = q ? N(x.texto || '').indexOf(q) : -1; const trecho = i >= 0 ? '…' + String(x.texto).slice(Math.max(0, i - 50), i + 110) + '…' : '';
        return `<a class="lei-card" href="leis.html?id=${encodeURIComponent(x.id)}"><div><span class="pp-tipo">${E(x.tipo)}</span><b>${E(x.titulo)}</b>${x.exemplo ? '<span class="pp-ex">exemplo</span>' : ''}${x.revogada ? '<span class="lei-rev">revogada</span>' : (x.alteracoes || []).length ? '<span class="lei-alt">alterada</span>' : ''}</div><p>${E(x.ementa)}</p>${trecho ? `<small class="lei-trecho">${E(trecho)}</small>` : ''}<small>Publicada em ${dBR(x.data)}</small></a>`; }).join('') || '<p class="nota">Nenhuma norma encontrada.</p>'; };
    document.getElementById('lei-q').oninput = e => { est.q = e.target.value; go(); };
    document.getElementById('lei-tipo').onchange = e => { est.tipo = e.target.value; go(); };
    document.getElementById('lei-ano').onchange = e => { est.ano = e.target.value; go(); }; go();
  }
  function detalheLei(app, lei, todas) {
    document.title = `${lei.titulo} — Câmara Municipal de Neves Paulista`;
    const por = [...new Set((lei.alteracoes || []).map(a => a.porLei))];
    const altera = todas.filter(x => x.id !== lei.id && (x.alteracoes || []).some(a => (a.porLei || '').includes(lei.titulo))).map(x => `<a href="leis.html?id=${encodeURIComponent(x.id)}">${E(x.titulo)}</a>`);
    app.innerHTML = `<div class="cab-pag"><div class="wrap">${trilha('<a href="leis.html">Leis municipais</a>', `<span>${E(lei.titulo)}</span>`)}<p class="pp-cab-tipo">${E(lei.tipo)}${lei.exemplo ? ' · exemplo' : ''}</p><h1>${E(lei.titulo)}</h1><p class="pp-cab-ementa">${E(lei.ementa)}</p></div></div>
      <div class="wrap conteudo pp-det"><div>
        ${lei.revogada ? `<div class="aviso">Norma revogada pela ${E(lei.revogada.por)}.</div>` : ''}
        <div class="lei-ferr">${(lei.alteracoes || []).length ? `<label><input type="checkbox" id="lei-ant"> Mostrar redações anteriores</label>` : ''}<button class="btn btn-claro" type="button" onclick="print()">${I('imprimir')} Imprimir</button></div>
        <article class="lei-texto" id="lei-texto"><p class="lei-em">${E(lei.ementa)}</p>${lgLeisCompilar(lei)}</article></div>
        <aside class="pp-ficha"><h2>Dados</h2><dl><dt>Publicação</dt><dd>${dBR(lei.data)}</dd>${lei.vigencia ? `<dt>Vigência</dt><dd>${E(lei.vigencia)}</dd>` : ''}${lei.projeto ? `<dt>Origem</dt><dd><a href="proposituras.html?id=${encodeURIComponent(lei.origem)}">${E(lei.projeto)}</a></dd>` : ''}${lei.autor ? `<dt>Autoria</dt><dd>${E(lei.autor)}</dd>` : ''}${por.length ? `<dt>Alterada por</dt><dd>${E(por.join(', '))}</dd>` : ''}${altera.length ? `<dt>Esta norma altera</dt><dd>${altera.join(', ')}</dd>` : ''}</dl>
          <p class="nota">${(lei.alteracoes || []).length ? 'Texto compilado: as partes alteradas indicam a norma que mudou a redação.' : 'Texto original publicado.'}</p></aside></div>`;
    const cb = document.getElementById('lei-ant'); if (cb) cb.onchange = () => document.getElementById('lei-texto').classList.toggle('ant', cb.checked);
  }

  /* ================= Sessões: pautas, resultados e atas ================= */
  function montarPlenario() {
    const el = document.getElementById('sessoes-plenario'); if (!el) return;
    const d = lsj('lgpl_v1', { sessoes: [] }); const prots = lsj('legislagov_protocolos_v2_neves-paulista-sp', []) || [];
    const Pr = id => prots.find(p => p.id === id) || {};
    const l = (d.sessoes || []).filter(s => s.convocacao).sort((a, b) => new Date(b.quando) - new Date(a.quando));
    if (!l.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<h2 class="pp-h2">Pautas e resultados</h2>${l.map(s => `<details class="pl-sessao"${s.status !== 'encerrada' ? ' open' : ''}><summary><b>${E(s.titulo)}</b><span>${new Date(s.quando).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · ${new Date(s.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><em class="pl-st ${s.status}">${{ convocada: 'Pauta publicada', aberta: 'Em andamento', encerrada: 'Realizada' }[s.status] || ''}</em></summary>
      <ol class="pl-itens">${s.itens.map(i => { const p = Pr(i.pid); return `<li><a href="proposituras.html?id=${encodeURIComponent(i.pid)}"><b>${E(p.numero || '')}</b> ${E(p.ementa || '')}</a>${i.resultado ? `<span class="pl-res ${/Aprovado|derrubado/.test(i.resultado) ? 'ok' : 'er'}">${E(i.resultado)}${i.placar ? ` (${i.placar.sim} × ${i.placar.nao})` : ''}</span>` : ''}${i.nominal && i.nominal.length ? `<details class="pl-nom"><summary>Votos de cada vereador</summary><ul>${i.nominal.map(v => `<li><span>${E(v.nome)}</span><b>${E(v.voto)}</b></li>`).join('')}</ul></details>` : ''}</li>`; }).join('')}</ol>
      ${s.status === 'encerrada' ? `<p class="pl-pres"><b>Presença:</b> ${Object.keys(s.presenca || {}).length} vereadores.</p>` : ''}${(() => { const v = window.lgtvVideoDaSessao && lgtvVideoDaSessao(s); return v ? `<a class="btn" href="video.html?v=${encodeURIComponent(v.id)}">${I('video')} Assistir à sessão</a> ` : ''; })()}${s.ata && s.ata.status !== 'rascunho' ? `<button type="button" class="btn btn-claro" onclick="lgcAta('${E(s.id)}')">${I('doc')} Ler a ata</button>` : ''}</details>`).join('')}`;
  }
  window.lgcMontarPlenario = montarPlenario;
  window.lgcAta = function (id) { const s = (lsj('lgpl_v1', { sessoes: [] }).sessoes || []).find(x => x.id === id); if (!s || !s.ata) return; const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ata — ${E(s.titulo)}</title><style>body{font:15px/1.6 Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;white-space:pre-wrap}</style></head><body>${E(s.ata.texto)}</body></html>`); w.document.close(); };

  /* ================= estilos ================= */
  const css = document.createElement('style'); css.textContent = `
  .pp-seguir{border:1px solid var(--linha,#e3e0d8);border-radius:14px;padding:14px;margin-bottom:18px;background:var(--creme,#faf8f3)}.pp-seguir p{margin:0 0 10px;font-size:14px}.pp-seguir .ic{width:16px;height:16px;vertical-align:-3px}
  .pp-seguir-email{margin-top:12px;display:flex;flex-direction:column;gap:6px}.pp-seguir-email label{font-weight:600;font-size:13.5px}.pp-seguir-email div{display:flex;gap:6px;flex-wrap:wrap}.pp-seguir-email input{flex:1;min-width:160px;height:40px;border-radius:9px;border:1px solid var(--linha,#d9d5cc);padding:0 10px;font:inherit}.pp-seguir-email small{color:var(--suave,#5b6670);font-size:12px}
  .pp-seguir-ok{color:#1d7a46;font-weight:600;font-size:13.5px;margin:8px 0 0}.pp-novo{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:20px;background:#c0392b;color:#fff;font-size:11.5px;font-weight:700}
  .pp-seg-faixa{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-radius:12px;border:1px solid var(--linha,#e3e0d8);margin-bottom:14px;font-size:14px}
  .ouv-abas{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}.ouv-abas button{padding:10px 14px;border-radius:10px;border:1px solid var(--linha,#d9d5cc);background:transparent;font:600 14px inherit;cursor:pointer;color:inherit}.ouv-abas button[aria-selected=true]{background:var(--primario,#1f5040);color:#fff;border-color:var(--primario,#1f5040)}
  .ouv-info p{font-size:14px}.ouv-info p a{display:inline;padding:0}.ouv-info .ic{display:inline-block;width:15px;height:15px;vertical-align:-3px;margin-right:4px}.ouv-anon,.ouv-lgpd{flex-direction:row!important;align-items:flex-start;gap:10px;font-weight:400!important}.ouv-anon input,.ouv-lgpd input{margin-top:5px}
  .ouv-ok{padding:18px;border-radius:14px}.ouv-prot{font-size:20px;letter-spacing:.04em}
  .ouv-cons{margin-top:16px;border:1px solid var(--linha,#e3e0d8);border-radius:14px;padding:16px}.ouv-cons-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.ouv-st{padding:3px 10px;border-radius:20px;font-size:12.5px;font-weight:700;background:#fff3cd;color:#7a5a00}.ouv-st.respondido{background:#d9f2e3;color:#1d7a46}
  .ouv-cons dl{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;margin:0 0 10px}.ouv-cons dt{font-weight:600;color:var(--suave,#5b6670)}.ouv-cons dd{margin:0}
  .lei-lista{display:flex;flex-direction:column;gap:10px}.lei-card{display:block;padding:16px;border-radius:14px;border:1px solid var(--linha,#e3e0d8);text-decoration:none;color:inherit}.lei-card:hover{border-color:var(--ouro,#b8860b)}
  .lei-card > div{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.lei-card b{font-size:17px}.lei-card p{margin:6px 0}.lei-card small{display:block;color:var(--suave,#5b6670);font-size:12.5px}.lei-trecho{font-style:italic;margin-bottom:4px}
  .lei-alt,.lei-rev{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:20px;background:#fff3cd;color:#7a5a00}.lei-rev{background:#f8d7da;color:#842029}
  .lei-ferr{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.lei-ferr label{display:inline-flex;gap:8px;align-items:center;font-size:14px}
  .lei-texto{font:17px/1.7 'Source Serif 4',Georgia,serif}.lei-texto p{margin:0 0 12px}.lei-em{margin-left:35%!important;font-style:italic;font-size:15px}.lei-texto .ll-ant{display:none;color:#777}.lei-texto.ant .ll-ant{display:block}.lei-texto em{font:italic 13px Inter,sans-serif;color:#8a6d0b}.lei-texto .ll-rev{color:#777}
  .pl-sessao{border:1px solid var(--linha,#e3e0d8);border-radius:14px;padding:12px 16px;margin-bottom:10px}.pl-sessao summary{cursor:pointer;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.pl-sessao summary span{color:var(--suave,#5b6670);font-size:14px}
  .pl-st{margin-left:auto;font-style:normal;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;background:#e8eefc;color:#2c4a9a}.pl-st.encerrada{background:#d9f2e3;color:#1d7a46}.pl-st.aberta{background:#f8d7da;color:#842029}
  .pl-itens{margin:12px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:10px}.pl-itens a{color:inherit}.pl-res{display:inline-block;margin-left:8px;font-size:12.5px;font-weight:700;padding:2px 8px;border-radius:20px}.pl-res.ok{background:#d9f2e3;color:#1d7a46}.pl-res.er{background:#f8d7da;color:#842029}
  .pl-nom{margin-top:6px}.pl-nom summary{font-size:13px;cursor:pointer}.pl-nom ul{list-style:none;padding:0;margin:6px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 12px;font-size:13.5px}.pl-nom li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dotted var(--linha,#ddd)}
  .pl-pres{font-size:14px;margin:10px 0}
  html[data-contraste=alto] .pp-seguir,html[data-contraste=alto] .lei-card,html[data-contraste=alto] .pl-sessao,html[data-contraste=alto] .ouv-cons{background:#000;border-color:#fff}
  @media(max-width:700px){.lei-em{margin-left:0!important}.ouv-cons dl{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  document.addEventListener('DOMContentLoaded', () => { montarOuvidoria(); montarLeis(); montarPlenario(); });
  addEventListener('storage', e => { if (e.key === 'lgpl_v1' || /^legislagov_protocolos/.test(e.key || '')) montarPlenario(); if (e.key === 'lgll_v1') montarLeis(); });
})();
