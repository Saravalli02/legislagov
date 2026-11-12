/* =====================================================================
   LegislaGov — AVISOS, PRAZOS, MINHAS PENDÊNCIAS, BUSCA ÚNICA E ACESSIBILIDADE
   · Sino no topo: o que depende de você agora (pendências) e as novidades das suas proposituras.
     Cada usuário vê só o que é dele (vereador, Presidente, presidente/relator de comissão,
     Procuradoria, Secretaria, Transparência, Mesa da sessão).
   · Botão WhatsApp: quando uma ação passa a tarefa para outra pessoa, o sistema oferece o aviso
     com a mensagem pronta (wa.me). O envio automático depende do servidor e de um serviço pago.
   · Prazos: cada etapa da tramitação tem prazo (padrões sugeridos, ajustáveis pela Procuradoria)
     com semáforo verde / amarelo / vermelho. Feriados ainda não são descontados.
   · Busca única (Ctrl+K): matérias, leis, vereadores, sessões, publicações, notícias e funções.
   · Aparência: texto maior / muito maior e alto contraste.
   Os dados ficam neste navegador até existir o servidor com banco de dados.
   ===================================================================== */
(function () {
  const KEY = 'lgav_v1', ETAPAS = 'lgav_etapas_v1', PRAZOS = 'lgav_prazos_v1';
  const A = () => window.lgvrAPI;
  const UI = () => window.lgtUI;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const usuario = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const loginDe = u => String((u && (u.usuario || u.email)) || '').toLowerCase();
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dBR = iso => new Date(iso).toLocaleDateString('pt-BR');
  const listaProt = () => (A() ? A().listaProt() : []);

  /* ================= prazos ================= */
  const PRAZOS_PADRAO = {
    recebimento: { nome: 'Receber matéria do Executivo', dias: 2, uteis: true, quem: 'Secretaria' },
    despacho: { nome: 'Despacho do Presidente', dias: 3, uteis: true, quem: 'Presidente da Câmara' },
    juridico: { nome: 'Parecer jurídico', dias: 10, uteis: true, quem: 'Procuradoria' },
    relator: { nome: 'Designar o relator na comissão', dias: 2, uteis: true, quem: 'Presidente da comissão' },
    parecer: { nome: 'Parecer do relator', dias: 10, uteis: true, quem: 'Relator' },
    diligencia: { nome: 'Resposta à diligência', dias: 15, uteis: false, quem: 'Órgão consultado' },
    votoComissao: { nome: 'Votação do parecer na comissão', dias: 5, uteis: true, quem: 'Membros da comissão' },
    autografo: { nome: 'Autógrafo ou promulgação após a aprovação', dias: 10, uteis: true, quem: 'Presidente da Câmara' },
    sancao: { nome: 'Sanção ou veto do Prefeito', dias: 15, uteis: true, quem: 'Prefeito', base: 'CF, art. 66, §§ 1º e 3º: sem manifestação no prazo, há sanção tácita' },
    veto: { nome: 'Apreciação do veto pela Câmara', dias: 30, uteis: false, quem: 'Plenário', base: 'CF, art. 66, § 4º' },
    promulgacao: { nome: 'Promulgação após veto rejeitado', dias: 2, uteis: false, quem: 'Prefeito / Presidente da Câmara', base: 'CF, art. 66, §§ 5º e 7º (48 horas)' },
    respostaReq: { nome: 'Resposta da Prefeitura a requerimento', dias: 15, uteis: false, quem: 'Prefeitura' },
    respostaInd: { nome: 'Retorno da Prefeitura a indicação', dias: 30, uteis: false, quem: 'Prefeitura' },
    esic: { nome: 'Resposta a pedido de informação (e-SIC)', dias: 20, uteis: false, quem: 'Serviço de Informação ao Cidadão', base: 'Lei 12.527/2011, art. 11, §§ 1º e 2º (prorrogável por 10 dias)' },
    ouvidoria: { nome: 'Resposta da Ouvidoria', dias: 30, uteis: false, quem: 'Ouvidoria', base: 'Lei 13.460/2017, art. 16 (prorrogável por 30 dias)' },
  };
  const prazos = () => { const p = ler(PRAZOS, {}); const o = {}; Object.keys(PRAZOS_PADRAO).forEach(k => { o[k] = { ...PRAZOS_PADRAO[k], ...(p[k] || {}) }; }); return o; };
  function somarDias(desde, dias, uteis) {
    const d = new Date(desde); if (!uteis) { d.setDate(d.getDate() + dias); return d; }
    let n = 0; while (n < dias) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; } return d;
  }
  function semaforo(desde, cfg) {
    const ini = new Date(desde), vence = somarDias(ini, cfg.dias, cfg.uteis); vence.setHours(23, 59, 59, 0);
    const agora = new Date(), total = vence - ini, resta = vence - agora; const dias = Math.ceil(resta / 864e5);
    const cor = resta < 0 ? 'vermelho' : (dias <= 2 || resta < total * 0.3) ? 'amarelo' : 'verde';
    return { vence: vence.toISOString(), dias, cor, txt: resta < 0 ? `vencido há ${Math.max(1, -dias)} dia(s)` : dias <= 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias (${dBR(vence)})` };
  }
  window.lgavSemaforo = (desde, k) => { const c = prazos()[k]; return c ? semaforo(desde, c) : null; };
  window.lgavPrazos = prazos;

  /* etapa atual de cada matéria e desde quando ela está lá */
  function etapaDe(p) {
    const T = A() ? A().tipoDe(p) : '';
    if (p.status === 'enviado') return 'recebimento';
    if (p.status === 'protocolado') return 'despacho';
    if (p.status === 'analise') return 'juridico';
    if (p.status === 'comissao' && p.comissao) { const f = window.lgcmFase ? lgcmFase(p, p.comissao) : 'parecer'; return { relator: 'relator', parecer: 'parecer', diligencia: 'diligencia', votacao: 'votoComissao' }[f] || null; }
    if (p.status === 'votacao' && !p.resultado) return p.veto && !p.veto.resultado ? 'veto' : null;
    if (p.status === 'votacao' && p.resultado === 'aprovado') return 'autografo';
    if (p.status === 'aguardando_exec') return p.veto && p.veto.resultado === 'rejeitado' ? 'promulgacao' : 'sancao';
    if (p.status === 'concluido' && p.oficio && !p.resposta && (T === 'REQ' || T === 'IND')) return T === 'REQ' ? 'respostaReq' : 'respostaInd';
    return null;
  }
  const chaveEtapa = p => [p.status, p.comissao || '', etapaDe(p) || '', p.resultado || '', p.veto ? (p.veto.resultado || 'pend') : ''].join('|');
  function marcarEtapas() {
    const m = ler(ETAPAS, {}); let mudou = false; const agora = new Date().toISOString();
    listaProt().forEach(p => { const k = chaveEtapa(p); if (!m[p.id] || m[p.id].k !== k) { m[p.id] = { k, desde: agora }; mudou = true; } });
    if (mudou) gravar(ETAPAS, m); return m;
  }
  function prazoDe(p, m) {
    const e = etapaDe(p); if (!e) return null; const cfg = prazos()[e];
    let desde = (m || ler(ETAPAS, {}))[p.id]?.desde || new Date().toISOString();
    if ((e === 'respostaReq' || e === 'respostaInd') && p.oficio && p.oficio.enviado) desde = p.oficio.enviado;
    return { etapa: e, cfg, desde, ...semaforo(desde, cfg) };
  }
  window.lgavPrazoDe = p => prazoDe(p);
  window.lgavL10 = function (id) {   // abre o aviso do painel administrativo e marca como lido
    const n = ler('lgv10_notifications_v1', []).find(x => x.id === id); try { window.lgv10Read && lgv10Read(id); } catch (e) { }
    if (!n) return; const k = n.kind || '';
    if (k.startsWith('expediente:') && window.lgv20OpenPrivate) return lgv20OpenPrivate(k.slice(11));
    if (k === 'protocolo' && window.lgv9Open) return lgv9Open();
    if (window.lgv10Open) lgv10Open(k === 'mensagem' ? 'inbox' : 'notifications');
  };
  const chip = pz => pz && typeof pz === 'object' && pz.txt ? `<span class="lgav-chip c-${pz.cor}" title="${esc((pz.cfg || {}).nome || '')}">${ic('prazo')}${esc(pz.txt)}</span>` : '';
  window.lgavChip = p => chip(prazoDe(p));

  /* ================= quem é o usuário ================= */
  function eu() {
    const u = usuario(); if (!u) return null;
    const perfil = window.lgPerfil ? lgPerfil(u) : '';
    let v = window.lgVereadorDoUsuario ? lgVereadorDoUsuario(u) : null; let demo = false;
    if (!v && A()) { let area = ''; try { area = sessionStorage.getItem('lg_area') || ''; } catch (e) { } if (area === 'vereador') { const a = A().atual(); if (a) { v = a.v; demo = a.demo; } } }
    const pres = !!(v && A() && v.id === A().comp().presidente);
    return { u, login: loginDe(u), perfil, v, demo, pres };
  }
  function meuDestino(dest, me) {
    if (!me) return false;
    if (dest.startsWith('v:')) return !!me.v && me.v.id === dest.slice(2);
    if (dest === 'eu') return true;
    if (dest === 'pres') return me.pres;
    if (dest.startsWith('perfil:')) return me.perfil === dest.slice(7) || me.perfil === 'adm';
    if (dest === 'area:transparencia') return me.perfil !== 'vereador' && window.lgNivelArea && lgNivelArea('transparencia') === 'edicao';
    return false;
  }

  /* ================= todas as pendências da Câmara ================= */
  function todas() {
    if (!A()) return [];
    const c = A().comp(), m = marcarEtapas(), out = [];
    const add = (dest, x) => out.push({ dest, ...x });
    listaProt().forEach(p => {
      const pz = prazoDe(p, m); const num = p.numero || p.full || '';
      if (pz) {
        const base = { chave: `${pz.etapa}:${p.id}:${m[p.id]?.desde || ''}`, prazo: pz, pid: p.id, texto: p.ementa || '' };
        switch (pz.etapa) {
          case 'recebimento': add(['perfil:secretaria'], { ...base, titulo: `Receber matéria do Executivo: ${num}`, acao: "gotoV('cam','entrada')", area: 'legislativo' }); break;
          case 'despacho': add(['pres'], { ...base, titulo: `Despachar ${num}`, acao: "lgvrAbrir('despacho')", area: 'vereador' }); break;
          case 'juridico': add(['perfil:procurador'], { ...base, titulo: `Parecer jurídico: ${num}`, acao: `abrirDetalheCam('${p.id}')`, area: 'legislativo' }); break;
          case 'relator': case 'parecer': case 'diligencia': case 'votoComissao': {
            const com = (c.comissoes || []).find(x => x.nome === p.comissao); if (!com) break; const t = (p.comTrab || {})[p.comissao] || {};
            const membros = [com.presidente, com.vice, com.relator].filter(Boolean);
            const tit = { relator: 'Designar o relator', parecer: 'Elaborar o parecer', diligencia: 'Retomar após a diligência', votoComissao: 'Votar o parecer' }[pz.etapa];
            const quem = pz.etapa === 'relator' ? [com.presidente] : (pz.etapa === 'parecer' || pz.etapa === 'diligencia') ? [t.relator] : membros.filter(id => id !== t.relator && !(t.votos || {})[id]);
            quem.filter(Boolean).forEach(id => add(['v:' + id], { ...base, chave: base.chave + ':' + id, titulo: `${tit} — Comissão de ${p.comissao}: ${num}`, acao: "lgvrAbrir('comissoes')", area: 'vereador' }));
            break; }
          case 'autografo': add(['pres'], { ...base, titulo: `${A().TIPOS[A().tipoDe(p)].fluxo === 'promulga' ? 'Promulgar' : 'Assinar o autógrafo de'} ${num}`, acao: "lgvrAbrir('autografos')", area: 'vereador' }); break;
          case 'sancao': add(['pres', 'perfil:secretaria'], { ...base, titulo: `Com o Prefeito: registrar sanção ou veto de ${num}`, acao: "lgvrAbrir('autografos')", area: 'vereador' }); break;
          case 'veto': add(['pres'], { ...base, titulo: `Pautar a apreciação do veto: ${num}`, acao: "lgplAbrir('pres')", area: 'vereador' }); break;
          case 'promulgacao': add(['pres'], { ...base, titulo: `Promulgar a lei (veto rejeitado): ${num}`, acao: "lgvrAbrir('autografos')", area: 'vereador' }); break;
          case 'respostaReq': case 'respostaInd':
            add(['perfil:secretaria'], { ...base, titulo: `Resposta da Prefeitura: ${num}`, acao: "lgfxAbrir('oficios')", area: 'legislativo' });
            if (p.autorId) add(['v:' + p.autorId], { ...base, chave: base.chave + ':autor', titulo: `Aguardando a Prefeitura: ${num}`, acao: "lgfxAbrir('respostas')", area: 'vereador', info: true });
            break;
        }
      }
      (p.coautores || []).filter(id => !(p.assinaturas || []).some(s => s.vereadorId === id) && !['rejeitado', 'concluido', 'devolvido'].includes(p.status))
        .forEach(id => add(['v:' + id], { chave: `coaut:${p.id}:${id}`, titulo: `Assinar a coautoria de ${num}`, texto: p.ementa, acao: "lgvrAbrir('assinar')", area: 'vereador', pid: p.id }));
    });
    try { (A().dados().rascunhos || []).filter(r => !r.pendenteMao).forEach(r => add(['v:' + r.autorId], { chave: `rasc:${r.id}`, titulo: `Rascunho a assinar: ${A().TIPOS[r.tipo]?.nome || ''}`, texto: r.ementa, acao: "lgvrAbrir('assinar')", area: 'vereador' })); } catch (e) { }
    try { if (window.lgfxPendencias) lgfxPendencias().forEach(x => add(x.dest, x)); } catch (e) { }
    try { if (window.lgsPendencias) lgsPendencias().forEach(x => add(x.dest, x)); } catch (e) { }
    // expedientes, protocolos numerados e mensagens (avisos do painel administrativo)
    try { if (window.lgv10Para) ler('lgv10_notifications_v1', []).filter(n => lgv10Para(n)).slice(0, 30).forEach(n => add(['eu'], { chave: 'l10:' + n.id, titulo: n.title, texto: n.detail, acao: `lgavL10('${n.id}')`, area: '', urgente: /^(expediente|protocolo)/.test(n.kind || '') })); } catch (e) { }
    return out;
  }
  function minhas() {
    const me = eu(); if (!me) return [];
    const l = todas().filter(x => x.dest.some(d => meuDestino(d, me)));
    try { if (window.lgplPendencias) lgplPendencias(me.v).forEach(x => l.push({ dest: ['eu'], ...x })); } catch (e) { }
    const ordem = x => x.urgente ? 0 : x.prazo && x.prazo.cor ? ({ vermelho: 1, amarelo: 2, verde: 4 }[x.prazo.cor] ?? 3) : x.info ? 6 : 3;
    return l.sort((a, b) => ordem(a) - ordem(b));
  }
  window.lgavMinhas = minhas;

  /* ================= novidades das minhas proposituras ================= */
  function estado() { const d = ler(KEY, {}); d.u = d.u || {}; return d; }
  function meuEstado(d, me) { const k = me.login + (me.v ? ':' + me.v.id : ''); d.u[k] = d.u[k] || { tl: null, hist: [], lidos: {} }; return d.u[k]; }
  function atualizarNovidades() {
    const me = eu(); if (!me || !me.v || !A()) return;
    const d = estado(); const st = meuEstado(d, me); const minhasP = listaProt().filter(p => A().ehMinha(p, me.v));
    const prim = !st.tl; st.tl = st.tl || {}; let mudou = prim;
    minhasP.forEach(p => { const n = (p.timeline || []).length; const vis = st.tl[p.id];
      if (!prim && vis !== undefined && n > vis) (p.timeline || []).slice(vis).forEach(t => st.hist.unshift({ id: p.id + ':' + n + ':' + t.label.length, titulo: p.numero, texto: t.label, data: new Date().toISOString(), acao: `lgvrVer('${p.id}')`, area: 'vereador' }));
      if (vis !== n) { st.tl[p.id] = n; mudou = true; } });
    st.hist = st.hist.slice(0, 40); if (mudou) gravar(KEY, d);
  }
  function contagem() {
    const me = eu(); if (!me) return 0; const d = estado(); const st = meuEstado(d, me);
    return minhas().filter(x => !st.lidos[x.chave] && !x.info).length + st.hist.filter(h => !h.lido).length;
  }
  window.lgavContagem = () => { try { return contagem(); } catch (e) { return 0; } };

  /* ================= sino ================= */
  let abaSino = 'pend';
  window.lgavAbrir = function (forcar) {
    let el = $('#lgav-sino');
    if (!el) { el = document.createElement('div'); el.id = 'lgav-sino'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Avisos e pendências'); document.body.appendChild(el); }
    if (el.classList.contains('open') && forcar !== true) { el.classList.remove('open'); return; }
    atualizarNovidades(); desenharSino(); el.classList.add('open'); setTimeout(() => el.querySelector('button')?.focus(), 30);
  };
  function itemHTML(x, lido, tipo, i) {
    return `<li class="${lido ? 'lido' : ''} ${x.urgente ? 'urg' : ''}"><button type="button" onclick="lgavIr('${tipo}',${i})"><b>${esc(x.titulo)}</b>${x.texto ? `<small>${esc(String(x.texto).slice(0, 120))}</small>` : ''}<span class="lgav-meta">${x.prazo ? chip(x.prazo) : ''}${x.data ? `<i>${esc(new Date(x.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</i>` : ''}${x.info ? '<i>acompanhamento</i>' : ''}</span></button></li>`;
  }
  let cacheP = [], cacheH = [];
  function desenharSino() {
    const el = $('#lgav-sino'); if (!el) return; const me = eu(); if (!me) return;
    const d = estado(); const st = meuEstado(d, me); cacheP = minhas(); cacheH = st.hist;
    const nP = cacheP.filter(x => !st.lidos[x.chave] && !x.info).length, nH = cacheH.filter(h => !h.lido).length;
    el.innerHTML = `<div class="lgav-cab"><b>${ic('notificacoes')} Avisos</b><button type="button" class="lgav-x" onclick="lgavAbrir()" aria-label="Fechar">×</button></div>
      <div class="lgav-abas" role="tablist"><button type="button" role="tab" aria-selected="${abaSino === 'pend'}" onclick="lgavAba('pend')">Para fazer <b>${cacheP.filter(x => !x.info).length}</b>${nP ? '<i></i>' : ''}</button><button type="button" role="tab" aria-selected="${abaSino === 'nov'}" onclick="lgavAba('nov')">Novidades <b>${nH}</b>${nH ? '<i></i>' : ''}</button></div>
      <ul class="lgav-lista">${abaSino === 'pend' ? (cacheP.map((x, i) => itemHTML(x, st.lidos[x.chave], 'p', i)).join('') || '<li class="lgav-vazio">Nada pendente com você. 👍</li>') : (cacheH.map((x, i) => itemHTML(x, x.lido, 'h', i)).join('') || `<li class="lgav-vazio">${me.v ? 'As movimentações das suas proposituras aparecem aqui.' : 'Sem novidades.'}</li>`)}</ul>
      <div class="lgav-rod"><button type="button" onclick="lgavLidas()">Marcar tudo como lido</button><button type="button" onclick="lgavAbrir();lgavTela()">Ver tela de pendências</button><button type="button" onclick="lgavAbrir();window.lgv10Open&&lgv10Open('inbox')">${ic('mensagens')} Mensagens</button></div>`;
  }
  window.lgavAba = k => { abaSino = k; desenharSino(); };
  window.lgavLidas = function () { const me = eu(); const d = estado(); const st = meuEstado(d, me); minhas().forEach(x => st.lidos[x.chave] = 1); st.hist.forEach(h => h.lido = true); gravar(KEY, d); desenharSino(); sincronizarBadge(); };
  window.lgavIr = function (tipo, i) {
    const x = tipo === 'p' ? cacheP[i] : cacheH[i]; if (!x) return; const me = eu(); const d = estado(); const st = meuEstado(d, me);
    if (tipo === 'p') st.lidos[x.chave] = 1; else x.lido = true, st.hist[i] && (st.hist[i].lido = true); gravar(KEY, d);
    $('#lgav-sino')?.classList.remove('open'); executar(x); sincronizarBadge();
  };
  function executar(x) {
    let area = ''; try { area = sessionStorage.getItem('lg_area') || ''; } catch (e) { }
    const vai = () => { try { (new Function(x.acao))(); } catch (e) { console.warn('Aviso', e); } };
    if (x.area && x.area !== area && window.lgtAreasPermitidas && lgtAreasPermitidas().includes(x.area)) { lgv33TrocarArea(x.area); setTimeout(vai, 120); }
    else vai();
  }
  window.lgavExecutar = executar;
  function sincronizarBadge() {
    const n = contagem();
    ['lgv31-badge', 'lgv31-menu-count'].forEach(id => { const b = document.getElementById(id); if (b) { b.textContent = n || ''; b.style.display = n ? 'inline-flex' : 'none'; } });
    const t = document.querySelector('.lgv31-item[data-v31="pendencias"]'); if (t) { let m = t.querySelector('.lgvr-n'); if (!m) { m = document.createElement('b'); m.className = 'lgvr-n'; t.appendChild(m); } const q = minhas().filter(x => !x.info).length; m.textContent = q || ''; m.hidden = !q; }
  }
  window.lgavAtualizar = () => { try { marcarEtapas(); atualizarNovidades(); sincronizarBadge(); if ($('#lgav-sino')?.classList.contains('open')) desenharSino(); if ($('#view-lgav')?.style.display === 'block') lgavTela(true); } catch (e) { } };

  /* ================= tela "Minhas pendências" ================= */
  function criarView(id) {
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main || document.getElementById('view-' + id)) return;
    main.insertAdjacentHTML('beforeend', `<section class="view lgt lgvr lgav" id="view-${id}" style="display:none"></section>`);
    const antigo = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = id; b.hidden = true; b.style.display = 'none'; antigo.appendChild(b);
  }
  function cardHTML(l, limite) {
    const me = eu(); const st = meuEstado(estado(), me); cacheP = l;
    const it = (x, i) => `<li class="${x.urgente ? 'urg' : ''}"><div><b>${esc(x.titulo)}</b>${x.texto ? `<small>${esc(String(x.texto).slice(0, 140))}</small>` : ''}</div>${x.prazo ? chip(x.prazo) : x.info ? '<span class="lgav-chip c-info">acompanhamento</span>' : ''}<button class="lgt-mini primario" type="button" onclick="lgavIr('p',${i})">${x.info ? 'Ver' : 'Fazer agora'}</button></li>`;
    const ativos = l.filter(x => !x.info);
    return `<ul class="lgav-pend">${l.slice(0, limite || 99).map(it).join('') || '<li class="lgav-vazio">Nada pendente com você agora.</li>'}</ul>${limite && l.length > limite ? `<button class="lgt-mini" type="button" onclick="lgavTela()">Ver todas (${l.length})</button>` : ''}`;
  }
  window.lgavCardPendencias = function () {
    const l = minhas(); const ativos = l.filter(x => !x.info);
    if (!ativos.length) return '';
    const venc = ativos.filter(x => x.prazo && x.prazo.cor === 'vermelho').length;
    return `<div class="lgt-card lgav-card"><div class="lgvr-card-cab"><h3>${ic('notificacoes')} Minhas pendências <span class="lgav-num">${ativos.length}</span>${venc ? ` <span class="lgav-chip c-vermelho">${venc} com prazo vencido</span>` : ''}</h3><button class="lgt-mini" type="button" onclick="lgavTela()">Ver todas</button></div>${cardHTML(l, 4)}</div>`;
  };
  window.lgavTela = function (redesenhar) {
    criarView('lgav');
    if (!redesenhar) { gotoShared('lgav'); if (window.lgv31Mark) lgv31Mark('pendencias'); scrollTo(0, 0); }
    const me = eu(); if (!me) return; atualizarNovidades();
    const l = minhas(); const st = meuEstado(estado(), me);
    const ges = ['adm', 'procurador', 'secretaria'].includes(me.perfil);
    $('#view-lgav').innerHTML = `<div class="letterhead"><div><h1>Minhas pendências</h1><div class="date">O que depende de você agora, com prazo e semáforo</div></div><div class="lgt-acoes">${ges ? `<button class="lgt-btn" type="button" onclick="lgavPrazosTela()">${ic('prazo')} Prazos de toda a Câmara</button>` : ''}</div></div>
      <div class="lgav-leg"><span class="lgav-chip c-verde">no prazo</span><span class="lgav-chip c-amarelo">perto de vencer</span><span class="lgav-chip c-vermelho">vencido</span><small>Prazos sugeridos; a Procuradoria ajusta conforme o Regimento. Feriados ainda não são descontados.</small></div>
      <div class="lgt-card">${cardHTML(l)}</div>
      ${me.v ? `<div class="lgt-card"><div class="lgvr-card-cab"><h3>Novidades das suas proposituras</h3></div><ul class="lgav-hist">${st.hist.slice(0, 15).map(h => `<li><span>${esc(new Date(h.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span><b>${esc(h.titulo)}</b><small>${esc(h.texto)}</small></li>`).join('') || '<li class="lgav-vazio">Nenhuma movimentação nova.</li>'}</ul></div>` : ''}`;
  };

  /* ================= tela "Prazos" (Procuradoria, Secretaria, administrador) ================= */
  let filtroPz = 'todos';
  window.lgavPrazosTela = function () {
    criarView('lgav-prazos'); gotoShared('lgav-prazos'); if (window.lgv31Mark) lgv31Mark('prazos'); scrollTo(0, 0); desenharPrazos();
  };
  function desenharPrazos() {
    const me = eu(); if (!me) return; const m = marcarEtapas(); const P = prazos();
    const pode = ['adm', 'procurador'].includes(me.perfil);
    let linhas = listaProt().map(p => ({ p, pz: prazoDe(p, m) })).filter(x => x.pz);
    const cont = { todos: linhas.length, vermelho: linhas.filter(x => x.pz.cor === 'vermelho').length, amarelo: linhas.filter(x => x.pz.cor === 'amarelo').length };
    if (filtroPz !== 'todos') linhas = linhas.filter(x => x.pz.cor === filtroPz);
    linhas.sort((a, b) => new Date(a.pz.vence) - new Date(b.pz.vence));
    $('#view-lgav-prazos').innerHTML = `<div class="letterhead"><div><h1>Prazos da tramitação</h1><div class="date">Onde está cada matéria, quem precisa agir e até quando</div></div></div>
      <div class="lgf-abas" role="tablist">${[['todos', 'Todas'], ['vermelho', 'Vencidas'], ['amarelo', 'Perto de vencer']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${filtroPz === k}" onclick="lgavFiltroPz('${k}')">${n} <b>${cont[k]}</b></button>`).join('')}</div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Matéria</th><th>Etapa</th><th>Quem age</th><th>Desde</th><th>Prazo</th></tr></thead><tbody>${linhas.map(({ p, pz }) => `<tr><td><b>${esc(p.numero || p.full)}</b><small>${esc((p.ementa || '').slice(0, 90))}</small></td><td>${esc(pz.cfg.nome)}${p.comissao && /relator|parecer|diligencia|votoComissao/.test(pz.etapa) ? `<small>Comissão de ${esc(p.comissao)}</small>` : ''}</td><td><small>${esc(pz.cfg.quem)}</small></td><td><small>${dBR(pz.desde)}</small></td><td>${chip(pz)}</td></tr>`).join('') || '<tr><td colspan="5" class="lgt-vazio"><b>Nenhuma matéria nesta situação.</b></td></tr>'}</tbody></table></div>
      <details class="lgt-card lgav-cfg" ${pode ? '' : ''}><summary><b>${ic('config')} Prazos de cada etapa</b> <small>${pode ? 'a Procuradoria pode ajustar conforme o Regimento e a Lei Orgânica' : 'somente consulta'}</small></summary>
        <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Etapa</th><th>Quem</th><th>Prazo</th><th>Contagem</th><th>Base</th></tr></thead><tbody>${Object.entries(P).map(([k, c]) => `<tr><td><b>${esc(c.nome)}</b></td><td><small>${esc(c.quem)}</small></td><td>${pode ? `<input class="lgav-n" type="number" min="1" max="365" value="${c.dias}" aria-label="Dias para ${esc(c.nome)}" onchange="lgavPrazoSet('${k}','dias',this.value)">` : c.dias} dias</td><td>${pode ? `<select aria-label="Contagem" onchange="lgavPrazoSet('${k}','uteis',this.value==='1')"><option value="1" ${c.uteis ? 'selected' : ''}>úteis</option><option value="0" ${!c.uteis ? 'selected' : ''}>corridos</option></select>` : c.uteis ? 'úteis' : 'corridos'}</td><td><small>${esc(c.base || 'Padrão sugerido — confirme no Regimento')}</small></td></tr>`).join('')}</tbody></table></div>
        ${pode ? '<button class="lgt-mini" type="button" onclick="lgavPrazoPadrao()">Restaurar os prazos sugeridos</button>' : ''}</details>`;
  }
  window.lgavFiltroPz = k => { filtroPz = k; desenharPrazos(); };
  window.lgavPrazoSet = function (k, campo, v) { const me = eu(); if (!me || !['adm', 'procurador'].includes(me.perfil)) return; const p = ler(PRAZOS, {}); p[k] = { ...(p[k] || {}), [campo]: campo === 'dias' ? Math.max(1, +v || 1) : v }; gravar(PRAZOS, p); UI().aviso('Prazo atualizado.'); desenharPrazos(); };
  window.lgavPrazoPadrao = () => UI().confirmar('Voltar todos os prazos para os valores sugeridos?', () => { gravar(PRAZOS, {}); desenharPrazos(); });

  /* ================= WhatsApp ================= */
  function telefoneDe(id) {
    if (!id) return '';
    if (/^v/.test(id)) {
      const n = String(id).slice(1); const cms = ler('lgs_site_vereadores_v1', null);
      const lista = cms && (cms.lista || cms.vereadores || (Array.isArray(cms) ? cms : null));
      const x = Array.isArray(lista) ? lista.find(v => String(v.id) === n) : null; if (x && x.telefone) return x.telefone;
      const c = A() && A().comp().vereadores.find(v => v.id === id); if (c && c.telefone) return c.telefone;
      if (c && c.usuario && typeof lgUsers === 'function') { const u = lgUsers().find(u => String(u.usuario).toLowerCase() === c.usuario.toLowerCase()); if (u && (u.telefone || u.celular)) return u.telefone || u.celular; }
      return '';
    }
    if (typeof lgUsers === 'function') { const u = lgUsers().find(u => String(u.usuario).toLowerCase() === String(id).toLowerCase()); if (u) return u.telefone || u.celular || ''; }
    return '';
  }
  window.lgavTelefone = telefoneDe;
  window.lgavLinkWhats = function (id, msg) {
    let n = String(telefoneDe(id) || '').replace(/\D/g, ''); if (n && n.length <= 11) n = '55' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
  };
  // depois de cada mudança na tramitação: tarefas novas que passaram para outras pessoas
  let foto = null;
  function destinatarios(dest) {
    const c = A().comp(); const out = [];
    dest.forEach(d => {
      if (d.startsWith('v:')) { const v = c.vereadores.find(x => x.id === d.slice(2)); if (v) out.push({ id: v.id, nome: v.nome }); }
      else if (d === 'pres') { const v = c.vereadores.find(x => x.id === c.presidente); if (v) out.push({ id: v.id, nome: v.nome + ' (Presidente)' }); }
      else if (d.startsWith('perfil:') && typeof lgUsers === 'function') lgUsers().filter(u => u.ativo !== false && window.lgPerfil && lgPerfil(u) === d.slice(7)).forEach(u => out.push({ id: u.usuario, nome: u.nome + ' (' + (u.cargo || d.slice(7)) + ')' }));
    });
    return out;
  }
  function tirarFoto() { const s = new Set(); try { todas().forEach(x => x.info || x.dest.forEach(d => s.add(d + '|' + x.chave))); } catch (e) { } return s; }
  function depoisDeSalvar() {
    if (!A() || !usuario()) return; const antes = foto; foto = tirarFoto(); if (!antes) return;
    const me = eu(); const novos = [];
    todas().forEach(x => { if (x.info) return; x.dest.forEach(d => { if (!antes.has(d + '|' + x.chave) && !meuDestino(d, me)) destinatarios([d]).forEach(r => novos.push({ ...r, titulo: x.titulo, texto: x.texto })); }); });
    if (novos.length) oferecerWhats(novos.slice(0, 5));
    window.lgavAtualizar();
  }
  function oferecerWhats(l) {
    let el = $('#lgav-whats'); if (!el) { el = document.createElement('div'); el.id = 'lgav-whats'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    const msg = x => `Olá, ${x.nome.split(' (')[0]}. Há uma tarefa para você no LegislaGov (Câmara Municipal de Neves Paulista):\n*${x.titulo}*${x.texto ? '\n' + String(x.texto).slice(0, 160) : ''}\n\nAcesse o sistema para ver os detalhes.`;
    el.innerHTML = `<div class="lgav-w-cab"><b>${ic('whats')} Avisar pelo WhatsApp?</b><button type="button" class="lgav-x" aria-label="Fechar" onclick="this.closest('#lgav-whats').classList.remove('open')">×</button></div><p>A tarefa já aparece no sino de quem recebe. Se quiser, avise também pelo WhatsApp:</p>
      <ul>${l.map(x => `<li><span><b>${esc(x.nome)}</b><small>${esc(x.titulo)}</small></span><a class="lgt-mini" href="${esc(lgavLinkWhats(x.id, msg(x)))}" target="_blank" rel="noopener">${ic('whats')} Avisar</a></li>`).join('')}</ul>`;
    el.classList.add('open'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('open'), 25000);
  }
  window.lgavOferecerWhats = oferecerWhats;
  function ganchoSalvar() {
    const f = window.salvarProtocolos; if (typeof f !== 'function' || f.__lgav) return;
    let t = 0; const w = function (...a) { const r = f.apply(this, a); clearTimeout(t); t = setTimeout(depoisDeSalvar, 250); return r; }; w.__lgav = true; window.salvarProtocolos = w;
  }

  /* ================= busca única ================= */
  function fontesBusca(q) {
    const n = norm(q); if (n.length < 2) return [];
    const tem = (...s) => norm(s.join(' ')).includes(n); const grupos = [];
    const permit = window.lgtAreasPermitidas ? lgtAreasPermitidas() : [];
    const mats = listaProt().filter(p => p.status !== 'enviado' && tem(p.numero, p.full, p.ementa, p.autor, p.tipoNome, p.lei)).slice(0, 8).map(p => ({ t: `${p.numero || p.full}${p.lei ? ' · ' + p.lei : ''}`, s: p.ementa, f: permit.includes('vereador') ? `lgvrAbrir('materias');setTimeout(()=>lgvrVer('${p.id}'),80)` : permit.includes('legislativo') ? `abrirDetalheCam('${p.id}')` : `lgvrMateriasConsulta();setTimeout(()=>lgvrVer('${p.id}'),80)`, area: permit.includes('vereador') ? 'vereador' : permit.includes('legislativo') ? 'legislativo' : '' }));
    if (mats.length) grupos.push(['Matérias', mats]);
    try { const leis = (window.lgfxLeis ? lgfxLeis() : []).filter(l => tem(l.titulo, l.ementa, l.texto)).slice(0, 6).map(l => { const i = norm(l.texto || '').indexOf(n); return { t: l.titulo, s: i > 0 ? '…' + String(l.texto).slice(Math.max(0, i - 40), i + 80) + '…' : l.ementa, f: permit.includes('legislativo') ? `lgfxAbrir('livro','${l.id}')` : `window.open('../leis.html?id=${encodeURIComponent(l.id)}','_blank')`, area: permit.includes('legislativo') ? 'legislativo' : '' }; }); if (leis.length) grupos.push(['Leis e normas', leis]); } catch (e) { }
    if (A()) { const vs = A().comp().vereadores.filter(v => tem(v.nome, v.completo, v.partido)).map(v => ({ t: v.nome, s: `${v.completo} · ${v.partido}${v.id === A().comp().presidente ? ' · Presidente da Câmara' : ''}`, f: `window.open('../vereador.html?id=${v.id.slice(1)}','_blank')` })); if (vs.length) grupos.push(['Vereadores', vs]); }
    try { if (window.lgplDados) { const ss = lgplDados().sessoes.filter(s => tem(s.titulo, dBR(s.quando))).slice(0, 5).map(s => ({ t: s.titulo, s: `${dBR(s.quando)} · ${s.status}`, f: permit.includes('legislativo') ? `lgplAbrir('adm','${s.id}')` : `lgvrAbrir('sessoes')`, area: permit.includes('legislativo') ? 'legislativo' : 'vereador' })); if (ss.length) grupos.push(['Sessões', ss]); } } catch (e) { }
    try { if (typeof transpLer === 'function') { const ts = transpLer().filter(i => i.publicado !== false && tem(i.titulo, i.descricao, i.numero)).slice(0, 5).map(i => ({ t: i.titulo, s: `${i.sub || ''} · ${i.data ? dBR(i.data + 'T12:00') : ''}`, f: permit.includes('transparencia') ? `lgtAbrir('transp')` : `window.open('../transparencia.html?c=${i.cat}','_blank')`, area: permit.includes('transparencia') ? 'transparencia' : '' })); if (ts.length) grupos.push(['Portal da Transparência', ts]); } } catch (e) { }
    try { const ns = ler('lgt_site_noticias_v1', []).filter(x => tem(x.titulo, x.resumo)).slice(0, 4).map(x => ({ t: x.titulo, s: 'Notícia do site', f: permit.includes('site') ? `lgtAbrir('noticias')` : `window.open('../noticias.html','_blank')`, area: permit.includes('site') ? 'site' : '' })); if (ns.length) grupos.push(['Notícias', ns]); } catch (e) { }
    try { const fn = []; const AR = window.LG_AREAS || {}; permit.forEach(k => (AR[k]?.menu || []).forEach(([g, its]) => its.forEach(([key, label, , f, flag]) => { if (f && tem(label, g) && !fn.some(x => x.key === key)) fn.push({ key, t: label, s: `${AR[k].nome} › ${g}`, f: `lgv31Go('${key}')`, area: k }); }))); if (fn.length) grupos.push(['Funções do sistema', fn.slice(0, 8)]); } catch (e) { }
    return grupos;
  }
  let resBusca = [];
  window.lgavBusca = function (q) {
    let el = $('#lgav-busca');
    if (!el) { el = document.createElement('div'); el.id = 'lgav-busca'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Buscar no sistema');
      el.innerHTML = `<div class="lgav-b-caixa"><div class="lgav-b-campo">${ic('busca')}<input id="lgav-b-q" type="search" placeholder="Buscar matérias, leis, vereadores, sessões, funções…" autocomplete="off" aria-controls="lgav-b-res"><kbd>Esc</kbd></div><div id="lgav-b-res" class="lgav-b-res" role="listbox"></div></div>`;
      document.body.appendChild(el);
      el.addEventListener('pointerdown', e => { if (e.target === el) fecharBusca(); });
      const inp = $('#lgav-b-q');
      inp.addEventListener('input', () => desenharBusca(inp.value));
      inp.addEventListener('keydown', e => { const its = [...el.querySelectorAll('.lgav-b-it')]; let i = its.findIndex(x => x.classList.contains('sel'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); its[i]?.classList.remove('sel'); i = e.key === 'ArrowDown' ? Math.min(its.length - 1, i + 1) : Math.max(0, i - 1); its[i]?.classList.add('sel'); its[i]?.scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'Enter') { e.preventDefault(); (its[i] || its[0])?.click(); }
        else if (e.key === 'Escape') { e.stopPropagation(); fecharBusca(); } });
    }
    el.classList.add('open'); document.documentElement.classList.add('lgav-b-aberta');
    const inp = $('#lgav-b-q'); inp.value = q || ''; desenharBusca(inp.value); setTimeout(() => inp.focus(), 20);
  };
  function fecharBusca() { $('#lgav-busca')?.classList.remove('open'); document.documentElement.classList.remove('lgav-b-aberta'); }
  function desenharBusca(q) {
    const box = $('#lgav-b-res'); const g = fontesBusca(q); resBusca = g.flatMap(([, l]) => l); let k = -1;
    box.innerHTML = !q || q.trim().length < 2 ? '<p class="lgav-b-dica">Digite ao menos 2 letras. Dica: Ctrl+K abre a busca de qualquer tela.</p>' : g.length ? g.map(([n, l]) => `<div class="lgav-b-g"><h4>${esc(n)}</h4>${l.map(x => { k++; return `<button type="button" role="option" class="lgav-b-it ${k === 0 ? 'sel' : ''}" onclick="lgavBuscaIr(${k})"><b>${esc(x.t)}</b><small>${esc(String(x.s || '').slice(0, 150))}</small></button>`; }).join('')}</div>`).join('') : `<p class="lgav-b-dica">Nada encontrado para “${esc(q)}”.</p>`;
  }
  window.lgavBuscaIr = function (i) { const x = resBusca[i]; if (!x) return; fecharBusca(); executar({ acao: x.f, area: x.area }); };
  function ganchoBusca() {
    const se = document.querySelector('.lg28-search'); const inp = se && se.querySelector('input');
    if (inp && !inp.__lgav) { inp.__lgav = true; inp.readOnly = true; inp.placeholder = 'Buscar no sistema…'; inp.addEventListener('focus', () => { inp.blur(); lgavBusca(''); }); se.addEventListener('click', () => lgavBusca('')); }
    window.lg28Search = () => lgavBusca('');
    const tools = document.getElementById('lgv31-tools');
    if (tools && !document.getElementById('lgav-busca-btn')) { const b = document.createElement('button'); b.type = 'button'; b.id = 'lgav-busca-btn'; b.className = 'lgv31-tool'; b.title = 'Buscar (Ctrl+K)'; b.setAttribute('aria-label', 'Buscar no sistema'); b.innerHTML = ic('busca') + '<span class="lgv31-lbl">Buscar</span>'; b.onclick = () => lgavBusca(''); tools.insertBefore(b, tools.firstChild); }
    // botão "Avisos" do topo passa a abrir o sino de pendências
    const av = tools && [...tools.querySelectorAll('button')].find(b => /notifications/.test(b.getAttribute('onclick') || ''));
    if (av && !av.__lgav) { av.__lgav = true; av.setAttribute('onclick', ''); av.onclick = e => { e.stopPropagation(); lgavAbrir(); }; av.title = 'Avisos e pendências'; }
  }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && usuario()) { e.preventDefault(); lgavBusca(''); }
    if (e.key === 'Escape') { if ($('#lgav-busca')?.classList.contains('open')) fecharBusca(); $('#lgav-sino')?.classList.remove('open'); }
  });
  document.addEventListener('pointerdown', e => { const s = $('#lgav-sino'); if (s && s.classList.contains('open') && !s.contains(e.target) && !e.target.closest('#lgv31-tools')) s.classList.remove('open'); });

  /* ================= aparência: texto muito maior e alto contraste ================= */
  function ganchoAparencia() {
    const pop = document.getElementById('lgv31-pop'); if (!pop || pop.querySelector('.lgav-contraste')) return;
    const fonts = pop.querySelector('.lgv31-fonts');
    if (fonts && !fonts.querySelector('[data-font="muito"]')) fonts.insertAdjacentHTML('beforeend', '<button type="button" data-font="muito" onclick="lgv31SetFont(\'muito\')" aria-pressed="false" style="font-size:16px">Bem maior</button>');
    pop.insertAdjacentHTML('beforeend', `<div class="lgv31-fonts lgav-contraste" role="group" aria-label="Contraste"><button type="button" data-ct="normal" onclick="lgavContraste('normal')">Contraste normal</button><button type="button" data-ct="alto" onclick="lgavContraste('alto')">Alto contraste</button></div>`);
    const sf = window.lgv31SetFont;
    if (sf && !sf.__lgav) { const w = function (f) { if (f === 'muito') { document.documentElement.setAttribute('data-lgv31-font', 'muito'); try { localStorage.setItem('lgv31_font', 'muito'); } catch (e) { } document.querySelectorAll('.lgv31-fonts button[data-font]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.font === 'muito'))); return; } return sf(f); }; w.__lgav = true; window.lgv31SetFont = w; }
    let f = ''; try { f = localStorage.getItem('lgv31_font'); } catch (e) { } if (f === 'muito') lgv31SetFont('muito');
    let c = 'normal'; try { c = localStorage.getItem('lg_contraste') || 'normal'; } catch (e) { } lgavContraste(c);
  }
  window.lgavContraste = function (c) {
    c = c === 'alto' ? 'alto' : 'normal'; document.documentElement.setAttribute('data-lg-contraste', c); try { localStorage.setItem('lg_contraste', c); } catch (e) { }
    document.querySelectorAll('.lgav-contraste button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ct === c)));
  };

  /* ================= início do Administrativo e da Transparência: cartão de pendências ================= */
  function ganchoInicio() {
    const f = window.lgv14Inicio; if (typeof f !== 'function' || f.__lgav) return;
    const w = function (...a) { const r = f.apply(this, a); setTimeout(() => { const h = document.getElementById('view-lgv14-inicio'); if (!h) return; h.querySelector('.lgav-card')?.remove(); const html = lgavCardPendencias(); if (html) { const lh = h.querySelector('.letterhead, .lg27-hero, h1'); const box = document.createElement('div'); box.innerHTML = html; (lh && lh.parentNode === h ? lh : h.firstElementChild)?.after(box.firstElementChild); } }, 30); return r; };
    w.__lgav = true; window.lgv14Inicio = w;
  }

  /* ================= estilos ================= */
  const css = document.createElement('style'); css.id = 'lgav-style'; css.textContent = `
  #lgav-sino{display:none;position:fixed;z-index:10065;top:62px;right:14px;width:min(420px,calc(100vw - 20px));max-height:min(78vh,680px);background:var(--lg28-panel,#141820);color:var(--lg28-ink,#f1f4fa);border:1px solid var(--lg28-stroke,#3a4556);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.4);flex-direction:column;overflow:hidden}
  #lgav-sino.open{display:flex}
  .lgav-cab{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 8px}.lgav-cab b{display:inline-flex;align-items:center;gap:8px;font-size:16px}.lgav-cab .lgv31-ic{width:18px;height:18px}
  .lgav-x{width:32px;height:32px;border-radius:8px;border:1px solid var(--lg28-stroke);background:transparent;color:inherit;font-size:20px;cursor:pointer}
  .lgav-abas{display:flex;gap:6px;padding:0 12px 8px;border-bottom:1px solid var(--lg28-stroke)}.lgav-abas button{flex:1;height:36px;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--lg28-muted);font:600 13px var(--v32-font,inherit);cursor:pointer;position:relative}
  .lgav-abas button[aria-selected=true]{background:var(--lg28-inset);border-color:var(--lg28-stroke);color:var(--lg28-ink)}.lgav-abas b{margin-left:4px}.lgav-abas i{position:absolute;top:7px;right:10px;width:7px;height:7px;border-radius:50%;background:#e5484d}
  .lgav-lista{list-style:none;margin:0;padding:6px;overflow:auto;flex:1}.lgav-lista li button{width:100%;text-align:left;display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:10px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
  .lgav-lista li button:hover,.lgav-lista li button:focus-visible{background:var(--lg28-inset);outline:none}.lgav-lista li:not(.lido) button b::before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:#e2aa1c;margin-right:7px;vertical-align:middle}
  .lgav-lista li.urg:not(.lido) button b::before{background:#e5484d}.lgav-lista b{font-size:13.5px}.lgav-lista small{color:var(--lg28-muted);font-size:12.5px}.lgav-lista li.lido{opacity:.7}
  .lgav-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.lgav-meta i{font-style:normal;font-size:11.5px;color:var(--lg28-muted)}
  .lgav-vazio{padding:22px 12px;text-align:center;color:var(--lg28-muted);font-size:13.5px;list-style:none}
  .lgav-rod{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--lg28-stroke);flex-wrap:wrap}.lgav-rod button{flex:1;min-height:34px;border-radius:8px;border:1px solid var(--lg28-stroke);background:transparent;color:var(--lg28-ink);font:600 12.5px var(--v32-font,inherit);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 8px}
  .lgav-rod .lgv31-ic{width:14px;height:14px}
  .lgav-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap}.lgav-chip .lgv31-ic{width:13px;height:13px;flex-basis:13px}
  .lgav-chip.c-verde{background:rgba(47,191,113,.14);color:#2fbf71}.lgav-chip.c-amarelo{background:rgba(226,170,28,.16);color:#d99e12}.lgav-chip.c-vermelho{background:rgba(229,72,77,.15);color:#e5484d}.lgav-chip.c-info{background:var(--lg28-inset);color:var(--lg28-muted)}
  .lgav-card{margin-bottom:14px}.lgav-card h3{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.lgav-num{min-width:24px;height:24px;border-radius:12px;background:#e2aa1c;color:#111;font-size:12.5px;display:inline-flex;align-items:center;justify-content:center;padding:0 7px}
  .lgav-pend{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:6px}.lgav-pend li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--lg28-stroke);flex-wrap:wrap}.lgav-pend li.urg{border-color:rgba(229,72,77,.6)}
  .lgav-pend li > div{flex:1;min-width:200px}.lgav-pend b{display:block;font-size:14px}.lgav-pend small{display:block;color:var(--lg28-muted);font-size:12.5px;margin-top:2px}
  .lgav-leg{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}.lgav-leg small{color:var(--lg28-muted);font-size:12.5px}
  .lgav-hist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.lgav-hist li{display:grid;grid-template-columns:90px 1fr;gap:2px 12px;font-size:13.5px}.lgav-hist li span{grid-row:span 2;color:var(--lg28-muted);font-size:12px}.lgav-hist small{color:var(--lg28-muted)}
  .lgav-cfg{margin-top:14px}.lgav-cfg summary{cursor:pointer;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.lgav-cfg summary small{color:var(--lg28-muted)}.lgav-n{width:70px;height:32px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:0 8px}
  .lgav-cfg select{padding:0 8px!important;line-height:1.2!important;height:32px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink)}
  #lgav-whats{display:none;position:fixed;z-index:10066;right:16px;bottom:16px;width:min(400px,calc(100vw - 24px));background:var(--lg28-panel,#141820);color:var(--lg28-ink,#f1f4fa);border:1px solid #2fbf71;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.4);padding:12px 14px}
  #lgav-whats.open{display:block}#lgav-whats p{margin:4px 0 8px;font-size:12.5px;color:var(--lg28-muted)}.lgav-w-cab{display:flex;justify-content:space-between;align-items:center}.lgav-w-cab b{display:inline-flex;gap:8px;align-items:center}.lgav-w-cab .lgv31-ic{width:18px;height:18px;color:#2fbf71}
  #lgav-whats ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}#lgav-whats li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px;border-radius:10px;background:var(--lg28-inset)}#lgav-whats li b{display:block;font-size:13px}#lgav-whats li small{font-size:12px;color:var(--lg28-muted)}#lgav-whats a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;white-space:nowrap}
  #lgav-busca{display:none;position:fixed;inset:0;z-index:10075;background:rgba(0,0,0,.55);align-items:flex-start;justify-content:center;padding:10vh 12px 12px}#lgav-busca.open{display:flex}html.lgav-b-aberta{overflow:hidden}
  .lgav-b-caixa{width:min(680px,100%);max-height:75vh;display:flex;flex-direction:column;background:var(--lg28-panel,#141820);color:var(--lg28-ink,#f1f4fa);border:1px solid var(--lg28-stroke);border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
  .lgav-b-campo{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--lg28-stroke)}.lgav-b-campo .lgv31-ic{width:20px;height:20px;color:var(--lg28-muted)}.lgav-b-campo input{flex:1;min-width:0;height:36px;border:0;background:transparent;color:inherit;font:500 16px var(--v32-font,inherit);outline:none}
  .lgav-b-campo kbd{font-size:11px;padding:2px 6px;border-radius:5px;border:1px solid var(--lg28-stroke);color:var(--lg28-muted)}
  .lgav-b-res{overflow:auto;padding:6px 8px 10px}.lgav-b-g h4{margin:10px 8px 4px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--lg28-muted)}
  .lgav-b-it{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:9px 10px;border-radius:9px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.lgav-b-it.sel,.lgav-b-it:hover{background:var(--lg28-inset)}.lgav-b-it b{font-size:14px}.lgav-b-it small{font-size:12.5px;color:var(--lg28-muted)}
  .lgav-b-dica{padding:18px 12px;color:var(--lg28-muted);font-size:13.5px;margin:0}
  .lgav-contraste{margin-top:10px}
  @media(min-width:1181px){#lgav-busca-btn{display:none!important}}
  html[data-lgv31-font="muito"] body{zoom:1.25}
  html[data-lg-contraste="alto"]{--lg28-ink:#fff;--lg28-text:#fff;--lg28-muted:#f2f2f2;--lg28-stroke:#ffffff;--lg28-panel:#000;--lg28-inset:#000;--lg28-bg:#000;--lg28-side:#000;--lg28-head:#000;--lg28-softcard:#000}
  html[data-lg-contraste="alto"] :is(body,#app,main,aside,.sidebar,.lg28-topbar,.view,.lgt-card,.card,.letterhead,.lgt-tabela,.lgt-tabela th,.lgt-tabela td,#lgav-sino,#lgv31-pop,.lgt-modal-caixa,.lgt-form){background:#000!important;color:#fff!important}
  html[data-lg-contraste="alto"] :is(p,small,span,label,td,th,li,h1,h2,h3,h4,.date,.lgt-p,.lgvr-sub){color:#fff!important}
  html[data-lg-contraste="alto"] :is(button,.lgt-btn,.lgt-mini,input,select,textarea,.lgt-card,.lgv31-item){border:1px solid #fff!important}
  html[data-lg-contraste="alto"] :is(.lgt-btn.primario,.lgt-mini.primario,.lgv31-item.active){background:#ffd400!important;color:#000!important;border-color:#ffd400!important}
  html[data-lg-contraste="alto"] :is(.lgt-btn.primario,.lgt-mini.primario,.lgv31-item.active) *{color:#000!important}
  html[data-lg-contraste="alto"] a{color:#ffd400!important;text-decoration:underline!important}
  html[data-lg-contraste="alto"] :focus-visible{outline:3px solid #ffd400!important;outline-offset:2px}
  @media(max-width:600px){#lgav-sino{top:56px;right:6px;left:6px;width:auto}}`;
  document.head.appendChild(css);

  /* ================= início ================= */
  function iniciar() {
    if (!A()) return setTimeout(iniciar, 200);
    ganchoSalvar(); ganchoBusca(); ganchoAparencia(); ganchoInicio();
    foto = tirarFoto(); marcarEtapas(); atualizarNovidades(); sincronizarBadge();
    setInterval(() => { if (usuario()) { ganchoBusca(); sincronizarBadge(); } }, 4000);
    addEventListener('storage', e => { if (/^(legislagov_protocolos|lgpl_v1|lgvr_v1|lgo_v1)/.test(e.key || '')) window.lgavAtualizar(); });
    const io = window.iniciarSessao; if (typeof io === 'function' && !io.__lgav) { const w = function (...a) { const r = io.apply(this, a); setTimeout(() => { foto = tirarFoto(); window.lgavAtualizar(); ganchoBusca(); }, 600); return r; }; w.__lgav = true; window.iniciarSessao = w; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 300)); else setTimeout(iniciar, 300);
})();
