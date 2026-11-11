/* =====================================================================
   PORTAL DA CÂMARA MUNICIPAL DE NEVES PAULISTA — montagem das páginas
   Conteúdo: assets/dados.js, assets/noticias.js e publicações do painel.
   ===================================================================== */

/* ---------------- utilitários ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ehExterno = u => /^https?:/.test(u || '');
const alvo = u => ehExterno(u) ? ' target="_blank" rel="noopener"' : '';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const param = k => new URLSearchParams(location.search).get(k);
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
};
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dataLonga = s => s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

/* configuração vinda do painel (webmail, YouTube) */
(() => { const c = ls.json('lgt_site_cfg_v1', {}); if (c.webmail) CONFIG.webmail = c.webmail; if (c.youtube) CONFIG.redes.youtube = c.youtube; })();

/* ---------------- ícones ---------------- */
const ICONES = {
  lua: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  sino: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', chev: '<path d="m6 9 6 6 6-6"/>', esq: '<path d="m15 18-6-6 6-6"/>', dir: '<path d="m9 18 6-6-6-6"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', cadeado: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  tel: '<path d="M21 16.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.7 2 2 0 0 1 3.1 1.5h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7 9.4a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2z"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>', relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  local: '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', email: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7.5 9 6 9-6"/>',
  doc: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  balanca: '<path d="M12 3v18M5 7h14M8 21h8"/><path d="M7 7l-3 7a3.2 3.2 0 0 0 6 0zM17 7l-3 7a3.2 3.2 0 0 0 6 0z"/>',
  ouvido: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="2.5" y="13" width="4" height="6" rx="1.5"/><rect x="17.5" y="13" width="4" height="6" rx="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>', video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/>',
  grupo: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5c.6-3.6 3.2-5.8 6.5-5.8s5.9 2.2 6.5 5.8"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.9c2 .7 3.2 2.6 3.5 5.6"/>',
  predio: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2.5 10 12 4l9.5 6z"/>', ata: '<path d="M8 3h8l4 4v14H4V3h4"/><path d="M16 3v4h4M8 12h8M8 16h8"/>',
  jornal: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 8h10M7 12h10M7 16h6"/>', livro: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5V4.5"/>',
  grafico: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>', moeda: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.5 0-2.7-.6-3.2-1.7M12 6v2M12 16v2"/>',
  contrato: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5"/><path d="m9 15 1.5 1.5L15 12"/>',
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5"/>', escudo: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  mapa: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>', enviar: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  contraste: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>', mao: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-7a1.5 1.5 0 0 1 3 0V12M14 6.5a1.5 1.5 0 0 1 3 0V13M17 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.6 15a1.5 1.5 0 0 1 2.4-1.8L8 15.5"/>',
  compartilhar: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>', link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  imprimir: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>', estrela: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
};
const REDES_SVG = {
  youtube: '<path class="ic-fill" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9L15.5 12z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" class="ic-fill"/>',
  linkedin: '<path class="ic-fill" d="M4.5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 8.5h3V21H3zM9 8.5h2.9v1.7h.1c.4-.8 1.4-1.9 3.2-1.9 3.4 0 4 2.2 4 5.1V21h-3v-6.8c0-1.6 0-3.7-2.3-3.7S11 12.3 11 14.1V21H9z"/>',
  whatsapp: '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.3 3.2z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z"/>',
  facebook: '<path class="ic-fill" d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7H16l.6-4h-3.1V8.9c0-.6.3-.9.9-.9z"/>',
};
const ic = (n, c = 'ic') => `<svg class="${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[n] || REDES_SVG[n] || ''}</svg>`;
const extIc = u => ehExterno(u) ? ic('ext', 'ic ext') : '';
window.portalIcone = ic;

/* ---------------- imagens: local primeiro, depois o site antigo ---------------- */
function imgFallback(el) {
  const r = el.getAttribute('data-remoto');
  if (r && !el.dataset.tentou) { el.dataset.tentou = '1'; el.src = r; return; }
  const ph = el.getAttribute('data-ph');
  if (ph === 'brasao') { el.replaceWith(Object.assign(document.createElement('div'), { className: 'marca-agua', innerHTML: img('brasao', '') })); return; }
  if (ph) { const s = document.createElement('span'); s.className = 'ph'; s.setAttribute('aria-hidden', 'true'); s.textContent = ph; el.replaceWith(s); }
  else el.style.visibility = 'hidden';
}
function img(src, alt = '', cls = '', ph = '') {
  const o = typeof src === 'string' ? (IMG[src] || { local: src }) : src;
  return `<img src="${esc(o.local)}"${o.remoto ? ` data-remoto="${esc(o.remoto)}"` : ''}${ph ? ` data-ph="${esc(ph)}"` : ''} alt="${esc(alt)}"${cls ? ` class="${cls}"` : ''} loading="lazy" decoding="async" onerror="imgFallback(this)">`;
}
/* Brasão sem fundo: o arquivo oficial é JPG com fundo branco (aparecia como um "recorte" no cabeçalho).
   O site pede o brasão ao próprio servidor (/api/brasao.jpg), apaga o branco de fora e o vão sob a fita,
   e guarda o resultado (WebP transparente) no navegador. Regra do site: imagens com fundo bonito ou PNG transparente. */
