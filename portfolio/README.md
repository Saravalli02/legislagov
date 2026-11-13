# Site portfólio LegislaGov

Site estático (uma página) com apresentação da empresa, soluções, projetos
(imagens com marca d'água em `img/`) e quem somos.

- Publicado no Render como **Static Site** com *Root Directory* = `portfolio`.
- Contatos: editar o objeto `CONTATO` no fim de `index.html`.
- Antes de usar o domínio definitivo: remover `<meta name="robots" content="noindex">` e o `robots.txt`.

## Área do cliente e Atendimento WhatsApp
- `cliente/` — Área do cliente: login (Supabase do LegislaGov) e instalação dos sistemas.
  Enquanto o login oficial não está pronto, `ACESSO_TESTE = true` em `cliente/index.html`
  libera um acesso de teste com dados de exemplo. Trocar para `false` depois de criar o banco.
- `atendimento/` — programa Atendimento WhatsApp (app instalável pelo navegador; protótipo com dados de exemplo).
- Banco: `ferramentas/zapgov/zapgov.sql` (esquema separado `zapgov`; não altera as tabelas da Câmara).
