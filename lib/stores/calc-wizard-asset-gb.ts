/**
 * GeneralBuildingFormSlice — 일반건물(general_building) + 겸용주택(commercial_building) 폼 필드.
 * calc-wizard-asset.ts 800줄 정책 준수를 위해 분리 (Phase 2, 2026-06-22).
 * AssetForm이 이 slice를 extend한다.
 */

export interface GeneralBuildingFormSlice {
  // ── 일반건물(토지+건물 일괄) 환산취득가 (사례 31, 영 §176의2②, §163⑥) ──
  // useEstimatedAcquisition=true + assetKind="general_building" 시 GeneralBuildingBlock 노출.
  /** 양도시 토지 공시지가 (원/㎡). LandPriceLookupField. 안분 분모: ×gbLandArea. */
  gbTransferLandPricePerSqm: string;
  /** 양도시 건물기준시가 총액 (원). 국세청 기준시가 조회. */
  gbTransferBuildingValue: string;
  /** 취득시 토지 공시지가 (원/㎡). LandPriceLookupField. 환산 분자: ×gbLandArea. */
  gbAcqLandPricePerSqm: string;
  /** 취득시 건물기준시가 총액 (원). 환산 분자 + 개산공제 기준액. */
  gbAcqBuildingValue: string;
  /**
   * 토지 부수면적 (㎡). 안분(§166⑥)·환산(§176의2②)·개산공제(§163⑥)·NBL 판정 공통 사용.
   * 시점 구분 없는 **단일** 필드다 — `general-building-valuation.ts:506,535`가
   * 양도시·취득시 단가에 이 값을 각각 곱한다.   *
   * ⚠️ **단일 필드를 2시점 쌍으로 확장하지 말 것**(2026-07-30 F2 검토 결론).
   *    엔진이 시점별 **단가**에 **같은 면적**을 곱하므로 환산 산식에서 면적이 약분되고
   *    비율은 단가비만 반영한다 — 즉 단일성이 **정확성의 근거**다. 2시점으로 나누면
   *    취득/양도에 다른 면적이 들어가 면적비가 단가비를 상쇄해 **양도차익이 0이 되는**
   *    왜곡(B-4)이 재발한다. anchor `area-axis-single-field-invariant.anchor.test.ts`.
   */
  gbLandArea: string;
  /** 건물 연면적(㎡). 자산 식별·표시용. */
  gbBuildingArea: string;
  /**
   * 건축물 바닥면적(㎡) — 「지방세법 시행령」 제101조 제1항 제2호 부수토지 한도의 곱셈 기준.
   *
   * ⚠️ **「건축법 시행령」 제119조 제1항 제3호의 「바닥면적」이며, 지하층을 포함한
   *    각 층의 바닥면적 중 가장 넓은 값**이다(대법원 2015.6.24. 2012두7073 ·
   *    대법원 1994.5.13. 93누18242 · 조심 2011지505 · 조심 2025지0451).
   *
   * 같은 조 제2호의 **건축면적**(외벽 중심선 수평투영면적)이 **아니다** — 조심 2025지0451
   * (2026.03.20, 기각)에서 청구인이 건축면적 기준을 주장했으나 배척됐다. 발코니·연결 다리·
   * 관람석 등이 건축면적에는 산입되나 바닥면적에서는 제외돼 두 값이 유의미하게 다르다.
   *
   * 종전 주석·UI는 "건축물대장 건축면적(= 바닥면적)"으로 안내했고 그것이 오답이었다
   * (2026-07-30 정정). 「소득세법」 제89조 제1항 제3호의 「건물이 **정착**된 면적」
   * (`buildingFootprintArea`, 1층 정착면적)과도 **다른 개념**이다 — 통합 금지.
   */
  gbBuildingFootprintArea: string;

