/**
 * 일반건물(토지+건물 일괄) 환산취득가 계산 — **공개 타입**.
 *
 * `general-building-valuation.ts` 800줄 정책 분리(2026-08-06, 923줄 → 타입 이동).
 * 923줄 중 이 블록이 ≈487줄이었고 `GeneralBuildingInput` 하나가 255줄이다.
 *
 * ## 이 파일에는 로직을 두지 않는다
 *
 * 타입 선언만 나열한다 — 함수·상수를 넣기 시작하면 다시 자란다. 규약은
 * `lib/tax-engine/CLAUDE.md`의 「타입 파일 분리 기준」이고, 가드는
 * `__tests__/tax-engine/general-building-valuation-types-split.anchor.test.ts` T-3이다.
 *
 * 종전 경로(`general-building-valuation.ts`)에서 계속 import할 수 있도록 그 파일이 **재수출**한다.
 */
import type { CarryoverTaxationInput } from "./transfer-carryover.types";
import type { ExpropriationValuationDetail } from "../transfer-tax-expropriation-valuation";
import type { PartAcqMode } from "../transfer-tax-split-gain";
import type { SaleSplitExemption } from "../sale-split-deemed-unclear";
import type { SaleSplitJudgmentDetail } from "./transfer-split-gain.types";

// ============================================================
// ============================================================
// 공개 타입 (Task #3 — GeneralBuildingInput/Output)
// ============================================================

