/**
 * 상속 부동산 취득가액 의제 — transfer-tax.ts STEP 0.45 helper
 *
 * transfer-tax.ts 800줄 정책 준수를 위해 분리.
 * 순환 의존 방지: 이 파일은 transfer-tax.ts를 import하지 않는다.
 */

import { calculateInheritanceAcquisitionPrice } from "./inheritance-acquisition-price";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import { calculateInheritanceHouseValuation } from "./inheritance-house-valuation";
import { houseDisclosureBoundary } from "./transfer-split-part-cause";
import {
  apartSec164Open,
  APART_NTS_PRICE_EXISTED_NOTE,
  APART_PRE_DEEMED_FIRST_PRICE_NOTE,
} from "./apart-nts-price";
import { calcStdPriceSum, calcEstimatedStdPriceAtAcq } from "./commercial-building-valuation";
import type { InheritanceAcquisitionInput, InheritanceAcquisitionResult, CommercialInheritanceValuationInput } from "./types/inheritance-acquisition.types";
import type { InheritanceHouseValuationResult } from "./types/inheritance-house-valuation.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import type { Pre1990LandValuationResult } from "./pre-1990-land-valuation";
import { applyRatio } from "./tax-utils";
import { isRedevelopmentActive } from "./redevelopment-dispatch";
import { resolveRedevelopment166_3AcquisitionPrice } from "./redevelopment-166-3-price";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { resolveConversionDenominatorAtTransfer } from "./transfer-tax-expropriation-valuation";
import { burdenedGiftPreDeemedBasis } from "./burdened-gift-valuation";

/** STEP 0.45 실행 결과 */
export interface InheritedAcquisitionStepResult {
  updatedInput: TransferTaxInput;
  result: InheritanceAcquisitionResult;
  step: CalculationStep;
  houseValuationResult?: InheritanceHouseValuationResult;
  /**
   * 의제취득일 전 상속·증여 자산 × 부담부증여 — STEP 0.48(§159)이 읽는다(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §18).
   * `acqStdPriceForced`면 §159①1호 괄호(기준시가 평가)라 3자 max가 아니라 의제취득일 기준시가(`stdAtDeemed`, 물건 전체)를 쓴다(Q-25).
   * 아니면 위 `result`가 ③을 증여가액 C로 환산한 3자 max(안분 전 전체 금액)다(Q-24).
   */
  bgPreDeemed?: { acqStdPriceForced: boolean; stdAtDeemed: number };
}

/**
 * STEP 0.45: 상속 부동산 취득가액 의제 적용.
 *
 * - rawInput.inheritedAcquisition이 없으면 null 반환 (skip 신호).
 * - case A + 토지: pre1990LandResult.standardPriceAtAcquisition을
 *   standardPriceAtDeemedDate로 자동 주입 (사용자 미입력 시).
 * - case A + 주택 + 상속개시일 < 2005-04-30: inheritedHouseValuation 결과로
 *   standardPriceAtDeemedDate / standardPriceAtTransfer 자동 주입 (사용자 미입력 시).
 */
