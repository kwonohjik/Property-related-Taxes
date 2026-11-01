/**
 * 사이드바 축 B(같은 물건 지분 분할) 양도가액 — 계산 전에도 서버의 잔액 흡수를 반영한다.
 *
 * 종전: `floor(총액 × 지분율)` 합 ≠ 총액(잔여 ≠ 0)이면 `computeApportionedSaleMap`이 엔진 throw로 null → 사이드바는 floor 값 그대로라
 * 자산별 합 ≠ 계약 총액이었다(서버는 한 자산이 잔액을 흡수). 계산 후는 엔진 echo라 정상. 실가 모드는 `canApportion`이 맵을 아예 건너뛰어 같은 폴백을 탔다.
 * 계획서: `docs/02-design/features/sidebar-axis-b-sale-residual.plan.md` — Q-1 b(공유 흡수 함수) · Q-2 a(대역 밖은 입력값 그대로) · Q-3 a.
 * 폼 → 사이드바(`computeTransferPerAssetSummary`) → ④ 본문 → route를 한 번에 대조한다.
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
import { captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Share = [num: string, den?: string, id?: string];

const land = (n: number, [num, den, id]: Share): AssetForm =>
  ({
    ...makeDefaultAsset(n),
    assetId: id ?? `A${n}`,
    addressJibun: `서울 강남구 테스트동 ${n}`,
    assetKind: "land",
    acquisitionArea: "300",
    transferArea: "300",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-03",
    fixedAcquisitionPrice: "300000000",
    standardPriceAtTransfer: "500000000",
    ownershipNumerator: num,
    ownershipDenominator: den ?? "100",
    ownershipRemainderThirdParty: "",
  }) as AssetForm;

const mk = (shares: Share[], total: string, mode: "actual" | "apportioned") => {
  const f = createDefaultTransferFormData() as TransferFormData;
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-04-30";
  f.contractTotalPrice = total;
  f.bundledSaleMode = mode;
  f.assetSplitMode = "fractional";
  f.assets = shares.map((s, k) => land(k + 1, s));
  return f;
};

const sidebar = (f: TransferFormData, data: L | null = null) => {
  const s = computeTransferPerAssetSummary(f, data as never);
  return { sale: s.rows.map((r) => r.salePrice), sum: s.totalSalePrice, pending: s.rows.some((r) => r.salePending), apportioned: s.rows.map((r) => r.saleIsApportioned) };
};

async function run(f: TransferFormData) {
  const r = await postTransfer((await captureBody(f)) as L);
  const engine = (r.json?.data?.apportionment?.apportioned ?? []).map((a: L) => a.allocatedSalePrice) as number[];
  return { status: r.status, engine, data: r.json?.data as L | undefined };
}

const MODES = ["actual", "apportioned"] as const;

describe("🔑 잔여가 있는 축 B — 사이드바(계산 전) = 엔진 = 사이드바(계산 후), 합 = 총액", () => {
  const RESIDUAL: [string, Share[], string][] = [
    ["33.33×3 · 10억", [["33.33"], ["33.33"], ["33.33"]], "1000000000"],
    ["1/3×3 · 10억", [["1", "3"], ["1", "3"], ["1", "3"]], "1000000000"],
    ["50/50 · 1,000,000,001", [["50"], ["50"]], "1000000001"],
    ["60/40 · 7,777,777", [["60"], ["40"]], "7777777"],
    ["14.29×7(합 100.03%) · 10억", Array(7).fill(["14.29"]) as Share[], "1000000000"],
    ["1/3×3 · 1,000,000,001", [["1", "3"], ["1", "3"], ["1", "3"]], "1000000001"],
  ];
  for (const mode of MODES)
    for (const [name, shares, total] of RESIDUAL)
      it(`${mode} · ${name}`, async () => {
        const f = mk(shares, total, mode);
        const pre = sidebar(f);
        const r = await run(f);
        expect(r.status).toBe(200);
        expect(pre.sale).toEqual(r.engine);
        expect(pre.sum).toBe(Number(total));
        expect(pre.pending).toBe(false);
        const post = sidebar(f, r.data!);
        expect(post.sale).toEqual(r.engine);
        expect(pre.apportioned).toEqual(post.apportioned);
      });
});

describe("잔여 0 — 종전 그대로", () => {
  const ZERO: [string, Share[]][] = [
    ["50/30/20", [["50"], ["30"], ["20"]]],
    ["33.33/33.33/33.34", [["33.33"], ["33.33"], ["33.34"]]],
  ];
  for (const mode of MODES)
    for (const [name, shares] of ZERO)
      it(`${mode} · ${name} — 사이드바 = 엔진`, async () => {
        const f = mk(shares, "1000000000", mode);
        const r = await run(f);
        expect(r.status).toBe(200);
        expect(sidebar(f).sale).toEqual(r.engine);
      });
});

describe("🔑 흡수자는 위치가 아니라 assetId 사전순 최대 컴패니언", () => {
  for (const mode of MODES)
    it(`${mode} · 컴패니언 id가 A9, A2 순서 — 가운데 행 A9가 잔액(+100,000)을 받는다`, async () => {
      const f = mk([["33.33", undefined, "A1"], ["33.33", undefined, "A9"], ["33.33", undefined, "A2"]], "1000000000", mode);
      const r = await run(f);
      expect(r.status).toBe(200);
      expect(r.engine).toEqual([333_300_000, 333_400_000, 333_300_000]);
      expect(sidebar(f).sale).toEqual(r.engine);
    });
});

describe("대역 밖 입력(편집 중) — 입력 지분율 그대로(흡수하지 않는다)", () => {
  const OUT: [string, Share[], number[]][] = [
    ["70/70/70(합 210%)", [["70"], ["70"], ["70"]], [700_000_000, 700_000_000, 700_000_000]],
    ["50/30/10(합 90%)", [["50"], ["30"], ["10"]], [500_000_000, 300_000_000, 100_000_000]],
    ["50/30/19.9(합 99.9%)", [["50"], ["30"], ["19.9"]], [500_000_000, 300_000_000, 199_000_000]],
  ];
  for (const mode of MODES)
    for (const [name, shares, rows] of OUT)
      it(`${mode} · ${name}`, () => {
        expect(sidebar(mk(shares, "1000000000", mode)).sale).toEqual(rows);
      });
});

describe("총액 0·비움 — 값이 0", () => {
  it("총액 0 · 1/3×3 → 0·0·0", () => {
    expect(sidebar(mk([["1", "3"], ["1", "3"], ["1", "3"]], "0", "actual")).sale).toEqual([0, 0, 0]);
  });
});
