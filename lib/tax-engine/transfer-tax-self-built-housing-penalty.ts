/**
 * 일체 주택 **본인 신축** × 「소득세법」 §114조의2 환산·감정가액 5% 가산세 — base 를 **건물분**으로 (순수 leaf).
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§3 · 사용자 확정 Q-1~Q-15)
 *
 * ## 한 줄 요약
 * 조문은 「**해당 건물의** 감정가액 또는 환산취득가액」의 100분의 5다(재산세제과-939 「해당 건물분」). 개별주택가격·공동주택가격은 토지+건물 합계로 공시되므로
 * 일체 주택을 본인이 신축해 환산·감정으로 계산하면 base 에서 **토지분을 빼야** 한다 — 이월과세 × 증여자 신축(`transfer-tax-carryover-donor-penalty.ts` `housingBase`)이
 * 이미 그렇게 한다. 그 산식을 본인 신축에 옮긴다.
 *
 * ## 구조 — 기존 `penaltyAxis` 채널 모양을 재사용한다
 * finalize STEP 10.5 와 손실 조기반환(§114조의2② — 산출세액 0에도 적용)이 `{ acquisitionMethod, base }` 모양의 축을 이미 읽는다.
 * 이 leaf 가 그 모양으로 건물분 base 를 내면 두 경로가 같은 값을 쓴다(dual-truth 방지). 양도차익·결정세액은 건드리지 않는다 — 가산세 base 만 바뀐다(Q-14).
 *
 * ## 입력 부재 = 던진다 (PR-4 엄격화 · 사용자 확정 Q-2)
 * `selfBuiltHousing` 이 **필요한데 없으면** 던진다(`resolveSelfBuiltHousingPenaltyAxis` → INVALID_INPUT → route 400). 종전(PR-1~3)은 관대하게 자산 전체 base 로 계산했지만
 * 그러면 토지분이 섞인 과다 부과(대표 25,000,000 vs 9,375,000)가 조용히 남는다. 직접 API 호출자(UI 없이)는 이제 400 이다 — 메시지가 보낼 것을 명시한다.
 * 있는데 닿을 수 없는 조합도 던진다(`assertSelfBuiltHousingInput`): 받아 놓고 조용히 무시하면 침묵 오답이다.
 *
 * **던지는 집합 = UI 술어(`lib/calc/self-built-housing-scope.ts` `selfBuiltHousingScope`)가 카드를 띄우는 집합**이어야 한다 — 화면이 칸을 보여주지 않는 조합에서 엔진이 던지면 사용자가
 * 빠져나갈 수 없다(dead-end). 그래서 정적 사유({@link unreachableReason})·게이트·**분리 계산 중 여부(`splitActive` — 엔진이 실제로 건물 파트를 축으로 쓰는지)**를 모두 본다.
 *
 * ## 영 §164⑨ 공익수용(1호)·공매·경락(2호) 특례 (Q-12 후속 PR-A · 계획서 docs/00-pm/self-built-housing-164-9-plan.md)
 * 특례는 환산 분모(양도 당시 기준시가)를 H_T → H_T′ = min(H_T, 보상액, 보상기초)(1호) / min(H_T, 경락가)(2호)로 낮춘다 — 법 §99①1호 라목 «주택 가액» 하나(토지+건물 총액)의 차감값이다.
 * 건물분 B_tr 도 **그 H_T′ 를 같은 비례 규칙**(H_T′ × N_T ÷ (L_T+N_T))으로 나눠 구한다 — 양도차익의 환산취득가액과 **같은 분모**를 쓴다(`resolveConversionDenominatorAtTransfer` 단일 소스).
 * 특례가 걸리지 않으면(보상액 불발·감정) 그 함수가 H_T 를 돌려주므로 종전 값과 바이트 동일하다. 감정은 양도 당시 기준시가를 쓰지 않아 특례와 무관하다.
 * 정면 해석례는 확인하지 못했다(계획서 V-1) — 결과 화면이 «확인 필요» 를 싣는다. 이월과세 `donorBuilt.housing` 정렬은 별건(PR-B).
 *
 * 순환 의존을 피하려고 `transfer-tax-carryover-donor-penalty.ts` 를 import 하지 않는다(헬퍼를 직접 쓴다).
 */
