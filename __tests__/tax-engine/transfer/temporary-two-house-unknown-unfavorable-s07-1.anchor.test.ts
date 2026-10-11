/**
 * anchor — #30(S07-1) · 「소득세법 시행령」 §155①2호 「모름」 처리 — 불성립 + 결론을 가를 때만 확인 필요
 *
 * 2026-10-04 원칙: 모르는 사실에 기대는 유리한 요건은 불성립으로 계산하고, 그 사실이 **결론을 가를 때만** 확인 필요를 고지한다.
 *
 * | 사실 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 2019-12-17 체제 가목 전입일 미입력 | 비과세 + 판정 보류 고지 | 가목 불성립 → 과세 + (결론이 갈릴 때만) 확인 필요 |
 * | 신규 취득 당시 두 주택의 조정 여부 미입력 | 양도일 기준 양도주택으로 대신 판정(법문에 없음) | 두 주택 모두 조정으로 읽은 불성립 독법 + (결론이 갈릴 때만) 확인 필요 |
 *
 * 법문(MST 218373 §155①2호 가목·나목, 242735 §155①2호): 「다음 각 목의 요건을 모두 충족한 경우」 — 가목(1년 내 세대전원 전입)은 적극 요건이고,
 * 조정 여부는 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」으로 신규 취득일 기준이다.
 * 조심 2025인3872는 전입하지 않고 비과세로 신고한 세대의 경정을 유지했다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { resolveDeemedOneHouseBy155 } from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { resolveRegulatedAtNewAcquisition } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const rules = parseRatesFromMap(mockRates).oneHouseSpecialRules;
const d = (s: string) => new Date(s);
type TT = NonNullable<TransferTaxInput["temporaryTwoHouse"]>;

const MOVE_IN_ID = "155-1-move-in-requirement-unverified";
const REG_ID = "155-1-regulated-at-new-acquisition-unverified";

/** 종전 2015-01-01 취득(당시 미지정 — 거주요건 없음) · 2주택 */
function tt(newAcq: string, transfer: string, extra: Partial<TT> = {}, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    householdHousingCount: 2,
    acquisitionDate: d("2015-01-01"),
    transferDate: d(transfer),
    residencePeriodMonths: 0,
    temporaryTwoHouse: { previousAcquisitionDate: d("2015-01-01"), newAcquisitionDate: d(newAcq), ...extra },
    ...over,
  });
}
const BOTH: Partial<TT> = { previousHouseRegulatedAtNewAcquisition: true, newHouseRegulatedAtAcquisition: true };
const calc = (i: TransferTaxInput) => calculateTransferTax(i, mockRates);
const judge = (i: TransferTaxInput) => checkExemption(i as OneHouseJudgeInput, rules, d("2026-09-26"));
const ids = (i: TransferTaxInput) => judge(i).undetermined.map((u) => u.id);

describe("#30 가목 전입일 미입력 — 불성립 + 결론이 갈릴 때만 확인 필요", () => {
  // 신규 2020-06-01(조정→조정 · 2019-12-17 이후) · 양도 2021-03-01 — 1년 기한(2021-06-01) 안
  it("M1 ★ 전입일 미입력 → 과세 + 확인 필요 (종전 비과세 + 판정 보류)", () => {
    const i = tt("2020-06-01", "2021-03-01", BOTH);
    const r = calc(i);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(45_990_000); // 전입일을 늦게 입력한 세대(MOVEIN-LATE)와 같은 세액 — 가목 불성립
    expect(ids(i)).toContain(MOVE_IN_ID);
    expect(calc(i).warnings?.some((w) => w.includes("세대전원 전입일이 입력되지 않아"))).toBe(true);
  });

  it("M1 긍정 짝 — 전입 2020-07-01(1년 안) 입력 → 비과세 · 고지 없음", () => {
    const i = tt("2020-06-01", "2021-03-01", { ...BOTH, wholeHouseholdMoveInDate: d("2020-07-01") });
    expect(calc(i).isExempt).toBe(true);
    expect(ids(i)).not.toContain(MOVE_IN_ID);
  });

  it("M2 결론이 같으면 고지하지 않는다 — 처분기한(1년)을 이미 넘긴 양도(2021-08-01)는 전입일과 무관하게 과세", () => {
    const i = tt("2020-06-01", "2021-08-01", BOTH);
    expect(calc(i).isExempt).toBe(false);
    expect(ids(i)).not.toContain(MOVE_IN_ID);
  });

  it("M3 검토표 전입 행은 「미충족 + 확인 필요」다 (「미확인」이 아니다)", () => {
    const row = judge(tt("2020-06-01", "2021-03-01", BOTH)).requirementReview?.items.find((x) => x.id === "move-in");
    expect(row?.status).toBe("unmet");
    expect(row?.note).toContain("확인 필요");
  });

  it("M4 중과 배제(15호)·카드·계산이 같은 판정을 쓴다 — 의제가 서지 않는다", () => {
    const miss = tt("2020-06-01", "2021-03-01", BOTH);
    const have = tt("2020-06-01", "2021-03-01", { ...BOTH, wholeHouseholdMoveInDate: d("2020-07-01") });
    expect(resolveDeemedOneHouseBy155(miss as never, rules)).toBeUndefined();
    expect(resolveDeemedOneHouseBy155(have as never, rules)).toBe("temporary_two_house");
  });
});

