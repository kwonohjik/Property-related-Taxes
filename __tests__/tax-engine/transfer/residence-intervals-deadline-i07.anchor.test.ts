/**
 * 2026-11 리뷰 I-07(D-05 2단계) · 결정 Q-13 — 판정 메뉴 거주 구간을 엔진까지 전달해 기한 말일 현재 거주를 정확히 센다.
 *
 * D-05 1단계는 구간이 없어 「말일 현재 거주는 확인할 수 없음(확인 필요)」 조건을 붙였다. 구간이 오면 말일에서 자른 개월로 정확히 판정한다 —
 * 모자라면 약속하지 않고, 충분하면 조건 없이 약속한다(「계속 거주하는 경우」 같은 조건부 문구는 쓰지 않는다 — Q-13).
 * 구간 합이 입력 거주 개월과 다르면(다른 경로가 개월을 조정함) 구간을 믿지 않고 1단계 조건으로 돌아간다.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { residenceMonthsAsOf } from "@/lib/tax-engine/one-house/residence-as-of";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const judge = (over: Partial<TransferTaxInput>) => checkExemption(baseTransferInput(over) as OneHouseJudgeInput, rules, D("2026-11-18"));
const NOTE = /이 날짜 현재 거주기간을 채웠는지는 확인할 수 없습니다\(확인 필요\)/;

// 강남 2023-01-02 취득(조정 · 거주 2년) · 신규 2024-06-03(비조정 → 3년) · 양도 예정 2027-12-01 → 처분 기한 2027-06-03
const base = (moveIn: string, months: number, intervals = true): Partial<TransferTaxInput> => ({
  householdHousingCount: 2,
  acquisitionDate: D("2023-01-02"),
  transferDate: D("2027-12-01"),
  wasRegulatedAtAcquisition: true,
  residencePeriodMonths: months,
  ...(intervals ? { residenceIntervals: [{ start: D(moveIn), end: D("2027-11-30") }] } : {}),
  temporaryTwoHouse: { previousAcquisitionDate: D("2023-01-02"), newAcquisitionDate: D("2024-06-03"), newHouseRegulatedAtAcquisition: false },
});
const disposal = (r: ReturnType<typeof judge>) => r.pending.find((x) => x.id === "155-1-disposal-deadline");

describe("I-07 기한 말일 현재 거주 — 거주 구간이 있으면 정확히 센다", () => {
  it("leaf — 말일에서 자른 완성 개월(초일 산입)", () => {
    expect(residenceMonthsAsOf([{ start: D("2025-12-01"), end: D("2027-11-30") }], D("2027-06-03"))).toBe(18);
    expect(residenceMonthsAsOf([{ start: D("2025-04-01"), end: D("2027-11-30") }], D("2027-06-03"))).toBe(26);
    expect(residenceMonthsAsOf([{ start: D("2028-01-01"), end: D("2028-12-31") }], D("2027-06-03"))).toBe(0);
  });
  it("2025-12-01 입주(말일 현재 18개월) → 약속하지 않는다(종전: 확인 필요 조건을 단 약속)", () => {
    const r = judge(base("2025-12-01", 24));
    expect(disposal(r)).toBeUndefined();
  });
  it("2025-04-01 입주(말일 현재 26개월) → 조건 없이 약속하고, 그 날 양도하면 비과세", () => {
    const r = judge(base("2025-04-01", 32));
    const p = disposal(r);
    expect(p).toBeDefined();
    expect(p!.deadlineNote ?? "").not.toMatch(NOTE);
    const onDeadline = judge({
      ...base("2025-04-01", 26),
      transferDate: p!.deadline,
      residenceIntervals: [{ start: D("2025-04-01"), end: p!.deadline }],
    });
    expect(onDeadline.isExempt).toBe(true);
  });
  it("대조 — 구간이 없거나 구간 합이 입력 개월과 다르면 1단계 조건(확인 필요)", () => {
    expect(disposal(judge(base("2025-12-01", 24, false)))!.deadlineNote ?? "").toMatch(NOTE);
    // 2025-11-01~2027-11-30 = 25개월인데 입력은 24 — 구간을 믿지 않는다
    expect(disposal(judge(base("2025-11-01", 24)))!.deadlineNote ?? "").toMatch(NOTE);
  });
});

describe("I-25 · Q-26 비연속 거주 통산 셈법 — 결론을 가를 때만 확인 필요", () => {
  const DAY = 86_400_000;
  /** 2022-01-01부터 875일을 n개 구간으로 다음 날 이어 나눈다 */
  const split = (n: number) => {
    const out: { start: Date; end: Date }[] = [];
    const start = D("2022-01-01").getTime();
    const total = 875;
    for (let i = 0; i < n; i++) {
      const a = Math.floor((total * i) / n);
      const b = Math.floor((total * (i + 1)) / n) - 1;
      out.push({ start: new Date(start + a * DAY), end: new Date(start + b * DAY) });
    }
    return out;
  };
  const monthsOf = (iv: { start: Date; end: Date }[]) => iv.reduce((s, x) => s + residenceMonthsAsOf([x], x.end), 0);
  const run = (n: number) => {
    const iv = split(n);
    return judge({
      householdHousingCount: 1,
      acquisitionDate: D("2021-06-01"),
      transferDate: D("2025-06-01"),
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: monthsOf(iv),
      residenceIntervals: iv,
    });
  };
  const ID = "154-1-residence-interval-consolidation-unverified";
  it("같은 875일 — 1구간 28개월 비과세 · 다음 날 이어진 10구간은 구간별 내림 합 20개월 과세", () => {
    expect(monthsOf(split(1))).toBe(28);
    expect(monthsOf(split(10))).toBe(20);
    expect(run(1).isExempt).toBe(true);
    expect(run(10).isExempt).toBe(false);
  });
  it("10구간 과세는 날수로 이어 붙이면(28개월) 비과세라 확인 필요 · 비과세(1구간 · 6구간 24개월)엔 고지 없음", () => {
    expect(run(10).undetermined.map((u) => u.id)).toContain(ID);
    expect(run(1).undetermined.map((u) => u.id)).not.toContain(ID);
    expect(run(6).isExempt).toBe(true);
    expect(run(6).undetermined.map((u) => u.id)).not.toContain(ID);
  });
});
