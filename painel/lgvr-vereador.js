/* =====================================================================
   LegislaGov — PORTAL DO VEREADOR + PRESIDÊNCIA + composição da Câmara
   · Procuradoria/Administrador (Usuários): define quais usuários são vereadores e marca o Presidente
     (uma única opção; trocar = desmarcar um e marcar outro; fica no histórico).
   · Vereador: cria proposituras, assina com gov.br, protocola sem passar pela Secretaria e acompanha o andamento.
   · Presidente: despacha proposições (Procuradoria, comissões, Ordem do Dia, devolução), registra votação,
     assina autógrafos, promulga resoluções/decretos legislativos e leis (sanção tácita/veto rejeitado) e
     assina atos da Presidência. As proposituras entram na mesma tramitação do Painel Administrativo.
   Assinatura: o sistema gera o PDF, a pessoa assina no assinador gratuito do gov.br (ou com certificado
   ICP-Brasil) e devolve; a conferência fica em lgs-assinatura.js. Integração direta (API gov.br/PSC) fica para a fase com servidor.
   ===================================================================== */
(function () {
  const COMP_KEY = 'lgv_camara_v1', KEY = 'lgvr_v1';
  const UI = () => window.lgtUI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const usuario = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const loginDe = u => String((u && (u.email || u.usuario)) || '').toLowerCase();
  const pad = n => String(n).padStart(2, '0');
  const agoraTL = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hojeBR = () => new Date().toLocaleDateString('pt-BR');
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { UI().aviso('Espaço do navegador esgotado.', 'erro'); return false; } };

  const COMISSOES = ['Justiça e Redação', 'Finanças e Orçamento', 'Assuntos Gerais'];
  const TIPOS = {
    PL: { nome: 'Projeto de Lei', desc: 'Cria ou altera lei municipal. Passa pela Procuradoria e comissões; aprovado, vai à sanção do Prefeito.', fluxo: 'sancao' },
    PR: { nome: 'Projeto de Resolução', desc: 'Assuntos internos da Câmara. Aprovado, é promulgado pelo Presidente.', fluxo: 'promulga', ato: 'Resolução' },
    PDL: { nome: 'Projeto de Decreto Legislativo', desc: 'Competência exclusiva da Câmara com efeito externo (ex.: título de cidadão). Promulgado pelo Presidente.', fluxo: 'promulga', ato: 'Decreto Legislativo' },
    IND: { nome: 'Indicação', desc: 'Sugere ao Prefeito uma providência (ex.: reparo de rua, iluminação, poda).', fluxo: 'simples' },
    REQ: { nome: 'Requerimento', desc: 'Pede informações ou providências a órgãos públicos.', fluxo: 'simples' },
    MOC: { nome: 'Moção', desc: 'Manifestação de aplauso, apoio, pesar ou repúdio.', fluxo: 'simples' },
  };
  const tipoDe = p => p.tipo || (/^PL/.test(p.numero || '') ? 'PL' : 'PL');
  const VEREADORES_PADRAO = [
    [56, 'Edenilson Roselli', 'Edenilson Alexandre Roselli', 'Republicanos', 'roselli'], [52, 'Evertinho', 'Everton Fermiano da Silva', 'PSD', 'everton'],
    [48, 'Maikon Piau', 'Maikon Reche de Oliveira', 'MDB', 'maikon'], [41, 'Emerson Rodrigues', 'Emerson Rodrigues Ferreira', 'Republicanos', 'emerson'],
    [16, 'Luis Pelacani', 'Luis Antonio Pelacani', 'Republicanos', 'pelacani'], [26, 'Pastelão', 'Marcio José Baia', 'Republicanos', 'marcio'],
    [32, 'Sirlei Protetora', 'Sirlei Maria da Costa', 'PSD', 'sirlei'], [44, 'Lucão', 'Lucas Vieira', 'MDB', 'lucas'], [60, 'Tonho Cabeludo', 'Antonio Bento Bezerra', 'Podemos', 'tonho'],
  ];

  /* Comissões permanentes de Neves Paulista (camaranevespaulista.sp.gov.br/Composicao/Comissoes) — mandato 01/01/2025 a 31/12/2026 */
  const COMISSOES_PADRAO = [
    { nome: 'Justiça e Redação', eleicao: '06/01/2025', presidente: 'v16', vice: 'v26', relator: 'v44', area: 'Constitucionalidade, legalidade, competência do Município, iniciativa correta, técnica legislativa e redação.' },
    { nome: 'Finanças e Orçamento', eleicao: '06/02/2025', presidente: 'v41', vice: 'v44', relator: 'v32', area: 'Impacto nas receitas e despesas, adequação orçamentária, créditos, renúncia de receita e responsabilidade fiscal.' },
    { nome: 'Assuntos Gerais', eleicao: '06/02/2025', presidente: 'v26', vice: 'v41', relator: 'v60', area: 'Demais assuntos de interesse do Município: obras, serviços, saúde, educação, assistência, meio ambiente.' },
  ];
  /* ================= composição da Câmara (vereadores + Presidente + comissões) ================= */
  function comp() {
    let c = ler(COMP_KEY, null);
    if (!c || !Array.isArray(c.vereadores)) {
      c = { vereadores: VEREADORES_PADRAO.map(([id, nome, completo, partido, sug]) => ({ id: 'v' + id, nome, completo, partido, sugestao: sug, usuario: '' })), presidente: 'v56', historico: [{ data: new Date().toISOString(), texto: 'Presidente inicial: Edenilson Roselli (Mesa 2025–2026)', por: 'Sistema' }] };
      gravar(COMP_KEY, c);
    }
    if (!c.vereadores.some(v => v.id === c.presidente)) { const de = c.presidente; c.presidente = c.vereadores.some(v => v.id === 'v56') ? 'v56' : (c.vereadores[0] || {}).id; c.historico = c.historico || []; c.historico.push({ data: new Date().toISOString(), texto: `Presidente “${de || '—'}” não existe mais na composição; voltou para ${(c.vereadores.find(v => v.id === c.presidente) || {}).nome || '—'}.`, por: 'Sistema' }); gravar(COMP_KEY, c); }
    if (!Array.isArray(c.comissoes)) { c.comissoes = COMISSOES_PADRAO.map(x => ({ ...x })); c.historico = c.historico || []; c.historico.push({ data: new Date().toISOString(), texto: 'Comissões permanentes 2025–2026 carregadas conforme o site da Câmara', por: 'Sistema' }); gravar(COMP_KEY, c); }
    return c;
  }
  const verPorId = id => comp().vereadores.find(v => v.id === id);
  function vereadorDoUsuario(u) { const l = loginDe(u); if (!l) return null; return comp().vereadores.find(v => v.usuario && v.usuario.toLowerCase() === l) || null; }
  function ehGestor(u) { u = u || usuario(); if (!u) return false; const p = window.lgPerfil ? lgPerfil(u) : (u.orgao === 'ambos' ? 'adm' : ''); return p === 'adm' || p === 'procurador'; }
  window.lgVereadorDoUsuario = vereadorDoUsuario;
  window.lgEhPresidente = u => { const v = vereadorDoUsuario(u || usuario()); return !!v && v.id === comp().presidente; };
  window.lgEhGestor = () => ehGestor();

  /* Quem está usando o portal: o vereador vinculado ao usuário; para gestores/administrador, um vereador escolhido para demonstração */
  function atual() {
    const u = usuario(); if (!u) return null;
    const v = vereadorDoUsuario(u); if (v) return { v, demo: false };
    if (!window.lgNivelArea || lgNivelArea('vereador') === 'nenhum') return null;
    let id = ''; try { id = sessionStorage.getItem('lgvr_como') || ''; } catch (e) { }
    const c = comp(); const alvo = c.vereadores.find(x => x.id === id) || c.vereadores.find(x => x.id === c.presidente) || c.vereadores[0];
    return alvo ? { v: alvo, demo: true } : null;
  }
  window.lgvrPresidenteAtual = () => { const a = atual(); return !!a && a.v.id === comp().presidente; };
  const podeEditar = () => (window.lgNivelArea ? lgNivelArea('vereador') : 'nenhum') === 'edicao';

  /* ================= dados do portal (rascunhos e atos) ================= */
  function dados() { const d = ler(KEY, null) || {}; d.rascunhos = d.rascunhos || []; d.atos = d.atos || []; d.seqAutografo = d.seqAutografo || 0; return d; }
  const salvarDados = d => gravar(KEY, d);
  const listaProt = () => { try { return protocolos; } catch (e) { return []; } };
  function persistirProt(evento, p) {
    try { if (typeof sincronizarProtocolo === 'function' && p) sincronizarProtocolo(p, evento); else if (typeof salvarProtocolos === 'function') salvarProtocolos(); } catch (e) { }
    try { if (typeof renderAll === 'function') renderAll(); } catch (e) { }
    publicarTransparencia();
  }
  function proximoNumero(sigla, ano) { const re = new RegExp('^' + sigla + ' (\\d+)/' + ano); let n = 0; listaProt().forEach(p => { const m = re.exec(p.numero || ''); if (m) n = Math.max(n, +m[1]); }); return String(n + 1).padStart(3, '0'); }
  const statusTxt = p => ({ protocolado: 'Aguardando despacho do Presidente', enviado: 'Aguardando recebimento', analise: 'Parecer da Procuradoria', comissao: 'Em comissão' + (p.comissao ? ' · ' + p.comissao : ''), votacao: p.resultado === 'aprovado' ? (tipoDe(p) === 'PL' ? 'Aprovado · aguardando autógrafo' : 'Aprovado · aguardando promulgação') : 'Na Ordem do Dia', aguardando_exec: 'Com o Prefeito (sanção)', devolvido: 'Devolvido ao autor', rejeitado: 'Rejeitado', concluido: p.lei ? p.lei : 'Concluído' })[p.status] || p.status;
  const statusCls = p => ({ protocolado: 'av', analise: 'an', comissao: 'an', votacao: p.resultado === 'aprovado' ? 'ok' : 'vo', aguardando_exec: 'av', devolvido: 'er', rejeitado: 'er', concluido: 'ok' })[p.status] || '';
  const tag = p => `<span class="lgvr-tag t-${statusCls(p)}">${esc(statusTxt(p))}</span>`;
  const ehMinha = (p, v) => p.autorId === v.id || (p.coautores || []).includes(v.id);

  /* ajustes no Painel Administrativo: novo status e o tipo correto na lista de matérias */
  function integrarAdministrativo() {
    try { if (typeof statusMeta === 'object' && !statusMeta.protocolado) statusMeta.protocolado = { tag: 'tag-analise', labelExec: 'Protocolado na Câmara', labelCam: 'Aguardando despacho do Presidente' }; } catch (e) { }
    const dr = window.docketRow;
    if (typeof dr === 'function' && !dr.__lgvr) { const w = function (p, ...r) { const h = dr.call(this, p, ...r); return p && p.tipoNome ? h.replace('Projeto de Lei ·', esc(p.tipoNome) + ' ·') : h; }; w.__lgvr = true; window.docketRow = w; }
  }

  /* ================= assinatura gov.br (demonstração) ================= */
  async function sha256(txt) {
    try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    catch (e) { let h = 0; for (const c of txt) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'demo' + h.toString(16).padStart(8, '0'); }
  }
  function assinarGovBr(titulo, conteudo, signatario, aoAssinar) {
    UI().abrirModal(`<div class="lgt-form lgvr-gov"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Assinar com gov.br</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgvr-gov-c" id="lgvr-gov-c">
        <div class="lgvr-doc"><span>${ic('editor')}</span><div><b>${esc(titulo)}</b><small>Assinante: ${esc(signatario.completo || signatario.nome)}</small></div></div>
        <ol class="lgvr-passos"><li>Você entra na sua conta gov.br (nível <b>prata ou ouro</b>).</li><li>Autoriza a assinatura com o código enviado ao aplicativo gov.br.</li><li>O documento recebe assinatura eletrônica avançada (Lei 14.063/2020) e é protocolado.</li></ol>
        <p class="lgvr-demo">Demonstração: a conexão real com o gov.br será ativada depois do credenciamento da Câmara no ITI. Aqui, qualquer código de 6 dígitos confirma.</p>
      </div>
      <p class="lgt-erro" role="alert"></p>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="button" class="lgt-btn primario" id="lgvr-gov-ir">Continuar para o gov.br</button></div></div>`);
    $('#lgvr-gov-ir').onclick = () => {
      $('#lgvr-gov-c').innerHTML = `<label class="lgvr-codigo"><span>Código de autorização (6 dígitos)</span><input id="lgvr-cod" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"></label><p class="lgt-p">Confirme no aplicativo gov.br do celular e digite o código.</p>`;
      const b = $('#lgvr-gov-ir'); b.textContent = 'Assinar documento'; setTimeout(() => $('#lgvr-cod')?.focus(), 30);
      b.onclick = async () => {
        const c = ($('#lgvr-cod').value || '').replace(/\D/g, ''); if (c.length !== 6) { $('.lgvr-gov .lgt-erro').textContent = 'Digite os 6 dígitos do código.'; return; }
        b.disabled = true; b.textContent = 'Assinando…';
        const hash = await sha256(conteudo + '|' + signatario.id + '|' + Date.now());
        const ass = { vereadorId: signatario.id, nome: signatario.completo || signatario.nome, data: new Date().toISOString(), hash, metodo: 'gov.br (demonstração)', por: (usuario() || {}).nome || '' };
        UI().fecharModal(); aoAssinar(ass);
      };
    };
  }

  /* assinatura real: baixar PDF → assinar no gov.br / ICP-Brasil → devolver (lgs-assinatura.js) */
  const cargoDe = v => (v.id === comp().presidente ? 'Presidente da Câmara Municipal' : 'Vereador(a)');
  function assinarDoc(cfg, signatario, aoAssinar) {
    if (!window.lgsAssinar) return assinarGovBr(cfg.titulo, JSON.stringify(cfg.doc || {}), signatario, aoAssinar);
    const u = usuario(); const a = atual();
    lgsAssinar({ titulo: cfg.titulo, arquivo: cfg.arquivo, docId: cfg.docId, base: cfg.base || null, qualificada: !!cfg.qualificada, signatario,
      simular: ehGestor(u) || !!(a && a.demo),
      gerar: codigo => lgsDocumento({ ...cfg.doc, codigo, signatarios: cfg.signatarios || [{ nome: signatario.completo || signatario.nome, cargo: cargoDe(signatario) }] }) }, aoAssinar);
  }
  const arq = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) + '.pdf';

  /* ================= telas ================= */
  const TELAS = { inicio: 'verInicio', proposituras: 'verProposituras', assinar: 'verAssinar', comissoes: 'verComissoes', sessoes: 'verSessoes', materias: 'verMaterias', despacho: 'presDespacho', pauta: 'presPauta', autografos: 'presAutografos', atos: 'presAtos' };
  const PRES = ['despacho', 'pauta', 'autografos', 'atos'];
  function criarTelas() {
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main || $('#view-lgvr-inicio')) return;
    main.insertAdjacentHTML('beforeend', Object.keys(TELAS).map(k => `<section class="view lgt lgvr" id="view-lgvr-${k}" style="display:none"></section>`).join(''));
    const antigo = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    Object.keys(TELAS).forEach(k => { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lgvr-' + k; b.hidden = true; b.style.display = 'none'; antigo.appendChild(b); });
  }
  let tela = 'inicio';
  window.lgvrAbrir = function (k) {
    const a = atual(); if (!a) { UI().aviso('Seu usuário não tem acesso ao Portal do Vereador.', 'erro'); return; }
    if (PRES.includes(k) && a.v.id !== comp().presidente) { UI().aviso('Função exclusiva do Presidente da Câmara.', 'erro'); k = 'inicio'; }
    criarTelas(); integrarAdministrativo(); tela = TELAS[k] ? k : 'inicio';
    gotoShared('lgvr-' + tela); if (window.lgv31Mark) lgv31Mark(TELAS[tela]);
    document.documentElement.classList.toggle('lgvr-consulta', !podeEditar());
    desenhar(); scrollTo(0, 0);
  };
  function desenhar() { const a = atual(); if (!a) return; ({ inicio: tInicio, proposituras: tProposituras, assinar: tAssinar, comissoes: x => window.lgcmTela && lgcmTela(x, '#view-lgvr-comissoes'), sessoes: tSessoes, materias: tMaterias, despacho: tDespacho, pauta: tPauta, autografos: tAutografos, atos: tAtos })[tela](a); atualizarContador(); if (window.lgv31ApplyAdmin) lgv31ApplyAdmin(); }
  const cab = (t, sub, acoes = '') => `<div class="letterhead"><div><h1>${t}</h1><div class="date">${sub}</div></div><div class="lgt-acoes">${acoes}</div></div>`;
  const btn = (txt, fn, cls = 'primario', edita = true) => `<button class="lgt-btn ${cls}" type="button" ${edita ? 'data-edita' : ''} onclick="${fn}">${txt}</button>`;
  function faixaDemo(a) {
    if (!a.demo) return '';
    const c = comp();
    const pres = c.vereadores.find(v => v.id === c.presidente);
    return `<div class="lgvr-demo-faixa"><span>${ic('vereador')} Você não é vereador; está vendo o portal <b>como</b></span><select onchange="lgvrComo(this.value)" aria-label="Ver o portal como">${c.vereadores.map(v => `<option value="${v.id}"${v.id === a.v.id ? ' selected' : ''}>${esc(v.nome)}${v.id === c.presidente ? ' — Presidente da Câmara' : ''}</option>`).join('')}</select>
      <small>Modo de demonstração para administrador e Procuradoria. Presidente da Câmara hoje: <b>${esc(pres ? pres.nome : '—')}</b>${pres && pres.id !== a.v.id ? ` · <button type="button" class="lgvr-link" onclick="lgvrComo('${pres.id}')">ver como o Presidente</button>` : ''} (quem define é a Procuradoria, em Vereadores e usuários).</small></div>`;
  }
  window.lgvrComo = id => { try { sessionStorage.setItem('lgvr_como', id); } catch (e) { } if (window.lgv33Render) lgv33Render(); lgvrAbrir(PRES.includes(tela) && id !== comp().presidente ? 'inicio' : tela); };
  function pendentesAssinatura(v) {
    const d = dados(); const meus = d.rascunhos.filter(r => r.autorId === v.id);
    const coaut = listaProt().filter(p => (p.coautores || []).includes(v.id) && !(p.assinaturas || []).some(s => s.vereadorId === v.id) && !['rejeitado', 'concluido', 'devolvido'].includes(p.status));
    let pres = [];
    if (v.id === comp().presidente) pres = listaProt().filter(p => p.status === 'votacao' && p.resultado === 'aprovado');
    return { meus, coaut, pres, total: meus.length + coaut.length + pres.length };
  }
  function atualizarContador() {
    const a = atual(); const b = document.querySelector('.lgv31-item[data-v31="verAssinar"]'); if (!a || !b) return;
    let n = b.querySelector('.lgvr-n'); const t = pendentesAssinatura(a.v).total;
    if (!n) { n = document.createElement('b'); n.className = 'lgvr-n'; b.appendChild(n); } n.textContent = t || ''; n.hidden = !t;
    const bd = document.querySelector('.lgv31-item[data-v31="presDespacho"]'); if (bd) { let m = bd.querySelector('.lgvr-n'); const q = a.v.id === comp().presidente ? listaProt().filter(p => p.status === 'protocolado').length : 0; if (!m) { m = document.createElement('b'); m.className = 'lgvr-n'; bd.appendChild(m); } m.textContent = q || ''; m.hidden = !q; }
    const bc = document.querySelector('.lgv31-item[data-v31="verComissoes"]'); if (bc && window.lgcmPendencias) { let m = bc.querySelector('.lgvr-n'); const q = lgcmPendencias(a.v).length; if (!m) { m = document.createElement('b'); m.className = 'lgvr-n'; bc.appendChild(m); } m.textContent = q || ''; m.hidden = !q; }
  }
  function sessoes() {
    const ag = ler('lgv11_agenda_v1', []).filter(x => x && x.when).map(x => ({ quando: new Date(x.when), titulo: x.title || 'Sessão', local: x.local || 'Plenário' }));
    const base = [['2026-11-16T20:00', '18ª Sessão Ordinária']].map(([d, t]) => ({ quando: new Date(d), titulo: t, local: 'Plenário' })).filter(s => !ag.some(x => x.quando.toDateString() === s.quando.toDateString()));
    const h = new Date(); h.setHours(0, 0, 0, 0);
    return [...ag, ...base].filter(s => s.quando >= h).sort((a, b) => a.quando - b.quando);
  }
  const fmtSessao = s => `${s.quando.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às ${s.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  /* ---- início ---- */
  function tInicio(a) {
    const v = a.v, c = comp(), pres = v.id === c.presidente, prot = listaProt();
    const minhas = prot.filter(p => ehMinha(p, v)); const tram = minhas.filter(p => !['concluido', 'rejeitado', 'devolvido'].includes(p.status));
    const pend = pendentesAssinatura(v); const prox = sessoes()[0];
    const movs = minhas.flatMap(p => (p.timeline || []).map(t => ({ p, t }))).slice(-60).reverse().slice(0, 6);
    const despachar = prot.filter(p => p.status === 'protocolado').length, naPauta = prot.filter(p => p.status === 'votacao' && !p.resultado).length;
    $('#view-lgvr-inicio').innerHTML = faixaDemo(a) +
      `<div class="lgvr-hero"><div class="lgvr-av">${esc(v.nome.split(' ').map(x => x[0]).slice(0, 2).join(''))}</div><div><small>${pres ? 'Presidente da Câmara Municipal' : 'Vereador(a)'} · ${esc(v.partido)}</small><h1>${esc(v.completo || v.nome)}</h1><p>Gabinete do Vereador · Legislatura 2025–2028</p></div>
        <div class="lgt-acoes">${btn(ic('materias') + ' Nova propositura', "lgvrNova()")}</div></div>
      <div class="lgvr-kpis"><button type="button" onclick="lgvrAbrir('proposituras')"><b>${minhas.length}</b><span>minhas proposituras</span></button><button type="button" onclick="lgvrAbrir('proposituras')"><b>${tram.length}</b><span>em tramitação</span></button><button type="button" class="${pend.total ? 'k-alerta' : ''}" onclick="lgvrAbrir('assinar')"><b>${pend.total}</b><span>aguardando sua assinatura</span></button><button type="button" onclick="lgvrAbrir('sessoes')"><b>${prox ? prox.quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}</b><span>próxima sessão</span></button></div>
      ${window.lgcmCardInicio ? lgcmCardInicio(v) : ''}
      ${pres ? `<div class="lgt-card lgvr-pres"><div class="lgvr-card-cab"><h3>${ic('despacho')} Presidência</h3><span class="lgvr-sub">Funções exclusivas do Presidente</span></div><div class="lgvr-pres-g">
        <button type="button" onclick="lgvrAbrir('despacho')"><b>${despachar}</b><span>proposições aguardando seu despacho</span></button>
        <button type="button" onclick="lgvrAbrir('pauta')"><b>${naPauta}</b><span>na Ordem do Dia</span></button>
        <button type="button" onclick="lgvrAbrir('autografos')"><b>${pend.pres.length}</b><span>autógrafos e promulgações</span></button>
        <button type="button" onclick="lgvrAbrir('atos')"><b>${dados().atos.length}</b><span>atos da Presidência</span></button></div></div>` : ''}
      <div class="lgvr-grade">
        <div class="lgt-card"><div class="lgvr-card-cab"><h3>Andamento das minhas proposituras</h3><button class="lgt-mini" type="button" onclick="lgvrAbrir('proposituras')">Ver todas</button></div>
          ${movs.length ? `<ol class="lgvr-tempo">${movs.map(({ p, t }) => `<li><span>${esc(t.date)}</span><b><a href="#" onclick="event.preventDefault();lgvrVer('${p.id}')">${esc(p.numero)}</a> · ${esc(t.label)}</b><small>${esc(p.ementa).slice(0, 90)}</small></li>`).join('')}</ol>` : '<p class="lgt-p">Nenhuma propositura protocolada ainda. Use “Nova propositura” para começar.</p>'}</div>
        <div class="lgt-card"><div class="lgvr-card-cab"><h3>Próximas sessões</h3><button class="lgt-mini" type="button" onclick="lgvrAbrir('sessoes')">Pauta</button></div>
          ${sessoes().slice(0, 3).map(s => `<div class="lgvr-sessao"><div class="lgvr-dia"><b>${s.quando.getDate()}</b><span>${s.quando.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div><div><b>${esc(s.titulo)}</b><small>${esc(fmtSessao(s))} · ${esc(s.local)}</small></div></div>`).join('') || '<p class="lgt-p">Nenhuma sessão agendada.</p>'}
          ${pend.total ? `<div class="lgvr-aviso">${ic('assinar')}<span><b>${pend.total} documento(s) aguardando sua assinatura</b><small>Baixe o PDF, assine no gov.br e devolva para protocolar.</small></span><button class="lgt-mini" type="button" onclick="lgvrAbrir('assinar')">Assinar</button></div>` : ''}</div>
      </div>`;
  }

  /* ---- minhas proposituras ---- */
  let abaProp = 'tramitando';
  function tProposituras(a) {
    const v = a.v, d = dados(), prot = listaProt().filter(p => ehMinha(p, v));
    const rasc = d.rascunhos.filter(r => r.autorId === v.id);
    const grupos = { rascunhos: rasc, tramitando: prot.filter(p => !['concluido', 'rejeitado', 'devolvido'].includes(p.status)), encerradas: prot.filter(p => ['concluido', 'rejeitado', 'devolvido'].includes(p.status)) };
    const linhas = abaProp === 'rascunhos'
      ? rasc.map(r => `<tr class="lgvr-click" onclick="lgvrRascunho('${r.id}')"><td><b>${TIPOS[r.tipo].nome}</b><small>Rascunho</small></td><td><b>${esc(r.ementa)}</b><small>Criado em ${new Date(r.criadoEm).toLocaleDateString('pt-BR')}${(r.coautores || []).length ? ' · coautoria: ' + r.coautores.map(id => esc(verPorId(id)?.nome || '')).join(', ') : ''}</small></td><td><span class="lgvr-tag">Não assinado</span></td><td class="acoes-col"><button class="lgt-mini" type="button" data-edita onclick="event.stopPropagation();lgvrAssinarRascunho('${r.id}')">Assinar e protocolar</button></td></tr>`)
      : grupos[abaProp].map(p => `<tr class="lgvr-click" onclick="lgvrVer('${p.id}')"><td><b>${esc(p.numero)}</b><small>${esc(p.tipoNome || TIPOS[tipoDe(p)].nome)}${p.autorId !== v.id ? ' · coautor' : ''}</small></td><td><b>${esc(p.ementa)}</b><small>Protocolada em ${esc(p.data)}</small></td><td>${tag(p)}</td><td class="acoes-col"><button class="lgt-mini" type="button">Andamento</button></td></tr>`);
    $('#view-lgvr-proposituras').innerHTML = faixaDemo(a) + cab('Minhas proposituras', 'Projetos, indicações, requerimentos e moções de sua autoria ou coautoria', btn('+ Nova propositura', 'lgvrNova()')) +
      `<div class="lgf-abas" role="tablist">${[['tramitando', 'Em tramitação'], ['rascunhos', 'Rascunhos'], ['encerradas', 'Encerradas']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${abaProp === k}" onclick="lgvrAbaProp('${k}')">${n} <b>${grupos[k].length}</b></button>`).join('')}</div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Número</th><th>Ementa</th><th>Situação</th><th class="acoes-col"></th></tr></thead><tbody>${linhas.join('') || `<tr><td colspan="4" class="lgt-vazio"><b>Nada por aqui.</b><span>${abaProp === 'rascunhos' ? 'Rascunhos ainda não assinados aparecem aqui.' : 'Crie uma propositura, assine pelo gov.br e ela é protocolada na hora.'}</span></td></tr>`}</tbody></table></div>`;
  }
  window.lgvrAbaProp = k => { abaProp = k; desenhar(); };

  window.lgvrNova = function (id) {
    const a = atual(); if (!a || !podeEditar()) return UI().aviso('Sem permissão para criar proposituras.', 'erro');
    const d = dados(); const r = id ? d.rascunhos.find(x => x.id === id) : { tipo: 'IND', coautores: [] }; const c = comp();
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${id ? 'Editar propositura' : 'Nova propositura'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <fieldset class="cheio lgvr-tipos"><legend>Tipo *</legend>${Object.entries(TIPOS).map(([k, t]) => `<label class="lgvr-tipo"><input type="radio" name="tipo" value="${k}" ${k === r.tipo ? 'checked' : ''}><span><b>${t.nome}</b><small>${t.desc}</small></span></label>`).join('')}</fieldset>
      <label class="cheio"><span>Ementa (resumo em uma frase) *</span><input name="ementa" required maxlength="300" value="${esc(r.ementa || '')}" placeholder="Ex.: Indica ao Prefeito a instalação de redutor de velocidade na Rua…"></label>
      <label class="cheio"><span>Texto *</span><textarea name="texto" rows="6" required>${esc(r.texto || '')}</textarea></label>
      <label class="cheio"><span>Justificativa</span><textarea name="justificativa" rows="3">${esc(r.justificativa || '')}</textarea></label>
      <fieldset class="cheio lgvr-coaut"><legend>Coautores (opcional) — eles também assinam</legend>${c.vereadores.filter(x => x.id !== a.v.id).map(x => `<label><input type="checkbox" name="coaut" value="${x.id}" ${(r.coautores || []).includes(x.id) ? 'checked' : ''}> ${esc(x.nome)}</label>`).join('')}</fieldset>
      </div><p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn" value="rascunho">Salvar rascunho</button><button type="submit" class="lgt-btn primario" value="assinar">Salvar e assinar</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = e => {
      e.preventDefault(); const acao = e.submitter?.value || 'rascunho';
      if (!f.ementa.value.trim() || !f.texto.value.trim()) { f.querySelector('.lgt-erro').textContent = 'Preencha a ementa e o texto.'; return; }
      const novo = { ...(id ? r : { id: uid('r'), criadoEm: new Date().toISOString(), autorId: a.v.id }), tipo: f.tipo.value, ementa: f.ementa.value.trim(), texto: f.texto.value.trim(), justificativa: f.justificativa.value.trim(), coautores: [...f.querySelectorAll('[name=coaut]:checked')].map(x => x.value) };
      const dd = dados(); if (id) dd.rascunhos = dd.rascunhos.map(x => x.id === id ? novo : x); else dd.rascunhos.unshift(novo); salvarDados(dd);
      UI().fecharModal(); if (acao === 'assinar') lgvrAssinarRascunho(novo.id); else { UI().aviso('Rascunho salvo.'); abaProp = 'rascunhos'; if (tela === 'proposituras') desenhar(); else lgvrAbrir('proposituras'); }
    };
  };
  window.lgvrRascunho = function (id) {
    const r = dados().rascunhos.find(x => x.id === id); if (!r) return;
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${TIPOS[r.tipo].nome} · rascunho</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgvr-det"><h3>${esc(r.ementa)}</h3><div class="lgvr-texto">${esc(r.texto).replace(/\n/g, '<br>')}</div>${r.justificativa ? `<h4>Justificativa</h4><div class="lgvr-texto">${esc(r.justificativa).replace(/\n/g, '<br>')}</div>` : ''}</div>
      <div class="lgt-modal-rod lgvr-rod"><button type="button" class="lgt-btn perigo" data-edita onclick="lgvrExcluirRascunho('${r.id}')">Excluir</button><button type="button" class="lgt-btn" data-edita onclick="lgvrNova('${r.id}')">Editar</button><button type="button" class="lgt-btn primario" data-edita onclick="lgvrAssinarRascunho('${r.id}')">Assinar e protocolar</button></div></div>`);
  };
  window.lgvrExcluirRascunho = id => { const d = dados(); d.rascunhos = d.rascunhos.filter(x => x.id !== id); salvarDados(d); UI().fecharModal(); UI().aviso('Rascunho excluído.'); desenhar(); };
  window.lgvrAssinarRascunho = function (id) {
    const a = atual(); const r = dados().rascunhos.find(x => x.id === id); if (!a || !r) return;
    if (!podeEditar()) return UI().aviso('Seu acesso é somente consulta.', 'erro');
    const T = TIPOS[r.tipo];
    const pid = 'vp' + r.id;
    const signs = [a.v, ...(r.coautores || []).map(verPorId).filter(Boolean)].map(x => ({ nome: x.completo || x.nome, cargo: cargoDe(x) }));
    assinarDoc({ titulo: `${T.nome}: ${r.ementa}`, arquivo: arq(T.nome + ' ' + r.ementa.slice(0, 40)), docId: pid, doc: { tipo: T.nome, numero: '', ementa: r.ementa, texto: r.texto, justificativa: r.justificativa }, signatarios: signs }, a.v, ass => {
      const ano = new Date().getFullYear(), n = proximoNumero(r.tipo, ano), v = a.v;
      const p = { id: pid, numero: `${r.tipo} ${n}/${ano}`, full: `${r.tipo}-${ano}-${n.padStart(5, '0')}`, autor: 'Ver. ' + v.nome + ((r.coautores || []).length ? ' e outros' : ''), ementa: r.ementa, unidade: 'Gabinete do Vereador ' + v.nome, comissao: '', status: 'protocolado', data: hojeBR(), docs: [T.nome + '.pdf'],
        timeline: [{ date: agoraTL(), label: `${T.nome} assinado(a) digitalmente por ${v.nome} (${ass.metodo})` }, { date: agoraTL(), label: `Protocolado automaticamente: ${r.tipo} ${n}/${ano}` }, { date: agoraTL(), label: 'Encaminhado ao Presidente para despacho' }],
        origem: 'portal-vereador', tipo: r.tipo, tipoNome: T.nome, texto: r.texto, justificativa: r.justificativa, autorId: v.id, coautores: r.coautores || [], assinaturas: [ass] };
      listaProt().unshift(p); const d = dados(); d.rascunhos = d.rascunhos.filter(x => x.id !== id); salvarDados(d);
      persistirProt('Propositura protocolada pelo Portal do Vereador', p); UI().log('Portal do Vereador', `Protocolou ${p.numero}`);
      { const pr = comp().vereadores.find(x => x.id === comp().presidente); UI().aviso(`${p.numero} assinado e protocolado. Já está com o Presidente${pr ? ' ' + pr.nome : ''} para despacho.`); } abaProp = 'tramitando'; if (tela === 'proposituras' || tela === 'assinar') desenhar(); lgvrVer(p.id);
    });
  };

  /* ---- detalhe / andamento ---- */
  window.lgvrVer = function (id) {
    const p = listaProt().find(x => x.id === id); if (!p) return; const a = atual(); const c = comp();
    const minha = a && ehMinha(p, a.v); const falta = a && (p.coautores || []).includes(a.v.id) && !(p.assinaturas || []).some(s => s.vereadorId === a.v.id);
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${esc(p.numero)} ${tag(p)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgvr-det"><p class="lgvr-tipo-l">${esc(p.tipoNome || TIPOS[tipoDe(p)].nome)} · ${esc(p.autor || '')}</p><h3>${esc(p.ementa)}</h3>
        ${p.texto ? `<details ${minha ? '' : 'open'}><summary>Texto da propositura</summary><div class="lgvr-texto">${esc(p.texto).replace(/\n/g, '<br>')}</div></details>` : ''}
        ${(p.assinaturas || []).length ? `<h4>Assinaturas</h4><ul class="lgvr-ass">${p.assinaturas.map(s => `<li>${ic('assinar')}<span><b>${esc(s.nome)}</b><small>${new Date(s.data).toLocaleString('pt-BR')} · ${esc(s.metodo)}${s.certificado ? ' · certificado: ' + esc(s.certificado) : ''}${s.emissor ? ' · ' + esc(s.emissor) : ''}${s.conferencia && s.conferencia.nomeConfere === false ? ' · nome confirmado manualmente' : ''}</small></span></li>`).join('')}${(p.coautores || []).filter(id => !(p.assinaturas || []).some(s => s.vereadorId === id)).map(id => `<li class="pend">${ic('assinar')}<span><b>${esc(verPorId(id)?.completo || '')}</b><small>Coautor · assinatura pendente</small></span></li>`).join('')}</ul>` : ''}
        ${window.lgcmResumo ? lgcmResumo(p) : ''}
        ${p.veto ? `<h4>Veto ${esc(p.veto.tipo)}</h4><p class="lgt-p">${esc(p.veto.razoes)}${p.veto.resultado ? ` — <b>veto ${esc(p.veto.resultado)}</b>${p.veto.votacao ? ` (${p.veto.votacao.rejeicao} a ${p.veto.votacao.manutencao})` : ''}` : ' — aguardando apreciação da Câmara'}</p>` : ''}
        ${p.lei ? `<h4>Norma</h4><p class="lgt-p"><b>${esc(p.lei)}</b>${p.publicacao ? ' · publicada em ' + esc(p.publicacao) : ''}${p.vigencia ? ' · vigência: ' + esc(p.vigencia.toLowerCase()) : ''}</p>` : ''}
        ${p.votacao ? `<h4>Votação</h4><p class="lgt-p">${p.votacao.favor} favoráveis · ${p.votacao.contra} contrários · ${p.votacao.abst} abstenções${p.votacao.desempate ? ' · desempate do Presidente: ' + p.votacao.desempate : ''} (${esc(p.votacao.sessao)})</p>` : ''}
        <h4>Andamento</h4><ol class="lgvr-tempo">${(p.timeline || []).slice().reverse().map(t => `<li><span>${esc(t.date)}</span><b>${esc(t.label)}</b></li>`).join('')}</ol></div>
      <div class="lgt-modal-rod lgvr-rod">${[['', 'PDF assinado'], ['-autografo', 'Autógrafo assinado'], ['-promulgacao', 'Promulgação assinada'], ['-lei', 'Lei promulgada']].filter(([suf]) => window.lgsTemPDF && lgsTemPDF(p.id + suf)).map(([suf, n]) => `<button type="button" class="lgt-btn" onclick="lgsBaixarPDF('${p.id + suf}','${esc((p.numero || 'documento').replace(/[^A-Za-z0-9]+/g, '-'))}${suf}-assinado.pdf')">${ic('externo')} ${n}</button>`).join('')}<button type="button" class="lgt-btn" onclick="lgvrDocumento('${p.id}')">${ic('editor')} Ver texto</button>${falta ? `<button type="button" class="lgt-btn primario" data-edita onclick="lgvrCoassinar('${p.id}')">Assinar como coautor</button>` : ''}</div></div>`);
  };
  window.lgvrCoassinar = function (id) {
    const a = atual(); const p = listaProt().find(x => x.id === id); if (!a || !p) return;
    const base = window.lgsLerPDF ? lgsLerPDF(p.id) : null;
    assinarDoc({ titulo: `${p.numero}: ${p.ementa}`, arquivo: arq(p.numero + ' assinar'), docId: p.id, base, doc: { tipo: p.tipoNome || 'Projeto de Lei', numero: (p.numero || '').split(' ')[1], ementa: p.ementa, texto: p.texto, justificativa: p.justificativa } }, a.v, ass => {
      p.assinaturas = [...(p.assinaturas || []), ass]; p.timeline.push({ date: agoraTL(), label: `Coautoria assinada digitalmente por ${a.v.nome} (${ass.metodo})` });
      persistirProt('Coautoria assinada', p); UI().aviso('Assinatura registrada.'); desenhar(); lgvrVer(p.id);
    });
  };
  window.lgvrDocumento = function (id) {
    const p = listaProt().find(x => x.id === id) || dados().atos.find(x => x.id === id); if (!p) return;
    const w = window.open('', '_blank'); if (!w) return UI().aviso('Permita janelas pop-up para ver o documento.', 'erro');
    const titulo = p.tipoNome ? `${p.tipoNome.toUpperCase()} Nº ${p.numero.split(' ')[1] || p.numero}` : `${(p.tipoAto || 'PORTARIA').toUpperCase()} Nº ${p.numero}`;
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>@page{size:A4;margin:20mm}body{font:13px/1.6 Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:24px auto;padding:0 18px}.cab{text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:22px}.cab b{display:block;font:700 15px Arial,sans-serif;letter-spacing:.04em}.cab small{font:12px Arial,sans-serif;color:#444}h1{font:700 16px Arial,sans-serif;text-align:center;margin:0 0 6px}.em{margin:14px 0 18px 40%;font-style:italic}.tx{white-space:pre-wrap;text-align:justify}h2{font:700 13px Arial,sans-serif;margin:22px 0 6px}.ass{margin-top:40px;border-top:1px solid #999;padding-top:12px;font:12px Arial,sans-serif}.ass div{margin:0 0 10px}.ass code{font-size:10.5px;color:#555;word-break:break-all}.data{text-align:right;margin-top:24px}</style></head><body>
      <div class="cab"><b>CÂMARA MUNICIPAL DE NEVES PAULISTA</b><small>Estado de São Paulo</small></div><h1>${esc(titulo)}</h1>
      <p class="em">${esc(p.ementa)}</p><div class="tx">${esc(p.texto || '')}</div>${p.justificativa ? `<h2>JUSTIFICATIVA</h2><div class="tx">${esc(p.justificativa)}</div>` : ''}
      <p class="data">Neves Paulista, ${esc(p.data || hojeBR())}.</p>
      <div class="ass"><b>Documento assinado eletronicamente</b>${(p.assinaturas || (p.assinatura ? [p.assinatura] : [])).map(s => `<div>${esc(s.nome)} — ${new Date(s.data).toLocaleString('pt-BR')} — ${esc(s.metodo)}<br><code>SHA-256 ${esc(s.hash)}</code></div>`).join('') || '<div>Sem assinaturas.</div>'}
      <div style="color:#666;font-size:11px">Assinatura eletrônica avançada nos termos da Lei 14.063/2020 (na versão oficial, validável em validar.iti.gov.br).</div></div></body></html>`);
    w.document.close();
  };

  /* ---- para assinar ---- */
  function tAssinar(a) {
    const p = pendentesAssinatura(a.v);
    const item = (t, s, b) => `<div class="lgvr-item"><div><b>${t}</b><small>${s}</small></div>${b}</div>`;
    $('#view-lgvr-assinar').innerHTML = faixaDemo(a) + cab('Para assinar', 'Documentos que dependem da sua assinatura gov.br') +
      `<div class="lgvr-listas">
       <div class="lgt-card"><h3>Minhas proposituras (rascunhos)</h3>${p.meus.map(r => item(esc(TIPOS[r.tipo].nome), esc(r.ementa), `<button class="lgt-btn primario" type="button" data-edita onclick="lgvrAssinarRascunho('${r.id}')">${ic('assinar')} Assinar e protocolar</button>`)).join('') || '<p class="lgt-p">Nenhum rascunho aguardando.</p>'}</div>
       <div class="lgt-card"><h3>Coautoria</h3>${p.coaut.map(x => item(esc(x.numero), esc(x.ementa), `<button class="lgt-btn primario" type="button" data-edita onclick="lgvrCoassinar('${x.id}')">${ic('assinar')} Assinar</button>`)).join('') || '<p class="lgt-p">Nenhum pedido de coautoria.</p>'}</div>
       ${a.v.id === comp().presidente ? `<div class="lgt-card"><h3>Presidência: autógrafos e promulgações</h3>${p.pres.map(x => item(esc(x.numero), esc(x.ementa), `<button class="lgt-btn primario" type="button" data-edita onclick="lgvrAutografo('${x.id}')">${ic('assinar')} ${TIPOS[tipoDe(x)].fluxo === 'promulga' ? 'Promulgar' : 'Assinar autógrafo'}</button>`)).join('') || '<p class="lgt-p">Nada pendente.</p>'}</div>` : ''}
      </div>`;
  }

  /* ---- sessões e pauta ---- */
  function tSessoes(a) {
    const prot = listaProt(); const pauta = prot.filter(p => p.status === 'votacao' && !p.resultado); const com = prot.filter(p => p.status === 'comissao' || p.status === 'analise');
    $('#view-lgvr-sessoes').innerHTML = faixaDemo(a) + cab('Sessões e pauta', 'Próximas sessões, Ordem do Dia e matérias em comissão') +
      `<div class="lgvr-grade"><div class="lgt-card"><h3>Próximas sessões</h3>${sessoes().slice(0, 6).map(s => `<div class="lgvr-sessao"><div class="lgvr-dia"><b>${s.quando.getDate()}</b><span>${s.quando.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div><div><b>${esc(s.titulo)}</b><small>${esc(fmtSessao(s))} · ${esc(s.local)}</small></div></div>`).join('') || '<p class="lgt-p">Nenhuma sessão agendada.</p>'}</div>
       <div class="lgt-card"><h3>Ordem do Dia (${pauta.length})</h3>${pauta.map(p => `<button type="button" class="lgvr-linha" onclick="lgvrVer('${p.id}')"><b>${esc(p.numero)}</b><span>${esc(p.ementa)}</span><small>${esc(p.autor || '')}</small></button>`).join('') || '<p class="lgt-p">Nenhuma matéria na Ordem do Dia.</p>'}</div></div>
      <div class="lgt-card" style="margin-top:14px"><h3>Em comissão ou na Procuradoria (${com.length})</h3>${com.map(p => `<button type="button" class="lgvr-linha" onclick="lgvrVer('${p.id}')"><b>${esc(p.numero)}</b><span>${esc(p.ementa)}</span><small>${esc(statusTxt(p))}</small></button>`).join('') || '<p class="lgt-p">Nenhuma.</p>'}</div>`;
  }

  /* ---- acompanhar matérias ---- */
  let filtroMat = '';
  function tMaterias(a) {
    $('#view-lgvr-materias').innerHTML = faixaDemo(a) + cab('Acompanhar matérias', 'Todas as matérias da Câmara e onde cada uma está') +
      `<div class="lgt-filtros"><label class="cresce"><span>Buscar</span><input id="lgvr-q" value="${esc(filtroMat)}" placeholder="Número, ementa ou autor…"></label></div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Número</th><th>Ementa</th><th>Autor</th><th>Situação</th></tr></thead><tbody id="lgvr-mat"></tbody></table></div>`;
    const go = () => { const q = filtroMat.toLowerCase(); const l = listaProt().filter(p => p.status !== 'enviado' && (!q || [p.numero, p.ementa, p.autor].join(' ').toLowerCase().includes(q)));
      $('#lgvr-mat').innerHTML = l.map(p => `<tr class="lgvr-click" onclick="lgvrVer('${p.id}')"><td><b>${esc(p.numero)}</b><small>${esc(p.tipoNome || 'Projeto de Lei')}</small></td><td>${esc(p.ementa)}</td><td><small>${esc(p.autor || '')}</small></td><td>${tag(p)}</td></tr>`).join('') || '<tr><td colspan="4" class="lgt-vazio"><b>Nenhuma matéria encontrada.</b></td></tr>'; };
    $('#lgvr-q').oninput = e => { filtroMat = e.target.value; go(); }; go();
  }

  /* ================= PRESIDÊNCIA ================= */
  const exigePres = () => { const a = atual(); if (!a || a.v.id !== comp().presidente) { UI().aviso('Função exclusiva do Presidente da Câmara.', 'erro'); return null; } if (!podeEditar()) { UI().aviso('Seu acesso é somente consulta.', 'erro'); return null; } return a; };
  const regra = t => `<p class="lgvr-regra">${ic('ajuda')}<span>${t}</span></p>`;
  function tDespacho(a) {
    const prot = listaProt(); const fila = prot.filter(p => p.status === 'protocolado'); const andam = prot.filter(p => p.status === 'analise' || p.status === 'comissao');
    const card = (p, acoes) => `<article class="lgvr-desp"><header><b>${esc(p.numero)}</b>${tag(p)}</header><h4>${esc(p.ementa)}</h4><p>${esc(p.tipoNome || 'Projeto de Lei')} · ${esc(p.autor || '')} · ${esc(p.data || '')}</p><footer><button class="lgt-mini" type="button" onclick="lgvrVer('${p.id}')">Ler</button>${acoes}</footer></article>`;
    $('#view-lgvr-despacho').innerHTML = faixaDemo(a) + cab('Despachar proposições', 'Proposições protocoladas chegam direto ao Presidente, sem depender da Secretaria') +
      regra('O Presidente despacha as proposições: envia à Procuradoria para parecer jurídico e distribui às comissões permanentes que devem opinar (Justiça e Redação sempre; Finanças e Orçamento quando houver impacto financeiro; Assuntos Gerais conforme o tema). Indicações, requerimentos e moções normalmente vão direto à pauta.') +
      `<h3 class="lgvr-h">Aguardando seu despacho (${fila.length})</h3><div class="lgvr-desps">${fila.map(p => card(p, `<button class="lgt-mini primario" type="button" data-edita onclick="lgvrDespachar('${p.id}')">Despachar</button>`)).join('') || '<p class="lgt-p">Nenhuma proposição aguardando despacho.</p>'}</div>
      <h3 class="lgvr-h">Na Procuradoria ou em comissão (${andam.length})</h3><div class="lgvr-desps">${andam.map(p => card(p, `<button class="lgt-mini" type="button" data-edita onclick="lgvrDespachar('${p.id}')">Novo despacho</button>`)).join('') || '<p class="lgt-p">Nenhuma.</p>'}</div>`;
  }
  window.lgvrDespachar = function (id) {
    const a = exigePres(); if (!a) return; const p = listaProt().find(x => x.id === id); if (!p) return; const simples = TIPOS[tipoDe(p)].fluxo === 'simples';
    const coms = comp().comissoes; const rota0 = p.comissoesRota || ['Justiça e Redação', ...(/cria|cargo|despesa|crédito|orçament|tribut|isen|fundo|reajuste|salár|subsíd/i.test(p.ementa || '') ? ['Finanças e Orçamento'] : [])];
    const op = [['analise', 'Procuradoria Legislativa (parecer jurídico) e depois às comissões marcadas'], ['comissoes', 'Direto às comissões marcadas'], ['votacao', 'Incluir na Ordem do Dia'], ['devolvido', 'Devolver ao autor']];
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Despacho · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <p class="lgt-p cheio"><b>${esc(p.ementa)}</b><br>${esc(p.autor || '')}</p>
      <fieldset class="cheio lgvr-opts"><legend>Encaminhar para *</legend>${op.map(([k, n]) => `<label><input type="radio" name="dest" value="${esc(k)}" ${(simples ? k === 'votacao' : k === (p.status === 'analise' ? 'comissoes' : 'analise')) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</fieldset>
      <fieldset class="cheio lgvr-opts lgvr-coms" id="lgvr-coms"><legend>Comissões que devem dar parecer (nesta ordem)</legend>${coms.map((c, i) => `<label class="lgvr-com-op"><input type="checkbox" name="com" value="${esc(c.nome)}" ${rota0.includes(c.nome) ? 'checked' : ''} ${i === 0 ? 'data-obrig' : ''}><span><b>Comissão de ${esc(c.nome)}${i === 0 ? ' · obrigatória' : ''}</b><small>${esc(c.area || '')}</small></span></label>`).join('')}</fieldset>
      <label class="cheio"><span>Observação / motivo da devolução</span><textarea name="obs" rows="2"></textarea></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Despachar</button></div></form>`);
    const f = $('#lgt-modal form');
    const vis = () => { const d = f.dest.value; $('#lgvr-coms').hidden = !(d === 'analise' || d === 'comissoes'); }; f.querySelectorAll('[name=dest]').forEach(r => r.onchange = vis); vis();
    f.onsubmit = e => { e.preventDefault(); const dest = f.dest.value, obs = f.obs.value.trim(); const err = f.querySelector('.lgt-erro');
      if (dest === 'devolvido' && !obs) { err.textContent = 'Informe o motivo da devolução.'; return; }
      const rota = [...f.querySelectorAll('[name=com]:checked')].map(x => x.value);
      if ((dest === 'analise' || dest === 'comissoes') && !rota.includes(coms[0].nome)) { err.textContent = `A Comissão de ${coms[0].nome} é obrigatória: ela examina a legalidade, a iniciativa e a redação.`; return; }
      let label;
      if (dest === 'analise') { p.status = 'analise'; p.comissoesRota = rota; p.comissao = ''; label = `Despacho do Presidente: à Procuradoria Legislativa para parecer jurídico; depois às Comissões de ${rota.join(', ')}`; }
      else if (dest === 'comissoes') { p.comissoesRota = rota; label = `Despacho do Presidente: distribuído às Comissões de ${rota.join(', ')}`; if (window.lgcmIniciar) lgcmIniciar(p); else { p.status = 'comissao'; p.comissao = rota[0]; } }
      else if (dest === 'votacao') { p.status = 'votacao'; p.resultado = ''; label = 'Despacho do Presidente: incluído na Ordem do Dia'; }
      else { p.status = 'devolvido'; label = 'Devolvido ao autor pelo Presidente'; }
      p.timeline.splice(dest === 'comissoes' ? p.timeline.length - 1 : p.timeline.length, 0, { date: agoraTL(), label: label + (obs ? ' — ' + obs : '') + ` (${a.v.nome})` });
      persistirProt(label, p); UI().fecharModal(); UI().aviso('Despacho registrado.'); desenhar(); };
  };
  function tPauta(a) {
    const pauta = listaProt().filter(p => p.status === 'votacao' && !p.resultado); const prox = sessoes()[0];
    $('#view-lgvr-pauta').innerHTML = faixaDemo(a) + cab('Ordem do Dia e votação', prox ? `Próxima sessão: ${esc(prox.titulo)} · ${esc(fmtSessao(prox))}` : 'Matérias prontas para votação') +
      regra('O Presidente conduz a discussão e a votação e proclama o resultado. Em regra vota só para desempatar, nas votações secretas e nas que exigem quórum qualificado. O quórum varia conforme a matéria (maioria simples, absoluta ou qualificada): confirme na Lei Orgânica e no Regimento Interno.') +
      `<div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Matéria</th><th>Ementa</th><th>Autor</th><th class="acoes-col"></th></tr></thead><tbody>${pauta.map(p => `<tr><td><b>${esc(p.numero)}</b><small>${p.veto && !p.veto.resultado ? `<span class="lgvr-tag t-er">Veto ${esc(p.veto.tipo)}</span>` : esc(p.tipoNome || 'Projeto de Lei')}</small></td><td>${esc(p.ementa)}</td><td><small>${esc(p.autor || '')}</small></td><td class="acoes-col"><button class="lgt-mini" type="button" onclick="lgvrVer('${p.id}')">Ler</button><button class="lgt-mini" type="button" data-edita onclick="lgvrVotar('${p.id}')">Registrar votação</button><button class="lgt-mini" type="button" data-edita onclick="lgvrRetirar('${p.id}')">Retirar de pauta</button></td></tr>`).join('') || '<tr><td colspan="4" class="lgt-vazio"><b>Nenhuma matéria na Ordem do Dia.</b><span>Use “Despachar proposições” para incluir.</span></td></tr>'}</tbody></table></div>`;
  }
  window.lgvrRetirar = function (id) { const a = exigePres(); if (!a) return; const p = listaProt().find(x => x.id === id); p.status = p.comissao ? 'comissao' : 'protocolado'; p.timeline.push({ date: agoraTL(), label: `Retirado da Ordem do Dia pelo Presidente (${a.v.nome})` }); persistirProt('Retirado de pauta', p); desenhar(); UI().aviso('Matéria retirada da pauta.'); };
  window.lgvrVotar = function (id) {
    const a = exigePres(); if (!a) return; const p = listaProt().find(x => x.id === id); if (p && p.veto && !p.veto.resultado) return votarVeto(p, a); const prox = sessoes()[0]; const n = comp().vereadores.length - 1;
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Votação · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <p class="lgt-p cheio">${esc(p.ementa)}</p>
      <label class="cheio"><span>Sessão</span><input name="sessao" value="${esc(prox ? prox.titulo + ' de ' + prox.quando.toLocaleDateString('pt-BR') : 'Sessão de ' + hojeBR())}"></label>
      <label><span>Favoráveis</span><input name="favor" type="number" min="0" max="${n + 1}" value="0" inputmode="numeric"></label><label><span>Contrários</span><input name="contra" type="number" min="0" max="${n + 1}" value="0" inputmode="numeric"></label>
      <label><span>Abstenções / ausentes</span><input name="abst" type="number" min="0" max="${n + 1}" value="0" inputmode="numeric"></label>
      <label id="lgvr-desemp" hidden><span>Empate: voto do Presidente *</span><select name="desempate"><option value="">Escolha…</option><option>Favorável</option><option>Contrário</option></select></label>
      <div class="lgf-saldo" id="lgvr-res"></div></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Proclamar resultado</button></div></form>`);
    const f = $('#lgt-modal form');
    const calc = () => { const fa = +f.favor.value || 0, co = +f.contra.value || 0, emp = fa === co && fa + co > 0; $('#lgvr-desemp').hidden = !emp; const de = f.desempate.value; const ok = emp ? de === 'Favorável' : fa > co; $('#lgvr-res').innerHTML = fa + co ? `<span>Resultado <b class="${ok ? '' : 'neg'}">${ok ? 'APROVADO' : 'REJEITADO'}</b></span><span>${fa} × ${co}</span>` : '<span>Informe os votos.</span>'; return { fa, co, emp, de, ok }; };
    f.oninput = () => { f.querySelector('.lgt-erro').textContent = ''; calc(); }; calc();
    f.onsubmit = e => { e.preventDefault(); const r = calc(); if (!(r.fa + r.co)) { f.querySelector('.lgt-erro').textContent = 'Informe os votos.'; return; } if (r.fa + r.co + (+f.abst.value || 0) > n + 1) { f.querySelector('.lgt-erro').textContent = 'Total de votos maior que o número de vereadores.'; return; } if (r.emp && !r.de) { f.querySelector('.lgt-erro').textContent = 'Em caso de empate, registre o voto de desempate do Presidente.'; return; }
      p.votacao = { favor: r.fa, contra: r.co, abst: +f.abst.value || 0, desempate: r.emp ? r.de : '', sessao: f.sessao.value.trim(), data: new Date().toISOString() };
      const placar = `${r.fa} a ${r.co}${r.emp ? ', desempate do Presidente' : ''}`;
      if (!r.ok) { p.status = 'rejeitado'; p.resultado = 'rejeitado'; p.timeline.push({ date: agoraTL(), label: `Rejeitado em votação (${placar}) — ${p.votacao.sessao}` }); }
      else { const fl = TIPOS[tipoDe(p)].fluxo; p.resultado = 'aprovado'; p.timeline.push({ date: agoraTL(), label: `Aprovado em votação (${placar}) — ${p.votacao.sessao}` });
        if (fl === 'simples') { p.status = 'concluido'; p.timeline.push({ date: agoraTL(), label: 'Encaminhado por ofício ao destinatário' }); } }
      persistirProt('Votação registrada', p); UI().fecharModal(); UI().aviso(r.ok ? 'Aprovado.' : 'Rejeitado.'); desenhar(); };
  };
  /* Apreciação do veto (guia, item 7): a Câmara mantém ou rejeita; rejeitado, o Presidente promulga */
  function votarVeto(p, a) {
    const total = comp().vereadores.length, abs = Math.floor(total / 2) + 1, prox = sessoes()[0];
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Apreciação do veto · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <p class="lgt-p cheio">${esc(p.ementa)}<br><b>Veto ${esc(p.veto.tipo)}</b> — ${esc(p.veto.razoes)}</p>
      <p class="lgvr-regra cheio">Para <b>rejeitar (derrubar) o veto</b> são necessários ${abs} votos (maioria absoluta dos ${total} vereadores), como na Constituição (art. 66, § 4º). Confirme o quórum na Lei Orgânica de Neves Paulista.</p>
      <label class="cheio"><span>Sessão</span><input name="sessao" value="${esc(prox ? prox.titulo + ' de ' + prox.quando.toLocaleDateString('pt-BR') : 'Sessão de ' + hojeBR())}"></label>
      <label><span>Pela rejeição do veto</span><input name="rej" type="number" min="0" max="${total}" value="0" inputmode="numeric"></label><label><span>Pela manutenção do veto</span><input name="man" type="number" min="0" max="${total}" value="0" inputmode="numeric"></label>
      <label><span>Abstenções / ausentes</span><input name="abst" type="number" min="0" max="${total}" value="0" inputmode="numeric"></label>
      <div class="lgf-saldo" id="lgvr-res"></div></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Proclamar resultado</button></div></form>`);
    const f = $('#lgt-modal form');
    const calc = () => { const r = +f.rej.value || 0, m = +f.man.value || 0, derrubado = r >= abs; $('#lgvr-res').innerHTML = r + m ? `<span>Resultado <b class="${derrubado ? '' : 'neg'}">${derrubado ? 'VETO REJEITADO' : 'VETO MANTIDO'}</b></span><span>${r} × ${m}</span>` : '<span>Informe os votos.</span>'; return { r, m, derrubado }; };
    f.oninput = calc; calc();
    f.onsubmit = e => { e.preventDefault(); const r = calc(); if (!(r.r + r.m)) { f.querySelector('.lgt-erro').textContent = 'Informe os votos.'; return; } if (r.r + r.m + (+f.abst.value || 0) > total) { f.querySelector('.lgt-erro').textContent = 'Total de votos maior que o número de vereadores.'; return; }
      p.veto.resultado = r.derrubado ? 'rejeitado' : 'mantido'; p.veto.votacao = { rejeicao: r.r, manutencao: r.m, abst: +f.abst.value || 0, sessao: f.sessao.value.trim(), data: new Date().toISOString() };
      if (r.derrubado) { p.status = 'aguardando_exec'; p.timeline.push({ date: agoraTL(), label: `Veto rejeitado pela Câmara (${r.r} a ${r.m}) — ${p.veto.votacao.sessao}; segue para promulgação` }); }
      else if (p.veto.tipo === 'parcial' && p.lei) { p.status = 'concluido'; p.timeline.push({ date: agoraTL(), label: `Veto parcial mantido (${r.r} a ${r.m}) — vale a ${p.lei} sem as partes vetadas` }); }
      else { p.status = 'rejeitado'; p.timeline.push({ date: agoraTL(), label: `Veto mantido pela Câmara (${r.r} a ${r.m}) — projeto arquivado` }); }
      persistirProt('Apreciação de veto', p); UI().fecharModal(); UI().aviso(r.derrubado ? 'Veto rejeitado. Promulgue a lei em “Autógrafos e promulgação”.' : 'Veto mantido.'); desenhar(); };
  }
  /* Executivo (guia, itens 7 a 9): sanção com publicação e vigência, ou veto */
  const campoVigencia = `<fieldset class="cheio lgvr-opts"><legend>Vigência</legend><label><input type="radio" name="vig" value="pub" checked> Na data da publicação</label><label><input type="radio" name="vig" value="data"> A partir de <input name="vigdata" type="date" style="height:32px;margin-left:6px"></label><label><input type="radio" name="vig" value="texto"> Outra regra prevista no texto <input name="vigtxt" placeholder="Ex.: 90 dias após a publicação" style="height:32px;margin-left:6px;min-width:220px"></label></fieldset>`;
  const lerVigencia = f => f.vig.value === 'data' && f.vigdata.value ? 'A partir de ' + f.vigdata.value.split('-').reverse().join('/') : f.vig.value === 'texto' && f.vigtxt.value.trim() ? f.vigtxt.value.trim() : 'Na data da publicação';
  window.lgvrSancao = function (id) {
    const a = exigePres(); if (!a) return; const p = listaProt().find(x => x.id === id);
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Sanção do Prefeito · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <p class="lgt-p cheio">Registre a lei sancionada, promulgada e publicada pelo Prefeito.</p>
      <label><span>Número da lei *</span><input name="lei" required placeholder="Ex.: 1850/2026"></label><label><span>Data da publicação *</span><input name="pub" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
      ${campoVigencia}</div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Registrar sanção</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = e => { e.preventDefault(); if (!f.lei.value.trim() || !f.pub.value) { f.querySelector('.lgt-erro').textContent = 'Informe o número da lei e a data da publicação.'; return; }
      const lei = 'Lei Municipal nº ' + f.lei.value.trim(), pub = f.pub.value.split('-').reverse().join('/');
      p.status = 'concluido'; p.lei = lei; p.publicacao = pub; p.vigencia = lerVigencia(f);
      p.timeline.push({ date: agoraTL(), label: 'Sancionado pelo Prefeito' }, { date: agoraTL(), label: `Promulgada e publicada como ${lei} em ${pub}` }, { date: agoraTL(), label: `Vigência: ${p.vigencia.toLowerCase()}` });
      persistirProt('Sanção registrada', p); UI().fecharModal(); UI().aviso(lei + ' registrada.'); desenhar(); };
  };
  window.lgvrVeto = function (id) {
    const a = exigePres(); if (!a) return; const p = listaProt().find(x => x.id === id);
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Veto do Prefeito · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <fieldset class="cheio lgvr-opts"><legend>Tipo de veto *</legend><label><input type="radio" name="tipo" value="total" checked> Total</label><label><input type="radio" name="tipo" value="parcial"> Parcial (o restante foi sancionado)</label></fieldset>
      <label class="cheio"><span>Razões do veto *</span><textarea name="razoes" rows="3" placeholder="Inconstitucionalidade ou contrariedade ao interesse público, conforme a mensagem do Prefeito."></textarea></label>
      <label><span>Recebido em</span><input name="data" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label class="lgvr-leiparc" hidden><span>Lei da parte sancionada</span><input name="lei" placeholder="Ex.: 1851/2026"></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Registrar veto e incluir na pauta</button></div></form>`);
    const f = $('#lgt-modal form'); f.querySelectorAll('[name=tipo]').forEach(r => r.onchange = () => { $('.lgvr-leiparc', f).hidden = f.tipo.value !== 'parcial'; });
    f.onsubmit = e => { e.preventDefault(); if (!f.razoes.value.trim()) { f.querySelector('.lgt-erro').textContent = 'Informe as razões do veto.'; return; }
      p.veto = { tipo: f.tipo.value, razoes: f.razoes.value.trim(), recebido: f.data.value.split('-').reverse().join('/') }; if (f.tipo.value === 'parcial' && f.lei.value.trim()) p.lei = 'Lei Municipal nº ' + f.lei.value.trim();
      p.status = 'votacao'; p.resultado = '';
      p.timeline.push({ date: agoraTL(), label: `Veto ${p.veto.tipo} do Prefeito recebido — ${p.veto.razoes}` }, { date: agoraTL(), label: 'Veto incluído na Ordem do Dia para apreciação da Câmara' });
      persistirProt('Veto recebido', p); UI().fecharModal(); UI().aviso('Veto registrado e incluído na Ordem do Dia.'); desenhar(); };
  };
  function tAutografos(a) {
    const prot = listaProt(); const aprov = prot.filter(p => p.status === 'votacao' && p.resultado === 'aprovado'); const exec = prot.filter(p => p.status === 'aguardando_exec');
    $('#view-lgvr-autografos').innerHTML = faixaDemo(a) + cab('Autógrafos e promulgação', 'Assinatura do Presidente nos projetos aprovados') +
      regra('Projeto de lei aprovado: o Presidente assina o autógrafo e o envia ao Prefeito, que sanciona ou veta. Sancionado, registre a lei, a publicação e a vigência. Vetado, o veto vai à Ordem do Dia; se a Câmara rejeitar o veto, ou se o Prefeito não se manifestar no prazo (sanção tácita), o Presidente promulga. Resoluções e decretos legislativos são promulgados pelo Presidente.') +
      `<h3 class="lgvr-h">Aprovados aguardando sua assinatura (${aprov.length})</h3><div class="lgvr-desps">${aprov.map(p => `<article class="lgvr-desp"><header><b>${esc(p.numero)}</b>${tag(p)}</header><h4>${esc(p.ementa)}</h4><p>${esc(p.tipoNome || 'Projeto de Lei')} · ${p.votacao ? `${p.votacao.favor} a ${p.votacao.contra}` : ''}</p><footer><button class="lgt-mini" type="button" onclick="lgvrVer('${p.id}')">Ler</button><button class="lgt-mini primario" type="button" data-edita onclick="lgvrAutografo('${p.id}')">${TIPOS[tipoDe(p)].fluxo === 'promulga' ? 'Promulgar' : 'Assinar autógrafo'}</button></footer></article>`).join('') || '<p class="lgt-p">Nada pendente.</p>'}</div>
      <h3 class="lgvr-h">Com o Prefeito: sanção ou veto (${exec.length})</h3><div class="lgvr-desps">${exec.map(p => `<article class="lgvr-desp"><header><b>${esc(p.numero)}</b>${tag(p)}</header><h4>${esc(p.ementa)}</h4><footer><button class="lgt-mini" type="button" onclick="lgvrVer('${p.id}')">Ler</button>${p.veto && p.veto.resultado === 'rejeitado' ? '' : `<button class="lgt-mini primario" type="button" data-edita onclick="lgvrSancao('${p.id}')">Sancionada</button><button class="lgt-mini" type="button" data-edita onclick="lgvrVeto('${p.id}')">Vetada</button>`}<button class="lgt-mini" type="button" data-edita onclick="lgvrPromulgarLei('${p.id}')">${p.veto && p.veto.resultado === 'rejeitado' ? 'Promulgar (veto rejeitado)' : 'Promulgar (sanção tácita)'}</button></footer></article>`).join('') || '<p class="lgt-p">Nenhum.</p>'}</div>`;
  }
  window.lgvrAutografo = function (id) {
    const a = exigePres(); if (!a) return; const p = listaProt().find(x => x.id === id); const T = TIPOS[tipoDe(p)];
    if (T.fluxo === 'promulga') {
      const ano = new Date().getFullYear(); const n = listaProt().filter(x => (x.lei || '').startsWith(T.ato + ' nº')).length + 1;
      return assinarDoc({ titulo: `Promulgação: ${T.ato} nº ${n}/${ano}`, arquivo: arq(`${T.ato} ${n} ${ano}`), docId: p.id + '-promulgacao', qualificada: true, doc: { tipo: T.ato, numero: `${String(n).padStart(2, '0')}/${ano}`, ementa: p.ementa, texto: `O PRESIDENTE DA CÂMARA MUNICIPAL DE NEVES PAULISTA, no uso de suas atribuições legais, faz saber que a Câmara Municipal aprovou e ele promulga a seguinte ${T.ato}:\n\n${p.texto || ''}` } }, a.v, ass => {
        p.status = 'concluido'; p.lei = `${T.ato} nº ${String(n).padStart(2, '0')}/${ano}`; p.vigencia = p.vigencia || 'Na data da publicação'; p.publicacao = hojeBR(); p.assinaturas = [...(p.assinaturas || []), ass];
        p.timeline.push({ date: agoraTL(), label: `Promulgado(a) pelo Presidente ${a.v.nome}: ${p.lei}` }); persistirProt('Promulgação', p); UI().aviso(p.lei + ' promulgado(a).'); desenhar(); });
    }
    const d = dados(); const num = d.seqAutografo + 1;
    assinarDoc({ titulo: `Autógrafo nº ${num}/${new Date().getFullYear()} — ${p.numero}`, arquivo: arq(`Autografo ${num} ${new Date().getFullYear()}`), docId: p.id + '-autografo', qualificada: true, doc: { tipo: 'Autógrafo', numero: `${num}/${new Date().getFullYear()}`, ementa: p.ementa, texto: `A CÂMARA MUNICIPAL DE NEVES PAULISTA aprovou${p.votacao ? ' na ' + p.votacao.sessao : ''} o ${p.tipoNome || 'Projeto de Lei'} nº ${(p.numero || '').split(' ')[1] || p.numero}, de autoria de ${p.autor || '—'}, que segue para sanção do Senhor Prefeito Municipal, nos seguintes termos:\n\n${p.texto || '(texto conforme o projeto aprovado)'}` } }, a.v, ass => {
      const dd = dados(); dd.seqAutografo = num; salvarDados(dd);
      p.status = 'aguardando_exec'; p.autografo = { numero: `${num}/${new Date().getFullYear()}`, assinatura: ass };
      p.timeline.push({ date: agoraTL(), label: `Autógrafo nº ${p.autografo.numero} assinado pelo Presidente e enviado ao Prefeito para sanção` });
      persistirProt('Autógrafo assinado', p); UI().aviso('Autógrafo assinado e enviado ao Executivo.'); desenhar(); });
  };
  window.lgvrPromulgarLei = function (id) {
    const a = exigePres(); if (!a) return; const p = listaProt().find(x => x.id === id);
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Promulgar lei · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <fieldset class="cheio lgvr-opts"><legend>Motivo *</legend><label><input type="radio" name="mot" value="Sanção tácita (prazo do Prefeito encerrado)" ${p.veto && p.veto.resultado === 'rejeitado' ? '' : 'checked'}> Sanção tácita (prazo do Prefeito encerrado)</label><label><input type="radio" name="mot" value="Veto rejeitado pela Câmara" ${p.veto && p.veto.resultado === 'rejeitado' ? 'checked' : ''}> Veto rejeitado pela Câmara</label></fieldset>
      <label class="cheio"><span>Número da lei *</span><input name="lei" required placeholder="Ex.: 1850/2026" value="${p.lei && p.veto && p.veto.tipo === 'parcial' ? esc(p.lei.replace('Lei Municipal nº ', '')) : ''}"></label>${campoVigencia}</div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Assinar e promulgar</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = e => { e.preventDefault(); if (!f.lei.value.trim()) { f.querySelector('.lgt-erro').textContent = 'Informe o número da lei.'; return; } const mot = f.mot.value, lei = 'Lei Municipal nº ' + f.lei.value.trim(), vig = lerVigencia(f); UI().fecharModal();
      assinarDoc({ titulo: `Promulgação: ${lei}`, arquivo: arq(lei), docId: p.id + '-lei', qualificada: true, doc: { tipo: 'Lei Municipal', numero: lei.replace('Lei Municipal nº ', ''), ementa: p.ementa, texto: `O PRESIDENTE DA CÂMARA MUNICIPAL DE NEVES PAULISTA, nos termos da Lei Orgânica do Município (${mot.toLowerCase()}), promulga a seguinte Lei:\n\n${p.texto || '(texto conforme o autógrafo)'}` } }, a.v, ass => { p.status = 'concluido'; p.lei = lei; p.vigencia = vig; p.publicacao = hojeBR(); p.assinaturas = [...(p.assinaturas || []), ass]; p.timeline.push({ date: agoraTL(), label: `${lei} promulgada pelo Presidente (${mot}) e publicada` }, { date: agoraTL(), label: `Vigência: ${vig.toLowerCase()}` }); persistirProt('Lei promulgada', p); UI().aviso(lei + ' promulgada.'); desenhar(); }); };
  };
  function tAtos(a) {
    const atos = dados().atos;
    $('#view-lgvr-atos').innerHTML = faixaDemo(a) + cab('Atos da Presidência', 'Portarias e atos administrativos assinados pelo Presidente', btn('+ Novo ato', 'lgvrNovoAto()')) +
      `<div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Número</th><th>Ementa</th><th>Assinado por</th><th class="acoes-col"></th></tr></thead><tbody>${atos.map(x => `<tr><td><b>${esc(x.tipoAto)} nº ${esc(x.numero)}</b><small>${esc(x.data)}</small></td><td>${esc(x.ementa)}</td><td><small>${esc(x.assinatura?.nome || '')}</small></td><td class="acoes-col">${window.lgsTemPDF && lgsTemPDF(x.id) ? `<button class="lgt-mini" type="button" onclick="lgsBaixarPDF('${x.id}','${esc(x.tipoAto)}-${esc(x.numero.replace('/', '-'))}-assinado.pdf')">PDF assinado</button>` : ''}<button class="lgt-mini" type="button" onclick="lgvrDocumento('${x.id}')">Ver</button></td></tr>`).join('') || '<tr><td colspan="4" class="lgt-vazio"><b>Nenhum ato assinado.</b><span>Portarias de nomeação, designação de comissões, férias, diárias etc.</span></td></tr>'}</tbody></table></div>`;
  }
  window.lgvrNovoAto = function () {
    const a = exigePres(); if (!a) return;
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Novo ato da Presidência</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <label><span>Tipo</span><select name="tipo"><option>Portaria</option><option>Ato da Presidência</option><option>Ofício</option></select></label>
      <label class="cheio"><span>Ementa *</span><input name="ementa" required placeholder="Ex.: Designa membros da Comissão de Licitação"></label>
      <label class="cheio"><span>Texto *</span><textarea name="texto" rows="6" required></textarea></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Gerar PDF e assinar</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = e => { e.preventDefault(); if (!f.ementa.value.trim() || !f.texto.value.trim()) { f.querySelector('.lgt-erro').textContent = 'Preencha ementa e texto.'; return; }
      const tipoAto = f.tipo.value, ementa = f.ementa.value.trim(), texto = f.texto.value.trim(); UI().fecharModal();
      const d0 = dados(); const ano0 = new Date().getFullYear(); const n0 = d0.atos.filter(x => x.tipoAto === tipoAto && x.numero.endsWith('/' + ano0)).length + 1; const atoId = uid('at');
      assinarDoc({ titulo: `${tipoAto} nº ${String(n0).padStart(3, '0')}/${ano0}`, arquivo: arq(`${tipoAto} ${n0} ${ano0}`), docId: atoId, qualificada: true, doc: { tipo: tipoAto, numero: `${String(n0).padStart(3, '0')}/${ano0}`, ementa, texto } }, a.v, ass => { const d = dados(); const ano = ano0; const n = n0;
        d.atos.unshift({ id: atoId, tipoAto, numero: `${String(n).padStart(3, '0')}/${ano}`, ementa, texto, data: hojeBR(), assinatura: ass }); salvarDados(d); UI().log('Presidência', `${tipoAto} ${n}/${ano}`); UI().aviso(`${tipoAto} nº ${n}/${ano} assinado(a).`); desenhar(); }); };
  };

  /* ================= publicação automática no Portal da Transparência ================= */
  function publicarTransparencia() {
    if (typeof transpLer !== 'function') return;
    try {
      const outros = transpLer().filter(i => i.origem !== 'legislativo'); const agora = new Date().toISOString(); const novos = [];
      const iso = br => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(br || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : agora.slice(0, 10); };
      listaProt().filter(p => p.origem === 'portal-vereador' || p.votacao || p.lei).forEach(p => {
        const d = iso(p.data);
        if (p.origem === 'portal-vereador') novos.push({ id: 'leg-p-' + p.id, origem: 'legislativo', cat: 'legislativo', sub: 'Projetos e tramitação', titulo: `${p.numero} — ${p.tipoNome}`, descricao: `${p.ementa} · Autor: ${p.autor} · Situação: ${statusTxt(p)}`, data: d, competencia: d.slice(0, 7), numero: p.numero, publicado: true, criadoEm: agora, atualizadoEm: agora });
        if (p.votacao) novos.push({ id: 'leg-v-' + p.id, origem: 'legislativo', cat: 'legislativo', sub: 'Votações nominais', titulo: `Votação — ${p.numero}`, descricao: `${p.ementa} · ${p.votacao.favor} favoráveis, ${p.votacao.contra} contrários, ${p.votacao.abst} abstenções/ausentes${p.votacao.desempate ? ', desempate do Presidente' : ''} · ${p.resultado === 'rejeitado' ? 'Rejeitado' : 'Aprovado'} · ${p.votacao.sessao}`, data: p.votacao.data.slice(0, 10), competencia: p.votacao.data.slice(0, 7), numero: p.numero, publicado: true, criadoEm: agora, atualizadoEm: agora });
        if (p.lei && p.status === 'concluido') novos.push({ id: 'leg-l-' + p.id, origem: 'legislativo', cat: 'legislativo', sub: 'Leis, resoluções e decretos legislativos', titulo: p.lei, descricao: `${p.ementa} · Origem: ${p.numero}`, data: agora.slice(0, 10), competencia: agora.slice(0, 7), numero: p.lei, publicado: true, criadoEm: agora, atualizadoEm: agora });
      });
      transpSalvar([...outros, ...novos]);
    } catch (e) { }
  }

  /* ================= USUÁRIOS: vereadores e Presidente (Procuradoria/Administrador) ================= */
  function desenharComposicao() {
    const view = $('#view-usuarios'); if (!view) return;
    let box = $('#lgvr-comp'); if (!box) { box = document.createElement('div'); box.id = 'lgvr-comp'; box.className = 'lgt lgvr-comp-box'; const lh = view.querySelector('.letterhead'); lh ? lh.after(box) : view.prepend(box); }
    const pode = ehGestor(); const c = comp(); const users = (typeof lgUsers === 'function' ? lgUsers() : []).filter(u => u.ativo !== false && u.orgao !== 'exec' && u.perfil !== 'admin');
    const presAtual = verPorId(c.presidente);
    box.innerHTML = `<div class="lgt-card lgvr-comp">
      <div class="lgvr-card-cab"><div><h3>${ic('vereador')} Vereadores e Presidente da Câmara</h3><p class="lgt-p">Ligue cada vereador ao seu usuário de acesso e marque quem é o <b>Presidente</b>. Só é possível marcar um. Para trocar, marque o novo Presidente e salve: as funções passam na hora para o usuário dele.</p></div>
        <div class="lgvr-pres-atual"><small>Presidente atual</small><b>${esc(presAtual ? presAtual.completo : '—')}</b></div></div>
      ${pode ? '' : '<p class="lgvr-regra">Somente a Procuradoria ou o administrador alteram esta composição.</p>'}
      <form id="lgvr-comp-f"><div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Presidente</th><th>Vereador</th><th>Usuário de acesso</th><th class="acoes-col"></th></tr></thead><tbody>
      ${c.vereadores.map(v => `<tr class="${v.id === c.presidente ? 'lgvr-sel' : ''}"><td><label class="lgvr-radio"><input type="radio" name="pres" value="${v.id}" ${v.id === c.presidente ? 'checked' : ''} ${pode ? '' : 'disabled'} aria-label="Presidente: ${esc(v.nome)}"><span>${v.id === c.presidente ? 'Presidente' : ''}</span></label></td>
        <td><b>${esc(v.completo)}</b><small>${esc(v.nome)} · ${esc(v.partido)}</small></td>
        <td><select name="u-${v.id}" ${pode ? '' : 'disabled'} aria-label="Usuário de ${esc(v.nome)}"><option value="">— sem usuário —</option>${users.map(u => `<option value="${esc(u.usuario)}" ${v.usuario && v.usuario.toLowerCase() === u.usuario.toLowerCase() ? 'selected' : ''}>${esc(u.nome)} (${esc(u.usuario)})</option>`).join('')}</select></td>
        <td class="acoes-col">${pode && !v.usuario ? `<button class="lgt-mini" type="button" onclick="lgvrCriarUsuario('${v.id}')">Criar usuário</button>` : ''}${pode ? `<button class="lgt-mini" type="button" onclick="lgvrRemoverVereador('${v.id}')" title="Remover (ex.: licença, suplente assumiu)">Remover</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      ${pode ? `<div class="lgt-acoes lgvr-comp-acoes"><button class="lgt-btn" type="button" onclick="lgvrAddVereador()">+ Adicionar vereador (suplente)</button><button class="lgt-btn" type="button" onclick="lgvrCriarTodos()">Criar usuários que faltam</button><button class="lgt-btn primario" type="submit">Salvar composição</button></div>` : ''}</form>
      <details class="lgvr-hist"><summary>Histórico da Presidência (${c.historico.length})</summary><ol class="lgvr-tempo">${c.historico.slice().reverse().map(h => `<li><span>${new Date(h.data).toLocaleString('pt-BR')}</span><b>${esc(h.texto)}</b><small>${esc(h.por)}</small></li>`).join('')}</ol></details>
      <details class="lgvr-hist"><summary>O que o Presidente pode fazer a mais que os vereadores</summary><ul class="lgvr-dif">
        <li><b>Despachar proposições</b>: recebe o que foi protocolado e envia à Procuradoria, às comissões, à Ordem do Dia ou devolve ao autor.</li>
        <li><b>Ordem do Dia e votação</b>: organiza a pauta, registra a votação e proclama o resultado (vota só no desempate e nos casos do Regimento).</li>
        <li><b>Autógrafos e promulgação</b>: assina o autógrafo dos projetos aprovados para o Prefeito; promulga resoluções, decretos legislativos e leis com sanção tácita ou veto rejeitado.</li>
        <li><b>Atos da Presidência</b>: portarias e atos administrativos; ordenador de despesa no Financeiro (consulta).</li>
        <li>Todos os vereadores: criar proposituras, assinar com gov.br, coautoria, pauta e andamento das matérias.</li></ul></details></div>`;
    const f = $('#lgvr-comp-f');
    f.querySelectorAll('input[name=pres]').forEach(r => r.onchange = () => f.querySelectorAll('tbody tr').forEach(tr => { const sel = tr.querySelector('input[name=pres]').checked; tr.classList.toggle('lgvr-sel', sel); tr.querySelector('.lgvr-radio span').textContent = sel ? 'Presidente' : ''; }));
    f.onsubmit = e => { e.preventDefault(); salvarComposicao(f); };
  }
  function salvarComposicao(f) {
    if (!ehGestor()) return UI().aviso('Somente a Procuradoria ou o administrador.', 'erro');
    const c = comp(); const usados = {};
    for (const v of c.vereadores) { const val = f.querySelector(`[name="u-${v.id}"]`).value; if (val) { const k = val.toLowerCase(); if (usados[k]) return UI().aviso(`O usuário "${val}" foi ligado a dois vereadores.`, 'erro'); usados[k] = 1; } }
    const novoPres = f.querySelector('input[name=pres]:checked')?.value || '';
    const trocou = novoPres !== c.presidente;
    const aplicar = () => {
      const cc = comp(); cc.vereadores.forEach(v => { v.usuario = f.querySelector(`[name="u-${v.id}"]`).value; });
      const por = (usuario() || {}).nome || '';
      if (trocou) { const de = verPorId(cc.presidente)?.nome || '—', para = cc.vereadores.find(v => v.id === novoPres)?.nome || '—'; cc.presidente = novoPres; cc.historico.push({ data: new Date().toISOString(), texto: `Presidente alterado: ${de} → ${para}`, por });
        try { const fin = JSON.parse(localStorage.getItem('lgf_v1') || 'null'); const pv = cc.vereadores.find(v => v.id === novoPres); if (fin && fin.param && pv) { fin.param.ordenador = pv.completo; fin.param.cargoOrdenador = 'Presidente da Câmara'; localStorage.setItem('lgf_v1', JSON.stringify(fin)); } } catch (e) { } }
      gravar(COMP_KEY, cc); UI().log('Composição da Câmara', trocou ? 'Presidente alterado' : 'Vereadores atualizados');
      UI().fecharModal?.(); UI().aviso(trocou ? 'Presidente alterado. As funções já valem para o novo usuário.' : 'Composição salva.');
      if (window.lgtAplicarPermissoes) lgtAplicarPermissoes(); desenharComposicao();
    };
    if (!trocou) return aplicar();
    const de = verPorId(c.presidente)?.completo || '—', para = c.vereadores.find(v => v.id === novoPres)?.completo || '—';
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Trocar o Presidente da Câmara?</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <p class="lgt-p" style="padding:6px 22px 4px">De <b>${esc(de)}</b> para <b>${esc(para)}</b>.</p><p class="lgt-p" style="padding:0 22px 10px">As funções de Presidente (despacho, pauta, autógrafos, promulgação e atos) saem do usuário atual e passam para o novo. A troca fica registrada no histórico.</p>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="button" class="lgt-btn primario" id="lgvr-ok">Confirmar troca</button></div></div>`);
    $('#lgvr-ok').onclick = aplicar;
  }
  function criarUsuario(v) {
    if (typeof lgUsers !== 'function') return null; const a = lgUsers(); let login = v.sugestao || v.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    let n = 1, base = login; while (a.some(u => u.usuario.toLowerCase() === login.toLowerCase())) login = base + (++n);
    a.push({ id: 'usr-' + login, usuario: login, senha: '123456', nome: v.completo, cargo: 'Vereador', setor: 'Gabinete', orgao: 'cam', perfil: 'usuario', municipio: 'Neves Paulista — SP', ativo: true, trocarSenha: true });
    lgSaveUsers(a); v.usuario = login; return login;
  }
  window.lgvrCriarUsuario = id => { if (!ehGestor()) return; const c = comp(); const v = c.vereadores.find(x => x.id === id); const l = criarUsuario(v); gravar(COMP_KEY, c); UI().aviso(`Usuário criado: ${l} · senha provisória 123456`); desenharComposicao(); };
  window.lgvrCriarTodos = () => { if (!ehGestor()) return; const c = comp(); const feitos = c.vereadores.filter(v => !v.usuario).map(v => criarUsuario(v)); gravar(COMP_KEY, c); UI().aviso(feitos.length ? `${feitos.length} usuário(s) criado(s). Senha provisória: 123456` : 'Todos os vereadores já têm usuário.'); desenharComposicao(); };
  window.lgvrRemoverVereador = id => { if (!ehGestor()) return; const c = comp(); if (id === c.presidente) return UI().aviso('Marque outro Presidente antes de remover este vereador.', 'erro'); const v = c.vereadores.find(x => x.id === id);
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Remover ${esc(v.nome)}?</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><p class="lgt-p" style="padding:6px 22px 10px">O usuário dele perde o acesso ao Portal do Vereador. As proposituras já protocoladas continuam no sistema.</p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="button" class="lgt-btn perigo" id="lgvr-ok">Remover</button></div></div>`);
    $('#lgvr-ok').onclick = () => { const cc = comp(); cc.vereadores = cc.vereadores.filter(x => x.id !== id); cc.historico.push({ data: new Date().toISOString(), texto: `Vereador removido da composição: ${v.nome}`, por: (usuario() || {}).nome || '' }); gravar(COMP_KEY, cc); UI().fecharModal(); desenharComposicao(); }; };
  window.lgvrAddVereador = () => { if (!ehGestor()) return;
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Adicionar vereador</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos"><label class="cheio"><span>Nome completo *</span><input name="completo" required></label><label><span>Nome parlamentar *</span><input name="nome" required></label><label><span>Partido</span><input name="partido"></label></div><p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Adicionar</button></div></form>`);
    const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); if (!f.completo.value.trim() || !f.nome.value.trim()) { f.querySelector('.lgt-erro').textContent = 'Informe os nomes.'; return; } const c = comp(); c.vereadores.push({ id: uid('v'), nome: f.nome.value.trim(), completo: f.completo.value.trim(), partido: f.partido.value.trim(), usuario: '' }); c.historico.push({ data: new Date().toISOString(), texto: `Vereador incluído: ${f.nome.value.trim()}`, por: (usuario() || {}).nome || '' }); gravar(COMP_KEY, c); UI().fecharModal(); desenharComposicao(); }; };

  /* ================= API para módulos irmãos (comissões) ================= */
  window.lgvrAPI = { comp, gravar, COMP_KEY, atual, podeEditar, ehGestor, assinarDoc, arq, agoraTL, hojeBR, listaProt, persistirProt, verPorId, TIPOS, tipoDe, UI, esc, ic, cab, btn, faixaDemo, regra, tag, statusTxt, uid, redesenhar: () => desenhar(), tela: () => tela, usuario };

  /* ================= estilos ================= */
  const css = document.createElement('style'); css.id = 'lgvr-style'; css.textContent = `
  html.lgvr-consulta .lgvr [data-edita],html.lgvr-consulta .lgt-modal [data-edita]{display:none!important}
  .lgvr-n[hidden]{display:none!important}
  .lgvr-n{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#e2aa1c;color:#111;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
  .lgvr-demo-faixa{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;margin-bottom:14px;border-radius:10px;border:1px dashed rgba(139,156,255,.6);background:rgba(139,156,255,.08);font-size:13px;color:var(--lg28-ink)}
  .lgvr-demo-faixa > span{display:inline-flex;align-items:center;gap:6px}.lgvr-demo-faixa .lgv31-ic{width:16px;height:16px;flex-basis:16px}
  .lgvr-demo-faixa select{height:34px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);padding:0 10px;font:inherit;font-size:16px}
  .lgvr-demo-faixa small{color:var(--lg28-muted);flex-basis:100%}
  .lgvr-hero{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:22px;border-radius:16px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);margin-bottom:14px}
  .lgvr-hero > div:nth-child(2){flex:1;min-width:200px}
  .lgvr-hero small{color:var(--lg28-muted);font-size:13px;font-weight:600}
  .lgvr-hero h1{margin:4px 0 2px!important;font-size:24px!important;line-height:1.2}
  .lgvr-hero p{margin:0;color:var(--lg28-muted);font-size:13.5px}
  .lgvr-av{width:64px;height:64px;border-radius:50%;background:var(--lg28-inset);border:2px solid #8b9cff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;color:var(--lg28-ink);flex:0 0 64px}
  .lgvr-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
  .lgvr-kpis button,.lgvr-pres-g button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:14px 16px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);cursor:pointer;text-align:left;font:inherit}
  .lgvr-kpis button:hover,.lgvr-pres-g button:hover{border-color:var(--lg28-muted)}
  .lgvr-kpis b,.lgvr-pres-g b{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
  .lgvr-kpis span,.lgvr-pres-g span{font-size:12.5px;color:var(--lg28-muted)}
  .lgvr-kpis .k-alerta{border-color:#e2aa1c}.lgvr-kpis .k-alerta b{color:#e2aa1c}
  .lgvr-pres{margin-bottom:14px;border-color:rgba(226,170,28,.45)!important}
  .lgvr-pres-g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .lgvr-pres-g button{background:var(--lg28-inset)}
  .lgvr-card-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
  .lgvr-card-cab h3{margin:0!important;display:flex;align-items:center;gap:8px}.lgvr-card-cab h3 .lgv31-ic{width:18px;height:18px;flex-basis:18px}
  .lgvr-sub{font-size:12.5px;color:var(--lg28-muted)}
  .lgvr-grade{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}
  .lgvr-tempo{list-style:none;margin:0;padding:0 0 0 16px;border-left:2px solid var(--lg28-stroke)}
  .lgvr-tempo li{position:relative;padding:3px 0 11px 8px;font-size:13px}
  .lgvr-tempo li::before{content:"";position:absolute;left:-23px;top:8px;width:10px;height:10px;border-radius:50%;background:#8b9cff;border:2px solid var(--lg28-panel)}
  .lgvr-tempo span{display:block;color:var(--lg28-muted);font-size:12px;font-variant-numeric:tabular-nums}.lgvr-tempo small{display:block;color:var(--lg28-muted)}.lgvr-tempo a{color:inherit}
  .lgvr-sessao{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--lg28-stroke)}.lgvr-sessao:last-of-type{border-bottom:0}
  .lgvr-sessao small{display:block;color:var(--lg28-muted);font-size:12.5px}
  .lgvr-dia{width:46px;height:50px;border-radius:10px;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 46px}
  .lgvr-dia b{font-size:18px;line-height:1}.lgvr-dia span{font-size:11px;color:var(--lg28-muted);text-transform:uppercase}
  .lgvr-aviso{display:flex;align-items:center;gap:10px;margin-top:12px;padding:12px;border-radius:10px;background:rgba(226,170,28,.1);border:1px solid rgba(226,170,28,.4)}
  .lgvr-aviso span{flex:1}.lgvr-aviso b{display:block;font-size:13.5px}.lgvr-aviso small{color:var(--lg28-muted)}.lgvr-aviso > .lgv31-ic{color:#e2aa1c}
  .lgvr-tag{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:700;white-space:nowrap;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);color:var(--lg28-ink);vertical-align:middle}
  .lgvr-tag.t-ok{background:rgba(47,191,113,.14);border-color:transparent;color:#1f9d5c}.lgvr-tag.t-av{background:rgba(226,170,28,.16);border-color:transparent;color:#b8860b}
  .lgvr-tag.t-an{background:rgba(139,156,255,.16);border-color:transparent;color:#6f7fe8}.lgvr-tag.t-vo{background:rgba(57,189,246,.14);border-color:transparent;color:#1b8fc4}.lgvr-tag.t-er{background:rgba(229,72,77,.14);border-color:transparent;color:#e5484d}
  .lgvr-click{cursor:pointer}.lgvr-click:hover td{background:rgba(127,127,127,.06)}
  .lgvr-tipos{border:1px solid var(--lg28-stroke);border-radius:10px;padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0}
  .lgvr-tipos legend,.lgvr-coaut legend,.lgvr-opts legend{font-size:12.5px;font-weight:600;color:var(--lg28-muted);padding:0 6px}
  .lgvr-tipo{display:flex!important;flex-direction:row!important;gap:8px!important;align-items:flex-start;padding:10px;border:1px solid var(--lg28-stroke);border-radius:9px;cursor:pointer}
  .lgvr-tipo:has(input:checked){border-color:#8b9cff;background:rgba(139,156,255,.08)}
  .lgvr-tipo b{display:block;color:var(--lg28-ink);font-size:13.5px}.lgvr-tipo small{display:block;font-weight:400;font-size:12px;color:var(--lg28-muted);line-height:1.4}
  .lgvr-coaut,.lgvr-opts{border:1px solid var(--lg28-stroke);border-radius:10px;padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px 18px;margin:0}
  .lgvr-coaut label,.lgvr-opts label{display:flex!important;flex-direction:row!important;align-items:center;gap:8px!important;font-weight:500;color:var(--lg28-ink);font-size:13.5px}
  .lgvr-opts{flex-direction:column}
  .lgvr-link{border:0;background:none;padding:0;color:inherit;text-decoration:underline;font:inherit;cursor:pointer;font-weight:700}
  .lgvr-coms[hidden]{display:none!important}.lgvr-com-op{align-items:flex-start!important}.lgvr-com-op input{margin-top:3px}.lgvr-com-op b{display:block;font-size:13.5px}.lgvr-com-op small{display:block;color:var(--lg28-muted);font-weight:400;font-size:12px;line-height:1.4}
  .lgvr-det{padding:14px 22px}.lgvr-det h3{margin:4px 0 12px!important;font-size:17px!important;line-height:1.35}.lgvr-det h4{margin:16px 0 8px!important;font-size:13.5px!important}
  .lgvr-tipo-l{margin:0;color:var(--lg28-muted);font-size:12.5px;font-weight:600}
  .lgvr-det details summary{cursor:pointer;font-weight:600;font-size:13.5px;margin-bottom:8px}
  .lgvr-texto{padding:12px 14px;border-radius:10px;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);font-size:13.5px;line-height:1.6;white-space:normal;max-height:280px;overflow:auto}
  .lgvr-ass{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
  .lgvr-ass li{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;border:1px solid rgba(47,191,113,.4);background:rgba(47,191,113,.06)}
  .lgvr-ass li.pend{border-color:rgba(226,170,28,.45);background:rgba(226,170,28,.06)}
  .lgvr-ass b{display:block;font-size:13.5px}.lgvr-ass small{display:block;color:var(--lg28-muted);font-size:12px;word-break:break-all}.lgvr-ass .lgv31-ic{color:#2fbf71;margin-top:2px}.lgvr-ass .pend .lgv31-ic{color:#e2aa1c}
  .lgvr-rod{flex-wrap:wrap}
  .lgvr-gov-c{padding:12px 22px}
  .lgvr-doc{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset)}
  .lgvr-doc b{display:block;font-size:14px}.lgvr-doc small{color:var(--lg28-muted)}
  .lgvr-passos{margin:14px 0;padding-left:20px;font-size:13.5px;line-height:1.6;color:var(--lg28-ink)}
  .lgvr-demo{margin:0;padding:10px 12px;border-radius:10px;border:1px dashed rgba(226,170,28,.5);color:var(--lg28-muted);font-size:12.5px}
  .lgvr-codigo{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:13px}
  .lgvr-codigo input{height:52px;font-size:24px!important;letter-spacing:.4em;text-align:center;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);font-variant-numeric:tabular-nums}
  .lgvr-listas{display:grid;gap:14px}
  .lgvr-item{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--lg28-stroke);flex-wrap:wrap}.lgvr-item:last-child{border-bottom:0}
  .lgvr-item > div{flex:1;min-width:200px}.lgvr-item b{display:block}.lgvr-item small{color:var(--lg28-muted)}
  .lgvr-linha{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;width:100%;text-align:left;padding:10px 0;border:0;border-bottom:1px solid var(--lg28-stroke);background:transparent;color:var(--lg28-ink);cursor:pointer;font:inherit}
  .lgvr-linha span{font-size:13.5px}.lgvr-linha small{grid-column:2;color:var(--lg28-muted);font-size:12px}.lgvr-linha:hover span{text-decoration:underline}
  .lgvr-regra{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);color:var(--lg28-muted);font-size:13px;line-height:1.5;margin:0 0 16px}
  .lgvr-regra .lgv31-ic{flex:0 0 18px;width:18px;height:18px;color:#8b9cff;margin-top:1px}
  .lgvr-h{margin:18px 0 10px!important;font-size:15px!important}
  .lgvr-desps{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
  .lgvr-desp{padding:14px 16px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);display:flex;flex-direction:column;gap:8px}
  .lgvr-desp header{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
  .lgvr-desp h4{margin:0!important;font-size:14px!important;line-height:1.4}.lgvr-desp p{margin:0;color:var(--lg28-muted);font-size:12.5px}
  .lgvr-desp footer{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.lgvr-desp footer .lgt-mini{margin:0}
  .lgt-mini.primario{background:#e2aa1c;border-color:#e2aa1c;color:#111}
  .lgvr-comp-box{margin:0 0 18px}
  .lgvr-comp .lgt-p{max-width:75ch}
  .lgvr-pres-atual{padding:10px 14px;border-radius:10px;border:1px solid rgba(226,170,28,.5);background:rgba(226,170,28,.08)}
  .lgvr-pres-atual small{display:block;font-size:11.5px;color:var(--lg28-muted);text-transform:uppercase;letter-spacing:.05em}.lgvr-pres-atual b{font-size:14.5px}
  .lgvr-comp select{height:36px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:0 8px;font:inherit;max-width:100%}
  .lgvr-radio{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:12.5px;color:#e2aa1c}
  .lgvr-radio input{width:20px;height:20px;accent-color:#e2aa1c}
  .lgvr-comp tr.lgvr-sel td{background:rgba(226,170,28,.07)}
  .lgvr-comp-acoes{margin-top:12px;justify-content:flex-end}
  .lgvr-hist{margin-top:12px}.lgvr-hist summary{cursor:pointer;font-weight:600;font-size:13.5px;color:var(--lg28-ink)}.lgvr-hist .lgvr-tempo{margin-top:10px}
  .lgvr-dif{margin:10px 0 0;padding-left:18px;font-size:13.5px;line-height:1.6;color:var(--lg28-ink)}
  @media(max-width:1000px){.lgvr-grade{grid-template-columns:1fr}.lgvr-kpis,.lgvr-pres-g{grid-template-columns:1fr 1fr}.lgvr-tipos{grid-template-columns:1fr 1fr}}
  @media(max-width:600px){.lgvr-tipos{grid-template-columns:1fr}.lgvr-hero{padding:16px}.lgvr-hero h1{font-size:20px!important}.lgvr-det{padding:12px 16px}.lgvr-gov-c{padding:12px 16px}.lgvr-desps{grid-template-columns:1fr}.lgvr-comp-acoes .lgt-btn{flex:1 1 100%;justify-content:center}}`;
  document.head.appendChild(css);

  /* ================= usuários de teste (pedido do Ricardo, 11/11/2026) =================
     Ricardo  — Administrador (todos os painéis)          · Vinicius — Procurador (Administrativo + usuários)
     Erika    — Secretaria (Administrativo, protocolos)    · Ednilson — Presidente da Câmara (Portal do Vereador)
     André    — Tesoureiro (Financeiro + Transparência)
     Aplicado uma vez por navegador; depois, quem manda é a Procuradoria (Usuários / Áreas e acessos). */
  function cadastrosTeste() {
    if (typeof lgUsers !== 'function' || typeof lgSaveUsers !== 'function') return;
    let flag = false; try { flag = localStorage.getItem('lg_seed_perfis_v2') === '1'; } catch (e) { }
    const us = lgUsers(); let mudou = false;
    const achar = l => us.find(u => String(u.usuario).toLowerCase() === l);
    const garantir = (login, dados, forcar) => { const u = achar(login);
      if (!u) { us.push({ id: 'usr-' + login, usuario: login, senha: '123456', municipio: 'Neves Paulista — SP', orgao: 'cam', ativo: true, teste: true, ...dados }); mudou = true; }
      else if (forcar) { Object.assign(u, dados, { ativo: true }); mudou = true; } };
    garantir('vinicius', { nome: 'Vinicius', cargo: 'Procurador Jurídico', setor: 'Procuradoria Legislativa', perfil: 'procurador' }, !flag);
    garantir('erika', { nome: 'Erika', cargo: 'Secretária', setor: 'Secretaria Legislativa', perfil: 'secretaria' }, !flag);
    garantir('ednilson', { nome: 'Edenilson Roselli', cargo: 'Presidente da Câmara', setor: 'Gabinete da Presidência', perfil: 'vereador' }, !flag);
    garantir('andre', { nome: 'André', cargo: 'Tesoureiro', setor: 'Tesouraria e Transparência', perfil: 'financeiro' }, !flag);
    if (mudou) lgSaveUsers(us);
    if (flag) return;
    const c = comp();
    // Vinicius deixa de ser vereador de teste; Presidente volta a ser o Edenilson, com o login "ednilson"
    const antes = c.vereadores.find(v => v.id === 'vteste');
    c.vereadores = c.vereadores.filter(v => v.id !== 'vteste' && v.usuario !== 'vinicius');
    const ed = c.vereadores.find(v => v.id === 'v56'); if (ed) ed.usuario = 'ednilson';
    if (c.presidente === 'vteste' || antes) c.presidente = 'v56';
    c.historico.push({ data: new Date().toISOString(), texto: 'Usuários de teste por cargo: Edenilson Roselli (login ednilson) é o Presidente; Vinicius passa a ser o Procurador.', por: 'Sistema' });
    gravar(COMP_KEY, c);
    // login antigo do Presidente fica desativado para não sobrar sem vínculo
    const rs = achar('roselli'); if (rs && rs.ativo !== false) { rs.ativo = false; lgSaveUsers(us); }
    try { localStorage.setItem('lg_seed_perfis_v2', '1'); } catch (e) { }
  }

  /* Acompanhar matérias também em outros painéis (ex.: Financeiro), só consulta */
  window.lgvrMateriasConsulta = function (marca) {
    criarTelas(); tela = 'materias'; gotoShared('lgvr-materias'); if (window.lgv31Mark) lgv31Mark(marca || 'verMaterias');
    tMaterias({ v: {}, demo: false }); scrollTo(0, 0);
  };

  /* ================= ganchos ================= */
  function iniciar() {
    comp(); cadastrosTeste(); criarTelas(); integrarAdministrativo();
    const gs = window.gotoShared;
    if (typeof gs === 'function' && !gs.__lgvr) {
      const w = function (v, ...r) {
        const u = usuario(), adm = !!(u && u.orgao === 'ambos');
        if (v === 'usuarios' && !adm && ehGestor(u)) {
          // Procuradoria: abre só o quadro de vereadores/Presidente (a lista de toda a plataforma é do administrador)
          document.querySelectorAll('.view').forEach(x => { x.classList.remove('active'); x.style.display = 'none'; });
          const t = $('#view-usuarios'); t.classList.add('active'); t.style.display = 'block';
          const lista = $('#usuarios-por-municipio'); if (lista) lista.hidden = true;
          if (window.lgv31Mark) lgv31Mark('usuarios'); desenharComposicao(); return;
        }
        const x = gs.call(this, v, ...r);
        if (v === 'usuarios') { const lista = $('#usuarios-por-municipio'); if (lista) lista.hidden = false; setTimeout(desenharComposicao, 0); }
        return x;
      }; w.__lgvr = true; window.gotoShared = w; }
    if (window.lgv33Render) lgv33Render();
    // sessão reaberta (recarregar a página / nova aba): volta ao painel que estava em uso, ou pergunta qual painel
    // (espera o início padrão do painel, que abre a tela inicial do Administrativo aos 250 ms)
    setTimeout(() => { if (usuario() && window.lgtAreasPermitidas) {
      let area = ''; try { area = sessionStorage.getItem('lg_area') || ''; } catch (e) { }
      const ok = lgtAreasPermitidas();
      if (!area && window.lgpEscolherPainel) lgpEscolherPainel();
      else if (ok.includes(area)) { if (area !== 'legislativo' && window.lgv33TrocarArea) lgv33TrocarArea(area); }
      else if (ok.length && window.lgv33TrocarArea) lgv33TrocarArea(ok[0]);
    } }, 420);
    addEventListener('storage', e => { if (e.key === COMP_KEY && window.lgv33Render) lgv33Render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 90)); else setTimeout(iniciar, 90);
})();
