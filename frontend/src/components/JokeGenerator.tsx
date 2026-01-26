import React, { useState, useCallback } from "react";

type JokeData = {
  error?: boolean;
  category?: string;
  type?: string;
  joke?: string;
  setup?: string;
  delivery?: string;
  id?: number | string;
};

const API_URL = "https://v2.jokeapi.dev/joke/Any?type=single&blacklistFlags=nsfw,religious,political,racist,sexist,explicit";

export default function JokeGenerator() {
  const [joke, setJoke] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJoke = useCallback(async () => {
    setLoading(true);
    setError(null);
    setJoke("");
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: JokeData = await res.json();
      const text = data.joke ?? (data.setup && data.delivery ? `${data.setup} — ${data.delivery}` : "No joke.");
      setJoke(text);
      setCategory(data.category ?? "");
    } catch (err: any) {
      setError(err.message || "Failed to fetch joke");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(joke);
      alert("Copied to clipboard");
    } catch {
      alert("Copy failed");
    }
  }, [joke]);

  const handleShare = useCallback(() => {
    const text = joke.slice(0, 240);
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + " #joke")}`;
    window.open(url, "_blank", "noopener");
  }, [joke]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif", padding: 16 }}>
      <div style={{ padding: 18, background: "#fff", borderRadius: 10, boxShadow: "0 6px 18px rgba(10,20,30,0.06)" }}>
        <h3 style={{ marginTop: 0 }}>Random Joke Generator</h3>
        <div style={{ minHeight: 80, fontSize: 18, color: "#111" }}>
          {loading ? "Loading…" : error ? <span style={{ color: "#b33" }}>{error}</span> : joke || "Click the button to get a joke."}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={fetchJoke} disabled={loading} style={{ background: "#0b79f7", color: "#fff", border: 0, padding: "8px 12px", borderRadius: 6 }}>
            {loading ? "…" : "New joke"}
          </button>
          <button onClick={handleCopy} disabled={!joke} style={{ padding: "8px 12px", borderRadius: 6 }}>
            Copy
          </button>
          <button onClick={handleShare} disabled={!joke} style={{ padding: "8px 12px", borderRadius: 6 }}>
            Share
          </button>

          <div style={{ marginLeft: "auto", color: "#666", fontSize: 13 }}>
            {category ? `Category: ${category}` : null}
          </div>
        </div>
      </div>
    </div>
  );
}