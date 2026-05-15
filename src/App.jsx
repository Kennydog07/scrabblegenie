import React, { useState } from "react";

export default function App() {
  const [rack, setRack] = useState("");
  const [moves] = useState([
    { word: "QUIZ", score: 44, pos: "H8" },
    { word: "JAZZ", score: 40, pos: "D10" },
    { word: "QUICK", score: 36, pos: "A1" },
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-black mb-2">Scrabble Solver</h1>
        <p className="text-slate-400 mb-8">
          Upload a screenshot and find the best move.
        </p>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <h2 className="text-2xl font-bold mb-4">Board</h2>

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

          <div className="space-y-6">
            <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
              <h2 className="text-2xl font-bold mb-4">Your Letters</h2>

              <input
                value={rack}
                onChange={(e) => setRack(e.target.value.toUpperCase())}
                placeholder="RETSAIN"
                className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-700 text-3xl tracking-widest font-black"
              />
            </div>

            <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
              <h2 className="text-2xl font-bold mb-4">Top Moves</h2>

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
