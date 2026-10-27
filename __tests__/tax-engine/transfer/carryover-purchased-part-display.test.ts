/**
 * 이월과세 × 당초 증여 채무 부분(매입분) — 표시 문장 정본(순수 view) 단위 anchor. UI 설계서 §7.2.
 * 값은 전부 엔진 echo다 — view는 새로 계산하지 않는다(표시 드리프트 방지).
 */
import { describe, it, expect } from "vitest";
import { carryoverPurchasedPartView, CARRYOVER_PURCHASED_PART_METHOD_NOTICE } from "@/lib/tax-engine/transfer-tax-carryover-purchased-part-display";
import { SPLIT, PURCHASED_PIECE } from "../../components/_helpers/carryover-debt-pieces-fixture";

const rowOf = (v: ReturnType<typeof carryoverPurchasedPartView>, kind: "gift" | "purchased", key: string) => (kind === "gift" ? v.gift : v.purchased)?.rows.find((r) => r.key === key);

describe("carryoverPurchasedPartView", () => {
  const v = carryoverPurchasedPartView(SPLIT);
  it("V-1 조각 제목·행 값·라벨 괄호(기산 근거)", () => {
    expect(v.gift?.title).toBe("증여분 (당초 증여자 기준)");
    expect(v.purchased.title).toBe("매입분 (채무 인수 부분)");
    expect(rowOf(v, "gift", "transfer-price")).toMatchObject({ label: "양도가액 [양도가액 × 증여분 몫]", value: "900,000,000" });
    expect(rowOf(v, "gift", "acquisition-price")).toMatchObject({ label: "취득가액 [당초 증여자 취득가 × 증여분 몫]", value: "60,000,000" });
    expect(rowOf(v, "gift", "acquisition-date")?.label).toBe("취득일 [당초 증여자 취득일]");
    expect(rowOf(v, "purchased", "transfer-price")?.label).toBe("양도가액 [양도가액 − 증여분 양도가액]");
    expect(rowOf(v, "purchased", "acquisition-price")).toMatchObject({ label: "취득가액 [당초 증여 때 인수한 채무]", value: "400,000,000" });
    expect(rowOf(v, "purchased", "acquisition-date")).toMatchObject({ label: "취득일 [증여 등기접수일]", value: "2023-06-01" });
    expect(rowOf(v, "purchased", "holding-years")?.label).toBe("보유기간 [증여 등기접수일 기산]");
  });
  it("V-2 산식 줄 — 분수 분자·분모에 라벨 붙은 숫자", () => {
    const line = v.formulaLines[0];
    expect(line.lead).toBe("증여분 양도가액 = 양도가액 1,500,000,000 ×");
    expect(line.frac).toEqual({ top: "증여 당시 평가액 1,000,000,000 − 인수한 채무 400,000,000", bottom: "증여 당시 평가액 1,000,000,000" });
    expect(line.result).toBe("900,000,000");
    expect(v.formulaLines.map((l) => l.lead)).toContain("매입분 양도가액 = 양도가액 1,500,000,000 − 증여분 양도가액 900,000,000");
  });
  it("V-3 단기(2년 미만)만 세율 행 · 단기 보유 세율", () => {
    expect(rowOf(v, "purchased", "rate")).toBeUndefined();
    const s = carryoverPurchasedPartView({ ...SPLIT, purchased: { ...PURCHASED_PIECE, holdingPeriodYears: 0, appliedRate: 0.7 } });
    expect(rowOf(s, "purchased", "rate")?.value).toBe("단기 보유 세율 70%");
  });
  it("V-4 r = 1 → gift 없음 · 양도가액 라벨은 전액 · 안내 문장", () => {
    const one = carryoverPurchasedPartView({ ...SPLIT, gift: undefined, debtAmount: 1_000_000_000 });
    expect(one.gift).toBeNull();
    expect(one.giftNone).toContain("증여분 없음");
    expect(rowOf(one, "purchased", "transfer-price")?.label).toBe("양도가액 [양도가액 전액]");
  });
  it("V-5 방법 고지 상수 — 법령에 정함 없음 · 확인 필요 · 유불리 표현 없음", () => {
    expect(CARRYOVER_PURCHASED_PART_METHOD_NOTICE).toContain("법령에 정해져 있지 않아");
    expect(CARRYOVER_PURCHASED_PART_METHOD_NOTICE).toContain("확인 필요");
    expect(CARRYOVER_PURCHASED_PART_METHOD_NOTICE).not.toMatch(/유리|불리|절감/);
  });
});
