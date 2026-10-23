/**
 * 일반건물 의제취득일 전 상속 — 결과 카드 §163⑨ 블록의 라벨·문구가 엔진 채택을 따른다 (PR-4 · 리뷰 F-1).
 *
 * 지분 분할(축 B)은 ①②③ 비교 echo를 싣지 않는다(지분마다 다름). 그래도 ③이 채택된 상속 파트를
 * 「(상속개시일 평가액)」·「환산취득가·개산공제를 적용하지 않습니다」로 표시하면 안 된다 — 카드의 추계 여부가 소스다.
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §15
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";

const T = 1_620_000_000;
const INH: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  hasSeperateLandAcquisitionDate: false,
  landAcquisitionDate: "1980-05-01",
  acquisitionDate: "1980-05-01",
  decedentAcquisitionDate: "1970-01-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  publishedValueAtInheritance: "50000000",
  gbBuildingInheritedValue: "20000000",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "150000000",
  gbLandArea: "205",
  gbBuildingArea: "300",
  gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: "259072400",
  actualSalePrice: String(T),
  ownershipNumerator: "100",
  ownershipDenominator: "100",
};
const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;

function form(assets: AssetForm[]): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(T);
  f.assets = assets;
  return f;
}

async function view(f: TransferFormData) {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const d = json.data;
  const c = render(
    <BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />,
  ).container;
  return (c.textContent ?? "").replace(/\s+/g, " ");
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const NOTE = "다만 1985.1.1. 전 상속 파트는 환산취득가액이 더 크면 환산취득가액과 개산공제를 적용합니다.";

describe("§163⑨ 블록 — 라벨·문구가 엔진 채택을 따른다", () => {
  it("단건 1980 — ③ 채택 두 파트 「(환산취득가액)」 · 보충 문장 · ①②③ 블록", async () => {
    const text = await view(form([asset(1, INH)]));
    expect(text).toContain("토지분 취득가액(환산취득가액)");
    expect(text).toContain("건물분 취득가액(환산취득가액)");
    expect(text).toContain(NOTE);
    expect(text).toContain("①②③ 중 큰 금액");
  });

  it("🔴 지분 분할 1980(50%+50%) — 「(상속개시일 평가액)」이 아니라 「(환산취득가액)」 · ①②③은 지분마다(`gb-fractional-result-blocks.plan.md` Q-3 a)", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
    const text = await view(form([asset(1, INH, half), asset(2, INH, half)]));
    expect(text).not.toContain("(상속개시일 평가액)");
    expect(text).toContain("자산 1 (지분 50%) 토지분 취득가액(환산취득가액)");
    expect(text).toContain("자산 2 (지분 50%) 토지분 취득가액(환산취득가액)");
    expect(text).toContain(NOTE);
    // 종전(PR-4 한계)엔 지분마다 비교가 달라 블록을 숨겼다 — 이제 지분 이름을 단 블록이 지분마다 하나.
    expect(text.match(/①②③ 중 큰 금액/g)).toHaveLength(2);
  });

  it("①이 두 파트 모두 이기면 「(상속개시일 평가액)」", async () => {
    const text = await view(form([asset(1, INH, { publishedValueAtInheritance: "900000000", gbBuildingInheritedValue: "300000000" })]));
    expect(text).toContain("토지분 취득가액(상속개시일 평가액)");
    expect(text).toContain("건물분 취득가액(상속개시일 평가액)");
  });

  it("토지 매매(환산) + 건물 1988 상속 — 상속이 아닌 파트의 환산으로는 보충 문장을 띄우지 않는다", async () => {
    const text = await view(form([asset(1, INH, {
      acquisitionCause: "purchase",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2000-01-01",
      landAcqMode: "estimated",
      acquisitionDate: "1988-05-01",
      publishedValueAtInheritance: "",
      gbBuildingDecedentAcquisitionDate: "1970-01-01",
    } as Partial<AssetForm>)]));
    expect(text).toContain("상속 취득가액 직접 산정");
    expect(text).toContain("토지분 취득가액(상속 아님 — 종전 산정)");
    expect(text).not.toContain(NOTE);
  });

  it("1988 상속 — 보충 문장 없음(회귀 0)", async () => {
    const text = await view(form([asset(1, INH, { landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01" })]));
    expect(text).toContain("토지분 취득가액(상속개시일 평가액)");
    expect(text).not.toContain(NOTE);
  });
});
