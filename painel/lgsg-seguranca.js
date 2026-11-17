/* =====================================================================
   LegislaGov — SEGURANÇA DE ACESSO
   · "Esqueci minha senha": o link chega no e-mail cadastrado (Amazon SES, nao-responda@legislagov.com.br).
   · Link de redefinição (?redefinir=…): cria a senha nova.
   · Usuários (administrador/Procuradoria): situação (bloqueada depois de 3 senhas erradas), e-mail,
     criar senha nova (desbloqueia), ativar/desativar, permissões.
   · Internet da Câmara: endereços (IP) confiáveis, que não entram no bloqueio por excesso de acessos.
   ===================================================================== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const post = async (url, corpo) => { try { const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-LG': '1' }, body: JSON.stringify(corpo || {}) }); const d = await r.json().catch(() => ({})); return Object.assign({ ok: r.ok }, d); } catch (e) { return { ok: false, erro: 'Sem conexão com o servidor.' }; } };
  const UI = () => window.lgtUI;
  const eu = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const gestor = () => { const u = eu(); return !!(u && window.lgPerfil && ['adm', 'procurador'].includes(lgPerfil(u))); };
  const gera = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const v = new Uint32Array(10); crypto.getRandomValues(v); return [...v].map(x => a[x % a.length]).join(''); };

  /* ---------------- tela de entrada: esqueci minha senha ---------------- */
  function linkEsqueci() {
    const f = $('#login-form'); if (!f || $('#lgsg-esqueci')) return;
    f.insertAdjacentHTML('beforeend', '<p class="auth-hint" style="text-align:center;margin-top:10px"><button type="button" class="link-btn" id="lgsg-esqueci" onclick="abrirEsqueciSenha()">Esqueci minha senha</button></p>');
    const ff = $('#forgot-form');
    if (ff) {
      const p = ff.querySelector('.modal-sub'); if (p) p.textContent = 'Escreva o seu usuário. Se você tiver e-mail cadastrado, enviamos um link para criar uma senha nova (vale por 1 hora).';
      const lab = ff.querySelector('label'); if (lab) lab.textContent = 'Usuário';
      const i = $('#forgot-email'); if (i) { i.type = 'text'; i.placeholder = 'Seu usuário'; i.autocomplete = 'username'; }
      const b = ff.querySelector('button[type=submit]'); if (b) b.textContent = 'Enviar link para o meu e-mail';
    }
  }
  window.abrirEsqueciSenha = function () {
    if (typeof esconderTodosPaineisAuth === 'function') esconderTodosPaineisAuth();
    const e = $('#forgot-error'); if (e) { e.textContent = ''; e.style.display = 'none'; }
    $('#forgot-email').value = ($('#login-email') || {}).value || '';
    $('#forgot-form').style.display = 'block';
  };
  window.enviarRecuperacaoSenha = async function (ev) {
    ev.preventDefault();
    const usuario = $('#forgot-email').value.trim();
    if (!usuario) { const e = $('#forgot-error'); e.textContent = 'Escreva o seu usuário.'; e.style.display = 'block'; return false; }
    const r = await post('/api/senha/esqueci', { usuario });
    $('#forgot-form').style.display = 'none';
    const s = $('#forgot-sent');
    const p = s.querySelector('.modal-sub');
    if (p) p.textContent = r.email === false
      ? 'O envio de e-mail ainda não está ligado neste servidor. Peça ao administrador do sistema uma senha nova (em Vereadores e usuários › Senha nova).'
      : 'Se o seu usuário tiver e-mail cadastrado, o link chega em alguns minutos (olhe também o spam). Se não tiver e-mail cadastrado, peça ao administrador uma senha nova.';
    s.style.display = 'block';
    return false;
  };
  window.confirmarNovaSenha = async function (ev) {
    ev.preventDefault();
    const s1 = $('#reset-senha').value, s2 = $('#reset-senha2').value, er = $('#reset-error');
    const erro = t => { er.textContent = t; er.style.display = 'block'; };
    if (s1.length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.'), false;
    if (s1 !== s2) return erro('As duas senhas não são iguais.'), false;
    const token = new URLSearchParams(location.search).get('redefinir');
    const r = await post('/api/senha/redefinir', { token, nova: s1 });
    if (!r.ok) return erro(r.erro || 'Não foi possível criar a senha.'), false;
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
    if (typeof setAuthTab === 'function') setAuthTab('login');
    const ok = $('#login-success'); if (ok) { ok.textContent = 'Senha nova criada. Entre com ela.'; ok.style.display = 'block'; }
    return false;
  };
  function abrirRedefinir() {
    if (!new URLSearchParams(location.search).get('redefinir')) return;
    if (typeof esconderTodosPaineisAuth === 'function') esconderTodosPaineisAuth();
    const f = $('#reset-form'); if (!f) return;
    const lab = $('#reset-email-label'); if (lab) lab.textContent = 'a sua conta';
    f.style.display = 'block'; setTimeout(() => $('#reset-senha')?.focus(), 50);
  }

  /* ---------------- usuários ---------------- */
  function situacao(u) {
    if (u.bloqueada && !(u.perfil === 'admin' && u.bloqueada.ate && u.bloqueada.ate * 1000 < Date.now())) return ['Bloqueada', 'blq'];
    if (u.pendente) return ['Aguardando liberação', 'pen'];
    if (u.ativo === false) return ['Desativado', 'off'];
    return ['Ativo', 'on'];
  }
  window.renderUsuarios = async function () {
    const wrap = document.getElementById('usuarios-por-municipio'); if (!wrap) return;
    const lista = (window.lgUsers ? lgUsers() : []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const g = gestor();
    wrap.innerHTML = `<div class="lgsg"><h2>Usuários da Câmara</h2>
      <p class="lgsg-p">Depois de 3 senhas erradas seguidas a conta fica <b>bloqueada</b>. Para liberar, a pessoa usa “Esqueci minha senha” (se tiver e-mail cadastrado) ou ${g ? 'você cria uma senha nova aqui' : 'o administrador cria uma senha nova'}.</p>
      <div class="lgsg-tab"><table class="docket"><thead><tr><th>Nome</th><th>Usuário</th><th>Setor</th><th>E-mail para recuperar</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map(u => { const [st, cls] = situacao(u); return `<tr><td>${esc(u.nome)}</td><td>${esc(u.usuario)}</td><td>${esc(u.setor || u.cargo || '')}</td><td>${u.email ? esc(u.email) : '<span class="lgsg-sem">não cadastrado</span>'}</td>
        <td><span class="lgsg-st ${cls}">${st}</span>${cls === 'blq' && u.bloqueada.em ? `<small>${esc(u.bloqueada.em)}${u.bloqueada.ip ? ' · ' + esc(u.bloqueada.ip) : ''}</small>` : ''}</td>
        <td class="lgsg-acoes">${g ? `<button class="mini-edit-btn" data-senha="${esc(u.id)}">${cls === 'blq' ? 'Desbloquear (senha nova)' : 'Senha nova'}</button><button class="mini-edit-btn" data-email="${esc(u.id)}">E-mail</button>` : ''}
          ${u.perfil !== 'admin' && g ? `<button class="mini-edit-btn" onclick="lgToggleUser('${esc(u.id)}')">${u.ativo !== false ? 'Desativar' : 'Ativar'}</button>` : ''}
          <button class="mini-edit-btn" onclick="lgv13EditUser('${esc(u.id)}')">Permissões</button></td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="lgsg-p">Para cadastrar, use a opção “Cadastrar usuário” na tela de entrada; depois libere aqui ou em Áreas e acessos.</p>
      ${g ? '<div id="lgsg-ips"></div>' : ''}</div>`;
    wrap.querySelectorAll('[data-senha]').forEach(b => b.onclick = () => senhaNova(lista.find(x => x.id === b.dataset.senha)));
    wrap.querySelectorAll('[data-email]').forEach(b => b.onclick = () => emailDe(lista.find(x => x.id === b.dataset.email)));
    if (g) desenharIps();
  };
  function senhaNova(u) {
    if (!u) return; const s = gera();
    UI().abrirModal(`<form class="lgt-form" id="lgsg-sf"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Senha nova para ${esc(u.nome)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgt-campos" style="padding:4px 22px"><p class="lgt-p">A conta é desbloqueada e a pessoa sai de todos os aparelhos. No primeiro acesso, o sistema pede para ela trocar esta senha.</p>
      <label>Senha nova (mínimo 8)<input name="s" value="${s}" minlength="8" autocomplete="off" style="font-family:monospace;font-size:17px"></label>
      <p class="lgt-p">Entregue a senha pessoalmente ou por mensagem direta para a pessoa.</p><p class="lgsg-erro" id="lgsg-se" role="alert"></p></div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Criar senha nova</button></div></form>`);
    $('#lgsg-sf').onsubmit = async e => {
      e.preventDefault(); const r = await post('/api/usuario/senha', { id: u.id, senha: e.target.s.value });
      if (!r.ok) { $('#lgsg-se').textContent = r.erro || 'Não foi possível.'; return; }
      UI().fecharModal(); UI().aviso('Senha nova criada. A conta está liberada.'); setTimeout(() => window.renderUsuarios(), 1500);
    };
  }
  function emailDe(u) {
    if (!u) return;
    UI().abrirModal(`<form class="lgt-form" id="lgsg-ef"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">E-mail de ${esc(u.nome)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgt-campos" style="padding:4px 22px"><p class="lgt-p">Usado só para o link de “Esqueci minha senha”. A própria pessoa também pode cadastrar em “Minha senha e e-mail”.</p>
      <label>E-mail<input name="e" type="email" value="${esc(u.email || '')}" placeholder="nome@exemplo.com"></label></div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Salvar</button></div></form>`);
    $('#lgsg-ef').onsubmit = e => {
      e.preventDefault(); const em = e.target.e.value.trim().toLowerCase();
      if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { UI().aviso('Confira o e-mail.', 'erro'); return; }
      const l = lgUsers(); const x = l.find(y => y.id === u.id); if (!x) return; if (em) x.email = em; else delete x.email; lgSaveUsers(l);
      UI().fecharModal(); UI().aviso('E-mail salvo.'); window.renderUsuarios();
    };
  }

  /* ---------------- internet da Câmara (IPs confiáveis) ---------------- */
  const KIP = 'lg_ips_confiaveis_v1';
  const ips = () => { try { return JSON.parse(localStorage.getItem(KIP)) || []; } catch (e) { return []; } };
  async function desenharIps() {
    const el = $('#lgsg-ips'); if (!el) return;
    let atual = ''; try { atual = (await (await fetch('/api/meu-ip', { credentials: 'same-origin' })).json()).ip || ''; } catch (e) { }
    const l = ips();
    el.innerHTML = `<h2 style="margin-top:26px">Internet da Câmara</h2>
      <p class="lgsg-p">Endereços (IP) da internet do prédio da Câmara. Eles não são bloqueados quando muitas pessoas usam o sistema ao mesmo tempo. Quem acessa de fora (4G, casa) continua com a proteção normal.</p>
      <ul class="lgsg-ips">${l.map((x, i) => `<li><b>${esc(x.ip)}</b> <span>${esc(x.nome || '')}</span><button class="mini-edit-btn" data-rm="${i}">Tirar</button></li>`).join('') || '<li class="lgsg-sem">Nenhum endereço cadastrado.</li>'}</ul>
      <p class="lgsg-p">Você está usando agora: <b>${esc(atual || '—')}</b> ${atual && !l.some(x => x.ip === atual) ? '<button class="mini-edit-btn" id="lgsg-ipadd">Esta é a internet da Câmara</button>' : ''}</p>`;
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const a = ips(); a.splice(+b.dataset.rm, 1); localStorage.setItem(KIP, JSON.stringify(a)); desenharIps(); });
    const add = $('#lgsg-ipadd'); if (add) add.onclick = () => { const a = ips(); a.push({ ip: atual, nome: 'Internet da Câmara', em: new Date().toISOString() }); localStorage.setItem(KIP, JSON.stringify(a)); UI().aviso('Endereço cadastrado.'); desenharIps(); };
  }

  const css = document.createElement('style'); css.textContent = `
  .lgsg h2{font-size:18px;margin:0 0 8px}.lgsg-p{color:var(--lg28-muted,#5d6b7b);font-size:13.5px;max-width:80ch}
  .lgsg-tab{overflow-x:auto}.lgsg-tab table{min-width:760px}
  .lgsg-st{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700}
  .lgsg-st.on{background:#e2f5ea;color:#17703f}.lgsg-st.off{background:#eef0f3;color:#5d6b7b}.lgsg-st.pen{background:#fbf1d9;color:#8a6200}.lgsg-st.blq{background:#fde7e7;color:#b42318}
  .lgsg td small{display:block;color:var(--lg28-muted,#5d6b7b);font-size:11.5px;margin-top:2px}
  .lgsg-sem{color:var(--lg28-muted,#8a96a3);font-style:italic}
  .lgsg-acoes{white-space:nowrap}.lgsg-acoes .mini-edit-btn{margin:2px}
  .lgsg-ips{list-style:none;padding:0;margin:8px 0;display:flex;flex-direction:column;gap:6px}.lgsg-ips li{display:flex;gap:10px;align-items:center}
  .lgsg-erro{color:#b42318;font-weight:600}`;
  document.head.appendChild(css);

  function iniciar() { linkEsqueci(); abrirRedefinir(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