export function runInheritedAcquisitionStep(
  rawInput: TransferTaxInput,
  currentInput: TransferTaxInput,
  pre1990LandResult: Pre1990LandValuationResult | undefined,
): InheritedAcquisitionStepResult | null {
  if (!rawInput.inheritedAcquisition) return null;

  // 공동주택은 「국세청 고시 가액 없었음」일 때만 단서 2호 구간이다(`apart-nts-price.ts`) — 닫혀 있으면 환산 자체를 하지 않는다
  // (②·③ 주입도, 결과의 환산 카드도 없다). 단독·다가구·토지는 종전 그대로.
  const apartGate = resolveApartGate(rawInput);

  // 주택 미공시 환산이 필요하면 먼저 산출
  const houseValuationResult = apartGate.closed ? undefined : resolveHouseValuation(rawInput);

  const resolvedInput = resolveInheritedAcquisitionInput(
    rawInput,
    currentInput,
    pre1990LandResult,
    houseValuationResult,
  );

  const redevelopment166_3Price = resolvePreDeemedRedevelopment166_3Price(rawInput);
  // 부담부증여면 ③의 양도가액은 ④가 채운 채무 합계가 아니라 증여가액 C다(Q-24 · 국심2007서2099) — ①②(물건 전체)와 같은 축으로 비교한다.
  // 재개발 종전자산은 ③이 §166③(평가액 × 기준시가 비율 — 양도가액 항 없음)이라 이 치환이 쓰이지 않는다(`calcPreDeemed`). 안분 전 전체 금액끼리
  // 비교하고, §159가 채택 결과로 고른 분기(①② → 실지 · ③ → 환산)를 재개발 경로가 §166으로 β 안분한다(`redevSec166Conversion` · PR-7b-4 · Q-8 a).
  const bgBasis =
    rawInput.transferType === "burdened_gift" &&
    rawInput.burdenedGiftInfo &&
    // 입주권은 §159가 K-4 고정이고 의제취득일 전 3자 max 범위 밖이다(사용자 결정 Q-30 · 설계 D-2) — 의제 입력이 직접 실려도 받지 않는다
    rawInput.propertyType !== "right_to_move_in" &&
    resolvedInput.inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime()
      ? burdenedGiftPreDeemedBasis(rawInput.burdenedGiftInfo, rawInput.ownershipRatio)
      : undefined;
  const result = withApartNotes(
    calculateInheritanceAcquisitionPrice(
      withConversionDenominator(bgBasis ? { ...resolvedInput, transferPrice: bgBasis.giftValue } : resolvedInput, currentInput),
      redevelopment166_3Price,
    ),
    apartGate,
  );

  const updatedInput = applyResultToInput(currentInput, result, resolvedInput, redevelopment166_3Price !== undefined);

  const step: CalculationStep = {
    label: "상속 취득가액 의제",
    formula: result.formula,
    amount: result.acquisitionPrice,
    legalBasis: result.legalBasis,
  };

  return {
    updatedInput,
    result,
    step,
    houseValuationResult,
    ...(bgBasis && {
      bgPreDeemed: { acqStdPriceForced: bgBasis.acqStdPriceForced, stdAtDeemed: bgStdAtDeemed(rawInput, resolvedInput) },
    }),
  };
}

/**
 * 부담부증여 기준시가 평가(Q-25)의 의제취득일 기준시가(물건 전체). 토지·주택은 위 주입이 ②(§164④·⑦)를 이 자리에 넣었다.
 * 상가는 §164⑥ 8칸(④가 다 찼을 때만 싣는다)이 있으면 그 값이다 — 안분 전 값(아래 ②는 지분 안분 후). 없으면 칸 값(사용자 결정 Q-27 ·
 * 계획서 inheritance-pre-deemed-bg-pr7b.plan.md). 시가 평가 ③의 분자는 바꾸지 않는다(일반 양도와 같은 칸 값 — 별건 확인 필요).
 */
function bgStdAtDeemed(rawInput: TransferTaxInput, resolvedInput: InheritanceAcquisitionInput): number {
  if (takesCommercial164_6(rawInput) && rawInput.commercialInheritanceValuation) {
    return computeCommercial164_6StdPrice(rawInput.commercialInheritanceValuation);
  }
  return resolvedInput.standardPriceAtDeemedDate ?? 0;
}

/**
 * §164⑥ payload(`commercialInheritanceValuation`)를 받는 자산 종류 — 상가, 그리고 비주택 건물(`building`).
 * 증여세 계산기는 상가를 비주택 건물(`building`)로 보낸다(`resolvePropertyType`) — 사용자 결정 Q-38로 그 경로에도 §164⑥ 입력을 열었다(PR-7b-3b).
 * Zod는 payload만 있으면 ②가 있다고 본다(`transfer-tax-schema-required-refines-2a.ts`) — 종전에는 `building`이면 엔진만 payload를 버렸다.
 * 양도세 계산기는 상가(`commercial_building`)에서만 payload를 싣는다(`sec164CommercialStatus`) — 그 경로는 바뀌지 않는다.
 */
