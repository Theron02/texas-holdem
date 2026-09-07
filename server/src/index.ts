import { createGameServer } from "./server.ts";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const server = createGameServer({ clientOrigin: CLIENT_ORIGIN });
await server.listen(PORT);
console.log(`홀덤 서버 실행 중 → http://localhost:${PORT}`);
