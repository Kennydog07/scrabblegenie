# Scrabble Solver AI — Fixed Automatic Version

This version analyses the screenshot automatically as soon as it is uploaded.

## What changed

- Uploading a screenshot immediately calls the Netlify API function.
- The image is resized in the browser before upload so Netlify does not reject huge screenshots.
- The board grid is populated from the API result.
- The top 3 moves are displayed immediately.
- The top 3 moves are highlighted on the board.
- Errors now show clearly on screen.

## Files

- `index.html`
- `netlify/functions/analyse-board.js`
- `netlify.toml`
- `package.json`

## Netlify setup

1. Upload this folder to GitHub.
2. Connect it to Netlify.
3. Add this environment variable:

```txt
OPENAI_API_KEY
```

4. Redeploy the site.

Optional model override:

```txt
OPENAI_MODEL=gpt-4.1-mini
```

## Important

This uses OpenAI vision to read the screenshot. It will only work after the API key is added to Netlify and the site is redeployed.

The app does not store your API key in the browser.
