/* LegislaGov — aviso de "Carregando…" e "Concluído" em todos os sistemas.
   1) Automático: quando a pessoa clica em algo e o servidor demora mais de meio segundo para responder,
      aparece "Carregando…"; quando termina, "Concluído" (ou "Não foi concluído") e some sozinho.
      Atualizações em segundo plano (sincronia, GPS, conferências periódicas) não mostram nada.
   2) Manual, para tarefas pesadas feitas no próprio aparelho (relatórios, planilhas, PDFs):
      lgCarregando('Gerando relatório…', () => trabalho(), 'Relatório pronto')                         */
(function () {
  if (window.lgCarregando) return;
  var FUNDO = /\/(mudancas|aovivo|posicoes|trajeto|gravar|sync|ping|eventos|inicio|dados|doc)\b|\/api\/central\/(rest|licenca)/;
  var falhou = null, ultimo = 0, pend = 0, timer = null, vis = false, manual = 0, el = null, saida = null;
  addEventListener('pointerdown', function () { ultimo = Date.now(); }, true);
  addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || /^F\d+$/.test(e.key)) ultimo = Date.now(); }, true);

  var css = document.createElement('style');
  css.textContent = '#lgCarr{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.18);backdrop-filter:blur(1.5px)}' +
    '#lgCarr.on{display:flex}#lgCarr.fim{background:transparent;backdrop-filter:none;pointer-events:none}' +
    '#lgCarr .lgc-cx{display:flex;align-items:center;gap:14px;min-width:220px;max-width:min(90vw,420px);background:#fff;color:#111827;border:1px solid #e3e7ed;border-radius:16px;padding:16px 22px;box-shadow:0 18px 50px rgba(16,24,40,.22);font:600 15.5px/1.35 Inter,"Segoe UI",system-ui,sans-serif;animation:lgcIn .16s ease-out}' +
    '#lgCarr .lgc-sp{flex:none;width:26px;height:26px;border-radius:50%;border:3px solid #e5e7eb;border-top-color:#334155;animation:lgcGira .8s linear infinite}' +
    '#lgCarr.ok .lgc-sp,#lgCarr.erro .lgc-sp{animation:none;border:0;display:grid;place-items:center;color:#fff;background:#16a34a}' +
    '#lgCarr.erro .lgc-sp{background:#dc2626}' +
    '#lgCarr.ok .lgc-sp::after{content:"";width:9px;height:15px;border:solid #fff;border-width:0 3px 3px 0;transform:translateY(-2px) rotate(45deg)}' +
    '#lgCarr.erro .lgc-sp::after{content:"!";font:800 17px/1 system-ui}' +
    '#lgCarr .lgc-tx small{display:block;font-weight:500;font-size:13px;color:#6b7280;margin-top:2px}' +
    '@keyframes lgcGira{to{transform:rotate(360deg)}}@keyframes lgcIn{from{opacity:0;transform:translateY(6px) scale(.98)}}' +
    '@media (prefers-reduced-motion:reduce){#lgCarr .lgc-sp{animation-duration:2s}#lgCarr .lgc-cx{animation:none}}' +
    '@media (prefers-color-scheme:dark){#lgCarr .lgc-cx{background:#161b22;color:#e6edf3;border-color:#2d333b}#lgCarr .lgc-sp{border-color:#30363d;border-top-color:#e6edf3}}' +
    '@media print{#lgCarr{display:none!important}}' +
    '[data-theme=dark] #lgCarr .lgc-cx,[data-tema=escuro] #lgCarr .lgc-cx{background:#161b22;color:#e6edf3;border-color:#2d333b}';
  (document.head || document.documentElement).appendChild(css);

  function caixa() {
    if (el) return el;
    el = document.createElement('div'); el.id = 'lgCarr'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="lgc-cx"><span class="lgc-sp" aria-hidden="true"></span><span class="lgc-tx"></span></div>';
    document.body.appendChild(el); return el;
  }
  function texto(t, sub) { var x = caixa().querySelector('.lgc-tx'); x.textContent = t; if (sub) { var s = document.createElement('small'); s.textContent = sub; x.appendChild(s); } }
  function mostrar(t, sub) { clearTimeout(saida); caixa().className = 'on'; texto(t || 'Carregando…', sub || 'Aguarde um instante'); vis = true; }
  function concluir(t, erro) {
    if (!vis) return; clearTimeout(saida);
    el.className = 'on fim ' + (erro ? 'erro' : 'ok'); texto(t || (erro ? 'Não foi concluído' : 'Concluído'));
    saida = setTimeout(function () { el.className = ''; vis = false; }, erro ? 2200 : 1200);
  }

  var f0 = window.fetch;
  if (f0) window.fetch = function (u, o) {
    var url = String((u && u.url) || u || '');
    if (Date.now() - ultimo > 1500 || FUNDO.test(url)) return f0.apply(this, arguments);
    pend++;
    if (!timer && !vis) timer = setTimeout(function () { timer = null; if (pend > 0 && !manual) mostrar(); }, 500);
    function fim(ok, msg) {
      pend = Math.max(0, pend - 1);
      if (!ok) falhou = msg || falhou || 'Não foi concluído';
      if (pend === 0) { clearTimeout(timer); timer = null; var f = falhou; falhou = null; if (vis && !manual) concluir(f, !!f); }
    }
    return f0.apply(this, arguments).then(function (r) {
      /* erro de verdade: 4xx/5xx, ou resposta JSON com ok:false (ex.: usuário ou senha errados) */
      var login = /login|entrar|senha/i.test(url), msgErr = function (d) { return (d && (d.erro || d.mensagem)) || (login && (r.status === 401 || r.status === 403) ? 'Usuário ou senha incorretos' : 'Não foi concluído'); };
      var ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      if (/json/i.test(ct)) r.clone().json().then(function (d) { var bad = !r.ok || (d && d.ok === false); fim(!bad, bad ? msgErr(d) : null); }, function () { fim(r.ok, r.ok ? null : msgErr()); });
      else fim(r.ok, r.ok ? null : msgErr());
      return r; }, function (e) { fim(false, 'Sem conexão com o servidor'); throw e; });
  };

  window.lgCarregando = function (t, fn, pronto) {
    manual++; mostrar(t);
    return new Promise(function (ok) { requestAnimationFrame(function () { setTimeout(ok, 40); }); })
      .then(function () { return fn(); })
      .then(function (r) { manual--; concluir(pronto || 'Concluído'); return r; },
            function (e) { manual--; concluir('Não foi concluído', true); throw e; });
  };
})();
