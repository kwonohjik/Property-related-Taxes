/**
 * anchor — 겸용주택 × 부담부증여 PR-3: 화면 입력(폼) → ⑧ → ④ → ⑫ → 엔진 전 구간.
 *
 * 기대값은 엔진 설계서 §4 anchor(엔진 anchor 테스트 `mixed-use-burdened-gift.anchor.test.ts`와 같은 시나리오·같은 값)다 —
 * UI 폼을 거쳐도 같은 세액이 나오는지(= ④가 엔진에 같은 입력을 싣는지)를 고정한다.
 * F1: 주택 100㎡·상가 100㎡(§154③ 단서) · 양도(증여)일 2024-03-01 · 증여자의 취득일 2010-03-15.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { burdenedGiftInfoSchema } from "@/lib/api/transfer-tax-burdened-gift-schema";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const MIXED = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-15",
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
  mixedIsMetropolitanArea: true,
};
/** 시가 15억 · 채무 6억(담보차입금) · K-4 실지 7억 — 엔진 M-0 */
const BG_MARKET = {
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "700000000",
  bgDonorRelation: "lineal_descendant",
  bgHousingAppraisalDeclared: "none",
  bgMortgageAttribution: "unallocated",
};
const mk = (over: Record<string, unknown> = {}, formOver: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", ...MIXED, ...BG_MARKET, ...over } as AssetForm],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
    ...formOver,
  }) as unknown as TransferFormData;

const issuesOf = (f: TransferFormData) => collectStepIssues(0, f as never);

interface BgMixedResult {
  total: { determinedTax: number };
  burdenedGift?: {
    assumedDebtAmount: number;
    perPart: Record<string, { transferred: boolean }>;
    debtAttribution: { housingDebt: number; commercialDebt: number };
  };
}

async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
        annualBasicDeductionUsed: 0, ...cap.body,
        isOneHousehold: f.isOneHousehold, householdHousingCount: parseInt(f.householdHousingCount), residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: { mode?: string; result?: BgMixedResult }; error?: unknown };
  return { status: res.status, body: cap.body!, data: json.data, json };
}

