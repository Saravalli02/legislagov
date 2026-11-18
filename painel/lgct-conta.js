/* =====================================================================
   LegislaGov — MINHA CONTA
   Cada pessoa cuida dos próprios dados: foto, CPF, nascimento, celular,
   e-mail principal (recupera a senha) e e-mail secundário.
   Nome, cargo, setor e perfil continuam com o administrador.
   Abas: Conta · E-mails · Histórico (entradas e mudanças da própria conta).
   Servidor: POST /api/minha-conta e POST /api/meu-historico.
   ===================================================================== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const UI = () => window.lgtUI;
  const aviso = (m, t) => UI() ? UI().aviso(m, t) : alert(m);
  const SYNC = () => window.LG_SYNC;
  const atual = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const eu = () => (SYNC() && SYNC().eu) || atual() || {};
  const municipio = () => { try { return (typeof municipioAtual !== 'undefined' && municipioAtual) || 'Neves Paulista — SP'; } catch (e) { return 'Neves Paulista — SP'; } };
  const iniciais = n => String(n || '').trim().split(/\s+/).filter(Boolean).map(p => p[0]).filter((c, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase() || '—';
  const so = s => String(s || '').replace(/\D/g, '');
  const fmtCPF = c => { c = so(c).slice(0, 11); return c.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2'); };
  const fmtCel = t => { t = so(t).slice(0, 11); if (t.length <= 2) return t ? '(' + t : ''; const d = t.slice(0, 2), r = t.slice(2); return `(${d}) ` + (r.length > (t.length === 11 ? 5 : 4) ? r.slice(0, t.length === 11 ? 5 : 4) + '-' + r.slice(t.length === 11 ? 5 : 4) : r); };
  const cpfValido = c => { c = so(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false; for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); if ((s * 10 % 11) % 10 !== +c[n]) return false; } return true; };
  const PERFIL = { adm: 'Administrador do sistema', procurador: 'Procuradoria', secretaria: 'Secretaria', financeiro: 'Financeiro', vereador: 'Vereador', comunicacao: 'Comunicação' };

  let aba = 'conta', fotoNova = null, hist = null;

  /* ---------------- foto no topo e no menu ---------------- */
  function aplicarAvatar() {
    const u = eu(); const f = u.foto;
    document.querySelectorAll('.user-avatar, #user-avatar').forEach(el => {
      if (f) { el.style.backgroundImage = `url("${f}")`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; el.classList.add('lgct-com-foto'); if (!el.dataset.lgctTxt) el.dataset.lgctTxt = el.textContent; el.textContent = ''; el.setAttribute('aria-label', 'Foto de ' + (u.nome || '')); }
      else if (el.classList.contains('lgct-com-foto')) { el.style.backgroundImage = ''; el.classList.remove('lgct-com-foto'); el.textContent = el.dataset.lgctTxt || iniciais(u.nome); el.removeAttribute('aria-label'); }
    });
    document.querySelectorAll('.user-chip').forEach(c => { if (c.__lgct) return; c.__lgct = true; c.style.cursor = 'pointer'; c.setAttribute('role', 'button'); c.tabIndex = 0; c.title = 'Minha conta';
      c.addEventListener('click', e => { if (e.target.closest('button,a') && !e.target.closest('.user-chip > .user-avatar')) return; lgctAbrir(); });
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lgctAbrir(); } }); });
  }
  setInterval(aplicarAvatar, 2500); document.addEventListener('DOMContentLoaded', () => setTimeout(aplicarAvatar, 800));

  /* ---------------- tela ---------------- */
  function criarView() {
    if ($('#view-lgct')) return;
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main) return;
    main.insertAdjacentHTML('beforeend', '<section class="view lgt lgct" id="view-lgct" style="display:none"></section>');
    const nav = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    if (nav) { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lgct'; b.hidden = true; b.style.display = 'none'; nav.appendChild(b); }
  }
  window.lgctAbrir = function (qual) {
    if (!atual()) return;
    criarView(); if (qual) aba = qual; fotoNova = null;
    if (typeof gotoShared === 'function') gotoShared('lgct'); else { document.querySelectorAll('section.view').forEach(s => s.style.display = 'none'); $('#view-lgct').style.display = 'block'; }
    if (window.lgv31Mark) lgv31Mark('');
    try { window.lgv31Menu && lgv31Menu(false); } catch (e) { }
    scrollTo(0, 0); desenhar();
  };
  function desenhar() {
    const el = $('#view-lgct'); if (!el) return; const u = eu(), a = atual() || {};
    const perfil = window.lgPerfil ? lgPerfil(a) : '';
    const foto = fotoNova !== null ? fotoNova : (u.foto || '');
    const ABAS = [['conta', 'Conta'], ['emails', 'E-mails'], ['historico', 'Histórico']];
    el.innerHTML = `
      <div class="letterhead"><div><h1>Minha conta</h1><div class="date">Seus dados no LegislaGov. Só você altera estas informações; nome, cargo e perfil ficam com o administrador.</div></div></div>
      <div class="lgct-abas" role="tablist" aria-label="Minha conta">${ABAS.map(([k, t]) => `<button type="button" role="tab" id="lgct-tab-${k}" aria-selected="${aba === k}" aria-controls="lgct-painel" tabindex="${aba === k ? 0 : -1}" data-aba="${k}">${ic(k === 'conta' ? 'usuarios' : k === 'emails' ? 'mensagens' : 'calendario')}${t}</button>`).join('')}</div>
      <div id="lgct-painel" role="tabpanel" aria-labelledby="lgct-tab-${aba}">${aba === 'conta' ? conta(u, a, perfil, foto) : aba === 'emails' ? emails(u) : historico()}</div>`;
    el.querySelectorAll('[data-aba]').forEach(b => { b.onclick = () => { aba = b.dataset.aba; desenhar(); $(`#lgct-tab-${aba}`).focus(); };
      b.onkeydown = e => { const k = ABAS.map(x => x[0]); const i = k.indexOf(aba); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); aba = k[(i + (e.key === 'ArrowRight' ? 1 : k.length - 1)) % k.length]; desenhar(); $(`#lgct-tab-${aba}`).focus(); } }; });
    if (aba === 'conta') ligarConta(u); if (aba === 'emails') ligarEmails(u); if (aba === 'historico') carregarHist();
  }
  const ro = (rot, v, dica) => `<label class="lgct-campo"><span>${rot}</span><input value="${esc(v || '—')}" readonly aria-readonly="true">${dica ? `<small>${dica}</small>` : ''}</label>`;
  function conta(u, a, perfil, foto) {
    return `<form id="lgct-f" class="lgt-card lgct-form" novalidate>
      <div class="lgct-foto"><div class="lgct-av" aria-hidden="true">${foto ? `<img src="${esc(foto)}" alt="">` : `<span>${esc(iniciais(u.nome || a.nome))}</span>`}</div>
        <div><b>${esc(u.nome || a.nome || '')}</b><small>${esc(PERFIL[perfil] || a.cargo || '')}</small>
        <div class="lgct-foto-bts"><label class="lgt-btn">${ic('foto')}${foto ? 'Trocar foto' : 'Pôr foto'}<input type="file" accept="image/jpeg,image/png,image/webp" id="lgct-foto" hidden></label>${foto ? '<button type="button" class="lgt-btn" id="lgct-semfoto">Tirar foto</button>' : ''}</div></div></div>
      <fieldset><legend>Identificação</legend><div class="lgct-grade">
        ${ro('Nome', u.nome || a.nome, 'Para mudar o nome, fale com o administrador.')}
        ${ro('Usuário (login)', u.usuario || a.usuario)}
        <label class="lgct-campo"><span>CPF</span><input name="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" value="${esc(fmtCPF(u.cpf))}" maxlength="14"><small>Opcional. Usado só para identificar você em documentos assinados.</small></label>
        <label class="lgct-campo"><span>Data de nascimento</span><input name="nascimento" type="date" value="${esc(u.nascimento || '')}" max="${new Date().toISOString().slice(0, 10)}"><small>Opcional.</small></label>
        <label class="lgct-campo"><span>Celular</span><input name="celular" type="tel" inputmode="tel" autocomplete="tel" placeholder="(17) 99999-9999" value="${esc(fmtCel(u.celular))}" maxlength="15"><small>Para avisos de segurança e de tarefas pelo WhatsApp.</small></label>
      </div></fieldset>
      <fieldset><legend>Local de trabalho</legend><div class="lgct-grade">
        ${ro('Órgão', 'Câmara Municipal de ' + municipio().replace(/\s[—-]\s[A-Z]{2}$/, ''))}
        ${ro('Cargo / setor', [a.cargo, a.setor && a.setor !== a.cargo ? a.setor : ''].filter(Boolean).join(' · '), 'Definido pelo administrador.')}
        ${ro('Município', municipio().replace(/\s[—-]\s([A-Z]{2})$/, ' — $1'))}
      </div></fieldset>
      <fieldset><legend>Segurança</legend>
        <div class="lgct-seg"><div><b>Senha</b><small>Troque a senha quando quiser. Depois de 3 senhas erradas seguidas a conta é bloqueada.</small></div><button type="button" class="lgt-btn" onclick="window.lgTrocarSenha && lgTrocarSenha()">Alterar senha</button></div>
        <div class="lgct-seg"><div><b>Verificação em duas etapas</b><small>Pede um código enviado ao seu e-mail ao entrar. Fica disponível quando o envio de e-mails do sistema estiver ativado.</small></div><label class="lgct-chk"><input type="checkbox" disabled> Em breve</label></div>
      </fieldset>
      <p class="lgt-erro" role="alert" id="lgct-erro"></p>
      <div class="lgct-rod"><button type="submit" class="lgt-btn primario">Atualizar conta</button></div></form>`;
  }
  async function reduzir(file) {
    const img = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = r.result; }; r.onerror = no; r.readAsDataURL(file); });
    const lado = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 320;
    c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 320, 320);
    return c.toDataURL('image/jpeg', 0.85);
  }
  async function salvar(campos, okMsg) {
    const er = $('#lgct-erro'); if (er) er.textContent = '';
    if (!SYNC() || !SYNC().api) { if (er) er.textContent = 'Sem conexão com o servidor: os dados da conta só podem ser salvos com o sistema on-line.'; return false; }
    const r = await SYNC().api('/api/minha-conta', campos);
    if (!r.ok) { if (er) er.textContent = r.erro || 'Não foi possível salvar.'; return false; }
    if (r.eu && SYNC()) { SYNC().eu = Object.assign(SYNC().eu || {}, r.eu); ['foto', 'cpf', 'celular', 'nascimento', 'email', 'email2'].forEach(k => { if (!(k in r.eu)) delete SYNC().eu[k]; }); }
    fotoNova = null; aplicarAvatar(); aviso(r.mudou && r.mudou.length ? okMsg : 'Nada mudou.'); desenhar(); return true;
  }
  function ligarConta(u) {
    const f = $('#lgct-f'), er = $('#lgct-erro');
    f.cpf.oninput = () => { f.cpf.value = fmtCPF(f.cpf.value); };
    f.celular.oninput = () => { f.celular.value = fmtCel(f.celular.value); };
    $('#lgct-foto').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { fotoNova = await reduzir(file); desenharPreservando(); } catch (x) { er.textContent = 'Não foi possível ler a imagem.'; } };
    const sf = $('#lgct-semfoto'); if (sf) sf.onclick = () => { fotoNova = ''; desenharPreservando(); };
    f.onsubmit = async e => {
      e.preventDefault(); er.textContent = '';
      const cpf = so(f.cpf.value), cel = so(f.celular.value);
      if (cpf && !cpfValido(cpf)) { er.textContent = 'Confira o CPF: os números não conferem.'; f.cpf.focus(); return; }
      if (cel && ![10, 11].includes(cel.length)) { er.textContent = 'Confira o celular: DDD + número.'; f.celular.focus(); return; }
      const campos = { cpf, celular: cel, nascimento: f.nascimento.value };
      if (fotoNova !== null) campos.foto = fotoNova;
      await salvar(campos, 'Conta atualizada.');
    };
  }
  // troca a foto sem perder o que já foi digitado
  function desenharPreservando() {
    const f = $('#lgct-f'); const v = f ? { cpf: f.cpf.value, celular: f.celular.value, nascimento: f.nascimento.value } : null;
    desenhar(); const g = $('#lgct-f'); if (v && g) { g.cpf.value = v.cpf; g.celular.value = v.celular; g.nascimento.value = v.nascimento; }
    const b = $('#lgct-foto')?.closest('label'); if (b) b.focus();
  }
  function emails(u) {
    return `<form id="lgct-fe" class="lgt-card lgct-form" novalidate>
      <fieldset><legend>E-mails</legend><div class="lgct-grade">
        <label class="lgct-campo"><span>E-mail principal</span><input name="email" type="email" autocomplete="email" value="${esc(u.email && /@/.test(u.email) ? u.email : '')}" placeholder="seu.email@exemplo.com"><small>Recebe o link de “Esqueci a senha” e os avisos de segurança.</small></label>
        <label class="lgct-campo"><span>E-mail secundário</span><input name="email2" type="email" autocomplete="email" value="${esc(u.email2 || '')}" placeholder="outro.email@exemplo.com"><small>Opcional. Para contato se o principal não funcionar.</small></label>
      </div></fieldset>
      <p class="lgt-erro" role="alert" id="lgct-erro"></p>
      <div class="lgct-rod"><button type="submit" class="lgt-btn primario">Salvar e-mails</button></div></form>`;
  }
  function ligarEmails() {
    const f = $('#lgct-fe'); f.onsubmit = async e => { e.preventDefault(); const em = f.email.value.trim(), em2 = f.email2.value.trim();
      const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; if (em && !re.test(em)) { $('#lgct-erro').textContent = 'Confira o e-mail principal.'; return f.email.focus(); } if (em2 && !re.test(em2)) { $('#lgct-erro').textContent = 'Confira o e-mail secundário.'; return f.email2.focus(); }
      if (em && em2 && em.toLowerCase() === em2.toLowerCase()) { $('#lgct-erro').textContent = 'O e-mail secundário precisa ser diferente do principal.'; return f.email2.focus(); }
      await salvar({ email: em, email2: em2 }, 'E-mails salvos.'); };
  }
  const ROT = a => ({ 'Login': 'Entrou no sistema', 'Login recusado': 'Senha errada', 'Login recusado (conta bloqueada)': 'Tentou entrar com a conta bloqueada', 'Senha trocada': 'Trocou a senha', 'Senha nova criada pelo administrador': 'O administrador criou uma senha nova', 'E-mail de recuperação atualizado': 'Mudou o e-mail', 'Dados da conta atualizados': 'Atualizou os dados da conta', 'Esqueci a senha: link enviado': 'Pediu link para criar senha nova', 'Esqueci a senha: sem e-mail cadastrado': 'Pediu senha nova (sem e-mail cadastrado)' })[a] || a;
  function historico() {
    if (!hist) return '<div class="lgt-card"><p class="lgct-vazio">Carregando…</p></div>';
    if (hist.erro) return `<div class="lgt-card"><p class="lgct-vazio">${esc(hist.erro)}</p></div>`;
    return `<div class="lgt-card"><h3>Entradas e mudanças da sua conta</h3><p class="lgct-dica">Se aparecer algo que não foi você (por exemplo, senha errada de um endereço que você não reconhece), troque a senha e avise o administrador.</p>
      ${hist.itens.length ? `<div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Quando</th><th>O que aconteceu</th><th>Detalhe</th><th>Endereço (IP)</th></tr></thead><tbody>${hist.itens.map(x => { const d = new Date(x.quando); return `<tr class="${/recusad|bloquead/i.test(x.acao) ? 'lgct-alerta' : ''}"><td>${esc(d.toLocaleDateString('pt-BR'))} ${esc(d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</td><td>${esc(ROT(x.acao))}</td><td>${esc(x.detalhe || '')}</td><td>${esc(x.ip || '—')}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="lgct-vazio">Nada registrado ainda.</p>'}</div>`;
  }
  async function carregarHist() {
    if (hist) return; hist = null;
    if (!SYNC() || !SYNC().api) { hist = { erro: 'O histórico fica no servidor: abra o sistema on-line.' }; return desenhar(); }
    const r = await SYNC().api('/api/meu-historico', {}); hist = r.ok ? { itens: r.itens || [] } : { erro: r.erro || 'Não foi possível carregar o histórico.' };
    if (aba === 'historico') desenhar(); setTimeout(() => { hist = null; }, 60000);
  }

  const css = document.createElement('style'); css.id = 'lgct-style'; css.textContent = `
  .lgct-abas{display:flex;gap:4px;border-bottom:1px solid var(--lg28-stroke);margin:4px 0 16px;overflow-x:auto}
  .lgct-abas button{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border:0;border-bottom:3px solid transparent;background:none;color:var(--lg28-muted);font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
  .lgct-abas button svg{width:18px;height:18px}
  .lgct-abas button[aria-selected="true"]{color:var(--lg28-ink);border-bottom-color:#1f4e79}
  .lgct-abas button:focus-visible{outline:3px solid #1f4e7966;outline-offset:-3px}
  .lgct-form{max-width:860px}
  .lgct-form fieldset{border:0;border-top:1px solid var(--lg28-stroke);margin:18px 0 0;padding:14px 0 0}
  .lgct-form legend{font-weight:700;font-size:15px;padding:0 8px 0 0}
  .lgct-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}
  .lgct-campo{display:flex;flex-direction:column;gap:5px;font-size:13.5px;font-weight:600;color:var(--lg28-muted)}
  .lgct-campo input{height:44px;border-radius:9px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);padding:0 12px;font:inherit;font-size:15px;font-weight:400}
  .lgct-campo input[readonly]{background:color-mix(in srgb,var(--lg28-stroke) 35%,var(--lg28-panel));color:var(--lg28-muted)}
  .lgct-campo small{font-weight:400;font-size:12.5px}
  .lgct-foto{display:flex;gap:18px;align-items:center}
  .lgct-av{width:104px;height:104px;border-radius:50%;overflow:hidden;flex:none;display:grid;place-items:center;background:color-mix(in srgb,#1f4e79 14%,var(--lg28-panel));border:1px solid var(--lg28-stroke)}
  .lgct-av img{width:100%;height:100%;object-fit:cover}.lgct-av span{font-size:34px;font-weight:700;color:#1f4e79}
  .lgct-foto b{display:block;font-size:18px}.lgct-foto small{color:var(--lg28-muted)}
  .lgct-foto-bts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.lgct-foto-bts label{cursor:pointer}
  .lgct-foto-bts label:focus-within{outline:3px solid #1f4e7966;outline-offset:2px}
  .lgct-seg{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:10px 0}
  .lgct-seg+.lgct-seg{border-top:1px dashed var(--lg28-stroke)}
  .lgct-seg b{display:block}.lgct-seg small{color:var(--lg28-muted);font-size:13px}
  .lgct-chk{display:flex;gap:6px;align-items:center;color:var(--lg28-muted);font-size:13.5px;white-space:nowrap}
  .lgct-rod{display:flex;justify-content:flex-end;margin-top:16px}
  .lgct-vazio,.lgct-dica{color:var(--lg28-muted)}
  .lgct-alerta td{color:#b42318}
  .user-avatar.lgct-com-foto{color:transparent!important}
  @media(max-width:640px){.lgct-grade{grid-template-columns:1fr}.lgct-foto{flex-direction:column;text-align:center}.lgct-foto-bts{justify-content:center}.lgct-seg{flex-direction:column;align-items:flex-start}.lgct-rod .lgt-btn{width:100%;justify-content:center}}`;
  document.head.appendChild(css);
})();
