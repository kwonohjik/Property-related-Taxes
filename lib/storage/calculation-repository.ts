import Dexie from "dexie";
import { db } from "./db";
import { getCurrentUserId } from "./current-user";
import type { UserId } from "./constants";
import {
  type CalculationRecord,
  type LocalTaxType,
  MAX_CALCULATIONS_PER_USER,
} from "./types";

export interface CalculationRepository {
  save(
    input: Omit<CalculationRecord, "id" | "userId" | "createdAt" | "updatedAt">
  ): Promise<string>;
  list(filter?: { taxType?: LocalTaxType }): Promise<CalculationRecord[]>;
  get(id: string): Promise<CalculationRecord | null>;
  update(
    id: string,
    patch: Partial<Omit<CalculationRecord, "id" | "userId" | "createdAt">>
  ): Promise<void>;
  remove(id: string): Promise<void>;
  clearAll(): Promise<void>;
  count(): Promise<number>;
}

/**
 * uid를 클로저로 캡처. 모든 메서드는 uid 필터를 강제.
 *
 * 200건 상한 정책: save() 시 카운트 초과면 가장 오래된 1건 삭제 (Supabase와 동일).
 * 타 uid 레코드 보호: get/update/remove에서 userId 일치 검증 → 불일치면 무시.
 */
export function createCalculationRepository(uid: UserId): CalculationRepository {
  return {
    async save(input) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      await db.transaction("rw", db.calculations, async () => {
        const count = await db.calculations.where("userId").equals(uid).count();
        if (count >= MAX_CALCULATIONS_PER_USER) {
          // 가장 오래된 1건 삭제
          const oldest = await db.calculations
            .where("[userId+createdAt]")
            .between([uid, Dexie.minKey], [uid, Dexie.maxKey])
            .first();
          if (oldest) await db.calculations.delete(oldest.id);
        }
        await db.calculations.add({
          ...input,
          id,
          userId: uid,
          createdAt: now,
          updatedAt: now,
        });
      });

      return id;
    },

    async list(filter) {
      if (filter?.taxType) {
        const arr = await db.calculations
          .where("[userId+taxType+createdAt]")
          .between(
            [uid, filter.taxType, Dexie.minKey],
            [uid, filter.taxType, Dexie.maxKey]
          )
          .toArray();
        return arr.reverse();
      }
      const arr = await db.calculations
        .where("[userId+createdAt]")
        .between([uid, Dexie.minKey], [uid, Dexie.maxKey])
        .toArray();
      return arr.reverse();
    },

    async get(id) {
      const rec = await db.calculations.get(id);
      return rec && rec.userId === uid ? rec : null;
    },

    async update(id, patch) {
      const rec = await db.calculations.get(id);
      if (!rec || rec.userId !== uid) return;
      await db.calculations.update(id, {
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    },

    async remove(id) {
      const rec = await db.calculations.get(id);
      if (!rec || rec.userId !== uid) return;
      await db.calculations.delete(id);
    },

    async clearAll() {
      await db.calculations.where("userId").equals(uid).delete();
    },

    async count() {
      return db.calculations.where("userId").equals(uid).count();
    },
  };
}

/** 기본 인스턴스 — 호출 측은 uid를 의식하지 않음 */
export const calculationRepository = createCalculationRepository(getCurrentUserId());
