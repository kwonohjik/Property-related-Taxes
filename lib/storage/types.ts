import type { UserId } from "./constants";

/**
 * 로컬 저장 가능한 세목.
 * Supabase `calculations.tax_type` CHECK 제약과 동일.
 */
export type LocalTaxType =
  | "transfer"
  | "inheritance"
  | "gift"
  | "acquisition"
  | "property"
  | "comprehensive_property"
  | "stock_transfer";

/** 프로필 모드: 일반 납세자 | 세무사·대리인 */
export type UserMode = "taxpayer" | "professional";

/**
 * 사용자 프로필 (단일 사용자 가정).
 * 향후 Supabase `users` 테이블과 컬럼명 일치.
 */
export interface UserProfile {
  /** 로컬: LOCAL_USER_ID, 향후: auth.users.id */
  id: UserId;
  displayName: string;
  /** 'YYYY-MM-DD' — 60세 이상 장기보유공제·세대원 판정 기반 */
  birthDate: string | null;
  /** 프로필 모드. 기본값: "taxpayer" */
  mode: UserMode;
  createdAt: string;
  updatedAt: string;
}

/**
 * 세무사 모드에서 관리하는 의뢰인(납세자).
 */
export interface Client {
  /** crypto.randomUUID() */
  id: string;
  userId: UserId;
  name: string;
  /** 'YYYY-MM-DD' — 고령자 세액공제 판단 기반 */
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  memo: string | null;
  /** 마지막 계산 저장 시 갱신 — 최근사용 정렬 기준. null = 미사용 */
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 계산 이력 1건.
 * 향후 Supabase `calculations` 테이블과 컬럼명 일치.
 */
export interface CalculationRecord {
  /** crypto.randomUUID() */
  id: string;
  /** 모든 쿼리의 필터 키. 로컬: LOCAL_USER_ID, 향후: auth.uid() */
  userId: UserId;
  taxType: LocalTaxType;
  /** 사용자 식별 라벨 (자동 생성, 수정 가능) */
  title: string;
  /** 마법사 폼 전체 (zustand 상태 직렬화) */
  inputData: Record<string, unknown>;
  /** 엔진 계산 결과 (TransferTaxResult 등) */
  resultData: Record<string, unknown>;
  /** 적용된 세율 effective_date */
  taxLawVersion: string;
  /** 재산세↔종부세 연동 (nullable) */
  linkedCalculationId: string | null;
  /** 세무사 모드: 해당 계산의 의뢰인 ID (null = 본인 또는 미지정) */
  clientId: string | null;
  /**
   * dedup 키 — `sha1Hex(stableStringify(input) + "|" + stableStringify(result)).slice(0,16)`.
   * `saveOrUpdateByContent` 호출 시점에만 자동 부여. 기존 레코드는 undefined.
   * 인덱스 없음 — 단순 컬럼 (사용자당 200건 상한 내 in-memory full scan으로 충분).
   */
  contentHash?: string;
  /**
   * 입력만의 해시 (v4 신규) — `sha1Hex(stableStringify(input)).slice(0,16)`.
   * draft 매칭 + draft→final 자동 승격에 사용.
   * draft·final 양쪽 모두 부여. 기존 레코드는 undefined.
   * 인덱스 없음.
   */
  inputHash?: string;
  createdAt: string;
  updatedAt: string;
}

/** 사용자당 최대 저장 건수 (Supabase 정책과 동일) */
export const MAX_CALCULATIONS_PER_USER = 200;

/**
 * 한도 경고 임계값 (v4) — 본 값 이상 시 `/history`에 경고 배너 + 저장 토스트에 한도 라인 노출.
 * MAX_CALCULATIONS_PER_USER(200) - 10 = 190.
 */
export const HISTORY_WARNING_THRESHOLD = 190;