import { addYears } from "date-fns";
import { TRANSFER } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { apportionByStdPrice } from "./std-price-apportion";
import { calculateBuildingPenalty } from "./transfer-tax-building-penalty";
import { resolveTransferPriceSplit } from "./transfer-tax-split-sale-price";
import { resolveConversionDenominatorAtTransfer } from "./transfer-tax-expropriation-valuation";
import { calcLandStdPriceAtAcq } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { TransferTaxInput } from "./types/transfer.types";
import type { SelfBuiltHousingInput, SelfBuiltHousingPenaltyEcho } from "./types/transfer-self-built-housing.types";

const FIELD = "selfBuiltHousing";
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const positive = (n: number | undefined): n is number => typeof n === "number" && n > 0;

function invalid(message: string, field: string = FIELD): never {
  throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { field });
}

/** 이 축이 가산세 base 를 정했을 때의 결과 — `penaltyAxis` 모양(`acquisitionMethod`·`base`) + 표시용 echo(penalty 제외). */
export interface SelfBuiltHousingAxis {
  acquisitionMethod: "estimated" | "appraisal";
  base: number;
  echo: Omit<SelfBuiltHousingPenaltyEcho, "penalty">;
}

/**
 * 가산세 창(5년·시행일)이 열렸는가 — 엔진 `calculateBuildingPenalty` 와 **같은 판정**(단일 소스).
 * 환산은 양도일 ≥ 2018-01-01, 감정은 ≥ 2020-01-01, 신축일부터 5년 되는 날 당일 포함. 실지거래가액·매매사례가액은 조문 대상이 아니다.
 */
export function selfBuiltHousingGateOpen(input: TransferTaxInput): boolean {
  return calculateBuildingPenalty(input, 1) !== null;
}

/**
 * 이 축이 **닿을 수 없는 조합**의 사유(없으면 undefined) — 정적으로 판정되는 것만. 입력 거부({@link assertSelfBuiltHousingInput})와 적용 판정({@link resolveSelfBuiltHousingPenaltyAxis})이
 * **같은 술어**를 쓴다(서버 거울 · ⑫ `refineSelfBuiltHousing`·UI 술어와 같은 집합). 분리(split)·소유자 분리처럼 계산 도중에야 드러나는 조합은 여기서 판정하지 않는다 —
 * 그때는 건물 파트가 이미 축이라 `splitActive` 로 거른다.
 */
