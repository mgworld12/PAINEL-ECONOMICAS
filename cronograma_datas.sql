-- Execute uma vez no Supabase: SQL Editor > New query > Run
create table if not exists public.cronograma_datas (
  ano text not null,
  campo text not null,
  valor text not null default 'xx/xx/xxxx',
  atualizado_em timestamptz not null default now(),
  primary key (ano, campo)
);

alter table public.cronograma_datas enable row level security;

-- Todos podem LER (inclusive quem abre o painel fora do GitHub Pages, sem login)
drop policy if exists "cronograma_leitura" on public.cronograma_datas;
create policy "cronograma_leitura" on public.cronograma_datas
  for select to anon, authenticated using (true);

-- Só usuários logados E aprovados (tabela perfis) podem GRAVAR
drop policy if exists "cronograma_insere" on public.cronograma_datas;
create policy "cronograma_insere" on public.cronograma_datas
  for insert to authenticated
  with check (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado));

drop policy if exists "cronograma_atualiza" on public.cronograma_datas;
create policy "cronograma_atualiza" on public.cronograma_datas
  for update to authenticated
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado))
  with check (exists (select 1 from public.perfis p where p.id = auth.uid() and p.aprovado));
