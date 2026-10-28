/**
 * 토지만 본인 × 같은 세대 합가 — 거주기간은 합가일 이후만 통산한다
 * (계획서 `docs/02-design/features/land-only-merge-residence-period.plan.md` · Q-1 a ⑧ 차단 · Q-2 a 고지 · Q-3 a 입력 힌트 · 기준-2025-법규재산-0040).
 *
 * 보유기간은 이미 합가일부터인데(#2662) 거주기간은 합가 전 구간도 그대로 합산돼 ④가 96개월을 보내고 ⑧이 통과시켰다.
 * 시료: 주택 취득 2014-09-01 · 양도 2026-02-16 · 합가 2022-01-01 → 합가일~양도일 49개월(초일 산입: 2022-01-01~2025-12-31 = 48 + 2026-01 = 49).
 */
import { describe, expect, it } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { landOnlyMergeResidenceStart } from "@/lib/calc/self-owns-scope";
import { collectResidenceIntervalErrors, directResidenceMonthsOverflowError } from "@/lib/calc/residence-interval-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const mk = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: true,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1000000000",
    assets: [{
      ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2014-09-01", actualSalePrice: "1,000,000,000", fixedAcquisitionPrice: "400,000,000",
      selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2022-01-01",
      landAcquisitionDate: "2008-07-01", ...a,
    } as AssetForm],
  }) as TransferFormData;
const interval = (...periods: [string, string][]) => ({ residenceInputMode: "interval", residencePeriods: periods.map(([moveInDate, moveOutDate]) => ({ moveInDate, moveOutDate })) });
const direct = (months: number) => ({ residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: String(months) });
const residenceIssues = (a: Loose) => collectStepIssues(1, mk(a)).map((i) => i.message).filter((m) => m.includes("거주"));
const mergeIssues = (a: Loose) => residenceIssues(a).filter((m) => m.includes("세대 합가일"));

describe("⑧ 구간 입력 — 입주일이 합가일보다 빠르면 차단 (Q-1 a)", () => {
  it("🔑 C1 합가 전 4년을 포함한 구간(2018-01-01~2025-12-31): 합가일 오류 1건 · 문구에 합가일·0040 (수정 전 0건 · 96개월 전송)", () => {
    const m = mergeIssues(interval(["2018-01-01", "2025-12-31"]));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("세대 합가일(2022-01-01)");
    expect(m[0]).toContain("기준-2025-법규재산-0040");
  });

  it("🔑 C3 합가일을 가로지르는 구간(2021-06-01~2025-12-31)도 차단", () => {
    expect(mergeIssues(interval(["2021-06-01", "2025-12-31"])).length).toBe(1);
  });

  it("C2 합가일부터의 구간(2022-01-01~2025-12-31)은 통과 — 불변", () => {
    expect(residenceIssues(interval(["2022-01-01", "2025-12-31"]))).toEqual([]);
  });

  it("두 구간 중 합가 전인 구간만 지적한다(#1)", () => {
    const m = mergeIssues(interval(["2019-01-01", "2020-12-31"], ["2022-03-01", "2025-12-31"]));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("거주 구간 #1");
  });
});

describe("⑧ 직접 입력 — 합가일~양도일 개월 수를 넘으면 차단 (Q-1 a)", () => {
  it("🔑 C4 96개월은 차단(최대 49개월) · 49개월은 통과 · 50개월은 차단", () => {
    const over = mergeIssues(direct(96));
    expect(over.length).toBe(1);
    expect(over[0]).toContain("49개월");
    expect(over[0]).toContain("세대 합가일(2022-01-01)");
    expect(residenceIssues(direct(49))).toEqual([]);
    expect(mergeIssues(direct(50)).length).toBe(1);
  });
});

describe("합가가 거주 기준일이 아닌 조합 — 불변", () => {
  it("C5 처음부터 같은 세대(합가 안 함)는 취득일 기준 그대로 — 합가 전 구간·96개월 모두 통과", () => {
    // 합가일 문자열이 남아 있어도(stale) 합가 안 함이면 무시한다
    const base = { buildingOwnerHouseholdMerged: false };
    expect(residenceIssues({ ...base, ...interval(["2018-01-01", "2025-12-31"]) })).toEqual([]);
    expect(residenceIssues({ ...base, ...direct(96) })).toEqual([]);
  });

  it("C6 다른 세대는 이 규칙 밖 — 합가일 오류 없음", () => {
    const other = { buildingOwnerSameHousehold: false, buildingOwnerHouseholdMerged: undefined, buildingOwnerHouseholdMergeDate: undefined };
    expect(mergeIssues({ ...other, ...interval(["2018-01-01", "2025-12-31"]) })).toEqual([]);
  });

  it("C7 합가일이 취득일보다 이르면 기준일은 취득일 — 취득일 문구가 그대로 나온다", () => {
    const early = { buildingOwnerHouseholdMergeDate: "2010-01-01" };
    expect(residenceIssues({ ...early, ...interval(["2014-09-01", "2025-12-31"]) })).toEqual([]);
    const m = residenceIssues({ ...early, ...interval(["2012-01-01", "2025-12-31"]) });
    expect(m.length).toBe(1);
    expect(m[0]).toContain("취득일(2014-09-01)");
    expect(m[0]).not.toContain("세대 합가일");
  });

  it("C8 합가를 골랐는데 합가일이 비면 거주 쪽은 합가일 오류를 내지 않는다(합가일 필수 오류가 먼저)", () => {
    expect(mergeIssues({ buildingOwnerHouseholdMergeDate: "", ...interval(["2018-01-01", "2025-12-31"]) })).toEqual([]);
  });

  it("건물 자산·토지·건물 모두 본인은 해당 없음", () => {
    expect(mergeIssues({ selfOwns: "both", ...interval(["2018-01-01", "2025-12-31"]) })).toEqual([]);
  });
});

describe("D-1 landOnlyMergeResidenceStart — 엔진 `landOnlyHouseholdMergeDate`와 같은 조건", () => {
  const f = (o: Loose) => landOnlyMergeResidenceStart({ ...(mk({}).assets[0] as Loose), ...o } as AssetForm);
  it("합가한 토지만 본인 주택만 합가일, 그 밖은 undefined", () => {
    expect(f({})).toBe("2022-01-01");
    expect(f({ buildingOwnerHouseholdMerged: false })).toBeUndefined();
    expect(f({ buildingOwnerHouseholdMerged: undefined })).toBeUndefined();
    expect(f({ buildingOwnerSameHousehold: false })).toBeUndefined();
    expect(f({ buildingOwnerHouseholdMergeDate: "" })).toBeUndefined();
    expect(f({ selfOwns: "both" })).toBeUndefined();
    expect(f({ assetKind: "building" })).toBeUndefined();
  });
});

describe("leaf 문구 — 기준일 종류", () => {
  it("startKind 미지정은 취득일 문구(종전)", () => {
    const e = collectResidenceIntervalErrors({ periods: [{ moveInDate: "2012-01-01", moveOutDate: "2013-01-01" }], acquisitionDate: "2014-09-01", transferDate: "2026-02-16" });
    expect(e[0]).toContain("취득일(2014-09-01)");
    expect(directResidenceMonthsOverflowError({ months: 999, acquisitionDate: "2014-09-01", transferDate: "2026-02-16", field: "residencePeriodMonthsAsset" })).toContain("취득일(2014-09-01)");
  });
});
