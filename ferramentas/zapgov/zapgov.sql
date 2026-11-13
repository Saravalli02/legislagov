-- =====================================================================
-- LegislaGov · Atendimento WhatsApp — banco de dados
-- Rodar UMA VEZ no Supabase: SQL Editor › New query › colar › Run.
--
-- Tudo fica no esquema separado "zapgov". Nenhuma tabela do LegislaGov
-- (Câmara/Executivo) é criada, alterada ou apagada por este script.
-- Os logins usam o mesmo cadastro de contas (auth.users): a mesma pessoa
-- pode ter acesso ao LegislaGov, ao Atendimento, ou aos dois.
-- =====================================================================

create schema if not exists zapgov;

-- ---------- Quem pode usar o Atendimento ----------
create table if not exists zapgov.usuarios (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  perfil      text not null check (perfil in ('admin','supervisor','atendente')),
  municipio   text not null default 'Neves Paulista — SP',
  ativo       boolean not null default true,
  troca_senha boolean not null default true,      -- obriga trocar a senha no 1º acesso
  criado_em   timestamptz not null default now()
);

-- ---------- Contribuintes que falaram pelo WhatsApp ----------
create table if not exists zapgov.contribuintes (
  id          bigserial primary key,
  municipio   text not null default 'Neves Paulista — SP',
  telefone    text not null,                       -- formato E.164: 5517991234567
  nome        text,
  documento   text,                                -- CPF/CNPJ
  inscricoes  text[] not null default '{}',        -- inscrições imobiliárias / ISS
  criado_em   timestamptz not null default now(),
  unique (municipio, telefone)
);

-- ---------- Conversas (uma por atendimento) ----------
create table if not exists zapgov.conversas (
  id              bigserial primary key,
  municipio       text not null default 'Neves Paulista — SP',
  contribuinte_id bigint not null references zapgov.contribuintes(id) on delete cascade,
  assunto         text,                            -- IPTU, ISS, ITBI, Taxa de Licença...
  status          text not null default 'bot' check (status in ('bot','fila','atendimento','encerrada')),
  atendente_id    uuid references zapgov.usuarios(user_id),
  aberta_em       timestamptz not null default now(),
  encerrada_em    timestamptz,
  nota            smallint check (nota between 1 and 5)
);
create index if not exists conversas_status_idx on zapgov.conversas (municipio, status, aberta_em desc);
create index if not exists conversas_contrib_idx on zapgov.conversas (contribuinte_id, aberta_em desc);

-- ---------- Mensagens (o histórico) ----------
create table if not exists zapgov.mensagens (
  id            bigserial primary key,
  conversa_id   bigint not null references zapgov.conversas(id) on delete cascade,
  origem        text not null check (origem in ('contribuinte','bot','atendente','sistema')),
  autor_id      uuid references zapgov.usuarios(user_id),
  texto         text,
  arquivo_path  text,                              -- caminho no Storage (bucket zapgov-arquivos)
  wa_message_id text unique,                       -- id da Meta, evita mensagem duplicada
  enviada_em    timestamptz not null default now()
);
create index if not exists mensagens_conversa_idx on zapgov.mensagens (conversa_id, enviada_em);

-- ---------- ITBI ----------
create table if not exists zapgov.itbi_solicitacoes (
  id               bigserial primary key,
  conversa_id      bigint references zapgov.conversas(id) on delete set null,
  protocolo        text unique,
  documento_path   text,                           -- escritura/contrato enviado
  dados_extraidos  jsonb,                          -- o que a IA leu do documento
  comprador        text,
  vendedor         text,
  inscricao        text,
  valor_declarado  numeric(14,2),
  valor_venal      numeric(14,2),
  base_calculo     numeric(14,2),
  aliquota         numeric(5,2),
  valor_imposto    numeric(14,2),
  status           text not null default 'conferencia' check (status in ('conferencia','pendente_documento','guia_emitida','cancelada')),
  conferido_por    uuid references zapgov.usuarios(user_id),
  criado_em        timestamptz not null default now()
);

-- ---------- Auditoria (quem fez o quê) ----------
create table if not exists zapgov.auditoria (
  id        bigserial primary key,
  user_id   uuid,
  acao      text not null,
  detalhe   jsonb,
  feito_em  timestamptz not null default now()
);

