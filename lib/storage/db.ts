import Dexie, { type Table } from "dexie";
import type { UserProfile, CalculationRecord } from "./types";

/**
 * KoreanTaxCalc 로컬 저장소.
 *
 * 인덱스 설계:
 *   - userProfile: PK=id (단일 사용자지만 향후 다중 프로필 대비)
 *   - calculations: PK=id, 단일 인덱스(userId/taxType/createdAt)
 *     복합 인덱스:
 *       [userId+createdAt]            → 최신순 전체 목록
 *       [userId+taxType+createdAt]    → 세목별 필터 + 최신순
 *       [userId+linkedCalculationId]  → 재산세↔종부세 연동 조회
 *
 * 모든 SELECT는 userId 키 선두로만 접근. 향후 Supabase 마이그레이션 시 동일 패턴 유지.
 */
class LocalTaxDB extends Dexie {
  userProfile!: Table<UserProfile, string>;
  calculations!: Table<CalculationRecord, string>;

  constructor() {
    super("KoreanTaxCalcLocal");

    this.version(1).stores({
      userProfile: "id, updatedAt",
      calculations:
        "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId]",
    });
  }
}

export const db = new LocalTaxDB();

/** 테스트용 — 모든 테이블 초기화 */
export async function resetLocalDB(): Promise<void> {
  await db.transaction("rw", db.userProfile, db.calculations, async () => {
    await db.userProfile.clear();
    await db.calculations.clear();
  });
}
