/* LegislaGov — portfólio: menu com submenus, abas das soluções e o telão de votação da capa */
(function () {
  'use strict';
  const nav = document.getElementById('nav'), bt = document.querySelector('.menu-bt');
  const subs = [...document.querySelectorAll('.tem-sub')];
  const desktop = () => matchMedia('(min-width: 981px)').matches;

  function fechar(exceto) {
    subs.forEach(li => { if (li !== exceto) { li.classList.remove('aberto'); li.querySelector('button').setAttribute('aria-expanded', 'false'); } });
  }
  function abrir(li, on) {
    li.classList.toggle('aberto', on); li.querySelector('button').setAttribute('aria-expanded', on ? 'true' : 'false');
  }

  // menu do celular
  bt.addEventListener('click', () => { const a = nav.classList.toggle('aberta'); bt.setAttribute('aria-expanded', a); if (!a) fechar(); });

  subs.forEach(li => {
    const b = li.querySelector('button');
    b.addEventListener('click', () => { const on = !li.classList.contains('aberto'); fechar(li); abrir(li, on); });
    li.addEventListener('mouseenter', () => { if (desktop()) { fechar(li); abrir(li, true); } });
    li.addEventListener('mouseleave', () => { if (desktop()) abrir(li, false); });
    li.addEventListener('focusout', e => { if (desktop() && !li.contains(e.relatedTarget)) abrir(li, false); });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.tem-sub')) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const li = e.target.closest && e.target.closest('.tem-sub'); fechar();
    if (li) li.querySelector('button').focus();
  });
  // ao escolher um link: fecha tudo (no celular, também o menu)
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { fechar(); nav.classList.remove('aberta'); bt.setAttribute('aria-expanded', 'false'); }));

  // abas das soluções (com endereço direto: solucoes.html#plenario etc.)
  const abas = [...document.querySelectorAll('.aba')];
  if (abas.length) {
    const ATALHO = { plenario: 't1', vereador: 't2', administrativo: 't3', transparencia: 't4', site: 't5', proposituras: 't6' };
    function ativar(t, foco) {
      abas.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
      if (foco) t.focus();
    }
    abas.forEach((t, i) => {
      t.addEventListener('click', () => ativar(t));
      t.addEventListener('keydown', e => {
        const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); ativar(abas[(i + d + abas.length) % abas.length], true); }
      });
    });
    const peloEndereco = () => {
      const id = ATALHO[location.hash.slice(1)]; if (!id) return;
      ativar(document.getElementById(id));
      document.getElementById('sistema').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    peloEndereco(); addEventListener('hashchange', peloEndereco);
  }

  // telão: votação de exemplo (nomes fictícios)
  const ban = document.getElementById('bancada');
  if (ban) {
    const vs = [['Igor Nunes', 'Presidente'], ['Ana Souza', ''], ['Bruno Lima', ''], ['Carla Dias', ''], ['Diego Alves', ''], ['Elisa Rocha', ''], ['Fábio Melo', ''], ['Gisele Prado', ''], ['Hugo Reis', '']];
    const votos = ['sim', 'sim', 'nao', 'sim', 'sim', 'sim', 'nao', 'sim', 'sim'];
    const ordem = [1, 3, 6, 2, 5, 7, 4, 8, 0];
    const ini = n => n.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    ban.innerHTML = vs.map(([n, c], i) => `<div class="ver" id="v${i}"><i>${ini(n)}</i><div>${n}<small>${c || 'aguardando voto'}</small></div></div>`).join('');
    const nS = document.getElementById('n-sim'), nN = document.getElementById('n-nao'), nF = document.getElementById('n-falta'), res = document.getElementById('res');
    const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rodar = () => {
      let s = 0, n = 0, k = 0; res.classList.remove('on');
      vs.forEach((_, i) => { const el = document.getElementById('v' + i); el.className = 'ver'; el.querySelector('small').textContent = vs[i][1] || 'aguardando voto'; });
      nS.textContent = 0; nN.textContent = 0; nF.textContent = 9;
      const passo = () => {
        if (k >= ordem.length) { res.classList.add('on'); if (!reduz) setTimeout(rodar, 6000); return; }
        const i = ordem[k++], v = votos[i], el = document.getElementById('v' + i);
        el.classList.add(v); el.querySelector('small').textContent = (vs[i][1] ? vs[i][1] + ' · ' : '') + (v === 'sim' ? 'votou sim' : 'votou não');
        if (v === 'sim') s++; else n++;
        nS.textContent = s; nN.textContent = n; nF.textContent = 9 - s - n;
        setTimeout(passo, reduz ? 0 : 650);
      };
      setTimeout(passo, reduz ? 0 : 900);
    };
    rodar();
  }
})();