  // ── 일반건물 비사업용토지 판정 ──
  // 근거: 「소득세법」 제104조의3 제1항 제4호 나목 → 「지방세법」 제106조 제1항 제2호
  //       → 「지방세법 시행령」 제101조 제1항 제2호·제2항(용도지역별 적용배율).
  /** 용도지역. 「지방세법 시행령」 제101조 제2항 배율 결정 기준 (필수 — 미입력 시 계산 차단). */
  gbZoneType: string;
  /**
   * @deprecated 2026-07-30 — 배율에 영향 없음.
   * 「지방세법 시행령」 제101조 제2항에는 수도권 축이 없다(용도지역만으로 결정).
   * 종전에는 「소득세법 시행령」 제168조의12(주택 부수토지) 배율을 잘못 적용해
   * 이 값이 3배/5배를 갈랐다. UI 토글은 제거했고 배관만 남겼다 —
   * 다른 소비처 없음(`transfer-tax-api-gb.ts` → 엔진 `isMetropolitan` 미사용).
   */
  gbIsMetropolitan: boolean;
  /**
   * 「지방세법 시행령」 §101① 단서 해당 여부 — true 시 부속토지 전량 비사업용.
   * 무허가 신축 + 불법 용도변경(허가·사용승인 미이행) 포함 — 법제처 해석례 25-0823.
   */
  gbIsUnregistered: boolean;

  /**
   * 「소득세법」 §104③ **미등기양도자산** — 토지 축 / 건물 축.
   *
   * ⚠️ **바로 위 `gbIsUnregistered`와 전혀 다른 축이다.** 그쪽은 「지방세법 시행령」 §101① 단서의
   *    허가·사용승인 미이행(부속토지 전량 비사업용)이고, 이름만 닮았다.
   *
   * 일반건물은 등기 여부를 **토지·건물 각각** 판단한다 — 둘은 별개 부동산이고 등기부도 별도라
   * 건물만 미등기(무허가 신축)이고 토지는 등기된 조합이 실무에서 흔하다. 증축분(건물2 카드)은
   * 건물 축을 따른다(민법 §256 부합 — 표시변경등기이지 별도 소유권보존등기가 아니다).
   *
   * 이 두 값이 가르는 것: ① 개산공제율(§163⑥1호 단서 3/1000) ② 세율군(§104①10호 70% 버킷).
   * 그래서 GB는 폼-전역 `isUnregistered`를 쓰지 않는다(단일 boolean으로는 표현 불가).
   */
  gbLandUnregistered: boolean;
  gbBuildingUnregistered: boolean;

  /**
   * 건물 취득원인 (일반건물 전용, 사례 32 이후).
   * - "purchase": 매매
   * - "inheritance": 상속
   * - "gift": 증여
   * - "newConstruction": 신축(자가건축) — §114조의2 가산세 판정 기준
   * - "carryover_gift": 배우자등 이월과세 — 법 §97의2①은 「**토지·건물** 등」이라 건물도 대상이다
   * undefined: 미선택 (⑧ validate에서 차단)
   */
  gbBuildingAcquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "newConstruction"
    | "carryover_gift";
  /**
   * **건물 파트** 이월과세 입력 — `gbBuildingAcquisitionCause === "carryover_gift"` 시.
   *
   * 토지는 자산-수준 `carryover`를 쓰고, 건물은 이 필드를 쓴다. 증여자 취득일·취득가액이
   * 파트마다 다를 수 있기 때문이다(법 §95④·§97의2①1호).
   *
   * 🔑 **증여 사건 정보(등기일·산출세액·과세가액·배제선언)는 `carryover` 쪽 하나만** 쓴다 —
   *    하나의 증여이므로 두 벌을 두면 어긋난다.
   */
  buildingCarryover?: import("./calc-wizard-asset-carryover").CarryoverTaxationForm;
  /**
   * ⛔ `gbBuildingAcquisitionDate` 폐기 (2026-08-05 M-1a).
   * 건물 취득일은 **`acquisitionDate`**, 토지 취득일은 **`landAcquisitionDate`**다
   * (주택·건물과 동일한 split 규약). legacy 키는 `migrateGbAcquisitionDateConvention`이
   * 1회 스왑 후 삭제한다. 이 자리에 건물 전용 날짜 필드를 다시 만들지 말 것.
   */

  /**
   * 토지·건물(원건물) 일괄 취득 시 발생한 필요경비 (원).
   * 사례 33 일괄 모드 전용 — `useEstimatedAcquisition === false && gbHasExtension === true`일 때 의미 가짐.
   * 중개수수료·취득세·인지대 등 §97① 가목 부대비용. 미입력 시 0원 처리.
   * 엔진은 토지·건물1 안분(취득시 기준시가 비율)에 사용 — `actualBundledExpenses`로 매핑.
   * 이 필드 신설 전(legacy)에는 `transferExpense`(양도비) 필드가 임시 매핑되었으나 의미 충돌로 분리.
   */
  gbBundledAcquisitionExpenses: string;

