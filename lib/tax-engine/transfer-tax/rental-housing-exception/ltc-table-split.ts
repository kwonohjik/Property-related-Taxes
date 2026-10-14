/**
 * 장기보유특별공제 표1·표2 동시 산출
 *
 * §161④ 규정에 따라 §161①·②1호는 표1(일반), §161②2호는 표2(1세대1주택)를
 * 각각 적용하므로, 동일한 양도차익에 대해 두 표를 모두 계산해야 함.
 *
 * 표1 (일반 장기보유공제): 보유연수 × 2%, 최대 30%
 * 표2 (1세대1주택 특례):   보유연수 × 4% + 거주연수 × 4%, 최대 80%
 *
 * 법령 근거: 소득세법 §95② 별표, 소득세법 시행령 §161④
 * 표2 공제율은 `calcLongTermRate`(정본)가 계산한다 — 이 파일은 표1·표2를 한 양도차익에 동시에 적용하는 분기만 맡는다.
 */

import { applyFairMarketRatio, applyRate } from "../../tax-utils";
import { calcLongTermRate } from "../../transfer-tax-mixed-use-inheritance";
import { resolveAppurtenantLandLthdRate, resolveAppurtenantLthdNoticeBasis } from "../../appurtenant-land-lthd-rate";

// ============================================================
// 공제율 계산 함수
// ============================================================

/**
 * 표1 — 일반 장기보유공제율
 * 보유연수 × 2%, 최대 30%, 최소 보유기간 3년
 */
export function calcTable1Rate(holdYears: number): number {
  if (holdYears < 3) return 0;
  return Math.min(holdYears * 0.02, 0.30);
}

// ============================================================
// 메인 계산 함수
// ============================================================

export type Gain95BothTables = {
  /** 표1 장기보유공제액 (원, floor) */
  ltcTable1: number;
  /** 표2 장기보유공제액 (원, floor) */
  ltcTable2: number;
  /** gain95(표1) = gain − ltcTable1 */
  gain95Table1: number;
  /** gain95(표2) = gain − ltcTable2 */
  gain95Table2: number;
  /** 표1 공제율 */
  rateTable1: number;
  /** 표2 공제율 */
  rateTable2: number;
};

/**
 * 동일 양도차익에 대해 표1·표2 장기보유공제를 동시 산출
 *
 * B1 케이스: gain95T1 사용 (§161① + §161④)
 * B2 케이스: gain95T1(1호) + gain95T2(2호) 각각 사용 (§161②1호·2호 + §161④)
 * A1 케이스: 특례 전액 비과세이므로 gain95T1 참조용으로만 반환
 * A2 케이스: gain95T2 사용 (1세대1주택 고가주택 분기 — 표2)
 *
 * 정수 연산: applyRate() = Math.floor(gain × rate)
 * Math.round() 절대 금지
 *
 * @param gain 양도차익 (원)
 * @param holdYears 보유연수 (정수)
 * @param liveYears 거주연수 (정수)
 * @param transferDate 양도일 — 표2 연혁(2009~2020 보유 연 8%, `data/lthd-table2-era.ts`). 미제공이면 현행 식.
 *
 * 표2 공제율은 일반 경로와 같은 정본 `calcLongTermRate`(표2)에 위임한다(S06-5·S06-6 — 자체 사본 금지).
 * 거주분은 거주 2년 미만이면 0이고 보유분은 남는다: 소득세법 시행령 §161④가 RH-B2 2호에 「표2를 적용한다」고
 * 정해, 2호 부분은 거주 2년 미만이어도 표2 보유분을 적용한다(#15 A). 표1 독법(§159의4)과 갈리는 경우는
 * 호출부가 「확인 필요」로 고지한다.
 */
export function calculateGain95BothTables(
  gain: number,
  holdYears: number,
  liveYears: number,
  transferDate?: Date,
): Gain95BothTables {
  const rateTable1 = calcTable1Rate(holdYears);
  const rateTable2 = calcLongTermRate(holdYears, liveYears, true, false, transferDate);

  // applyRate = Math.floor(gain * rate) — 세율×금액은 반드시 이 함수 사용
  const ltcTable1 = applyRate(gain, rateTable1);
  // 표2 비율은 보유분+거주분 double 합이라 applyRate(floor)면 1원 과소가 난다(일반 경로 `applyLthdRate`와 같은 사유).
  const ltcTable2 = applyFairMarketRatio(gain, rateTable2);

  const gain95Table1 = gain - ltcTable1;
  const gain95Table2 = gain - ltcTable2;

  return {
    ltcTable1,
    ltcTable2,
    gain95Table1,
    gain95Table2,
    rateTable1,
    rateTable2,
  };
}

// ============================================================
// 토지·건물 파트별 산출 (§95④ 파트별 보유연수 · 기본통칙 95-0…1)
// ============================================================

/** 파트 하나의 장기보유특별공제 입력 — 양도차익과 그 파트 자신의 보유연수(§95④ 취득일~양도일). */
export type Gain95PartInput = {
  /** 이 파트의 양도차익(원) — 0 하한은 이 함수가 건다 */
  gain: number;
  /** 파트 자신의 보유연수 — 표1 공제율의 기준 */
  holdYears: number;
  /**
   * 토지 파트가 주택(건물)보다 보유기간이 **오래된** 경우에만 — 주택 보유연수.
   * 있으면 표2 공제율을 기본통칙 95-0…1(표1 토지 전체 보유기간 vs 표2 주택 부수토지로서의 보유기간 중 큰 공제율)로 정한다.
   */
  houseHoldYears?: number;
};

