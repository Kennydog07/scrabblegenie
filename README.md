# Scrabble Solver Claude / Anthropic Version

This version uses an Anthropic API key, not an OpenAI key.

## Required Netlify environment variable

ANTHROPIC_API_KEY

Optional:

ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

## Upload to Netlify

Upload/push all files:

index.html
package.json
netlify.toml
netlify/functions/analyse-board.js

## How it works

1. User uploads screenshot.
2. Browser resizes the image.
3. Browser sends it to the Netlify function.
4. Netlify function calls Claude Messages API with image input.
5. Claude returns board JSON + top 3 moves.
6. App populates board and highlights the moves.

Do not put your Anthropic key in index.html.
Only add it in Netlify environment variables.
