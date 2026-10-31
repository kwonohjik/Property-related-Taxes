/**
 * V-7 anchor — 완전 지분 번들(축 B, 같은 물건 지분 분할)의 양도가액 잔액 흡수자는 컴패니언 입력 순서와 무관하다.
 *
 * 축 B는 자산별 양도가액을 `applyRatio(총계약가, 지분율)`(floor)로 정하고, 합이 총액에 못 미치면 서버가 한 자산에 차이를 몰아준다.
 * 종전에는 그 자산이 «입력 순서상 마지막»이라, 지분이 같은 컴패니언 둘의 순서만 바꿔도 +2원이 다른 자산으로 옮겨 갔다
 * (1/3×3 · 총액 1,000,000,001 · 취득 혼합 → 총세액 225,885,000 ↔ 225,885,001).
 * 이제 흡수자 = 확정 양도가액 > 0 자산 중 (배열 위치 0 = 주 자산을 뺀) assetId 사전순 최대다 — O-23·Step 5와 같은 규칙.
 * 주 자산 자체를 바꾸는 입력(어느 지분을 첫 카드에 두는가)은 같아지지 않는다 — 서버는 주 자산을 `"primary"`로만 안다.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const land = (n: number, num: string, den: string, acq: [string, string]): AssetForm =>
  ({
    ...makeDefaultAsset(n),
    assetId: `A${n}`,
    addressJibun: `서울 강남구 테스트동 ${n}`,
    assetKind: "land",
    acquisitionArea: "300",
    transferArea: "300",
    acquisitionCause: "purchase",
    acquisitionDate: acq[0],
    fixedAcquisitionPrice: acq[1],
    standardPriceAtTransfer: "500000000",
    ownershipNumerator: num,
    ownershipDenominator: den,
    ownershipRemainderThirdParty: "",
  }) as AssetForm;

const SAME: [string, string][] = [["2015-03-03", "300000000"], ["2015-03-03", "300000000"], ["2015-03-03", "300000000"]];
const MIXED: [string, string][] = [["2008-03-03", "200000000"], ["2022-03-03", "350000000"], ["2015-03-03", "300000000"]];

/** 주 자산(첫 카드) 고정, 컴패니언 순서만 바꾼다. */
function perms<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));
}

async function runAll(shares: [string, string][], acq: [string, string][], total: string) {
  const base = shares.map(([n, d], k) => land(k + 1, n, d, acq[k]));
  const totals = new Set<number>();
  const allocs = new Set<string>();
  let first: Record<string, number> = {};
  for (const rest of perms(base.slice(1))) {
    const f = createDefaultTransferFormData() as TransferFormData;
    f.transferDate = "2026-02-16";
    f.filingDate = "2026-04-30";
    f.contractTotalPrice = total;
    f.bundledSaleMode = "actual";
    f.assetSplitMode = "fractional";
    f.assets = [base[0], ...rest];
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    const ag = r.json.data.aggregated;
    totals.add(ag.totalTax);
    const byId: Record<string, number> = Object.fromEntries(
      (ag.properties as L[]).map((p) => [p.propertyId === "primary" ? base[0].assetId : p.propertyId, p.transferPrice]),
    );
    allocs.add(JSON.stringify(Object.keys(byId).sort().map((k) => [k, byId[k]])));
    first = byId;
  }
  return { totals: [...totals], allocs: [...allocs], first };
}

describe("V-7 — 축 B 양도가액 잔액 흡수자는 컴패니언 입력 순서와 무관 (route)", () => {
  it("🔑 1/3×3 · 1,000,000,001 · 취득 혼합 — 컴패니언 순열 모두 같은 배정이고 총세액이 하나뿐이다", async () => {
    const r = await runAll([["1", "3"], ["1", "3"], ["1", "3"]], MIXED, "1000000001");
    expect(r.allocs).toHaveLength(1);
    expect(r.totals).toEqual([225_885_000]);
    // 잔액 2원은 컴패니언 중 assetId 사전순 최대(A3)가 받는다
    expect(r.first).toEqual({ A1: 333_333_333, A2: 333_333_333, A3: 333_333_335 });
  });

  it("🔑 1/3×3 · 취득 동일 — 총세액 218,031,000 하나, 배정은 순열과 무관", async () => {
    const r = await runAll([["1", "3"], ["1", "3"], ["1", "3"]], SAME, "1000000001");
    expect(r.allocs).toHaveLength(1);
    expect(r.totals).toEqual([218_031_000]);
  });

  it("🔑 3/7·2/7·2/7 · 1,000,000,007 — 순열 무관, 합 = 총액", async () => {
    const r = await runAll([["3", "7"], ["2", "7"], ["2", "7"]], MIXED, "1000000007");
    expect(r.allocs).toHaveLength(1);
    expect(r.totals).toHaveLength(1);
    expect(Object.values(r.first).reduce((s, v) => s + v, 0)).toBe(1_000_000_007);
  });

  it("총액이 지분율로 정확히 나뉘면 종전 값 그대로 — 33·33·34% · 1,000,000,000 → 3.3억·3.3억·3.4억", async () => {
    const r = await runAll([["33", "100"], ["33", "100"], ["34", "100"]], MIXED, "1000000000");
    expect(r.allocs).toHaveLength(1);
    expect(r.first).toEqual({ A1: 330_000_000, A2: 330_000_000, A3: 340_000_000 });
  });

  it("2자산 분할은 종전과 같다 — 1/3·2/3 · 1,000,000,001 → 컴패니언이 잔액 흡수", async () => {
    const r = await runAll([["1", "3"], ["2", "3"]], MIXED, "1000000001");
    expect(r.first).toEqual({ A1: 333_333_333, A2: 666_666_668 });
  });
});
