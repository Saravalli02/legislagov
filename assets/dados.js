/* =====================================================================
   DADOS DO SITE — Câmara Municipal de Neves Paulista
   Edite este arquivo para atualizar o conteúdo sem mexer no layout.
   Fonte dos dados: site atual da Câmara (camaranevespaulista.sp.gov.br).
   ===================================================================== */

const ORIGEM = 'https://www.camaranevespaulista.sp.gov.br'; // site antigo (imagens e links ainda não migrados)

const CONFIG = {
  slogan: 'Poder Legislativo Municipal',
  nome: 'Câmara Municipal de Neves Paulista',
  nomeCurto: 'Neves Paulista',
  estado: 'Estado de São Paulo',
  endereco: 'Rua Benjamim Constant, 866 — Centro',
  cep: '15120-013',
  cidade: 'Neves Paulista — SP',
  telefone: '(17) 3271-1482',
  telefoneLink: '+551732711482',
  horario: 'Segunda a sexta, das 7h30 às 11h30 e das 13h às 17h',
  horarioSessoes: 'As sessões ordinárias acontecem às segundas-feiras, às 20h, no Plenário da Câmara.',
  painel: 'painel/index.html',
  webmail: 'http://webmail.camaranevespaulista.sp.gov.br',
  mapa: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3728.750679899029!2d-49.63357088544989!3d-20.841771972687763!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94bda3a2c6e55513%3A0x9c35feb7a88ec65e!2sR.+Benjamin+Constant%2C+866%2C+Neves+Paulista+-+SP%2C+15120-000!5e0!3m2!1sen!2sbr!4v1463073148156',
  redes: {
    youtube: 'https://www.youtube.com/@camaramunicipalnevespaulista',
    instagram: 'https://www.instagram.com/camaramunicipalnevespaulista',
    linkedin: 'https://www.linkedin.com/company/c%C3%A2mara-municipal-de-neves-paulista',
  },
  // Sistemas externos (trocar quando migrarem)
  legislacao: 'http://consulta.siscam.com.br/camaranevespaulista/index/81/8',
  proposituras: 'proposituras.html',
  propositurasAntigo: 'http://consulta.siscam.com.br/camaranevespaulista/index/80/8',
  sessoesSiscam: 'http://consulta.siscam.com.br/camaranevespaulista/sessoes',
  atas: 'http://consulta.siscam.com.br/camaranevespaulista/index/84/8',
  docsAdmin: 'http://consulta.siscam.com.br/camaranevespaulista/index/79/8',
  diarioOficial: 'https://nevespaulista.siscam.com.br/Documentos/Pesquisa?Pesquisa=Avancada&id=79&pagina=1&Modulo=8&Documento=405',
  indicacoes: 'https://nevespaulista.siscam.com.br/Documentos/Pesquisa?Pesquisa=Avancada&id=80&pagina=1&Modulo=8&Documento=139',
  requerimentos: 'https://nevespaulista.siscam.com.br/Documentos/Pesquisa?Pesquisa=Avancada&id=80&pagina=1&Modulo=8&Documento=138',
  transparencia: 'transparencia.html',
  sistemaContabil: 'http://143.0.202.245:6767/',
  radar: 'https://radardatransparencia.atricon.org.br/',
  esic: ORIGEM + '/Sic/Cidadao',
  licitacoes: ORIGEM + '/licitacao',
  contas: ORIGEM + '/ContaPublica',
  pca: ORIGEM + '/Pagina/Listar/351',
  leiOrganica: ORIGEM + '/Arquivos/Uploads/LeiOrg.pdf',
  regimento: ORIGEM + '/Arquivos/Uploads/RegInt.pdf',
  legislaturas: ORIGEM + '/Legislatura',
  noticiasAntigas: ORIGEM + '/Noticia',
  politicaCookies: ORIGEM + '/Arquivos/Uploads/pol%C3%ADtica-de-dados-e-cookies.pdf',
};

