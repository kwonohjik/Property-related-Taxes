/** (8-3) 전환주식에 따른 이익의 증여 (§39①3호) — 전환후 이익 − 발행당시 이익 (시행령 §29②6) */
import { GIFT } from "../legal-codes";
import { calcCapitalIncreaseGift } from "./capital-increase";
import { capitalIncreaseLawDateEcho } from "./capital-increase";
import { shareholderOfTaxedCorpExcluded } from "./taxpayer-gate";
import { jointLiabilityExemptForDeemedType } from "./taxpayer-gate";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ConvertibleStockInput } from "./types";

/**
 * §39①3호 행위시법 — 날짜 축이 **둘**이다(두 부칙 모두 개정본 MST 부칙단위 실독 2026-09-28).
 *   ① 법률 — 「상증법」 법률 제14388호 부칙 §5②: 「제39조제1항제3호의 개정규정은 이 법 시행
 *      (2017.1.1.) 이후 **신주를 발행하는 경우**부터 적용」. 「신주」는 §39①이 「자본금을 증가시키기
 *      위하여 … 발행」하는 주식으로 정의하고 3호의 요건이 「전환주식을 **발행한** 경우」이므로 기준일은
 *      전환일이 아니라 **전환주식 발행일**이다(형제 부칙 §6도 §40을 원 증권 인수·취득일로 가른다).
 *      발행일은 `atIssuance.giftDate`(폼 `csIssuanceDate`)로 들어온다.
 *   ② 시행령 — 대통령령 제27835호 부칙 §2: 「이 영 시행(2017.2.7.) 이후 … 증여받는 분부터 적용」.
 *      증여일(§29①2호 「전환한 날」)과 계산방법(§29②6호)이 이 영으로 신설됐다. 발행이 2017년이어도
 *      전환이 그 전이면 법률은 걸리는데 산식 규정이 없다.
 * ⇒ 둘 다 **계산하지 않고 차단**한다 — 그 구간의 결과를 현행 산식으로 내면 법적 근거가 없는 수치다
 *    (§45의3 `resolveRcEraExclusion`과 같은 정책: 「현행 산식으로 조용히 계산은 선택지가 아니다」).
 *    미입력(leaf 호출)은 판정 불가 ⇒ 종전 동작(계산) — UI 경로는 ⑧이 발행일·증여일을 필수화한다.
 */
const CONVERTIBLE_STOCK_APPLIES_FROM = Date.UTC(2017, 0, 1);
const CONVERSION_CALC_RULE_FROM = Date.UTC(2017, 1, 7);

function convertibleStockEraExclusion(input: ConvertibleStockInput): string | undefined {
  const issued = input.atIssuance.giftDate;
  if (issued != null && issued.getTime() < CONVERTIBLE_STOCK_APPLIES_FROM)
    return `전환주식 발행일이 2017.1.1. 전 — §39①3호 미적용 (${GIFT.CS_ERA_ADDENDA_14388})`;
  const converted = input.atConversion.giftDate;
  if (converted != null && converted.getTime() < CONVERSION_CALC_RULE_FROM)
    return `전환일(증여일)이 2017.2.7. 전 — 계산방법(상증령 §29②6호) 신설 전이라 계산하지 않음, 직접 검토 필요 (${GIFT.CS_CALC_ERA_ADDENDA_27835})`;
  return undefined;
}

/**
 * §29②6: 가목(전환 후 교부받은 주식을 신주로 보아 §29②1~5 계산한 이익)에서
 * 나목(전환주식 발행 당시 §29②1~5 계산한 이익)을 차감. 그 금액이 영 이하이면 이익 없음.
 */
