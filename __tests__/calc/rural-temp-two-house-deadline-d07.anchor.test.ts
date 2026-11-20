/**
 * D-07 anchor — §155⑦3호 귀농주택 + 일반주택 + 신규 주택 3주택(D3 — §155①과 겹침)이 **귀농주택 5년 기한으로만** 떨어진 경우.
 *
 * 「소득세법 시행령」 §155⑦ 단서 「제3호의 주택에 대해서는 그 주택을 취득한 날부터 5년 이내에 일반주택을 양도하는 경우에 한정하여 적용한다」.
 * 종전에는 기한이 D3 주택 수 술어 안에 들어 있어, 기한만 넘긴 3주택에 「세대 주택 수가 3채입니다 — …(2주택)…」 한 줄만 나오고 기한 안내가 없었다.
 * 같은 날짜의 2주택 세대는 기한(`155-7-3ho-return-to-farm`)을 받는다. 판정 메뉴에서는 기한이 지난 농어촌 행이 신규 주택 후보에 남아
 * 일시적 2주택이 아예 도출되지 않았다.
 *
 * | # | 주장 |
 * |---|---|
 * | A | 귀농 기한만 지남(§155① 기한 안) → 귀농 기한 하나만 약속 · 「3채」 사유 없음(2주택처럼 사유 중복 없음) |
 * | B | §155① 처분기한이 더 이르고 둘 다 지남 → 더 이른 §155① 기한 하나만 약속 |
 * | C | §155① 1년 요건 미충족 → 기한으로 치유되지 않아 약속 없음 · 1년 사유 |
 * | D | 귀농 기한 말일에도 §154① 보유 2년 미달 → 약속 없음 · 말일 보유 사유 |
 * | F | 판정 메뉴 route — 기한 지난 귀농 행도 신규 주택 후보가 아니다 → 같은 약속(기준일이 기한 뒤면 「기한 경과」) · 기한 안 양도면 비과세 |
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { RETURN_TO_FARM_OK } from "../_helpers/rural-return-to-farm-facts";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const iso = (d?: Date) => d?.toISOString().slice(0, 10);
const COUNT_REASON = "세대 주택 수가 3채입니다";

/** 리뷰 D-07 시료 — 일반 2015-06-01 · 귀농 2020-06-10 · 신규 2024-09-01 · 양도 2026-06-15 · 비조정 */
function d3(o: { prev?: string; next?: string; transfer?: string } = {}): OneHouseJudgeInput {
  const prev = o.prev ?? "2015-06-01";
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 3,
    transferPrice: 900_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: D(prev),
    transferDate: D(o.transfer ?? "2026-06-15"),
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 0,
    temporaryTwoHouse: { previousAcquisitionDate: D(prev), newAcquisitionDate: D(o.next ?? "2024-09-01") },
    ruralHouse: {
      kind: "return_to_farm",
      ...RETURN_TO_FARM_OK,
      isOutsideCapitalEupMyeon: true,
      acquisitionDate: D("2020-06-10"),
      isHighPriceAtAcquisition: false,
      landAreaSqm: 300,
      wholeHouseholdMoved: true,
    } as TransferTaxInput["ruralHouse"],
  }) as OneHouseJudgeInput;
}
const judge = (i: OneHouseJudgeInput) => checkExemption(i, rules, D("2021-01-01"));
const allReasons = (r: ReturnType<typeof judge>) => r.unmetExceptions.flatMap((u) => u.reasons).join("\n");

