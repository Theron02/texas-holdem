import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  ChatOrLogEntry,
  GameMode,
  PlayerAction,
  RoomState,
  ShowdownResult,
  Standing,
} from "../../../shared/types.ts";

/**
 * 개발 중에는 Vite(:5173)와 서버(:3001)가 따로 뜨므로 서버를 직접 가리킨다.
 * 배포 빌드는 기본적으로 같은 출처에 붙는다 — 서버가 이 파일까지 서빙하는 구성.
 * 서버를 따로 배포했다면 빌드할 때 VITE_SERVER_URL로 덮어쓴다.
 */
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);

/** 새로고침하거나 잠깐 끊겨도 같은 자리로 돌아오기 위한 영구 id */
function getPlayerId(): string {
  const key = "holdem:playerId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export interface HoldemConnection {
  connected: boolean;
  state: RoomState | null;
  logs: ChatOrLogEntry[];
  showdown: ShowdownResult | null;
  /** 새 핸드가 시작될 때 잠깐 true — 셔플 연출용 */
  shuffling: boolean;
  error: string | null;
  createRoom: (name: string, mode: GameMode) => void;
  joinRoom: (name: string, roomId: string) => void;
  startHand: () => void;
  act: (action: PlayerAction) => void;
  rebuy: () => void;
  leave: () => void;
  standings: Standing[] | null;
}

export function useHoldem(): HoldemConnection {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<RoomState | null>(null);
  const [logs, setLogs] = useState<ChatOrLogEntry[]>([]);
  const [showdown, setShowdown] = useState<ShowdownResult | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handRef = useRef(0);
  const rejoinRef = useRef<{ name: string; roomId: string } | null>(null);
  const [standings, setStandings] = useState<Standing[] | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // 끊겼다 붙은 경우 같은 방으로 자동 복귀.
      // 방이 이미 사라졌다면(서버 재시작 등) 죽은 테이블에 붙들려 있지 않도록 로비로 돌려보낸다.
      const rejoin = rejoinRef.current;
      if (rejoin) {
        socket.emit(
          "room:join",
          { ...rejoin, playerId: getPlayerId() },
          (res: Ack<{ roomId: string }>) => {
            if (res.ok) return;
            rejoinRef.current = null;
            setState(null);
            setShowdown(null);
            setLogs([]);
            setError("방이 사라졌습니다. 다시 입장해 주세요.");
          }
        );
      }
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("room:state", (s: RoomState) => {
      setState(s);
      // 핸드 번호가 올라가면 새 판 — 셔플 연출을 띄우고 이전 결과를 지운다
      if (s.handNumber !== handRef.current && s.phase === "preflop") {
        handRef.current = s.handNumber;
        setShowdown(null);
        setShuffling(true);
        setTimeout(() => setShuffling(false), 900);
      }
    });
    socket.on("showdown:result", (r: ShowdownResult) => setShowdown(r));
    socket.on("game:finished", (p: { standings: Standing[] }) => {
      setStandings(p.standings);
      setShowdown(null);
    });
    socket.on("room:log", (e: ChatOrLogEntry) =>
      setLogs((cur) => [...cur.slice(-40), e])
    );

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const handle = useCallback((res: Ack<unknown>) => {
    setError(res.ok ? null : res.error);
  }, []);

  const createRoom = useCallback(
    (name: string, mode: GameMode) => {
      socketRef.current?.emit(
        "room:create",
        { name, playerId: getPlayerId(), mode },
        (res: Ack<{ roomId: string }>) => {
          if (res.ok) rejoinRef.current = { name, roomId: res.data.roomId };
          handle(res);
        }
      );
    },
    [handle]
  );

  const joinRoom = useCallback(
    (name: string, roomId: string) => {
      socketRef.current?.emit(
        "room:join",
        { name, roomId, playerId: getPlayerId() },
        (res: Ack<{ roomId: string }>) => {
          if (res.ok) rejoinRef.current = { name, roomId: res.data.roomId };
          handle(res);
        }
      );
    },
    [handle]
  );

  const startHand = useCallback(() => {
    socketRef.current?.emit("room:start", handle);
  }, [handle]);

  const act = useCallback(
    (action: PlayerAction) => {
      socketRef.current?.emit("player:action", action, handle);
    },
    [handle]
  );

  const rebuy = useCallback(() => {
    socketRef.current?.emit("player:rebuy", handle);
  }, [handle]);

  const leave = useCallback(() => {
    socketRef.current?.emit("room:leave");
    rejoinRef.current = null;
    setState(null);
    setShowdown(null);
    setStandings(null);
    setLogs([]);
  }, []);

  return {
    connected, state, logs, showdown, shuffling, error, standings,
    createRoom, joinRoom, startHand, act, rebuy, leave,
  };
}
