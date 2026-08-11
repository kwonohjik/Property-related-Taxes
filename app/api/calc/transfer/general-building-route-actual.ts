/**
 * 일반건물 라우트 — **경로 B: 실거래가/감정가 모드**.
 *
 * §166⑥(양도가·취득가 비율 안분) + 실거래 취득가액 파트 배정 + NBL 중과 + 부담부증여 §159①1호.
 * `general-building-route-helper.ts` 800줄 정책 분리(2026-08-06).
 *
 * 환산 경로(A)는 `general-building-route-helper.ts`에 남고, 두 경로가 공유하는 카드 변환은
 * `general-building-route-cards.ts`에 있다.
 */
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  apportionLandByBusinessArea,
  allocateBundledTransferPrice,
} from "@/lib/tax-engine/general-building-valuation";
import type { SaleSplitExemption } from "@/lib/tax-engine/sale-split-deemed-unclear";
import type { SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";
import { judgeAppurtenantLandExcess } from "@/lib/tax-engine/appurtenant-land-excess";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  AssetCardForAggregate,
  GeneralBuildingOutput,
} from "@/lib/tax-engine/general-building-valuation";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import {
  buildProperties,
  buildApportionment,
  type GeneralBuildingRouteResult,
} from "./general-building-route-cards";

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
  /** 토지 취득원인 — 단기보유 기산점 분기(영 §95④). */
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
  /** 상속 시 피상속인 취득일 (영 §95④). */
  decedentAcquisitionDate?: Date;
  /** 증여 시 증여자 취득일 (영 §95④). */
  donorAcquisitionDate?: Date;
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
  saleSplitJudgment?: SaleSplitJudgmentDetail;
  transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
  acquisitionByInheritance?: boolean;
  buildingAcquisitionByInheritance?: boolean;
}

/**
 * 경로 B 카드 조립 — §166⑥ 비율로 실거래가 안분 + NBL 중과.
 *
 * 취득가액·필요경비를 기준시가 비율로 토지·건물에 안분한다(성질별 시점 상이 — P-2).
 * 환산취득가(③ 취득시 기준시가)는 사용하지 않으며 개산공제도 없음.
 *
 * ⚠️ **동작 무변경 추출**(2026-08-10 Phase A). 종전 `calculateGeneralBuildingActualTransfer`의
 *    앞부분을 그대로 옮겼다 — 로직을 손대지 않는다.
 */
