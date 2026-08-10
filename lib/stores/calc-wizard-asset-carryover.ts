/**
 * 이월과세(증여) §97조의2 AssetForm 서브타입 + 기본값 + 마이그레이션
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-04).
 */

/** 이월과세 적용배제 선언 서브객체 */
export interface CarryoverExclusionDeclared {
  /** §97조의2 ② 1호 — 사업인정고시일 2년 이전 증여 토지·건물의 협의매수·수용 */
  expropriationWithin2Years: boolean;
  /** §97조의2 ② 2호 — 이월과세 적용 시 1세대1주택 비과세 해당 (고가주택 포함) */
  oneHouseExemptionApplies: boolean;
  /** §97조의2 ④ — 가업상속공제 적용 자산 (v1 미지원) */
  isFamilyBusinessInheritedAsset: boolean;
}

/**
 * 환산 방식 선택 — useEstimatedAcquisition === true 시 활성.
 * - "general": 일반 기준시가 환산 (취득시·양도시 기준시가 직접 입력)
 * - "phd": 개별주택가격 미공시 §164⑤ 3-시점 환산
 * - "apd": 공동주택 최초고시 전 환산
 */
export type CarryoverEstimationMode = "general" | "phd" | "apd";

/**
 * 이월과세(증여) 서브객체 — acquisitionCause === "carryover_gift" 시만 사용.
 * 소득세법 §97조의2 비교과세 입력 데이터.
 */
export interface CarryoverTaxationForm {
  /** 증여 등기접수일 (YYYY-MM-DD) — §97조의2 ③ 이월과세 적용기간 기산일 */
  giftRegistryDate: string;
  /** 증여자 취득일 (YYYY-MM-DD) — 보유기간·장기보유공제 기산일 §95④ */
  donorAcquisitionDate: string;
  /** 증여자 취득원인 */
  donorAcquisitionCause: "purchase" | "inheritance" | "gift";
  /** 환산취득가 사용 여부 */
  useEstimatedAcquisition: boolean;
  /**
   * 환산 방식 선택 (useEstimatedAcquisition === true 시 필수).
   * null = 선택 전 초기 상태 (validation에서 차단됨).
   */
  estimationMode: CarryoverEstimationMode | null;
  /**
   * 일반 기준시가 환산 — 취득시 기준시가 (원).
   * estimationMode === "general" 시 필수.
   */
  donorStandardPriceAtAcquisition: string;
  /**
   * 일반 기준시가 환산 — 양도시 기준시가 (원).
   * estimationMode === "general" 시 필수.
   */
  donorStandardPriceAtTransfer: string;
  /** 증여자 취득가액 (원, 문자열) — 환산 미사용 시 직접 입력 */
  donorAcquisitionPrice: string;
  /**
   * 증여세 상당액 (§163의2 산식 기반, **사용자가 이미 안분한 값**).
   *
   * ⚠️ 일반건물처럼 자산이 **토지·건물로 갈리는** 경우에는 이 칸을 쓰지 않는다 —
   *    아래 `giftTaxCalculated`·`giftTaxBase`를 받아 엔진이 영 §163의2②로 파트별 산정한다.
   *    의미가 다른 값이므로 **재정의하지 않고 병존**시킨다(설계 D9-4).
   */
  giftTaxAmount: string;
  /**
   * 영 §163의2②1호 — 증여받은 자산에 대한 **증여세 산출세액** (증여 사건 1개).
   * 일반건물 파트별 안분의 곱하는 수. 비워 두면 기존 `giftTaxAmount` 방식으로 동작한다.
   */
  giftTaxCalculated: string;
  /**
   * 영 §163의2②3호 — 「상속세 및 증여세법」 §47 **증여세 과세가액** (안분 **분모**).
   * `giftTaxCalculated`와 **짝**이다 — 하나만 채우면 안분이 발동하지 않는다.
   */
  giftTaxBase: string;
  /** 증여자 자본적지출 (§97조의2 ① 2호, 2024.1.1. 이후 양도분) */
  donorCapitalExpenditure: string;
  /** 증여 당시 평가액 — 비교과세 시나리오 B 취득가액 */
  giftDateValuation: string;
  /** 이월과세 적용배제 선언 */
  exclusionDeclared: CarryoverExclusionDeclared;
}

