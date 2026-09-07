import { useEffect, useRef, useState } from "react";
import {
  CHAT_MAX_LENGTH,
  type ChatMessage,
  type ChatOrLogEntry,
} from "../../../shared/types.ts";

type Entry =
  | { kind: "log"; at: number; text: string }
  | { kind: "chat"; at: number; msg: ChatMessage };

interface Props {
  logs: ChatOrLogEntry[];
  chat: ChatMessage[];
  youId: string;
  onSend: (text: string) => void;
  /** 모바일에서 접었다 폈다 */
  open: boolean;
  onToggle: () => void;
  unread: number;
}

export default function ChatPanel({
  logs, chat, youId, onSend, open, onToggle, unread,
}: Props) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 게임 진행 로그와 채팅을 시간순으로 한 줄기로 합친다
  const entries: Entry[] = [
    ...logs.map((l) => ({ kind: "log" as const, at: l.at, text: l.text })),
    ...chat.map((m) => ({ kind: "chat" as const, at: m.at, msg: m })),
  ].sort((a, b) => a.at - b.at);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries.length, open]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t.slice(0, CHAT_MAX_LENGTH));
    setText("");
  };

  return (
    <aside className={`chat${open ? " chat-open" : ""}`}>
      <button type="button" className="chat-toggle" onClick={onToggle}>
        {open ? "닫기" : "채팅"}
        {!open && unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>

      {open && (
        <>
          <div className="chat-scroll" ref={scrollRef}>
            {entries.length === 0 && <p className="chat-empty">아직 대화가 없습니다.</p>}
            {entries.map((e, i) =>
              e.kind === "log" ? (
                <div key={`l${e.at}-${i}`} className="chat-log">{e.text}</div>
              ) : (
                <div
                  key={`c${e.at}-${i}`}
                  className={`chat-line${e.msg.playerId === youId ? " mine" : ""}`}
                >
                  <b>
                    {e.msg.name}
                    {e.msg.spectator && <em className="chat-spec">관전</em>}
                  </b>
                  <span>{e.msg.text}</span>
                </div>
              )
            )}
          </div>

          <div className="chat-input">
            <input
              value={text}
              maxLength={CHAT_MAX_LENGTH}
              placeholder="메시지 입력"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
                // 테이블 단축키가 채팅 입력을 가로채지 않게 한다
                e.stopPropagation();
              }}
            />
            <button type="button" className="btn" onClick={send} disabled={!text.trim()}>
              보내기
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
