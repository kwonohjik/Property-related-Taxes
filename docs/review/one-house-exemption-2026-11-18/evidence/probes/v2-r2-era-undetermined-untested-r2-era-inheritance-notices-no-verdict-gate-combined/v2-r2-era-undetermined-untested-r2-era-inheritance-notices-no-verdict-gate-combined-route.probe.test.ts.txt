/**
 * throwaway probe — 재상속 기준일(D17)·2010 전 동거봉양 예외 고지가 결론과 무관한 과세 판정에도 남는가(route 경로).
 */
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { observeCase, type RulingCase } from "../calc/one-house-rulings/harness";

const OUT =
  "<session>/scratchpad/probes/v2-r2-era-undetermined-untested-r2-era-inheritance-notices-no-verdict-gate-combined";

const RE_ID = "155-2-reinheritance-reference-date-unverified";
const PC_ID = "155-2-pre2010-parental-care-exception-unverified";

const reRow = (over: Record<string, unknown> = {}) => ({
  id: "A",
  region: "capital",
  acquisitionDate: "1982-06-15",
  isInherited: true,
  inheritedDate: "2020-05-15",
  isCoInherited: false,
  decedentSameHouseholdAtInheritance: true,
  reInheritedFromSeparateHousehold: true,
  ...over,
});
const pcRow = (over: Record<string, unknown> = {}) => ({
  id: "A",
  region: "non_capital",
  acquisitionDate: "1990-06-15",
  isInherited: true,
  inheritedDate: "2003-01-29",
  isCoInherited: false,
  decedentSameHouseholdAtInheritance: true,
  parentalCareMergeInheritedHouse: true,
  ...over,
});

const mk = (id: string, today: string, transferDate: string, asset: Record<string, unknown>, houses: Record<string, unknown>[], price = "400000000"): RulingCase =>
  ({
    id,
    docNo: "probe",
    docDate: "",
    basis: "current",
    today,
    summary: id,
    form: { isOneHousehold: true, transferDate, contractTotalPrice: price, asset, houses },
    bucket: "match",
  }) as unknown as RulingCase;

const cases: RulingCase[] = [
  // ── 재상속(D17) ──
  mk("RE-ctl exempt (P-E112-post2013 그대로)", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2016-03-15" }, [reRow()]),
  mk("RE-ctl exempt cf reInherited=false", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2016-03-15" }, [reRow({ reInheritedFromSeparateHousehold: false })]),
  mk("RE-1 gangnam 2018 res0 (taxed)", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2018-03-15", regionCode: "1168010100", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" }, [reRow()]),
  mk("RE-1 cf reInherited=false", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2018-03-15", regionCode: "1168010100", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" }, [reRow({ reInheritedFromSeparateHousehold: false })]),
  mk("RE-1 cf residence 24 (exempt?)", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2018-03-15", regionCode: "1168010100", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" }, [reRow()]),
  mk("RE-5 holding short transfer 2020-12 (taxed)", "2021-01-15", "2020-12-01", { assetKind: "housing", acquisitionDate: "2019-06-01", regionCode: "2711010100" }, [reRow()]),
  mk("RE-5 cf reInherited=false", "2021-01-15", "2020-12-01", { assetKind: "housing", acquisitionDate: "2019-06-01", regionCode: "2711010100" }, [reRow({ reInheritedFromSeparateHousehold: false })]),
  mk("RE-2 holding short 2025-03 non-reg (taxed)", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2025-03-15", regionCode: "2711010100" }, [reRow()]),
  mk("RE-2 cf reInherited=false", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2025-03-15", regionCode: "2711010100" }, [reRow({ reInheritedFromSeparateHousehold: false })]),
  mk("RE-3 high-value 15억 partial", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2016-03-15" }, [reRow()], "1500000000"),
  mk("RE-3 cf reInherited=false", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2016-03-15" }, [reRow({ reInheritedFromSeparateHousehold: false })], "1500000000"),
  // ── 2010.2.18. 전 동거봉양 예외 ──
  mk("PC-ctl exempt (P-T001-parental-care 그대로)", "2009-05-15", "2009-04-30", { assetKind: "housing", acquisitionDate: "2002-11-20", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" }, [pcRow()], "300000000"),
  mk("PC-ctl cf parentalCare=false", "2009-05-15", "2009-04-30", { assetKind: "housing", acquisitionDate: "2002-11-20", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" }, [pcRow({ parentalCareMergeInheritedHouse: false })], "300000000"),
  mk("PC-1 holding short (taxed)", "2010-01-15", "2009-12-15", { assetKind: "housing", acquisitionDate: "2008-09-01", regionCode: "2711010100" }, [pcRow()], "300000000"),
  mk("PC-1 cf parentalCare=false", "2010-01-15", "2009-12-15", { assetKind: "housing", acquisitionDate: "2008-09-01", regionCode: "2711010100" }, [pcRow({ parentalCareMergeInheritedHouse: false })], "300000000"),
  // 동거봉양 행이 다른 이유로 제외되지 않는 경우(순위 부적격) — 예외가 적용되지 않았는데도 고지가 나는가
  mk("PC-2 ranking disqualified (row not excluded?)", "2009-05-15", "2009-04-30", { assetKind: "housing", acquisitionDate: "2002-11-20", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" }, [pcRow({ isRankingDisqualifiedInheritedHouse: true })], "300000000"),
  // 3주택(상속 행 + 다른 일반 주택) — 상속 제외와 무관하게 과세
  mk("PC-3 plus another general house (taxed)", "2009-05-15", "2009-04-30", { assetKind: "housing", acquisitionDate: "2002-11-20", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" }, [pcRow(), { id: "B", region: "non_capital", acquisitionDate: "2005-01-01", isInherited: false, acquisitionOrigin: "general" }], "300000000"),
  mk("RE-4 plus another general house (taxed)", "2026-10-07", "2026-06-15", { assetKind: "housing", acquisitionDate: "2016-03-15" }, [reRow(), { id: "B", region: "non_capital", acquisitionDate: "2017-01-01", isInherited: false, acquisitionOrigin: "general" }]),
];

describe("probe", () => {
  it("observe", async () => {
    const out: unknown[] = [];
    for (const c of cases) {
      const o = await observeCase(c);
      out.push({
        k: c.id,
        status: o.status,
        validationErrors: o.validationErrors,
        isExempt: o.isExempt,
        isPartialExempt: o.isPartialExempt,
        und: o.undetermined,
        hasRE: o.undetermined.includes(RE_ID),
        hasPC: o.undetermined.includes(PC_ID),
        excluded: o.excludedHouses,
        unmet: o.unmetExceptions,
        error: o.error,
      });
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/route.json`, JSON.stringify(out, null, 2));
    expect(out.length).toBe(cases.length);
  });
});
