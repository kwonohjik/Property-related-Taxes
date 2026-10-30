/**
 * O-23 anchor — 일괄양도 양도가액 안분(영 §166⑥)의 «잔액 흡수 자산»은 입력 순서와 무관하다.
 *
 * 영 §166⑥은 기준시가 비율 안분만 정하고 원 단위 반올림·잔액 귀속은 정하지 않는다. 종전에는 입력 순서상 마지막
 * 변동 자산이 잔액을 흡수해, 기준시가가 같은 카드 둘의 입력 순서를 바꾸면 1원이 다른 카드로 옮겨 갔다.
 * 이제 흡수자 = (배열 위치 0 = 주 자산을 뺀) 기준시가 > 0 자산 중 assetId 사전순 최대이고,
 * 비흡수자의 몫을 모두 계산한 뒤 흡수자가 잔여를 받는다. 감면 안분(propertyId 순)·§102② 차손 안분과 같은 방향이다.
 */
import { describe, it, expect } from "vitest";
import { apportionBundledSale } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { BundledAssetInput } from "@/lib/tax-engine/bundled-sale-apportionment";

const asset = (assetId: string, std: number, extra: Partial<BundledAssetInput> = {}): BundledAssetInput => ({
  assetId,
  assetLabel: assetId,
  assetKind: "land",
  standardPriceAtTransfer: std,
  ...extra,
});

function perms<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));
}

const salesById = (assets: BundledAssetInput[], total: number) => {
  const r = apportionBundledSale({ totalSalePrice: total, assets });
  return Object.fromEntries(r.apportioned.map((a) => [a.assetId, a.allocatedSalePrice]));
};