/* Imagens: o site tenta primeiro a cópia local (assets/img), depois o site antigo. */
const IMG = {
  brasao:   { local: 'assets/img/brasao.jpg',   remoto: ORIGEM + '/Arquivos/Uploads/Bras%C3%A3o_Neves_Paulista,_SP.jpg' },
  bandeira: { local: 'assets/img/bandeira.png', remoto: ORIGEM + '/Arquivos/Uploads/Bandeira_Neves_Paulista.png' },
  presidente: { local: 'assets/img/destaque-presidente.jpg', remoto: ORIGEM + '/Arquivos/Noticias/1736192234336-205.jpeg?quality=80&w=1200' },
  mesa:       { local: 'assets/img/destaque-mesa.jpg',       remoto: ORIGEM + '/Arquivos/Noticias/1736192157667-235.jpeg?quality=80&w=1400' },
  legislatura:{ local: 'assets/img/destaque-vereadores.jpg', remoto: ORIGEM + '/Arquivos/Noticias/1736192107286-790.jpeg?quality=80&w=1600' },
  plenario:   { local: 'assets/img/plenario.jpg',             remoto: ORIGEM + '/Arquivos/Noticias/2020512_untitled2.png?w=1400' },
  plenario2:  { local: 'assets/img/plenario-2.jpg',           remoto: ORIGEM + '/Arquivos/Noticias/2020512_untitled3.png?w=1400' },
  audiencia:  { local: 'assets/img/audiencia-publica.png',    remoto: ORIGEM + '/Arquivos/Noticias/tmp2C82.png?w=1200' },
  audiencia26:{ local: 'assets/img/audiencia-2026.png',       remoto: ORIGEM + '/Arquivos/Noticias/1783364224282-11.png?w=700' },
  everton:    { local: 'assets/img/everton-presidente.jpg',   remoto: ORIGEM + '/Arquivos/Noticias/1736192560770-184.jpeg?quality=80&w=900' },
};

const VEREADORES = [
  { id: 56, nome: 'Edenilson Roselli', completo: 'Edenilson Alexandre Roselli', partido: 'Republicanos', foto: 'Roselli.jpeg', arq: 'roselli' },
  { id: 52, nome: 'Evertinho', completo: 'Everton Fermiano da Silva', partido: 'PSD', foto: 'Everton.jpeg', arq: 'everton' },
  { id: 48, nome: 'Maikon Piau', completo: 'Maikon Reche de Oliveira', partido: 'MDB', foto: 'Maikon vereador.jpg', arq: 'maikon' },
  { id: 41, nome: 'Emerson Rodrigues', completo: 'Emerson Rodrigues Ferreira', partido: 'Republicanos', foto: 'Emerson 3.jpg', arq: 'emerson' },
  { id: 16, nome: 'Luis Pelacani', completo: 'Luis Antonio Pelacani', partido: 'Republicanos', foto: 'thumbnail_LUIS PELACANI.jpg', arq: 'pelacani' },
  { id: 26, nome: 'Pastelão', completo: 'Marcio José Baia', partido: 'Republicanos', foto: 'Pastelão.jpeg', arq: 'marcio' },
  { id: 32, nome: 'Sirlei Protetora', completo: 'Sirlei Maria da Costa', partido: 'PSD', foto: 'Sirlei.jpeg', arq: 'sirlei', f: true },
  { id: 44, nome: 'Lucão', completo: 'Lucas Vieira', partido: 'MDB', foto: 'Vereador Lucão.jpg', arq: 'lucas' },
  { id: 60, nome: 'Tonho Cabeludo', completo: 'Antonio Bento Bezerra', partido: 'Podemos', foto: 'TONHO CABELUDO.jpg', arq: 'antonio-bento' },
];

const MESA = { periodo: 'Biênio 2025–2026 (01/01/2025 a 31/12/2026)', membros: [
  ['Presidente', 56], ['Vice-Presidente', 52], ['1º Secretário', 48], ['2º Secretário', 41],
] };

