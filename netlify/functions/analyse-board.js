exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return send(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return send(500, { error: "Missing OPENAI_API_KEY. Add it in Netlify Environment variables, then redeploy." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return send(400, { error: "Bad request: invalid JSON." });
  }

  const image = payload.image;
  const rack = String(payload.rack || "").toUpperCase().replace(/[^A-Z?]/g, "");

  if (!image || !String(image).startsWith("data:image/")) {
    return send(400, { error: "No image received by the API function." });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      board: {
        type: "array",
        minItems: 15,
        maxItems: 15,
        items: {
          type: "array",
          minItems: 15,
          maxItems: 15,
          items: { type: "string" }
        }
      },
      detectedRack: { type: "string" },
      topMoves: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            word: { type: "string" },
            row: { type: "number" },
            col: { type: "number" },
            direction: { type: "string" },
            score: { type: "number" },
            explanation: { type: "string" }
          },
          required: ["word", "row", "col", "direction", "score", "explanation"]
        }
      },
      note: { type: "string" }
    },
    required: ["board", "detectedRack", "topMoves", "note"]
  };

  const prompt = `
You are a Scrabble board analysis engine.

Analyse this screenshot and return JSON only.

What to do:
1. Detect the 15x15 board.
2. Populate "board" with existing tiles. Use "" for empty squares.
3. Detect the rack if visible. Supplied typed rack: "${rack || "not supplied"}".
4. Recommend the top 3 best scoring Scrabble moves.
5. Use zero-based row and column coordinates.
6. Use direction "H" for across and "V" for down.
7. If the board/rack is unclear, make the best estimate and say so in note.
8. If a typed rack is supplied, prioritise it over visually detected rack letters.
9. The app will highlight your returned coordinates, so make sure row/col/direction are usable.
`;

  try {
    const apiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: image }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "scrabble_analysis",
            schema,
            strict: true
          }
        }
      })
    });

    const raw = await apiRes.text();

    if (!apiRes.ok) {
      return send(apiRes.status, {
        error: "OpenAI API error: " + raw.slice(0, 1200)
      });
    }

    let outer;
    try {
      outer = JSON.parse(raw);
    } catch {
      return send(500, { error: "OpenAI returned non-JSON response: " + raw.slice(0, 500) });
    }

    const outputText = extractOutputText(outer);
    if (!outputText) {
      return send(500, { error: "OpenAI returned no output_text. Raw response: " + JSON.stringify(outer).slice(0, 1000) });
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return send(500, { error: "Could not parse model JSON: " + outputText.slice(0, 1000) });
    }

    parsed = normalise(parsed);
    return send(200, parsed);
  } catch (err) {
    return send(500, { error: err.message || "Unknown server error." });
  }
};

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;

  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (Array.isArray(item.content)) {
        for (const content of item.content) {
          if (typeof content.text === "string") return content.text;
          if (typeof content.output_text === "string") return content.output_text;
        }
      }
    }
  }

  return "";
}

function normalise(data) {
  const emptyRow = () => Array.from({ length: 15 }, () => "");
  if (!Array.isArray(data.board)) data.board = Array.from({ length: 15 }, emptyRow);

  data.board = data.board.slice(0, 15).map(row => {
    const r = Array.isArray(row) ? row.slice(0, 15) : [];
    while (r.length < 15) r.push("");
    return r.map(v => {
      const s = String(v || "").toUpperCase().replace(/[^A-Z]/g, "");
      return s.slice(0, 1);
    });
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
      explanation: "The model could not confidently identify enough move options."
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
