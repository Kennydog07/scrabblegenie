# Scrabble Solver AI

This version adds a real API backend using a Netlify Function.

## Files

- `index.html` — the web app
- `netlify/functions/analyse-board.js` — API function that sends the screenshot to OpenAI Vision
- `netlify.toml` — Netlify config
- `package.json` — project metadata

## How it works

1. User uploads a Scrabble board screenshot.
2. User enters rack letters.
3. The browser sends the image to `/.netlify/functions/analyse-board`.
4. The function calls the OpenAI Responses API with image input.
5. The API returns:
   - detected 15x15 board
   - detected rack
   - top 3 move options
6. The frontend highlights the 3 moves.

## Netlify setup

1. Upload/push this folder to GitHub.
2. Connect the GitHub repo to Netlify.
3. In Netlify, go to:

   Site configuration → Environment variables

4. Add:

   OPENAI_API_KEY = your OpenAI API key

5. Deploy.

## Local testing

You need Netlify CLI:

```bash
npm install
npm install -g netlify-cli
netlify dev
```

Then open the local Netlify URL.

## Important

Do not put your OpenAI API key inside `index.html`.
It must only be stored in Netlify environment variables.