  // ── 사례 33: 증축 건물 환산취득가 (소득세법 시행령 §176의2②, §166⑥) ──
  /**
   * 증축 유무 ToggleCard.
   * true 시 extensionInfo 서브객체를 빌드하여 API에 전달.
   * false(default) 시 나머지 5필드 무시 — normalize에서 폐기.
   */
  gbHasExtension: boolean;

  /**
   * 증축일 (건물2 취득일, YYYY-MM-DD).
   * 영 §162①4호 기준: 사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날.
   * 범위: 토지 취득일(exclusive) ~ 양도일(exclusive).
   */
  gbExtensionDate: string;

  /**
   * 증축 면적 (㎡, 정보용 — 산식 미사용).
   * 현 시점 안분식에 미사용. 위치지수 산정 등 후속 확장 대비.
   * 선택 필드: 모르는 경우 비워도 계산에 영향 없음.
   */
  gbExtensionArea: string;

  /**
   * 양도시 건물2(증축분) 기준시가 총액 (원).
   * ⚠ 면적 × 단가가 아닌 총액 직접 입력. 안분 분모 3항의 건물2 성분.
   */
  gbTransferExtensionBuildingStdPrice: string;

  /**
   * 취득시(증축시) 건물2 기준시가 총액 (원).
   * ⚠ 면적 × 단가가 아닌 총액 직접 입력. 환산 비율 분자: 취득시 총액 / 양도시 총액.
   */
  gbAcquisitionExtensionBuildingStdPrice: string;

  /**
   * 증축 취득원인.
   * "newConstruction": 자가증축 (default). §114조의2 가산세 대상.
   * "purchase": 증축부 매수. §114조의2 적용 여부는 엔진 판단.
   */
  gbExtensionAcquisitionCause: "purchase" | "newConstruction";

  /**
   * 증축분 취득방식.
   * "estimated": 환산취득가 (default) — 증축시·양도시 건물기준시가 비율로 산정.
   * "actual": 실거래가 — gbExtensionActualAcquisitionPrice 직접 입력.
   * 빈 문자열: 미선택 (normalize에서 "estimated" fallback).
   */
  gbExtensionAcquisitionMode: "" | "actual" | "estimated";

  /**
   * 증축 실거래가 (원).
   * gbExtensionAcquisitionMode === "actual" 시 필수.
   * validate에서 차단.
   */
  gbExtensionActualAcquisitionPrice: string;

  /**
   * 증축 시 발생한 실제 필요경비 (원).
   * gbExtensionAcquisitionMode === "actual" 시 입력 가능.
   * 미입력 시 0원 처리.
   */
  gbExtensionActualExpenses: string;

  /**
   * §114조의2① 85㎡ 초과 게이트 전용 증축부분 바닥면적 합계 (㎡).
   * extensionArea(연면적 정보용)와 별도 필드. extensionAcquisitionCause==="newConstruction" 시만 유효.
   * 미입력(0)이면 85㎡ 이하 처리로 가산세 미발동.
   */
  gbExtensionFloorArea85: string;

  // ── 사례 35: 주택→상가 용도변경 (사전법규재산 2022-684) ──
  /** 주택→상가 단일 용도변경 토글 (general_building 한정). */
  gbHouseToCommercialConversion: boolean;
  /** 용도변경일 (YYYY-MM-DD). gbHouseToCommercialConversion=true 시 필수. */
  gbConversionDate: string;
  /** 변경 당시 다주택자 여부. null=미선택(강제). true=다주택 → LTHD 기산일 이동. */
  gbWasMultiHouseAtConversion: boolean | null;