const BRASAO_KEY = 'lg_brasao_v1';
try { const b = localStorage.getItem(BRASAO_KEY); if (b && b.startsWith('data:image/')) IMG.brasao = { local: b, limpo: true }; } catch (e) { }
function brasaoTransparente() {
  if (IMG.brasao.limpo || location.protocol === 'file:') return;
  const im = new Image();
  im.onload = () => { try {
    const W = im.naturalWidth, H = im.naturalHeight; if (!W || !H) return;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const id = x.getImageData(0, 0, W, H), d = id.data;
    const claro = p => { const k = p * 4, mn = Math.min(d[k], d[k + 1], d[k + 2]); return d[k + 3] > 0 && mn >= 200 && Math.max(d[k], d[k + 1], d[k + 2]) - mn < 40; };
    const f = new Uint8Array(W * H);
    const encher = sementes => { const q = sementes.slice(); while (q.length) { const p = q.pop(); if (f[p] || !claro(p)) continue; f[p] = 1; const i = p % W, j = (p - i) / W;
      if (i > 0) q.push(p - 1); if (i < W - 1) q.push(p + 1); if (j > 0) q.push(p - W); if (j < H - 1) q.push(p + W); } };
    const borda = []; for (let i = 0; i < W; i++) borda.push(i, (H - 1) * W + i); for (let j = 0; j < H; j++) borda.push(j * W, j * W + W - 1);
    encher(borda);
    // vão branco entre a fita "Centro Cafeeiro" e os ramos (fica fechado, não encosta na borda)
    const vi = Math.round(W * .5), vj = Math.round(H * .84); let semente = -1;
    for (let r = 0; r < 25 && semente < 0; r++) for (let dj = -r; dj <= r && semente < 0; dj++) for (let di = -r; di <= r; di++) { const p = (vj + dj) * W + vi + di; if (p >= 0 && p < W * H && claro(p) && !f[p]) { semente = p; break; } }
    if (semente >= 0) encher([semente]);
    for (let p = 0; p < W * H; p++) if (f[p]) d[p * 4 + 3] = 0;
    for (let p = 0; p < W * H; p++) { if (f[p]) continue; const i = p % W, j = (p - i) / W;
      if ((i > 0 && f[p - 1]) || (i < W - 1 && f[p + 1]) || (j > 0 && f[p - W]) || (j < H - 1 && f[p + W])) { const k = p * 4, mn = Math.min(d[k], d[k + 1], d[k + 2]); if (mn > 150) d[k + 3] = Math.round(255 * (255 - mn) / 105); } }
    x.putImageData(id, 0, 0);
    let x0 = W, y0 = H, x1 = 0, y1 = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (d[(j * W + i) * 4 + 3] > 10) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    const c2 = document.createElement('canvas'); c2.width = x1 - x0 + 1; c2.height = y1 - y0 + 1; c2.getContext('2d').drawImage(c, x0, y0, c2.width, c2.height, 0, 0, c2.width, c2.height);
    let url = c2.toDataURL('image/webp', .92); if (!url.startsWith('data:image/webp')) url = c2.toDataURL('image/png');
    const antigos = [IMG.brasao.local, IMG.brasao.remoto];
    IMG.brasao = { local: url, limpo: true };
    try { localStorage.setItem(BRASAO_KEY, url); } catch (e) { }
    document.querySelectorAll('img').forEach(el => { const src = el.getAttribute('src'); if (antigos.includes(src) || antigos.includes(el.getAttribute('data-remoto'))) { el.removeAttribute('data-remoto'); el.src = url; } });
  } catch (e) { } };
  im.src = '/api/brasao.jpg';
}
const marcaAgua = () => `<div class="marca-agua">${img('brasao', '')}</div>`;
function fotoVer(v) { if (v.fotoData) return { local: v.fotoData }; return { local: `assets/img/vereadores/${v.arq}.jpg`, remoto: `${ORIGEM}/Arquivos/Vereadores/${encodeURIComponent(v.foto)}?quality=82&w=600` }; }
const iniciais = n => String(n).split(' ').filter(p => p.length > 2).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const verPorId = id => VEREADORES.find(v => v.id === +id);
const cargoMesa = id => (MESA.membros.find(x => x[1] === id) || [])[0] || '';
const cargoVer = v => { const c = cargoMesa(v.id); return c ? (v.f ? c.replace('Secretário', 'Secretária').replace('Presidente', 'Presidente') : c) : (v.f ? 'Vereadora' : 'Vereador'); };

/* ---------------- notícias: arquivo importado + publicações do painel ---------------- */
function noticias() {
  const prev = param('previa') === '1' ? ls.json('lg_previa_noticia', null) : null;
  const painel = [...(prev ? [prev] : []), ...ls.json('lgt_site_noticias_v1', [])].filter(n => n && n.publicado !== false).map(n => ({
    id: n.id, data: n.data, titulo: n.titulo, categoria: n.categoria || 'Notícias da Câmara', resumo: n.resumo || '', corpo: n.corpo || '',
    capa: n.capa ? { local: n.capa } : null, fotos: n.fotos || [], destaque: !!n.destaque, origem: 'painel',
  }));
  const arquivo = (window.NOTICIAS_ARQUIVO || []).map(n => ({
    id: String(n.id), data: n.data, titulo: n.titulo, categoria: n.categoria, resumo: n.resumo || '', corpo: '',
    capa: n.capa ? { local: n.capa, remoto: n.capaRemota || '' } : null, fotos: (n.fotos || []).slice(1), original: n.original, origem: 'arquivo',
  }));
  const tv = window.lgtvNoticias ? lgtvNoticias() : [];
  return [...painel, ...tv, ...arquivo].sort((a, b) => (b.data || '').localeCompare(a.data || '') || String(b.id).localeCompare(String(a.id), 'pt', { numeric: true }));
}
const linkNoticia = n => n.link || `noticia.html?id=${encodeURIComponent(n.id)}`;
const capaNot = (n, cls = '') => n.capa ? img(n.capa, '', cls, 'brasao') : marcaAgua();

/* ---------------- menu principal: definido em assets/site-conteudo.js (editável no painel) ---------------- */

