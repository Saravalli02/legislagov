/* =====================================================================
   LegislaGov — FUNÇÕES POR USUÁRIO
   · Vereador: modelos prontos de proposituras + conferência do texto; Respostas da Prefeitura.
   · Presidente: assinatura em lote (autógrafos e promulgações em sequência).
   · Procuradoria/Secretaria: Livro de leis (numeração automática e texto compilado),
     Ofícios e respostas da Prefeitura, Ouvidoria e e-SIC, Relatório mensal da produção legislativa.
   · Transparência: Calendário de publicações obrigatórias e Nota de transparência (critérios do PNTP 2026).
   Os dados ficam neste navegador até existir o servidor com banco de dados.
   ===================================================================== */
(function () {
  const A = () => window.lgvrAPI;
  const UI = () => window.lgtUI;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { UI() && UI().aviso('Espaço do navegador esgotado.', 'erro'); return false; } };
  const usuario = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const perfil = () => (window.lgPerfil ? lgPerfil(usuario()) : '');
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dBR = iso => iso ? new Date(String(iso).length === 10 ? iso + 'T12:00' : iso).toLocaleDateString('pt-BR') : '—';
  const hojeISO = () => new Date().toISOString().slice(0, 10);
  const listaProt = () => (A() ? A().listaProt() : []);
  const cab = (t, sub, acoes = '') => `<div class="letterhead"><div><h1>${t}</h1><div class="date">${sub}</div></div><div class="lgt-acoes">${acoes}</div></div>`;
  const regra = t => `<p class="lgvr-regra">${ic('ajuda')}<span>${t}</span></p>`;
  const gestor = () => ['adm', 'procurador'].includes(perfil());
  const equipe = () => ['adm', 'procurador', 'secretaria'].includes(perfil());

  /* ================= telas ================= */
  const VIEWS = { livro: 'livro', oficios: 'oficios', ouvidoria: 'ouvidoria', relatorio: 'relatorio', respostas: 'verRespostas', calendario: 'calendario', pntp: 'pntp', videos: 'siteVideos' };
  function criarView(id) {
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main || document.getElementById('view-lgfx-' + id)) return;
    main.insertAdjacentHTML('beforeend', `<section class="view lgt lgvr lgfx" id="view-lgfx-${id}" style="display:none"></section>`);
    const antigo = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lgfx-' + id; b.hidden = true; b.style.display = 'none'; antigo.appendChild(b);
  }
  let tela = '', alvo = '';
  window.lgfxAbrir = function (k, id) {
    if (!VIEWS[k]) return; criarView(k); tela = k; alvo = id || '';
    gotoShared('lgfx-' + k); if (window.lgv31Mark) lgv31Mark(VIEWS[k]); scrollTo(0, 0); desenhar();
  };
  function desenhar() { const f = { livro: tLivro, oficios: tOficios, ouvidoria: tOuvidoria, relatorio: tRelatorio, respostas: tRespostas, calendario: tCalendario, pntp: tPntp, videos: tVideos }[tela]; if (f && $('#view-lgfx-' + tela)) f($('#view-lgfx-' + tela)); }
  const redesenhar = () => { if (tela && $('#view-lgfx-' + tela)?.style.display === 'block') desenhar(); };

  /* =====================================================================
     1) MODELOS DE PROPOSITURAS (Portal do Vereador › Nova propositura)
     ===================================================================== */
  const MODELOS = {
    IND: [
      { k: 'pav', n: 'Tapa-buraco ou recapeamento', campos: [['rua', 'Rua / avenida'], ['bairro', 'Bairro'], ['detalhe', 'O que está acontecendo (opcional)']],
        ementa: c => `Indica ao Senhor Prefeito Municipal a execução de serviços de tapa-buraco e recuperação do pavimento na ${c.rua}, no bairro ${c.bairro}.`,
        texto: c => `INDICO ao Senhor Prefeito Municipal, na forma regimental, que determine ao setor competente a execução de serviços de tapa-buraco e recuperação do pavimento asfáltico na ${c.rua}, no bairro ${c.bairro}.`,
        just: c => `A presente indicação atende a pedidos de moradores e de quem trafega pelo local.${c.detalhe ? ' ' + c.detalhe + '.' : ''} Os buracos colocam em risco motoristas, motociclistas, ciclistas e pedestres, e o reparo evita acidentes e danos aos veículos.` },
      { k: 'luz', n: 'Iluminação pública', campos: [['rua', 'Rua / local'], ['bairro', 'Bairro'], ['detalhe', 'Ex.: lâmpadas queimadas em frente ao nº 120']],
        ementa: c => `Indica ao Senhor Prefeito Municipal a manutenção da iluminação pública na ${c.rua}, no bairro ${c.bairro}.`,
        texto: c => `INDICO ao Senhor Prefeito Municipal, na forma regimental, que determine ao setor competente a manutenção e, se necessário, a ampliação da iluminação pública na ${c.rua}, no bairro ${c.bairro}${c.detalhe ? ' (' + c.detalhe + ')' : ''}.`,
        just: () => 'A falta de iluminação adequada compromete a segurança dos moradores e de quem circula pelo local à noite. A medida atende a reclamações recebidas por este vereador.' },
      { k: 'limpeza', n: 'Limpeza, roçada ou retirada de entulho', campos: [['local', 'Local (rua, terreno, praça)'], ['bairro', 'Bairro']],
        ementa: c => `Indica ao Senhor Prefeito Municipal a limpeza e roçada no(a) ${c.local}, no bairro ${c.bairro}.`,
        texto: c => `INDICO ao Senhor Prefeito Municipal, na forma regimental, que determine ao setor competente a limpeza, roçada e retirada de entulho no(a) ${c.local}, no bairro ${c.bairro}, e, se for terreno particular, a notificação do proprietário.`,
        just: () => 'O mato alto e o acúmulo de lixo favorecem a proliferação de escorpiões, ratos e do mosquito da dengue, além de prejudicar a segurança e a aparência do bairro.' },
      { k: 'poda', n: 'Poda ou remoção de árvore', campos: [['local', 'Endereço'], ['bairro', 'Bairro']],
        ementa: c => `Indica ao Senhor Prefeito Municipal a avaliação e a poda de árvore localizada no(a) ${c.local}, no bairro ${c.bairro}.`,
        texto: c => `INDICO ao Senhor Prefeito Municipal, na forma regimental, que determine ao setor competente a avaliação técnica e a poda (ou remoção, se necessário) de árvore localizada no(a) ${c.local}, no bairro ${c.bairro}.`,
        just: () => 'Os galhos estão próximos à rede elétrica e oferecem risco de queda sobre pedestres, veículos e residências.' },
      { k: 'transito', n: 'Sinalização ou redutor de velocidade', campos: [['rua', 'Rua / cruzamento'], ['bairro', 'Bairro'], ['pedido', 'Ex.: lombada, faixa de pedestre, placa de PARE']],
        ementa: c => `Indica ao Senhor Prefeito Municipal a instalação de ${c.pedido || 'sinalização de trânsito'} na ${c.rua}, no bairro ${c.bairro}.`,
        texto: c => `INDICO ao Senhor Prefeito Municipal, na forma regimental, que determine ao setor competente o estudo e a instalação de ${c.pedido || 'sinalização de trânsito'} na ${c.rua}, no bairro ${c.bairro}.`,
        just: () => 'Os veículos trafegam em velocidade incompatível com o local, onde há circulação de crianças e idosos. A medida busca prevenir acidentes.' },
      { k: 'outra', n: 'Outra providência', campos: [['assunto', 'Qual providência'], ['local', 'Onde (opcional)'], ['motivo', 'Por quê']],
        ementa: c => `Indica ao Senhor Prefeito Municipal ${c.assunto}${c.local ? ' no(a) ' + c.local : ''}.`,
        texto: c => `INDICO ao Senhor Prefeito Municipal, na forma regimental, que determine ao setor competente ${c.assunto}${c.local ? ' no(a) ' + c.local : ''}.`,
        just: c => c.motivo || 'A medida atende a pedido da população.' },
    ],
    REQ: [
      { k: 'info', n: 'Pedido de informações à Prefeitura', campos: [['assunto', 'Assunto (ex.: contrato de transporte escolar)'], ['perguntas', 'Perguntas — uma por linha', 'area']],
        ementa: c => `Requer informações ao Senhor Prefeito Municipal sobre ${c.assunto}.`,
        texto: c => `REQUEIRO, ouvido o Plenário e na forma regimental, que seja oficiado ao Senhor Prefeito Municipal solicitando que preste as seguintes informações sobre ${c.assunto}:\n${String(c.perguntas || '').split('\n').filter(x => x.trim()).map((x, i) => `${i + 1}) ${x.trim()}`).join('\n')}\nSolicito ainda o envio de cópia dos documentos relacionados.`,
        just: () => 'O pedido se fundamenta na função fiscalizadora do Poder Legislativo e no direito de acesso à informação. As respostas permitirão acompanhar a aplicação dos recursos públicos e responder às dúvidas da população.' },
      { k: 'orgao', n: 'Providência de outro órgão (Estado, concessionária)', campos: [['orgao', 'Órgão ou empresa (ex.: DER, Sabesp, CPFL)'], ['pedido', 'O que se pede']],
        ementa: c => `Requer o envio de ofício ao(à) ${c.orgao} solicitando ${c.pedido}.`,
        texto: c => `REQUEIRO, ouvido o Plenário e na forma regimental, que seja oficiado ao(à) ${c.orgao} solicitando ${c.pedido}.`,
        just: () => 'A providência é de responsabilidade do órgão indicado e atende a reivindicação dos munícipes.' },
    ],
    MOC: [
      { k: 'aplauso', n: 'Aplauso / congratulações', campos: [['quem', 'Homenageado(a)'], ['motivo', 'Motivo (ex.: 50 anos de fundação)']],
        ementa: c => `Moção de aplauso e congratulações a ${c.quem}, pelo(a) ${c.motivo}.`,
        texto: c => `A Câmara Municipal de Neves Paulista, na forma regimental, aprova MOÇÃO DE APLAUSO E CONGRATULAÇÕES a ${c.quem}, pelo(a) ${c.motivo}, e determina que dela se dê ciência ao homenageado.`,
        just: c => `A homenagem reconhece ${c.motivo} e a contribuição de ${c.quem} para a comunidade de Neves Paulista.` },
      { k: 'pesar', n: 'Pesar', campos: [['quem', 'Nome de quem faleceu'], ['familia', 'Familiares a quem enviar']],
        ementa: c => `Moção de pesar pelo falecimento de ${c.quem}.`,
        texto: c => `A Câmara Municipal de Neves Paulista, na forma regimental, aprova MOÇÃO DE PESAR pelo falecimento de ${c.quem}, e determina que dela se dê ciência ${c.familia ? 'a ' + c.familia : 'aos familiares'}, com as condolências desta Casa.`,
        just: c => `${c.quem} deixa lembranças e exemplo à comunidade. Esta Casa manifesta solidariedade aos familiares e amigos.` },
      { k: 'apoio', n: 'Apoio ou repúdio', campos: [['tipo', 'Apoio ou repúdio'], ['tema', 'A quê']],
        ementa: c => `Moção de ${String(c.tipo || 'apoio').toLowerCase()} ${c.tema}.`,
        texto: c => `A Câmara Municipal de Neves Paulista, na forma regimental, aprova MOÇÃO DE ${String(c.tipo || 'apoio').toUpperCase()} ${c.tema}, e determina o envio de cópia às autoridades competentes.`,
        just: () => 'A manifestação expressa a posição desta Casa sobre tema de interesse da população.' },
    ],
    PL: [
      { k: 'denom', n: 'Dar nome a rua, praça ou prédio público', campos: [['nome', 'Nome do homenageado'], ['local', 'Via ou próprio (ex.: Rua 5 do Jardim Primavera)'], ['bio', 'Breve biografia', 'area']],
        ementa: c => `Denomina “${c.nome}” o(a) ${c.local} e dá outras providências.`,
        texto: c => `Art. 1º Fica denominado(a) “${c.nome}” o(a) ${c.local}, no Município de Neves Paulista.\nArt. 2º O Poder Executivo providenciará a colocação das placas indicativas.\nArt. 3º As despesas decorrentes desta Lei correrão por conta de dotações próprias do orçamento vigente.\nArt. 4º Esta Lei entra em vigor na data de sua publicação.`,
        just: c => `${c.bio || c.nome + ' teve trajetória marcada pela dedicação à comunidade.'} A denominação perpetua sua memória. Confira na Lei Orgânica os requisitos para denominação de logradouros (ex.: homenageado falecido, documentos exigidos).` },
      { k: 'data', n: 'Data comemorativa no calendário oficial', campos: [['nome', 'Nome da data (ex.: Dia do Agricultor Nevense)'], ['dia', 'Dia (ex.: 28 de julho)']],
        ementa: c => `Institui o “${c.nome}” no calendário oficial do Município.`,
        texto: c => `Art. 1º Fica instituído o “${c.nome}”, a ser comemorado anualmente em ${c.dia}, no calendário oficial de eventos do Município de Neves Paulista.\nArt. 2º Esta Lei entra em vigor na data de sua publicação.`,
        just: () => 'A data valoriza a história e as pessoas do município. A proposta não cria despesa nem atribuição a órgão do Executivo.' },
      { k: 'utilidade', n: 'Declarar entidade de utilidade pública', campos: [['entidade', 'Nome da entidade'], ['cnpj', 'CNPJ']],
        ementa: c => `Declara de utilidade pública municipal a entidade ${c.entidade}.`,
        texto: c => `Art. 1º Fica declarada de utilidade pública municipal a entidade ${c.entidade}, inscrita no CNPJ sob o nº ${c.cnpj}, com sede neste Município.\nArt. 2º Esta Lei entra em vigor na data de sua publicação.`,
        just: c => `A entidade ${c.entidade} presta serviços relevantes à população. Anexe estatuto, ata de eleição da diretoria e comprovante de funcionamento, conforme a lei municipal que trata do tema.` },
    ],
    PDL: [
      { k: 'cidadao', n: 'Título de Cidadão Honorário', campos: [['quem', 'Homenageado(a)'], ['motivo', 'Serviços prestados ao município', 'area']],
        ementa: c => `Concede o Título de Cidadão Honorário de Neves Paulista a ${c.quem}.`,
        texto: c => `Art. 1º Fica concedido o Título de Cidadão Honorário de Neves Paulista a ${c.quem}, em reconhecimento aos relevantes serviços prestados ao Município.\nArt. 2º O título será entregue em sessão solene, em data a ser marcada pela Mesa.\nArt. 3º Este Decreto Legislativo entra em vigor na data de sua publicação.`,
        just: c => c.motivo || `${c.quem} contribuiu de forma significativa para o desenvolvimento de Neves Paulista.` },
    ],
  };
  function conferir(tipo, ementa, texto, just) {
    const av = []; const e = (ementa || '').trim(), t = (texto || '').trim();
    if (e.length < 25) av.push('A ementa está curta: diga em uma frase o que a propositura faz.');
    if (e.length > 300) av.push('A ementa está longa: resuma em uma frase.');
    if (e && !/^(Indica|Requer|Moção|Dispõe|Institui|Denomina|Declara|Concede|Altera|Autoriza|Cria|Revoga|Fixa|Regulamenta|Estabelece|Acrescenta|Dá)/i.test(e)) av.push('Comece a ementa pelo verbo do que se pretende (Indica, Requer, Institui, Denomina, Altera…).');
    if (['PL', 'PR', 'PDL'].includes(tipo) && !/Art\.\s*1/.test(t)) av.push('Projetos se dividem em artigos (Art. 1º, Art. 2º…).');
    if (['PL', 'PR', 'PDL'].includes(tipo) && !/vigor/i.test(t)) av.push('Inclua a cláusula de vigência (ex.: “Esta Lei entra em vigor na data de sua publicação”).');
    if (tipo === 'PL' && /(cria|criação de).*(cargo|órgão|secretaria)|aumento.*(salár|remunera)|despesa obrigatória/i.test(t + ' ' + e)) av.push('Atenção à iniciativa: criar cargos, órgãos ou despesas do Executivo costuma ser competência privativa do Prefeito (vício de iniciativa). Consulte a Procuradoria.');
    if (!String(just || '').trim()) av.push('Escreva a justificativa: ela ajuda os colegas e as comissões a entender o pedido.');
    if (t && t === t.toUpperCase() && t.length > 40) av.push('Evite o texto todo em maiúsculas.');
    return av;
  }
  function ganchoNova() {
    const f = window.lgvrNova; if (typeof f !== 'function' || f.__lgfx) return;
    const w = function (...a) {
      const r = f.apply(this, a); const form = $('#lgt-modal form'); if (!form || form.querySelector('.lgfx-mod')) return r;
      const bar = document.createElement('div'); bar.className = 'lgfx-mod cheio';
      bar.innerHTML = `<div class="lgfx-mod-cab">${ic('modelo')}<b>Começar de um modelo</b><select aria-label="Modelo"><option value="">Escolha um modelo…</option>${Object.entries(MODELOS).map(([t, l]) => `<optgroup label="${esc(A().TIPOS[t].nome)}">${l.map(m => `<option value="${t}:${m.k}">${esc(m.n)}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="lgfx-mod-campos"></div>`;
      const campos = form.querySelector('.lgt-campos'); campos.insertBefore(bar, campos.firstChild);
      const sel = bar.querySelector('select'), box = bar.querySelector('.lgfx-mod-campos');
      sel.onchange = () => { const [t, k] = sel.value.split(':'); const m = (MODELOS[t] || []).find(x => x.k === k); if (!m) { box.innerHTML = ''; return; }
        box.innerHTML = m.campos.map(([c, rot, tp]) => `<label><span>${esc(rot)}</span>${tp === 'area' ? `<textarea data-c="${c}" rows="2"></textarea>` : `<input data-c="${c}">`}</label>`).join('') + `<button type="button" class="lgt-btn primario">Preencher a propositura</button>`;
        box.querySelector('button').onclick = () => { const c = {}; box.querySelectorAll('[data-c]').forEach(x => c[x.dataset.c] = x.value.trim()); const falta = m.campos.filter(([cc, rot]) => !/opcional/i.test(rot) && !c[cc]).map(x => x[1]); if (falta.length) { form.querySelector('.lgt-erro').textContent = 'Preencha: ' + falta.join(', '); return; }
          form.querySelector('.lgt-erro').textContent = ''; const r0 = form.querySelector(`[name=tipo][value=${t}]`); if (r0) r0.checked = true;
          form.ementa.value = m.ementa(c); form.texto.value = m.texto(c); form.justificativa.value = m.just(c); UI().aviso('Texto preenchido. Revise e ajuste o que precisar.'); form.ementa.focus(); }; };
      const rod = form.querySelector('.lgt-modal-rod'); const b = document.createElement('button'); b.type = 'button'; b.className = 'lgt-btn'; b.innerHTML = ic('check') + ' Conferir o texto'; b.onclick = () => { const av = conferir(form.tipo.value, form.ementa.value, form.texto.value, form.justificativa.value); let el = form.querySelector('.lgfx-conf'); if (!el) { el = document.createElement('div'); el.className = 'lgfx-conf'; rod.before(el); } el.innerHTML = av.length ? `<b>Sugestões antes de assinar:</b><ul>${av.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<b class="ok">Texto conferido: nenhum problema de forma encontrado.</b> A análise jurídica continua com a Procuradoria.'; };
      rod.insertBefore(b, rod.firstChild);
      return r;
    };
    w.__lgfx = true; window.lgvrNova = w;
  }

  /* =====================================================================
     2) ASSINATURA EM LOTE (Presidente: autógrafos e promulgações)
     ===================================================================== */
  let lote = null;
  const aprovados = () => listaProt().filter(p => p.status === 'votacao' && p.resultado === 'aprovado');
  function ganchoLote() {
    const f = window.lgvrAbrir; if (typeof f !== 'function' || f.__lgfx) return;
    const w = function (k, ...r) { const x = f.call(this, k, ...r); setTimeout(() => botaoLote(k), 20); return x; }; w.__lgfx = true; window.lgvrAbrir = w;
  }
  function botaoLote(k) {
    if (!['autografos', 'assinar'].includes(k)) return; const a = A().atual(); if (!a || a.v.id !== A().comp().presidente) return;
    const n = aprovados().length; const v = $(`#view-lgvr-${k}`); if (!v || n < 2 || v.querySelector('.lgfx-lote-b')) return;
    const ac = v.querySelector('.letterhead .lgt-acoes'); if (!ac) return;
    ac.insertAdjacentHTML('beforeend', `<button type="button" class="lgt-btn primario lgfx-lote-b" data-edita onclick="lgfxLote()">${ic('assinar')} Assinar em lote (${n})</button>`);
  }
  window.lgfxLote = function () {
    const l = aprovados(); if (!l.length) return UI().aviso('Nada para assinar.', 'erro');
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Assinar em lote</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <p class="lgt-p">Marque os documentos. O sistema abre um por vez: ao concluir a assinatura de um, o próximo abre sozinho. Com certificado ICP-Brasil em nuvem ou token, a autorização costuma valer para a sequência inteira.</p>
      <div class="lgfx-lista">${l.map(p => `<label class="lgfx-li"><input type="checkbox" name="d" value="${p.id}" checked><span><b>${esc(p.numero)} · ${A().TIPOS[A().tipoDe(p)].fluxo === 'promulga' ? 'Promulgação' : 'Autógrafo'}</b><small>${esc(p.ementa)}</small></span></label>`).join('')}</div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Começar a assinar</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = e => { e.preventDefault(); const ids = [...f.querySelectorAll('[name=d]:checked')].map(x => x.value); if (!ids.length) { f.querySelector('.lgt-erro').textContent = 'Marque ao menos um documento.'; return; } UI().fecharModal(); lote = { ids, feitos: 0 }; proximoLote(); };
  };
  function proximoLote() {
    if (!lote) return; const pend = lote.ids.filter(id => { const p = listaProt().find(x => x.id === id); return p && p.status === 'votacao' && p.resultado === 'aprovado'; });
    lote.feitos = lote.ids.length - pend.length; barraLote();
    if (!pend.length) { UI().aviso(`Lote concluído: ${lote.feitos} documento(s) assinado(s).`); lote = null; barraLote(); return; }
    setTimeout(() => window.lgvrAutografo && lgvrAutografo(pend[0]), 250);
  }
  function barraLote() {
    let el = $('#lgfx-lote'); if (!lote) { el && el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'lgfx-lote'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = `<b>${ic('assinar')} Assinatura em lote</b><span>${lote.feitos} de ${lote.ids.length} assinados</span><button type="button" class="lgt-mini primario" onclick="lgfxLoteSeguir()">Assinar o próximo</button><button type="button" class="lgt-mini" onclick="lgfxLoteParar()">Parar</button>`;
  }
  window.lgfxLoteSeguir = () => proximoLote();
  window.lgfxLoteParar = () => { lote = null; barraLote(); };

  /* =====================================================================
     3) LIVRO DE LEIS (numeração e texto compilado)
     ===================================================================== */
  const salvarLivro = d => gravar(window.LEIS_CHAVE || 'lgll_v1', d);
  window.lgfxLeis = () => (window.lgLeisTodas ? lgLeisTodas() : []);
  let filtroLei = '', leiAberta = '';
  function tLivro(el) {
    const todas = lgfxLeis(); const d = lgLivro(); const pode = equipe();
    if (alvo) { leiAberta = alvo; alvo = ''; }
    const lei = todas.find(x => x.id === leiAberta);
    if (lei) return tLei(el, lei, todas, pode);
    const q = (filtroLei || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const l = todas.filter(x => !q || [x.titulo, x.ementa, x.texto].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
    el.innerHTML = cab('Livro de leis', 'Leis, resoluções e decretos legislativos, com numeração e texto compilado', pode ? `<button class="lgt-btn" type="button" onclick="lgfxNumeracao()">Numeração</button><button class="lgt-btn primario" type="button" onclick="lgfxNovaLei()">+ Cadastrar norma</button>` : '') +
      regra(`As normas aprovadas no sistema entram aqui sozinhas. Leis anteriores podem ser cadastradas com o texto. Próxima lei: <b>nº ${esc(lgLeisProximoNumero('Lei'))}</b>${+d.cfg.ultimaLei ? '' : ' (informe em “Numeração” o número da última lei antes do sistema)'}. A busca procura também dentro do texto.`) +
      `<div class="lgt-filtros"><label class="cresce"><span>Buscar no número, na ementa ou no texto</span><input id="lgfx-lq" value="${esc(filtroLei)}" placeholder="Ex.: horta, denominação, 1850…"></label></div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Norma</th><th>Ementa</th><th>Situação</th><th class="acoes-col"></th></tr></thead><tbody>${l.map(x => `<tr class="lgvr-click" onclick="lgfxLei('${esc(x.id)}')"><td><b>${esc(x.titulo)}</b><small>${dBR(x.data)}${x.exemplo ? ' · <span class="lgvr-tag t-av">exemplo</span>' : ''}</small></td><td>${esc(x.ementa)}</td><td>${x.revogada ? '<span class="lgvr-tag t-er">Revogada</span>' : (x.alteracoes || []).length ? `<span class="lgvr-tag t-an">Alterada (${x.alteracoes.length})</span>` : '<span class="lgvr-tag t-ok">Em vigor</span>'}</td><td class="acoes-col"><button class="lgt-mini" type="button">Abrir</button></td></tr>`).join('') || '<tr><td colspan="4" class="lgt-vazio"><b>Nenhuma norma encontrada.</b></td></tr>'}</tbody></table></div>`;
    const inp = $('#lgfx-lq'); inp.oninput = () => { filtroLei = inp.value; const pos = inp.selectionStart; tLivro(el); const n = $('#lgfx-lq'); n.focus(); n.setSelectionRange(pos, pos); };
  }
  window.lgfxLei = id => { leiAberta = id; desenhar(); scrollTo(0, 0); };
  let verAnt = false;
  function tLei(el, lei, todas, pode) {
    const altera = todas.filter(x => x.id !== lei.id && (x.alteracoes || []).some(a => (a.porLei || '').includes(lei.titulo))).map(x => x.titulo);
    const por = [...new Set((lei.alteracoes || []).map(a => a.porLei))];
    el.innerHTML = cab(esc(lei.titulo), `${esc(lei.ementa)}`, `<button class="lgt-btn" type="button" onclick="lgfxLei('')">← Livro de leis</button>${pode && !lei.exemplo ? `<button class="lgt-btn" type="button" onclick="lgfxAlteracao('${esc(lei.id)}')">Registrar alteração</button>` : ''}<button class="lgt-btn" type="button" onclick="lgfxImprimirLei('${esc(lei.id)}')">${ic('externo')} Imprimir</button>`) +
      `${lei.exemplo ? regra('Exemplo para demonstração do texto compilado. Não é lei vigente.') : ''}
      <div class="lgfx-lei-meta"><span><small>Publicação</small><b>${dBR(lei.data)}</b></span>${lei.vigencia ? `<span><small>Vigência</small><b>${esc(lei.vigencia)}</b></span>` : ''}${lei.projeto ? `<span><small>Origem</small><b>${esc(lei.projeto)}</b></span>` : ''}${lei.autor ? `<span><small>Autoria</small><b>${esc(lei.autor)}</b></span>` : ''}${por.length ? `<span><small>Alterada por</small><b>${esc(por.join(', '))}</b></span>` : ''}${altera.length ? `<span><small>Esta norma altera</small><b>${esc(altera.join(', '))}</b></span>` : ''}</div>
      ${lei.revogada ? `<p class="lgvr-regra">${ic('ajuda')}<span>Revogada pela ${esc(lei.revogada.por)}.</span></p>` : ''}
      <div class="lgt-card"><div class="lgvr-card-cab"><h3>Texto ${(lei.alteracoes || []).length ? 'compilado' : 'original'}</h3>${(lei.alteracoes || []).length ? `<label class="lgfx-sw"><input type="checkbox" ${verAnt ? 'checked' : ''} onchange="lgfxVerAnt(this.checked)"> Mostrar redações anteriores</label>` : ''}</div>
        <div class="lgfx-texto ${verAnt ? 'ant' : ''}">${lgLeisCompilar(lei)}</div></div>
      ${(lei.alteracoes || []).length ? `<div class="lgt-card"><h3>Alterações registradas</h3><ul class="lgfx-alts">${lei.alteracoes.map(a => `<li><b>${esc(a.dispositivo)} — ${{ redacao: 'nova redação', acrescimo: 'acrescido', revogacao: 'revogado' }[a.acao]}</b><small>${esc(a.porLei)} · ${dBR(a.data)}</small></li>`).join('')}</ul></div>` : ''}`;
  }
  window.lgfxVerAnt = v => { verAnt = v; desenhar(); };
  window.lgfxImprimirLei = function (id) {
    const lei = lgfxLeis().find(x => x.id === id); if (!lei) return; const w = window.open('', '_blank'); if (!w) return UI().aviso('Permita janelas pop-up.', 'erro');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(lei.titulo)}</title><style>body{font:15px/1.6 Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px}h1{font:700 17px Arial;text-align:center}.em{margin-left:40%;font-style:italic}.ll-ant{display:none}s{color:#777}em{font-size:12px;color:#555}@media print{button{display:none}}</style></head><body><button onclick="print()" style="float:right">Imprimir</button><p style="text-align:center;font-family:Arial"><b>CÂMARA MUNICIPAL DE NEVES PAULISTA</b><br><small>Texto compilado</small></p><h1>${esc(lei.titulo.toUpperCase())}</h1><p class="em">${esc(lei.ementa)}</p>${lgLeisCompilar(lei)}<p style="margin-top:40px;border-top:1px solid #ccc;padding-top:8px;font:11px Arial;color:#777;text-align:center">Texto compilado gerado pelo LegislaGov · legislagov.com.br</p></body></html>`); w.document.close();
  };
  window.lgfxNumeracao = function () {
    if (!equipe()) return; const d = lgLivro();
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Numeração das normas</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <p class="lgt-p cheio">Informe o número da última lei publicada antes de usar o sistema. A partir dele, o sistema sugere o próximo número ao registrar a sanção ou a promulgação.</p>
      <label><span>Última lei ordinária</span><input name="ul" type="number" min="0" value="${esc(d.cfg.ultimaLei || '')}" placeholder="Ex.: 1849"></label><label><span>Última lei complementar</span><input name="lc" type="number" min="0" value="${esc(d.cfg.ultimaLC || '')}"></label></div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Salvar</button></div></form>`);
    const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); const dd = lgLivro(); dd.cfg.ultimaLei = +f.ul.value || 0; dd.cfg.ultimaLC = +f.lc.value || 0; salvarLivro(dd); UI().fecharModal(); UI().aviso('Numeração salva.'); desenhar(); };
  };
  window.lgfxNovaLei = function () {
    if (!equipe()) return;
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Cadastrar norma</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <label><span>Tipo *</span><select name="tipo"><option>Lei</option><option>Lei Complementar</option><option>Resolução</option><option>Decreto Legislativo</option></select></label>
      <label><span>Número *</span><input name="numero" inputmode="numeric" placeholder="Ex.: 1849"></label><label><span>Ano *</span><input name="ano" type="number" value="${new Date().getFullYear()}"></label><label><span>Publicação</span><input name="data" type="date"></label>
      <label class="cheio"><span>Ementa *</span><input name="ementa"></label>
      <label class="cheio"><span>Texto (cole com os artigos: “Art. 1º …”, um por linha)</span><textarea name="texto" rows="8"></textarea></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Cadastrar</button></div></form>`);
    const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); if (!f.numero.value.trim() || !f.ano.value || !f.ementa.value.trim()) { f.querySelector('.lgt-erro').textContent = 'Preencha tipo, número, ano e ementa.'; return; }
      const d = lgLivro(); const novo = { id: uid('ll'), tipo: f.tipo.value, numero: f.numero.value.trim().replace(/\D/g, ''), ano: +f.ano.value, data: f.data.value || hojeISO(), ementa: f.ementa.value.trim(), texto: f.texto.value.trim(), alteracoes: [], cadastradaPor: (usuario() || {}).nome || '' };
      if (lgfxLeis().some(x => !x.exemplo && x.tipo === novo.tipo && x.numero === novo.numero && (x.tipo.startsWith('Lei') || x.ano === novo.ano))) { f.querySelector('.lgt-erro').textContent = 'Já existe uma norma com esse número.'; return; }
      d.leis.push(novo); salvarLivro(d); UI().fecharModal(); UI().aviso('Norma cadastrada.'); leiAberta = novo.id; desenhar(); };
  };
  function garantirNoLivro(id) {
    const d = lgLivro(); let x = d.leis.find(l => l.id === id); if (x) return { d, x };
    const t = lgfxLeis().find(l => l.id === id); if (!t || t.exemplo) return { d, x: null }; x = { ...t }; delete x.titulo; d.leis.push(x); return { d, x };
  }
  window.lgfxAlteracao = function (id) {
    if (!equipe()) return; const lei = lgfxLeis().find(x => x.id === id); if (!lei) return;
    const outras = lgfxLeis().filter(x => x.id !== id && !x.exemplo);
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Alteração na ${esc(lei.titulo)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <label class="cheio"><span>Norma que altera *</span><input name="por" list="lgfx-por" placeholder="Ex.: Lei nº 1852/2026"><datalist id="lgfx-por">${outras.map(x => `<option value="${esc(x.titulo)}">`).join('')}</datalist></label>
      <fieldset class="cheio lgvr-opts"><legend>O que muda *</legend><label><input type="radio" name="acao" value="redacao" checked> Nova redação de um artigo</label><label><input type="radio" name="acao" value="acrescimo"> Acréscimo de artigo (ex.: Art. 3º-A)</label><label><input type="radio" name="acao" value="revogacao"> Revogação de um artigo</label><label><input type="radio" name="acao" value="total"> Revogação da norma inteira</label></fieldset>
      <label><span>Artigo *</span><input name="disp" placeholder="Ex.: Art. 3º"></label><label><span>Data</span><input name="data" type="date" value="${hojeISO()}"></label>
      <label class="cheio lgfx-novo"><span>Novo texto do artigo *</span><textarea name="texto" rows="4" placeholder="Art. 3º …"></textarea></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Registrar</button></div></form>`);
    const f = $('#lgt-modal form'); const vis = () => { const a = f.acao.value; $('.lgfx-novo', f).hidden = a === 'revogacao' || a === 'total'; f.disp.closest('label').hidden = a === 'total'; }; f.querySelectorAll('[name=acao]').forEach(r => r.onchange = vis); vis();
    f.onsubmit = e => { e.preventDefault(); const a = f.acao.value, er = f.querySelector('.lgt-erro');
      if (!f.por.value.trim()) { er.textContent = 'Informe a norma que altera.'; return; }
      if (a !== 'total' && !lgLeisChave(f.disp.value)) { er.textContent = 'Informe o artigo no formato “Art. 3º” ou “Art. 3º-A”.'; return; }
      if ((a === 'redacao' || a === 'acrescimo') && !f.texto.value.trim()) { er.textContent = 'Escreva o novo texto do artigo.'; return; }
      const { d, x } = garantirNoLivro(id); if (!x) return;
      if (a === 'total') x.revogada = { por: f.por.value.trim(), data: f.data.value };
      else (x.alteracoes = x.alteracoes || []).push({ id: uid('al'), porLei: f.por.value.trim(), dispositivo: f.disp.value.trim(), acao: a, texto: f.texto.value.trim(), data: f.data.value || hojeISO(), por: (usuario() || {}).nome || '' });
      salvarLivro(d); UI().fecharModal(); UI().aviso('Alteração registrada. O texto compilado já está atualizado.'); leiAberta = id; desenhar(); };
  };
  // sugere o próximo número na sanção e na promulgação
  function ganchoNumero() {
    ['lgvrSancao', 'lgvrPromulgarLei'].forEach(nome => { const f = window[nome]; if (typeof f !== 'function' || f.__lgfx) return;
      const w = function (...a) { const r = f.apply(this, a); const inp = $('#lgt-modal [name=lei]'); if (inp && !inp.value && window.lgLeisProximoNumero) { inp.value = `${lgLeisProximoNumero('Lei')}/${new Date().getFullYear()}`; inp.insertAdjacentHTML('afterend', '<small class="lgfx-sug">Próximo número do Livro de leis. Confira antes de salvar.</small>'); } return r; };
      w.__lgfx = true; window[nome] = w; });
  }

  /* =====================================================================
     4) OFÍCIOS E RESPOSTAS DA PREFEITURA
     ===================================================================== */
  const comOficio = () => listaProt().filter(p => ['IND', 'REQ'].includes(A().tipoDe(p)) && p.status === 'concluido' && p.resultado === 'aprovado');
  let abaOf = 'aguardando';
  function tOficios(el) {
    const l = comOficio(); const ag = l.filter(p => !p.resposta), rs = l.filter(p => p.resposta); const pode = equipe();
    const lista = abaOf === 'aguardando' ? ag : rs;
    el.innerHTML = cab('Ofícios e respostas da Prefeitura', 'Indicações e requerimentos aprovados: envio do ofício e registro da resposta') +
      regra('Aprovada a indicação ou o requerimento, a Secretaria envia o ofício e registra aqui a resposta. O vereador autor acompanha tudo em “Respostas da Prefeitura” e recebe o aviso no sino. Prazos sugeridos: requerimento 15 dias, indicação 30 dias (confirme na Lei Orgânica).') +
      `<div class="lgf-abas" role="tablist"><button type="button" role="tab" aria-selected="${abaOf === 'aguardando'}" onclick="lgfxAbaOf('aguardando')">Aguardando resposta <b>${ag.length}</b></button><button type="button" role="tab" aria-selected="${abaOf === 'respondidas'}" onclick="lgfxAbaOf('respondidas')">Respondidas <b>${rs.length}</b></button></div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Matéria</th><th>Autor</th><th>Ofício</th><th>${abaOf === 'aguardando' ? 'Prazo' : 'Resposta'}</th><th class="acoes-col"></th></tr></thead><tbody>${lista.map(p => `<tr><td><b>${esc(p.numero)}</b><small>${esc(p.ementa)}</small></td><td><small>${esc(p.autor || '')}</small></td><td><small>${p.oficio && p.oficio.numero ? `Ofício nº ${esc(p.oficio.numero)}<br>${dBR(p.oficio.enviado)}` : p.oficio ? 'Envio a registrar' : '—'}</small></td><td>${p.resposta ? `<small>${dBR(p.resposta.data)} · ${esc(p.resposta.texto.slice(0, 80))}</small>` : (window.lgavChip ? lgavChip(p) : '')}</td>
        <td class="acoes-col">${pode && !p.resposta ? `${!(p.oficio && p.oficio.numero) ? `<button class="lgt-mini" type="button" onclick="lgfxOficio('${p.id}')">Registrar ofício</button>` : ''}<button class="lgt-mini primario" type="button" onclick="lgfxResposta('${p.id}')">Registrar resposta</button>` : ''}${p.resposta ? `<button class="lgt-mini" type="button" onclick="lgfxVerResposta('${p.id}')">Ver</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="5" class="lgt-vazio"><b>${abaOf === 'aguardando' ? 'Nenhum ofício aguardando resposta.' : 'Nenhuma resposta registrada ainda.'}</b></td></tr>`}</tbody></table></div>`;
  }
  window.lgfxAbaOf = k => { abaOf = k; desenhar(); };
  window.lgfxOficio = function (id) {
    if (!equipe()) return; const p = listaProt().find(x => x.id === id); if (!p) return;
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Ofício · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <label><span>Número do ofício *</span><input name="num" placeholder="Ex.: 245/2026"></label><label><span>Enviado em *</span><input name="data" type="date" value="${hojeISO()}"></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Salvar</button></div></form>`);
    const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); if (!f.num.value.trim()) { f.querySelector('.lgt-erro').textContent = 'Informe o número do ofício.'; return; }
      p.oficio = { ...(p.oficio || {}), numero: f.num.value.trim(), enviado: new Date(f.data.value + 'T12:00').toISOString() }; p.timeline.push({ date: A().agoraTL(), label: `Ofício nº ${p.oficio.numero} enviado ao Prefeito` });
      A().persistirProt('Ofício enviado', p); UI().fecharModal(); UI().aviso('Ofício registrado.'); desenhar(); };
  };
  window.lgfxResposta = function (id) {
    if (!equipe()) return; const p = listaProt().find(x => x.id === id); if (!p) return;
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Resposta da Prefeitura · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos">
      <p class="lgt-p cheio">${esc(p.ementa)}</p>
      <label><span>Recebida em *</span><input name="data" type="date" value="${hojeISO()}"></label><label><span>Documento</span><input name="doc" placeholder="Ex.: Ofício nº 98/2026 — GP"></label>
      <label class="cheio"><span>Resumo da resposta *</span><textarea name="texto" rows="4" placeholder="Ex.: Informa que o serviço foi incluído no cronograma de dezembro."></textarea></label>
      <label class="cheio"><span>Arquivo (PDF, até 1,5 MB)</span><input name="arq" type="file" accept="application/pdf"></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Registrar resposta</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = async e => { e.preventDefault(); const er = f.querySelector('.lgt-erro'); if (!f.texto.value.trim()) { er.textContent = 'Escreva o resumo da resposta.'; return; }
      let arquivo = null; const fl = f.arq.files[0]; if (fl) { if (fl.size > 1.5e6) { er.textContent = 'O PDF passa de 1,5 MB. Reduza o arquivo ou registre só o resumo.'; return; } arquivo = { nome: fl.name, data: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(fl); }) }; }
      p.oficio = p.oficio || { enviado: new Date().toISOString() };
      p.resposta = { data: new Date(f.data.value + 'T12:00').toISOString(), doc: f.doc.value.trim(), texto: f.texto.value.trim(), arquivo, por: (usuario() || {}).nome || '' };
      p.timeline.push({ date: A().agoraTL(), label: `Resposta da Prefeitura recebida${p.resposta.doc ? ' (' + p.resposta.doc + ')' : ''}: ${p.resposta.texto.slice(0, 120)}` });
      A().persistirProt('Resposta da Prefeitura', p); UI().fecharModal(); UI().aviso('Resposta registrada. O autor recebe o aviso.'); desenhar(); };
  };
  window.lgfxVerResposta = function (id) {
    const p = listaProt().find(x => x.id === id); if (!p || !p.resposta) return; const r = p.resposta;
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Resposta · ${esc(p.numero)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgvr-det"><p class="lgvr-tipo-l">${esc(p.tipoNome || '')} · ${esc(p.autor || '')}</p><h3>${esc(p.ementa)}</h3>
      <h4>Resposta da Prefeitura</h4><p class="lgt-p">${esc(r.texto)}</p><p class="lgt-p"><small>Recebida em ${dBR(r.data)}${r.doc ? ' · ' + esc(r.doc) : ''}${p.oficio && p.oficio.numero ? ` · em resposta ao Ofício nº ${esc(p.oficio.numero)}` : ''}</small></p></div>
      <div class="lgt-modal-rod">${r.arquivo ? `<a class="lgt-btn" href="${esc(r.arquivo.data)}" download="${esc(r.arquivo.nome)}">${ic('externo')} Baixar o PDF</a>` : ''}<button type="button" class="lgt-btn primario" onclick="lgtFechar()">Fechar</button></div></div>`);
  };
  function tRespostas(el) {
    const a = A().atual(); if (!a) { el.innerHTML = cab('Respostas da Prefeitura', ''); return; }
    const minhas = listaProt().filter(p => A().ehMinha(p, a.v) && ['IND', 'REQ'].includes(A().tipoDe(p)));
    const st = p => p.resposta ? ['Respondida', 'ok'] : p.status === 'concluido' && p.resultado === 'aprovado' ? ['Aguardando a Prefeitura', 'av'] : p.status === 'rejeitado' ? ['Rejeitada', 'er'] : ['Em tramitação', 'an'];
    el.innerHTML = A().faixaDemo(a) + cab('Respostas da Prefeitura', 'Suas indicações e requerimentos: o que foi enviado e o que a Prefeitura respondeu') +
      `<div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Matéria</th><th>Ementa</th><th>Situação</th><th class="acoes-col"></th></tr></thead><tbody>${minhas.map(p => { const s = st(p); return `<tr><td><b>${esc(p.numero)}</b><small>${esc(p.tipoNome || '')}</small></td><td>${esc(p.ementa)}${p.resposta ? `<small>Resposta: ${esc(p.resposta.texto.slice(0, 120))}</small>` : ''}</td><td><span class="lgvr-tag t-${s[1]}">${s[0]}</span>${!p.resposta && p.status === 'concluido' && window.lgavChip ? '<br>' + lgavChip(p) : ''}</td><td class="acoes-col">${p.resposta ? `<button class="lgt-mini primario" type="button" onclick="lgfxVerResposta('${p.id}')">Ver resposta</button>` : `<button class="lgt-mini" type="button" onclick="lgvrVer('${p.id}')">Andamento</button>`}</td></tr>`; }).join('') || '<tr><td colspan="4" class="lgt-vazio"><b>Nenhuma indicação ou requerimento seu ainda.</b><span>Use “Nova propositura” e escolha um modelo.</span></td></tr>'}</tbody></table></div>`;
  }

  /* =====================================================================
     5) OUVIDORIA E e-SIC (painel) — os pedidos chegam pelo site (ouvidoria.html)
     ===================================================================== */
  const OUV = 'lgo_v1';
  const ouv = () => { const d = ler(OUV, {}) || {}; d.itens = Array.isArray(d.itens) ? d.itens : []; return d; };
  const prazoOuv = it => { const k = it.canal === 'esic' ? 'esic' : 'ouvidoria'; const c = (window.lgavPrazos ? lgavPrazos()[k] : { dias: it.canal === 'esic' ? 20 : 30, uteis: false }); const dias = c.dias + (it.prorrogado ? (k === 'esic' ? 10 : 30) : 0); return window.lgavSemaforo ? { ...lgavSemaforo(it.data, k), ...(it.prorrogado ? (() => { const s = lgavSemaforo(it.data, k); const v = new Date(it.data); v.setDate(v.getDate() + dias); const resta = Math.ceil((v - new Date()) / 864e5); return { txt: resta < 0 ? `vencido há ${-resta} dia(s)` : `vence em ${resta} dias (prorrogado)`, cor: resta < 0 ? 'vermelho' : resta <= 3 ? 'amarelo' : 'verde' }; })() : {}) } : null; };
  let abaOuv = 'abertos';
  function tOuvidoria(el) {
    const d = ouv(); const ab = d.itens.filter(i => i.status !== 'respondido'), rs = d.itens.filter(i => i.status === 'respondido'); const l = abaOuv === 'abertos' ? ab : rs;
    const ano = new Date().getFullYear(); const doAno = d.itens.filter(i => new Date(i.data).getFullYear() === ano);
    el.innerHTML = cab('Ouvidoria e e-SIC', 'Manifestações e pedidos de informação recebidos pelo site', `<a class="lgt-btn" href="../ouvidoria.html" target="_blank" rel="noopener">${ic('externo')} Ver no site</a>`) +
      regra('Pedido de informação (LAI): resposta em até 20 dias, prorrogáveis por mais 10 com justificativa. Ouvidoria (Lei 13.460/2017): até 30 dias, prorrogáveis por mais 30. O cidadão consulta a resposta no site com o número do protocolo.') +
      `<div class="lgvr-kpis"><div><b>${doAno.filter(i => i.canal === 'esic').length}</b><span>pedidos de informação em ${ano}</span></div><div><b>${doAno.filter(i => i.canal !== 'esic').length}</b><span>manifestações da Ouvidoria</span></div><div><b>${ab.length}</b><span>em aberto</span></div><div><b>${ab.filter(i => (prazoOuv(i) || {}).cor === 'vermelho').length}</b><span>com prazo vencido</span></div></div>
      <div class="lgf-abas" role="tablist"><button type="button" role="tab" aria-selected="${abaOuv === 'abertos'}" onclick="lgfxAbaOuv('abertos')">Em aberto <b>${ab.length}</b></button><button type="button" role="tab" aria-selected="${abaOuv === 'respondidos'}" onclick="lgfxAbaOuv('respondidos')">Respondidos <b>${rs.length}</b></button><button type="button" role="tab" onclick="lgfxRelatorioLAI()">Relatório estatístico</button></div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Protocolo</th><th>Assunto</th><th>Quem</th><th>Prazo</th><th class="acoes-col"></th></tr></thead><tbody>${l.map(i => `<tr><td><b>${esc(i.protocolo)}</b><small>${i.canal === 'esic' ? 'Pedido de informação' : esc(i.categoria || 'Ouvidoria')} · ${dBR(i.data)}</small></td><td>${esc(i.assunto)}<small>${esc(String(i.texto).slice(0, 110))}</small></td><td><small>${i.anonimo ? 'Anônimo' : esc(i.nome || '')}${i.email ? '<br>' + esc(i.email) : ''}</small></td><td>${i.status === 'respondido' ? `<small>Respondido em ${dBR(i.resposta.data)}</small>` : (() => { const pz = prazoOuv(i); return pz ? `<span class="lgav-chip c-${pz.cor}">${esc(pz.txt)}</span>` : ''; })()}</td><td class="acoes-col">${equipe() && i.status !== 'respondido' ? `<button class="lgt-mini primario" type="button" onclick="lgfxOuvResponder('${i.protocolo}')">Responder</button>${!i.prorrogado ? `<button class="lgt-mini" type="button" onclick="lgfxOuvProrrogar('${i.protocolo}')">Prorrogar</button>` : ''}` : `<button class="lgt-mini" type="button" onclick="lgfxOuvResponder('${i.protocolo}',true)">Ver</button>`}</td></tr>`).join('') || `<tr><td colspan="5" class="lgt-vazio"><b>${abaOuv === 'abertos' ? 'Nenhuma manifestação em aberto.' : 'Nenhuma resposta ainda.'}</b><span>Os pedidos feitos em “Ouvidoria e e-SIC” no site aparecem aqui.</span></td></tr>`}</tbody></table></div>`;
  }
  window.lgfxAbaOuv = k => { abaOuv = k; desenhar(); };
  window.lgfxOuvResponder = function (prot, so) {
    const d = ouv(); const i = d.itens.find(x => x.protocolo === prot); if (!i) return;
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">${esc(i.protocolo)} · ${i.canal === 'esic' ? 'Pedido de informação' : 'Ouvidoria'}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgvr-det"><p class="lgvr-tipo-l">${esc(i.categoria || '')} · ${dBR(i.data)} · ${i.anonimo ? 'Anônimo' : esc(i.nome || '')}${i.email ? ' · ' + esc(i.email) : ''}${i.telefone ? ' · ' + esc(i.telefone) : ''}</p><h3>${esc(i.assunto)}</h3><p class="lgt-p">${esc(i.texto).replace(/\n/g, '<br>')}</p>${i.prorrogado ? `<p class="lgt-p"><small>Prazo prorrogado em ${dBR(i.prorrogado.data)}: ${esc(i.prorrogado.motivo)}</small></p>` : ''}</div>
      ${i.resposta ? `<h4 style="padding:0 22px">Resposta</h4><p class="lgt-p" style="padding:0 22px">${esc(i.resposta.texto)}<br><small>${dBR(i.resposta.data)} · ${esc(i.resposta.por || '')}</small></p>` : so ? '' : `<div class="lgt-campos"><label class="cheio"><span>Resposta ao cidadão *</span><textarea name="resp" rows="5"></textarea></label><label class="cheio"><span>Situação</span><select name="tipo"><option>Atendido</option><option>Atendido parcialmente</option><option>Negado (informação sigilosa ou pessoal)</option><option>Informação inexistente</option><option>Não é competência da Câmara (encaminhado)</option></select></label></div>`}
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Fechar</button>${!i.resposta && !so ? '<button type="submit" class="lgt-btn primario">Enviar resposta</button>' : ''}</div></form>`);
    const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); if (!f.resp || !f.resp.value.trim()) { f.querySelector('.lgt-erro').textContent = 'Escreva a resposta.'; return; }
      const dd = ouv(); const x = dd.itens.find(y => y.protocolo === prot); x.status = 'respondido'; x.resposta = { texto: f.resp.value.trim(), tipo: f.tipo.value, data: new Date().toISOString(), por: (usuario() || {}).nome || '' };
      gravar(OUV, dd); UI().fecharModal(); UI().aviso('Resposta registrada. O cidadão consulta no site pelo protocolo.'); window.lgavAtualizar && lgavAtualizar(); desenhar(); };
  };
  window.lgfxOuvProrrogar = function (prot) {
    UI().abrirModal(`<form class="lgt-form" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Prorrogar o prazo · ${esc(prot)}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><div class="lgt-campos"><label class="cheio"><span>Justificativa (o cidadão vê) *</span><textarea name="m" rows="3"></textarea></label></div><p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="submit" class="lgt-btn primario">Prorrogar</button></div></form>`);
    const f = $('#lgt-modal form'); f.onsubmit = e => { e.preventDefault(); if (!f.m.value.trim()) { f.querySelector('.lgt-erro').textContent = 'A prorrogação precisa de justificativa.'; return; } const d = ouv(); const x = d.itens.find(y => y.protocolo === prot); x.prorrogado = { data: new Date().toISOString(), motivo: f.m.value.trim() }; x.status = 'prorrogado'; gravar(OUV, d); UI().fecharModal(); desenhar(); };
  };
  window.lgfxRelatorioLAI = function () {
    const d = ouv(); const ano = new Date().getFullYear(); const l = d.itens.filter(i => i.canal === 'esic' && new Date(i.data).getFullYear() === ano);
    const resp = l.filter(i => i.resposta); const media = resp.length ? Math.round(resp.reduce((s, i) => s + (new Date(i.resposta.data) - new Date(i.data)) / 864e5, 0) / resp.length) : 0;
    const por = k => resp.filter(i => (i.resposta.tipo || '').startsWith(k)).length;
    const txt = `RELATÓRIO ESTATÍSTICO DO SERVIÇO DE INFORMAÇÃO AO CIDADÃO — ${ano}\n(Lei nº 12.527/2011, art. 30, III)\n\nPedidos recebidos: ${l.length}\nRespondidos: ${resp.length}\nEm aberto: ${l.length - resp.length}\nProrrogados: ${l.filter(i => i.prorrogado).length}\nTempo médio de resposta: ${media} dia(s)\n\nResultado das respostas:\n· Atendidos: ${por('Atendido')} (inclui parcialmente: ${por('Atendido parcialmente')})\n· Negados: ${por('Negado')}\n· Informação inexistente: ${por('Informação inexistente')}\n· Fora da competência da Câmara: ${por('Não é competência')}\n\nManifestações da Ouvidoria no ano: ${d.itens.filter(i => i.canal !== 'esic' && new Date(i.data).getFullYear() === ano).length}`;
    UI().abrirModal(`<div class="lgt-form"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Relatório estatístico ${ano}</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div><pre class="lgfx-pre">${esc(txt)}</pre>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Fechar</button>${window.lgNivelArea && lgNivelArea('transparencia') === 'edicao' || equipe() ? '<button type="button" class="lgt-btn primario" id="lgfx-pub-lai">Publicar no Portal da Transparência</button>' : ''}</div></div>`);
    const b = $('#lgfx-pub-lai'); if (b) b.onclick = () => { publicarTransp({ id: 'lai-rel-' + ano, cat: 'sic', sub: 'Relatório estatístico do SIC', titulo: `Relatório estatístico do SIC — ${ano}`, descricao: txt.split('\n').slice(3, 8).join(' · '), texto: txt, data: hojeISO() }); UI().fecharModal(); UI().aviso('Relatório publicado no Portal da Transparência.'); };
  };
  function publicarTransp(it) {
    if (typeof transpLer !== 'function') return; const agora = new Date().toISOString();
    const l = transpLer().filter(x => x.id !== it.id); l.push({ origem: 'sistema', publicado: true, criadoEm: agora, atualizadoEm: agora, competencia: (it.data || agora).slice(0, 7), ...it }); transpSalvar(l);
  }

  /* =====================================================================
     6) RELATÓRIO MENSAL DA PRODUÇÃO LEGISLATIVA
     ===================================================================== */
  let mesRel = '';
  function tRelatorio(el) {
    if (!mesRel) { const d = new Date(); mesRel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    const r = relatorio(mesRel); const nomeMes = new Date(mesRel + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    el.innerHTML = cab('Relatório mensal', 'Produção legislativa do mês: proposituras, votações, normas, sessões e presença', `<label class="lgpl-sel"><span class="lgt-rot">Mês</span><input type="month" value="${mesRel}" onchange="lgfxMes(this.value)" style="height:38px;border-radius:9px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:0 10px"></label><button class="lgt-btn" type="button" onclick="lgfxRelImprimir()">${ic('externo')} Imprimir / PDF</button>${equipe() ? '<button class="lgt-btn primario" type="button" onclick="lgfxRelPublicar()">Publicar na Transparência</button>' : ''}`) +
      `<div class="lgvr-kpis"><div><b>${r.prot.length}</b><span>proposituras protocoladas</span></div><div><b>${r.vot.length}</b><span>matérias votadas</span></div><div><b>${r.normas.length}</b><span>normas publicadas</span></div><div><b>${r.sessoes.length}</b><span>sessões realizadas</span></div></div>
      <div class="lgvr-grade"><div class="lgt-card"><h3>Proposituras por tipo</h3>${tabela(['Tipo', 'Quantidade'], Object.entries(r.porTipo).map(([k, n]) => [k, n]))}</div>
        <div class="lgt-card"><h3>Proposituras por autor</h3>${tabela(['Autor', 'Quantidade'], Object.entries(r.porAutor).sort((a, b) => b[1] - a[1]))}</div></div>
      <div class="lgt-card" style="margin-top:14px"><h3>Votações (${r.vot.length})</h3>${tabela(['Matéria', 'Resultado', 'Placar'], r.vot.map(p => [`${p.numero} — ${p.ementa.slice(0, 70)}`, p.resultado === 'rejeitado' ? 'Rejeitado' : 'Aprovado', `${p.votacao.favor} × ${p.votacao.contra}`]))}</div>
      <div class="lgvr-grade" style="margin-top:14px"><div class="lgt-card"><h3>Normas publicadas</h3>${tabela(['Norma', 'Ementa'], r.normas.map(x => [x.titulo, x.ementa.slice(0, 80)]))}</div>
        <div class="lgt-card"><h3>Presença nas sessões</h3>${tabela(['Vereador', 'Presenças'], r.presenca.map(x => [x.nome, `${x.n} de ${r.sessoes.length}`]))}</div></div>
      <p class="lgvr-regra">${ic('ajuda')}<span>Relatório de ${esc(nomeMes)}. Conta as proposituras pela data do protocolo, as votações pela data da sessão e as normas pela data de publicação. Serve de base para o relatório de atividades exigido no PNTP (critério 11.2).</span></p>`;
  }
  const tabela = (cabs, linhas) => linhas.length ? `<div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr>${cabs.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${linhas.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="lgt-p">Nada no período.</p>';
  function relatorio(mes) {
    const iso = br => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(br || ''); return m ? `${m[3]}-${m[2]}` : ''; };
    const prot = listaProt().filter(p => p.status !== 'enviado' && iso(p.data) === mes);
    const porTipo = {}, porAutor = {}; prot.forEach(p => { const t = p.tipoNome || 'Projeto de Lei'; porTipo[t] = (porTipo[t] || 0) + 1; const a = (p.autor || '—').replace(/ e outros$/, ''); porAutor[a] = (porAutor[a] || 0) + 1; });
    const vot = listaProt().filter(p => p.votacao && String(p.votacao.data || '').slice(0, 7) === mes);
    const normas = lgfxLeis().filter(x => !x.exemplo && String(x.data || '').slice(0, 7) === mes);
    const sessoes = window.lgplDados ? lgplDados().sessoes.filter(s => s.status === 'encerrada' && s.quando.slice(0, 7) === mes) : [];
    const presenca = A() ? A().comp().vereadores.map(v => ({ nome: v.nome, n: sessoes.filter(s => (s.presenca || {})[v.id]).length })) : [];
    return { prot, porTipo, porAutor, vot, normas, sessoes, presenca };
  }
  window.lgfxMes = m => { mesRel = m; desenhar(); };
  function textoRel() {
    const r = relatorio(mesRel); const nm = new Date(mesRel + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return `RELATÓRIO DE ATIVIDADES LEGISLATIVAS — ${nm.toUpperCase()}\nCâmara Municipal de Neves Paulista\n\nProposituras protocoladas: ${r.prot.length}\n${Object.entries(r.porTipo).map(([k, n]) => `· ${k}: ${n}`).join('\n')}\n\nPor autor:\n${Object.entries(r.porAutor).map(([k, n]) => `· ${k}: ${n}`).join('\n') || '· —'}\n\nMatérias votadas: ${r.vot.length}\n${r.vot.map(p => `· ${p.numero} — ${p.resultado === 'rejeitado' ? 'Rejeitado' : 'Aprovado'} (${p.votacao.favor} × ${p.votacao.contra})`).join('\n')}\n\nNormas publicadas: ${r.normas.length}\n${r.normas.map(x => `· ${x.titulo} — ${x.ementa}`).join('\n')}\n\nSessões realizadas: ${r.sessoes.length}\n${r.sessoes.map(s => `· ${s.titulo} (${dBR(s.quando)})`).join('\n')}\n\nPresença dos vereadores:\n${r.presenca.map(x => `· ${x.nome}: ${x.n} de ${r.sessoes.length}`).join('\n')}`;
  }
  window.lgfxRelImprimir = () => { const w = window.open('', '_blank'); if (!w) return UI().aviso('Permita janelas pop-up.', 'erro'); w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório mensal</title><style>body{font:15px/1.6 Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;white-space:pre-wrap}@media print{button{display:none}}</style></head><body><button onclick="print()" style="float:right">Imprimir</button>${esc(textoRel())}\n\n— Gerado pelo LegislaGov · legislagov.com.br</body></html>`); w.document.close(); };
  window.lgfxRelPublicar = () => { const nm = new Date(mesRel + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); publicarTransp({ id: 'rel-ativ-' + mesRel, cat: 'contas', sub: 'Relatório de gestão / atividades', titulo: `Relatório de atividades legislativas — ${nm}`, descricao: textoRel().split('\n').filter(x => /^(Proposituras|Matérias|Normas|Sessões)/.test(x)).join(' · '), texto: textoRel(), data: hojeISO() }); UI().aviso('Relatório publicado no Portal da Transparência.'); };

  /* =====================================================================
     7) TRANSPARÊNCIA: CALENDÁRIO DE PUBLICAÇÕES OBRIGATÓRIAS
     ===================================================================== */
  const CAL = 'lgtc_v1';
  const CAL_PADRAO = [
    { id: 'folha', nome: 'Folha de pagamento e remuneração nominal', cat: 'pessoal', sub: 'Folha de pagamento / remuneração', per: 'mensal', dia: 10, base: 'LAI, art. 8º; PNTP 6.1 e 6.2' },
    { id: 'duod', nome: 'Duodécimos recebidos (receita)', cat: 'receitas', sub: 'Duodécimos (repasses)', per: 'mensal', dia: 10, base: 'LC 131/2009; PNTP 3.1' },
    { id: 'desp', nome: 'Despesas: empenhos, liquidações e pagamentos', cat: 'despesas', sub: 'Empenhos', per: 'semanal', dia: 0, base: 'LC 131/2009 e Decreto 10.540/2020: até o 1º dia útil seguinte ao registro' },
    { id: 'ordem', nome: 'Ordem cronológica de pagamentos', cat: 'despesas', sub: 'Ordem cronológica de pagamentos', per: 'mensal', dia: 10, base: 'Lei 14.133/2021, art. 141; PNTP 9.4' },
    { id: 'diarias', nome: 'Diárias concedidas', cat: 'diarias', sub: 'Diárias concedidas', per: 'mensal', dia: 10, base: 'PNTP 7.1' },
    { id: 'estag', nome: 'Estagiários e terceirizados', cat: 'pessoal', sub: 'Estagiários', per: 'mensal', dia: 10, base: 'PNTP 6.4 e 6.5' },
    { id: 'contratos', nome: 'Contratos e aditivos (a cada assinatura)', cat: 'licitacoes', sub: 'Contratos', per: 'evento', base: 'Lei 14.133/2021, art. 94: no PNCP em até 20 dias úteis (licitação) ou 10 dias úteis (contratação direta)' },
    { id: 'rgf', nome: 'Relatório de Gestão Fiscal (RGF) do Legislativo', cat: 'contas', sub: 'Relatório de Gestão Fiscal (RGF)', per: 'semestral', datas: ['01-30', '07-30'], base: 'LRF, arts. 54, 55 e 63 (municípios com menos de 50 mil habitantes podem optar pela divulgação semestral; quadrimestral: 30/05, 30/09 e 30/01)' },
    { id: 'audesp', nome: 'Prestação de contas mensal ao TCE-SP (Audesp)', cat: 'contas', sub: 'Balanços e demonstrativos', per: 'mensal', dia: 30, base: 'Confirme as datas no calendário Audesp do TCE-SP' },
    { id: 'balanco', nome: 'Balanço e prestação de contas anual', cat: 'contas', sub: 'Prestação de contas anual', per: 'anual', datas: ['03-31'], base: 'PNTP 11.1 — confirme o prazo no calendário Audesp do TCE-SP' },
    { id: 'lai', nome: 'Relatório estatístico do SIC (LAI)', cat: 'sic', sub: 'Relatório estatístico do SIC', per: 'anual', datas: ['01-31'], base: 'LAI, art. 30, III; PNTP 12.7' },
    { id: 'ouvrel', nome: 'Relatório anual da Ouvidoria', cat: 'ouvidoria', sub: 'Relatório anual da Ouvidoria', per: 'anual', datas: ['01-31'], base: 'Lei 13.460/2017, art. 15' },
    { id: 'pca', nome: 'Plano de Contratações Anual', cat: 'licitacoes', sub: 'Plano de Contratações Anual', per: 'anual', datas: ['12-31'], base: 'Lei 14.133/2021, art. 12, VII; PNTP 8.6' },
    { id: 'ativ', nome: 'Relatório de atividades / gestão', cat: 'contas', sub: 'Relatório de gestão / atividades', per: 'anual', datas: ['01-31'], base: 'PNTP 11.2 (use o Relatório mensal do Administrativo)' },
    { id: 'sessoes', nome: 'Pautas, atas, presença e votações nominais', cat: 'legislativo', sub: 'Pautas das sessões', per: 'auto', base: 'PNTP 20.4, 20.6 e 20.7 — publicados sozinhos pela Sessão plenária' },
  ];
  function proximaData(it, aPartir) {
    const h = aPartir ? new Date(aPartir) : new Date(); h.setHours(0, 0, 0, 0);
    if (it.per === 'mensal') { const d = new Date(h.getFullYear(), h.getMonth(), Math.min(it.dia || 10, 28)); if (d < h) d.setMonth(d.getMonth() + 1); return d; }
    if (it.per === 'semanal') { const d = new Date(h); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return d; }
    if (it.per === 'semestral' || it.per === 'anual') { const ds = (it.datas || []).flatMap(md => [0, 1].map(k => new Date(`${h.getFullYear() + k}-${md}T00:00`))).filter(d => d >= h).sort((a, b) => a - b); return ds[0] || null; }
    return null;
  }
  function calendario() {
    const st = ler(CAL, {}) || {}; st.feitos = st.feitos || {}; st.ajustes = st.ajustes || {};
    return CAL_PADRAO.map(x => { const it = { ...x, ...(st.ajustes[x.id] || {}) }; const feito = st.feitos[x.id]; const base = feito && feito.ate ? new Date(new Date(feito.ate).getTime() + 864e5) : null;
      const prox = it.per === 'auto' || it.per === 'evento' ? null : proximaData(it, base); const dias = prox ? Math.ceil((prox - new Date()) / 864e5) : null;
      const cor = prox == null ? 'info' : dias < 0 ? 'vermelho' : dias <= 7 ? 'amarelo' : 'verde';
      return { ...it, feito, prox, dias, cor }; });
  }
  function tCalendario(el) {
    const l = calendario(); const pode = window.lgNivelArea && lgNivelArea('transparencia') === 'edicao';
    const pub = typeof transpLer === 'function' ? transpLer() : [];
    el.innerHTML = cab('Calendário de publicações', 'O que precisa ser publicado no Portal da Transparência e quando') +
      regra('Prazos sugeridos a partir da lei e dos critérios do PNTP 2026. Ajuste as datas internas à rotina da Câmara. Ao publicar, marque como feito: o próximo prazo é calculado sozinho. Itens da sessão plenária são publicados automaticamente.') +
      `<div class="lgt-tabela-wrap"><table class="lgt-tabela"><thead><tr><th>Obrigação</th><th>Periodicidade</th><th>Próximo prazo</th><th>Última publicação</th><th class="acoes-col"></th></tr></thead><tbody>${l.map(it => { const ult = pub.filter(i => i.cat === it.cat && i.sub === it.sub && i.publicado !== false).sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
        return `<tr><td><b>${esc(it.nome)}</b><small>${esc(it.base)}</small></td><td><small>${{ mensal: `Mensal (até o dia ${it.dia})`, semanal: 'Contínua (conferir toda semana)', semestral: 'Semestral', anual: 'Anual', evento: 'A cada contrato', auto: 'Automática' }[it.per]}</small></td>
        <td>${it.prox ? `<span class="lgav-chip c-${it.cor}">${it.dias < 0 ? `atrasado (${dBR(it.prox.toISOString())})` : dBR(it.prox.toISOString())}</span>` : '<span class="lgav-chip c-info">—</span>'}</td>
        <td><small>${ult ? `${esc(ult.titulo).slice(0, 60)}<br>${dBR(ult.data)}` : 'Nenhuma ainda'}${it.feito ? `<br>Feito em ${dBR(it.feito.data)} por ${esc(it.feito.por || '')}` : ''}</small></td>
        <td class="acoes-col">${pode && it.prox ? `<button class="lgt-mini primario" type="button" onclick="lgfxCalFeito('${it.id}')">Marcar como publicado</button>` : ''}${pode ? `<button class="lgt-mini" type="button" onclick="lgtAbrir('transp')">Publicar</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  window.lgfxCalFeito = function (id) {
    const it = calendario().find(x => x.id === id); if (!it || !it.prox) return; const st = ler(CAL, {}) || {}; st.feitos = st.feitos || {};
    st.feitos[id] = { data: new Date().toISOString(), ate: it.prox.toISOString(), por: (usuario() || {}).nome || '' }; gravar(CAL, st); UI().aviso('Marcado como publicado. Próximo prazo calculado.'); window.lgavAtualizar && lgavAtualizar(); desenhar();
  };

  /* =====================================================================
     8) NOTA DE TRANSPARÊNCIA — critérios do PNTP 2026 aplicáveis à Câmara
     Fonte: Cartilha PNTP Ciclo 2026 (TCE-SP/Atricon, versão de 27/03/2026). Estimativa interna:
     a avaliação oficial é feita pelo Tribunal de Contas.
     ===================================================================== */
  const PN = 'lgpn_v1';
  const temPub = (cat, sub) => typeof transpLer === 'function' && transpLer().some(i => i.publicado !== false && i.cat === cat && (!sub || i.sub === sub));
  const temSessao = oque => window.lgplDados && lgplDados().sessoes.some(s => oque === 'pauta' ? !!s.convocacao : oque === 'ata' ? s.ata && s.ata.status !== 'rascunho' : s.itens.some(i => i.nominal));
  const CRIT = [
    ['1', 'Informações prioritárias', [['1.1', 'Sítio oficial próprio na internet', 'E', () => true], ['1.2', 'Portal da transparência próprio ou compartilhado', 'E', () => true], ['1.3', 'Acesso ao portal visível na capa do site', 'O', () => true], ['1.4', 'Ferramenta de pesquisa no site e no portal', 'O', () => true]]],
    ['2', 'Informações institucionais', [['2.1', 'Estrutura organizacional e norma que a institui', '', () => temPub('institucional', 'Estrutura organizacional')], ['2.2', 'Competências e atribuições', '', () => temPub('institucional', 'Competências e atribuições') || null], ['2.3', 'Nomes dos atuais responsáveis (Mesa)', '', () => true], ['2.4', 'Endereços, telefones e e-mails', '', () => true], ['2.5', 'Horário de atendimento', '', null], ['2.6', 'Atos normativos próprios', '', () => lgfxLeis().some(x => !x.exemplo && /Resolução|Decreto/.test(x.tipo)) || null], ['2.7', 'Perguntas e respostas frequentes', '', () => temPub('sic', 'Perguntas frequentes') || null], ['2.8', 'Links das redes sociais na capa', '', null], ['2.9', 'Botão do Radar da Transparência Pública', '', null]]],
    ['3', 'Receita', [['3.1', 'Receitas previstas e realizadas (duodécimos)', '', () => temPub('receitas')], ['3.2', 'Classificação orçamentária da receita', '', null]]],
    ['4', 'Despesa', [['4.1', 'Despesas empenhadas, liquidadas e pagas', '', () => temPub('despesas')], ['4.2', 'Despesas por classificação orçamentária', '', null], ['4.3', 'Consulta de empenhos com favorecido e valor', '', () => temPub('despesas', 'Empenhos')], ['4.4', 'Aquisições de bens (preço, quantidade, fornecedor)', '', null], ['4.5', 'Despesas com patrocínio', '', null], ['4.6', 'Execução de contratos de publicidade', '', null]]],
    ['5', 'Convênios e transferências', [['5.1', 'Transferências recebidas', '', () => temPub('convenios') || null], ['5.2', 'Transferências realizadas', '', null], ['5.3', 'Acordos sem transferência de recursos', '', () => temPub('convenios', 'Acordos de cooperação') || null]]],
    ['6', 'Recursos humanos', [['6.1', 'Relação nominal de servidores e membros', '', () => temPub('pessoal', 'Relação de servidores')], ['6.2', 'Remuneração nominal', '', () => temPub('pessoal', 'Folha de pagamento / remuneração')], ['6.3', 'Tabela de cargos e salários', '', () => temPub('pessoal', 'Tabela de cargos e salários')], ['6.4', 'Lista de estagiários', '', () => temPub('pessoal', 'Estagiários') || null], ['6.5', 'Terceirizados e empresas', '', () => temPub('pessoal', 'Terceirizados') || null], ['6.6', 'Editais de concursos e seleções', '', () => temPub('pessoal', 'Concursos e seleções') || null], ['6.7', 'Demais atos dos concursos', '', null]]],
    ['7', 'Diárias', [['7.1', 'Beneficiários, valores, destino e motivo', '', () => temPub('diarias', 'Diárias concedidas')], ['7.2', 'Tabela de valores de diárias', '', () => temPub('diarias', 'Tabela de valores de diárias')]]],
    ['8', 'Licitações', [['8.1', 'Relação das licitações', '', () => temPub('licitacoes')], ['8.2', 'Íntegra dos editais', '', () => temPub('licitacoes', 'Editais e avisos')], ['8.3', 'Documentos das fases interna e externa', '', null], ['8.4', 'Dispensas e inexigibilidades', '', () => temPub('licitacoes', 'Dispensas') || temPub('licitacoes', 'Inexigibilidades')], ['8.5', 'Atas de adesão (SRP)', '', () => temPub('licitacoes', 'Atas de registro de preços') || null], ['8.6', 'Plano de contratações anual', '', () => temPub('licitacoes', 'Plano de Contratações Anual') || null], ['8.7', 'Licitantes e contratados sancionados', '', null], ['8.8', 'Regulamento interno de licitações e contratos', '', null]]],
    ['9', 'Contratos', [['9.1', 'Relação de contratos e aditivos', '', () => temPub('licitacoes', 'Contratos')], ['9.2', 'Íntegra dos contratos e aditivos', '', () => temPub('licitacoes', 'Contratos')], ['9.3', 'Fiscais de contratos', '', () => temPub('licitacoes', 'Fiscais designados')], ['9.4', 'Ordem cronológica de pagamentos', '', () => temPub('despesas', 'Ordem cronológica de pagamentos')]]],
    ['10', 'Obras (se houver)', [['10.1', 'Informações sobre as obras', '', null], ['10.4', 'Obras paralisadas', '', null]]],
    ['11', 'Planejamento e prestação de contas', [['11.1', 'Prestação de contas do ano anterior', '', () => temPub('contas', 'Prestação de contas anual')], ['11.2', 'Relatório de gestão ou atividades', '', () => temPub('contas', 'Relatório de gestão / atividades')], ['11.3', 'Decisão do Tribunal de Contas sobre as contas', '', () => temPub('contas', 'Julgamento das contas pelo TCE-SP')], ['11.4', 'Julgamento das contas do Prefeito pela Câmara', '', null], ['11.5', 'Relatório de Gestão Fiscal (RGF)', '', () => temPub('contas', 'Relatório de Gestão Fiscal (RGF)')]]],
    ['12', 'Serviço de Informação ao Cidadão', [['12.1', 'SIC no site, com unidade responsável', '', () => true], ['12.2', 'Endereço, telefone, e-mail e horário do SIC', '', () => true], ['12.3', 'Pedido eletrônico (e-SIC)', '', () => true], ['12.4', 'Pedido simples, sem exigências que dificultem', '', () => true], ['12.5', 'Norma local que regulamenta a LAI', '', null], ['12.6', 'Prazos, recursos e procedimentos', '', () => true], ['12.7', 'Relatório estatístico anual', '', () => temPub('sic', 'Relatório estatístico do SIC')], ['12.8', 'Documentos classificados por grau de sigilo', '', () => temPub('sic', 'Informações classificadas e desclassificadas') || null], ['12.9', 'Informações desclassificadas (12 meses)', '', () => temPub('sic', 'Informações classificadas e desclassificadas') || null]]],
    ['13', 'Acessibilidade', [['13.1', 'Símbolo de acessibilidade em destaque', '', () => true], ['13.2', 'Caminho das páginas (trilha)', '', () => true], ['13.3', 'Alto contraste', '', () => true], ['13.4', 'Redimensionamento de texto', '', () => true], ['13.5', 'Mapa do site', '', null]]],
    ['14', 'Ouvidoria', [['14.1', 'Atendimento presencial (endereço, telefone, horário)', '', () => true], ['14.2', 'Canal eletrônico da Ouvidoria', '', () => true], ['14.3', 'Carta de serviços ao usuário', '', () => temPub('ouvidoria', 'Carta de serviços ao usuário') || temPub('institucional', 'Carta de serviços')]]],
    ['15', 'LGPD e governo digital', [['15.1', 'Encarregado de dados e canal de contato', '', () => temPub('ouvidoria', 'Encarregado de dados (LGPD)')], ['15.2', 'Política de privacidade', '', () => temPub('ouvidoria', 'Política de privacidade') || null], ['15.3', 'Serviços por meio digital', '', () => true], ['15.4', 'Dados abertos (formato aberto)', '', null], ['15.6', 'Pesquisa de satisfação com resultado divulgado', '', null]]],
    ['20', 'Atividades finalísticas do Legislativo', [['20.1', 'Composição da Casa e biografia dos vereadores', '', () => true], ['20.2', 'Leis e atos produzidos', '', () => lgfxLeis().some(x => !x.exemplo)], ['20.3', 'Projetos com tramitação', '', () => true], ['20.4', 'Pauta das sessões do Plenário', '', () => temSessao('pauta') || temPub('legislativo', 'Pautas das sessões')], ['20.5', 'Pauta das comissões', '', () => temPub('legislativo', 'Pautas das comissões')], ['20.6', 'Atas das sessões com lista de presença', '', () => temSessao('ata') || temPub('legislativo', 'Atas e lista de presença')], ['20.7', 'Votações nominais', '', () => temSessao('nominal') || temPub('legislativo', 'Votações nominais')], ['20.8', 'Julgamento das contas do Prefeito', '', null], ['20.9', 'Transmissão das sessões e audiências', '', () => true], ['20.10', 'Regulamentação e valores da verba indenizatória', '', () => temPub('vereadores', 'Verba de gabinete / indenizatória') || null], ['20.11', 'Atividade legislativa de cada vereador', '', () => true]]],
  ];
  function avaliar() {
    const man = ler(PN, {}) || {}; const out = [];
    CRIT.forEach(([d, nome, l]) => l.forEach(([id, txt, cls, f]) => { let auto = null; try { auto = f ? f() : null; } catch (e) { } const m = man[id]; const v = m || (auto === true ? 'sim' : auto === false ? 'nao' : ''); out.push({ d, dim: nome, id, txt, cls, auto, m, v }); }));
    const val = out.filter(x => x.v && x.v !== 'na'); const sim = val.filter(x => x.v === 'sim').length;
    const pct = val.length ? Math.round(sim / val.length * 100) : 0; const essOk = out.filter(x => x.cls === 'E').every(x => x.v === 'sim');
    const nivel = pct >= 95 && essOk ? 'Diamante' : pct >= 85 && essOk ? 'Ouro' : pct >= 75 && essOk ? 'Prata' : pct >= 75 ? 'Elevado' : pct >= 50 ? 'Intermediário' : pct >= 30 ? 'Básico' : pct >= 1 ? 'Inicial' : 'Inexistente';
    return { out, pct, nivel, sim, avaliados: val.length, semResp: out.filter(x => !x.v).length };
  }
  function tPntp(el) {
    const r = avaliar(); const pode = window.lgNivelArea && lgNivelArea('transparencia') === 'edicao';
    let dimAnt = '';
    el.innerHTML = cab('Nota de transparência (PNTP)', 'Critérios do Programa Nacional de Transparência Pública 2026 que valem para a Câmara') +
      regra('Estimativa interna para orientar o trabalho, não é a nota oficial: a avaliação é feita pelo TCE-SP com a matriz completa e pesos próprios. Itens marcados “auto” são conferidos pelo sistema (publicações no portal, páginas do site, sessão plenária); os demais você confirma. Fonte: Cartilha PNTP Ciclo 2026 (TCE-SP/Atricon).') +
      `<div class="lgfx-nota"><div class="lgfx-anel" style="--p:${r.pct}"><b>${r.pct}%</b><small>estimado</small></div><div><span class="lgvr-tag t-${r.pct >= 75 ? 'ok' : r.pct >= 50 ? 'an' : 'er'}">Nível estimado: ${r.nivel}</span><p class="lgt-p">${r.sim} de ${r.avaliados} critérios avaliados atendidos · ${r.semResp} sem resposta. Os critérios <b>essenciais</b> (1.1 e 1.2) são obrigatórios para qualquer selo.</p></div></div>
      <div class="lgt-tabela-wrap"><table class="lgt-tabela lgfx-pn"><thead><tr><th>Critério</th><th>Situação</th><th class="acoes-col">Sua avaliação</th></tr></thead><tbody>${r.out.map(x => { const h = x.dim !== dimAnt ? `<tr class="lgfx-dim"><td colspan="3">${esc(x.d)}. ${esc(x.dim)}</td></tr>` : ''; dimAnt = x.dim;
        return h + `<tr><td><b>${esc(x.id)}</b> ${esc(x.txt)}${x.cls === 'E' ? ' <span class="lgvr-tag t-er">essencial</span>' : x.cls === 'O' ? ' <span class="lgvr-tag t-an">obrigatório</span>' : ''}</td><td>${x.v === 'sim' ? '<span class="lgav-chip c-verde">atende</span>' : x.v === 'nao' ? '<span class="lgav-chip c-vermelho">não atende</span>' : x.v === 'na' ? '<span class="lgav-chip c-info">não se aplica</span>' : '<span class="lgav-chip c-amarelo">confirmar</span>'}${x.auto !== null && !x.m ? ' <small>auto</small>' : ''}</td>
        <td class="acoes-col">${pode ? `<select aria-label="Avaliação do critério ${esc(x.id)}" onchange="lgfxPn('${x.id}',this.value)"><option value="">${x.auto === true ? 'Auto: atende' : x.auto === false ? 'Auto: não atende' : '—'}</option><option value="sim" ${x.m === 'sim' ? 'selected' : ''}>Atende</option><option value="nao" ${x.m === 'nao' ? 'selected' : ''}>Não atende</option><option value="na" ${x.m === 'na' ? 'selected' : ''}>Não se aplica</option></select>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  window.lgfxPn = (id, v) => { const m = ler(PN, {}) || {}; if (v) m[id] = v; else delete m[id]; gravar(PN, m); desenhar(); };

  /* =====================================================================
     9) TV CÂMARA (YouTube) — Publicação de matérias › TV Câmara
     O servidor lê o canal sozinho (/api/youtube). Aqui dá para ligar o vídeo à sessão certa,
     editar o resumo, esconder um vídeo e escolher se os vídeos entram também em Notícias.
     ===================================================================== */
  const AJ = 'lgs_site_videos_v1';
  let ytEstado = null;
  async function lerYT() { try { const r = await fetch('/api/youtube', { cache: 'no-store' }); if (r.ok) { ytEstado = await r.json(); try { localStorage.setItem('lgtv_cache_v1', JSON.stringify(ytEstado)); } catch (e) { } } } catch (e) { } return ytEstado || ler('lgtv_cache_v1', null); }
  async function tVideos(el) {
    const pode = window.lgNivelArea && lgNivelArea('site') === 'edicao';
    el.innerHTML = cab('TV Câmara (YouTube)', 'Os vídeos do canal da Câmara entram no site sozinhos, com resumo da sessão') + '<p class="lgt-p">Consultando o canal…</p>';
    const d = await lerYT(); const aj = ler(AJ, {}) || {}; const c = ler('lgt_site_cfg_v1', {}) || {};
    const sessoes = window.lgplDados ? lgplDados().sessoes.slice().sort((a, b) => new Date(b.quando) - new Date(a.quando)) : [];
    const l = (d && d.videos) || [];
    el.innerHTML = cab('TV Câmara (YouTube)', 'Os vídeos do canal da Câmara entram no site sozinhos, com resumo da sessão', `<a class="lgt-btn" href="${esc((d && d.canal && d.canal.url) || 'https://www.youtube.com/@camaramunicipalnevespaulista')}" target="_blank" rel="noopener">${ic('externo')} Abrir o canal</a>`) +
      regra('A cada 20 minutos o servidor confere o canal. Vídeo novo aparece na capa (TV Câmara), na página Sessões, em Notícias e numa página própria com o resumo. O resumo junta os dados da sessão do mesmo dia (presença, pauta, resultados e votos) e a descrição do vídeo; marcações de tempo na descrição (ex.: “00:15:30 Ordem do Dia”) viram capítulos.') +
      `<div class="lgt-card lgfx-yt-st"><div><b>${d && d.atualizado ? 'Conectado ao canal' : 'Aguardando a primeira leitura do canal'}</b><small>${d && d.atualizado ? `Última conferência: ${new Date(d.atualizado).toLocaleString('pt-BR')} · ${l.length} vídeo(s)` : 'O servidor confere logo após iniciar e depois a cada 20 minutos.'}${d && d.erro ? ` · Último erro: ${esc(d.erro)}` : ''}</small></div>
        <label class="lgfx-sw"><input type="checkbox" ${c.youtubeNoticias === false ? '' : 'checked'} ${pode ? '' : 'disabled'} onchange="lgfxYtNoticias(this.checked)"> Publicar os vídeos também em Notícias</label></div>
      ${l.length ? `<div class="lgfx-yt">${l.slice(0, 30).map(v => { const a = aj[v.id] || {}; const auto = window.lgtvResumo ? lgtvResumo({ ...v }) : ''; const sAuto = window.lgtvDataDoVideo ? lgtvDataDoVideo(v) : '';
        return `<article class="lgt-card ${a.oculto ? 'oculto' : ''}"><img src="${esc(v.thumb)}" alt="" loading="lazy"><div><b>${esc(v.titulo)}</b><small>${new Date(v.publicado).toLocaleString('pt-BR')}${v.views != null ? ` · ${Number(v.views).toLocaleString('pt-BR')} visualizações` : ''}</small>
          <label><span class="lgt-rot">Sessão</span><select ${pode ? '' : 'disabled'} onchange="lgfxYt('${esc(v.id)}','sessao',this.value)"><option value="">Automático (pela data ${sAuto ? sAuto.split('-').reverse().join('/') : ''})</option>${sessoes.map(x => `<option value="${x.id}" ${a.sessao === x.id ? 'selected' : ''}>${esc(x.titulo)} · ${new Date(x.quando).toLocaleDateString('pt-BR')}</option>`).join('')}</select></label>
          <label><span class="lgt-rot">Resumo no site ${a.resumo ? '(editado)' : '(automático)'}</span><textarea rows="4" ${pode ? '' : 'disabled'} onchange="lgfxYt('${esc(v.id)}','resumo',this.value)">${esc(a.resumo || auto)}</textarea></label>
          ${blocoFala(v, a, d, pode)}
          <div class="lgt-acoes">${pode ? `${a.resumo ? `<button class="lgt-mini" type="button" onclick="lgfxYt('${esc(v.id)}','resumo','')">Voltar ao automático</button>` : ''}<button class="lgt-mini" type="button" onclick="lgfxYt('${esc(v.id)}','oculto',${a.oculto ? 'false' : 'true'})">${a.oculto ? 'Mostrar no site' : 'Esconder do site'}</button>` : ''}<a class="lgt-mini" href="../video.html?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener">Ver no site</a><a class="lgt-mini" href="${esc(v.url)}" target="_blank" rel="noopener">YouTube</a></div></div></article>`; }).join('')}</div>` : '<div class="lgt-card"><p class="lgt-p">Nenhum vídeo lido ainda. Se o site estiver aberto pelo servidor da Câmara, os vídeos aparecem aqui em poucos minutos.</p></div>'}`;
  }
  function blocoFala(v, a, d, pode) {
    const f = v.fala || {}; const ia = d && d.ia;
    const enviar = pode ? `<label class="lgfx-fala-up"><span class="lgt-rot">Enviar a legenda do vídeo (.srt, .vtt, .sbv ou .txt)</span><input type="file" accept=".srt,.vtt,.sbv,.txt,.json,text/plain" onchange="lgfxYtLegenda('${esc(v.id)}',this)"></label><small class="lgfx-dica">No YouTube Studio: Conteúdo › escolha o vídeo › Legendas › Português (automático) › ⋮ › Baixar.</small>` : '';
    let corpo;
    if (!ia) corpo = '<p class="lgt-p">Desligado: falta ativar a inteligência artificial no servidor (chave da API nas configurações do Render). O resto da TV Câmara já funciona.</p>';
    else if (f.status === 'pronto') corpo = `<textarea rows="8" ${pode ? '' : 'disabled'} onchange="lgfxYt('${esc(v.id)}','falaTexto',this.value)">${esc(a.falaTexto || f.resumo || '')}</textarea><small class="lgfx-dica">Feito por IA a partir da ${esc(f.fonte || 'legenda')}. Confira nomes e resultados antes de aprovar.</small>
      ${pode ? `<div class="lgt-acoes"><button class="lgt-mini ${a.falaAprovada ? '' : 'primario'}" type="button" onclick="lgfxYt('${esc(v.id)}','falaAprovada',${a.falaAprovada ? 'false' : 'true'})">${a.falaAprovada ? 'Tirar do site' : 'Aprovar e publicar no site'}</button></div>` : ''}`;
    else if (f.status === 'processando') corpo = '<p class="lgt-p">Resumindo… volte em alguns minutos.</p>';
    else corpo = `<p class="lgt-p">${f.status === 'sem_legenda' ? 'O YouTube não liberou a legenda automática deste vídeo.' : f.status === 'erro' ? 'Não deu certo da última vez: ' + esc(f.erro || '') : 'Ainda não resumido. O servidor tenta sozinho nos vídeos novos.'}</p>${enviar}`;
    return `<details class="lgfx-fala" ${f.status === 'pronto' && !a.falaAprovada ? 'open' : ''}><summary><b>O que foi falado (IA)</b> <span class="lgav-chip ${a.falaAprovada ? 'c-verde' : f.status === 'pronto' ? 'c-amarelo' : 'c-info'}">${a.falaAprovada ? 'publicado' : f.status === 'pronto' ? 'rascunho para aprovar' : ia ? 'sem resumo' : 'desligado'}</span></summary>${corpo}</details>`;
  }
  window.lgfxYtLegenda = async function (id, inp) {
    const fl = inp.files[0]; if (!fl) return; if (fl.size > 2.4e6) return UI().aviso('Arquivo grande demais (máximo 2,4 MB).', 'erro');
    const texto = await fl.text();
    try { const r = await fetch('/api/youtube/transcricao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, texto }) }); const j = await r.json().catch(() => ({}));
      if (!r.ok) return UI().aviso(j.erro || 'Não foi possível enviar.', 'erro'); UI().aviso('Legenda enviada. O resumo fica pronto em alguns minutos.'); setTimeout(desenhar, 4000);
    } catch (e) { UI().aviso('Sem conexão com o servidor.', 'erro'); }
  };
  window.lgfxYt = function (id, campo, v) { if (!(window.lgNivelArea && lgNivelArea('site') === 'edicao')) return; const aj = ler(AJ, {}) || {}; aj[id] = { ...(aj[id] || {}) }; if (v === '' || v === false || v === 'false') delete aj[id][campo]; else aj[id][campo] = v === 'true' ? true : v; gravar(AJ, aj); UI().aviso('Salvo. O site já mostra a mudança.'); if (!['resumo', 'falaTexto'].includes(campo) || v === '') desenhar(); };
  window.lgfxYtNoticias = v => { const c = ler('lgt_site_cfg_v1', {}) || {}; c.youtubeNoticias = !!v; gravar('lgt_site_cfg_v1', c); UI().aviso(v ? 'Os vídeos aparecem também em Notícias.' : 'Os vídeos não aparecem mais em Notícias.'); };

  /* =====================================================================
     pendências para o sino (Transparência, Ouvidoria/e-SIC)
     ===================================================================== */
  window.lgfxPendencias = function () {
    const out = [];
    try { calendario().filter(x => x.prox && x.dias <= 7).forEach(x => out.push({ dest: ['area:transparencia'], chave: `cal:${x.id}:${x.prox.toISOString().slice(0, 10)}`, titulo: `Publicar: ${x.nome}`, texto: x.base, prazo: { cor: x.cor, txt: x.dias < 0 ? `atrasado desde ${dBR(x.prox.toISOString())}` : x.dias === 0 ? 'vence hoje' : `vence em ${x.dias} dias`, cfg: { nome: x.nome } }, acao: "lgfxAbrir('calendario')", area: 'transparencia' })); } catch (e) { }
    try { ouv().itens.filter(i => i.status !== 'respondido').forEach(i => { const pz = prazoOuv(i); out.push({ dest: ['perfil:secretaria', 'perfil:procurador'], chave: `ouv:${i.protocolo}`, titulo: `${i.canal === 'esic' ? 'Pedido de informação' : 'Ouvidoria'}: ${i.protocolo}`, texto: i.assunto, prazo: pz ? { ...pz, cfg: { nome: 'Resposta' } } : null, acao: "lgfxAbrir('ouvidoria')", area: 'legislativo' }); }); } catch (e) { }
    return out;
  };

  /* ================= estilos ================= */
  const css = document.createElement('style'); css.id = 'lgfx-style'; css.textContent = `
  .lgfx-mod{border:1px dashed rgba(226,170,28,.55);border-radius:12px;padding:12px;background:rgba(226,170,28,.05)}.lgfx-mod-cab{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.lgfx-mod-cab .lgv31-ic{width:18px;height:18px;color:#e2aa1c}
  .lgfx-mod-cab select{flex:1;min-width:220px;height:36px;border-radius:9px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:0 8px;font:600 13px var(--v32-font,inherit)}
  .lgfx-mod-campos{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.lgfx-mod-campos:empty{display:none}.lgfx-mod-campos label{display:flex;flex-direction:column;gap:4px;font-size:13px}.lgfx-mod-campos button{grid-column:1/-1;justify-self:start}
  .lgfx-mod-campos input,.lgfx-mod-campos textarea{border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:8px;font:14px var(--v32-font,inherit)}
  .lgfx-conf{margin:0 22px 10px;padding:10px 12px;border-radius:10px;background:var(--lg28-inset);font-size:13.5px}.lgfx-conf ul{margin:6px 0 0;padding-left:18px}.lgfx-conf .ok{color:#2fbf71}
  .lgfx-lista{display:flex;flex-direction:column;gap:6px;padding:0 22px 8px;max-height:46vh;overflow:auto}.lgfx-li{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--lg28-stroke);border-radius:10px;cursor:pointer}.lgfx-li b{display:block}.lgfx-li small{color:var(--lg28-muted)}
  #lgfx-lote{position:fixed;z-index:10064;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;border-radius:12px;background:var(--lg28-panel,#141820);color:var(--lg28-ink,#fff);border:1px solid #e2aa1c;box-shadow:0 12px 40px rgba(0,0,0,.4);max-width:calc(100vw - 24px)}#lgfx-lote b{display:inline-flex;gap:6px;align-items:center}#lgfx-lote .lgv31-ic{width:16px;height:16px}
  .lgfx-sug{display:block;color:#e2aa1c;font-size:12px;margin-top:4px}
  .lgfx-lei-meta{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}.lgfx-lei-meta span{padding:10px 14px;border-radius:10px;border:1px solid var(--lg28-stroke)}.lgfx-lei-meta small{display:block;color:var(--lg28-muted);font-size:12px}.lgfx-lei-meta b{font-size:14px}
  .lgfx-texto{font:15px/1.65 Georgia,serif}.lgfx-texto p{margin:0 0 10px}.lgfx-texto .ll-ant{display:none;color:var(--lg28-muted)}.lgfx-texto.ant .ll-ant{display:block}.lgfx-texto em{font:italic 12.5px Inter,sans-serif;color:#e2aa1c}.lgfx-texto .ll-rev{color:var(--lg28-muted)}
  .lgfx-sw{display:inline-flex;gap:6px;align-items:center;font-size:13px}
  .lgfx-alts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.lgfx-alts li{padding:8px 10px;border:1px solid var(--lg28-stroke);border-radius:10px}.lgfx-alts b{display:block;font-size:13.5px}.lgfx-alts small{color:var(--lg28-muted)}
  .lgfx-pre{white-space:pre-wrap;margin:0 22px 12px;padding:12px;border-radius:10px;background:var(--lg28-inset);font-size:13px}
  .lgfx-nota{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.lgfx-anel{--p:0;width:110px;height:110px;border-radius:50%;background:conic-gradient(#e2aa1c calc(var(--p)*1%),var(--lg28-inset) 0);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}
  .lgfx-anel::before{content:'';position:absolute;inset:10px;border-radius:50%;background:var(--lg28-panel,#141820)}.lgfx-anel b,.lgfx-anel small{position:relative}.lgfx-anel b{font-size:26px}.lgfx-anel small{font-size:11px;color:var(--lg28-muted)}
  .lgfx-nota > div:last-child{flex:1;min-width:240px}.lgfx-dim td{background:var(--lg28-inset);font-weight:800;font-size:12.5px;letter-spacing:.03em;text-transform:uppercase}
  .lgfx-yt-st{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.lgfx-yt-st b{display:block}.lgfx-yt-st small{color:var(--lg28-muted)}
  .lgfx-yt{display:flex;flex-direction:column;gap:12px}.lgfx-yt article{display:grid;grid-template-columns:220px 1fr;gap:14px}.lgfx-yt article.oculto{opacity:.55}.lgfx-yt img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#111}.lgfx-yt b{display:block;font-size:15px}.lgfx-yt small{color:var(--lg28-muted);font-size:12.5px}
  .lgfx-yt label{display:flex;flex-direction:column;gap:4px;margin-top:8px}.lgfx-yt select,.lgfx-yt textarea{border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);padding:6px 8px;font:13.5px var(--v32-font,inherit)}.lgfx-yt .lgt-acoes{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
  .lgfx-fala{margin-top:10px;border:1px solid var(--lg28-stroke);border-radius:10px;padding:8px 10px}.lgfx-fala summary{cursor:pointer;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.lgfx-fala textarea{width:100%;box-sizing:border-box;margin-top:8px}.lgfx-dica{display:block;color:var(--lg28-muted);font-size:12px;margin-top:4px}.lgfx-fala-up input{font-size:12.5px}
  @media(max-width:700px){.lgfx-yt article{grid-template-columns:1fr}}
  .lgfx-pn select{padding:0 8px!important;line-height:1.2!important;height:32px;border-radius:8px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);color:var(--lg28-ink);font-size:12.5px}
  @media(max-width:700px){.lgfx-mod-campos{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  function iniciar() {
    if (!A()) return setTimeout(iniciar, 250);
    ganchoNova(); ganchoLote(); ganchoNumero();
    const f = window.salvarProtocolos; if (typeof f === 'function' && !f.__lgfx) { const w = function (...a) { const r = f.apply(this, a); if (lote) setTimeout(proximoLote, 450); setTimeout(redesenhar, 50); return r; }; w.__lgfx = true; Object.keys(f).forEach(k => { w[k] = f[k]; }); window.salvarProtocolos = w; }
    addEventListener('storage', e => { if (/^(lgo_v1|lgll_v1|lgt_transp_v1|lgtc_v1)/.test(e.key || '')) redesenhar(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 350)); else setTimeout(iniciar, 350);
})();
