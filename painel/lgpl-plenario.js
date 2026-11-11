/* =====================================================================
   LegislaGov — SESSÃO PLENÁRIA DIGITAL
   · Presidente (Portal do Vereador › Presidência) ou a Mesa/Secretaria (Administrativo › Sessão plenária):
     monta a pauta com as matérias prontas, publica a convocação, abre a sessão, registra presença e quórum,
     coloca cada item em votação, proclama o resultado (aplicado na tramitação) e gera a ata.
   · Vereador: registra presença e vota pelo Portal do Vereador (celular ou computador).
   · Telão: painel/telao.html mostra presença, item em votação, votos e resultado (atualiza sozinho).
   Regras usadas (a confirmar no Regimento Interno e na Lei Orgânica — ajustáveis em REGRAS):
     abertura com 1/3 dos vereadores; deliberação com a maioria absoluta presente;
     maioria simples = mais "sim" que "não" (empate: voto do Presidente);
     maioria absoluta = metade + 1 do total de vereadores; 2/3 = dois terços do total;
     veto: derrubado com a maioria absoluta (CF, art. 66, § 4º).
     O Presidente vota só para desempatar, salvo nas votações de maioria absoluta, 2/3 e veto.
   Os dados ficam neste navegador (lgpl_v1) até existir o servidor com banco de dados.
   ===================================================================== */