function montarCabecalho() {
  const el = $('#cabecalho'); if (!el) return;
  const atual = location.pathname.split('/').pop() || 'index.html';
  el.innerHTML = `
  <a class="pular" href="#conteudo" accesskey="1">Ir para o conteúdo</a>
  <div class="barra"><div class="wrap">
    <span class="oficial"><i aria-hidden="true"></i>Portal oficial do Poder Legislativo de Neves Paulista — SP</span>
    <nav aria-label="Acesso rápido">
      <a href="transparencia.html">Transparência</a><a href="${CONFIG.esic}"${alvo(CONFIG.esic)}>e-SIC</a><a href="ouvidoria.html">Ouvidoria</a><a href="${CONFIG.webmail}"${alvo(CONFIG.webmail)}>Webmail</a>
      <span class="a11y" role="group" aria-label="Acessibilidade">
        <button type="button" onclick="fonte(-1)" aria-label="Diminuir texto" accesskey="5">A−</button>
        <button type="button" onclick="fonte(1)" aria-label="Aumentar texto" accesskey="4">A+</button>
        <button type="button" id="btn-tema" onclick="tema()" aria-pressed="${document.documentElement.dataset.tema === 'escuro'}" aria-label="Modo escuro" title="Modo escuro">${ic(document.documentElement.dataset.tema === 'escuro' ? 'sol' : 'lua')}</button>
        <a href="pagina.html?p=acessibilidade" aria-label="Recursos de acessibilidade" accesskey="7">${ic('mao')}</a>
      </span>
    </nav>
  </div></div>
  <header class="topo" id="topo"><div class="wrap">
    <a class="marca" href="index.html" aria-label="Câmara Municipal de Neves Paulista — página inicial">${img('brasao', '', '', 'NP')}<span><small>Câmara Municipal de</small><b>Neves Paulista</b><em>Estado de São Paulo</em></span></a>
    <nav class="nav-principal" id="nav-principal" aria-label="Menu principal" accesskey="2">
      <button class="btn-icone fechar-menu" type="button" aria-label="Fechar menu" onclick="menuMovel(false)">${ic('x')}</button>
      <ul>
        <li><a class="item" href="index.html"${atual === 'index.html' ? ' aria-current="page"' : ''}>Início</a></li>
        ${MENU.map(([t, itens, estreito], i) => `<li><button class="item" type="button" aria-expanded="false" aria-controls="sub-${i}" onclick="abrirSub(this)">${t}${ic('chev', 'ic chev')}</button>
          <div class="submenu${estreito ? ' estreito' : ''}" id="sub-${i}">${itens.map(([icn, l, d, u]) => `<a href="${u}"${alvo(u)}>${ic(icn)}<span><b>${l}${extIc(u)}</b><small>${d}</small></span></a>`).join('')}</div></li>`).join('')}
      </ul>
    </nav>
    <div class="acoes-topo">
      <button class="btn-icone" type="button" aria-label="Pesquisar no portal" onclick="abrirBusca()">${ic('busca')}</button>
      <a class="btn-restrita" href="${CONFIG.painel}" title="Vereadores e servidores">${ic('cadeado')}<span>Área restrita</span></a>
      <button class="btn-icone hamburguer" type="button" aria-label="Abrir menu" onclick="menuMovel(true)">${ic('menu')}</button>
    </div>
  </div></header>
  <div class="veu" onclick="menuMovel(false)"></div>
  <div class="busca-over" id="busca-over" role="dialog" aria-modal="true" aria-label="Pesquisa" onclick="if(event.target===this)fecharBusca()">
    <div class="busca-caixa">
      <form action="busca.html" role="search">${ic('busca')}<label class="sr-only" for="q-geral">Pesquisar</label><input id="q-geral" name="q" placeholder="O que você procura? Ex.: orçamento, vereador, sessão" autocomplete="off"><button class="btn" type="submit">Pesquisar</button></form>
      <div class="dicas"><a href="busca.html?q=orçamento">Orçamento</a><a href="busca.html?q=sessão">Sessões</a><a href="busca.html?q=moção">Moções</a><a href="transparencia.html">Transparência</a><a href="vereadores.html">Vereadores</a></div>
    </div>
  </div>`;
  const topo = $('#topo'); addEventListener('scroll', () => topo.classList.toggle('rolou', scrollY > 30), { passive: true });
}

function montarRodape() {
  const el = $('#rodape'); if (!el) return;
  el.innerHTML = `
  <footer class="rodape" accesskey="3">
    <div class="wrap topo-rodape">
      <div>
        <a class="marca" href="index.html">${img('brasao', '', '', 'NP')}<span><small>Câmara Municipal de</small><b>Neves Paulista</b><em>${CONFIG.slogan}</em></span></a>
        <p>${CONFIG.horarioSessoes}</p>
        <div class="redes">${Object.entries(CONFIG.redes).map(([k, u]) => `<a href="${u}" target="_blank" rel="noopener" aria-label="${k}">${ic(k)}</a>`).join('')}</div>
      </div>
      <div><h3>Contato</h3><ul class="contato">
        <li>${ic('local')}<span>${CONFIG.endereco}<br>${CONFIG.cidade} · CEP ${CONFIG.cep}</span></li>
        <li>${ic('tel')}<a href="tel:${CONFIG.telefoneLink}">${CONFIG.telefone}</a></li>
        <li>${ic('relogio')}<span>${CONFIG.horario}</span></li>
      </ul></div>
      <div><h3>Acesso rápido</h3><ul>
        <li><a href="transparencia.html">Portal da Transparência</a></li><li><a href="${CONFIG.esic}"${alvo(CONFIG.esic)}>e-SIC</a></li>
        <li><a href="sessoes.html">Sessões</a></li><li><a href="noticias.html">Notícias</a></li><li><a href="${CONFIG.leis}">Leis municipais</a></li>
      </ul></div>
      <div><h3>Receba as notícias</h3>
        <p style="margin:0">Cadastre seu e-mail para receber o resumo das sessões.</p>
        <form class="news-form" onsubmit="return inscrever(event)"><label class="sr-only" for="news-email">E-mail</label><input id="news-email" type="email" required placeholder="seu@email.com"><button>Cadastrar</button></form>
        <div class="news-msg" id="news-msg" role="status"></div>
      </div>
    </div>
    <div class="base-rodape"><div class="wrap">
      <span>© ${new Date().getFullYear()} ${CONFIG.nome}. Informação de interesse público.</span>
      <span class="marca-lg">Desenvolvido por <a href="https://legislagov.com.br" target="_blank" rel="noopener"><b>Legisla<i>Gov</i></b></a> · <a href="https://legislagov.com.br" target="_blank" rel="noopener">legislagov.com.br</a></span>
      <span><a href="pagina.html?p=mapa-do-site">Mapa do site</a> · <a href="pagina.html?p=lgpd">Privacidade</a> · <a href="pagina.html?p=acessibilidade">Acessibilidade</a> · <a href="${CONFIG.painel}">Área restrita</a></span>
    </div></div>
  </footer>`;
  if (!ls.get('site_cookies')) {
    const c = document.createElement('div'); c.className = 'cookies'; c.setAttribute('role', 'region'); c.setAttribute('aria-label', 'Aviso de privacidade');
    c.innerHTML = `<span>Usamos apenas o armazenamento do seu navegador para lembrar preferências de acessibilidade. <a href="pagina.html?p=lgpd">Saiba mais</a>.</span><button class="btn btn-ouro" type="button">Entendi</button>`;
    c.querySelector('button').onclick = () => { ls.set('site_cookies', '1'); c.remove(); }; document.body.appendChild(c);
  }
  if (!document.querySelector('[vw]')) {   // VLibras
    const d = document.createElement('div'); d.setAttribute('vw', ''); d.className = 'enabled';
    d.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>'; document.body.appendChild(d);
    const s = document.createElement('script'); s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js'; s.onload = () => { try { new window.VLibras.Widget('https://vlibras.gov.br/app'); } catch (e) { } }; document.body.appendChild(s);
  }
}

