/**
 * 주택 부수토지 장기보유특별공제율 — 소득세법 기본통칙 95-0…1 「주택부수토지가 주택보다 보유기간이 긴 경우」 **단일 leaf**.
 *
 * 통칙 문언(국세청 국세법령정보시스템 열람 — 2024.03.15. 조문번호 이동, 2019.12.23. 신설 시 95-0…2):
 *   「소득세법」 제95조제2항을 적용할 때 1세대1주택에 딸린 토지를 양도하는 경우로서 주택보다 보유기간이 오래된
 *   주택 부수토지에 대한 장기보유특별공제는 그 토지의 전체보유기간에 따른 같은 항 표1의 공제율과 주택 부수토지로서의
 *   보유기간에 따른 같은 항 표2의 공제율 중 큰 공제율을 적용한다.
 *
 * 같은 취지의 예규: 기획재정부 재산세제과-1183(2010.12.10.) · 상속증여세과-461(2013.8.12.) · 부동산거래관리과-696(2010.5.18.).
 *
 * 읽는 법(사용자 결정 2026-09-02 · 2026-10-14):
 *   · 「표2의 공제율」은 §95② 단서가 정한 **보유기간별 + 거주기간별 합산 공제율 전체**다 — 보유분만 비교하고 거주분을 따로
 *     얹지 않는다(통칙은 「큰 공제율을 적용한다」 — 두 공제율 중 **하나**를 고르는 문형). 재개발 경로
 *     (`redevelopment-lthd.ts` `landContributedExistingLthdRate`)도 같은 독법이다.
 *   · 표1 후보 = 토지 자신의 보유연수(§95④ — 취득일~양도일), 표2 후보 = 「주택 부수토지로서의 보유기간」 = 주택 보유연수.
 *   · 표2 후보는 1세대1주택 표2 **대상**(영 §159의4)일 때만 있다 — 아니면 표1 하나라 이 leaf는 표1을 그대로 돌려준다.
 *   · 양도일 연혁은 `calcLongTermRate`(표2 연혁 `data/lthd-table2-era.ts`)가 가른다 — 통칙이 신설되기 전(2019.12.23.)에도
 *     같은 비교를 예규(2010~)가 정했으므로 이 leaf 자체에는 별도 양도일 게이트가 없다.
 *
 * 호출부 — 복사 금지:
 *   · `transfer-tax-lthd.ts` L-1b(컴패니언 부수토지 카드) — 표2 보유연수 = 함께 양도하는 주택(primary)의 보유연수
 *   · `transfer-tax-lthd.ts` split 분기(토지·건물 분리취득 주택) + §155⑳ 거주주택 특례(`ltc-table-split.ts`)
 *   · 겸용주택 주택분 토지 — 단건 `transfer-tax-mixed-use-helpers.ts` `buildHousingPart` · 다건 파트 카드
 *     (`transfer-tax-lthd.ts` 단일 취득일 경로 — `appurtenantHouseAcquisitionDate`)
 */
import { calcLongTermRate } from "./transfer-tax-mixed-use-inheritance";
import { LTHD_TABLE2_SPLIT_TRANSFER_START } from "./data/lthd-table2-era";

export interface AppurtenantLandLthdRateInput {
  /** 「그 토지의 전체보유기간」 — 토지 자신의 보유연수 */
  landHoldingYears: number;
  /** 「주택 부수토지로서의 보유기간」 — 주택(건물)의 보유연수 */
  houseHoldingYears: number;
  /** 실거주 연수 — 표2 거주분 공제율 */
  residenceYears: number;
  /** 1세대1주택 표2 **대상**인가(영 §159의4) — 호출부가 정한 술어를 그대로 받는다 */
  useTable2: boolean;
  /** 양도일 — 표2 연혁. 생략하면 현행 식(`calcLongTermRate` 계약) */
  transferDate?: Date;
}

export interface AppurtenantLandLthdRate {
  /** 적용 공제율 = max(표1, 표2) */
  rate: number;
  /** 표1(토지 전체 보유기간) 공제율 */
  table1Rate: number;
  /** 표2(주택 부수토지로서의 보유기간 + 거주) 공제율 — 표2 대상이 아니면 0 */
  table2Rate: number;
  /** 표1이 적용됐다(표1 ≥ 표2 — 동률은 표1: 그쪽이 「그 자산의 보유기간」(§95④)이라 오해가 적다) */
  table1Applied: boolean;
}

