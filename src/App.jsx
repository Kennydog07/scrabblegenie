import React, { useRef, useState } from "react";

export default function App() {
  const [rack, setRack] = useState("");
  const [imageUrl, setImageUrl] = useState(null);
  const fileInput = useRef(null);

  const moves = [
    { word: "QUIZ", score: 44, pos: "H8" },
    { word: "JAZZ", score: 40, pos: "D10" },
    { word: "QUICK", score: 36, pos: "A1" },
  ];

  function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setImageUrl(url);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-5xl font-black">Scrabble Solver</h1>
            <p className="text-slate-400 mt-2">
              Upload a screenshot and find the best move.
            </p>
          </div>

          <button
            onClick={() => fileInput.current?.click()}
            className="bg-white text-black px-6 py-4 rounded-2xl font-black"
          >
            Upload Screenshot
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-8">

          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">

            <h2 className="text-2xl font-bold mb-4">
              Uploaded Board
            </h2>

            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Board Screenshot"
                className="w-full rounded-2xl border border-slate-700"
              />
            ) : (
              <div className="h-96 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500">
                No screenshot uploaded
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-xl font-bold mb-4">
                Board Grid
              </h3>

              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: "repeat(15, minmax(20px, 1fr))" }}
              >
                {Array.from({ length: 225 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded bg-slate-800 border border-slate-700"
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">

            <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
              <h2 className="text-2xl font-bold mb-4">
                Your Letters
              </h2>

              <input
                value={rack}
                onChange={(e) => setRack(e.target.value.toUpperCase())}
                placeholder="RETSAIN"
                className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-700 text-3xl tracking-widest font-black"
              />
            </div>

            <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
              <h2 className="text-2xl font-bold mb-4">
                Top Moves
              </h2>

              <div className="space-y-4">
                {moves.map((move, index) => (
                  <div
                    key={index}
                    className="bg-slate-950 rounded-2xl p-4 border border-slate-700"
                  >
                    <div className="flex justify-between">
                      <span className="font-black text-2xl">
                        #{index + 1} {move.word}
                      </span>

                      <span className="font-black text-2xl">
                        {move.score}
                      </span>
                    </div>

                    <div className="text-slate-400 mt-2">
                      Position: {move.pos}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