/** 일반건물(토지+건물 일괄) 환산취득가 계산 입력 */
export type GeneralBuildingInput = {
  // 양도 정보
  /** 총 양도가액 (원) — 토지+건물 합계 */
  totalTransferPrice: number;
  /** 양도일 */
  transferDate: Date;
  /**
   * 계약서에 **구분 기재**된 토지 양도가액 (원) — Phase 2.
   *
   * 「소득세법」 제100조 제2항은 「각각 구분하여 기장」이 **원칙**이고 안분은 구분이 불분명할
   * 때의 예외다. 있으면 기준시가 비율 안분 대신 이 값을 쓴다.
   *
   * ⚠️ 그대로 쓰는 것이 아니라 같은 조 **제3항** 판정을 거친다 — 안분계산한 가액과 **100분의
   * 30 이상** 차이가 나면 「불분명한 때로 보아」 안분값으로 되돌린다.
   *
   * 한쪽만 주면 반대쪽은 `총액 − 입력값`으로 도출되고, **도출된 파트도 판정 대상**이다
   * (계획서 §11.3 「한쪽만 검증하고 차액으로 결정」이 실무 자료가 지적한 실수유형).
   */
  landTransferPrice?: number;
  /** 구분 기재된 건물 양도가액 (원) — 위와 동일한 규칙 */
  buildingTransferPrice?: number;
  /**
   * 「소득세법 시행령」 제166조 제8항 예외 — 선택 시 §100③ 30% 의제가 **발동하지 않는다**.
   * 자동 판정이 불가능해(계약 근거·사실관계) 사용자 입력으로 받는다.
   */
  saleSplitExemption?: SaleSplitExemption;
  /**
   * 양도시 **감정평가가액** (토지분) — 안분 basis 서열 **1순위**
   * (「부가가치세법 시행령」 제64조 제1항 제1호 단서 · 「소득세법 시행령」 제166조 제6항이 차용).
   *
   * ⚠️ 토지·건물 **양쪽 모두 양수**여야 채택된다 — 「감정평가법인등이 **평가한** 가액」이므로
   * 0은 평가 결과가 아니라 **그 파트를 평가하지 않았다**는 뜻이다. 기준시가는 0도 값일 수 있어
   * 기준이 다른데, 그 비대칭은 의도된 것이다(계획서 §13.2).
   */
  landAppraisalAtTransfer?: number;
  /** 양도시 감정평가가액 (건물분) — 위와 동일한 규칙 */
  buildingAppraisalAtTransfer?: number;
  /**
   * 감정일자 — **시기 요건 판정에 필수**다. 유효 창 = **[(양도연도 − 1)-01-01, 양도연도-12-31]**
   * (부가령 §64①1호 괄호 + 「소득세법」 제5조 제1항 역년). 벗어나면 **기준시가로 후퇴**한다.
   */
  appraisalDateAtTransfer?: Date;

  // 취득 정보
  /** 취득일 */
  acquisitionDate: Date;

  // 면적
  /** 토지 부수면적 (㎡) */
  landArea: number;
  /** 건물 연면적 (㎡) */
  buildingArea: number;
  /**
   * 건축물 바닥면적 (㎡) — 비사업용토지 부수토지 한도의 곱셈 기준.
   *
   * 「건축법 시행령」 제119조 제1항 제3호의 **바닥면적**이며 **지하층을 포함한 각 층 중
   * 가장 넓은 값**이다(조심 2025지0451 · 대법원 2012두7073). 같은 조 제2호 **건축면적**이
   * **아니다** — 종전 주석은 "건축물대장 건축면적 또는 1층 바닥면적"이라 했고 오답이었다
   * (2026-07-30 정정).
   */
  buildingFootprintArea: number;

  // 양도시점 기준시가 (안분 분모)
  /** 양도시 개별공시지가 (원/㎡) */
  transferLandPricePerSqm: number;
  /** 양도시 건물기준시가 총액 (원) */
  transferBuildingStdPrice: number;

  // ── §164⑨ 1호 공익수용 특례 (토지 전용 — 계획 D16-GB) ──
  // 법령 조사 결론(2026-07-16): GB에서 §164⑨은 **토지분(가목)에만** 적용한다.
  //   - 시행규칙 §80⑧: "보상액 산정 기초 기준시가 = 보상금 산정 당시 해당 **토지**의 개별공시지가" →
  //     건물분(나목)은 "보상 기초 기준시가" 정의 자체가 없어 대상에서 제외(보수적).
  //   - 국세청 해석 2건(서면-2016-부동산-4026·사전-2018-법령해석재산-0057)도 전부 토지 사안.
  //   - 효과: **토지 환산 분모(§176의2②)만** min[]로 낮춘다. **안분(§166⑥)은 원 개별공시지가 유지** —
  //     안분에 낮춘 값을 넣으면 토지 상대가치 인위적 하락 → 양도가가 건물로 과다 배분(입법의도 밖).
  /** 양도원인 — "public_expropriation" 시에만 §164⑨ 게이트 진입. */
  transferCause?: "general" | "public_expropriation";
  /** 토지 보상가액 (원/㎡) — §164⑨ 1호 후보. */
  compensationPerSqm?: number;
  /** 토지 보상산정 기초 개별공시지가 (원/㎡) — §164⑨ 1호 후보(시행규칙 §80⑧). */
  compensationBasisStdPrice?: number;

  // 취득시점 기준시가 (환산 분자)
  /** 취득시 개별공시지가 (원/㎡) */
  acquisitionLandPricePerSqm: number;
  /** 취득시 건물기준시가 총액 (원) */
  acquisitionBuildingStdPrice: number;

  // 신축 취득 / 건물 별도 취득 (사례 32 — §114조의2 가산세)
  /**
   * 건물 취득일 — 소득세법 시행령 §162① 4호 기준 빠른 날
   * (사용승인서 교부일·사실상 사용일·임시사용승인일 중).
   * 미입력 시 acquisitionDate(토지 취득일) fallback ← 사례 31 호환.
   * buildingAcquisitionCause === "newConstruction" 시 validation에서 필수 강제.
   */
  buildingAcquisitionDate?: Date;
  /**
   * 토지 취득일 (M-1a, 2026-08-05). `acquisitionDate`는 **건물** 취득일이므로
   * 토지 카드의 보유기간·세율 기산일은 이 값이다. 미입력 시 `acquisitionDate` fallback(분리 OFF).
   */
  landAcquisitionDate?: Date;
  /**
   * 파트별 취득 방식 (2026-08-05 P3) — 미주입 시 둘 다 환산(이 경로의 기본 = 종전 동작).
   * 한 파트라도 환산이 아니면 그 파트는 실지거래가액을 쓰고 개산공제가 배제된다
   * (`general-building-part-acq.ts`).
   */
  landAcqMode?: PartAcqMode;
  buildingAcqMode?: PartAcqMode;
  /** 파트별 실지거래가액(§97①1호) — 비-환산 파트에서 필수 */
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  /**
   * 신축취득 여부. 라우트 헬퍼에서 `buildingAcquisitionCause === "newConstruction"` 으로 도출.
   * 엔진 input에는 boolean으로 normalize 후 전달 (단일 진실 원천 유지).
   */
  isSelfBuilt?: boolean;
  /**
   * 건물 취득원인. 토지의 acquisitionCause와 별개.
   * "newConstruction"일 때 isSelfBuilt=true로 도출.
   *
   * **required** — 라우트 헬퍼 진입 전 3중 차단 (Zod·normalizeAsset M-2·validate)으로
   * 항상 정의됨 보장. 엔진 단위 테스트에서도 명시 입력 필수 (silent fallback 없음).
   */
  buildingAcquisitionCause:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift"
    | "newConstruction";

  /**
   * 토지 취득원인 (#4-a 후속 PR).
   * 미입력 시 default "purchase" — 사례 31·32 회귀 호환.
   * "inheritance"·"gift"·"carryover_gift" 시 토지 카드의 단기보유 기산점이
   * decedent/donorAcquisitionDate로 변경됨 (영 §95④).
   */
  landAcquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift";
  /** 토지 상속 시 피상속인 취득일 (영 §95④). */
  decedentAcquisitionDate?: Date;
  /** 토지 증여 시 증여자 취득일 (영 §95④). */
  donorAcquisitionDate?: Date;
  /**
   * #7-b: 토지 배우자등 이월과세 (§97조의2) — landAcquisitionCause === "carryover_gift" 시 필수.
   * 단건 엔진의 비교과세(이월 시나리오 vs 통상 max) 로직이 토지 카드에 적용됨.
   */
  landCarryoverTaxation?: CarryoverTaxationInput;
  /**
   * 다른 피상속인 케이스 — 건물 전용 피상속인 취득일.
   * 미입력 시 `decedentAcquisitionDate` fallback (#6 같은 피상속인 호환).
   * `buildingAcquisitionCause === "inheritance"` 시 단기보유 기산점(영 §95④).
   */
  buildingDecedentAcquisitionDate?: Date;
  /**
   * 다른 증여자 케이스 — 건물 전용 증여자 취득일.
   * 미입력 시 `donorAcquisitionDate` fallback (#7-a 같은 증여자 호환).
   * `buildingAcquisitionCause === "gift"` 시 단기보유 기산점(영 §95④).
   */
  buildingDonorAcquisitionDate?: Date;

  /**
   * 증축 정보 (사례 33 — §114조의2 + §166⑥ 증축 안분).
   * 미입력 시 기존 단일 건물 동작 100% 보존 (사례 31·32 회귀 위험 0).
   * extensionDate = 건물2 취득일 (영 §162①4호 빠른 날).
   */
  extensionInfo?: {
    /** 증축일 (=건물2 취득일, 영 §162①4호 빠른 날) */
    extensionDate: Date;
    /** 증축 연면적 (㎡) — 정보용 (위치지수 산정 확장 대비, 산식 미사용, 선택) */
    extensionArea?: number;
    /**
     * 증축 바닥면적 합계 (㎡) — 소득세법 §114조의2① 85㎡ 초과 게이트 전용.
     * 신축은 면적 무관, 증축만 이 값으로 가산세 발동 판정(extensionFloorArea85 > 85).
     * 정보용 extensionArea(연면적)와 구분 — 게이트에는 이 필드만 사용.
     */
    extensionFloorArea85?: number;
    /**
     * 양도시 건물2 기준시가 총액 (원) — UI에서 단가 곱한 총액 받음. ㎡당 단가 아님.
     * acquisitionMode === "estimated" 시 필수. 실가 모드 시 미입력 허용.
     */
    transferExtensionBuildingStdPrice?: number;
    /**
     * 취득시(증축시) 건물2 기준시가 총액 (원) — 환산 분자.
     * acquisitionMode === "estimated" 시 필수. 실가 모드 시 미입력 허용.
     */
    acquisitionExtensionBuildingStdPrice?: number;
    /** 건물2 취득원인 — "newConstruction"(자가증축, default) | "purchase"(매수 증축) */
    extensionAcquisitionCause: "purchase" | "newConstruction";
    /**
     * 토지+건물1 일괄 실거래 취득가액 (원).
     * 원건물이 실가 모드(acquisitionMethod === "actual") 시 필수. 환산 모드 시 미입력 허용.
     * 2-way 안분의 분자.
     */
    actualBundledAcquisitionPrice?: number;
    /**
     * 토지+건물1 일괄 실거래 필요경비 (원).
     * 원건물이 실가 모드(acquisitionMethod === "actual") 시 필수. 환산 모드 시 미입력 허용.
     * 2-way 안분의 분자.
     */
    actualBundledExpenses?: number;
    /**
     * `actualBundledExpenses`의 **성질** — 안분 시점을 가른다(2026-08-07 W-1a).
     *
     * 그 필드는 세 후보(전용 필드·양도비·legacy)를 **한 슬롯**에 담아 성질을 지운다.
     * 종전에는 전부 **취득시** 비율로 안분해, 양도비가 채택된 경우 「소득세법」 제100조
     * 제2항이 정하는 시점(양도비 = **양도 당시**)과 어긋났다.
     *
     * `capital`=취득시 · `transfer`=**양도시** · `mixed`=취득시 유지(legacy 덩어리).
     * 미주입 시 `mixed` 취급 — 종전 동작 불변.
     */
    bundledExpenseNature?: "capital" | "transfer" | "mixed";
    /**
     * 증축분 취득 방식 (필수).
     * - "estimated": 환산취득가 (소령 §176조의2②) — transferExtensionBuildingStdPrice + acquisitionExtensionBuildingStdPrice 필수
     * - "actual":    실거래가 별도 입력 — actualAcquisitionPrice 필수
     *
     * default: "estimated" (사례 33 기존 anchor 호환성 보존).
     * 엔진에서 undefined 시 "estimated" 로 처리.
     */
    acquisitionMode?: "actual" | "estimated";
    /**
     * 증축 실거래 취득가액 (원).
     * acquisitionMode === "actual" 시 필수. 환산 모드 시 미사용.
     */
    actualAcquisitionPrice?: number;
    /**
     * 증축 시 발생한 실제 필요경비 (원).
     * acquisitionMode === "actual" 시에만 유효. 환산 모드 시 미사용.
     * 미입력 시 0 처리.
     */
    actualExpenses?: number;
  };

  // 선택적
  /** 개산공제율 (기본 0.03 — ESTIMATED_DEDUCTION_RATE_LAND_BUILDING) */
  estimatedDeductionRate?: number;
  /**
   * 용도지역 (§168의12 배율 결정). ZoneType 값.
   * 미입력 시 엔진이 TaxCalculationError 발생. validate 단계에서 사전 차단.
   */
  zoneType?: string;
  /** 수도권 소재 여부. 배율 3배 vs 5배 분기에 사용. */
  isMetropolitan?: boolean;
  /**
   * 「지방세법 시행령」 §101① **단서** 해당 여부 — true 시 배율 계산 없이 토지 전체 비사업용.
   * 근거: §101①단서(별도합산 제외) + 「소득세법」 §104의3①4호나목 → 비사업용.
   *
   * 이름은 "unregistered"이나 범위는 **허가·사용승인 미이행 전반**이다 — 무허가 신축뿐 아니라
   * 「건축법」 §19②1호 용도변경 허가·§19⑤·§22 사용승인을 받지 않고 용도를 바꿔 사용 중인
   * 경우도 포함된다(법제처 법령해석례 25-0823, 2026.02.03).
   */
  isUnregistered?: boolean;
  // ── 사례 35: 주택→상가 용도변경 (사전법규재산 2022-684·881) ──
  /** 주택→상가 단일 용도변경 토글. true 시 conversionDate·wasMultiHouseAtConversion 필수. */
  houseToCommercialConversion?: boolean;
  /** 용도변경일 — houseToCommercialConversion=true 시 필수. */
  conversionDate?: Date;
  /** 변경 당시 다주택자 여부. true → 자산 카드 LTHD 기산일 = conversionDate. */
  wasMultiHouseAtConversion?: boolean;
  // ── 사례 35 후속-1: §99-164-10 환산주택가격 분기 ──
  /** 주택으로 최초공시 후 상가로 용도변경 — 환산취득가 모드에서만 의미. */
  hasFirstDisclosure?: boolean;
  /** 최초공시주택가격 (원). hasFirstDisclosure=true 시 필수. */
  firstDisclosurePrice?: number;
  /** 최초공시 당시 토지 기준시가 총액 (원). hasFirstDisclosure=true 시 필수. */
  firstDisclosureLandStdPrice?: number;
  /** 최초공시 당시 건물 기준시가 총액 (원). hasFirstDisclosure=true 시 필수. */
  firstDisclosureBuildingStdPrice?: number;
  // ── §97②2호 단서 swap (환산 전용, 자산-총액 단위) ──
  /**
   * 자본적지출 (원, 자산 총액 — §97① 가목). §97②2호 단서 swap 판정용.
   * 나목(자본적지출+양도비) > 가목(환산취득가+개산공제 합) 시 나목을 필요경비로 적용.
   */
  capitalExpenditure?: number;
  /** 양도비 (원, 자산 총액 — §97① 나목). swap 판정용. */
  transferExpense?: number;
  /**
   * 파트별 자본적지출+양도비 (원) — **직접 귀속**. 하나라도 주어지면 §97②2호 판정이
   * **파트 단위**로 전환된다(O-1 — `general-building-swap.ts` 참조).
   *
   * 「소득세법」 §97②2호 본문의 「자산별로」 + 「소득세법 시행령」 §163⑥이 토지(1호)·건물(2호)을
   * 별개 호로 두는 구조가 근거다. 자산 단위 입력만 있으면 파트별 귀속을 알 수 없어
   * 종전 자산총액 판정을 유지한다.
   */
  landDirectExpenses?: number;
  buildingDirectExpenses?: number;
  /**
   * 공유지분율 (0 < r ≤ 1, 미전달 시 1). **개산공제(소득령 §163⑥) base 축소 전용**.
   *
   * 기준시가·면적은 물건 전체(100%) 값을 유지한다 — 환산 산식에서 분자·분모로 함께 나타나 상쇄되고,
   * §166⑥ 안분 비율도 100% 스케일을 전제하기 때문이다. 호출부가 `TransferTaxInput.ownershipRatio`를
   * 그대로 내려준다(서브엔진 재판정 금지).
   *
   * 설계: docs/02-design/features/transfer-fractional-lump-sum-deduction.engine.design.md §2.1
   */
  ownershipRatio?: number;
};

