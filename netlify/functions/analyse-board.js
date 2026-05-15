exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return send(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return send(500, { error: "Missing ANTHROPIC_API_KEY. Add it in Netlify Environment variables, then redeploy." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return send(400, { error: "Bad request: invalid JSON." });
  }

  const imageDataUrl = String(payload.image || "");
  const rack = String(payload.rack || "").toUpperCase().replace(/[^A-Z?]/g, "");

  if (!imageDataUrl.startsWith("data:image/")) {
    return send(400, { error: "No image received by the API function." });
  }

  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return send(400, { error: "Image must be a base64 data URL." });
  }

  const mediaType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const base64Data = match[2];

  const prompt = `
You are a Scrabble board analysis engine.

Analyse this screenshot and return JSON only. No markdown.

Return this exact JSON shape:
{
  "board": [["","","", ... 15 items], ... 15 rows],
  "detectedRack": "LETTERS",
  "topMoves": [
    {"word":"WORD","row":7,"col":7,"direction":"H","score":24,"explanation":"short reason"}
  ],
  "note": "short note"
}

Rules:
1. Detect the 15x15 board.
2. Populate board with existing tiles. Use "" for empty squares.
3. Use uppercase A-Z only.
4. Supplied typed rack: "${rack || "not supplied"}".
5. If typed rack is supplied, prioritise it over visually detected rack.
6. Recommend exactly 3 best scoring Scrabble moves.
7. row and col must be zero-based numbers from 0 to 14.
8. direction must be "H" for across or "V" for down.
9. If the screenshot is unclear, make your best estimate and explain uncertainty in note.
10. Return JSON only.
`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        max_tokens: 2500,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ]
      })
    });

    const raw = await anthropicRes.text();

    if (!anthropicRes.ok) {
      return send(anthropicRes.status, {
        error: "Anthropic API error: " + raw.slice(0, 1200)
      });
    }

    let outer;
    try {
      outer = JSON.parse(raw);
    } catch {
      return send(500, { error: "Anthropic returned non-JSON response: " + raw.slice(0, 600) });
    }

    const outputText = extractText(outer);
    if (!outputText) {
      return send(500, { error: "Claude returned no text. Raw response: " + JSON.stringify(outer).slice(0, 1000) });
    }

    const jsonText = extractJson(outputText);
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return send(500, { error: "Could not parse Claude JSON. Claude said: " + outputText.slice(0, 1200) });
    }

    parsed = normalise(parsed);
    return send(200, parsed);
  } catch (err) {
    return send(500, { error: err.message || "Unknown server error." });
  }
};

function extractText(response) {
  if (!Array.isArray(response.content)) return "";
  return response.content
    .filter(block => block.type === "text" && typeof block.text === "string")
    .map(block => block.text)
    .join("\n")
    .trim();
}

function extractJson(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function normalise(data) {
  const emptyRow = () => Array.from({ length: 15 }, () => "");

  if (!Array.isArray(data.board)) data.board = Array.from({ length: 15 }, emptyRow);

  data.board = data.board.slice(0, 15).map(row => {
    const r = Array.isArray(row) ? row.slice(0, 15) : [];
    while (r.length < 15) r.push("");
    return r.map(v => String(v || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1));
  });

  while (data.board.length < 15) data.board.push(emptyRow());

  if (!Array.isArray(data.topMoves)) data.topMoves = [];

  data.topMoves = data.topMoves.slice(0, 3).map(m => ({
    word: String(m.word || "").toUpperCase().replace(/[^A-Z]/g, ""),
    row: clamp(Number(m.row), 0, 14),
    col: clamp(Number(m.col), 0, 14),
    direction: String(m.direction || "H").toUpperCase().startsWith("V") || String(m.direction || "").toUpperCase().startsWith("D") ? "V" : "H",
    score: Number(m.score || 0),
    explanation: String(m.explanation || "")
  }));

  while (data.topMoves.length < 3) {
    data.topMoves.push({
      word: "UNKNOWN",
      row: 7,
      col: 7,
      direction: "H",
      score: 0,
      explanation: "Claude could not confidently identify enough move options."
    });
  }

  data.detectedRack = String(data.detectedRack || "");
  data.note = String(data.note || "Analysis complete.");
  return data;
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function send(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}
