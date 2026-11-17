/* =====================================================================
   LegislaGov — PROTOCOLO
   Tudo o que entra e sai da Câmara recebe um número oficial (por tipo e ano), dado pelo servidor.
   · Protocolar: tipo, de onde veio, para quem vai, assunto, anexos (arquivo ou foto do celular).
   · Comprovante para imprimir ou entregar a quem trouxe o documento.
   · Andamento: encaminhar para outro setor, concluir, reabrir, anexar mais arquivos.
   · Reservar número (ofício que ainda vai ser escrito) e registrar documento antigo com número manual.
   Dados: lgv9_numeracao_v1 (lista, igual ao formato anterior) e lgv9_setores_v1 (setores).
   ===================================================================== */
(function () {
  const KEY = 'lgv9_numeracao_v1', SET = 'lgv9_setores_v1';
  const SETORES_BASE = ['Protocolo', 'Secretaria', 'Procuradoria Legislativa', 'Presidente da Câmara', 'Vereadores', 'Contabilidade', 'Tesouraria', 'Externo — Prefeitura Municipal'];
  const FORA = '__fora__';
  const TIPOS = [
    ['Documento recebido', 'Carta, pedido ou documento que chegou de fora'],
    ['Ofício', 'Ofício enviado ou recebido'],
    ['Requerimento', 'Pedido formal'],
    ['Projeto de Lei', 'Vai para a tramitação da Câmara'],
    ['Indicação', 'Sugestão ao Executivo'],
    ['Moção', 'Aplauso, apoio ou pesar'],
    ['Memorando', 'Comunicação interna'],
    ['Portaria', 'Ato da Presidência'],
    ['Outro', 'Qualquer outro documento'],
  ];
  const ST = { registrado: ['Em andamento', 'and'], encaminhado: ['Em andamento', 'and'], concluido: ['Concluído', 'ok'], reservado: ['Número reservado', 'res'], rascunho: ['Rascunho', 'res'] };
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const UI = () => window.lgtUI;
  const aviso = (m, t) => UI() ? UI().aviso(m, t) : alert(m);
  const eu = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const meuNome = () => (eu() && (eu().nome || eu().usuario)) || 'Usuário';
  const municipio = () => { try { return (typeof municipioAtual !== 'undefined' && municipioAtual) ? municipioAtual.replace(/\s[—-]\s[A-Z]{2}$/, '') : 'Neves Paulista'; } catch (e) { return 'Neves Paulista'; } };
  const registros = () => ler(KEY, []).filter(x => x && x.id);
  const setores = () => { const s = ler(SET, null); return Array.isArray(s) && s.length ? s : SETORES_BASE; };
  const quando = iso => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const numero = r => `${r.type} ${r.number}`;
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');

  function gravar(lista) {
    try { localStorage.setItem(KEY, JSON.stringify(lista)); return true; }
    catch (e) { aviso('Não foi possível gravar. Tente de novo.', 'erro'); return false; }
  }
  function atualizar(id, fn) { const l = registros(); const r = l.find(x => x.id === id); if (!r) return null; fn(r); return gravar(l) ? r : null; }

  async function pedirNumero(tipo, ano, manual) {
    try {
      const r = await fetch('/api/protocolo/numero', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-LG': '1' }, body: JSON.stringify({ tipo, ano, manual: manual || null }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.numero) return d.numero;
      if (r.status === 409 || r.status === 403) throw new Error(d.erro || 'Número recusado.');
      if (r.status !== 404) throw new Error(d.erro || 'O servidor não respondeu.');
    } catch (e) { if (!/Failed to fetch|NetworkError|404/.test(e.message)) throw e; }
    // sem servidor (cópia local): próximo da lista
    const usados = registros().filter(x => x.type === tipo && +x.year === +ano).map(x => +x.sequence);
    if (manual) { if (usados.includes(+manual)) throw new Error(`O número ${manual} já foi usado em ${tipo} ${ano}.`); return +manual; }
    return Math.max(0, ...usados) + 1;
  }
  const lerArquivo = f => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; r.readAsDataURL(f); });

  /* ================= tela ================= */
  let filtro = { q: '', st: 'todos', tipo: '', ano: '' };
  function criarView() {
    if ($('#view-lgpr')) return;
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main) return;
    main.insertAdjacentHTML('beforeend', '<section class="view lgt lgpr" id="view-lgpr" style="display:none"></section>');
    const nav = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    if (nav) { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lgpr'; b.hidden = true; b.style.display = 'none'; nav.appendChild(b); }
  }
  window.lgprAbrir = function (id) {
    criarView();
    if (typeof gotoShared === 'function') gotoShared('lgpr'); else { document.querySelectorAll('section.view').forEach(s => s.style.display = 'none'); $('#view-lgpr').style.display = 'block'; }
    if (window.lgv31Mark) lgv31Mark('protocolo');
    scrollTo(0, 0); desenhar();
    if (id) setTimeout(() => lgprVer(id), 50);
  };
  window.lgv9Open = function () { lgprAbrir(); };
  window.lgv9Close = function () { };

  function desenhar() {
    const el = $('#view-lgpr'); if (!el) return;
    const todos = registros().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const anos = [...new Set(todos.map(r => r.year))].sort((a, b) => b - a);
    const tiposUsados = [...new Set(todos.map(r => r.type))].sort();
    const q = filtro.q.trim().toLowerCase();
    const lista = todos.filter(r => {
      if (filtro.st === 'andamento' && !['registrado', 'encaminhado'].includes(r.status)) return false;
      if (filtro.st === 'concluido' && r.status !== 'concluido') return false;
      if (filtro.st === 'reservado' && !['reservado', 'rascunho'].includes(r.status)) return false;
      if (filtro.tipo && r.type !== filtro.tipo) return false;
      if (filtro.ano && String(r.year) !== filtro.ano) return false;
      if (q && ![numero(r), r.subject, r.description, r.from, r.to, r.pessoa, r.user].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    const n = s => todos.filter(r => s.includes(r.status)).length;
    el.innerHTML = `
      <div class="letterhead"><div><h1>Protocolo</h1><div class="date">Todo documento que entra ou sai da Câmara recebe um número. O número é dado pelo sistema e nunca se repete.</div></div>
        <div class="lgt-acoes"><button type="button" class="lgt-btn primario lgpr-grande" onclick="lgprNovo()">${ic('protocolo')}Protocolar documento</button></div></div>
      <div class="lgpr-busca">
        <label class="lgpr-q"><span class="lgpr-sr">Buscar</span><input type="search" id="lgpr-q" value="${esc(filtro.q)}" placeholder="Buscar número, assunto ou pessoa" autocomplete="off"></label>
        <div class="lgpr-chips" role="group" aria-label="Situação">
          ${[['todos', 'Todos', todos.length], ['andamento', 'Em andamento', n(['registrado', 'encaminhado'])], ['concluido', 'Concluídos', n(['concluido'])], ['reservado', 'Reservados', n(['reservado', 'rascunho'])]]
            .map(([k, t, c]) => `<button type="button" class="lgpr-chip" aria-pressed="${filtro.st === k}" data-st="${k}">${t} <span>${c}</span></button>`).join('')}
        </div>
        <div class="lgpr-sel">
          <label>Tipo<select id="lgpr-tipo"><option value="">Todos</option>${tiposUsados.map(t => `<option ${filtro.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          <label>Ano<select id="lgpr-ano"><option value="">Todos</option>${anos.map(a => `<option ${filtro.ano === String(a) ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        </div>
      </div>
      <p class="lgpr-total" aria-live="polite">${lista.length === todos.length ? `${todos.length} protocolo(s)` : `${lista.length} de ${todos.length} protocolo(s)`}</p>
      ${lista.length ? `<ul class="lgpr-lista">${lista.map(linha).join('')}</ul>` : `<div class="lgpr-vazio"><b>${todos.length ? 'Nada encontrado com esses filtros' : 'Nenhum documento protocolado ainda'}</b><span>${todos.length ? 'Limpe a busca ou escolha outra situação.' : 'Quando chegar ou sair um documento, toque em "Protocolar documento". Ele recebe número, data e hora na hora.'}</span>${todos.length ? '' : '<button type="button" class="lgt-btn primario lgpr-grande" onclick="lgprNovo()">Protocolar o primeiro documento</button>'}</div>`}
      <div class="lgpr-rodape">
        <button type="button" class="lgt-btn" onclick="lgprReservar()">Reservar um número</button>
        <button type="button" class="lgt-btn" onclick="lgprRelacao()">Imprimir relação</button>
        <button type="button" class="lgt-btn" onclick="lgprPlanilha()">Baixar planilha</button>
        <button type="button" class="lgt-btn" onclick="lgprSetores()">Setores</button>
      </div>`;
    const qi = $('#lgpr-q'); qi.oninput = () => { filtro.q = qi.value; const pos = qi.selectionStart; desenhar(); const n2 = $('#lgpr-q'); n2.focus(); try { n2.setSelectionRange(pos, pos); } catch (e) { } };
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { filtro.st = b.dataset.st; desenhar(); $(`[data-st="${filtro.st}"]`)?.focus(); });
    $('#lgpr-tipo').onchange = e => { filtro.tipo = e.target.value; desenhar(); };
    $('#lgpr-ano').onchange = e => { filtro.ano = e.target.value; desenhar(); };
  }
  function linha(r) {
    const [st, cls] = ST[r.status] || ['—', 'res'];
    const anexos = (r.anexos || []).length + (r.fileName && !(r.anexos || []).length ? 1 : 0);
    const onde = r.status === 'concluido' ? 'Concluído' : (r.to ? 'Com: ' + r.to : '');
    return `<li><button type="button" class="lgpr-item" onclick="lgprVer('${esc(r.id)}')">
      <span class="lgpr-num">${esc(r.type)} <b>${esc(r.number)}</b></span>
      <span class="lgpr-assunto">${esc(r.subject)}</span>
      <span class="lgpr-meta">${esc(r.pessoa || r.from || '')}${r.to ? ' → ' + esc(r.to) : ''} · ${esc(quando(r.createdAt))}${anexos ? ` · ${anexos} anexo(s)` : ''}</span>
      <span class="lgpr-st ${cls}">${st}</span>${onde && r.status !== 'concluido' ? `<span class="lgpr-onde">${esc(onde)}</span>` : ''}</button></li>`;
  }

  /* ================= protocolar ================= */
  let novos = [];
  window.lgprNovo = function (reservaId) {
    const res = reservaId ? registros().find(x => x.id === reservaId) : null;
    novos = [];
    const opc = (sel) => setores().map(s => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const tipoIni = res ? res.type : 'Documento recebido';
    UI().abrirModal(`<form class="lgt-form lgpr-form" id="lgpr-f" novalidate>
      <div class="lgt-modal-cab"><h2 id="lgt-modal-t">${res ? 'Usar o número reservado ' + esc(numero(res)) : 'Protocolar documento'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgt-campos lgpr-campos">
        <fieldset class="lgpr-tipos" ${res ? 'disabled' : ''}><legend>1. O que é?</legend>
          <div class="lgpr-grade">${TIPOS.map(([t, d]) => `<label class="lgpr-tile"><input type="radio" name="tipo" value="${esc(t)}" ${t === tipoIni ? 'checked' : ''}><span><b>${esc(t)}</b><small>${esc(d)}</small></span></label>`).join('')}
            ${res && !TIPOS.some(x => x[0] === res.type) ? `<label class="lgpr-tile"><input type="radio" name="tipo" value="${esc(res.type)}" checked><span><b>${esc(res.type)}</b></span></label>` : ''}</div>
          <label class="lgpr-outro" hidden>Qual tipo?<input name="tipoOutro" maxlength="50" placeholder="Ex.: Convite, Notificação, Contrato"></label>
        </fieldset>
        <fieldset><legend>2. De onde veio e para quem vai?</legend>
          <div class="lgpr-2col">
            <label>Veio de<select name="from"><option value="${FORA}">Pessoa ou órgão de fora</option>${opc(res ? res.from : '')}</select></label>
            <label>Vai para<select name="to">${opc(res ? res.to : 'Secretaria')}</select></label>
          </div>
          <label class="lgpr-pessoa">Nome de quem trouxe ou enviou<input name="pessoa" maxlength="120" autocomplete="off" placeholder="Ex.: Maria Aparecida, Prefeitura Municipal, Sabesp"></label>
          <label class="lgpr-pessoa">Telefone ou e-mail para retorno (opcional)<input name="contato" maxlength="120" autocomplete="off" inputmode="email"></label>
        </fieldset>
        <fieldset><legend>3. Do que se trata?</legend>
          <label>Assunto<input name="subject" required maxlength="200" value="${res && res.subject !== '(número reservado)' ? esc(res.subject) : ''}" placeholder="Ex.: Pedido de cópia da ata da sessão de 10/11"></label>
          <label>Detalhes (opcional)<textarea name="description" rows="3" maxlength="4000" placeholder="Informações que ajudam quem vai receber">${res ? esc(res.description || '') : ''}</textarea></label>
        </fieldset>
        <fieldset><legend>4. Anexos</legend>
          <div class="lgpr-anexar">
            <label class="lgt-btn">Escolher arquivo<input type="file" id="lgpr-arq" multiple accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.jpg,.jpeg,.png" hidden></label>
            <label class="lgt-btn lgpr-foto">Tirar foto do documento<input type="file" id="lgpr-cam" accept="image/*" capture="environment" hidden></label>
          </div>
          <ul class="lgpr-anexos" id="lgpr-anexos" aria-live="polite"></ul>
          <p class="lgpr-dica">Até 10 MB por arquivo. Pode protocolar sem anexo e anexar depois.</p>
        </fieldset>
        ${res ? '' : `<details class="lgpr-mais"><summary>Registrar documento antigo (com número já conhecido)</summary>
          <div class="lgpr-2col"><label>Número<input name="manual" type="number" min="1" inputmode="numeric" placeholder="Ex.: 37"></label><label>Ano<input name="ano" type="number" min="2000" max="2100" value="${new Date().getFullYear()}"></label></div>
          <p class="lgpr-dica">Use só para documentos que já tinham número antes do sistema. O sistema avisa se o número já existe.</p></details>`}
        <p class="lgpr-erro" id="lgpr-erro" role="alert"></p>
      </div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario lgpr-grande" id="lgpr-ok">${res ? 'Protocolar com este número' : 'Protocolar'}</button></div>
    </form>`);
    const f = $('#lgpr-f');
    const quemFora = () => { const fora = f.from.value === FORA; f.querySelectorAll('.lgpr-pessoa').forEach(x => x.hidden = !fora); };
    const tipoOutro = () => { const t = f.querySelector('input[name=tipo]:checked'); $('.lgpr-outro', f).hidden = !(t && t.value === 'Outro'); };
    f.from.onchange = quemFora; f.querySelectorAll('input[name=tipo]').forEach(i => i.onchange = tipoOutro);
    if (res && res.from) f.from.value = res.from;
    quemFora(); tipoOutro();
    const anexar = async files => {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { aviso(file.name + ': o limite é 10 MB.', 'erro'); continue; }
        novos.push({ nome: file.name || 'foto.jpg', tipo: file.type, tamanho: file.size, url: await lerArquivo(file) });
      }
      desenharAnexos();
    };
    $('#lgpr-arq').onchange = e => { anexar([...e.target.files]); e.target.value = ''; };
    $('#lgpr-cam').onchange = e => { anexar([...e.target.files].map((x, i) => new File([x], `foto-documento-${novos.length + i + 1}.jpg`, { type: x.type }))); e.target.value = ''; };
    desenharAnexos();
    f.onsubmit = async ev => {
      ev.preventDefault();
      const erro = $('#lgpr-erro'); erro.textContent = '';
      let tipo = (f.querySelector('input[name=tipo]:checked') || {}).value || '';
      if (tipo === 'Outro') tipo = (f.tipoOutro.value || '').trim();
      const subject = f.subject.value.trim(), fora = f.from.value === FORA, pessoa = (f.pessoa.value || '').trim();
      if (!tipo) { erro.textContent = 'Escolha o tipo do documento.'; return; }
      if (fora && !pessoa) { erro.textContent = 'Escreva o nome de quem trouxe ou enviou o documento.'; f.pessoa.focus(); return; }
      if (!subject) { erro.textContent = 'Escreva o assunto.'; f.subject.focus(); return; }
      const bt = $('#lgpr-ok'); bt.disabled = true; bt.textContent = 'Protocolando…';
      try {
        const ano = res ? res.year : (+(f.ano && f.ano.value) || new Date().getFullYear());
        const manual = res ? null : ((f.manual && f.manual.value) || '').trim();
        const seq = res ? res.sequence : await pedirNumero(tipo, ano, manual);
        const agora = new Date().toISOString();
        const base = {
          type: tipo, year: ano, sequence: seq, number: String(seq).padStart(4, '0') + '/' + ano, subject,
          from: fora ? 'Externo' : f.from.value, pessoa: fora ? pessoa : '', contato: fora ? (f.contato.value || '').trim() : '',
          to: f.to.value, description: f.description.value.trim(), status: 'registrado',
          anexos: novos.slice(), fileName: novos[0] ? novos[0].nome : '', user: meuNome(), antigo: !!manual,
        };
        let r;
        if (res) {
          r = atualizar(res.id, x => { Object.assign(x, base, { createdAt: x.createdAt }); x.andamento = (x.andamento || []).concat([{ em: agora, por: meuNome(), acao: 'Protocolado', para: base.to }]); });
        } else {
          r = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 7), createdAt: agora, ...base, andamento: [{ em: agora, por: meuNome(), acao: manual ? 'Registro de documento antigo' : 'Protocolado', para: base.to }] };
          const l = registros(); l.push(r); if (!gravar(l)) throw new Error('Não foi possível gravar.');
        }
        if (!r) throw new Error('Não foi possível gravar.');
        try { window.lgv10Notify && lgv10Notify('setor:' + r.to, 'Novo protocolo para ' + r.to, numero(r) + ' • ' + r.subject + ' • por ' + meuNome(), 'protocolo:' + r.id); } catch (e) { }
        try { window.registrarLog && registrarLog('Protocolo', numero(r) + ' — ' + r.subject); } catch (e) { }
        if (/^projeto de lei$/i.test(r.type)) paraTramitacao(r);
        sucesso(r);
        desenhar();
      } catch (e) { erro.textContent = e.message || 'Não foi possível protocolar.'; bt.disabled = false; bt.textContent = res ? 'Protocolar com este número' : 'Protocolar'; }
    };
  };
  function desenharAnexos() {
    const ul = $('#lgpr-anexos'); if (!ul) return;
    ul.innerHTML = novos.map((a, i) => `<li><span>${esc(a.nome)} <small>${Math.max(1, Math.round((a.tamanho || 0) / 1024))} KB</small></span><button type="button" class="lgt-mini perigo" data-tira="${i}">Tirar</button></li>`).join('');
    ul.querySelectorAll('[data-tira]').forEach(b => b.onclick = () => { novos.splice(+b.dataset.tira, 1); desenharAnexos(); });
  }
  // Projeto de Lei protocolado entra na tramitação (caixa de entrada da Câmara)
  function paraTramitacao(r) {
    try {
      if (typeof protocolos === 'undefined' || protocolos.some(p => p.id === 'pl-' + r.id)) return;
      const pl = { id: 'pl-' + r.id, numero: 'PL ' + r.number, full: 'PL-' + r.year + '-' + String(r.sequence).padStart(5, '0'), autor: r.pessoa || r.from || r.user, ementa: r.subject,
        unidade: r.pessoa || r.from, comissao: '—', status: 'enviado', data: new Date().toLocaleDateString('pt-BR'), docs: (r.anexos || []).map(a => a.nome), anexos: (r.anexos || []).map(a => ({ nome: a.nome, url: a.url })),
        timeline: [{ date: new Date().toLocaleString('pt-BR'), label: 'Projeto protocolado (' + r.type + ' ' + r.number + ') e enviado para recebimento da Câmara' }] };
      protocolos.unshift(pl); if (typeof sincronizarProtocolo === 'function') sincronizarProtocolo(pl, 'Projeto de Lei protocolado'); if (typeof renderAll === 'function') renderAll();
    } catch (e) { console.warn('protocolo → tramitação', e); }
  }
  function sucesso(r) {
    UI().abrirModal(`<div class="lgt-form lgpr-feito"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Protocolado</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgpr-selo" role="status"><span>${esc(r.type)}</span><b>${esc(r.number)}</b><small>${esc(quando(r.createdAt))}</small></div>
      <p class="lgt-p" style="text-align:center;padding:0 22px">${esc(r.subject)}<br>Enviado para <b>${esc(r.to)}</b>. ${/^projeto de lei$/i.test(r.type) ? 'Também entrou na caixa de matérias da Câmara.' : ''}</p>
      <div class="lgt-modal-rod lgpr-rod3"><button type="button" class="lgt-btn" onclick="lgprComprovante('${esc(r.id)}')">Imprimir comprovante</button><button type="button" class="lgt-btn" onclick="lgprNovo()">Protocolar outro</button><button type="button" class="lgt-btn primario" onclick="lgtFechar();lgprVer('${esc(r.id)}')">Ver protocolo</button></div></div>`);
  }

  /* ================= detalhe e andamento ================= */
  window.lgprVer = function (id, soLeitura) {
    const r = registros().find(x => x.id === id); if (!r) { aviso('Protocolo não encontrado.', 'erro'); return; }
    const [st, cls] = ST[r.status] || ['—', 'res'];
    const anexos = (r.anexos || []).filter(a => a && a.url);
    const antigo = r.fileName && !anexos.length ? `<li><button type="button" class="lgt-mini" onclick="lgv9Download('${esc(r.id)}')">${esc(r.fileName)}</button></li>` : '';
    const and = (r.andamento || [{ em: r.createdAt, por: r.user, acao: r.status === 'reservado' ? 'Número reservado' : 'Protocolado', para: r.to }]);
    const reservado = ['reservado', 'rascunho'].includes(r.status);
    const ro = !!soLeitura;
    UI().abrirModal(`<div class="lgt-form lgpr-det"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${esc(numero(r))}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgpr-det-corpo">
        <p class="lgpr-det-assunto">${esc(r.subject)} <span class="lgpr-st ${cls}">${st}</span></p>
        <dl class="lgpr-dl">
          <div><dt>Protocolado em</dt><dd>${esc(quando(r.createdAt))}</dd></div>
          <div><dt>Por</dt><dd>${esc(r.user || '—')}</dd></div>
          <div><dt>Veio de</dt><dd>${esc(r.pessoa ? r.pessoa + ' (fora da Câmara)' : (r.from || '—'))}${r.contato ? '<br><small>' + esc(r.contato) + '</small>' : ''}</dd></div>
          <div><dt>Está com</dt><dd>${esc(r.status === 'concluido' ? 'Concluído' : (r.to || '—'))}</dd></div>
        </dl>
        ${r.description ? `<p class="lgpr-desc">${esc(r.description).replace(/\n/g, '<br>')}</p>` : ''}
        <h3>Anexos</h3>
        <ul class="lgpr-anexos">${anexos.map(a => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener" download="${esc(a.nome)}">${esc(a.nome)}</a></li>`).join('')}${antigo}${!anexos.length && !antigo ? '<li class="lgpr-dica">Nenhum anexo.</li>' : ''}</ul>
        <label class="lgt-btn lgpr-mais-anexo" ${ro ? 'hidden' : ''}>Anexar arquivo<input type="file" id="lgpr-add" multiple accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.jpg,.jpeg,.png,image/*" hidden></label>
        <h3>Andamento</h3>
        <ol class="lgpr-and">${and.map(a => `<li><b>${esc(a.acao)}</b>${a.para ? ' → ' + esc(a.para) : ''}<small>${esc(quando(a.em))} · ${esc(a.por || '')}</small>${a.nota ? `<span>${esc(a.nota)}</span>` : ''}</li>`).join('')}</ol>
        ${reservado || ro ? '' : `<div class="lgpr-encaminhar" ${r.status === 'concluido' ? 'hidden' : ''}>
          <h3>Encaminhar ou concluir</h3>
          <label>Para<select id="lgpr-para">${setores().map(s => `<option ${s === r.to ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <label>Observação (opcional)<input id="lgpr-nota" maxlength="300" placeholder="Ex.: Para parecer até sexta-feira"></label>
        </div>`}
      </div>
      <div class="lgt-modal-rod lgpr-rod3">
        ${ro ? '<button type="button" class="lgt-btn primario" onclick="lgtFechar()">Fechar</button>' : reservado ? `<button type="button" class="lgt-btn perigo" onclick="lgprCancelarReserva('${esc(r.id)}')">Cancelar reserva</button><button type="button" class="lgt-btn primario" onclick="lgprNovo('${esc(r.id)}')">Usar este número</button>`
        : r.status === 'concluido' ? `<button type="button" class="lgt-btn" onclick="lgprComprovante('${esc(r.id)}')">Imprimir comprovante</button><button type="button" class="lgt-btn" onclick="lgprMover('${esc(r.id)}','reabrir')">Reabrir</button>`
        : `<button type="button" class="lgt-btn" onclick="lgprComprovante('${esc(r.id)}')">Comprovante</button><button type="button" class="lgt-btn" onclick="lgprMover('${esc(r.id)}','concluir')">Concluir</button><button type="button" class="lgt-btn primario" onclick="lgprMover('${esc(r.id)}','encaminhar')">Encaminhar</button>`}
      </div></div>`);
    const add = $('#lgpr-add');
    if (add) add.onchange = async e => {
      const files = [...e.target.files]; const lista = [];
      for (const f of files) { if (f.size > 10 * 1024 * 1024) { aviso(f.name + ': o limite é 10 MB.', 'erro'); continue; } lista.push({ nome: f.name, tipo: f.type, tamanho: f.size, url: await lerArquivo(f) }); }
      if (!lista.length) return;
      atualizar(id, x => { x.anexos = (x.anexos || []).concat(lista); x.andamento = (x.andamento || []).concat([{ em: new Date().toISOString(), por: meuNome(), acao: 'Anexou ' + lista.map(a => a.nome).join(', ') }]); });
      aviso('Anexo incluído.'); lgprVer(id); desenhar();
    };
  };
  window.lgprMover = function (id, acao) {
    const para = $('#lgpr-para')?.value, nota = ($('#lgpr-nota')?.value || '').trim(), agora = new Date().toISOString();
    const r = atualizar(id, x => {
      if (acao === 'encaminhar') { x.to = para; x.status = 'encaminhado'; x.andamento = (x.andamento || []).concat([{ em: agora, por: meuNome(), acao: 'Encaminhado', para, nota }]); }
      if (acao === 'concluir') { x.status = 'concluido'; x.andamento = (x.andamento || []).concat([{ em: agora, por: meuNome(), acao: 'Concluído', nota }]); }
      if (acao === 'reabrir') { x.status = 'registrado'; x.andamento = (x.andamento || []).concat([{ em: agora, por: meuNome(), acao: 'Reaberto', para: x.to }]); }
    });
    if (!r) return;
    if (acao === 'encaminhar') { try { window.lgv10Notify && lgv10Notify('setor:' + para, 'Protocolo encaminhado para ' + para, numero(r) + ' • ' + r.subject + (nota ? ' • ' + nota : ''), 'protocolo:' + r.id); } catch (e) { } }
    aviso(acao === 'encaminhar' ? 'Encaminhado para ' + para + '.' : acao === 'concluir' ? 'Protocolo concluído.' : 'Protocolo reaberto.');
    lgprVer(id); desenhar();
  };

  /* ================= reservar número ================= */
  window.lgprReservar = function () {
    UI().abrirModal(`<form class="lgt-form lgpr-form" id="lgpr-rf"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Reservar um número</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgt-campos lgpr-campos"><p class="lgt-p">Para quando você precisa do número antes de terminar o documento (ex.: um ofício que ainda vai ser assinado). Depois, abra a reserva e toque em "Usar este número".</p>
        <label>Tipo<select name="tipo">${TIPOS.filter(t => t[0] !== 'Documento recebido' && t[0] !== 'Outro').map(t => `<option>${esc(t[0])}</option>`).join('')}</select></label>
        <label>Para que é (opcional)<input name="subject" maxlength="200" placeholder="Ex.: Ofício ao DER sobre a vicinal"></label>
        <p class="lgpr-erro" id="lgpr-rerro" role="alert"></p></div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Reservar</button></div></form>`);
    const f = $('#lgpr-rf');
    f.onsubmit = async e => {
      e.preventDefault(); const ano = new Date().getFullYear();
      try {
        const seq = await pedirNumero(f.tipo.value, ano), agora = new Date().toISOString();
        const r = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 7), type: f.tipo.value, year: ano, sequence: seq, number: String(seq).padStart(4, '0') + '/' + ano, subject: f.subject.value.trim() || '(número reservado)', from: '', to: '', description: '', status: 'reservado', createdAt: agora, user: meuNome(), anexos: [], andamento: [{ em: agora, por: meuNome(), acao: 'Número reservado' }] };
        const l = registros(); l.push(r); gravar(l); desenhar();
        UI().abrirModal(`<div class="lgt-form lgpr-feito"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Número reservado</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgpr-selo" role="status"><span>${esc(r.type)}</span><b>${esc(r.number)}</b><small>Reservado para você</small></div><div class="lgt-modal-rod"><button type="button" class="lgt-btn primario" onclick="lgtFechar()">Pronto</button></div></div>`);
      } catch (x) { $('#lgpr-rerro').textContent = x.message; }
    };
  };
  window.lgprCancelarReserva = function (id) {
    UI().confirmar('Cancelar esta reserva? O número fica registrado como cancelado e não será usado de novo.', () => {
      atualizar(id, x => { x.status = 'concluido'; x.subject = '(reserva cancelada) ' + (x.subject === '(número reservado)' ? '' : x.subject); x.andamento = (x.andamento || []).concat([{ em: new Date().toISOString(), por: meuNome(), acao: 'Reserva cancelada' }]); });
      desenhar(); aviso('Reserva cancelada.');
    });
  };

  /* ================= comprovante, relação, planilha ================= */
  function janela(titulo, corpo) {
    const w = window.open('', '_blank'); if (!w) { aviso('Permita janelas deste site para imprimir.', 'erro'); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
      body{font:14px/1.5 Arial,Helvetica,sans-serif;color:#111;max-width:760px;margin:24px auto;padding:0 18px}h1{font-size:18px;margin:0}h2{font-size:15px;margin:18px 0 6px}
      .cab{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}.num{font-size:26px;font-weight:700;text-align:right}
      table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top;font-size:12.5px}th{background:#eee}
      .ass{margin-top:60px;display:flex;gap:40px}.ass div{flex:1;border-top:1px solid #111;text-align:center;padding-top:4px;font-size:12px}.p{color:#444;font-size:12px}
      @media print{button{display:none}}</style></head><body>${corpo}<p><button onclick="print()">Imprimir</button></p></body></html>`);
    w.document.close(); setTimeout(() => { try { w.print(); } catch (e) { } }, 400);
  }
  window.lgprComprovante = function (id) {
    const r = registros().find(x => x.id === id); if (!r) return;
    janela('Comprovante ' + numero(r), `<div class="cab"><div><h1>Câmara Municipal de ${esc(municipio())}</h1><div class="p">Comprovante de protocolo</div></div><div class="num">${esc(r.type)}<br>${esc(r.number)}</div></div>
      <table><tr><th style="width:30%">Data e hora</th><td>${esc(quando(r.createdAt))}</td></tr><tr><th>Assunto</th><td>${esc(r.subject)}</td></tr>
      <tr><th>Apresentado por</th><td>${esc(r.pessoa || r.from || '—')}${r.contato ? ' — ' + esc(r.contato) : ''}</td></tr><tr><th>Encaminhado para</th><td>${esc(r.to || '—')}</td></tr>
      <tr><th>Anexos</th><td>${(r.anexos || []).map(a => esc(a.nome)).join('<br>') || esc(r.fileName || 'Nenhum')}</td></tr><tr><th>Recebido por</th><td>${esc(r.user || '—')}</td></tr></table>
      <p class="p">Guarde este comprovante. Para acompanhar, informe o número ${esc(numero(r))} na Câmara.</p>
      <div class="ass"><div>Quem recebeu (Câmara)</div><div>Quem entregou</div></div>`);
  };
  window.lgprRelacao = function () {
    const l = registros().filter(r => (!filtro.tipo || r.type === filtro.tipo) && (!filtro.ano || String(r.year) === filtro.ano)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    janela('Relação de protocolos', `<div class="cab"><div><h1>Câmara Municipal de ${esc(municipio())}</h1><div class="p">Relação de protocolos${filtro.tipo ? ' — ' + esc(filtro.tipo) : ''}${filtro.ano ? ' — ' + esc(filtro.ano) : ''} · emitida em ${esc(quando(new Date().toISOString()))}</div></div></div>
      <table><thead><tr><th>Número</th><th>Data</th><th>Assunto</th><th>De → Para</th><th>Situação</th></tr></thead><tbody>${l.map(r => `<tr><td>${esc(numero(r))}</td><td>${esc(quando(r.createdAt))}</td><td>${esc(r.subject)}</td><td>${esc(r.pessoa || r.from || '')} → ${esc(r.to || '')}</td><td>${esc((ST[r.status] || ['—'])[0])}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum protocolo.</td></tr>'}</tbody></table>`);
  };
  window.lgprPlanilha = function () {
    const campos = [['Número', r => numero(r)], ['Tipo', r => r.type], ['Ano', r => r.year], ['Data', r => quando(r.createdAt)], ['Assunto', r => r.subject], ['Veio de', r => r.pessoa || r.from], ['Contato', r => r.contato], ['Está com', r => r.to], ['Situação', r => (ST[r.status] || ['—'])[0]], ['Protocolado por', r => r.user], ['Anexos', r => (r.anexos || []).map(a => a.nome).join(' | ')]];
    const csv = '﻿' + campos.map(c => c[0]).join(';') + '\r\n' + registros().map(r => campos.map(c => '"' + String(c[1](r) ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'protocolos.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  window.lgv9Export = window.lgprPlanilha;
  window.lgv9Download = function (id) { const r = registros().find(x => x.id === id), d = localStorage.getItem('lgv9_file_' + id); if (!r || !d) { aviso('Este anexo antigo ficou só no computador de quem protocolou.', 'erro'); return; } const a = document.createElement('a'); a.href = d; a.download = r.fileName; a.click(); };

  /* ================= setores ================= */
  window.lgprSetores = function () {
    const desenharS = () => {
      const l = setores();
      UI().abrirModal(`<form class="lgt-form lgpr-form" id="lgpr-sf"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Setores do protocolo</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
        <div class="lgt-campos lgpr-campos"><p class="lgt-p">São as opções de "Veio de" e "Vai para".</p>
        <ul class="lgpr-anexos">${l.map((s, i) => `<li><span>${esc(s)}</span><button type="button" class="lgt-mini perigo" data-rm="${i}">Tirar</button></li>`).join('')}</ul>
        <div class="lgpr-2col"><label>Novo setor<input name="novo" maxlength="80" placeholder="Ex.: Controle Interno"></label><div style="align-self:end"><button type="submit" class="lgt-btn primario">Incluir</button></div></div></div>
        <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar();lgprAbrir()">Pronto</button></div></form>`);
      const f = $('#lgpr-sf');
      f.onsubmit = e => { e.preventDefault(); const n = f.novo.value.trim(); if (!n) return; const l2 = setores(); if (l2.some(x => x.toLowerCase() === n.toLowerCase())) { aviso('Esse setor já existe.', 'erro'); return; } l2.push(n); localStorage.setItem(SET, JSON.stringify(l2)); desenharS(); };
      f.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const l2 = setores(); l2.splice(+b.dataset.rm, 1); localStorage.setItem(SET, JSON.stringify(l2)); desenharS(); });
    };
    desenharS();
  };

  addEventListener('storage', e => { if (e.key === KEY && $('#view-lgpr')?.style.display === 'block' && !document.querySelector('#lgt-modal:not([hidden])')) desenhar(); });

  /* ================= estilo ================= */
  const css = document.createElement('style'); css.id = 'lgpr-style'; css.textContent = `
  .lgpr-grande{height:48px!important;padding:0 22px!important;font-size:15px!important}
  .lgpr-busca{display:flex;flex-direction:column;gap:12px;margin:4px 0 10px}
  .lgpr-q input{width:100%;height:52px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);padding:0 16px;font-size:16px}
  .lgpr-q input:focus,.lgpr-form input:focus,.lgpr-form select:focus,.lgpr-form textarea:focus{outline:3px solid #1f4e7955;outline-offset:1px;border-color:#1f4e79}
  .lgpr-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .lgpr-chips{display:flex;gap:8px;flex-wrap:wrap}
  .lgpr-chip{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);font-weight:600;font-size:14px;cursor:pointer}
  .lgpr-chip span{color:var(--lg28-muted);font-weight:500;margin-left:4px}
  .lgpr-chip[aria-pressed=true]{background:#1f4e79;border-color:#1f4e79;color:#fff}.lgpr-chip[aria-pressed=true] span{color:#d6e4f2}
  .lgpr-sel{display:flex;gap:10px;flex-wrap:wrap}.lgpr-sel label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:600;color:var(--lg28-muted)}
  .lgpr-sel select{height:42px;min-width:170px;border-radius:9px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);padding:0 10px;font-size:14px}
  .lgpr-total{font-size:13px;color:var(--lg28-muted);margin:6px 0 8px}
  .lgpr-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
  .lgpr-item{width:100%;text-align:left;display:grid;grid-template-columns:minmax(150px,auto) 1fr auto;grid-template-areas:"num assunto st" "num meta onde";gap:2px 16px;align-items:center;padding:14px 16px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);cursor:pointer;font:inherit}
  .lgpr-item:hover{border-color:#1f4e79}.lgpr-item:focus-visible{outline:3px solid #1f4e7966;outline-offset:2px}
  .lgpr-num{grid-area:num;font-size:13px;color:var(--lg28-muted)}.lgpr-num b{display:block;font-size:20px;color:var(--lg28-ink);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
  .lgpr-assunto{grid-area:assunto;font-weight:600;font-size:15px}.lgpr-meta{grid-area:meta;font-size:13px;color:var(--lg28-muted)}
  .lgpr-st{grid-area:st;justify-self:end;display:inline-block;padding:4px 10px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap}
  .lgpr-st.and{background:#e3eefb;color:#1f4e79}.lgpr-st.ok{background:#e2f5ea;color:#17703f}.lgpr-st.res{background:#fbf1d9;color:#8a6200}
  .lgpr-onde{grid-area:onde;justify-self:end;font-size:12.5px;color:var(--lg28-muted)}
  .lgpr-vazio{text-align:center;padding:40px 16px;border:1px dashed var(--lg28-stroke);border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:8px}
  .lgpr-vazio b{font-size:16px}.lgpr-vazio span{color:var(--lg28-muted);max-width:52ch}
  .lgpr-rodape{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid var(--lg28-stroke)}
  .lgpr-form fieldset{border:0;margin:0 0 6px;padding:0;display:flex;flex-direction:column;gap:10px}
  .lgpr-form legend{font-weight:700;font-size:15px;color:var(--lg28-ink);margin-bottom:8px;padding:0}
  .lgpr-campos{display:flex;flex-direction:column;gap:14px}
  .lgpr-campos label{display:flex;flex-direction:column;gap:5px;font-size:13.5px;font-weight:600;color:var(--lg28-ink)}
  .lgpr-campos input:not([type=radio]):not([type=file]),.lgpr-campos select{height:46px!important;font-size:16px!important}
  .lgpr-campos textarea{font-size:16px!important}
  .lgpr-grade{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .lgpr-tile{position:relative;cursor:pointer}.lgpr-tile input{position:absolute;opacity:0;inset:0;cursor:pointer}
  .lgpr-tile span{display:flex;flex-direction:column;gap:2px;min-height:64px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--lg28-stroke);background:var(--lg28-panel)}
  .lgpr-tile b{font-size:14px}.lgpr-tile small{font-size:12px;color:var(--lg28-muted);font-weight:500}
  .lgpr-tile input:checked+span{border-color:#1f4e79;background:#eef4fb;box-shadow:inset 0 0 0 1px #1f4e79}
  .lgpr-tile input:focus-visible+span{outline:3px solid #1f4e7966;outline-offset:2px}
  .lgpr-tile input:disabled+span{opacity:.6}
  .lgpr-2col{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .lgpr-anexar{display:flex;gap:8px;flex-wrap:wrap}.lgpr-anexar .lgt-btn{height:46px}
  .lgpr-anexos{list-style:none;margin:6px 0;padding:0;display:flex;flex-direction:column;gap:6px}
  .lgpr-anexos li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--lg28-stroke);border-radius:9px;font-size:14px;word-break:break-word}
  .lgpr-anexos li small{color:var(--lg28-muted);margin-left:6px}.lgpr-anexos a{color:#1f4e79;font-weight:600}
  .lgpr-dica{font-size:12.5px;color:var(--lg28-muted);margin:0;font-weight:500}
  .lgpr-mais summary{cursor:pointer;font-size:13.5px;color:var(--lg28-muted);font-weight:600;padding:6px 0}.lgpr-mais[open]{display:flex;flex-direction:column;gap:10px}
  .lgpr-erro{color:#b42318;font-weight:600;font-size:14px;margin:0;min-height:1em}
  .lgpr-selo{display:flex;flex-direction:column;align-items:center;gap:2px;margin:10px auto 14px;padding:18px 26px;border:2px solid #1f4e79;border-radius:14px;width:max-content;max-width:90%}
  .lgpr-selo span{font-size:14px;color:var(--lg28-muted);font-weight:600}.lgpr-selo b{font-size:34px;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:#1f4e79}.lgpr-selo small{color:var(--lg28-muted)}
  .lgpr-rod3{flex-wrap:wrap}
  .lgpr-det-corpo{padding:4px 22px 6px;display:flex;flex-direction:column;gap:8px}
  .lgpr-det-corpo h3{font-size:14px!important;margin:10px 0 0}
  .lgpr-det-assunto{font-size:16px;font-weight:600;margin:0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .lgpr-dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:4px 0}.lgpr-dl dt{font-size:12px;color:var(--lg28-muted);font-weight:600}.lgpr-dl dd{margin:0;font-size:14px}
  .lgpr-desc{background:var(--lg28-bg,#f5f7fa);border-radius:9px;padding:10px 12px;margin:0;font-size:14px}
  .lgpr-and{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px}.lgpr-and small{display:block;color:var(--lg28-muted);font-size:12.5px}.lgpr-and span{display:block;font-size:13px}
  .lgpr-encaminhar{display:flex;flex-direction:column;gap:8px}.lgpr-encaminhar label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600}
  .lgpr-encaminhar select,.lgpr-encaminhar input{height:44px;border-radius:9px;border:1px solid var(--lg28-stroke);padding:0 10px;font-size:15px;background:var(--lg28-panel);color:var(--lg28-ink)}
  .lgpr-mais-anexo{align-self:flex-start}
  @media(max-width:760px){
    .lgpr-item{grid-template-columns:1fr auto;grid-template-areas:"num st" "assunto assunto" "meta meta" "onde onde"}
    .lgpr-onde{justify-self:start}.lgpr-grade{grid-template-columns:1fr 1fr}.lgpr-2col,.lgpr-dl{grid-template-columns:1fr}
    .lgpr-sel select{min-width:0;width:100%}.lgpr-sel label{flex:1}
    #view-lgpr .letterhead .lgt-acoes,#view-lgpr .letterhead .lgt-btn{width:100%;justify-content:center}
    .lgpr-rodape .lgt-btn{flex:1 1 45%;justify-content:center}
  }`;
  document.head.appendChild(css);
})();