export function buildActualGeneralBuildingCards(
  payload: GeneralBuildingActualPricePayload,
): ActualGbCardsResult {
  const {
    totalTransferPrice, transferDate, acquisitionDate,
    landArea, buildingFootprintArea,
    transferLandPricePerSqm, transferBuildingStdPrice,
    // isMetropolitan은 더 이상 구조분해하지 않는다 — 「지방세법 시행령」 제101조 제2항
    //   배율에 수도권 축이 없다(2026-07-30 정정). payload 필드 자체는 하위호환으로 잔존.
    zoneType, unapprovedBuilding = false,
    actualAcquisitionPrice, actualExpenses,
    acquisitionLandPricePerSqm, acquisitionBuildingStdPrice,
    burdenedGiftInfo,
    houseToCommercialConversion, conversionDate, wasMultiHouseAtConversion,
    acquisitionByInheritance, buildingAcquisitionByInheritance,
    inheritedLandValue, inheritedBuildingValue,
    landAcquisitionCause, decedentAcquisitionDate, donorAcquisitionDate,
    landAcquisitionDate, buildingAcquisitionDate, buildingAcquisitionCause,
    landDirectExpenses, buildingDirectExpenses,
    landAcquisitionPrice, buildingAcquisitionPrice,
    capitalExpenditure, transferExpense,
    landTransferPrice, buildingTransferPrice,
    landAppraisalAtTransfer, buildingAppraisalAtTransfer,
    saleSplitExemption,
  } = payload;

  /**
   * 필요경비 총액 — 자산 단위 자본적지출 + 양도비(§97①2호·3호). **legacy 후퇴 포함**(P-3).
   *
   * 후퇴 조건을 UI 게이트와 **같은 축**으로 맞춘다: `AssetSectionExpense.tsx:109-111`은
   * legacy `directExpenses` 칸을 「자본적지출·양도비가 **둘 다 0**일 때만」 띄운다.
   * 그래서 여기서도 둘 다 없을 때만 `actualExpenses`(= legacy 경로)로 후퇴한다 —
   * 합산하면 legacy만 입력한 기존 이력과 새 입력이 **이중계상**된다.
   *
   * ⚠️ 안분 **비율**은 성질별로 다르다(P-2 · §5) — 자본적지출은 **취득시**, 양도비는 **양도시**.
   *    아래 `apportionExpenses()`가 그것을 적용한다.
   */
  const declaredExpenses = (capitalExpenditure ?? 0) + (transferExpense ?? 0);
  const effectiveExpenses = declaredExpenses > 0 ? declaredExpenses : actualExpenses;

  /**
   * 파트별 카드 취득일 — 「분리 OFF면 두 날짜가 같다」 불변식의 방어적 표현(계획서 §3.2(1)).
   * `acquisitionDate`(자산 단위)는 M-1a 이후 **건물** 취득일이다.
   */
  const landCardDate = landAcquisitionDate ?? acquisitionDate;
  const buildingCardDate = buildingAcquisitionDate ?? acquisitionDate;

  // §166⑥ 안분 비율
  const landStdAtTransfer = transferLandPricePerSqm * landArea;
  const totalStd = landStdAtTransfer + transferBuildingStdPrice;
  if (totalStd <= 0) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT,
    "일반건물(실거래가): 양도시 기준시가 합계가 0이면 안분이 불가합니다.");

  const landRatioNum = landStdAtTransfer / totalStd; // 연속 부동소수 계산용

  /**
   * 🔴 **취득 축 안분 비율** — 「소득세법」 제100조 제2항 **본문**(2026-08-07 P-2).
   *
   * 조문은 「토지와 건물 등을 함께 **취득하거나** 양도한 경우 … **취득 또는 양도 당시의**
   * 기준시가 등을 고려하여 … 안분계산한다」로 **두 시점을 나란히** 든다. 함께 **취득**한 것의
   * 구분이 불분명하면 **취득 당시** 기준시가다.
   *
   * 부가령 §64①1호의 「공급계약일 현재」를 그대로 읽어 전부 양도시로 가면 안 된다 —
   * §166⑥의 준용은 **안분계산의 방법**에 관한 것이고 **시점은 §100② 본문**이 정하기 때문이다.
   *
   * ⚠️ 이 판단의 근거는 **조문 원문**이다. 같은 취지의 하급심(서울행정법원 2025구단52809 —
   *    법제처 판례 ID `618857`)이 있으나 **1심이고 본문을 확보하지 못했다** ⇒ 보조 참고일 뿐
   *    판단 근거로 쓰지 않는다(메모리 `feedback_law_citation_must_name_statute_and_tier`).
   *
   * 🔑 **증축 경로는 2026-05-11에 이미 같은 정정을 마쳤다**
   *    (`general-building-extension.ts:194-206` — 「QA 2026-05-11 버그 수정: 양도시 비율 →
   *    취득시 비율로 정정 (양도시 비율 사용 시 정답표 T-05과 수학적으로 동시 만족 불가)」).
   *    실가 경로만 미반영이었다.
   */
  const acqLandStdTotal = Math.floor((acquisitionLandPricePerSqm ?? 0) * landArea);
  const acqTotalStd = acqLandStdTotal + (acquisitionBuildingStdPrice ?? 0);
  const hasAcqStd = acqTotalStd > 0;
  const acqLandRatioNum = hasAcqStd ? acqLandStdTotal / acqTotalStd : 0;

  /**
   * 취득 축 안분이 필요한데 취득시 기준시가가 없으면 **차단한다**.
   *
   * ⚠️ **양도시 비율로 조용히 후퇴하지 않는다** — 그것이 바로 정정 대상인 동작이라,
   *    후퇴시키면 결함이 그대로 남으면서 겉으로는 계산이 된다.
   *    정상 경로에서는 validate(`transfer-tax-validate-gb.ts` V-5)가 먼저 막는다.
   */
  function requireAcqStd(what: string): void {
    if (hasAcqStd) return;
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `일반건물(실거래가): ${what}을 토지·건물로 나누려면 취득시 토지 공시지가·건물 기준시가가 필요합니다 (「소득세법」 제100조 제2항 — 취득 당시 기준시가).`,
      { what: "취득시 기준시가", reason: "gb_actual_acq_std_missing" },
    );
  }

  /**
   * 필요경비 안분 — **성질별로 시점이 다르다**(§100② 후문 · P-2 확정 규칙).
   *
   * · 자본적지출(§97①2호) → **취득시** 비율 (취득에 부수하는 지출)
   * · 양도비(§97①3호)     → **양도시** 비율 (양도에 부수하는 지출)
   * · legacy `directExpenses` → **양도시** 비율 **유지**. 두 성질이 섞인 한 덩어리라 나눌 근거가
   *   없고, 근거 없이 바꾸면 기존 이력의 세액이 움직인다.
   *
   * 잔액 흡수로 `land + building = 총액` 불변식을 지킨다(메모리 `feedback_floor_residual_absorption`).
   */
  /**
   * 🔴 양도가액 안분 — **환산 경로와 같은 함수를 쓴다**(2026-08-07 P-1).
   *
   * 종전에는 `Math.floor(totalTransferPrice * landRatioNum)`으로 자체 계산했다. 그래서
   * **구분양도(§100②③)·감정평가 basis(부가령 §64①1호 단서)·§166⑧ 예외가 통째로 빠졌다** —
   * 세 값 모두 payload에는 실려 오는데 구조분해를 하지 않아 버려졌다.
   *
   * ⚠️ 조건부로 비율만 바꾸는 식으로 고치지 말 것 — §100③ 30% 판정·감정 서열·§166⑧을
   *    **세 번째로 다시 구현**하게 된다. 공유 함수가 정본이다.
   */
  function resolveSaleAllocation() {
    return allocateBundledTransferPrice({
      totalTransferPrice,
      landArea,
      transferLandPricePerSqm,
      transferBuildingStdPrice,
      ...(landTransferPrice !== undefined ? { landTransferPrice } : {}),
      ...(buildingTransferPrice !== undefined ? { buildingTransferPrice } : {}),
      ...(landAppraisalAtTransfer !== undefined ? { landAppraisalAtTransfer } : {}),
      ...(buildingAppraisalAtTransfer !== undefined ? { buildingAppraisalAtTransfer } : {}),
      ...(saleSplitExemption ? { saleSplitExemption } : {}),
    });
  }

  function apportionExpenses(): { land: number; building: number } {
    if (declaredExpenses > 0) {
      if (capitalExpenditure) requireAcqStd("자본적지출");
      const capexLand = capitalExpenditure
        ? Math.floor(capitalExpenditure * acqLandRatioNum)
        : 0;
      const transferLand = transferExpense
        ? Math.floor(transferExpense * landRatioNum)
        : 0;
      const land = capexLand + transferLand;
      return { land, building: declaredExpenses - land };
    }
    const land = Math.floor(actualExpenses * landRatioNum);
    return { land, building: actualExpenses - land };
  }

  // 부담부증여 §159①1호 분기 — 사용자 입력 actualAcquisitionPrice 무시,
  // 자산별 양도가/취득가/개산공제를 채무비율로 환산.
  // §159①1호 단서: "양도가액을 §99 기준시가로 산정한 경우 취득가액도 §99 기준시가로 산정".
  // 부담부증여는 채무액 자체가 양도가액이므로 기준시가 모드와 동치.
  let landTransfer: number;
  let buildingTransfer: number;
  let landAcq: number;
  let buildingAcq: number;
  let landExp: number;
  let buildingExp: number;
  let transferBurdenedGiftBreakdown:
    | import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown
    | undefined;
  /** §100③ 판정 명세 — 구분 기재가 있을 때만 채워진다(표시 계층이 소비). */
  let saleSplitJudgment: SaleSplitJudgmentDetail | undefined;

  if (burdenedGiftInfo) {
    if (!acquisitionLandPricePerSqm || !acquisitionBuildingStdPrice) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "일반건물 부담부증여(§159①1호): 취득시 토지·건물 기준시가가 필요합니다.",
      );
    }
    const breakdown = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: landStdAtTransfer,
      buildingStdPriceAtTransfer: transferBuildingStdPrice,
      landStdPriceAtAcquisition: acquisitionLandPricePerSqm * landArea,
      buildingStdPriceAtAcquisition: acquisitionBuildingStdPrice,
      info: burdenedGiftInfo,
      giftDate: transferDate, // 증여일 = 양도일 (의제)
      /**
       * K-4(실지취득가) 실비 — 채무비율 안분 후 `estimatedDeduction` 슬롯에 반영.
       *
       * 🔑 **평가모드별 소비 여부는 엔진(STEP 5)이 정한다.** 「소득세법」 제97조 제2항은
       *    **1호**(취득가액을 **실지거래가액**에 의하는 경우) = 「제1항제2호 및 제3호의 금액을 더한 금액」,
       *    **2호**(그 밖의 경우) = 「자산별로 대통령령으로 정하는 금액」(= 개산공제 §163⑥)으로 나눈다.
       *    ⇒ K-1~K-3(기준시가)·K-5(환산)에서 자본적지출·양도비가 **안 쓰이는 것이 정본**이다.
       *    여기서 값을 넘겨도 STEP 5의 `acquisitionMethodUsed !== "actual"` 분기가 무시한다.
       *
       * 🔴 **payload 필드를 직접 소비한다**(2026-08-07 W-4). 종전에는 `actualExpenses`만 읽어
       *    **`route.ts`가 두 값을 합쳐 주는 데 의존**했다 — payload에 실려 오는 값을 엔진이
       *    구조분해하고도 쓰지 않는, P-1과 같은 모양이었다. 단건 경로
       *    (`transfer-tax-burdened-gift-step.ts:44-45`)는 처음부터 둘을 따로 넘긴다.
       *
       * ⚠️ 합산하지 않고 **택일**한다 — legacy `directExpenses`와 신규 두 칸을 더하면 이중계상이다
       *    (`effectiveExpenses`와 같은 축).
       */
      capitalExpenditure: declaredExpenses > 0 ? (capitalExpenditure ?? 0) : actualExpenses,
      transferExpense: declaredExpenses > 0 ? (transferExpense ?? 0) : 0,
    });
    landTransfer = breakdown.perAsset.land.transferPrice;
    buildingTransfer = breakdown.perAsset.building.transferPrice;
    landAcq = breakdown.perAsset.land.acquisitionPrice;
    buildingAcq = breakdown.perAsset.building.acquisitionPrice;
    landExp = breakdown.perAsset.land.estimatedDeduction; // §163⑥ 개산공제 (3%)
    buildingExp = breakdown.perAsset.building.estimatedDeduction;
    transferBurdenedGiftBreakdown = breakdown; // 증여세 통합 결과 포함 — UI 노출용
  } else if (acquisitionByInheritance && buildingAcquisitionByInheritance) {
    // §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1): 토지·건물 각 상속개시일 평가액을
    // 취득당시 실지거래가액으로 직접 배정. §166⑥ 안분 아님 (KoreanLaw: 상속은 자산별 평가액 명확
    // → "구분 불분명" 요건 미충족). 양도가액은 §100②③ 판정을 거친다(P-1).
    const saleAlloc = resolveSaleAllocation();
    landTransfer = saleAlloc.allocation.land;
    buildingTransfer = saleAlloc.allocation.building;
    saleSplitJudgment = saleAlloc.judgment;
    landAcq = inheritedLandValue ?? 0;
    buildingAcq = inheritedBuildingValue ?? 0;
    // 필요경비는 성질별 비율로 안분한다(P-2). 개산공제 아님 —
    // actual 모드는 이미 전 카드 estimatedDeduction:0(§163⑥ 미적용, §163⑨ 정합).
    ({ land: landExp, building: buildingExp } = apportionExpenses());
  } else {
    const saleAlloc = resolveSaleAllocation();
    landTransfer = saleAlloc.allocation.land;
    buildingTransfer = saleAlloc.allocation.building;
    saleSplitJudgment = saleAlloc.judgment;
    /**
     * 🔴 파트별 실지거래가액이 **둘 다** 있으면 안분하지 않고 그대로 쓴다(2026-08-06).
     *
     * 종전에는 이 값을 destructure조차 하지 않아, 분리 ON + 두 파트 모두 실거래가에서
     * 파트 취득가액이 **엔진에 도달하지 못했다**. 분리 ON은 자산 단위 취득가액 칸을 숨기므로
     * (`hideAssetAcqAxis`) `actualAcquisitionPrice`가 0이 되어 **취득가액 0**으로 계산됐다
     * (실측 과대과세 139,033,991원 · validate는 통과시켰다).
     *
     * 근거는 「소득세법」 제100조 제2항 **전문**이다 — 안분은 「가액 구분이 **불분명할 때**」의
     * 규칙이고, 별개 취득으로 파트별 실지거래가액이 실재하면 구분이 분명하다.
     *
     * ⚠️ **한쪽만** 입력된 경우는 안분을 유지한다. 반쪽 값으로 총액을 대체하면 상대 파트가
     *    잔액으로 깎이는데, 그 총액은 두 파트의 합이 아니라 자산 전체 입력값이다
     *    (P5의 필요경비 규칙과 같은 판단).
     */
    const hasBothPartPrices =
      landAcquisitionPrice !== undefined &&
      landAcquisitionPrice > 0 &&
      buildingAcquisitionPrice !== undefined &&
      buildingAcquisitionPrice > 0;
    if (hasBothPartPrices) {
      landAcq = landAcquisitionPrice;
      buildingAcq = buildingAcquisitionPrice;
    } else if (actualAcquisitionPrice > 0) {
      // 🔴 **취득시** 비율이다(P-2) — §100② 본문 「취득 당시」. 종전 양도시 비율은 정정 대상이었다.
      requireAcqStd("취득가액");
      landAcq = Math.floor(actualAcquisitionPrice * acqLandRatioNum);
      buildingAcq = actualAcquisitionPrice - landAcq;
    } else {
      // 취득가액 0 — 나눌 것이 없으므로 취득시 기준시가를 요구하지 않는다(거짓 차단 금지).
      landAcq = 0;
      buildingAcq = 0;
    }
    /**
     * 필요경비 — **파트 직접 귀속이 있으면 안분하지 않는다**(2026-08-05 P5).
     * 근거는 「소득세법」 제100조 제2항 후문의 **유추**다: "이 경우 **공통되는** 취득가액과
     * 양도비용은 해당 자산의 가액에 비례하여 안분계산한다." — 문언은 취득가액·양도비용만 들고
     * **자본적지출을 열거하지 않으므로 직접 근거가 아니다**. 다만 「공통되는」이 요건인 구조는
     * 같아, 귀속이 분명한 지출을 안분하지 않는 것이 그 취지에 부합한다(`AssetSectionExpense.tsx:37`
     * 의 일부양도 유추와 같은 층위).
     * 한쪽만 입력되면 그 파트만 직접 귀속하고 나머지는 총액 안분분을 그대로 둔다
     * (잔액 도출로 상대 파트를 깎지 않는다 — 총액은 두 파트의 합이 아니라 자산 전체 입력값이다).
     */
    // ⚠️ 두 파트 모두 직접 귀속이면 안분 자체가 없다 — `apportionExpenses()`를 부르지 않는다.
    //    부르면 `requireAcqStd`가 **쓰이지도 않을 값** 때문에 차단한다(거짓 차단 금지).
    if (landDirectExpenses !== undefined && buildingDirectExpenses !== undefined) {
      landExp = landDirectExpenses;
      buildingExp = buildingDirectExpenses;
    } else {
      const apportionedExp = apportionExpenses();
      landExp = landDirectExpenses ?? apportionedExp.land;
      buildingExp = buildingDirectExpenses ?? apportionedExp.building;
    }
  }

  // NBL 판정 — 본체는 공용 헬퍼(`appurtenant-land-excess.ts`). 환산·증축 경로와 공유.
  const {
    isWithinLimit: isWithinNblRatio,
    nonBusinessArea,
    nonBusinessRatio,
    allowedLandArea,
    multiplier: appliedMultiplier,
    multiplierDetail,
  } = judgeAppurtenantLandExcess({
    landArea,
    buildingFootprintArea,
    zoneType,
    unapprovedBuilding,
    context: "일반건물(실거래가)",
  });

  // 토지 카드 생성 (초과 시 사업용·비사업용 분할 — 인정면적 직접 안분, round 의존 제거)
  const cards: AssetCardForAggregate[] = [];
  if (!isWithinNblRatio && nonBusinessRatio > 0) {
    const businessArea = landArea - nonBusinessArea; // 사업용 인정면적 (무허가=0)
    const landBizTransfer = apportionLandByBusinessArea(landTransfer, businessArea, landArea);
    const landBizAcq = apportionLandByBusinessArea(landAcq, businessArea, landArea);
    const landBizExp = apportionLandByBusinessArea(landExp, businessArea, landArea);
    cards.push({
      propertyId: "land_business", propertyLabel: "토지-사업용(1001)", propertyType: "land",
      transferPrice: landBizTransfer, acquisitionPrice: landBizAcq, expenses: landBizExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: false,
    } as unknown as AssetCardForAggregate);
    cards.push({
      propertyId: "land_nbl", propertyLabel: "토지-비사업용초과분(1002)", propertyType: "land",
      transferPrice: landTransfer - landBizTransfer,
      acquisitionPrice: landAcq - landBizAcq,
      expenses: landExp - landBizExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: true,
    } as unknown as AssetCardForAggregate);
  } else {
    cards.push({
      propertyId: "land", propertyLabel: "토지(1001)", propertyType: "land",
      transferPrice: landTransfer, acquisitionPrice: landAcq, expenses: landExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: false,
    } as unknown as AssetCardForAggregate);
  }
  cards.push({
    propertyId: "building", propertyLabel: "건물(3001)", propertyType: "general_building_unit",
    transferPrice: buildingTransfer, acquisitionPrice: buildingAcq, expenses: buildingExp,
    usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
    acquisitionDate: buildingCardDate, transferDate, isNonBusinessLand: false,
  } as unknown as AssetCardForAggregate);

  // §95④ 단기보유 기산점 보강 (actual 분기 기존 결측 — 상속·증여 취득원인 + 피상속인/증여자 취득일).
  // 토지 카드는 landAcquisitionCause, 건물 카드는 buildingAcquisitionCause로 buildProperties가 판독.
  for (const c of cards) {
    if (c.propertyType === "land") {
      if (landAcquisitionCause) c.landAcquisitionCause = landAcquisitionCause;
      if (decedentAcquisitionDate) c.decedentAcquisitionDate = decedentAcquisitionDate;
      if (donorAcquisitionDate) c.donorAcquisitionDate = donorAcquisitionDate;
    } else {
      // 건물 카드 — 취득원인을 **항상** 싣는다(종전에는 상속만 실려 §104② 기산점 분기가 죽었다).
      // buildProperties(:158)가 `card.buildingAcquisitionCause`로 판독한다.
      if (buildingAcquisitionByInheritance) {
        // C1: 건물도 상속 — 피상속인 취득일(동일 피상속인 전제).
        c.buildingAcquisitionCause = "inheritance";
        if (decedentAcquisitionDate) c.decedentAcquisitionDate = decedentAcquisitionDate;
      } else if (buildingAcquisitionCause) {
        c.buildingAcquisitionCause = buildingAcquisitionCause;
      }
    }
  }

  // 사례 35: 주택→상가 용도변경 — 모든 자산 카드에 일괄 propagate
  if (houseToCommercialConversion) {
    for (const c of cards) {
      c.houseToCommercialConversion = true;
      c.conversionDate = conversionDate;
      c.wasMultiHouseAtConversion = wasMultiHouseAtConversion;
    }
  }

  return {
    cards,
    nonBusinessRatio,
    nblDetail: {
      buildingFootprintArea,
      allowedLandArea,
      isWithinNblRatio,
      nonBusinessArea,
      appliedMultiplier,
      multiplierDetail,
    },
    totalStd,
    landStdAtTransfer,
    transferBuildingStdPrice,
    // UI 자산별 산식 인라인 표시용 — 실가 모드에서도 gbDetail 노출 (사례 35 등).
    acqLandStdTotal: acquisitionLandPricePerSqm
      ? Math.floor(acquisitionLandPricePerSqm * landArea)
      : undefined,
    acqBuilding1StdTotal: acquisitionBuildingStdPrice ?? undefined,
    bundledActualAcquisitionPrice: actualAcquisitionPrice ?? undefined,
    bundledActualExpenses: actualExpenses ?? undefined,
    saleSplitJudgment,
    transferBurdenedGiftBreakdown,
    acquisitionByInheritance,
    buildingAcquisitionByInheritance,
  };
}

