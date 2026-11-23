# Market

A private watchlist for US stocks and ETFs. It keeps a live price feed, cached charts and company figures, headlines, Reddit posts, and Telegram alerts.

## What it does

- Add, edit, and delete favorite tickers.
- A watch page with today's price and move for every favorite.
- A ticker page with a chart, company profile, ratios, annual financials, headlines, and Reddit posts.
- Price limits that fire once when the price crosses them.
- A daily move alert versus the previous close, and a sudden-move alert over a rolling window. Both default to 3% and can be changed globally or per ticker.
- Alerts are sent to Telegram and stored on the ticker page.

The server has to stay running for alerts to fire. Positions, other markets, and X posts are left for a later version. Each symbol stores a venue (`US` today) so another market can be added beside the current providers.

## Run it locally

```powershell
copy .env.example .env
npm install
npm run dev
```

Open http://localhost:3000 and sign in with `APP_PASSWORD`.

The background worker starts on the first request and keeps running until you stop the server. Restart after you change `.env`.

## Environment

| Name | Purpose |
| --- | --- |
| `APP_PASSWORD` | The single sign-in password. |
| `APP_ORIGIN` | Public URL used in Telegram links. |
| `FINNHUB_API_KEY` | Live quotes, search, profile, ratios, and headlines. Free personal key from [Finnhub](https://finnhub.io). |
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_CHAT_ID` | Your chat id. Message the bot, then open `https://api.telegram.org/bot<token>/getUpdates`. |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | A script app from [Reddit apps](https://www.reddit.com/prefs/apps). |
| `REDDIT_USERNAME` / `REDDIT_PASSWORD` | The Reddit account that owns the script app. |
| `COOKIE_SECURE` | Set to `1` when the site is served over HTTPS. |

Finnhub's free plan covers live US quotes for up to 50 symbols. This app expects fewer than 25. Charts and annual statements come from Yahoo's public endpoints, are cached in SQLite, and are refreshed on a schedule. If Yahoo rate-limits the server, the last saved chart stays on screen.

## Alerts

- A price limit fires when the latest price crosses the level, then disarms until you arm it again.
- The daily move compares the latest price with the previous close. One alert per ticker, per direction, per New York trading day.
- The sudden move compares the latest price with the price about 15 minutes earlier. After it fires, that direction stays quiet for 60 minutes. Window and quiet period are global. The percentages can be overridden on a ticker.
- Mute on a ticker silences every alert without deleting the limits.

## Deploy

On a small VPS:

```bash
cp .env.example .env
# fill in the password, Finnhub key, and Telegram values
# set APP_ORIGIN to the public URL and COOKIE_SECURE=1 when using HTTPS
docker compose up -d --build
```

The app listens on port 3000. The database file is in the `market-data` volume.

For HTTPS, point a domain at the server and run:

```bash
DOMAIN=watch.example.com docker compose --profile https up -d --build
```

Caddy requests a certificate for that domain and proxies to the app.

Copy the database file out of the volume when you want a backup.

## Tests

```powershell
npm test
```

The alert rules and the New York session clock are covered without calling a market API.
