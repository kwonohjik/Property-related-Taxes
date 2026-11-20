/**
 * PR-4 anchor (2026-11 리뷰) — 기한 약속·기간 사유의 정확성.
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-05 | 기한 말일 시점 거주를 양도(예정)일까지 센 개월로 판정 | 말일 현재 거주가 하한으로 확인되지 않으면 약속에 조건(확인 필요)을 붙인다 · 하한으로 충분하면 붙이지 않는다 · 합가 축도 같다 |
 * | D-19 | ⑧ pending이 주택 수 게이트만 봄 | 이미 주택 수에서 빠진 부득이 행에는 기한을 약속하지 않는다(정본 반사실) |
 * | D-23 | ⑥⑦⑧ 선언 행이 이미 빠졌는데 사유 0건 | 「한 주택은 한 번만」 사유 |
 * | D-70 | 겹친 3주택 역순 취득에 「1년이 지난 뒤」 문장 | 선후 사유로 말한다 |
 * | I-03 | 1단계 격자 | ⑦3호·⑧ 격자에서 「과세 ⇒ 사유·기한·보류 중 하나 이상」 · 「조건 없는 기한 ⇒ 그 날 양도하면 비과세」 |
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { RETURN_TO_FARM_OK } from "../../_helpers/rural-return-to-farm-facts";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const judge = (over: Partial<TransferTaxInput>) => checkExemption(baseTransferInput(over) as OneHouseJudgeInput, rules, D("2021-01-01"));
const reasons = (r: ReturnType<typeof judge>) => r.unmetExceptions.flatMap((u) => u.reasons).join("\n");
const NOTE = /이 날짜 현재 거주기간을 채웠는지는 확인할 수 없습니다\(확인 필요\)/;

const house = (id: string, acq: string, extra: Record<string, unknown> = {}) => ({
  id, acquisitionDate: D(acq), officialPrice: 300_000_000, region: "non_capital" as const, isInherited: false,
  isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, ...extra,
});

describe("D-05 기한 말일 현재 거주", () => {
  // 취득 당시 조정(거주 2년) 2023-01-02 · 신규 2024-06-03(비조정 → 3년) · 양도 예정 2027-12-01
  const base = (months: number): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2023-01-02"),
    transferDate: D("2027-12-01"),
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: months,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2023-01-02"),
      newAcquisitionDate: D("2024-06-03"),
      newHouseRegulatedAtAcquisition: false,
    },
  });
  it("거주 24개월(2025-12-01~ · 양도일까지 센 값) → 기한 약속에 말일 현재 거주 조건(확인 필요)", () => {
    const r = judge(base(24));
    const p = r.pending.find((x) => x.id === "155-1-disposal-deadline");
    expect(p).toBeDefined();
    expect(p!.deadlineNote ?? "").toMatch(NOTE);
    // 요건 검토표 처분기한 행도 같은 조건을 붙인다
    const row = r.requirementReview?.items.find((i) => i.id === "disposal-deadline");
    expect(row?.note ?? "").toMatch(NOTE);
  });
  it("긍정 짝 — 거주 32개월(2025-04-01~)이면 말일 현재 하한 26개월 → 조건 없이 약속", () => {
    const p = judge(base(32)).pending.find((x) => x.id === "155-1-disposal-deadline");
    expect(p).toBeDefined();
    expect(p!.deadlineNote ?? "").not.toMatch(NOTE);
  });
});

describe("D-19 ⑧ — 이미 주택 수에서 빠진 부득이 행에는 기한을 약속하지 않는다", () => {
  const base = (excluded: boolean): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2015-01-01"),
    transferDate: D("2027-12-01"),
    residencePeriodMonths: 0,
    unavoidableOutsideCapitalHouse: { houseId: "u", reason: "work", resolvedDate: D("2024-06-01") } as TransferTaxInput["unavoidableOutsideCapitalHouse"],
    ...(excluded ? { knownHouseExclusionHouseIds: ["u"] } : {}),
  });
  it("대조 — 빠지지 않은 행은 해소일 + 3년 기한을 약속하고 그 날 양도하면 비과세", () => {
    const r = judge(base(false));
    const p = r.pending.find((x) => x.id === "155-8-unavoidable-resolved");
    expect(p).toBeDefined();
    expect(judge({ ...base(false), transferDate: p!.deadline }).isExempt).toBe(true);
  });
  it("이미 빠진 행 → 약속 없음 · D-23 사유", () => {
    const r = judge(base(true));
    expect(r.pending.map((x) => x.id)).not.toContain("155-8-unavoidable-resolved");
    expect(reasons(r)).toContain("한 주택은 한 번만 반영합니다");
  });
});

describe("D-23 ⑥⑦ — 이미 빠진 선언 행 사유", () => {
  it("⑥ 문화유산 행이 이미 빠짐 → 사유", () => {
    const r = judge({ householdHousingCount: 2, culturalHeritageHouse: true, culturalHeritageHouseId: "a", knownHouseExclusionHouseIds: ["a"] });
    expect(r.isExempt).toBe(false);
    expect(reasons(r)).toContain("한 주택은 한 번만 반영합니다");
  });
  it("⑦ 농어촌 행이 이미 빠짐 → 사유", () => {
    const r = judge({
      householdHousingCount: 2,
      ruralHouse: { houseId: "r", kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 10 } as TransferTaxInput["ruralHouse"],
      knownHouseExclusionHouseIds: ["r"],
    });
    expect(r.isExempt).toBe(false);
    expect(reasons(r)).toContain("한 주택은 한 번만 반영합니다");
  });
});

describe("D-70 겹친 3주택 역순 취득 — 「1년이 지난 뒤」가 아니라 선후 사유", () => {
  it("⑦ D3 · 신규 주택을 종전주택보다 먼저 취득 → 1년 문장 없음 · 선후 사유", () => {
    const r = judge({
      householdHousingCount: 3,
      acquisitionDate: D("2019-06-01"),
      transferDate: D("2026-06-15"),
      temporaryTwoHouse: { previousAcquisitionDate: D("2019-06-01"), newAcquisitionDate: D("2018-09-01") },
      ruralHouse: {
        kind: "return_to_farm", ...RETURN_TO_FARM_OK, isOutsideCapitalEupMyeon: true, acquisitionDate: D("2022-01-10"),
        isHighPriceAtAcquisition: false, landAreaSqm: 300, wholeHouseholdMoved: true,
      } as TransferTaxInput["ruralHouse"],
    });
    expect(r.isExempt).toBe(false);
    const t = reasons(r);
    expect(t).not.toContain("1년이 지난 뒤");
    expect(t).toContain("먼저 취득했습니다");
  });
  it("합가 F-1 · 역순 취득 → 선후 사유", () => {
    const r = judge({
      householdHousingCount: 3,
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2026-08-01"),
      houses: [house("selling", "2015-01-01"), house("h2", "2012-01-01", { mergeOrigin: "counterpart_side" }), house("h3", "2014-02-01")] as TransferTaxInput["houses"],
      sellingHouseId: "selling",
      parentalCareMerge: { mergeDate: D("2022-01-01"), parentAge: "over_60" as const },
      isFirstTransferredInMerge: true,
      temporaryTwoHouse: { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D("2014-02-01") },
    });
    expect(r.isExempt).toBe(false);
    const t = reasons(r);
    expect(t).not.toContain("1년이 지난 뒤");
    expect(t).toContain("먼저 취득했습니다");
  });
});

describe("I-03 1단계 격자 — ⑦3호·⑧ 기한 축", () => {
  // 양도일·기한 기산일·주택 수·제외 여부를 바꿔 가며 두 불변식을 본다.
  const transfers = ["2025-03-01", "2026-06-15", "2028-06-15"];
  const starts = ["2019-06-10", "2021-06-10", "2023-06-10"];
  const counts = [2, 3];
  const cells: { name: string; input: Partial<TransferTaxInput> }[] = [];
  for (const t of transfers) for (const s of starts) for (const n of counts) for (const ex of [false, true]) {
    cells.push({
      name: `⑧ 해소 ${s} · 양도 ${t} · ${n}주택 · 제외 ${ex}`,
      input: {
        householdHousingCount: n, acquisitionDate: D("2015-01-01"), transferDate: D(t), residencePeriodMonths: 0,
        unavoidableOutsideCapitalHouse: { houseId: "u", reason: "work", resolvedDate: D(s) } as TransferTaxInput["unavoidableOutsideCapitalHouse"],
        ...(ex ? { knownHouseExclusionHouseIds: ["u"] } : {}),
      },
    });
    cells.push({
      name: `⑦3호 귀농 ${s} · 양도 ${t} · ${n}주택 · 제외 ${ex}`,
      input: {
        householdHousingCount: n, acquisitionDate: D("2015-01-01"), transferDate: D(t), residencePeriodMonths: 0,
        ruralHouse: {
          houseId: "r", kind: "return_to_farm", ...RETURN_TO_FARM_OK, isOutsideCapitalEupMyeon: true, acquisitionDate: D(s),
          isHighPriceAtAcquisition: false, landAreaSqm: 300, wholeHouseholdMoved: true,
        } as TransferTaxInput["ruralHouse"],
        ...(ex ? { knownHouseExclusionHouseIds: ["r"] } : {}),
      },
    });
  }
  it.each(cells)("$name", ({ input }) => {
    const r = judge(input);
    if (!r.isExempt && !r.isPartialExempt) {
      // 과세면 무엇이 막았는지 하나 이상 말한다
      expect(r.unmetExceptions.length + r.pending.length + r.undetermined.length).toBeGreaterThan(0);
    }
    for (const p of r.pending) {
      if (p.kind !== "transfer_by" || NOTE.test(p.deadlineNote ?? "")) continue;
      // 조건 없는 기한 약속은 지킬 수 있어야 한다 — 그 날 양도하면 비과세
      const atDeadline = judge({ ...input, transferDate: p.deadline });
      expect(atDeadline.isExempt || atDeadline.isPartialExempt, `${p.id}@${iso(p.deadline)}`).toBe(true);
    }
  });
});
