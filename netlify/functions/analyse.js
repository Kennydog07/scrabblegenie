exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set. Go to Netlify → Site configuration → Environment variables, add it, then Deploys → Trigger deploy.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { imageBase64, mediaType, rackLetters } = body;
  if (!imageBase64) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No image provided' }) };
  }

  const rack = (rackLetters || '').toUpperCase().replace(/[^A-Z?_]/g, '');

  const prompt = `You are a Scrabble expert. Analyse this board image.

RACK: [${rack || 'not specified'}]

BOARD is 15x15. Columns A-O (left to right), Rows 1-15 (top to bottom).

STEP 1: Read every tile on the board carefully. Note its exact column (A-O) and row (1-15).
STEP 2: Find the top 3 highest-scoring valid plays using rack [${rack}].
STEP 3: Each move must connect to an existing tile, use only available rack letters, and be a valid SOWPODS word.

Premium squares:
3W: A1,H1,O1,A8,O8,A15,H15,O15
2W: B2,C3,D4,E5,K5,L4,M3,N2,B14,C13,D12,E11,K11,L12,M13,N14,H8
3L: B6,B10,F2,F6,F10,F14,J2,J6,J10,J14,N6,N10
2L: D1,L1,G3,I3,A4,H4,O4,C7,G7,I7,M7,D8,L8,C9,G9,I9,M9,A12,H12,O12,G13,I13,D15,L15
Letter values: A=1,B=3,C=3,D=2,E=1,F=4,G=2,H=4,I=1,J=8,K=5,L=1,M=3,N=1,O=1,P=3,Q=10,R=1,S=1,T=1,U=1,V=4,W=4,X=8,Y=4,Z=10

Return ONLY raw JSON (no markdown fences):
{
  "boardSummary": "description of board state",
  "existingTiles": [{"col":"H","row":8,"letter":"A"}],
  "moves": [
    {
      "rank": 1,
      "word": "WORD",
      "startCol": "G",
      "startRow": 5,
      "direction": "across",
      "connectsTo": "which existing tile this touches",
      "tiles": [
        {"col":"G","row":5,"letter":"W","isNew":true},
        {"col":"H","row":5,"letter":"O","isNew":false},
        {"col":"I","row":5,"letter":"R","isNew":true},
        {"col":"J","row":5,"letter":"D","isNew":true}
      ],
      "estimatedScore": 12,
      "isBingo": false,
      "crossWords": [],
      "scoreBreakdown": "W(4)+O(1,existing)+R(1)+D(2)=8",
      "reasoning": "why this is a good play"
    }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'Claude API error (' + response.status + '): ' + errText.substring(0, 300) })
      };
    }

    const data = await response.json();
    const raw = data.content[0].text;
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);

    if (!match) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'Could not parse response', raw: raw.substring(0, 300) })
      };
    }

    return { statusCode: 200, headers, body: match[0] };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
