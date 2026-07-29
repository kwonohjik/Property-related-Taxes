/**
 * 상속 부동산 취득가액 의제 폼 슬라이스
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-06-15).
 * 소득세법 시행령 §176조의2④ (pre-deemed) · §163⑨ (post-deemed).
 */

export interface InheritanceAcquisitionFormSlice {
  // ── 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨) ──
  /**
   * 의제취득일(1985.1.1.) 기준 자동 분기 결과 (UI read-only).
   * - "pre-deemed": 상속개시일 < 1985-01-01 → max(환산가액, 실가×물가상승률)
   * - "post-deemed": 상속개시일 ≥ 1985-01-01 → 상속세 신고가액
   * - null: 상속개시일 미입력 또는 미적용
   */
  inheritanceMode: "pre-deemed" | "post-deemed" | null;
  /** 상속개시일 (YYYY-MM-DD, 피상속인 사망일) */
  inheritanceStartDate: string;
  /** 피상속인 실지취득가액 입증 가능 여부 (case A 전용) */
  hasDecedentActualPrice: boolean;
  /** 피상속인 실지취득가액 (원 단위 문자열, hasDecedentActualPrice=true 시) */
  decedentAcquisitionPrice: string;
  /** 상속세 신고 시 적용한 평가방법 (case B) */
  inheritanceValuationMethod:
    | "market_value"
    | "appraisal"
    | "auction_public_sale"
    | "similar_sale"
    | "supplementary"
    | "";
  /** 보충적평가 보조계산 사용 여부 (case B + supplementary 선택 시) */
  useSupplementaryHelper: boolean;
  /** 보조계산: 토지 면적 (㎡) */
  supplementaryLandArea: string;
  /** 보조계산: 개별공시지가 (원/㎡) */
  supplementaryLandUnitPrice: string;
  /** 보조계산: 건물 공시가격 (원 총액) */
  supplementaryBuildingValue: string;
}
