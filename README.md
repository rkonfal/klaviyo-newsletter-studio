# Klaviyo Newsletter Studio

Static-first GitHub-hosted module for learning from sent Klaviyo campaigns and generating newsletter drafts from a short brief.

## What it does

- syncs sent email campaigns from Klaviyo into normalized JSON
- fetches campaign message metadata and linked template HTML
- extracts a lightweight style profile from real sent emails
- serves a browser UI via GitHub Pages
- generates first-draft newsletters from a short input brief
- keeps everything versioned on GitHub

## Architecture

- **GitHub Pages**: static UI in `app/`
- **GitHub Actions**: scheduled/manual sync and dataset rebuild
- **Data layer**: `data/raw/` and `data/current/`
- **Generation**: browser-side template engine using learned patterns from the dataset

## Setup

1. Add repository secret:
   - `KLAVIYO_API_KEY`
2. Enable GitHub Pages with GitHub Actions.
3. Run workflow `Sync Klaviyo and build dataset`.

## Local run

```bash
npm install
npm run sync:klaviyo
npm run build
cd app && python3 -m http.server 4173
```

## Output files

- `data/raw/campaigns.json` -> normalized campaign archive from Klaviyo
- `data/current/style-profile.json` -> distilled style profile for the UI generator

## Notes

This MVP stays GitHub-centric. No separate backend is required for the first working version, but private secrets remain only in GitHub Actions or local env.