describe("O-23 — 양도가액 안분 잔액 흡수자는 입력 순서와 무관", () => {
  it("🔑 기준시가가 같은 카드 2장 — 두 입력 순서의 배정이 assetId별로 같고 합이 총액이다", () => {
    const primary = asset("primary", 400_000, { assetKind: "housing" });
    const total = 1_000_000_000;
    const a = salesById([primary, asset("c1", 400_000), asset("c2", 400_000)], total);
    const b = salesById([primary, asset("c2", 400_000), asset("c1", 400_000)], total);
    expect(a).toEqual(b);
    expect(Object.values(a).reduce((s, v) => s + v, 0)).toBe(total);
  });

  it("🔑 카드 3장 × 6개 순열 — 모두 같은 배정, 합 = 총액, 몫은 모두 정수", () => {
    // 4등분이 정확히 나뉘지 않게 +1 — 잔액 1원이 생기는 시료여야 순서 의존이 드러난다
    const total = 1_000_000_001;
    const primary = asset("primary", 400_000, { assetKind: "housing" });
    const cards = [asset("c1", 400_000), asset("c2", 400_000), asset("c3", 400_000)];
    const base = salesById([primary, ...cards], total);
    for (const order of perms(cards)) {
      const got = salesById([primary, ...order], total);
      expect(got).toEqual(base);
    }
    expect(Object.values(base).reduce((s, v) => s + v, 0)).toBe(total);
    for (const v of Object.values(base)) expect(Number.isInteger(v)).toBe(true);
  });

  it("🔑 흡수자 = 컴패니언 중 assetId 사전순 최대 — 잔액 1원이 c3에 붙는다", () => {
    // 1,000,000,000 / 4등분 = 250,000,000 정확히 나뉘지 않도록 3등분(주 자산 + 컴패니언 2) → 333,333,333 ×3 = 999,999,999, 잔액 1
    const total = 1_000_000_000;
    const got = salesById(
      [asset("primary", 400_000, { assetKind: "housing" }), asset("c3", 400_000), asset("c1", 400_000)],
      total,
    );
    expect(got.primary).toBe(333_333_333);
    expect(got.c1).toBe(333_333_333);
    expect(got.c3).toBe(333_333_334);
  });

  it("🔑 residualAbsorbedBy도 새 흡수자를 가리킨다 — 입력 순서 끝이 아니라 사전순 최대 컴패니언", () => {
    const r = apportionBundledSale({
      totalSalePrice: 1_000_000_000,
      assets: [asset("primary", 400_000, { assetKind: "housing" }), asset("c3", 400_000), asset("c1", 400_000)],
    });
    expect(r.residualAbsorbedBy).toBe("c3");
  });

  it("🔑 컴패니언이 있으면 주 자산은 흡수자가 아니다 — assetId가 사전순으로 가장 커도", () => {
    const total = 1_000_000_000;
    const got = salesById(
      [asset("zzz-primary", 400_000, { assetKind: "housing" }), asset("a1", 400_000), asset("a2", 400_000)],
      total,
    );
    expect(got["zzz-primary"]).toBe(333_333_333);
    expect(got.a2).toBe(333_333_334);
  });

  it("🔑 주 자산 판정은 id 문자열이 아니라 배열 위치 0 — 화면 미리보기(폼 id)와 서버(\"primary\")가 같은 값을 낸다", () => {
    const total = 1_000_000_000;
    const server = salesById(
      [asset("primary", 400_000, { assetKind: "housing" }), asset("c1", 400_000), asset("c2", 400_000)],
      total,
    );
    const preview = salesById(
      [asset("zz-form-id", 400_000, { assetKind: "housing" }), asset("c1", 400_000), asset("c2", 400_000)],
      total,
    );
    expect(preview["zz-form-id"]).toBe(server.primary);
    expect(preview.c1).toBe(server.c1);
    expect(preview.c2).toBe(server.c2);
  });

  it("🔑 컴패니언이 없으면(나머지가 기준시가 0) 주 자산이 흡수한다", () => {
    const total = 1_000_000_001;
    const got = salesById([asset("primary", 400_000, { assetKind: "housing" }), asset("c1", 0)], total);
    expect(got.c1).toBe(0);
    expect(got.primary).toBe(total);
  });

  it("🔑 기준시가 0 컴패니언은 흡수자가 아니다 — 사전순으로 가장 커도 0원을 유지", () => {
    const total = 1_000_000_001;
    const got = salesById(
      [asset("primary", 500_000, { assetKind: "housing" }), asset("c1", 500_000), asset("c9", 0)],
      total,
    );
    expect(got.c9).toBe(0);
    expect(got.primary + got.c1).toBe(total);
    // 주 자산은 비흡수자라 반올림 몫(500,000,000.5 → 500,000,001)을 받고, 흡수자 c1이 나머지 500,000,000을 받는다
    expect(got.primary).toBe(500_000_001);
    expect(got.c1).toBe(500_000_000);
  });

  it("구분 기재 양도가액(fixedSalePrice) 자산은 영향 없이 그대로, 나머지 변동 자산 합 = 잔여", () => {
    const total = 1_000_000_000;
    const got = salesById(
      [
        asset("primary", 400_000, { assetKind: "housing" }),
        asset("c1", 400_000, { fixedSalePrice: 100_000_000 }),
        asset("c2", 400_000),
        asset("c3", 400_000),
      ],
      total,
    );
    expect(got.c1).toBe(100_000_000);
    expect(got.primary + got.c2 + got.c3).toBe(900_000_000);
  });

  it("기준시가가 서로 다른 카드 — 입력 순서와 무관(기존 동작 유지)", () => {
    const total = 1_000_000_007;
    const primary = asset("primary", 300_000, { assetKind: "housing" });
    const cards = [asset("c1", 333_000), asset("c2", 367_000), asset("c3", 411_000)];
    const base = salesById([primary, ...cards], total);
    for (const order of perms(cards)) expect(salesById([primary, ...order], total)).toEqual(base);
  });
});

// ── Step 5 — 공통경비(영 §166⑥ · 소득세법 §100② 후문 «가액에 비례하여 안분») 잔액 흡수자도 입력 순서와 무관 ──
const expensesById = (assets: BundledAssetInput[], total: number, commonExpenses: number) => {
  const r = apportionBundledSale({ totalSalePrice: total, commonExpenses, assets });
  return {
    exp: Object.fromEntries(r.apportioned.map((a) => [a.assetId, a.allocatedExpenses])),
    common: Object.fromEntries(r.apportioned.map((a) => [a.assetId, a.allocatedCommonExpense ?? 0])),
  };
};
const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);

