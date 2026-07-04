-- Supports build-order step 6 (extend valuation engine to gold, mutual
-- funds, manual assets). Real estate / other assets have no external price
-- feed, so their "current value" is a user-entered estimate that gets
-- updated in place (not via a transaction row) when the user revalues it.
-- Null for stock/mutual_fund/gold, whose current value always comes from a
-- live price source instead.
alter table assets add column manual_current_value numeric;
