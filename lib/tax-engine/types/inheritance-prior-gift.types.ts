/**
 * 사전증여(PriorGift) 관련 타입 (상증법 §13·§47·§57·§58)
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (2026-05-22).
 * barrel: inheritance-gift.types.ts에서 re-export.
 */

import type { DonorRelation, GiftDonorRelation } from "./inheritance-gift.types";

/** 10년 이내 사전증여 내역 */
export interface PriorGift {
  giftDate: string; // ISO date
  /**
   * 수증인 상속인 여부 (상속인 10년 / 비상속인 5년).
   * @deprecated beneficiaryType 사용 권장. beneficiaryType="heir"에서 자동 도출.
   */
  isHeir: boolean;
  giftAmount: number;
  /** 당시 납부한 증여세 (§28 증여세액공제 계산용, 정보용) */
  giftTaxPaid: number;
  /**
   * 당시 증여세 과세표준 ⑤ (§58 ① 안분 한도 분자용).
   * 가장 최근 합산 회차의 ⑤가 §58·§57 한도 산식의 분자로 사용됨.
   */
  giftTaxBase?: number;
  /** 수증인 관계 */
  doneeRelation?: DonorRelation;
  // ===== Phase A: 동일인 §47 합산 + §58·§57 한도 산식용 =====
  /** 그 회차의 증여자 관계 (동일인 그룹화 판정용) */
  donor?: GiftDonorRelation;
  /** 그 회차의 산출세액 ⑦ (§58 ⑭/⑧ — 가장 최근 합산 회차의 ⑦이 사용됨) */
  computedTax?: number;
  /** 그 회차의 추가 할증세액 ⑫ (§57 ⑨ 누적용, 세대생략 회차에만 입력) */
  additionalGenerationSkipSurcharge?: number;
  /** 그 회차에 §57 세대생략 할증 적용 여부 (미입력 시 donor=grandparent에서 자동 도출) */
  wasGenerationSkip?: boolean;

  // ===== 종합사례 PDF 확장 (Design §2-2) =====
  /** 수증자 ID — Heir.id 참조. 상속인별 배부에 필수. */
  doneeId?: string;
  /**
   * 수증자 유형:
   *   - "heir": 상속인 (§13 ① 10년)
   *   - "legatee": 비상속인 수유자 (§13 ② 5년) — 자연인
   *   - "corporate": 비상속인 영리법인 (§13 ② 5년 + §3의2② 면제)
   * 미설정 시 legacy isHeir에서 자동 추론.
   */
  beneficiaryType?: "heir" | "legatee" | "corporate";
  /** 영리법인 사전증여 당시 증여세 산출세액 (§3의2② 면제 한도). beneficiaryType="corporate" 시 필수. */
  corporateGiftComputedTax?: number;
  /**
   * 본 PriorGift가 사용자 이력에서 조회되어 자동 채워졌을 때의 출처 CalculationRecord.id.
   * UI 메타 — "📋 이력 기반" 배지 + 결과 화면 출처 링크용. 엔진은 무시.
   * GiftTaxForm.buildInput 변환 시 strip되어 GiftTaxInput에 전달되지 않음 (지점 ④).
   * priorGiftSchema에도 optional로 정의되어 있음 (지점 ⑨ 안전망).
   */
  sourceCalculationId?: string;

  // 신고서 부표 1 표시 메타 (2026-05-20) — 엔진 무관. 사전증여 행 ②/③ 컬럼.
  /** ② 재산종류코드. 미입력 시 fallback "12 기타재산". */
  propertyCategory?: GiftPriorPropertyCategory;
  /** 자산 명칭. ③ 보조. */
  propertyName?: string;
  /** 소재지·법인명. ③ 주. 미입력 시 fallback "사전증여 (YYYY-MM-DD)". */
  propertyLocation?: string;
  /**
   * PR 3 (부표 1 enum 정합화) — 토지II 부수토지 토글.
   * propertyCategory="real_estate_land" 일 때만 의미.
   *   true  → 부표 03 토지II (일반건물 부수토지)
   *   false → 부표 02 토지I (순수토지)
   *   undefined → 부표 02/03 (구분 미지정, legacy 호환)
   */
  isAttachedLandToBuilding?: boolean;
}

/**
 * PriorGift.propertyCategory — 별지 제9호서식 부표 1 재산종류코드 매핑.
 * KoreanLaw MCP 검증 (2026-05-21).
 *
 *   01 현금 = "cash"
 *   02/03 토지I/II = "real_estate_land" (isAttachedLandToBuilding 토글)
 *   04 개별주택 = "real_estate_individual_house"
 *   05 공동주택 = "real_estate_apartment"
 *   06 오피스텔·상업용 = "real_estate_officetel"
 *   07 일반건물 = "real_estate_building"
 *   08 부동산을 취득할 수 있는 권리 = "real_estate_acquisition_right"
 *   09 유가증권(상장) = "listed_stock"
 *   10 유가증권(비상장) = "unlisted_stock"
 *   11 금융재산 = "financial" / "deposit"
 *   12 기타재산 = "other"
 *
 * Out-of-Scope: 13 가상자산 / 14 서화·골동품 등
 */
export type GiftPriorPropertyCategory =
  | "cash"
  | "real_estate_land"
  | "real_estate_individual_house"
  | "real_estate_apartment"
  | "real_estate_officetel"
  | "real_estate_building"
  | "real_estate_acquisition_right"
  | "listed_stock"
  | "unlisted_stock"
  | "financial"
  | "deposit"
  | "other";

/**
 * PR 3 — 별지 제9호서식 부표 1 재산구분코드 (12종).
 * 자동 추론 — `inferPropertyKindCode(gift, specialTreatment)` 헬퍼 사용.
 *   A11 상속재산 (상속인) / A12 (상속인 외) / A13 상속개시 전 처분재산
 *   A21~A24 증여재산 가산 (상속인·외·창업·가업)
 *   B11~B22 비과세·과세가액불산입 (본 PR 범위 외)
 */
export type EstatePropertyKindCode =
  | "A11" | "A12" | "A13"
  | "A21" | "A22" | "A23" | "A24"
  | "B11" | "B12" | "B13" | "B21" | "B22";
