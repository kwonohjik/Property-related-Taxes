/**
 * G6-1 — 「소득세법 시행령」 §155의3①1호 「1세대가 주택을 **취득한 후** 해당 주택에 대하여 임차인과 체결한 직전 임대차계약」.
 *
 * 상생임대차계약은 직전임대차계약 **뒤**에 체결되므로, 상생 체결일이 취득일 이전이거나 같은 날이면 1호가 성립할 수 없다.
 * 새 입력 없이 결정되는 이 부분만 막는다 — ⑧(판정 메뉴·부담부증여)이 차단하고 엔진 술어가 불성립으로 본다.
 *
 * 범위 밖(사용자 결정/새 입력 필요): 직전 계약이 「승계 계약」인지, 종료일 없는 상생임대의 양도기한(S11-4),
 * 「취득 후 N개월」 같은 더 강한 하한(갱신 계약 때문에 날짜만으로 단정할 수 없다).
 */
import { describe, it, expect } from "vitest";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import { calcForm, judge as judgeBase, runCalc } from "./_one-house-pr11-helpers";
import { qualifiesWinWinRental, winWinContractNotAfterAcquisition } from "@/lib/tax-engine/transfer-tax-exemption-residence-waivers";
import { winWinRentalFieldErrors } from "@/lib/calc/one-house-extra-facts-payload";
import { giftBurdenedWinWinError, giftBurdenedWinWinResidenceExempt } from "@/lib/calc/gift-burdened-one-house";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

const WW_ID = "155-3-1-win-win-rental";

/** 강남(조정) 취득 2022-06-15, 거주 0, 양도 2025-01-15, 9억 — 상생임대만이 거주요건을 면제하는 사안. */
const judge = (winWinContractDate: string, acq = "2022-06-15") =>
  judgeBase({
    acq, transfer: "2025-01-15",
    top: {
      winWinRentalSpecial: true,
      winWinRentalContractDate: winWinContractDate,
      winWinRentalIncreaseRatePct: "5",
      winWinRentalPriorLeaseMonths: "24",
      winWinRentalLeaseMonths: "24",
    },
  });

describe("G6-1 판정 메뉴 — 상생 체결일 ≤ 취득일이면 ⑧ 차단 + 엔진 불성립", () => {
  it("[WA-1] 체결 2022-01-10 < 취득 2022-06-15 → 상생 특례 미적용·과세, ⑧이 체결일 칸을 막는다", async () => {
    const o = await judge("2022-01-10");
    expect(o.status).toBe(200);
    expect(o.appliedExceptions).not.toContain(WW_ID);
    expect(o.isExempt).toBe(false);
    expect(o.validationErrors.some((e) => e.startsWith("winWinRentalContractDate:") && e.includes("제155조의3제1항제1호"))).toBe(true);
  });

  it("[WA-2] 경계 — 체결일 = 취득일 → 불성립, 취득일 다음 날 → 성립", async () => {
    const same = await judge("2022-06-15");
    expect(same.appliedExceptions).not.toContain(WW_ID);
    expect(same.isExempt).toBe(false);
    expect(same.validationErrors.length).toBeGreaterThan(0);
    const next = await judge("2022-06-16");
    expect(next.appliedExceptions).toContain(WW_ID);
    expect(next.isExempt).toBe(true);
    expect(next.validationErrors).toEqual([]);
  });

  it("[WA-3] 긍정 짝 — 취득 후 체결(2023-01-10)은 종전대로 성립하고 ⑧ 오류가 없다", async () => {
    const o = await judge("2023-01-10");
    expect(o.appliedExceptions).toContain(WW_ID);
    expect(o.isExempt).toBe(true);
    expect(o.validationErrors).toEqual([]);
  });
});

