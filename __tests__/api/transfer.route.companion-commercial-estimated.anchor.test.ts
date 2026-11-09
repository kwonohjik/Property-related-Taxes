/**
 * anchor(⑧↔⑩) — 함께 양도·지분 분할(축 B)의 **컴패니언 상업용건물·오피스텔(환산)**이 계산된다.
 *
 * 계획서 `docs/02-design/features/companion-commercial-estimated-std-exemption.plan.md` (Q-1 a).
 *
 * ## 결함 (2026-11-09 실측)
 *
 * ⑩ 컴패니언 refine(`lib/api/transfer-tax-schema-companion-refines.ts`)이 상가 서브객체(`commercialBuildingValuation`)가
 * 있어도 일반 기준시가 2칸을 요구했다 — 주 자산 ⑫(`transfer-tax-schema-refines.ts` `isSubObjectEstimated`)는 면제한다.
 * 화면은 상가 분기에서 그 칸을 렌더하지 않고(`CompanionAcqStdPriceSection.tsx` 「아래 상업용건물·오피스텔 환산 영역에서 입력」),
 * ⑧도 요구하지 않아 **⑧ 통과 ↔ ⑩ 400** 막다른 길이었다. 두 칸은 세액에 쓰이지 않는다 — 엔진 STEP 0.35가 서브객체로
 * 환산취득가를 주입한다(CE-4가 그 사실을 고정한다).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { runSingle } from "../calc/_helpers/single-multi-route-parity";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, unknown>;

/** 공시 후(2015) 취득 오피스텔 환산 — `multi-commercial-building-parity.anchor.test.ts`와 같은 물건(환산취득가 240,000,000). */
const OFFICETEL: Obj = {
  assetKind: "commercial_building",
  acquisitionCause: "purchase",
  addressJibun: "서울특별시 종로구 청운동 1-1",
  actualSalePrice: "400000000",
  useEstimatedAcquisition: true,
  acquisitionDate: "2015-06-03",
  cbEra: "",
  cbExclusiveArea: "36",
  cbSharedArea: "33.52",
  cbLandArea: "12.57",
  cbUnitPriceAtTransfer: "5000000",
  cbUnitPriceAtFirstOrAcq: "3000000",
  cbLandPricePerSqmAtAcq: "3978096",
  cbLandPricePerSqmAtTransfer: "15000000",
};
const HOUSE: Obj = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2018-02-01",
  actualSalePrice: "900000000",
  fixedAcquisitionPrice: "600000000",
  addressJibun: "테스트 2",
  regionCode: "4113510300",
};

function form(assets: Obj[], over: Obj = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2026-03-10", isOneHousehold: false, contractTotalPrice: "1300000000", residencePeriodMonths: "0",
    householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true, ...over,
  });
  f.assets = assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm);
  return f;
}
const half = (a: Obj, n = "1", d = "2"): Obj => ({ ...a, ownershipNumerator: n, ownershipDenominator: d });

const issuesOf = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)).map((i) => i.message);

async function run(f: TransferFormData) {
  const r = await runSingle(f);
  const agg = ((r.json.data as Obj | undefined)?.aggregated ?? {}) as Obj;
  return { status: r.status, error: JSON.stringify(r.json.error ?? null), totalTax: (agg.totalTax ?? r.totalTax) as number | undefined, props: (agg.properties ?? []) as Obj[] };
}

describe("컴패니언 오피스텔(환산) — ⑧ 통과면 계산된다", () => {
  it("[CE-1] 🔴 함께 양도 · 구분 기재 — 200 · 총세액이 오피스텔을 주 자산에 둔 경우와 같다", async () => {
    const f = form([HOUSE, OFFICETEL], { bundledSaleMode: "actual" });
    expect(issuesOf(f)).toEqual([]);
    const companion = await run(f);
    expect(companion.status, companion.error).toBe(200);
    const primary = await run(form([OFFICETEL, HOUSE], { bundledSaleMode: "actual" }));
    expect(primary.status, primary.error).toBe(200);
    expect(companion.totalTax).toBe(primary.totalTax);
    expect(companion.totalTax).toBe(135_363_606);
  }, 60_000);

  it("[CE-2] 🔴 함께 양도 · 안분 — 화면에 있는 양도시 기준시가만 채우면 200", async () => {
    const f = form([{ ...HOUSE, standardPriceAtTransfer: "600000000" }, { ...OFFICETEL, standardPriceAtTransfer: "200000000" }]);
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, r.error).toBe(200);
    expect(r.totalTax).toBe(152_523_606);
  }, 60_000);

  it("[CE-3] 🔴 지분 분할(축 B) 1/2 + 1/2 — 200 · 총세액이 오피스텔 단건과 같다", async () => {
    const f = form([half(OFFICETEL), half(OFFICETEL)], { assetSplitMode: "fractional", contractTotalPrice: "400000000" });
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, r.error).toBe(200);
    const single = await run(form([OFFICETEL], { contractTotalPrice: "400000000" }));
    expect(single.totalTax).toBe(29_406_405);
    expect(r.totalTax).toBe(single.totalTax);
  }, 60_000);

  it("[CE-4] 판별력 — 숨은 일반 기준시가 2칸은 세액에 쓰이지 않는다(값을 바꿔도 같은 총세액)", async () => {
    const a = await run(form([HOUSE, { ...OFFICETEL, standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000" }], { bundledSaleMode: "actual" }));
    const b = await run(form([HOUSE, { ...OFFICETEL, standardPriceAtAcq: "300000000", standardPriceAtTransfer: "250000000" }], { bundledSaleMode: "actual" }));
    expect(a.status, a.error).toBe(200);
    expect(b.status, b.error).toBe(200);
    expect(a.totalTax).toBe(b.totalTax);
    expect(a.totalTax).toBe(135_363_606);
  }, 60_000);

  it("[CE-6] 공익수용 §164⑨1호 — 컴패니언 오피스텔에도 닿는다(주 자산에 둔 경우와 같은 총세액 · 수용 없을 때와 다르다)", async () => {
    const EXPR = { transferCause: "public_expropriation", compensationPerSqm: "4000000", compensationBasisStdPrice: "4500000" };
    const companion = await run(form([HOUSE, { ...OFFICETEL, ...EXPR }], { bundledSaleMode: "actual" }));
    const primary = await run(form([{ ...OFFICETEL, ...EXPR }, HOUSE], { bundledSaleMode: "actual" }));
    expect(companion.status, companion.error).toBe(200);
    expect(primary.status, primary.error).toBe(200);
    expect(companion.totalTax).toBe(primary.totalTax);
    expect(companion.totalTax).toBe(114_243_606); // 수용 없음 135,363,606
  }, 60_000);

  it("[CE-5] 환산 필수칸 공란은 ⑧이 먼저 막는다 — 면제가 공란을 통과시키지 않는다(route도 여전히 400)", async () => {
    const f = form([HOUSE, { ...OFFICETEL, cbExclusiveArea: "" }], { bundledSaleMode: "actual" });
    expect(issuesOf(f)).toContain("자산 2: 전용면적을 입력하세요.");
    const r = await run(f);
    expect(r.status).toBe(400);
  }, 60_000);
});
