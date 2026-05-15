exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return json(500, {
      error: "Missing OPENAI_API_KEY. Add it in Netlify: Site settings → Environment variables → OPENAI_API_KEY."
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const image = body.image;
  const rack = String(body.rack || "").toUpperCase().replace(/[^A-Z?]/g, "");

  if (!image || !String(image).startsWith("data:image/")) {
    return json(400, { error: "Missing image data. Upload a screenshot first." });
  }

  const prompt = `
You are a Scrabble move-analysis engine.

Analyse the uploaded screenshot of a Scrabble board.

Tasks:
1. Read the visible 15x15 Scrabble board as accurately as possible.
2. Use the supplied rack letters if provided: "${rack || "not supplied"}".
3. Recommend the top 3 legal-looking Scrabble moves for maximum score.
4. Return only JSON matching the schema.

Board format:
- board must be exactly 15 arrays of 15 strings.
- Use uppercase letters A-Z for existing tiles.
- Use "" for empty squares.
- row and col for moves must be zero-based numbers from 0 to 14.
- direction must be "H" for across or "V" for down.
- If the screenshot is unclear, still make your best estimate and explain uncertainty in note.
- If rack letters are supplied, only suggest moves that use those rack letters plus existing board letters.
- Scores should be realistic Scrabble scores including obvious premium squares where possible.
`;

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
      detectedRack: {
        type: "string"
      },
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

  try {
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
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

    const raw = await apiResponse.text();

    if (!apiResponse.ok) {
      return json(apiResponse.status, {
        error: `OpenAI API error: ${raw.slice(0, 800)}`
      });
    }

    const result = JSON.parse(raw);
    const text = result.output_text ||
      result.output?.flatMap(item => item.content || [])
        ?.find(content => content.type === "output_text")?.text;

    if (!text) {
      return json(500, { error: "The API returned no readable analysis." });
    }

    const parsed = JSON.parse(text);
    return json(200, parsed);
  } catch (error) {
    return json(500, { error: error.message || "Unknown server error." });
  }
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(payload)
  };
}
