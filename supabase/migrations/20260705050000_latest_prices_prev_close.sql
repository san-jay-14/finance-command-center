-- Day-change display on the dashboard: Angel One's holdings API returns each
-- stock's previous close; storing it beside the live LTP lets get-net-worth
-- compute per-holding and total day change without another API call.
alter table latest_prices add column if not exists prev_close numeric;
