exports.handler = async function(event) {
  if (event.httpMethod !== "POST") return send(405, { error: "Method not allowed." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return send(500, { error: "Missing ANTHROPIC_API_KEY in Netlify environment variables." });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return send(400, { error: "Invalid JSON request." }); }

  const dataUrl = String(body.image || "");
  const rack = String(body.rack || "").toUpperCase().replace(/[^A-Z?]/g, "");
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return send(400, { error: "No valid base64 image received." });

  const mediaType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const imageBase64 = match[2];

  const prompt = `Analyse this Scrabble Go screenshot. Return JSON only.

JSON format:
{
 "board":[["","","","","","","","","","","","","","",""], ... exactly 15 rows],
 "detectedRack":"LETTERS",
 "topMoves":[
  {"word":"WORD","row":7,"col":7,"direction":"H","score":20,"explanation":"short reason"},
  {"word":"WORD","row":7,"col":7,"direction":"H","score":18,"explanation":"short reason"},
  {"word":"WORD","row":7,"col":7,"direction":"H","score":16,"explanation":"short reason"}
 ],
 "note":"short note"
}

Rules:
- board must be exactly 15 x 15.
- Use uppercase letters only. Empty square = "".
- Typed rack letters: ${rack || "not supplied"}.
- If typed rack supplied, use those rack letters.
- Return exactly 3 move options.
- row/col are zero-based 0-14.
- direction is H or V.
- Keep response concise.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
        max_tokens: 1000,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    const raw = await resp.text();
    if (!resp.ok) return send(resp.status, { error: "Anthropic API error: " + raw.slice(0, 1000) });

    const outer = JSON.parse(raw);
    const text = (outer.content || []).filter(x => x.type === "text").map(x => x.text).join("\n").trim();
    const jsonText = extractJson(text);
    const parsed = normalise(JSON.parse(jsonText));
    return send(200, parsed);
  } catch (e) {
    return send(500, { error: e.message || "Unknown function error." });
  }
};

function extractJson(text) {
  const s = String(text || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return a >= 0 && b > a ? s.slice(a, b + 1) : s;
}

function normalise(data) {
  const empty = () => Array.from({ length: 15 }, () => "");
  if (!Array.isArray(data.board)) data.board = Array.from({ length: 15 }, empty);
  data.board = data.board.slice(0, 15).map(row => {
    const r = Array.isArray(row) ? row.slice(0, 15) : [];
    while (r.length < 15) r.push("");
    return r.map(v => String(v || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1));
  });
  while (data.board.length < 15) data.board.push(empty());

  if (!Array.isArray(data.topMoves)) data.topMoves = [];
  data.topMoves = data.topMoves.slice(0, 3).map(m => ({
    word: String(m.word || "").toUpperCase().replace(/[^A-Z]/g, ""),
    row: clamp(Number(m.row), 0, 14),
    col: clamp(Number(m.col), 0, 14),
    direction: String(m.direction || "H").toUpperCase() === "V" ? "V" : "H",
    score: Number(m.score || 0),
    explanation: String(m.explanation || "")
  }));
  while (data.topMoves.length < 3) data.topMoves.push({ word: "UNKNOWN", row: 7, col: 7, direction: "H", score: 0, explanation: "Not enough confident options." });

  data.detectedRack = String(data.detectedRack || "");
  data.note = String(data.note || "Analysis complete.");
  return data;
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function send(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) };
}
