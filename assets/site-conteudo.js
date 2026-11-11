/* =====================================================================
   Conteúdo editável do site (painel › Publicação de matérias)
   Carregado depois de dados.js e antes de site.js em todas as páginas.
   · MENU_PADRAO: menu original; o painel pode salvar outro em lgs_site_menu_v1
   · Fotos e destaques da capa, vereadores e Mesa: alterações salvas pelo painel
   Hoje lê do navegador (mesmo endereço do painel); com o servidor, virá da API.
   ===================================================================== */
const MENU_PADRAO = [
  ['A Câmara', [
    ['predio', 'Conheça a Câmara', 'Funções, composição e funcionamento', 'pagina.html?p=a-camara'],
    ['grupo', 'Vereadores', 'Os nove representantes da legislatura', 'vereadores.html'],
    ['escudo', 'Mesa Diretora', 'Biênio 2025–2026', 'vereadores.html#mesa'],
    ['balanca', 'Comissões permanentes', 'Composição e atribuições', 'vereadores.html#comissoes'],
    ['estrela', 'Galeria de presidentes', 'Desde 1948', 'pagina.html?p=presidentes'],
    ['livro', 'Regimento Interno', 'Regras de funcionamento', CONFIG.regimento],
    ['livro', 'Lei Orgânica', 'A “constituição” do município', CONFIG.leiOrganica],
    ['mapa', 'O município', 'História, dados e símbolos', 'pagina.html?p=historico'],
  ]],
  ['Legislativo', [
    ['cal', 'Sessões e pautas', 'Calendário e sessões realizadas', 'sessoes.html'],
    ['doc', 'Proposituras', 'Projetos, indicações e requerimentos', CONFIG.proposituras],
    ['balanca', 'Leis municipais', 'Busca no texto e texto atualizado', CONFIG.leis],
    ['ata', 'Atas das sessões', 'Registros oficiais', CONFIG.atas],
    ['jornal', 'Diário Oficial', 'Publicações oficiais', CONFIG.diarioOficial],
    ['video', 'TV Câmara', 'Sessões gravadas e ao vivo', 'pagina.html?p=tv'],
  ]],
  ['Transparência', [
    ['grafico', 'Portal da Transparência', 'Receitas, despesas, pessoal e contratos', 'transparencia.html'],
    ['contrato', 'Licitações', 'Editais, dispensas, contratos e aditivos', 'transparencia.html?c=licitacoes'],
    ['moeda', 'Receitas e despesas', 'Duodécimos, empenhos e pagamentos', 'transparencia.html?c=despesas'],
    ['pessoa', 'Pessoal e remuneração', 'Quadro de servidores e folha', 'transparencia.html?c=pessoal'],
    ['info', 'Acesso à Informação (e-SIC)', 'Peça informações públicas', CONFIG.esic],
    ['escudo', 'Proteção de dados (LGPD)', 'Como tratamos seus dados', 'pagina.html?p=lgpd'],
  ]],
  ['Imprensa', [
    ['jornal', 'Notícias', 'Tudo o que a Câmara aprovou', 'noticias.html'],
    ['cal', 'Agenda', 'Próximas sessões e eventos', 'sessoes.html'],
    ['video', 'Canal no YouTube', 'Gravações das sessões', CONFIG.redes.youtube],
  ], true],
  ['Atendimento', [
    ['email', 'Fale conosco', 'Envie sua mensagem', 'fale-conosco.html'],
    ['ouvido', 'Ouvidoria', 'Sugestões, elogios e reclamações', 'ouvidoria.html'],
    ['info', 'Perguntas frequentes', 'Dúvidas mais comuns', 'pagina.html?p=perguntas'],
    ['local', 'Endereço e horário', 'Como chegar', 'pagina.html?p=localizacao'],
    ['mao', 'Acessibilidade', 'Recursos deste portal', 'pagina.html?p=acessibilidade'],
  ], true],
];

const CMS = (() => { const j = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }; return { menu: j('lgs_site_menu_v1'), img: j('lgs_site_img_v1'), destaques: j('lgs_site_destaques_v1'), ver: j('lgs_site_vereadores_v1') }; })();
const MENU = Array.isArray(CMS.menu) && CMS.menu.length ? CMS.menu.filter(g => g && Array.isArray(g[1])).map(([t, it, e]) => [t, it.filter(i => !i[4]), e]) : MENU_PADRAO;
(function aplicarConteudo() {
  if (CMS.img) Object.entries(CMS.img).forEach(([k, d]) => { if (d) IMG[k] = { local: d }; });
  if (Array.isArray(CMS.destaques) && CMS.destaques.length) DESTAQUES.splice(0, DESTAQUES.length, ...CMS.destaques.filter(d => !d.oculto).map(d => d.foto ? { ...d, imgObj: { local: d.foto } } : d));
  const v = CMS.ver;
  if (v && Array.isArray(v.vereadores) && v.vereadores.length) {
    VEREADORES.splice(0, VEREADORES.length, ...v.vereadores.filter(x => x.ativo !== false));
    if (v.mesa) { if (v.mesa.periodo) MESA.periodo = v.mesa.periodo; if (Array.isArray(v.mesa.membros)) MESA.membros.splice(0, MESA.membros.length, ...v.mesa.membros.filter(m => m[1] && VEREADORES.some(x => x.id === m[1]))); }
    if (v.legislatura) window.LEGISLATURA = v.legislatura;
    COMISSOES.forEach(c => { c.membros = c.membros.filter(m => VEREADORES.some(x => x.id === m[1])); });
  }
})();
