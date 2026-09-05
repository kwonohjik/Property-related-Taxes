/**
 * 상속 부동산 취득가액 의제 폼 슬라이스
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-06-15).
 * 소득세법 시행령 §176조의2④ (pre-deemed) · §163⑨ (post-deemed).
 */

export interface InheritanceAcquisitionFormSlice {
  // ── 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨) ──
  // ⚠️ 종전의 `inheritanceMode` 캐시 필드는 2026-09-03에 제거했다 — 쓰기 지점이 전
  // 저장소에 0건이라 항상 null이었고, 실제 분기는 상속개시일에서 그때그때 파생된다
  // (`InheritedAcquisitionDeemedSection.computeMode`가 유일한 산출 지점).
  /** 상속개시일 (YYYY-MM-DD, 피상속인 사망일) */
  inheritanceStartDate: string;
  /**
   * @deprecated **입력 경로가 없다 — 현행 입력처럼 읽지 말 것** (2026-09-05 · 코드리뷰 Q22).
   *
   * 「피상속인 실지취득가액 입증 가능 여부(case A 전용)」로 선언돼 있으나, 이 두 필드는
   * 팩토리·마이그레이션의 초기값(`false` / `""`)만 있고 **⑤ 위젯도 ④ 전송도 0건**이다.
   * ④가 보내지 않는다는 사실을 anchor가 이미 고정하고 있다
   * (`__tests__/calc/pre-deemed-reported-value-plumbing.test.ts:33` — `toBeUndefined()`).
   *
   * ⑫ Zod(`lib/api/transfer-tax-schema-acq-deemed.ts:41`)에는 아직 키와 refine이 남아 있다.
   * 저장된 이력이 그 키를 담고 있을 수 있어 제거는 호환 확인이 선행돼야 한다 — 그래서
   * **서술만 정정**했다. 되살리려면 ⑤ → ④ → ⑫ 순서로 열 것(⑫만 있으면 도달하지 않는다).
   *
   * ⚠️ 가업상속(`familyBusinessInheritance.decedentAcquisitionPrice`)은 **같은 이름의 다른 축**이고
   *    그쪽은 살아 있다 — 전역 치환 금지(memory `feedback_rename_same_name_two_axes`).
   */
  hasDecedentActualPrice: boolean;
  /** @deprecated 위 `hasDecedentActualPrice`와 같은 사유 — 입력 경로 없음 (Q22). */
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