function takesCommercial164_6(rawInput: TransferTaxInput): boolean {
  return rawInput.propertyType === "commercial_building" || rawInput.propertyType === "building";
}

/**
 * 재개발 상속 종전자산의 "확인된 취득가액"(§163⑨) 추출 — transfer-tax.ts 재개발 분기에서 사용.
 *
 * §166③ 환산은 "취득가액을 확인할 수 없는 경우"에만 적용된다. 상속 종전자산은 §163⑨이
 * 상속개시일 상증법 평가액을 취득당시 실지거래가액으로 의제하므로, 그 평가액이 확인되면
 * 취득가액이 "확인 가능" → §166③ 환산·§163⑥ 개산공제 배제. 이 확인된 평가액을 반환한다.
 *
 * - post-deemed: result.acquisitionPrice(§163⑨ 본문/2호 평가액, 항상 확인됨).
 * - pre-deemed: 3자 max — ③은 **§166③ 재개발 환산**이다(STEP 0.45가 `resolvePreDeemedRedevelopment166_3Price`로
 *   주입 · 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12 · Q-8 a).
 *   · ③이 채택되면 null → 재개발 분기가 **같은 산식**으로 §166③을 계산한다(환산 모드 · 개산공제).
 *   · ①② 중 큰 값이 이기면 그 값(실가 · 개산공제 배제).
 *   ⚠️ 종전(PR-1까지)에는 ③을 §176조의2④로 비교해 놓고 여기서 ①②를 반환했다 — ③이 채택된 카드와 다른 값으로
 *      계산됐고, 증여는 이 덮어쓰기가 없어 ①보다 작은 §166③이 쓰였다(probe G-R4 ① 200,000,000 → 141,221,534).
 * - 확인된 값이 없으면(신고가액 미입력 등) null → 호출측이 현행 §166③ 환산 경로를 유지한다.
 */
