/* =====================================================================
   LegislaGov — PUBLICAÇÃO DE MATÉRIAS (painel do site da Câmara)
   · Matérias e notícias (com galeria e pré-visualização): módulo lgt-publicacoes.js
   · Fotos e destaques da capa: carrossel da página inicial, brasão e bandeira
   · Vereadores e Mesa: foto, nomes, partido, cargo, contato, legislatura e quem está em exercício
   · Menus do site: grupos e itens do menu principal (texto, link, ícone, ordem, ocultar)
   · Endereços e responsáveis: webmail, YouTube e quem pode editar o site
   O site lê estas alterações em assets/site-conteudo.js. Hoje ficam no navegador; com o servidor, valem para todos.
   ===================================================================== */
(function () {
  const K = { menu: 'lgs_site_menu_v1', img: 'lgs_site_img_v1', dest: 'lgs_site_destaques_v1', ver: 'lgs_site_vereadores_v1', cfg: 'lgt_site_cfg_v1' };
  const $ = (s, el = document) => el.querySelector(s);
  const U = () => window.lgtUI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const ler = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { U().aviso('Espaço do navegador esgotado. Use fotos menores. Com o servidor não há esse limite.', 'erro'); return false; } };
  const pode = () => (window.lgNivelArea ? lgNivelArea('site') : 'nenhum');
  const edita = () => pode() === 'edicao';
  const clone = o => JSON.parse(JSON.stringify(o));
  const SITE_ICONES = ['predio', 'grupo', 'escudo', 'balanca', 'estrela', 'livro', 'mapa', 'cal', 'doc', 'ata', 'jornal', 'video', 'grafico', 'contrato', 'moeda', 'pessoa', 'info', 'email', 'ouvido', 'local', 'mao'];
  const CARGOS_MESA = ['Presidente', 'Vice-Presidente', '1º Secretário', '2º Secretário'];
  const src = s => !s ? '' : /^(data:|https?:|\/)/.test(s) ? s : '../' + s;

  /* ---------- padrões do site (lidos dos próprios arquivos do site) ---------- */
  let BASE = null;
  async function base() {
    if (BASE) return BASE;
    const [d, c] = await Promise.all(['../assets/dados.js', '../assets/site-conteudo.js'].map(u => fetch(u, { cache: 'no-cache' }).then(r => r.text())));
    const stub = { getItem: () => null, setItem() { }, removeItem() { } };
    BASE = new Function('localStorage', 'window', d + '\n' + c + '\n;return { VEREADORES, MESA, IMG, DESTAQUES, MENU_PADRAO, CONFIG, COMISSOES };')(stub, {});
    return BASE;
  }

  /* ---------- telas ---------- */
  const TELAS = { fotos: ['lgsc-fotos', 'siteFotos'], vereadores: ['lgsc-vereadores', 'siteVereadores'], menus: ['lgsc-menus', 'siteMenus'], config: ['lgsc-config', 'siteConfig'] };
  function criarTelas() {
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main || $('#view-lgsc-fotos')) return;
    main.insertAdjacentHTML('beforeend', Object.values(TELAS).map(([id]) => `<section class="view lgt lgsc" id="view-${id}" style="display:none"></section>`).join(''));
    const antigo = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    Object.values(TELAS).forEach(([id]) => { if (!document.querySelector(`.nav-item[data-nav="${id}"]`)) { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = id; b.hidden = true; b.style.display = 'none'; antigo.appendChild(b); } });
  }
  let tela = 'fotos';
  window.lgscAbrir = async function (k) {
    if (pode() === 'nenhum') { U().aviso('Este usuário não tem permissão para a Publicação de matérias.', 'erro'); return; }
    criarTelas(); tela = TELAS[k] ? k : 'fotos'; const [id, marca] = TELAS[tela];
    gotoShared(id); if (window.lgv31Mark) lgv31Mark(marca);
    document.documentElement.classList.toggle('lgsc-consulta', !edita());
    $('#view-' + id).innerHTML = '<p class="lgt-p">Carregando…</p>';
    try { await base(); } catch (e) { $('#view-' + id).innerHTML = '<p class="lgt-p">Não foi possível ler os arquivos do site.</p>'; return; }
    ({ fotos: tFotos, vereadores: tVereadores, menus: tMenus, config: tConfig })[tela]();
    scrollTo(0, 0);
  };
  const cab = (t, sub, acoes = '') => `<div class="letterhead"><div><h1>${t}</h1><div class="date">${sub}</div></div><div class="lgt-acoes">${acoes}</div></div>`;
  const verSite = (pag, txt = 'Ver no site') => `<a class="lgt-btn" href="../${pag}" target="_blank" rel="noopener">${ic('externo')} ${txt}</a>`;
  const aviso = (m, t) => U().aviso(m, t);
  const somenteLeitura = () => edita() ? '' : '<p class="lgvr-regra">Seu acesso a esta área é somente consulta.</p>';
  const nota = '<p class="lgsc-nota">As alterações aparecem no site na hora, neste computador. Para valerem para todos os visitantes, o sistema precisa do servidor com banco de dados (próxima fase).</p>';

  /* ================= FOTOS E DESTAQUES DA CAPA ================= */
  const destaques = () => clone(ler(K.dest, null) || BASE.DESTAQUES);
  const fotoDest = d => d.foto ? d.foto : src((BASE.IMG[d.img] || {}).local);
  function tFotos() {
    const l = destaques(), im = ler(K.img, {}) || {};
    const FIXAS = [['brasao', 'Brasão do município', 'Topo, rodapé e marca d’água das notícias sem foto.'], ['bandeira', 'Bandeira do município', 'Página “O município”.']];
    $('#view-lgsc-fotos').innerHTML = cab('Fotos e destaques da capa', 'O carrossel da página inicial e as imagens fixas do site.', verSite('index.html') + (edita() ? `<button class="lgt-btn primario" type="button" onclick="lgscDestaque()">+ Novo destaque</button>` : '')) + somenteLeitura() +
      `<h3 class="lgsc-h">Destaques da capa (carrossel)</h3><p class="lgt-p">Aparecem nesta ordem. Matérias marcadas como “Destaque na capa” entram antes destes.</p>
      <div class="lgsc-dest">${l.map((d, i) => `<article class="lgsc-dcard${d.oculto ? ' oculto' : ''}"><img src="${esc(fotoDest(d))}" alt=""><div><span class="lgsc-selo">${esc(d.selo || '')}</span><b>${esc(d.titulo)}</b><small>${esc(d.texto || '')}</small><em>${esc(d.botao || '')} → ${esc(d.link || '')}</em>${d.oculto ? '<em class="lgsc-oc">Oculto no site</em>' : ''}</div>
        <footer data-edita><button class="lgt-mini" type="button" onclick="lgscDestaque(${i})">Editar</button><button class="lgt-mini" type="button" onclick="lgscDestMover(${i},-1)" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button class="lgt-mini" type="button" onclick="lgscDestMover(${i},1)" ${i < l.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button><button class="lgt-mini" type="button" onclick="lgscDestOcultar(${i})">${d.oculto ? 'Mostrar' : 'Ocultar'}</button><button class="lgt-mini perigo" type="button" onclick="lgscDestExcluir(${i})">Excluir</button></footer></article>`).join('')}</div>
      ${edita() && ler(K.dest, null) ? '<button class="lgt-btn" type="button" data-edita onclick="lgscRestaurar(\'dest\')">Restaurar destaques originais</button>' : ''}
      <h3 class="lgsc-h">Imagens fixas</h3><div class="lgsc-fixas">${FIXAS.map(([k, n, d]) => `<article class="lgsc-fixa"><img src="${esc(im[k] || src((BASE.IMG[k] || {}).local))}" alt=""><div><b>${n}</b><small>${d}</small>${im[k] ? '<em>Trocada pelo painel</em>' : ''}</div>
        <footer data-edita><label class="lgt-mini lgsc-up">Trocar foto<input type="file" accept="image/*" onchange="lgscTrocarImg('${k}',this)"></label>${im[k] ? `<button class="lgt-mini" type="button" onclick="lgscImgOriginal('${k}')">Voltar à original</button>` : ''}</footer></article>`).join('')}</div>` + nota;
  }
  const salvarDest = (l, msg) => { if (gravar(K.dest, l)) { U().log('Site', msg); aviso(msg); tFotos(); } };
  window.lgscDestMover = (i, d) => { if (!edita()) return; const l = destaques(); const [x] = l.splice(i, 1); l.splice(i + d, 0, x); salvarDest(l, 'Ordem dos destaques alterada.'); };
  window.lgscDestOcultar = i => { if (!edita()) return; const l = destaques(); l[i].oculto = !l[i].oculto; salvarDest(l, l[i].oculto ? 'Destaque oculto no site.' : 'Destaque visível no site.'); };
  window.lgscDestExcluir = i => { if (!edita()) return; const l = destaques(); U().confirmar(`Excluir o destaque “${l[i].titulo}”?`, () => { l.splice(i, 1); salvarDest(l, 'Destaque excluído.'); }); };
  window.lgscDestaque = function (i) {
    if (!edita()) return aviso('Somente consulta.', 'erro');
    const l = destaques(); const d = i != null ? l[i] : { selo: '', titulo: '', texto: '', botao: 'Saiba mais', link: 'noticias.html' };
    U().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${i != null ? 'Editar destaque' : 'Novo destaque'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <div class="cheio lgsc-fprev"><img id="lgsc-fimg" src="${esc(fotoDest(d) || '')}" alt=""><label class="lgt-btn lgsc-up">Escolher foto<input name="foto" type="file" accept="image/*"></label><small class="lgt-ajuda">Foto larga (paisagem). É reduzida automaticamente.</small></div>
      <label><span>Selo (texto pequeno)</span><input name="selo" maxlength="40" value="${esc(d.selo)}" placeholder="Ex.: Sessões ordinárias"></label>
      <label><span>Texto do botão</span><input name="botao" maxlength="30" value="${esc(d.botao)}"></label>
      <label class="cheio"><span>Título *</span><input name="titulo" maxlength="90" required value="${esc(d.titulo)}"></label>
      <label class="cheio"><span>Texto</span><textarea name="texto" rows="2" maxlength="220">${esc(d.texto)}</textarea></label>
      <label class="cheio"><span>Link do botão</span><input name="link" value="${esc(d.link)}" placeholder="Ex.: sessoes.html ou https://…"></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Salvar</button></div></form>`);
    const f = $('#lgt-modal form'); let foto = d.foto || '';
    f.foto.onchange = async () => { const file = f.foto.files[0]; if (!file) return; try { foto = await U().reduzirImagem(file, 1600); $('#lgsc-fimg').src = foto; } catch (e) { aviso('Não foi possível ler a imagem.', 'erro'); } };
    f.onsubmit = e => { e.preventDefault(); const x = Object.fromEntries(new FormData(f)); if (!x.titulo.trim()) { f.querySelector('.lgt-erro').textContent = 'Informe o título.'; return; }
      if (i == null && !foto) { f.querySelector('.lgt-erro').textContent = 'Escolha uma foto para o destaque.'; return; }
      const novo = { ...d, selo: x.selo.trim(), titulo: x.titulo.trim(), texto: x.texto.trim(), botao: x.botao.trim() || 'Saiba mais', link: x.link.trim() || 'index.html', ...(foto ? { foto } : {}) };
      if (i != null) l[i] = novo; else l.unshift(novo); U().fecharModal(); salvarDest(l, i != null ? 'Destaque atualizado.' : 'Destaque criado no início do carrossel.'); };
  };
  window.lgscTrocarImg = async (k, inp) => { if (!edita()) return; const file = inp.files[0]; if (!file) return; try { const d = await U().reduzirImagem(file, 900); const im = ler(K.img, {}) || {}; im[k] = d; if (gravar(K.img, im)) { U().log('Site', 'Trocou imagem: ' + k); aviso('Imagem trocada.'); tFotos(); } } catch (e) { aviso('Não foi possível ler a imagem.', 'erro'); } };
  window.lgscImgOriginal = k => { if (!edita()) return; const im = ler(K.img, {}) || {}; delete im[k]; gravar(K.img, im); aviso('Imagem original restaurada.'); tFotos(); };
  window.lgscRestaurar = qual => { if (!edita()) return; U().confirmar('Voltar ao original? As alterações feitas pelo painel nesta parte serão descartadas.', () => { localStorage.removeItem(K[qual]); U().log('Site', 'Restaurou original: ' + qual); aviso('Original restaurado.'); ({ dest: tFotos, menu: tMenus, ver: tVereadores })[qual](); }); };

  /* ================= VEREADORES E MESA ================= */
  function dadosVer() {
    const s = ler(K.ver, null);
    if (s && Array.isArray(s.vereadores)) return clone(s);
    return { legislatura: '2025–2028', vereadores: clone(BASE.VEREADORES).map(v => ({ ...v, ativo: true })), mesa: clone(BASE.MESA) };
  }
  const fotoV = v => v.fotoData || src(`assets/img/vereadores/${v.arq}.jpg`);
  const ini = n => String(n || '').split(' ').filter(p => p.length > 2).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  function tVereadores() {
    const d = dadosVer(); const at = d.vereadores.filter(v => v.ativo !== false), fora = d.vereadores.filter(v => v.ativo === false);
    const cargo = id => (d.mesa.membros.find(m => m[1] === id) || [])[0] || '';
    const card = v => `<article class="lgsc-ver${v.ativo === false ? ' fora' : ''}"><span class="lgsc-vfoto"><img src="${esc(fotoV(v))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'${esc(ini(v.completo))}'}))"></span>
      <div><b>${esc(v.nome)}</b><small>${esc(v.completo)}</small><span>${esc(v.partido)}${cargo(v.id) ? ' · <i>' + esc(cargo(v.id)) + '</i>' : ''}</span></div>
      <footer data-edita><button class="lgt-mini" type="button" onclick="lgscVer(${v.id})">Editar</button><button class="lgt-mini" type="button" onclick="lgscVerAtivo(${v.id})">${v.ativo === false ? 'Voltar ao mandato' : 'Tirar do mandato'}</button></footer></article>`;
    $('#view-lgsc-vereadores').innerHTML = cab('Vereadores e Mesa', 'Fotos, nomes, partido, cargo e contato dos vereadores no site.', verSite('vereadores.html') + (edita() ? `<button class="lgt-btn primario" type="button" onclick="lgscVer()">+ Novo vereador</button>` : '')) + somenteLeitura() +
      `<form id="lgsc-leg" class="lgsc-linha" data-edita><label><span>Legislatura</span><input name="leg" value="${esc(d.legislatura || '')}" placeholder="2025–2028"></label><label class="cresce"><span>Período da Mesa Diretora</span><input name="periodo" value="${esc(d.mesa.periodo || '')}"></label><button class="lgt-btn" type="submit">Salvar</button></form>
      <h3 class="lgsc-h">Em exercício (${at.length})</h3><div class="lgsc-vgrade">${at.map(card).join('')}</div>
      <h3 class="lgsc-h">Mesa Diretora</h3><form id="lgsc-mesa" class="lgsc-mesa">${CARGOS_MESA.map((c, i) => `<label><span>${c}</span><select name="m${i}" ${edita() ? '' : 'disabled'}><option value="">— vago —</option>${at.map(v => `<option value="${v.id}" ${(d.mesa.membros.find(m => m[0] === c) || [])[1] === v.id ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></label>`).join('')}${edita() ? '<button class="lgt-btn primario" type="submit">Salvar Mesa</button>' : ''}</form>
      ${fora.length ? `<h3 class="lgsc-h">Fora do mandato (${fora.length})</h3><p class="lgt-p">Não aparecem no site. Use para guardar quem saiu (licença, renúncia, fim da legislatura).</p><div class="lgsc-vgrade">${fora.map(card).join('')}</div>` : ''}
      <div class="lgt-card lgsc-dica"><h3>Nova legislatura (a cada 4 anos)</h3><ul class="lgt-lista"><li>Tire do mandato quem não foi reeleito e cadastre os novos com “+ Novo vereador”.</li><li>Atualize a <b>legislatura</b>, a <b>Mesa</b> e o período.</li><li>No Administrativo, a <b>Procuradoria</b> cria os logins e as comissões em “Vereadores e usuários”.</li></ul>${edita() && ler(K.ver, null) ? '<button class="lgt-btn" type="button" onclick="lgscRestaurar(\'ver\')">Restaurar dados originais do site</button>' : ''}</div>` + nota;
    const fl = $('#lgsc-leg'); fl.onsubmit = e => { e.preventDefault(); if (!edita()) return; const x = dadosVer(); x.legislatura = fl.leg.value.trim(); x.mesa.periodo = fl.periodo.value.trim(); salvarVer(x, 'Legislatura e período atualizados.'); };
    const fm = $('#lgsc-mesa'); fm.onsubmit = e => { e.preventDefault(); if (!edita()) return; const x = dadosVer(); const ids = CARGOS_MESA.map((c, i) => +fm['m' + i].value || 0);
      const usados = ids.filter(Boolean); if (new Set(usados).size !== usados.length) return aviso('A mesma pessoa em dois cargos da Mesa.', 'erro');
      x.mesa.membros = CARGOS_MESA.map((c, i) => [c, ids[i]]).filter(m => m[1]); salvarVer(x, 'Mesa Diretora atualizada no site.'); };
  }
  function salvarVer(x, msg) {
    if (!gravar(K.ver, x)) return; U().log('Site', msg);
    // mantém nomes e partidos iguais no Portal do Vereador (composição da Câmara)
    try { const api = window.lgvrAPI; if (api) { const c = api.comp(); let mud = false; x.vereadores.forEach(v => { const cv = c.vereadores.find(k => k.id === 'v' + v.id); if (cv && (cv.nome !== v.nome || cv.completo !== v.completo || cv.partido !== v.partido)) { Object.assign(cv, { nome: v.nome, completo: v.completo, partido: v.partido }); mud = true; } }); if (mud) api.gravar(api.COMP_KEY, c); } } catch (e) { }
    aviso(msg); tVereadores();
  }
  window.lgscVerAtivo = id => { if (!edita()) return; const x = dadosVer(); const v = x.vereadores.find(k => k.id === id); if (!v) return;
    const sai = v.ativo !== false; U().confirmar(sai ? `Tirar ${v.nome} do mandato? Deixa de aparecer no site (e da Mesa).` : `Colocar ${v.nome} de volta no mandato?`, () => { v.ativo = !sai; if (sai) x.mesa.membros = x.mesa.membros.filter(m => m[1] !== id); salvarVer(x, sai ? `${v.nome} fora do mandato no site.` : `${v.nome} de volta ao site.`); }); };
  window.lgscVer = function (id) {
    if (!edita()) return aviso('Somente consulta.', 'erro');
    const x = dadosVer(); const v = id != null ? x.vereadores.find(k => k.id === id) : { id: Math.max(900, ...x.vereadores.map(k => k.id)) + 1, nome: '', completo: '', partido: '', ativo: true, arq: '', foto: '' };
    U().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${id != null ? 'Editar vereador' : 'Novo vereador'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <div class="cheio lgsc-vprev"><span class="lgsc-vfoto g"><img id="lgsc-vimg" src="${esc(id != null ? fotoV(v) : '')}" alt="" onerror="this.style.visibility='hidden'"></span><div><label class="lgt-btn lgsc-up">Trocar foto<input name="foto" type="file" accept="image/*"></label><small class="lgt-ajuda">A foto é cortada em quadrado, centralizada, e reduzida automaticamente.</small></div></div>
      <label><span>Nome parlamentar *</span><input name="nome" required maxlength="40" value="${esc(v.nome)}" placeholder="Como é conhecido"></label>
      <label><span>Partido *</span><input name="partido" required maxlength="40" value="${esc(v.partido)}"></label>
      <label class="cheio"><span>Nome completo *</span><input name="completo" required maxlength="90" value="${esc(v.completo)}"></label>
      <label><span>Tratamento</span><select name="f"><option value="">Vereador</option><option value="1" ${v.f ? 'selected' : ''}>Vereadora</option></select></label>
      <label><span>Telefone do gabinete</span><input name="telefone" maxlength="20" value="${esc(v.telefone || '')}" placeholder="(17) 3271-1482"></label>
      <label class="cheio"><span>E-mail</span><input name="email" type="email" maxlength="80" value="${esc(v.email || '')}"></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Salvar</button></div></form>`);
    const f = $('#lgt-modal form'); let foto = v.fotoData || '';
    f.foto.onchange = async () => { const file = f.foto.files[0]; if (!file) return; try { foto = await quadrado(file, 600); const im = $('#lgsc-vimg'); im.style.visibility = 'visible'; im.src = foto; } catch (e) { aviso('Não foi possível ler a imagem.', 'erro'); } };
    f.onsubmit = e => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); if (!d.nome.trim() || !d.completo.trim() || !d.partido.trim()) { f.querySelector('.lgt-erro').textContent = 'Preencha nome parlamentar, nome completo e partido.'; return; }
      if (id == null && !foto) { f.querySelector('.lgt-erro').textContent = 'Envie a foto do novo vereador.'; return; }
      Object.assign(v, { nome: d.nome.trim(), completo: d.completo.trim(), partido: d.partido.trim(), f: !!d.f, telefone: d.telefone.trim(), email: d.email.trim(), ...(foto ? { fotoData: foto } : {}) });
      if (!v.f) delete v.f; if (id == null) x.vereadores.push(v);
      U().fecharModal(); salvarVer(x, id != null ? `${v.nome}: dados atualizados no site.` : `${v.nome} cadastrado no site. A Procuradoria cria o login em Vereadores e usuários.`); };
  };
  function quadrado(file, lado) {
    return new Promise((ok, erro) => { const r = new FileReader(); r.onerror = erro; r.onload = () => { const im = new Image(); im.onerror = erro; im.onload = () => { const m = Math.min(im.width, im.height); const c = document.createElement('canvas'); c.width = c.height = lado; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, lado, lado); g.drawImage(im, (im.width - m) / 2, Math.max(0, (im.height - m) / 2 - m * 0.08), m, m, 0, 0, lado, lado); ok(c.toDataURL('image/jpeg', 0.85)); }; im.src = r.result; }; r.readAsDataURL(file); });
  }

  /* ================= MENUS DO SITE ================= */
  const menu = () => clone(ler(K.menu, null) || BASE.MENU_PADRAO);
  function tMenus() {
    const m = menu(); const ed = edita();
    $('#view-lgsc-menus').innerHTML = cab('Menus do site', 'Grupos e itens do menu principal do site: texto, link, ícone, ordem e o que aparece.', verSite('index.html') + (ed ? `<button class="lgt-btn" type="button" onclick="lgscGrupo()">+ Novo grupo</button>` : '')) + somenteLeitura() +
      `<div class="lgsc-menus">${m.map(([t, itens], g) => `<section class="lgsc-grupo"><header><b>${esc(t)}</b><small>${itens.filter(i => !i[4]).length} itens visíveis</small><span data-edita><button class="lgt-mini" type="button" onclick="lgscGrupo(${g})">Renomear</button><button class="lgt-mini" type="button" onclick="lgscGMover(${g},-1)" ${g ? '' : 'disabled'} aria-label="Mover grupo para cima">↑</button><button class="lgt-mini" type="button" onclick="lgscGMover(${g},1)" ${g < m.length - 1 ? '' : 'disabled'} aria-label="Mover grupo para baixo">↓</button><button class="lgt-mini perigo" type="button" onclick="lgscGExcluir(${g})">Excluir grupo</button></span></header>
        <ol>${itens.map((it, i) => `<li class="${it[4] ? 'oculto' : ''}"><div><b>${esc(it[1])}</b><small>${esc(it[2] || '')}</small><code>${esc(it[3] || '')}</code></div><span data-edita><button class="lgt-mini" type="button" onclick="lgscItem(${g},${i})">Editar</button><button class="lgt-mini" type="button" onclick="lgscIMover(${g},${i},-1)" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button class="lgt-mini" type="button" onclick="lgscIMover(${g},${i},1)" ${i < itens.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button><button class="lgt-mini" type="button" onclick="lgscIOcultar(${g},${i})">${it[4] ? 'Mostrar' : 'Ocultar'}</button><button class="lgt-mini perigo" type="button" onclick="lgscIExcluir(${g},${i})">Excluir</button></span></li>`).join('')}</ol>
        <button class="lgt-mini" type="button" data-edita onclick="lgscItem(${g})">+ Item neste grupo</button></section>`).join('')}</div>
      ${ed && ler(K.menu, null) ? '<button class="lgt-btn" type="button" onclick="lgscRestaurar(\'menu\')">Restaurar menu original</button>' : ''}` + nota;
  }
  const salvarMenu = (m, msg) => { if (m.length > 6) aviso('Atenção: mais de 6 grupos pode não caber no topo do site em telas menores.', 'erro'); if (gravar(K.menu, m)) { U().log('Site', msg); if (m.length <= 6) aviso(msg); tMenus(); } };
  window.lgscGMover = (g, d) => { if (!edita()) return; const m = menu(); const [x] = m.splice(g, 1); m.splice(g + d, 0, x); salvarMenu(m, 'Ordem dos grupos alterada.'); };
  window.lgscGExcluir = g => { if (!edita()) return; const m = menu(); U().confirmar(`Excluir o grupo “${m[g][0]}” e todos os itens dele?`, () => { m.splice(g, 1); salvarMenu(m, 'Grupo excluído.'); }); };
  window.lgscIMover = (g, i, d) => { if (!edita()) return; const m = menu(); const l = m[g][1]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); salvarMenu(m, 'Ordem dos itens alterada.'); };
  window.lgscIOcultar = (g, i) => { if (!edita()) return; const m = menu(); const it = m[g][1][i]; it[4] = !it[4]; if (!it[4]) it.length = 4; salvarMenu(m, it[4] ? 'Item oculto no site.' : 'Item visível no site.'); };
  window.lgscIExcluir = (g, i) => { if (!edita()) return; const m = menu(); U().confirmar(`Excluir “${m[g][1][i][1]}” do menu?`, () => { m[g][1].splice(i, 1); salvarMenu(m, 'Item excluído do menu.'); }); };
  window.lgscGrupo = g => { if (!edita()) return; const m = menu(); const atual = g != null ? m[g][0] : '';
    U().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${g != null ? 'Renomear grupo' : 'Novo grupo do menu'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos"><label class="cheio"><span>Nome do grupo *</span><input name="t" required maxlength="24" value="${esc(atual)}"></label></div><p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Salvar</button></div></form>`);
    const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); const t = f.t.value.trim(); if (!t) return; if (g != null) m[g][0] = t; else m.push([t, [], true]); U().fecharModal(); salvarMenu(m, g != null ? 'Grupo renomeado.' : 'Grupo criado. Agora adicione os itens.'); }; };
  window.lgscItem = (g, i) => { if (!edita()) return; const m = menu(); const it = i != null ? m[g][1][i] : ['doc', '', '', '']; const dl = 'lgsc-pags';
    U().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${i != null ? 'Editar item do menu' : 'Novo item em ' + esc(m[g][0])}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <label><span>Texto do item *</span><input name="l" required maxlength="40" value="${esc(it[1])}"></label>
      <label><span>Ícone</span><select name="i">${SITE_ICONES.map(k => `<option ${k === it[0] ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="cheio"><span>Descrição curta</span><input name="d" maxlength="60" value="${esc(it[2])}"></label>
      <label class="cheio"><span>Link *</span><input name="u" required list="${dl}" value="${esc(it[3])}" placeholder="página do site (ex.: sessoes.html) ou endereço https://"><datalist id="${dl}">${['index.html', 'vereadores.html', 'sessoes.html', 'proposituras.html', 'noticias.html', 'transparencia.html', 'fale-conosco.html', 'pagina.html?p=a-camara', 'pagina.html?p=ouvidoria'].map(p => `<option value="${p}">`).join('')}</datalist></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Salvar</button></div></form>`);
    const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); const l = f.l.value.trim(), u = f.u.value.trim(); if (!l || !u) { f.querySelector('.lgt-erro').textContent = 'Preencha o texto e o link.'; return; }
      const novo = [f.i.value, l, f.d.value.trim(), u]; if (i != null) m[g][1][i] = novo; else m[g][1].push(novo); U().fecharModal(); salvarMenu(m, i != null ? 'Item do menu atualizado.' : 'Item adicionado ao menu.'); }; };

  /* ================= ENDEREÇOS E RESPONSÁVEIS ================= */
  function tConfig() {
    const cfg = ler(K.cfg, {}) || {}; const gestor = window.lgEhGestor && lgEhGestor();
    const us = (window.lgtUsuariosLista ? lgtUsuariosLista() : []).map(u => ({ u, n: lgNivelArea('site', u) })).sort((a, b) => ({ edicao: 0, consulta: 1, nenhum: 2 }[a.n] - { edicao: 0, consulta: 1, nenhum: 2 }[b.n]) || String(a.u.nome).localeCompare(String(b.u.nome)));
    $('#view-lgsc-config').innerHTML = cab('Endereços e responsáveis', 'Quem cuida do site e os endereços usados no site e no painel.') +
      `<div class="lgt-grade2"><div class="lgt-card"><h3>Responsáveis pelo site</h3><p class="lgt-p">Quem tem <b>edição</b> publica matérias e altera fotos, vereadores e menus. ${gestor ? 'Você pode mudar aqui.' : 'Quem define é o administrador ou a Procuradoria.'}</p>
        <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Pessoa</th><th>Publicação de matérias</th></tr></thead><tbody>${us.map(({ u, n }) => { const adm = window.lgPerfil && lgPerfil(u) === 'adm';
          return `<tr><td><b>${esc(u.nome)}</b><small>${esc(u.cargo || '')}</small></td><td>${gestor && !adm ? `<select class="lgt-nivel n-${n}" data-login="${esc(String(u.usuario).toLowerCase())}">${[['nenhum', 'Sem acesso'], ['consulta', 'Consulta'], ['edicao', 'Edição (responsável)']].map(([k, l]) => `<option value="${k}" ${k === n ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="lgt-st ${n === 'edicao' ? 'pub' : 'ras'}">${n === 'edicao' ? 'Responsável' : n === 'consulta' ? 'Consulta' : 'Sem acesso'}</span>`}</td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="lgt-card"><h3>Endereços</h3><form id="lgsc-cfg" class="lgt-form-mini"><label><span>Webmail da Câmara</span><input name="webmail" type="url" value="${esc(cfg.webmail || '')}" placeholder="http://webmail.camaranevespaulista.sp.gov.br" ${edita() ? '' : 'disabled'}></label>
        <label><span>Canal no YouTube</span><input name="youtube" type="url" value="${esc(cfg.youtube || '')}" placeholder="https://www.youtube.com/@…" ${edita() ? '' : 'disabled'}></label>${edita() ? '<button class="lgt-btn primario" type="submit">Salvar endereços</button>' : ''}</form></div></div>`;
    document.querySelectorAll('#view-lgsc-config select.lgt-nivel').forEach(s => s.onchange = () => { lgtDefinirNivel(s.dataset.login, 'site', s.value); aviso('Responsáveis atualizados.'); tConfig(); });
    const f = $('#lgsc-cfg'); f.onsubmit = e => { e.preventDefault(); if (!edita()) return; const c = { ...(ler(K.cfg, {}) || {}), webmail: f.webmail.value.trim(), youtube: f.youtube.value.trim() }; if (gravar(K.cfg, c)) { aviso('Endereços salvos.'); if (window.lgtAplicarPermissoes) lgtAplicarPermissoes(); } };
  }

  const css = document.createElement('style'); css.textContent = `
  .lgsc-h{margin:22px 0 8px;font-size:16px}
  .lgsc-nota{margin-top:22px;font-size:12.5px;color:var(--lg28-muted);border-top:1px dashed var(--lg28-stroke);padding-top:10px}
  .lgsc-consulta [data-edita]{display:none!important}
  .lgsc-dest{display:grid;gap:10px}
  .lgsc-dcard{display:grid;grid-template-columns:200px 1fr;gap:6px 16px;align-items:start;padding:12px;border:1px solid var(--lg28-stroke);border-radius:12px;background:var(--lg28-panel)}
  .lgsc-dcard.oculto{opacity:.55}.lgsc-dcard img{width:200px;height:112px;object-fit:cover;border-radius:8px;background:rgba(127,127,127,.15)}
  .lgsc-dcard b{display:block;font-size:15px;margin:2px 0}.lgsc-dcard small{display:block;color:var(--lg28-muted);font-size:13px;line-height:1.4}.lgsc-dcard em{display:block;font-style:normal;font-size:12px;color:var(--lg28-muted);margin-top:4px}
  .lgsc-dcard .lgsc-oc{color:#b8860b;font-weight:700}.lgsc-dcard footer{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap}
  .lgsc-selo{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#b8860b}
  .lgsc-fixas{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
  .lgsc-fixa{display:grid;grid-template-columns:72px 1fr;gap:6px 12px;padding:12px;border:1px solid var(--lg28-stroke);border-radius:12px;background:var(--lg28-panel)}
  .lgsc-fixa img{width:72px;height:72px;object-fit:contain;background:#fff;border-radius:8px}.lgsc-fixa small{display:block;color:var(--lg28-muted);font-size:12.5px}.lgsc-fixa em{display:block;font-style:normal;font-size:12px;color:#b8860b}.lgsc-fixa footer{grid-column:1/-1;display:flex;gap:6px}
  .lgsc-up{position:relative;overflow:hidden;cursor:pointer;display:inline-flex;align-items:center}.lgsc-up input{position:absolute;inset:0;opacity:0;cursor:pointer}
  .lgsc-fprev{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.lgsc-fprev img{width:220px;height:124px;object-fit:cover;border-radius:10px;background:rgba(127,127,127,.15)}
  .lgsc-linha{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:6px 0}.lgsc-linha label{display:grid;gap:4px;font-size:13px;font-weight:600;color:var(--lg28-muted)}.lgsc-linha .cresce{flex:1;min-width:240px}
  .lgsc-linha input,.lgsc-mesa select{height:40px;border-radius:9px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:0 10px;font:inherit;font-size:14px}
  .lgsc-vgrade{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}
  .lgsc-ver{display:grid;grid-template-columns:64px 1fr;gap:6px 12px;align-items:center;padding:12px;border:1px solid var(--lg28-stroke);border-radius:12px;background:var(--lg28-panel)}
  .lgsc-ver.fora{opacity:.6}.lgsc-ver b{display:block}.lgsc-ver small{display:block;color:var(--lg28-muted);font-size:12.5px}.lgsc-ver span{font-size:12.5px;color:var(--lg28-muted)}.lgsc-ver i{font-style:normal;color:#b8860b;font-weight:700}
  .lgsc-ver footer{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap}
  .lgsc-vfoto{width:64px;height:64px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:rgba(127,127,127,.18);font-weight:700}.lgsc-vfoto.g{width:96px;height:96px}.lgsc-vfoto img{width:100%;height:100%;object-fit:cover}
  .lgsc-vprev{display:flex;align-items:center;gap:14px}
  .lgsc-mesa{display:grid;grid-template-columns:repeat(4,1fr) auto;gap:10px;align-items:end}.lgsc-mesa label{display:grid;gap:4px;font-size:13px;font-weight:600;color:var(--lg28-muted)}
  .lgsc-dica{margin-top:18px}
  .lgsc-menus{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px;margin-bottom:12px}
  .lgsc-grupo{border:1px solid var(--lg28-stroke);border-radius:12px;background:var(--lg28-panel);padding:12px}
  .lgsc-grupo header{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}.lgsc-grupo header b{font-size:15px}.lgsc-grupo header small{color:var(--lg28-muted);flex:1}
  .lgsc-grupo header span,.lgsc-grupo li span{display:flex;gap:4px;flex-wrap:wrap}
  .lgsc-grupo ol{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:6px}
  .lgsc-grupo li{display:grid;gap:6px;padding:8px 10px;border-radius:9px;border:1px solid rgba(127,127,127,.22)}.lgsc-grupo li.oculto{opacity:.5}
  .lgsc-grupo li b{font-size:13.5px}.lgsc-grupo li small{display:block;color:var(--lg28-muted);font-size:12px}.lgsc-grupo li code{font-size:11.5px;color:var(--lg28-muted);word-break:break-all}
  @media(max-width:700px){.lgsc-dcard{grid-template-columns:1fr}.lgsc-dcard img{width:100%;height:150px}.lgsc-mesa{grid-template-columns:1fr 1fr}.lgsc-menus{grid-template-columns:1fr}.lgsc-mesa select,.lgsc-linha input{font-size:16px}}`;
  document.head.appendChild(css);
})();