export function calcConvertibleStockGift(input: ConvertibleStockInput): DeemedGiftResult {
  // 시기 사유가 가장 먼저다 — 조문(또는 산식) 자체가 걸리지 않으면 납세의무자 판정(§4의2)은 물을 필요가 없다.
  // #37·#94 — 적용 법령 기준일 = 전환한 날(§29①2호) = 전환 leg의 날짜. 2017.2.7. 전 전환은 위 차단이
  //   먼저 걸리므로 시점 고지(eraNotice)는 붙을 일이 없다 — 기준일만 가져온다.
  const lawDate = capitalIncreaseLawDateEcho(input.atConversion.giftDate).appliedLawDate;
  const appliedLawDate = lawDate ? { appliedLawDate: lawDate } : {};
  const eraExclusion = convertibleStockEraExclusion(input);
  if (eraExclusion) {
    return {
      type: "convertible_stock",
      applied: false,
      deemedGiftValue: 0,
      breakdown: [],
      exclusionReason: eraExclusion,
      legalBasis: GIFT.CAPITAL_INCREASE,
      // 과세요건 판정이 아니라 적용 법령의 문제임을 명시한다(§45의3와 같은 표지)
      eraBlocked: true,
      donorJointLiabilityExempt: jointLiabilityExemptForDeemedType("convertible_stock"),
      ...appliedLawDate,
    };
  }
  // 「상증법」§2 9호·§4의2①·③ — 수증자가 영리법인이면 §39①3호 경로에서도 납세의무자가 아니다.
  //   두 leg가 각각 0을 내면 차감 결과도 0이지만, 그 0은 「전환후 이익 ≤ 발행당시 이익」이라는
  //   **다른 사유**로 표시된다. 사유가 화면·이력에 남으므로 여기서 먼저 가른다.
  const doneeIsForProfitCorp =
    input.atConversion.doneeIsForProfitCorp === true || input.atIssuance.doneeIsForProfitCorp === true;
  // 「상증법」§4의2④ — **최상위에서 한 번만** 판정한다.
  //   ⚠️ leg 안에서 돌리면 안 된다. 두 leg는 `direction`·`subType`이 서로 다를 수 있고
  //   (가목=전환 후 / 나목=발행 당시), 목마다 「주주등」 확정 여부가 갈린다. 차감항에서만
  //   게이트가 발동하면 **기준선이 0이 되어 결과가 부풀어 오른다** — 이 파일이 공모 제외에서
  //   이미 겪은 비대칭과 같은 형태다(위 주석의 200,000,000 → 500,000,000).
  //   과세단위는 가목(전환 후)이므로 그쪽 입력으로 판정한다.
  const shareholderOfTaxedCorp = shareholderOfTaxedCorpExcluded(input.atConversion);
  //   ⚠️ ①③도 같다 — `side()`가 두 leg에 플래그를 각각 실으므로 그대로 두면 각 leg가 0을 내고
  //      **산출근거가 통째로 소실**된다(실측: 500,000,000·300,000,000 두 행이 전부 0).
  //      이 파일의 규칙은 「과세분만 0, 이익의 존재는 부정하지 않는다」다.
  const conversion = calcCapitalIncreaseGift({
    ...input.atConversion,
    doneeIsForProfitCorp: false,
    issuerGainCorporateTaxed: false,
  });
  // 나목(차감항)은 「전환주식 발행 당시 **제1호부터 제5호까지의 규정에 따라 계산한 이익**」이다.
  //   제1호~제5호는 **계산방법** 규정이고, 공모 제외는 그 바깥의 **법** §39① 본문 괄호에 있다.
  //   차감항은 과세단위가 아니라 **기준선**이므로 요건필터를 태우지 않는다.
  //   ⚠️ 종전에는 차감항에만 필터가 걸려 **어느 독법으로도 도출되지 않는 비대칭**이었다 —
  //      필터가 준용된다면 두 leg 모두 0이라 0 − 0 = 0이고, 준용되지 않는다면 둘 다 산식값이다.
  //      실측: 발행 시점만 공모로 두면 200,000,000이 500,000,000으로 뛰었다(차감액 전액 소멸).
  //      기준금액 게이트(30%·3억)는 §29②2호·4호 **안에** 있으므로 그대로 준용된다 — 떼지 말 것.
  const issuance = calcCapitalIncreaseGift({
    ...input.atIssuance,
    allocationMethod: "normal",
    doneeIsForProfitCorp: false, // 위 주석 — leg에 남기면 산출근거가 0으로 소실된다
    issuerGainCorporateTaxed: false, // 위 주석 — 차감항에서 게이트가 발동하면 기준선이 소멸한다
  });
  const raw = conversion.deemedGiftValue - issuance.deemedGiftValue;
  const value = raw > 0 ? raw : 0; // 시행령 §29②6 단서: 영 이하면 이익 없음
  const applied = value > 0;

  // 5-C — 종전에는 두 leg의 **금액만** 읽고 `exclusionReason`·`direction`을 버렸다. 그래서
  //   전환 시점이 공모로 제외돼 0이 된 사안과 산식상 0인 사안이 화면에서 구별되지 않았다.
  //   금액을 다시 계산하지 않고 **하위 결과가 이미 들고 있는 사유**를 note로 옮기기만 한다.
  const direction = input.atConversion.direction ?? "low";
  const breakdown: CalculationStep[] = [
    {
      label: "발행유형",
      amount: 0,
      lawRef: GIFT.CAPITAL_INCREASE,
      note: direction === "high" ? "§39①3호 나목 — 고가 발행 전환주식" : "§39①3호 가목 — 저가 발행 전환주식",
    },
    {
      label: "전환 후 교부주식 기준 이익 (§29②1~5)",
      amount: conversion.deemedGiftValue,
      lawRef: GIFT.CAPITAL_INCREASE,
      note: conversion.exclusionReason,
    },
    {
      label: "전환주식 발행 당시 이익 (§29②1~5)",
      amount: issuance.deemedGiftValue,
      // 차감항은 기준선이라 배정방법 요건을 태우지 않는다(위 주석) — 그 사실도 함께 남긴다.
      note: issuance.exclusionReason ?? "차감 기준선 — 배정방법 요건 미적용 (§29②6호 나목)",
    },
    { label: "증여재산가액 (전환후 − 발행당시, 영 이하면 0)", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: "§39①3호 전환주식" },
  ];
  // 「상증법」§31①은 「증여재산가액」을 **과세대상 가액**으로 한정 정의한다 ⇒ 제외되면 그 이름이
  //   성립하지 않는다. 단건 경로의 `excludedResult`가 하는 라벨 전환을 여기서도 한다.
  //   금액은 **보존**한다 — 부정되는 것은 증여세 부과이지 이익의 존재가 아니다.
  const excluded = (reason: string, conclusionLabel: string): DeemedGiftResult => ({
    type: "convertible_stock",
    applied: false,
    deemedGiftValue: 0,
    breakdown: breakdown.map((r) =>
      r.label.startsWith("증여재산가액") ? { ...r, label: conclusionLabel } : r,
    ),
    exclusionReason: reason,
    legalBasis: GIFT.CAPITAL_INCREASE,
    thresholdEcho: { gain: value },
    // §4의2⑥ 단서 — 배제돼도 「연대납부의무가 없다」는 사실은 남는다(다른 축이다)
    donorJointLiabilityExempt: jointLiabilityExemptForDeemedType("convertible_stock"),
    ...appliedLawDate,
  });
  if (doneeIsForProfitCorp) {
    return excluded(
      `영리법인 수증자 — 증여세 납세의무자가 아님 (${GIFT.FOR_PROFIT_CORP_NOT_TAXPAYER})`,
      "제외 전 산출 이익 (「법인세법 시행령」 제89조제6항 준용 익금 — 증여세 미과세)",
    );
  }
  if (shareholderOfTaxedCorp) {
    return excluded(
      `법인세가 부과된 영리법인의 주주등 — 증여세 미부과 (${GIFT.SHAREHOLDER_OF_TAXED_CORP_EXEMPTION})`,
      "제외 전 산출 이익 (「상증법」§4의2④ — 주주등 증여세 미과세)",
    );
  }
  return {
    type: "convertible_stock",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "전환후 이익이 발행당시 이익 이하 — 추가 이익 없음",
    legalBasis: GIFT.CAPITAL_INCREASE,
    // §4의2⑥ 단서 — §39①3호도 「제35조부터 제39조까지」에 든다
    donorJointLiabilityExempt: jointLiabilityExemptForDeemedType("convertible_stock"),
    thresholdEcho: { gain: value },
    ...appliedLawDate,
  };
}