/* ---------------- interações gerais ---------------- */
function abrirSub(b) {
  const li = b.parentElement; const abrir = !li.classList.contains('aberto');
  $$('.nav-principal li.aberto').forEach(x => { x.classList.remove('aberto'); x.querySelector('.item')?.setAttribute('aria-expanded', 'false'); });
  li.classList.toggle('aberto', abrir); b.setAttribute('aria-expanded', abrir);
}
function menuMovel(abrir) { document.body.classList.toggle('menu-aberto', abrir); }
function abrirBusca() { $('#busca-over').classList.add('aberta'); setTimeout(() => $('#q-geral').focus(), 30); }
function fecharBusca() { $('#busca-over').classList.remove('aberta'); }
document.addEventListener('click', e => { if (!e.target.closest('.nav-principal')) $$('.nav-principal li.aberto').forEach(x => { x.classList.remove('aberto'); x.querySelector('.item')?.setAttribute('aria-expanded', 'false'); }); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $$('.nav-principal li.aberto').forEach(x => x.classList.remove('aberto')); fecharBusca(); menuMovel(false); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBusca(); }
});
function fonte(d) { const r = document.documentElement; const v = Math.max(0, Math.min(2, (+r.dataset.fonte || 0) + d)); r.dataset.fonte = v; ls.set('site_fonte', v); }
function contraste() { const r = document.documentElement; const on = r.dataset.contraste === 'alto'; if (on) delete r.dataset.contraste; else r.dataset.contraste = 'alto'; ls.set('site_contraste', on ? '' : 'alto'); const b = $('#btn-contraste'); if (b) b.setAttribute('aria-pressed', String(!on)); }
function tema(forcar) { const r = document.documentElement; const escuro = forcar !== undefined ? forcar === 'escuro' : r.dataset.tema !== 'escuro'; r.dataset.tema = escuro ? 'escuro' : 'claro'; if (forcar === undefined) ls.set('site_tema', r.dataset.tema); const b = $('#btn-tema'); if (b) { b.setAttribute('aria-pressed', String(escuro)); b.setAttribute('aria-label', escuro ? 'Modo claro' : 'Modo escuro'); b.title = escuro ? 'Modo claro' : 'Modo escuro'; b.innerHTML = ic(escuro ? 'sol' : 'lua'); } const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = escuro ? '#140b0d' : '#ffffff'; }
(() => { const r = document.documentElement; const f = ls.get('site_fonte', ''); if (f) r.dataset.fonte = f; delete r.dataset.contraste; ls.set('site_contraste', '');
  const t = ls.get('site_tema', ''); r.dataset.tema = t || (matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'); })();
function inscrever(e) {
  e.preventDefault(); const em = $('#news-email').value.trim(); const l = ls.json('site_inscricoes', []); if (!l.includes(em)) l.push(em); ls.set('site_inscricoes', JSON.stringify(l));
  $('#news-msg').textContent = 'Pronto! Você receberá as próximas notícias.'; e.target.reset(); return false;
}

/* ---------------- sessões ---------------- */
function sessoes() {
  const painel = ls.json('lgv11_agenda_v1', []).filter(x => x && x.when).map(x => ({ quando: new Date(x.when), titulo: x.title || ('Sessão ' + (x.type || '')), tipo: x.type || 'Ordinária', resumo: x.summary || '', fonte: 'painel' }));
  const dias = new Set(painel.map(s => s.quando.toDateString()));
  const publ = SESSOES.map(([d, t]) => ({ quando: new Date(d), titulo: t, tipo: 'Ordinária', resumo: '', fonte: 'calendário' })).filter(s => !dias.has(s.quando.toDateString()));
  const pl = (ls.json('lgpl_v1', { sessoes: [] }).sessoes || []).filter(s => s.convocacao).map(s => ({ quando: new Date(s.quando), titulo: s.titulo, tipo: s.tipo || 'Ordinária', resumo: s.status === 'encerrada' ? 'Realizada — pauta, resultados e ata abaixo' : 'Pauta publicada — veja abaixo', fonte: 'plenário' }));
  const diasPl = new Set(pl.map(s => s.quando.toDateString()));
  return [...pl, ...painel.filter(s => !diasPl.has(s.quando.toDateString())), ...publ.filter(s => !diasPl.has(s.quando.toDateString()))].sort((a, b) => a.quando - b.quando);
}
const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const futuras = () => sessoes().filter(s => s.quando >= hoje0());
const hora = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function itemSessao(s, cls = '') {
  return `<a class="sessao ${cls}" href="sessoes.html"><div class="data"><b>${String(s.quando.getDate()).padStart(2, '0')}</b><span>${MESES[s.quando.getMonth()]} ${s.quando.getFullYear() !== new Date().getFullYear() ? s.quando.getFullYear() : ''}</span></div>
  <div><h3>${esc(s.titulo)}</h3><p><span>${ic('relogio')} ${s.quando.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${hora(s.quando)}</span><span>${ic('local')} Plenário</span></p>${s.resumo ? `<p>${esc(s.resumo)}</p>` : ''}</div></a>`;
}

/* ---------------- página inicial ---------------- */
let slide = 0, slideTimer;
function montarCapa() {
  const el = $('#capa'); if (!el) return;
  const destaquesPainel = noticias().filter(n => n.destaque).slice(0, 2).map(n => ({ imgObj: n.capa || IMG.plenario, selo: n.categoria, titulo: n.titulo, texto: n.resumo, link: linkNoticia(n), botao: 'Ler notícia' }));
  const lista = [...destaquesPainel, ...DESTAQUES];
  el.innerHTML = lista.map((d, i) => `<div class="slide${i ? '' : ' ativo'}" aria-hidden="${!!i}">${d.imgObj ? img(d.imgObj, '') : img(d.img, '')}</div>`).join('') +
    `<div class="wrap"><div class="txt" aria-live="polite" id="capa-txt"></div><aside class="card-sessao" id="card-sessao" aria-label="Próxima sessão"></aside></div>
     <div class="controles"><button class="seta" type="button" aria-label="Destaque anterior" onclick="irSlide(slide-1)">${ic('esq')}</button><div class="pontos">${lista.map((_, i) => `<button type="button" aria-label="Destaque ${i + 1}" onclick="irSlide(${i})"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div><button class="seta" type="button" aria-label="Próximo destaque" onclick="irSlide(slide+1)">${ic('dir')}</button></div>`;
  el._lista = lista; irSlide(0, true);
  slideTimer = setInterval(() => irSlide(slide + 1), 8000);
  el.addEventListener('mouseenter', () => clearInterval(slideTimer)); el.addEventListener('focusin', () => clearInterval(slideTimer));
  montarCardSessao();
}
function irSlide(n, primeira) {
  const el = $('#capa'); const lista = el._lista; slide = (n + lista.length) % lista.length;
  $$('#capa .slide').forEach((s, i) => { s.classList.toggle('ativo', i === slide); s.setAttribute('aria-hidden', i !== slide); });
  $$('#capa .pontos button').forEach((b, i) => b.setAttribute('aria-current', i === slide));
  const d = lista[slide];
  $('#capa-txt').innerHTML = `<span class="selo">${esc(d.selo || 'Destaque')}</span><h1><a href="${d.link}">${esc(d.titulo)}</a></h1>${d.texto ? `<p class="lead">${esc(d.texto)}</p>` : ''}<div class="botoes"><a class="btn btn-ouro" href="${d.link}">${esc(d.botao || 'Saiba mais')} ${ic('seta')}</a><a class="btn btn-vidro" href="transparencia.html">${ic('grafico')} Transparência</a></div>`;
}
function montarCardSessao() {
  const el = $('#card-sessao'); if (!el) return; const s = futuras()[0];
  if (!s) { el.innerHTML = `<span class="rot">Agenda</span><h2 style="margin-top:12px">Nenhuma sessão agendada</h2><p>Confira o calendário completo.</p><div class="links" style="margin-top:14px"><a class="btn" href="sessoes.html">Ver calendário</a></div>`; return; }
  const dif = s.quando - new Date(); const d = Math.max(0, Math.floor(dif / 864e5)), h = Math.max(0, Math.floor(dif % 864e5 / 36e5)), m = Math.max(0, Math.floor(dif % 36e5 / 6e4));
  el.innerHTML = `<span class="rot"><i aria-hidden="true"></i>Próxima sessão</span>
   <div class="quando"><div class="dia"><b>${String(s.quando.getDate()).padStart(2, '0')}</b><span>${MESES[s.quando.getMonth()]}</span></div>
   <div><h2>${esc(s.titulo)}</h2><p>${ic('relogio')} ${s.quando.toLocaleDateString('pt-BR', { weekday: 'long' })}, às ${hora(s.quando)}</p><p>${ic('local')} Plenário da Câmara · aberta ao público</p></div></div>
   <div class="contagem" aria-label="Faltam ${d} dias, ${h} horas e ${m} minutos"><div><b>${d}</b><small>dias</small></div><div><b>${h}</b><small>horas</small></div><div><b>${m}</b><small>min</small></div></div>
   <div class="links"><a class="btn" href="sessoes.html">${ic('cal')} Agenda</a><a class="btn btn-claro" href="${CONFIG.redes.youtube}" target="_blank" rel="noopener">${ic('youtube')} Assistir</a></div>`;
}
function montarServicos() {
  const el = $('#servicos'); if (!el) return;
  const S = [['grafico', 'Transparência', 'Contas, pessoal e contratos', 'transparencia.html'], ['balanca', 'Leis municipais', 'Consulta à legislação', CONFIG.legislacao],
  ['doc', 'Proposituras', 'Projetos em tramitação', CONFIG.proposituras], ['cal', 'Sessões', 'Calendário e pautas', 'sessoes.html'],
  ['ouvido', 'Ouvidoria', 'Fale com a Câmara', 'pagina.html?p=ouvidoria'], ['info', 'e-SIC', 'Acesso à informação', CONFIG.esic]];
  el.innerHTML = `<div class="wrap"><ul>${S.map(([i, t, d, u]) => `<li><a href="${u}"${alvo(u)}><span class="ico">${ic(i)}</span><span><b>${t}</b><small>${d}</small></span></a></li>`).join('')}</ul></div>`;
}
function montarNoticiasHome() {
  const el = $('#noticias-home'); if (!el) return; const ns = noticias();
  const com = ns.find(n => n.capa && ns.indexOf(n) < 12) || ns[0];
  const resto = ns.filter(n => n !== com).slice(0, 4);
  el.innerHTML = `<a class="not-destaque" href="${linkNoticia(com)}"><div class="foto">${capaNot(com)}</div><div class="bd"><div class="meta"><span class="chip">${esc(com.categoria)}</span><time datetime="${com.data}">${dataLonga(com.data)}</time></div><h3>${esc(com.titulo)}</h3></div></a>
  <div class="not-lista">${resto.map(n => `<a class="not-item" href="${linkNoticia(n)}"><div class="mini">${capaNot(n)}</div><div><div class="meta"><span class="chip">${esc(n.categoria)}</span><time datetime="${n.data}">${dataLonga(n.data)}</time></div><h3>${esc(n.titulo)}</h3></div></a>`).join('')}
  <a class="link-seta" href="noticias.html" style="margin-top:18px">Todas as notícias ${ic('seta')}</a></div>`;
}
function cardVer(v) {
  const c = cargoMesa(v.id);
  return `<a class="ver-card${c === 'Presidente' ? ' destaque' : ''}" href="vereador.html?id=${v.id}"><div class="foto">${img(fotoVer(v), 'Foto de ' + v.completo, '', iniciais(v.completo))}</div><div class="bd"><b>${esc(v.nome)}</b><span class="partido">${esc(v.partido)}</span>${c ? `<br><span class="chip ouro cargo">${cargoVer(v)}</span>` : ''}</div></a>`;
}
function montarVerHome() { const el = $('#ver-home'); if (el) el.innerHTML = VEREADORES.map(cardVer).join(''); }
function montarTV(el) {
  if (!el) return;
  el.innerHTML = `<div class="tela">${img('brasao', '')}<h3>TV Câmara</h3><p>As sessões ordinárias acontecem às segundas-feiras, às 20h. Assista às gravações no canal oficial.</p><a class="btn btn-ouro" href="${CONFIG.redes.youtube}" target="_blank" rel="noopener">${ic('youtube')} Abrir o canal</a></div>
  <div class="rodape-tv"><span>${ic('video')} Sessões gravadas</span><a href="${CONFIG.redes.youtube}/streams" target="_blank" rel="noopener">Transmissões →</a></div>`;
}
function montarAgendaHome() { const el = $('#agenda-home'); if (!el) return; const f = futuras().slice(0, 4); el.innerHTML = f.length ? f.map(s => itemSessao(s)).join('') : '<p class="nota">Nenhuma sessão agendada no momento.</p>'; }
function montarTranspHome() {
  const el = $('#transp-home'); if (!el) return;
  const T = [['moeda', 'Receitas e despesas', 'Duodécimos, empenhos e pagamentos', 'transparencia.html?c=despesas'], ['contrato', 'Licitações', 'Editais, dispensas, contratos e aditivos', 'transparencia.html?c=licitacoes'],
  ['pessoa', 'Pessoal', 'Servidores, cargos e remuneração', 'transparencia.html?c=pessoal'], ['ata', 'Prestação de contas', 'Balanços, RGF e parecer do TCE', 'transparencia.html?c=contas']];
  el.innerHTML = T.map(([i, t, d, u]) => `<a href="${u}">${ic(i)}<b>${t}</b><small>${d}</small></a>`).join('');
}

/* ---------------- vereadores ---------------- */
function montarVereadores() {
  const g = $('#grade-ver'); if (!g) return;
  g.innerHTML = VEREADORES.map(cardVer).join('');
  $('#grade-mesa').innerHTML = MESA.membros.map(([, id]) => cardVer(verPorId(id))).join('');
  $('#mesa-periodo').textContent = MESA.periodo;
  $('#grade-comissoes').innerHTML = COMISSOES.map(c => `<div class="comissao"><div class="cab"><h3>${esc(c.nome)}</h3><p>${esc(c.resumo)} Eleita em ${c.eleicao}.</p></div><ul>${c.membros.map(([cargo, id]) => { const v = verPorId(id); return `<li>${img(fotoVer(v), '', '', iniciais(v.completo))}<div><a href="vereador.html?id=${v.id}">${esc(v.nome)}</a><small>${esc(cargo)} · ${esc(v.partido)}</small></div></li>`; }).join('')}</ul></div>`).join('');
  const abas = $$('.abas button');
  const mostrar = k => abas.forEach(b => { const s = b.dataset.aba === k; b.setAttribute('aria-selected', s); $('#aba-' + b.dataset.aba).hidden = !s; });
  abas.forEach(b => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.aba); mostrar(b.dataset.aba); });
  const h = location.hash.slice(1); mostrar(['mesa', 'comissoes'].includes(h) ? h : 'vereadores');
  addEventListener('hashchange', () => { const k = location.hash.slice(1); if (['mesa', 'comissoes', 'vereadores'].includes(k)) mostrar(k); });
}
function montarFicha() {
  const el = $('#ficha'); if (!el) return; const v = verPorId(param('id'));
  if (!v) { el.innerHTML = '<p>Vereador não encontrado. <a href="vereadores.html">Ver todos</a>.</p>'; return; }
  document.title = v.completo + ' — ' + CONFIG.nome; $('#titulo-pagina').textContent = v.nome;
  const com = COMISSOES.flatMap(c => c.membros.filter(m => m[1] === v.id).map(m => `${m[0]} — Comissão de ${c.nome}`));
  const mesa = cargoMesa(v.id);
  const nots = noticias().filter(n => norm(n.titulo).includes(norm(v.nome.split(' ')[0])) || norm(n.titulo).includes(norm(v.completo.split(' ').slice(-1)[0]))).slice(0, 5);
  el.innerHTML = `<div class="foto">${img(fotoVer(v), 'Foto de ' + v.completo, '', iniciais(v.completo))}</div>
  <div>${mesa ? `<span class="chip ouro">${cargoVer(v)} · Mesa Diretora</span>` : `<span class="chip">${v.f ? 'Vereadora' : 'Vereador'}</span>`}<h2>${esc(v.completo)}</h2><p class="sub">Nome parlamentar: <b>${esc(v.nome)}</b> · ${esc(v.partido)} · Legislatura ${esc(window.LEGISLATURA || '2025–2028')}</p>
  <table class="tabela"><tbody>
    <tr><th>Partido</th><td>${esc(v.partido)}</td></tr>
    <tr><th>Cargo</th><td>${mesa ? cargoVer(v) + ' da Câmara (' + esc(MESA.periodo.split('(')[0].trim().toLowerCase()) + ')' : (v.f ? 'Vereadora' : 'Vereador')}</td></tr>
    <tr><th>Comissões</th><td>${com.length ? com.join('<br>') : 'Não integra comissão permanente no biênio atual'}</td></tr>
    <tr><th>Contato</th><td>${v.email ? `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a> · ` : ''}${v.telefone ? `<a href="tel:${esc(v.telefone.replace(/\D/g, ''))}">${esc(v.telefone)}</a>` : `Gabinete na Câmara · <a href="tel:${CONFIG.telefoneLink}">${CONFIG.telefone}</a>`}</td></tr>
  </tbody></table>
  ${nots.length ? `<h3 style="margin:26px 0 8px">Notícias recentes</h3><div class="not-lista">${nots.map(n => `<a class="not-item" href="${linkNoticia(n)}"><div class="mini">${capaNot(n)}</div><div><div class="meta"><time>${dataLonga(n.data)}</time></div><h3>${esc(n.titulo)}</h3></div></a>`).join('')}</div>` : ''}
  <div class="acoes"><a class="btn" href="proposituras.html?autor=${v.id}">${ic('doc')} Proposituras</a><a class="btn btn-claro" href="fale-conosco.html?assunto=${encodeURIComponent('Mensagem ao vereador ' + v.nome)}">${ic('email')} Enviar mensagem</a></div></div>`;
}

/* ---------------- notícias ---------------- */
function cardNoticia(n) { return `<a class="card-not" href="${linkNoticia(n)}"><div class="foto">${capaNot(n)}</div><div class="bd"><div class="meta"><span class="chip">${esc(n.categoria)}</span><time datetime="${n.data}">${dataLonga(n.data)}</time></div><h3>${esc(n.titulo)}</h3></div></a>`; }
function montarListaNoticias() {
  const el = $('#lista-noticias'); if (!el) return; const todas = noticias(); const porPag = 12; let pag = 1;
  const cats = [...new Set(todas.map(n => n.categoria))].sort(); const anos = [...new Set(todas.map(n => (n.data || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  $('#filtro-cat').innerHTML = '<option value="">Todas as categorias</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
  $('#filtro-ano').innerHTML = '<option value="">Todos os anos</option>' + anos.map(a => `<option>${a}</option>`).join('');
  if (param('q')) $('#filtro-q').value = param('q'); if (param('c')) $('#filtro-cat').value = param('c');
  const desenhar = () => {
    const q = norm($('#filtro-q').value.trim()), c = $('#filtro-cat').value, a = $('#filtro-ano').value;
    const l = todas.filter(n => (!q || norm(n.titulo + ' ' + n.resumo).includes(q)) && (!c || n.categoria === c) && (!a || (n.data || '').startsWith(a)));
    const total = Math.max(1, Math.ceil(l.length / porPag)); pag = Math.min(pag, total);
    $('#contador').textContent = `${l.length} notícia${l.length === 1 ? '' : 's'}`;
    el.innerHTML = l.length ? l.slice((pag - 1) * porPag, pag * porPag).map(cardNoticia).join('') : '<p>Nenhuma notícia encontrada.</p>';
    const pg = []; for (let i = 1; i <= total; i++) if (i === 1 || i === total || Math.abs(i - pag) <= 2) pg.push(i); else if (pg[pg.length - 1] !== '…') pg.push('…');
    $('#paginacao').innerHTML = total > 1 ? `<button type="button" ${pag === 1 ? 'disabled' : ''} data-p="${pag - 1}" aria-label="Anterior">‹</button>` + pg.map(p => p === '…' ? '<button disabled>…</button>' : `<button type="button" data-p="${p}"${p === pag ? ' aria-current="true"' : ''}>${p}</button>`).join('') + `<button type="button" ${pag === total ? 'disabled' : ''} data-p="${pag + 1}" aria-label="Próxima">›</button>` : '';
  };
  ['#filtro-q', '#filtro-cat', '#filtro-ano'].forEach(s => $(s).addEventListener('input', () => { pag = 1; desenhar(); }));
  $('#paginacao').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b && !b.disabled) { pag = +b.dataset.p; desenhar(); scrollTo({ top: 0, behavior: 'smooth' }); } });
  desenhar();
}
function montarNoticia() {
  const el = $('#leitura'); if (!el) return; const ns = noticias(); const n = ns.find(x => String(x.id) === param('id'));
  if (!n) { el.innerHTML = '<p>Notícia não encontrada. <a href="noticias.html">Ver todas as notícias</a>.</p>'; return; }
  document.title = n.titulo + ' — ' + CONFIG.nome;
  const i = ns.indexOf(n); const rel = ns.filter(x => x !== n && x.categoria === n.categoria).slice(0, 3);
  const corpo = n.corpo ? n.corpo.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : (n.resumo ? `<p>${esc(n.resumo)}</p>` : '');
  el.innerHTML = `<div class="meta"><span class="chip">${esc(n.categoria)}</span><time datetime="${n.data}">${ic('cal')} ${dataLonga(n.data)}</time></div>
  <h1>${esc(n.titulo)}</h1>
  ${n.capa ? `<figure class="capa-not">${img(n.capa, '', '', 'brasao')}</figure>` : ''}
  <div class="corpo">${corpo || `<p class="nota">Esta notícia foi publicada originalmente no site anterior da Câmara${n.original ? `. <a href="${n.original}" target="_blank" rel="noopener">Ver a publicação original</a>` : ''}.</p>`}</div>
  ${n.fotos && n.fotos.length ? `<div class="galeria">${n.fotos.map(f => img(f, '')).join('')}</div>` : ''}
  <div class="compartilhar"><span>Compartilhar:</span>
    <a class="btn btn-claro" href="https://wa.me/?text=${encodeURIComponent(n.titulo + ' ' + location.href)}" target="_blank" rel="noopener">${ic('whatsapp')} WhatsApp</a>
    <button class="btn btn-claro" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(location.href);this.lastChild.textContent=' Link copiado'">${ic('link')}<span> Copiar link</span></button>
    <button class="btn btn-claro" type="button" onclick="print()">${ic('imprimir')} Imprimir</button></div>
  <div class="acoes" style="justify-content:space-between">${ns[i + 1] ? `<a class="link-seta" href="${linkNoticia(ns[i + 1])}">${ic('esq')} Anterior</a>` : '<span></span>'}${ns[i - 1] ? `<a class="link-seta" href="${linkNoticia(ns[i - 1])}">Próxima ${ic('dir')}</a>` : ''}</div>
  ${rel.length ? `<h2 style="margin-top:44px">Leia também</h2><div class="grade-not">${rel.map(cardNoticia).join('')}</div>` : ''}`;
}

/* ---------------- sessões (página) ---------------- */
let calDesloc = 0;
function montarCalendario() {
  const el = $('#calendario'); if (!el) return; const b = new Date(); const ref = new Date(b.getFullYear(), b.getMonth() + calDesloc, 1);
  const dias = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate(); const ini = ref.getDay();
  const evs = new Set(sessoes().filter(s => s.quando.getMonth() === ref.getMonth() && s.quando.getFullYear() === ref.getFullYear()).map(s => s.quando.getDate()));
  const h = new Date(); let g = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<div class="s">${x}</div>`).join('');
  for (let i = 0; i < ini; i++) g += '<div></div>';
  for (let d = 1; d <= dias; d++) { const hj = d === h.getDate() && ref.getMonth() === h.getMonth() && ref.getFullYear() === h.getFullYear(); g += `<div class="d${evs.has(d) ? ' ev' : ''}${hj ? ' hoje' : ''}"${evs.has(d) ? ' title="Sessão"' : ''}>${d}</div>`; }
  const mes = ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  el.innerHTML = `<div class="cal-cab"><button type="button" aria-label="Mês anterior" onclick="calDesloc--;montarCalendario()">‹</button><b>${mes[0].toUpperCase() + mes.slice(1)}</b><button type="button" aria-label="Próximo mês" onclick="calDesloc++;montarCalendario()">›</button></div><div class="cal-grade">${g}</div>`;
}
function montarSessoes() {
  const f = $('#sessoes-futuras'), p = $('#sessoes-passadas'); if (!f) return;
  const fut = futuras(), pas = sessoes().filter(s => s.quando < hoje0()).reverse();
  f.innerHTML = fut.length ? fut.map(s => itemSessao(s)).join('') : '<p class="nota">Nenhuma sessão agendada.</p>';
  p.innerHTML = pas.slice(0, 12).map(s => itemSessao(s, 'passada')).join('');
}

/* ---------------- páginas de conteúdo ---------------- */
function montarPagina() {
  const el = $('#pagina'); if (!el) return; const k = param('p') || 'a-camara'; const pg = PAGINAS[k];
  if (!pg) { el.innerHTML = '<p>Página não encontrada. <a href="index.html">Voltar ao início</a>.</p>'; return; }
  document.title = pg.titulo + ' — ' + CONFIG.nome; $('#titulo-pagina').textContent = pg.titulo; $('#trilha-grupo').textContent = pg.grupo;
  const irmas = Object.entries(PAGINAS).filter(([, v]) => v.grupo === pg.grupo);
  $('#lateral').innerHTML = `<h3>${esc(pg.grupo)}</h3>` + irmas.map(([kk, v]) => `<a href="pagina.html?p=${kk}"${kk === k ? ' aria-current="page"' : ''}>${esc(v.titulo)}</a>`).join('') +
    (pg.grupo === 'Conheça a Câmara' ? '<a href="vereadores.html">Vereadores</a><a href="vereadores.html#comissoes">Comissões</a>' : '');
  let html = (pg.html || '').replace(/class="btn btn-sec"/g, 'class="btn btn-claro"').replace(/<ul class="timeline">/g, '<ul class="linha-tempo">').replace(/<div class="chips">/g, '<div class="chips">').replace(/<span>(Sugestão|Elogio|Solicitação|Reclamação|Denúncia)<\/span>/g, '<span class="chip">$1</span>');
  if (pg.especial === 'presidentes') html = `<p>Presidentes da Câmara Municipal desde 1948, conforme a galeria da Câmara. O período de 2013 a 2024 está em atualização.</p><div class="presidentes">${PRESIDENTES.map(([n, a]) => `<div><b>${esc(n)}</b><span>${a}</span></div>`).join('')}</div>`;
  if (pg.especial === 'simbolos') html = `<p>Os símbolos oficiais de Neves Paulista. O brasão traz as datas de 1922 (fundação) e 1944 (emancipação) e a divisa “Centro Cafeeiro”.</p><div class="simbolos"><figure>${img('bandeira', 'Bandeira de Neves Paulista')}<figcaption>Bandeira</figcaption></figure><figure>${img('brasao', 'Brasão de Neves Paulista')}<figcaption>Brasão</figcaption></figure></div>`;
  if (pg.especial === 'localizacao') html = `<table class="tabela"><tbody><tr><th>Endereço</th><td>${CONFIG.endereco}<br>${CONFIG.cidade} · CEP ${CONFIG.cep}</td></tr><tr><th>Telefone</th><td><a href="tel:${CONFIG.telefoneLink}">${CONFIG.telefone}</a></td></tr><tr><th>Atendimento</th><td>${CONFIG.horario}</td></tr><tr><th>Sessões</th><td>${CONFIG.horarioSessoes}</td></tr></tbody></table><iframe class="mapa-embed" src="${CONFIG.mapa}" title="Mapa da Câmara Municipal" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  if (pg.especial === 'faq') html = `<div class="faq">${FAQ.map(([q, r]) => `<details><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}</div><p class="acoes"><a class="btn" href="fale-conosco.html">Não encontrou? Fale conosco</a></p>`;
  if (pg.especial === 'tv') html = `<div class="tv" id="tv-pagina" style="max-width:760px"></div><p class="nota" style="margin-top:14px">Quando a Câmara transmitir ao vivo, a transmissão aparecerá aqui.</p>`;
  if (pg.especial === 'mapa') html = `<div class="mapa-site"><div><h3>Principal</h3><a href="index.html">Início</a><a href="noticias.html">Notícias</a><a href="sessoes.html">Sessões</a><a href="vereadores.html">Vereadores</a><a href="transparencia.html">Portal da Transparência</a><a href="fale-conosco.html">Fale conosco</a><a href="busca.html">Pesquisa</a></div>${MENU.map(([t, itens]) => `<div><h3>${t}</h3>${itens.map(([, l, , u]) => `<a href="${u}"${alvo(u)}>${l}</a>`).join('')}</div>`).join('')}</div>`;
  el.innerHTML = html; montarTV($('#tv-pagina'));
}

/* ---------------- fale conosco ---------------- */
function montarFale() {
  const f = $('#form-fale'); if (!f) return;
  if (param('assunto')) f.assunto.value = param('assunto');
  f.onsubmit = e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(f)); d.data = new Date().toISOString(); d.protocolo = 'FC-' + Date.now().toString().slice(-8);
    const l = ls.json('site_mensagens', []); l.push(d); ls.set('site_mensagens', JSON.stringify(l));
    const ok = $('#fale-ok'); ok.hidden = false; ok.innerHTML = `<strong>Mensagem registrada.</strong> Seu protocolo é <b>${d.protocolo}</b>. A Secretaria responderá no e-mail informado.`; f.reset();
  };
}

/* ---------------- pesquisa ---------------- */
function montarBusca() {
  const el = $('#resultados'); if (!el) return; const q = (param('q') || '').trim(); const qq = norm(q);
  if ($('#q-pag')) $('#q-pag').value = q;
  $('#termo').textContent = q ? `Resultados para “${q}”` : 'Digite o que você procura.';
  if (!q) return;
  const res = [];
  VEREADORES.forEach(v => { if (norm(v.nome + ' ' + v.completo + ' ' + v.partido).includes(qq)) res.push(['Vereador', v.completo, 'vereador.html?id=' + v.id]); });
  Object.entries(PAGINAS).forEach(([k, p]) => { if (norm(p.titulo + ' ' + (p.html || '').replace(/<[^>]+>/g, ' ')).includes(qq)) res.push(['Página', p.titulo, 'pagina.html?p=' + k]); });
  MENU.forEach(([g, itens]) => itens.forEach(([, l, d, u]) => { if (norm(l + ' ' + d).includes(qq) && !res.some(r => r[2] === u)) res.push([g, l, u]); }));
  (window.TRANSP_BUSCA ? TRANSP_BUSCA(q) : []).forEach(r => res.push(r));
  (window.lgLeisTodas ? lgLeisTodas() : []).filter(x => norm([x.titulo, x.ementa, x.texto].join(' ')).includes(qq)).slice(0, 20).forEach(x => res.push(['Lei municipal', `${x.titulo} — ${x.ementa}`, 'leis.html?id=' + encodeURIComponent(x.id)]));
  noticias().filter(n => norm(n.titulo).includes(qq)).slice(0, 30).forEach(n => res.push(['Notícia · ' + dataLonga(n.data), n.titulo, linkNoticia(n)]));
  el.innerHTML = (res.length ? `<p class="contador">${res.length} resultado(s)</p>` + res.map(([t, l, u]) => `<a class="sessao" href="${u}"${alvo(u)}><div><h3>${esc(l)}</h3><p><span>${esc(t)}${ehExterno(u) ? ' · abre em outro site' : ''}</span></p></div></a>`).join('') : '<p>Nada encontrado no portal.</p>') +
    `<div class="aviso" style="margin-top:24px">Procurando uma lei ou um projeto? Veja <a href="leis.html?q=${encodeURIComponent(q)}">Leis municipais</a> (busca dentro do texto) e <a href="proposituras.html?q=${encodeURIComponent(q)}">Proposituras</a>.</div>`;
}

/* ---------------- inicialização ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (param('previa') === '1') document.body.insertAdjacentHTML('afterbegin', '<div class="faixa-previa" role="status"><b>PRÉ-VISUALIZAÇÃO</b> Este conteúdo ainda não foi publicado. Só você está vendo.</div>');
  montarCabecalho(); montarRodape();
  montarCapa(); montarServicos(); montarNoticiasHome(); montarVerHome(); montarAgendaHome(); montarTV($('#tv-home')); montarTranspHome();
  montarVereadores(); montarFicha(); montarListaNoticias(); montarNoticia(); montarCalendario(); montarSessoes(); montarPagina(); montarFale(); montarBusca();
  montarTV($('#tv-sessoes'));
  if (typeof iniciarTransparencia === 'function') iniciarTransparencia();
  if (typeof iniciarProposituras === 'function') iniciarProposituras();
  brasaoTransparente();
});
addEventListener('storage', e => {
  if (e.key === 'lgv11_agenda_v1') { montarCardSessao(); montarAgendaHome(); montarCalendario(); montarSessoes(); }
  if (e.key === 'lgt_site_noticias_v1') { montarNoticiasHome(); }
});