describe("#30 신규 취득 당시 조정 여부 미입력 — 두 주택 모두 조정 독법(불성립) + 결론이 갈릴 때만 확인 필요", () => {
  it("R1 ★ 미입력 → 보수 독법(조정→조정 1년)으로 계산 — 양도일 기준 양도주택(isRegulatedArea)이 아니다", () => {
    const off = tt("2020-06-01", "2021-08-01", {}, { isRegulatedArea: false });
    const on = tt("2020-06-01", "2021-08-01", {}, { isRegulatedArea: true });
    // 어느 쪽이든 같은 독법 — 법문에 없는 대리 지표가 결론을 가르지 않는다.
    expect(resolveRegulatedAtNewAcquisition(off)).toMatchObject({ bothRegulated: true, determined: false });
    expect(resolveRegulatedAtNewAcquisition(on)).toMatchObject({ bothRegulated: true, determined: false });
    expect(calc(off).isExempt).toBe(false); // 종전: isRegulatedArea=false면 3년 독법으로 비과세
    expect(calc(on).isExempt).toBe(false);
    // 세액 차이는 양도 당시 조정지역에 따른 다주택 중과(별개 축)일 뿐, 비과세 판정은 같다.
    expect(calc(off).determinedTax).toBe(45_990_000);
    expect(ids(off)).toContain(REG_ID);
  });

  it("R1 긍정 짝 — 입력하면(신규 비조정 선언) 3년 독법으로 비과세 · 고지 없음", () => {
    const i = tt("2020-06-01", "2021-08-01", { previousHouseRegulatedAtNewAcquisition: true, newHouseRegulatedAtAcquisition: false });
    expect(calc(i).isExempt).toBe(true);
    expect(ids(i)).not.toContain(REG_ID);
  });

  it("R2 결론이 같으면 고지하지 않는다 — 두 독법 모두 비과세(양도 2021-03-01 · 전입 입력)", () => {
    const i = tt("2020-06-01", "2021-03-01", { wholeHouseholdMoveInDate: d("2020-07-01") });
    expect(calc(i).isExempt).toBe(true);
    expect(ids(i)).not.toContain(REG_ID);
  });

  it("R3 결론이 같으면 고지하지 않는다 — 두 독법 모두 과세(양도 2024-01-01: 3년도 지났다)", () => {
    const i = tt("2020-06-01", "2024-01-01");
    expect(calc(i).isExempt).toBe(false);
    expect(ids(i)).not.toContain(REG_ID);
  });

  it("R4 기한이 갈리지 않는 양도 시기(2023.1.12. 이후)는 조정 여부와 무관 — 비과세 · 고지 없음", () => {
    const i = tt("2021-06-01", "2023-06-01");
    expect(calc(i).isExempt).toBe(true);
    expect(ids(i)).not.toContain(REG_ID);
  });
});

describe("#30 형제 경로 — 3주택 겹침(⑦ 농어촌)에도 같은 규칙과 고지", () => {
  const rural = {
    kind: "return_to_farm" as const,
    isOutsideCapitalEupMyeon: true,
    acquisitionDate: d("2019-01-10"),
    isHighPriceAtAcquisition: false,
    landAreaSqm: 300,
    wholeHouseholdMoved: true,
    // ⑩4호·⑪·귀농 전 취득 일반주택 사실(결정 #44) — 답이 없으면 귀농주택이 불성립해 이 시험이 보려는 #30 축에 닿지 못한다.
    farmlandBasis: "ga" as const,
    farmlandHolder: "self" as const,
    priorReturnFarmExemption: "none" as const,
    generalHouseAcquiredBeforeReturn: "yes" as const,
  };
  const withRural = (extra: Partial<TT>, transfer = "2021-03-01") =>
    tt("2020-06-01", transfer, extra, { householdHousingCount: 3, ruralHouse: rural });

  it("O1 ★ 농어촌 겹침 3주택 + 전입일 미입력 → 과세 + 확인 필요 (종전: 고지 없이 비과세)", () => {
    const i = withRural(BOTH);
    expect(calc(i).isExempt).toBe(false);
    expect(ids(i)).toContain(MOVE_IN_ID);
  });

  it("O1 긍정 짝 — 전입일 입력 → 비과세", () => {
    expect(calc(withRural({ ...BOTH, wholeHouseholdMoveInDate: d("2020-07-01") })).isExempt).toBe(true);
  });

  it("O2 농어촌 겹침 + 조정 여부 미입력 + 결론이 갈리는 양도(2021-08-01) → 과세 + 확인 필요", () => {
    const i = withRural({}, "2021-08-01");
    expect(calc(i).isExempt).toBe(false);
    expect(ids(i)).toContain(REG_ID);
  });
});
