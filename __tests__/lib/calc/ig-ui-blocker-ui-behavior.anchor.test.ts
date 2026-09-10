/**
 * 상속·증여 UI 리뷰 BLOCKER — 상태 병합·보존 anchor.
 *
 * - IG(c10-1): 카테고리 그룹 간 변경 시 비호환 필드가 남아 §14 유령 담보채무가 계산됐다.
 *   호출부가 `{ ...item, ...preserved }`로 병합하므로 preserved에 «키가 없으면» 원본이 살아남는다.
 * - IG(c24-1): 부분 patch를 키 나열로 재구성하면 patch에 없던 키가 `undefined` own property가 되어
 *   spread 병합에서 기존 값을 지운다(동거 시작일 ↔ 사유 상호 소거).
 */
import { describe, it, expect } from "vitest";
import {
  pickPreservedFields,
  computeLossFields,
} from "@/lib/calc/category-change-policy";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/** 담보채무 자동공제가 켜진 토지 — 그룹 간 변경 시 전부 소멸해야 한다 */
const LAND_WITH_SECURED_DEBT = {
  id: "e1",
  name: "○○동 토지",
  category: "real_estate_land",
  standardPrice: 500_000_000,
  mortgageAmount: 300_000_000,
  deductSecuredClaimAsDebt: true,
  securedClaimIsFinancialDebt: true,
  securedClaimCreditorName: "○○은행",
  estateAddress: "서울 ○○구 ○○동 1-1",
  heirAllocations: [{ heirId: "h1", amount: 500_000_000 }],
} as unknown as EstateItem;

describe("카테고리 그룹 간 변경 — 비호환 필드 소멸 (§14 유령 담보채무)", () => {
  it("C-1 · preserved가 비호환 키를 «명시적 undefined»로 담는다", () => {
    const preserved = pickPreservedFields({
      item: LAND_WITH_SECURED_DEBT,
      newCategory: "cash",
    }) as Record<string, unknown>;

    // 키 자체가 존재해야 spread 병합에서 원본을 덮어쓴다 — 「부재」로는 지워지지 않는다
    expect("deductSecuredClaimAsDebt" in preserved).toBe(true);
    expect("mortgageAmount" in preserved).toBe(true);
    expect("standardPrice" in preserved).toBe(true);
    expect(preserved.deductSecuredClaimAsDebt).toBeUndefined();
    expect(preserved.mortgageAmount).toBeUndefined();
  });

  it("C-2 · 🔴 호출부 병합 후에도 담보채무가 남지 않는다 (경고 문구 ↔ 실제 결과 일치)", () => {
    const preserved = pickPreservedFields({
      item: LAND_WITH_SECURED_DEBT,
      newCategory: "cash",
    });
    // CategoryChangeDialog onConfirm → EstateItemEditor: onUpdate({ ...item, ...preserved })
    const merged = { ...LAND_WITH_SECURED_DEBT, ...preserved } as Record<string, unknown>;

    expect(merged.category).toBe("cash");
    expect(merged.deductSecuredClaimAsDebt).toBeUndefined();
    expect(merged.mortgageAmount).toBeUndefined();
    expect(merged.securedClaimCreditorName).toBeUndefined();
    expect(merged.standardPrice).toBeUndefined();
    // 보존 대상은 살아 있어야 한다
    expect(merged.id).toBe("e1");
    expect(merged.name).toBe("○○동 토지");
    expect(merged.heirAllocations).toHaveLength(1);
  });

  it("C-3 · 손실 경고 목록은 그대로 계산된다 (undefined 명시가 경고를 지우지 않는다)", () => {
    const preserved = pickPreservedFields({
      item: LAND_WITH_SECURED_DEBT,
      newCategory: "cash",
    });
    const loss = computeLossFields(LAND_WITH_SECURED_DEBT, preserved);

    // computeLossFields는 `preserved[k] === undefined`로 판정하므로 명시적 undefined도 손실로 센다
    expect(loss).toContain("deductSecuredClaimAsDebt");
    expect(loss).toContain("mortgageAmount");
    expect(loss).toContain("standardPrice");
    expect(loss).toContain("estateAddress");
  });

  it("C-4 · 그룹 «내» 변경은 전 필드를 보존한다 (과잉 삭제 방지)", () => {
    const preserved = pickPreservedFields({
      item: LAND_WITH_SECURED_DEBT,
      newCategory: "real_estate_apartment",
    }) as Record<string, unknown>;

    expect(preserved.category).toBe("real_estate_apartment");
    expect(preserved.mortgageAmount).toBe(300_000_000);
    expect(preserved.deductSecuredClaimAsDebt).toBe(true);
    expect(computeLossFields(LAND_WITH_SECURED_DEBT, preserved)).toHaveLength(0);
  });
});

describe("부분 patch 병합 — 동거요건 시작일 ↔ 사유 상호 소거", () => {
  type Heir = { cohabitStartDate?: string; cohabitReasons?: string[] };
  const set = (heir: Heir, patch: Partial<Heir>): Heir => ({ ...heir, ...patch });

  it("H-1 · patch를 그대로 넘기면 다른 키가 보존된다 (수정 후 동작)", () => {
    const heir: Heir = { cohabitStartDate: "2010-01-01" };
    // CohabitRequirementBlock은 항상 단일 키 patch를 올린다
    const next = set(heir, { cohabitReasons: [] });

    expect(next.cohabitStartDate).toBe("2010-01-01");
    expect(next.cohabitReasons).toEqual([]);
  });

  it("H-2 · 🔴 키를 나열해 재구성하면 시작일이 지워진다 (수정 전 동작 — 구별력 확인)", () => {
    const heir: Heir = { cohabitStartDate: "2010-01-01" };
    const patch: Partial<Heir> = { cohabitReasons: [] };

    // 종전 HeirEditor:572 배선을 그대로 재현
    const broken = set(heir, {
      cohabitStartDate: patch.cohabitStartDate,
      cohabitReasons: patch.cohabitReasons,
    });

    expect(broken.cohabitStartDate).toBeUndefined();
    // 이 단언이 실패하면 「부분 patch 재구성」이 무해해진 것이므로 H-1의 의미도 사라진다
    expect(heir.cohabitStartDate).toBe("2010-01-01");
  });

  it("H-3 · 반대 방향 — 사유 입력 후 시작일 수정 시 사유가 보존된다", () => {
    const heir: Heir = { cohabitReasons: ["military_service"] };
    const next = set(heir, { cohabitStartDate: "2012-05-05" });

    expect(next.cohabitReasons).toEqual(["military_service"]);
    expect(next.cohabitStartDate).toBe("2012-05-05");
  });
});
