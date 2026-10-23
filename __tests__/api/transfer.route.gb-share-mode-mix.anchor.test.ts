/**
 * 일반건물 지분 분할(축 B) — 지분마다 실가·환산이 섞여도 계산된다 (2026-10-23)
 *
 * 계획서: `docs/00-pm/gb-share-mode-mix-and-inherited-estimate-guard.plan.md` S-1 (Q-1 a).
 * 폼 → ⑧ `collectStepIssues` → ④ `callTransferTaxAPI` 본문 → route POST · mock 세율.
 *
 * - 종전: ⑧ 0건인데 ⑫가 「지분 간 물건-수준 값이 다릅니다(buildingArea)」로 400 — 실가 본문은 환산 전용 키(`buildingArea`·최초공시 4칸)를 싣지 않는다.
 * - 고침: 환산 전용 키는 환산 지분끼리만 비교. 지분별 카드는 같은 조건의 50% 단건과 같다(엔진은 혼합을 이미 맞게 계산한다).
 * - 검사는 약해지지 않는다 — 물건 값이 실제로 다르면 여전히 400.
 * - 최초공시(물건 사건) 검증 축: 주 자산은 「환산 지분이 하나라도 있으면」, 둘째 이후 지분은 칸이 없어 검증하지 않는다(§4).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { GB_SAMPLES, T, asset, form, run } from "../components/_helpers/gb-bundled-blocks-fixtures";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const INH = GB_SAMPLES.INH[0][0];
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
/** 2010 매매 · 분리 OFF · 환산. */
const PURCHASE_EST: Partial<AssetForm> = {
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  landAcquisitionDate: "2010-05-01", acquisitionDate: "2010-05-01", landAcqMode: "estimated", buildingAcqMode: "estimated",
  useEstimatedAcquisition: true,
};
/** 2005 토지 · 2010 건물 매매 · 분리 ON · 실가. */
const PURCHASE_ACT: Partial<AssetForm> = {
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000",
};
const FD: Partial<AssetForm> = {
  gbHasFirstDisclosure: true, gbFirstDisclosurePrice: "300000000",
  gbFirstDisclosureLandPricePerSqm: "3000000", gbFirstDisclosureBuildingStdPrice: "25000000",
};

const shares = (...list: Partial<AssetForm>[][]) => form(T, list.map((o, i) => asset(i + 1, ...o)));
type Share = { valuation: Record<string, unknown> };
async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as any };
}
const cards = (r: Awaited<ReturnType<typeof run>>, suffix?: string) =>
  r.aggregated.properties
    .filter((p) => suffix === undefined || p.propertyId.endsWith(`#${suffix}`))
    .map((p) => [p.propertyId.split("#")[0], p.acquisitionPrice, p.transferGain]);

describe("S-1 — 지분마다 실가·환산이 섞여도 계산된다", () => {
  it("실가 상속 + 환산 매매 → ⑧ 0건 · 200 · 지분별 카드 = 50% 단건", async () => {
    const f = shares([INH, HALF], [INH, PURCHASE_EST, HALF]);
    expect(allIssues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.aggregated.determinedTax).toBe(305_601_279);
    expect(cards(r, "0")).toEqual(cards(await run(form(T, [asset(1, INH, HALF)]))));
    expect(cards(r, "1")).toEqual(cards(await run(form(T, [asset(1, INH, PURCHASE_EST, HALF)]))));
    expect(cards(r, "0")).toEqual([["land", 150_000_000, 500_833_744], ["building", 75_000_000, 74_166_256]]);
  });

  it("지분 순서를 바꿔도(환산 매매 + 실가 상속) 같은 세액", async () => {
    const r = await run(shares([INH, PURCHASE_EST, HALF], [INH, HALF]));
    expect(r.status).toBe(200);
    expect(r.aggregated.determinedTax).toBe(305_601_279);
  });

  it("실가 매매 + 환산 매매 → 200 · 지분별 카드 = 50% 단건", async () => {
    const r = await run(shares([INH, PURCHASE_ACT, HALF], [INH, PURCHASE_EST, HALF]));
    expect(r.status).toBe(200);
    expect(r.aggregated.determinedTax).toBe(283_551_279);
    expect(cards(r, "0")).toEqual(cards(await run(form(T, [asset(1, INH, PURCHASE_ACT, HALF)]))));
  });

  it("최초공시(주 자산 입력) + 실가 상속 + 환산 매매 → 200 · 환산 지분에만 환산주택가격이 걸린다", async () => {
    const plain = await run(shares([INH, HALF], [INH, PURCHASE_EST, HALF]));
    const f = shares([INH, FD, HALF], [INH, PURCHASE_EST, HALF]);
    expect(allIssues(f)).toEqual([]);
    const body = (await captureBody(f)) as { generalBuildingShares: Share[] };
    expect(body.generalBuildingShares[0].valuation.hasFirstDisclosure).toBeUndefined(); // 실가 지분 — 2026-08-13 게이트 유지
    expect(body.generalBuildingShares[1].valuation.hasFirstDisclosure).toBe(true);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(cards(r, "0")).toEqual(cards(plain, "0"));
    expect(cards(r, "1")).not.toEqual(cards(plain, "1"));
  });
});

