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
  | "comprehensive_property";

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
  createdAt: string;
  updatedAt: string;
}

/** 사용자당 최대 저장 건수 (Supabase 정책과 동일) */
export const MAX_CALCULATIONS_PER_USER = 200;
