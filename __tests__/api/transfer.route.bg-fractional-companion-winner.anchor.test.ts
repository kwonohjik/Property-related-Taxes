/**
 * anchor — 함께 부담부증여에서 **지분 있는 컴패니언**: 컴패니언 채무만 지분율로 한 번 더 줄이던 ④ 를 축 B 로 한정 (계획서 `docs/00-pm/bg-fractional-companion-winner.plan.md` Q-1 a)
 *
 * 수정 전 ④ 는 같은 폼 채무를 주 자산에서는 축 B 일 때만 지분 안분하고(`transfer-tax-api-primary-context.ts` `bgInfoBase`) 컴패니언에서는 지분이면 언제나 안분했다
 * (`transfer-tax-api-companion-payload.ts` `buildBurdenedGiftInfo` 인자). ⑧·합산 info·채무 재배분은 채무를 지분 인수분 그대로 읽으므로 payload 를 읽는 ⑫ 만 승자를 다르게 읽었다:
 *   · 컴패니언 인수분 채무 > 지분 시가(담보평가 §66 승)인 혼합 승자가 ⑫ 를 통과해 증여가액이 ΣA 보다 작았다(증여세 24,250,000 / 43,650,000 과소).
 *   · 균일 비보충 승 지분 쌍은 ⑫ 를 통과했지만 양도차익이 21.9M ~ 60.4M 작았다(컴패니언 B/C 가 줄어든 채무로 계산).
 *   · 둘 다 담보 승인 균일 쌍(50/50 · D=6억)은 컴패니언만 보충 승으로 읽혀 ⑫ 400(거짓 차단).
 *
 * 오라클 두 가지:
 *   · 보충 승 영역 — 같은 사실을 「지분율 100% · 시가 r×V · 취득가액 ×r」로 옮긴 쌍(FC-1). 담보·임대 승 영역에서는 이 환산이 단건 지분 경로와도 안 맞아 오라클로 쓰지 못한다(단건 50% 834,350,000 vs 환산 1,017,175,000).
 *   · 균일 비보충 승 영역 — 자산별 **단건 지분 실행의 합**(FC-5). 담보·임대가 이기면 Aᵢ = Bᵢ 라 양도차익이 자산별로 가산된다.
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

const MK: Record<string, Record<string, string>> = {
  sup: { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "400,000,000", bgMortgageSetAmount: "400,000,000" },
  mort: { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" },
  ssup: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000" },
  smort: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "1,600,000,000", bgMortgageSetAmount: "1,600,000,000" },
  srent: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAnnualRentTotal: "200,000,000" },
};
/** 자산 하나만 계산한 단건 지분 실행의 양도차익(축 A — 채무는 지분 인수분). */
async function singleGain(a: AssetForm): Promise<number> {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets: [a] });
  const body = await captureBody(f as unknown as TransferFormData);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const j = (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(res.status).toBe(200);
  return j.data.aggregated.totalTransferGain as number;
}

describe("FC-2 D > 지분 시가(담보평가 §66 승) — 혼합 승자는 컴패니언이든 주 자산이든 ⑧ 게이트 · ⑫ 400", () => {
  it("D=6억 · 7억 (지분 50%): 컴패니언 ⑫ 400 (수정 전 200 · 증여세 24,250,000 / 43,650,000 과소) · 주 자산 ⑫ 400 (불변)", async () => {
    for (const d of ["600,000,000", "700,000,000"]) {
      const comp = await cell(pairOf("comp", F(d), "50"));
      const prim = await cell(pairOf("prim", F(d), "50"));
      expect([d, comp.gate > 0, comp.status, prim.gate > 0, prim.status]).toEqual([d, true, 400, true, 400]);
    }
  }, 120_000);
  it("지분 25%: 인수분 3억 · 5억 > 지분 시가 2.5억이면 컴패니언 ⑫ 400 (수정 전 200) · 보충+보충이던 쌍도 채무 4억 > 2.5억이면 혼합이라 400", async () => {
    for (const d of ["300,000,000", "500,000,000"]) {
      const comp = await cell(pairOf("comp", F(d), "25"));
      expect([d, comp.gate > 0, comp.status]).toEqual([d, true, 400]);
    }
    const supsup = await cell([gbAsset(1, x(MK.sup), own("100")), gbAsset(2, x(MK.sup), own("25"))]);
    const ssupssup = await cell([gbAsset(1, x(MK.ssup), own("100")), gbAsset(2, x(MK.ssup), own("25"))]);
    expect([supsup.gate > 0, supsup.status, ssupssup.gate > 0, ssupssup.status]).toEqual([true, 400, true, 400]);
  }, 120_000);
});

