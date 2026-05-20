import Dexie from "dexie";
import { db } from "./db";
import { getCurrentUserId } from "./current-user";
import type { UserId } from "./constants";
import {
  type CalculationRecord,
  type LocalTaxType,
  MAX_CALCULATIONS_PER_USER,
} from "./types";
import { computeContentHash, computeInputHash } from "./content-hash";

export type CalculationSaveInput = Omit<
  CalculationRecord,
  "id" | "userId" | "createdAt" | "updatedAt" | "contentHash"
>;

export interface CalculationRepository {
  /** @deprecated `saveOrUpdateByContent` 사용 — dedup 차단을 위해 신규 코드에서 직접 호출 금지 */
  save(input: CalculationSaveInput): Promise<string>;
  /**
   * 동일 입력+결과+의뢰인 조합이면 `updatedAt`만 갱신 (created: false),
   * 다르면 신규 record 추가 (created: true).
   *
   * dedup 키: `(userId, taxType, clientId ?? null, contentHash)`
   */
  saveOrUpdateByContent(
    input: CalculationSaveInput
  ): Promise<{ id: string; created: boolean }>;

  /**
   * 신규 — draft(임시저장) 전용 (v4).
   * 동일 inputHash+clientId 조합의 draft가 있으면 갱신, 없으면 신규 추가.
   * draft 식별: `Object.keys(resultData).length === 0`.
   */
  saveDraftByContent(
    input: CalculationSaveInput
  ): Promise<{ id: string; created: boolean }>;

  /**
   * 신규 — 동일 inputHash+clientId의 draft만 일괄 삭제 (v4).
   * `Object.keys(resultData).length === 0` 필터로 final 보호.
   *
   * 자동저장(useAutoSaveCalculation) + 수동 final 저장 직전에 호출하여
   * draft→final 자동 승격을 구현.
   *
   * @returns 삭제된 draft 수
   */
  deleteDraftsByInput(
    inputData: Record<string, unknown>,
    clientId: string | null,
    taxType: LocalTaxType
  ): Promise<number>;
  list(filter?: { taxType?: LocalTaxType; clientId?: string | null }): Promise<CalculationRecord[]>;
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

    async saveOrUpdateByContent(input) {
      const hash = await computeContentHash(input.inputData, input.resultData);
      const inputHash = await computeInputHash(input.inputData);

      // dedup 후보 조회 — 사용자×세목 내 (≤200건) full scan은 μs 단위
      const candidates = await db.calculations
        .where("[userId+taxType+createdAt]")
        .between(
          [uid, input.taxType, Dexie.minKey],
          [uid, input.taxType, Dexie.maxKey]
        )
        .toArray();
      const targetClientId = input.clientId ?? null;
      const existing = candidates.find(
        (r) => r.contentHash === hash && (r.clientId ?? null) === targetClientId
      );

      if (existing) {
        await db.calculations.update(existing.id, {
          title: input.title,
          taxLawVersion: input.taxLawVersion,
          linkedCalculationId: input.linkedCalculationId,
          // v4: 기존 record가 inputHash 없으면 함께 부여
          ...(existing.inputHash ? {} : { inputHash }),
          updatedAt: new Date().toISOString(),
        });
        return { id: existing.id, created: false };
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.transaction("rw", db.calculations, async () => {
        const count = await db.calculations.where("userId").equals(uid).count();
        if (count >= MAX_CALCULATIONS_PER_USER) {
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
          contentHash: hash,
          inputHash,
          createdAt: now,
          updatedAt: now,
        });
      });
      return { id, created: true };
    },

    async saveDraftByContent(input) {
      const inputHash = await computeInputHash(input.inputData);

      const candidates = await db.calculations
        .where("[userId+taxType+createdAt]")
        .between(
          [uid, input.taxType, Dexie.minKey],
          [uid, input.taxType, Dexie.maxKey]
        )
        .toArray();
      const targetClientId = input.clientId ?? null;
      const existing = candidates.find(
        (r) =>
          r.inputHash === inputHash &&
          (r.clientId ?? null) === targetClientId &&
          Object.keys(r.resultData).length === 0 // draft 한정
      );

      if (existing) {
        await db.calculations.update(existing.id, {
          title: input.title,
          taxLawVersion: input.taxLawVersion,
          linkedCalculationId: input.linkedCalculationId,
          updatedAt: new Date().toISOString(),
        });
        return { id: existing.id, created: false };
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.transaction("rw", db.calculations, async () => {
        const count = await db.calculations.where("userId").equals(uid).count();
        if (count >= MAX_CALCULATIONS_PER_USER) {
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
          inputHash,
          // contentHash 부재 — draft 식별 신호 (resultData {} 와 함께)
          createdAt: now,
          updatedAt: now,
        });
      });
      return { id, created: true };
    },

    async deleteDraftsByInput(inputData, clientId, taxType) {
      const inputHash = await computeInputHash(inputData);

      const candidates = await db.calculations
        .where("[userId+taxType+createdAt]")
        .between([uid, taxType, Dexie.minKey], [uid, taxType, Dexie.maxKey])
        .toArray();

      const targetClientId = clientId ?? null;
      const targets = candidates.filter(
        (r) =>
          r.inputHash === inputHash &&
          (r.clientId ?? null) === targetClientId &&
          Object.keys(r.resultData).length === 0 // ★ draft 한정 — final 보호
      );

      for (const t of targets) {
        await db.calculations.delete(t.id);
      }
      return targets.length;
    },

    async list(filter) {
      let arr: CalculationRecord[];
      if (filter?.taxType) {
        arr = await db.calculations
          .where("[userId+taxType+createdAt]")
          .between(
            [uid, filter.taxType, Dexie.minKey],
            [uid, filter.taxType, Dexie.maxKey]
          )
          .toArray();
      } else {
        arr = await db.calculations
          .where("[userId+createdAt]")
          .between([uid, Dexie.minKey], [uid, Dexie.maxKey])
          .toArray();
      }
      arr.reverse();
      if (filter?.clientId !== undefined) {
        return arr.filter((r) => r.clientId === filter.clientId);
      }
      return arr;
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
