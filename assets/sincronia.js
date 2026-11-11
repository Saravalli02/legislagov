/* =====================================================================
   LegislaGov — sincronia com o banco de dados do servidor
   Carregado antes de tudo (no <head>). Se o servidor tiver o banco ligado (/api/inicio),
   as informações do sistema passam a vir do servidor e cada alteração é enviada para lá,
   para todos os usuários verem. Sem banco (Render, arquivo local), não faz nada:
   o sistema continua no modo demonstração, com os dados no navegador.
   ===================================================================== */
(function () {
  'use strict';
  const PAINEL = /\/painel(\/|$)/.test(location.pathname);
  const LOCAIS = /^(site_(tema|fonte|cookies|contraste)|lg_contraste|lgv31_.*|lgv27_theme_v1|lgtr_.*|lg_brasao_v1|lgtv_cache_v1|lg_previa_.*|legislagov_v7_rascunho_.*|lgc_seguindo_v1|lg_area|lgp_escolher|lgvr_como|legislagov_session_v1|lg_camara_session_v3|lgsync_.*)$/;
  const ENVIO_PUBLICO = ['lgo_v1', 'site_mensagens', 'site_inscricoes', 'lgc_inscricoes_v1'];
  const USUARIOS = 'lg_camara_local_users_v3', SESSAO = 'lg_camara_session_v3';
  const ST = Storage.prototype, orig = { get: ST.getItem, set: ST.setItem, rem: ST.removeItem, key: ST.key };
  const LS = window.localStorage;
  const sincroniza = k => typeof k === 'string' && !LOCAIS.test(k);

  let info = null;
  try {
    const x = new XMLHttpRequest();
    x.open('GET', '/api/inicio' + (PAINEL ? '' : '?publico=1'), false);
    x.send();
    if (x.status === 200) info = JSON.parse(x.responseText);
  } catch (e) { info = null; }
  if (!info || !info.ok) { window.LG_SYNC = { ativo: false }; return; }

  const ver = {}, base = {};
  let seq = info.seq || 0, eu = info.eu || null;
  const SYNC = window.LG_SYNC = { ativo: true, camara: info.camara, modo: info.modo, eu, ocupados: info.ocupados || [] };

  function chavesLocais() { const out = []; for (let i = 0; i < LS.length; i++) out.push(orig.key.call(LS, i)); return out; }
  function aplicar(dados, limpar) {
    if (limpar) chavesLocais().forEach(k => { if (sincroniza(k) && !(k in dados)) orig.rem.call(LS, k); });
    Object.entries(dados || {}).forEach(([k, [v, n]]) => {
      if (v === 'null' || v == null) { orig.rem.call(LS, k); delete base[k]; } else { try { orig.set.call(LS, k, v); } catch (e) { console.warn('sem espaço no navegador para', k); } base[k] = v; }
      ver[k] = n;
    });
  }
  // abrir a página: o servidor manda. Sem login, só as informações públicas.
  aplicar(info.dados, true);
  try { if (PAINEL) { if (eu) sessionStorage.setItem(SESSAO, eu.id); else sessionStorage.removeItem(SESSAO); } } catch (e) { }

  /* ---------------- envio das alterações ---------------- */
  const pendentes = new Map(); let emEnvio = new Set(), falhou = false, sessaoCaiu = false;
  const cab = { 'Content-Type': 'application/json', 'X-LG': '1' };
  function status() {
    let el = document.getElementById('lgsync-status');
    if (!el && document.body) { el = document.createElement('div'); el.id = 'lgsync-status'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    if (!el) return;
    const salvando = pendentes.size || emEnvio.size;
    el.className = sessaoCaiu ? 'erro' : falhou ? 'erro' : salvando ? 'salvando' : '';
    el.textContent = sessaoCaiu ? 'Sua sessão terminou. Saia e entre de novo para continuar salvando.' : falhou ? 'Sem conexão com o servidor. Tentando de novo…' : salvando ? 'Salvando…' : '';
  }
  function agendar(k) {
    if (!eu || sessaoCaiu) return;
    clearTimeout(pendentes.get(k)); pendentes.set(k, setTimeout(() => enviar(k), 350)); status();
  }
  async function enviar(k) {
    pendentes.delete(k);
    if (emEnvio.has(k)) { agendar(k); return; }
    emEnvio.add(k); status();
    const valor = orig.get.call(LS, k);
    try {
      let r;
      if (valor == null) r = await fetch('/api/dados/' + encodeURIComponent(k), { method: 'DELETE', headers: cab, credentials: 'same-origin' });
      else r = await fetch('/api/dados/' + encodeURIComponent(k), { method: 'PUT', headers: cab, credentials: 'same-origin', body: JSON.stringify({ valor, versao: k in ver ? ver[k] : null }) });
      const d = await r.json().catch(() => ({}));
      falhou = false;
      if (r.status === 401) { sessaoCaiu = true; }
      else if (r.status === 409) {
        const junto = mesclar(base[k], valor, d.valor);
        ver[k] = d.versao; base[k] = d.valor;
        orig.set.call(LS, k, junto); avisar([k]);
        if (junto !== d.valor) agendar(k);
      } else if (r.ok) {
        if (k === USUARIOS && typeof d.valor === 'string') { orig.set.call(LS, k, d.valor); base[k] = d.valor; }
        else { ver[k] = d.versao; base[k] = valor; }
      } else console.warn('LegislaGov: não salvou', k, d.erro);
    } catch (e) { falhou = true; setTimeout(() => agendar(k), 5000); }
    emEnvio.delete(k); status();
  }
  // site sem login: só acrescenta pedidos novos (ouvidoria, e-SIC, contato, inscrições)
  async function enviarPublico(k, antes, depois) {
    let a, b; try { a = JSON.parse(antes || 'null'); b = JSON.parse(depois || 'null'); } catch (e) { return; }
    const lista = x => Array.isArray(x) ? x : (x && Array.isArray(x.itens) ? x.itens : []);
    const ja = new Set(lista(a).map(i => JSON.stringify(i)));
    const novos = lista(b).filter(i => !ja.has(JSON.stringify(i)));
    if (!novos.length) return;
    try { await fetch('/api/publico/enviar', { method: 'POST', headers: cab, body: JSON.stringify({ chave: k, itens: novos }) }); } catch (e) { }
  }

  ST.setItem = function (k, v) {
    if (this !== LS || !sincroniza(k)) return orig.set.call(this, k, v);
    const antes = orig.get.call(LS, k);
    orig.set.call(this, k, v);
    if (String(v) === antes) return;
    if (PAINEL && eu) agendar(k);
    else if (ENVIO_PUBLICO.includes(k)) enviarPublico(k, antes, String(v));
  };
  ST.removeItem = function (k) {
    if (this !== LS || !sincroniza(k)) return orig.rem.call(this, k);
    const tinha = orig.get.call(LS, k) != null;
    orig.rem.call(this, k);
    if (tinha && PAINEL && eu) agendar(k);
  };

  /* ---------------- juntar alterações feitas ao mesmo tempo ---------------- */
  function mesclar(b, l, r) {
    let B, L, R; try { B = JSON.parse(b ?? 'null'); L = JSON.parse(l ?? 'null'); R = JSON.parse(r ?? 'null'); } catch (e) { return l; }
    try { return JSON.stringify(junta(B, L, R)); } catch (e) { return l; }
  }
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const idDe = x => x && typeof x === 'object' ? (x.id ?? x.protocolo ?? x.numero ?? null) : null;
  function junta(B, L, R) {
    if (igual(L, B)) return R; if (igual(R, B) || igual(L, R)) return L;
    if (Array.isArray(L) && Array.isArray(R)) {
      if (L.concat(R).every(x => idDe(x) != null)) {
        const Bm = new Map((Array.isArray(B) ? B : []).map(x => [idDe(x), x])), Lm = new Map(L.map(x => [idDe(x), x]));
        const out = [], vistos = new Set();
        for (const x of R) { const k = idDe(x); vistos.add(k);
          if (!Lm.has(k)) { if (Bm.has(k) && igual(Bm.get(k), x)) continue; out.push(x); continue; }
          out.push(junta(Bm.get(k), Lm.get(k), x)); }
        for (const x of L) { const k = idDe(x); if (vistos.has(k)) continue; if (Bm.has(k) && igual(Bm.get(k), x)) continue; out.push(x); }
        return out;
      }
      const out = R.slice(); for (const x of L) if (!out.some(y => igual(x, y)) && !(Array.isArray(B) && B.some(y => igual(x, y)))) out.push(x); return out;
    }
    if (L && R && typeof L === 'object' && typeof R === 'object' && !Array.isArray(L) && !Array.isArray(R)) {
      const b = B && typeof B === 'object' && !Array.isArray(B) ? B : {}, out = {};
      for (const k of new Set([...Object.keys(R), ...Object.keys(L)])) {
        if (k in L && k in R) out[k] = junta(b[k], L[k], R[k]);
        else if (k in L) { if (!(k in b && igual(b[k], L[k]))) out[k] = L[k]; }
        else if (!(k in b && igual(b[k], R[k]))) out[k] = R[k];
      }
      return out;
    }
    return L;
  }

  /* ---------------- receber o que os outros mudaram ---------------- */
  function avisar(chaves) {
    chaves.forEach(k => { try { window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: orig.get.call(LS, k), storageArea: LS })); } catch (e) { } });
    window.dispatchEvent(new CustomEvent('lgsync', { detail: { chaves } }));
    const ocupado = document.querySelector('.lgt-modal:not([hidden]), [role=dialog]:not([hidden]) form, dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') || (document.activeElement || {}).isContentEditable;
    if (!ocupado && typeof window.renderAll === 'function' && window.usuarioAtual !== null) { try { window.renderAll(); } catch (e) { } }
  }
  async function conferir() {
    if (!eu || sessaoCaiu) return;
    try {
      const r = await fetch('/api/mudancas?desde=' + seq, { credentials: 'same-origin', headers: { 'X-LG': '1' } });
      if (r.status === 401) { sessaoCaiu = true; status(); return; }
      const d = await r.json(); falhou = false; seq = d.seq || seq;
      const mudou = [];
      Object.entries(d.dados || {}).forEach(([k, [v, n]]) => {
        if (pendentes.has(k) || emEnvio.has(k)) return;   // a nossa alteração vai juntar com a deles
        if (v === orig.get.call(LS, k)) { ver[k] = n; base[k] = v; return; }
        if (v === 'null') orig.rem.call(LS, k); else orig.set.call(LS, k, v);
        ver[k] = n; base[k] = v; mudou.push(k);
      });
      if (mudou.length) avisar(mudou);
    } catch (e) { falhou = true; }
    status();
  }
  if (PAINEL) {
    let t; const ciclo = () => { clearTimeout(t); t = setTimeout(async () => { await conferir(); ciclo(); }, document.hidden ? 30000 : 8000); };
    ciclo(); document.addEventListener('visibilitychange', () => { if (!document.hidden) { conferir(); ciclo(); } });
    addEventListener('beforeunload', e => { if (pendentes.size || emEnvio.size) { e.preventDefault(); e.returnValue = ''; } });
  }

  /* ---------------- entrar, sair, trocar senha ---------------- */
  async function api(url, corpo) {
    const r = await fetch(url, { method: 'POST', headers: cab, credentials: 'same-origin', body: JSON.stringify(corpo || {}) });
    const d = await r.json().catch(() => ({ ok: false, erro: 'Falha de conexão.' })); d.status = r.status; return d;
  }
  SYNC.api = api;
  async function entrar(ev) {
    if (ev) ev.preventDefault();
    const v = id => (document.getElementById(id) || {}).value || '';
    const erro = m => { if (typeof window.mostrarErro === 'function') window.mostrarErro('login-error', m); else alert(m); return false; };
    const usuario = v('login-email').trim(), senha = v('login-senha');
    if (!usuario || !senha) return erro('Informe usuário e senha.');
    const btn = document.querySelector('#login-form button[type=submit]'); if (btn) btn.disabled = true;
    try {
      const d = await api('/api/login', { usuario, senha });
      if (!d.ok) return erro(d.erro || 'Não foi possível entrar.');
      const r = await fetch('/api/inicio', { credentials: 'same-origin' }); const i = await r.json();
      eu = SYNC.eu = i.eu; seq = i.seq || seq;
      // o que só existe aqui (informações iniciais criadas ao abrir) vai para o servidor
      const soLocal = chavesLocais().filter(k => sincroniza(k) && k !== USUARIOS && !(k in i.dados));
      aplicar(i.dados, false);
      soLocal.forEach(agendar);
      sessionStorage.setItem(SESSAO, eu.id);
      if (typeof window.esconderErro === 'function') window.esconderErro('login-error');
      const u = (JSON.parse(orig.get.call(LS, USUARIOS) || '[]')).find(x => x.id === eu.id) || eu;
      window.iniciarSessao({ ...u, email: u.usuario });
      if (d.provisoria) setTimeout(() => avisoSenha(true), 600);
    } catch (e) { return erro('Falha de conexão com o servidor.'); }
    finally { if (btn) btn.disabled = false; }
    return false;
  }
  async function sair() {
    if (pendentes.size) { for (const k of [...pendentes.keys()]) { clearTimeout(pendentes.get(k)); await enviar(k); } }
    try { await api('/api/logout'); } catch (e) { }
    eu = SYNC.eu = null;
    chavesLocais().forEach(k => { if (sincroniza(k)) orig.rem.call(LS, k); });
    try { sessionStorage.clear(); } catch (e) { }
    location.reload();
  }
  function trocarSenha() {
    let m = document.getElementById('lgsync-senha'); if (m) m.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="lgsync-senha" role="dialog" aria-modal="true" aria-labelledby="lgsync-senha-t"><form>
      <h2 id="lgsync-senha-t">Trocar minha senha</h2>
      <label>Senha atual<input type="password" name="atual" autocomplete="current-password" required></label>
      <label>Nova senha (mínimo 8 caracteres)<input type="password" name="nova" autocomplete="new-password" minlength="8" required></label>
      <label>Repita a nova senha<input type="password" name="nova2" autocomplete="new-password" minlength="8" required></label>
      <p class="erro" hidden></p>
      <div class="acoes"><button type="button" data-x>Cancelar</button><button type="submit" class="pri">Trocar senha</button></div></form></div>`);
    m = document.getElementById('lgsync-senha'); const f = m.querySelector('form'), er = m.querySelector('.erro');
    m.querySelector('[data-x]').onclick = () => m.remove();
    f.querySelector('input').focus();
    f.onsubmit = async e => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(f));
      const falha = t => { er.textContent = t; er.hidden = false; };
      if (d.nova !== d.nova2) return falha('As senhas novas não são iguais.');
      const r = await api('/api/senha', { atual: d.atual, nova: d.nova });
      if (!r.ok) return falha(r.erro || 'Não foi possível trocar.');
      f.innerHTML = '<h2>Senha trocada</h2><p>Por segurança, entre de novo com a senha nova.</p><div class="acoes"><button type="button" class="pri">Entrar de novo</button></div>';
      f.querySelector('button').onclick = sair;
    };
  }
  function avisoSenha(provisoria) {
    if (!provisoria || document.getElementById('lgsync-aviso')) return;
    document.body.insertAdjacentHTML('beforeend', '<div id="lgsync-aviso" role="alert">Você entrou com a senha provisória. <button type="button">Criar minha senha</button><button type="button" aria-label="Fechar" class="x">×</button></div>');
    const a = document.getElementById('lgsync-aviso'); a.querySelector('button').onclick = () => { a.remove(); trocarSenha(); }; a.querySelector('.x').onclick = () => a.remove();
  }
  SYNC.trocarSenha = trocarSenha; SYNC.sair = sair;
  window.lgTrocarSenha = trocarSenha;

  function estilos() {
    const s = document.createElement('style'); s.textContent = `
    #lgsync-status{position:fixed;left:14px;bottom:14px;z-index:99999;font:600 12px/1.2 system-ui,sans-serif;padding:8px 12px;border-radius:999px;background:#1f2937;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none}
    #lgsync-status:empty{display:none}#lgsync-status.erro{background:#9b1c1c}
    #lgsync-aviso{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99998;background:#141209;border:1px solid #6b5520;color:#f3dfa6;padding:10px 14px;border-radius:10px;font:500 13px system-ui,sans-serif;display:flex;gap:10px;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.4)}
    #lgsync-aviso button{background:#f2f3f5;color:#111;border:0;border-radius:7px;padding:6px 10px;font-weight:600;cursor:pointer}#lgsync-aviso .x{background:transparent;color:#f3dfa6;font-size:18px;padding:0 4px}
    #lgsync-senha{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px}
    #lgsync-senha form{background:#0d0e10;border:1px solid #2a2c31;border-radius:14px;padding:22px;width:min(100%,380px);color:#f3f4f6;font:14px system-ui,sans-serif;display:grid;gap:12px}
    #lgsync-senha h2{margin:0;font-size:18px}#lgsync-senha label{display:grid;gap:6px;color:#b4b8be;font-size:13px}
    #lgsync-senha input{background:#141517;border:1px solid #2c2f34;color:#fff;border-radius:9px;padding:10px 12px;font:inherit}
    #lgsync-senha .erro{color:#fca5a5;margin:0}#lgsync-senha .acoes{display:flex;gap:8px;justify-content:flex-end}
    #lgsync-senha button{border-radius:9px;padding:9px 14px;border:1px solid #2c2f34;background:transparent;color:#e5e7eb;font-weight:600;cursor:pointer}#lgsync-senha button.pri{background:#f2f3f5;color:#0b0c0e;border:0}
    .lgsync-trocar{margin-top:6px}`;
    document.head.appendChild(s);
  }
  if (PAINEL) {
    document.addEventListener('DOMContentLoaded', () => {
      estilos();
      // trocam as funções de entrar/sair do painel (antes os outros módulos se acoplam a elas)
      window.fazerLogin = entrar;
      window.fazerLogout = sair;
      window.lgSeed = function () { };   // usuários iniciais agora são criados no servidor
      const demo = document.querySelector('#auth-screen .demo-alert');
      if (demo) demo.textContent = 'AMBIENTE DE TESTES · Os dados ficam no servidor da Câmara e todos os usuários veem as mesmas informações.';
      const hint = document.querySelector('#register-form .auth-hint');
      if (hint) hint.textContent = 'Seu cadastro fica aguardando a liberação do administrador. O Presidente da Câmara é escolhido pela Procuradoria entre os vereadores.';
      // "Trocar senha" no menu lateral, junto do Sair
      const poe = () => { if (document.querySelector('.lgsync-trocar')) return;
        const sair_ = [...document.querySelectorAll('button, a')].find(b => /^\s*Sair\s*$/.test(b.textContent || '') && b.offsetParent);
        if (!sair_) return; const b = sair_.cloneNode(true); b.removeAttribute('onclick'); b.removeAttribute('href'); b.classList.add('lgsync-trocar');
        b.querySelectorAll('svg').forEach(s => s.remove()); b.textContent = 'Trocar minha senha'; b.onclick = e => { e.preventDefault(); trocarSenha(); };
        sair_.parentNode.insertBefore(b, sair_); };
      setInterval(poe, 2000);
      status();
    });
  }
})();
