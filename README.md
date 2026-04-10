# Vapes of the Round Table

Community dry herb vaporizer hub — round table reviews, compendium, trusted artisans.

## Site Structure

```
/                        → Splash page (3 cards)
/compendium/             → DHV wiki (preserved from FuckCombustion.com)
/compendium/[model].html → Individual vaporizer articles
/artisans.html           → Trusted artisan/vendor directory
```

## Deployment

Automatically deploys to Namecheap shared hosting via FTP on every push to `main`.

### Required GitHub Secrets

Set these in your repo → Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `FTP_SERVER` | Your Namecheap FTP hostname (e.g. `ftp.yourdomain.com`) |
| `FTP_USERNAME` | FTP username from Namecheap cPanel |
| `FTP_PASSWORD` | FTP password from Namecheap cPanel |
| `FTP_SERVER_DIR` | Remote path (e.g. `/public_html/` or `/public_html/vapes/`) |

### Finding Your FTP Credentials (Namecheap)
1. Log into Namecheap → cPanel
2. Search "FTP Accounts" 
3. Use the main account credentials, or create a dedicated FTP user
4. FTP server is usually `ftp.yourdomain.com`

## Local Development

Just open `index.html` in a browser — no build step needed.

## Adding Wiki Articles

Run the pipeline in `../pipeline/` then copy new HTML files into `compendium/`.
See `../README.md` for full pipeline documentation.

## Contributing

Community submissions via Google Form → Apps Script → Claude API (Phase 3).