function unreachableReason(input: TransferTaxInput): string | undefined {
  const law = TRANSFER.BUILDING_PENALTY;
  if (input.propertyType !== "housing")
    return `일체 주택의 건물분 가산세 입력(${FIELD})은 주택에만 보낼 수 있습니다 — 건물 단독은 전체가 건물분이라 필요 없습니다(${law}).`;
  if (input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift" || input.burdenedGiftInfo)
    return `부담부증여는 §159 스텝이 토지·건물을 따로 구해 이미 건물분을 base 로 쓴다 — ${FIELD} 로 받지 않습니다(${law}).`;
  if (input.acquisitionCause !== undefined && input.acquisitionCause !== "purchase")
    return `${FIELD} 는 본인이 신축해 매매로 취득한 주택에만 적용됩니다 — 이월과세·상속·증여는 취득 경위가 다릅니다(${law}).`;
  if (input.isSelfBuilt !== true) return `${FIELD} 는 본인 신축(isSelfBuilt)일 때만 보낼 수 있습니다(${law}).`;
  if (input.mixedUse) return `겸용주택의 가산세 base 는 이 입력으로 받지 않습니다(${law}).`;
  if (input.buildingType === "extension")
    return `증축은 증축한 부분 한정 base 가 따로 있어 ${FIELD} 로 받지 않습니다 — 기준시가 비례 안분이면 수학적으로 같은 값입니다(${law}).`;
  if (input.preHousingDisclosure)
    return `개별주택가격·공동주택가격 최초공시 전 환산은 토지·건물 파트가 이미 나뉘어 건물 파트가 base 입니다 — ${FIELD} 와 함께 쓸 수 없습니다(${law}).`;
  return undefined;
}

/**
 * 입력 거부 — `selfBuiltHousing` 이 있는데 이 축이 닿을 수 없는 조합이면 던진다(⑫와 같은 규칙, 직접 호출 방어선).
 *
 * 게이트가 닫힌 조합(5년 경과·시행일 전·실가/매매사례)은 **요구하지 않고 허용**한다 — 숨은 stale 값에 거짓 요구를 하지 않는다.
 * 입력 칸이 비었는데 게이트가 열렸다면 던진다: 자동으로 채우지 않는다(합계에서 토지분을 빼 대신하지 않는다).
 */
export function assertSelfBuiltHousingInput(input: TransferTaxInput): void {
  const sb = input.selfBuiltHousing;
  if (!sb) return;
  const law = TRANSFER.BUILDING_PENALTY;
  const why = unreachableReason(input);
  if (why) invalid(why);

  if (!selfBuiltHousingGateOpen(input)) return;
  if (input.acquisitionMethod === "appraisal") {
    if (positive(sb.buildingAppraisalValue)) {
      if (positive(input.appraisalValue) && sb.buildingAppraisalValue > input.appraisalValue)
        invalid(`건물 감정가액(${sb.buildingAppraisalValue.toLocaleString()}원)이 감정가액 총액(${input.appraisalValue.toLocaleString()}원)보다 클 수 없습니다.`, `${FIELD}.buildingAppraisalValue`);
      return;
    }
    // 건물 감정가액이 따로 없으면 취득 당시 토지·건물 기준시가 비례(영 §166⑥ · 부가령 §64①) — 그 입력이 있어야 한다
    if (calcLandStdPriceAtAcq(sb.landPricePerSqmAtAcquisition ?? 0, sb.landArea ?? 0) == null || !positive(sb.buildingStdPriceAtAcquisition))
      invalid(
        `일체 주택 감정가액의 건물분 가산세(${law})는 감정평가서의 건물 감정가액을 입력하거나, 구분 표시가 없으면 취득 당시 토지·건물 기준시가가 필요합니다.`,
        `${FIELD}.buildingAppraisalValue`,
      );
    if (!positive(input.appraisalValue)) invalid("감정가액 방식은 감정가액 총액이 필요합니다.", "appraisalValue");
    return;
  }

  // 환산취득가액 — 건물분 기준시가 비례 안분의 모든 입력이 필요하다
  if (calcLandStdPriceAtAcq(sb.landPricePerSqmAtAcquisition ?? 0, sb.landArea ?? 0) == null)
    invalid("취득 당시 건물분 기준시가를 구하려면 토지의 ㎡당 개별공시지가와 면적이 필요합니다.", `${FIELD}.landPricePerSqmAtAcquisition`);
  if (!positive(sb.buildingStdPriceAtAcquisition))
    invalid("취득 당시 건물분 기준시가를 구하려면 취득 당시 건물 기준시가가 필요합니다 — 합계에서 토지분을 빼 대신하지 않습니다.", `${FIELD}.buildingStdPriceAtAcquisition`);
  if (!positive(sb.landStdPriceAtTransfer))
    invalid("양도 당시 건물분 기준시가와 양도가액 건물분을 구하려면 양도 당시 토지 기준시가가 필요합니다.", `${FIELD}.landStdPriceAtTransfer`);
  if (!positive(sb.buildingStdPriceAtTransfer))
    invalid("양도 당시 건물분 기준시가와 양도가액 건물분을 구하려면 양도 당시 건물 기준시가가 필요합니다.", `${FIELD}.buildingStdPriceAtTransfer`);
  if (!positive(input.standardPriceAtAcquisition))
    invalid("일체 주택의 건물분을 구하려면 취득 당시 주택공시가격(개별주택가격·공동주택가격)이 필요합니다.", "standardPriceAtAcquisition");
  if (!positive(input.standardPriceAtTransfer))
    invalid("일체 주택의 건물분을 구하려면 양도 당시 주택공시가격(개별주택가격·공동주택가격)이 필요합니다.", "standardPriceAtTransfer");
}

/**
 * `selfBuiltHousing` 이 **없을 때**의 처리 — `required`(던진다) / `none`(관여 안 함).
 * 정적 사유 없음 ∧ 분리 계산 중 아님 ∧ 가산세 게이트 개방 — 이 셋이 UI 술어와 같은 집합이다. 분리 계산 중이면 건물 파트가 이미 축이라 `none`.
 */
function missingInputDisposition(input: TransferTaxInput, splitActive: boolean): "required" | "none" {
  if (splitActive || unreachableReason(input) !== undefined || !selfBuiltHousingGateOpen(input)) return "none";
  return "required";
}

/** 입력 부재 오류 — 무엇을 보내야 하는지 방식별로 명시한다(직접 API 호출자용). */
function missingInputError(input: TransferTaxInput): never {
  const law = TRANSFER.BUILDING_PENALTY;
  const head = `일체 주택 본인 신축의 환산·감정가액 가산세(${law})는 「해당 건물」분이 기준이라 ${FIELD} 입력이 필요합니다.`;
  return input.acquisitionMethod === "appraisal"
    ? invalid(
        `${head} 감정가액이면 감정평가서의 건물 감정가액(${FIELD}.buildingAppraisalValue)을 보내세요 — 건물 가액이 구분 표시되어 있지 않으면 취득 당시 토지 ㎡당 개별공시지가·토지 면적·건물 기준시가를 보내세요. 감정가액 총액에서 토지분을 빼 대신 구하지 않습니다.`,
      )
    : invalid(
        `${head} 환산취득가액이면 취득 당시 토지 ㎡당 개별공시지가·토지 면적·건물 기준시가와 양도 당시 토지·건물 기준시가(필요하면 양도가액 구분)를 ${FIELD} 에 보내세요 — 주택공시가격 합계에서 토지분을 빼 대신 구하지 않습니다.`,
      );
}

/** 이 자산의 §114조의2 base 를 건물분으로 구해야 하는가 — 서버 거울(UI 술어와 같은 집합). `splitActive` = 토지·건물 분리 계산 중(건물 파트가 이미 축). */
function applies(input: TransferTaxInput, splitActive: boolean): input is TransferTaxInput & { selfBuiltHousing: SelfBuiltHousingInput } {
  return input.selfBuiltHousing !== undefined && !splitActive && unreachableReason(input) === undefined && selfBuiltHousingGateOpen(input);
}

/**
 * 건물분 §114조의2 base — finalize STEP 10.5 와 손실 조기반환이 **같은 이 함수**를 같은 순서로 읽는다.
 * 해당 없으면 `undefined`(현행 base 유지). **입력이 필요한데 없으면 던진다**(INVALID_INPUT) — 닿지 않는 조합·분리 계산 중은 던지지 않는다.
 */
export function resolveSelfBuiltHousingPenaltyAxis(input: TransferTaxInput, splitActive: boolean): SelfBuiltHousingAxis | undefined {
  // 입력 부재 — 필요한 조합이면 던진다(PR-4 엄격화). 닿지 않는 조합은 종전대로 undefined.
  if (input.selfBuiltHousing === undefined && missingInputDisposition(input, splitActive) === "required") missingInputError(input);
  if (!applies(input, splitActive)) return undefined;
  const sb = input.selfBuiltHousing;
  const method = input.acquisitionMethod as "estimated" | "appraisal"; // 게이트가 열렸으니 둘 중 하나다
  const head = {
    buildingType: "new" as const,
    constructionDate: ymd(input.constructionDate!),
    fifthAnniversary: ymd(addYears(input.constructionDate!, 5)),
    method,
  };

  if (method === "appraisal") {
    // 법문은 「해당 건물의 감정가액」 — 감정서에 구분 표시된 건물 감정가액이 있으면 그대로(안분 없음). 없으면 취득 당시 기준시가 비례
    if (positive(sb.buildingAppraisalValue))
      return { acquisitionMethod: "appraisal", base: sb.buildingAppraisalValue, echo: { ...head, base: sb.buildingAppraisalValue, appraisal: { mode: "direct" } } };
    const land = calcLandStdPriceAtAcq(sb.landPricePerSqmAtAcquisition!, sb.landArea!)!;
    const base = apportionByStdPrice(input.appraisalValue!, land, sb.buildingStdPriceAtAcquisition!).building;
    return {
      acquisitionMethod: "appraisal",
      base,
      echo: {
        ...head,
        base,
        appraisal: {
          mode: "apportioned",
          totalAppraisal: input.appraisalValue!,
          landStdPriceAtAcquisition: land,
          buildingStdPriceAtAcquisition: sb.buildingStdPriceAtAcquisition!,
        },
      },
    };
  }

  // 환산 — 이월과세 `housingBase` 와 같은 헬퍼를 같은 순서로 호출한다
  // ① 취득 당시 건물분 B_acq = 주택공시가격 H 를 토지:건물 기준시가 비율로 안분한 건물 몫
  const landAtAcq = calcLandStdPriceAtAcq(sb.landPricePerSqmAtAcquisition!, sb.landArea!)!;
  const acq = apportionByStdPrice(input.standardPriceAtAcquisition!, landAtAcq, sb.buildingStdPriceAtAcquisition!);
  // ② 양도 당시 건물분 B_tr — 영 §164⑨ 특례가 걸리면 차감 후 주택 가액 H_T′ 를 같은 비례 규칙으로 나눈다(양도차익의 환산 분모와 같은 값 — 단일 소스)
  const conv = resolveConversionDenominatorAtTransfer(input);
  const tr = apportionByStdPrice(conv.denominator, sb.landStdPriceAtTransfer!, sb.buildingStdPriceAtTransfer!);
  // ③ 양도가액 건물분 S_b — 법정 서열(구분 기재 → §100③ 30% → 감정 → 기준시가 비례) 그대로
  const sale = sb.sale ?? {};
  const saleBuilding = resolveTransferPriceSplit({
    transferPrice: input.transferPrice,
    transferDate: input.transferDate,
    landStandardPriceAtTransfer: sb.landStdPriceAtTransfer,
    buildingStandardPriceAtTransfer: sb.buildingStdPriceAtTransfer,
    landTransferPrice: sale.landTransferPrice,
    buildingTransferPrice: sale.buildingTransferPrice,
    landAppraisalAtTransfer: sale.landAppraisalAtTransfer,
    buildingAppraisalAtTransfer: sale.buildingAppraisalAtTransfer,
    saleSplitExemption: sale.saleSplitExemption,
  } as TransferTaxInput).building;
  if (!(tr.building > 0)) invalid("양도 당시 건물분 기준시가가 0이라 환산취득가액을 구할 수 없습니다.", `${FIELD}.buildingStdPriceAtTransfer`);
  // ④ 건물분 환산취득가액
  const base = calculateEstimatedAcquisitionPrice(saleBuilding, acq.building, tr.building);
  return {
    acquisitionMethod: "estimated",
    base,
    echo: {
      ...head,
      base,
      housingSplit: {
        acquisitionHousing: input.standardPriceAtAcquisition!,
        acquisitionLand: acq.land,
        acquisitionBuilding: acq.building,
        transferHousing: conv.denominator,
        transferLand: tr.land,
        transferBuilding: tr.building,
        saleBuilding,
        ...sec164_9Echo(conv),
      },
      formula: { multiplicand: saleBuilding, numerator: acq.building, denominator: tr.building },
    },
  };
}

/**
 * 영 §164⑨ 특례 echo — 특례 detail 이 있을 때만(불발이어도 detail 은 존재 — 결과 화면의 특례 카드와 같은 시점에 뜬다). detail 값을 **복사**한다(재계산 금지 — 표시 단일 소스).
 * `transferHousing` 은 차감 후(H_T′), `standardHousing` 은 특례 전(H_T).
 */
function sec164_9Echo(conv: ReturnType<typeof resolveConversionDenominatorAtTransfer>): { sec164_9?: NonNullable<SelfBuiltHousingPenaltyEcho["housingSplit"]>["sec164_9"] } {
  const h = conv.housingExpropriationValuationDetail;
  if (h) return { sec164_9: { kind: "expropriation", standardHousing: h.standardTotal, candidates: { compensation: h.compensationTotal, basis: h.compensationBasisTotal } } };
  const a = conv.auctionValuationDetail;
  if (a) return { sec164_9: { kind: "auction", standardHousing: a.standardTotal, candidates: { auction: a.auctionPrice } } };
  return {};
}

/** 결과 echo — 축이 base 를 정했을 때만 싣는다. `penalty` 는 호출부(finalize·손실 조기반환)가 계산한 §114조의2 가산세. */
export function selfBuiltHousingEchoOf(axis: SelfBuiltHousingAxis | undefined, penalty: number): { selfBuiltHousingPenalty: SelfBuiltHousingPenaltyEcho } | undefined {
  return axis ? { selfBuiltHousingPenalty: { ...axis.echo, penalty } } : undefined;
}