describe("G6-1 엔진 술어 / ⑧ leaf", () => {
  const house = (d: string) => ({
    winWinContractDate: new Date(d), increaseRatePct: 5, priorLeaseMonths: 24, winWinLeaseMonths: 24,
  });
  const q = (contract: string, acq: Date | undefined, sameHousehold = false) =>
    qualifiesWinWinRental({
      winWinRentalHouse: house(contract),
      transferDate: new Date("2025-01-15"),
      acquisitionDate: acq,
      decedentSameHouseholdBeforeInheritance: sameHousehold,
    });

  it("[WA-4] 술어 — 체결일이 취득일 이전·당일이면 false, 이후면 true, 취득일 미상이면 날짜 하한을 건너뛴다", () => {
    expect(q("2022-01-10", new Date("2022-06-15"))).toBe(false);
    expect(q("2022-06-15", new Date("2022-06-15"))).toBe(false);
    expect(q("2022-06-16", new Date("2022-06-15"))).toBe(true);
    expect(q("2022-01-10", undefined)).toBe(true);
  });

  it("[WA-5] 동일세대 상속은 판정하지 않는다(기준일을 정한 해석례 미확인 — 불리 적용 금지)", () => {
    expect(q("2022-01-10", new Date("2022-06-15"), true)).toBe(true);
    expect(winWinContractNotAfterAcquisition(new Date("2022-01-10"), new Date("2022-06-15"), { sameHouseholdInheritance: true })).toBe(false);
    expect(winWinContractNotAfterAcquisition(new Date("2022-01-10"), new Date("2022-06-15"))).toBe(true);
  });

  it("[WA-6] ⑧ leaf — 같은 규칙으로 막고, 동일세대 상속·취득일 미입력·선언 OFF는 막지 않는다", () => {
    const f = {
      winWinRentalSpecial: true, winWinRentalContractDate: "2022-01-10", winWinRentalIncreaseRatePct: "5",
      winWinRentalPriorLeaseMonths: "24", winWinRentalLeaseMonths: "24", winWinRentalLeaseEndDate: "",
    };
    expect(winWinRentalFieldErrors(f, "2025-01-15", { acquisitionDate: "2022-06-15" }).map((e) => e.field)).toEqual(["winWinRentalContractDate"]);
    expect(winWinRentalFieldErrors(f, "2025-01-15", { acquisitionDate: "2022-06-15", sameHouseholdInheritance: true })).toEqual([]);
    expect(winWinRentalFieldErrors(f, "2025-01-15", { acquisitionDate: "" })).toEqual([]);
    expect(winWinRentalFieldErrors(f, "2025-01-15")).toEqual([]);
    expect(winWinRentalFieldErrors({ ...f, winWinRentalSpecial: false }, "2025-01-15", { acquisitionDate: "2022-06-15" })).toEqual([]);
  });
});

describe("G6-1 증여세 부담부증여 경로(같은 leaf)", () => {
  const bgt = (acquisitionDate: string, over: Partial<BurdenedGiftTransferTaxInput> = {}) =>
    ({
      assetKind: "housing", isOneHousehold: true, acquisitionDate: new Date(acquisitionDate),
      winWinRentalSpecial: true, winWinRentalContractDate: "2022-01-10", winWinRentalIncreaseRatePct: "5",
      winWinRentalPriorLeaseMonths: "24", winWinRentalLeaseMonths: "24",
      ...over,
    }) as unknown as BurdenedGiftTransferTaxInput;

  it("[WA-7] 체결일 ≤ 취득일 → ⑧ 차단 + 거주요건 면제 불성립 / 취득 후 체결 → 통과·면제", () => {
    expect(giftBurdenedWinWinError(bgt("2022-06-15"), "2025-01-15")).toContain("제155조의3제1항제1호");
    expect(giftBurdenedWinWinResidenceExempt(bgt("2022-06-15"), "2025-01-15")).toBe(false);
    expect(giftBurdenedWinWinError(bgt("2021-12-30"), "2025-01-15")).toBeNull();
    expect(giftBurdenedWinWinResidenceExempt(bgt("2021-12-30"), "2025-01-15")).toBe(true);
  });
});

describe("G6-1 계산기 경로 — 판정 메뉴에서 넘겨받은 상생 사실(importedOneHouseFacts)도 같은 술어를 탄다", () => {
  const calc = (contract: string) =>
    runCalc(
      calcForm({
        acq: "2022-06-15",
        transfer: "2025-01-15",
        top: {
          importedOneHouseFacts: {
            ...oneHouseJudgmentExtraDefaults,
            winWinRentalSpecial: true, winWinRentalContractDate: contract, winWinRentalIncreaseRatePct: "5",
            winWinRentalPriorLeaseMonths: "24", winWinRentalLeaseMonths: "24",
          },
        },
      }),
    );

  it("[WA-8] 체결 2022-01-10 < 취득 2022-06-15 → 과세 / 긍정 짝 체결 2023-01-10 → 비과세 0원", async () => {
    const before = await calc("2022-01-10");
    expect(before.status).toBe(200);
    expect(before.isExempt).toBe(false);
    expect(before.totalTax).toBeGreaterThan(0);
    const after = await calc("2023-01-10");
    expect(after.isExempt).toBe(true);
    expect(after.totalTax).toBe(0);
  }, 60_000);
});
