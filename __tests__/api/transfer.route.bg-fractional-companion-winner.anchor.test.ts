/**
 * anchor — 함께 부담부증여에서 **지분 있는 컴패니언**: ⑧(폼 값)과 ⑫(payload 값)이 승자를 다르게 읽어 혼합 승자가 ⑫ 를 통과한다 (측정, 계획서 `docs/00-pm/bg-fractional-companion-winner.plan.md`)
 *
 * 오라클 = 이미 맞게 도는 경로. 지분 r 인 자산 F(시가 V · 채무 D = 지분 인수분)는 경제적으로 「지분율 100% · 시가 r×V · 취득가액 ×r · 채무 D」 자산 F' 와 같다.
 *   · 보충 승으로 끝나는 영역(D ≤ r×V)에서 F 와 F' 는 증여가액·증여세·양도차익·총세액이 ±0 으로 같다(FC-1) — 지분 컴패니언 처리 자체는 맞다.
 *   · D > r×V(채무 인수분이 지분 시가보다 큼 = 담보평가 §66 승)이면 F' 는 혼합 승자라 ⑧·⑫ 모두 막는데(#2746), F 가 **컴패니언**이면 ⑫ 만 통과한다(FC-2).
 *     같은 사실의 F 가 **주 자산**이면 ⑫ 도 막는다 — 주 자산과 컴패니언의 비대칭.
 *   · 원인(FC-3): ④ 가 컴패니언 payload 의 채무만 지분율로 한 번 더 줄이고(`transfer-tax-api-companion-payload.ts:514`), 주 자산은 그대로 둔다(`transfer-tax-api-primary-context.ts:226-232`).
 *     ⑫ 의 `bgBundleMixedWinner` 는 payload 를 읽으므로 컴패니언 D=600M 을 300M 으로 보고 보충 승으로 읽는다.
 *
 * 이 파일은 **현재 동작의 기록**이다 — FC-2 의 기대값이 결함이다(구현 PR 이 400 으로 뒤집는다).
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
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
};
const base = { transferType: "burdened_gift", transferCause: "general", bgDonorRelation: "lineal_descendant",
  bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "205000000", bgActualAcquisitionBuilding: "150000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: "2010-05-01", acquisitionDate: "2010-05-01", hasSeperateLandAcquisitionDate: false, bgLendingDepositTotal: "0" } as unknown as Partial<AssetForm>;
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, base, ...over) as AssetForm;
const own = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" }) as unknown as Partial<AssetForm>;
const x = (o: Record<string, string>) => o as unknown as Partial<AssetForm>;

/** 보충 승 파트너(시가 1.0B · 채무 0.4B · 지분 100%). */
const SUP = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "400,000,000", bgMortgageSetAmount: "400,000,000" };
const HALF_ACQ = { bgActualAcquisitionLand: "102500000", bgActualAcquisitionBuilding: "75000000", bgCoDonorLandStdPriceAtAcq: "5,000,000", bgCoDonorBuildingStdPriceAtAcq: "20,000,000" };
/** 지분 50% 자산 F — 시가 1.0B(물건 전체) · 채무 D(지분 인수분). */
const F = (d: string) => x({ ...SUP, bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
/** F' — 같은 사실을 지분율 100% 로 옮긴 오라클: 시가 r×V · 취득가액 ×r. */
const Fo = (d: string) => x({ ...SUP, ...HALF_ACQ, bgMarketValueAtTransfer: "500,000,000", bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
/** 보충 승으로 강제한 오라클 — 평가액 Aᵢ = D 가 되도록 시가를 D 로 두고 담보 설정액을 1,000 으로 눌러 담보평가가 못 이기게 한다(채무 D 는 그대로 인수). */
const Fs = (d: string) => x({ ...SUP, ...HALF_ACQ, bgMarketValueAtTransfer: d, bgMortgageDebtAmount: d, bgMortgageSetAmount: "1,000" });

const bundle = (assets: AssetForm[]): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" });
  return f as unknown as TransferFormData;
};
/** 파트너(보충 승)와 F 를 묶는다. role=comp 면 F 가 컴패니언, prim 이면 주 자산. */
const pairOf = (role: "comp" | "prim", f: Partial<AssetForm>, ratio: string): AssetForm[] =>
  role === "comp" ? [gbAsset(1, x(SUP), own("100")), gbAsset(2, f, own(ratio))] : [gbAsset(1, f, own(ratio)), gbAsset(2, x(SUP), own("100"))];

async function cell(assets: AssetForm[]) {
  const f = bundle(assets);
  const gate = allIssues(f).map(String).filter((m) => m.includes("함께 양도와 같이")).length;
  const body = (await captureBody(f)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const j = (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = res.status === 200 ? j.data.aggregated : undefined;
  return {
    body, gate, status: res.status,
    gross: g?.burdenedGift?.giftTax?.grossGiftValue as number | undefined, giftTax: g?.burdenedGift?.giftTax?.finalTax as number | undefined,
    gain: g?.totalTransferGain as number | undefined, tax: g?.totalTax as number | undefined,
  };
}
const nums = (c: Awaited<ReturnType<typeof cell>>) => [c.status, c.gross, c.giftTax, c.gain, c.tax];

describe("FC-1 보충 승 영역(D ≤ 지분 시가 5억) — 지분 컴패니언 · 지분 주 자산은 100% 등가 오라클과 ±0", () => {
  it("6셀(역할 2 × D 3): ⑧ 게이트 0 · 증여가액·증여세·양도차익·총세액이 오라클과 같다", async () => {
    for (const role of ["comp", "prim"] as const) {
      for (const d of ["200,000,000", "300,000,000", "500,000,000"]) {
        const frac = await cell(pairOf(role, F(d), "50"));
        const orc = await cell(pairOf(role, Fo(d), "100"));
        expect([role, d, frac.gate, nums(frac)]).toEqual([role, d, 0, nums(orc)]);
        expect(frac.status).toBe(200);
      }
    }
  }, 120_000);
});

describe("FC-2 D > 지분 시가(담보평가 §66 승) — 컴패니언일 때만 ⑫ 가 통과해 증여가액이 ΣA 보다 작다 (현재 동작의 기록 = 결함)", () => {
  it("D=6억: 주 자산 ⑫ 400 · 컴패니언 ⑫ 200 · 증여가액 1.5B(ΣA 1.6B) · 증여세 77,600,000 vs 같은 ΣA 오라클 101,850,000 = 24,250,000 과소", async () => {
    const prim = await cell(pairOf("prim", F("600,000,000"), "50"));
    const comp = await cell(pairOf("comp", F("600,000,000"), "50"));
    const orc = await cell(pairOf("comp", Fs("600,000,000"), "100"));
    expect([prim.gate > 0, prim.status]).toEqual([true, 400]);
    expect([comp.gate > 0, comp.status]).toEqual([true, 200]);
    expect([comp.gross, comp.giftTax, comp.gain, comp.tax]).toEqual([1_500_000_000, 77_600_000, 645_000_000, 169_026_000]);
    expect([orc.gate, orc.status, orc.gross, orc.giftTax]).toEqual([0, 200, 1_600_000_000, 101_850_000]);
    // 양도차익은 오라클의 취득가액이 실가 그대로(담보 승이면 기준시가로 강제되는 값과 다름)라 근사다 — 확인 필요.
    expect([orc.gain, orc.tax]).toEqual([667_187_500, 175_859_750]);
  }, 120_000);
  it("D=7억: 컴패니언 ⑫ 200 · 증여가액 1.5B(ΣA 1.7B) · 증여세 58,200,000 vs 오라클 101,850,000 = 43,650,000 과소", async () => {
    const prim = await cell(pairOf("prim", F("700,000,000"), "50"));
    const comp = await cell(pairOf("comp", F("700,000,000"), "50"));
    const orc = await cell(pairOf("comp", Fs("700,000,000"), "100"));
    expect([prim.gate > 0, prim.status]).toEqual([true, 400]);
    expect([comp.gate > 0, comp.status]).toEqual([true, 200]);
    expect([comp.gross, comp.giftTax, comp.gain, comp.tax]).toEqual([1_500_000_000, 58_200_000, 709_500_002, 188_892_001]);
    expect([orc.gate, orc.status, orc.gross, orc.giftTax, orc.gain, orc.tax]).toEqual([0, 200, 1_700_000_000, 101_850_000, 755_441_179, 203_620_677]);
  }, 120_000);
});

describe("FC-3 원인 — 같은 폼 채무 6억이 컴패니언 payload 에서만 3억으로 줄어 ⑫ 가 보충 승으로 읽는다", () => {
  it("컴패니언 F: payload 채무 3억(폼 6억 × 0.5) · 주 자산 F: payload 채무 6억 · 합산 info 채무 10억(폼 값 합)·시가 15억(지분 축소 후 합)", async () => {
    const comp = await cell(pairOf("comp", F("600,000,000"), "50"));
    const prim = await cell(pairOf("prim", F("600,000,000"), "50"));
    expect(comp.body.companionAssets[0].burdenedGiftInfo.mortgageDebtAmount).toBe(300_000_000);
    expect(prim.body.burdenedGiftInfo.mortgageDebtAmount).toBe(600_000_000);
    for (const c of [comp, prim]) expect([c.body.burdenedGiftWholeInfo.mortgageDebtAmount, c.body.burdenedGiftWholeInfo.marketValueAtTransfer]).toEqual([1_000_000_000, 1_500_000_000]);
  }, 120_000);
});

describe("FC-4 주 자산·컴패니언이 모두 지분 — 같은 비대칭이 반대 방향(거짓 차단)으로도 나온다 (현재 동작의 기록)", () => {
  /** 오라클 컴패니언: 지분율 100% · 시가 r×V. 주 자산 오라클은 항상 r=50% → 시가 5억. */
  const orc = async (d: string, rc: string) =>
    cell([gbAsset(1, Fo(d), own("100")), gbAsset(2, x({ ...SUP, ...HALF_ACQ, bgMarketValueAtTransfer: rc === "50" ? "500,000,000" : "250,000,000", bgMortgageDebtAmount: d, bgMortgageSetAmount: d }), own("100"))]);
  const frac = (d: string, rc: string) => cell([gbAsset(1, F(d), own("50")), gbAsset(2, F(d), own(rc))]);
  it("D=3억 · 50/50: 둘 다 보충 승 → ⑧ 통과 · 200 · 오라클과 ±0", async () => {
    const a = await frac("300,000,000", "50"); const o = await orc("300,000,000", "50");
    expect([a.gate, a.status, a.gross, a.giftTax]).toEqual([0, 200, 1_000_000_000, 58_200_000]);
    expect(nums(a)).toEqual(nums(o));
  }, 120_000);
  it("D=3억 · 50/25: 컴패니언 인수분 3억 > 지분 시가 2.5억(담보 승) → ⑧ 게이트 · ⑫ 200(증여가액 7.5억 · ΣA 8.0억 · 증여세 9,700,000) · 오라클은 혼합이라 ⑫ 400", async () => {
    const a = await frac("300,000,000", "25"); const o = await orc("300,000,000", "25");
    expect([a.gate > 0, a.status, a.gross, a.giftTax]).toEqual([true, 200, 750_000_000, 9_700_000]);
    expect([o.gate > 0, o.status]).toEqual([true, 400]);
  }, 120_000);
  it("D=6억 · 50/50, 50/25: 둘 다 담보 승(균일 — 오라클은 ⑫ 200) 인데 컴패니언 채무만 줄어 혼합으로 읽혀 ⑫ 400 (거짓 차단)", async () => {
    for (const rc of ["50", "25"]) {
      const a = await frac("600,000,000", rc); const o = await orc("600,000,000", rc);
      expect([rc, a.gate > 0, a.status, o.gate > 0, o.status]).toEqual([rc, true, 400, true, 200]);
    }
  }, 120_000);
});