describe("Step 5 — 공통경비 안분 잔액 흡수자는 입력 순서와 무관", () => {
  const primary = asset("primary", 400_000, { assetKind: "housing" });

  it("🔑 같은 기준시가 카드 3장 × 6개 순열 — 카드별 경비·공통경비가 모두 같고 합 = 공통경비", () => {
    const total = 1_000_000_000;
    const ce = 1_000_003;
    const cards = [asset("c1", 400_000), asset("c2", 400_000), asset("c3", 400_000)];
    const base = expensesById([primary, ...cards], total, ce);
    for (const order of perms(cards)) expect(expensesById([primary, ...order], total, ce)).toEqual(base);
    expect(sum(base.common)).toBe(ce);
  });

  it("🔑 기준시가가 서로 다른 카드 3장 × 6개 순열 — 모두 같다(종전엔 이 경우도 갈렸다)", () => {
    const total = 1_000_000_007;
    const ce = 3_000_001;
    const p = asset("primary", 300_000, { assetKind: "housing" });
    const cards = [asset("c1", 330_000), asset("c2", 370_000), asset("c3", 400_000)];
    const base = expensesById([p, ...cards], total, ce);
    for (const order of perms(cards)) expect(expensesById([p, ...order], total, ce)).toEqual(base);
    expect(sum(base.common)).toBe(ce);
  });

  it("🔑 흡수자 = 양도가액 > 0 컴패니언 중 assetId 사전순 최대 — 잔액이 c3에 붙는다", () => {
    // 양도가액 333,333,333 ×3 · 공통경비 10 → 몫 3.33 → 3, 3, 흡수자가 4
    const got = expensesById([primary, asset("c3", 400_000), asset("c1", 400_000)], 999_999_999, 10);
    expect(got.common.primary).toBe(3);
    expect(got.common.c1).toBe(3);
    expect(got.common.c3).toBe(4);
  });

  it("🔑 주 자산은 컴패니언이 있으면 흡수자가 아니다 — assetId가 사전순으로 가장 커도(위치 0 판정)", () => {
    const got = expensesById(
      [asset("zzz", 400_000, { assetKind: "housing" }), asset("a1", 400_000), asset("a2", 400_000)],
      999_999_999,
      10,
    );
    expect(got.common.zzz).toBe(3);
    expect(got.common.a1).toBe(3);
    expect(got.common.a2).toBe(4);
  });

  it("🔑 양도가액 0 컴패니언은 흡수자가 아니다 — 사전순으로 가장 커도 0원, 음수 몫도 만들지 않는다", () => {
    // 양도가액 5억 ×2 · 공통경비 5 → 몫 2.5 → 반올림 3, 3(합 6 > 5). 양도가액 0인 c9가 흡수하면 -1이 된다
    const got = expensesById(
      [primary, asset("c1", 400_000), asset("c9", 0, { fixedSalePrice: 0 })],
      1_000_000_000,
      5,
    );
    expect(got.common.c9).toBe(0);
    expect(got.common.primary).toBe(3);
    expect(got.common.c1).toBe(2);
  });

  it("직접경비는 흡수와 무관하게 그대로 더해진다 — allocatedExpenses = 직접 + 공통 몫", () => {
    const got = expensesById(
      [
        asset("primary", 400_000, { assetKind: "housing", directExpenses: 1_000 }),
        asset("c3", 400_000, { directExpenses: 20_000 }),
        asset("c1", 400_000, { directExpenses: 300_000 }),
      ],
      999_999_999,
      10,
    );
    expect(got.exp.primary).toBe(1_000 + 3);
    expect(got.exp.c1).toBe(300_000 + 3);
    expect(got.exp.c3).toBe(20_000 + 4);
  });

  it("🔑 컴패니언이 없으면(양도가액 > 0 이 주 자산뿐) 주 자산이 흡수한다", () => {
    const got = expensesById([primary, asset("c1", 400_000, { fixedSalePrice: 0 })], 1_000_000_001, 7);
    expect(got.common.c1).toBe(0);
    expect(got.common.primary).toBe(7);
  });

  it("공통경비 0이면 안분 없음 — 몫 0 · 경비 = 직접경비", () => {
    const got = expensesById(
      [primary, asset("c1", 400_000, { directExpenses: 5 }), asset("c2", 400_000)],
      1_000_000_001,
      0,
    );
    expect(sum(got.common)).toBe(0);
    expect(got.exp.c1).toBe(5);
  });
});
