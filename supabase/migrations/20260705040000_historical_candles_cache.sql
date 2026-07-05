-- Historical data + backtesting: caches closed-day candles from Angel One's
-- getCandleData so repeated backtests on the same symbol/range don't burn
-- rate limit budget. A closed trading day's OHLC never changes once fetched.
create table historical_candles (
  symbol text not null,
  interval text not null,
  candle_date date not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric,
  primary key (symbol, interval, candle_date)
);

alter table historical_candles enable row level security;
