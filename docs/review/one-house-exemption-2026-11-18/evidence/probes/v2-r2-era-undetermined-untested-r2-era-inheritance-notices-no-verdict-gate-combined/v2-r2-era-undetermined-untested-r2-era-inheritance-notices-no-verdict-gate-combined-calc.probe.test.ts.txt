/**
 * throwaway probe — 계산기 엔진(calculateTransferTax) 경로에서 같은 고지가 경고로 남는가 · 재상속/동거봉양 표시가 세액(중과 포함)을 바꾸는가.
 */
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates, makeMockRatesWithHouseEngine, makeHouseInfo } from "../tax-engine/_helpers/mock-rates";

const OUT =
  "<session>/scratchpad/probes/v2-r2-era-undetermined-untested-r2-era-inheritance-notices-no-verdict-gate-combined";
const D = (s: string) => new Date(s);

function reInput(reInherited: boolean, residence: number) {
  return baseTransferInput({
    transferPrice: 900_000_000,
    acquisitionPrice: 500_000_000,
    transferDate: D("2026-06-15"),
    acquisitionDate: D("2018-03-15"),
    residencePeriodMonths: residence,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    householdHousingCount: 2,
    sellingHouseId: "S",
    houses: [
      makeHouseInfo("S", { acquisitionDate: D("2018-03-15") }),
      makeHouseInfo("A", {
        acquisitionDate: D("1982-06-15"),
        isInherited: true,
        inheritedDate: D("2020-05-15"),
        decedentSameHouseholdAtInheritance: true,
        reInheritedFromSeparateHousehold: reInherited,
      }),
    ],
  });
}

function pcInput(parentalCare: boolean) {
  return baseTransferInput({
    transferPrice: 300_000_000,
    acquisitionPrice: 200_000_000,
    transferDate: D("2009-12-15"),
    acquisitionDate: D("2008-09-01"),
    residencePeriodMonths: 0,
    householdHousingCount: 2,
    sellingHouseId: "S",
    houses: [
      makeHouseInfo("S", { acquisitionDate: D("2008-09-01") }),
      makeHouseInfo("A", {
        acquisitionDate: D("1990-06-15"),
        isInherited: true,
        inheritedDate: D("2003-01-29"),
        decedentSameHouseholdAtInheritance: true,
        parentalCareMergeInheritedHouse: parentalCare,
      }),
    ],
  });
}

describe("probe calc", () => {
  it("observe", () => {
    const out: unknown[] = [];
    for (const [rname, rates] of [["default", makeMockRates()], ["noSuspension", makeMockRatesWithHouseEngine()]] as const) {
      for (const [k, inp] of [
        ["RE res0 reInherited=true", reInput(true, 0)],
        ["RE res0 reInherited=false", reInput(false, 0)],
        ["RE res24 reInherited=true", reInput(true, 24)],
        ["RE res24 reInherited=false", reInput(false, 24)],
        ["PC parentalCare=true", pcInput(true)],
        ["PC parentalCare=false", pcInput(false)],
      ] as const) {
        try {
          const r = calculateTransferTax(inp, rates);
          out.push({
            rates: rname,
            k,
            isExempt: r.isExempt,
            determinedTax: r.determinedTax,
            surcharge: (r as unknown as { surchargeType?: string }).surchargeType,
            surchargeRate: (r as unknown as { surchargeRate?: number }).surchargeRate,
            reNotice: (r.warnings ?? []).some((w) => w.includes("재상속")),
            pcNotice: (r.warnings ?? []).some((w) => w.includes("동거봉양 예외를 그 전 양도분")),
          });
        } catch (e) {
          out.push({ rates: rname, k, error: String(e).slice(0, 300) });
        }
      }
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/calc.json`, JSON.stringify(out, null, 2));
    expect(out.length).toBeGreaterThan(0);
  });
});