(function () {
  const KEY = 'lgpl_v1';
  const A = () => window.lgvrAPI;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const UI = () => window.lgtUI;
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { UI() && UI().aviso('Espaço do navegador esgotado.', 'erro'); return false; } };
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pad = n => String(n).padStart(2, '0');
  const hora = iso => { const d = new Date(iso); return `${pad(d.getHours())}h${pad(d.getMinutes())}`; };
  const dataBR = iso => new Date(iso).toLocaleDateString('pt-BR');
  const dataLonga = iso => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const REGRAS = {
    abertura: n => Math.ceil(n / 3),
    deliberar: n => Math.floor(n / 2) + 1,
    absoluta: n => Math.floor(n / 2) + 1,
    dois_tercos: n => Math.ceil(2 * n / 3),
  };
  const QUORUNS = { simples: 'Maioria simples', absoluta: 'Maioria absoluta', dois_tercos: 'Dois terços', veto: 'Veto (maioria absoluta para derrubar)' };
  const ESTADOS = { agendada: 'Agendada', convocada: 'Convocada', aberta: 'Em andamento', encerrada: 'Encerrada' };
  const EST_CLS = { agendada: 'av', convocada: 'an', aberta: 'vo', encerrada: 'ok' };

  /* ================= dados ================= */
  function dados() {
    const d = ler(KEY, null) || {};
    d.sessoes = Array.isArray(d.sessoes) ? d.sessoes : [];
    if (!d.semeado && A()) {
      // sessões já agendadas (agenda do Administrativo + calendário) entram como "agendadas"
      try { A().sessoes().forEach(s => { if (!d.sessoes.some(x => Math.abs(new Date(x.quando) - s.quando) < 6e4)) d.sessoes.push(novaBase(s.titulo, s.quando.toISOString(), s.local)); }); } catch (e) { }
      d.semeado = true; gravar(KEY, d);
    }
    return d;
  }
  const salvar = d => { const ok = gravar(KEY, d); try { window.lgavAtualizar && lgavAtualizar(); } catch (e) { } return ok; };
  function novaBase(titulo, quando, local) {
    const m = /^(\d+)ª Sess[aã]o (Ordinária|Extraordinária|Solene)/i.exec(titulo || '');
    return { id: uid('s'), numero: m ? +m[1] : '', tipo: m ? m[2] : 'Ordinária', titulo: titulo || 'Sessão Ordinária', quando, local: local || 'Plenário da Câmara Municipal', status: 'agendada', itens: [], presenca: {}, expediente: '', criadaEm: new Date().toISOString() };
  }
  const sessaoPorId = (d, id) => d.sessoes.find(s => s.id === id);
  const ordenadas = d => d.sessoes.slice().sort((a, b) => new Date(a.quando) - new Date(b.quando));
  function sessaoAtiva(d) {
    d = d || dados();
    const ab = d.sessoes.find(s => s.status === 'aberta'); if (ab) return ab;
    const h = new Date(); h.setHours(0, 0, 0, 0);
    return ordenadas(d).find(s => s.status !== 'encerrada' && new Date(s.quando) >= h) || null;
  }
  const comp = () => A().comp();
  const totalVer = () => comp().vereadores.length;
  const nomeVer = id => (comp().vereadores.find(v => v.id === id) || {}).nome || '—';
  const prot = id => A().listaProt().find(p => p.id === id);
  const ehVeto = p => !!(p && p.veto && !p.veto.resultado);
  const quorumPadrao = p => ehVeto(p) ? 'veto' : 'simples';
  const fasePadrao = p => (['IND', 'REQ', 'MOC'].includes(A().tipoDe(p)) ? 'expediente' : 'ordem');
  const presentes = s => Object.keys(s.presenca || {}).filter(id => comp().vereadores.some(v => v.id === id));

  /* ================= permissões ================= */
  function usuario() { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } }
  function operador() {
    // Presidente (pelo Portal do Vereador) ou a Mesa/Secretaria (adm, secretaria, procurador com edição no Administrativo)
    const u = usuario(); if (!u) return null;
    const a = A() && A().atual();
    if (a && a.v.id === comp().presidente && A().podeEditar()) return { tipo: 'presidente', nome: a.v.nome, demo: a.demo };
    const pf = window.lgPerfil ? lgPerfil(u) : '';
    if (['adm', 'secretaria', 'procurador'].includes(pf) && (!window.lgNivelArea || lgNivelArea('legislativo') === 'edicao')) return { tipo: 'mesa', nome: u.nome || 'Mesa', demo: pf === 'adm' };
    return null;
  }
  const exigeOperador = () => { const o = operador(); if (!o) { UI().aviso('Só o Presidente da Câmara ou a Mesa/Secretaria conduzem a sessão.', 'erro'); return null; } return o; };
  const podeSimular = () => { const u = usuario(); const pf = window.lgPerfil ? lgPerfil(u) : ''; const a = A() && A().atual(); return pf === 'adm' || pf === 'procurador' || !!(a && a.demo); };

  /* ================= contagem ================= */
  function quemVota(s, it) {
    const pres = comp().presidente; const q = it.quorum;
    return presentes(s).filter(id => id !== pres || q !== 'simples');
  }
  function apurar(s, it) {
    const n = totalVer(); const votos = it.votos || {}; const conta = v => Object.values(votos).filter(x => x === v).length;
    const sim = conta('Sim'), nao = conta('Não'), abst = conta('Abstenção');
    let aprovado = null, regra = '', precisa = 0, empate = false;
    if (it.quorum === 'simples') { regra = 'mais votos “sim” que “não”'; if (sim > nao) aprovado = true; else if (nao > sim) aprovado = false; else { empate = true; aprovado = it.desempate ? it.desempate === 'Sim' : null; } }
    else { precisa = it.quorum === 'dois_tercos' ? REGRAS.dois_tercos(n) : REGRAS.absoluta(n); regra = `${precisa} votos “sim” de ${n}`; aprovado = sim >= precisa; }
    return { sim, nao, abst, aprovado, regra, precisa, empate, faltam: quemVota(s, it).filter(id => !votos[id]) };
  }
  const rotVoto = (it, v) => it.quorum === 'veto' ? ({ Sim: 'Derrubar o veto', 'Não': 'Manter o veto', 'Abstenção': 'Abstenção' })[v] : v;

  /* ================= telas ================= */
  function criarTela() {
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main || $('#view-lgpl')) return;
    main.insertAdjacentHTML('beforeend', '<section class="view lgt lgvr lgpl" id="view-lgpl" style="display:none"></section>');
    const antigo = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lgpl'; b.hidden = true; b.style.display = 'none'; antigo.appendChild(b);
  }
  let selId = '', marcaMenu = 'presSessao', abaPauta = false;
  window.lgplAbrir = function (de, id) {
    if (!A()) return;
    marcaMenu = de === 'adm' ? 'plenario' : 'presSessao';
    if (de !== 'adm' && !(A().atual() && A().atual().v.id === comp().presidente)) { UI().aviso('Função exclusiva do Presidente da Câmara.', 'erro'); return; }
    criarTela(); if (id) selId = id;
    gotoShared('lgpl'); if (window.lgv31Mark) lgv31Mark(marcaMenu);
    desenhar(); scrollTo(0, 0);
  };
  function desenhar() {
    const el = $('#view-lgpl'); if (!el || el.style.display === 'none') return;
    const d = dados(); let s = sessaoPorId(d, selId) || sessaoAtiva(d) || ordenadas(d).slice(-1)[0];
    if (s) selId = s.id;
    const o = operador(); const a = A().atual();
    const lista = ordenadas(d);
    el.innerHTML = (marcaMenu === 'presSessao' && a ? A().faixaDemo(a) : '') +
      `<div class="letterhead"><div><h1>Sessão plenária</h1><div class="date">Pauta, convocação, presença, votação nominal e ata</div></div>
        <div class="lgt-acoes"><label class="lgpl-sel"><span class="lgt-rot">Sessão</span><select onchange="lgplSel(this.value)" aria-label="Escolher a sessão">${lista.map(x => `<option value="${x.id}" ${s && x.id === s.id ? 'selected' : ''}>${esc(x.titulo)} · ${dataBR(x.quando)} — ${ESTADOS[x.status]}</option>`).join('') || '<option>Nenhuma sessão</option>'}</select></label>
        ${o ? `<button class="lgt-btn" type="button" onclick="lgplNova()">+ Nova sessão</button>` : ''}
        <button class="lgt-btn" type="button" onclick="lgplTelao()">${ic('telao')} Abrir telão</button></div></div>` +
      (!o ? `<p class="lgvr-regra">${ic('ajuda')}<span>Você está vendo a sessão em modo consulta. Quem conduz é o Presidente da Câmara ou a Mesa/Secretaria.</span></p>` : '') +
      (s ? corpo(s, o) : `<div class="lgt-card"><p class="lgt-p">Nenhuma sessão cadastrada. Use “Nova sessão”.</p></div>`);
  }
  window.lgplSel = id => { selId = id; abaPauta = false; desenhar(); };

  function trilho(s) {
    const passos = [['agendada', 'Pauta'], ['convocada', 'Convocação'], ['aberta', 'Sessão e votações'], ['encerrada', 'Encerramento e ata']];
    const i = passos.findIndex(p => p[0] === s.status);
    return `<ol class="lgpl-trilho">${passos.map(([k, n], j) => `<li class="${j < i ? 'feito' : j === i ? 'agora' : ''}"><b>${j + 1}</b><span>${n}</span></li>`).join('')}</ol>`;
  }
  function corpo(s, o) {
    const n = totalVer(), pr = presentes(s), abre = REGRAS.abertura(n), delib = REGRAS.deliberar(n);
    const cabS = `<div class="lgt-card lgpl-cab"><div><span class="lgvr-tag t-${EST_CLS[s.status]}">${ESTADOS[s.status]}</span><h2>${esc(s.titulo)}</h2><p>${esc(dataLonga(s.quando))} às ${hora(s.quando)} · ${esc(s.local)}${s.abertura ? ` · aberta às ${hora(s.abertura)}` : ''}${s.encerramento ? ` · encerrada às ${hora(s.encerramento)}` : ''}</p></div>
      <div class="lgpl-cab-ac">${acoesSessao(s, o)}</div></div>${trilho(s)}`;
    const presenca = `<div class="lgt-card lgpl-pres"><div class="lgvr-card-cab"><h3>${ic('usuarios')} Presença</h3><span class="lgpl-q ${pr.length >= delib ? 'ok' : pr.length >= abre ? 'meio' : ''}">${pr.length} de ${n} presentes</span></div>
      <p class="lgpl-qinfo">Abrir a sessão: ${abre} · Votar: ${delib} (maioria absoluta)</p>
      <ul class="lgpl-lista">${comp().vereadores.map(v => { const p = (s.presenca || {})[v.id]; return `<li class="${p ? 'on' : ''}"><span class="lgpl-av">${esc(ini(v.nome))}</span><span><b>${esc(v.nome)}${v.id === comp().presidente ? ' <small>Presidente</small>' : ''}</b><small>${p ? `Presente às ${hora(p.hora)}${p.por === 'mesa' ? ' · registrado pela Mesa' : ''}` : 'Ausente'}</small></span>${o && ['convocada', 'aberta'].includes(s.status) ? `<button class="lgt-mini" type="button" onclick="lgplPresenca('${s.id}','${v.id}')">${p ? 'Desfazer' : 'Presente'}</button>` : ''}</li>`; }).join('')}</ul>
      ${o && podeSimular() && ['convocada', 'aberta'].includes(s.status) ? `<button class="lgt-mini lgpl-sim" type="button" onclick="lgplSimularPresenca('${s.id}')">Demonstração: marcar todos presentes</button>` : ''}</div>`;
    let centro = '';
    if (s.status === 'agendada' || abaPauta) centro = telaPauta(s, o);
    else if (s.status === 'encerrada') centro = telaAta(s, o) + listaItens(s, o);
    else centro = itemAtual(s, o) + listaItens(s, o);
    return cabS + `<div class="lgpl-grade"><div class="lgpl-centro">${centro}</div>${presenca}</div>`;
  }
  const ini = n => String(n).split(' ').filter(x => x.length > 1).map(x => x[0]).slice(0, 2).join('').toUpperCase();
  function acoesSessao(s, o) {
    if (!o) return '';
    const b = (t, f, c = '') => `<button class="lgt-btn ${c}" type="button" onclick="${f}">${t}</button>`;
    if (s.status === 'agendada') return b('Editar dados', `lgplNova('${s.id}')`) + b(`${ic('sessoes')} Publicar convocação`, `lgplConvocar('${s.id}')`, 'primario');
    if (s.status === 'convocada') return b(abaPauta ? 'Ver sessão' : 'Ajustar pauta', `lgplAbaPauta()`) + b('Convocação', `lgplVerConvocacao('${s.id}')`) + b(`${ic('whats')} Enviar pelo WhatsApp`, `lgplWhatsConvocacao('${s.id}')`) + b('Abrir a sessão', `lgplAbrirSessao('${s.id}')`, 'primario');
    if (s.status === 'aberta') return b('Convocação', `lgplVerConvocacao('${s.id}')`) + b('Encerrar a sessão', `lgplEncerrar('${s.id}')`, 'perigo');
    return b('Convocação', `lgplVerConvocacao('${s.id}')`);
  }
  window.lgplAbaPauta = () => { abaPauta = !abaPauta; desenhar(); };

  /* ---- pauta ---- */
  function elegiveis(s) {
    const d = dados(); const emOutra = new Set(d.sessoes.filter(x => x.id !== s.id && x.status !== 'encerrada').flatMap(x => x.itens.filter(i => !['votado', 'retirado', 'adiado'].includes(i.status)).map(i => i.pid)));
    return A().listaProt().filter(p => p.status === 'votacao' && !p.resultado && !emOutra.has(p.id) && !s.itens.some(i => i.pid === p.id));
  }
  function telaPauta(s, o) {
    const el = elegiveis(s);
    const linha = (it, i) => { const p = prot(it.pid); if (!p) return ''; return `<li class="lgpl-pi"><span class="lgpl-ord">${i + 1}</span><div><b>${esc(p.numero)}${ehVeto(p) ? ' <span class="lgvr-tag t-er">Veto</span>' : ''}</b><span>${esc(p.ementa)}</span><small>${esc(p.autor || '')} · ${it.fase === 'expediente' ? 'Expediente' : 'Ordem do Dia'}</small></div>
      ${o ? `<div class="lgpl-pi-ac"><select aria-label="Quórum" onchange="lgplQuorum('${s.id}',${i},this.value)">${Object.entries(QUORUNS).filter(([k]) => ehVeto(p) ? k === 'veto' : k !== 'veto').map(([k, nn]) => `<option value="${k}" ${it.quorum === k ? 'selected' : ''}>${nn}</option>`).join('')}</select><button class="lgt-mini" type="button" aria-label="Subir" onclick="lgplMover('${s.id}',${i},-1)">↑</button><button class="lgt-mini" type="button" aria-label="Descer" onclick="lgplMover('${s.id}',${i},1)">↓</button><button class="lgt-mini perigo" type="button" onclick="lgplTirar('${s.id}',${i})">Tirar</button></div>` : `<small>${QUORUNS[it.quorum]}</small>`}</li>`; };
    return `<div class="lgt-card"><div class="lgvr-card-cab"><h3>${ic('lista')} Pauta da sessão (${s.itens.length})</h3>${s.status === 'convocada' ? '<span class="lgvr-sub">Mudanças na pauta depois da convocação ficam registradas</span>' : ''}</div>
      ${s.itens.length ? `<ol class="lgpl-pauta">${s.itens.map(linha).join('')}</ol>` : '<p class="lgt-p">Nenhuma matéria na pauta ainda.</p>'}
      ${o ? `<label class="cheio lgpl-exp"><span class="lgt-rot">Expediente (leitura de ofícios, correspondências e comunicações)</span><textarea rows="2" onchange="lgplExpediente('${s.id}',this.value)" placeholder="Ex.: Leitura do Ofício nº 120/2026 da Prefeitura…">${esc(s.expediente || '')}</textarea></label>` : ''}</div>
      ${o ? `<div class="lgt-card"><div class="lgvr-card-cab"><h3>Matérias prontas para o Plenário (${el.length})</h3>${el.length ? `<button class="lgt-mini primario" type="button" onclick="lgplIncluirTodas('${s.id}')">Incluir todas</button>` : ''}</div>
      ${el.map(p => `<div class="lgvr-item"><div><b>${esc(p.numero)} · ${esc(p.tipoNome || 'Projeto de Lei')}${ehVeto(p) ? ' (veto)' : ''}</b><small>${esc(p.ementa)}</small></div><button class="lgt-mini" type="button" onclick="lgplIncluir('${s.id}','${p.id}')">Incluir</button></div>`).join('') || '<p class="lgt-p">Nenhuma matéria na Ordem do Dia. As matérias entram aqui depois do despacho do Presidente ou do parecer das comissões.</p>'}</div>` : ''}`;
  }
  const mexer = (sid, fn, motivo) => { const d = dados(); const s = sessaoPorId(d, sid); if (!s || !exigeOperador()) return; fn(s, d); if (motivo && s.status === 'convocada') (s.alteracoes = s.alteracoes || []).push({ data: new Date().toISOString(), texto: motivo }); salvar(d); desenhar(); };
  window.lgplIncluir = (sid, pid) => mexer(sid, s => { const p = prot(pid); s.itens.push({ pid, fase: fasePadrao(p), quorum: quorumPadrao(p), status: 'aguardando', votos: {} }); s.itens.sort((a, b) => (a.fase === 'expediente' ? 0 : 1) - (b.fase === 'expediente' ? 0 : 1)); }, 'Matéria incluída na pauta');
  window.lgplIncluirTodas = sid => mexer(sid, s => { elegiveis(s).forEach(p => s.itens.push({ pid: p.id, fase: fasePadrao(p), quorum: quorumPadrao(p), status: 'aguardando', votos: {} })); s.itens.sort((a, b) => (a.fase === 'expediente' ? 0 : 1) - (b.fase === 'expediente' ? 0 : 1)); }, 'Matérias incluídas na pauta');
  window.lgplTirar = (sid, i) => mexer(sid, s => { s.itens.splice(i, 1); }, 'Matéria retirada da pauta');
  window.lgplMover = (sid, i, dlt) => mexer(sid, s => { const j = i + dlt; if (j < 0 || j >= s.itens.length) return; [s.itens[i], s.itens[j]] = [s.itens[j], s.itens[i]]; });
  window.lgplQuorum = (sid, i, q) => mexer(sid, s => { s.itens[i].quorum = q; });
  window.lgplExpediente = (sid, t) => mexer(sid, s => { s.expediente = t.trim(); });

  /* ---- nova sessão ---- */
  window.lgplNova = function (id) {
    if (!exigeOperador()) return; const d = dados(); const s = id ? sessaoPorId(d, id) : null;
    const ano = new Date().getFullYear();
    const prox = tipo => 1 + Math.max(0, ...d.sessoes.filter(x => x.tipo === tipo && new Date(x.quando).getFullYear() === ano && x.numero).map(x => +x.numero));
    const q = s ? new Date(s.quando) : (() => { const x = new Date(); x.setDate(x.getDate() + ((8 - x.getDay()) % 7 || 7)); x.setHours(20, 0, 0, 0); return x; })();
    const iso = `${q.getFullYear()}-${pad(q.getMonth() + 1)}-${pad(q.getDate())}`;
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${s ? 'Dados da sessão' : 'Nova sessão'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <label><span>Tipo *</span><select name="tipo">${['Ordinária', 'Extraordinária', 'Solene'].map(t => `<option ${s && s.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label><span>Número *</span><input name="numero" type="number" min="1" inputmode="numeric" value="${s ? esc(s.numero) : prox('Ordinária')}"></label>
      <label><span>Data *</span><input name="data" type="date" value="${iso}"></label><label><span>Horário *</span><input name="hora" type="time" value="${pad(q.getHours())}:${pad(q.getMinutes())}"></label>
      <label class="cheio"><span>Local</span><input name="local" value="${esc(s ? s.local : 'Plenário da Câmara Municipal')}"></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">${s ? 'Salvar' : 'Criar sessão'}</button></div></form>`);
    const f = $('#lgt-modal form');
    f.tipo.onchange = () => { if (!s) f.numero.value = prox(f.tipo.value); };
    f.onsubmit = e => { e.preventDefault(); if (!f.numero.value || !f.data.value || !f.hora.value) { f.querySelector('.lgt-erro').textContent = 'Preencha tipo, número, data e horário.'; return; }
      const dd = dados(); const quando = new Date(`${f.data.value}T${f.hora.value}`).toISOString(); const titulo = `${f.numero.value}ª Sessão ${f.tipo.value}`;
      if (s) { const x = sessaoPorId(dd, s.id); Object.assign(x, { tipo: f.tipo.value, numero: +f.numero.value, titulo, quando, local: f.local.value.trim() || x.local }); }
      else { const nova = novaBase(titulo, quando, f.local.value.trim()); nova.tipo = f.tipo.value; nova.numero = +f.numero.value; dd.sessoes.push(nova); selId = nova.id; }
      salvar(dd); UI().fecharModal(); UI().aviso(s ? 'Sessão atualizada.' : 'Sessão criada. Agora monte a pauta.'); desenhar(); };
  };

  /* ---- convocação ---- */
  function textoConvocacao(s) {
    const pres = comp().vereadores.find(v => v.id === comp().presidente) || {};
    const it = f => s.itens.filter(i => i.fase === f).map(i => prot(i.pid)).filter(Boolean);
    const linhas = l => l.map((p, k) => `${k + 1}. ${p.numero} — ${p.tipoNome || 'Projeto de Lei'}${ehVeto(p) ? ' (apreciação do veto ' + p.veto.tipo + ')' : ''}, de autoria de ${p.autor || '—'}. ${p.ementa}`).join('\n') || '— nenhuma matéria —';
    return `EDITAL DE CONVOCAÇÃO\n\nO Presidente da Câmara Municipal de Neves Paulista, Vereador ${pres.completo || pres.nome || ''}, no uso de suas atribuições legais e regimentais, CONVOCA os Senhores Vereadores para a ${s.titulo}, a realizar-se ${dataLonga(s.quando)}, às ${hora(s.quando)}, no ${s.local}, com a seguinte pauta:\n\nEXPEDIENTE\n${s.expediente ? s.expediente + '\n' : ''}${linhas(it('expediente'))}\n\nORDEM DO DIA\n${linhas(it('ordem'))}\n\nNeves Paulista, ${new Date(s.convocacao ? s.convocacao.data : Date.now()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.\n\n${pres.completo || pres.nome || ''}\nPresidente da Câmara Municipal`;
  }
  window.lgplConvocar = function (sid) {
    if (!exigeOperador()) return; const d = dados(); const s = sessaoPorId(d, sid); if (!s) return;
    if (!s.itens.length) return UI().aviso('Inclua ao menos uma matéria na pauta antes de convocar.', 'erro');
    UI().confirmar ? UI().confirmar(`Publicar a convocação da ${s.titulo}? A pauta vai para o Portal da Transparência e os vereadores recebem o aviso.`, () => fazer()) : fazer();
    function fazer() {
      const dd = dados(); const x = sessaoPorId(dd, sid); x.status = 'convocada'; x.convocacao = { data: new Date().toISOString(), por: (operador() || {}).nome || '' };
      salvar(dd); publicarTransparencia(x, 'pauta'); UI().log && UI().log('Sessão plenária', `Convocação publicada: ${x.titulo}`);
      UI().aviso('Convocação publicada. Envie também pelo WhatsApp, se quiser.'); desenhar(); setTimeout(() => lgplWhatsConvocacao(sid), 300);
    }
  };
  window.lgplVerConvocacao = sid => { const s = sessaoPorId(dados(), sid); if (s) documento(`Convocação — ${s.titulo}`, textoConvocacao(s)); };
  window.lgplWhatsConvocacao = function (sid) {
    const s = sessaoPorId(dados(), sid); if (!s) return;
    const msg = `Câmara Municipal de Neves Paulista\n*${s.titulo}*\n${dataLonga(s.quando)}, às ${hora(s.quando)} — ${s.local}\n\nPauta:\n${s.itens.map((i, k) => { const p = prot(i.pid); return p ? `${k + 1}. ${p.numero} — ${p.ementa}` : ''; }).filter(Boolean).join('\n')}\n\nA pauta completa está no Portal do Vereador.`;
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Enviar a convocação pelo WhatsApp</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <p class="lgt-p">Cada botão abre o WhatsApp com a mensagem pronta para o vereador. É só apertar enviar. Os avisos também aparecem no sino do sistema.</p>
      <ul class="lgpl-whats">${comp().vereadores.map(v => `<li><span><b>${esc(v.nome)}</b><small>${esc(window.lgavTelefone ? (lgavTelefone(v.id) || 'sem telefone cadastrado — você escolhe o contato') : '')}</small></span><a class="lgt-mini" target="_blank" rel="noopener" href="${esc(window.lgavLinkWhats ? lgavLinkWhats(v.id, msg) : 'https://wa.me/?text=' + encodeURIComponent(msg))}">${ic('whats')} Abrir WhatsApp</a></li>`).join('')}</ul>
      <details><summary>Ver a mensagem</summary><pre class="lgpl-msg">${esc(msg)}</pre></details>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn primario" onclick="lgtFechar()">Concluir</button></div></div>`);
  };

  /* ---- presença ---- */
  window.lgplPresenca = (sid, vid) => mexer(sid, s => { s.presenca = s.presenca || {}; if (s.presenca[vid]) delete s.presenca[vid]; else s.presenca[vid] = { hora: new Date().toISOString(), por: 'mesa' }; });
  window.lgplSimularPresenca = sid => mexer(sid, s => { s.presenca = s.presenca || {}; comp().vereadores.forEach((v, k) => { if (!s.presenca[v.id] && k < totalVer() - 1) s.presenca[v.id] = { hora: new Date().toISOString(), por: 'mesa' }; }); });
  window.lgplMinhaPresenca = function (sid) {
    const a = A().atual(); if (!a) return; const d = dados(); const s = sessaoPorId(d, sid); if (!s || !['convocada', 'aberta'].includes(s.status)) return;
    if (!A().podeEditar()) return UI().aviso('Seu acesso é somente consulta.', 'erro');
    const hoje = new Date().toDateString() === new Date(s.quando).toDateString();
    if (s.status === 'convocada' && !hoje) return UI().aviso('A presença é registrada no dia da sessão.', 'erro');
    s.presenca = s.presenca || {}; s.presenca[a.v.id] = { hora: new Date().toISOString(), por: 'proprio' }; salvar(d);
    UI().aviso('Presença registrada.'); A().redesenhar(); desenhar();
  };

  /* ---- condução ---- */
  window.lgplAbrirSessao = function (sid) {
    if (!exigeOperador()) return; const d = dados(); const s = sessaoPorId(d, sid); const n = totalVer(), pr = presentes(s).length, min = REGRAS.abertura(n);
    if (pr < min) return UI().aviso(`Sem quórum: são necessários ${min} vereadores presentes para abrir a sessão (há ${pr}).`, 'erro');
    if (d.sessoes.some(x => x.status === 'aberta' && x.id !== sid)) return UI().aviso('Já existe outra sessão em andamento. Encerre-a primeiro.', 'erro');
    s.status = 'aberta'; s.abertura = new Date().toISOString(); abaPauta = false; salvar(d); UI().aviso('Sessão aberta. Coloque o primeiro item em votação.'); desenhar();
  };
  function itemAtual(s, o) {
    if (s.status !== 'aberta') return `<div class="lgt-card lgpl-agora"><h3>${ic('votacao')} Quando a sessão abrir</h3><p class="lgt-p">Os vereadores registram presença pelo Portal do Vereador (ou a Mesa marca ao lado). Com quórum, use “Abrir a sessão”; cada item da pauta vai à votação e o resultado entra na tramitação automaticamente.</p></div>`;
    const idx = s.itens.findIndex(i => ['discussao', 'votacao'].includes(i.status));
    const prox = s.itens.findIndex(i => i.status === 'aguardando');
    if (idx < 0) {
      if (prox < 0) return `<div class="lgt-card lgpl-agora"><h3>Pauta concluída</h3><p class="lgt-p">Todos os itens foram apreciados. Use “Encerrar a sessão” para gerar a ata.</p></div>`;
      const p = prot(s.itens[prox].pid);
      return `<div class="lgt-card lgpl-agora"><span class="lgpl-kicker">Próximo item · ${prox + 1} de ${s.itens.length}</span><h3>${esc(p ? p.numero : '')}</h3><p class="lgpl-ementa">${esc(p ? p.ementa : '')}</p>
        ${o ? `<div class="lgt-acoes"><button class="lgt-btn" type="button" onclick="lgplItem('${s.id}',${prox},'discussao')">Colocar em discussão</button><button class="lgt-btn primario" type="button" onclick="lgplItem('${s.id}',${prox},'votacao')">${ic('votacao')} Abrir votação</button><button class="lgt-btn" type="button" onclick="lgplItem('${s.id}',${prox},'adiado')">Adiar</button></div>` : ''}</div>`;
    }
    const it = s.itens[idx], p = prot(it.pid), r = apurar(s, it), vota = quemVota(s, it);
    if (it.status === 'discussao') return `<div class="lgt-card lgpl-agora"><span class="lgpl-kicker">Em discussão · item ${idx + 1}</span><h3>${esc(p.numero)}</h3><p class="lgpl-ementa">${esc(p.ementa)}</p><p class="lgt-p">${esc(p.autor || '')} · ${QUORUNS[it.quorum]}</p>
      ${o ? `<div class="lgt-acoes"><button class="lgt-btn primario" type="button" onclick="lgplItem('${s.id}',${idx},'votacao')">${ic('votacao')} Encerrar discussão e abrir votação</button><button class="lgt-btn" type="button" onclick="lgplItem('${s.id}',${idx},'adiado')">Adiar</button></div>` : ''}</div>`;
    return `<div class="lgt-card lgpl-agora lgpl-votando"><span class="lgpl-kicker"><i class="lgpl-ao-vivo"></i> Em votação · item ${idx + 1} de ${s.itens.length}</span><h3>${esc(p.numero)}${ehVeto(p) ? ' · veto ' + esc(p.veto.tipo) : ''}</h3><p class="lgpl-ementa">${esc(p.ementa)}</p>
      <p class="lgpl-regra">${QUORUNS[it.quorum]}: ${esc(r.regra)}${it.quorum === 'simples' ? ' · o Presidente vota só se houver empate' : ' · o Presidente também vota'}</p>
      <div class="lgpl-placar"><div class="sim"><b>${r.sim}</b><span>${esc(rotVoto(it, 'Sim'))}</span></div><div class="nao"><b>${r.nao}</b><span>${esc(rotVoto(it, 'Não'))}</span></div><div class="abs"><b>${r.abst}</b><span>Abstenções</span></div><div class="falta"><b>${r.faltam.length}</b><span>Faltam votar</span></div></div>
      <ul class="lgpl-votos">${vota.map(id => `<li class="v-${(it.votos[id] || 'pend').replace('ã', 'a').toLowerCase()}"><b>${esc(nomeVer(id))}</b><span>${esc(it.votos[id] ? rotVoto(it, it.votos[id]) : 'Aguardando')}</span>${o ? `<select aria-label="Registrar voto de ${esc(nomeVer(id))} pela Mesa" onchange="lgplVotoMesa('${s.id}',${idx},'${id}',this.value)"><option value="">Registrar pela Mesa…</option>${['Sim', 'Não', 'Abstenção'].map(v => `<option value="${v}">${esc(rotVoto(it, v))}</option>`).join('')}</select>` : ''}</li>`).join('')}</ul>
      ${o ? `<div class="lgt-acoes">${podeSimular() && r.faltam.length ? `<button class="lgt-btn lgpl-sim" type="button" onclick="lgplSimularVotos('${s.id}',${idx})">Demonstração: simular votos que faltam</button>` : ''}<button class="lgt-btn primario" type="button" onclick="lgplProclamar('${s.id}',${idx})">Encerrar votação e proclamar o resultado</button></div>` : ''}</div>`;
  }
  window.lgplItem = function (sid, idx, acao) {
    if (!exigeOperador()) return; const d = dados(); const s = sessaoPorId(d, sid); const it = s.itens[idx]; if (!it) return;
    if (acao === 'votacao') { const n = totalVer(), pr = presentes(s).length, min = REGRAS.deliberar(n); if (pr < min) return UI().aviso(`Sem quórum para votar: são necessários ${min} vereadores presentes (há ${pr}).`, 'erro'); it.votos = {}; it.inicioVotacao = new Date().toISOString(); }
    it.status = acao; salvar(d); desenhar();
  };
  window.lgplVotoMesa = function (sid, idx, vid, voto) {
    if (!voto || !exigeOperador()) return; const d = dados(); const s = sessaoPorId(d, sid); const it = s.itens[idx]; if (!it || it.status !== 'votacao') return;
    it.votos[vid] = voto; (it.porMesa = it.porMesa || {})[vid] = true; salvar(d); desenhar();
  };
  window.lgplSimularVotos = function (sid, idx) {
    const d = dados(); const s = sessaoPorId(d, sid); const it = s.itens[idx]; const r = apurar(s, it);
    r.faltam.forEach((id, k) => { it.votos[id] = k % 5 === 3 ? 'Não' : k % 7 === 6 ? 'Abstenção' : 'Sim'; (it.porMesa = it.porMesa || {})[id] = true; }); salvar(d); desenhar();
  };
  window.lgplVotar = function (sid, voto) {
    const a = A().atual(); if (!a) return; if (!A().podeEditar()) return UI().aviso('Seu acesso é somente consulta.', 'erro');
    const d = dados(); const s = sessaoPorId(d, sid); if (!s || s.status !== 'aberta') return;
    const it = s.itens.find(i => i.status === 'votacao'); if (!it) return UI().aviso('Não há votação aberta agora.', 'erro');
    if (!(s.presenca || {})[a.v.id]) return UI().aviso('Registre sua presença antes de votar.', 'erro');
    if (!quemVota(s, it).includes(a.v.id)) return UI().aviso('Nesta votação o Presidente só vota em caso de empate.', 'erro');
    it.votos[a.v.id] = voto; if (it.porMesa) delete it.porMesa[a.v.id]; salvar(d);
    UI().aviso(`Voto registrado: ${rotVoto(it, voto)}. Você pode mudar até o Presidente encerrar a votação.`); A().redesenhar(); desenhar();
  };
  window.lgplProclamar = function (sid, idx) {
    if (!exigeOperador()) return; const d = dados(); const s = sessaoPorId(d, sid); const it = s.itens[idx]; const p = prot(it.pid); const r = apurar(s, it);
    const fim = desempate => {
      const dd = dados(); const ss = sessaoPorId(dd, sid); const ii = ss.itens[idx]; if (desempate) ii.desempate = desempate;
      const rr = apurar(ss, ii); const pp = prot(ii.pid); const pres = comp().presidente;
      const nominal = comp().vereadores.map(v => ({ id: v.id, nome: v.nome, voto: ii.votos[v.id] ? rotVoto(ii, ii.votos[v.id]) : !(ss.presenca || {})[v.id] ? 'Ausente' : v.id === pres && ii.quorum === 'simples' ? (ii.desempate ? 'Desempate: ' + rotVoto(ii, ii.desempate) : 'Presidente (não vota)') : 'Não votou' }));
      const ausentes = totalVer() - presentes(ss).length;
      if (ii.quorum === 'veto') { const derr = A().aplicarVeto(pp, { rejeicao: rr.sim, manutencao: rr.nao, abst: rr.abst + ausentes, sessao: `${ss.titulo} de ${dataBR(ss.quando)}`, nominal }); ii.resultado = derr ? 'Veto rejeitado (derrubado)' : 'Veto mantido'; }
      else { A().aplicarVotacao(pp, { favor: rr.sim, contra: rr.nao, abst: rr.abst + ausentes, desempate: ii.desempate ? (ii.desempate === 'Sim' ? 'Favorável' : 'Contrário') : '', sessao: `${ss.titulo} de ${dataBR(ss.quando)}`, nominal, quorum: QUORUNS[ii.quorum] }, rr.aprovado); ii.resultado = rr.aprovado ? 'Aprovado' : 'Rejeitado'; }
      ii.placar = { sim: rr.sim, nao: rr.nao, abst: rr.abst, ausentes }; ii.nominal = nominal; ii.status = 'votado'; ii.fimVotacao = new Date().toISOString();
      salvar(dd); publicarTransparencia(ss, 'resultado'); UI().aviso(`${pp.numero}: ${ii.resultado.toUpperCase()} (${rr.sim} × ${rr.nao}).`); desenhar();
    };
    const go = () => {
      if (r.empate && it.quorum === 'simples' && !it.desempate) {
        UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Empate: ${r.sim} × ${r.nao}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><p class="lgt-p">O Presidente desempata. Registre o voto de ${esc(nomeVer(comp().presidente))}:</p>
          <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="button" class="lgt-btn" id="lgpl-de-n">Não (rejeita)</button><button type="button" class="lgt-btn primario" id="lgpl-de-s">Sim (aprova)</button></div></div>`);
        $('#lgpl-de-s').onclick = () => { UI().fecharModal(); fim('Sim'); }; $('#lgpl-de-n').onclick = () => { UI().fecharModal(); fim('Não'); }; return;
      }
      fim();
    };
    if (r.faltam.length) return UI().confirmar ? UI().confirmar(`${r.faltam.length} vereador(es) presente(s) ainda não votaram (${r.faltam.map(nomeVer).join(', ')}). Encerrar a votação assim mesmo?`, go) : go();
    go();
  };
  function listaItens(s, o) {
    if (!s.itens.length) return '';
    return `<div class="lgt-card"><div class="lgvr-card-cab"><h3>${ic('lista')} Pauta (${s.itens.length})</h3></div><ol class="lgpl-pauta">${s.itens.map((it, i) => { const p = prot(it.pid); if (!p) return ''; const st = { aguardando: ['Aguardando', 'av'], discussao: ['Em discussão', 'an'], votacao: ['Em votação', 'vo'], votado: [it.resultado || 'Votado', /rejeitado|mantido/i.test(it.resultado || '') && !/veto rejeitado/i.test(it.resultado || '') ? 'er' : 'ok'], adiado: ['Adiado', 'av'], retirado: ['Retirado', 'er'] }[it.status] || ['', ''];
      return `<li class="lgpl-pi"><span class="lgpl-ord">${i + 1}</span><div><b>${esc(p.numero)}</b><span>${esc(p.ementa)}</span><small>${it.fase === 'expediente' ? 'Expediente' : 'Ordem do Dia'} · ${QUORUNS[it.quorum]}${it.placar ? ` · ${it.placar.sim} × ${it.placar.nao}${it.placar.abst ? ', ' + it.placar.abst + ' abst.' : ''}` : ''}</small></div><span class="lgvr-tag t-${st[1]}">${esc(st[0])}</span>${o && s.status === 'aberta' && it.status === 'adiado' ? `<button class="lgt-mini" type="button" onclick="lgplItem('${s.id}',${i},'aguardando')">Voltar à pauta</button>` : ''}</li>`; }).join('')}</ol></div>`;
  }
  window.lgplEncerrar = function (sid) {
    if (!exigeOperador()) return; const s = sessaoPorId(dados(), sid); const abertos = s.itens.filter(i => ['discussao', 'votacao'].includes(i.status)).length;
    if (abertos) return UI().aviso('Há um item em discussão ou votação. Proclame o resultado ou adie antes de encerrar.', 'erro');
    const pend = s.itens.filter(i => i.status === 'aguardando').length;
    const go = () => { const d = dados(); const x = sessaoPorId(d, sid); x.itens.forEach(i => { if (i.status === 'aguardando') i.status = 'adiado'; }); x.status = 'encerrada'; x.encerramento = new Date().toISOString(); x.ata = { texto: gerarAta(x), status: 'rascunho' }; salvar(d); UI().aviso('Sessão encerrada. Confira a ata gerada.'); desenhar(); };
    UI().confirmar ? UI().confirmar(`Encerrar a ${s.titulo}?${pend ? ` ${pend} item(ns) não apreciado(s) ficam adiados e continuam na Ordem do Dia.` : ''}`, go) : go();
  };

  /* ---- ata ---- */
  function gerarAta(s) {
    const c = comp(); const pres = c.vereadores.find(v => v.id === c.presidente) || {}; const d = new Date(s.abertura || s.quando);
    const pr = presentes(s).map(nomeVer), aus = c.vereadores.filter(v => !(s.presenca || {})[v.id]).map(v => v.nome);
    const sec = (window.MESA_SECRETARIO || '').trim();
    const itens = s.itens.map((it, k) => { const p = prot(it.pid); if (!p) return ''; const cab = `Item ${k + 1} — ${p.numero} (${p.tipoNome || 'Projeto de Lei'}), de autoria de ${p.autor || '—'}: ${p.ementa}.`;
      if (it.status !== 'votado') return `${cab} ${it.status === 'retirado' ? 'Retirado de pauta.' : 'Adiado; permanece na Ordem do Dia.'}`;
      const grupo = v => (it.nominal || []).filter(x => x.voto === rotVoto(it, v)).map(x => x.nome);
      return `${cab} Submetido a votação nominal (${QUORUNS[it.quorum].toLowerCase()}), resultado: ${it.resultado.toUpperCase()}, com ${it.placar.sim} voto(s) ${it.quorum === 'veto' ? 'pela rejeição do veto' : 'favorável(is)'}, ${it.placar.nao} ${it.quorum === 'veto' ? 'pela manutenção' : 'contrário(s)'} e ${it.placar.abst} abstenção(ões)${it.desempate ? `, com voto de desempate do Presidente (${it.desempate === 'Sim' ? 'favorável' : 'contrário'})` : ''}. ${grupo('Sim').length ? `Votaram ${it.quorum === 'veto' ? 'pela rejeição do veto' : 'SIM'}: ${grupo('Sim').join(', ')}. ` : ''}${grupo('Não').length ? `Votaram ${it.quorum === 'veto' ? 'pela manutenção' : 'NÃO'}: ${grupo('Não').join(', ')}. ` : ''}${grupo('Abstenção').length ? `Abstiveram-se: ${grupo('Abstenção').join(', ')}.` : ''}`.trim(); }).filter(Boolean);
    return `ATA DA ${s.titulo.toUpperCase()} DA CÂMARA MUNICIPAL DE NEVES PAULISTA\n\nAos ${d.getDate()} dias do mês de ${MESES[d.getMonth()]} de ${d.getFullYear()}, às ${hora(s.abertura || s.quando)}, no ${s.local}, reuniu-se a Câmara Municipal de Neves Paulista, sob a presidência do Vereador ${pres.completo || pres.nome || '—'}.\n\nPRESENÇA: estiveram presentes os Vereadores ${pr.join(', ') || '—'}${aus.length ? `; ausente(s): ${aus.join(', ')}` : ''}. Havendo quórum regimental, o Presidente declarou aberta a sessão.\n\nEXPEDIENTE: ${s.expediente || 'Nada a registrar.'}\n\nORDEM DO DIA:\n${itens.join('\n\n') || 'Nenhuma matéria apreciada.'}\n\nENCERRAMENTO: nada mais havendo a tratar, o Presidente declarou encerrada a sessão às ${hora(s.encerramento || new Date().toISOString())}. E, para constar, foi lavrada a presente ata, que, lida e aprovada, será assinada na forma regimental.\n\nNeves Paulista, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.\n\n${pres.completo || pres.nome || ''}\nPresidente${sec ? `\n\n${sec}\n1º Secretário` : ''}`;
  }
  function telaAta(s, o) {
    const at = s.ata || { texto: gerarAta(s), status: 'rascunho' };
    const st = { rascunho: ['Rascunho — confira e publique', 'av'], publicada: ['Publicada no Portal da Transparência', 'ok'], aprovada: ['Aprovada em sessão e publicada', 'ok'] }[at.status] || ['', ''];
    return `<div class="lgt-card lgpl-ata"><div class="lgvr-card-cab"><h3>${ic('editor')} Ata da sessão</h3><span class="lgvr-tag t-${st[1]}">${st[0]}</span></div>
      ${o && at.status === 'rascunho' ? `<textarea id="lgpl-ata-tx" rows="14" aria-label="Texto da ata">${esc(at.texto)}</textarea>` : `<div class="lgpl-ata-tx">${esc(at.texto).replace(/\n/g, '<br>')}</div>`}
      ${at.assinatura ? `<p class="lgt-p">${ic('assinar')} Assinada por ${esc(at.assinatura.nome)} em ${new Date(at.assinatura.data).toLocaleString('pt-BR')} (${esc(at.assinatura.metodo)})</p>` : ''}
      <div class="lgt-acoes">${o && at.status === 'rascunho' ? `<button class="lgt-btn" type="button" onclick="lgplAtaRefazer('${s.id}')">Gerar de novo</button><button class="lgt-btn" type="button" onclick="lgplAtaSalvar('${s.id}')">Salvar texto</button><button class="lgt-btn primario" type="button" onclick="lgplAtaPublicar('${s.id}')">Assinar e publicar</button>` : ''}
        ${o && at.status === 'publicada' ? `<button class="lgt-btn" type="button" onclick="lgplAtaAprovada('${s.id}')">Marcar como aprovada em sessão</button>` : ''}
        <button class="lgt-btn" type="button" onclick="lgplAtaVer('${s.id}')">${ic('externo')} Imprimir / PDF</button>${window.lgsTemPDF && lgsTemPDF('ata-' + s.id) ? `<button class="lgt-btn" type="button" onclick="lgsBaixarPDF('ata-${s.id}','Ata-${esc(s.titulo.replace(/[^A-Za-z0-9]+/g, '-'))}-assinada.pdf')">PDF assinado</button>` : ''}</div>
      <p class="lgvr-regra">${ic('ajuda')}<span>A ata sai pronta com presença, expediente, resultados e votos nominais. Confira o texto; em regra ela é lida e aprovada na sessão seguinte (confirme no Regimento).</span></p></div>`;
  }
  const comAta = (sid, fn) => { if (!exigeOperador()) return; const d = dados(); const s = sessaoPorId(d, sid); s.ata = s.ata || { texto: gerarAta(s), status: 'rascunho' }; const tx = $('#lgpl-ata-tx'); if (tx && s.ata.status === 'rascunho') s.ata.texto = tx.value; fn(s, d); };
  window.lgplAtaSalvar = sid => comAta(sid, (s, d) => { salvar(d); UI().aviso('Texto da ata salvo.'); });
  window.lgplAtaRefazer = sid => comAta(sid, (s, d) => { s.ata.texto = gerarAta(s); salvar(d); desenhar(); });
  window.lgplAtaVer = sid => { const s = sessaoPorId(dados(), sid); const tx = $('#lgpl-ata-tx'); documento(`Ata — ${s.titulo}`, tx ? tx.value : (s.ata ? s.ata.texto : gerarAta(s))); };
  window.lgplAtaAprovada = sid => comAta(sid, (s, d) => { s.ata.status = 'aprovada'; s.ata.aprovadaEm = new Date().toISOString(); salvar(d); publicarTransparencia(s, 'ata'); desenhar(); });
  window.lgplAtaPublicar = sid => comAta(sid, (s, d) => {
    salvar(d); const pres = comp().vereadores.find(v => v.id === comp().presidente);
    const publicar = ass => { const dd = dados(); const x = sessaoPorId(dd, sid); x.ata = { ...s.ata, status: 'publicada', publicadaEm: new Date().toISOString(), assinatura: ass || null }; salvar(dd); publicarTransparencia(x, 'ata'); UI().aviso('Ata publicada no Portal da Transparência.'); desenhar(); };
    if (pres && A().assinarDoc) A().assinarDoc({ titulo: `Ata da ${s.titulo}`, arquivo: A().arq('Ata ' + s.titulo), docId: 'ata-' + s.id, doc: { tipo: 'Ata', numero: `${s.numero || ''}/${new Date(s.quando).getFullYear()}`, ementa: `Ata da ${s.titulo} de ${dataBR(s.quando)}`, texto: s.ata.texto } }, pres, publicar);
    else publicar(null);
  });

  /* ---- documento para imprimir ---- */
  function documento(titulo, texto) {
    const w = window.open('', '_blank'); if (!w) return UI().aviso('Permita janelas pop-up para ver o documento.', 'erro');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>body{font:15px/1.6 Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#111}h1{font:700 16px Arial,sans-serif;text-align:center;letter-spacing:.04em}header{text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:24px;font-family:Arial,sans-serif}header b{display:block;font-size:17px}header small{color:#555}p{white-space:pre-wrap;text-align:justify}@media print{button{display:none}}button{position:fixed;top:12px;right:12px;padding:8px 14px}</style></head><body><button onclick="print()">Imprimir / salvar PDF</button><header><b>CÂMARA MUNICIPAL DE NEVES PAULISTA</b><small>Estado de São Paulo · Poder Legislativo</small></header><p>${esc(texto)}</p></body></html>`);
    w.document.close();
  }

  /* ---- Portal da Transparência: pauta, resultados e ata ---- */
  function publicarTransparencia(s, oque) {
    if (typeof transpLer !== 'function' || typeof transpSalvar !== 'function') return;
    try {
      const agora = new Date().toISOString(); const dia = s.quando.slice(0, 10);
      const outros = transpLer().filter(i => !(i.origem === 'plenario' && i.sessao === s.id && i.tipoPl === oque));
      const base = { origem: 'plenario', sessao: s.id, tipoPl: oque, cat: 'legislativo', data: dia, competencia: dia.slice(0, 7), publicado: true, criadoEm: agora, atualizadoEm: agora };
      let item = null;
      if (oque === 'pauta') item = { ...base, id: 'pl-pauta-' + s.id, sub: 'Pautas das sessões', titulo: `Pauta — ${s.titulo} (${dataBR(s.quando)})`, descricao: s.itens.map((i, k) => { const p = prot(i.pid); return p ? `${k + 1}. ${p.numero} — ${p.ementa}` : ''; }).filter(Boolean).join(' · '), numero: s.titulo, texto: textoConvocacao(s) };
      if (oque === 'ata') item = { ...base, id: 'pl-ata-' + s.id, sub: 'Atas e lista de presença', titulo: `Ata — ${s.titulo} (${dataBR(s.quando)})${s.ata && s.ata.status === 'aprovada' ? ' · aprovada' : ''}`, descricao: `Presentes: ${presentes(s).map(nomeVer).join(', ')}. ${s.itens.filter(i => i.status === 'votado').map(i => { const p = prot(i.pid); return p ? `${p.numero}: ${i.resultado} (${i.placar.sim} × ${i.placar.nao})` : ''; }).join(' · ')}`, numero: s.titulo, texto: s.ata ? s.ata.texto : '' };
      if (item) transpSalvar([...outros, item]); else transpSalvar(outros);
    } catch (e) { }
  }

  /* ================= telão ================= */
  window.lgplTelao = function () {
    const url = (/\/painel\//.test(location.pathname) ? '' : 'painel/') + 'telao.html' + (selId ? '?s=' + encodeURIComponent(selId) : '');
    const w = window.open(url, 'lgpl-telao'); if (!w) UI().aviso('Permita janelas pop-up para abrir o telão.', 'erro');
  };

  /* ================= Portal do Vereador: cartão da sessão ================= */
  window.lgplCardVereador = function (a) {
    if (!A() || !a) return ''; const d = dados(); const s = sessaoAtiva(d); if (!s) return '';
    const hoje = new Date().toDateString() === new Date(s.quando).toDateString();
    const meu = (s.presenca || {})[a.v.id]; const it = s.itens.find(i => i.status === 'votacao'); const pres = a.v.id === comp().presidente;
    if (s.status === 'agendada') return pres ? `<div class="lgt-card lgpl-vcard"><div class="lgvr-card-cab"><h3>${ic('votacao')} ${esc(s.titulo)}</h3><span class="lgvr-tag t-av">Pauta a montar</span></div><p class="lgt-p">${esc(dataLonga(s.quando))} às ${hora(s.quando)}. Monte a pauta e publique a convocação.</p><button class="lgt-btn primario" type="button" onclick="lgplAbrir('pres')">Abrir a sessão plenária</button></div>` : '';
    const pauta = s.itens.map((i, k) => { const p = prot(i.pid); return p ? `<li><b>${k + 1}. ${esc(p.numero)}</b> ${esc(p.ementa)}${i.status === 'votado' ? ` <span class="lgvr-tag t-${/Aprovado|derrubado/.test(i.resultado) ? 'ok' : 'er'}">${esc(i.resultado)}</span>` : ''}</li>` : ''; }).join('');
    let acao = '';
    if (s.status === 'aberta' || (s.status === 'convocada' && hoje)) {
      if (!meu) acao = `<button class="lgt-btn primario lgpl-grande" type="button" data-edita onclick="lgplMinhaPresenca('${s.id}')">${ic('assinar')} Registrar minha presença</button>`;
      else acao = `<p class="lgpl-ok">${ic('assinar')} Presença registrada às ${hora(meu.hora)}</p>`;
    }
    let voto = '';
    if (s.status === 'aberta' && it) {
      const p = prot(it.pid); const meuVoto = it.votos[a.v.id]; const vota = quemVota(s, it).includes(a.v.id);
      voto = `<div class="lgpl-vvoto"><span class="lgpl-kicker"><i class="lgpl-ao-vivo"></i> Em votação agora</span><h4>${esc(p ? p.numero : '')}${ehVeto(p) ? ' · veto' : ''}</h4><p>${esc(p ? p.ementa : '')}</p>
        ${!meu ? '<p class="lgt-p">Registre sua presença para votar.</p>' : !vota ? '<p class="lgt-p">Nesta votação (maioria simples) o Presidente vota só se houver empate.</p>' :
        `<div class="lgpl-botoes" role="group" aria-label="Seu voto">${['Sim', 'Não', 'Abstenção'].map(v => `<button type="button" data-edita class="lgpl-bv b-${v === 'Sim' ? 'sim' : v === 'Não' ? 'nao' : 'abs'} ${meuVoto === v ? 'on' : ''}" aria-pressed="${meuVoto === v}" onclick="lgplVotar('${s.id}','${v}')">${esc(rotVoto(it, v))}</button>`).join('')}</div>
        <small>${meuVoto ? `Seu voto: <b>${esc(rotVoto(it, meuVoto))}</b>. Você pode mudar até o encerramento da votação.` : 'Toque na sua opção.'}</small>`}</div>`;
    }
    return `<div class="lgt-card lgpl-vcard ${s.status === 'aberta' ? 'aovivo' : ''}"><div class="lgvr-card-cab"><h3>${ic('votacao')} ${esc(s.titulo)}</h3><span class="lgvr-tag t-${EST_CLS[s.status]}">${s.status === 'convocada' ? 'Você foi convocado(a)' : ESTADOS[s.status]}</span></div>
      <p class="lgt-p">${esc(dataLonga(s.quando))} às ${hora(s.quando)} · ${esc(s.local)} · ${presentes(s).length} de ${totalVer()} presentes</p>
      ${acao}${voto}${pauta ? `<details ${s.status !== 'aberta' ? 'open' : ''}><summary>Pauta (${s.itens.length})</summary><ol class="lgpl-vpauta">${pauta}</ol></details>` : ''}
      <div class="lgt-acoes">${pres ? `<button class="lgt-btn" type="button" onclick="lgplAbrir('pres')">Conduzir a sessão</button>` : ''}<button class="lgt-btn" type="button" onclick="lgplVerConvocacao('${s.id}')">Convocação</button></div></div>`;
  };

  /* ================= pendências (usadas pelo sino de avisos) ================= */
  window.lgplPendencias = function (v) {
    if (!A()) return []; const d = dados(); const out = []; const s = sessaoAtiva(d); const o = operador();
    if (s && v) {
      if (s.status === 'convocada') out.push({ chave: `conv:${s.id}`, titulo: `Convocação: ${s.titulo}`, texto: `${dataLonga(s.quando)} às ${hora(s.quando)} · ${s.itens.length} item(ns) na pauta`, acao: "lgvrAbrir('sessoes')", area: 'vereador', quando: s.quando });
      if (s.status === 'aberta' && !(s.presenca || {})[v.id]) out.push({ chave: `pres:${s.id}`, titulo: `Sessão em andamento: registre sua presença`, texto: s.titulo, acao: "lgvrAbrir('sessoes')", area: 'vereador', urgente: true });
      const it = s.status === 'aberta' && s.itens.find(i => i.status === 'votacao');
      if (it && (s.presenca || {})[v.id] && quemVota(s, it).includes(v.id) && !it.votos[v.id]) { const p = prot(it.pid); out.push({ chave: `voto:${s.id}:${it.pid}:${it.inicioVotacao}`, titulo: `Votação aberta: ${p ? p.numero : ''}`, texto: p ? p.ementa : '', acao: "lgvrAbrir('sessoes')", area: 'vereador', urgente: true }); }
    }
    if (o) {
      d.sessoes.filter(x => x.status === 'encerrada' && (!x.ata || x.ata.status === 'rascunho')).forEach(x => out.push({ chave: `ata:${x.id}`, titulo: `Ata a publicar: ${x.titulo}`, texto: 'Confira o texto gerado, assine e publique.', acao: `lgplAbrir('${o.tipo === 'presidente' ? 'pres' : 'adm'}','${x.id}')`, area: o.tipo === 'presidente' ? 'vereador' : 'legislativo' }));
      const h = new Date(); const prox = ordenadas(d).find(x => x.status === 'agendada' && new Date(x.quando) > h && (new Date(x.quando) - h) < 7 * 864e5);
      if (prox) out.push({ chave: `pauta:${prox.id}`, titulo: `Montar pauta e convocar: ${prox.titulo}`, texto: `${dataLonga(prox.quando)} às ${hora(prox.quando)}`, acao: `lgplAbrir('${o.tipo === 'presidente' ? 'pres' : 'adm'}','${prox.id}')`, area: o.tipo === 'presidente' ? 'vereador' : 'legislativo', quando: prox.quando });
    }
    return out;
  };
  window.lgplDados = () => dados();
  window.lgplPresentes = presentes;

  /* atualiza as telas quando outra aba (telão, outro usuário no mesmo computador) muda a sessão */
  addEventListener('storage', e => { if (e.key === KEY) { desenhar(); try { const t = A() && A().tela(); if (['sessoes', 'inicio'].includes(t)) A().redesenhar(); } catch (er) { } } });

  /* ================= estilos ================= */
  const css = document.createElement('style'); css.id = 'lgpl-style'; css.textContent = `
  .lgpl-sel{display:flex;flex-direction:column;min-width:240px}.lgpl-sel select{height:38px;border-radius:9px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:0 10px;font:600 13px var(--v32-font,inherit);max-width:min(360px,80vw)}
  .lgpl-cab{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start}.lgpl-cab h2{margin:8px 0 4px;font-size:20px}.lgpl-cab p{margin:0;color:var(--lg28-muted);font-size:13.5px}.lgpl-cab-ac{display:flex;gap:8px;flex-wrap:wrap}
  .lgpl-trilho{list-style:none;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0;margin:12px 0}.lgpl-trilho li{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;border:1px solid var(--lg28-stroke);font-size:13px;color:var(--lg28-muted)}.lgpl-trilho b{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--lg28-stroke);font-size:12px;flex:none}
  .lgpl-trilho li.feito{color:var(--lg28-ink)}.lgpl-trilho li.feito b{background:#2fbf71;border-color:#2fbf71;color:#fff}.lgpl-trilho li.agora{border-color:#e2aa1c;color:var(--lg28-ink);font-weight:700}.lgpl-trilho li.agora b{background:#e2aa1c;border-color:#e2aa1c;color:#111}
  .lgpl-grade{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}.lgpl-centro{display:flex;flex-direction:column;gap:14px;min-width:0}
  .lgpl-q{font-weight:700;font-size:13px;padding:4px 10px;border-radius:20px;background:rgba(201,133,133,.15);color:#e08a8a}.lgpl-q.meio{background:rgba(226,170,28,.15);color:#e2aa1c}.lgpl-q.ok{background:rgba(47,191,113,.15);color:#2fbf71}
  .lgpl-qinfo{margin:6px 0 10px;font-size:12.5px;color:var(--lg28-muted)}
  .lgpl-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.lgpl-lista li{display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;border:1px solid var(--lg28-stroke);opacity:.7}.lgpl-lista li.on{opacity:1;border-color:rgba(47,191,113,.5)}
  .lgpl-lista li > span:nth-child(2){flex:1;min-width:0}.lgpl-lista b{display:block;font-size:13.5px}.lgpl-lista b small{font-weight:600;color:#e2aa1c;margin-left:4px}.lgpl-lista small{display:block;font-size:12px;color:var(--lg28-muted)}
  .lgpl-av{width:34px;height:34px;border-radius:50%;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex:none}.lgpl-lista li.on .lgpl-av{background:#2fbf71;color:#fff;border-color:#2fbf71}
  .lgpl-sim{margin-top:10px;border-style:dashed!important}
  .lgpl-pauta{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.lgpl-pi{display:flex;gap:12px;align-items:center;padding:10px;border-radius:10px;border:1px solid var(--lg28-stroke);flex-wrap:wrap}.lgpl-pi > div{flex:1;min-width:200px}.lgpl-pi b{display:block}.lgpl-pi span{display:block;font-size:13.5px}.lgpl-pi small{display:block;color:var(--lg28-muted);font-size:12px;margin-top:2px}
  .lgpl-ord{width:28px;height:28px;border-radius:8px;background:var(--lg28-inset);display:inline-flex!important;align-items:center;justify-content:center;font-weight:800;flex:none}
  .lgpl-pi-ac{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.lgpl-pi-ac select{padding:0 6px!important;line-height:1.2!important;height:32px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);font:600 12.5px var(--v32-font,inherit);padding:0 6px}
  .lgpl-exp{display:block;margin-top:12px}.lgpl-exp textarea,.lgpl-ata textarea{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:10px;font:14px/1.55 var(--v32-font,inherit)}
  .lgpl-agora h3{margin:6px 0 4px;font-size:22px}.lgpl-kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#e2aa1c}
  .lgpl-ao-vivo{width:9px;height:9px;border-radius:50%;background:#e5484d;display:inline-block;animation:lgplPulso 1.2s infinite}@keyframes lgplPulso{50%{opacity:.25}}
  .lgpl-ementa{font-size:15.5px;margin:4px 0 10px}.lgpl-regra{font-size:12.5px;color:var(--lg28-muted);margin:0 0 12px}
  .lgpl-placar{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.lgpl-placar div{border-radius:12px;padding:12px;text-align:center;border:1px solid var(--lg28-stroke)}.lgpl-placar b{display:block;font-size:30px;line-height:1}.lgpl-placar span{font-size:12px;color:var(--lg28-muted)}
  .lgpl-placar .sim b{color:#2fbf71}.lgpl-placar .nao b{color:#e5484d}.lgpl-placar .abs b{color:#8b9cff}.lgpl-placar .falta b{color:#e2aa1c}
  .lgpl-votos{list-style:none;margin:0 0 12px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px}.lgpl-votos li{padding:8px 10px;border-radius:10px;border:1px solid var(--lg28-stroke);display:flex;flex-direction:column;gap:4px}.lgpl-votos b{font-size:13px}.lgpl-votos span{font-size:12.5px;font-weight:700}
  .lgpl-votos select{padding:0 6px!important;line-height:1.2!important;height:28px;border-radius:7px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);font:500 12px var(--v32-font,inherit);padding:0 4px;max-width:100%}
  .lgpl-votos .v-sim{border-color:rgba(47,191,113,.6)}.lgpl-votos .v-sim span{color:#2fbf71}.lgpl-votos .v-nao{border-color:rgba(229,72,77,.6)}.lgpl-votos .v-nao span{color:#e5484d}.lgpl-votos .v-abstencao span{color:#8b9cff}.lgpl-votos .v-pend span{color:var(--lg28-muted)}
  .lgpl-ata-tx{font:14px/1.6 Georgia,serif;padding:14px;border-radius:10px;background:var(--lg28-inset);max-height:420px;overflow:auto;margin-bottom:10px}
  .lgpl-whats{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto}.lgpl-whats li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid var(--lg28-stroke);border-radius:10px}.lgpl-whats b{display:block}.lgpl-whats small{color:var(--lg28-muted);font-size:12px}.lgpl-whats a{text-decoration:none;display:inline-flex;align-items:center;gap:6px}
  .lgpl-msg{white-space:pre-wrap;font-size:12.5px;background:var(--lg28-inset);padding:10px;border-radius:8px}
  .lgpl-vcard.aovivo{border-color:#e5484d!important;box-shadow:0 0 0 1px rgba(229,72,77,.35)}.lgpl-vcard{margin-bottom:14px}.lgpl-grande{min-height:48px;font-size:15px!important}
  .lgpl-ok{display:flex;align-items:center;gap:8px;color:#2fbf71;font-weight:700;margin:6px 0}.lgpl-ok .lgv31-ic{width:18px;height:18px}
  .lgpl-vvoto{margin:12px 0;padding:14px;border-radius:12px;background:var(--lg28-inset)}.lgpl-vvoto h4{margin:6px 0 2px;font-size:18px}.lgpl-vvoto p{margin:0 0 10px}
  .lgpl-botoes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}.lgpl-bv{min-height:56px;border-radius:12px;border:2px solid var(--lg28-stroke);background:transparent;color:var(--lg28-ink);font:800 16px var(--v32-font,inherit);cursor:pointer}
  .lgpl-bv.b-sim.on{background:#2fbf71;border-color:#2fbf71;color:#fff}.lgpl-bv.b-nao.on{background:#e5484d;border-color:#e5484d;color:#fff}.lgpl-bv.b-abs.on{background:#5b6bd6;border-color:#5b6bd6;color:#fff}.lgpl-bv:focus-visible{outline:3px solid #e2aa1c;outline-offset:2px}
  .lgpl-vpauta{margin:8px 0 0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:13.5px}
  @media(max-width:1000px){.lgpl-grade{grid-template-columns:1fr}.lgpl-trilho{grid-template-columns:1fr 1fr}.lgpl-placar{grid-template-columns:1fr 1fr}}
  @media(max-width:560px){.lgpl-botoes{grid-template-columns:1fr}.lgpl-bv{min-height:52px}}
  @media (prefers-reduced-motion:reduce){.lgpl-ao-vivo{animation:none}}`;
  document.head.appendChild(css);
  setTimeout(() => { if (A()) { try { dados(); } catch (e) { } } }, 600);
})();
