/**
 * anchor — `withSameDayRightsHeldOnItems` (코드 리뷰 결정 #1, 일괄양도 반사실 목록).
 *
 * 같은 날 권리를 세대 보유 권리에 합칠 때 어느 item이 바뀌는가:
 *  - 같은 날 권리 목록을 가진 주 자산 item: 보유 권리·입주권 수가 함께 바뀐다.
 *  - 주 자산 입력과 같은 `presaleRights` 참조를 상속받은 컴패니언·겸용 파트 item: 보유 권리 목록만 바뀐다.
 *  - 그 밖의 item(다른 목록을 가진 것): 그대로다.
 * 주 자산이 주택이 아닌데 컴패니언 주택이 §89②를 받는 경우처럼 컴패니언 쪽만 갈리는 일괄양도를 위한 안전망이다.
 */
import { describe, it, expect } from "vitest";
import { withSameDayRightsHeldOnItems } from "@/lib/tax-engine/one-house/same-day-right";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";

const held = { id: "r1", type: "redevelopment_right", acquisitionDate: new Date("2025-03-01"), region: "capital" };
const sameDay = { id: "r2", type: "redevelopment_right", acquisitionDate: new Date("2026-06-01"), region: "capital" };
const other = { id: "x", type: "presale_right", acquisitionDate: new Date("2020-01-01"), region: "capital" };

const heldList = [held] as unknown as TransferTaxInput["presaleRights"];
const sameDayList = [sameDay] as unknown as NonNullable<TransferTaxInput["sameDayAcquiredPresaleRights"]>;
const otherList = [other] as unknown as TransferTaxInput["presaleRights"];

const input = { presaleRights: heldList, householdRightCount: 1, sameDayAcquiredPresaleRights: sameDayList } as TransferTaxInput;
const primary = { propertyId: "primary", ...input } as unknown as TransferTaxItemInput;
const companion = { propertyId: "c1", presaleRights: heldList } as unknown as TransferTaxItemInput;
const unrelated = { propertyId: "c2", presaleRights: otherList } as unknown as TransferTaxItemInput;

describe("withSameDayRightsHeldOnItems", () => {
  const out = withSameDayRightsHeldOnItems(input, [primary, companion, unrelated]);

  it("주 자산 — 보유 권리에 같은 날 권리가 합쳐지고 입주권 수가 늘며 같은 날 목록은 비운다", () => {
    expect(out[0].presaleRights).toEqual([held, sameDay]);
    expect(out[0].householdRightCount).toBe(2);
    expect(out[0].sameDayAcquiredPresaleRights).toBeUndefined();
  });
  it("컴패니언 — 같은 참조를 상속한 item은 보유 권리 목록만 바뀐다", () => {
    expect(out[1].presaleRights).toEqual([held, sameDay]);
    expect(out[1].householdRightCount).toBeUndefined();
  });
  it("짝 — 다른 목록을 가진 item은 그대로(같은 참조)", () => {
    expect(out[2]).toBe(unrelated);
  });
  it("원본 목록은 바뀌지 않는다", () => {
    expect(heldList).toHaveLength(1);
    expect(primary.presaleRights).toBe(heldList);
  });
});
