/**
 * SplitAcquisitionFormSlice — 토지·건물 취득일 분리(소령 §166⑥) 파트별 입력.
 * AssetForm이 extends. 800줄 정책으로 calc-wizard-asset.ts에서 분리.
 */
export interface SplitAcquisitionFormSlice {
  // ── 토지/건물 취득일 분리 (housing·building 공통) ──
  /**
   * 토지·건물의 소유자가 다른 경우 본인 소유 부분 지정 (소령 §166⑥, §168②).
   * "both" (기본): 토지·건물 모두 본인.
   * "building_only": 건물만 본인 (토지는 배우자·타인 소유).
   * "land_only": 토지만 본인.
   */
  selfOwns: "both" | "building_only" | "land_only";
  /** 토지와 건물의 취득일이 다른지 여부 (원시취득·신축 등) */
  hasSeperateLandAcquisitionDate: boolean;
  /** 토지 취득일 (YYYY-MM-DD) — hasSeperateLandAcquisitionDate === true 시 필수 */
  landAcquisitionDate: string;
  /**
   * **토지 파트의 취득 원인** — 건물을 신축하고 그 토지는 상속·증여로 취득한 경우(2026-07-30).
   *
   * `acquisitionCause`는 자산 단위 단일값이라 "건물=신축 / 토지=상속"을 표현할 수 없었다.
   * ""(미설정)이면 토지도 자산 전체 원인을 따른다(종전 동작).
   *
   * 취득가액은 사용자가 입력한 평가액이 `landAcquisitionPrice`(actual 모드)로 흐른다 — 상속 §163⑨ 평가액·증여
   * 신고가액은 모두 "확인된 취득가액"이다. 원인 자체도 엔진에 전달되어(`buildLandPartCausePayload`) 상속 토지의
   * 세율 보유기간 통산(「소득세법」 §104②1호)과 추계 차단(D0)에 쓰인다. 읽는 쪽은 저장값이 아니라
   * `effectiveLandAcquisitionCause`(lib/calc/transfer-land-part-cause.ts)를 쓴다 — 블록이 닫힌 자산의 잔재는 「없음」.
   *
   * D2(건물 상속·증여 + 토지 매매): 상속·증여 호스트에서는 `"purchase"`만 유효하다 — 읽는 쪽은 `effectiveBuildingCauseMix`
   * (D1 술어 `effectiveLandAcquisitionCause`는 `"purchase"`를 돌려주지 않는다 — D1 소비처가 매매 토지를 상속 토지로 읽는 것을 막는다).
   */
  landAcquisitionCause: "" | "inheritance" | "gift" | "purchase";
  /**
   * 「토지는 다른 원인으로 취득」 토글을 **어느 건물 취득원인에서 켰는가**(D1-2 — 클라이언트 전용, ④가 보내지 않는다).
   * 유효 원인은 이 값이 현재 `acquisitionCause`와 같을 때만 성립한다(`effectiveLandAcquisitionCause`). 신축에서 켠 뒤
   * 매매로 바꾼 잔재가 매매 화면에서 「켜짐」으로 되살아나 토지 원인·신축비용 후퇴가 계산에 쓰이는 것을 막는다
   * (계획서 transfer-acq-cause-mixed.plan.md §10.2 T-8 · UI 설계 §3). 쓰는 곳은 토글 ON/OFF 한 곳뿐.
   */
  landCauseHost: "" | "newConstruction" | "purchase" | "inheritance" | "gift";
  /**
   * 토지 파트 피상속인 취득일 — `landAcquisitionCause === "inheritance"` 시 「소득세법」
   * 제104조 제2항 제1호 보유기간 통산(세율 판정)에 쓰인다. 미입력 시 토지 취득일 기준(현행).
   */
  landDecedentAcquisitionDate: string;
  /**
   * 토지 파트 증여자 취득일 — **입력 칸 없음**(D0 G-8). 단순 증여는 §104②2호 통산 대상이 아니다(2호는 §97의2①
   * 이월과세 자산만). 종전 칸에서 저장된 값이 남을 수 있으나 ④가 보내지 않는다.
   */
  landDonorAcquisitionDate: string;
  /**
   * 토지 파트 취득 방식 — 4-way 독립(소득령 §166⑥, 토지·건물 취득일 분리 모드 전용).
   * `landSplitMode`(구, 취득·양도 겸용 토글)를 대체 — 취득은 이 필드가 단일 소스.
   * ""(미선택) 시 자산 전체 레거시 플래그에서 파생 — `lib/calc/transfer-tax-split-acq-mode.ts` 참조.
   */
  landAcqMode: "" | "actual" | "estimated" | "appraisal" | "salesCase";
  /** 건물 파트 취득 방식 — landAcqMode와 완전 독립(파트별 4-way) */
  buildingAcqMode: "" | "actual" | "estimated" | "appraisal" | "salesCase";
  /**
   * 양도가액 **토지·건물 안분 방식** — 이 자산 **내** 토지·건물 분리 축.
   * 자산 **간** 일괄양도 안분 축인 `bundledSaleMode`(폼-전역)와 레벨이 달라 공존한다.
   *
   * | 값 | 의미 | 근거 |
   * |---|---|---|
   * | `"actual"` | 구분양도 — 계약서에 구분 기재 | 「소득세법」 §100② |
   * | `"appraisal"` | 감정평가액으로 안분 | §166⑥ → 「부가가치세법 시행령」 §64①1호 |
   * | `"apportioned"` | 양도시 기준시가 비율로 안분 (기본) | §166⑥ → 부가령 §64①2호 |
   *
   * 🔴 **`"appraisal"`은 2026-08-07 신설**이다. 종전에는 「일괄양도」 라디오 + 「감정평가가액으로
   *    안분」 **토글**이 따로 있어, 라디오 라벨이 「기준시가 비율로 안분」인데 토글을 켜면 실제로는
   *    감정평가액으로 안분되는 **라벨-동작 모순**이 있었다(사용자 보고). 안분 basis는 축 하나이므로
   *    3-way 라디오로 합쳤다.
   *
   * ⚠️ **엔진은 이 필드를 읽지 않는다**(`transfer-tax-api-split.ts:75` 실측). 실제 스위치는
   *    payload에 값이 실리는지 여부다 — `"actual"`이면 `land/buildingTransferPrice`,
   *    `"appraisal"`이면 `land/buildingAppraisalAtTransfer`가 전달된다. 그래서 모드를 바꿀 때
   *    **쓰지 않는 쪽 값을 비워야** 화면에 없는 값이 basis를 조용히 가르지 않는다.
   */
  saleSplitMode: "apportioned" | "actual" | "appraisal";
  /**
   * 양도시 **감정평가가액** — 안분 basis 서열 **1순위**
   * (「부가가치세법 시행령」 제64조 제1항 제1호 단서 · 「소득세법 시행령」 제166조 제6항이 차용).
   * 있으면 양도시 기준시가보다 **우선**해 양도가액을 안분한다.
   *
   * ⚠️ 토지·건물 **양쪽 다** 있어야 채택된다 — 한쪽만이면 엔진이 「미평가」로 보고 배제한다.
   */
  landAppraisalAtTransfer: string;
  /** 양도시 감정평가가액 (건물분) — 위와 동일한 규칙 */
  buildingAppraisalAtTransfer: string;
  /**
   * 감정일자 — **시기 요건 판정에 필수**다. 유효 창 = [(양도연도 − 1)-01-01, 양도연도-12-31]
   * (부가령 §64①1호 괄호 + 「소득세법」 제5조 제1항 역년). 벗어나면 기준시가로 후퇴한다.
   */
  appraisalDateAtTransfer: string;
  /**
   * 「소득세법 시행령」 제166조 제8항 **예외** — 선택하면 §100③ 30% 의제가 발동하지 않는다.
   * 3-state(`partialAcqDistinct` 선례): ""(미선택) 기본.
   */
  saleSplitExemption: "" | "other_law" | "demolished_land_only";
  /** 예외 **근거** — 선택 시 필수(validate 차단). 남용 억제 + 신고서 각주 재료. */
  saleSplitExemptionNote: string;
  /** 토지 파트 매매사례가액 (원) — landAcqMode === "salesCase" 시 직접입력, 미입력 시 §166⑥ 안분 */
  landSalesCaseValue: string;
  /** 건물 파트 매매사례가액 (원) — buildingAcqMode === "salesCase" 시 직접입력 */
  buildingSalesCaseValue: string;
  /** 토지 양도가액 (실제 모드 또는 안분 override) */
  landTransferPrice: string;
  /** 건물 양도가액 (실제 모드 또는 안분 override) */
  buildingTransferPrice: string;
  /** 토지 취득가액 (실거래가 모드 시) */
  landAcquisitionPrice: string;
  /** 건물 취득가액 (실거래가 모드 시) */
  buildingAcquisitionPrice: string;
  /** 토지 자본적지출·필요경비 */
  landDirectExpenses: string;
  /** 건물 자본적지출·필요경비 */
  buildingDirectExpenses: string;
  /** 토지 양도시 기준시가 — 환산취득가 분리 계산 시 사용 */
  landStandardPriceAtTransfer: string;
  /** 건물 양도시 기준시가 — 환산취득가 분리 계산 시 사용 */
  buildingStandardPriceAtTransfer: string;
}
