"use client";

// TEMPORARY Phase 0 connectivity check. Delete once real features exist.
import { useEffect, useRef, useState } from "react";
import { API_URL, WS_URL } from "@/lib/config";

type Health = { state: "pending" } | { state: "ok" } | { state: "error"; detail: string };
type SocketState = "connecting" | "open" | "closed";

export default function StatusPage() {
  const [health, setHealth] = useState<Health>({ state: "pending" });
  const [elapsed, setElapsed] = useState(0);
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [frames, setFrames] = useState<string[]>([]);
  const [text, setText] = useState("hello over ws");
  const socketRef = useRef<WebSocket | null>(null);

  // Render's free tier can take ~50s to wake, so show elapsed time instead of failing fast.
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    fetch(`${API_URL}/health`)
      .then(async (res) => {
        const body = await res.json();
        setHealth(
          res.ok && body.status === "ok"
            ? { state: "ok" }
            : { state: "error", detail: `HTTP ${res.status} ${JSON.stringify(body)}` },
        );
      })
      .catch((err: unknown) => setHealth({ state: "error", detail: String(err) }))
      .finally(() => clearInterval(timer));
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}?token=phase0`);
    socketRef.current = ws;
    ws.onopen = () => {
      setSocketState("open");
      ws.send(JSON.stringify({ type: "ping", data: {} }));
    };
    ws.onmessage = (event) => setFrames((prev) => [...prev, String(event.data)]);
    ws.onclose = () => setSocketState("closed");
    return () => ws.close();
  }, []);

  function send() {
    socketRef.current?.send(JSON.stringify({ type: "message", data: { text } }));
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 font-mono text-sm">
      <h1 className="text-lg font-semibold">Phase 0 connectivity check</h1>

      <section className="flex flex-col gap-1">
        <h2 className="font-semibold">REST</h2>
        <p className="opacity-70">GET {API_URL}/health</p>
        {health.state === "pending" && <p>Waiting for backend… {elapsed}s (cold start can take ~50s)</p>}
        {health.state === "ok" && <p className="text-green-600">✓ status: ok</p>}
        {health.state === "error" && <p className="text-red-600">✗ {health.detail}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">WebSocket</h2>
        <p className="opacity-70">{WS_URL}</p>
        <p className={socketState === "open" ? "text-green-600" : socketState === "closed" ? "text-red-600" : ""}>
          state: {socketState}
        </p>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="flex-1 rounded border border-gray-300 px-2 py-1"
          />
          <button
            onClick={send}
            disabled={socketState !== "open"}
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {frames.map((frame, i) => (
            <li key={i} className="rounded bg-gray-100 px-2 py-1 break-all text-gray-900">
              {frame}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
