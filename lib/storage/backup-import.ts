/**
 * 이력 백업 — Import (JSON → 로컬 IndexedDB).
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §4-4
 * 전략:
 * - merge: contentHash 기준 중복 스킵(legacy는 재계산). id 충돌 시 신규 id + 매핑.
 * - overwrite: 기존 데이터 삭제 후 일괄 삽입.
 * - 참조 무결성: clients 선삽입 → clientId 유효. linkedCalculationId 재매핑(매핑 적용)
 *   + 참조 대상 없으면 null 정규화(orphan).
 * - userId는 항상 현재 uid로 재태깅. 200건 상한 유지.
 *
 * 해시 재계산은 Dexie transaction 밖에서 수행(tx 내 비-IDB await = PrematureCommit).
 */

import Dexie from "dexie";
import { db } from "./db";
import { getCurrentUserId } from "./current-user";
import type { UserId } from "./constants";
import {
  type CalculationRecord,
  type Client,
  MAX_CALCULATIONS_PER_USER,
} from "./types";
import { computeContentHash } from "./content-hash";
import type { BackupFile } from "./backup-export";

export type ImportMode = "merge" | "overwrite";

export interface ImportResult {
  /** 신규 삽입 건수 */
  added: number;
  /** 중복(동일 contentHash)으로 스킵된 건수 */
  skipped: number;
  /** 참조 대상이 없어 null로 정리된 linkedCalculationId 건수 */
  linksCleared: number;
}

export async function importBackup(
  backup: BackupFile,
  mode: ImportMode,
  uid: UserId = getCurrentUserId(),
): Promise<ImportResult> {
  let added = 0;
  let skipped = 0;
  let linksCleared = 0;

  // ── overwrite: 기존 데이터 삭제 ──
  if (mode === "overwrite") {
    await db.transaction(
      "rw",
      [db.calculations, db.clients, db.userProfile],
      async () => {
        await db.calculations.where("userId").equals(uid).delete();
        await db.clients.where("userId").equals(uid).delete();
        await db.userProfile.delete(uid);
      },
    );
  }

  // ── userProfile ──
  if (backup.userProfile) {
    const existing = mode === "merge" ? await db.userProfile.get(uid) : null;
    if (!existing) {
      await db.userProfile.put({ ...backup.userProfile, id: uid });
    }
  }

  // ── clients (id 보존, merge 시 id·name 중복 스킵) ──
  const existingClients = await db.clients.where("userId").equals(uid).toArray();
  const existingClientIds = new Set(existingClients.map((c) => c.id));
  const existingClientNames = new Set(existingClients.map((c) => c.name));
  const clientsToPut: Client[] = [];
  for (const c of backup.clients) {
    if (
      mode === "merge" &&
      (existingClientIds.has(c.id) || existingClientNames.has(c.name))
    ) {
      continue;
    }
    clientsToPut.push({ ...c, userId: uid });
    existingClientIds.add(c.id);
    existingClientNames.add(c.name);
  }
  if (clientsToPut.length) await db.clients.bulkPut(clientsToPut);

  // ── calculations ──
  const existingCalcs = await db.calculations.where("userId").equals(uid).toArray();
  const existingIds = new Set(existingCalcs.map((r) => r.id));
  const existingHashes = new Set(
    existingCalcs.map((r) => r.contentHash).filter(Boolean) as string[],
  );
  const existingIdByHash = new Map<string, string>();
  for (const r of existingCalcs) {
    if (r.contentHash) existingIdByHash.set(r.contentHash, r.id);
  }

  const idMap = new Map<string, string>(); // 백업 id → 실제 삽입 id (충돌 재생성 또는 스킵 매칭)
  const toInsert: CalculationRecord[] = [];

  for (const rec of backup.calculations) {
    // 해시 확보 (merge dedup용; legacy는 재계산 — transaction 밖)
    let hash = rec.contentHash;
    if (mode === "merge") {
      if (!hash) hash = await computeContentHash(rec.inputData, rec.resultData);
      if (existingHashes.has(hash)) {
        // 동일 내용 존재 → 스킵. link 재매핑 위해 기존 레코드 id로 매핑.
        const matchedId = existingIdByHash.get(hash);
        if (matchedId && matchedId !== rec.id) idMap.set(rec.id, matchedId);
        skipped++;
        continue;
      }
    }

    // id 충돌(기존 또는 백업 내 중복) → 신규 id 부여 + 매핑
    let id = rec.id;
    if (existingIds.has(id) || idMap.has(rec.id)) {
      id = crypto.randomUUID();
      idMap.set(rec.id, id);
    }
    existingIds.add(id);
    if (hash) {
      existingHashes.add(hash);
      existingIdByHash.set(hash, id);
    }

    toInsert.push({
      ...rec,
      id,
      userId: uid,
      ...(hash ? { contentHash: hash } : {}),
    });
    added++;
  }

  // ── linkedCalculationId 재매핑 + orphan null ──
  const allIds = new Set<string>([
    ...existingCalcs.map((r) => r.id),
    ...toInsert.map((r) => r.id),
  ]);
  for (const rec of toInsert) {
    if (rec.linkedCalculationId) {
      const mapped = idMap.get(rec.linkedCalculationId) ?? rec.linkedCalculationId;
      if (allIds.has(mapped)) {
        rec.linkedCalculationId = mapped;
      } else {
        rec.linkedCalculationId = null;
        linksCleared++;
      }
    }
  }

  if (toInsert.length) await db.calculations.bulkPut(toInsert);

  // ── 200건 상한 유지 (oldest 삭제) ──
  await enforceLimit(uid);

  return { added, skipped, linksCleared };
}

async function enforceLimit(uid: UserId): Promise<void> {
  const count = await db.calculations.where("userId").equals(uid).count();
  if (count <= MAX_CALCULATIONS_PER_USER) return;
  const excess = count - MAX_CALCULATIONS_PER_USER;
  const oldest = await db.calculations
    .where("[userId+createdAt]")
    .between([uid, Dexie.minKey], [uid, Dexie.maxKey])
    .limit(excess)
    .toArray();
  await db.calculations.bulkDelete(oldest.map((r) => r.id));
}
