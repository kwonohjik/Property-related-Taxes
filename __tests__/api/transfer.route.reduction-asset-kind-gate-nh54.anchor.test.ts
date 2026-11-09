/**
 * route anchor — 감면 × 자산 종류 게이트 ⑧↔⑫ 격자 (리뷰 NH-54 · 계획서 `sec99-asset-kind-gate-engine-nh54.plan.md`)
 *
 * 종류 게이트는 ⑤⑧에만 있어 직접 API 호출은 «토지에 §99의3»이 200 + 감면 적용이었다(§99의3 × 토지·건물·상가건물 40,755,002 과소).
 * ⑫(Zod)가 쪼개기 전 원본 본문에서 ⑧과 같은 술어·문구(`assetKindGateMessage`)로 거른다.
 * 격자: 감면 id 4종 × 자산 종류 7종(주 자산) + 컴패니언 — ⑧이 막는 칸은 ⑫도 같은 문구로 400, ⑧이 허용하는 칸은 ⑫ 게이트 문구가 없다.
 * 세율표는 mock(정본 세액 아님).
 */
import { it, describe, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { runSingle } from "../calc/_helpers/single-multi-route-parity";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const RED: Record<string, Record<string, unknown>> = {
  new_99_3: {
    ...getReductionDefault("new_99_3"),
    acquisitionType993: "from_builder", firstContract993: "yes",
    standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "200,000,000", standardPriceAtTransfer993: "400,000,000",
    exclusiveAreaSqm993: "84", region993: "outside_speculation",
  },
  rental_97_main: { ...getReductionDefault("rental_97_main"), rentalStartDate: "2000-01-01", constructionYear: "1995", hasMin5RentalUnits: true },
  unsold_98_4: { ...getReductionDefault("unsold_98_4") },
  self_farming: { ...getReductionDefault("self_farming") },
};

function form(reds: Record<string, unknown>[], assetKind = "housing"): TransferFormData {
  const base = createDefaultTransferFormData() as unknown as Record<string, unknown>;
  const asset = {
    ...makeDefaultAsset(1), assetKind, addressJibun: "경기도 수원시 팔달구 인계동 1-1",
    acquisitionCause: "purchase", acquisitionDate: "2005-06-01", assetContractDate: "2002-12-01",
    actualSalePrice: "800,000,000", fixedAcquisitionPrice: "300,000,000", standardPriceAtTransfer: "400,000,000",
    reductions: reds, residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
  };
  return {
    ...base, transferDate: "2024-07-01", contractTotalPrice: "800,000,000", assets: [asset],
    houses: [{ ...createHouseEntry("h1"), acquisitionDate: "1990-01-01", officialPrice: "300,000,000", acquisitionPrice: "300,000,000", exclusiveArea: "84", isApartment: true }],
    presaleRights: [], householdNoPresaleRightsConfirmed: true, isOneHousehold: true, householdHousingCount: "2",
    isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  } as unknown as TransferFormData;
}

type Json = { error?: { fieldErrors?: Record<string, string[]> } };
async function postBody(body: unknown) {
  const res = await SINGLE(new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as Json;
  return { status: res.status, errors: JSON.stringify(json.error?.fieldErrors ?? {}), fieldErrors: json.error?.fieldErrors ?? {} };
}
/** ⑧ — 같은 감면을 그 종류의 자산에 넣었을 때의 메시지. */
const issue8 = (reds: Record<string, unknown>[], assetKind: string) =>
  validateStep2Reductions(2, form(reds, assetKind))?.message;

const IDS = ["new_99_3", "rental_97_main", "unsold_98_4", "self_farming"] as const;
const KINDS = ["housing", "land", "building", "commercial_building", "right_to_move_in", "presale_right", "redevelopment_apt"] as const;
const GATE_RE = /적용됩니다/;

describe("NH-54 — 감면 id × 자산 종류: ⑧이 막는 칸은 ⑫도 같은 문구로 400, 허용하는 칸은 ⑫ 게이트 문구가 없다", () => {
  const cells = IDS.flatMap((id) => KINDS.map((kind) => [id, kind] as const));
  it.each(cells)("%s × %s", async (id, kind) => {
    const reds = [RED[id]];
    const housing = await runSingle(form(reds));
    const body = JSON.parse(JSON.stringify(housing.body)) as Record<string, unknown>;
    body.propertyType = kind;
    const r = await postBody(body);
    const m8 = issue8(reds, kind);
    if (m8 && GATE_RE.test(m8)) {
      expect(r.status).toBe(400);
      expect(r.fieldErrors["reductions.0.type"]).toEqual([m8]);
    } else {
      expect(r.errors).not.toMatch(GATE_RE);
    }
  }, 30_000);

  it("격자 규모 — 28칸 중 ⑧이 막는 칸이 있고(§99의3 × 토지 등), 허용 칸도 있다", () => {
    const blocked = cells.filter(([id, kind]) => GATE_RE.test(issue8([RED[id]], kind) ?? ""));
    expect(cells).toHaveLength(28);
    expect(blocked.length).toBeGreaterThan(8);
    expect(blocked.length).toBeLessThan(cells.length - 4);
  });
});

describe("NH-54 — 고정값: §99의3 × 토지 · 건물 · 상가건물이 200 + 감면(40,755,002 과소)이던 칸", () => {
  it.each(["land", "building", "commercial_building"] as const)("%s → 400 · 문구는 ⑧과 같다", async (kind) => {
    const housing = await runSingle(form([RED.new_99_3]));
    expect(housing.status).toBe(200);
    expect(housing.totalTax).toBe(83_610_998);
    const body = { ...(housing.body as Record<string, unknown>), propertyType: kind };
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(r.fieldErrors["reductions.0.type"]?.[0]).toBe("§99의3 — 신축주택의 취득자에 대한 양도소득세의 과세특례 감면은 주택 양도에만 적용됩니다. 자산 종류를 확인하거나 감면 선택을 해제하세요.");
  });

  it("입주권 · 재개발APT · 분양권은 §99 계열 카테고리 게이트가 허용하는 종류라 200 그대로", async () => {
    const housing = await runSingle(form([RED.new_99_3]));
    for (const kind of ["right_to_move_in", "redevelopment_apt", "presale_right"]) {
      const r = await postBody({ ...(housing.body as Record<string, unknown>), propertyType: kind });
      expect(r.status, kind).toBe(200);
    }
  });

  it("§98의4 · 자경은 문구가 갈린다 — 자경은 «토지 양도에만»(반대 방향)", async () => {
    const housing = await runSingle(form([RED.self_farming]));
    const r = await postBody(housing.body);
    expect(r.status).toBe(400);
    expect(r.fieldErrors["reductions.0.type"]?.[0]).toContain("자경농지 감면(조특법 §69)은 토지 양도에만 적용됩니다");
  });
});

describe("NH-54 — 컴패니언(함께 양도): assetKind로 같은 게이트", () => {
  async function bundledBody(companionKind: string, extra: Record<string, unknown> = {}) {
    const f = createDefaultTransferFormData() as unknown as Record<string, unknown>;
    const a = (i: number, over: Record<string, unknown>) => ({
      ...makeDefaultAsset(i), addressJibun: "서울특별시 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
      acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000",
      standardPriceAtTransfer: "500000000", standardPriceAtAcq: "250000000", ...over,
    });
    const form2 = {
      ...f, transferDate: "2024-07-01", contractTotalPrice: "1200000000", isOneHousehold: false, isRegulatedArea: false,
      assets: [a(1, {}), a(2, { assetKind: companionKind, reductions: [RED.new_99_3], ...extra })],
      houses: [createHouseEntry("h1")], presaleRights: [], householdNoPresaleRightsConfirmed: true,
    } as unknown as TransferFormData;
    return (await runSingle(form2)).body;
  }

  it.each(["land", "building", "commercial_building"] as const)("컴패니언 %s × §99의3 → companionAssets.0.reductions.0.type 400", async (kind) => {
    const body = await bundledBody(kind);
    expect(Array.isArray((body as { companionAssets?: unknown[] }).companionAssets)).toBe(true);
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(r.fieldErrors["companionAssets.0.reductions.0.type"]?.[0]).toMatch(GATE_RE);
  }, 30_000);

  it("컴패니언 주택 × §99의3 → 게이트 문구 없음", async () => {
    const r = await postBody(await bundledBody("housing"));
    expect(r.errors).not.toMatch(GATE_RE);
  }, 30_000);
});