/**
 * 실거래가/감정가 모드 — 카드 조립(위) + aggregate.
 *
 * 단건 진입점. 지분 분할은 `general-building-fractional.ts`가
 * `buildActualGeneralBuildingCards`를 지분마다 부른 뒤 aggregate를 **1회만** 한다.
 */
export function calculateGeneralBuildingActualTransfer(
  payload: GeneralBuildingActualPricePayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
): GeneralBuildingRouteResult {
  const built = buildActualGeneralBuildingCards(payload);
  const { cards, nonBusinessRatio, totalStd, landStdAtTransfer } = built;

  const properties = buildProperties(cards, nonBusinessRatio, undefined, {
    land: payload.unregisteredLand,
    building: payload.unregisteredBuilding,
  });
  const aggregated = calculateTransferTaxAggregate(
    {
      taxYear,
      properties,
      annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      priorReductionUsage: (priorReductionUsage ?? []) as never,
    },
    rates,
  );

  const apportionment = buildApportionment(
    cards, totalStd, nonBusinessRatio,
    landStdAtTransfer, null,
    built.transferBuildingStdPrice, null,
    false,
    "소득세법 시행령 §166⑥ · §104의3",
  );

  // landStdTotal·buildingStdTotal로 §166⑥ 안분 산식 빌더 활성화.
  aggregated.generalBuildingValuationDetail = {
    assetCards: cards,
    nonBusinessRatio,
    landStdTotal: landStdAtTransfer,
    buildingStdTotal: built.transferBuildingStdPrice,
    acqLandStdTotal: built.acqLandStdTotal,
    acqBuilding1StdTotal: built.acqBuilding1StdTotal,
    bundledActualAcquisitionPrice: built.bundledActualAcquisitionPrice,
    bundledActualExpenses: built.bundledActualExpenses,
    /**
     * §100③ 판정 명세 — 화면(`BundledAllocationCard.tsx:575`)이 이 키를 읽는다.
     * 🔴 종전에는 이 객체를 만들면서 이 키만 빠져 있었다 ⇒ 판정해도 화면에 안 떴다(P-1).
     */
    ...(built.saleSplitJudgment ? { saleSplitJudgment: built.saleSplitJudgment } : {}),
    // §163⑨ 상속 취득가액 직접 산정 echo (결과 카드 라벨 분기용).
    ...(built.acquisitionByInheritance ? { acquisitionByInheritance: true } : {}),
    ...(built.buildingAcquisitionByInheritance
      ? { buildingAcquisitionByInheritance: true }
      : {}),
  } as GeneralBuildingOutput;

  return {
    apportionment,
    aggregated,
    transferBurdenedGiftBreakdown: built.transferBurdenedGiftBreakdown,
  };
}