describe("FC-3 원인 — 같은 폼 채무 6억이 컴패니언·주 자산 payload 에서 같은 값(지분 인수분)으로 실린다", () => {
  it("컴패니언 F · 주 자산 F 모두 payload 채무 6억(수정 전 컴패니언 3억) · 합산 info 채무 10억(폼 값 합)·시가 15억(지분 축소 후 합)", async () => {
    // 주 자산이 F 인 쌍은 ⑫ 400 이라 payload 는 captureBody 로만 읽는다.
    const comp = await cell(pairOf("comp", F("600,000,000"), "50"));
    const prim = await cell(pairOf("prim", F("600,000,000"), "50"));
    expect(comp.body.companionAssets[0].burdenedGiftInfo.mortgageDebtAmount).toBe(600_000_000);
    expect(prim.body.burdenedGiftInfo.mortgageDebtAmount).toBe(600_000_000);
    for (const c of [comp, prim]) expect([c.body.burdenedGiftWholeInfo.mortgageDebtAmount, c.body.burdenedGiftWholeInfo.marketValueAtTransfer]).toEqual([1_000_000_000, 1_500_000_000]);
  }, 120_000);
});

describe("FC-4 주 자산·컴패니언이 모두 지분 — 혼합은 400 · 균일 담보 승은 ⑫ 200 (수정 전 거짓 차단)", () => {
  const frac = (d: string, rc: string) => cell([gbAsset(1, F(d), own("50")), gbAsset(2, F(d), own(rc))]);
  it("D=3억 · 50/50: 둘 다 보충 승 → ⑧ 통과 · 200 · 증여가액 1.0B · 증여세 58,200,000 (오라클 ±0)", async () => {
    const a = await frac("300,000,000", "50");
    const o = await cell([gbAsset(1, Fo("300,000,000"), own("100")), gbAsset(2, Fo("300,000,000"), own("100"))]);
    expect([a.gate, a.status, a.gross, a.giftTax]).toEqual([0, 200, 1_000_000_000, 58_200_000]);
    expect(nums(a)).toEqual(nums(o));
  }, 120_000);
  it("D=3억 · 50/25: 컴패니언 인수분 3억 > 지분 시가 2.5억(담보 승) → 혼합이라 ⑧ 게이트 · ⑫ 400 (수정 전 200 · 증여가액 7.5억 · ΣA 8.0억)", async () => {
    const a = await frac("300,000,000", "25");
    expect([a.gate > 0, a.status]).toEqual([true, 400]);
  }, 120_000);
  it("D=6억 · 50/50, 50/25: 둘 다 담보 승(균일)이라 ⑧ 게이트 · ⑫ 200 (수정 전 400 거짓 차단)", async () => {
    for (const rc of ["50", "25"]) {
      const a = await frac("600,000,000", rc);
      expect([rc, a.gate > 0, a.status]).toEqual([rc, true, 200]);
    }
  }, 120_000);
});

describe("FC-5 균일 비보충 승 지분 쌍 — 양도차익이 자산별 단건 지분 실행의 합과 ±0 (수정 전 21.9M ~ 60.4M 작았다)", () => {
  const CELLS: [string, string, string, string][] = [
    ["mort", "mort", "100", "50"], ["mort", "mort", "50", "50"], ["mort", "mort", "100", "25"],
    ["smort", "smort", "100", "50"], ["smort", "smort", "50", "50"], ["srent", "srent", "100", "50"], ["srent", "srent", "50", "50"],
    ["mort", "sup", "100", "25"], ["smort", "ssup", "100", "25"], // 컴패니언 인수분 4억·5억 > 지분 25% 시가 → 담보 승 → 균일 (수정 전 400)
  ];
  it("9셀: ⑫ 200 · 쌍의 양도차익 = 단건 지분 실행의 합", async () => {
    for (const [a, b, ra, rb] of CELLS) {
      const pr = await cell([gbAsset(1, x(MK[a]), own(ra)), gbAsset(2, x(MK[b]), own(rb))]);
      const sum = (await singleGain(gbAsset(1, x(MK[a]), own(ra)))) + (await singleGain(gbAsset(1, x(MK[b]), own(rb))));
      expect([`${a}+${b}@${ra}/${rb}`, pr.status, pr.gain]).toEqual([`${a}+${b}@${ra}/${rb}`, 200, sum]);
    }
  }, 240_000);
});