/** 양도가 안분 결과 */
export type GeneralBuildingAllocation = {
  /** 토지 양도가 (원) */
  land: number;
  /** 건물 양도가 (원) */
  building: number;
};

/** 환산취득가 결과 */
export type GeneralBuildingAcquisition = {
  /** 토지 환산취득가 (원) */
  land: number;
  /** 건물 환산취득가 (원) */
  building: number;
};

/** 개산공제 결과 */
export type GeneralBuildingEstimatedDeduction = {
  /** 토지 개산공제 (원) */
  land: number;
  /** 건물 개산공제 (원) */
  building: number;
  /**
   * 개산공제 base로 **실제 사용된 값** = `floor(취득시 기준시가 × 지분율)`.
   * 표시 산식 「… × 3%」가 표시된 개산공제를 그대로 만들어내게 하는 echo다 — 100% 기준시가를
   * 노출하면 지분 자산에서 산식이 자기 값을 못 만든다(`feedback_engine_result_display_drift`).
   * 단독소유면 기준시가와 같다.
   */
  landBase?: number;
  /**
   * 개산공제 base로 **실제 사용된 값** = `floor(취득시 기준시가 × 지분율)`.
   * 표시 산식 「… × 3%」가 표시된 개산공제를 그대로 만들어내게 하는 echo다 — 100% 기준시가를
   * 노출하면 지분 자산에서 산식이 자기 값을 못 만든다(`feedback_engine_result_display_drift`).
   * 단독소유면 기준시가와 같다.
   */
  buildingBase?: number;
};