const COMISSOES = [
  { nome: 'Justiça e Redação', eleicao: '06/01/2025', membros: [['Presidente', 16], ['Vice-Presidente', 26], ['Relator', 44]],
    resumo: 'Examina a constitucionalidade, a legalidade e a redação dos projetos.' },
  { nome: 'Finanças e Orçamento', eleicao: '06/02/2025', membros: [['Presidente', 41], ['Vice-Presidente', 44], ['Relatora', 32]],
    resumo: 'Analisa o orçamento, as contas e o impacto financeiro das propostas.' },
  { nome: 'Assuntos Gerais', eleicao: '06/02/2025', membros: [['Presidente', 26], ['Vice-Presidente', 41], ['Relator', 60]],
    resumo: 'Trata dos demais assuntos de interesse do Município.' },
];

/* Sessões publicadas no calendário oficial de 2026 (usadas quando o painel não tiver agenda cadastrada) */
const SESSOES = [
  ['2026-11-16T20:00', '18ª Sessão Ordinária'], ['2026-11-03T20:00', '17ª Sessão Ordinária'],
  ['2026-10-19T20:00', '16ª Sessão Ordinária'], ['2026-10-05T20:00', '15ª Sessão Ordinária'],
  ['2026-09-21T20:00', '14ª Sessão Ordinária'], ['2026-09-08T20:00', '13ª Sessão Ordinária'],
  ['2026-08-17T20:00', '12ª Sessão Ordinária'], ['2026-08-03T20:00', '11ª Sessão Ordinária'],
  ['2026-06-15T20:00', '10ª Sessão Ordinária'], ['2026-06-01T20:00', '9ª Sessão Ordinária'],
  ['2026-05-18T20:00', '8ª Sessão Ordinária'], ['2026-05-04T20:00', '7ª Sessão Ordinária'],
  ['2026-04-22T20:00', '6ª Sessão Ordinária'], ['2026-04-06T20:00', '5ª Sessão Ordinária'],
  ['2026-03-16T20:00', '4ª Sessão Ordinária'],
];

/* As notícias ficam em assets/noticias.js (importadas do site antigo) e nas publicações feitas pelo painel. */


/* Carrossel de destaques da página inicial */
const DESTAQUES = [
  { img: 'legislatura', selo: 'Legislatura 2025–2028', titulo: 'Nove vereadores trabalhando por Neves Paulista', texto: 'Conheça quem representa você na Câmara, os partidos e as comissões de cada vereador.', link: 'vereadores.html', botao: 'Conheça os vereadores' },
  { img: 'plenario', selo: 'Sessões ordinárias', titulo: 'As sessões são públicas. Participe!', texto: 'Às segundas-feiras, às 20h, no Plenário da Câmara. As gravações ficam no canal oficial no YouTube.', link: 'sessoes.html', botao: 'Ver calendário' },
  { img: 'mesa', selo: 'Mesa Diretora 2025–2026', titulo: 'Quem conduz os trabalhos da Câmara', texto: 'Presidente, vice-presidente e secretários eleitos para o biênio 2025–2026.', link: 'vereadores.html#mesa', botao: 'Ver a Mesa Diretora' },
  { img: 'audiencia', selo: 'Participação', titulo: 'Audiências públicas: a sua voz no orçamento', texto: 'A população ajuda a definir as prioridades do município. Acompanhe as convocações.', link: 'noticias.html?c=Audiências públicas', botao: 'Ver audiências' },
];