export function resolveAppurtenantLandLthdRate(p: AppurtenantLandLthdRateInput): AppurtenantLandLthdRate {
  // 표1(일반 보유 × 2%, 30% 캡)은 토지 자신의 보유연수다. 3년 진입요건은 `calcLongTermRate` 정본에 내장돼 있다.
  const table1Rate = calcLongTermRate(p.landHoldingYears, p.residenceYears, false);
  // 표2(1세대1주택 — 보유분 4% + 실거주분 4%, 각 40% 캡)는 주택 부수토지로서의 보유연수(= 주택 보유연수).
  const table2Rate = p.useTable2
    ? calcLongTermRate(p.houseHoldingYears, p.residenceYears, true, false, p.transferDate)
    : 0;
  return {
    rate: Math.max(table1Rate, table2Rate),
    table1Rate,
    table2Rate,
    table1Applied: table1Rate >= table2Rate,
  };
}

/** 기본통칙 95-0…1의 전신(구 95-0…2) 신설일 — 이 날 전 양도분은 통칙이 아니라 과세관청 해석(예규)이 근거다. */
export const APPURTENANT_LTHD_CIRCULAR_START = new Date("2019-12-23");

/** 고지 근거·독법 병기 판정 — 양도일로만 정한다. 호출부는 결과(echo)에 이 값을 싣고 표시 계층은 그대로 읽는다. */
export interface AppurtenantLthdNoticeBasis {
  /** `circular` = 기본통칙 95-0…1(2019.12.23. 신설) · `ruling` = 통칙 신설 전 과세관청 해석 */
  source: "circular" | "ruling";
  /** 표2가 보유분·거주분 2축인 양도분(2021.1.1.~) — 표1과 비교하는 표2의 단위를 다룬 해석례를 확인하지 못한 사실을 병기한다 */
  twoAxis: boolean;
}

export function resolveAppurtenantLthdNoticeBasis(transferDate?: Date): AppurtenantLthdNoticeBasis {
  // 양도일이 없으면(레거시 호출) 현행 기준.
  if (!transferDate) return { source: "circular", twoAxis: true };
  return {
    source: transferDate.getTime() >= APPURTENANT_LTHD_CIRCULAR_START.getTime() ? "circular" : "ruling",
    twoAxis: transferDate.getTime() >= LTHD_TABLE2_SPLIT_TRANSFER_START.getTime(),
  };
}

/**
 * 결과 고지(사실만 — 유불리 표현 없음). 통칙이 적용돼 값이 달라질 수 있는 split 경로(일반·§155⑳)가 쓴다.
 * 숫자는 호출부가 쓴 값 그대로다(재계산 금지 — 엔진 값 표시 드리프트 방지).
 *
 * 근거 인용은 양도일 연혁을 따른다 — 통칙은 2019.12.23.에 신설(구 95-0…2, 2024.3.15. 95-0…1로 번호 이동)이라 그 전 양도분에
 * 「기본통칙에 따라」라고 쓰지 않는다(재산세과-4375(2008.12.24.) 등 과세관청 해석이 같은 결론). 2021.1.1. 이후 양도분은 표2가
 * 2축이라 표1과 비교하는 표2의 단위(보유분+거주분 합 vs 보유분만)를 다룬 해석례를 확인하지 못했다는 사실을 병기한다.
 */
export function appurtenantLandLthdNoticeText(p: {
  landHoldingYears: number;
  houseHoldingYears: number;
  table1Rate: number;
  table2Rate: number;
  table1Applied: boolean;
  basis: AppurtenantLthdNoticeBasis;
}): string {
  const pct = (r: number) => Math.round(r * 100);
  const ground =
    p.basis.source === "circular"
      ? "소득세법 기본통칙 95-0…1에 따라"
      : "과세관청 해석(재산세과-4375, 2008.12.24. 등 — 주택보다 보유기간이 오래된 주택 부수토지는 표1과 표2 중 큰 공제율)에 따라";
  const text =
    `토지가 주택보다 먼저 취득돼 ${ground} 표1(토지 전체 보유기간 ${p.landHoldingYears}년 → ${pct(p.table1Rate)}%)과 ` +
    `표2(주택 부수토지로서의 보유기간 ${p.houseHoldingYears}년 → ${pct(p.table2Rate)}%) 중 큰 공제율 ` +
    `${pct(Math.max(p.table1Rate, p.table2Rate))}%(${p.table1Applied ? "표1" : "표2"})를 토지분에 적용했습니다.`;
  return p.basis.twoAxis
    ? `${text} 표2가 보유분과 거주분으로 나뉜 2021.1.1. 이후 양도분에서 표1과 비교하는 표2의 단위(보유분과 거주분의 합인지 보유분만인지)를 다룬 해석례는 확인하지 못해 확인이 필요합니다.`
    : text;
}