export function resolveInheritedRedevelopmentAcqPrice(
  step: InheritedAcquisitionStepResult | undefined,
): number | null {
  if (!step) return null;
  const r = step.result;
  if (r.preDeemedBreakdown) {
    if (r.preDeemedBreakdown.selectedMethod === "converted" && r.preDeemedBreakdown.convertedBasis === "redevelopment_166_3") {
      return null;
    }
    const confirmed = Math.max(
      r.preDeemedBreakdown.reportedAmount ?? 0,
      r.preDeemedBreakdown.sec164Amount ?? 0,
    );
    return confirmed > 0 ? confirmed : null;
  }
  return r.acquisitionPrice > 0 ? r.acquisitionPrice : null;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────

/**
 * 의제취득일 전 ③의 분모 = ③이 채택된 뒤 하류 환산(`calcTransferGain`)이 실제로 쓰는 양도시 기준시가(Q-10 A).
 *
 * 영 §164⑨은 수용(1호)·공매·경락(2호)이면 차액을 빼 「양도 당시 기준시가」 자체를 계산하라고 하고, ③은 영 §176조의2④1호 →
 * ③3호 → ②2호의 환산이라 분모가 그 양도 당시 기준시가다. 비교만 원값으로 하면 카드의 ③과 양도차익의 취득가액이 갈린다
 * (실측: 수용 토지 ③ 149,925,925로 채택·표시 → 하류 253,000,000으로 계산). 하류와 **같은 함수·같은 입력**으로 정한다 —
 * `applyResultToInput`이 넘기는 값(`standardPriceAtTransfer`)과 같은 것을 넣는다. 하류 입력 자체는 바꾸지 않는다(하류가 다시 적용한다).
 * 재개발 종전자산은 ③이 §166③ 주입값이라 이 분모를 쓰지 않는다(`calcPreDeemed`).
 */
function withConversionDenominator(
  resolved: InheritanceAcquisitionInput,
  currentInput: TransferTaxInput,
): InheritanceAcquisitionInput {
  const atTransfer = resolved.standardPriceAtTransfer;
  if (resolved.inheritanceDate.getTime() >= DEEMED_ACQUISITION_DATE.getTime() || !(atTransfer && atTransfer > 0)) return resolved;
  const { denominator } = resolveConversionDenominatorAtTransfer({
    ...currentInput,
    useEstimatedAcquisition: true,
    standardPriceAtTransfer: atTransfer,
  });
  return denominator === atTransfer ? resolved : { ...resolved, standardPriceAtTransfer: denominator };
}

/**
 * 의제취득일 전 상속·증여 **재개발·재건축 종전자산**의 ③ = §166③ 금액(계획서 §12 · Q-8 a).
 *
 * - undefined: 재개발 분기 대상이 아니거나 post-deemed → `calcPreDeemed`가 §176조의2④로 ③을 계산(종전).
 * - null: 재개발이지만 ③을 쓸 수 없다 — ⑤가 「환산」이 아니면 §166③ 칸이 화면에 없어 남은 값을 쓰면 안 되고,
 *   칸이 비었으면 산출할 수 없다. ③ = 0.
 * 분기 판정은 STEP 0.65 진입(`isRedevelopmentActive`)과 같은 술어 + 승계조합원 제외(⑤⑧ `isRedev166_3PreDeemedAsset`와 같은 축).
 */
function resolvePreDeemedRedevelopment166_3Price(rawInput: TransferTaxInput): number | null | undefined {
  const ia = rawInput.inheritedAcquisition!;
  if (ia.inheritanceDate.getTime() >= DEEMED_ACQUISITION_DATE.getTime()) return undefined;
  if (!isRedevelopmentActive(rawInput.propertyType, rawInput.redevelopment, rawInput.isSuccessorRightToMoveIn)) {
    return undefined;
  }
  // 승계조합원은 §166③ 대상이 아니다(`runSuccessorMember`) — ③은 종전대로 §176조의2④.
  if (rawInput.redevelopment!.isSuccessorMember === true) return undefined;
  if (rawInput.useEstimatedAcquisition !== true) return null;
  return resolveRedevelopment166_3AcquisitionPrice(rawInput.redevelopment!, rawInput.acquisitionDate);
}

/**
 * 상가/오피스텔 기준시가 최초고시일 — 이 날짜 전 상속 상가는 §163⑨2호로 §164⑥ max 대상.
 * (commercial-building.types.ts isPreDisclosure 경계와 동일: 2005-01-01.)
 */
const COMMERCIAL_FIRST_DISCLOSURE_DATE = new Date("2005-01-01T00:00:00.000Z");

/**
 * 개별공시지가 최초고시일 — 이 날짜 전 상속·증여 토지는 §163⑨**1호**로 §164④ max 대상.
 * (「부동산 가격공시에 관한 법률」에 따른 1990.8.30. 최초고시 — §163⑨1호·§164④ 문언과 동일.)
 */
const LAND_FIRST_DISCLOSURE_DATE = new Date("1990-08-30T00:00:00.000Z");

/**
 * §164⑥ 취득당시 기준시가(P_A) 산정 — 최초고시(2005) 역환산.
 * P_A = INT(최초고시 호별총액 × 취득시 기준시가합 / 최초고시시 기준시가합).
 * commercial-building-valuation.ts의 기준시가합(법 §99①1호 가목·나목)·§164⑥ 역환산 함수 재사용(single-source).
 */
export function computeCommercial164_6StdPrice(v: CommercialInheritanceValuationInput): number {
  const floorAreaTotal = v.exclusiveArea + v.commonArea;
  const unitTotalAtFirst = multiplyByArea(v.unitPriceAtFirstDisclosure, floorAreaTotal);
  const combinedStdAtAcq = calcStdPriceSum(
    v.landPriceAtAcquisition,
    v.landArea,
    v.buildingStdPriceAtAcquisition,
  );
  const combinedStdAtFirst = calcStdPriceSum(
    v.landPriceAtFirstDisclosure,
    v.landArea,
    v.buildingStdPriceAtFirstDisclosure,
  );
  return calcEstimatedStdPriceAtAcq(unitTotalAtFirst, combinedStdAtAcq, combinedStdAtFirst);
}

/**
 * 주택 자산 + 상속개시일 < 2005-04-30 시 inheritedHouseValuation 자동 산출.
 * inheritedHouseValuation 입력이 없으면 null.
 */
function resolveHouseValuation(
  rawInput: TransferTaxInput,
): InheritanceHouseValuationResult | undefined {
  if (!rawInput.inheritedHouseValuation) return undefined;
  // 공동주택이면 첫 가격 기관을 산식 표기에 싣는다(§164⑥·⑦ — 값 무관, 계획서 Q-1)
  const agency = rawInput.inheritedAcquisition?.assetKind === "house_apart"
    ? rawInput.inheritedAcquisition.apartFirstPriceAgency
    : undefined;
  return calculateInheritanceHouseValuation({
    ...rawInput.inheritedHouseValuation,
    ...(agency && { apartFirstPriceAgency: agency }),
  });
}

/** 공동주택 단서 2호 게이트 — `closed`면 ②·③ 주입을 하지 않는다. 고지는 결과에 붙는다. */
interface ApartGate {
  closed: boolean;
  /** 「있었음」 — 본문 평가액 근거 고지 */
  existedNote: boolean;
  /** 의제취득일 전인데 첫 가격이 1985.1.1. 이전(계획서 Q-3 확인 필요) */
  preDeemedFirstPriceNote: boolean;
}

function resolveApartGate(rawInput: TransferTaxInput): ApartGate {
  const ia = rawInput.inheritedAcquisition!;
  if (ia.assetKind !== "house_apart") return { closed: false, existedNote: false, preDeemedFirstPriceNote: false };
  const baseKey = ia.inheritanceDate.toISOString().slice(0, 10);
  const firstKey = ia.apartFirstPriceDate?.toISOString().slice(0, 10);
  const open = apartSec164Open(ia.apartNtsPriceExisted, firstKey, baseKey);
  return {
    closed: !open,
    existedNote: ia.apartNtsPriceExisted === true,
    preDeemedFirstPriceNote:
      open && ia.inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime() && !!firstKey && firstKey <= "1985-01-01",
  };
}

/** 공동주택 고지를 결과에 붙인다 — 「있었음」 근거는 산식 끝에, 확인 필요는 경고에. 값은 바꾸지 않는다. */
function withApartNotes(result: InheritanceAcquisitionResult, gate: ApartGate): InheritanceAcquisitionResult {
  if (!gate.existedNote && !gate.preDeemedFirstPriceNote) return result;
  return {
    ...result,
    ...(gate.existedNote && { formula: [result.formula, APART_NTS_PRICE_EXISTED_NOTE].filter(Boolean).join("\n") }),
    ...(gate.preDeemedFirstPriceNote && { warnings: [...(result.warnings ?? []), APART_PRE_DEEMED_FIRST_PRICE_NOTE] }),
  };
}

function resolveInheritedAcquisitionInput(
  rawInput: TransferTaxInput,
  currentInput: TransferTaxInput,
  pre1990LandResult: Pre1990LandValuationResult | undefined,
  houseValuationResult: InheritanceHouseValuationResult | undefined,
): InheritanceAcquisitionInput {
  const base = rawInput.inheritedAcquisition!;

  const isPreDeemed =
    base.inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime();

  // 구간 끝 = 이 주택의 개별주택가격 최초공시일(단독·다가구로 확인되고 2005-04-30보다 뒤일 때만 — D2-4·D1-H와 같은
  // `houseDisclosureBoundary`, 계획서 transfer-house-first-disclosure-per-house.plan.md). 그 밖은 2005-04-30.
  // 공동주택은 날짜가 아니라 「상속·증여 당시 국세청 고시 가액이 없었음」 + 첫 가격 날짜가 기준일 뒤일 때만이다(`apart-nts-price.ts` —
  // 고시 가액이 있었으면 「건물의 기준시가가 고시되기 전」이 아니다. 답이 없으면 닫는다 = 모름은 불성립).
  const baseKey = base.inheritanceDate.toISOString().slice(0, 10);
  const isHousePreDisclosure =
    base.assetKind === "house_apart"
      ? apartSec164Open(base.apartNtsPriceExisted, base.apartFirstPriceDate?.toISOString().slice(0, 10), baseKey)
      : base.assetKind === "house_individual" &&
        baseKey < houseDisclosureBoundary(rawInput.houseFirstDisclosureDate, base.assetKind);

  // case A(pre-deemed) + 주택 미공시: houseValuationResult로 standardPriceAtDeemedDate / standardPriceAtTransfer 주입
  // (§176조의2④ 환산취득가 = 양도가 × 취득기준시가/양도기준시가)
  const shouldInjectHouseValuation =
    houseValuationResult && isPreDeemed && isHousePreDisclosure && !base.standardPriceAtDeemedDate;

  // 주택 미공시: §164⑦ 취득당시 기준시가를 max 비교용(②)으로 주입 (소령 §163⑨2호).
  // ⚠️ **pre/post 구분이 없다** — §163⑨은 「의제취득일」이 아니라 「기준시가 고시 전 상속·증여」만
  //    조건으로 하므로 pre-deemed(1985 이전)도 당연히 해당한다. 2026-08-05 확장.
  //    · post-deemed: max(①,②) — 나목이 §163⑨ 의제로 대체돼 ③이 **없다**
  //    · pre-deemed : **3자 max** — max(①,②,③)(2026-10-22, #1089 「가목 우선」에서 되돌림 —
  //      근거 상속증여세과-223, 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md).
  //      ③은 아래 standardPriceAtDeemedDate(환산 분자)로 별도 계산되어 ①②와 비교된다.
  //    같은 `housePriceAtInheritanceUsed` 값이 ②(비교값)와 ③의 분자로 **둘 다** 쓰이므로
  //    필드를 분리해 주입한다(역할이 둘 — 계획서 D-2).
  const shouldInjectHouseMax = !!houseValuationResult && isHousePreDisclosure;

  // 상가 + 최초고시(2005) 전 상속: §164⑥ 취득당시 기준시가(P_A)를 max 비교용(②) 주입 (소령 §163⑨2호).
  // 주택과 같은 이유로 pre/post 구분 없다(2026-08-05 확장).
  // opt-in — commercialInheritanceValuation payload 있을 때만(주택 inheritedHouseValuation opt-in 미러).
  const shouldInjectCommercialMax =
    takesCommercial164_6(rawInput) &&
    !!rawInput.commercialInheritanceValuation &&
    base.inheritanceDate.getTime() < COMMERCIAL_FIRST_DISCLOSURE_DATE.getTime();

  // case A + 토지: STEP 0.4 결과 자동 주입 (사용자가 standardPriceAtDeemedDate 미입력 시, 주택 주입보다 낮은 우선순위)
  const shouldInjectPre1990 =
    !shouldInjectHouseValuation && pre1990LandResult && isPreDeemed && !base.standardPriceAtDeemedDate;

  // 토지 + 개별공시지가 최초고시(1990-08-30) 전 상속·증여: §164④ 취득당시 기준시가를
  // max 비교용(②)으로 주입 (소령 §163⑨**1호**). 주택 §164⑦(2호)과 같은 구조다.
  // ⚠️ 주택·상가와 마찬가지로 **같은 값이 ③의 환산 분자로도 쓰이므로 필드를 분리**한다.
  //    시점은 **의제취득일 기준**이다 — `pre1990LandResult`가 그렇게 산출되고
  //    UI도 "1985.1.1. 개별공시지가 × 면적"이라 안내한다(계획서 §4.1(d)).
  // ⚠️ **pre/post 구분이 없다** — §163⑨1호의 조건은 「1990.8.30. 고시 前 상속·증여받은 토지」뿐이라
  //    의제취득일 이후(1985.1.1.~1990.8.30.) 상속 토지도 당연히 대상이다(주택·상가 2호와 동일).
  //    `pre1990LandResult`는 `transfer-tax.ts:85`가 `rawInput.pre1990Land` 유무만 보고 산출하므로
  //    post-deemed에서도 그대로 공급된다 — 소비는 `calcPostDeemed`의 sec164Std에서 한다.
  const shouldInjectLandMax =
    !!pre1990LandResult &&
    base.assetKind === "land" &&
    base.inheritanceDate.getTime() < LAND_FIRST_DISCLOSURE_DATE.getTime();

  let standardPriceAtDeemedDate = base.standardPriceAtDeemedDate;
  let standardPriceAtTransfer = base.standardPriceAtTransfer ?? currentInput.standardPriceAtTransfer;

  if (shouldInjectHouseValuation) {
    // 주택 §176조의2④ 환산취득가는 개별주택가격 단일값을 분자/분모로 사용
    // (토지+건물 합계 기준시가가 아님). 개산공제도 동일 base × 3%.
    // ✅ **V-2 종결**(2026-08-07) — 종전 주석은 여기를 「이름-의미 불일치」로 적었다:
    //    `housePriceAtInheritanceUsed`(상속개시일 값)를 `standardPriceAtDeemedDate`(§176조의2④1호상
    //    **의제취득일 현재** 기준시가) 자리에 넣는다는 것이었다. **더 이상 사실이 아니다.**
    //    B-1이 §164⑦ 3시점 환산의 **입력 라벨**을 「의제취득일(1985.1.1.)」로 바꿨으므로
    //    (「소득세법」 부칙 법률 제4803호 §8 — 취득시기 의제), 그 산출물인
    //    `housePriceAtInheritanceUsed`도 **1985 시점 값**이다 ⇒ 필드명과 값이 일치한다.
    //    · 토지 경로(`pre1990LandResult.standardPriceAtAcquisition`)도 같은 이유로 정합.
    //    · **B-2도 함께 해소**: 같은 값이 ②(houseValuationStdPrice)로도 주입돼 「얽힌다」던 것이,
    //      ②(§164⑦ 취득당시=1985)와 ③ 분자(의제취득일=1985)가 **같아야 옳은** 관계가 됐다.
    //    ⚠️ 2026-10-22부터 3자 max라 ③(= 양도가액 × 이 값 ÷ 양도시 기준시가)이 ②보다 크면 ③이
    //       채택된다(종전 「가목 우선」에서는 ②가 함께 주입되면 ③에 도달하지 않았다).
    //       B-1의 라벨 anchor(T-1~T-3)가 입력 시점을 고정한다.
    //    계획서: docs/02-design/features/inheritance-pre-deemed-converted-numerator-timing.plan.md
    //           docs/02-design/features/sec164-clause-a-deemed-date-timing-b1.plan.md
    standardPriceAtDeemedDate = houseValuationResult.housePriceAtInheritanceUsed;
    // 분모 — 직접 보낸 양도시 기준시가가 있으면 그것(④는 「양도시 기준시가 직접 입력」 토글이 켜졌을 때만 싣는다 ·
    // `preDeemedSentStdPrices`), 없으면 양도 당시 공시 개별주택가격(PR-5 — 종전에는 직접 입력을 덮었다).
    standardPriceAtTransfer =
      base.standardPriceAtTransfer ??
      rawInput.inheritedHouseValuation?.housePriceAtTransfer ??
      standardPriceAtTransfer;
  } else if (shouldInjectPre1990) {
    standardPriceAtDeemedDate = pre1990LandResult.standardPriceAtAcquisition;
  }

  return {
    ...base,
    standardPriceAtDeemedDate,
    standardPriceAtTransfer,
    /**
     * A07(2026-09-02): ②(§164④~⑦ 기준시가)를 **①과 같은 축**으로 맞춘다.
     *
     * §163⑨ 1호·2호는 「평가한 가액**과** §164④(⑤~⑦)의 가액 **중 많은 금액**」이라 둘을
     * 직접 비교한다. 그런데 ①(`reportedValue`)은 ④에서 이미 지분 안분돼 오는데
     * (`transfer-tax-api-inheritance.ts` — 「미적용 시 100% 송신으로 엔진에서 안분 잔여가
     * 필요경비로 잘못 적재됨(사례 27)」) ②는 **100% 물건 값 그대로**여서 비교 축이 어긋났다.
     * 저지분일수록 ②가 부당하게 이겨 상대오차가 커진다(실측 10,078,073 / 11,138,923원 과소).
     *
     * ⚠️ **주입 지점에서만 안분한다.** `pre1990Land.areaSqm`이나
     *    `standardPriceAtAcquisition` 자체를 축소하면 안 된다 — 그 값들은 §164④ 산식의
     *    입력이자 다른 소비처(표시·환산 역산)를 가지므로 이중 축소가 된다.
     */
    ...(shouldInjectHouseMax && {
      houseValuationStdPrice: applyRatio(
        houseValuationResult!.housePriceAtInheritanceUsed,
        currentInput.ownershipRatio ?? 1,
      ),
    }),
    ...(shouldInjectCommercialMax && {
      commercialValuationStdPrice: applyRatio(
        computeCommercial164_6StdPrice(rawInput.commercialInheritanceValuation!),
        currentInput.ownershipRatio ?? 1,
      ),
    }),
    ...(shouldInjectLandMax && {
      landValuationStdPrice: applyRatio(
        pre1990LandResult!.standardPriceAtAcquisition,
        currentInput.ownershipRatio ?? 1,
      ),
    }),
    transferDate: base.transferDate ?? rawInput.transferDate,
    transferPrice: base.transferPrice ?? rawInput.transferPrice,
  };
}

function applyResultToInput(
  currentInput: TransferTaxInput,
  result: InheritanceAcquisitionResult,
  resolvedInput: InheritanceAcquisitionInput,
  /** 재개발 종전자산 — ③이 §166③이라 §176조의2④ 입력을 하류(STEP 0.35 환산)에 넘기지 않는다. 환산 모드는 ⑤가 이미 정했다. */
  isRedevelopment166_3: boolean,
): TransferTaxInput {
  const isConvertedSelected =
    result.preDeemedBreakdown?.selectedMethod === "converted";

  // 🔴 **가목 확인 시 추계 플래그를 명시적으로 해제한다** (B-3 · 2026-08-07).
  //   STEP 0.4(`transfer-tax.ts:85-96`)는 `pre1990Land` payload가 있으면 §164④ 환산을 준비하며
  //   `useEstimatedAcquisition: true`·`acquisitionMethod: "estimated"`를 **무조건 강제**한다.
  //   여기서 해제하지 않으면 가목(①·②)을 채택하고도 하류 `calcTransferGain`이 취득가액을
  //   **환산으로 재계산**하고 개산공제(§163⑥)까지 붙인다 — 법 §97①1호 단서가 금지한 경로다.
  //   (실측: 가목 300,000,000인데 양도차익이 환산 62,482,583 기준으로 계산돼 294,984,122 과대)
  //   ⚠️ **`acquisitionPrice > 0`일 때만** 해제한다. ①②③이 모두 없어 0인 경우까지 실가 모드로
  //      바꾸면 환산조차 못 하고 「취득가액 0 실가」가 되어 더 나빠진다.
  const clauseAConfirmed = !isConvertedSelected && result.acquisitionPrice > 0;

  return {
    ...currentInput,
    acquisitionPrice: result.acquisitionPrice,
    // case A에서 환산취득가가 채택된 경우: 이후 단계의 useEstimatedAcquisition 흐름과 일치
    ...(isConvertedSelected && !isRedevelopment166_3 && resolvedInput.standardPriceAtDeemedDate && {
      useEstimatedAcquisition: true,
      acquisitionMethod: "estimated" as const,
      standardPriceAtAcquisition: resolvedInput.standardPriceAtDeemedDate,
      standardPriceAtTransfer:
        resolvedInput.standardPriceAtTransfer ?? currentInput.standardPriceAtTransfer,
    }),
    // 가목(§163⑨) = **실지거래가액 의제**다. 실제 필요경비를 공제하고 개산공제는 적용하지 않는다.
    ...(clauseAConfirmed && {
      useEstimatedAcquisition: false,
      acquisitionMethod: "actual" as const,
    }),
  };
}
