/**
 * anchor ⑦ — 신고서 양식(집계 모드) 열의 취득일: 증여분 열 = 당초 증여자 취득일 · 매입분 열 = 증여 등기접수일.
 * 폼 자산에는 취득일 칸이 없어(`acquisitionDate`가 비거나 증여일) 두 열이 같은 날짜·같은 보유기간으로 찍히던 자리다.
 * B 채택(카드 한 장)에서는 조각 날짜를 쓰면 안 된다 — 그 카드의 취득 사실은 B(증여 등기접수일 기산)다.
 */
import { describe, it, expect } from "vitest";
import { purchasedPartAcqDateOverride } from "@/components/calc/results/transfer/FilingFormTableDateHelpers";
import { SPLIT } from "./_helpers/carryover-debt-pieces-fixture";

const card = (propertyId: string, adopted: "A" | "B", split = SPLIT) =>
  ({ propertyId, carryoverTaxationDetail: { adoptedScenario: adopted, scenarioA: { purchasedPartSplit: split } } }) as never;

describe("purchasedPartAcqDateOverride", () => {
  const A = [card("primary", "A"), { propertyId: "primary__purchased" } as never];
  it("D-1 A 채택 · 증여분 열 → 당초 증여자 취득일", () => expect(purchasedPartAcqDateOverride(A, "primary")?.date).toBe("2000-06-01"));
  it("D-2 A 채택 · 매입분 열 → 증여 등기접수일 (각주 문구 포함)", () => {
    const o = purchasedPartAcqDateOverride(A, "primary__purchased");
    expect(o?.date).toBe("2023-06-01");
    expect(o?.note).toContain("채무 인수 부분");
  });
  it("D-3 B 채택(한 장) → 덮어쓰지 않는다", () => expect(purchasedPartAcqDateOverride([card("primary", "B")], "primary")).toBeUndefined());
  it("D-4 r = 1 — 매입분이 원 id 한 장 → 매입분 날짜", () => {
    const one = { ...SPLIT, gift: undefined, purchased: { ...SPLIT.purchased, propertyId: "primary" } };
    expect(purchasedPartAcqDateOverride([card("primary", "A", one)], "primary")?.date).toBe("2023-06-01");
  });
  it("D-5 echo 없는 카드 → undefined", () => expect(purchasedPartAcqDateOverride([{ propertyId: "x" } as never], "x")).toBeUndefined());
});
