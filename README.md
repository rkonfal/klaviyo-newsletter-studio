# Klaviyo Newsletter Studio

Static-first GitHub-hosted module for learning from sent Klaviyo campaigns and generating newsletter drafts from a short brief.

## What it does

- syncs sent campaigns from Klaviyo into normalized JSON
- builds a lightweight style profile from your sent emails
- serves a browser UI via GitHub Pages
- generates first-draft newsletters from a short input brief
- keeps everything versioned on GitHub

## Architecture

- **GitHub Pages**: static UI in `app/`
- **GitHub Actions**: scheduled/manual sync and dataset rebuild
- **Data layer**: `data/raw/` and `data/current/`
- **Generation**: browser-side template engine using learned patterns from the dataset

## Setup

1. Create repository secrets:
   - `KLAVIYO_API_KEY`
2. Enable GitHub Pages from the `gh-pages` branch or GitHub Actions pages deployment.
3. Run workflow `Sync Klaviyo and build dataset`.

## Local run

```bash
npm install
npm run build
cd app && python3 -m http.server 4173
```

## Klaviyo sync

The sync script currently reads campaigns and campaign messages from Klaviyo JSON:API and stores a normalized subset locally. If API access is limited, you can also drop manually exported JSON files into `data/raw/` and rebuild.

## Notes

This MVP stays fully GitHub-centric. No separate backend is required for the first working version.
