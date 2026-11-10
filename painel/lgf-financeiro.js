/* =====================================================================
   LegislaGov — área FINANCEIRO (execução orçamentária da Câmara)
   Fluxo da despesa pública (Lei 4.320/1964):
     Dotação (LOA) → Empenho (arts. 58–61) → Liquidação (art. 63) → Pagamento (arts. 62 e 64)
   · Não permite empenhar acima do saldo da dotação (art. 59) nem pagar sem liquidar (art. 62).
   · Fila de pagamentos em ordem cronológica (Lei 14.133/2021, art. 141).
   · Tipos de empenho: ordinário, estimativo e global (art. 60 §§ 2º e 3º).
   · Publica automaticamente empenhos, liquidações, pagamentos e contratos no Portal da Transparência.
   Demonstração: dados no navegador. Em produção, a emissão oficial segue no sistema contábil (AUDESP).
   ===================================================================== */
(function () {
  const KEY = 'lgf_v1';
  const UI = () => window.lgtUI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const R$ = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = v => { if (typeof v === 'number') return v; const s = String(v || '').trim(); if (!s) return 0; return Number(s.replace(/\./g, '').replace(',', '.')) || 0; };
  const dataBR = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const hoje = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const P1 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0;

  const NATUREZAS = [
    ['3.1.90.11', 'Vencimentos e vantagens fixas – pessoal civil'], ['3.1.90.13', 'Obrigações patronais'], ['3.1.90.16', 'Outras despesas variáveis – pessoal civil'],
    ['3.1.91.13', 'Obrigações patronais – intraorçamentárias'], ['3.3.90.14', 'Diárias – civil'], ['3.3.90.30', 'Material de consumo'],
    ['3.3.90.33', 'Passagens e despesas com locomoção'], ['3.3.90.35', 'Serviços de consultoria'], ['3.3.90.36', 'Outros serviços de terceiros – pessoa física'],
    ['3.3.90.39', 'Outros serviços de terceiros – pessoa jurídica'], ['3.3.90.40', 'Serviços de tecnologia da informação e comunicação – PJ'],
    ['3.3.90.46', 'Auxílio-alimentação'], ['3.3.90.47', 'Obrigações tributárias e contributivas'], ['3.3.90.92', 'Despesas de exercícios anteriores'],
    ['3.3.90.93', 'Indenizações e restituições'], ['4.4.90.52', 'Equipamentos e material permanente'],
  ];
  const TIPOS_EMP = [['ordinario', 'Ordinário', 'Valor exato, pago de uma vez (ex.: compra de material).'], ['estimativo', 'Estimativo', 'Valor não conhecido de antemão (ex.: energia, água, combustível).'], ['global', 'Global', 'Valor certo pago em parcelas (ex.: contrato mensal, aluguel).']];
  const MODALIDADES = ['Pregão eletrônico', 'Concorrência', 'Dispensa de licitação', 'Inexigibilidade', 'Adesão a ata de registro de preços', 'Não se aplica (folha, encargos, diárias)'];

  /* ---------------- dados ---------------- */
  function vazio() { return { exercicio: new Date().getFullYear(), param: { orgao: '01 – Câmara Municipal de Neves Paulista', unidade: '01.01 – Secretaria da Câmara', ordenador: 'Edenilson Alexandre Roselli', cargoOrdenador: 'Presidente da Câmara', contador: '', crc: '', alertaDias: 60, autoPublicar: true }, dotacoes: [], credores: [], contratos: [], empenhos: [], seq: { emp: 0, liq: 0, pag: 0 } }; }
  let D = null;
  function carregar() { try { D = JSON.parse(localStorage.getItem(KEY)) || vazio(); } catch (e) { D = vazio(); } D.param = { ...vazio().param, ...(D.param || {}) }; D.seq = D.seq || { emp: 0, liq: 0, pag: 0 }; return D; }
  function salvar(acao, detalhe) {
    try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { UI().aviso('Espaço do navegador esgotado.', 'erro'); return false; }
    if (acao) UI().log('Financeiro', acao + (detalhe ? ': ' + detalhe : ''));
    if (D.param.autoPublicar) publicarTransparencia();
    return true;
  }
  const podeEditar = () => (window.lgNivelArea ? lgNivelArea('financeiro') : 'nenhum') === 'edicao';
  const podeVer = () => (window.lgNivelArea ? lgNivelArea('financeiro') : 'nenhum') !== 'nenhum';
  const exigeEdicao = () => { if (!podeEditar()) { UI().aviso('Seu acesso ao Financeiro é somente para consulta.', 'erro'); return false; } return true; };

  /* ---------------- cálculos ---------------- */
  const dot = id => D.dotacoes.find(x => x.id === id);
  const cred = id => D.credores.find(x => x.id === id);
  const ctr = id => D.contratos.find(x => x.id === id);
  const emp = id => D.empenhos.find(x => x.id === id);
  function calcEmp(e) {
    const anulado = (e.anulacoes || []).reduce((s, a) => s + a.valor, 0);
    const liquido = e.valor - anulado;
    const liquidado = (e.liquidacoes || []).reduce((s, l) => s + l.valor, 0);
    const pago = (e.pagamentos || []).reduce((s, p) => s + p.valor, 0);
    let status = 'Empenhado';
    if (liquido <= 0.004) status = 'Anulado'; else if (pago >= liquido - 0.004) status = 'Pago'; else if (pago > 0) status = 'Pago parcial'; else if (liquidado >= liquido - 0.004) status = 'Liquidado'; else if (liquidado > 0) status = 'Liquidado parcial';
    return { anulado, liquido, liquidado, pago, aLiquidar: liquido - liquidado, aPagar: liquidado - pago, status };
  }
  function calcDot(d) {
    const alt = (d.alteracoes || []).reduce((s, a) => s + (a.tipo === 'reducao' ? -a.valor : a.valor), 0);
    const atualizado = d.inicial + alt; let empenhado = 0, liquidado = 0, pago = 0;
    D.empenhos.filter(e => e.dotacaoId === d.id).forEach(e => { const c = calcEmp(e); empenhado += c.liquido; liquidado += c.liquidado; pago += c.pago; });
    return { alt, atualizado, empenhado, liquidado, pago, saldo: atualizado - empenhado };
  }
  function calcCtr(c) {
    const fim = (c.aditivos || []).reduce((f, a) => a.novoFim && a.novoFim > f ? a.novoFim : f, c.fim);
    const valorAtual = c.valor + (c.aditivos || []).reduce((s, a) => s + (a.valor || 0), 0);
    const empenhado = D.empenhos.filter(e => e.contratoId === c.id).reduce((s, e) => s + calcEmp(e).liquido, 0);
    const restam = dias(hoje(), fim);
    let situacao = 'Vigente'; if (c.encerrado) situacao = 'Encerrado'; else if (restam < 0) situacao = 'Vencido'; else if (restam <= D.param.alertaDias) situacao = 'A vencer';
    return { fim, valorAtual, empenhado, saldo: valorAtual - empenhado, restam, situacao };
  }
  /* numeração própria por ano, sem contar os exemplos (ex.: 0007/2026) */
  function proximo(lista, data) { const ano = String(data).slice(0, 4); const n = lista.filter(x => x && !String(x.numero).startsWith('EX') && !x.exemplo && String(x.numero).endsWith('/' + ano)).reduce((m, x) => Math.max(m, parseInt(x.numero, 10) || 0), 0); return String(n + 1).padStart(4, '0') + '/' + ano; }
  const nomeDot = d => d ? `Ficha ${d.ficha} · ${d.natureza} ${d.descNatureza}` : '—';
  const docFmt = d => { const s = String(d || '').replace(/\D/g, ''); if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); if (s.length === 11) return '***.' + s.slice(3, 6) + '.' + s.slice(6, 9) + '-**'; return d || ''; };

  /* ---------------- valor por extenso (nota de empenho) ---------------- */
  function extenso(v) {
    const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    const tres = n => { if (n === 100) return 'cem'; const c = Math.floor(n / 100), r = n % 100, p = []; if (c) p.push(C[c]); if (r < 20) { if (r) p.push(U[r]); } else { p.push(DZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : '')); } return p.join(' e '); };
    const inteiro = n => {
      if (n === 0) return 'zero'; const esc = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']]; const g = []; let i = 0;
      while (n > 0) { g.push([n % 1000, i]); n = Math.floor(n / 1000); i++; }
      const partes = g.filter(([q]) => q).reverse().map(([q, k]) => k === 0 ? tres(q) : k === 1 ? (q === 1 ? 'mil' : tres(q) + ' mil') : tres(q) + ' ' + (q === 1 ? esc[k][0] : esc[k][1]));
      if (partes.length > 1) { const ult = g.find(([q]) => q); const u = ult[0]; const sep = ult[1] === 0 && (u < 100 || u % 100 === 0) ? ' e ' : ' '; return partes.slice(0, -1).join(' ') + sep + partes[partes.length - 1]; }
      return partes[0];
    };
    const reais = Math.floor(Math.round(v * 100) / 100), cent = Math.round((v - reais) * 100);
    let t = reais ? inteiro(reais) + (reais === 1 ? ' real' : (/(ões|ão)$/.test(inteiro(reais)) ? ' de reais' : ' reais')) : '';
    if (cent) t += (t ? ' e ' : '') + inteiro(cent) + (cent === 1 ? ' centavo' : ' centavos');
    return t || 'zero real';
  }

  /* ---------------- publicação automática na transparência ---------------- */
  function publicarTransparencia() {
    if (typeof transpLer !== 'function') return;
    const outros = transpLer().filter(i => i.origem !== 'financeiro'); const agora = new Date().toISOString(); const novos = [];
    D.empenhos.filter(e => !e.exemplo).forEach(e => {
      const c = calcEmp(e), d = dot(e.dotacaoId), f = cred(e.credorId) || {};
      const forn = `${f.nome || ''}${f.doc ? ' · ' + docFmt(f.doc) : ''}`;
      novos.push({ id: 'fin-emp-' + e.id, origem: 'financeiro', cat: 'despesas', sub: 'Empenhos', titulo: `Empenho ${e.numero} — ${f.nome || ''}`, descricao: `${e.historico} · ${nomeDot(d)} · ${TIPOS_EMP.find(t => t[0] === e.tipo)?.[1] || ''}${c.anulado ? ' · anulado ' + R$(c.anulado) : ''}`, data: e.data, competencia: e.data.slice(0, 7), numero: e.numero, valor: c.liquido, fornecedor: forn, publicado: true, criadoEm: agora, atualizadoEm: agora });
      (e.liquidacoes || []).forEach(l => novos.push({ id: 'fin-liq-' + l.id, origem: 'financeiro', cat: 'despesas', sub: 'Liquidações', titulo: `Liquidação ${l.numero} — empenho ${e.numero}`, descricao: `${l.documento ? 'Documento fiscal ' + l.documento + ' · ' : ''}${e.historico}`, data: l.data, competencia: l.data.slice(0, 7), numero: l.numero, valor: l.valor, fornecedor: forn, publicado: true, criadoEm: agora, atualizadoEm: agora }));
      (e.pagamentos || []).forEach(p => novos.push({ id: 'fin-pag-' + p.id, origem: 'financeiro', cat: 'despesas', sub: 'Pagamentos', titulo: `Pagamento ${p.numero} — empenho ${e.numero}`, descricao: `${p.forma || ''}${p.justificativa ? ' · fora da ordem cronológica: ' + p.justificativa : ''}`, data: p.data, competencia: p.data.slice(0, 7), numero: p.numero, valor: p.valor, fornecedor: forn, publicado: true, criadoEm: agora, atualizadoEm: agora }));
    });
    D.contratos.filter(c => !c.exemplo).forEach(c => {
      const k = calcCtr(c), f = cred(c.credorId) || {};
      novos.push({ id: 'fin-ctr-' + c.id, origem: 'financeiro', cat: 'licitacoes', sub: 'Contratos', titulo: `Contrato ${c.numero} — ${c.objeto}`, descricao: `${c.modalidade}${c.processo ? ' · processo ' + c.processo : ''} · vigência ${dataBR(c.inicio)} a ${dataBR(k.fim)}${c.fiscal ? ' · fiscal: ' + c.fiscal : ''}`, data: c.inicio, competencia: c.inicio.slice(0, 7), numero: c.numero, valor: k.valorAtual, fornecedor: `${f.nome || ''}${f.doc ? ' · ' + docFmt(f.doc) : ''}`, publicado: true, criadoEm: agora, atualizadoEm: agora });
      (c.aditivos || []).forEach(a => novos.push({ id: 'fin-adt-' + a.id, origem: 'financeiro', cat: 'licitacoes', sub: 'Termos aditivos', titulo: `${a.numero} ao contrato ${c.numero}`, descricao: `${a.tipo}${a.novoFim ? ' · nova vigência até ' + dataBR(a.novoFim) : ''}${a.obs ? ' · ' + a.obs : ''}`, data: a.data, competencia: a.data.slice(0, 7), numero: a.numero, valor: a.valor || '', fornecedor: f.nome || '', publicado: true, criadoEm: agora, atualizadoEm: agora }));
    });
    try { transpSalvar([...outros, ...novos]); } catch (e) { }
  }

  /* ---------------- telas ---------------- */
  const TELAS = { geral: 'Visão geral', dotacoes: 'Dotações orçamentárias', empenhos: 'Empenhos', pagamentos: 'Liquidação e pagamento', contratos: 'Contratos', credores: 'Credores', parametros: 'Parâmetros' };
  const MARCA = { geral: 'finGeral', dotacoes: 'finDotacoes', empenhos: 'finEmpenhos', pagamentos: 'finPagamentos', contratos: 'finContratos', credores: 'finCredores', parametros: 'finParametros' };
  function criarTelas() {
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main || $('#view-lgf-geral')) return;
    main.insertAdjacentHTML('beforeend', Object.keys(TELAS).map(k => `<section class="view lgt lgf" id="view-lgf-${k}" style="display:none"></section>`).join(''));
    const antigo = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    Object.keys(TELAS).forEach(k => { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lgf-' + k; b.hidden = true; b.style.display = 'none'; antigo.appendChild(b); });
  }
  let telaAtual = 'geral';
  window.lgfAbrir = function (k) {
    if (!podeVer()) { UI().aviso('Seu usuário não tem acesso à área Financeiro.', 'erro'); return; }
    carregar(); criarTelas(); telaAtual = k = TELAS[k] ? k : 'geral';
    gotoShared('lgf-' + k); if (window.lgv31Mark) lgv31Mark(MARCA[k]);
    document.documentElement.classList.toggle('lgf-consulta', !podeEditar());
    desenhar(k); scrollTo(0, 0);
  };
  function desenhar(k) { ({ geral: telaGeral, dotacoes: telaDotacoes, empenhos: telaEmpenhos, pagamentos: telaPagamentos, contratos: telaContratos, credores: telaCredores, parametros: telaParametros })[k || telaAtual](); }
  const cab = (t, sub, acoes = '') => `<div class="letterhead"><div><h1>${t}</h1><div class="date">${sub}</div></div><div class="lgt-acoes">${acoes}</div></div>`;
  const btnEd = (txt, fn, cls = 'primario') => `<button class="lgt-btn ${cls}" type="button" data-edita onclick="${fn}">${txt}</button>`;
  const barra = (partes, total) => `<div class="lgf-barra" role="img" aria-label="${partes.map(p => p[2] + ' ' + R$(p[0])).join(', ')}">${partes.map(([v, cor]) => `<i style="width:${pct(v, total)}%;background:${cor}"></i>`).join('')}</div>`;
  const vazioCard = (titulo, texto, acao) => `<div class="lgf-vazio">${ic('dotacao')}<b>${titulo}</b><span>${texto}</span>${acao || ''}</div>`;
  const statusTag = s => `<span class="lgf-tag t-${s.toLowerCase().replace(/[^a-z]/g, '')}">${s}</span>`;

  /* ---- visão geral ---- */
  function telaGeral() {
    const el = $('#view-lgf-geral'); const ex = D.exercicio;
    if (!D.dotacoes.length) {
      el.innerHTML = cab('Financeiro', `Exercício ${ex} · execução orçamentária da Câmara`) + vazioCard('Comece pelas dotações do orçamento', 'Cadastre as dotações aprovadas na LOA (ficha, classificação e valor). Depois, emita empenhos, registre liquidações e pagamentos.',
        `<div class="lgt-acoes" style="justify-content:center">${btnEd('Cadastrar dotação', "lgfFormDotacao()")}${btnEd('Carregar dados de exemplo', 'lgfExemplo()', '')}</div>`);
      return;
    }
    let T = { atualizado: 0, empenhado: 0, liquidado: 0, pago: 0, saldo: 0 };
    const linhas = D.dotacoes.map(d => { const c = calcDot(d); Object.keys(T).forEach(k => T[k] += c[k]); return [d, c]; });
    const kpi = (n, v, extra, cor, p) => `<div class="lgf-kpi"><span>${n}</span><b>${R$(v)}</b>${extra ? `<small>${extra}</small>` : ''}${cor ? `<i style="--p:${(p || 0).toFixed(2)}%;--c:${cor}"></i>` : ''}</div>`;
    // alertas
    const al = [];
    D.contratos.forEach(c => { const k = calcCtr(c); if (k.situacao === 'Vencido') al.push(['erro', `Contrato ${c.numero} venceu há ${-k.restam} dia(s)`, c.objeto, `lgfVerContrato('${c.id}')`]); else if (k.situacao === 'A vencer') al.push(['aviso', `Contrato ${c.numero} vence em ${k.restam} dia(s)`, `${c.objeto} · ${dataBR(k.fim)}`, `lgfVerContrato('${c.id}')`]); });
    linhas.forEach(([d, c]) => { if (c.atualizado && c.saldo / c.atualizado < 0.1) al.push(['aviso', `Ficha ${d.ficha} com saldo de ${pct(c.saldo, c.atualizado).toFixed(0)}%`, `${d.descNatureza} · saldo ${R$(c.saldo)}`, `lgfAbrir('dotacoes')`]); });
    const fila = filaPagamento(); if (fila.length) al.push(['info', `${fila.length} liquidação(ões) aguardando pagamento`, `Total ${R$(fila.reduce((s, f) => s + f.saldo, 0))} · mais antiga há ${Math.max(...fila.map(f => dias(f.liq.data, hoje())))} dia(s)`, `lgfAbrir('pagamentos')`]);
    // mensal
    const mes = Array.from({ length: 12 }, () => ({ e: 0, p: 0 }));
    D.empenhos.forEach(e => { const c = calcEmp(e); if ((e.data || '').startsWith(String(ex))) mes[+e.data.slice(5, 7) - 1].e += c.liquido; (e.pagamentos || []).forEach(p => { if (p.data.startsWith(String(ex))) mes[+p.data.slice(5, 7) - 1].p += p.valor; }); });
    const max = Math.max(1, ...mes.map(m => Math.max(m.e, m.p)));
    const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    // por natureza
    const nat = {}; linhas.forEach(([d, c]) => { const k = d.natureza; nat[k] = nat[k] || { desc: d.descNatureza, atualizado: 0, empenhado: 0, liquidado: 0, pago: 0 }; ['atualizado', 'empenhado', 'liquidado', 'pago'].forEach(x => nat[k][x] += c[x]); });
    el.innerHTML = cab('Financeiro', `Exercício ${ex} · ${D.param.orgao}`, `<button class="lgt-btn" type="button" onclick="lgfExportar()">${ic('externo')} Exportar execução (CSV)</button>${btnEd('+ Novo empenho', 'lgfFormEmpenho()')}`) +
      (D.dotacoes.some(d => d.exemplo) ? `<div class="lgf-faixa-ex">Dados de exemplo carregados para demonstração. Eles não são publicados no Portal da Transparência. <button class="lgt-mini" type="button" data-edita onclick="lgfLimparExemplo()">Remover exemplos</button></div>` : '') +
      `<div class="lgf-kpis">${kpi('Orçamento atualizado', T.atualizado, `${D.dotacoes.length} dotações`)}${kpi('Empenhado', T.empenhado, P1(pct(T.empenhado, T.atualizado)) + ' do orçamento', '#39bdf6', pct(T.empenhado, T.atualizado))}${kpi('Liquidado', T.liquidado, P1(pct(T.liquidado, T.atualizado)) + ' do orçamento', '#a78bfa', pct(T.liquidado, T.atualizado))}${kpi('Pago', T.pago, P1(pct(T.pago, T.atualizado)) + ' do orçamento', '#2fbf71', pct(T.pago, T.atualizado))}${kpi('Saldo a empenhar', T.saldo, P1(pct(T.saldo, T.atualizado)) + ' disponível', '#e2aa1c', pct(T.saldo, T.atualizado))}</div>
      <div class="lgf-grade">
        <div class="lgt-card"><div class="lgf-card-cab"><h3>Execução por natureza da despesa</h3><span class="lgf-leg"><i style="background:#2fbf71"></i>Pago<i style="background:#a78bfa"></i>Liquidado<i style="background:#39bdf6"></i>Empenhado<i style="background:var(--lg28-stroke)"></i>Saldo</span></div>
          <div class="lgf-nat">${Object.entries(nat).sort((a, b) => b[1].atualizado - a[1].atualizado).map(([k, n]) => `<div class="lgf-nat-l"><div class="lgf-nat-t"><span><b>${k}</b> ${esc(n.desc)}</span><span>${R$(n.empenhado)} <small>de ${R$(n.atualizado)}</small></span></div>${barra([[n.pago, '#2fbf71', 'pago'], [n.liquidado - n.pago, '#a78bfa', 'liquidado'], [n.empenhado - n.liquidado, '#39bdf6', 'empenhado']], n.atualizado)}</div>`).join('')}</div></div>
        <div class="lgt-card"><div class="lgf-card-cab"><h3>Alertas</h3><span class="lgf-n">${al.length}</span></div>
          <div class="lgf-alertas">${al.length ? al.map(([t, a, b, fn]) => `<button type="button" class="lgf-alerta a-${t}" onclick="${fn}"><i></i><span><b>${esc(a)}</b><small>${esc(b)}</small></span></button>`).join('') : '<p class="lgt-p">Nenhum alerta. Contratos em dia, dotações com saldo e pagamentos em ordem.</p>'}</div></div>
      </div>
      <div class="lgt-card" style="margin-top:14px"><div class="lgf-card-cab"><h3>Empenhado x pago por mês (${ex})</h3><span class="lgf-leg"><i style="background:#39bdf6"></i>Empenhado<i style="background:#2fbf71"></i>Pago</span></div>
        <div class="lgf-meses">${mes.map((m, i) => `<div class="lgf-mes" title="${M[i]}: empenhado ${R$(m.e)}, pago ${R$(m.p)}"><div class="lgf-col"><i style="height:${m.e / max * 100}%;background:#39bdf6"></i><i style="height:${m.p / max * 100}%;background:#2fbf71"></i></div><span>${M[i]}</span></div>`).join('')}</div></div>
      <div class="lgf-atalhos">${[['empenho', 'Empenhos', `${D.empenhos.length} emitidos`, 'empenhos'], ['pagamento', 'A pagar', `${fila.length} na fila`, 'pagamentos'], ['contrato', 'Contratos', `${D.contratos.filter(c => calcCtr(c).situacao !== 'Encerrado').length} ativos`, 'contratos'], ['credor', 'Credores', `${D.credores.length} cadastrados`, 'credores']].map(([i, t, s, k]) => `<button type="button" onclick="lgfAbrir('${k}')">${ic(i)}<span><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>`;
  }

  /* ---- dotações ---- */
  function telaDotacoes() {
    const el = $('#view-lgf-dotacoes');
    el.innerHTML = cab('Dotações orçamentárias', `Créditos do orçamento ${D.exercicio} (LOA) com alterações, empenhado e saldo disponível`, btnEd('+ Nova dotação', 'lgfFormDotacao()')) +
      (D.dotacoes.length ? `<div class="lgt-tabela-wrap"><table class="lgt-tabela lgf-tab"><thead><tr><th>Ficha</th><th>Classificação</th><th class="num">Orçado</th><th class="num">Alterações</th><th class="num">Atualizado</th><th class="num">Empenhado</th><th class="num">Saldo</th><th>Execução</th><th class="acoes-col">Ações</th></tr></thead><tbody>
      ${D.dotacoes.slice().sort((a, b) => String(a.ficha).localeCompare(String(b.ficha), 'pt', { numeric: true })).map(d => { const c = calcDot(d); return `<tr><td><b>${esc(d.ficha)}</b></td><td><b>${esc(d.natureza)} – ${esc(d.descNatureza)}</b><small>${esc(d.funcional)} · ${esc(d.acao)} · Fonte ${esc(d.fonte)}${d.aplicacao ? ' · Aplic. ' + esc(d.aplicacao) : ''}</small></td>
        <td class="num">${R$(d.inicial)}</td><td class="num ${c.alt < 0 ? 'neg' : ''}">${c.alt ? R$(c.alt) : '—'}</td><td class="num"><b>${R$(c.atualizado)}</b></td><td class="num">${R$(c.empenhado)}</td><td class="num ${c.saldo / (c.atualizado || 1) < .1 ? 'alerta' : ''}"><b>${R$(c.saldo)}</b></td>
        <td style="min-width:120px">${barra([[c.pago, '#2fbf71', 'pago'], [c.liquidado - c.pago, '#a78bfa', 'liquidado'], [c.empenhado - c.liquidado, '#39bdf6', 'empenhado']], c.atualizado)}<small>${pct(c.empenhado, c.atualizado).toFixed(0)}% empenhado</small></td>
        <td class="acoes-col"><button class="lgt-mini" type="button" data-edita onclick="lgfCredito('${d.id}')">Crédito adicional</button><button class="lgt-mini" type="button" data-edita onclick="lgfFormDotacao('${d.id}')">Editar</button></td></tr>`; }).join('')}</tbody></table></div>
      <p class="lgt-p" style="margin-top:12px">Saldo = orçamento atualizado − empenhado. A Lei 4.320/1964 (art. 59) proíbe empenhar acima do saldo; o sistema bloqueia automaticamente.</p>`
        : vazioCard('Nenhuma dotação cadastrada', 'Cadastre as fichas do orçamento aprovado (LOA) para começar a empenhar.', `<div class="lgt-acoes" style="justify-content:center">${btnEd('+ Nova dotação', 'lgfFormDotacao()')}${btnEd('Carregar dados de exemplo', 'lgfExemplo()', '')}</div>`));
  }
  window.lgfFormDotacao = function (id) {
    if (!exigeEdicao()) return; const d = id ? dot(id) : { funcional: '01.031.0001.2001', acao: 'Manutenção das atividades legislativas', fonte: '01 – Tesouro', aplicacao: '110.000' };
    UI().abrirModal(form(id ? 'Editar dotação' : 'Nova dotação', `
      <label><span>Ficha *</span><input name="ficha" required value="${esc(d.ficha || '')}" placeholder="Ex.: 07"></label>
      <label><span>Valor orçado (LOA) *</span><input name="inicial" inputmode="decimal" required value="${d.inicial != null ? String(d.inicial).replace('.', ',') : ''}" placeholder="0,00"></label>
      <label class="cheio"><span>Natureza da despesa *</span><select name="natureza">${NATUREZAS.map(([c, n]) => `<option value="${c}"${c === d.natureza ? ' selected' : ''}>${c} – ${n}</option>`).join('')}</select></label>
      <label><span>Funcional programática</span><input name="funcional" value="${esc(d.funcional || '')}" placeholder="01.031.0001.2001"></label>
      <label><span>Ação / projeto-atividade</span><input name="acao" value="${esc(d.acao || '')}"></label>
      <label><span>Fonte de recurso</span><input name="fonte" value="${esc(d.fonte || '')}"></label>
      <label><span>Código de aplicação</span><input name="aplicacao" value="${esc(d.aplicacao || '')}"></label>`, id ? 'Salvar' : 'Cadastrar dotação'), true);
    onSubmit(f => {
      const v = num(f.inicial.value); if (!f.ficha.value.trim() || v <= 0) return 'Informe a ficha e um valor orçado maior que zero.';
      const n = NATUREZAS.find(x => x[0] === f.natureza.value);
      const novo = { ...(id ? d : { id: uid('d'), alteracoes: [] }), ficha: f.ficha.value.trim(), inicial: v, natureza: n[0], descNatureza: n[1], funcional: f.funcional.value.trim(), acao: f.acao.value.trim(), fonte: f.fonte.value.trim(), aplicacao: f.aplicacao.value.trim() };
      if (id && calcDot(novo).saldo < -0.004) return 'O novo valor deixaria a dotação com saldo negativo diante do que já foi empenhado.';
      if (!id) D.dotacoes.push(novo); else Object.assign(d, novo);
      salvar(id ? 'Editou dotação' : 'Cadastrou dotação', 'Ficha ' + novo.ficha); UI().fecharModal(); desenhar(); UI().aviso('Dotação salva.');
    });
  };
  window.lgfCredito = function (id) {
    if (!exigeEdicao()) return; const d = dot(id); const c = calcDot(d);
    UI().abrirModal(form(`Crédito adicional · Ficha ${esc(d.ficha)}`, `
      <p class="lgt-p cheio">${esc(d.natureza)} – ${esc(d.descNatureza)}<br>Atualizado: <b>${R$(c.atualizado)}</b> · Saldo: <b>${R$(c.saldo)}</b></p>
      <label><span>Tipo</span><select name="tipo"><option value="suplementacao">Suplementação (+)</option><option value="reducao">Redução / anulação (−)</option></select></label>
      <label><span>Valor *</span><input name="valor" inputmode="decimal" required placeholder="0,00"></label>
      <label><span>Ato (decreto / resolução) *</span><input name="ato" required placeholder="Ex.: Resolução nº 05/2026"></label>
      <label><span>Data *</span><input name="data" type="date" required value="${hoje()}"></label>`, 'Registrar'), true);
    onSubmit(f => {
      const v = num(f.valor.value); if (v <= 0 || !f.ato.value.trim()) return 'Informe valor e ato.';
      if (f.tipo.value === 'reducao' && v > c.saldo + 0.004) return `A redução não pode ser maior que o saldo disponível (${R$(c.saldo)}).`;
      d.alteracoes = d.alteracoes || []; d.alteracoes.push({ id: uid('a'), tipo: f.tipo.value, valor: v, ato: f.ato.value.trim(), data: f.data.value });
      salvar('Crédito adicional', `Ficha ${d.ficha} ${f.tipo.value} ${R$(v)}`); UI().fecharModal(); desenhar(); UI().aviso('Crédito registrado.');
    });
  };

  /* ---- empenhos ---- */
  let filtroEmp = { q: '', st: '', tipo: '' };
  function telaEmpenhos() {
    const el = $('#view-lgf-empenhos');
    el.innerHTML = cab('Empenhos', `Reserva da dotação para cada despesa assumida (Lei 4.320/1964, arts. 58 a 61)`, btnEd('+ Novo empenho', 'lgfFormEmpenho()')) +
      `<div class="lgt-filtros"><label class="cresce"><span>Buscar</span><input id="lgf-q" value="${esc(filtroEmp.q)}" placeholder="Número, credor, histórico…"></label>
       <label><span>Situação</span><select id="lgf-st"><option value="">Todas</option>${['Empenhado', 'Liquidado parcial', 'Liquidado', 'Pago parcial', 'Pago', 'Anulado'].map(s => `<option${s === filtroEmp.st ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
       <label><span>Tipo</span><select id="lgf-tp"><option value="">Todos</option>${TIPOS_EMP.map(([k, n]) => `<option value="${k}"${k === filtroEmp.tipo ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela lgf-tab"><thead><tr><th>Nº</th><th>Data</th><th>Credor · histórico</th><th>Dotação</th><th class="num">Valor</th><th class="num">Liquidado</th><th class="num">Pago</th><th>Situação</th><th class="acoes-col"></th></tr></thead><tbody id="lgf-emp-corpo"></tbody></table></div>`;
    const go = () => {
      const q = filtroEmp.q.toLowerCase();
      const l = D.empenhos.filter(e => { const c = calcEmp(e); const f = cred(e.credorId) || {}; return (!filtroEmp.st || c.status === filtroEmp.st) && (!filtroEmp.tipo || e.tipo === filtroEmp.tipo) && (!q || [e.numero, f.nome, f.doc, e.historico, e.processo].join(' ').toLowerCase().includes(q)); })
        .sort((a, b) => b.numero.localeCompare(a.numero, 'pt', { numeric: true }));
      $('#lgf-emp-corpo').innerHTML = l.length ? l.map(e => { const c = calcEmp(e), f = cred(e.credorId) || {}, d = dot(e.dotacaoId); return `<tr class="lgf-click" onclick="lgfVerEmpenho('${e.id}')"><td><b>${e.numero}</b><small>${TIPOS_EMP.find(t => t[0] === e.tipo)?.[1]}</small></td><td class="nowrap">${dataBR(e.data)}</td><td><b>${esc(f.nome || '—')}</b><small>${esc(e.historico)}</small></td><td><small>Ficha ${esc(d?.ficha || '')} · ${esc(d?.natureza || '')}</small></td><td class="num"><b>${R$(c.liquido)}</b>${c.anulado ? `<small>anulado ${R$(c.anulado)}</small>` : ''}</td><td class="num">${R$(c.liquidado)}</td><td class="num">${R$(c.pago)}</td><td>${statusTag(c.status)}</td><td class="acoes-col"><button class="lgt-mini" type="button">Abrir</button></td></tr>`; }).join('')
        : `<tr><td colspan="9" class="lgt-vazio"><b>${D.empenhos.length ? 'Nenhum empenho com esses filtros.' : 'Nenhum empenho emitido.'}</b><span>${D.dotacoes.length ? 'Clique em “+ Novo empenho”.' : 'Cadastre as dotações antes de empenhar.'}</span></td></tr>`;
    };
    $('#lgf-q').oninput = e => { filtroEmp.q = e.target.value; go(); }; $('#lgf-st').oninput = e => { filtroEmp.st = e.target.value; go(); }; $('#lgf-tp').oninput = e => { filtroEmp.tipo = e.target.value; go(); };
    go();
  }
  window.lgfFormEmpenho = function (contratoId) {
    if (!exigeEdicao()) return;
    if (!D.dotacoes.length) { UI().aviso('Cadastre uma dotação antes de empenhar.', 'erro'); return; }
    if (!D.credores.length) { UI().aviso('Cadastre um credor antes de empenhar.', 'erro'); lgfFormCredor(null, () => lgfFormEmpenho(contratoId)); return; }
    const c0 = contratoId ? ctr(contratoId) : null;
    UI().abrirModal(form('Novo empenho', `
      <fieldset class="cheio lgf-tipos"><legend>Tipo de empenho *</legend>${TIPOS_EMP.map(([k, n, d], i) => `<label class="lgf-tipo"><input type="radio" name="tipo" value="${k}" ${(c0 ? k === 'global' : i === 0) ? 'checked' : ''}><span><b>${n}</b><small>${d}</small></span></label>`).join('')}</fieldset>
      <label><span>Data *</span><input name="data" type="date" required value="${hoje()}"></label>
      <label><span>Contrato (opcional)</span><select name="contrato"><option value="">Sem contrato</option>${D.contratos.filter(c => !c.encerrado).map(c => `<option value="${c.id}"${c.id === contratoId ? ' selected' : ''}>${esc(c.numero)} – ${esc(c.objeto).slice(0, 50)}</option>`).join('')}</select></label>
      <label class="cheio"><span>Dotação *</span><select name="dotacao" required>${D.dotacoes.map(d => { const c = calcDot(d); return `<option value="${d.id}" data-saldo="${c.saldo}">Ficha ${esc(d.ficha)} · ${esc(d.natureza)} ${esc(d.descNatureza)} — saldo ${R$(c.saldo)}</option>`; }).join('')}</select></label>
      <label class="cheio"><span>Credor *</span><span class="lgf-linha"><select name="credor" required>${D.credores.map(f => `<option value="${f.id}">${esc(f.nome)} ${f.doc ? '· ' + docFmt(f.doc) : ''}</option>`).join('')}</select><button type="button" class="lgt-btn" onclick="lgfFormCredor(null,()=>lgfFormEmpenho())">+ Credor</button></span></label>
      <label><span>Modalidade</span><select name="modalidade">${MODALIDADES.map(m => `<option>${m}</option>`).join('')}</select></label>
      <label><span>Processo</span><input name="processo" placeholder="Ex.: 045/2026"></label>
      <label class="cheio"><span>Histórico (o que está sendo comprado/contratado) *</span><textarea name="historico" rows="2" required maxlength="400"></textarea></label>
      <label><span>Valor *</span><input name="valor" inputmode="decimal" required placeholder="0,00"></label>
      <div class="lgf-saldo" id="lgf-saldo-info"></div>`, 'Emitir empenho'), true);
    const f = $('#lgt-modal form');
    const info = () => {
      const d = dot(f.dotacao.value), c = calcDot(d), v = num(f.valor.value), k = f.contrato.value ? calcCtr(ctr(f.contrato.value)) : null;
      $('#lgf-saldo-info').innerHTML = `<span>Saldo da dotação <b>${R$(c.saldo)}</b></span><span>Após o empenho <b class="${c.saldo - v < 0 ? 'neg' : ''}">${R$(c.saldo - v)}</b></span>${k ? `<span>Saldo do contrato <b class="${k.saldo - v < 0 ? 'neg' : ''}">${R$(k.saldo)}</b></span>` : ''}`;
    };
    const doContrato = () => { const c = f.contrato.value ? ctr(f.contrato.value) : null; if (c) { if (c.dotacaoId) f.dotacao.value = c.dotacaoId; f.credor.value = c.credorId; f.modalidade.value = c.modalidade; f.processo.value = c.processo || ''; if (!f.historico.value) f.historico.value = c.objeto; } info(); };
    f.contrato.onchange = doContrato; f.dotacao.onchange = info; f.valor.oninput = info; doContrato();
    onSubmit(f => {
      const v = num(f.valor.value); const d = dot(f.dotacao.value); const c = calcDot(d);
      if (v <= 0 || !f.historico.value.trim()) return 'Informe o histórico e um valor maior que zero.';
      if (v > c.saldo + 0.004) return `Saldo insuficiente na dotação (${R$(c.saldo)}). Faça uma suplementação antes (Lei 4.320, art. 59).`;
      if (f.contrato.value) { const k = calcCtr(ctr(f.contrato.value)); if (v > k.saldo + 0.004) return `O valor ultrapassa o saldo do contrato (${R$(k.saldo)}). Registre um aditivo antes.`; }
      const e = { id: uid('e'), numero: proximo(D.empenhos, f.data.value), data: f.data.value, tipo: f.tipo.value, dotacaoId: d.id, credorId: f.credor.value, contratoId: f.contrato.value || '', modalidade: f.modalidade.value, processo: f.processo.value.trim(), historico: f.historico.value.trim(), valor: v, anulacoes: [], liquidacoes: [], pagamentos: [], emitidoPor: (UI().usuario() || {}).nome || '' };
      D.empenhos.push(e); salvar('Emitiu empenho', `${e.numero} ${R$(v)}`); UI().fecharModal(); UI().aviso(`Empenho ${e.numero} emitido.`);
      if (telaAtual !== 'empenhos') desenhar(); else telaEmpenhos(); lgfVerEmpenho(e.id);
    });
  };
  window.lgfVerEmpenho = function (id) {
    const e = emp(id); if (!e) return; const c = calcEmp(e), d = dot(e.dotacaoId), f = cred(e.credorId) || {}, k = e.contratoId ? ctr(e.contratoId) : null;
    const eventos = [[e.data, 'Empenho emitido', R$(e.valor), 'e'], ...(e.anulacoes || []).map(a => [a.data, 'Anulação', '− ' + R$(a.valor) + (a.motivo ? ' · ' + a.motivo : ''), 'a']), ...(e.liquidacoes || []).map(l => [l.data, `Liquidação ${l.numero}`, R$(l.valor) + (l.documento ? ' · doc. ' + l.documento : '') + (l.atesto ? ' · atestado por ' + l.atesto : ''), 'l']), ...(e.pagamentos || []).map(p => [p.data, `Pagamento ${p.numero}`, R$(p.valor) + (p.forma ? ' · ' + p.forma : '') + (p.justificativa ? ' · fora da ordem: ' + p.justificativa : ''), 'p'])].sort((a, b) => a[0].localeCompare(b[0]));
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Empenho ${e.numero} ${statusTag(c.status)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgf-det">
        <div class="lgf-det-kpi"><div><span>Valor líquido</span><b>${R$(c.liquido)}</b></div><div><span>Liquidado</span><b>${R$(c.liquidado)}</b></div><div><span>Pago</span><b>${R$(c.pago)}</b></div><div><span>A liquidar</span><b>${R$(c.aLiquidar)}</b></div></div>
        <dl class="lgf-dl"><dt>Credor</dt><dd>${esc(f.nome || '—')} ${f.doc ? '· ' + docFmt(f.doc) : ''}</dd><dt>Tipo</dt><dd>${TIPOS_EMP.find(t => t[0] === e.tipo)?.[1]}</dd><dt>Dotação</dt><dd>${esc(nomeDot(d))}<br><small>${esc(d?.funcional || '')} · Fonte ${esc(d?.fonte || '')}</small></dd><dt>Modalidade</dt><dd>${esc(e.modalidade || '—')}${e.processo ? ' · processo ' + esc(e.processo) : ''}</dd>${k ? `<dt>Contrato</dt><dd>${esc(k.numero)} – ${esc(k.objeto)}</dd>` : ''}<dt>Histórico</dt><dd>${esc(e.historico)}</dd><dt>Emitido por</dt><dd>${esc(e.emitidoPor || '—')}</dd></dl>
        <h3 class="lgf-h3">Linha do tempo</h3><ol class="lgf-tempo">${eventos.map(([dt, t, v, cls]) => `<li class="ev-${cls}"><span>${dataBR(dt)}</span><b>${t}</b><small>${esc(v)}</small></li>`).join('')}</ol>
      </div>
      <div class="lgt-modal-rod lgf-rod"><button type="button" class="lgt-btn" onclick="lgfNota('${e.id}')">${ic('empenho')} Nota de empenho</button>
        ${c.aLiquidar > 0.004 ? `<button type="button" class="lgt-btn" data-edita onclick="lgfAnular('${e.id}')">Anular saldo</button><button type="button" class="lgt-btn primario" data-edita onclick="lgfLiquidar('${e.id}')">Liquidar</button>` : ''}
        ${c.aPagar > 0.004 ? `<button type="button" class="lgt-btn primario" data-edita onclick="lgfAbrir('pagamentos');lgtFechar()">Ir para pagamento</button>` : ''}</div></div>`);
  };
  window.lgfAnular = function (id) {
    if (!exigeEdicao()) return; const e = emp(id), c = calcEmp(e);
    UI().abrirModal(form(`Anular empenho ${e.numero}`, `<p class="lgt-p cheio">A anulação devolve o valor ao saldo da dotação. Só é possível anular a parte ainda não liquidada: <b>${R$(c.aLiquidar)}</b>.</p>
      <label><span>Valor a anular *</span><input name="valor" inputmode="decimal" required value="${String(c.aLiquidar.toFixed(2)).replace('.', ',')}"></label><label><span>Data *</span><input name="data" type="date" value="${hoje()}" required></label>
      <label class="cheio"><span>Motivo *</span><input name="motivo" required placeholder="Ex.: saldo de empenho estimativo não utilizado"></label>`, 'Anular'), true);
    onSubmit(f => { const v = num(f.valor.value); if (v <= 0 || v > c.aLiquidar + 0.004) return `Informe um valor entre R$ 0,01 e ${R$(c.aLiquidar)}.`; if (!f.motivo.value.trim()) return 'Informe o motivo.'; e.anulacoes.push({ id: uid('n'), data: f.data.value, valor: v, motivo: f.motivo.value.trim() }); salvar('Anulou empenho', `${e.numero} ${R$(v)}`); UI().fecharModal(); desenhar(); UI().aviso('Anulação registrada.'); lgfVerEmpenho(e.id); });
  };
  window.lgfLiquidar = function (id) {
    if (!exigeEdicao()) return; const e = emp(id), c = calcEmp(e), u = UI().usuario() || {};
    UI().abrirModal(form(`Liquidar empenho ${e.numero}`, `<p class="lgt-p cheio">Liquidação é a conferência de que o material foi entregue ou o serviço prestado (Lei 4.320, art. 63). Saldo a liquidar: <b>${R$(c.aLiquidar)}</b>.</p>
      <label><span>Valor *</span><input name="valor" inputmode="decimal" required value="${String(c.aLiquidar.toFixed(2)).replace('.', ',')}"></label><label><span>Data *</span><input name="data" type="date" value="${hoje()}" required></label>
      <label><span>Nota fiscal / documento *</span><input name="documento" required placeholder="Ex.: NF-e 1234"></label><label><span>Atestado por *</span><input name="atesto" required value="${esc(u.nome || '')}"></label>
      <label class="cheio checkbox"><input type="checkbox" name="ok" required> Confirmo que o material/serviço foi recebido conforme o empenho.</label>`, 'Registrar liquidação'), true);
    onSubmit(f => { const v = num(f.valor.value); if (v <= 0 || v > c.aLiquidar + 0.004) return `Valor deve estar entre R$ 0,01 e ${R$(c.aLiquidar)}.`; if (!f.documento.value.trim() || !f.atesto.value.trim() || !f.ok.checked) return 'Preencha o documento, quem atesta e confirme o recebimento.';
      e.liquidacoes.push({ id: uid('l'), numero: proximo(D.empenhos.filter(x => !x.exemplo).flatMap(x => x.liquidacoes || []), f.data.value), data: f.data.value, valor: v, documento: f.documento.value.trim(), atesto: f.atesto.value.trim() });
      salvar('Liquidou empenho', `${e.numero} ${R$(v)}`); UI().fecharModal(); desenhar(); UI().aviso('Liquidação registrada. Ela entrou na fila de pagamento.'); lgfVerEmpenho(e.id); });
  };

  /* ---- liquidação e pagamento ---- */
  function filaPagamento() {
    const fila = []; D.empenhos.forEach(e => { const pagos = {}; (e.pagamentos || []).forEach(p => pagos[p.liquidacaoId] = (pagos[p.liquidacaoId] || 0) + p.valor); (e.liquidacoes || []).forEach(l => { const saldo = l.valor - (pagos[l.id] || 0); if (saldo > 0.004) fila.push({ e, liq: l, saldo, fonte: dot(e.dotacaoId)?.fonte || '' }); }); });
    return fila.sort((a, b) => a.liq.data.localeCompare(b.liq.data) || a.liq.numero.localeCompare(b.liq.numero));
  }
  let abaPag = 'pagar';
  function telaPagamentos() {
    const el = $('#view-lgf-pagamentos'); const fila = filaPagamento();
    const aLiq = D.empenhos.map(e => [e, calcEmp(e)]).filter(([, c]) => c.aLiquidar > 0.004);
    const todosPag = D.empenhos.flatMap(e => (e.pagamentos || []).map(p => ({ e, p }))).sort((a, b) => b.p.data.localeCompare(a.p.data)); const pagos = todosPag.slice(0, 50); const pagoAno = todosPag.filter(x => x.p.data.startsWith(String(D.exercicio))).reduce((s, x) => s + x.p.valor, 0);
    el.innerHTML = cab('Liquidação e pagamento', 'Pagamentos na ordem cronológica das liquidações, por fonte de recurso (Lei 14.133/2021, art. 141)') +
      `<div class="lgt-kpis lgf-kpis3"><div><b>${R$(aLiq.reduce((s, [, c]) => s + c.aLiquidar, 0))}</b><span>a liquidar (${aLiq.length} empenhos)</span></div><div><b>${R$(fila.reduce((s, f) => s + f.saldo, 0))}</b><span>liquidado a pagar (${fila.length})</span></div><div><b>${R$(pagoAno)}</b><span>pago em ${D.exercicio}</span></div></div>
      <div class="lgf-abas" role="tablist"><button type="button" role="tab" aria-selected="${abaPag === 'pagar'}" onclick="lgfAbaPag('pagar')">A pagar · ordem cronológica <b>${fila.length}</b></button><button type="button" role="tab" aria-selected="${abaPag === 'liquidar'}" onclick="lgfAbaPag('liquidar')">A liquidar <b>${aLiq.length}</b></button><button type="button" role="tab" aria-selected="${abaPag === 'pagos'}" onclick="lgfAbaPag('pagos')">Pagos</button></div>` +
      (abaPag === 'pagar' ? `<div class="lgt-tabela-wrap"><table class="lgt-tabela lgf-tab"><thead><tr><th>Posição</th><th>Liquidação</th><th>Credor · empenho</th><th>Fonte</th><th class="num">Na fila</th><th class="num">Valor a pagar</th><th class="acoes-col"></th></tr></thead><tbody>${fila.length ? fila.map((x, i) => { const pos = fila.filter(y => y.fonte === x.fonte).indexOf(x) + 1; return `<tr><td><span class="lgf-pos">${pos}º</span></td><td><b>${x.liq.numero}</b><small>${dataBR(x.liq.data)} · ${esc(x.liq.documento || '')}</small></td><td><b>${esc(cred(x.e.credorId)?.nome || '')}</b><small>Empenho ${x.e.numero} · ${esc(x.e.historico).slice(0, 60)}</small></td><td><small>${esc(x.fonte)}</small></td><td class="num">${dias(x.liq.data, hoje())} dia(s)</td><td class="num"><b>${R$(x.saldo)}</b></td><td class="acoes-col"><button class="lgt-mini" type="button" data-edita onclick="lgfPagar('${x.e.id}','${x.liq.id}')">Pagar</button></td></tr>`; }).join('') : '<tr><td colspan="7" class="lgt-vazio"><b>Nenhuma liquidação aguardando pagamento.</b></td></tr>'}</tbody></table></div>` : '') +
      (abaPag === 'liquidar' ? `<div class="lgt-tabela-wrap"><table class="lgt-tabela lgf-tab"><thead><tr><th>Empenho</th><th>Credor · histórico</th><th>Tipo</th><th class="num">A liquidar</th><th class="acoes-col"></th></tr></thead><tbody>${aLiq.length ? aLiq.map(([e, c]) => `<tr><td><b>${e.numero}</b><small>${dataBR(e.data)}</small></td><td><b>${esc(cred(e.credorId)?.nome || '')}</b><small>${esc(e.historico)}</small></td><td>${TIPOS_EMP.find(t => t[0] === e.tipo)?.[1]}</td><td class="num"><b>${R$(c.aLiquidar)}</b></td><td class="acoes-col"><button class="lgt-mini" type="button" data-edita onclick="lgfLiquidar('${e.id}')">Liquidar</button></td></tr>`).join('') : '<tr><td colspan="5" class="lgt-vazio"><b>Nenhum empenho com saldo a liquidar.</b></td></tr>'}</tbody></table></div>` : '') +
      (abaPag === 'pagos' ? `<div class="lgt-tabela-wrap"><table class="lgt-tabela lgf-tab"><thead><tr><th>Pagamento</th><th>Data</th><th>Credor · empenho</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>${pagos.length ? pagos.map(({ e, p }) => `<tr><td><b>${p.numero}</b></td><td class="nowrap">${dataBR(p.data)}</td><td><b>${esc(cred(e.credorId)?.nome || '')}</b><small>Empenho ${e.numero}${p.justificativa ? ' · fora da ordem: ' + esc(p.justificativa) : ''}</small></td><td>${esc(p.forma || '')}</td><td class="num"><b>${R$(p.valor)}</b></td></tr>`).join('') : '<tr><td colspan="5" class="lgt-vazio"><b>Nenhum pagamento registrado.</b></td></tr>'}</tbody></table></div>` : '');
  }
  window.lgfAbaPag = k => { abaPag = k; telaPagamentos(); };
  window.lgfPagar = function (eid, lid) {
    if (!exigeEdicao()) return; const e = emp(eid); const fila = filaPagamento(); const item = fila.find(x => x.liq.id === lid); if (!item) return;
    const antes = fila.filter(x => x.fonte === item.fonte && (x.liq.data < item.liq.data || (x.liq.data === item.liq.data && x.liq.numero < item.liq.numero)));
    UI().abrirModal(form(`Pagar liquidação ${item.liq.numero}`, `<p class="lgt-p cheio">${esc(cred(e.credorId)?.nome || '')} · empenho ${e.numero}<br>Valor a pagar: <b>${R$(item.saldo)}</b></p>
      ${antes.length ? `<div class="lgf-alerta a-aviso cheio" style="cursor:default"><i></i><span><b>Há ${antes.length} liquidação(ões) mais antiga(s) na mesma fonte.</b><small>Pagar fora da ordem cronológica exige justificativa, que será publicada (Lei 14.133/2021, art. 141 §1º).</small></span></div><label class="cheio"><span>Justificativa *</span><input name="justificativa" required placeholder="Ex.: grave perturbação da ordem / pagamento a microempresa"></label>` : ''}
      <label><span>Valor *</span><input name="valor" inputmode="decimal" required value="${String(item.saldo.toFixed(2)).replace('.', ',')}"></label><label><span>Data *</span><input name="data" type="date" value="${hoje()}" required></label>
      <label class="cheio"><span>Forma de pagamento</span><select name="forma"><option>Transferência bancária (TED/PIX)</option><option>Débito em conta</option><option>Boleto</option><option>Cheque</option></select></label>`, 'Confirmar pagamento'), true);
    onSubmit(f => { const v = num(f.valor.value); if (v <= 0 || v > item.saldo + 0.004) return `Valor deve estar entre R$ 0,01 e ${R$(item.saldo)}.`; if (antes.length && !f.justificativa.value.trim()) return 'Informe a justificativa para pagar fora da ordem.';
      e.pagamentos.push({ id: uid('p'), numero: proximo(D.empenhos.filter(x => !x.exemplo).flatMap(x => x.pagamentos || []), f.data.value), data: f.data.value, valor: v, liquidacaoId: lid, forma: f.forma.value, justificativa: antes.length ? f.justificativa.value.trim() : '' });
      salvar('Pagamento', `${e.numero} ${R$(v)}`); UI().fecharModal(); desenhar(); UI().aviso('Pagamento registrado.'); });
  };

  /* ---- contratos ---- */
  function telaContratos() {
    const el = $('#view-lgf-contratos'); const lst = D.contratos.map(c => [c, calcCtr(c)]).sort((a, b) => a[1].fim.localeCompare(b[1].fim));
    const n = s => lst.filter(([, k]) => k.situacao === s).length;
    el.innerHTML = cab('Contratos', `Vigência, aditivos, saldo e alertas de vencimento (aviso com ${D.param.alertaDias} dias de antecedência)`, btnEd('+ Novo contrato', 'lgfFormContrato()')) +
      `<div class="lgt-kpis lgf-kpis3"><div><b>${n('Vigente')}</b><span>vigentes</span></div><div class="k-aviso"><b>${n('A vencer')}</b><span>vencem em até ${D.param.alertaDias} dias</span></div><div class="k-erro"><b>${n('Vencido')}</b><span>vencidos</span></div></div>` +
      (lst.length ? `<div class="lgf-contratos">${lst.map(([c, k]) => { const f = cred(c.credorId) || {}; const usado = pct(k.empenhado, k.valorAtual); return `<article class="lgf-ctr s-${k.situacao.toLowerCase().replace(/[^a-z]/g, '')}">
        <header><span class="lgf-ctr-n">${esc(c.numero)}</span>${statusTag(k.situacao)}</header><h3>${esc(c.objeto)}</h3><p>${esc(f.nome || '')} · ${esc(c.modalidade)}</p>
        <div class="lgf-ctr-v"><div><span>Vigência até</span><b>${dataBR(k.fim)}</b><small>${k.situacao === 'Encerrado' ? 'encerrado' : k.restam >= 0 ? 'faltam ' + k.restam + ' dia(s)' : 'venceu há ' + (-k.restam) + ' dia(s)'}</small></div><div><span>Valor atual</span><b>${R$(k.valorAtual)}</b><small>${(c.aditivos || []).length} aditivo(s)</small></div><div><span>Saldo</span><b>${R$(k.saldo)}</b><small>${usado.toFixed(0)}% empenhado</small></div></div>
        ${barra([[k.empenhado, '#39bdf6', 'empenhado']], k.valorAtual)}
        <footer><button class="lgt-mini" type="button" onclick="lgfVerContrato('${c.id}')">Detalhes</button><button class="lgt-mini" type="button" data-edita onclick="lgfAditivo('${c.id}')">Aditivo</button><button class="lgt-mini" type="button" data-edita onclick="lgfFormEmpenho('${c.id}')">Empenhar</button></footer></article>`; }).join('')}</div>`
        : vazioCard('Nenhum contrato cadastrado', 'Cadastre os contratos para acompanhar vigência, aditivos e saldo, e receber alertas de vencimento.', `<div class="lgt-acoes" style="justify-content:center">${btnEd('+ Novo contrato', 'lgfFormContrato()')}</div>`));
  }
  window.lgfFormContrato = function (id) {
    if (!exigeEdicao()) return; if (!D.credores.length) { lgfFormCredor(null, () => lgfFormContrato(id)); return; }
    const c = id ? ctr(id) : { inicio: hoje() };
    UI().abrirModal(form(id ? 'Editar contrato' : 'Novo contrato', `
      <label><span>Número *</span><input name="numero" required value="${esc(c.numero || '')}" placeholder="Ex.: 012/2026"></label><label><span>Processo</span><input name="processo" value="${esc(c.processo || '')}"></label>
      <label class="cheio"><span>Objeto *</span><input name="objeto" required value="${esc(c.objeto || '')}" placeholder="Ex.: Locação de impressoras com manutenção"></label>
      <label class="cheio"><span>Contratado *</span><span class="lgf-linha"><select name="credor">${D.credores.map(f => `<option value="${f.id}"${f.id === c.credorId ? ' selected' : ''}>${esc(f.nome)}</option>`).join('')}</select><button type="button" class="lgt-btn" onclick="lgfFormCredor(null,()=>lgfFormContrato(${id ? `'${id}'` : ''}))">+ Credor</button></span></label>
      <label><span>Modalidade</span><select name="modalidade">${MODALIDADES.map(m => `<option${m === c.modalidade ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <label><span>Valor total *</span><input name="valor" inputmode="decimal" required value="${c.valor != null ? String(c.valor).replace('.', ',') : ''}"></label>
      <label><span>Início da vigência *</span><input name="inicio" type="date" required value="${esc(c.inicio || '')}"></label><label><span>Fim da vigência *</span><input name="fim" type="date" required value="${esc(c.fim || '')}"></label>
      <label><span>Fiscal do contrato</span><input name="fiscal" value="${esc(c.fiscal || '')}"></label><label><span>Gestor do contrato</span><input name="gestor" value="${esc(c.gestor || '')}"></label>
      <label class="cheio"><span>Dotação prevista</span><select name="dotacao"><option value="">—</option>${D.dotacoes.map(d => `<option value="${d.id}"${d.id === c.dotacaoId ? ' selected' : ''}>Ficha ${esc(d.ficha)} · ${esc(d.natureza)} ${esc(d.descNatureza)}</option>`).join('')}</select></label>
      ${id ? `<label class="cheio checkbox"><input type="checkbox" name="encerrado" ${c.encerrado ? 'checked' : ''}> Contrato encerrado</label>` : ''}`, id ? 'Salvar' : 'Cadastrar contrato'), true);
    onSubmit(f => {
      const v = num(f.valor.value); if (!f.numero.value.trim() || !f.objeto.value.trim() || v <= 0 || !f.inicio.value || !f.fim.value) return 'Preencha número, objeto, valor e vigência.';
      if (f.fim.value < f.inicio.value) return 'O fim da vigência é anterior ao início.';
      const novo = { ...(id ? c : { id: uid('c'), aditivos: [] }), numero: f.numero.value.trim(), processo: f.processo.value.trim(), objeto: f.objeto.value.trim(), credorId: f.credor.value, modalidade: f.modalidade.value, valor: v, inicio: f.inicio.value, fim: f.fim.value, fiscal: f.fiscal.value.trim(), gestor: f.gestor.value.trim(), dotacaoId: f.dotacao.value, encerrado: f.encerrado ? f.encerrado.checked : false };
      if (!id) D.contratos.push(novo); else Object.assign(c, novo);
      salvar(id ? 'Editou contrato' : 'Cadastrou contrato', novo.numero); UI().fecharModal(); desenhar(); UI().aviso('Contrato salvo.');
    });
  };
  window.lgfAditivo = function (id) {
    if (!exigeEdicao()) return; const c = ctr(id), k = calcCtr(c);
    UI().abrirModal(form(`Termo aditivo · contrato ${esc(c.numero)}`, `<p class="lgt-p cheio">Vigência atual até <b>${dataBR(k.fim)}</b> · valor atual <b>${R$(k.valorAtual)}</b></p>
      <label><span>Número do aditivo *</span><input name="numero" required value="${(c.aditivos || []).length + 1}º Termo Aditivo"></label><label><span>Data *</span><input name="data" type="date" required value="${hoje()}"></label>
      <label><span>Tipo</span><select name="tipo"><option>Prorrogação de prazo</option><option>Acréscimo de valor</option><option>Supressão de valor</option><option>Prazo e valor</option><option>Reajuste</option></select></label>
      <label><span>Nova data final</span><input name="novoFim" type="date"></label>
      <label><span>Valor (+ acréscimo / − supressão)</span><input name="valor" inputmode="decimal" placeholder="0,00"></label>
      <label class="cheio"><span>Observação</span><input name="obs"></label>`, 'Registrar aditivo'), true);
    onSubmit(f => { let v = num(f.valor.value); if (/Supressão/.test(f.tipo.value) && v > 0) v = -v; if (!f.novoFim.value && !v) return 'Informe a nova data final ou o valor.'; if (f.novoFim.value && f.novoFim.value <= k.fim) return 'A nova data deve ser posterior à vigência atual.';
      if (k.valorAtual + v < k.empenhado - 0.004) return 'A supressão deixaria o contrato com valor menor que o já empenhado.';
      c.aditivos.push({ id: uid('t'), numero: f.numero.value.trim(), data: f.data.value, tipo: f.tipo.value, novoFim: f.novoFim.value, valor: v, obs: f.obs.value.trim() });
      salvar('Aditivo de contrato', `${c.numero} · ${f.tipo.value}`); UI().fecharModal(); desenhar(); UI().aviso('Aditivo registrado.'); });
  };
  window.lgfVerContrato = function (id) {
    const c = ctr(id); if (!c) return; const k = calcCtr(c), f = cred(c.credorId) || {}; const emps = D.empenhos.filter(e => e.contratoId === id);
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Contrato ${esc(c.numero)} ${statusTag(k.situacao)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgf-det"><div class="lgf-det-kpi"><div><span>Valor atual</span><b>${R$(k.valorAtual)}</b></div><div><span>Empenhado</span><b>${R$(k.empenhado)}</b></div><div><span>Saldo</span><b>${R$(k.saldo)}</b></div><div><span>Vigência até</span><b>${dataBR(k.fim)}</b></div></div>
      <dl class="lgf-dl"><dt>Objeto</dt><dd>${esc(c.objeto)}</dd><dt>Contratado</dt><dd>${esc(f.nome || '')} ${f.doc ? '· ' + docFmt(f.doc) : ''}</dd><dt>Modalidade</dt><dd>${esc(c.modalidade)}${c.processo ? ' · processo ' + esc(c.processo) : ''}</dd><dt>Vigência original</dt><dd>${dataBR(c.inicio)} a ${dataBR(c.fim)}</dd><dt>Fiscal / gestor</dt><dd>${esc(c.fiscal || '—')} / ${esc(c.gestor || '—')}</dd></dl>
      <h3 class="lgf-h3">Aditivos</h3>${(c.aditivos || []).length ? `<ol class="lgf-tempo">${c.aditivos.map(a => `<li class="ev-l"><span>${dataBR(a.data)}</span><b>${esc(a.numero)} — ${esc(a.tipo)}</b><small>${a.novoFim ? 'até ' + dataBR(a.novoFim) : ''}${a.valor ? ' · ' + R$(a.valor) : ''}${a.obs ? ' · ' + esc(a.obs) : ''}</small></li>`).join('')}</ol>` : '<p class="lgt-p">Nenhum aditivo.</p>'}
      <h3 class="lgf-h3">Empenhos vinculados</h3>${emps.length ? `<ol class="lgf-tempo">${emps.map(e => `<li class="ev-e"><span>${dataBR(e.data)}</span><b><a href="#" onclick="event.preventDefault();lgfVerEmpenho('${e.id}')">Empenho ${e.numero}</a></b><small>${R$(calcEmp(e).liquido)} · ${calcEmp(e).status}</small></li>`).join('')}</ol>` : '<p class="lgt-p">Nenhum empenho.</p>'}</div>
      <div class="lgt-modal-rod lgf-rod"><button type="button" class="lgt-btn" data-edita onclick="lgfFormContrato('${c.id}')">Editar</button><button type="button" class="lgt-btn" data-edita onclick="lgfAditivo('${c.id}')">Aditivo</button><button type="button" class="lgt-btn primario" data-edita onclick="lgfFormEmpenho('${c.id}')">Empenhar</button></div></div>`);
  };

  /* ---- credores ---- */
  function telaCredores() {
    const el = $('#view-lgf-credores');
    el.innerHTML = cab('Credores', 'Fornecedores, prestadores e demais favorecidos dos empenhos', btnEd('+ Novo credor', 'lgfFormCredor()')) +
      `<div class="lgt-tabela-wrap"><table class="lgt-tabela lgf-tab"><thead><tr><th>Credor</th><th>CNPJ / CPF</th><th>Contato</th><th class="num">Empenhado no ano</th><th class="num">Pago</th><th class="acoes-col"></th></tr></thead><tbody>${D.credores.length ? D.credores.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(f => { let e = 0, p = 0; D.empenhos.filter(x => x.credorId === f.id).forEach(x => { const c = calcEmp(x); e += c.liquido; p += c.pago; }); return `<tr><td><b>${esc(f.nome)}</b><small>${f.tipo === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}</small></td><td class="nowrap">${esc(docFmt(f.doc))}</td><td><small>${esc(f.email || '')}${f.telefone ? '<br>' + esc(f.telefone) : ''}</small></td><td class="num">${R$(e)}</td><td class="num">${R$(p)}</td><td class="acoes-col"><button class="lgt-mini" type="button" data-edita onclick="lgfFormCredor('${f.id}')">Editar</button></td></tr>`; }).join('') : '<tr><td colspan="6" class="lgt-vazio"><b>Nenhum credor cadastrado.</b></td></tr>'}</tbody></table></div>`;
  }
  window.lgfFormCredor = function (id, depois) {
    if (!exigeEdicao()) return; const f0 = id ? cred(id) : { tipo: 'PJ' };
    UI().abrirModal(form(id ? 'Editar credor' : 'Novo credor', `
      <label class="cheio"><span>Nome / razão social *</span><input name="nome" required value="${esc(f0.nome || '')}"></label>
      <label><span>Tipo</span><select name="tipo"><option value="PJ"${f0.tipo === 'PJ' ? ' selected' : ''}>Pessoa jurídica</option><option value="PF"${f0.tipo === 'PF' ? ' selected' : ''}>Pessoa física</option></select></label>
      <label><span>CNPJ / CPF *</span><input name="doc" required value="${esc(f0.doc || '')}" inputmode="numeric"></label>
      <label><span>E-mail</span><input name="email" type="email" value="${esc(f0.email || '')}"></label><label><span>Telefone</span><input name="telefone" value="${esc(f0.telefone || '')}"></label>`, id ? 'Salvar' : 'Cadastrar credor'), true);
    onSubmit(f => { const doc = f.doc.value.replace(/\D/g, ''); if (!f.nome.value.trim()) return 'Informe o nome.'; if (!(doc.length === 11 || doc.length === 14)) return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).';
      if (D.credores.some(x => x.doc === doc && x.id !== id)) return 'Já existe um credor com esse documento.';
      const novo = { ...(id ? f0 : { id: uid('f') }), nome: f.nome.value.trim(), tipo: f.tipo.value, doc, email: f.email.value.trim(), telefone: f.telefone.value.trim() };
      if (!id) D.credores.push(novo); else Object.assign(f0, novo);
      salvar(id ? 'Editou credor' : 'Cadastrou credor', novo.nome); UI().fecharModal(); UI().aviso('Credor salvo.'); if (depois) depois(); else desenhar(); });
  };

  /* ---- parâmetros ---- */
  function telaParametros() {
    const el = $('#view-lgf-parametros'); const p = D.param;
    el.innerHTML = cab('Parâmetros financeiros', 'Dados usados na nota de empenho, nos alertas e na publicação automática') +
      `<div class="lgf-grade"><form class="lgt-card lgt-form-mini" id="lgf-param">
        <label><span>Exercício</span><input name="exercicio" type="number" value="${D.exercicio}"></label>
        <label><span>Órgão</span><input name="orgao" value="${esc(p.orgao)}"></label><label><span>Unidade orçamentária</span><input name="unidade" value="${esc(p.unidade)}"></label>
        <label><span>Ordenador de despesa</span><input name="ordenador" value="${esc(p.ordenador)}"></label><label><span>Cargo do ordenador</span><input name="cargoOrdenador" value="${esc(p.cargoOrdenador)}"></label>
        <label><span>Contador responsável</span><input name="contador" value="${esc(p.contador)}"></label><label><span>CRC</span><input name="crc" value="${esc(p.crc)}"></label>
        <label><span>Avisar vencimento de contratos com (dias)</span><input name="alertaDias" type="number" min="1" value="${p.alertaDias}"></label>
        <label class="checkbox"><input type="checkbox" name="autoPublicar" ${p.autoPublicar ? 'checked' : ''}> Publicar empenhos, liquidações, pagamentos e contratos automaticamente no Portal da Transparência</label>
        <button class="lgt-btn primario" type="submit" data-edita>Salvar parâmetros</button></form>
        <div class="lgt-card"><h3>Dados</h3><p class="lgt-p">Cópia de segurança de todo o Financeiro (dotações, empenhos, contratos e credores).</p>
          <div class="lgt-acoes"><button class="lgt-btn" type="button" onclick="lgfBackup()">Baixar cópia (JSON)</button><label class="lgt-btn" data-edita>Restaurar cópia<input type="file" accept=".json" hidden onchange="lgfRestaurar(this)"></label></div>
          <h3 style="margin-top:18px">Demonstração</h3><p class="lgt-p">Dados de exemplo ajudam a conhecer o módulo. Eles ficam marcados e não vão para o Portal da Transparência.</p>
          <div class="lgt-acoes"><button class="lgt-btn" type="button" data-edita onclick="lgfExemplo()">Carregar exemplo</button><button class="lgt-btn" type="button" data-edita onclick="lgfLimparExemplo()">Remover exemplos</button></div>
          <h3 style="margin-top:18px">Importante</h3><p class="lgt-p">Este painel é o controle gerencial da Câmara. A escrituração oficial e o envio ao TCE-SP (AUDESP) continuam no sistema contábil; numa próxima etapa os dois podem ser integrados.</p></div></div>`;
    $('#lgf-param').onsubmit = e => { e.preventDefault(); if (!exigeEdicao()) return; const f = e.target; D.exercicio = +f.exercicio.value || D.exercicio; ['orgao', 'unidade', 'ordenador', 'cargoOrdenador', 'contador', 'crc'].forEach(k => p[k] = f[k].value.trim()); p.alertaDias = Math.max(1, +f.alertaDias.value || 60); p.autoPublicar = f.autoPublicar.checked;
      if (!p.autoPublicar && typeof transpLer === 'function') { try { transpSalvar(transpLer().filter(i => i.origem !== 'financeiro')); } catch (x) { } }
      salvar('Parâmetros financeiros', 'atualizados'); UI().aviso('Parâmetros salvos.'); };
  }
  window.lgfBackup = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' })); a.download = `financeiro-camara-${D.exercicio}-${hoje()}.json`; document.body.appendChild(a); a.click(); a.remove(); };
  window.lgfRestaurar = inp => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const x = JSON.parse(r.result); if (!x.dotacoes || !x.empenhos) throw 0; D = x; salvar('Restaurou cópia do Financeiro'); desenhar(); UI().aviso('Cópia restaurada.'); } catch (e) { UI().aviso('Arquivo inválido.', 'erro'); } }; r.readAsText(f); };
  window.lgfExportar = () => {
    const linhas = [['Ficha', 'Natureza', 'Descrição', 'Funcional', 'Fonte', 'Orçado', 'Alterações', 'Atualizado', 'Empenhado', 'Liquidado', 'Pago', 'Saldo']];
    D.dotacoes.forEach(d => { const c = calcDot(d); linhas.push([d.ficha, d.natureza, d.descNatureza, d.funcional, d.fonte, d.inicial, c.alt, c.atualizado, c.empenhado, c.liquidado, c.pago, c.saldo].map(v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v)); });
    const csv = '﻿' + linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `execucao-orcamentaria-${D.exercicio}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };

  /* ---- nota de empenho (impressão) ---- */
  window.lgfNota = function (id) {
    const e = emp(id), c = calcEmp(e), d = dot(e.dotacaoId), f = cred(e.credorId) || {}, k = e.contratoId ? ctr(e.contratoId) : null, p = D.param;
    const anteriores = D.empenhos.filter(x => x.dotacaoId === d.id && (x.data < e.data || (x.data === e.data && x.numero < e.numero))).reduce((s, x) => s + calcEmp(x).liquido, 0);
    const disp = calcDot(d).atualizado - anteriores;
    const w = window.open('', '_blank'); if (!w) { UI().aviso('Permita janelas pop-up para imprimir.', 'erro'); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Nota de Empenho ${e.numero}</title><style>
      @page{size:A4;margin:14mm}body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:0}h1{font-size:18px;margin:0}.cab{display:flex;gap:14px;align-items:center;border-bottom:2px solid #111;padding-bottom:10px}.cab img{width:62px}.cab small{display:block;color:#444}.tit{display:flex;justify-content:space-between;align-items:flex-end;margin:14px 0 8px}.tit b{font-size:20px}
      table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border:1px solid #444;padding:6px 8px;vertical-align:top;text-align:left}th{background:#eee;width:26%;font-weight:600}.v{font-size:16px;font-weight:700}.ass{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:56px;text-align:center}.ass div{border-top:1px solid #111;padding-top:6px}.nota{font-size:10px;color:#555;margin-top:20px}${e.exemplo ? '.marca{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:64px;color:rgba(200,0,0,.12);transform:rotate(-20deg)}' : ''}
      @media screen{body{max-width:800px;margin:20px auto;padding:0 16px}}</style></head><body>${e.exemplo ? '<div class="marca">EXEMPLO</div>' : ''}
      <div class="cab"><img src="../assets/img/brasao.jpg" onerror="this.onerror=function(){this.style.display='none'};this.src='https://www.camaranevespaulista.sp.gov.br/Arquivos/Uploads/Bras%C3%A3o_Neves_Paulista,_SP.jpg'" alt=""><div><h1>Câmara Municipal de Neves Paulista</h1><small>Estado de São Paulo · ${esc(p.orgao)} · ${esc(p.unidade)}</small></div></div>
      <div class="tit"><b>NOTA DE EMPENHO Nº ${e.numero}</b><span>Data: ${dataBR(e.data)} · Tipo: ${TIPOS_EMP.find(t => t[0] === e.tipo)?.[1]}</span></div>
      <table><tr><th>Credor</th><td>${esc(f.nome || '')}<br>${f.tipo === 'PF' ? 'CPF' : 'CNPJ'}: ${esc(docFmt(f.doc))}</td></tr><tr><th>Classificação funcional</th><td>${esc(d.funcional)} – ${esc(d.acao)}</td></tr><tr><th>Natureza da despesa</th><td>${esc(d.natureza)} – ${esc(d.descNatureza)}</td></tr><tr><th>Ficha / fonte / aplicação</th><td>Ficha ${esc(d.ficha)} · Fonte ${esc(d.fonte)} · Aplicação ${esc(d.aplicacao || '—')}</td></tr>
      <tr><th>Licitação / processo</th><td>${esc(e.modalidade || '—')}${e.processo ? ' · Processo ' + esc(e.processo) : ''}${k ? ' · Contrato ' + esc(k.numero) : ''}</td></tr><tr><th>Histórico</th><td>${esc(e.historico)}</td></tr></table>
      <table><tr><th>Saldo disponível antes</th><td>${R$(disp)}</td><th>Valor deste empenho</th><td class="v">${R$(e.valor)}</td></tr><tr><th>Saldo após o empenho</th><td>${R$(disp - e.valor)}</td><th>Anulações</th><td>${c.anulado ? R$(c.anulado) : '—'}</td></tr></table>
      <table><tr><th>Valor por extenso</th><td>${extenso(e.valor)}</td></tr></table>
      <div class="ass"><div>${esc(p.ordenador)}<br><small>${esc(p.cargoOrdenador)} · Ordenador de despesa</small></div><div>${p.contador ? esc(p.contador) : '&nbsp;'}<br><small>Contabilidade${p.crc ? ' · CRC ' + esc(p.crc) : ''}</small></div><div>${esc(f.nome || '')}<br><small>Recebi a via do credor</small></div></div>
      <p class="nota">Emitida em ${new Date().toLocaleString('pt-BR')} pelo LegislaGov por ${esc(e.emitidoPor || '')}. Lei 4.320/1964, arts. 58 a 61: o empenho reserva a dotação e deduz o valor do seu saldo.</p>
      <script>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  };

  /* ---- dados de exemplo ---- */
  window.lgfExemplo = function () {
    if (!exigeEdicao()) return; const ano = D.exercicio; const X = { exemplo: true };
    const dts = [['01', '3.1.90.11', 1450000], ['02', '3.1.90.13', 320000], ['03', '3.3.90.14', 18000], ['04', '3.3.90.30', 60000], ['05', '3.3.90.39', 240000], ['06', '3.3.90.40', 85000], ['07', '3.3.90.46', 96000], ['08', '4.4.90.52', 70000]]
      .map(([fi, n, v]) => ({ ...X, id: uid('d'), ficha: fi, natureza: n, descNatureza: NATUREZAS.find(x => x[0] === n)[1], funcional: '01.031.0001.2001', acao: 'Manutenção das atividades legislativas', fonte: '01 – Tesouro', aplicacao: '110.000', inicial: v, alteracoes: [] }));
    dts[4].alteracoes.push({ id: uid('a'), tipo: 'suplementacao', valor: 30000, ato: 'Resolução nº 03/' + ano, data: ano + '-06-10' });
    const cr = [['Papelaria Exemplo Ltda', '11222333000181'], ['Tecnologia Modelo S/A', '44555666000102'], ['Locadora de Impressoras Fictícia', '77888999000150'], ['Companhia de Energia (exemplo)', '12345678000199']].map(([n, d]) => ({ ...X, id: uid('f'), nome: n, doc: d, tipo: 'PJ' }));
    const em = (n, dt, tipo, di, ci, hist, v, extra = {}) => ({ ...X, id: uid('e'), numero: 'EX-' + String(n).padStart(2, '0') + '/' + ano, data: `${ano}-${dt}`, tipo, dotacaoId: dts[di].id, credorId: cr[ci].id, contratoId: '', modalidade: 'Dispensa de licitação', processo: '', historico: hist, valor: v, anulacoes: [], liquidacoes: [], pagamentos: [], emitidoPor: 'Exemplo', ...extra });
    const ct = { ...X, id: uid('c'), numero: '004/' + ano, processo: '021/' + ano, objeto: 'Locação de impressoras multifuncionais com manutenção', credorId: cr[2].id, modalidade: 'Pregão eletrônico', valor: 26400, inicio: `${ano}-01-15`, fim: (() => { const d = new Date(); d.setDate(d.getDate() + 38); return d.toISOString().slice(0, 10); })(), fiscal: 'Servidor fiscal (exemplo)', gestor: 'Secretaria (exemplo)', dotacaoId: dts[4].id, aditivos: [] };
    const ct2 = { ...X, id: uid('c'), numero: '002/' + ano, processo: '008/' + ano, objeto: 'Sistema de gestão legislativa e portal (licença e suporte)', credorId: cr[1].id, modalidade: 'Pregão eletrônico', valor: 48000, inicio: `${ano}-02-01`, fim: `${ano + 1}-01-31`, fiscal: 'Servidor fiscal (exemplo)', gestor: 'Secretaria (exemplo)', dotacaoId: dts[5].id, aditivos: [] };
    const e1 = em(1, '01-20', 'global', 4, 2, 'Locação de impressoras – contrato 004/' + ano, 26400, { contratoId: ct.id, modalidade: 'Pregão eletrônico' });
    const e2 = em(2, '02-05', 'global', 5, 1, 'Sistema de gestão legislativa – contrato 002/' + ano, 48000, { contratoId: ct2.id, modalidade: 'Pregão eletrônico' });
    const e3 = em(3, '03-12', 'ordinario', 3, 0, 'Material de expediente (papel, toner, pastas)', 4870.5);
    const e4 = em(4, '01-10', 'estimativo', 4, 3, 'Fornecimento de energia elétrica – exercício ' + ano, 21000, { modalidade: 'Inexigibilidade' });
    let L = 0, P = 0; const liq = (e, dt, v, doc) => { L++; const l = { id: uid('l'), numero: 'EX-' + String(L).padStart(2, '0') + '/' + ano, data: `${ano}-${dt}`, valor: v, documento: doc, atesto: 'Exemplo' }; e.liquidacoes.push(l); return l; };
    const pag = (e, l, dt, v) => { P++; e.pagamentos.push({ id: uid('p'), numero: 'EX-' + String(P).padStart(2, '0') + '/' + ano, data: `${ano}-${dt}`, valor: v, liquidacaoId: l.id, forma: 'Transferência bancária (TED/PIX)' }); };
    for (let m = 2; m <= 9; m++) { const l = liq(e1, String(m).padStart(2, '0') + '-05', 2200, 'NFS-e ' + (100 + m)); if (m < 9) pag(e1, l, String(m).padStart(2, '0') + '-15', 2200); }
    for (let m = 3; m <= 10; m++) { const l = liq(e2, String(m).padStart(2, '0') + '-08', 4000, 'NFS-e ' + (500 + m)); if (m < 10) pag(e2, l, String(m).padStart(2, '0') + '-20', 4000); }
    { const l = liq(e3, '03-20', 4870.5, 'NF-e 8812'); pag(e3, l, '03-28', 4870.5); }
    for (let m = 2; m <= 10; m++) { const l = liq(e4, String(m).padStart(2, '0') + '-12', 1650 + m * 20, 'Fatura ' + m + '/' + ano); if (m < 10) pag(e4, l, String(m).padStart(2, '0') + '-25', 1650 + m * 20); }
    const servidores = { ...X, id: uid('f'), nome: 'Servidores e agentes políticos (folha)', doc: '11111111000191', tipo: 'PJ' }; const inss = { ...X, id: uid('f'), nome: 'Instituto Nacional do Seguro Social – INSS', doc: '29979036000140', tipo: 'PJ' }; cr.push(servidores, inss);
    const e5 = em(5, '01-02', 'estimativo', 0, 4, 'Folha de pagamento de vereadores e servidores – exercício ' + ano, 1380000, { modalidade: 'Não se aplica (folha, encargos, diárias)' });
    const e6 = em(6, '01-02', 'estimativo', 1, 5, 'Contribuição patronal ao INSS – exercício ' + ano, 300000, { modalidade: 'Não se aplica (folha, encargos, diárias)' });
    for (let m = 1; m <= 10; m++) { const mm = String(m).padStart(2, '0'); const fo = 108500 + (m > 4 ? 2600 : 0); const l = liq(e5, mm + '-28', fo, 'Folha ' + mm + '/' + ano); pag(e5, l, mm + '-30', fo); const l2 = liq(e6, mm + '-28', Math.round(fo * 0.22 * 100) / 100, 'GPS ' + mm + '/' + ano); if (m < 10) pag(e6, l2, String(m + 1).padStart(2, '0') + '-15', Math.round(fo * 0.22 * 100) / 100); }
    D.dotacoes.push(...dts); D.credores.push(...cr); D.contratos.push(ct, ct2); D.empenhos.push(e1, e2, e3, e4, e5, e6);
    salvar('Carregou dados de exemplo'); desenhar(); UI().aviso('Dados de exemplo carregados.');
  };
  window.lgfLimparExemplo = function () {
    if (!exigeEdicao()) return;
    D.empenhos = D.empenhos.filter(x => !x.exemplo); D.contratos = D.contratos.filter(x => !x.exemplo); D.dotacoes = D.dotacoes.filter(x => !x.exemplo || D.empenhos.some(e => e.dotacaoId === x.id)); D.credores = D.credores.filter(x => !x.exemplo || D.empenhos.some(e => e.credorId === x.id));
    salvar('Removeu dados de exemplo'); desenhar(); UI().aviso('Exemplos removidos.');
  };

  /* ---------------- formulário genérico ---------------- */
  function form(titulo, campos, botao) {
    return `<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${titulo}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">${campos}</div><p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">${botao}</button></div></form>`;
  }
  function onSubmit(fn) { const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); const r = fn(f); if (typeof r === 'string') { f.querySelector('.lgt-erro').textContent = r; } }; }

  /* ---------------- estilos ---------------- */
  const css = document.createElement('style'); css.id = 'lgf-style'; css.textContent = `
  html.lgf-consulta .lgf [data-edita],html.lgf-consulta .lgt-modal [data-edita]{display:none!important}
  .lgf-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
  .lgf-kpi{background:var(--lg28-panel);border:1px solid var(--lg28-stroke);border-radius:12px;padding:14px 16px;position:relative;overflow:hidden}
  .lgf-kpi span{display:block;font-size:12.5px;color:var(--lg28-muted)}
  .lgf-kpi b{display:block;font-size:20px;font-weight:700;color:var(--lg28-ink);margin:4px 0 2px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .lgf-kpi small{font-size:12px;color:var(--lg28-muted)}
  .lgf-kpi i{position:absolute;left:0;bottom:0;height:3px;width:var(--p);background:var(--c)}
  .lgf-kpis3{grid-template-columns:repeat(3,1fr)!important}
  .lgt-kpis .k-aviso b{color:#e2aa1c}.lgt-kpis .k-erro b{color:#e5484d}
  .lgf-grade{display:grid;grid-template-columns:1.5fr 1fr;gap:14px}
  .lgf-card-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
  .lgf-card-cab h3{margin:0!important}
  .lgf-leg{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--lg28-muted);flex-wrap:wrap}
  .lgf-leg i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-left:6px}
  .lgf-n{min-width:24px;height:24px;border-radius:12px;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
  .lgf-nat{display:flex;flex-direction:column;gap:12px}
  .lgf-nat-t{display:flex;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:5px;color:var(--lg28-ink)}
  .lgf-nat-t small{color:var(--lg28-muted)}
  .lgf-barra{display:flex;height:8px;border-radius:5px;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);overflow:hidden}
  .lgf-barra i{display:block;height:100%}
  .lgf-tab td small{display:block}
  .lgf-alertas{display:flex;flex-direction:column;gap:8px}
  .lgf-alerta{display:flex;gap:10px;align-items:flex-start;text-align:left;width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);cursor:pointer;font:inherit}
  .lgf-alerta i{width:8px;height:8px;border-radius:50%;margin-top:6px;flex:0 0 8px;background:#39bdf6}
  .lgf-alerta.a-aviso i{background:#e2aa1c}.lgf-alerta.a-erro i{background:#e5484d}
  .lgf-alerta b{display:block;font-size:13.5px}.lgf-alerta small{display:block;font-size:12.5px;color:var(--lg28-muted)}
  .lgf-meses{display:grid;grid-template-columns:repeat(12,1fr);gap:8px;height:170px;align-items:end}
  .lgf-mes{display:flex;flex-direction:column;align-items:center;gap:6px;height:100%}
  .lgf-col{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:3px}
  .lgf-col i{width:40%;max-width:16px;border-radius:4px 4px 0 0;min-height:2px}
  .lgf-mes span{font-size:11.5px;color:var(--lg28-muted)}
  .lgf-atalhos{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}
  .lgf-atalhos button{display:flex;gap:12px;align-items:center;padding:14px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);color:var(--lg28-ink);cursor:pointer;text-align:left;font:inherit}
  .lgf-atalhos button:hover{border-color:var(--lg28-muted)}
  .lgf-atalhos b{display:block;font-size:14px}.lgf-atalhos small{color:var(--lg28-muted);font-size:12.5px}
  .lgf-vazio{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:48px 20px;border:1px dashed var(--lg28-stroke);border-radius:14px;background:var(--lg28-panel);color:var(--lg28-muted)}
  .lgf-vazio .lgv31-ic{width:34px;height:34px;flex-basis:34px;color:var(--lg28-ink)}
  .lgf-vazio b{color:var(--lg28-ink);font-size:16px}.lgf-vazio span{max-width:56ch}
  .lgf-faixa-ex{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;margin-bottom:14px;border-radius:10px;border:1px solid rgba(226,170,28,.5);background:rgba(226,170,28,.08);font-size:13px;color:var(--lg28-ink)}
  .lgf-tag{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:700;vertical-align:middle;white-space:nowrap;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);color:var(--lg28-ink)}
  .lgf-tag.t-pago,.lgf-tag.t-vigente{background:rgba(47,191,113,.14);border-color:transparent;color:#1f9d5c}
  .lgf-tag.t-liquidado,.lgf-tag.t-liquidadoparcial,.lgf-tag.t-pagoparcial{background:rgba(167,139,250,.16);border-color:transparent;color:#8b6cf0}
  .lgf-tag.t-empenhado{background:rgba(57,189,246,.14);border-color:transparent;color:#1b8fc4}
  .lgf-tag.t-avencer{background:rgba(226,170,28,.16);border-color:transparent;color:#b8860b}
  .lgf-tag.t-vencido,.lgf-tag.t-anulado{background:rgba(229,72,77,.14);border-color:transparent;color:#e5484d}
  .lgf-click{cursor:pointer}.lgf-click:hover td{background:rgba(127,127,127,.06)}
  .lgt-tabela td.neg,.lgf-saldo .neg{color:#e5484d}.lgt-tabela td.alerta{color:#e2aa1c}
  .lgf-tipos{border:1px solid var(--lg28-stroke);border-radius:10px;padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0}
  .lgf-tipos legend{font-size:12.5px;font-weight:600;color:var(--lg28-muted);padding:0 6px}
  .lgf-tipo{display:flex!important;flex-direction:row!important;gap:8px!important;align-items:flex-start;padding:10px;border:1px solid var(--lg28-stroke);border-radius:9px;cursor:pointer}
  .lgf-tipo:has(input:checked){border-color:var(--lgt-acc)}
  .lgf-tipo b{display:block;color:var(--lg28-ink);font-size:13.5px}.lgf-tipo small{display:block;font-weight:400;font-size:12px;color:var(--lg28-muted)}
  .lgf-linha{display:flex;gap:8px}.lgf-linha select{flex:1;min-width:0}
  .lgf-saldo{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px 22px;padding:10px 12px;border-radius:9px;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);font-size:13px;color:var(--lg28-muted)}
  .lgf-saldo b{color:var(--lg28-ink)}
  .lgf-det{padding:16px 22px}
  .lgf-det-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
  .lgf-det-kpi div{background:var(--lg28-inset);border:1px solid var(--lg28-stroke);border-radius:10px;padding:10px 12px}
  .lgf-det-kpi span{display:block;font-size:12px;color:var(--lg28-muted)}.lgf-det-kpi b{font-size:16px;font-variant-numeric:tabular-nums}
  .lgf-dl{display:grid;grid-template-columns:150px 1fr;gap:8px 14px;margin:0;font-size:13.5px}
  .lgf-dl dt{color:var(--lg28-muted)}.lgf-dl dd{margin:0}.lgf-dl small{color:var(--lg28-muted)}
  .lgf-h3{margin:18px 0 8px!important;font-size:14px!important}
  .lgf-tempo{list-style:none;margin:0;padding:0 0 0 16px;border-left:2px solid var(--lg28-stroke)}
  .lgf-tempo li{position:relative;padding:4px 0 10px 8px;font-size:13px}
  .lgf-tempo li::before{content:"";position:absolute;left:-23px;top:9px;width:10px;height:10px;border-radius:50%;background:#39bdf6;border:2px solid var(--lg28-panel)}
  .lgf-tempo li.ev-l::before{background:#a78bfa}.lgf-tempo li.ev-p::before{background:#2fbf71}.lgf-tempo li.ev-a::before{background:#e5484d}
  .lgf-tempo span{color:var(--lg28-muted);margin-right:8px;font-variant-numeric:tabular-nums}.lgf-tempo small{display:block;color:var(--lg28-muted)}
  .lgf-tempo a{color:inherit}
  .lgf-rod{flex-wrap:wrap}
  .lgf-abas{display:inline-flex;gap:4px;padding:4px;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);margin:0 0 14px;flex-wrap:wrap}
  .lgf-abas button{border:0;background:transparent;color:var(--lg28-muted);padding:8px 14px;border-radius:7px;font:600 13px var(--v32-font,inherit);cursor:pointer}
  .lgf-abas button[aria-selected="true"]{background:var(--lg28-panel);color:var(--lg28-ink);box-shadow:0 1px 3px rgba(0,0,0,.15)}
  .lgf-abas b{margin-left:4px;font-size:11.5px;opacity:.8}
  .lgf-pos{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:26px;border-radius:7px;background:var(--lg28-inset);border:1px solid var(--lg28-stroke);font-weight:700;font-size:12.5px}
  .lgf-contratos{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
  .lgf-ctr{background:var(--lg28-panel);border:1px solid var(--lg28-stroke);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;border-top:3px solid #2fbf71}
  .lgf-ctr.s-avencer{border-top-color:#e2aa1c}.lgf-ctr.s-vencido{border-top-color:#e5484d}.lgf-ctr.s-encerrado{border-top-color:var(--lg28-stroke);opacity:.75}
  .lgf-ctr header{display:flex;justify-content:space-between;align-items:center}
  .lgf-ctr-n{font-weight:700;font-variant-numeric:tabular-nums}
  .lgf-ctr h3{margin:0!important;font-size:15px!important;line-height:1.35}
  .lgf-ctr p{margin:0;font-size:12.5px;color:var(--lg28-muted)}
  .lgf-ctr-v{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .lgf-ctr-v span{display:block;font-size:11.5px;color:var(--lg28-muted)}.lgf-ctr-v b{display:block;font-size:13.5px;font-variant-numeric:tabular-nums}.lgf-ctr-v small{font-size:11.5px;color:var(--lg28-muted)}
  .lgf-ctr footer{display:flex;gap:6px;flex-wrap:wrap}.lgf-ctr footer .lgt-mini{margin:0}
  @media(max-width:1100px){.lgf-kpis{grid-template-columns:repeat(3,1fr)}.lgf-grade{grid-template-columns:1fr}}
  @media(max-width:900px){.lgf-kpis,.lgf-kpis3{grid-template-columns:1fr 1fr!important}.lgf-atalhos{grid-template-columns:1fr 1fr}.lgf-tipos{grid-template-columns:1fr}.lgf-det-kpi{grid-template-columns:1fr 1fr}.lgf-dl{grid-template-columns:1fr}.lgf-dl dt{margin-top:6px}.lgf-meses{gap:3px;height:140px}.lgf-contratos{grid-template-columns:1fr}.lgf-det{padding:14px 16px}}`;
  document.head.appendChild(css);

  function iniciar() { carregar(); criarTelas(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 80)); else setTimeout(iniciar, 80);
})();
