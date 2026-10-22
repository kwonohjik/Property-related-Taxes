/**
 * 일반건물 라우트 경로 B(실거래가/감정가) — **payload · 카드 조립 결과 타입**.
 *
 * `general-building-route-actual.ts` 800줄 정책 분리(2026-10-22, 762줄 위험구간). 타입 선언만 있어 로직 이동은 없다 —
 * 기존 import 경로는 원 파일의 재수출(`export type { … }`)이 유지한다.
 */
import type { SaleSplitExemption } from "@/lib/tax-engine/sale-split-deemed-unclear";
import type { SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";
import type { CarryoverTaxationInput } from "@/lib/tax-engine/types/transfer-carryover.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";

/** 실거래가/감정가 모드 NBL 전용 payload. */
export interface GeneralBuildingActualPricePayload {
  totalTransferPrice: number;
  transferDate: Date;
  acquisitionDate: Date;
  landArea: number;
  buildingFootprintArea: number;
  transferLandPricePerSqm: number;
  transferBuildingStdPrice: number;
  zoneType?: string;
  isMetropolitan?: boolean;
  /** 「지방세법 시행령」 §101① 단서 — 허가·사용승인 미이행(NBL 축). §104③과 무관. */
  unapprovedBuilding?: boolean;
  /** 「소득세법」 §104의2② 지정지역 선언 — 배율초과 토지 카드의 §104①8호 중과 유예 판정용(양도 2009.3.16.~2015.12.31.). */
  isDesignatedArea?: boolean;
  /** 「소득세법」 §104③ 미등기양도자산 — 토지 축 / 건물 축(별개 등기부). */
  unregisteredLand?: boolean;
  unregisteredBuilding?: boolean;
  actualAcquisitionPrice: number;
  actualExpenses: number;
  /** 부담부증여 §159①1호 산식용 — 취득시 토지 ㎡당 기준시가. 부담부증여 모드 시 필수. */
  acquisitionLandPricePerSqm?: number;
  /** 부담부증여 §159①1호 산식용 — 취득시 건물 기준시가 총액. 부담부증여 모드 시 필수. */
  acquisitionBuildingStdPrice?: number;
  /**
   * 부담부증여 정보 (소령 §159).
   * 제공 시 §159①1호 단서에 따라 사용자 입력 actualAcquisitionPrice를 무시하고
   * 취득시 기준시가 × 채무비율로 환산.
   */
  burdenedGiftInfo?: BurdenedGiftInfo;
  // ── 사례 35: 주택→상가 용도변경 (자산 공통 — actual 경로도 동일 분기) ──
  houseToCommercialConversion?: boolean;
  conversionDate?: Date;
  wasMultiHouseAtConversion?: boolean;
  // ── §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1) ──
  /** 토지 상속 게이트 (§163⑨). */
  acquisitionByInheritance?: boolean;
  /** 건물 상속 게이트. */
  buildingAcquisitionByInheritance?: boolean;
  /** 상속개시일 토지 평가액 (원) — 취득당시 실지거래가액 의제(§166⑥ 안분 아님). */
  inheritedLandValue?: number;
  /** 상속개시일 건물 평가액 (원). */
  inheritedBuildingValue?: number;
  // ── §95④ 단기보유 기산점 — actual 분기 기존 결측(회귀 동반 수정) ──
  /** 토지 취득원인 — 단기보유 기산점 분기(법 §104②). */
  landAcquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift";
  /**
   * M-1a 파트 취득일 — `acquisitionDate`(자산 단위)는 **건물** 취득일이고,
   * 토지 카드는 `landAcquisitionDate`로 보유기간·세율을 잡는다. 둘 다 미주입이면 분리 OFF.
   */
  landAcquisitionDate?: Date;
  buildingAcquisitionDate?: Date;
  /**
   * 파트별 자본적지출(§97①2호) — **직접 귀속** 금액이다.
   * 「소득세법」 제100조 제2항 후문은 "**공통되는** 취득가액과 양도비용"만 안분하라고 하므로,
   * 그 파트에 귀속되는 것이 분명하면 안분하지 않고 전액 그 파트에서 차감한다.
   * 미주입 파트는 종전대로 §166⑥ 비율 안분.
   */
  landDirectExpenses?: number;
  buildingDirectExpenses?: number;
  /**
   * 파트별 **실지거래가액**(§97①1호 가목) — 별개 취득이라 파트별로 실재하는 취득가액이다.
   *
   * 두 값이 모두 있으면 자산 총액 안분을 **쓰지 않는다**. 「소득세법」 제100조 제2항 전문은
   * 「토지와 건물 등을 함께 취득하거나 양도한 경우에는 이를 **각각 구분하여 기장**하되 …
   * 가액 **구분이 불분명할 때에는** … 안분계산한다」이므로, 구분이 분명하면 안분 대상이 아니다.
   */
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  /**
   * 자산 단위 자본적지출(§97①2호) · 양도비(§97①3호) — **필요경비**다.
   *
   * 🔴 2026-08-07 신설(P-3). 종전에는 이 경로에 도달할 필드가 없어 사용자가 입력한 값이
   *    **통째로 누락**됐다(실측 결정세액 12,800,000원 과대). `actualExpenses`는 legacy
   *    `directExpenses`에서만 오는데, 현행 UI는 legacy 칸을 「새 두 필드가 둘 다 0일 때만」
   *    띄우므로(`AssetSectionExpense.tsx:109-111`) 정상 입력에서는 늘 0이었다.
   *
   * ⚠️ **swap(§97②2호 단서) 대상이 아니다.** 실가 경로는 환산취득가·개산공제를 쓰지 않아
   *    단서 요건을 충족하지 않는다 ⇒ 같은 항 **1호**의 「실지거래가액 + 2호·3호」 **가산**이다.
   *    환산 경로(`resolveGeneralBuildingSwap`)와 처리가 다른 것은 그 때문이다.
   */
  capitalExpenditure?: number;
  transferExpense?: number;
  /**
   * §97③ 감가상각비 — **건물분**(원건물 카드)의 취득가액에서 공제한다. 실가 경로는 swap 대상이 아니라
   * 비교 없이 공제만 한다(`attachBuildingDepreciation` → 카드 → 단건 엔진 `calcTransferGain`).
   */
  depreciationAmount?: number;
  /**
   * 🔴 구분양도(§100②③)·감정평가 basis(부가령 §64①1호 단서)·§166⑧ 예외 — 2026-08-07 신설(P-1).
   *
   * 종전에는 payload에 **실려 오는데 구조분해를 하지 않아** 통째로 버려졌다
   * (실측: 구분 기재 3,500,000,000 → 안분값 3,816,625,253 적용 · 판정 흔적 `null`).
   * 이제 환산 경로와 **같은 함수**(`allocateBundledTransferPrice`)를 쓴다.
   */
  landTransferPrice?: number;
  buildingTransferPrice?: number;
  landAppraisalAtTransfer?: number;
  buildingAppraisalAtTransfer?: number;
  saleSplitExemption?: SaleSplitExemption;
  buildingAcquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
  /** 상속 시 피상속인 취득일 (법 §104②1호). */
  decedentAcquisitionDate?: Date;
  /** 상속인이 아닌 수유자(유증·사인증여) — 상속 카드의 §104②1호 통산 미적용(`buildProperties`). */
  nonHeirBequest?: boolean;
  /** 건물 전용 피상속인 취득일 — 비면 `decedentAcquisitionDate` (환산 경로와 같은 fallback · D3 2026-09-30) */
  buildingDecedentAcquisitionDate?: Date;
  /** 증여 시 증여자 취득일 (법 §104②2호 — 이월과세 자산). */
  donorAcquisitionDate?: Date;
  /**
   * 🔴 배우자등 이월과세(「소득세법」 §97의2①) — 토지·건물 파트별 서브객체.
   *
   * ## 종전 결함 (2026-08-23 P-C)
   *
   * 데이터는 **이미 도착해 있었다**. ④(`transfer-tax-api-gb.ts`의 실가 return)가
   * `buildGbCarryoverPayload(asset)`를 스프레드하고, `coerceGeneralBuildingPayload`
   * (`general-building-entry.ts`)가 **모드와 무관하게** 두 키를 붙여 보내며,
   * 실가 dispatch(`general-building-route-helper.ts`)가 payload를 통째 스프레드한다.
   * 그런데 이 타입에 필드가 없고 아래 구조분해가 꺼내지 않아 **여기서 조용히 증발**했다
   * (`as unknown as` 캐스트라 tsc도 침묵). ⑤·⑧ 어디에도 모드 게이트가 없어
   * 「실가 모드 + 이월과세」는 정상적으로 만들어지는 조합인데도 세액이 **1원도 안 바뀌었다**
   * (실측 299,010,000 → 299,010,000 · 배선 후 225,090,000).
   *
   * ## 취득가액 축 셋의 우열 (§159①1호 · §100② · §97의2①)
   *
   * 1. **§159①1호(부담부증여)** 와는 **결합하지 않는다** — ④ `buildGbCarryoverPayload`가
   *    `transferType === "burdened_gift"`에서 `{}`를 반환한다(중복 배선 회피).
   *    그쪽은 `bgCoDonor*` 입력으로 §159 안분 단계에 이월과세를 얹는 **다른 줄기**다.
   * 2. **§100②(파트 실지거래가액 · 자산 총액 안분)** 와는 **다투지 않는다**. 이월과세는
   *    이 라우트에서 취득가액을 **덮지 않기 때문**이다 — 카드에 서브객체를 실어 보내면
   *    단건 엔진 `calcCarryoverScenarios`가 시나리오 A(증여자 취득가액 승계)와
   *    B(`giftDateValuation`)를 **각각 통째로 교체해** 계산하고 세액이 큰 쪽을 채택한다
   *    (`transfer-tax-carryover.ts` `buildInputB:622` · `inputABase:410`).
   *    ⇒ 이월과세가 **발동하면** 위 §100② 값은 어느 시나리오에도 쓰이지 않고,
   *      **배제되면**(기간 초과·관계·가업상속) 엔진이 시나리오 B로 되돌린다.
   *    ⇒ 라우트 단계에서 우열을 판정할 것이 없다. 환산 경로가 같은 이유로 서브객체만 싣는다.
   */
  landCarryoverTaxation?: CarryoverTaxationInput;
  buildingCarryoverTaxation?: CarryoverTaxationInput;
}
// ── 경로 B: 실거래가/감정가 모드 ─────────────────────────────────────

/**
 * 경로 B의 **카드 조립 결과** — aggregate 직전 상태.
 *
 * 지분(%) 분할 취득에서 지분마다 카드를 만들어 **concat 후 aggregate 1회**를 하려면
 * 「카드까지」와 「aggregate부터」가 갈려 있어야 한다
 * (설계 `transfer-general-building-fractional-share.engine.design.md` D3-2-c).
 */
export interface ActualGbCardsResult {
  cards: AssetCardForAggregate[];
  nonBusinessRatio: number;
  /** NBL 판정 명세 — 결과 카드(`GeneralBuildingValuationDetailCard`)가 **가드 없이** 읽는다. */
  nblDetail: {
    buildingFootprintArea: number;
    allowedLandArea: number;
    isWithinNblRatio: boolean;
    nonBusinessArea: number;
    appliedMultiplier: number;
    multiplierDetail: string;
  };
  /** §166⑥ 안분 분모 (양도시 토지 + 건물 기준시가) */
  totalStd: number;
  landStdAtTransfer: number;
  transferBuildingStdPrice: number;
  acqLandStdTotal?: number;
  acqBuilding1StdTotal?: number;
  bundledActualAcquisitionPrice?: number;
  bundledActualExpenses?: number;
  /** 양도비·자본적지출 안분 echo — 신규 두 칸 입력일 때만(표시 계층 산식용). 타입 설명은 `GeneralBuildingOutput` 참조. */
  bundledActualCapitalExpenditure?: number;
  bundledActualTransferExpense?: number;
  bundledActualTransferBasis?: { land: number; building: number };
  saleSplitJudgment?: SaleSplitJudgmentDetail;
  transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
  acquisitionByInheritance?: boolean;
  buildingAcquisitionByInheritance?: boolean;
}