/* Galeria de presidentes (do site atual) */
const PRESIDENTES = [
  ['Edenilson Alexandre Roselli', '2025–2026'],
  ['Adelar Francisco Germano', '2011–2012'], ['Luis Antonio Abranches', '2009–2010'], ['José Scaglia Netto', '2008'],
  ['Renato Eurico Teixeira', '2007'], ['Irineu Marques', '2006'], ['Márcio Rogério Rodrigues dos Santos', '2005'],
  ['Romildo Ribas', '2003–2004'], ['José Benedito Fernandes', '2002'], ['Luiz Carlos de Souza', '2001'],
  ['Leonídio Moretti', '2000'], ['Benedito Carlos Massa', '1999'], ['Israel Garcia Vasques', '1998'],
  ['Irineu Marques', '1997'], ['José André Garcia', '1996'], ['Dr. Francisco Modesto Viúdes Vasques', '1995'],
  ['José Benedito Fernandes', '1994'], ['Moacir Bordinassi', '1993'], ['Moacir Bordinassi', '1992'],
  ['José Debortolli', '1991'], ['Octávio Martins Garcia', '1989–1990'], ['José Debortolli', '1987–1988'],
  ['João Francisco Suzana da Silva', '1985–1986'], ['Antonio Toscano', '1983–1984'], ['José Debortolli', '1981–1982'],
  ['Antonio Toscano', '1979–1980'], ['Irineu Parmigiani Blasques', '1977–1978'], ['José Apparecido Ochiussi', '1975–1976'],
  ['Antonio Hernandez Garcia', '1973–1974'], ['Alcyoni José Magalhães Correa', '1972'], ['Adélvio Viscardi', '1970–1971'],
  ['Alcyoni José Magalhães Correa', '1969'], ['Rubens Bottini', '1968'], ['Reynaldo Pazzotto', '1966–1967'],
  ['Sebastião Munhoz Filho', '1964–1965'], ['Ignácio Vasques', '1963'], ['Antonio Luiz Figueiredo', '1962'],
  ['João de Jesus', '1961'], ['Pelegrino Bilachi', '1960'], ['Antonio Luiz Figueiredo', '1958–1959'],
  ['José Afonso Moralez', '1957'], ['Octavio Martins Garcia', '1956'], ['José Afonso Moralez', '1955'],
  ['Arlindo Serantola', '1954'], ['Octavio Martins Garcia', '1953'], ['Osvaldo Sírio Nucci', '1952'],
  ['Amelleto Marino', '1951'], ['Osório Modesto Medeiros', '1950'], ['Egberto Silva', '1948–1949'],
];

