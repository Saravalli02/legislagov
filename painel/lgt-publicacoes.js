/* =====================================================================
   LegislaGov — módulo "Site e transparência"
   · Portal da Transparência: publicação de documentos que aparecem no site
   · Notícias do site: notícias publicadas aqui aparecem no portal
   · Configurações do site: endereço do Webmail e do canal do YouTube
   Depende de ../assets/transparencia-catalogo.js (catálogo compartilhado com o site).
   Demonstração: dados no localStorage (mesmo endereço do site). Em produção: API + banco.
   ===================================================================== */
(function () {
  const NOT_KEY = 'lgt_site_noticias_v1', CFG_KEY = 'lgt_site_cfg_v1';
  const WEBMAIL_PADRAO = 'http://webmail.camaranevespaulista.sp.gov.br';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { alertaArmazenamento(); return false; } };
  const hojeISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const usuario = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const log = (a, d) => { try { if (typeof registrarLog === 'function') registrarLog(a, d); } catch (e) { } };
  const dataBR = s => s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—';
  function aviso(msg, tipo) { document.querySelectorAll('.lgt-toast').forEach(x => x.remove()); const t = document.createElement('div'); t.className = 'lgt-toast ' + (tipo || ''); t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('saindo'), 2600); setTimeout(() => t.remove(), 3100); }
  function alertaArmazenamento() { aviso('Espaço do navegador esgotado. Remova arquivos grandes ou use links. Na versão com servidor não há esse limite.', 'erro'); }
  function usoArmazenamento() { let t = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); t += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) { } return t; }

  /* ---------------- perfis, áreas e permissões ----------------
     Cada usuário tem um PERFIL (cargo) que define os painéis que ele abre:
       Administrador → todos · Procurador → Administrativo + gestão de usuários · Secretaria → Administrativo
       Financeiro → Financeiro + Transparência · Vereador/Presidente → Portal do Vereador
     O Administrador e a Procuradoria podem ajustar exceções em "Áreas e acessos" (ex.: quem cuida do site).
     Painel sem permissão aparece com cadeado e não abre. */
  const AREAS_KEY = 'lgt_areas_v1';
  /* Painéis travados e escondidos de todos (nem aparecem com cadeado). Para reativar, tire da lista.
     Financeiro: travado em 11/11/2026 a pedido do Ricardo (não será usado por enquanto). */
  const PAINEIS_OCULTOS = ['financeiro'];
  window.lgPainelOculto = k => PAINEIS_OCULTOS.includes(k);
  const ACESSO_TOTAL_PADRAO = ['ricardo'];
  const AREAS_INFO = [
    ['legislativo', 'Painel Administrativo', 'Matérias, sessões, expedientes, protocolo e gestão.'],
    ['vereador', 'Portal do Vereador', 'Proposituras, assinaturas, comissões, pauta; funções da Presidência.'],
    ['transparencia', 'Portal da Transparência', 'Publicar documentos no Portal da Transparência.'],
    ['financeiro', 'Painel Financeiro', 'Empenhos, pagamentos, dotações, contratos e vencimentos.'],
    ['site', 'Publicação de matérias', 'Notícias, fotos, vereadores e menus do site.'],
  ].filter(a => !PAINEIS_OCULTOS.includes(a[0]));
  const PERFIS = {
    adm: { nome: 'Administrador do sistema', areas: { legislativo: 'edicao', vereador: 'edicao', transparencia: 'edicao', financeiro: 'edicao', site: 'edicao' } },
    procurador: { nome: 'Procurador(a)', areas: { legislativo: 'edicao' } },
    secretaria: { nome: 'Secretaria', areas: { legislativo: 'edicao' } },
    financeiro: { nome: 'Tesouraria e Transparência', areas: { financeiro: 'edicao', transparencia: 'edicao' } },
    vereador: { nome: 'Vereador(a)', areas: { vereador: 'edicao' } },
    servidor: { nome: 'Servidor(a)', areas: { legislativo: 'consulta' } },
  };
  const loginDe = u => String((u && (u.usuario || u.email)) || '').toLowerCase();
  function perfilDe(u) {
    u = u || usuario(); if (!u) return null;
    if (u.orgao === 'ambos' || u.perfil === 'admin' || ACESSO_TOTAL_PADRAO.includes(loginDe(u))) return 'adm';
    if (window.lgVereadorDoUsuario && lgVereadorDoUsuario(u)) return 'vereador';
    if (PERFIS[u.perfil] && u.perfil !== 'adm' && u.perfil !== 'vereador') return u.perfil;
    const t = `${u.cargo || ''} ${u.setor || ''}`;
    if (/procurad/i.test(t)) return 'procurador';
    if (/tesour|contab|financ/i.test(t)) return 'financeiro';
    if (/secret/i.test(t)) return 'secretaria';
    return 'servidor';
  }
  window.lgPerfil = perfilDe; window.lgPerfis = PERFIS;
  function mapaAreas() {
    const m = ler(AREAS_KEY, null);
    if (m) return m;
    const ini = {}; publicadores().forEach(em => { ini[em] = { transparencia: 'edicao' }; }); // migra a lista antiga de publicadores
    return ini;
  }
  function publicadores() { return ler(TRANSP_PERM_CHAVE, []); }
  function nivelPadrao(area, u) { const p = perfilDe(u); return ((PERFIS[p] || PERFIS.servidor).areas[area]) || 'nenhum'; }
  function nivelArea(area, u) {
    u = u || usuario(); if (!u) return 'nenhum';
    if (PAINEIS_OCULTOS.includes(area)) return 'nenhum';
    const p = perfilDe(u); if (p === 'adm') return 'edicao';
    const r = (mapaAreas()[loginDe(u)] || {})[area];
    if (r) return r;
    return nivelPadrao(area, u);
  }
  window.lgNivelArea = nivelArea;
  window.lgtAreasPermitidas = () => AREAS_INFO.map(a => a[0]).filter(a => nivelArea(a) !== 'nenhum');
  window.lgtAreasInfo = AREAS_INFO;
  window.lgtDefinirNivel = (login, area, nivel) => { const m = mapaAreas(); m[login] = { ...(m[login] || {}), [area]: nivel }; gravar(AREAS_KEY, m); log('Áreas e acessos', `${login}: ${area} = ${nivel}`); };
  window.lgtUsuariosLista = () => (typeof lgUsers === 'function' ? lgUsers() : []).filter(u => u.ativo !== false && u.orgao !== 'exec' && !/vistaalegre/i.test(u.usuario || ''));
  function podePublicar(u) { return nivelArea('transparencia', u) === 'edicao'; }
  function podeVerTransp(u) { return nivelArea('transparencia', u) !== 'nenhum'; }
  function ehAdmin() { return perfilDe() === 'adm'; }
  const ehGestorP = () => ['adm', 'procurador'].includes(perfilDe());
  function aplicarPermissoes() {
    if (window.lgv33Render) lgv33Render();
    const wm = document.querySelectorAll('.lgv31-item[data-v31="webmail"]'); wm.forEach(a => a.href = (ler(CFG_KEY, {}).webmail || WEBMAIL_PADRAO));
    document.documentElement.classList.toggle('lgt-somente-leitura', !podePublicar());
  }
  window.lgtAplicarPermissoes = aplicarPermissoes;

  /* ---------------- estrutura das telas ---------------- */
  function criarTelas() {
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main || $('#view-lgt-transp')) return;
    main.insertAdjacentHTML('beforeend', `
    <section class="view lgt" id="view-lgt-transp" style="display:none">
      <div class="letterhead"><div><h1>Portal da Transparência</h1><div class="date">Publique documentos que aparecem automaticamente no site, em Transparência.</div></div>
        <div class="lgt-acoes"><a class="lgt-btn" href="../transparencia.html" target="_blank" rel="noopener">${ic('externo')} Ver no site</a><button class="lgt-btn primario" type="button" onclick="lgtForm()">+ Nova publicação</button></div></div>
      <div class="lgt-kpis" id="lgt-kpis"></div>
      <div class="lgt-filtros">
        <label><span>Seção</span><select id="lgt-f-cat"><option value="">Todas as seções</option>${TRANSP_CATALOGO.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}</select></label>
        <label><span>Situação</span><select id="lgt-f-st"><option value="">Todas</option><option value="pub">Publicadas</option><option value="ras">Rascunhos</option></select></label>
        <label class="cresce"><span>Buscar</span><input id="lgt-f-q" placeholder="Título, número, fornecedor…"></label>
      </div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Data</th><th>Seção · tipo</th><th>Documento</th><th class="num">Valor</th><th>Situação</th><th class="acoes-col">Ações</th></tr></thead><tbody id="lgt-corpo"></tbody></table></div>
      <div class="lgt-grade2">
        <div class="lgt-card" id="lgt-perm"></div>
        <div class="lgt-card"><h3>Como funciona</h3><ul class="lgt-lista">
          <li>Escolha a <b>seção</b> e o <b>tipo de documento</b> (ex.: Despesas › Empenhos).</li>
          <li>Anexe o arquivo (PDF, planilha) ou informe um link de outro sistema.</li>
          <li>Ao publicar, o documento aparece no site na hora, com busca e exportação em CSV/JSON.</li>
          <li>Mantenha os <b>3 últimos anos</b> publicados (série histórica exigida pelo PNTP).</li>
          <li>Toda publicação, edição ou exclusão fica registrada na auditoria.</li></ul></div>
      </div>
    </section>
    <section class="view lgt" id="view-lgt-noticias" style="display:none">
      <div class="letterhead"><div><h1>Matérias e notícias</h1><div class="date">Matérias publicadas aqui aparecem no site da Câmara, no início e em Notícias. Use “Pré-visualizar” para ver como vai ficar antes de publicar.</div></div>
        <div class="lgt-acoes"><a class="lgt-btn" href="../noticias.html" target="_blank" rel="noopener">${ic('externo')} Ver no site</a><button class="lgt-btn primario" type="button" onclick="lgtFormNoticia()">+ Nova matéria</button></div></div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Data</th><th>Notícia</th><th>Categoria</th><th>Situação</th><th class="acoes-col">Ações</th></tr></thead><tbody id="lgt-not-corpo"></tbody></table></div>
      <div class="lgt-grade2">
        <div class="lgt-card"><h3>Dicas</h3><ul class="lgt-lista"><li>Marque <b>Destaque na capa</b> para a notícia aparecer no carrossel da página inicial.</li><li>Fotos são reduzidas automaticamente para carregar rápido no celular.</li><li>O arquivo de notícias antigas é importado do site anterior pelo <b>ATUALIZAR_CONTEUDO.bat</b>.</li></ul></div>
      </div>
    </section>
    <section class="view lgt" id="view-lgt-acessos" style="display:none">
      <div class="letterhead"><div><h1>Áreas e acessos</h1><div class="date">O <b>perfil</b> define os painéis de cada pessoa. Ajuste exceções em cada painel quando precisar (por exemplo, quem cuida do site). Exceções ficam marcadas em dourado.</div></div></div>
      <div class="lgt-areas-info">${AREAS_INFO.map(([a, n, d]) => `<div><b>${n}</b><span>${d}</span></div>`).join('')}</div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela lgt-acessos"><thead><tr><th>Usuário</th><th>Perfil (cargo)</th>${AREAS_INFO.map(([, n]) => `<th>${n}</th>`).join('')}</tr></thead><tbody id="lgt-acessos-corpo"></tbody></table></div>
      <div class="lgt-grade2"><div class="lgt-card"><h3>Níveis</h3><ul class="lgt-lista"><li><b>Sem acesso</b>: o painel aparece com cadeado e não abre.</li><li><b>Consulta</b>: vê as informações, mas não altera nada.</li><li><b>Edição</b>: cadastra, publica e altera.</li></ul></div>
      <div class="lgt-card"><h3>Boas práticas</h3><ul class="lgt-lista"><li>Separe funções: quem <b>empenha</b> não deveria ser quem <b>paga</b>.</li><li>Revise os acessos quando alguém mudar de setor.</li><li>Toda alteração de acesso fica na auditoria.</li></ul></div></div>
    </section>
    <section class="view lgt" id="view-lgt-uproto" style="display:none"></section>
    <div class="lgt-modal" id="lgt-modal" role="dialog" aria-modal="true" aria-labelledby="lgt-modal-t" hidden><div class="lgt-modal-box" id="lgt-modal-box"></div></div>`);
    // itens ocultos no menu antigo, para gotoShared funcionar
    const antigo = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    ['lgt-transp', 'lgt-noticias', 'lgt-acessos', 'lgt-uproto'].forEach(k => { if (!document.querySelector(`.nav-item[data-nav="${k}"]`)) { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = k; b.hidden = true; b.style.display = 'none'; antigo.appendChild(b); } });
    ['lgt-f-cat', 'lgt-f-st', 'lgt-f-q'].forEach(id => $('#' + id).addEventListener('input', desenharTransp));
    $('#lgt-cfg')?.addEventListener('submit', e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); const c = { ...ler(CFG_KEY, {}), webmail: d.webmail.trim(), youtube: d.youtube.trim() }; if (gravar(CFG_KEY, c)) { aviso('Endereços salvos.'); aplicarPermissoes(); log('Configurações do site', 'Endereços de Webmail/YouTube atualizados'); } });
    $('#lgt-modal').addEventListener('click', e => { if (e.target.id === 'lgt-modal') fecharModal(); });
    document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const pv = $('#lgt-previa'); if (pv) { e.stopImmediatePropagation(); $('#lgt-previa-volta').click(); return; } if (!$('#lgt-modal').hidden) fecharModal(); }, true);
  }

  window.lgtAbrir = function (qual) {
    criarTelas();
    if (qual === 'uproto') { if (!['adm', 'procurador', 'secretaria'].includes(perfilDe())) { aviso('Sem permissão.', 'erro'); return; } gotoShared('lgt-uproto'); if (window.lgv31Mark) lgv31Mark('usuariosProto'); desenharUsuariosProto(); scrollTo(0, 0); return; }
    if (qual === 'acessos') { if (!ehGestorP()) { aviso('Somente o administrador ou a Procuradoria gerenciam os acessos.', 'erro'); return; } gotoShared('lgt-acessos'); if (window.lgv31Mark) lgv31Mark('acessos'); desenharAcessos(); scrollTo(0, 0); return; }
    if (qual === 'noticias' ? nivelArea('site') === 'nenhum' : !podeVerTransp()) { aviso('Este usuário não tem permissão para esta área.', 'erro'); return; }
    const id = qual === 'noticias' ? 'lgt-noticias' : 'lgt-transp';
    if (typeof gotoShared === 'function') gotoShared(id);
    if (window.lgv31Mark) lgv31Mark(qual === 'noticias' ? 'siteNoticias' : 'transp');
    if (qual === 'noticias') { desenharNoticias(); document.documentElement.classList.toggle('lgt-somente-leitura', nivelArea('site') !== 'edicao'); }
    else { desenharTransp(); document.documentElement.classList.toggle('lgt-somente-leitura', !podePublicar()); }
    scrollTo(0, 0);
  };

  /* ---------------- transparência: lista ---------------- */
  function desenharTransp() {
    const itens = transpLer(); const cat = $('#lgt-f-cat').value, st = $('#lgt-f-st').value, q = ($('#lgt-f-q').value || '').toLowerCase();
    const pub = itens.filter(i => i.publicado !== false).length; const uso = usoArmazenamento(); const pct = Math.min(100, Math.round(uso / (5 * 1024 * 1024) * 100));
    const ultimo = itens.reduce((m, i) => (i.atualizadoEm || '') > m ? i.atualizadoEm : m, '');
    $('#lgt-kpis').innerHTML = `<div><b>${pub}</b><span>publicados no site</span></div><div><b>${itens.length - pub}</b><span>rascunhos</span></div><div><b>${new Set(itens.map(i => i.cat)).size}/${TRANSP_CATALOGO.length}</b><span>seções com documentos</span></div>
      <div><b>${ultimo ? new Date(ultimo).toLocaleDateString('pt-BR') : '—'}</b><span>última atualização</span></div><div class="uso"><b>${pct}%</b><span>espaço usado no navegador</span><i style="--p:${pct}%"></i></div>`;
    const l = itens.filter(i => (!cat || i.cat === cat) && (!st || (st === 'pub' ? i.publicado !== false : i.publicado === false)) && (!q || [i.titulo, i.descricao, i.numero, i.fornecedor].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#lgt-corpo').innerHTML = l.length ? l.map(i => { const c = transpCategoria(i.cat); return `<tr>
      <td class="nowrap">${dataBR(i.data)}</td><td><b>${esc(c?.nome || i.cat)}</b><small>${esc(i.sub)}</small></td>
      <td><b>${esc(i.titulo)}</b><small>${[i.numero && 'Nº ' + esc(i.numero), i.competencia && 'Ref. ' + transpCompetencia(i.competencia), i.arquivo ? '📎 ' + esc(i.arquivo.nome) : (i.link ? 'Link externo' : '')].filter(Boolean).join(' · ')}</small></td>
      <td class="num">${transpMoeda(i.valor) || '—'}</td><td>${i.publicado === false ? '<span class="lgt-st ras">Rascunho</span>' : '<span class="lgt-st pub">Publicado</span>'}</td>
      <td class="acoes-col">${i.origem === 'financeiro' ? '<span class="lgt-st auto" title="Gerado pelo módulo Financeiro">Automático</span>' : `<button class="lgt-mini" type="button" onclick="lgtForm('${i.id}')">Editar</button><button class="lgt-mini" type="button" onclick="lgtAlternar('${i.id}')">${i.publicado === false ? 'Publicar' : 'Despublicar'}</button><button class="lgt-mini perigo" type="button" onclick="lgtExcluir('${i.id}')">Excluir</button>`}</td></tr>`; }).join('')
      : `<tr><td colspan="6" class="lgt-vazio"><b>${itens.length ? 'Nenhum documento com esses filtros.' : 'Nenhum documento publicado ainda.'}</b><span>Clique em “+ Nova publicação” para publicar o primeiro documento no Portal da Transparência.</span></td></tr>`;
    desenharPermissoes();
  }
  function desenharPermissoes() {
    const el = $('#lgt-perm'); if (!el) return;
    const nv = nivelArea('transparencia');
    el.innerHTML = `<h3>Seu acesso</h3><p class="lgt-p">${nv === 'edicao' ? 'Você pode publicar, editar e retirar documentos do Portal da Transparência e notícias do site.' : 'Você tem acesso somente para consulta nesta área.'}</p>${ehAdmin() ? '<button class="lgt-btn" type="button" onclick="lgtAbrir(\'acessos\')">Gerenciar áreas e acessos</button>' : '<p class="lgt-p">Para mudar seu acesso, fale com o administrador.</p>'}`;
  }

  /* ---------------- áreas e acessos (somente administrador) ---------------- */
  const NIVEIS = [['nenhum', 'Sem acesso'], ['consulta', 'Consulta'], ['edicao', 'Edição']];
  function desenharAcessos() {
    const users = lgtUsuariosLista().map(u => ({ ...u, email: u.usuario })).sort((a, b) => (perfilDe(b) === 'adm') - (perfilDe(a) === 'adm') || String(a.nome).localeCompare(String(b.nome)));
    const souAdm = ehAdmin();
    $('#lgt-acessos-corpo').innerHTML = users.map(u => {
      const em = loginDe(u), p = perfilDe(u), adm = p === 'adm', ver = p === 'vereador', trava = adm && !souAdm;
      const selPerfil = ver ? `<span class="lgt-perfil-fixo">Vereador(a)<small>vínculo em Vereadores e usuários</small></span>`
        : `<select class="lgt-perfil" data-login="${esc(em)}" ${trava || em === loginDe(usuario()) ? 'disabled' : ''} aria-label="Perfil de ${esc(u.nome)}">${Object.entries(PERFIS).filter(([k]) => k !== 'vereador' && (k !== 'adm' || souAdm || adm)).map(([k, x]) => `<option value="${k}"${k === p ? ' selected' : ''}>${x.nome}</option>`).join('')}</select>`;
      return `<tr><td><b>${esc(u.nome)}</b><small>${esc(u.usuario)} · ${esc(u.cargo || '')}</small></td><td>${selPerfil}</td>${AREAS_INFO.map(([a]) => {
        const v = nivelArea(a, u), padrao = nivelPadrao(a, u), exc = !adm && v !== padrao;
        return `<td><select class="lgt-nivel n-${v}${exc ? ' excecao' : ''}" data-email="${esc(em)}" data-area="${a}" ${adm ? 'disabled' : ''} title="${exc ? 'Exceção ao perfil' : 'Padrão do perfil'}" aria-label="${esc(u.nome)} — ${a}">${NIVEIS.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>`; }).join('')}</tr>`;
    }).join('') || '<tr><td colspan="7" class="lgt-vazio">Nenhum usuário cadastrado.</td></tr>';
    document.querySelectorAll('#lgt-acessos-corpo select.lgt-nivel').forEach(sel => sel.onchange = () => {
      lgtDefinirNivel(sel.dataset.email, sel.dataset.area, sel.value); aviso('Acesso atualizado.'); desenharAcessos();
    });
    document.querySelectorAll('#lgt-acessos-corpo select.lgt-perfil').forEach(sel => sel.onchange = () => {
      if (sel.value === 'adm' && !ehAdmin()) { aviso('Só o administrador pode criar outro administrador.', 'erro'); return desenharAcessos(); }
      const us = lgUsers(); const u = us.find(x => loginDe(x) === sel.dataset.login); if (!u) return;
      u.perfil = sel.value === 'adm' ? 'admin' : sel.value; lgSaveUsers(us);
      const m = mapaAreas(); delete m[sel.dataset.login]; gravar(AREAS_KEY, m); // volta ao padrão do novo perfil
      log('Áreas e acessos', `${u.usuario}: perfil = ${PERFIS[sel.value].nome}`); aviso(`${u.nome}: perfil ${PERFIS[sel.value].nome}. Os painéis foram ajustados ao novo perfil.`); desenharAcessos();
    });
  }

  /* ---------------- Secretaria: usuários para encaminhar protocolos (somente consulta) ---------------- */
  function desenharUsuariosProto() {
    const el = $('#view-lgt-uproto'); if (!el) return;
    const us = lgtUsuariosLista().sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    el.innerHTML = `<div class="letterhead"><div><h1>Usuários para protocolos</h1><div class="date">Consulte quem é quem para encaminhar protocolos e expedientes. Para criar ou alterar usuários, fale com a Procuradoria.</div></div></div>
      <div class="lgt-filtros"><label class="cresce"><span>Buscar</span><input id="lgt-up-q" placeholder="Nome, cargo ou setor…"></label></div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Nome</th><th>Cargo</th><th>Setor</th><th>Perfil</th></tr></thead><tbody id="lgt-up-corpo"></tbody></table></div>`;
    const go = () => { const q = ($('#lgt-up-q').value || '').toLowerCase();
      $('#lgt-up-corpo').innerHTML = us.filter(u => !q || [u.nome, u.cargo, u.setor].join(' ').toLowerCase().includes(q)).map(u => `<tr><td><b>${esc(u.nome)}</b></td><td>${esc(u.cargo || '—')}</td><td>${esc(u.setor || '—')}</td><td>${esc((PERFIS[perfilDe(u)] || {}).nome || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="lgt-vazio">Ninguém encontrado.</td></tr>'; };
    $('#lgt-up-q').oninput = go; go();
  }

  /* ---------------- transparência: formulário ---------------- */
  window.lgtForm = function (id) {
    if (!podePublicar()) { aviso('Seu acesso a esta área é somente para consulta.', 'erro'); return; }
    const item = id ? transpLer().find(i => i.id === id) : null; const it = item || { cat: $('#lgt-f-cat')?.value || '', data: hojeISO(), publicado: true };
    abrirModal(`<form id="lgt-form" class="lgt-form" novalidate>
      <div class="lgt-modal-cab"><h2 id="lgt-modal-t">${item ? 'Editar publicação' : 'Nova publicação'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgt-campos">
        <label><span>Seção do portal *</span><select name="cat" required><option value="">Selecione</option>${TRANSP_CATALOGO.map(c => `<option value="${c.id}"${c.id === it.cat ? ' selected' : ''}>${c.nome}</option>`).join('')}</select></label>
        <label><span>Tipo de documento *</span><select name="sub" required></select></label>
        <label class="cheio"><span>Título *</span><input name="titulo" required maxlength="180" value="${esc(it.titulo || '')}" placeholder="Ex.: Empenhos de outubro de 2026"></label>
        <label class="cheio"><span>Descrição</span><textarea name="descricao" rows="2" maxlength="600" placeholder="Resumo do conteúdo (opcional)">${esc(it.descricao || '')}</textarea></label>
        <label><span>Data de publicação *</span><input name="data" type="date" required value="${esc(it.data || hojeISO())}"></label>
        <label><span>Mês/ano de referência</span><input name="competencia" type="month" value="${esc(it.competencia || '')}"></label>
        <label><span>Número / processo</span><input name="numero" maxlength="60" value="${esc(it.numero || '')}" placeholder="Ex.: 012/2026"></label>
        <label data-campo="valor"><span>Valor (R$)</span><input name="valor" inputmode="decimal" value="${it.valor != null && it.valor !== '' ? String(it.valor).replace('.', ',') : ''}" placeholder="0,00"></label>
        <label class="cheio" data-campo="fornecedor"><span>Fornecedor / favorecido</span><input name="fornecedor" maxlength="160" value="${esc(it.fornecedor || '')}" placeholder="Nome e CNPJ/CPF (parcial) quando aplicável"></label>
        <fieldset class="cheio lgt-origem"><legend>Conteúdo</legend>
          <label class="radio"><input type="radio" name="origem" value="arquivo" ${!it.link ? 'checked' : ''}> Anexar arquivo</label>
          <label class="radio"><input type="radio" name="origem" value="link" ${it.link ? 'checked' : ''}> Link de outro sistema</label>
          <div data-origem="arquivo"><input name="arquivo" type="file" accept="${TRANSP_TIPOS_ARQUIVO}"><small class="lgt-ajuda">${it.arquivo ? 'Arquivo atual: <b>' + esc(it.arquivo.nome) + '</b> (envie outro para substituir). ' : ''}PDF, planilhas ou documentos de até 2,5 MB nesta demonstração.</small></div>
          <div data-origem="link"><input name="link" type="url" value="${esc(it.link || '')}" placeholder="https://"></div>
        </fieldset>
        <label class="cheio checkbox"><input type="checkbox" name="publicado" ${it.publicado !== false ? 'checked' : ''}> Publicar no site agora (desmarque para salvar como rascunho)</label>
      </div>
      <p class="lgt-erro" id="lgt-erro" role="alert"></p>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="button" class="lgt-btn" id="lgt-prev-t">👁 Pré-visualizar</button><button type="submit" class="lgt-btn primario">${item ? 'Salvar alterações' : 'Publicar'}</button></div>
    </form>`);
    const f = $('#lgt-form');
    $('#lgt-prev-t').onclick = () => {
      const d = Object.fromEntries(new FormData(f)); const erro = $('#lgt-erro'); erro.textContent = '';
      if (!d.cat || !d.sub || !d.titulo.trim()) { erro.textContent = 'Para pré-visualizar, preencha ao menos seção, tipo e título.'; return; }
      const file = f.arquivo.files[0]; const valor = d.valor && d.valor.trim() ? Number(d.valor.replace(/\./g, '').replace(',', '.')) : '';
      const prev = { id: '__previa__', previa: true, cat: d.cat, sub: d.sub, titulo: d.titulo.trim(), descricao: (d.descricao || '').trim(), data: d.data || hojeISO(), competencia: d.competencia || '', numero: (d.numero || '').trim(), valor: isNaN(valor) ? '' : valor, fornecedor: (d.fornecedor || '').trim(),
        arquivo: d.origem === 'arquivo' ? (file ? { nome: file.name, tamanho: file.size, dados: '' } : (item && item.arquivo ? { ...item.arquivo, dados: '' } : null)) : null, link: d.origem === 'link' ? (d.link || '').trim() : '', publicado: true };
      previa('transp', prev, `../transparencia.html?c=${encodeURIComponent(d.cat)}&previa=1#it-__previa__`, () => f.requestSubmit());
    };
    const atualizarCat = () => {
      const c = transpCategoria(f.cat.value); f.sub.innerHTML = c ? c.subs.map(s => `<option${s === it.sub ? ' selected' : ''}>${esc(s)}</option>`).join('') : '<option value="">Escolha a seção</option>';
      f.querySelector('[data-campo="valor"]').hidden = !(c && c.valor); f.querySelector('[data-campo="fornecedor"]').hidden = !(c && c.fornecedor);
    };
    const atualizarOrigem = () => { const o = f.origem.value; f.querySelector('[data-origem="arquivo"]').hidden = o !== 'arquivo'; f.querySelector('[data-origem="link"]').hidden = o !== 'link'; };
    f.cat.onchange = atualizarCat; f.querySelectorAll('[name="origem"]').forEach(r => r.onchange = atualizarOrigem); atualizarCat(); atualizarOrigem();
    f.onsubmit = async e => {
      e.preventDefault(); const erro = $('#lgt-erro'); erro.textContent = '';
      const d = Object.fromEntries(new FormData(f));
      if (!d.cat || !d.sub || !d.titulo.trim() || !d.data) { erro.textContent = 'Preencha seção, tipo, título e data.'; return; }
      let valor = ''; if (d.valor && d.valor.trim()) { valor = Number(d.valor.replace(/\./g, '').replace(',', '.')); if (isNaN(valor)) { erro.textContent = 'Valor inválido. Use o formato 1.234,56.'; return; } }
      let arquivo = item && item.arquivo || null, link = '';
      if (d.origem === 'link') { link = (d.link || '').trim(); if (!/^https?:\/\//.test(link)) { erro.textContent = 'Informe um link começando com http:// ou https://'; return; } arquivo = null; }
      else { const file = f.arquivo.files[0]; if (file) { if (file.size > TRANSP_LIMITE_ARQUIVO) { erro.textContent = 'Arquivo maior que 2,5 MB. Nesta demonstração, use um link ou divida o arquivo.'; return; } arquivo = { nome: file.name, tamanho: file.size, dados: await lerArquivo(file) }; } if (!arquivo) { erro.textContent = 'Anexe um arquivo ou escolha “Link de outro sistema”.'; return; } }
      const agora = new Date().toISOString(); const u = usuario() || {};
      const novo = { ...(item || {}), id: item ? item.id : uid('t'), cat: d.cat, sub: d.sub, titulo: d.titulo.trim(), descricao: (d.descricao || '').trim(), data: d.data, competencia: d.competencia || '', numero: (d.numero || '').trim(), valor, fornecedor: (d.fornecedor || '').trim(), arquivo, link, publicado: !!f.publicado.checked, autor: u.nome || '', criadoEm: item ? item.criadoEm : agora, atualizadoEm: agora };
      const lista = transpLer().filter(i => i.id !== novo.id); lista.push(novo);
      try { transpSalvar(lista); } catch (x) { alertaArmazenamento(); return; }
      log('Transparência', `${item ? 'Editou' : 'Publicou'}: ${novo.titulo} (${transpCategoria(novo.cat).nome} › ${novo.sub})`);
      fecharModal(); desenharTransp(); aviso(novo.publicado ? 'Publicado no Portal da Transparência.' : 'Rascunho salvo.');
    };
  };
  window.lgtAlternar = id => { if (!podePublicar()) return; const l = transpLer(); const i = l.find(x => x.id === id); if (!i) return; i.publicado = i.publicado === false; i.atualizadoEm = new Date().toISOString(); transpSalvar(l); log('Transparência', (i.publicado ? 'Publicou: ' : 'Despublicou: ') + i.titulo); desenharTransp(); aviso(i.publicado ? 'Documento publicado.' : 'Documento retirado do site.'); };
  window.lgtExcluir = id => { if (!podePublicar()) return; const l = transpLer(); const i = l.find(x => x.id === id); if (!i) return; confirmar(`Excluir “${i.titulo}”? Esta ação não pode ser desfeita.`, () => { transpSalvar(l.filter(x => x.id !== id)); log('Transparência', 'Excluiu: ' + i.titulo); desenharTransp(); aviso('Documento excluído.'); }); };

  /* ---------------- notícias do site ---------------- */
  const CATS_NOT = ['Notícias da Câmara', 'Projetos aprovados', 'Orçamento e finanças', 'Moções e homenagens', 'Audiências públicas', 'Vetos', 'Institucional', 'Eventos'];
  function desenharNoticias() {
    const l = ler(NOT_KEY, []).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#lgt-not-corpo').innerHTML = l.length ? l.map(n => `<tr><td class="nowrap">${dataBR(n.data)}</td><td><div class="lgt-not">${n.capa ? `<img src="${n.capa}" alt="">` : '<span class="lgt-sem"></span>'}<span><b>${esc(n.titulo)}</b><small>${esc((n.resumo || '').slice(0, 110))}${n.destaque ? ' · ⭐ destaque na capa' : ''}</small></span></div></td>
      <td>${esc(n.categoria)}</td><td>${n.publicado === false ? '<span class="lgt-st ras">Rascunho</span>' : '<span class="lgt-st pub">Publicada</span>'}</td>
      <td class="acoes-col"><a class="lgt-mini" href="../noticia.html?id=${encodeURIComponent(n.id)}" target="_blank" rel="noopener">Ver</a><button class="lgt-mini" type="button" onclick="lgtFormNoticia('${n.id}')">Editar</button><button class="lgt-mini perigo" type="button" onclick="lgtExcluirNoticia('${n.id}')">Excluir</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="lgt-vazio"><b>Nenhuma notícia publicada pelo painel.</b><span>As notícias importadas do site anterior já aparecem no portal. Clique em “+ Nova notícia” para publicar uma nova.</span></td></tr>`;
  }
  window.lgtFormNoticia = function (id) {
    if (nivelArea('site') !== 'edicao') { aviso('Seu acesso a esta área é somente para consulta.', 'erro'); return; }
    const n = id ? ler(NOT_KEY, []).find(x => x.id === id) : null; const it = n || { data: hojeISO(), categoria: 'Notícias da Câmara', publicado: true };
    abrirModal(`<form id="lgt-fn" class="lgt-form" novalidate>
      <div class="lgt-modal-cab"><h2 id="lgt-modal-t">${n ? 'Editar notícia' : 'Nova notícia'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgt-campos">
        <label class="cheio"><span>Título *</span><input name="titulo" required maxlength="200" value="${esc(it.titulo || '')}" placeholder="Ex.: Câmara aprova o orçamento de 2027"></label>
        <label><span>Categoria</span><select name="categoria">${CATS_NOT.map(c => `<option${c === it.categoria ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label><span>Data *</span><input name="data" type="date" required value="${esc(it.data)}"></label>
        <label class="cheio"><span>Resumo (aparece nas listas)</span><textarea name="resumo" rows="2" maxlength="300">${esc(it.resumo || '')}</textarea></label>
        <label class="cheio"><span>Texto da notícia</span><textarea name="corpo" rows="8" placeholder="Separe os parágrafos com uma linha em branco.">${esc(it.corpo || '')}</textarea></label>
        <label class="cheio"><span>Foto de capa</span><input name="foto" type="file" accept="image/*"><small class="lgt-ajuda">${it.capa ? 'Já existe uma foto; envie outra para substituir. ' : ''}A foto é reduzida automaticamente.</small></label>
        <div class="cheio lgt-galeria-ed"><span class="lgt-rot">Galeria de fotos da matéria</span><div id="lgt-gal">${(it.fotos || []).map((f, i) => `<figure data-i="${i}"><img src="${f}" alt=""><button type="button" class="lgt-mini perigo" onclick="this.closest('figure').remove()" aria-label="Remover foto ${i + 1}">Remover</button></figure>`).join('')}</div>
          <input name="galeria" type="file" accept="image/*" multiple><small class="lgt-ajuda">Escolha uma ou várias fotos para aparecerem no fim da matéria.</small></div>
        <label class="cheio checkbox"><input type="checkbox" name="destaque" ${it.destaque ? 'checked' : ''}> Destaque no carrossel da página inicial</label>
        <label class="cheio checkbox"><input type="checkbox" name="publicado" ${it.publicado !== false ? 'checked' : ''}> Publicar no site agora</label>
      </div>
      <p class="lgt-erro" id="lgt-erro" role="alert"></p>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="button" class="lgt-btn" id="lgt-prev-n">👁 Pré-visualizar</button><button type="submit" class="lgt-btn primario">${n ? 'Salvar' : 'Publicar notícia'}</button></div></form>`);
    const f = $('#lgt-fn');
    const montar = async () => {
      const d = Object.fromEntries(new FormData(f));
      if (!d.titulo.trim() || !d.data) { $('#lgt-erro').textContent = 'Preencha o título e a data.'; return null; }
      let capa = n && n.capa || ''; const file = f.foto.files[0]; if (file) { try { capa = await reduzirImagem(file, 1400); } catch (x) { $('#lgt-erro').textContent = 'Não foi possível ler a imagem.'; return null; } }
      const fotos = [...f.querySelectorAll('#lgt-gal img')].map(i => i.getAttribute('src'));
      for (const g of f.galeria.files) { try { fotos.push(await reduzirImagem(g, 1200)); } catch (x) { } }
      return { ...(n || {}), id: n ? n.id : uid('p'), titulo: d.titulo.trim(), categoria: d.categoria, data: d.data, resumo: (d.resumo || '').trim(), corpo: (d.corpo || '').trim(), capa, fotos, destaque: !!f.destaque.checked, publicado: !!f.publicado.checked, autor: (usuario() || {}).nome || '', atualizadoEm: new Date().toISOString() };
    };
    $('#lgt-prev-n').onclick = async () => { const x = await montar(); if (!x) return; previa('noticia', { ...x, id: '__previa__', publicado: true }, '../noticia.html?id=__previa__&previa=1', () => f.requestSubmit()); };
    f.onsubmit = async e => {
      e.preventDefault(); const novo = await montar(); if (!novo) return;
      const l = ler(NOT_KEY, []).filter(x => x.id !== novo.id); l.push(novo);
      if (!gravar(NOT_KEY, l)) return;
      log('Notícias do site', `${n ? 'Editou' : 'Publicou'}: ${novo.titulo}`); fecharModal(); desenharNoticias(); aviso(novo.publicado ? 'Notícia publicada no site.' : 'Rascunho salvo.');
    };
  };
  window.lgtExcluirNoticia = id => { if (nivelArea('site') !== 'edicao') return aviso('Sem permissão.', 'erro'); const l = ler(NOT_KEY, []); const n = l.find(x => x.id === id); if (!n) return; confirmar(`Excluir a notícia “${n.titulo}”?`, () => { gravar(NOT_KEY, l.filter(x => x.id !== id)); log('Notícias do site', 'Excluiu: ' + n.titulo); desenharNoticias(); aviso('Notícia excluída.'); }); };

  /* ---------------- pré-visualização: abre o site real com o item marcado como prévia ---------------- */
  const PREVIA_KEYS = { transp: 'lg_previa_transp', noticia: 'lg_previa_noticia' };
  function previa(tipo, item, url, publicar) {
    try { localStorage.setItem(PREVIA_KEYS[tipo], JSON.stringify(item)); } catch (x) { alertaArmazenamento(); return; }
    let el = $('#lgt-previa'); if (el) el.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="lgt-previa" role="dialog" aria-modal="true" aria-labelledby="lgt-previa-t"><div class="lgt-previa-barra">
      <span class="lgt-previa-selo">PRÉ-VISUALIZAÇÃO</span><b id="lgt-previa-t">Assim vai aparecer no site. Ainda não foi publicado.</b>
      <span class="lgt-previa-esp"></span>
      <button type="button" class="lgt-btn" id="lgt-previa-cel" aria-pressed="false">📱 Ver no celular</button>
      <button type="button" class="lgt-btn" id="lgt-previa-volta">← Voltar e editar</button>
      <button type="button" class="lgt-btn primario" id="lgt-previa-pub">Publicar</button></div>
      <div class="lgt-previa-palco"><iframe id="lgt-previa-f" title="Pré-visualização no site" src="${url}"></iframe></div></div>`);
    const fechar = () => { try { localStorage.removeItem(PREVIA_KEYS[tipo]); } catch (x) { } $('#lgt-previa')?.remove(); };
    $('#lgt-previa-volta').onclick = fechar;
    $('#lgt-previa-pub').onclick = () => { fechar(); publicar && publicar(); };
    $('#lgt-previa-cel').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); $('#lgt-previa').classList.toggle('cel', on); };
    $('#lgt-previa-volta').focus();
  }
  window.lgtPrevia = previa;

  /* ---------------- utilitários de arquivo e janela ---------------- */
  function lerArquivo(file) { return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; r.readAsDataURL(file); }); }
  function reduzirImagem(file, max) {
    return new Promise((ok, erro) => { const r = new FileReader(); r.onerror = erro; r.onload = () => { const im = new Image(); im.onerror = erro; im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.82)); }; im.src = r.result; }; r.readAsDataURL(file); });
  }
  let focoAnterior = null;
  function abrirModal(html) { focoAnterior = document.activeElement; $('#lgt-modal-box').innerHTML = html; $('#lgt-modal').hidden = false; document.documentElement.classList.add('lgt-travado'); setTimeout(() => $('#lgt-modal-box').querySelector('input,select,textarea,button')?.focus(), 30); }
  function fecharModal() { $('#lgt-modal').hidden = true; $('#lgt-modal-box').innerHTML = ''; document.documentElement.classList.remove('lgt-travado'); focoAnterior?.focus?.(); }
  window.lgtFechar = fecharModal;
  function confirmar(msg, sim) {
    abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Confirmar</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><p class="lgt-p" style="padding:4px 22px 8px">${esc(msg)}</p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="button" class="lgt-btn perigo" id="lgt-sim">Excluir</button></div></div>`);
    $('#lgt-sim').onclick = () => { fecharModal(); sim(); };
  }

  window.lgtUI = { abrirModal, fecharModal, aviso, confirmar, esc, ler, gravar, usuario, log, dataBR, hojeISO, uid, reduzirImagem, previa };

  /* ---------------- estilos (seguem o layout escolhido: Moderno ou Simples) ---------------- */
  const css = document.createElement('style'); css.id = 'lgt-style'; css.textContent = `
  .lgt .letterhead{display:flex!important;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
  .lgt-acoes{display:flex;gap:8px;flex-wrap:wrap}
  .lgt-btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:9px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);font:600 13.5px var(--v32-font,inherit);cursor:pointer;text-decoration:none}
  .lgt-btn:hover{border-color:var(--lg28-muted)}
  .lgt-btn .lgv31-ic{width:16px;height:16px;flex-basis:16px}
  .lgt-btn.primario{background:var(--lgt-acc);border-color:var(--lgt-acc);color:var(--lgt-acc-ink)}
  .lgt-btn.primario:hover{filter:brightness(1.08)}
  .lgt-btn.perigo{background:#c62828;border-color:#c62828;color:#fff}
  html[data-lgv31-layout="moderno"]{--lgt-acc:#f2f3f5;--lgt-acc-ink:#0b0c0e}
  html[data-lgv31-layout="simples"]{--lgt-acc:#1f4e79;--lgt-acc-ink:#fff}
  .lgt-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:0 0 20px}
  .lgt-kpis div{background:var(--lg28-panel);border:1px solid var(--lg28-stroke);border-radius:12px;padding:14px 16px;position:relative;overflow:hidden}
  .lgt-kpis b{display:block;font-size:22px;font-weight:700;color:var(--lg28-ink);letter-spacing:-.02em}
  .lgt-kpis span{font-size:12.5px;color:var(--lg28-muted)}
  .lgt-kpis .uso i{position:absolute;left:0;bottom:0;height:3px;width:var(--p);background:${'#2fbf71'}}
  .lgt-filtros{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
  .lgt-filtros label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--lg28-muted);font-weight:600}
  .lgt-filtros .cresce{flex:1;min-width:220px}
  .lgt-filtros select,.lgt-filtros input,.lgt-campos input:not([type=checkbox]):not([type=radio]):not([type=file]),.lgt-campos select,.lgt-campos textarea,.lgt-form-mini input{height:40px;border-radius:9px;border:1px solid var(--lg28-stroke)!important;background:var(--lg28-inset)!important;color:var(--lg28-ink)!important;padding:0 12px;font:14px var(--v32-font,inherit)}
  .lgt-campos textarea{height:auto;padding:10px 12px;resize:vertical}
  .lgt-tabela-wrap{overflow-x:auto;border:1px solid var(--lg28-stroke);border-radius:12px;background:var(--lg28-panel);position:relative}
  .lgt-tabela{width:100%;border-collapse:collapse;min-width:760px;font-size:13.5px}
  .lgt-tabela th{text-align:left;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--lg28-muted)!important;padding:11px 14px;border-bottom:1px solid var(--lg28-stroke)!important;background:var(--lg28-head)!important;font-weight:600}
  .lgt-tabela td{padding:12px 14px;border-bottom:1px solid var(--lg28-stroke)!important;vertical-align:top;color:var(--lg28-ink)}
  .lgt-tabela tr:last-child td{border-bottom:0!important}
  .lgt-tabela td b{display:block;font-weight:600}
  .lgt-tabela td small{display:block;color:var(--lg28-muted);font-size:12.5px;margin-top:2px}
  .lgt-tabela .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .lgt-tabela .nowrap{white-space:nowrap;color:var(--lg28-muted)}
  .lgt-tabela .acoes-col{white-space:nowrap;text-align:right}
  .lgt-mini{display:inline-flex;align-items:center;height:30px;padding:0 10px;margin-left:4px;border-radius:7px;border:1px solid var(--lg28-stroke);background:transparent;color:var(--lg28-ink);font:600 12.5px var(--v32-font,inherit);cursor:pointer;text-decoration:none}
  .lgt-mini:hover{border-color:var(--lg28-muted)}
  .lgt-mini.perigo{color:#e5484d}
  .lgt-st{display:inline-block;padding:3px 9px;border-radius:20px;font-size:12px;font-weight:600}
  .lgt-st.pub{background:rgba(47,191,113,.14);color:#1f9d5c}
  .lgt-st.auto{background:rgba(57,189,246,.14);color:#1b8fc4}
  .lgt-st.ras{background:rgba(226,170,28,.16);color:#b8860b}
  .lgt-vazio{text-align:center;padding:36px 16px!important;color:var(--lg28-muted)!important}
  .lgt-vazio b{color:var(--lg28-ink);margin-bottom:4px}
  .lgt-vazio span{display:block;max-width:60ch;margin:0 auto}
  .lgt-grade2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}
  .lgt-card{background:var(--lg28-panel);border:1px solid var(--lg28-stroke);border-radius:12px;padding:18px}
  .lgt-card h3{margin:0 0 8px;font-size:15px!important}
  .lgt-p{color:var(--lg28-muted);font-size:13.5px;margin:0 0 12px}
  .lgt-lista{margin:0;padding-left:18px;color:var(--lg28-muted);font-size:13.5px;line-height:1.6}
  .lgt-lista b{color:var(--lg28-ink)}
  .lgt-users{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto}
  .lgt-user{display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--lg28-stroke);border-radius:9px;cursor:pointer}
  .lgt-user b{display:block;font-size:13.5px;color:var(--lg28-ink)}
  .lgt-user small{font-size:12px;color:var(--lg28-muted)}
  .lgt-form-mini{display:flex;flex-direction:column;gap:10px}
  .lgt-form-mini label{display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--lg28-muted);font-weight:600}
  .lgt-form-mini .lgt-btn{align-self:flex-start}
  .lgt-not{display:flex;gap:10px;align-items:flex-start}
  .lgt-not img,.lgt-sem{width:64px;height:44px;border-radius:6px;object-fit:cover;flex:0 0 64px;background:var(--lg28-inset);border:1px solid var(--lg28-stroke)}
  .lgt-modal{position:fixed;inset:0;z-index:10080;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;padding:4vh 14px;overflow-y:auto}
  .lgt-modal[hidden]{display:none}
  html.lgt-travado{overflow:hidden}
  .lgt-modal-box{width:min(760px,100%);background:var(--lg28-panel);border:1px solid var(--lg28-stroke);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.45);color:var(--lg28-ink)}
  .lgt-modal-cab{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid var(--lg28-stroke)}
  .lgt-modal-cab h2{margin:0;font-size:18px!important}
  .lgt-x{width:36px;height:36px;border-radius:9px;border:1px solid var(--lg28-stroke);background:transparent;color:var(--lg28-ink);font-size:20px;cursor:pointer}
  .lgt-campos{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 22px}
  .lgt-campos label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--lg28-muted)}
  .lgt-campos label[hidden]{display:none}
  .lgt-campos .cheio{grid-column:1/-1}
  .lgt-campos .checkbox,.lgt-origem .radio{flex-direction:row!important;align-items:center;gap:8px;font-weight:500!important;color:var(--lg28-ink)!important;font-size:13.5px!important}
  .lgt-origem{border:1px solid var(--lg28-stroke);border-radius:10px;padding:12px 14px;display:flex;flex-wrap:wrap;gap:10px 20px;margin:0}
  .lgt-origem legend{font-size:12.5px;font-weight:600;color:var(--lg28-muted);padding:0 6px}
  .lgt-origem > div{flex-basis:100%}
  .lgt-origem > div[hidden]{display:none}
  .lgt-origem input[type=url]{width:100%}
  .lgt-ajuda{display:block;font-weight:400;color:var(--lg28-muted);font-size:12px;margin-top:6px}
  .lgt-erro{color:#e5484d;font-size:13px;margin:0;padding:0 22px;min-height:1px}
  .lgt-modal-rod{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px 18px;border-top:1px solid var(--lg28-stroke);margin-top:10px}
  .lgt-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:10090;background:#16181c;color:#fff;border:1px solid #2c2f34;padding:12px 18px;border-radius:10px;font-size:14px;box-shadow:0 12px 30px rgba(0,0,0,.35);transition:opacity .4s}
  .lgt-toast.erro{background:#3a1215;border-color:#7a2228}
  .lgt-toast.saindo{opacity:0}
  html.lgt-somente-leitura #view-lgt-transp .lgt-acoes .primario,html.lgt-somente-leitura #view-lgt-noticias .lgt-acoes .primario,html.lgt-somente-leitura #view-lgt-transp .acoes-col button,html.lgt-somente-leitura #view-lgt-noticias .acoes-col button,html.lgt-somente-leitura #lgt-cfg button{display:none}
  .lgt-areas-info{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
  .lgt-areas-info div{background:var(--lg28-panel);border:1px solid var(--lg28-stroke);border-radius:12px;padding:14px 16px}
  .lgt-areas-info b{display:block;color:var(--lg28-ink)}.lgt-areas-info span{font-size:13px;color:var(--lg28-muted)}
  .lgt-acessos{min-width:980px}
  #lgt-previa{position:fixed;inset:0;z-index:2147482500;background:#0b0d11;display:flex;flex-direction:column}
  .lgt-previa-barra{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:#16181d;border-bottom:3px solid #e2aa1c;color:#f4f5f7}
  .lgt-previa-selo{background:#e2aa1c;color:#1a1300;font:800 11px/1 inherit;letter-spacing:.1em;padding:6px 9px;border-radius:6px}
  .lgt-previa-barra b{font-size:14px;font-weight:600}.lgt-previa-esp{flex:1}
  .lgt-previa-barra .lgt-btn{min-height:40px}
  .lgt-previa-palco{flex:1;display:flex;justify-content:center;overflow:auto;background:#2a2d33}
  #lgt-previa-f{width:100%;height:100%;border:0;background:#fff}
  #lgt-previa.cel .lgt-previa-palco{padding:18px 0}#lgt-previa.cel #lgt-previa-f{width:390px;height:780px;border-radius:24px;box-shadow:0 0 0 10px #111,0 20px 50px rgba(0,0,0,.5)}
  @media(max-width:700px){.lgt-previa-barra b{flex-basis:100%;order:3;font-size:13px}#lgt-previa-cel{display:none}}
  .lgt-galeria-ed #lgt-gal{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.lgt-galeria-ed figure{margin:0;display:grid;gap:4px;width:110px}.lgt-galeria-ed img{width:110px;height:76px;object-fit:cover;border-radius:8px}
  .lgt-rot{display:block;font-size:13px;font-weight:600;color:var(--lg28-muted);margin-bottom:4px}
  .lgt-nivel{height:36px;border-radius:8px;border:1px solid var(--lg28-stroke)!important;background:var(--lg28-inset)!important;color:var(--lg28-ink)!important;padding:0 8px;font:600 13px var(--v32-font,inherit)}
  .lgt-nivel.n-edicao{border-color:rgba(47,191,113,.6)!important}.lgt-nivel.excecao{box-shadow:0 0 0 2px rgba(226,170,28,.55)}.lgt-perfil{height:36px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:0 8px;font:600 13px var(--v32-font,inherit);min-width:200px;max-width:230px}.lgt-perfil-fixo{font-weight:600;font-size:13px}.lgt-perfil-fixo small{display:block;font-weight:400;color:var(--lg28-muted)}.lgt-nivel.n-consulta{border-color:rgba(226,170,28,.6)!important}
  @media(max-width:900px){.lgt-areas-info{grid-template-columns:1fr}.lgt-kpis{grid-template-columns:1fr 1fr}.lgt-grade2,.lgt-campos{grid-template-columns:1fr}.lgt .letterhead{align-items:flex-start}}`;
  document.head.appendChild(css);


  /* ---------------- escolha do painel logo após o login ----------------
     Depois de usuário e senha, a pessoa escolhe: Administrativo, Portal da Transparência ou Financeiro.
     Painel sem permissão aparece com cadeado e avisa "este usuário não tem permissão". */
  const PAINEIS = [
    ['legislativo', 'Painel Administrativo', 'Secretaria e Procuradoria: matérias, sessões, protocolo, expedientes e gestão.', 'materias'],
    ['vereador', 'Portal do Vereador', 'Suas proposituras, assinatura gov.br, pauta das sessões e andamento das matérias.', 'vereador'],
    ['transparencia', 'Portal da Transparência', 'Publicar documentos no Portal da Transparência do site.', 'transp'],
    ['financeiro', 'Painel Financeiro', 'Empenhos, liquidação, pagamentos, dotações, contratos e vencimentos.', 'moeda'],
    ['site', 'Publicação de matérias', 'Notícias, fotos, vereadores e menus do site da Câmara.', 'site'],
  ].filter(p => !PAINEIS_OCULTOS.includes(p[0]));
  const nivelTxt = { edicao: 'Acesso liberado', consulta: 'Somente consulta', nenhum: 'Sem permissão' };
  function escolherPainel(auto) {
    const u = usuario(); if (!u) return;
    const livres = PAINEIS.filter(p => nivelArea(p[0], u) !== 'nenhum');
    if (auto === true && livres.length === 1) { if (window.lgv33TrocarArea) lgv33TrocarArea(livres[0][0]); log('Entrou no painel', livres[0][1]); setTimeout(() => window.lgpAposEntrar && lgpAposEntrar(livres[0][0]), 0); return; }
    let el = $('#lgp-escolha');
    if (!el) { el = document.createElement('div'); el.id = 'lgp-escolha'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lgp-t'); document.body.appendChild(el); }
    const primeiro = String(u.nome || '').split(' ')[0];
    el.innerHTML = `<div class="lgp-caixa">
      <div class="lgp-topo"><img src="logo-legislagov.png" alt="LegislaGov" onerror="this.style.display='none'"><button type="button" class="lgp-sair" onclick="lgpSair()">${ic('sair')} Sair</button></div>
      <h1 id="lgp-t">Olá, ${esc(primeiro)}. Qual painel você quer acessar?</h1>
      <p class="lgp-sub">Câmara Municipal de Neves Paulista · ${esc(u.cargo || '')}</p>
      <p class="lgp-msg" id="lgp-msg" role="alert"></p>
      <div class="lgp-cards">${PAINEIS.slice().sort((a, b) => (nivelArea(a[0], u) === 'nenhum') - (nivelArea(b[0], u) === 'nenhum')).map(([k, n, d, i]) => { const nv = nivelArea(k, u); return `<button type="button" class="lgp-card ${nv === 'nenhum' ? 'bloq' : ''}" data-painel="${k}" onclick="lgpEntrar('${k}')"><span class="lgp-ic">${ic(i)}</span><span class="lgp-tx"><b>${n}</b><small>${d}</small></span><span class="lgp-st n-${nv}">${nv === 'nenhum' ? ic('cadeado') : ''}${nivelTxt[nv]}${nv !== 'nenhum' ? ic('seta') : ''}</span></button>`; }).join('')}</div>
      <p class="lgp-rodape">Cada usuário abre os painéis do seu cargo. Os demais aparecem com cadeado. Quem libera é o administrador ou a Procuradoria, em Administrativo › Áreas e acessos.</p>${window.lgMarcaHTML ? `<p class="lg-marca-p" style="margin-top:22px">${lgMarcaHTML}</p>` : ''}</div>`;
    if (!$('#lgt-modal').hidden) fecharModal();
    el.hidden = false; document.documentElement.classList.add('lgp-aberto');
    setTimeout(() => el.querySelector('.lgp-card:not(.bloq)')?.focus(), 40);
  }
  window.lgpEscolherPainel = () => escolherPainel(false);
  window.lgpEntrar = function (k) {
    const u = usuario(); const nome = (PAINEIS.find(p => p[0] === k) || [])[1];
    if (nivelArea(k, u) === 'nenhum') { const m = $('#lgp-msg'); m.textContent = `Este usuário não tem permissão para acessar o ${nome}. Peça a liberação ao administrador.`; m.classList.remove('pisca'); void m.offsetWidth; m.classList.add('pisca'); m.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); log('Acesso negado', nome); return; }
    $('#lgp-escolha').hidden = true; document.documentElement.classList.remove('lgp-aberto');
    if (window.lgv33TrocarArea) lgv33TrocarArea(k); log('Entrou no painel', nome);
    setTimeout(() => window.lgpAposEntrar && lgpAposEntrar(k), 0);
  };
  window.lgpSair = function () { $('#lgp-escolha').hidden = true; document.documentElement.classList.remove('lgp-aberto'); if (typeof fazerLogout === 'function') fazerLogout(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#lgp-escolha') && !$('#lgp-escolha').hidden) e.stopImmediatePropagation(); }, true);
  const cssEsc = document.createElement('style'); cssEsc.id = 'lgp-style'; cssEsc.textContent = `
  #lgp-escolha{position:fixed;inset:0;z-index:10070;overflow-y:auto;background:radial-gradient(1100px 520px at 50% -8%,#1b1c1f 0%,#0a0a0b 55%,#000 100%);color:#f2f3f5;font-family:var(--v32-font,Inter,system-ui,sans-serif);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px 32px}
  #lgp-escolha[hidden]{display:none}
  html.lgp-aberto{overflow:hidden}
  .lgp-caixa{width:min(1120px,100%)}
  .lgp-topo{display:flex;justify-content:space-between;align-items:center;margin-bottom:34px}
  .lgp-topo img{height:42px;width:auto}
  .lgp-sair{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:9px;border:1px solid #2a2c31;background:transparent;color:#c9cbd0;font:600 13.5px inherit;font-family:inherit;cursor:pointer}
  .lgp-sair:hover{border-color:#4a4d54;color:#fff}
  .lgp-sair .lgv31-ic{width:16px;height:16px;flex-basis:16px}
  #lgp-escolha h1{font-size:clamp(24px,3.4vw,34px);font-weight:700;letter-spacing:-.02em;margin:0 0 8px;color:#fff;line-height:1.2}
  .lgp-sub{margin:0 0 22px;color:#8e9198;font-size:14.5px}
  .lgp-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .lgp-card{display:flex;flex-direction:column;align-items:flex-start;gap:14px;text-align:left;padding:22px;border-radius:16px;border:1px solid #24262a;background:#0f1012;color:#f2f3f5;cursor:pointer;font:inherit;min-height:220px;transition:border-color .15s,transform .15s,background .15s}
  .lgp-card:hover,.lgp-card:focus-visible{border-color:#e2aa1c;background:#141518;transform:translateY(-2px);outline:none}
  .lgp-ic{width:48px;height:48px;border-radius:12px;background:#1b1c20;border:1px solid #2a2c31;display:flex;align-items:center;justify-content:center;color:#e2aa1c}
  .lgp-ic .lgv31-ic{width:24px;height:24px;flex-basis:24px}
  .lgp-tx b{display:block;font-size:18px;font-weight:700;margin-bottom:6px}
  .lgp-tx small{display:block;color:#9a9da4;font-size:13.5px;line-height:1.5}
  .lgp-st{margin-top:auto;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#7fd8a6}
  .lgp-st .lgv31-ic{width:16px;height:16px;flex-basis:16px}
  .lgp-st.n-consulta{color:#e2c46a}
  .lgp-card.bloq{opacity:.55;border-style:dashed}
  .lgp-card.bloq:hover{border-color:#5a3a3a;transform:none;background:#0f1012}
  .lgp-card.bloq .lgp-ic{color:#7c7f86}
  .lgp-st.n-nenhum{color:#c98585}
  .lgp-msg{margin:0;padding:0;border-radius:10px;color:#ff9b9b;font-weight:600;font-size:14px}
  .lgp-msg:not(:empty){margin:0 0 16px;padding:12px 14px;background:#2a1215;border:1px solid #5c262c}
  .lgp-msg.pisca{animation:lgpPisca .5s}
  @keyframes lgpPisca{0%,100%{transform:none}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
  .lgp-dica{margin-top:18px;padding-top:16px;border-top:1px solid #24262a;text-align:center}
  .lgp-dica span{display:block;font-size:12px;color:#8e9198;margin-bottom:10px}
  .lgp-dica div{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
  .lgp-dica i{font-style:normal;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1px solid #2a2c31;background:#131417;color:#d4d6da;font-size:12.5px;font-weight:600}
  .lgp-dica .lgv31-ic{width:14px;height:14px;flex-basis:14px;color:#e2aa1c}
  html[data-lgv31-layout="simples"] .lgp-dica{border-color:#e3e5e8}
  .lgp-rodape{margin:8px 0 0;color:#6f727a;font-size:12.5px;max-width:70ch}
  @media(max-width:1100px){.lgp-cards{grid-template-columns:1fr 1fr}}
  @media(max-width:820px){.lgp-cards{grid-template-columns:1fr}.lgp-card{min-height:0;flex-direction:row;align-items:center;flex-wrap:wrap;padding:16px}.lgp-tx{flex:1;min-width:0}.lgp-st{margin-top:0;flex-basis:100%;padding-left:62px}#lgp-escolha{padding-top:20px}.lgp-topo{margin-bottom:22px}.lgp-topo img{height:34px}}
  @media (prefers-reduced-motion:reduce){.lgp-card,.lgp-msg.pisca{transition:none;animation:none}}
  /* cores fixas: a tela de escolha é sempre escura, mesmo no layout Simples/tema claro */
  html #lgp-escolha h1,html[data-lgv31-layout] :is(body,#v32) #lgp-escolha h1{color:#ffffff!important;opacity:1!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-tx b{color:#ffffff!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-sub{color:#c4c7cc!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-tx small{color:#b3b6bc!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-rodape{color:#9a9da4!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-sair{color:#e4e6ea!important;background:transparent!important;border-color:#3a3d43!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-card{background:#111214!important;border-color:#2a2c31!important;color:#fff!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-card:not(.bloq):hover,html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-card:not(.bloq):focus-visible{border-color:#e2aa1c!important;background:#16171a!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-st.n-edicao{color:#86e0ad!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-st.n-consulta{color:#f0cf6e!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-st.n-nenhum{color:#e39a9a!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-msg{color:#ffb3b3!important}
  html[data-lgv31-layout] :is(body,#v32) #lgp-escolha .lgp-card.bloq{opacity:.6!important}`;
  document.head.appendChild(cssEsc);

  /* ---------------- tabelas viram cartões no celular ----------------
     Cada célula recebe o nome da coluna (data-label); abaixo de 700px a linha vira um cartão. */
  function rotularTabelas() { document.querySelectorAll('.lgt-tabela').forEach(t => { const cab = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim()); t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { if (td.colSpan > 1) return; const r = cab[i] || ''; if (td.dataset.label !== r) td.dataset.label = r; })); }); }
  let rotTimer = 0; new MutationObserver(() => { clearTimeout(rotTimer); rotTimer = setTimeout(rotularTabelas, 30); }).observe(document.body, { childList: true, subtree: true });
  const cssCel = document.createElement('style'); cssCel.id = 'lgt-cartoes'; cssCel.textContent = `
  @media(max-width:700px){
    .lgt-tabela-wrap{border:0!important;background:transparent!important;overflow:visible!important;border-radius:0}
    .lgt-tabela{min-width:0!important;display:block}
    .lgt-tabela thead{display:none}
    .lgt-tabela tbody{display:flex;flex-direction:column;gap:10px}
    .lgt-tabela tr{display:block;background:var(--lg28-panel);border:1px solid var(--lg28-stroke);border-radius:12px;padding:10px 14px}
    .lgt-tabela td{display:block;position:relative;min-height:30px;padding:6px 0 6px 38%!important;border:0!important;text-align:left!important;white-space:normal!important;min-width:0!important}
    .lgt-tabela td:not([data-label]),.lgt-tabela td[data-label=""]{padding-left:0!important}
    .lgt-tabela td[data-label]:not([data-label=""])::before{content:attr(data-label);font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--lg28-muted);position:absolute;left:0;top:8px;width:35%;line-height:1.3}
    .lgt-tabela td:first-child{border-bottom:1px solid var(--lg28-stroke)!important;padding-bottom:9px!important;margin-bottom:3px}
    .lgt-tabela td.acoes-col{display:flex!important;flex-wrap:wrap;gap:6px;justify-content:flex-start;padding:10px 0 4px!important}
    .lgt-tabela td.acoes-col::before{display:none}
    .lgt-tabela td.acoes-col .lgt-mini{margin:0;height:36px;padding:0 14px}
    .lgt-tabela td.lgt-vazio{display:block;padding:24px 8px!important}
    .lgt-tabela td > *{min-width:0}
    .lgt-tabela .lgf-barra{margin-top:4px}
    .lgt-kpis b{font-size:18px!important}
    .lgf-kpi b{font-size:17px!important}
    .lgt-modal{padding:0!important;align-items:flex-start}
    .lgt-modal-box{border-radius:0;min-height:100%;min-height:100dvh;height:auto;border:0}
    .lgt-modal-cab{position:sticky;top:0;z-index:2;background:var(--lg28-panel);padding:14px 16px}
    .lgt-campos{padding:16px}
    .lgt-modal-rod{position:sticky;bottom:0;background:var(--lg28-panel);padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
    .lgt-modal-rod .lgt-btn{flex:1;justify-content:center}
    .lgt .letterhead .lgt-acoes{width:100%}
    .lgt .letterhead .lgt-acoes .lgt-btn{flex:1;justify-content:center}
    .lgt-filtros label{flex:1 1 140px}
    .lgt-campos input,.lgt-campos select,.lgt-campos textarea,.lgt-filtros input,.lgt-filtros select{font-size:16px!important}
  }
  @media(max-width:420px){.lgt-kpis.lgf-kpis3{grid-template-columns:1fr!important}}`;
  document.head.appendChild(cssCel);

  /* ---------------- integração ---------------- */
  function iniciar() {
    criarTelas(); aplicarPermissoes();
    const io = window.iniciarSessao;
    // login: depois de usuário e senha, abre a escolha do painel
    const fl = window.fazerLogin;
    if (typeof fl === 'function' && !fl.__lgp) { const w = async function (...a) { try { sessionStorage.setItem('lgp_escolher', '1'); } catch (e) { } const r = await fl.apply(this, a); if (usuario() && sessionStorage.getItem('lgp_escolher')) { sessionStorage.removeItem('lgp_escolher'); setTimeout(() => escolherPainel(true), 30); } return r; }; w.__lgp = true; window.fazerLogin = w; }
    const fo = window.fazerLogout;
    if (typeof fo === 'function' && !fo.__lgp) { const w = function (...a) { try { sessionStorage.removeItem('lg_area'); sessionStorage.removeItem('lgvr_como'); } catch (e) { } if ($('#lgt-modal') && !$('#lgt-modal').hidden) fecharModal(); const x = $('#lgp-escolha'); if (x) { x.hidden = true; document.documentElement.classList.remove('lgp-aberto'); } return fo.apply(this, a); }; w.__lgp = true; window.fazerLogout = w; }
    if (typeof io === 'function' && !io.__lgt) { const w = function (...a) { const r = io.apply(this, a); setTimeout(aplicarPermissoes, 0); return r; }; w.__lgt = true; w.__v31 = io.__v31; w.__v32 = io.__v32; window.iniciarSessao = w; }
    setTimeout(aplicarPermissoes, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 60)); else setTimeout(iniciar, 60);
})();
