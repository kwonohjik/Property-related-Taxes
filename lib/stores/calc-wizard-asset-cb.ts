/**
 * 상업용건물·오피스텔 환산취득가 폼 슬라이스
 * (사례 29 · 「소득세법 시행령」 제164조 제6항 · 제176조의2 제2항 제2호)
 *
 * AssetForm이 extends. 800줄 정책으로 calc-wizard-asset.ts에서 분리(2026-08-04, Phase A-0).
 * 필드 기본값·normalize는 calc-wizard-asset-factory.ts.
 */

export interface CommercialBuildingFormSlice {
  // ── 상업용건물·오피스텔 환산취득가 (사례 29, 소득세법 시행령 §164⑥, §176조의2②2호) ──
  /**
   * 상업용건물·오피스텔 호별고시 시점 분기.
   * - "pre_disclosure": 호별고시 전 취득(~2004.12) → 건물기준시가 3시점 + 역환산 필요
   * - "post_disclosure": 호별고시 후 취득(2005.1~) → 호별고시가만으로 환산 가능
   * commercial_building + useEstimatedAcquisition=true 시만 의미 있음.
   */
  cbEra: "pre_disclosure" | "post_disclosure" | "";
  /** 전용면적 (㎡) */
  cbExclusiveArea: string;
  /** 공유면적 (㎡) */
  cbSharedArea: string;
  /**
   * 대지면적 (㎡) — 「소득세법 시행령」 제164조 제6항 3축(대지·전유·공용) 중 대지.
   * 시점 구분 없는 **단일** 필드다 — `commercial-building-valuation.ts:245,249,258`이
   * 취득·최초공시·양도 3시점 단가에 이 값을 각각 곱한다.   *
   * ⚠️ **단일 필드를 2시점 쌍으로 확장하지 말 것**(2026-07-30 F2 검토 결론).
   *    엔진이 시점별 **단가**에 **같은 면적**을 곱하므로 환산 산식에서 면적이 약분되고
   *    비율은 단가비만 반영한다 — 즉 단일성이 **정확성의 근거**다. 2시점으로 나누면
   *    취득/양도에 다른 면적이 들어가 면적비가 단가비를 상쇄해 **양도차익이 0이 되는**
   *    왜곡(B-4)이 재발한다. anchor `area-axis-single-field-invariant.anchor.test.ts`.
   */
  cbLandArea: string;
  /**
   * 호별 ㎡당 고시가 — 양도시 (원/㎡).
   * 국세청 기준시가 조회 시 "㎡당 가액" 입력.
   * 호별고시 전/후 취득 공통 사용.
   */
  cbUnitPriceAtTransfer: string;
  /**
   * 호별 ㎡당 고시가 — 최초고시(2005) 또는 취득시 (원/㎡).
   * cbEra === "pre_disclosure": 최초고시(2005) 시점 가액.
   * cbEra === "post_disclosure": 취득시 호별고시가.
   */
  cbUnitPriceAtFirstOrAcq: string;
  /**
   * 건물 기준시가 — 취득시 (원, 총액). cbEra === "pre_disclosure" 시만 필수.
   * 법 §99①1호 나목의 가액: 국세청 고시 건물기준시가.
   * 사용자(외부)에서 ㎡당 단가 × 연면적(전유+공용 보정계수 반영)을 미리 곱한 총액 입력.
   */
  cbBuildingStdPriceAtAcq: string;
  /**
   * §164⑥ 단서 — 취득당시 건물 기준시가를 §164⑤ 준용으로 산정했음을 사용자가 확인.
   *
   * 취득연도 ≤ 2000이면 법 §99①1호나목(건물 기준시가)이 고시되기 전이라 그 가액이 없다.
   * 국세청 「취득당시 건물기준시가 산정기준율표」의 취득연도 축이 1985~2000이고
   * `resolveAcqBaseRate()`가 `acqYear > 2000`을 잘라내는 것이 그 경계다.
   * 이때 §164⑥ 단서에 따라 §164⑤을 준용해야 하는데, 준용 산정에는 신축연도·구조·용도가 필요해
   * 엔진이 자동 산정할 수 없다(AssetForm 미보유 — 건물 기준시가 모달에서만 입력).
   * → 사용자의 명시적 확인을 남긴다. cbEra === "pre_disclosure" + 취득연도 ≤2000일 때만 의미 있음.
   */
  cbAcqBuildingStdBy164_5: boolean;
  /**
   * §164⑥ 산식 괄호 단서(§164⑧ 준용) — **B: 전기의 토지 및 건물의 기준시가 합계액** (원, 총액).
   *
   * 취득당시 기준시가합 == 최초고시당시 기준시가합인 경우에만 쓰인다. 미입력 시 준용 산정을
   * 하지 않고(종전 계산 유지) 결과에 경고만 남긴다.
   * 산식: 취득당시 기준시가 = 최초고시 기준시가 × A / [A + (A−B) × C/D]
   */
  cbPrevStdPriceSum: string;
  /**
   * §164⑧ 준용 — **D: 토지 및 건물 기준시가 조정월수**. 빈 값이면 12(시행규칙 §80②1호 통상값).
   */
  cbStdPriceAdjustMonths: string;
  /**
   * 건물 기준시가 — 최초고시시(2005) (원, 총액). cbEra === "pre_disclosure" 시만 필수.
   */
  cbBuildingStdPriceAtFirst: string;
  /**
   * 건물 기준시가 — 양도시 (원, 총액).
   * cbEra === "pre_disclosure": 필수 (역환산 분모의 건물 성분).
   * cbEra === "post_disclosure": 불필요 (호별고시가가 건물+토지 통합).
   */
  cbBuildingStdPriceAtTransfer: string;
  /**
   * 개별공시지가 — 취득시 (원/㎡). LandPriceLookupField로 입력.
   * cbEra === "pre_disclosure": 필수. 취득시 ㎡당기준시가합의 토지 성분.
   * cbEra === "post_disclosure": 취득시 기준시가 산정용.
   */
  cbLandPricePerSqmAtAcq: string;
  /**
   * 개별공시지가 — 최초고시시(2005) (원/㎡). LandPriceLookupField로 입력.
   * cbEra === "pre_disclosure" 시만 필수.
   */
  cbLandPricePerSqmAtFirst: string;
  /**
   * 개별공시지가 — 양도시 (원/㎡). LandPriceLookupField로 입력.
   * cbEra === "pre_disclosure" / "post_disclosure" 공통 필수.
   */
  cbLandPricePerSqmAtTransfer: string;

