import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const base = (window.location.protocol === "https:" ? "https" : "http") + "://" + window.location.hostname + (window.location.port ? `:${window.location.port}` : "");
    // connect to backend at same host/port 4000 (frontend served on 3000, backend on 4000 behind nginx in prod)
    const backendOrigin = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:4000" : `${base.replace(/:3000$/, ":4000")}`;
    socket = io(backendOrigin, { transports: ["websocket", "polling"] });
  }
  return socket;
}