/**
 * #18 (S08-7) — 일괄양도 1세대1주택 단위의 12억 판정·안분 분모 합계액에 배율 **초과** 토지 카드와 면적 없는(판정 불가) 부수토지 선언 카드의
 * 가액도 넣는다. 법문 괄호 «주택 및 이에 딸린 토지의 양도 당시 실지거래가액의 합계액»(소득세법 §89①3호)에 배율 한정이 없고,
 * 서면4팀-2677 · 재산세제과-915 · 서울행법 2018구단74696 · 조심2018서2003도 초과분까지 넣은 전체 가액으로 판정했다(결정 문서 확인).
 * 초과 토지는 계속 비과세·표2 대상이 아니다(`appurtenant_excess`는 `landIdxs`에 들지 않는다).
 */
import { describe, it, expect } from "vitest";
import { applyOneHouseUnitPrice, resolveOneHouseUnit } from "@/lib/tax-engine/transfer-tax-one-house-unit";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const item = (over: Partial<TransferTaxItemInput>): TransferTaxItemInput =>
  ({ propertyId: "x", propertyLabel: "x", propertyType: "housing", transferPrice: 0, isOneHousehold: true, ...over }) as TransferTaxItemInput;
const HOUSE = item({ propertyId: "h", transferPrice: 800_000_000, oneHouseUnitRole: "house" });
const LAND_IN = item({ propertyId: "l1", propertyType: "land", transferPrice: 360_000_000, oneHouseUnitRole: "appurtenant_land" });
const LAND_EXCESS = item({ propertyId: "l2", propertyType: "land", transferPrice: 240_000_000, oneHouseUnitRole: "appurtenant_excess" });
const LAND_NOAREA = item({
  propertyId: "l3", propertyType: "land", transferPrice: 600_000_000, landNature: "appurtenant_to_housing",
  primaryContextForCompanionRate: {} as never,
});

describe("#18 단위 합계액", () => {
  it("한도 내 + 초과 카드 → 합계에 둘 다 (8억 + 3.6억 + 2.4억 = 14억), 비과세 단위(landIdxs)에는 한도 내만", () => {
    const w: string[] = [];
    const u = resolveOneHouseUnit([HOUSE, LAND_IN, LAND_EXCESS], w)!;
    expect(u.combinedTransferPrice).toBe(1_400_000_000);
    expect(u.landIdxs).toEqual([1]);
    expect(u.valuationOnlyIdxs).toEqual([2]);
    const priced = applyOneHouseUnitPrice([HOUSE, LAND_IN, LAND_EXCESS], u);
    expect(priced[0].totalPropertyTransferPrice).toBe(1_400_000_000);
    expect(priced[1].totalPropertyTransferPrice).toBe(1_400_000_000);
    // 초과 카드는 비과세 단위가 아니므로 분모를 덮지 않는다
    expect(priced[2].totalPropertyTransferPrice).toBeUndefined();
  });

  it("면적 없는 부수토지 선언 카드도 합계에 든다 + 안내 · 비과세 단위에는 들지 않는다", () => {
    const w: string[] = [];
    const u = resolveOneHouseUnit([HOUSE, LAND_NOAREA], w)!;
    expect(u.combinedTransferPrice).toBe(1_400_000_000);
    expect(u.landIdxs).toEqual([]);
    expect(u.valuationOnlyIdxs).toEqual([1]);
    expect(w.join("\n")).toMatch(/배율 이내인지 판정하지 못했습니다.*고가주택\(12억 초과\) 판정에는 그 토지 가액을 합산/);
  });

  it("긍정 짝 — 초과·판정 불가 카드가 없으면 합계는 종전과 같다 (주택 + 한도 내)", () => {
    const u = resolveOneHouseUnit([HOUSE, LAND_IN], [])!;
    expect(u.combinedTransferPrice).toBe(1_160_000_000);
    expect(u.valuationOnlyIdxs).toEqual([]);
  });

  it("지분·부담부증여가 함께 있으면 종전처럼 합산하지 않는다 (12억 분모가 이미 다른 의미)", () => {
    const w: string[] = [];
    const u = resolveOneHouseUnit([{ ...HOUSE, totalPropertyTransferPrice: 2_000_000_000 }, LAND_IN, LAND_EXCESS], w);
    expect(u).toBeUndefined();
    expect(w.join("\n")).toContain("지분·부담부증여");
  });

  it("주택 카드가 없거나 둘이면 단위가 없다", () => {
    expect(resolveOneHouseUnit([LAND_IN, LAND_EXCESS], [])).toBeUndefined();
  });
});
