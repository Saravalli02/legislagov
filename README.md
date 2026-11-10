# Câmara Municipal de Neves Paulista — site + LegislaGov (demonstração)

Site público (`index.html` e páginas) e painel interno LegislaGov (`/painel/`).

**Versão de demonstração:** os dados ficam salvos no navegador de quem está usando
(localStorage). Cada aparelho/navegador tem os seus dados; nada é compartilhado entre
usuários ainda. A próxima fase liga o painel a um banco de dados no servidor.

- Site: `/`
- Painel: `/painel/` (testes: Ricardo / 123456 · Administrador / admin123)
- Publicação: Render (serviço web Python, `python server.py`) a partir deste repositório — ver `render.yaml`.
- Rodar no computador: `python server.py` e abrir http://localhost:8000
- Leia também: `LEIA_PRIMEIRO.txt`.
