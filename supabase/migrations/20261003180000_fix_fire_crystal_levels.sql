-- WOSOracle's furnace number has 5 steps per Fire Crystal level
-- (35 = FC1, 40 = FC2, ..., 80 = FC10). Recompute the derived FC level that
-- planning filters use from the stored raw value.
update public.wos_accounts
set furnace_level = case
  when furnace_level_raw <= 30 then 0
  else least(10, (furnace_level_raw - 30) / 5)
end
where furnace_level_raw is not null;

comment on column public.wos_accounts.furnace_level_raw is
  'Raw game Furnace level: 1-30 Furnace, then 5 steps per Fire Crystal level (35 = FC1, 80 = FC10).';
