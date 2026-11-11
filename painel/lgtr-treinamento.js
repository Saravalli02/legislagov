/* =====================================================================
   LegislaGov — AJUDA E TREINAMENTO
   · Central (menu Ajuda › Treinamento em todos os painéis e botão "Ajuda" do topo).
   · Trilhas por perfil: o sistema mostra a tela de verdade, destaca a parte explicada e
     a pessoa só avança depois de clicar em "OK, entendi". O progresso fica salvo por usuário
     (hoje, neste navegador; com o banco de dados, vai para o servidor).
   · "O que cada função faz": lista pesquisável com o botão "Mostrar onde fica".
   · Narração opcional (voz do navegador, em português).
   · Primeiro acesso a um painel: convite para o treinamento daquele painel.
   ===================================================================== */
(function () {
  const KEY = 'lgtr_v1';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const usuario = () => { try { return typeof usuarioAtual !== 'undefined' ? usuarioAtual : null; } catch (e) { return null; } };
  const quem = () => String((usuario() || {}).usuario || (usuario() || {}).email || 'anon').toLowerCase();
  const ler = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const gravar = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { } };
  const meu = () => { const d = ler(); return d[quem()] || (d[quem()] = { trilhas: {}, convites: {} }); };
  const salvarMeu = m => { const d = ler(); d[quem()] = m; gravar(d); };
  const areasOk = () => (window.lgtAreasPermitidas ? lgtAreasPermitidas() : ['legislativo']);
  const areaAtual = () => document.documentElement.getAttribute('data-lg-area') || 'legislativo';
  const perfil = () => (window.lgPerfil ? lgPerfil() : null);
  const ehAdm = () => perfil() === 'adm';
  const ehGestor = () => ['adm', 'procurador'].includes(perfil());
  const ehPres = () => ehAdm() || !!(window.lgEhPresidente && lgEhPresidente());
  const ehVereador = () => !!(window.lgVereadorDoUsuario && lgVereadorDoUsuario(usuario()));
  const M = k => `.lgv31-item[data-v31="${k}"]`;

  /* ================= TRILHAS ================= */
  const TRILHAS = [
    { id: 'inicio', titulo: 'Primeiros passos', icone: 'home', desc: 'Como navegar: trocar de painel, menu, busca, avisos, aparência e sair com segurança.', para: () => true, passos: [
      { titulo: 'Bem-vindo ao LegislaGov', texto: 'Este treinamento mostra o sistema parte por parte, na tela de verdade. Leia cada explicação e clique em “OK, entendi” para seguir. Pode sair quando quiser: o sistema guarda onde você parou.', como: ['Use “Voltar” para rever o passo anterior.', 'Ligue “Ouvir” se preferir que o sistema leia em voz alta.'] },
      { alvo: '#lgv33-area-btn', titulo: 'Seu painel', texto: 'Mostra o painel em que você está. Cada usuário trabalha nos painéis do seu cargo: os outros aparecem com cadeado e não abrem.', como: ['Se você tem mais de um painel, clique aqui para trocar.', 'Precisa de outro acesso? Peça à Procuradoria.'], se: () => areasOk().length > 1 },
      { alvo: '#lgv33-area-btn', titulo: 'Seu painel', texto: 'Mostra o painel do seu cargo. Os outros painéis aparecem com cadeado e não abrem para o seu usuário.', se: () => areasOk().length <= 1 },
      { alvo: 'nav.lgv31-nav', menu: true, titulo: 'Menu do painel', texto: 'Todas as funções do painel em que você está, organizadas por assunto. A função aberta fica destacada.' },
      { alvo: '.lg28-search', titulo: 'Buscar no sistema', texto: 'Procure matérias, documentos e pessoas digitando uma palavra ou número.', como: ['Atalho no teclado: Ctrl + K.'] },
      { alvo: '#lgv31-tools button[onclick*="notifications"]', titulo: 'Avisos', texto: 'Notificações de prazos, despachos, assinaturas pendentes e mensagens. O número mostra quantos avisos ainda não foram lidos.' },
      { alvo: '#lgv31-look', titulo: 'Aparência', texto: 'Deixe o sistema do seu jeito: visual Moderno ou Simples e texto maior para ler melhor. A escolha fica salva neste aparelho.' },
      { alvo: '#lgv35-site', titulo: 'Abrir o site', texto: 'Abre o site da Câmara em uma nova aba, sem sair do sistema. Útil para conferir o que foi publicado.' },
      { alvo: '#lgv32-me', titulo: 'Seu usuário', texto: 'Mostra quem está conectado. Por aqui você troca de painel e sai do sistema.', como: ['Ao terminar, clique em Sair — principalmente em computador compartilhado.'] },
      { alvo: M('treinamento'), menu: true, titulo: 'Ajuda e treinamento', texto: 'Volte aqui quando quiser: rever um treinamento, fazer o de outro painel ou consultar o que cada função faz.' },
    ] },

    { id: 'vereador', titulo: 'Portal do Vereador', icone: 'vereador', area: 'vereador', desc: 'Criar e assinar proposituras, acompanhar a tramitação e a pauta das sessões.', para: () => areasOk().includes('vereador'), passos: [
      { abrir: 'verInicio', alvo: ['#view-lgvr-inicio .lgvr-hero', '#view-lgvr-inicio'], titulo: 'Seu gabinete', texto: 'Resumo do seu dia: suas proposituras, o que aguarda sua assinatura e a próxima sessão. Clique nos números para ir direto ao assunto.' },
      { abrir: 'verInicio', alvo: '#view-lgvr-inicio button[onclick="lgvrNova()"]', titulo: 'Nova propositura', texto: 'Comece aqui um Projeto de Lei, Projeto de Resolução, Decreto Legislativo, Indicação, Requerimento ou Moção.', como: ['Escolha o tipo.', 'Escreva a ementa (resumo) e o texto.', 'Convide coautores, se houver.', 'Salve como rascunho ou assine e protocole.'] },
      { abrir: 'verProposituras', alvo: ['#view-lgvr-proposituras .lgf-abas', '#view-lgvr-proposituras'], titulo: 'Minhas proposituras', texto: 'Separadas em “Em tramitação”, “Rascunhos” e “Encerradas”. Clique em uma para ver onde ela está e todo o histórico.' },
      { abrir: 'verAssinar', alvo: ['#view-lgvr-assinar', M('verAssinar')], titulo: 'Para assinar', texto: 'Tudo o que espera a sua assinatura: suas proposituras, coautorias e, para o Presidente, autógrafos e atos.', como: ['Baixe o PDF gerado pelo sistema.', 'Assine no gov.br (assinador.iti.br) ou com certificado digital.', 'Devolva o arquivo assinado: o sistema confere o documento e o nome.'] },
      { alvo: M('verComissoes'), menu: true, titulo: 'Minhas comissões', texto: 'Se você faz parte de uma comissão permanente, aqui ficam as matérias para designar relator, dar parecer ou votar. Tem um treinamento só disso.' },
      { abrir: 'verSessoes', alvo: '#view-lgvr-sessoes', titulo: 'Sessões e pauta', texto: 'Próximas sessões, a Ordem do Dia (o que vai a votação) e o que ainda está em comissão ou na Procuradoria.' },
      { abrir: 'verMaterias', alvo: ['#view-lgvr-materias .lgt-tabela', '#view-lgvr-materias'], titulo: 'Acompanhar matérias', texto: 'Todas as matérias da Câmara, de qualquer autor, com a situação atual. Use para se preparar para as sessões.' },
      { alvo: M('leis'), menu: true, titulo: 'Consultas', texto: 'Legislação municipal, site da Câmara e webmail abrem em uma nova aba, sem sair do sistema.' },
    ] },

    { id: 'comissoes', titulo: 'Comissões e pareceres', icone: 'comissoes', area: 'vereador', desc: 'Designar relator, emitir parecer (favorável, com emenda, contrário ou diligência) e votar na comissão.', para: () => areasOk().includes('vereador'), passos: [
      { abrir: 'verComissoes', alvo: ['#view-lgvr-comissoes .lgcm-minhas', '#view-lgvr-comissoes'], titulo: 'Suas comissões', texto: 'Aparecem só as comissões de que você faz parte e o seu cargo (Presidente, Vice-Presidente ou Relator). Quem define é a Procuradoria.' },
      { abrir: 'verComissoes', alvo: ['#view-lgvr-comissoes .lgf-abas', '#view-lgvr-comissoes'], titulo: 'O que é com você', texto: '“Para você agir” mostra só o que depende de você agora. “Na comissão” mostra tudo o que está lá; “Pareceres concluídos”, o que já saiu.' },
      { abrir: 'verComissoes', alvo: '#view-lgvr-comissoes', titulo: '1. Presidente da comissão: designa o relator', texto: 'Quando uma matéria chega, o presidente da comissão escolhe quem vai estudá-la. O sistema já sugere o Relator da comissão.', como: ['Botão “Designar relator”.', 'Escolha o membro e o prazo para o parecer.'] },
      { abrir: 'verComissoes', alvo: '#view-lgvr-comissoes', titulo: '2. Relator: elabora o parecer', texto: 'O relator estuda a matéria e conclui: favorável, favorável com emenda, contrário ou pedido de diligência (quando faltam informações).', como: ['Botão “Elaborar parecer”.', 'Escreva o relatório e o voto; se for com emenda, o texto da emenda.', 'Assine: o parecer vai para os outros membros.'] },
      { abrir: 'verComissoes', alvo: '#view-lgvr-comissoes', titulo: '3. Membros: votam o parecer', texto: 'Cada membro vota “Acompanho o relator” ou “Contrário”. Com a maioria, o parecer é aprovado. Se a maioria rejeitar, o presidente da comissão designa um relator para o voto vencedor.' },
      { abrir: 'verComissoes', alvo: '#view-lgvr-comissoes', titulo: 'Depois da comissão', texto: 'A matéria segue sozinha para a próxima comissão ou, concluídas todas, para o Plenário. O parecer orienta, mas quem decide é o Plenário. Tudo aparece no site, em Proposituras.' },
    ] },

    { id: 'presidencia', titulo: 'Presidência da Câmara', icone: 'despacho', area: 'vereador', desc: 'Despachar, conduzir a votação, assinar autógrafos, registrar sanção ou veto e promulgar.', para: () => areasOk().includes('vereador') && ehPres(), passos: [
      { abrir: 'presDespacho', alvo: '#view-lgvr-despacho', titulo: 'Despachar proposições', texto: 'Toda proposição protocolada passa pelo Presidente, que decide o caminho.', como: ['Procuradoria (parecer jurídico) e depois as comissões.', 'Marque as comissões: Justiça e Redação é obrigatória; Finanças quando houver despesa; Assuntos Gerais conforme o tema.', 'Indicações, requerimentos e moções podem ir direto à Ordem do Dia.', 'Ou devolva ao autor, com o motivo.'] },
      { abrir: 'presPauta', alvo: '#view-lgvr-pauta', titulo: 'Ordem do Dia e votação', texto: 'As matérias prontas para votar. Depois da votação em plenário, registre o resultado.', como: ['Botão “Registrar votação”: informe os votos.', 'O Presidente vota para desempatar e quando o quórum exigir.', '“Retirar de pauta” devolve a matéria.'] },
      { abrir: 'presPauta', alvo: '#view-lgvr-pauta', titulo: 'Apreciação de veto', texto: 'Quando o Prefeito veta, o veto entra na Ordem do Dia. Para derrubar o veto é preciso a maioria absoluta dos vereadores; derrubado, a lei vai à promulgação.' },
      { abrir: 'presAutografos', alvo: '#view-lgvr-autografos', titulo: 'Autógrafos, sanção e veto', texto: 'Projeto de lei aprovado: o Presidente assina o autógrafo e o envia ao Prefeito.', como: ['“Sancionada”: registre o número da lei, a publicação e a vigência.', '“Vetada”: registre o veto e as razões.', '“Promulgar”: sanção tácita ou veto rejeitado.', 'Resoluções e decretos legislativos: o Presidente promulga.'] },
      { abrir: 'presAtos', alvo: ['#view-lgvr-atos button[onclick="lgvrNovoAto()"]', '#view-lgvr-atos'], titulo: 'Atos da Presidência', texto: 'Portarias e atos do Presidente, numerados pelo sistema. Atos do chefe do Poder exigem assinatura com certificado ICP-Brasil (pode ser em nuvem).' },
    ] },

    { id: 'administrativo', titulo: 'Painel Administrativo', icone: 'materias', area: 'legislativo', desc: 'Matérias, comissões, sessões, expedientes, protocolo, documentos e comunicação.', para: () => areasOk().includes('legislativo'), passos: [
      { abrir: 'inicio', alvo: ['#view-lgv14-inicio button[onclick="lgv9Open()"]', '#view-lgv14-inicio'], titulo: 'Atalhos do dia a dia', texto: 'Na tela inicial ficam os atalhos mais usados: protocolar matéria, novo expediente, consultar matérias, comissões, agenda e mensagens.' },
      { abrir: 'materias', alvo: ['#cam-materias-docket', '#view-cam-materias'], titulo: 'Matérias', texto: 'Todas as matérias em tramitação. Use os filtros por situação (Procuradoria, em comissão, em votação, aguardando o Executivo, concluídas) e clique para ver o detalhe.', como: ['Na Procuradoria: registre o parecer jurídico e a matéria segue para a comissão.'] },
      { abrir: 'comissoes', alvo: ['#comissoes-grid', '#view-cam-comissoes'], titulo: 'Comissões', texto: 'As três comissões permanentes, com seus membros e as matérias em cada uma. Esta tela só acompanha: o parecer é dado pelo relator no Portal do Vereador.' },
      { alvo: M('sessoes'), menu: true, titulo: 'Sessões e agenda', texto: 'Calendário de sessões, audiências e reuniões, com a pauta de cada sessão.' },
      { abrir: 'expedientes', alvo: ['#view-expedientes .btn-primary', '#view-expedientes'], titulo: 'Expedientes', texto: 'Ofícios, comunicações internas e correspondências com a Prefeitura e outros órgãos, com número e acompanhamento.' },
      { alvo: M('protocolo'), menu: true, titulo: 'Protocolo e numeração', texto: 'Protocola documentos que chegam à Câmara e controla a numeração oficial de cada tipo.' },
      { alvo: M('editor'), menu: true, titulo: 'Editor de documentos', texto: 'Escreva ofícios, pareceres e atos a partir de modelos, já com o cabeçalho da Câmara.' },
      { alvo: M('mensagens'), menu: true, titulo: 'Mensagens e notificações', texto: 'Comunicação interna entre setores e os avisos do sistema, tudo registrado.' },
      { alvo: M('usuariosProto'), menu: true, titulo: 'Usuários (protocolo)', texto: 'Consulta de quem é quem (nome, cargo e setor) para encaminhar protocolos e expedientes. Criar ou alterar usuários é com a Procuradoria.', se: () => perfil() === 'secretaria' },
      { alvo: M('ia'), menu: true, titulo: 'LegislaIA', texto: 'Assistente para tirar dúvidas de procedimento e ajudar a redigir documentos. Sempre confira o resultado antes de usar.' },
    ] },

    { id: 'procuradoria', titulo: 'Procuradoria: vereadores, comissões e acessos', icone: 'usuarios', area: 'legislativo', desc: 'Definir o Presidente, as comissões, os usuários dos vereadores e o que cada pessoa acessa.', para: () => ehGestor(), passos: [
      { abrir: 'usuarios', alvo: ['#lgvr-comp .lgt-tabela', '#lgvr-comp'], titulo: 'Vereadores e Presidente', texto: 'A lista dos vereadores da legislatura. Marque quem é o Presidente da Câmara; para trocar, marque outro e salve. O sistema pede confirmação e guarda o histórico.', como: ['As funções da Presidência passam na hora para o novo Presidente.'] },
      { abrir: 'usuarios', alvo: ['#lgvr-comp button[onclick*="lgvrCriarTodos"]', '#lgvr-comp'], titulo: 'Usuários dos vereadores', texto: 'Crie o acesso de cada vereador. Ele recebe uma senha provisória e já entra direto no Portal do Vereador.' },
      { abrir: 'usuarios', alvo: ['#lgcm-comp', '#view-usuarios'], titulo: 'Comissões permanentes', texto: 'Defina Presidente, Vice-Presidente e Relator de cada comissão. Cada vereador só vê e só age nas comissões em que estiver aqui.', como: ['Após a eleição das comissões, atualize e clique em “Salvar comissões”.'] },
      { abrir: 'acessos', alvo: ['#view-lgt-acessos .lgt-perfil', '#view-lgt-acessos'], titulo: 'Perfil de cada pessoa', texto: 'O perfil (cargo) define os painéis: Procurador e Secretaria → Administrativo; Financeiro → Financeiro e Transparência; Vereador → Portal do Vereador. Ao trocar o perfil, os painéis se ajustam sozinhos.' },
      { abrir: 'acessos', alvo: ['#view-lgt-acessos .lgt-acessos', '#view-lgt-acessos'], titulo: 'Exceções por painel', texto: 'Quando precisar, libere um painel além do perfil: sem acesso, somente consulta ou edição. Exceções ficam marcadas em dourado (ex.: quem cuida do site).', como: ['Libere só o necessário para o trabalho de cada um.', 'Quando alguém sair da Câmara, retire os acessos no mesmo dia.'] },
    ] },

    { id: 'transparencia', titulo: 'Portal da Transparência', icone: 'transp', area: 'transparencia', desc: 'Publicar documentos por seção, com pré-visualização antes de publicar.', para: () => areasOk().includes('transparencia'), passos: [
      { abrir: 'transp', alvo: ['#view-lgt-transp button[onclick="lgtForm()"]', '#view-lgt-transp'], titulo: 'Nova publicação', texto: 'Publique documentos no Portal da Transparência.', como: ['Escolha a seção e o tipo (por exemplo: Licitações › Contratos).', 'Preencha título, data e, se houver, valor e fornecedor.', 'Anexe o PDF.', 'Clique em “Pré-visualizar” para ver como vai ficar no site.', 'Se estiver certo, publique: aparece no site na hora.'] },
      { abrir: 'transp', alvo: ['#view-lgt-transp .lgt-tabela', '#view-lgt-transp'], titulo: 'Publicações', texto: 'Tudo o que já foi publicado, para conferir, corrigir ou retirar do ar. O Financeiro também publica aqui sozinho os contratos e empenhos.' },
      { abrir: 'transp', alvo: ['#view-lgt-transp a.lgt-btn', '#view-lgt-transp'], titulo: 'Ver no site', texto: 'Abre o Portal da Transparência como o cidadão vê. Confira sempre depois de publicar.' },
    ] },

    { id: 'financeiro', titulo: 'Painel Financeiro', icone: 'moeda', area: 'financeiro', desc: 'Dotações, empenhos, liquidação e pagamento em ordem cronológica, contratos e credores.', para: () => areasOk().includes('financeiro'), passos: [
      { abrir: 'finGeral', alvo: '#view-lgf-geral', titulo: 'Visão geral', texto: 'Saldos do orçamento, o que vence nos próximos dias e alertas de contratos e pagamentos.' },
      { abrir: 'finDotacoes', alvo: ['#view-lgf-dotacoes button[onclick="lgfFormDotacao()"]', '#view-lgf-dotacoes'], titulo: 'Dotações', texto: 'O orçamento da Câmara por dotação (LOA e créditos adicionais). Todo empenho consome saldo de uma dotação.' },
      { abrir: 'finEmpenhos', alvo: ['#view-lgf-empenhos button[onclick="lgfFormEmpenho()"]', '#view-lgf-empenhos'], titulo: 'Empenhos', texto: 'Reserve o valor antes de contratar ou comprar (Lei 4.320/64). O sistema numera e imprime a Nota de Empenho com o valor por extenso.' },
      { abrir: 'finPagamentos', alvo: ['#view-lgf-pagamentos .lgf-abas', '#view-lgf-pagamentos'], titulo: 'Liquidação e pagamento', texto: 'Liquide quando o serviço ou material for entregue e atestado. Pague respeitando a ordem cronológica (Lei 14.133, art. 141).' },
      { abrir: 'finContratos', alvo: ['#view-lgf-contratos button[onclick="lgfFormContrato()"]', '#view-lgf-contratos'], titulo: 'Contratos', texto: 'Contratos com vigência, aditivos e fiscal designado. O sistema avisa antes de vencer e publica na Transparência, em Licitações.' },
      { abrir: 'finCredores', alvo: ['#view-lgf-credores button[onclick="lgfFormCredor()"]', '#view-lgf-credores'], titulo: 'Credores', texto: 'Cadastro de fornecedores e prestadores, com CNPJ/CPF e contato, usado nos empenhos e contratos.' },
      { abrir: 'finMaterias', alvo: ['#view-lgvr-materias .lgt-tabela', '#view-lgvr-materias'], titulo: 'Acompanhar matérias', texto: 'Consulte os projetos e o andamento de cada matéria da Câmara, sem sair do Financeiro. Somente leitura.' },
      { abrir: 'finParametros', alvo: ['#view-lgf-parametros button[onclick="lgfBackup()"]', '#view-lgf-parametros'], titulo: 'Parâmetros e cópia de segurança', texto: 'Dados do órgão e do ordenador de despesa. Baixe uma cópia dos dados com frequência.' },
    ] },
    { id: 'site', titulo: 'Publicação de matérias (site)', icone: 'site', area: 'site', desc: 'Publicar matérias com fotos, trocar fotos da capa, atualizar vereadores e Mesa e editar os menus do site.', para: () => areasOk().includes('site'), passos: [
      { abrir: 'siteNoticias', alvo: ['#view-lgt-noticias button[onclick="lgtFormNoticia()"]', '#view-lgt-noticias'], titulo: 'Nova matéria', texto: 'Escreva as matérias que aparecem no início do site e em Notícias.', como: ['Título, categoria, resumo e texto.', 'Foto de capa e, se quiser, uma galeria de fotos.', 'Marque “Destaque” para entrar no carrossel da capa.', 'Clique em “Pré-visualizar” para ver como vai ficar e depois publique.'] },
      { abrir: 'siteFotos', alvo: ['#view-lgsc-fotos .lgsc-dest', '#view-lgsc-fotos'], titulo: 'Destaques da capa', texto: 'As fotos grandes que passam na página inicial. Troque a foto, o título e o botão; mude a ordem, oculte ou crie um novo destaque.' },
      { abrir: 'siteFotos', alvo: ['#view-lgsc-fotos .lgsc-fixas', '#view-lgsc-fotos'], titulo: 'Imagens fixas', texto: 'Brasão e bandeira usados no site. Dá para trocar e voltar à original.' },
      { abrir: 'siteVereadores', alvo: ['#view-lgsc-vereadores .lgsc-vgrade', '#view-lgsc-vereadores'], titulo: 'Vereadores', texto: 'Troque a foto, o nome, o partido e o contato de cada vereador. Quando alguém sair (licença, renúncia ou fim dos 4 anos), use “Tirar do mandato” e cadastre o novo.' },
      { abrir: 'siteVereadores', alvo: ['#lgsc-mesa', '#view-lgsc-vereadores'], titulo: 'Mesa Diretora', texto: 'Escolha quem é Presidente, Vice e Secretários. O site mostra os cargos na página dos vereadores.' },
      { abrir: 'siteMenus', alvo: ['#view-lgsc-menus .lgsc-menus', '#view-lgsc-menus'], titulo: 'Menus do site', texto: 'Mude os textos, os links e a ordem do menu do site, oculte itens ou crie novos. Dá para restaurar o menu original.' },
      { abrir: 'siteConfig', alvo: ['#view-lgsc-config .lgt-card', '#view-lgsc-config'], titulo: 'Responsáveis pelo site', texto: 'Quem pode publicar e alterar o site. O administrador ou a Procuradoria define.' },
    ] },
  ];
  const passosDe = t => t.passos.filter(s => { try { return !s.se || s.se(); } catch (e) { return false; } });

  /* ================= O QUE CADA FUNÇÃO FAZ ================= */
  const FUNCOES = {
    inicio: 'Tela inicial do Administrativo com atalhos, últimas matérias e agenda.',
    materias: 'Lista de matérias com filtros por situação; abre o detalhe e o histórico.',
    sessoes: 'Calendário de sessões e reuniões, com pauta.',
    comissoes: 'Acompanha as comissões permanentes e as matérias em cada uma.',
    expedientes: 'Ofícios e comunicações internas e externas, numerados.',
    protocolo: 'Protocolo de documentos e controle da numeração oficial.',
    editor: 'Editor de documentos com modelos e cabeçalho da Câmara.',
    mensagens: 'Mensagens internas entre setores.',
    avisos: 'Notificações do sistema: prazos, despachos e pendências.',
    webmail: 'Abre o e-mail institucional em nova aba.',
    leis: 'Abre a legislação municipal em nova aba.',
    site: 'Abre o site da Câmara em nova aba.',
    ia: 'Assistente LegislaIA para dúvidas e rascunhos.',
    admin: 'Configurações gerais do sistema (administrador).',
    usuarios: 'Vereadores, Presidente da Câmara, usuários e comissões (Procuradoria).',
    acessos: 'Define quem acessa cada painel e com que nível (Procuradoria).',
    transp: 'Publicações do Portal da Transparência por seção.',
    verTransp: 'Abre o Portal da Transparência público.',
    usuariosProto: 'Secretaria: consulta de usuários para encaminhar protocolos.',
    finMaterias: 'Consulta dos projetos e do andamento das matérias.',
    siteNoticias: 'Matérias e notícias do site, com galeria e pré-visualização.',
    siteFotos: 'Fotos e destaques da capa do site; brasão e bandeira.',
    siteVereadores: 'Fotos, nomes, partido e contato dos vereadores; Mesa Diretora.',
    siteMenus: 'Textos, links e ordem dos menus do site.',
    siteConfig: 'Responsáveis pelo site, webmail e YouTube.',
    verInicio: 'Resumo do gabinete: proposituras, assinaturas e próxima sessão.',
    verProposituras: 'Criar, acompanhar e retirar suas proposituras.',
    verAssinar: 'Documentos que esperam a sua assinatura digital.',
    verComissoes: 'Suas comissões: designar relator, dar parecer e votar.',
    verSessoes: 'Próximas sessões e Ordem do Dia.',
    verMaterias: 'Todas as matérias da Câmara com a situação atual.',
    presDespacho: 'Presidente: encaminha à Procuradoria, às comissões ou à pauta.',
    presPauta: 'Presidente: registra votações e aprecia vetos.',
    presAutografos: 'Presidente: autógrafos, sanção, veto e promulgação.',
    presAtos: 'Presidente: portarias e atos da Presidência.',
    finGeral: 'Saldos, vencimentos e alertas do Financeiro.',
    finDotacoes: 'Orçamento por dotação e créditos adicionais.',
    finEmpenhos: 'Empenhos e impressão da Nota de Empenho.',
    finPagamentos: 'Liquidação e pagamento em ordem cronológica.',
    finContratos: 'Contratos, aditivos, fiscais e vencimentos.',
    finCredores: 'Cadastro de credores.',
    finParametros: 'Dados do órgão, ordenador e cópia de segurança.',
    treinamento: 'Esta central: treinamentos e ajuda.',
  };
  const FAQ = [
    ['Esqueci minha senha. O que faço?', 'Peça à Procuradoria ou ao administrador para redefinir. Ninguém da Câmara pede sua senha por telefone ou e-mail.'],
    ['Como assino um documento?', 'Em “Para assinar”, baixe o PDF, assine no gov.br (assinador.iti.br) ou com certificado digital e devolva o arquivo. O sistema confere sozinho.'],
    ['Por que não vejo um painel ou um botão?', 'Cada usuário vê só o que foi liberado para o seu trabalho. Se precisar de mais acesso, peça à Procuradoria.'],
    ['Quem decide a tramitação de uma matéria?', 'O Presidente despacha; as comissões dão parecer; o Plenário vota; o Prefeito sanciona ou veta. O andamento aparece no site, em Proposituras.'],
  ];

  /* ================= CENTRAL ================= */
  function trilhasPara() { return TRILHAS.filter(t => { try { return t.para(); } catch (e) { return false; } }); }
  function progresso(t) { const r = (meu().trilhas || {})[t.id] || {}; const total = passosDe(t).length; const vistos = (r.vistos || []).filter(i => i < total).length; return { vistos, total, concluida: r.concluida, parou: r.parou || 0 }; }

  function criarTela() {
    const main = document.querySelector('#app main') || document.querySelector('main'); if (!main || $('#view-lgtr')) return;
    main.insertAdjacentHTML('beforeend', '<section class="view lgt lgtr" id="view-lgtr" style="display:none"></section>');
    const antigo = document.querySelector('aside.sidebar nav.primary-nav') || document.querySelector('aside.sidebar');
    if (antigo) { const b = document.createElement('button'); b.className = 'nav-item'; b.dataset.nav = 'lgtr'; b.hidden = true; b.style.display = 'none'; antigo.appendChild(b); }
  }
  let busca = '';
  window.lgtrAbrir = function () { criarTela(); gotoShared('lgtr'); if (window.lgv31Mark) lgv31Mark('treinamento'); desenhar(); scrollTo(0, 0); };
  function ic(n) { return window.lgv31Icon ? lgv31Icon(n) : ''; }

  function desenhar() {
    const el = $('#view-lgtr'); if (!el) return;
    const ts = trilhasPara(); const feitas = ts.filter(t => progresso(t).concluida).length; const u = usuario() || {};
    const pct = ts.length ? Math.round(feitas / ts.length * 100) : 0;
    el.innerHTML = `<div class="letterhead"><div><h1>Ajuda e treinamento</h1><div class="date">Aprenda o sistema na prática: ele mostra cada parte da tela e você confirma com “OK, entendi”.</div></div></div>
      <div class="lgtr-topo">
        <div class="lgtr-anel" style="--p:${pct}"><b>${pct}%</b></div>
        <div><h2>Olá, ${esc((u.nome || u.usuario || '').split(' ')[0] || 'tudo bem')}!</h2><p>Você concluiu <b>${feitas} de ${ts.length}</b> treinamentos indicados para o seu usuário.${feitas < ts.length ? ' Que tal continuar agora?' : ' Parabéns, você concluiu todos!'}</p></div>
        ${feitas < ts.length ? `<button class="lgt-btn primario lgtr-play-grande" type="button" onclick="lgtrIniciar('${(ts.find(t => !progresso(t).concluida) || ts[0]).id}')">▶ ${progresso(ts.find(t => !progresso(t).concluida) || ts[0]).vistos ? 'Continuar' : 'Começar'} treinamento</button>` : ''}
      </div>
      <h3 class="lgtr-h">Treinamentos para você</h3>
      <div class="lgtr-trilhas">${ts.map(t => { const p = progresso(t); const pc = Math.round(p.vistos / p.total * 100);
        return `<article class="lgtr-card${p.concluida ? ' feito' : ''}"><div class="lgtr-card-ic">${ic(t.icone)}</div>
          <div class="lgtr-card-tx"><h4>${esc(t.titulo)}</h4><p>${esc(t.desc)}</p>
          <div class="lgtr-barra" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso"><i style="width:${pc}%"></i></div>
          <small>${p.concluida ? `✓ Concluído em ${new Date(p.concluida).toLocaleDateString('pt-BR')}` : `${p.vistos} de ${p.total} passos · cerca de ${Math.max(1, Math.round(p.total * 0.4))} min`}</small></div>
          <button class="lgt-btn ${p.concluida ? '' : 'primario'}" type="button" onclick="lgtrIniciar('${t.id}')">${p.concluida ? '↺ Rever' : p.vistos ? '▶ Continuar' : '▶ Começar'}</button></article>`; }).join('')}</div>
      <h3 class="lgtr-h">O que cada função faz</h3>
      <label class="lgtr-busca"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="lgtr-sr">Pesquisar função</span><input id="lgtr-q" type="search" placeholder="Pesquisar função (ex.: empenho, parecer, assinar)" value="${esc(busca)}"></label>
      <div id="lgtr-funcoes"></div>
      <h3 class="lgtr-h">Dúvidas frequentes</h3>
      <div class="lgtr-faq">${FAQ.map(([q, r]) => `<details><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}</div>`;
    $('#lgtr-q').oninput = e => { busca = e.target.value; funcoes(); };
    funcoes();
  }
  function funcoes() {
    const box = $('#lgtr-funcoes'); if (!box || !window.LG_AREAS) return;
    const q = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const vistos = new Set();
    const html = areasOk().map(ak => { const A = LG_AREAS[ak]; if (!A) return '';
      const itens = A.menu.flatMap(([g, it]) => it.map(i => ({ g, key: i[0], nome: i[1], icone: i[2], flag: i[4] || '' })))
        .filter(i => i.key !== 'treinamento' && (i.flag !== 'pres' || ehPres()) && (i.flag !== 'gestor' || ehGestor()) && (i.flag !== 'admin' || ehAdm()) && (i.flag !== 'secretaria' || perfil() === 'secretaria'))
        .filter(i => !q || norm(i.nome + ' ' + (FUNCOES[i.key] || '') + ' ' + i.g).includes(q));
      if (!itens.length) return '';
      return `<details class="lgtr-area" ${q || ak === areaAtual() ? 'open' : ''}><summary>${ic(A.icone)} ${esc(A.nome === 'Administrativo' ? 'Painel Administrativo' : A.nome)} <small>${itens.length} funções</small></summary>
        <ul>${itens.map(i => `<li><span class="lgtr-f-ic">${ic(i.icone)}</span><div><b>${esc(i.nome)}</b><span>${esc(FUNCOES[i.key] || i.g)}</span></div>${i.flag.startsWith('ext:') ? '<em>abre em nova aba</em>' : `<button type="button" class="lgt-mini" onclick="lgtrMostrar('${ak}','${i.key}')">Mostrar onde fica</button>`}</li>`).join('')}</ul></details>`; }).join('');
    box.innerHTML = html || '<p class="lgt-p">Nenhuma função encontrada.</p>';
  }

  /* ================= TOUR ================= */
  let T = null; // { trilha, i, unico }
  let narrar = (() => { try { return localStorage.getItem('lgtr_voz') === '1'; } catch (e) { return false; } })();

  function montarOverlay() {
    if ($('#lgtr-tour')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="lgtr-tour" hidden><div class="lgtr-bloq"></div><div class="lgtr-luz"></div>
      <section class="lgtr-balao" role="dialog" aria-modal="true" aria-labelledby="lgtr-t" aria-describedby="lgtr-x">
        <header><span id="lgtr-trilha"></span><button type="button" class="lgtr-fechar" onclick="lgtrSair()" aria-label="Sair do treinamento">×</button></header>
        <div class="lgtr-prog"><i id="lgtr-pbar"></i></div><p class="lgtr-passo" id="lgtr-passo"></p>
        <h3 id="lgtr-t" tabindex="-1"></h3><p id="lgtr-x"></p><ol id="lgtr-como"></ol>
        <footer><button type="button" class="lgtr-b" id="lgtr-volta" onclick="lgtrVoltar()">← Voltar</button><button type="button" class="lgtr-b" id="lgtr-voz" onclick="lgtrVoz()" aria-pressed="false">🔈 Ouvir</button><span class="lgtr-esp"></span><button type="button" class="lgtr-b lgtr-ok" id="lgtr-ok" onclick="lgtrOk()">OK, entendi →</button></footer>
      </section></div>`);
    addEventListener('resize', () => T && posicionar());
    addEventListener('scroll', () => T && posicionar(), true);
    document.addEventListener('keydown', e => { if (!T) return; if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); lgtrSair(); } else if (e.key === 'Enter' && !e.target.closest('textarea')) { e.preventDefault(); lgtrOk(); } else if (e.key === 'ArrowLeft') lgtrVoltar(); }, true);
  }

  window.lgtrIniciar = function (id, desde) {
    const t = TRILHAS.find(x => x.id === id); if (!t) return;
    const p = progresso(t); montarOverlay();
    const ps = passosDe(t); T = { trilha: { ...t, passos: ps }, i: desde != null ? desde : (p.concluida ? 0 : Math.min(p.parou || 0, ps.length - 1)), unico: false };
    if (window.lgtFechar) try { lgtFechar(); } catch (e) { }
    $('#lgtr-tour').hidden = false; document.documentElement.classList.add('lgtr-ativo');
    mostrar();
  };
  window.lgtrMostrar = function (area, key) {
    const A = window.LG_AREAS && LG_AREAS[area]; if (!A) return; const it = A.menu.flatMap(([, i]) => i).find(i => i[0] === key); if (!it) return;
    montarOverlay();
    T = { trilha: { id: '_unico', titulo: 'Onde fica', area, passos: [{ area, alvo: M(key), menu: true, titulo: it[1], texto: FUNCOES[key] || '', como: ['Clique neste item do menu para abrir a função.'] }] }, i: 0, unico: true };
    $('#lgtr-tour').hidden = false; document.documentElement.classList.add('lgtr-ativo'); mostrar();
  };

  const espera = ms => new Promise(r => setTimeout(r, ms));
  function visivel(el) { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function acharAlvo(s) { for (const sel of [].concat(s.alvo || [])) { const el = document.querySelector(sel); if (visivel(el) || (el && s.menu)) return el; } return null; }
  const estreito = () => innerWidth < 900;

  let alvoEl = null, seq = 0;
  async function mostrar() {
    const my = ++seq; const t = T.trilha, s = t.passos[T.i];
    const area = s.area || t.area;
    if (area && area !== areaAtual() && areasOk().includes(area) && window.lgv33TrocarArea) { lgv33TrocarArea(area); await espera(450); }
    if (s.abrir && window.lgv31Go) { lgv31Go(s.abrir); await espera(420); }
    if (my !== seq) return;
    const noMenu = !!s.menu || !!(s.alvo && [].concat(s.alvo).some(a => /lgv31-item|lgv31-nav|lgv33-area/.test(a)));
    if (window.lgv31Menu) lgv31Menu(estreito() && noMenu);
    if (estreito() && noMenu) await espera(260);
    alvoEl = acharAlvo(s);
    if (alvoEl) { const r = alvoEl.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - (estreito() ? 300 : 40)) { alvoEl.scrollIntoView({ block: estreito() ? 'start' : 'center' }); if (estreito()) scrollBy(0, -80); await espera(120); } }
    // conteúdo
    $('#lgtr-trilha').textContent = T.unico ? 'Ajuda' : 'Treinamento · ' + t.titulo;
    const n = t.passos.length; $('#lgtr-passo').textContent = T.unico ? '' : `Passo ${T.i + 1} de ${n}`;
    $('#lgtr-pbar').style.width = (T.unico ? 100 : Math.round((T.i + 1) / n * 100)) + '%';
    $('#lgtr-t').textContent = s.titulo; $('#lgtr-x').textContent = s.texto;
    const como = $('#lgtr-como'); como.innerHTML = (s.como || []).map(c => `<li>${esc(c)}</li>`).join(''); como.hidden = !(s.como || []).length;
    $('#lgtr-volta').hidden = T.unico || T.i === 0;
    $('#lgtr-ok').textContent = T.unico ? 'OK, entendi' : T.i === n - 1 ? 'OK, concluir ✓' : 'OK, entendi →';
    $('#lgtr-voz').setAttribute('aria-pressed', narrar); $('#lgtr-voz').textContent = narrar ? '🔊 Ouvindo' : '🔈 Ouvir';
    $('#lgtr-tour').classList.toggle('sem-alvo', !alvoEl);
    posicionar(); $('#lgtr-t').focus({ preventScroll: true });
    if (!T.unico) { const m = meu(); const r = m.trilhas[t.id] = m.trilhas[t.id] || { vistos: [] }; r.parou = T.i; salvarMeu(m); }
    falar();
  }
  function posicionar() {
    const luz = $('.lgtr-luz'), bal = $('.lgtr-balao'); if (!luz || !bal) return;
    const pad = 8;
    if (!alvoEl || !visivel(alvoEl)) { luz.style.cssText = 'display:none'; bal.style.cssText = ''; bal.classList.add('centro'); return; }
    bal.classList.remove('centro');
    let r = alvoEl.getBoundingClientRect();
    const grande = r.height > innerHeight * 0.6; // telas inteiras: destaca só a parte visível
    const top = Math.max(r.top - pad, 4), bottom = Math.min(r.bottom + pad, innerHeight - 4);
    luz.style.cssText = `display:block;left:${Math.max(r.left - pad, 4)}px;top:${top}px;width:${Math.min(r.width + pad * 2, innerWidth - 8)}px;height:${Math.max(bottom - top, 24)}px`;
    if (estreito()) { bal.style.cssText = ''; bal.classList.add('baixo'); return; }
    bal.classList.remove('baixo');
    const bw = bal.offsetWidth || 380, bh = bal.offsetHeight || 260, m = 16;
    let x, y;
    if (r.right + m + bw < innerWidth && !grande) { x = r.right + m; y = r.top; }           // à direita
    else if (r.bottom + m + bh < innerHeight && !grande) { x = r.left; y = r.bottom + m; }   // abaixo
    else if (r.top - m - bh > 0 && !grande) { x = r.left; y = r.top - m - bh; }             // acima
    else { x = innerWidth - bw - 24; y = innerHeight - bh - 24; }                           // canto
    x = Math.min(Math.max(x, 12), innerWidth - bw - 12); y = Math.min(Math.max(y, 12), innerHeight - bh - 12);
    bal.style.cssText = `left:${x}px;top:${y}px`;
  }
  function falar() {
    try { speechSynthesis.cancel(); } catch (e) { return; }
    if (!narrar || !T) return; const s = T.trilha.passos[T.i];
    const u = new SpeechSynthesisUtterance([s.titulo + '.', s.texto, ...(s.como || [])].join(' ')); u.lang = 'pt-BR'; u.rate = 1.02;
    const v = speechSynthesis.getVoices().find(x => /^pt(-|_)BR/i.test(x.lang)); if (v) u.voice = v; speechSynthesis.speak(u);
  }
  window.lgtrVoz = function () { narrar = !narrar; try { localStorage.setItem('lgtr_voz', narrar ? '1' : '0'); } catch (e) { } $('#lgtr-voz').setAttribute('aria-pressed', narrar); $('#lgtr-voz').textContent = narrar ? '🔊 Ouvindo' : '🔈 Ouvir'; falar(); };
  window.lgtrVoltar = function () { if (!T || T.i === 0 || T.unico) return; T.i--; mostrar(); };
  window.lgtrOk = function () {
    if (!T) return; const t = T.trilha;
    if (T.unico) return fechar();
    const m = meu(); const r = m.trilhas[t.id] = m.trilhas[t.id] || { vistos: [] };
    if (!r.vistos.includes(T.i)) r.vistos.push(T.i); r.oks = (r.oks || 0) + 1; r.ultimo = new Date().toISOString();
    if (T.i < t.passos.length - 1) { T.i++; r.parou = T.i; salvarMeu(m); return mostrar(); }
    r.concluida = new Date().toISOString(); r.parou = 0; salvarMeu(m); concluir(t);
  };
  function concluir(t) {
    alvoEl = null; try { speechSynthesis.cancel(); } catch (e) { }
    const prox = trilhasPara().find(x => x.id !== t.id && !progresso(x).concluida);
    t = { ...t, passos: T && T.trilha ? T.trilha.passos : passosDe(t) };
    $('#lgtr-trilha').textContent = 'Treinamento concluído'; $('#lgtr-passo').textContent = ''; $('#lgtr-pbar').style.width = '100%';
    $('#lgtr-t').textContent = `🎉 Você concluiu “${t.titulo}”!`; $('#lgtr-x').textContent = `Você viu e confirmou os ${t.passos.length} passos. ${prox ? `Próximo sugerido: ${prox.titulo}.` : 'Você concluiu todos os treinamentos indicados para você.'}`;
    $('#lgtr-como').hidden = true; $('#lgtr-volta').hidden = true;
    const ok = $('#lgtr-ok'); ok.textContent = prox ? `▶ Fazer “${prox.titulo}”` : 'Fechar'; ok.onclick = () => { ok.onclick = lgtrOk; if (prox) lgtrIniciar(prox.id); else fechar(true); };
    $('#lgtr-tour').classList.add('sem-alvo'); posicionar();
    if (window.lgtUI) try { lgtUI.log('Treinamento', 'Concluiu: ' + t.titulo); } catch (e) { }
  }
  function fechar(voltarCentral) {
    const eraUnico = T && T.unico; T = null; seq++; try { speechSynthesis.cancel(); } catch (e) { }
    $('#lgtr-tour').hidden = true; document.documentElement.classList.remove('lgtr-ativo'); if (window.lgv31Menu) lgv31Menu(false);
    const ok = $('#lgtr-ok'); if (ok) ok.onclick = lgtrOk;
    if (!eraUnico && (voltarCentral || $('#view-lgtr'))) lgtrAbrir();
  }
  window.lgtrSair = () => { if (T && !T.unico && window.lgtUI) try { lgtUI.aviso('Treinamento pausado. Continue quando quiser em Ajuda › Treinamento.'); } catch (e) { } fechar(true); };

  /* ================= CONVITE NO PRIMEIRO ACESSO ================= */
  function convidar(area) {
    const t = trilhasPara().find(x => (x.area || '') === area && !progresso(x).concluida) || (!progresso(TRILHAS[0]).concluida ? TRILHAS[0] : null);
    if (!t) return; const m = meu(); if (m.convites[t.id]) return; m.convites[t.id] = new Date().toISOString(); salvarMeu(m);
    let c = $('#lgtr-convite'); if (c) c.remove();
    document.body.insertAdjacentHTML('beforeend', `<aside id="lgtr-convite" role="dialog" aria-labelledby="lgtr-cv-t"><button type="button" class="lgtr-fechar" aria-label="Fechar" onclick="this.parentNode.remove()">×</button>
      <b id="lgtr-cv-t">Novo por aqui?</b><p>Faça o treinamento “${esc(t.titulo)}”: o sistema mostra cada parte da tela, em ${passosDe(t).length} passos rápidos.</p>
      <div><button type="button" class="lgt-btn primario" onclick="document.getElementById('lgtr-convite').remove();lgtrIniciar('${t.id}')">▶ Começar agora</button><button type="button" class="lgt-btn" onclick="this.closest('aside').remove()">Depois</button></div></aside>`);
  }
  function ganchos() {
    // chamado ao entrar num painel (pela escolha ou direto, quando o usuário só tem um)
    window.lgpAposEntrar = k => setTimeout(() => { const e = $('#lgp-escolha'); if (!e || e.hidden) convidar(k); }, 900);
    // botões de ajuda do topo abrem a central
    document.querySelectorAll('.lg28-help, #lgv31-tools button[title="Ajuda"]').forEach(b => { if (b.__lgtr) return; b.__lgtr = true; b.removeAttribute('onclick'); b.onclick = e => { e.preventDefault(); lgtrAbrir(); }; b.title = 'Ajuda e treinamento'; });
    const orf = window.fazerLogout; if (typeof orf === 'function' && !orf.__lgtr) { const w = function () { if (T) fechar(); const c = $('#lgtr-convite'); if (c) c.remove(); return orf.apply(this, arguments); }; w.__lgtr = true; window.fazerLogout = w; }
  }

  /* ================= ESTILOS ================= */
  const css = document.createElement('style'); css.id = 'lgtr-style'; css.textContent = `
  .lgtr-topo{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:20px 22px;border-radius:16px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel);margin:4px 0 22px}
  .lgtr-topo h2{margin:0 0 4px;font-size:20px}.lgtr-topo p{margin:0;color:var(--lg28-muted)}
  .lgtr-topo>div:nth-child(2){flex:1;min-width:220px}
  .lgtr-anel{--p:0;width:74px;height:74px;border-radius:50%;flex:0 0 74px;display:grid;place-items:center;background:conic-gradient(#e2aa1c calc(var(--p)*1%),rgba(127,127,127,.22) 0)}
  .lgtr-anel b{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:var(--lg28-panel);font-size:17px}
  .lgtr-play-grande{min-height:46px;padding:0 20px;font-size:15px}
  .lgtr-h{margin:26px 0 12px;font-size:16px}
  .lgtr-trilhas{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
  .lgtr-card{display:grid;grid-template-columns:44px 1fr;gap:6px 14px;align-items:start;padding:16px;border-radius:14px;border:1px solid var(--lg28-stroke);background:var(--lg28-panel)}
  .lgtr-card.feito{border-color:rgba(47,191,113,.55)}
  .lgtr-card-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(226,170,28,.16);color:#b8860b}.lgtr-card.feito .lgtr-card-ic{background:rgba(47,191,113,.16);color:#1f9d5a}
  .lgtr-card-ic .lgv31-ic{width:22px;height:22px}
  .lgtr-card h4{margin:0 0 4px;font-size:15.5px}.lgtr-card p{margin:0 0 10px;font-size:13px;color:var(--lg28-muted);line-height:1.45}
  .lgtr-card small{font-size:12px;color:var(--lg28-muted)}.lgtr-card.feito small{color:#1f9d5a;font-weight:600}
  .lgtr-card>.lgt-btn{grid-column:1/-1;justify-self:start;margin-top:4px}
  .lgtr-barra{height:6px;border-radius:6px;background:rgba(127,127,127,.22);overflow:hidden;margin-bottom:6px}.lgtr-barra i{display:block;height:100%;background:#e2aa1c;border-radius:6px}.lgtr-card.feito .lgtr-barra i{background:#2fbf71}
  .lgtr-busca{display:flex;align-items:center;gap:8px;max-width:520px;height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset,transparent);margin-bottom:12px}
  .lgtr-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .lgtr-busca svg{opacity:.7;flex:0 0 18px}
  .lgtr-busca input{flex:1;border:0;background:transparent;color:var(--lg28-ink);font:inherit;font-size:15px;outline:0;min-width:0}.lgtr-busca .lgv31-ic{width:18px;height:18px;opacity:.7}
  .lgtr-area{border:1px solid var(--lg28-stroke);border-radius:12px;background:var(--lg28-panel);margin-bottom:10px}
  .lgtr-area summary{cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 16px;font-weight:700;list-style:none}.lgtr-area summary::-webkit-details-marker{display:none}
  .lgtr-area summary small{margin-left:auto;font-weight:500;color:var(--lg28-muted);font-size:12.5px}.lgtr-area summary .lgv31-ic{width:18px;height:18px}
  .lgtr-area ul{list-style:none;margin:0;padding:0 8px 8px}
  .lgtr-area li{display:flex;align-items:center;gap:12px;padding:9px 8px;border-top:1px solid rgba(127,127,127,.18)}
  .lgtr-area li>div{flex:1;min-width:0}.lgtr-area li b{display:block;font-size:14px}.lgtr-area li span:not(.lgtr-f-ic){display:block;font-size:12.8px;color:var(--lg28-muted);line-height:1.4}
  .lgtr-area li em{font-size:12px;color:var(--lg28-muted);font-style:normal;white-space:nowrap}
  .lgtr-f-ic{width:32px;height:32px;flex:0 0 32px;border-radius:9px;display:grid;place-items:center;background:rgba(127,127,127,.13)}.lgtr-f-ic .lgv31-ic{width:16px;height:16px}
  .lgtr-faq details{border:1px solid var(--lg28-stroke);border-radius:10px;background:var(--lg28-panel);margin-bottom:8px;padding:0 14px}
  .lgtr-faq summary{cursor:pointer;padding:12px 0;font-weight:600}.lgtr-faq p{margin:0 0 12px;color:var(--lg28-muted);line-height:1.5}

  #lgtr-tour{position:fixed;inset:0;z-index:2147483000}
  #lgtr-tour[hidden]{display:none}
  .lgtr-bloq{position:absolute;inset:0;background:transparent}
  #lgtr-tour.sem-alvo .lgtr-bloq{background:rgba(8,10,14,.62)}
  .lgtr-luz{position:fixed;border-radius:12px;box-shadow:0 0 0 3px #e2aa1c,0 0 0 200vmax rgba(8,10,14,.62);pointer-events:none;transition:all .28s ease;animation:lgtrPulso 1.8s ease-in-out infinite}
  @keyframes lgtrPulso{0%,100%{box-shadow:0 0 0 3px #e2aa1c,0 0 0 200vmax rgba(8,10,14,.62)}50%{box-shadow:0 0 0 7px rgba(226,170,28,.55),0 0 0 200vmax rgba(8,10,14,.62)}}
  .lgtr-balao{position:fixed;width:min(400px,calc(100vw - 24px));background:#fff;color:#16181d;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.4);padding:16px 18px 14px;font-family:inherit;transition:left .25s,top .25s}
  .lgtr-balao.centro{left:50%!important;top:50%!important;transform:translate(-50%,-50%)}
  .lgtr-balao header{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a6a10}
  .lgtr-fechar{width:30px;height:30px;border-radius:8px;border:0;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer}
  .lgtr-fechar:hover{background:rgba(0,0,0,.06)}
  .lgtr-prog{height:4px;border-radius:4px;background:#ececef;margin:8px 0 6px;overflow:hidden}.lgtr-prog i{display:block;height:100%;background:#e2aa1c;transition:width .3s}
  .lgtr-passo{margin:0;font-size:12px;color:#6b7280}
  .lgtr-balao h3{margin:4px 0 6px;font-size:19px;line-height:1.25;outline:0;color:#111318}
  .lgtr-balao p#lgtr-x{margin:0 0 8px;font-size:14.5px;line-height:1.5;color:#2b2f36}
  .lgtr-balao ol{margin:4px 0 10px;padding:10px 12px 10px 32px;background:#f6f6f8;border-radius:10px;font-size:13.5px;line-height:1.5;color:#2b2f36}.lgtr-balao ol[hidden]{display:none}
  .lgtr-balao footer{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}.lgtr-esp{flex:1}
  .lgtr-b{min-height:40px;padding:0 14px;border-radius:10px;border:1px solid #d6d7db;background:#fff;color:#16181d;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
  .lgtr-b:hover{background:#f3f3f5}.lgtr-b[hidden]{display:none}
  .lgtr-ok{background:#16181d;border-color:#16181d;color:#fff;padding:0 18px}.lgtr-ok:hover{background:#2a2d33}
  .lgtr-b:focus-visible,.lgtr-fechar:focus-visible{outline:3px solid #e2aa1c;outline-offset:2px}
  html.lgtr-ativo .lgv31-side,html.lgtr-ativo aside.lgv31-side{z-index:auto}
  #lgtr-convite{position:fixed;right:20px;bottom:20px;z-index:2147482000;width:min(360px,calc(100vw - 32px));background:#fff;color:#16181d;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:16px 18px;border-top:4px solid #e2aa1c;animation:lgtrEntra .35s ease}
  #lgtr-convite b{font-size:16px}#lgtr-convite p{margin:6px 0 12px;font-size:14px;line-height:1.45;color:#2b2f36}#lgtr-convite div{display:flex;gap:8px;flex-wrap:wrap}
  #lgtr-convite .lgtr-fechar{position:absolute;right:8px;top:8px}
  #lgtr-convite .lgt-btn{background:#fff;color:#16181d;border:1px solid #d6d7db}#lgtr-convite .lgt-btn.primario{background:#16181d;color:#fff;border-color:#16181d}
  @keyframes lgtrEntra{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}
  @media (max-width:899px){
    .lgtr-balao.baixo,.lgtr-balao.centro{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;transform:none!important;width:auto;max-height:52vh;overflow:auto}
    .lgtr-balao h3{font-size:17px}.lgtr-balao p#lgtr-x{font-size:14px}
    .lgtr-b{flex:1}.lgtr-esp{display:none}.lgtr-ok{flex-basis:100%;order:-1;min-height:46px}
    .lgtr-trilhas{grid-template-columns:1fr}
    .lgtr-area li{flex-wrap:wrap}.lgtr-area li .lgt-mini{margin-left:44px}
    #lgtr-convite{right:12px;bottom:12px}
  }
  @media (prefers-reduced-motion:reduce){.lgtr-luz{animation:none;transition:none}.lgtr-balao{transition:none}}`;
  document.head.appendChild(css);

  function iniciar() { criarTela(); ganchos(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 200)); else setTimeout(iniciar, 200);
  new MutationObserver(() => { if (document.querySelector('.lg28-help:not([data-lgtr]), #lgv31-tools button[title="Ajuda"]')) { document.querySelectorAll('.lg28-help, #lgv31-tools button[title="Ajuda"]').forEach(b => b.setAttribute('data-lgtr', '1')); ganchos(); } }).observe(document.documentElement, { childList: true, subtree: true });
})();
