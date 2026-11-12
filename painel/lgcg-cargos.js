/* =====================================================================
   LegislaGov — CARGOS DA CÂMARA (cadastro de usuário)
   · Órgão: só a Câmara Municipal.
   · Cargos fixos: Diretor(a) de Secretaria, Técnico(a) Contábil, Tesoureiro(a) e Procurador(a)
     Legislativo são únicos (um usuário ativo por cargo). Vereador fica sempre aberto.
   · O Presidente da Câmara não é cargo de cadastro: é um vereador que a Procuradoria marca
     em Administrativo › Vereadores e usuários.
   · Cada cargo já entra com as funções do seu perfil; o administrador libera outras em
     Administrativo › Áreas e acessos (ex.: Transparência ou site para a Diretora de Secretaria).
   ===================================================================== */
(function () {
  const CARGOS = [
    { id: 'diretora', nome: 'Diretor(a) de Secretaria', perfil: 'secretaria', setor: 'Secretaria Legislativa', unico: true, funcao: 'Protocolo, matérias, sessões e atendimento' },
    { id: 'contabil', nome: 'Técnico(a) Contábil', perfil: 'financeiro', setor: 'Contabilidade', unico: true, funcao: 'Contabilidade e Portal da Transparência' },
    { id: 'tesoureira', nome: 'Tesoureiro(a)', perfil: 'financeiro', setor: 'Tesouraria', unico: true, funcao: 'Tesouraria e Portal da Transparência' },
    { id: 'procurador', nome: 'Procurador(a) Legislativo', perfil: 'procurador', setor: 'Procuradoria Legislativa', unico: true, funcao: 'Pareceres jurídicos, vereadores, Presidente e permissões' },
    { id: 'vereador', nome: 'Vereador(a)', perfil: 'usuario', setor: 'Gabinete', unico: false, funcao: 'Portal do Vereador' },
  ];
  window.LG_CARGOS = CARGOS;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const users = () => (typeof lgUsers === 'function' ? lgUsers() : []);
  const comp = () => { try { return JSON.parse(localStorage.getItem('lgv_camara_v1')) || { vereadores: [] }; } catch (e) { return { vereadores: [] }; } };

  function cargoDe(u) {
    if (!u) return '';
    if (u.cargoId && CARGOS.some(c => c.id === u.cargoId)) return u.cargoId;
    const t = `${u.cargo || ''} ${u.setor || ''}`;
    if (u.orgao === 'ambos' || u.perfil === 'admin') return '';
    if (/procurad/i.test(t)) return 'procurador';
    if (/tesour/i.test(t)) return 'tesoureira';
    if (/cont[aá]b/i.test(t)) return 'contabil';
    if (/diretor|secret/i.test(t)) return 'diretora';
    if (/vereador|presidente da c/i.test(t) || (window.lgVereadorDoUsuario && lgVereadorDoUsuario(u))) return 'vereador';
    return '';
  }
  window.lgCargoDe = cargoDe;
  const SYNC = () => window.LG_SYNC && LG_SYNC.ativo ? LG_SYNC : null;
  const ocupante = (id, exceto) => {
    const s = SYNC(); if (s && !s.eu) return (s.ocupados || []).includes(id) ? { id } : null;   // tela de cadastro: o servidor diz quais já existem
    return users().find(u => (u.ativo !== false || u.pendente) && u.id !== exceto && cargoDe(u) === id);
  };
  window.lgCargoOcupado = (id, exceto) => { const c = CARGOS.find(x => x.id === id); return !!(c && c.unico && ocupante(id, exceto)); };

  /* usuários que já existiam: grava o cargo novo uma vez */
  function migrar() {
    if (typeof lgUsers !== 'function') return;
    if (SYNC() && !SYNC().eu) return;
    const a = lgUsers(); const vistos = {}; let mudou = false;
    a.forEach(u => { if (u.cargoId && u.ativo !== false) vistos[u.cargoId] = 1; });
    a.forEach(u => { if (u.cargoId) return; const id = cargoDe(u); if (!id) return; const c = CARGOS.find(x => x.id === id);
      if (c.unico && u.ativo !== false) { if (vistos[id]) return; vistos[id] = 1; }
      u.cargoId = id; u.cargo = c.nome; u.setor = c.setor; if (c.perfil !== 'usuario') u.perfil = c.perfil; mudou = true; });
    if (mudou) lgSaveUsers(a);
  }

  /* ---------------- tela de cadastro ---------------- */
  function ajustarFormulario() {
    const f = document.getElementById('register-form'); if (!f || f.dataset.lgcg) return; f.dataset.lgcg = '1';
    const org = document.getElementById('reg-orgao'); const grpOrg = org && org.closest('.field-group');
    if (grpOrg) { grpOrg.style.display = 'none'; grpOrg.insertAdjacentHTML('afterend', '<div class="field-group lgcg-org"><label>Órgão</label><div class="lgcg-fixo">Câmara Municipal de Neves Paulista</div></div>'); }
    ['reg-cpf', 'reg-telefone'].forEach(id => { const e = document.getElementById(id); if (e) e.required = false; }); // campos ocultos: não podem travar o envio
    const mun = document.getElementById('reg-municipio'); if (mun) { const g = mun.closest('.field-group'); if (g) g.style.display = 'none'; }
    const sel = document.getElementById('reg-cargo'); const grp = sel && sel.closest('.field-group');
    if (grp) { const l = grp.querySelector('label'); if (l) { l.textContent = 'Cargo'; l.setAttribute('for', 'reg-cargo'); }
      grp.insertAdjacentHTML('beforeend', '<small class="lgcg-ajuda" id="lgcg-ajuda"></small>');
      grp.insertAdjacentHTML('afterend', '<div class="field-group" id="lgcg-ver" hidden><label for="reg-vereador">Qual vereador você é?</label><select id="reg-vereador"></select><small class="lgcg-ajuda">Se seu nome não estiver na lista, peça à Procuradoria para incluir você na composição da Câmara.</small></div>'); }
    sel && sel.addEventListener('change', mostrarAjuda);
    const hint = f.querySelector('.auth-hint'); if (hint) hint.textContent = 'O Presidente da Câmara é escolhido pela Procuradoria entre os vereadores. Outras funções são liberadas pelo administrador.';
  }
  function mostrarAjuda() {
    const sel = document.getElementById('reg-cargo'); if (!sel) return; const c = CARGOS.find(x => x.id === sel.value);
    const aj = document.getElementById('lgcg-ajuda');
    const ocup = c && c.unico && ocupante(c.id);
    if (aj) { aj.textContent = ocup ? `Não é possível: já existe um usuário cadastrado como ${c.nome}. Esse cargo é único na Câmara.` : (c ? `Funções: ${c.funcao}.` : ''); aj.classList.toggle('lgcg-erro', !!ocup); }
    sel.classList.toggle('lgcg-invalido', !!ocup); sel.setAttribute('aria-invalid', ocup ? 'true' : 'false');
    const box = document.getElementById('lgcg-ver'); if (!box) return; box.hidden = !c || c.id !== 'vereador';
    if (!box.hidden) { const vs = comp().vereadores || []; const livres = vs.filter(v => !v.usuario && !v.temUsuario);
      document.getElementById('reg-vereador').innerHTML = livres.length ? '<option value="">Escolha seu nome…</option>' + livres.map(v => `<option value="${esc(v.id)}">${esc(v.completo || v.nome)}${v.partido ? ' (' + esc(v.partido) + ')' : ''}</option>`).join('') : '<option value="">Todos os vereadores já têm usuário</option>'; }
  }
  window.atualizarCargos = function () {
    ajustarFormulario();
    const sel = document.getElementById('reg-cargo'); if (!sel) return;
    const antes = sel.value, verAntes = (document.getElementById('reg-vereador') || {}).value;
    sel.innerHTML = '<option value="">Escolha o cargo…</option>' + CARGOS.map(c => { const ocup = c.unico && ocupante(c.id); return `<option value="${c.id}">${esc(c.nome)}${ocup ? ' — já tem usuário' : ''}</option>`; }).join('');
    const o = document.getElementById('reg-orgao'); if (o) o.value = 'cam';
    if (antes && sel.querySelector(`option[value="${antes}"]`)) sel.value = antes;
    mostrarAjuda();
    const rv = document.getElementById('reg-vereador'); if (rv && verAntes && rv.querySelector(`option[value="${verAntes}"]`)) rv.value = verAntes;
  };
  window.fazerCadastro = async function (ev) {
    ev.preventDefault();
    const v = id => (document.getElementById(id) || {}).value || '';
    const nome = v('reg-nome').trim(), usuario = v('reg-email').trim(), senha = v('reg-senha'), senha2 = v('reg-senha2'), cargoId = v('reg-cargo'), verId = v('reg-vereador');
    const erro = m => { mostrarErro('register-error', m); return false; };
    if (!nome || !usuario || !senha) return erro('Informe nome, usuário e senha.');
    if (!/^[\p{L}0-9._-]{3,30}$/u.test(usuario)) return erro('O usuário deve ter de 3 a 30 letras ou números, sem espaços.');
    const c = CARGOS.find(x => x.id === cargoId); if (!c) return erro('Escolha o cargo.');
    if (c.unico && ocupante(c.id)) { atualizarCargos(); return erro(`Não é possível: já existe um usuário cadastrado como ${c.nome}. Esse cargo é único na Câmara.`); }
    if (c.id === 'vereador' && !verId) return erro('Escolha qual vereador você é. Se não estiver na lista, a Procuradoria precisa incluir seu nome primeiro.');
    if (senha.length < (SYNC() ? 8 : 6)) return erro(`A senha precisa ter pelo menos ${SYNC() ? 8 : 6} caracteres.`);
    if (senha !== senha2) return erro('As senhas não coincidem.');
    if (SYNC()) {   // servidor: o cadastro fica aguardando a liberação do administrador
      const r = await SYNC().api('/api/cadastro', { nome, usuario, senha, cargoId: c.id, cargo: c.nome, setor: c.setor, perfil: c.perfil === 'usuario' ? (c.id === 'vereador' ? 'vereador' : 'usuario') : c.perfil, vereadorId: verId });
      if (!r.ok) return erro(r.erro || 'Não foi possível enviar o cadastro.');
      if (c.unico) SYNC().ocupados = [...(SYNC().ocupados || []), c.id];
      esconderErro('register-error'); setAuthTab('login'); document.getElementById('login-email').value = usuario;
      const ok = document.getElementById('login-success'); ok.textContent = `Cadastro enviado como ${c.nome}. Você poderá entrar assim que o administrador liberar.`; ok.style.display = 'block';
      document.getElementById('register-form').reset(); atualizarCargos();
      return false;
    }
    const a = lgUsers(); if (a.some(u => String(u.usuario).toLowerCase() === usuario.toLowerCase())) return erro('Este usuário já existe.');
    const novo = { id: 'usr-' + Date.now(), usuario, nome, senha, cargoId: c.id, cargo: c.nome, setor: c.setor, orgao: 'cam', municipio: 'Neves Paulista — SP', ativo: true, criadoEm: new Date().toISOString() };
    if (c.perfil !== 'usuario') novo.perfil = c.perfil; else novo.perfil = 'usuario';
    a.push(novo); lgSaveUsers(a);
    if (c.id === 'vereador') { const cc = comp(); const vv = cc.vereadores.find(x => x.id === verId);
      if (vv && !vv.usuario) { vv.usuario = usuario; (cc.historico = cc.historico || []).push({ data: new Date().toISOString(), texto: `Vereador ${vv.nome} criou o usuário "${usuario}"`, por: nome }); localStorage.setItem('lgv_camara_v1', JSON.stringify(cc)); } }
    try { registrarLog('Usuário cadastrado', `${usuario} — ${c.nome}`); } catch (e) { }
    esconderErro('register-error'); setAuthTab('login'); document.getElementById('login-email').value = usuario;
    const ok = document.getElementById('login-success'); ok.textContent = `Cadastro criado como ${c.nome}. Faça login.`; ok.style.display = 'block';
    document.getElementById('register-form').reset(); atualizarCargos();
    return false;
  };

  /* Áreas e acessos: cadastros aguardando liberação (só com o servidor) */
  function pendentes() {
    const tela = document.getElementById('view-lgt-acessos'); if (!tela || tela.style.display === 'none') return;
    const gestor = window.lgPerfil && ['adm', 'procurador'].includes(lgPerfil());
    const lista = users().filter(u => u.pendente);
    let box = document.getElementById('lgcg-pend');
    if (!gestor || !lista.length) { if (box) box.remove(); return; }
    const assin = JSON.stringify(lista.map(u => u.id)); if (box && box.dataset.a === assin) return;
    if (!box) { box = document.createElement('div'); box.id = 'lgcg-pend'; box.className = 'lgt-card'; const ref = tela.querySelector('.lgt-areas-info') || tela.firstElementChild; ref.insertAdjacentElement('afterend', box); }
    box.dataset.a = assin;
    const vs = comp().vereadores || [];
    box.innerHTML = `<h3>Cadastros aguardando liberação (${lista.length})</h3><p class="lgt-p">Confira se a pessoa é mesmo do cargo antes de liberar. Depois de liberada, ela entra com a senha que criou.</p>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Nome</th><th>Usuário</th><th>Cargo</th><th>Pedido em</th><th class="acoes-col">Ações</th></tr></thead><tbody>${lista.map(u => {
        const v = u.vereadorPedido && vs.find(x => x.id === u.vereadorPedido);
        return `<tr><td><b>${esc(u.nome)}</b>${v ? `<small>Diz ser: ${esc(v.completo || v.nome)}</small>` : ''}</td><td>${esc(u.usuario)}</td><td>${esc(u.cargo || '')}</td><td>${u.criadoEm ? esc(new Date(u.criadoEm).toLocaleDateString('pt-BR')) : '—'}</td>
        <td class="acoes-col"><button class="lgt-mini" type="button" data-lib="${esc(u.id)}">Liberar</button><button class="lgt-mini perigo" type="button" data-rec="${esc(u.id)}">Recusar</button></td></tr>`; }).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => decidir(b.dataset.lib, true));
    box.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => decidir(b.dataset.rec, false));
  }
  function decidir(id, liberar) {
    const a = lgUsers(); const u = a.find(x => x.id === id); if (!u) return;
    const c = CARGOS.find(x => x.id === u.cargoId);
    if (liberar && c && c.unico && ocupante(c.id, u.id)) { alert(`Já existe outra pessoa como ${c.nome}. Desative a outra antes de liberar esta.`); return; }
    if (!liberar && !confirm(`Recusar o cadastro de ${u.nome}? Ele não poderá entrar.`)) return;
    u.pendente = false; u.ativo = !!liberar; if (!liberar) u.recusado = true;
    lgSaveUsers(a);
    if (liberar && u.vereadorPedido) { const cc = comp(); const vv = (cc.vereadores || []).find(x => x.id === u.vereadorPedido);
      if (vv && !vv.usuario) { vv.usuario = u.usuario; (cc.historico = cc.historico || []).push({ data: new Date().toISOString(), texto: `Usuário "${u.usuario}" vinculado a ${vv.nome}`, por: (window.usuarioAtual || {}).nome || '' }); localStorage.setItem('lgv_camara_v1', JSON.stringify(cc)); } }
    try { registrarLog(liberar ? 'Cadastro liberado' : 'Cadastro recusado', `${u.usuario} — ${u.cargo || ''}`); } catch (e) { }
    const b = document.getElementById('lgcg-pend'); if (b) b.dataset.a = '';
    pendentes(); if (window.lgtAbrir) lgtAbrir('acessos');
  }

  /* no menu lateral: "Vereador · Presidente da Câmara" para quem a Procuradoria marcou */
  function rotuloCargo() {
    try { const u = typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; if (!u) return;
      const v = window.lgVereadorDoUsuario && lgVereadorDoUsuario(u); const pres = v && comp().presidente === v.id;
      const atual = lgUsers().find(x => x.id === u.id) || u; const t = pres ? 'Vereador · Presidente da Câmara' : (atual.cargo || u.cargo || '');
      ['user-cargo', 'lgv32-cg'].forEach(id => { const el = document.getElementById(id); if (el && el.textContent !== t) el.textContent = t; }); } catch (e) { }
  }
  window.lgcgRotuloCargo = rotuloCargo;

  const css = document.createElement('style'); css.textContent = `
  .lgcg-fixo{padding:11px 12px;border-radius:9px;border:1px solid #2c2f34;background:#141517;color:#f3f4f6;font-size:14px}
  .lgcg-ajuda{display:block;margin-top:6px;font-size:12px;color:#9a9fa6;line-height:1.4}
  .lgcg-ajuda.lgcg-erro{color:#f87171;font-weight:600}
  #reg-cargo.lgcg-invalido{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.18)!important}`;
  document.head.appendChild(css);

  function iniciar() {
    migrar(); atualizarCargos(); rotuloCargo(); setTimeout(() => { migrar(); atualizarCargos(); rotuloCargo(); }, 1500);
    const tab = window.setAuthTab; if (typeof tab === 'function' && !tab.__lgcg) { const w = function (t) { const r = tab.apply(this, arguments); if (t === 'register') atualizarCargos(); return r; }; w.__lgcg = true; window.setAuthTab = w; }
    const io = window.iniciarSessao; if (typeof io === 'function' && !io.__lgcg) { const w = function () { const r = io.apply(this, arguments); setTimeout(rotuloCargo, 50); return r; }; w.__lgcg = true; Object.keys(io).forEach(k => { w[k] = io[k]; }); window.iniciarSessao = w; }
    setInterval(() => { rotuloCargo(); pendentes(); }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 250)); else setTimeout(iniciar, 250);
})();
