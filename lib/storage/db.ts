import Dexie, { type Table } from "dexie";
import type { UserProfile, CalculationRecord, Client } from "./types";

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
    // UserProfile에 mode 필드 추가 (기존 레코드: undefined → upsertProfile 시 "taxpayer" 기본값 적용)
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
