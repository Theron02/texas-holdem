import { customAlphabet } from "nanoid";
import { Room, type RoomOptions } from "./room.ts";

// 헷갈리는 글자(0/O, 1/I)를 뺀 초대 코드 알파벳
const makeCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export interface ManagerOptions extends RoomOptions {
  /** 빈 방을 지우기까지 기다리는 시간. 방장이 새로고침해도 코드가 살아 있어야 한다. */
  emptyRoomTtlMs?: number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private pendingDestroy = new Map<string, NodeJS.Timeout>();
  private readonly emptyRoomTtlMs: number;

  constructor(private defaults: ManagerOptions = {}) {
    this.emptyRoomTtlMs = defaults.emptyRoomTtlMs ?? 120_000;
  }

  create(hostId: string, opts: RoomOptions = {}): Room {
    let id = makeCode();
    while (this.rooms.has(id)) id = makeCode();
    const room = new Room(id, hostId, { ...this.defaults, ...opts });
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id.toUpperCase());
  }

  /**
   * 아무도 없는 방을 예약 삭제한다. 유예 시간 안에 누군가 (다시) 들어오면
   * 타이머가 깨어날 때 좌석 수를 다시 보고 삭제를 취소한다.
   */
  destroyIfEmpty(id: string): void {
    const room = this.rooms.get(id);
    if (!room || room.seatedCount > 0) return;
    if (this.pendingDestroy.has(id)) return;

    const timer = setTimeout(() => {
      this.pendingDestroy.delete(id);
      const current = this.rooms.get(id);
      if (current && current.seatedCount === 0) {
        current.dispose();
        this.rooms.delete(id);
      }
    }, this.emptyRoomTtlMs);
    timer.unref?.();
    this.pendingDestroy.set(id, timer);
  }

  get count(): number {
    return this.rooms.size;
  }

  /** 서버를 내릴 때 타이머를 정리한다. */
  dispose(): void {
    for (const t of this.pendingDestroy.values()) clearTimeout(t);
    this.pendingDestroy.clear();
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