/**
 * aggregate 엔진에 넘길 자산 카드 구조
 * TransferTaxItemInput과 호환 — 나머지 필드는 호출부에서 주입
 */
export type AssetCardForAggregate = {
  /** 자산 식별자 */
  propertyId: string;
  /** 자산 표시명 */
  propertyLabel: string;
  /** 자산 유형 */
  propertyType: "land" | "general_building_unit";
  /** 안분된 양도가 (원) */
  transferPrice: number;
  /** 환산취득가 (원) */
  acquisitionPrice: number;
  /** 개산공제 (원) */
  expenses: number;
  /**
   * 환산취득가 사용 여부.
   * - 토지·건물1(실가 안분): false
   * - 건물2(환산취득가): true
   * - 사례 31·32(전체 환산): true
   */
  usedEstimatedAcquisition: boolean;
  /** 환산취득가액 (환산 미사용 시 0) */
  estimatedBase: number;
  /** 개산공제액 (환산 미사용 시 0) */
  estimatedDeduction: number;
  /** 취득일 */
  acquisitionDate: Date;
  /** 양도일 */
  transferDate: Date;
  /** 비사업용토지 여부 */
  isNonBusinessLand: boolean;
  /**
   * 건물 카드만 set. 라우트가 TransferTaxItemInput 매핑 시 isSelfBuilt 패스스루용.
   * 소득세법 §114조의2 ① 가산세 발동 여부 판단에 사용.
   */
  isSelfBuilt?: boolean;
  /**
   * 건물 카드만 set. 영 §162①4호 빠른 날
   * (사용승인서 교부일·사실상 사용일·임시사용승인일 중).
   * 환산취득가액 가산세(소득세법 §114조의2 ①)의 5년 기산점이자
   * 건물 LTHD 보유기간 기산점.
   */
  buildingAcquisitionDate?: Date;
  /**
   * 토지 취득일 (M-1a, 2026-08-05). `acquisitionDate`는 **건물** 취득일이므로
   * 토지 카드의 보유기간·세율 기산일은 이 값이다. 미입력 시 `acquisitionDate` fallback(분리 OFF).
   */
  landAcquisitionDate?: Date;
  /**
   * 파트별 취득 방식 (2026-08-05 P3) — 미주입 시 둘 다 환산(이 경로의 기본 = 종전 동작).
   * 한 파트라도 환산이 아니면 그 파트는 실지거래가액을 쓰고 개산공제가 배제된다
   * (`general-building-part-acq.ts`).
   */
  landAcqMode?: PartAcqMode;
  buildingAcqMode?: PartAcqMode;
  /** 파트별 실지거래가액(§97①1호) — 비-환산 파트에서 필수 */
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  /**
   * 건물 카드에만 set. 토지 카드는 undefined.
   * `propertyType === "general_building_unit"` 카드에만 의미 있음.
   * 라우트가 TransferTaxItemInput 매핑 시 acquisitionCause로 전달.
   */
  buildingAcquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift"
    | "newConstruction";
  /**
   * 토지 카드에만 set (#4-a 후속 PR). 건물 카드는 undefined.
   * 라우트가 TransferTaxItemInput 매핑 시 acquisitionCause로 전달.
   * "inheritance"·"gift" 시 단건/aggregate 엔진의 단기보유 판정 기산점이
   * decedent/donorAcquisitionDate로 변경됨 (영 §95④).
   */
  landAcquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift";
  /** 토지 상속 시 피상속인 취득일 (영 §95④ 단기보유 기산점). */
  decedentAcquisitionDate?: Date;
  /** 토지 증여 시 증여자 취득일 (영 §95④ 단기보유 기산점). */
  donorAcquisitionDate?: Date;
  /**
   * #7-b: 토지 배우자등 이월과세 (§97조의2) — 토지 카드에만 set.
   * 라우트가 TransferTaxItemInput.carryoverTaxation로 전달 →
   * aggregate가 단건 엔진 호출 시 자동 비교과세 수행.
   */
  carryoverTaxation?: CarryoverTaxationInput;
  /**
   * 증축 건물 카드 여부 (사례 33 — building2 카드에만 true).
   * 결과 카드 배지 표시용. 산식에는 미사용.
   */
  isExtensionBuilding?: boolean;
  /**
   * 건물2(증축) 카드만 "extension" set. 소득세법 §114조의2① 85㎡ 게이트 진입용.
   * 라우트(buildProperties)가 TransferTaxItemInput.buildingType으로 패스스루.
   * 건물1·토지·신축 건물은 undefined(extension 아님 → 신축/일반 취급).
   */
  buildingType?: "new" | "extension";
  /**
   * 증축 바닥면적 합계 (㎡) — buildingType==="extension" 카드만 set.
   * 라우트가 TransferTaxItemInput.extensionFloorArea로 패스스루 → 85㎡ 초과 게이트.
   */
  extensionFloorArea?: number;
  /**
   * 사례 35: 주택→상가 용도변경 LTHD 분기 — 각 자산 카드에 동일 spread.
   * `propertyType === "general_building"` 자산 전체 속성이므로 토지·건물 모든 카드에 전파.
   */
  houseToCommercialConversion?: boolean;
  conversionDate?: Date;
  wasMultiHouseAtConversion?: boolean;
};