export type RentalLthdParts = { land: Gain95PartInput; building: Gain95PartInput };

/** 파트별 산출 echo — 결과 카드·고지가 읽는다(재계산 금지). */
export type Gain95PartEcho = {
  gain: number;
  holdYears: number;
  rateTable1: number;
  rateTable2: number;
  ltcTable1: number;
  ltcTable2: number;
  /** 기본통칙 95-0…1을 적용한 토지 파트만 */
  appurtenant?: {
    houseHoldingYears: number;
    table1Rate: number;
    table2Rate: number;
    table1Applied: boolean;
    /** 토지 자신의 보유연수로 표2를 적용했을 때의 공제율과 값이 달라졌다 */
    changedFromOwnYears: boolean;
    basis: { source: "circular" | "ruling"; twoAxis: boolean };
  };
};

export type Gain95BothTablesByParts = Gain95BothTables & { land: Gain95PartEcho; building: Gain95PartEcho };

function sameRate(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-12;
}

/**
 * 표1·표2 장기보유공제를 **파트별 보유연수**로 동시 산출한다.
 *
 * 일반 경로(`calcLongTermHoldingDeduction` split 분기)와 같은 규칙이다 — 파트 양도차익을 0 하한으로 각각 곱해 합산하고,
 * 토지 파트가 주택보다 오래되면 표2는 통칙 95-0…1 leaf(`resolveAppurtenantLandLthdRate`)로 정한다. 표1은 파트 자신의 보유연수다.
 *
 * ⚠️ **종전 값 보존** — 한 표에서 두 파트의 공제율이 같고 양도차익이 모두 0 이상이면 종전 단일 산식
 *   (합계 양도차익 × 공제율 한 번 floor)을 그대로 쓴다. 같은 날 취득·토지가 건물보다 길지 않은 같은 연수 시료에서 1원도 달라지지 않는다.
 */
export function calculateGain95BothTablesByParts(
  parts: RentalLthdParts,
  liveYears: number,
  transferDate?: Date,
): Gain95BothTablesByParts {
  const landOwnRate2 = calcLongTermRate(parts.land.holdYears, liveYears, true, false, transferDate);
  const appurtenant =
    parts.land.houseHoldYears !== undefined
      ? resolveAppurtenantLandLthdRate({
          landHoldingYears: parts.land.holdYears,
          houseHoldingYears: parts.land.houseHoldYears,
          residenceYears: liveYears,
          useTable2: true,
          transferDate,
        })
      : undefined;
  const land = {
    rate1: calcTable1Rate(parts.land.holdYears),
    rate2: appurtenant ? appurtenant.rate : landOwnRate2,
  };
  const building = {
    rate1: calcTable1Rate(parts.building.holdYears),
    rate2: calcLongTermRate(parts.building.holdYears, liveYears, true, false, transferDate),
  };

  const sum = parts.land.gain + parts.building.gain;
  const allNonNegative = parts.land.gain >= 0 && parts.building.gain >= 0;
  // 한 표 — 공제율이 같고 손실 파트가 없으면 종전 산식, 아니면 파트별 0 하한 합산.
  const side = (
    rateL: number,
    rateB: number,
    legacy: (g: number, r: number) => number,
  ): { total: number; land: number; building: number } => {
    if (allNonNegative && sameRate(rateL, rateB)) {
      const total = legacy(sum, rateB);
      const landPart = applyFairMarketRatio(Math.max(parts.land.gain, 0), rateL);
      // 합계가 종전 산식 값이 되도록 잔액은 건물 파트가 흡수한다(echo 합 = 총액 불변식).
      return { total, land: landPart, building: total - landPart };
    }
    const l = applyFairMarketRatio(Math.max(parts.land.gain, 0), rateL);
    const b = applyFairMarketRatio(Math.max(parts.building.gain, 0), rateB);
    return { total: l + b, land: l, building: b };
  };
  const t1 = side(land.rate1, building.rate1, applyRate);
  const t2 = side(land.rate2, building.rate2, applyFairMarketRatio);

  const blended = (ltc: number) => (sum > 0 ? ltc / sum : 0);
  return {
    ltcTable1: t1.total,
    ltcTable2: t2.total,
    gain95Table1: sum - t1.total,
    gain95Table2: sum - t2.total,
    rateTable1: blended(t1.total),
    rateTable2: blended(t2.total),
    land: {
      gain: parts.land.gain,
      holdYears: parts.land.holdYears,
      rateTable1: land.rate1,
      rateTable2: land.rate2,
      ltcTable1: t1.land,
      ltcTable2: t2.land,
      ...(appurtenant
        ? {
            appurtenant: {
              houseHoldingYears: parts.land.houseHoldYears!,
              table1Rate: appurtenant.table1Rate,
              table2Rate: appurtenant.table2Rate,
              table1Applied: appurtenant.table1Applied,
              changedFromOwnYears: appurtenant.rate !== landOwnRate2,
              basis: resolveAppurtenantLthdNoticeBasis(transferDate),
            },
          }
        : {}),
    },
    building: {
      gain: parts.building.gain,
      holdYears: parts.building.holdYears,
      rateTable1: building.rate1,
      rateTable2: building.rate2,
      ltcTable1: t1.building,
      ltcTable2: t2.building,
    },
  };
}
