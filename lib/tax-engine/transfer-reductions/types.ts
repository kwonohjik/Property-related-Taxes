/**
 * 양도세 감면 23개 조문 골격 — 공통 타입
 *
 * Phase 1 (골격) 단계: 모든 조문 stub은 동일 시그니처를 따른다.
 * 각 stub은 `evaluate()` 단일 함수를 export — 시한 검증만 수행하고 후속 단계는 미구현.
 *
 * 매핑 감사: docs/02-design/features/transfer-reduction-mapping-audit.md
 * 인벤토리 표: docs/00-pm/transfer-reduction-expansion.plan.md §3
 */

import type { ReductionEffectCategory } from "../legal-codes/transfer";

/** 23개 조문 식별자 — Phase 1 인벤토리 확정본 */
export type TransferReductionId =
  // 장기임대 §97 시리즈 (6)
  | "rental_97_main"
  | "rental_97_proviso"
  | "rental_97_2"
  | "rental_97_3"
  | "rental_97_4"
  | "rental_97_5"
  // 신축 §99 시리즈 (4)
  | "new_99"
  | "new_99_3"
  | "new_99_4_rural"
  | "new_99_4_hometown"
  // 미분양 §98 시리즈 + §99의2 (10)
  | "unsold_98"
  | "unsold_98_2"
  | "unsold_98_3"
  | "unsold_98_4"
  | "unsold_98_5"
  | "unsold_98_6"
  | "unsold_98_7"
  | "unsold_98_8"
  | "unsold_98_9"
  | "unsold_99_2"
  // 별도 (2)
  | "self_farming"
  | "public_expropriation";

/** 23개 조문 카테고리 분류 — UI 펼침 그룹 매핑 */
export type ReductionCategory =
  | "rental"           // 장기임대 §97 시리즈
  | "new_housing"      // 신축 §99·§99의3·§99의4
  | "unsold_housing"   // 미분양 §98 시리즈 + §99의2
  | "standalone";      // §69 자경농지, §77 공익수용

/** 시한 검증 입력 컨텍스트 */
export interface PeriodCheckContext {
  /** 양도일 (필수) */
  transferDate: Date;
  /** 취득일 — 대부분 조문 사용 */
  acquisitionDate?: Date;
  /** 분양/매매계약일 — §99·§99의3·§99의2·§98 시리즈 일부 (계약 시점이 시한 판정 기준) */
  contractDate?: Date;
  /** 임대 등록일 — §97의3·§97의5 (장기일반민간임대 등록 시점) */
  registrationDate?: Date;
  /** 임대 개시일 — §97 ① 본문 (2000.12.31 이전 임대개시 요건) */
  rentalStartDate?: Date;
  /** 사용승인·사용검사일 — §99 ①항 1호, §99의3 ①항 2호 (자기건설) */
  usageApprovalDate?: Date;
}

/** 시한 검증 결과 */
export interface PeriodCheckResult {
  inPeriod: boolean;
  /** 시한 외 사유 — `inPeriod === false` 일 때만 채움 */
  failReason?: string;
  /** UI에 표시할 시한 라벨 (예: "2001.5.23~2003.6.30") */
  periodLabel?: string;
}

/** 골격 단계 stub 의 표준 결과 — 시한 검증만 통과 시 isEligible:false + "구현 예정" 사유 */
export interface ReductionStubResult {
  id: TransferReductionId;
  isEligible: false;
  inPeriod: boolean;
  failReason: string;
  legalBasis: string;
  category: ReductionCategory;
  effectCategory: ReductionEffectCategory;
  /** UI 활성/전체 카운터·라벨용 메타 */
  meta: {
    article: string;
    periodLabel: string;
    effectLabel: string;
  };
}

/** 23개 stub 라우터의 통합 입력 — 향후 Phase 2~ 본격 구현 시 확장 */
export interface ReductionEvaluationInput extends PeriodCheckContext {
  id: TransferReductionId;
  /** 자산 정보 (전용면적·취득가액·지역 등 — Phase 2~ 사용) */
  asset?: {
    exclusiveAreaSqm?: number;
    acquisitionPrice?: number;
    region?: "metropolitan" | "non_metropolitan" | "outside_overconcentration" | "nationwide";
  };
}
