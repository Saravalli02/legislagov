/* Portal da Transparência — página pública (transparencia.html).
   Lê as publicações feitas no painel (Área restrita › Portal da Transparência). */

function transpItensPublicos() { return transpLer().filter(i => i.publicado !== false); }

/* usado pela pesquisa geral do site */
window.TRANSP_BUSCA = function (q) {
  const qq = norm(q); const out = [];
  TRANSP_CATALOGO.forEach(c => { if (norm(c.nome + ' ' + c.desc + ' ' + c.subs.join(' ')).includes(qq)) out.push(['Transparência', c.nome, 'transparencia.html?c=' + c.id]); });
  transpItensPublicos().forEach(i => { if (norm(i.titulo + ' ' + (i.descricao || '') + ' ' + (i.fornecedor || '') + ' ' + (i.numero || '')).includes(qq)) out.push(['Transparência · ' + (transpCategoria(i.cat)?.nome || ''), i.titulo, `transparencia.html?c=${i.cat}&i=${encodeURIComponent(i.id)}`]); });
  return out;
};

function iniciarTransparencia() {
  const app = $('#transp-app'); if (!app) return;
  const estado = { c: param('c') || '', sub: param('s') || '', ano: '', q: param('q') || '', pag: 1, i: param('i') || '' };
  const itens = transpItensPublicos();
  const ultima = itens.reduce((m, i) => (i.atualizadoEm || i.criadoEm || '') > m ? (i.atualizadoEm || i.criadoEm) : m, '');

  function cabecalho(titulo, sub, trilha) {
    return `<div class="cab-pag t-cab"><div class="wrap">
      <nav class="trilha" aria-label="Você está em"><a href="index.html">Início</a><span aria-hidden="true">›</span>${trilha}</nav>
      <h1>${titulo}</h1><p>${sub}</p>
      <form class="t-busca" role="search" onsubmit="event.preventDefault();transpIr({q:this.q.value,c:'',sub:''})">${ic('busca')}<label class="sr-only" for="t-q">Pesquisar na transparência</label><input id="t-q" name="q" value="${esc(estado.q)}" placeholder="Pesquisar: contrato, diária, folha, empenho, fornecedor…"><button class="btn btn-ouro">Pesquisar</button></form>
      <div class="t-meta"><span>${ic('relogio')} Última atualização: <b>${ultima ? new Date(ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</b></span><span>${ic('doc')} ${itens.length} documento(s) publicados</span><a href="#" onclick="event.preventDefault();transpExportar('json',true)">${ic('link')} Dados abertos (JSON)</a></div>
    </div></div>`;
  }

  function inicio() {
    app.innerHTML = cabecalho('Portal da Transparência', 'Informações sobre o uso do dinheiro público pela Câmara Municipal de Neves Paulista, conforme a Lei de Acesso à Informação.', '<span>Transparência</span>') +
      `<div class="wrap conteudo">
        <div class="t-grade">${TRANSP_CATALOGO.map(c => { const n = itens.filter(i => i.cat === c.id).length; return `<a class="t-card" href="transparencia.html?c=${c.id}"><span class="t-ico">${ic(c.icone)}</span><span class="t-txt"><b>${c.nome}</b><small>${c.desc}</small></span><span class="t-n${n ? '' : ' vazio'}">${n ? n + (n === 1 ? ' documento' : ' documentos') : (c.links ? 'Acesso direto' : 'Sem documentos')}</span></a>`; }).join('')}</div>
        <div class="t-faixa">
          <div><h2>Não encontrou o que procurava?</h2><p>Faça um pedido de informação. A resposta é gratuita e o prazo é de até 20 dias.</p></div>
          <div class="acoes" style="margin:0"><a class="btn" href="${CONFIG.esic}" target="_blank" rel="noopener">${ic('info')} Pedir pelo e-SIC</a><a class="btn btn-claro" href="pagina.html?p=ouvidoria">${ic('ouvido')} Ouvidoria</a></div>
        </div>
        <p class="nota" style="margin-top:28px">Organização baseada na matriz do Programa Nacional de Transparência Pública (PNTP) para o Poder Legislativo. Os documentos são publicados pela Câmara por meio da Área restrita.</p>
      </div>`;
  }

  function categoria() {
    const c = transpCategoria(estado.c); if (!c) { estado.c = ''; return inicio(); } estado.c = c.id;
    document.title = c.nome + ' — Portal da Transparência';
    const daCat = itens.filter(i => i.cat === c.id);
    const anos = [...new Set(daCat.map(i => (i.competencia || i.data || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    app.innerHTML = cabecalho(c.nome, c.desc, `<a href="transparencia.html">Transparência</a><span aria-hidden="true">›</span><span>${c.nome}</span>`) +
      `<div class="wrap conteudo"><div class="duas-col">
        <nav class="lateral" aria-label="Seções da transparência"><h3>Transparência</h3>${TRANSP_CATALOGO.map(x => `<a href="transparencia.html?c=${x.id}"${x.id === c.id ? ' aria-current="page"' : ''}>${x.nome}</a>`).join('')}</nav>
        <div>
          <p class="t-base">${ic('escudo')} Base legal: ${c.base}</p>
          ${c.grupos ? `<div class="t-grupos" role="tablist" aria-label="Tipos de documento"><div class="t-subs"><button type="button" role="tab" data-sub="" aria-selected="${!estado.sub}">Todos</button></div>${c.grupos.map(([g, ss]) => `<div class="t-grupo"><span class="t-grupo-rot">${esc(g)}</span><div class="t-subs">${ss.map(s => `<button type="button" role="tab" data-sub="${esc(s)}" aria-selected="${estado.sub === s}">${esc(s)}</button>`).join('')}</div></div>`).join('')}</div>` :
          `<div class="t-subs" role="tablist" aria-label="Tipos de documento"><button type="button" role="tab" data-sub="" aria-selected="${!estado.sub}">Todos</button>${c.subs.map(s => `<button type="button" role="tab" data-sub="${esc(s)}" aria-selected="${estado.sub === s}">${esc(s)}</button>`).join('')}</div>`}
          <div class="filtros">
            <label class="campo-busca">${ic('busca')}<span class="sr-only">Filtrar</span><input id="t-filtro" placeholder="Filtrar nesta seção" value="${esc(estado.q)}"></label>
            <label class="sr-only" for="t-ano">Ano</label><select class="sel" id="t-ano"><option value="">Todos os anos</option>${anos.map(a => `<option${a === estado.ano ? ' selected' : ''}>${a}</option>`).join('')}</select>
            <div class="t-exp"><button class="btn btn-claro" type="button" onclick="transpExportar('csv')">${ic('doc')} CSV</button><button class="btn btn-claro" type="button" onclick="transpExportar('json')">${ic('link')} JSON</button></div>
          </div>
          <p class="contador" id="t-cont" role="status"></p>
          <div class="t-tabela-wrap"><table class="tabela t-tabela"><thead><tr><th>Data</th><th>Documento</th><th>Referência</th>${c.valor ? '<th class="num">Valor</th>' : ''}<th><span class="sr-only">Arquivo</span></th></tr></thead><tbody id="t-corpo"></tbody></table></div>
          <nav class="paginacao" id="t-pag" aria-label="Páginas"></nav>
          ${c.links ? `<h2 class="t-h2">Acesso direto</h2><div class="t-links">${c.links.map(([l, u]) => `<a href="${u}"${alvo(u)}>${ic(ehExterno(u) ? 'ext' : 'seta')}<span>${esc(l)}</span></a>`).join('')}</div>` : ''}
        </div>
      </div></div>`;
    $$('.t-subs button').forEach(b => b.onclick = () => { estado.sub = b.dataset.sub; estado.pag = 1; $$('.t-subs button').forEach(x => x.setAttribute('aria-selected', x === b)); tabela(); });
    $('#t-filtro').oninput = e => { estado.q = e.target.value; estado.pag = 1; tabela(); };
    $('#t-ano').oninput = e => { estado.ano = e.target.value; estado.pag = 1; tabela(); };
    $('#t-pag').onclick = e => { const b = e.target.closest('button[data-p]'); if (b && !b.disabled) { estado.pag = +b.dataset.p; tabela(); } };
    tabela();
    if (estado.i) setTimeout(() => { const tr = document.getElementById('it-' + estado.i); if (tr) { tr.classList.add('t-realce'); tr.scrollIntoView({ block: 'center' }); } }, 50);
  }

  function filtrados() {
    const q = norm(estado.q);
    return itens.filter(i => (!estado.c || i.cat === estado.c) && (!estado.sub || i.sub === estado.sub) && (!estado.ano || (i.competencia || i.data || '').startsWith(estado.ano)) &&
      (!q || norm([i.titulo, i.descricao, i.numero, i.fornecedor, i.sub].join(' ')).includes(q)))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  }
  window.transpFiltrados = filtrados;

  function linhaDoc(i, comCat) {
    const c = transpCategoria(i.cat);
    const acao = i.arquivo ? `<button class="btn btn-claro t-abrir" type="button" onclick="transpAbrirId('${esc(i.id)}')">${ic('doc')} Abrir</button>` : (i.link ? `<a class="btn btn-claro t-abrir" href="${esc(i.link)}" target="_blank" rel="noopener">${ic('ext')} Acessar</a>` : '');
    return `<tr id="it-${esc(i.id)}"${i.previa ? ' class="t-previa"' : ''}><td class="t-data">${i.data ? new Date(i.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td>${i.previa ? '<span class="t-previa-selo">Prévia — ainda não publicado</span>' : ''}<b>${esc(i.titulo)}</b>${i.descricao ? `<small>${esc(i.descricao)}</small>` : ''}<span class="t-tags">${comCat ? `<span class="chip">${esc(c?.nome || '')}</span>` : ''}<span class="chip ouro">${esc(i.sub || '')}</span>${i.numero ? `<span class="t-num">Nº ${esc(i.numero)}</span>` : ''}${i.fornecedor ? `<span class="t-num">${esc(i.fornecedor)}</span>` : ''}</span></td>
      <td>${i.competencia ? transpCompetencia(i.competencia) : '—'}</td>${(c?.valor || comCat) ? `<td class="num">${transpMoeda(i.valor) || '—'}</td>` : ''}<td>${acao}</td></tr>`;
  }
  window.transpAbrirId = id => transpAbrirArquivo(itens.find(x => x.id === id));

  function tabela() {
    const l = filtrados(); const porPag = 15; const total = Math.max(1, Math.ceil(l.length / porPag)); estado.pag = Math.min(estado.pag, total);
    const c = transpCategoria(estado.c); const cols = c && c.valor ? 5 : 4;
    $('#t-cont').textContent = `${l.length} documento(s)`;
    $('#t-corpo').innerHTML = l.length ? l.slice((estado.pag - 1) * porPag, estado.pag * porPag).map(i => linhaDoc(i)).join('') :
      `<tr><td colspan="${cols}" class="t-vazio">${ic('doc')}<b>Nenhum documento publicado${estado.sub ? ' em “' + esc(estado.sub) + '”' : ''}.</b><span>Os documentos desta seção são publicados pela Câmara na Área restrita. Se precisar de uma informação agora, use o e-SIC.</span></td></tr>`;
    $('#t-pag').innerHTML = total > 1 ? Array.from({ length: total }, (_, k) => `<button type="button" data-p="${k + 1}"${k + 1 === estado.pag ? ' aria-current="true"' : ''}>${k + 1}</button>`).join('') : '';
  }

  function busca() {
    const q = norm(estado.q);
    const l = itens.filter(i => norm([i.titulo, i.descricao, i.numero, i.fornecedor, i.sub, transpCategoria(i.cat)?.nome].join(' ')).includes(q)).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const cats = TRANSP_CATALOGO.filter(c => norm(c.nome + ' ' + c.desc + ' ' + c.subs.join(' ')).includes(q));
    app.innerHTML = cabecalho('Pesquisa na transparência', `Resultados para “${esc(estado.q)}”`, '<a href="transparencia.html">Transparência</a><span aria-hidden="true">›</span><span>Pesquisa</span>') +
      `<div class="wrap conteudo">${cats.length ? `<h2 class="t-h2" style="margin-top:0">Seções</h2><div class="t-links">${cats.map(c => `<a href="transparencia.html?c=${c.id}">${ic(c.icone)}<span>${c.nome}</span></a>`).join('')}</div>` : ''}
      <h2 class="t-h2">Documentos</h2><div class="t-tabela-wrap"><table class="tabela t-tabela"><thead><tr><th>Data</th><th>Documento</th><th>Referência</th><th class="num">Valor</th><th></th></tr></thead><tbody>${l.length ? l.map(i => linhaDoc(i, true)).join('') : '<tr><td colspan="5" class="t-vazio"><b>Nenhum documento encontrado.</b></td></tr>'}</tbody></table></div></div>`;
  }

  window.transpIr = o => { Object.assign(estado, o, { pag: 1 }); const u = new URLSearchParams(); if (estado.c) u.set('c', estado.c); if (estado.q && !estado.c) u.set('q', estado.q); history.pushState(null, '', 'transparencia.html' + (u.toString() ? '?' + u : '')); render(); scrollTo(0, 0); };
  window.transpExportar = (fmt, tudo) => {
    const l = tudo ? itens : filtrados();
    const linhas = l.map(i => ({ secao: transpCategoria(i.cat)?.nome || i.cat, tipo: i.sub, titulo: i.titulo, descricao: i.descricao || '', numero: i.numero || '', fornecedor: i.fornecedor || '', competencia: i.competencia || '', data: i.data || '', valor: i.valor ?? '', arquivo: i.arquivo ? i.arquivo.nome : '', link: i.link || '', atualizado_em: i.atualizadoEm || i.criadoEm || '' }));
    let conteudo, tipo, ext;
    if (fmt === 'json') { conteudo = JSON.stringify(linhas, null, 2); tipo = 'application/json'; ext = 'json'; }
    else { const cab = Object.keys(linhas[0] || { secao: '', titulo: '' }); conteudo = '﻿' + [cab.join(';'), ...linhas.map(r => cab.map(k => `"${String(r[k]).replace(/"/g, '""')}"`).join(';'))].join('\r\n'); tipo = 'text/csv'; ext = 'csv'; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo + ';charset=utf-8' }));
    a.download = `transparencia-camara-neves-paulista${estado.c && !tudo ? '-' + estado.c : ''}.${ext}`; document.body.appendChild(a); a.click(); a.remove();
  };
  function render() { if (estado.c) categoria(); else if (estado.q) busca(); else inicio(); }
  addEventListener('popstate', () => { estado.c = param('c') || ''; estado.q = param('q') || ''; render(); });
  render();
}
