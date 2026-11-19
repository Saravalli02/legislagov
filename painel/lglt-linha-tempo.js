/* =====================================================================
   LegislaGov — LINHA DO TEMPO (registro de atividades)
   Junta, numa linha do tempo por dia:
   · o registro do servidor (entradas, senhas erradas, bloqueios, contas, senhas)  → lg_registro_srv_v1
   · o registro das telas (publicações, protocolos, relatórios, recibos, site…)    → legislagov_audit_v1
   Filtros: período, tipo, usuário, atividade e origem; busca; imprimir; detalhe de cada registro.
   Só o administrador do sistema vê (o servidor só manda esses registros a ele).
   ===================================================================== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const UI = () => window.lgtUI;
  const atual = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const p2 = n => String(n).padStart(2, '0');
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /* código curto de cada registro (para citar num chamado ou ofício) */
  const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  function codigo(s) { let h1 = 0x811c9dc5, h2 = 0x1b873593; for (const ch of String(s)) { const c = ch.charCodeAt(0); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); } let n = (BigInt(h1 >>> 0) << 32n) | BigInt(h2 >>> 0), o = ''; for (let i = 0; i < 10; i++) { o += B62[Number(n % 62n)]; n /= 62n; } return o; }

  /* frases do registro do servidor */
  const FRASE = {
    'Login': ['entrou', 'no sistema'], 'Login recusado': ['errou a senha', 'ao entrar'], 'Login recusado (conta bloqueada)': ['tentou entrar', 'com a conta bloqueada'],
    'Conta bloqueada': ['bloqueou', 'uma conta por senhas erradas'], 'Senha trocada': ['trocou', 'a própria senha'], 'Senha nova criada pelo administrador': ['criou', 'uma senha nova para um usuário'],
    'Usuário criado': ['criou', 'um usuário'], 'Pedido de cadastro': ['pediu', 'cadastro no sistema'], 'E-mail de recuperação atualizado': ['atualizou', 'o e-mail de recuperação'],
    'Dados da conta atualizados': ['atualizou', 'os dados da conta'], 'Esqueci a senha: link enviado': ['pediu', 'link para criar senha nova'], 'Esqueci a senha: sem e-mail cadastrado': ['pediu', 'senha nova (sem e-mail cadastrado)'],
    'Endereço bloqueado': ['bloqueou', 'um endereço de internet'], 'Endereço desbloqueado': ['desbloqueou', 'um endereço de internet'], 'Alerta de segurança': ['emitiu', 'um alerta de segurança'],
    'Gravação recusada': ['recusou', 'uma gravação sem permissão'], 'Número de protocolo': ['gerou', 'um número de protocolo'], 'Login realizado': ['entrou', 'no sistema'],
  };
  const TIPOS = [
    ['Acesso', /^login$|^login realizado|entrou|saiu|sess/i, 'acessos'],
    ['Segurança', /recusad|bloque|senha|alerta|endere[cç]o|tentativa/i, 'cadeado'],
    ['Conta e usuários', /usu[aá]rio|cadastro|conta|perfil|e-mail|acesso/i, 'usuarios'],
    ['Publicação', /publi|site|transpar|not[ií]cia|destaque|imagem|v[ií]deo/i, 'site'],
    ['Documento', /protocolo|recibo|relat[oó]rio|of[ií]cio|expediente|ata\b|lei\b|assin|parecer|mat[eé]ria|proposi/i, 'protocolo'],
  ];
  const tipoDe = t => { for (const [n, re] of TIPOS) if (re.test(t)) return n; return 'Outras ações'; };
  const iconeDe = t => (TIPOS.find(x => x[0] === t) || [, , 'check'])[2];

  function eventos() {
    const nomes = {}; ler('legislagov_audit_v1', []).forEach(x => { if (x && x.email && x.usuario) nomes[String(x.email).toLowerCase()] = x.usuario; });
    ler('legislagov_users_v1', []).forEach(u => { if (u && u.usuario && u.nome && u.nome !== u.usuario) nomes[String(u.usuario).toLowerCase()] = u.nome; });
    const nomeDe = l => nomes[String(l || '').toLowerCase()] || l || 'Sistema';
    const out = [];
    ler('lg_registro_srv_v1', []).forEach(x => {
      if (!x || !x.quando) return; const f = FRASE[x.acao]; const sist = String(x.usuario || '') === 'sistema';
      out.push({ cod: codigo('s' + x.id + x.quando), t: Date.parse(x.quando), quem: sist ? 'Sistema' : nomeDe(x.usuario), login: sist ? '' : x.usuario, verbo: f ? f[0] : '', objeto: f ? f[1] : x.acao,
        detalhe: x.detalhe || '', atividade: x.acao, tipo: tipoDe(x.acao), origem: 'Servidor', ip: x.ip || '' });
    });
    ler('legislagov_audit_v1', []).forEach(x => {
      if (!x || !x.acao) return;
      let t = Date.parse(x.registradoEm || ''); if (isNaN(t)) { const n = parseInt(String(x.id || ''), 10); t = n > 1e12 ? n : NaN; }
      if (isNaN(t)) { const m = /^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})(?::(\d{2}))?/.exec(x.data || ''); if (m) t = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime(); }
      if (isNaN(t)) return;
      const acao = String(x.acao); const f = FRASE[acao];
      out.push({ cod: codigo('a' + x.id), t, quem: x.usuario || nomeDe(x.email), login: x.email || '', verbo: f ? f[0] : '', objeto: f ? f[1] : acao,
        detalhe: x.detalhes && x.detalhes !== '—' ? x.detalhes : '', atividade: acao, tipo: tipoDe(acao), origem: 'Telas do sistema', ip: '' });
    });
    // a tela também registra a entrada: quando o servidor já registrou a mesma entrada (até 2 min), fica só a do servidor
    const entradas = out.filter(e => e.origem === 'Servidor' && e.atividade === 'Login');
    return out.filter(e => !(e.origem !== 'Servidor' && /^Login realizado$/.test(e.atividade) && entradas.some(s => String(s.login).toLowerCase() === String(e.login).toLowerCase() && Math.abs(s.t - e.t) < 120000)))
      .sort((a, b) => b.t - a.t);
  }

  /* ---------------- filtros ---------------- */
  const est = { per: '24h', tipo: '', quem: '', ativ: '', origem: '', q: '', lim: 200 };
  const PER = [['24h', 'Últimas 24 horas'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['mes', 'Este mês'], ['ano', 'Este ano'], ['tudo', 'Tudo']];
  function desde() { const d = new Date(); switch (est.per) { case '24h': return Date.now() - 864e5; case '7d': return Date.now() - 7 * 864e5; case '30d': return Date.now() - 30 * 864e5; case 'mes': return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); case 'ano': return new Date(d.getFullYear(), 0, 1).getTime(); default: return 0; } }
  const semAc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function filtrados(todos) {
    const d0 = desde(), q = semAc(est.q.trim());
    return todos.filter(e => e.t >= d0 && (!est.tipo || e.tipo === est.tipo) && (!est.quem || e.quem === est.quem) && (!est.ativ || e.atividade === est.ativ) && (!est.origem || e.origem === est.origem)
      && (!q || semAc([e.quem, e.login, e.verbo, e.objeto, e.detalhe, e.atividade, e.ip, '#' + e.cod].join(' ')).includes(q)));
  }

  /* ---------------- tela ---------------- */
  function criarView() {
    if ($('#view-lglt')) return;
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main) return;
    main.insertAdjacentHTML('beforeend', '<section class="view lgt lglt" id="view-lglt" style="display:none"></section>');
    const nav = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    if (nav) { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lglt'; b.hidden = true; b.style.display = 'none'; nav.appendChild(b); }
  }
  window.lgltPode = () => { const u = atual(); if (!u) return false; try { return (window.lgPerfil ? lgPerfil(u) : '') === 'adm'; } catch (e) { return false; } };
  window.lgltAbrir = function () {
    if (!lgltPode()) { UI() ? UI().aviso('A linha do tempo é do administrador do sistema.', 'erro') : alert('A linha do tempo é do administrador do sistema.'); return; }
    criarView();
    if (typeof gotoShared === 'function') gotoShared('lglt'); else { document.querySelectorAll('section.view').forEach(s => s.style.display = 'none'); $('#view-lglt').style.display = 'block'; }
    if (window.lgv31Mark) lgv31Mark('linhaTempo');
    scrollTo(0, 0); desenhar();
  };
  let cache = [];
  const sel = (id, rot, val, ops) => `<label class="lglt-f"><span>${rot}:</span><select id="${id}"><option value="">Todos</option>${ops.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  function desenhar() {
    const el = $('#view-lglt'); if (!el) return;
    const todos = eventos(); const l = filtrados(todos); cache = l;
    const uniq = k => [...new Set(todos.map(e => e[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    let html = '', dia = '';
    l.slice(0, est.lim).forEach((e, i) => {
      const d = new Date(e.t), k = d.toDateString();
      if (k !== dia) { if (dia) html += '</ol>'; dia = k; html += `<h2 class="lglt-dia">${ic('calendario')}${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}</h2><ol class="lglt-lista">`; }
      html += `<li class="lglt-ev t-${esc(iconeDe(e.tipo))}${/recusad|bloque|alerta/i.test(e.atividade) ? ' lglt-alerta' : ''}">
        <div class="lglt-hora"><time datetime="${new Date(e.t).toISOString()}">${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}</time><code>#${e.cod}</code></div>
        <span class="lglt-ic" aria-hidden="true">${ic(iconeDe(e.tipo))}</span>
        <div class="lglt-txt"><p><b>${esc(e.quem)}</b> ${e.verbo ? `<strong>${esc(e.verbo)}</strong> ${esc(e.objeto)}` : `— ${esc(e.objeto)}`}</p><small>${esc([e.login && e.login !== e.quem ? '@' + e.login : '', e.detalhe, e.ip ? 'endereço ' + e.ip : ''].filter(Boolean).join(' · ')) || esc(e.tipo)}</small></div>
        <button type="button" class="lglt-ver" onclick="lgltVer(${i})" aria-label="Ver detalhes do registro #${e.cod}" title="Ver detalhes">${ic('lista')}</button></li>`;
    });
    if (dia) html += '</ol>';
    el.innerHTML = `
      <div class="letterhead lglt-cab"><div><h1>Linha do tempo</h1><div class="date">Tudo o que aconteceu no sistema: entradas, senhas erradas, publicações, protocolos, relatórios e mudanças de conta.</div></div>
        <div class="lglt-acoes"><button type="button" class="lgt-btn" onclick="lgltImprimir()" title="Imprimir">${ic('externo')}Imprimir</button><button type="button" class="lgt-btn" onclick="lgltAbrir()" title="Atualizar">Atualizar</button></div></div>
      <div class="lglt-filtros" role="group" aria-label="Filtrar">
        <b class="lglt-rot">Filtrar por</b>
        <label class="lglt-f"><span>Período:</span><select id="lglt-per">${PER.map(([k, t]) => `<option value="${k}" ${est.per === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${sel('lglt-tipo', 'Tipo', est.tipo, uniq('tipo'))}${sel('lglt-quem', 'Usuário', est.quem, uniq('quem'))}${sel('lglt-ativ', 'Atividade', est.ativ, uniq('atividade'))}${sel('lglt-ori', 'Origem', est.origem, uniq('origem'))}
        <label class="lglt-busca"><span class="lgt-sr">Pesquisar</span><input type="search" id="lglt-q" placeholder="Pesquisar nome, ação, código…" value="${esc(est.q)}" autocomplete="off"></label>
      </div>
      <p class="lglt-total" role="status">${l.length ? `${l.length} registro${l.length === 1 ? '' : 's'}${l.length > est.lim ? `, mostrando os ${est.lim} mais recentes` : ''}` : 'Nenhum registro com esses filtros.'}</p>
      <div class="lglt-corpo">${html}</div>
      ${l.length > est.lim ? '<div class="lglt-mais"><button type="button" class="lgt-btn" onclick="lgltMais()">Mostrar mais</button></div>' : ''}`;
    const liga = (id, k) => { const s = $('#' + id); if (s) s.onchange = () => { est[k] = s.value; est.lim = 200; desenhar(); $('#' + id).focus(); }; };
    liga('lglt-per', 'per'); liga('lglt-tipo', 'tipo'); liga('lglt-quem', 'quem'); liga('lglt-ativ', 'ativ'); liga('lglt-ori', 'origem');
    const q = $('#lglt-q'); q.oninput = () => { est.q = q.value; const p = q.selectionStart; desenhar(); const n = $('#lglt-q'); n.focus(); try { n.setSelectionRange(p, p); } catch (e) { } };
  }
  window.lgltMais = () => { est.lim += 200; desenhar(); };
  window.lgltVer = function (i) {
    const e = cache[i]; if (!e || !UI()) return; const d = new Date(e.t);
    const linha = (r, v) => v ? `<tr><th>${r}</th><td>${esc(v)}</td></tr>` : '';
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Registro #${esc(e.cod)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgt-campos"><table class="lgt-tabela lglt-det"><tbody>
        ${linha('Data', d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }))}${linha('Hora', d.toLocaleTimeString('pt-BR'))}
        ${linha('Quem', e.quem)}${linha('Usuário', e.login)}${linha('Atividade', e.atividade)}${linha('Detalhe', e.detalhe)}${linha('Tipo', e.tipo)}${linha('Origem', e.origem === 'Servidor' ? 'Servidor (registrado automaticamente)' : 'Telas do sistema')}${linha('Endereço de internet (IP)', e.ip)}${linha('Código', '#' + e.cod)}
      </tbody></table><p class="lglt-nota">O registro não pode ser apagado nem alterado. Para citar este evento num ofício ou chamado, use o código #${esc(e.cod)}.</p></div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Fechar</button></div></div>`);
  };
  window.lgltImprimir = function () {
    const l = cache.slice(0, 2000); const w = window.open('', '_blank'); if (!w) return;
    const agora = new Date(), u = atual() || {};
    const filtros = [PER.find(p => p[0] === est.per)[1], est.tipo && 'Tipo: ' + est.tipo, est.quem && 'Usuário: ' + est.quem, est.ativ && 'Atividade: ' + est.ativ, est.origem && 'Origem: ' + est.origem, est.q && `Busca: “${est.q}”`].filter(Boolean).join(' · ');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Linha do tempo — LegislaGov</title><style>@page{size:A4;margin:14mm}body{font:11.5px/1.4 Arial,sans-serif;color:#111;max-width:800px;margin:16px auto;padding:0 12px}h1{font-size:16px;margin:0}.p{color:#444}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}tr{break-inside:avoid}code{font-size:10.5px}@media print{button{display:none}}</style></head><body>
      <h1>Câmara Municipal de ${esc(((typeof municipioAtual !== 'undefined' && municipioAtual) || 'Neves Paulista').replace(/\s[—-]\s[A-Z]{2}$/, ''))} — Linha do tempo do sistema</h1><p class="p">${esc(filtros)} · ${l.length} registro(s)</p>
      <table><thead><tr><th>Data e hora</th><th>Código</th><th>Quem</th><th>Atividade</th><th>Detalhe</th><th>Origem</th><th>IP</th></tr></thead><tbody>${l.map(e => { const d = new Date(e.t); return `<tr><td>${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR')}</td><td><code>#${e.cod}</code></td><td>${esc(e.quem)}${e.login && e.login !== e.quem ? `<br><small>@${esc(e.login)}</small>` : ''}</td><td>${esc(e.atividade)}</td><td>${esc(e.detalhe)}</td><td>${esc(e.origem)}</td><td>${esc(e.ip)}</td></tr>`; }).join('')}</tbody></table>
      <p class="p">Emitido em ${agora.toLocaleString('pt-BR')} por ${esc(u.nome || '')} · Gerado pelo sistema LegislaGov</p><button onclick="print()">Imprimir</button></body></html>`);
    w.document.close(); setTimeout(() => { try { w.print(); } catch (e) { } }, 400);
  };

  const css = document.createElement('style'); css.id = 'lglt-style'; css.textContent = `
  .lglt-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .lglt-acoes{display:flex;gap:8px}
  .lglt-filtros{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:8px 12px;border-radius:10px;background:color-mix(in srgb,var(--lg28-stroke) 45%,var(--lg28-panel));margin:4px 0 8px}
  .lglt-rot{font-size:12.5px;letter-spacing:.02em}
  .lglt-f{display:inline-flex;align-items:center;gap:4px;font-size:13.5px;font-weight:600}
  .lglt-f select{height:34px!important;min-height:0!important;border:1px solid transparent!important;border-radius:8px!important;background:transparent!important;color:var(--lg28-muted)!important;font:inherit;font-weight:400;padding:0 6px!important;max-width:200px;width:auto!important;cursor:pointer;box-shadow:none!important}
  .lglt-f select:hover{border-color:var(--lg28-stroke)!important;background:var(--lg28-panel)!important}
  .lglt-f select:focus-visible{outline:2px solid #1f4e79;border-radius:6px}
  .lglt-busca{margin-left:auto;min-width:220px;flex:1;max-width:340px}.lglt-busca input{width:100%;height:36px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);padding:0 10px;font:inherit}
  .lgt-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .lglt-total{color:var(--lg28-muted);font-size:13px;margin:6px 0 4px}
  .lglt-dia{display:flex;align-items:center;gap:10px;font-size:18px!important;font-weight:500;margin:22px 0 10px}
  .lglt-dia svg{width:20px;height:20px;color:var(--lg28-muted)}
  .lglt-lista{list-style:none;margin:0;padding:0;border-left:2px solid var(--lg28-stroke);margin-left:96px}
  .lglt-ev{position:relative;display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 12px;margin:0 0 3px;background:color-mix(in srgb,var(--lg28-stroke) 28%,var(--lg28-panel));border-radius:0 8px 8px 0}
  .lglt-ev:nth-child(even){background:var(--lg28-panel)}
  .lglt-hora{position:absolute;right:calc(100% + 12px);top:9px;text-align:right;white-space:nowrap;font-size:13px}
  .lglt-hora time{display:block;font-variant-numeric:tabular-nums;font-weight:600}.lglt-hora code{font-size:10.5px;color:var(--lg28-muted)}
  .lglt-ic{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--lg28-panel);border:1px solid var(--lg28-stroke)}
  .lglt-ic svg{width:15px;height:15px}
  .t-acessos .lglt-ic{color:#1d7a46}.t-cadeado .lglt-ic{color:#9a6a00}.t-usuarios .lglt-ic{color:#1f4e79}.t-site .lglt-ic{color:#6b3fa0}.t-protocolo .lglt-ic{color:#0b6b78}
  .lglt-alerta .lglt-ic{color:#b42318;border-color:#b42318}
  .lglt-txt p{margin:0;font-size:14.5px}.lglt-txt strong{font-weight:700}.lglt-txt small{color:var(--lg28-muted);font-size:12.5px;overflow-wrap:anywhere}
  .lglt-ver{border:0;background:none;color:var(--lg28-ink);width:36px;height:36px;border-radius:8px;cursor:pointer;display:grid;place-items:center}
  .lglt-ver:hover{background:color-mix(in srgb,var(--lg28-stroke) 60%,transparent)}.lglt-ver svg{width:18px;height:18px}
  .lglt-mais{text-align:center;margin:16px 0}
  .lglt-det th{width:38%;white-space:nowrap}.lglt-nota{color:var(--lg28-muted);font-size:13px;margin-top:10px}
  @media(max-width:700px){.lglt-lista{margin-left:0;border-left:0}.lglt-ev{grid-template-columns:28px minmax(0,1fr) auto;border-radius:8px}.lglt-hora{position:static;grid-column:1/-1;text-align:left;display:flex;gap:8px;align-items:baseline}.lglt-busca{margin-left:0;max-width:none}}`;
  document.head.appendChild(css);
})();

/* aviso de carregando nas tarefas pesadas (assets/carregando.js) */
(function () {
  const embrulhar = (nome, t, pronto) => { const f = window[nome]; if (typeof f !== 'function' || f._lgc) return;
    const g = function () { const a = arguments, eu = this; return window.lgCarregando ? window.lgCarregando(t, () => f.apply(eu, a), pronto) : f.apply(eu, a); };
    g._lgc = true; window[nome] = g; };
  embrulhar('lgltAbrir', 'Carregando a linha do tempo…', 'Pronto');
})();
