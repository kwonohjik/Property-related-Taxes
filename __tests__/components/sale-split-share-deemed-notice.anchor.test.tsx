/**
 * anchor — 공유지분 + §100③ 불분명 의제 시 「신고서 양도가액은 안분가액(…)으로 기재」 문구의 금액
 * (결과뷰 리뷰 2026-11-21 R-c08-04)
 *
 * 판정 표(구분 기재·안분·적용 가액)는 계약서(100%) 금액이고, 그 지분에 실제로 적용한 가액은 `j.share.applied`다
 * (`transfer-split-gain.types.ts` · `sale-split-100-3-share-scale-judgment.plan.md` Q-3 a). 종전 안내 문구는 `j.applied`(100%)를
 * 인용해 지분 양도자에게 100% 금액을 신고서에 적으라고 안내했다.
 * 폼 → ④ → route POST(mock 세율) → `BundledAllocationCard` 렌더 — 화면 경로 그대로.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { GB_SAMPLES, T, asset, form, run } from "./_helpers/gb-bundled-blocks-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const BUY: Partial<AssetForm> = { ...GB_SAMPLES["S100-act"][0][0], acquisitionDate: "2021-05-01" };
/** 토지 구분 기재 1,212,167,733 — 100% 판정이 불분명(gb-sale-split-contract-judgment 경계 시료) */
const LAND_DECLARED = 1_212_167_733;
const split: Partial<AssetForm> = { landTransferPrice: String(LAND_DECLARED), buildingTransferPrice: String(T - LAND_DECLARED) };

async function renderBlock(ratio: Partial<AssetForm>) {
  const f = form(T, [asset(1, BUY, split, ratio)]);
  const r = await run(f);
  expect(r.status).toBe(200);
  render(<BundledAllocationCard apportionment={r.apportionment} aggregated={r.aggregated} formData={f} />);
  const text = (screen.getByTestId("sale-split-judgment").textContent ?? "").replace(/\s+/g, " ");
  return { r, j: r.aggregated.generalBuildingValuationDetail!.saleSplitJudgment!, text };
}

const notice = (land: number, building: number) =>
  `신고서 양도가액은 안분가액(토지 ${land.toLocaleString()} · 건물 ${building.toLocaleString()})으로 기재됩니다`;

describe("R-c08-04 — 불분명 의제 안내 문구는 신고 단위(지분) 양도가액을 인용한다", () => {
  it("지분 1/3 → 문구 금액 = j.share.applied = 자산 카드 양도가액 · 100% 금액을 인용하지 않는다", async () => {
    const { r, j, text } = await renderBlock({ ownershipNumerator: "1", ownershipDenominator: "3" });
    expect(j.deemedUnclear).toBe(true);
    const share = j.share!.applied;
    // 신고 단위 양도가액 = 자산 카드 transferPrice(토지)
    expect(r.aggregated.properties.find((p) => p.propertyId === "land")!.transferPrice).toBe(share.land);
    expect(share.land).not.toBe(j.applied.land);
    expect(text).toContain(notice(share.land, share.building));
    expect(text).not.toContain(notice(j.applied.land, j.applied.building));
  });

  it("단독 소유(지분 없음) → 종전대로 j.applied 인용", async () => {
    const { j, text } = await renderBlock({});
    expect(j.deemedUnclear).toBe(true);
    expect(j.share).toBeUndefined();
    expect(text).toContain(notice(j.applied.land, j.applied.building));
  });
});
