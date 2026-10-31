/**
 * V-7 anchor(단위) — `prepareBundledApportionment`의 완전 지분 번들 잔액 흡수자 선택.
 * 흡수자 = 확정 양도가액 > 0 자산 중 (배열 위치 0 = 주 자산을 뺀) assetId 사전순 최대, 나머지 값은 그대로.
 * 주 자산 id는 서버가 `"primary"` 리터럴로 고정한다 — 사전순으로 컴패니언("a…")보다 커도 흡수자가 아니다.
 */
import { describe, expect, it } from "vitest";
import { prepareBundledApportionment } from "@/app/api/calc/transfer/bundled-apportionment";

type Prim = Parameters<typeof prepareBundledApportionment>[0];
type Comp = Parameters<typeof prepareBundledApportionment>[1][number];

const primary = (total: number, sale: number): Prim => ({
  propertyType: "land",
  totalSalePrice: total,
  acquisitionPrice: 100_000_000,
  primaryActualSalePrice: sale,
});
const comp = (assetId: string, sale: number): Comp => ({
  assetId,
  assetLabel: assetId,
  assetKind: "land",
  acquisitionCause: "purchase",
  fixedSalePrice: sale,
});

const salesById = (p: Prim, cs: Comp[]) => {
  const r = prepareBundledApportionment(p, cs, { isActualMode: false, isFullFractionalBundle: true });
  return Object.fromEntries(r.apportionment.apportioned.map((a) => [a.assetId, a.allocatedSalePrice]));
};
const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);

describe("V-7 — 완전 지분 번들 잔액 흡수자 (prepareBundledApportionment)", () => {
  it("🔑 컴패니언 두 순서의 배정이 assetId별로 같다 — 잔액 2원은 사전순 최대 c3", () => {
    const p = primary(1_000_000_001, 333_333_333);
    const a = salesById(p, [comp("c1", 333_333_333), comp("c3", 333_333_333)]);
    const b = salesById(p, [comp("c3", 333_333_333), comp("c1", 333_333_333)]);
    expect(a).toEqual(b);
    expect(a).toEqual({ primary: 333_333_333, c1: 333_333_333, c3: 333_333_335 });
    expect(sum(a)).toBe(1_000_000_001);
  });

  it("🔑 컴패니언 3명 × 6개 순열 — 모두 같은 배정, 합 = 총액", () => {
    const p = primary(1_000_000_003, 250_000_000);
    const cs = [comp("c1", 250_000_000), comp("c2", 250_000_000), comp("c3", 250_000_000)];
    const perms = (a: Comp[]): Comp[][] =>
      a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));
    const base = salesById(p, cs);
    for (const order of perms(cs)) expect(salesById(p, order)).toEqual(base);
    expect(base).toEqual({ primary: 250_000_000, c1: 250_000_000, c2: 250_000_000, c3: 250_000_003 });
  });

  it("🔑 주 자산은 컴패니언이 있으면 흡수자가 아니다 — \"primary\"가 사전순으로 \"a1\"보다 커도", () => {
    const got = salesById(primary(1_000_000_001, 333_333_333), [comp("a1", 333_333_333), comp("a2", 333_333_333)]);
    expect(got.primary).toBe(333_333_333);
    expect(got.a2).toBe(333_333_335);
  });

  it("🔑 확정 양도가액 0 컴패니언은 흡수자가 아니다 — 사전순으로 가장 커도 0원", () => {
    const got = salesById(primary(1_000_000_001, 500_000_000), [comp("c1", 500_000_000), comp("c9", 0)]);
    expect(got.c9).toBe(0);
    expect(got.c1).toBe(500_000_001);
    expect(got.primary).toBe(500_000_000);
  });

  it("🔑 컴패니언이 모두 0원이면 주 자산이 흡수한다", () => {
    const got = salesById(primary(1_000_000_001, 1_000_000_000), [comp("c1", 0)]);
    expect(got.c1).toBe(0);
    expect(got.primary).toBe(1_000_000_001);
  });

  it("합이 총액과 같으면(잔액 0) 값은 그대로", () => {
    const got = salesById(primary(1_000_000_000, 330_000_000), [comp("c1", 330_000_000), comp("c2", 340_000_000)]);
    expect(got).toEqual({ primary: 330_000_000, c1: 330_000_000, c2: 340_000_000 });
  });
});
