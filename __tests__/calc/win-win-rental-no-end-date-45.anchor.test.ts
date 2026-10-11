/**
 * 결정 #45 (S11-4) — 상생임대주택(§155의3①) 임대기간 종료일이 없을 때의 양도기한.
 *
 * 2026-09-30 개정(대통령령 제36737호) 양도기한은 종료일이 언제든 2027-12-31 이후다
 * (종료일 ≤ 2026-12-31 → 고정 2027-12-31 / 그 뒤 → 「종료일부터 1년」이라 2027-12-31보다 늦다).
 * ⇒ 2026-10-01 ~ 2027-12-31 양도는 종료일이 없어도 성립한다(문언 산술). 2028-01-01 이후는 종료일이 결론을 가른다 —
 *    미입력이면 불성립 + 결론을 가를 때만 「확인 필요」(계산기는 막지 않는다).
 */
import { describe, it, expect } from "vitest";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import { calcForm, judge, runCalc } from "./_one-house-pr11-helpers";
import {
  isWinWinLeaseEndDateRequired,
  qualifiesWinWinRental,
} from "@/lib/tax-engine/transfer-tax-exemption-residence-waivers";
import { winWinRentalFieldErrors } from "@/lib/calc/one-house-extra-facts-payload";
import { giftBurdenedWinWinError, giftBurdenedWinWinResidenceExempt } from "@/lib/calc/gift-burdened-one-house";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

const WW_ID = "155-3-1-win-win-rental";
const NOTICE_ID = "155-3-win-win-lease-end-unverified";

const wwFacts = {
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2023-01-10",
  winWinRentalIncreaseRatePct: "5",
  winWinRentalPriorLeaseMonths: "24",
  winWinRentalLeaseMonths: "24",
};

const D = (s: string) => new Date(s);

describe("#45 엔진 술어 — 종료일 없는 상생임대의 양도기한 경계", () => {
  const q = (transfer: string, end?: string) =>
    qualifiesWinWinRental({
      winWinRentalHouse: {
        winWinContractDate: D("2023-01-10"), increaseRatePct: 5, priorLeaseMonths: 24, winWinLeaseMonths: 24,
        ...(end ? { winWinLeaseEndDate: D(end) } : {}),
      },
      transferDate: D(transfer),
      acquisitionDate: D("2022-06-15"),
    });

  it("[WE-1] 종료일 없음 — 2026-09-30·2026-10-01·2027-12-31 성립 / 2028-01-01 불성립 (경계 ±1일)", () => {
    expect(q("2026-09-30")).toBe(true);
    expect(q("2026-10-01")).toBe(true);
    expect(q("2027-12-31")).toBe(true);
    expect(q("2028-01-01")).toBe(false);
  });

  it("[WE-2] 긍정 짝 — 종료일을 넣으면 종전 기한 그대로(종료일 2027-03-10 → 2028-03-10까지, 다음 날 불성립)", () => {
    expect(q("2028-03-10", "2027-03-10")).toBe(true);
    expect(q("2028-03-11", "2027-03-10")).toBe(false);
    // 종료일이 있으면 2027-12-31 이내 양도는 종전과 같다
    expect(q("2027-12-31", "2023-12-20")).toBe(true);
    expect(q("2028-01-01", "2023-12-20")).toBe(false);
  });

  it("[WE-3] ⑧ 게이트 — 종료일 필수는 2028-01-01부터(시행일 전·2027-12-31까지는 불요, 양도일 미입력도 불요)", () => {
    expect(isWinWinLeaseEndDateRequired(D("2026-09-30"))).toBe(false);
    expect(isWinWinLeaseEndDateRequired(D("2026-10-01"))).toBe(false);
    expect(isWinWinLeaseEndDateRequired(D("2027-12-31"))).toBe(false);
    expect(isWinWinLeaseEndDateRequired(D("2028-01-01"))).toBe(true);
    expect(isWinWinLeaseEndDateRequired(undefined)).toBe(false);
  });

  it("[WE-4] ⑧ leaf — 같은 경계로 종료일 칸을 막는다", () => {
    const f = { ...wwFacts, winWinRentalLeaseEndDate: "" };
    expect(winWinRentalFieldErrors(f, "2027-12-31", { acquisitionDate: "2022-06-15" })).toEqual([]);
    expect(winWinRentalFieldErrors(f, "2028-01-01", { acquisitionDate: "2022-06-15" }).map((e) => e.field)).toEqual([
      "winWinRentalLeaseEndDate",
    ]);
    expect(winWinRentalFieldErrors({ ...f, winWinRentalLeaseEndDate: "2027-03-10" }, "2028-01-01", { acquisitionDate: "2022-06-15" })).toEqual([]);
  });

  it("[WE-5] 부담부증여 경로도 같은 경계 — 2027-12-31 증여는 종료일 없이 통과·면제 성립 / 2028-01-01은 차단·불성립", () => {
    const bgt = {
      assetKind: "housing", isOneHousehold: true, acquisitionDate: new Date("2022-06-15"),
      ...wwFacts,
    } as unknown as BurdenedGiftTransferTaxInput;
    expect(giftBurdenedWinWinError(bgt, "2027-12-31")).toBeNull();
    expect(giftBurdenedWinWinResidenceExempt(bgt, "2027-12-31")).toBe(true);
    expect(giftBurdenedWinWinError(bgt, "2028-01-01")).toContain("임대기간이 종료된 날");
    expect(giftBurdenedWinWinResidenceExempt(bgt, "2028-01-01")).toBe(false);
  });
});

