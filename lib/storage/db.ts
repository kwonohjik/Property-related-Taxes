import Dexie, { type Table } from "dexie";
import type { UserProfile, CalculationRecord, Client } from "./types";
import { migrateReductionReclassification } from "./migrations/reduction-reclassification";

/**
 * KoreanTaxCalc 로컬 저장소.
 *
 * 인덱스 설계:
 *   - userProfile: PK=id
 *   - calculations: PK=id, 복합 인덱스 4종
 *   - clients: PK=id, 세무사 모드 의뢰인 관리
 *
 * 모든 SELECT는 userId 키 선두로만 접근. 향후 Supabase 마이그레이션 시 동일 패턴 유지.
 */
class LocalTaxDB extends Dexie {
  userProfile!: Table<UserProfile, string>;
  calculations!: Table<CalculationRecord, string>;
  clients!: Table<Client, string>;

  constructor() {
    super("KoreanTaxCalcLocal");

    this.version(1).stores({
      userProfile: "id, updatedAt",
      calculations:
        "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId]",
    });

    // v2: clients 테이블 추가 + calculations에 clientId 인덱스 추가
    this.version(2)
      .stores({
        userProfile: "id, updatedAt",
        calculations:
          "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId], [userId+clientId+createdAt]",
        clients: "id, userId, name, [userId+name], [userId+createdAt]",
      })
      .upgrade((tx) =>
        tx
          .table("calculations")
          .toCollection()
          .modify((r) => {
            if (r.clientId === undefined) r.clientId = null;
          })
      );

    // v3: clients에 lastUsedAt 필드 + 인덱스 추가 (최근사용 정렬)
    this.version(3)
      .stores({
        userProfile: "id, updatedAt",
        calculations:
          "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId], [userId+clientId+createdAt]",
        clients: "id, userId, name, lastUsedAt, [userId+name], [userId+createdAt], [userId+lastUsedAt]",
      })
      .upgrade((tx) =>
        tx
          .table("clients")
          .toCollection()
          .modify((c) => {
            if (c.lastUsedAt === undefined) c.lastUsedAt = null;
          })
      );

    // v4 (Phase 2, 2026-05-06): 양도세 감면 분류 정정 자동 마이그레이션
    // - unsold_housing(잘못 §99의3 매핑) → new_99_3 또는 unsold_98_3 (취득일 기반)
    // - long_term_rental → rental_97_3
    // - new_housing → new_99
    // 사용자 결정사항 #3 (2026-05-06): 자동 변환 정책
    this.version(4)
      .stores({
        userProfile: "id, updatedAt",
        calculations:
          "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId], [userId+clientId+createdAt]",
        clients: "id, userId, name, lastUsedAt, [userId+name], [userId+createdAt], [userId+lastUsedAt]",
      })
      .upgrade(async (tx) => {
        await migrateReductionReclassification(tx);
      });
  }
}

export const db = new LocalTaxDB();

/** 테스트용 — 모든 테이블 초기화 */
export async function resetLocalDB(): Promise<void> {
  await db.transaction("rw", db.userProfile, db.calculations, db.clients, async () => {
    await db.userProfile.clear();
    await db.calculations.clear();
    await db.clients.clear();
  });
}