describe("D-07 ⑦3호 D3 — 귀농 5년 기한으로만 떨어진 3주택", () => {
  it("반사실 — 귀농 기한 말일(2025-06-10)에 양도하면 비과세", () => {
    expect(judge(d3({ transfer: "2025-06-10" })).isExempt).toBe(true);
  });

  it("A 귀농 기한만 지남 → 귀농 기한 하나만 약속 · 「3채」 사유 없음", () => {
    const r = judge(d3());
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => [p.id, iso(p.deadline)])).toEqual([["155-7-3ho-return-to-farm", "2025-06-10"]]);
    // 2주택(PD-9)과 같다 — 기한은 pending이 날짜와 함께 말하고 불성립 사유에 중복하지 않는다.
    expect(r.unmetExceptions).toEqual([]);
  });

  it("B §155① 처분기한(신규 2022-03-01)이 더 이르고 둘 다 지남 → 더 이른 §155① 기한 하나만", () => {
    const r = judge(d3({ next: "2022-03-01" }));
    expect(r.isExempt).toBe(false);
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0].id).toBe("155-1-disposal-deadline");
    expect(iso(r.pending[0].deadline)! < "2025-06-10").toBe(true);
    expect(allReasons(r)).not.toContain(COUNT_REASON);
  });

  it("C §155① 1년 요건 미충족(종전 2024-01-01 · 신규 2024-06-01) → 약속 없음 · 1년 사유", () => {
    const r = judge(d3({ prev: "2024-01-01", next: "2024-06-01" }));
    expect(r.isExempt).toBe(false);
    expect(r.pending).toEqual([]);
    const reasons = allReasons(r);
    expect(reasons).not.toContain(COUNT_REASON);
    expect(reasons).toContain("1년이 지난 뒤");
  });

  it("D 귀농 기한 말일에도 보유 2년 미달(종전 2024-01-01 · 신규 2025-03-01) → 약속 없음 · 말일 보유 사유", () => {
    const r = judge(d3({ prev: "2024-01-01", next: "2025-03-01" }));
    expect(r.isExempt).toBe(false);
    expect(r.pending).toEqual([]);
    const reasons = allReasons(r);
    expect(reasons).not.toContain(COUNT_REASON);
    expect(reasons).toContain("말일(2025-06-10)이 지난 뒤 양도했습니다");
  });
});

function menu(transferDate: string, today = "2025-01-01"): RulingCase {
  return {
    id: "d07", docNo: "-", docDate: "-", basis: "current", today, summary: "d07", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate,
      contractTotalPrice: "900000000",
      asset: { assetKind: "housing", acquisitionDate: "2015-06-01" },
      houses: [
        {
          id: "rural",
          region: "non_capital",
          acquisitionDate: "2020-06-10",
          oneHouseRuralHouse: true,
          ruralHouseKind: "return_to_farm",
          ruralOutsideCapitalEupMyeon: true,
          ruralLandAreaSqm: "300",
          ruralWholeHouseholdMoved: true,
          ruralHighPriceAtAcquisition: false,
          ruralReturnedToFarmExitHouse: false,
          ruralFarmlandBasis: "ga",
          ruralFarmlandHolder: "self",
          ruralPriorReturnFarmExemption: "none",
          ruralGeneralHouseBeforeReturn: "yes",
        },
        { id: "new", region: "non_capital", acquisitionDate: "2024-09-01", acquisitionOrigin: "general" },
      ],
    } as unknown as RulingCase["form"],
  };
}

describe("F 판정 메뉴 route — 기한 지난 귀농 행도 신규 주택 후보가 아니다", () => {
  it("귀농 기한 안(2025-06-10) 양도 → 비과세 · ⑦·① 함께 근거", async () => {
    const o = await observeCase(menu("2025-06-10"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toEqual(expect.arrayContaining(["155-1-temporary-two-house"]));
  });

  it("귀농 기한 뒤(2026-06-15) 양도 → 과세 · 귀농 기한 약속 · 「3채」 사유 없음", async () => {
    const o = await observeCase(menu("2026-06-15"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.pending).toEqual(["155-7-3ho-return-to-farm"]);
    expect(Object.values(o.unmetReasons).flat().join("\n")).not.toContain(COUNT_REASON);
  });

  it("기준일(2026-06-16)이 귀농 기한 뒤면 같은 기한이 「기한 경과」 사유로 나온다 — 2주택과 같은 경로", async () => {
    const o = await observeCase(menu("2026-06-15", "2026-06-16"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.unmetExceptions).toEqual(["155-7-3ho-return-to-farm:deadline-lapsed"]);
    expect(o.unmetReasons["155-7-3ho-return-to-farm:deadline-lapsed"].join("\n")).toContain("2025-06-10");
  });
});
