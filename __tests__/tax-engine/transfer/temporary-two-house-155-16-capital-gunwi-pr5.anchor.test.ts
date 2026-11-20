/**
 * PR-5 anchor (2026-11 리뷰) — 「소득세법 시행령」 §155⑯ 지역 요건.
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-08 | 「(수도권에 1주택을 소유한 경우에 한정한다)」 미검사 | 종전 주택 코드가 수도권 밖이면 5년 기한·1년 면제 불성립 · 수도권이면 성립 · 코드가 없으면 자기선언 |
 * | D-54 | 연접 판정이 현행 행정구역(군위 = 대구)만 씀 | 양도일이 편입(2023.7.1.) 전이면 대구↔구미는 연접이 아니다 · 편입 뒤 양도는 연접이고 신규 취득일 기준이면 결론이 갈려 확인 필요 |
 *
 * 법령: 「경상북도와 대구광역시 간 관할구역 변경에 관한 법률」 부칙 제1조(2023.7.1. 시행)·제5조②(2023.12.31.까지 규정이 다르면 군위를 경북으로 봄)
 * — KoreanLaw MST 247229 실독(2026-11-20). 기준일은 양도일 기본 + 독법이 갈리면 확인 필요(결정 Q-21).
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { classifyRelocationRegion } from "@/lib/geo/relocation-region-unit";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const judge = (over: Partial<TransferTaxInput>) => checkExemption(baseTransferInput(over) as OneHouseJudgeInput, rules, D("2021-01-01"));

const DAEGU_DONG = "2714000000";
const SUWON_YEONGTONG = "4111710300";
const GUMI = "4719000000";

describe("D-08 ⑯ 「수도권에 1주택을 소유한 경우에 한정」", () => {
  // 종전 2019-01-01 · 신규 2022-03-02 · 양도 2026-06-01(3년 초과 5년 이내) · ⑯ 선언(소재지 코드 없음 — 자기선언)
  const five = (regionCode?: string): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2019-01-01"),
    transferDate: D("2026-06-01"),
    ...(regionCode ? { regionCode } : {}),
    temporaryTwoHouse: { previousAcquisitionDate: D("2019-01-01"), newAcquisitionDate: D("2022-03-02"), publicInstitutionRelocation: true },
  });
  it("종전 주택 대구 동구 → 5년 기한 불성립 · 과세", () => {
    expect(judge(five(DAEGU_DONG)).isExempt).toBe(false);
  });
  it("대조 — 종전 주택 수원 영통 → 5년 기한 · 비과세", () => {
    expect(judge(five(SUWON_YEONGTONG)).isExempt).toBe(true);
  });
  it("대조 — 종전 주택 코드 없음 → 자기선언 유지 · 비과세(W-2)", () => {
    expect(judge(five()).isExempt).toBe(true);
  });

  // 1년 면제 축 — 종전 2021-08-01 → 신규 2022-03-02(1년 미만) · 양도 2023-09-01
  const oneYear = (regionCode: string): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2021-08-01"),
    transferDate: D("2023-09-01"),
    regionCode,
    temporaryTwoHouse: { previousAcquisitionDate: D("2021-08-01"), newAcquisitionDate: D("2022-03-02"), publicInstitutionRelocation: true },
  });
  it("1년 면제 — 종전 대구 동구면 면제되지 않아 과세 · 수원 영통이면 비과세", () => {
    expect(judge(oneYear(DAEGU_DONG)).isExempt).toBe(false);
    expect(judge(oneYear(SUWON_YEONGTONG)).isExempt).toBe(true);
  });
});

describe("D-54 군위 편입(2023.7.1.) 전후의 연접", () => {
  it("단위 판정 — 편입 전 기준일이면 대구↔구미 연접 아님 · 편입 뒤(또는 기준일 생략)면 연접", () => {
    expect(classifyRelocationRegion(DAEGU_DONG, GUMI, getAdjacentSigunguCodes, D("2022-06-01"))).toBe("not_adjacent");
    expect(classifyRelocationRegion(DAEGU_DONG, GUMI, getAdjacentSigunguCodes, D("2024-06-01"))).toBe("adjacent");
    expect(classifyRelocationRegion(DAEGU_DONG, GUMI, getAdjacentSigunguCodes)).toBe("adjacent");
  });

  // 종전 수원(수도권) 2015-01-01 · 이전 기관 대구 · 신규 구미
  const relocate = (newAcq: string, transfer: string): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2015-01-01"),
    transferDate: D(transfer),
    regionCode: SUWON_YEONGTONG,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2015-01-01"),
      newAcquisitionDate: D(newAcq),
      publicInstitutionRelocation: true,
      relocatedSigunguCode: DAEGU_DONG,
      newHouseSigunguCode: GUMI,
    },
  });
  it("편입 전 양도(신규 2019-01-02 · 양도 2022-06-01 — 3년 초과) → 연접 아님 · 과세 · 고지 없음(두 기준일 모두 편입 전)", () => {
    const r = judge(relocate("2019-01-02", "2022-06-01"));
    expect(r.isExempt).toBe(false);
    expect(r.undetermined.map((u) => u.id)).not.toContain("155-16-gunwi-boundary-era");
  });
  it("편입 뒤 양도(신규 2021-01-04 · 양도 2024-06-03) → 양도일 기준 연접 · 비과세 · 신규 취득일 기준이면 갈려 확인 필요", () => {
    const r = judge(relocate("2021-01-04", "2024-06-03"));
    expect(r.isExempt).toBe(true);
    expect(r.undetermined.map((u) => u.id)).toContain("155-16-gunwi-boundary-era");
  });
});