/** 이월과세 서브객체 기본값 */
export const CARRYOVER_DEFAULTS: CarryoverTaxationForm = {
  giftRegistryDate: "",
  donorAcquisitionDate: "",
  donorAcquisitionCause: "purchase",
  useEstimatedAcquisition: false,
  estimationMode: null,
  donorStandardPriceAtAcquisition: "",
  donorStandardPriceAtTransfer: "",
  donorAcquisitionPrice: "",
  giftTaxAmount: "",
  giftTaxCalculated: "",
  giftTaxBase: "",
  donorCapitalExpenditure: "",
  giftDateValuation: "",
  exclusionDeclared: {
    expropriationWithin2Years: false,
    oneHouseExemptionApplies: false,
    isFamilyBusinessInheritedAsset: false,
  },
};

/**
 * 구형 sessionStorage 데이터에서 carryover 서브객체 마이그레이션.
 * acquisitionCause !== "carryover_gift" 이면 기본값으로 초기화.
 */
export function migrateCarryoverFields(a: Record<string, unknown>): void {
  const cause = a.acquisitionCause as string;

  // carryover_gift 이외 취득원인에서는 carryover 스트리핑 (sessionStorage 잔재 정리)
  if (cause !== "carryover_gift") {
    a.carryover = { ...CARRYOVER_DEFAULTS };
    return;
  }

  // carryover_gift: 각 서브필드 개별 migrate
  const raw = (a.carryover ?? {}) as Record<string, unknown>;
  const excl = (raw.exclusionDeclared ?? {}) as Record<string, unknown>;

  const validDonorCauses = ["purchase", "inheritance", "gift"];
  const validEstimationModes: CarryoverEstimationMode[] = ["general", "phd", "apd"];

  a.carryover = {
    giftRegistryDate: typeof raw.giftRegistryDate === "string" ? raw.giftRegistryDate : "",
    donorAcquisitionDate: typeof raw.donorAcquisitionDate === "string" ? raw.donorAcquisitionDate : "",
    donorAcquisitionCause: validDonorCauses.includes(raw.donorAcquisitionCause as string)
      ? (raw.donorAcquisitionCause as "purchase" | "inheritance" | "gift")
      : "purchase",
    useEstimatedAcquisition:
      typeof raw.useEstimatedAcquisition === "boolean" ? raw.useEstimatedAcquisition : false,
    // 신규 필드 — 구형 sessionStorage에 없으면 null (선택 안 됨 상태)
    estimationMode: validEstimationModes.includes(raw.estimationMode as CarryoverEstimationMode)
      ? (raw.estimationMode as CarryoverEstimationMode)
      : null,
    donorStandardPriceAtAcquisition:
      typeof raw.donorStandardPriceAtAcquisition === "string" ? raw.donorStandardPriceAtAcquisition : "",
    donorStandardPriceAtTransfer:
      typeof raw.donorStandardPriceAtTransfer === "string" ? raw.donorStandardPriceAtTransfer : "",
    donorAcquisitionPrice:
      typeof raw.donorAcquisitionPrice === "string" ? raw.donorAcquisitionPrice : "",
    giftTaxAmount: typeof raw.giftTaxAmount === "string" ? raw.giftTaxAmount : "",
    // ③ normalize — 신규 2필드(영 §163의2②1호·3호). 기존 sessionStorage에는 없으므로 빈 문자열.
    giftTaxCalculated: typeof raw.giftTaxCalculated === "string" ? raw.giftTaxCalculated : "",
    giftTaxBase: typeof raw.giftTaxBase === "string" ? raw.giftTaxBase : "",
    donorCapitalExpenditure:
      typeof raw.donorCapitalExpenditure === "string" ? raw.donorCapitalExpenditure : "",
    giftDateValuation:
      typeof raw.giftDateValuation === "string" ? raw.giftDateValuation : "",
    exclusionDeclared: {
      expropriationWithin2Years: !!excl.expropriationWithin2Years,
      oneHouseExemptionApplies: !!excl.oneHouseExemptionApplies,
      isFamilyBusinessInheritedAsset: !!excl.isFamilyBusinessInheritedAsset,
    },
  } satisfies CarryoverTaxationForm;
}
