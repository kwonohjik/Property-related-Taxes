import Dexie, { type Table } from "dexie";
import type { UserProfile, CalculationRecord, Client } from "./types";
import { migrateReductionReclassification } from "./migrations/reduction-reclassification";
import type { RtmsTradeRecord } from "@/lib/calc/rtms-similar-sales-filter";

/**
 * Vworld reverseGeocoding 캐시 (PR-RD-5b, 2026-05-25).
 *
 * PK = `${lat.toFixed(5)},${lng.toFixed(5)}` (소수점 5자리 ≈ 1m 해상도).
 * TTL = 7일 (expiresAt 인덱스로 만료 청소).
 * 일일 30,000건 쿼터 절약 + Safari private mode 무력 시 fetch fallback.
 *
 * 계획서: docs/00-pm/inheritance-farming-vworld-reverse-geocode.plan.md v1 §3 S3
 */
export interface ReverseGeocodeCacheRecord {
  /** PK = `${lat.toFixed(5)},${lng.toFixed(5)}` */
  id: string;
  /** 행안부 표준 10자리 시·군·구 코드 */
  sigunguCode: string;
  /** 전체 주소 문자열 */
  address: string;
  /** 시·도 명 */
  sidoName: string;
  /** 시·군·구 명 */
  sigunguName: string;
  /** 캐시 만료 시간 (createdAt + 7일 ms) */
  expiresAt: number;
  /** 캐시 생성 시간 */
  createdAt: number;
}

/**
 * RTMS 실거래가 조회 캐시 (v6, 2026-06-13).
 *
 * PK = `rtms_${lawdCd}_${baseDate}_${taxType}` (기간 단위 캐시 — §9 D5).
 * TTL = 7일 (실거래가는 매일 변경되지 않음, vworld TTL과 통일).
 * 공공데이터포털 일 쿼터(10,000건) 절약 — 동일 조회 재요청 차단.
 */
export interface RtmsSalesCacheRecord {
  /** PK = `rtms_${lawdCd}_${baseDate}_${taxType}` */
  id: string;
  lawdCd: string;
  baseDate: string;   // "YYYY-MM-DD" 평가기준일
  taxType: "inheritance" | "gift";
  records: RtmsTradeRecord[];
  months: string[];   // 조회한 YYYYMM 목록
  createdAt: number;
  expiresAt: number;
}

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
  reverseGeocodeCache!: Table<ReverseGeocodeCacheRecord, string>;
  rtmsSalesCache!: Table<RtmsSalesCacheRecord, string>;

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

    // v5 (PR-RD-5b, 2026-05-25): Vworld reverseGeocoding 캐시 테이블 신규 추가.
    // 기존 4 테이블 schema 변경 없음 — 신규 테이블만 추가, 회귀 위험 최소.
    this.version(5).stores({
      userProfile: "id, updatedAt",
      calculations:
        "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId], [userId+clientId+createdAt]",
      clients: "id, userId, name, lastUsedAt, [userId+name], [userId+createdAt], [userId+lastUsedAt]",
      reverseGeocodeCache: "id, expiresAt",
    });

    // v6 (2026-06-13): RTMS 실거래가 조회 캐시 테이블 신규 추가.
    // 기존 5 테이블 schema 변경 없음 — 신규 rtmsSalesCache 테이블만 추가.
    // 공공데이터포털 일 쿼터(10,000건) 절약 + 7일 TTL.
    this.version(6).stores({
      userProfile: "id, updatedAt",
      calculations:
        "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId], [userId+clientId+createdAt]",
      clients: "id, userId, name, lastUsedAt, [userId+name], [userId+createdAt], [userId+lastUsedAt]",
      reverseGeocodeCache: "id, expiresAt",
      rtmsSalesCache: "id, expiresAt",
    });
  }
}

export const db = new LocalTaxDB();

/** 테스트용 — 모든 테이블 초기화 */
export async function resetLocalDB(): Promise<void> {
  // Dexie transaction 오버로드는 최대 6인자 — 배열 형태로 전달
  await db.transaction(
    "rw",
    [
      db.userProfile,
      db.calculations,
      db.clients,
      db.reverseGeocodeCache,
      db.rtmsSalesCache,
    ],
    async () => {
      await db.userProfile.clear();
      await db.calculations.clear();
      await db.clients.clear();
      await db.reverseGeocodeCache.clear();
      await db.rtmsSalesCache.clear();
    },
  );
}