describe("겸용 × 부담부증여 — 화면 입력 → 엔진 (PR-3)", () => {
  it("[P-0] 정상 시드: ⑧ 이슈 0건", () => {
    expect(issuesOf(mk()).map((i) => i.message)).toEqual([]);
  });

  it("[P-1] 폼 → ④ → ⑫ → 엔진: 비1세대1주택 · 전부 구분 불분명 → 69,094,001 (엔진 M-0)", async () => {
    const r = await run(mk());
    expect(r.status).toBe(200);
    expect(r.data?.mode).toBe("mixed-use");
    expect(r.data?.result?.total.determinedTax).toBe(69_094_001);
    expect(r.data?.result?.burdenedGift?.assumedDebtAmount).toBe(600_000_000);
  });

  // ── 엔진 anchor와 같은 시나리오·같은 값을 «화면 폼»으로 재현 (UI 설계 §9.4) ─────────────────────────
  // 폼 → ⑧ 0건 → ④ → ⑫ → 엔진. 기대값은 엔진 anchor 테스트(`mixed-use-burdened-gift.anchor.test.ts`)와 같다.
  const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "", bgHousingAppraisalDeclared: "" };
  const ONE = { isOneHousehold: true, householdHousingCount: "1" };
  const tax = (r: Awaited<ReturnType<typeof run>>) => r.data?.result?.total.determinedTax;

  it.each([
    ["M-5 기준시가 모드(K-1~3)", STD, 60_939_200],
    ["M-7 시가 + K-5 환산", { bgAcquisitionMethod: "converted", bgActualAcquisitionTotal: "" }, 61_445_360],
    ["M-8 상가 귀속만", { bgMortgageAttribution: "commercial" }, 69_094_000],
    ["M-9′ 주택 귀속만(비1세대1주택)", { bgMortgageAttribution: "housing" }, 69_094_000],
    ["M-10b 상가 3억 + 불분명 3억(나누어 입력)", { bgMortgageAttribution: "split", bgMortgageSplitHousing: "0", bgMortgageSplitCommercial: "300000000", bgMortgageSplitUnallocated: "300000000" }, 69_094_001],
  ] as const)("[P-2] %s → ⑧ 0건, 세액이 엔진 anchor와 같다", async (_n, over, expected) => {
    const f = mk(over as Record<string, unknown>);
    expect(issuesOf(f).map((i) => i.message)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(tax(r)).toBe(expected);
  });

  it("[P-2b] 구분 감정평가 «있음»(G-13) — 주택분 시가 9억이 증여가액 분할 echo에 그대로 도달한다 (④ housingAppraisal → ⑫ → 엔진)", async () => {
    const f = mk({ bgHousingAppraisalDeclared: "exists", bgHousingAppraisalValue: "900000000" });
    expect(issuesOf(f).map((i) => i.message)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect((r.body.burdenedGiftInfo as Record<string, unknown>).housingAppraisal).toEqual({ exists: true, housingValue: 900_000_000 });
    const d = r.data!.result!.burdenedGift!.debtAttribution as unknown as { housingGiftValue: number; commercialGiftValue: number };
    expect([d.housingGiftValue, d.commercialGiftValue]).toEqual([900_000_000, 600_000_000]);
    // 짝 — «없음»이면 기준시가 비율(6억:6억)로 7.5억씩 나뉜다
    const none = await run(mk());
    const dn = none.data!.result!.burdenedGift!.debtAttribution as unknown as { housingGiftValue: number };
    expect(dn.housingGiftValue).toBe(750_000_000);
  });

  it("[P-3] 1세대1주택 · 거주 10년 · 전부 구분 불분명 → 25,125,000 (엔진 M-1, M-10′와 같은 값)", async () => {
    const f = mk({ residenceInputMode: "months", residencePeriodMonthsAsset: "120" }, ONE);
    expect(issuesOf(f).map((i) => i.message)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(tax(r)).toBe(25_125_000);
  });

  it("[P-4] 귀속 편중(M-8): 양도 없는 주택분은 echo에서 transferred=false이고 양도가액이 0이다", async () => {
    const r = await run(mk({ bgMortgageAttribution: "commercial" }));
    const bg = r.data!.result!.burdenedGift!;
    expect(bg.perPart.housingLand.transferred).toBe(false);
    expect(bg.perPart.commercialLand.transferred).toBe(true);
    expect(bg.debtAttribution.housingDebt).toBe(0);
    expect(bg.debtAttribution.commercialDebt).toBe(600_000_000);
  });

  it("[P-5] 🔴 split 분할 값은 보존되지만 모드가 split이 아니면 ④가 전송하지 않는다 (숨은 값으로 계산 금지)", async () => {
    const r = await run(mk({ bgMortgageAttribution: "unallocated", bgMortgageSplitHousing: "600000000" }));
    expect((r.body.burdenedGiftInfo as Record<string, unknown>).debtAttribution).toEqual({ housing: 0, commercial: 0, unallocated: 600_000_000 });
    expect(tax(r)).toBe(69_094_001);
  });

  it("[P-6] 🔴 ⑧ 순서·점프: 귀속 미선택 먼저 → 부분 초과(MB-14)는 마지막 — 귀속을 고르기 전에는 MB-14를 말하지 않는다", () => {
    expect(issuesOf(mk({ bgMortgageAttribution: "" }))[0]?.field).toBe("bgMortgageAttribution");
    const over = issuesOf(mk({ bgMortgageAttribution: "commercial", bgMortgageDebtAmount: "800000000" }))[0];
    expect(over?.field).toBe("bgMortgageAttribution");
    expect(over?.message).toMatch(/상가 부분의 증여가액/);
  });

  /** 엔진 MB-12가 거부하는 9개 키(`mixed-use-burdened-gift-prepare.ts` 「BG 입력 형태」) — ④ 겸용 분기가 실어서는 안 된다. */
  const MB12_KEYS = [
    "actualLandAcquisitionPrice", "actualBuildingAcquisitionPrice", "presumedLandAcquisitionPrice", "presumedBuildingAcquisitionPrice",
    "carryoverDonorBasis", "rightValuation", "assumedDebtOverride", "presumedExtensionAppraisalValue", "giftBuildingStdPriceAtTransfer",
  ] as const;

  it("[P-7] 🔴 stale 가드(실지) — 화면에서 숨은 토지·건물 분리 실지취득가·증여세용 건물 기준시가가 폼에 남아 있어도 ④가 MB-12 거부 키를 싣지 않는다", async () => {
    const stale = { bgActualAcquisitionLand: "1", bgActualAcquisitionBuilding: "1", bgGiftBuildingStdPriceAtTransfer: "1" };
    const r = await run(mk(stale));
    expect(r.status).toBe(200);
    expect(tax(r)).toBe(69_094_001);
    const info = r.body.burdenedGiftInfo as Record<string, unknown>;
    // 짝: 같은 시드의 총액(정본)은 실렸다 — 가드가 키를 통째로 지운 것이 아니다
    expect(info.actualAcquisitionTotal).toBe(700_000_000);
    for (const k of MB12_KEYS) expect(info[k], k).toBeUndefined();
  });

  it("[P-7a] 🔴 stale 가드(매매사례·감정) — 분리 추계 칸이 남아 있어도 총액만 싣는다", async () => {
    const stale = {
      bgAcquisitionMethod: "appraisal", bgActualAcquisitionTotal: "", bgPresumedAcquisitionTotal: "700000000",
      bgPresumedAcquisitionLand: "1", bgPresumedAcquisitionBuilding: "1",
    };
    const r = await run(mk(stale));
    expect(r.status).toBe(200);
    const info = r.body.burdenedGiftInfo as Record<string, unknown>;
    expect(info.presumedAcquisitionTotal).toBe(700_000_000);
    for (const k of MB12_KEYS) expect(info[k], k).toBeUndefined();
  });

  it("[P-7b] 🔴 stale 가드(builder 직접) — 이월과세·증축 감정 등 나머지 거부 키도 겸용 분기에서는 싣지 않는다 (짝: 비겸용은 실린다)", () => {
    const stale = {
      bgAcquisitionMethod: "appraisal", bgActualAcquisitionTotal: "", bgPresumedAcquisitionTotal: "700000000",
      bgCoDonorActualAcquisitionTotal: "1", bgGiftBuildingStdPriceAtTransfer: "1", bgActualAcquisitionLand: "1", bgPresumedAcquisitionLand: "1",
    };
    const keysOf = (a: AssetForm) => buildBurdenedGiftInfo(a, 0.5, "2024-03-01") as unknown as Record<string, unknown>;
    // 이월과세 취득원인 → carryoverDonorBasis
    const carry = mk({ ...stale, acquisitionCause: "carryover_gift" }).assets[0];
    expect(keysOf({ ...carry, isMixedUseHouse: false }).carryoverDonorBasis).toBeDefined();
    // 증축(매매 + 신축·증축 켬 + 감정가액) → presumedExtensionAppraisalValue
    const ext = mk({ ...stale, isSelfBuilt: true, buildingType: "extension", bgPresumedExtensionAppraisal: "1" }).assets[0];
    expect(keysOf({ ...ext, isMixedUseHouse: false }).presumedExtensionAppraisalValue).toBeDefined();
    expect(keysOf({ ...ext, isMixedUseHouse: false }).giftBuildingStdPriceAtTransfer).toBeDefined();
    // 겸용이면 위 9개 중 builder가 만들 수 있는 키가 전부 비어 있다
    for (const a of [carry, ext]) {
      const info = keysOf(a);
      for (const k of MB12_KEYS) expect(info[k], k).toBeUndefined();
    }
  });

  it("[P-8] 🔴 대조군 — 비겸용 BG body에는 debtAttribution·housingAppraisal이 실리지 않는다 (⑫가 거부하는 키)", async () => {
    const f = mk({ isMixedUseHouse: false, bgMortgageAttribution: "unallocated", bgHousingAppraisalDeclared: "none" });
    const r = await run(f);
    const info = r.body.burdenedGiftInfo as Record<string, unknown>;
    expect(info.debtAttribution).toBeUndefined();
    expect(info.housingAppraisal).toBeUndefined();
  });

  it("[P-9] 🔴 정적 anchor — ④ payload 키 ⊂ ⑫ 스키마 키: 겸용 BG body의 모든 키가 스키마에 등록돼 있다 (미등록이면 z.object가 침묵 strip)", async () => {
    const r = await run(mk());
    const schemaKeys = new Set(Object.keys(burdenedGiftInfoSchema.shape));
    const info = r.body.burdenedGiftInfo as Record<string, unknown>;
    const missing = Object.keys(info).filter((k) => !schemaKeys.has(k));
    expect(missing).toEqual([]);
    // 중첩 객체도 같은 규칙: 스키마가 알고 있는 하위 키만
    const nested = (burdenedGiftInfoSchema.shape.debtAttribution as unknown as { unwrap: () => { shape: Record<string, unknown> } }).unwrap().shape;
    expect(Object.keys(info.debtAttribution as object).filter((k) => !(k in nested))).toEqual([]);
    // 이 시나리오가 두 신규 키를 실제로 실었다 — 비어 있는 채로 통과하는 anchor 방지
    expect(info.debtAttribution).toBeDefined();
    expect(info.housingAppraisal).toBeDefined();
    expect(schemaKeys.has("debtAttribution") && schemaKeys.has("housingAppraisal")).toBe(true);
  });
});
