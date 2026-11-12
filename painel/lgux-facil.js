/* =====================================================================
   LegislaGov — MENU DO DIA A DIA (e barra de atalhos no celular)
   · No topo do menu ficam só as telas que cada cargo usa todo dia ("Dia a dia").
   · O resto vai para "Mais opções", que abre com um clique (e fica aberto se a pessoa preferir).
   · No celular, uma barra fixa embaixo com 4 atalhos do cargo + "Menu".
   ===================================================================== */
(function () {
  'use strict';
  const FAV = {
    secretaria: ['inicio', 'pendencias', 'protocolo', 'materias', 'sessoes', 'expedientes', 'oficios', 'ouvidoria'],
    procurador: ['inicio', 'pendencias', 'materias', 'prazos', 'comissoes', 'usuarios', 'acessos'],
    adm: ['inicio', 'pendencias', 'materias', 'protocolo', 'sessoes', 'usuarios', 'acessos'],
    padrao: ['inicio', 'pendencias', 'materias', 'sessoes', 'expedientes'],
    vereador: ['verInicio', 'pendencias', 'verAssinar', 'verProposituras', 'verSessoes', 'verComissoes'],
    presidente: ['verInicio', 'pendencias', 'verAssinar', 'presDespacho', 'presSessao', 'presAutografos', 'verProposituras'],
    transparencia: ['pendencias', 'transp', 'calendario', 'pntp'],
    site: ['pendencias', 'siteNoticias'],
  };
  // atalhos da barra do celular (4 + Menu)
  const BARRA = {
    secretaria: ['inicio', 'pendencias', 'protocolo', 'materias'],
    procurador: ['inicio', 'pendencias', 'materias', 'prazos'],
    adm: ['inicio', 'pendencias', 'materias', 'acessos'],
    padrao: ['inicio', 'pendencias', 'materias', 'sessoes'],
    vereador: ['verInicio', 'pendencias', 'verAssinar', 'verSessoes'],
    presidente: ['verInicio', 'pendencias', 'verAssinar', 'presSessao'],
    transparencia: ['pendencias', 'transp', 'calendario', 'pntp'],
    site: ['pendencias', 'siteNoticias'],
  };
  const CURTO = { inicio: 'Início', verInicio: 'Início', pendencias: 'Pendências', protocolo: 'Protocolo', materias: 'Matérias', sessoes: 'Agenda', prazos: 'Prazos',
    acessos: 'Acessos', verAssinar: 'Assinar', verSessoes: 'Sessões', presSessao: 'Plenário', transp: 'Publicar', calendario: 'Calendário', pntp: 'PNTP', siteNoticias: 'Notícias' };

  // nomes mais claros no menu
  try {
    const A = window.LG_AREAS || {};
    const renomear = { leis: 'Leis no sistema anterior', usuariosProto: 'Contatos da Câmara', ia: 'LegislaIA (assistente)' };
    Object.values(A).forEach(a => a.menu.forEach(([, itens]) => itens.forEach(i => { if (renomear[i[0]]) i[1] = renomear[i[0]]; })));
  } catch (e) { }

  const area = () => { try { return sessionStorage.getItem('lg_area') || 'legislativo'; } catch (e) { return 'legislativo'; } };
  function papel() {
    const a = area();
    if (a === 'vereador') return window.lgEhPresidente && lgEhPresidente() ? 'presidente' : 'vereador';
    if (a === 'transparencia' || a === 'site') return a;
    const p = window.lgPerfil ? lgPerfil() : '';
    return FAV[p] ? p : 'padrao';
  }
  const visivel = el => el && el.style.display !== 'none' && !el.hidden && getComputedStyle(el).display !== 'none';
  let maisAberto = false; try { maisAberto = localStorage.getItem('lgux_mais') === '1'; } catch (e) { }

  function organizar() {
    const nav = document.querySelector('nav.lgv31-nav'); if (!nav || nav.querySelector('.lgux-mais')) return;
    const itens = [...nav.querySelectorAll('.lgv31-item')]; if (!itens.length) return;
    const fav = FAV[papel()] || [];
    const porChave = k => itens.find(i => i.dataset.v31 === k && visivel(i));
    const doDia = fav.map(porChave).filter(Boolean);
    if (!doDia.length) return;
    const resto = [...nav.children].filter(el => !doDia.includes(el));
    const contResto = resto.filter(el => el.classList.contains('lgv31-item') && visivel(el)).length;
    if (contResto < 3) return;   // menu curto: deixa como está
    const g = document.createElement('div'); g.className = 'lgv31-group'; g.textContent = 'Dia a dia';
    const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'lgux-mais'; bt.setAttribute('aria-controls', 'lgux-mais-box');
    const box = document.createElement('div'); box.className = 'lgux-mais-box'; box.id = 'lgux-mais-box';
    resto.forEach(el => box.appendChild(el));
    // grupos que ficaram vazios (todos os itens escondidos) não aparecem
    [...box.querySelectorAll('.lgv31-group')].forEach(h => { let n = h.nextElementSibling, tem = false; while (n && !n.classList.contains('lgv31-group')) { if (visivel(n)) tem = true; n = n.nextElementSibling; } if (!tem) h.classList.add('lgux-vazio'); });
    nav.dataset.lguxPapel = papel();
    nav.prepend(g); doDia.forEach(el => nav.appendChild(el)); nav.appendChild(bt); nav.appendChild(box);
    const ativo = box.querySelector('.lgv31-item.active');
    const abrir = on => { box.hidden = !on; bt.setAttribute('aria-expanded', on); bt.innerHTML = `<span>${on ? 'Menos opções' : 'Mais opções'}</span><b>${on ? '' : contResto}</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`; };
    abrir(maisAberto || !!ativo);
    bt.onclick = () => { maisAberto = box.hidden; try { localStorage.setItem('lgux_mais', maisAberto ? '1' : '0'); } catch (e) { } abrir(maisAberto); };
    barra();
  }

  /* barra de atalhos no celular */
  function barra() {
    let el = document.getElementById('lgux-barra');
    const app = document.getElementById('app'); const logado = app && getComputedStyle(app).display !== 'none';
    if (!logado) { if (el) el.remove(); document.documentElement.classList.remove('lgux-com-barra'); return; }
    const chaves = (BARRA[papel()] || []).filter(k => document.querySelector(`.lgv31-item[data-v31="${k}"]`));
    const assin = papel() + ':' + chaves.join(',');
    if (!el) { el = document.createElement('nav'); el.id = 'lgux-barra'; el.setAttribute('aria-label', 'Atalhos'); document.body.appendChild(el); }
    if (el.dataset.a !== assin) {
      el.dataset.a = assin;
      el.innerHTML = chaves.map(k => { const it = document.querySelector(`.lgv31-item[data-v31="${k}"]`); const svg = it.querySelector('svg'); const txt = CURTO[k] || it.textContent.trim();
        return `<button type="button" data-k="${k}">${svg ? svg.outerHTML : ''}<span>${txt}</span>${k === 'pendencias' ? '<b class="lgux-n" hidden></b>' : ''}</button>`; }).join('') +
        `<button type="button" data-k="__menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span></button>`;
      el.querySelectorAll('button').forEach(b => b.onclick = () => { const k = b.dataset.k; if (k === '__menu') { window.lgv31Menu && lgv31Menu(true); return; } window.lgv31Go && lgv31Go(k); window.scrollTo({ top: 0 }); marcar(); });
    }
    document.documentElement.classList.add('lgux-com-barra');
    marcar();
  }
  function marcar() {
    const el = document.getElementById('lgux-barra'); if (!el) return;
    const ativo = (document.querySelector('.lgv31-item.active') || {}).dataset?.v31;
    el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === ativo));
    const n = el.querySelector('.lgux-n'); if (n) { let c = 0; try { c = window.lgavContagem ? lgavContagem() : 0; } catch (e) { } n.hidden = !c; n.textContent = c > 99 ? '99+' : c; }
  }

  const css = document.createElement('style'); css.textContent = `
  .lgux-mais{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;margin:10px 0 2px;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:600;color:var(--lg28-muted,#9a9fa6);cursor:pointer}
  .lgux-mais:hover{background:rgba(255,255,255,.05);color:var(--lg28-ink,#f3f4f6)}
  .lgux-mais:focus-visible{outline:2px solid #e2aa1c;outline-offset:2px}
  .lgux-mais span{flex:1}.lgux-mais b{font-size:11.5px;padding:1px 7px;border-radius:999px;background:rgba(255,255,255,.08)}
  .lgux-mais b:empty{display:none}
  .lgux-mais svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;transition:transform .15s}
  .lgux-mais[aria-expanded=true] svg{transform:rotate(180deg)}
  .lgux-vazio{display:none!important}
  .lgux-rodape{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 18px;margin:36px 16px 18px;padding-top:16px;border-top:1px solid var(--lg28-stroke,rgba(255,255,255,.1));font:12px/1.6 system-ui,sans-serif;color:var(--lg28-muted,#8e9198);text-align:center}
  .lgux-rodape a{color:inherit;text-decoration:none}.lgux-rodape a:hover{text-decoration:underline;color:var(--lg28-ink,#f3f4f6)}
  .lgux-rodape b{font-weight:800;color:var(--lg28-ink,#f3f4f6)}.lgux-rodape b i{font-style:normal;color:#2bb3e8}
  #lgux-barra{display:none}
  @media (max-width:820px){
    html.lgux-com-barra #lgux-barra{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;position:fixed;left:0;right:0;bottom:0;z-index:9000;background:rgba(10,10,12,.96);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-top:1px solid #23252a;padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
    #lgux-barra button{all:unset;position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border-radius:10px;color:#9a9fa6;font:600 11px system-ui,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent}
    #lgux-barra button.on{color:#fff;background:rgba(255,255,255,.07)}
    #lgux-barra svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    #lgux-barra span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #lgux-barra .lgux-n{position:absolute;top:2px;left:calc(50% + 6px);min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#e5484d;color:#fff;font-size:10.5px;line-height:17px;text-align:center}
    html.lgux-com-barra body{padding-bottom:calc(70px + env(safe-area-inset-bottom))}
    html.lgux-com-barra #lgapp-faixa{bottom:calc(76px + env(safe-area-inset-bottom))}
    html.lgux-com-barra #lgsync-status{bottom:calc(80px + env(safe-area-inset-bottom))}
  }`;
  document.head.appendChild(css);

  // rodapé com o site da LegislaGov no fim de todas as telas (também no celular e no app)
  function rodape() {
    const main = document.querySelector('#app > main') || document.querySelector('#app main'); if (!main || main.querySelector(':scope > .lgux-rodape')) return;
    const u = 'https://legislagov.com.br', ln = (h, t) => `<a href="${u}${h}" target="_blank" rel="noopener">${t}</a>`;
    main.insertAdjacentHTML('beforeend', `<footer class="lgux-rodape"><span>Desenvolvido por ${ln('/', '<b>Legisla<i>Gov</i></b>')} · ${ln('/', 'legislagov.com.br')}</span><span>Conheça também: ${ln('/produtos.html#site', 'Site e Transparência')} · ${ln('/produtos.html#email', 'E-mail institucional')} · ${ln('/produtos.html#app', 'App no celular')}</span></footer>`);
  }

  function iniciar() {
    const nav = document.querySelector('nav.lgv31-nav');
    if (nav && !nav.__lgux) { nav.__lgux = true; new MutationObserver(() => { if (!nav.querySelector('.lgux-mais')) setTimeout(organizar, 0); marcar(); }).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); }
    if (nav && nav.dataset.lguxPapel && nav.dataset.lguxPapel !== papel() && window.lgv33Render) { lgv33Render(); return; }   // entrou outro usuário
    organizar(); barra(); rodape();
  }
  // o Treinamento aponta itens do menu: abre "Mais opções" durante o tour
  const abrirMais = () => { const bt = document.querySelector('.lgux-mais'), box = document.getElementById('lgux-mais-box'); if (bt && box && box.hidden) bt.click(); };
  const t0 = setInterval(() => { if (typeof window.lgtrAbrir === 'function' && !window.lgtrAbrir.__lgux) { const f = window.lgtrAbrir; window.lgtrAbrir = function () { abrirMais(); return f.apply(this, arguments); }; window.lgtrAbrir.__lgux = true; clearInterval(t0); } }, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 400)); else setTimeout(iniciar, 400);
  setInterval(() => { iniciar(); }, 2000);   // depois de entrar, trocar de painel ou de usuário
})();