  // ── 사례 35 후속-1: §99-164-10 환산주택가격 (취득가액 불명 케이스) ──
  /** "주택으로 최초공시 후 상가로 용도변경" 토글. 환산 모드에서만 의미. */
  gbHasFirstDisclosure: boolean;
  /** 최초공시주택가격 (원). gbHasFirstDisclosure=true 시 필수. */
  gbFirstDisclosurePrice: string;
  /** 최초공시 당시 토지 기준시가 총액 (원). */
  gbFirstDisclosureLandStdPrice: string;
  /** 최초공시 당시 건물 기준시가 총액 (원). */
  gbFirstDisclosureBuildingStdPrice: string;
  /**
   * §163⑨ 상속개시일 건물 신고가액 (원, 문자열). gbBuildingAcquisitionCause === "inheritance" 시 필수.
   * 상속세 신고서·결정통지서상 건물 평가액(상증법 §60~66). 취득당시 실지거래가액 의제 —
   * 환산·개산공제(§163⑥) 미적용. Phase 1은 공시된 정상 케이스만(미공시 §163⑨2호 max는 Phase 2).
   */
  gbBuildingInheritedValue: string;

  // ── 겸용주택 분리계산 (sodt §160①단서, 2022.1.1 이후) ──
  /** 겸용주택 여부 토글 */
  isMixedUseHouse: boolean;
  /** 주택 전용면적 (㎡) — 공통면적 안분 전 (연면적 파생 원천) */
  residentialExclusiveArea: string;
  /** 상가 전용면적 (㎡) — 공통면적 안분 전 */
  commercialExclusiveArea: string;
  /** 공통(공용)면적 (㎡) — 전용면적 비율로 안분 */
  commonArea: string;
  /** 주택 연면적 (㎡) — 전용+공통안분 파생 결과 (UI read-only) */
  residentialFloorArea: string;
  /** 비주택(상가·사무·근린·주차장) 연면적 합계 (㎡) — 파생 결과 */
  nonResidentialFloorArea: string;
  /** 건물 정착면적 = 1층 면적 (㎡) */
  buildingFootprintArea: string;
  /**
   * 전체 토지 면적 (㎡) — 겸용주택용. 시점 구분 없는 **단일** 필드다
   * (`transfer-tax-mixed-use-helpers.ts:246,262`가
   *  `landAreaAtAcquisition = landAreaAtFirstDisclosure = totalLandArea`로 명시 대입).
   * 주거·상가 안분값(`residentialLandArea` 등)은 **분해값**이라 별개 필드가 정본이다.   *
   * ⚠️ **단일 필드를 2시점 쌍으로 확장하지 말 것**(2026-07-30 F2 검토 결론).
   *    엔진이 시점별 **단가**에 **같은 면적**을 곱하므로 환산 산식에서 면적이 약분되고
   *    비율은 단가비만 반영한다 — 즉 단일성이 **정확성의 근거**다. 2시점으로 나누면
   *    취득/양도에 다른 면적이 들어가 면적비가 단가비를 상쇄해 **양도차익이 0이 되는**
   *    왜곡(B-4)이 재발한다. anchor `area-axis-single-field-invariant.anchor.test.ts`.
   */
  mixedUseTotalLandArea: string;
  /**
   * 주택 부수토지 면적 수동 지정 (㎡) — PHD OFF 전용, 취득·양도 양시점 공통.
   * 빈값=자동 안분(전체 × 주택연면적비율). UI는 상가칸 편집→역산(전체−상가) 저장.
   */
  mixedResidentialLandAreaOverride: string;
  /**
   * 상가 부수토지 면적 수동 지정 (㎡) — PHD OFF 전용, 취득·양도 양시점 공통.
   * 빈값=자동(잔액). 주택·상가 둘 다 지정 시 잔액 미적용 → 합계 불일치는 validate가 차단.
   */
  mixedCommercialLandAreaOverride: string;
  /**
   * 주택 정착면적 수동 지정 (㎡) — §168의12 배율초과 NBL 판정에 사용.
   * 빈값=자동(정착면적 × 주택연면적비율). UI는 상가 정착칸 편집→역산(전체−상가) 저장.
   */
  mixedResidentialFootprintOverride: string;
  /** 양도시 개별주택공시가격 (원) */
  mixedTransferHousingPrice: string;
  /** 양도시 상가건물 기준시가 (원, 토지 제외) */
  mixedTransferCommercialBuildingPrice: string;
  /** 양도시 개별공시지가 (원/㎡) */
  mixedTransferLandPricePerSqm: string;
  /**
   * §164⑨1호 공익수용 — 상가분 토지 보상액 총액 (원) — 겸용 상가분 min 후보 (P7/D8).
   * 주택분 보상은 P5 필드(housingCompensationTotal·housingCompensationBasisTotal) 재사용.
   */
  mixedCommercialLandCompensationTotal: string;
  /** §164⑨1호 상가분 토지 보상액 산정 기초 개별공시지가 총액 (원) */
  mixedCommercialLandCompensationBasisTotal: string;
  /** 취득시 개별주택공시가격 (원, PHD 토글 ON 시 비활성) */
  mixedAcqHousingPrice: string;
  /** 취득시 상가건물 기준시가 (원, 신축 시점) */
  mixedAcqCommercialBuildingPrice: string;
  /** 취득시 개별공시지가 (원/㎡) */
  mixedAcqLandPricePerSqm: string;
  /** 수도권 여부 */
  mixedIsMetropolitanArea: boolean;