describe("#45 판정 메뉴 — 강남(조정) 취득 2022-06-15 · 거주 0 · 9억, 상생임대만이 거주요건을 면제하는 사안", () => {
  const j = (transfer: string, end = "") =>
    judge({ acq: "2022-06-15", transfer, top: { ...wwFacts, winWinRentalLeaseEndDate: end } });

  it("[WJ-1] 2026-11-02·2027-12-31 양도 — 종료일 없이 비과세·⑧ 오류 0 (종전: 과세 + ⑧ 종료일 필수 오류)", async () => {
    for (const t of ["2026-11-02", "2027-12-31"]) {
      const o = await j(t);
      expect(o.status).toBe(200);
      expect(o.isExempt).toBe(true);
      expect(o.appliedExceptions).toContain(WW_ID);
      expect(o.validationErrors).toEqual([]);
      expect(o.undetermined).not.toContain(NOTICE_ID);
    }
  }, 60_000);

  it("[WJ-2] 2028-01-01 양도 — 종료일 없으면 과세 + ⑧ 종료일 필수 + 확인 필요 고지 / 종료일을 넣으면(2027-03-10) 비과세·고지 없음", async () => {
    const without = await j("2028-01-01");
    expect(without.isExempt).toBe(false);
    expect(without.appliedExceptions).not.toContain(WW_ID);
    expect(without.validationErrors.some((e) => e.startsWith("winWinRentalLeaseEndDate:"))).toBe(true);
    expect(without.undetermined).toContain(NOTICE_ID);
    const withEnd = await j("2028-01-01", "2027-03-10");
    expect(withEnd.isExempt).toBe(true);
    expect(withEnd.appliedExceptions).toContain(WW_ID);
    expect(withEnd.validationErrors).toEqual([]);
    expect(withEnd.undetermined).not.toContain(NOTICE_ID);
  }, 60_000);

  it("[WJ-3] 부정 짝 — 거주요건이 결론을 가르지 않으면(거주 24개월) 2028-01-01 종료일 없음이어도 고지하지 않는다", async () => {
    const o = await judge({
      acq: "2022-06-15", transfer: "2028-01-01", residence: "24",
      top: { ...wwFacts, winWinRentalLeaseEndDate: "" },
    });
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).not.toContain(NOTICE_ID);
  }, 60_000);
});

describe("#45 계산기 — 판정 메뉴에서 넘겨받은 상생 사실(종료일 없음)", () => {
  const calc = (transfer: string, over: { end?: string; residence?: string } = {}) =>
    runCalc(
      calcForm({
        acq: "2022-06-15",
        transfer,
        asset: over.residence ? { residencePeriodMonthsAsset: over.residence } : undefined,
        top: {
          importedOneHouseFacts: {
            ...oneHouseJudgmentExtraDefaults, ...wwFacts, winWinRentalLeaseEndDate: over.end ?? "",
          },
        },
      }),
    );

  it("[WC-1] 2026-11-02·2027-12-31 양도 — 비과세 0원 (종전: 과세, 판정 메뉴 결과와 어긋남)", async () => {
    for (const t of ["2026-11-02", "2027-12-31"]) {
      const r = await calc(t);
      expect(r.status).toBe(200);
      expect(r.isExempt).toBe(true);
      expect(r.totalTax).toBe(0);
      expect(r.warnings.some((w) => w.includes("임대기간이 종료된 날이 입력되지"))).toBe(false);
    }
  }, 60_000);

  it("[WC-2] 2028-01-01 양도 — 종전대로 과세 + 계산기는 막지 않고 확인 필요를 알린다", async () => {
    const r = await calc("2028-01-01");
    expect(r.status).toBe(200);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes("임대기간이 종료된 날이 입력되지") && w.includes("확인 필요"))).toBe(true);
  }, 60_000);

  it("[WC-3] 부정 짝 — 종료일이 있거나(2027-03-10 → 비과세) 거주 24개월이면 2028-01-01에도 고지가 없다", async () => {
    const withEnd = await calc("2028-01-01", { end: "2027-03-10" });
    expect(withEnd.isExempt).toBe(true);
    expect(withEnd.warnings.some((w) => w.includes("임대기간이 종료된 날이 입력되지"))).toBe(false);
    const resided = await calc("2028-01-01", { residence: "24" });
    expect(resided.isExempt).toBe(true);
    expect(resided.warnings.some((w) => w.includes("임대기간이 종료된 날이 입력되지"))).toBe(false);
  }, 60_000);
});