/** 일반건물(토지+건물 일괄) 환산취득가 계산 출력 */
export type GeneralBuildingOutput = {
  // 중간 계산값 (테스트·UI 노출용)
  /** 양도가 안분 결과 — 구분 기재가 인정되면 그 값, §100③ 발동 시 안분값 */
  allocation: GeneralBuildingAllocation;
  /**
   * §100③ 판정 상세 — **구분 기재가 있을 때만** 채워진다(Phase 2).
   *
   * 비교 대상이 없는 일괄양도에서 `{deemedUnclear:false}`로 메우면 「판정했고 통과했다」로
   * 침묵 오표시된다. split 경로(`SplitGainResult.saleSplitJudgment`)와 같은 계약이다.
   */
  saleSplitJudgment?: SaleSplitJudgmentDetail;
  /** 환산취득가 결과 */
  acquisition: GeneralBuildingAcquisition;
  /** 개산공제 결과 */
  estimatedDeduction: GeneralBuildingEstimatedDeduction;

  // 비사업용토지 판정
  /** 건축물 바닥면적 (㎡) — 각 층 중 최대(지하 포함). 사용자 직접 입력 */
  buildingFootprintArea: number;
  /** 적용 배율 (3/5/10배) */
  appliedMultiplier: number;
  /** 배율 산출 근거 ("수도권 주·상·공 3배" 등) */
  multiplierDetail: string;
  /** 인정 한도 = 건축물 바닥면적(각 층 중 최대) × 배율 (㎡) */
  allowedLandArea: number;
  /** true = 사업용 (배율 내, 중과 미발동) */
  isWithinNblRatio: boolean;
  /** 비사업용 초과 면적 (㎡). 사업용이면 0. */
  nonBusinessArea: number;
  /** 비사업용 초과 비율 (0~1). 토지 카드 분할 기준. */
  nonBusinessRatio: number;

  // aggregate 엔진에 넘길 자산 카드 2장
  assetCards: AssetCardForAggregate[];

  // ── 산식 분모/분자 변수 (UI 자산별 산식 인라인 표시용 — optional) ──
  // §166⑥ 양도가 안분 분모: 토지 기준시가 + 건물 기준시가 (+ 증축건물 기준시가, 사례 33)
  /** 양도시 토지 기준시가 총액 (원) = transferLandPricePerSqm × landArea */
  landStdTotal?: number;
  /** 양도시 원건물 기준시가 총액 (원) — sample DB 입력값 그대로 */
  buildingStdTotal?: number;
  /** 양도시 증축건물 기준시가 총액 (원) — 사례 33만 채움 */
  extensionStdTotal?: number;
  /** 취득시 토지 기준시가 총액 (원) — 환산/일괄 안분 분모 */
  acqLandStdTotal?: number;
  /** 취득시 원건물 기준시가 총액 (원) */
  acqBuilding1StdTotal?: number;
  /** 취득시 증축건물 기준시가 총액 (원) — 사례 33 환산 모드만 채움 */
  acqExtensionStdTotal?: number;
  /** 일괄 실가 취득가액 (원) — 실가 모드에서만 채움. UI 안분 산식 분자. */
  bundledActualAcquisitionPrice?: number;
  /** 일괄 실가 양도비(자본적지출+양도비) (원) — 실가 모드에서만 채움. */
  bundledActualExpenses?: number;

  /**
   * §164⑨ 1호 공익수용 특례 산출근거 (토지 전용 — 계획 D16-GB).
   * 게이트(수용·환산·2009.02.04·보상 후보) 미충족 시 undefined. 결과 카드·anchor 표시용.
   */
  expropriationValuationDetail?: ExpropriationValuationDetail;

  /** §163⑨ 상속 취득가액 직접 산정 여부 — 토지분(결과 카드 라벨 분기용, Phase 1 = C1). */
  acquisitionByInheritance?: boolean;
  /** §163⑨ 상속 취득가액 직접 산정 여부 — 건물분. */
  buildingAcquisitionByInheritance?: boolean;
};
