/**
 * STEP 2.5 헬퍼 — §155⑳ 거주주택 특례의 장기보유특별공제를 **토지·건물 파트별 보유연수**로 구하기 위한 입력 조립과 결과 echo.
 *
 * 종전에는 건물 취득일 하나로 만든 단일 보유연수(`holdYears`)를 주택분 양도차익 전체에 곱했다. 일반 경로
 * (`calcLongTermHoldingDeduction` split 분기)는 파트 자신의 보유연수(§95④)를 쓰므로 토지가 건물보다 먼저 취득된 분리 취득 주택에서
 * 특례 on/off 값이 갈렸다(토지 2008·건물 2014 시료 — 같은 날 취득이면 일치). `transfer-tax-rental-housing-step.ts`
 * 800줄 정책 분리 — 순수 함수(DB 호출 없음).
 */
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { RentalHousingExceptionResult } from "./transfer-tax/rental-housing-exception";
import type { RentalLthdParts } from "./transfer-tax/rental-housing-exception/ltc-table-split";
import { appurtenantLandLthdNoticeText } from "./appurtenant-land-lthd-rate";
import { calcLongTermRate } from "./transfer-tax-mixed-use-inheritance";
import { deriveSplitLthdEcho } from "./transfer-tax-split-display";

/**
 * 주택분(배율 초과분 제외) 양도차익을 토지·건물 파트로 나눈 장기보유특별공제 입력. 만들 수 없으면 `undefined`(종전 단일 보유연수 산식).
 *
 * 만들지 않는 경우 — ① 토지·건물 분리 계산이 없다(단일 자산) ② 본인이 한쪽 파트만 소유한다(소유자 분리) ③ 파트 양도차익 합이
 * 호출부가 쓰는 주택분 양도차익과 어긋난다(안전측 후퇴 — 어긋난 채 파트로 쪼개면 양도차익이 새거나 중복된다).
 */
export function buildRentalLthdParts(args: {
  splitDetail: SplitGainResult | undefined;
  /** 배율 초과분 양도차익 — 토지 파트에서 뗀다(없으면 0) */
  nonBusinessGain: number;
  /**
   * G-3 — 보유요건 미달 나중 취득 토지분이 주택분에서 빠졌으면 토지 파트 전체가 특례 대상 밖이다(토지 손실도 상쇄하지 않는다).
   * 이때 토지 파트 양도차익은 0이고 `housingGain`은 건물분만이다.
   */
  laterLandExcluded?: boolean;
  /** 호출부가 특례 계산에 쓰는 주택분 양도차익(= 양도차익 − 배율 초과분) */
  housingGain: number;
  /** 표2 후보 연수(「주택 부수토지로서의 보유기간」) — 토지만 본인이 합가일을 넣어 건물 보유연수와 달라진 경우만. 없으면 건물 보유연수 */
  houseYearsOverride?: number;
}): RentalLthdParts | undefined {
  const { splitDetail, nonBusinessGain, laterLandExcluded, housingGain, houseYearsOverride } = args;
  if (!splitDetail) return undefined;
  const selfOwns = splitDetail.selfOwns ?? "both";
  if (selfOwns === "building_only") return undefined;
  const landGain = laterLandExcluded ? 0 : splitDetail.land.gain - nonBusinessGain;
  // 토지만 본인 — 건물은 본인 소유가 아니라 건물 파트 양도차익은 0이다(토지 파트만 통칙·파트별 보유연수를 탄다).
  const buildingGain = selfOwns === "land_only" ? 0 : splitDetail.building.gain;
  if (landGain + buildingGain !== housingGain) return undefined;
  const landYears = splitDetail.land.holdingYears;
  const buildingYears = splitDetail.building.holdingYears;
  const houseYears = houseYearsOverride ?? buildingYears;
  return {
    land: {
      gain: landGain,
      holdYears: landYears,
      // 기본통칙 95-0…1 — 토지가 주택보다 보유기간이 오래된 경우에만 「주택 부수토지로서의 보유기간」(= 건물 보유연수 · 합가일 반영)이 쓰인다.
      ...(landYears > houseYears ? { houseHoldYears: houseYears } : {}),
    },
    building: { gain: buildingGain, holdYears: buildingYears },
  };
}