describe("S-1 — 검사는 약해지지 않는다", () => {
  async function bodyOf(f: TransferFormData) {
    return JSON.parse(JSON.stringify(await captureBody(f))) as { generalBuildingShares: Share[] };
  }
  const fieldErrors = (j: { error?: { fieldErrors?: Record<string, string[]> } }) => Object.keys(j.error?.fieldErrors ?? {});

  it("토지면적이 실제로 다르면 400(전 지분 공통 키)", async () => {
    const b = await bodyOf(shares([INH, HALF], [INH, PURCHASE_EST, HALF]));
    b.generalBuildingShares[1].valuation.landArea = 999;
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(fieldErrors(r.json)).toContain("generalBuildingShares.1.valuation.landArea");
  });

  it("환산 지분끼리 buildingArea가 다르면 400", async () => {
    const b = await bodyOf(shares([INH, HALF], [INH, PURCHASE_EST, r3()], [INH, PURCHASE_EST, r3()]));
    b.generalBuildingShares[2].valuation.buildingArea = 999;
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(fieldErrors(r.json)).toEqual(["generalBuildingShares.2.valuation.buildingArea"]);
  });

  it("환산 지분끼리 최초공시 가격이 다르면 400", async () => {
    const b = await bodyOf(shares([INH, FD, HALF], [INH, PURCHASE_EST, r3()], [INH, PURCHASE_EST, r3()]));
    b.generalBuildingShares[2].valuation.firstDisclosurePrice = 1;
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(fieldErrors(r.json)).toEqual(["generalBuildingShares.2.valuation.firstDisclosurePrice"]);
  });
});
/** 세 지분 시료의 둘째·셋째 지분율(25%). */
function r3() {
  return { ownershipNumerator: "25", ownershipDenominator: "100" };
}

describe("S-1 §4 — 최초공시 검증 축(⑧)", () => {
  it("주 자산 실가 + 지분 2 환산 + 주 자산 토글 ON · 가격 비움 → 자산 1에서만 막는다(종전: 자산 1은 실가라 생략 · 칸이 없는 지분 2 카드에서 막음)", async () => {
    const f = shares([INH, FD, { gbFirstDisclosurePrice: "" }, HALF], [INH, PURCHASE_EST, HALF]);
    const fd = allIssues(f).filter((s) => s.includes(":gbFirstDisclosurePrice:"));
    expect(fd.map((s) => s.split(":")[0])).toEqual(["0"]);
  });

  it("전 지분 실가면 주 자산 토글이 남아 있어도 검증하지 않는다(종전과 같다)", async () => {
    const f = shares([INH, FD, { gbFirstDisclosurePrice: "" }, HALF], [INH, PURCHASE_ACT, HALF]);
    expect(allIssues(f).some((s) => s.includes("gbFirstDisclosurePrice"))).toBe(false);
  });

  it("전 지분 환산 + 주 자산 토글 ON · 가격 비움 → 역시 자산 1 한 번(둘째 지분 카드에는 그 칸이 없다)", async () => {
    const f = shares([INH, PURCHASE_EST, FD, { gbFirstDisclosurePrice: "" }, HALF], [INH, PURCHASE_EST, HALF]);
    const fd = allIssues(f).filter((s) => s.includes(":gbFirstDisclosurePrice:"));
    expect(fd.map((s) => s.split(":")[0])).toEqual(["0"]);
  });

  it("지분 분할이 아니면 그 자산만 본다(종전과 같다)", async () => {
    const f = form(T, [asset(1, INH, PURCHASE_EST, FD, { gbFirstDisclosurePrice: "" })]);
    expect(allIssues(f).some((s) => s.startsWith("0:gbFirstDisclosurePrice:"))).toBe(true);
  });
});