  // ── 부수토지 기준면적 초과분 비사업용 판정 (「지방세법 시행령」 §101①2호·§101②) ──
  // 위 환산 필드들과 달리 **취득방법 무관**(환산·실거래가·상속 모두)하게 동작한다.

  /**
   * 집합건물 **전체** 대지면적 (㎡). 건축물대장 총괄표제부 기준.
   *
   * ⚠️ 위 `cbLandArea`(해당 호 대지권 지분면적, §164⑥ 3축 중 대지)와 **다른 값**이다.
   * 구분소유 판정에서 지분율은 약분되므로 전체 값으로 초과 비율이 확정된다
   * (`lib/tax-engine/types/commercial-appurtenant.types.ts` 헤더).
   */
  cbTotalLandArea: string;
  /** 집합건물 **전체** 건축물 바닥면적 (㎡, 각 층 중 최대·지하 포함). */
  cbTotalBuildingFootprintArea: string;
  /**
   * 용도지역 — 「지방세법 시행령」 §101② 적용배율 결정.
   * 값은 `lib/tax-engine/local-tax-zone-multiplier.ts` 정본 키와 일치해야 한다.
   */
  cbZoneType: string;
  /**
   * 「지방세법 시행령」 §101① 단서 — true 시 배율과 무관하게 부속토지 전량 비사업용.
   * 무허가 신축 + 불법 용도변경(허가·사용승인 미이행) 포함 — 법제처 해석례 25-0823.
   */
  cbUnapprovedBuilding: boolean;
}
