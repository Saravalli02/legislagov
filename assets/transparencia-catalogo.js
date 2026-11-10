/* =====================================================================
   CATÁLOGO DO PORTAL DA TRANSPARÊNCIA — Câmara Municipal de Neves Paulista
   Usado pelo site (transparencia.html) e pelo painel (publicação).
   Estrutura baseada na matriz do Programa Nacional de Transparência Pública
   (PNTP/Atricon) para o Poder Legislativo, na LAI (Lei 12.527/2011),
   na LC 131/2009 e na Lei 14.133/2021.
   ===================================================================== */
(function (g) {
  const ANTIGO = 'https://www.camaranevespaulista.sp.gov.br';
  const SISCAM = 'http://consulta.siscam.com.br/camaranevespaulista';
  const CONTABIL = 'http://143.0.202.245:6767/';

  g.TRANSP_CHAVE = 'lgt_transp_v1';          // publicações (painel → site)
  g.TRANSP_PERM_CHAVE = 'lgt_publicadores_v1'; // e-mails autorizados a publicar

  g.TRANSP_CATALOGO = [
    { id: 'institucional', nome: 'Institucional', icone: 'predio', desc: 'Estrutura, competências, autoridades, endereço e horários.',
      base: 'LAI art. 8º §1º I · PNTP dimensão 2',
      subs: ['Estrutura organizacional', 'Competências e atribuições', 'Autoridades e Mesa Diretora', 'Regimento e Lei Orgânica', 'Agenda de autoridades', 'Carta de serviços'],
      links: [['Conheça a Câmara', 'pagina.html?p=a-camara'], ['Mesa Diretora e vereadores', 'vereadores.html'], ['Regimento Interno (PDF)', ANTIGO + '/Arquivos/Uploads/RegInt.pdf'], ['Lei Orgânica (PDF)', ANTIGO + '/Arquivos/Uploads/LeiOrg.pdf'], ['Endereço e horário', 'pagina.html?p=localizacao']] },
    { id: 'receitas', nome: 'Receitas', icone: 'moeda', desc: 'Duodécimos recebidos da Prefeitura: previsto e realizado, mês a mês.',
      base: 'LC 131/2009 · PNTP 3.1 (duodécimos)', valor: true,
      subs: ['Duodécimos (repasses)', 'Outras receitas', 'Devolução de saldo ao Executivo'],
      links: [['Sistema contábil (consulta detalhada)', CONTABIL]] },
    { id: 'despesas', nome: 'Despesas', icone: 'grafico', desc: 'Empenhos, liquidações, pagamentos e ordem cronológica.',
      base: 'LC 131/2009 · PNTP dimensão 4 (4.3 essencial)', valor: true, fornecedor: true,
      subs: ['Empenhos', 'Liquidações', 'Pagamentos', 'Ordem cronológica de pagamentos', 'Restos a pagar'],
      links: [['Sistema contábil (consulta detalhada)', CONTABIL], ['Contas públicas (site anterior)', ANTIGO + '/ContaPublica']] },
    { id: 'licitacoes', nome: 'Licitações', icone: 'contrato', desc: 'Editais, dispensas, inexigibilidades, atas e resultados.',
      base: 'Lei 14.133/2021 · PNTP dimensão 8', valor: true, fornecedor: true,
      subs: ['Editais e avisos', 'Dispensas e inexigibilidades', 'Atas de registro de preços', 'Resultados e homologações', 'Plano de Contratações Anual'],
      links: [['Licitações (site anterior)', ANTIGO + '/licitacao'], ['Plano de Contratações Anual', ANTIGO + '/Pagina/Listar/351']] },
    { id: 'contratos', nome: 'Contratos', icone: 'contrato', desc: 'Contratos, aditivos, apostilamentos e fiscais designados.',
      base: 'Lei 14.133/2021 art. 94 · PNTP dimensão 9', valor: true, fornecedor: true,
      subs: ['Contratos', 'Termos aditivos', 'Apostilamentos', 'Fiscais e gestores de contrato'] },
    { id: 'pessoal', nome: 'Pessoal', icone: 'pessoa', desc: 'Quadro de servidores, remuneração, estagiários e concursos.',
      base: 'LAI · PNTP dimensão 6', valor: true,
      subs: ['Relação de servidores', 'Folha de pagamento / remuneração', 'Tabela de cargos e salários', 'Estagiários', 'Terceirizados', 'Concursos e seleções'] },
    { id: 'vereadores', nome: 'Vereadores', icone: 'grupo', desc: 'Subsídios, verbas, diárias e frequência dos parlamentares.',
      base: 'PNTP dimensão 20 (Legislativo)', valor: true,
      subs: ['Subsídios', 'Verba de gabinete / indenizatória', 'Frequência nas sessões'],
      links: [['Composição e partidos', 'vereadores.html']] },
    { id: 'diarias', nome: 'Diárias e viagens', icone: 'mapa', desc: 'Diárias pagas, destino, motivo e tabela de valores.',
      base: 'PNTP dimensão 7', valor: true,
      subs: ['Diárias concedidas', 'Tabela de valores de diárias', 'Adiantamentos'] },
    { id: 'contas', nome: 'Planejamento e contas', icone: 'ata', desc: 'PPA, LDO, LOA, RGF, balanços, prestação de contas e parecer do TCE.',
      base: 'LRF · PNTP dimensão 11',
      subs: ['PPA', 'LDO', 'LOA', 'Relatório de Gestão Fiscal (RGF)', 'Balanços e demonstrativos', 'Prestação de contas anual', 'Relatório de gestão / atividades', 'Julgamento das contas pelo TCE-SP'] },
    { id: 'legislativo', nome: 'Atividade legislativa', icone: 'balanca', desc: 'Projetos e tramitação, pautas, atas com presença, votações e leis.',
      base: 'PNTP dimensão 20 (20.3, 20.5, 20.6)',
      subs: ['Projetos e tramitação', 'Pautas das sessões', 'Pautas das comissões', 'Atas e lista de presença', 'Votações nominais', 'Leis, resoluções e decretos legislativos'],
      links: [['Proposituras e tramitação', SISCAM + '/index/80/8'], ['Atas das sessões', SISCAM + '/index/84/8'], ['Leis municipais', SISCAM + '/index/81/8'], ['Sessões e calendário', 'sessoes.html']] },
    { id: 'convenios', nome: 'Convênios e transferências', icone: 'link', desc: 'Convênios, acordos de cooperação e transferências.',
      base: 'PNTP dimensão 5',
      subs: ['Convênios', 'Acordos de cooperação', 'Termos de fomento / parceria'] },
    { id: 'patrimonio', nome: 'Patrimônio e frota', icone: 'predio', desc: 'Bens móveis e imóveis, veículos e uso da frota.',
      base: 'Boas práticas de transparência',
      subs: ['Bens móveis', 'Bens imóveis', 'Veículos e controle de uso'] },
    { id: 'sic', nome: 'Acesso à informação', icone: 'info', desc: 'e-SIC, relatório estatístico e informações classificadas.',
      base: 'LAI arts. 9º, 30 e 40 · PNTP dimensão 12',
      subs: ['Relatório estatístico do SIC', 'Informações classificadas e desclassificadas', 'Perguntas frequentes', 'Autoridade de monitoramento da LAI'],
      links: [['Fazer um pedido (e-SIC)', ANTIGO + '/Sic/Cidadao'], ['Perguntas frequentes', 'pagina.html?p=perguntas'], ['Radar da Transparência Pública', 'https://radardatransparencia.atricon.org.br/']] },
    { id: 'ouvidoria', nome: 'Ouvidoria e LGPD', icone: 'escudo', desc: 'Ouvidoria, relatórios, carta de serviços e proteção de dados.',
      base: 'Lei 13.460/2017 · LGPD · PNTP dimensões 14 e 15',
      subs: ['Relatório anual da Ouvidoria', 'Carta de serviços ao usuário', 'Encarregado de dados (LGPD)', 'Política de privacidade'],
      links: [['Ouvidoria', 'pagina.html?p=ouvidoria'], ['Proteção de dados', 'pagina.html?p=lgpd']] },
  ];

  g.TRANSP_TIPOS_ARQUIVO = '.pdf,.csv,.xlsx,.xls,.ods,.odt,.doc,.docx,.txt,.json,.jpg,.jpeg,.png';
  g.TRANSP_LIMITE_ARQUIVO = 2.5 * 1024 * 1024; // demonstração: o navegador guarda até ~5 MB no total

  g.transpLer = function () { try { return JSON.parse(localStorage.getItem(g.TRANSP_CHAVE)) || []; } catch (e) { return []; } };
  g.transpSalvar = function (lista) { localStorage.setItem(g.TRANSP_CHAVE, JSON.stringify(lista)); };
  g.transpCategoria = function (id) { return g.TRANSP_CATALOGO.find(c => c.id === id); };
  g.transpMoeda = function (v) { const n = Number(v); return v === '' || v == null || isNaN(n) ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  g.transpCompetencia = function (c) { if (!c) return ''; const [a, m] = String(c).split('-'); return m ? `${m}/${a}` : a; };
  /* abre um arquivo guardado como data URL em nova aba (navegadores bloqueiam data: direto) */
  g.transpAbrirArquivo = function (item) {
    if (!item || !item.arquivo) return;
    const [meta, b64] = item.arquivo.dados.split(',');
    const tipo = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: tipo }));
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
    if (!/pdf|image|text|json|csv/.test(tipo)) a.download = item.arquivo.nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
})(window);
