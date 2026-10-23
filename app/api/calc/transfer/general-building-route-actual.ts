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
  applyCarryoverEstimationBasis,
} from "@/lib/tax-engine/general-building-valuation";
import { splitLandCarryover } from "@/lib/tax-engine/carryover-land-split";
import type { SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";
import type { ApportionBasisKind } from "@/lib/tax-engine/sale-split-apportion-basis";
import { judgeAppurtenantLandExcess } from "@/lib/tax-engine/appurtenant-land-excess";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  AssetCardForAggregate,
  GeneralBuildingOutput,
} from "@/lib/tax-engine/general-building-valuation";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import { attachBuildingDepreciation } from "@/lib/tax-engine/general-building-depreciation";
import {
  buildProperties,
  buildApportionment,
  type GeneralBuildingRouteResult,
  type GbAssetLevelInputs,
} from "./general-building-route-cards";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { apportionByStdPrice } from "@/lib/tax-engine/std-price-apportion";
import { gbBurdenedGiftSelfBuiltPenaltyAxis, GB_BG_SELF_BUILT_NOTICE } from "@/lib/tax-engine/general-building-bg-penalty-signal";

export type { GeneralBuildingActualPricePayload, ActualGbCardsResult } from "./general-building-route-actual.types";
import type { GeneralBuildingActualPricePayload, ActualGbCardsResult } from "./general-building-route-actual.types";

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
    zoneType, unapprovedBuilding = false, isDesignatedArea,
    actualAcquisitionPrice, actualExpenses,
    acquisitionLandPricePerSqm, acquisitionBuildingStdPrice,
    burdenedGiftInfo,
    houseToCommercialConversion, conversionDate, wasMultiHouseAtConversion,
    acquisitionByInheritance, buildingAcquisitionByInheritance,
    inheritedLandValue, inheritedBuildingValue,
    landAcquisitionCause, decedentAcquisitionDate, donorAcquisitionDate, buildingDecedentAcquisitionDate,
    landAcquisitionDate, buildingAcquisitionDate, buildingAcquisitionCause,
    landDirectExpenses, buildingDirectExpenses,
    landAcquisitionPrice, buildingAcquisitionPrice,
    capitalExpenditure, transferExpense,
    landTransferPrice, buildingTransferPrice,
    landAppraisalAtTransfer, buildingAppraisalAtTransfer,
    saleSplitExemption,
    landCarryoverTaxation, buildingCarryoverTaxation,
  } = payload;

  /**
   * 필요경비 총액 — 자산 단위 자본적지출 + 양도비(§97①2호·3호). **legacy 후퇴 포함**(P-3).
   *
   * 후퇴 조건을 UI 게이트와 **같은 축**으로 맞춘다: `AssetSectionExpense.tsx:109-111`은
   * legacy `directExpenses` 칸을 「자본적지출·양도비가 **둘 다 0**일 때만」 띄운다.
   * 그래서 여기서도 둘 다 없을 때만 `actualExpenses`(= legacy 경로)로 후퇴한다 —
   * 합산하면 legacy만 입력한 기존 이력과 새 입력이 **이중계상**된다.
   *
   * ⚠️ 안분 **기준**은 성질별로 다르다(P-2 · §5 + 2026-10-22 사용자 규칙) — 자본적지출은 **취득시 기준시가**,
   *    양도비는 **각 파트에 적용된 양도가액**(구분 기재·감정이면 그 가액, 기준시가 안분이면 양도시 기준시가).
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
  const acqLandStdTotal = multiplyByArea((acquisitionLandPricePerSqm ?? 0), landArea);
  const acqBuildingStd = acquisitionBuildingStdPrice ?? 0;
  const acqTotalStd = acqLandStdTotal + acqBuildingStd;
  const hasAcqStd = acqTotalStd > 0;

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
      transferDate,
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

  /**
   * 필요경비 안분 — **성질별로 기준이 다르다**(§100② 후문 · P-2 확정 규칙 + 2026-10-22 사용자 규칙).
   *
   * · 자본적지출(§97①2호) → **취득시 기준시가** 비율 (취득에 부수하는 지출)
   * · 양도비(§97①3호)     → **각 파트에 적용된 자산가액** 비율 (`saleBasis`) — 구분 기재 채택이면 그 가액,
   *   감정이면 감정가액, 기준시가 안분이면 양도시 기준시가. 종전에는 양도시 기준시가 고정이라 구분 기재·감정으로
   *   양도가액을 나눈 경우에도 양도비만 다른 비율로 나뉘었다(`gb-transfer-expense-apportion-basis.plan.md`).
   * · legacy `directExpenses` → **양도시 기준시가** 비율 **유지**. 두 성질이 섞인 한 덩어리라 나눌 근거가
   *   없고, 근거 없이 바꾸면 기존 이력의 세액이 움직인다.
   *
   * 모두 `apportionByStdPrice`(정수 곱셈 먼저·잔액 흡수)다 — 비율 변수로 `Math.floor(x * ratio)` 하면 1원 과소가 난다.
   * 잔액 흡수로 `land + building = 총액` 불변식을 지킨다(메모리 `feedback_floor_residual_absorption`).
   */
  function apportionExpenses(saleBasis: { land: number; building: number }): { land: number; building: number } {
    if (declaredExpenses > 0) {
      if (capitalExpenditure) requireAcqStd("자본적지출");
      const capexLand = capitalExpenditure
        ? apportionByStdPrice(capitalExpenditure, acqLandStdTotal, acqBuildingStd).land
        : 0;
      const transferLand = transferExpense
        ? apportionByStdPrice(transferExpense, saleBasis.land, saleBasis.building).land
        : 0;
      const land = capexLand + transferLand;
      return { land, building: declaredExpenses - land };
    }
    const land = apportionByStdPrice(
      actualExpenses,
      multiplyByArea(transferLandPricePerSqm, landArea),
      transferBuildingStdPrice,
    ).land;
    return { land, building: actualExpenses - land };
  }

  /**
   * 파트 직접 귀속(P5)까지 반영한 필요경비 — 매매 분기와 둘 다 상속(C1) 분기가 함께 쓴다.
   *
   * 파트 칸(`landDirectExpenses`·`buildingDirectExpenses`)은 화면 라벨대로 **자본적지출**만 대체한다. 양도비는 파트 칸이
   * 없으므로 위 규칙대로 안분해 **더한다**(§100② 후문 「공통되는 … 양도비용」 — 주택 분리 경로 F23과 같은 규칙).
   * 종전에는 파트 칸이 그 파트의 필요경비 전체를 대체해 양도비 몫이 사라졌고, C1 분기는 파트 칸을 아예 읽지 않았다.
   * legacy(`declaredExpenses` 0 — 두 성질이 섞인 한 덩어리)는 종전 그대로 파트 칸이 안분분을 대체한다.
   */
  const hasPartCapex = landDirectExpenses !== undefined || buildingDirectExpenses !== undefined;
  function resolvePartExpenses(saleBasis: { land: number; building: number }): { land: number; building: number } {
    if (!hasPartCapex) return apportionExpenses(saleBasis);
    const bothDirect = landDirectExpenses !== undefined && buildingDirectExpenses !== undefined;
    if (declaredExpenses > 0) {
      // 두 파트 모두 직접 귀속이면 자본적지출 안분이 없다 — 쓰이지 않을 취득시 기준시가를 요구하지 않는다(거짓 차단 금지).
      let capex = { land: 0, building: 0 };
      if (!bothDirect && capitalExpenditure) {
        requireAcqStd("자본적지출");
        const land = apportionByStdPrice(capitalExpenditure, acqLandStdTotal, acqBuildingStd).land;
        capex = { land, building: capitalExpenditure - land };
      }
      const txLand = transferExpense ? apportionByStdPrice(transferExpense, saleBasis.land, saleBasis.building).land : 0;
      return {
        land: (landDirectExpenses ?? capex.land) + txLand,
        building: (buildingDirectExpenses ?? capex.building) + ((transferExpense ?? 0) - txLand),
      };
    }
    if (bothDirect) return { land: landDirectExpenses, building: buildingDirectExpenses };
    const apportioned = apportionExpenses(saleBasis);
    return { land: landDirectExpenses ?? apportioned.land, building: buildingDirectExpenses ?? apportioned.building };
  }

  // 부담부증여 §159①1호 분기 — 사용자 입력 actualAcquisitionPrice 무시,
  // 자산별 양도가/취득가/개산공제를 채무비율로 환산.
  // §159①1호 단서: "양도가액을 §99 기준시가로 산정한 경우 취득가액도 §99 기준시가로 산정".
  // 부담부증여는 채무액 자체가 양도가액이므로 기준시가 모드와 동치.
  let landTransfer: number;
  let buildingTransfer: number;
  let landAcq: number;
  let buildingAcq: number;
  // E-U2 — 실거래가의 출처(상속·부담부증여 분기는 채우지 않는다)
  let actualSource: "part_input" | "bundled_apportion" | undefined;
  let landExp: number;
  let buildingExp: number;
  let transferBurdenedGiftBreakdown:
    | import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown
    | undefined;
  /** §100③ 판정 명세 — 구분 기재가 있을 때만 채워진다(표시 계층이 소비). */
  let saleSplitJudgment: SaleSplitJudgmentDetail | undefined;
  /** 구분 기재 없이 안분했을 때 엔진이 쓴 basis 종류 — 표시 전용 echo(판정과 배타). */
  let saleApportionBasisKind: ApportionBasisKind | undefined;
  /** 양도비를 토지·건물로 나눌 때 비례시킨 자산가액 — 표시 계층 산식용 echo(상속·일반 분기에서만 채운다). */
  let transferExpenseBasis: { land: number; building: number } | undefined;

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
    saleApportionBasisKind = saleAlloc.saleApportionBasisKind;
    transferExpenseBasis = saleAlloc.proportionBasis;
    landAcq = inheritedLandValue ?? 0;
    buildingAcq = inheritedBuildingValue ?? 0;
    // 필요경비는 성질별 기준으로 안분하고 파트 자본적지출 칸을 직접 귀속한다(P-2·P5 — 매매 분기와 같은 규칙). 개산공제 아님 —
    // actual 모드는 이미 전 카드 estimatedDeduction:0(§163⑥ 미적용, §163⑨ 정합).
    ({ land: landExp, building: buildingExp } = resolvePartExpenses(saleAlloc.proportionBasis));
  } else {
    const saleAlloc = resolveSaleAllocation();
    landTransfer = saleAlloc.allocation.land;
    buildingTransfer = saleAlloc.allocation.building;
    saleSplitJudgment = saleAlloc.judgment;
    saleApportionBasisKind = saleAlloc.saleApportionBasisKind;
    transferExpenseBasis = saleAlloc.proportionBasis;
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
      actualSource = "part_input";
    } else if (actualAcquisitionPrice > 0) {
      actualSource = "bundled_apportion";
      // 🔴 **취득시** 비율이다(P-2) — §100② 본문 「취득 당시」. 종전 양도시 비율은 정정 대상이었다.
      requireAcqStd("취득가액");
      landAcq = apportionByStdPrice(actualAcquisitionPrice, acqLandStdTotal, acqBuildingStd).land;
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
    ({ land: landExp, building: buildingExp } = resolvePartExpenses(saleAlloc.proportionBasis));
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
    /**
     * 🔴 이월과세 입력도 **함께 갈라야 한다** — 환산 경로와 **같은 헬퍼·같은 인자**다
     *    (`general-building-valuation.ts:460`). 두 카드에 통째로 복사하면 증여자 취득가액·
     *    증여 당시 평가액·증여세가 전부 **2배**로 들어간다(환산에서 실측된 과소 8,706,426).
     *
     * 🔑 인자가 실제로 같다: 환산은 `splitLandCarryover(ct, allowedLandArea, landArea)`를
     *    쓰는데, 이 분기의 `businessArea = landArea − nonBusinessArea`이고
     *    `nonBusinessArea = max(0, landArea − allowedLandArea)`(`appurtenant-land-excess.ts:124`)라
     *    분기 조건(`landArea > allowedLandArea`) 아래에서 `businessArea === allowedLandArea`다.
     *    위 세 줄의 `apportionLandByBusinessArea`와도 같은 술어·같은 인자다
     *    (메모리 `feedback_shared_predicate_argument_parity`).
     */
    const splitCt = splitLandCarryover(landCarryoverTaxation, businessArea, landArea);
    cards.push({
      propertyId: "land_business", propertyLabel: "토지-사업용(1001)", propertyType: "land",
      transferPrice: landBizTransfer, acquisitionPrice: landBizAcq, expenses: landBizExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: false,
      carryoverTaxation: splitCt.business,
    } as unknown as AssetCardForAggregate);
    cards.push({
      propertyId: "land_nbl", propertyLabel: "토지-비사업용초과분(1002)", propertyType: "land",
      transferPrice: landTransfer - landBizTransfer,
      acquisitionPrice: landAcq - landBizAcq,
      expenses: landExp - landBizExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: true,
      ...(isDesignatedArea !== undefined ? { isDesignatedArea } : {}),
      carryoverTaxation: splitCt.nbl,
    } as unknown as AssetCardForAggregate);
  } else {
    cards.push({
      propertyId: "land", propertyLabel: "토지(1001)", propertyType: "land",
      transferPrice: landTransfer, acquisitionPrice: landAcq, expenses: landExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: false,
      carryoverTaxation: landCarryoverTaxation,
    } as unknown as AssetCardForAggregate);
  }
  /**
   * 부담부증여 K-5(환산)·K-7(감정) × 양도인 본인 신축 → §114조의2 신호 (PR-5b). 카드는 §159 안분 취득가액(`usedEstimatedAcquisition:false`)으로 계산하되
   * 가산세만 `penaltyAxis`·신축일로 싣는다 — base 규칙은 단건 `runBurdenedGiftStep`과 같은 leaf 가 정한다.
   */
  const bgPenaltyAxis =
    burdenedGiftInfo && transferBurdenedGiftBreakdown
      ? gbBurdenedGiftSelfBuiltPenaltyAxis(burdenedGiftInfo, transferBurdenedGiftBreakdown, buildingAcquisitionCause === "newConstruction", buildingCardDate, transferDate)
      : undefined;
  cards.push({
    propertyId: "building", propertyLabel: "건물(3001)", propertyType: "general_building_unit",
    transferPrice: buildingTransfer, acquisitionPrice: buildingAcq, expenses: buildingExp,
    usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
    acquisitionDate: buildingCardDate, transferDate, isNonBusinessLand: false,
    ...(bgPenaltyAxis ? { isSelfBuilt: true, buildingAcquisitionDate: buildingCardDate, penaltyAxis: bgPenaltyAxis } : {}),
    /**
     * 건물 이월과세 — 법 §97의2①은 「토지·건물 등」이라 건물도 대상이다. 환산 경로와 달리
     * 실가 경로의 건물 카드는 **1장뿐**이라 분할이 없다(NBL은 토지 축이다).
     */
    carryoverTaxation: buildingCarryoverTaxation,
  } as unknown as AssetCardForAggregate);

  // §95④ 단기보유 기산점 보강 (actual 분기 기존 결측 — 상속·증여 취득원인 + 피상속인/증여자 취득일).
  // 토지 카드는 landAcquisitionCause, 건물 카드는 buildingAcquisitionCause로 buildProperties가 판독.
  for (const c of cards) {
    c.acquisitionMode = "actual"; // E-1 echo — 실가 경로는 두 파트가 모두 실지거래가액(감정·매매사례는 환산 경로로 간다)
    if (actualSource) c.actualSource = actualSource; // E-U2 echo — 파트 직접 입력 vs 일괄 총액 안분(표시 전용)
    if (c.propertyType === "land") {
      if (landAcquisitionCause) c.landAcquisitionCause = landAcquisitionCause;
      if (decedentAcquisitionDate) c.decedentAcquisitionDate = decedentAcquisitionDate;
      if (donorAcquisitionDate) c.donorAcquisitionDate = donorAcquisitionDate;
    } else {
      // 건물 카드 — 취득원인을 **항상** 싣는다(종전에는 상속만 실려 §104② 기산점 분기가 죽었다).
      // buildProperties(:158)가 `card.buildingAcquisitionCause`로 판독한다.
      const buildingCause = buildingAcquisitionByInheritance ? "inheritance" : buildingAcquisitionCause;
      if (buildingCause) c.buildingAcquisitionCause = buildingCause;
      if (buildingCause === "inheritance") {
        // 🔴 D3(2026-09-30): 건물 전용 피상속인 취득일 우선 — 환산 경로(`general-building-valuation.ts`)와
        //    같은 fallback. 종전에는 토지 값만 읽어 **건물만 상속**이면 날짜가 없었다(단기세율 — 94,061,000 → 126,269,000).
        const bd = buildingDecedentAcquisitionDate ?? decedentAcquisitionDate;
        if (bd) c.decedentAcquisitionDate = bd;
      }
    }
  }

  /**
   * 🔑 **환산 경로와 같은 것 · 다른 것** (`general-building-valuation.ts:593` 대비).
   *
   * **같다** — 이 주입은 「GB 파트를 환산으로 평가하느냐」와 **직교**다.
   * `carryoverTaxation.useEstimatedAcquisition`은 **증여자의** 취득가액을 모를 때
   * 그것을 §97①1호 나목·영 §163⑨로 환산하느냐는 축이고(`transfer-carryover.types.ts:31-40`),
   * ⑤(`GeneralBuildingAcquisitionCards.tsx:627`)도 ⑧(`transfer-tax-validate-gb-carryover.ts:79-84`)도
   * `landAcqMode`를 보지 않는다 — 실가 모드에서도 열려 있고 분자를 **필수로 요구**한다.
   * ⇒ 여기서 빼면 그 필수 입력이 도달하지 못해 시나리오 A 취득가액이 **0**이 된다(P-B와 같은 모양).
   *
   * **다르다** — 함수 안에서 `useEstimatedAcquisition`이 아니면 즉시 건너뛰므로,
   * 실가 모드 카드의 `usedEstimatedAcquisition: false`(GB 파트 축)는 손대지 않는다. 회귀 0.
   *
   * 분모는 **파트의 양도 당시 기준시가 전액**을 넘긴다 — NBL 2분할 카드에서도 분자를 쪼개지
   * 않으므로(`splitLandCarryover`는 금액 4칸만 자른다) 분자·분모가 같은 기준을 유지한다.
   * 환산 경로가 넘기는 값과 같은 축이다.
   */
  applyCarryoverEstimationBasis(cards, landStdAtTransfer, transferBuildingStdPrice);

  // 사례 35: 주택→상가 용도변경 — 모든 자산 카드에 일괄 propagate
  if (houseToCommercialConversion) {
    for (const c of cards) {
      c.houseToCommercialConversion = true;
      c.conversionDate = conversionDate;
      c.wasMultiHouseAtConversion = wasMultiHouseAtConversion;
    }
  }

  return {
    // §97③ 감가상각비 — 원건물 카드에 싣는다(공제는 카드 → 단건 엔진이 한 번만 한다).
    // 부담부증여(§159)는 카드 취득가액이 채무비율 안분값이라 공제 대상이 아니다 — 싣지 않는다(⑧ validate가 먼저 막는다).
    cards: payload.burdenedGiftInfo ? cards : attachBuildingDepreciation(cards, payload.depreciationAmount),
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
      ? multiplyByArea(acquisitionLandPricePerSqm, landArea)
      : undefined,
    acqBuilding1StdTotal: acquisitionBuildingStdPrice ?? undefined,
    bundledActualAcquisitionPrice: actualAcquisitionPrice ?? undefined,
    bundledActualExpenses: actualExpenses ?? undefined,
    // 신규 두 칸 입력일 때만 — legacy 후퇴(`declaredExpenses === 0`)에서는 안분 echo가 없다(표시 계층이 종전 산식을 쓴다).
    // 파트 자본적지출 칸만 있고 legacy 총액이 없으면 그 값도 싣는다 — 산식이 「직접 입력」 항목으로 적는다(`resolvePartExpenses`와 같은 축).
    ...((declaredExpenses > 0 || (hasPartCapex && !(actualExpenses > 0))) && transferExpenseBasis
      ? {
          bundledActualCapitalExpenditure: capitalExpenditure ?? 0,
          bundledActualTransferExpense: transferExpense ?? 0,
          bundledActualTransferBasis: transferExpenseBasis,
          ...(hasPartCapex
            ? {
                bundledActualPartCapitalExpenditure: {
                  ...(landDirectExpenses !== undefined ? { land: landDirectExpenses } : {}),
                  ...(buildingDirectExpenses !== undefined ? { building: buildingDirectExpenses } : {}),
                },
              }
            : {}),
        }
      : {}),
    saleSplitJudgment,
    ...(saleApportionBasisKind ? { saleApportionBasisKind } : {}),
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
export function runActualGeneralBuildingOnce(
  payload: GeneralBuildingActualPricePayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
  /** ⑭ 자산-수준 감면·가산세 (F17). 환산 경로와 **같은 규약**이어야 한다. */
  assetLevel?: GbAssetLevelInputs,
): GeneralBuildingRouteResult {
  const built = buildActualGeneralBuildingCards(payload);
  const { cards, nonBusinessRatio, totalStd, landStdAtTransfer } = built;

  const properties = buildProperties(cards, nonBusinessRatio, undefined, {
    land: payload.unregisteredLand,
    building: payload.unregisteredBuilding,
  }, assetLevel?.reductions, payload.nonHeirBequest);
  const aggregated = calculateTransferTaxAggregate(
    {
      taxYear,
      properties,
      annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      // 카드는 **한 물건의 파트**(토지/건물)라 양도일이 같다 — §103②의 자산 순서가
      // 성립하지 않아 한계세율 축을 쓴다(종전 `"MAX_BENEFIT"`과 **같은 거동**).
      basicDeductionAllocation: "PARTS_HIGHEST_RATE",
      priorReductionUsage: (priorReductionUsage ?? []) as never,
      // 신고서 단위 가산세 — 카드별 입력이 아니다(같은 신고가 카드 수만큼 배가되는 것을 막는다).
      filingPenaltyDetails: assetLevel?.filingPenaltyDetails,
      delayedPaymentDetails: assetLevel?.delayedPaymentDetails,
      // 신고서 단위 수정신고·경정청구 — 가산세와 **같은 축**이다(신고 1건 1회).
      amendment: assetLevel?.amendment,
    },
    rates,
  );

  // 부담부증여 K-5/K-7 × 본인 신축 가산세가 붙었으면 고지(Q-14) — 신호는 발동 게이트(5년·시행일)가 열렸을 때만 실리므로 신호 유무가 곧 가산세 유무다.
  if (cards.some((c) => c.penaltyAxis))
    aggregated.warnings.push(GB_BG_SELF_BUILT_NOTICE);

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
    ...(built.bundledActualTransferBasis
      ? {
          bundledActualCapitalExpenditure: built.bundledActualCapitalExpenditure,
          bundledActualTransferExpense: built.bundledActualTransferExpense,
          bundledActualTransferBasis: built.bundledActualTransferBasis,
          ...(built.bundledActualPartCapitalExpenditure
            ? { bundledActualPartCapitalExpenditure: built.bundledActualPartCapitalExpenditure }
            : {}),
        }
      : {}),
    /**
     * §100③ 판정 명세 — 화면(`BundledAllocationCard.tsx:575`)이 이 키를 읽는다.
     * 🔴 종전에는 이 객체를 만들면서 이 키만 빠져 있었다 ⇒ 판정해도 화면에 안 떴다(P-1).
     */
    ...(built.saleSplitJudgment ? { saleSplitJudgment: built.saleSplitJudgment } : {}),
    // 구분 기재 없이 안분한 경우 엔진이 쓴 basis 종류(표시 전용 echo — 판정과 배타).
    ...(built.saleApportionBasisKind ? { saleApportionBasisKind: built.saleApportionBasisKind } : {}),
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
