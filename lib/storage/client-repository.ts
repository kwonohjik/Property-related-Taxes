import Dexie from "dexie";
import { db } from "./db";
import { getCurrentUserId } from "./current-user";
import type { UserId } from "./constants";
import type { Client } from "./types";

export interface ClientRepository {
  list(): Promise<Client[]>;
  get(id: string): Promise<Client | null>;
  create(input: Omit<Client, "id" | "userId" | "lastUsedAt" | "createdAt" | "updatedAt">): Promise<Client>;
  update(
    id: string,
    patch: Partial<Pick<Client, "name" | "birthDate" | "phone" | "email" | "memo">>
  ): Promise<void>;
  remove(id: string): Promise<void>;
  /**
   * 해당 의뢰인에 연결된 계산 이력 건수 (단독 삭제 차단 판정용, 결정 D3).
   * in-memory 필터 — `[userId+clientId+createdAt]` 인덱스는 null 키 제외로 미사용 (list 선례).
   */
  countCalculations(id: string): Promise<number>;
  /** 이름·전화·이메일 부분 일치 검색 (대소문자·공백·하이픈 무시, 최대 limit건) */
  search(query: string, limit?: number): Promise<Client[]>;
  /** 최근 사용 N명 (lastUsedAt DESC, null 제외) */
  listRecent(limit: number): Promise<Client[]>;
  /** 계산 저장 시 lastUsedAt 갱신 */
  touch(id: string): Promise<void>;
}

export function createClientRepository(uid: UserId): ClientRepository {
  return {
    async list() {
      const arr = await db.clients
        .where("[userId+createdAt]")
        .between([uid, Dexie.minKey], [uid, Dexie.maxKey])
        .toArray();
      // 가나다순 정렬
      return arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    },

    async get(id) {
      const rec = await db.clients.get(id);
      if (!rec || rec.userId !== uid) return null;
      return rec;
    },

    async create({ name, birthDate, phone, email, memo }) {
      const now = new Date().toISOString();
      const client: Client = {
        id: crypto.randomUUID(),
        userId: uid,
        name,
        birthDate: birthDate ?? null,
        phone: phone ?? null,
        email: email ?? null,
        memo: memo ?? null,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.clients.add(client);
      return client;
    },

    async update(id, patch) {
      const existing = await db.clients.get(id);
      if (!existing || existing.userId !== uid) return;
      await db.clients.update(id, { ...patch, updatedAt: new Date().toISOString() });
    },

    async remove(id) {
      const existing = await db.clients.get(id);
      if (!existing || existing.userId !== uid) return;
      await db.clients.delete(id);
    },

    async countCalculations(id) {
      return db.calculations
        .where("userId")
        .equals(uid)
        .filter((r) => r.clientId === id)
        .count();
    },

    async search(query, limit = 50) {
      const q = query.trim().toLowerCase().replace(/[\s\-]/g, "");
      if (!q) return [];
      // 전체 로드 후 클라이언트 필터 (1,000명 기준 ~50ms, 충분히 빠름)
      const all = await db.clients.where("userId").equals(uid).toArray();
      return all
        .filter((c) => {
          const hay = [c.name, c.phone, c.email]
            .filter(Boolean)
            .join("")
            .toLowerCase()
            .replace(/[\s\-]/g, "");
          return hay.includes(q);
        })
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
        .slice(0, limit);
    },

    async listRecent(limit) {
      const all = await db.clients.where("userId").equals(uid).toArray();
      return all
        .filter((c) => c.lastUsedAt !== null && c.lastUsedAt !== undefined)
        .sort((a, b) => (b.lastUsedAt! > a.lastUsedAt! ? 1 : -1))
        .slice(0, limit);
    },

    async touch(id) {
      const existing = await db.clients.get(id);
      if (!existing || existing.userId !== uid) return;
      await db.clients.update(id, { lastUsedAt: new Date().toISOString() });
    },
  };
}

export const clientRepository = createClientRepository(getCurrentUserId());