/* Páginas de conteúdo (pagina.html?p=chave) */
const PAGINAS = {
  'a-camara': { grupo: 'Conheça a Câmara', titulo: 'A Câmara', html: `
    <p>A Câmara Municipal é o órgão do Poder Legislativo de Neves Paulista. Cabe a ela elaborar e votar as leis municipais, fiscalizar os atos do Poder Executivo e representar a população nas decisões que afetam a cidade.</p>
    <h2>Funções da Câmara</h2>
    <ul class="lista">
      <li><strong>Legislativa:</strong> discute e vota projetos de lei, resoluções e decretos legislativos.</li>
      <li><strong>Fiscalizadora:</strong> acompanha a aplicação dos recursos públicos e os atos da Prefeitura.</li>
      <li><strong>Administrativa:</strong> organiza seus próprios serviços, pessoal e orçamento.</li>
      <li><strong>Assessoramento:</strong> encaminha indicações e sugestões ao Poder Executivo.</li>
    </ul>
    <h2>Composição</h2>
    <p>A Câmara é formada por nove vereadores eleitos para mandato de quatro anos. A legislatura atual vai de 2025 a 2028. A direção dos trabalhos fica com a Mesa Diretora, eleita pelos próprios vereadores para mandato de dois anos.</p>
    <p class="acoes"><a class="btn" href="vereadores.html">Conheça os vereadores</a> <a class="btn btn-sec" href="pagina.html?p=atribuicoes-mesa">Atribuições da Mesa</a></p>` },
  'atribuicoes-mesa': { grupo: 'Conheça a Câmara', titulo: 'Atribuições da Mesa Diretora', html: `
    <p>A Mesa Diretora é o órgão colegiado que dirige a Câmara. Ela conduz os trabalhos legislativos e cuida da gestão administrativa interna, decidindo por maioria de seus membros.</p>
    <h2>Composição e mandato</h2>
    <p>É formada por Presidente, Vice-Presidente, 1º Secretário e 2º Secretário, com mandato de dois anos. Não é permitida a recondução ao mesmo cargo na mesma legislatura.</p>
    <h2>Principais competências</h2>
    <ul class="lista">
      <li>Dirigir os trabalhos do plenário, sob orientação da Presidência.</li>
      <li>Organizar o funcionamento legislativo e encaminhar as proposições.</li>
      <li>Assinar os autógrafos das leis e dos atos normativos.</li>
      <li>Propor projetos em matérias de sua competência, como a organização dos serviços da Câmara.</li>
      <li>Administrar o pessoal, o patrimônio e o orçamento do Legislativo.</li>
    </ul>
    <p class="acoes"><a class="btn" href="vereadores.html#mesa">Ver composição atual</a> <a class="btn btn-sec" href="${CONFIG.regimento}" target="_blank" rel="noopener">Regimento Interno (PDF)</a></p>` },
  'presidentes': { grupo: 'Conheça a Câmara', titulo: 'Galeria de presidentes', especial: 'presidentes' },
  'aspectos-gerais': { grupo: 'O Município', titulo: 'Aspectos gerais', html: `
    <p>Neves Paulista fica no noroeste do Estado de São Paulo, na região de São José do Rio Preto, a cerca de 469 km da capital. O clima é tropical e a economia tem raízes na cafeicultura.</p>
    <table class="tabela"><tbody>
      <tr><th>Localização</th><td>Mesorregião de São José do Rio Preto · Microrregião de Nhandeara</td></tr>
      <tr><th>Coordenadas</th><td>20°50'46" S · 49°37'47" O · altitude de 549 m</td></tr>
      <tr><th>Municípios vizinhos</th><td>Mirassol, José Bonifácio, Nipoã e Monte Aprazível</td></tr>
      <tr><th>População</th><td>8.772 habitantes (IBGE, Censo 2010): 7.916 na área urbana e 856 na rural</td></tr>
      <tr><th>IDH municipal</th><td>0,804</td></tr>
      <tr><th>Taxa de alfabetização</th><td>92,9%</td></tr>
      <tr><th>Principais rios</th><td>Rio São José dos Dourados, Ribeirão do Jacaré e Ribeirão Boa Vista dos Castilhos</td></tr>
      <tr><th>Fuso horário</th><td>UTC−3</td></tr>
    </tbody></table>
    <p class="nota">Dados históricos publicados no site da Câmara (IBGE 2010 e IPEADATA). Para números atualizados, consulte o IBGE Cidades.</p>` },
  'historico': { grupo: 'O Município', titulo: 'Breve histórico', html: `
    <p>A história de Neves Paulista começa em 22 de maio de 1922, quando pioneiros ergueram um cruzeiro num divisor de águas entre córregos da região. Nascia ali o povoado de Canto Chão, dedicado a Nossa Senhora Aparecida.</p>
    <h2>Linha do tempo</h2>
    <ul class="timeline">
      <li><b>1922</b> Fundação do povoado de Canto Chão.</li>
      <li><b>1927</b> Torna-se distrito, ligado a Monte Aprazível.</li>
      <li><b>1937</b> O distrito passa a pertencer a Mirassol.</li>
      <li><b>1944</b> Emancipação: nasce o município de Iboti.</li>
      <li><b>1948</b> Em 24 de dezembro, o município recebe o nome de Neves Paulista.</li>
    </ul>
    <p>O crescimento veio com o café, que atraiu famílias de imigrantes espanhóis, italianos, árabes e alemães. A influência espanhola é marcante até hoje na cultura local, e o brasão da cidade lembra essa origem com a inscrição "Centro Cafeeiro".</p>` },
  'bandeira-brasao': { grupo: 'O Município', titulo: 'Bandeira e brasão', especial: 'simbolos' },
  'localizacao': { grupo: 'Atendimento', titulo: 'Localização e horário', especial: 'localizacao' },
  'ouvidoria': { grupo: 'Atendimento', titulo: 'Ouvidoria', html: `
    <p>A Ouvidoria Legislativa é o canal para você participar e acompanhar o trabalho da Câmara. Ela recebe e responde sugestões, elogios, solicitações, reclamações e denúncias sobre serviços públicos.</p>
    <h2>Prazos de resposta</h2>
    <ul class="lista">
      <li><strong>Manifestações</strong> (Lei 13.460/2017): até 30 dias, prorrogáveis por mais 30 com justificativa.</li>
      <li><strong>Pedidos de acesso à informação</strong> (Lei 12.527/2011): até 20 dias, prorrogáveis por mais 10.</li>
    </ul>
    <h2>Tipos de manifestação</h2>
    <div class="chips"><span>Sugestão</span><span>Elogio</span><span>Solicitação</span><span>Reclamação</span><span>Denúncia</span></div>
    <p class="acoes"><a class="btn" href="fale-conosco.html?assunto=Ouvidoria">Registrar manifestação</a> <a class="btn btn-sec" href="${CONFIG.esic}" target="_blank" rel="noopener">Pedido de informação (e-SIC)</a></p>` },
  'perguntas': { grupo: 'Atendimento', titulo: 'Perguntas frequentes', especial: 'faq' },
  'acessibilidade': { grupo: 'Atendimento', titulo: 'Acessibilidade', html: `
    <p>Este portal foi feito para ser usado por todas as pessoas, inclusive com leitores de tela, apenas pelo teclado ou no celular.</p>
    <h2>Atalhos de teclado</h2>
    <table class="tabela"><tbody>
      <tr><th>Alt + 1</th><td>Ir para o conteúdo</td></tr>
      <tr><th>Alt + 2</th><td>Ir para o menu</td></tr>
      <tr><th>Alt + 3</th><td>Ir para o rodapé</td></tr>
      <tr><th>Alt + 4 / Alt + 5</th><td>Aumentar / diminuir o texto</td></tr>
      <tr><th>Alt + 6</th><td>Alto contraste</td></tr>
    </tbody></table>
    <p class="nota">No Firefox use Alt + Shift + número. No Mac, Control + Option + número.</p>
    <h2>VLibras</h2>
    <p>O ícone azul no canto da tela abre o tradutor de Libras do Governo Federal.</p>` },
  'lgpd': { grupo: 'Transparência', titulo: 'Proteção de dados (LGPD)', html: `
    <p>A Câmara trata dados pessoais apenas para cumprir suas funções públicas, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
    <ul class="lista">
      <li>Dados enviados em formulários são usados somente para responder ao cidadão.</li>
      <li>Você pode pedir acesso, correção ou exclusão dos seus dados pela Ouvidoria.</li>
      <li>O site usa armazenamento local apenas para lembrar preferências de acessibilidade.</li>
    </ul>
    <p class="acoes"><a class="btn btn-sec" href="${CONFIG.politicaCookies}" target="_blank" rel="noopener">Política de dados e cookies (PDF)</a></p>` },
  'tv': { grupo: 'Imprensa', titulo: 'TV Câmara', especial: 'tv' },
  'mapa-do-site': { grupo: 'Institucional', titulo: 'Mapa do site', especial: 'mapa' },
};

const FAQ = [
  ['O que faz a Câmara Municipal?', 'Elabora e vota as leis do município, fiscaliza o Poder Executivo e representa a população.'],
  ['Qual é a função do vereador?', 'Representar a população, propor leis, fiscalizar a Prefeitura e participar das decisões do município.'],
  ['Quanto tempo dura o mandato?', 'O mandato dos vereadores é de quatro anos. O da Mesa Diretora é de dois anos.'],
  ['Quem compõe a Mesa Diretora?', 'Presidente, Vice-Presidente, 1º Secretário e 2º Secretário.'],
  ['Posso assistir às sessões?', 'Sim. As sessões são públicas e acontecem no Plenário da Câmara. As gravações ficam no canal da Câmara no YouTube.'],
  ['Como pedir uma informação pública?', 'Pelo e-SIC (Acesso à Informação) ou pessoalmente na Câmara, no horário de atendimento.'],
  ['Onde encontro as leis municipais?', 'No menu Atividade Legislativa > Leis municipais, que abre a consulta oficial.'],
];
