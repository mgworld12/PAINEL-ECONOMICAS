-- Escala por agência (escalaABT.html / escalaAJA.html) com senha de edição  [versão 2]
-- Rodar no Supabase (SQL Editor) selecionando TUDO e clicando em Run. Pode rodar de novo sem estragar nada.
-- Projeto esperado: rdxklpkukmuwwetftqde (o mesmo das páginas).
-- Pré-requisito: existir a tabela public.perfis (a do login, com id e aprovado).
-- Quem está em escala_editores é o PROPRIETÁRIO: é o único que pode alterar a senha.
-- No final, o resultado deve mostrar: tabela = escala_agencia, funcoes = 3, senhas = 2.

-- 0) Confere o pré-requisito, com mensagem clara se faltar
do $chk$
begin
  if to_regclass('public.perfis') is null then
    raise exception 'A tabela public.perfis nao existe neste projeto. Confira se este e o projeto certo (rdxklpkukmuwwetftqde).';
  end if;
end
$chk$;

-- 1) Criptografia de senha (funciona mesmo se o pgcrypto já estiver em outro schema)
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- 2) Tabelas
create table if not exists public.escala_agencia (
  agencia text primary key check (agencia in ('ABT','AJA')),
  dados jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.escala_senha (
  agencia text primary key check (agencia in ('ABT','AJA')),
  hash text not null
);

create table if not exists public.escala_editores (
  email text primary key
);

alter table public.escala_agencia  enable row level security;
alter table public.escala_senha    enable row level security;
alter table public.escala_editores enable row level security;

-- 3) Permissões de leitura (a escala é lida direto; a senha NUNCA é lida pelo navegador)
grant usage on schema public to authenticated;
grant select on public.escala_agencia  to authenticated;
grant select on public.escala_editores to authenticated;

drop policy if exists "escala_agencia_ler" on public.escala_agencia;
create policy "escala_agencia_ler" on public.escala_agencia for select to authenticated
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado = true));

drop policy if exists "editores_ler_proprio" on public.escala_editores;
create policy "editores_ler_proprio" on public.escala_editores for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- 4) Dados iniciais: senha "ibge" (só se ainda não existir) e proprietário
insert into public.escala_senha (agencia, hash) values
  ('ABT', crypt('ibge', gen_salt('bf'))),
  ('AJA', crypt('ibge', gen_salt('bf')))
on conflict (agencia) do nothing;

insert into public.escala_editores (email) values ('maury.goncalves@ibge.gov.br')
on conflict do nothing;

-- 5) Se existir a tabela antiga "escala", copia os APMs de cada agência (só onde ainda não há dados).
--    Qualquer problema aqui é ignorado e NÃO impede o resto do script.
do $mig$
begin
  if to_regclass('public.escala') is not null then
    insert into public.escala_agencia (agencia, dados, atualizado_por)
    select a.ag, j.d, 'migração'
    from (values ('ABT'),('AJA')) as a(ag)
    cross join public.escala e
    cross join lateral (
      select jsonb_agg(x) as d from jsonb_array_elements(e.dados::jsonb) x where x->>'ag' = a.ag
    ) j
    where e.id = 1 and j.d is not null
    on conflict do nothing;
  end if;
exception when others then
  raise notice 'Migracao da tabela antiga ignorada: %', sqlerrm;
end
$mig$;

-- 6) Funções
-- Confere se a senha está certa (só para usuários aprovados)
create or replace function public.escala_verificar(p_agencia text, p_senha text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado = true) then
    return false;
  end if;
  return exists (select 1 from public.escala_senha s
                 where s.agencia = p_agencia and s.hash = crypt(p_senha, s.hash));
end $$;

-- Grava a escala da agência (exige a senha; evita sobrescrever alteração de outra pessoa)
create or replace function public.escala_salvar(p_agencia text, p_dados jsonb, p_versao timestamptz, p_senha text)
returns timestamptz language plpgsql security definer set search_path = public, extensions as $$
declare
  v_novo timestamptz := now();
  v_atual timestamptz;
  v_email text := auth.jwt() ->> 'email';
begin
  if not public.escala_verificar(p_agencia, p_senha) then raise exception 'SENHA_INVALIDA'; end if;
  select atualizado_em into v_atual from public.escala_agencia where agencia = p_agencia for update;
  if not found then
    if p_versao is not null then raise exception 'CONFLITO'; end if;
    insert into public.escala_agencia (agencia, dados, atualizado_em, atualizado_por)
    values (p_agencia, p_dados, v_novo, v_email);
  else
    if p_versao is distinct from v_atual then raise exception 'CONFLITO'; end if;
    update public.escala_agencia
       set dados = p_dados, atualizado_em = v_novo, atualizado_por = v_email
     where agencia = p_agencia;
  end if;
  return v_novo;
end $$;

-- Troca a senha (somente proprietário = e-mail listado em escala_editores)
create or replace function public.escala_trocar_senha(p_agencia text, p_nova text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.escala_editores e where lower(e.email) = lower(auth.jwt() ->> 'email')) then
    raise exception 'SEM_PERMISSAO';
  end if;
  if p_agencia not in ('ABT','AJA') or length(coalesce(p_nova,'')) < 4 then
    raise exception 'DADOS_INVALIDOS';
  end if;
  insert into public.escala_senha (agencia, hash) values (p_agencia, crypt(p_nova, gen_salt('bf')))
  on conflict (agencia) do update set hash = excluded.hash;
end $$;

-- 7) Só usuários logados podem chamar as funções
revoke all on function public.escala_verificar(text, text) from public, anon;
revoke all on function public.escala_salvar(text, jsonb, timestamptz, text) from public, anon;
revoke all on function public.escala_trocar_senha(text, text) from public, anon;
grant execute on function public.escala_verificar(text, text) to authenticated;
grant execute on function public.escala_salvar(text, jsonb, timestamptz, text) to authenticated;
grant execute on function public.escala_trocar_senha(text, text) to authenticated;

-- 8) Faz a API enxergar as novas funções na hora
notify pgrst, 'reload schema';

-- 9) Conferência (esperado: tabela = escala_agencia, funcoes = 3, senhas = 2)
select to_regclass('public.escala_agencia') as tabela,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('escala_verificar','escala_salvar','escala_trocar_senha')) as funcoes,
       (select count(*) from public.escala_senha) as senhas;
