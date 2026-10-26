-- Tabela usada pelo mapaEmpresas.html para compartilhar correções, APM por bairro,
-- cores, visitas e coordenadas entre todos os usuários aprovados.
create table if not exists public.mapa_empresas_dados (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado timestamptz not null default now()
);

alter table public.mapa_empresas_dados enable row level security;

drop policy if exists "aprovados leem" on public.mapa_empresas_dados;
drop policy if exists "aprovados inserem" on public.mapa_empresas_dados;
drop policy if exists "aprovados atualizam" on public.mapa_empresas_dados;
drop policy if exists "aprovados apagam" on public.mapa_empresas_dados;

create policy "aprovados leem" on public.mapa_empresas_dados for select to authenticated
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado = true));
create policy "aprovados inserem" on public.mapa_empresas_dados for insert to authenticated
  with check (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado = true));
create policy "aprovados atualizam" on public.mapa_empresas_dados for update to authenticated
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado = true))
  with check (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado = true));
create policy "aprovados apagam" on public.mapa_empresas_dados for delete to authenticated
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado = true));
