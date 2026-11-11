/* =====================================================================
   TV Câmara — vídeos do canal oficial no YouTube, automático
   · O servidor lê o feed público do canal a cada 20 min (/api/youtube).
   · Vídeo novo aparece sozinho: na capa (TV Câmara), em Notícias, em Sessões e na página do vídeo.
   · Resumo: montado com os dados do sistema (sessão do mesmo dia: presença, pauta, resultados e
     votos) + a descrição do vídeo. Marcações de tempo da descrição viram capítulos clicáveis.
   · No painel (Publicação de matérias › TV Câmara) dá para ligar o vídeo a outra sessão,
     editar o resumo ou esconder o vídeo do site.
   ===================================================================== */
(function () {
  const CACHE = 'lgtv_cache_v1', AJ = 'lgs_site_videos_v1';
  const lsj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = k => new URLSearchParams(location.search).get(k);
  const I = (n, c) => (typeof ic === 'function' ? ic(n, c) : '');
  const CANAL = () => { try { return CONFIG.redes.youtube; } catch (e) { return 'https://www.youtube.com'; } };
  const dia = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dBR = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const MES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

  /* ---------- dados ---------- */
  let dados = lsj(CACHE, null);
  window.lgtvDados = () => dados;
  async function carregar() {
    try { const r = await fetch('/api/youtube', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); const j = await r.json();
      const mudou = JSON.stringify((j.videos || []).map(v => v.id + v.titulo)) !== JSON.stringify(((dados || {}).videos || []).map(v => v.id + v.titulo));
      dados = j; try { localStorage.setItem(CACHE, JSON.stringify(j)); } catch (e) { } return mudou;
    } catch (e) { return false; }
  }
  const ajustes = () => lsj(AJ, {}) || {};
  const cfg = () => lsj('lgt_site_cfg_v1', {}) || {};
  function videos() { const aj = ajustes(); return ((dados || {}).videos || []).filter(v => !(aj[v.id] || {}).oculto).map(v => ({ ...v, ...((aj[v.id] || {}).titulo ? { titulo: aj[v.id].titulo } : {}) })); }
  window.lgtvVideos = videos;

  /* ---------- data da sessão pelo título ("16/11/2026", "16-11-26", "16 de novembro de 2026") ou pela publicação ---------- */
  function dataDoVideo(v) {
    const t = String(v.titulo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(t);
    if (m) { const a = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return `${a}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
    m = /(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?/.exec(t);
    if (m && MES[m[2]]) { const a = m[3] || new Date(v.publicado).getFullYear(); return `${a}-${String(MES[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
    return dia(v.publicado);
  }
  window.lgtvDataDoVideo = dataDoVideo;
  function sessaoDoVideo(v) {
    const pl = (lsj('lgpl_v1', { sessoes: [] }).sessoes || []); const aj = ajustes()[v.id] || {};
    if (aj.sessao) return pl.find(s => s.id === aj.sessao) || null;
    const d = dataDoVideo(v); const num = /(\d+)\s*[ªa°o]?\s*sess/i.exec(v.titulo || '');
    return pl.find(s => dia(s.quando) === d) || (num ? pl.find(s => String(s.numero) === num[1] && new Date(s.quando).getFullYear() === new Date(v.publicado).getFullYear()) : null) || null;
  }
  window.lgtvVideoDaSessao = function (s) { return videos().find(v => { const x = sessaoDoVideo(v); return x && x.id === s.id; }) || null; };

  /* ---------- resumo automático ---------- */
  function limparDescricao(t) {
    return String(t || '').split('\n').filter(l => !/^\s*(\d{1,2}:)?\d{1,2}:\d{2}\b/.test(l) && !/https?:\/\//i.test(l) && !/^\s*#/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function capitulos(t) {
    return String(t || '').split('\n').map(l => /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—]?\s*(.+)$/.exec(l)).filter(Boolean).map(m => { const p = m[1].split(':').map(Number); const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; return { t: m[1], s, nome: m[2].trim() }; });
  }
  function resumoSistema(s) {
    if (!s) return '';
    const prots = lsj('legislagov_protocolos_v2_neves-paulista-sp', []) || []; const comp = lsj('lgv_camara_v1', { vereadores: [] });
    const pres = Object.keys(s.presenca || {}).length, total = (comp.vereadores || []).length || 9;
    const vot = s.itens.filter(i => i.status === 'votado'), adi = s.itens.filter(i => ['adiado', 'retirado'].includes(i.status));
    const item = i => { const p = prots.find(x => x.id === i.pid) || {}; return `${p.numero || ''} (${(p.ementa || '').replace(/\.$/, '')}) — ${String(i.resultado || '').toLowerCase()}${i.placar ? ` por ${i.placar.sim} a ${i.placar.nao}` : ''}`; };
    let t = `A ${s.titulo} foi realizada em ${dBR(s.quando)}${pres ? `, com ${pres} dos ${total} vereadores presentes` : ''}.`;
    if (vot.length) t += ` ${vot.length === 1 ? 'Foi votada uma matéria' : `Foram votadas ${vot.length} matérias`}: ${vot.map(item).join('; ')}.`;
    else if (s.itens.length && s.status !== 'encerrada') t += s.itens.length === 1 ? ' Há uma matéria na pauta.' : ` Estão na pauta ${s.itens.length} matérias.`;
    if (adi.length) t += adi.length === 1 ? ' Um item ficou para a próxima sessão.' : ` ${adi.length} itens ficaram para a próxima sessão.`;
    return t;
  }
  function resumo(v) { const aj = ajustes()[v.id] || {}; if (aj.resumo) return aj.resumo; const s = sessaoDoVideo(v); const d = limparDescricao(v.descricao); return [resumoSistema(s), d].filter(Boolean).join('\n\n') || 'Gravação publicada no canal oficial da Câmara no YouTube.'; }
  window.lgtvResumo = resumo;

  /* ---------- notícias automáticas ---------- */
  window.lgtvNoticias = function () {
    if (cfg().youtubeNoticias === false) return [];
    return videos().map(v => ({ id: 'yt-' + v.id, data: dataDoVideo(v), titulo: v.titulo, categoria: 'TV Câmara', resumo: resumo(v).split('\n')[0].slice(0, 240), corpo: '', capa: { local: v.thumb, remoto: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` }, fotos: [], destaque: false, origem: 'youtube', link: 'video.html?v=' + encodeURIComponent(v.id) }));
  };

  /* ---------- player ---------- */
  const embed = (id, ini) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1${ini ? '&start=' + ini : ''}`;
  window.lgtvTocar = function (el, id, ini) { el.closest('.tv-video').innerHTML = `<iframe src="${embed(id, ini)}&autoplay=1" title="Vídeo da sessão" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`; };
  const capa = v => `<div class="tv-video"><button type="button" class="tv-play" onclick="lgtvTocar(this,'${E(v.id)}')" aria-label="Assistir: ${E(v.titulo)}"><img src="${E(v.thumb)}" alt="" loading="lazy"><span class="tv-btn">${I('video')}<b>Assistir</b></span></button></div>`;

  /* ---------- TV Câmara (capa, sessões, página TV) ---------- */
  function cartaoTV(el) {
    const l = videos(); if (!el) return;
    if (!l.length) { el.innerHTML = `<div class="tela">${typeof img === 'function' ? img('brasao', '') : ''}<h3>TV Câmara</h3><p>As sessões ordinárias acontecem às segundas-feiras, às 20h. Assista às gravações no canal oficial.</p><a class="btn btn-ouro" href="${E(CANAL())}" target="_blank" rel="noopener">${I('youtube')} Abrir o canal</a></div><div class="rodape-tv"><span>${I('video')} Sessões gravadas</span><a href="${E(CANAL())}/streams" target="_blank" rel="noopener">Transmissões →</a></div>`; return; }
    const v = l[0];
    el.innerHTML = `${capa(v)}<div class="tv-info"><small>${I('video')} TV Câmara · ${dBR(v.publicado)}</small><a href="video.html?v=${encodeURIComponent(v.id)}"><b>${E(v.titulo)}</b></a><p>${E(resumo(v).split('\n')[0].slice(0, 170))}${resumo(v).length > 170 ? '…' : ''}</p></div><div class="rodape-tv"><a href="video.html?v=${encodeURIComponent(v.id)}">Resumo da sessão →</a><a href="pagina.html?p=tv">Todos os vídeos →</a></div>`;
  }
  window.montarTV = function (el) {
    if (!el) return; cartaoTV(el);
    if (el.id === 'tv-pagina') { const l = videos().slice(1, 25); if (l.length) el.insertAdjacentHTML('afterend', `<h2 style="margin-top:28px">Vídeos anteriores</h2><div class="tv-grade">${l.map(v => `<a class="tv-mini" href="video.html?v=${encodeURIComponent(v.id)}"><img src="${E(v.thumb)}" alt="" loading="lazy"><b>${E(v.titulo)}</b><small>${dBR(v.publicado)}</small></a>`).join('')}</div>`); }
  };

  function mdSimples(t) {
    let out = '', lista = false;
    String(t).split('\n').forEach(l => {
      const item = /^\s*[-*•]\s+(.*)$/.exec(l);
      if (item) { if (!lista) { out += '<ul>'; lista = true; } out += `<li>${E(item[1])}</li>`; return; }
      if (lista) { out += '</ul>'; lista = false; }
      if (/^#{1,3}\s*/.test(l)) out += `<h3>${E(l.replace(/^#{1,3}\s*/, ''))}</h3>`; else if (l.trim()) out += `<p>${E(l)}</p>`;
    });
    return out + (lista ? '</ul>' : '');
  }
  /* ---------- página do vídeo ---------- */
  function montarVideo() {
    const app = document.getElementById('video-app'); if (!app) return;
    const v = videos().find(x => x.id === P('v'));
    if (!v) { app.innerHTML = `<div class="cab-pag"><div class="wrap"><nav class="trilha"><a href="index.html">Início</a><span>›</span><a href="pagina.html?p=tv">TV Câmara</a></nav><h1>${dados ? 'Vídeo não encontrado' : 'Carregando…'}</h1></div></div><div class="wrap conteudo"><a class="btn" href="${E(CANAL())}" target="_blank" rel="noopener">Abrir o canal da Câmara</a></div>`; return; }
    document.title = `${v.titulo} — TV Câmara — Câmara Municipal de Neves Paulista`;
    const s = sessaoDoVideo(v); const caps = capitulos(v.descricao); const prots = lsj('legislagov_protocolos_v2_neves-paulista-sp', []) || [];
    const comp = lsj('lgv_camara_v1', { vereadores: [] });
    app.innerHTML = `<div class="cab-pag"><div class="wrap"><nav class="trilha" aria-label="Você está em"><a href="index.html">Início</a><span aria-hidden="true">›</span><a href="pagina.html?p=tv">TV Câmara</a><span aria-hidden="true">›</span><span>Vídeo</span></nav><p class="pp-cab-tipo">TV Câmara · ${dBR(v.publicado)}</p><h1>${E(v.titulo)}</h1></div></div>
      <div class="wrap conteudo pp-det"><div>
        <div class="tv-grande" id="tv-player"><iframe src="${embed(v.id)}" title="${E(v.titulo)}" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
        ${caps.length ? `<h2 class="pp-h2">Capítulos</h2><ol class="tv-caps">${caps.map(c => `<li><button type="button" onclick="lgtvPular(${c.s})"><time>${E(c.t)}</time><span>${E(c.nome)}</span></button></li>`).join('')}</ol>` : ''}
        ${(() => { const a = ajustes()[v.id] || {}; const f = v.fala || {}; const t = a.falaAprovada ? (a.falaTexto || f.resumo || '') : ''; if (!t) return '';
          const html = mdSimples(t);
          return `<h2 class="pp-h2">O que foi falado</h2><div class="tv-resumo tv-fala">${html}<p class="nota">Resumo feito com inteligência artificial a partir das legendas do vídeo e revisado pela Câmara. Na dúvida, vale o vídeo e a ata.</p></div>`; })()}
        <h2 class="pp-h2">Resumo</h2><div class="tv-resumo">${E(resumo(v)).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>
        ${s && s.itens.length ? `<h2 class="pp-h2">Pauta e resultados</h2><ol class="pl-itens">${s.itens.map(i => { const p = prots.find(x => x.id === i.pid) || {}; return `<li><a href="proposituras.html?id=${encodeURIComponent(i.pid)}"><b>${E(p.numero || '')}</b> ${E(p.ementa || '')}</a>${i.resultado ? ` <span class="pl-res ${/Aprovado|derrubado/.test(i.resultado) ? 'ok' : 'er'}">${E(i.resultado)}${i.placar ? ` (${i.placar.sim} × ${i.placar.nao})` : ''}</span>` : ''}${i.nominal && i.nominal.length ? `<details class="pl-nom"><summary>Votos de cada vereador</summary><ul>${i.nominal.map(x => `<li><span>${E(x.nome)}</span><b>${E(x.voto)}</b></li>`).join('')}</ul></details>` : ''}</li>`; }).join('')}</ol>` : ''}
        <div class="acoes"><a class="btn" href="${E(v.url)}" target="_blank" rel="noopener">${I('youtube')} Ver no YouTube</a><a class="btn btn-claro" href="pagina.html?p=tv">${I('esq')} Todos os vídeos</a></div></div>
        <aside class="pp-ficha"><h2>Dados</h2><dl><dt>Publicado</dt><dd>${dBR(v.publicado)}</dd>${v.views != null ? `<dt>Visualizações</dt><dd>${Number(v.views).toLocaleString('pt-BR')}</dd>` : ''}${s ? `<dt>Sessão</dt><dd>${E(s.titulo)}</dd>${Object.keys(s.presenca || {}).length ? `<dt>Presentes</dt><dd>${Object.keys(s.presenca).map(id => E(((comp.vereadores || []).find(x => x.id === id) || {}).nome || '')).join(', ')}</dd>` : ''}` : ''}</dl>
          ${s && s.ata && s.ata.status !== 'rascunho' ? `<button type="button" class="btn btn-claro" onclick="lgcAta && lgcAta('${E(s.id)}')">${I('doc')} Ler a ata</button>` : ''}
          <p class="nota">O resumo é montado automaticamente com os dados da sessão registrados no sistema e a descrição do vídeo.</p></aside></div>`;
  }
  window.lgtvPular = s => { const box = document.getElementById('tv-player'); if (box) { box.innerHTML = `<iframe src="${embed(P('v'), s)}&autoplay=1" title="Vídeo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>`; box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } };

  /* ---------- estilos ---------- */
  const css = document.createElement('style'); css.textContent = `
  .tv-video{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}.tv-video iframe,.tv-grande iframe{width:100%;height:100%;border:0;display:block}
  .tv-play{all:unset;cursor:pointer;display:block;width:100%;height:100%;position:relative}.tv-play img{width:100%;height:100%;object-fit:cover;display:block}
  .tv-btn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:40px;background:rgba(0,0,0,.72);color:#fff;font-weight:700}.tv-btn .ic{width:20px;height:20px}
  .tv-play:hover .tv-btn,.tv-play:focus-visible .tv-btn{background:#c4302b}.tv-play:focus-visible{outline:3px solid var(--ouro,#d4a017);outline-offset:3px}
  .tv-info{padding:12px 4px 4px}.tv-info small{display:flex;gap:6px;align-items:center;color:var(--suave,#6b7280);font-size:12.5px}.tv-info small .ic{width:14px;height:14px}.tv-info a{color:inherit;text-decoration:none}.tv-info b{display:block;margin:4px 0;font-size:16px;line-height:1.3}.tv-info p{margin:0;font-size:14px;color:var(--suave,#4b5563)}
  .tv .rodape-tv{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .tv-grande{aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000;margin-bottom:8px}
  .tv-caps{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px}.tv-caps button{all:unset;cursor:pointer;display:flex;gap:12px;padding:8px 10px;border-radius:8px;width:100%;box-sizing:border-box}.tv-caps button:hover,.tv-caps button:focus-visible{background:var(--creme,#f5f2ea)}.tv-caps time{font-variant-numeric:tabular-nums;font-weight:700;color:#c4302b;min-width:64px}
  .tv-resumo p,.tv-resumo li{font-size:16px;line-height:1.65}.tv-fala{border-left:3px solid var(--ouro,#d4a017);padding-left:16px}.tv-fala h3{font-size:16px;margin:16px 0 6px}
  .tv-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.tv-mini{text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:6px}.tv-mini img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#111}.tv-mini b{font-size:14.5px;line-height:1.3}.tv-mini small{color:var(--suave,#6b7280)}`;
  document.head.appendChild(css);

  /* ---------- início ---------- */
  function redesenhar() {
    ['tv-home', 'tv-sessoes'].forEach(id => { const el = document.getElementById(id); if (el) cartaoTV(el); });
    const tp = document.getElementById('tv-pagina'); if (tp) { tp.nextElementSibling?.classList.contains('tv-grade') && tp.nextElementSibling.remove(); tp.parentNode.querySelectorAll('h2').forEach(h => { if (h.textContent === 'Vídeos anteriores') { h.nextElementSibling?.remove(); h.remove(); } }); montarTV(tp); }
    montarVideo();
    try { if (typeof montarNoticiasHome === 'function') montarNoticiasHome(); if (typeof montarListaNoticias === 'function' && document.getElementById('lista-noticias')) montarListaNoticias(); } catch (e) { }
    try { if (window.lgcMontarPlenario) lgcMontarPlenario(); } catch (e) { }
  }
  document.addEventListener('DOMContentLoaded', () => { montarVideo(); carregar().then(m => { if (m || !document.querySelector('.tv-video')) redesenhar(); }); });
  addEventListener('storage', e => { if ([AJ, 'lgpl_v1', 'lgt_site_cfg_v1'].includes(e.key)) redesenhar(); });
})();
