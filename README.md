# Scrabble Solver Claude Fixed

Upload these files to GitHub and deploy to Netlify.

Required Netlify environment variable:

ANTHROPIC_API_KEY

Netlify build settings:
Build command: npm run build
Publish directory: dist

This version uses Claude Haiku:
claude-3-haiku-20240307

It also reduces the screenshot size before sending to reduce 502 errors.
