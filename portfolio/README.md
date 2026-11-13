# Site portfólio LegislaGov

Site estático (uma página) com apresentação da empresa, soluções, projetos
(imagens com marca d'água em `img/`) e quem somos.

- Publicado no Render como **Static Site** com *Root Directory* = `portfolio`.
- Contatos: editar o objeto `CONTATO` no fim de `index.html`.
- Antes de usar o domínio definitivo: remover `<meta name="robots" content="noindex">` e o `robots.txt`.

## Área do cliente e Atendimento WhatsApp
- Publicação: servidor da Amazon (Lightsail). Os endereços `legislagov.com.br` e `www.legislagov.com.br`
  estão em `ferramentas/aws/dominios.txt` no modo `portfolio`: o `server.py` entrega esta pasta e o
  Caddy cuida do HTTPS. Para testar antes de mudar o domínio: `teste.legislagov.com.br/cliente/`.
- `cliente/` — Área do cliente: login pelo servidor (`/api/login`, mesma tabela de usuários) e instalação.
- `atendimento/` — programa Atendimento WhatsApp (app instalável). No servidor usa `/api/whatsapp/*`
  (`lgwhats.py`); aberto fora dele, mostra a demonstração com dados de exemplo.
- Banco: tabelas `wa_*` no mesmo SQLite do servidor; conversas encerradas guardadas por 5 anos.