/**
 * 특례 결과의 파트별 공제를 `splitDetail` 토지·건물 파트에 채운다(결과 카드가 파트별 공제율·공제액을 읽는다 — 종전에는 이 경로가
 * 그 필드를 채우지 않아 카드가 0%를 표시했다). 값은 **실제 적용한 장특표** 기준이다 — A는 표2, B는 표1(`appliedTable`, `gain95Applied`와 같은 축).
 * 반환값은 기본통칙 95-0…1로 토지분 공제율이 토지 자신의 보유연수 값과 달라졌을 때의 고지 문구(없으면 `undefined`).
 */
export function applyRentalLthdPartsToSplit(
  splitDetail: SplitGainResult | undefined,
  rhe: RentalHousingExceptionResult,
  /** 표2 연혁(2009~2020 보유 연 8%)을 가르는 양도일 — 보유분·거주분 분해 echo가 쓴다 */
  transferDate: Date,
): string | undefined {
  const parts = rhe.formulaTrace.partsLthd;
  if (!splitDetail || !parts) return undefined;
  const table2 = rhe.appliedTable === "table-2";
  splitDetail.land.longTermRate = table2 ? parts.land.rateTable2 : parts.land.rateTable1;
  splitDetail.land.longTermDeduction = table2 ? parts.land.ltcTable2 : parts.land.ltcTable1;
  splitDetail.building.longTermRate = table2 ? parts.building.rateTable2 : parts.building.rateTable1;
  splitDetail.building.longTermDeduction = table2 ? parts.building.ltcTable2 : parts.building.ltcTable1;

  // 보유분·거주분 분해 echo(표시 전용 — 신고서 양식·상세명세서가 읽는다). 표1은 전부 보유분, 표2는 거주 0으로 부른 공제율이 보유분이다.
  //   통칙으로 표1이 이긴 토지 파트는 전부 보유분, 표2가 이긴 파트의 보유분은 건물 보유연수 기준이다.
  const holdOnly = (years: number) => calcLongTermRate(years, 0, true, false, transferDate);
  const landTable2HoldOnly = parts.land.appurtenant
    ? parts.land.appurtenant.table1Applied
      ? parts.land.rateTable2
      : holdOnly(parts.land.appurtenant.houseHoldingYears)
    : holdOnly(parts.land.holdYears);
  Object.assign(
    splitDetail.land,
    deriveSplitLthdEcho({
      totalRate: splitDetail.land.longTermRate,
      holdingOnlyRate: table2 ? landTable2HoldOnly : splitDetail.land.longTermRate,
      deduction: splitDetail.land.longTermDeduction,
    }),
  );
  Object.assign(
    splitDetail.building,
    deriveSplitLthdEcho({
      totalRate: splitDetail.building.longTermRate,
      holdingOnlyRate: table2 ? holdOnly(parts.building.holdYears) : splitDetail.building.longTermRate,
      deduction: splitDetail.building.longTermDeduction,
    }),
  );

  const ap = parts.land.appurtenant;
  // 표2가 계산에 들어간 경우 — A(표2 전체)와 B2의 2호 부분.
  const table2Used = table2 || (rhe.scenarioId === "RH-B2" && (rhe.formulaTrace.part2 ?? 0) > 0);
  if (!ap || !table2Used) {
    delete splitDetail.land.appurtenantLthd;
    return undefined;
  }
  if (table2) splitDetail.land.appurtenantLthd = ap;
  else delete splitDetail.land.appurtenantLthd; // B의 카드는 표1 값을 보이므로 통칙 echo는 달지 않는다(고지만).
  return ap.changedFromOwnYears
    ? appurtenantLandLthdNoticeText({
        landHoldingYears: parts.land.holdYears,
        houseHoldingYears: ap.houseHoldingYears,
        table1Rate: ap.table1Rate,
        table2Rate: ap.table2Rate,
        table1Applied: ap.table1Applied,
        basis: ap.basis,
      })
    : undefined;
}