  // ── 상속 취득 겸용주택 — §163⑨ 취득가액 직접 산정 (엔진 정합, acquisitionByInheritance 파생) ──
  /**
   * 상속개시일 주택분 신고가액 override (원, 문자열). 선택 입력.
   * 시가·감정·매매사례로 상속세 신고한 경우에만 입력. 미입력 시 mixedAcqHousingPrice(보충적평가)로 fallback.
   * acquisitionCause === "inheritance" 일 때만 UI 노출.
   */
  mixedHousingInheritedValueOverride: string;
  /**
   * 상속개시일 상가분 신고가액 override (원, 문자열). 선택 입력.
   * 미입력 시 (mixedAcqCommercialBuildingPrice + mixedAcqLandPricePerSqm×상가부수토지면적)로 fallback.
   */
  mixedCommercialInheritedValueOverride: string;
  /**
   * 상속(실가) 모드 주택분 실제 필요경비 — 자본적지출·양도비 (원, 문자열). 선택 입력.
   * 개산공제(§163⑥, 취득시 기준시가×3%) 대체 — 상속은 실지거래가액 의제라 개산공제 미적용.
   */
  mixedHousingInheritedExpense: string;
  /** 상속(실가) 모드 상가분 실제 필요경비 (원, 문자열). 선택 입력. 위와 동일 축. */
  mixedCommercialInheritedExpense: string;

  // ── 증여 취득 겸용주택 — §163⑨ 취득가액 직접 산정 (D1=옵션B, 상속 필드와 병렬·acquisitionCause==="gift"일 때만 UI 노출) ──
  /** 증여일 주택분 신고가액 override (원, 문자열). 미입력 시 mixedAcqHousingPrice(보충적평가)로 fallback. */
  mixedHousingGiftValueOverride: string;
  /** 증여일 상가분 신고가액 override (원, 문자열). 미입력 시 상가 보충적평가 합계로 fallback. */
  mixedCommercialGiftValueOverride: string;
  /** 증여(실가) 모드 주택분 실제 필요경비 (원, 문자열). 개산공제 대체 — 증여도 실지거래가액 의제라 개산공제 미적용. */
  mixedHousingGiftExpense: string;
  /** 증여(실가) 모드 상가분 실제 필요경비 (원, 문자열). */
  mixedCommercialGiftExpense: string;

  // ── 매매 취득 실거래가 겸용주택 — 법 §100² 안분 (R1 후속·상속/증여 실비 필드와 병렬·purchase 실가 모드만 UI 노출) ──
  /** 매매(실가) 모드 주택분 실제 필요경비 — 자본적지출·양도비 (원, 문자열). 선택 입력(개산공제 대체). */
  mixedHousingActualExpense: string;
  /** 매매(실가) 모드 상가분 실제 필요경비 (원, 문자열). 선택 입력. */
  mixedCommercialActualExpense: string;

  // ── 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10) ──
  /** 보유 중 일부 용도변경 토글 — 양도시 겸용이지만 취득시 단일 용도였던 경우 */
  hasPartialUsageChange: boolean;
  /** 용도변경 방향 — 빈 문자열은 미선택 상태 */
  partialChangeDirection: "" | "house_to_commercial" | "commercial_to_house";
  /** 취득시 주택 연면적 (㎡) — 빈값이면 양도시 합계로 자동 도출 */
  partialChangeAcqResidentialArea: string;
  /** 취득시 상가 연면적 (㎡) — 빈값이면 양도시 합계로 자동 도출 */
  partialChangeAcqCommercialArea: string;
  /** 용도변경일 (YYYY-MM-DD, 메모용 — 계산 미사용) */
  partialChangeDate: string;
}
