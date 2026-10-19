/**
 * 상세명세서 1단계 — 일자·기간 항목 조립 (양도일자·취득일자·보유기간·퇴거일·입주일·거주기간)
 *
 * `DetailedStatementHelpers.ts`에서 분리 (800줄 정책 — 겸용 × 부담부증여 배선으로 769줄이 되어 열린 김에 분리).
 * 동작 무변경 — `items` Map에 1단계 항목만 set 한다. 거주 개월수는 호출부가 계산해 넘긴다
 * (`residenceMonthsOfAsset`이 Helpers에 있어 여기서 import하면 순환이 된다).
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { fmtDate, fmtPeriod, holdingPeriodFromDates } from "./FilingFormTableHelpers";
import type { StatementItem } from "./DetailedStatementConfig";
import { splitCarryoverView } from "@/lib/tax-engine/transfer-tax-split-carryover-display";
import { splitCarryoverDateText } from "./split-acq-text";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";

interface DateItemsArgs {
  isAggregate: boolean;
  /** 다건 모드 자산별 분해 — 단건은 빈 배열 */
  properties: PerPropertyBreakdown[];
  /** 대표 자산 (asset ?? formData.assets[0]) */
  primary: AssetForm | undefined;
  /** 양도일 "YYYY-MM-DD" */
  transferDate: string;
  /** 거주 개월 (대표 자산) */
  residenceMs: number;
  acquisitionDateLabel: string | undefined;
  acquisitionDateOverride: string | undefined;
  transferDateOf: (pid: string) => string;
  acqDateOf: (pid: string) => string;
  /** 파트 이월과세(P2 C) echo — 취득일자·보유기간 행이 파트별 기산일을 밝힌다. 없으면 종전 */
  splitDetail?: SplitGainResult;
}

export function setDateAndResidenceItems(items: Map<string, StatementItem>, args: DateItemsArgs): void {
  const {
    isAggregate,
    properties,
    primary,
    transferDate,
    residenceMs,
    acquisitionDateLabel,
    acquisitionDateOverride,
    transferDateOf,
    acqDateOf,
    splitDetail,
  } = args;
  const splitCarryover = isAggregate ? undefined : splitCarryoverView(splitDetail);
  items.set("transferDate", {
    label: "양도일자",
    value: fmtDate(transferDate),
    formula: "사용자 입력 (계약상 잔금청산일 또는 등기접수일 중 빠른 날)",
    legalBasis: "소득세법 §98",
    perAsset: isAggregate
      ? properties.map((p) => ({
          label: p.propertyLabel,
          value: fmtDate(transferDateOf(p.propertyId)),
        }))
      : undefined,
  });

  // 취득일자 — override 우선 (이월과세 Scenario A: 증여자 취득일)
  const displayAcqDate =
    acquisitionDateOverride && acquisitionDateOverride !== ""
      ? acquisitionDateOverride
      : // 파트 이월과세(P2 C)는 수증자 취득일 = 증여 등기접수일이다(자산 카드에 취득일 칸이 없다).
        (splitCarryover?.giftRegistryDate || primary?.acquisitionDate) ?? "";
  items.set("acquisitionDate", {
    label: acquisitionDateLabel ? `취득일자 ${acquisitionDateLabel}` : "취득일자",
    value: fmtDate(displayAcqDate),
    formula: acquisitionDateOverride
      ? "이월과세 적용 시 증여자 취득일 기산 (소득세법 §97조의2 ①)"
      : splitCarryover
        ? `수증자 취득일 = 증여 등기접수일 — 파트별 장기보유특별공제 기산일: ${splitCarryoverDateText(splitDetail)}`
        : "사용자 입력 (등기접수일 또는 잔금청산일 중 빠른 날)",
    legalBasis: acquisitionDateOverride || splitCarryover ? "소득세법 §97조의2" : "소득세법 §98",
    perAsset: isAggregate
      ? properties.map((p) => ({
          label: p.propertyLabel,
          value: fmtDate(acqDateOf(p.propertyId)),
        }))
      : undefined,
  });

  // 파트 이월과세 — 장기보유특별공제 보유기간은 파트마다 기산일이 다르다(적용 파트는 증여자 취득일). 엔진 파트 취득일 echo에서 센다.
  const splitHoldingValue = splitCarryover
    ? splitCarryover.parts.map((p) => `${p.label} ${holdingPeriodFromDates(p.lthdStartDate, transferDate)}`).join(" / ")
    : undefined;
  items.set("holdingPeriod", {
    label: "보유기간",
    value: splitHoldingValue ?? holdingPeriodFromDates(displayAcqDate, transferDate),
    formula: splitCarryover
      ? `양도일 ${fmtDate(transferDate)} − 파트별 장기보유특별공제 기산일 (${splitCarryoverDateText(splitDetail)}) (연·월 차이) — 장기보유특별공제 보유기간이며 세율 기산일과 다를 수 있습니다`
      : `양도일 ${fmtDate(transferDate)} − 취득일 ${fmtDate(displayAcqDate)} = ${holdingPeriodFromDates(displayAcqDate, transferDate)} (연·월 차이)`,
    legalBasis: splitCarryover ? "소득세법 §95④ 단서·§97조의2" : "소득세법 §95②",
    perAsset: isAggregate
      ? properties.map((p) => ({
          label: p.propertyLabel,
          value: holdingPeriodFromDates(
            acqDateOf(p.propertyId),
            transferDateOf(p.propertyId),
          ),
        }))
      : undefined,
  });

  // 입주일 없는 구간(신규 자산 기본값의 빈 구간)은 거주 사실이 없다 — 퇴거일 칸에 양도일을 찍지 않는다.
  const periods = primary?.residenceInputMode === "interval"
    ? (primary.residencePeriods ?? []).filter((p) => p.moveInDate)
    : [];
  const firstMoveIn = periods.length > 0 ? periods[0].moveInDate : "";
  const lastMoveOut = periods.length > 0
    ? (periods[periods.length - 1].moveOutDate || transferDate)
    : "";
  items.set("moveOut", {
    label: "퇴거일",
    value: lastMoveOut ? fmtDate(lastMoveOut) : "-",
    formula: "마지막 거주기간 종료일",
    legalBasis: "소득세법 시행령 §161",
  });
  items.set("moveIn", {
    label: "입주일",
    value: firstMoveIn ? fmtDate(firstMoveIn) : "-",
    formula: "최초 거주 시작일",
    legalBasis: "소득세법 시행령 §161",
  });
  items.set("residencePeriod", {
    label: "거주기간",
    value: fmtPeriod(residenceMs),
    formula: periods.length > 0 ? `${periods.map((pp) => `${fmtDate(pp.moveInDate)}~${fmtDate(pp.moveOutDate || transferDate)}`).join(" + ")} = ${fmtPeriod(residenceMs)}` : `${fmtPeriod(residenceMs)} (직접 입력 · 월 단위)`,
    legalBasis: "소득세법 §95②·시행령 §161",
  });
}