-- =====================================================================
-- Segurança (RLS): só quem está ativo em zapgov.usuarios enxerga dados.
-- =====================================================================
create or replace function zapgov.usuario_ativo() returns boolean
language sql stable security definer set search_path = zapgov, public as $$
  select exists (select 1 from zapgov.usuarios where user_id = auth.uid() and ativo);
$$;

create or replace function zapgov.eh_admin() returns boolean
language sql stable security definer set search_path = zapgov, public as $$
  select exists (select 1 from zapgov.usuarios where user_id = auth.uid() and ativo and perfil = 'admin');
$$;

alter table zapgov.usuarios          enable row level security;
alter table zapgov.contribuintes     enable row level security;
alter table zapgov.conversas         enable row level security;
alter table zapgov.mensagens         enable row level security;
alter table zapgov.itbi_solicitacoes enable row level security;
alter table zapgov.auditoria         enable row level security;

-- Usuários: cada um lê a própria linha; admin lê e gerencia todas.
drop policy if exists usuarios_ler on zapgov.usuarios;
create policy usuarios_ler on zapgov.usuarios for select to authenticated
  using (user_id = auth.uid() or zapgov.usuario_ativo());
drop policy if exists usuarios_admin on zapgov.usuarios;
create policy usuarios_admin on zapgov.usuarios for all to authenticated
  using (zapgov.eh_admin()) with check (zapgov.eh_admin());

-- Demais tabelas: equipe ativa lê e escreve.
do $$ declare t text; begin
  foreach t in array array['contribuintes','conversas','mensagens','itbi_solicitacoes'] loop
    execute format('drop policy if exists equipe on zapgov.%I', t);
    execute format('create policy equipe on zapgov.%I for all to authenticated using (zapgov.usuario_ativo()) with check (zapgov.usuario_ativo())', t);
  end loop;
end $$;

-- Auditoria: equipe registra; só admin lê.
drop policy if exists auditoria_inserir on zapgov.auditoria;
create policy auditoria_inserir on zapgov.auditoria for insert to authenticated
  with check (zapgov.usuario_ativo() and user_id = auth.uid());
drop policy if exists auditoria_ler on zapgov.auditoria;
create policy auditoria_ler on zapgov.auditoria for select to authenticated using (zapgov.eh_admin());

grant usage on schema zapgov to authenticated, service_role;
grant select, insert, update, delete on all tables in schema zapgov to authenticated, service_role;
grant usage, select on all sequences in schema zapgov to authenticated, service_role;
grant execute on all functions in schema zapgov to authenticated, service_role;

-- =====================================================================
-- Guarda do histórico: 5 anos após o encerramento da conversa.
-- Apaga conversas encerradas há mais de 5 anos (mensagens vão junto).
-- =====================================================================
create or replace function zapgov.limpar_historico() returns integer
language plpgsql security definer set search_path = zapgov, public as $$
declare n integer;
begin
  delete from zapgov.conversas
   where status = 'encerrada'
     and encerrada_em < now() - interval '5 years';
  get diagnostics n = row_count;
  insert into zapgov.auditoria (acao, detalhe) values ('limpeza_historico', jsonb_build_object('conversas_apagadas', n));
  return n;
end $$;
revoke execute on function zapgov.limpar_historico() from authenticated;

-- Agendamento diário às 03:17. Requer a extensão pg_cron:
-- Database › Extensions › pg_cron › Enable. Se ainda não estiver
-- habilitada, este trecho dá erro; habilite e rode só estas linhas.
create extension if not exists pg_cron;
select cron.schedule('zapgov-guarda-5-anos', '17 3 * * *', $$select zapgov.limpar_historico()$$);

-- =====================================================================
-- Primeiro administrador. Troque o e-mail pelo do seu login LegislaGov
-- e rode só este trecho.
-- =====================================================================
-- insert into zapgov.usuarios (user_id, nome, perfil, troca_senha)
-- select id, 'Ricardo', 'admin', false from auth.users where email = 'SEU-EMAIL-AQUI'
-- on conflict (user_id) do update set perfil = 'admin', ativo = true;
