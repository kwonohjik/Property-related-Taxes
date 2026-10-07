/**
 * B1 Pre-Do anchor — 겸용주택 **별개 취득**(토지·건물 취득일 상이)의 파트별 취득가액 산정방식·취득가액.
 *
 * 설계서 `docs/02-design/features/mixed-use-separate-acq-per-part.engine.design.md`
 * 계획서 `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §5 B1·B1-V2 · 해석례 조사 `…authority-research.md`
 *
 * ## 구성
 * - (R) **회귀선** — 지금 통과하고 Do 후에도 **같은 리터럴**이어야 한다: 현행 총액 모델(환산·실가 총액·감정 총액·PHD) ·
 *       양도가액 4분할 불변 · 실가+PHD 차단 · `isSeparateAcquisition` 겸용 제외 유지(D-4 권장).
 * - (P) **현행 고정(Do 시 뒤집힘)** — 신규 필드 `mixedUse.separateAcquisition`이 지금은 ⑫에서 침묵 strip된다.
 *       부정형이므로 아래 (B)의 긍정 짝(R-B1)이 반드시 함께 있다.
 * - (B) **신규 동작 `it.skip`** — 기대값은 **독립 산식**(BigInt 정수 나눗셈·하드 리터럴)으로 적었다. 엔진 함수를 부르지 않는다.
 *       skip 해제 = B1 완료 기준. 세액(`total.transferTax`)은 파트 입력 모델이 아직 없어 Do에서 실측 후 고정한다(확인 필요).
 *
 * ## 가상 fixture (실제 신고 사례 아님)
 * 주택 100㎡ · 상가 100㎡ · 토지 200㎡(주택부수 100 · 상가부수 100) · 토지 2005-06-10 / 건물 2010-03-15 · 양도 2024-08-20 · 양도가 30억.
 * 취득시: 토지일 ㎡당 1.2M(가목 120M/120M) · 건물일 주택건물 나목 320M · 상가건물 80M · 건물일 개별주택가격 400M · 건물일 ㎡당 1.8M.
 * 양도시: H_T 1.6B · N_T 800M · 상가건물 100M · ㎡당 12M.
 * ⚠️ 세액은 mock 세율표(`makeMockRates`) 실측값(정본 아님).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { isSeparateAcquisition } from "@/lib/calc/transfer-tax-split-acq-mode";
import { makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

// ── 하네스 ───────────────────────────────────────────────────────────────
const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");
const P = 3_000_000_000;
type StdWithN = { housingBuildingPrice?: number };

function base(over: Record<string, unknown> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2010-03-15"),
    buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: {
      housingPrice: 1_600_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 12_000_000,
      housingBuildingPrice: 800_000_000,
    } as StdWithN,
    acquisitionStandardPrice: {
      housingPrice: 400_000_000,
      commercialBuildingPrice: 80_000_000,
      landPricePerSqm: 1_200_000,
      housingBuildingPrice: 380_000_000,
    } as StdWithN,
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as unknown as MixedUseAssetInput;
}
/** 별개 취득 — 토지 2005-06-10 / 건물 2010-03-15 (B0·γ1: 건물일 가목 1.8M·나목 320M) */
const sep = (extra: Record<string, unknown> = {}) => ({
  landAcquisitionDate: D("2005-06-10"),
  buildingAcquisitionDate: D("2010-03-15"),
  acquisitionStandardPrice: {
    housingPrice: 400_000_000,
    commercialBuildingPrice: 80_000_000,
    landPricePerSqm: 1_200_000,
    landPricePerSqmAtBuildingAcq: 1_800_000,
    housingBuildingPrice: 320_000_000,
  } as StdWithN,
  ...extra,
});
const ACTUAL = { useActualAcquisition: true, acquisitionActualTotalPrice: 900_000_000 };
const APPRAISAL = { useAppraisalSalesAcquisition: true, acquisitionActualTotalPrice: 900_000_000 };
/** PHD 별개 취득 — 토지 1998 / 건물 2000, 최초공시 2005-04-30. Sum_A = 토지일 가목 + 건물일 나목(대법원 97누15746 · 조심2008서1720) */
const phdSep = (extra: Record<string, unknown> = {}) => ({
  usePreHousingDisclosure: true,
  landAcquisitionDate: D("1998-01-01"),
  buildingAcquisitionDate: D("2000-01-01"),
  acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 30_000_000, landPricePerSqm: 500_000 },
  preHousingDisclosure: {
    firstDisclosureDate: D("2005-04-30"),
    firstDisclosureHousingPrice: 200_000_000,
    landPricePerSqmAtAcquisition: 500_000,
    buildingStdPriceAtAcquisition: 50_000_000,
    landPricePerSqmAtFirstDisclosure: 900_000,
    buildingStdPriceAtFirstDisclosure: 70_000_000,
    transferHousingPrice: 1_600_000_000,
    landPricePerSqmAtTransfer: 12_000_000,
    buildingStdPriceAtTransfer: 800_000_000,
  },
  ...extra,
});

function run(asset: MixedUseAssetInput, price = P) {
  const r = calcMixedUseTransferTax(price, TD, asset, rates);
  const h = r.housingPart;
  const c = r.commercialPart;
  return {
    h: {
      acq: [h.landAcqPrice, h.buildingAcqPrice] as const,
      ded: [h.landAppraisalDed, h.buildingAppraisalDed] as const,
      tp: [h.landTransferPrice, h.buildingTransferPrice] as const,
      gain: [h.landTransferGain, h.buildingTransferGain] as const,
    },
    c: {
      acq: [c.landAcqPrice, c.buildingAcqPrice] as const,
      ded: [c.landAppraisalDed, c.buildingAppraisalDed] as const,
      tp: [c.landTransferPrice, c.buildingTransferPrice] as const,
      gain: [c.landTransferGain, c.buildingTransferGain] as const,
    },
    tax: r.total.transferTax,
    proviso: r.necessaryExpenseProviso?.chosen,
    raw: r,
  };
}

/** 독립 재구현 — BigInt 정수 나눗셈(floor), 잔액 흡수. 엔진 `apportionByStdPrice`와 구현이 겹치지 않는다. */
const ap = (total: number, a: number, b: number) => {
  const l = Number((BigInt(total) * BigInt(a)) / BigInt(a + b));
  return [l, total - l] as const;
};
const pct3 = (v: number) => Math.floor((v * 3) / 100);

// 양도가액 4분할 — 모든 모드에서 같아야 한다(양도가액·양도시 안분은 B1이 건드리지 않는다)
const TP_H = [993_103_447, 662_068_966] as const; // 주택 토지·건물
const TP_C = [1_241_379_311, 103_448_276] as const; // 상가 토지·건물
// 현행 환산 모델 값(= 양쪽 환산) — 환산 파트의 정본(상대 파트 모드와 독립)
const EST_H = [112_852_664, 300_940_439] as const;
const EST_C = [124_137_930, 82_758_621] as const;
// 개산공제 base(= 현행 취득시 기준시가 basis): 주택 γ1 비례값 96M/256M · 상가 가목·나목 원값 120M/80M
const BASIS_H = [96_000_000, 256_000_000] as const;
const BASIS_C = [120_000_000, 80_000_000] as const;

// ═══════════════════════════════════════════════════════════════════════
// (R) 회귀선 — 수정 전후 같은 리터럴
// ═══════════════════════════════════════════════════════════════════════
describe("(R) 회귀선 — 현행 총액 모델은 신규 필드가 없으면 그대로", () => {
  it("R-1 별개 취득 환산(현행 유일한 별개 취득 모델 = 양쪽 환산): 주택 112,852,664/300,940,439 · 상가 124,137,930/82,758,621 · 개산공제 2.88M/7.68M·3.6M/2.4M · 680,547,003", () => {
    const r = run(base(sep()));
    expect(r.h.acq).toEqual(EST_H);
    expect(r.c.acq).toEqual(EST_C);
    expect(r.h.ded).toEqual([pct3(BASIS_H[0]), pct3(BASIS_H[1])]);
    expect(r.c.ded).toEqual([pct3(BASIS_C[0]), pct3(BASIS_C[1])]);
    expect(r.tax).toBe(680_547_003);
  });

  it("R-2 양도가액 4분할은 환산·실가 총액·감정 총액에서 모두 동일 — B1이 양도가액을 바꾸지 않는다는 증거", () => {
    for (const extra of [{}, ACTUAL, APPRAISAL]) {
      const r = run(base(sep(extra)));
      expect(r.h.tp).toEqual(TP_H);
      expect(r.c.tp).toEqual(TP_C);
    }
  });

  it("R-3 현행 실가 총액 모델(별개 취득): 총액 900M을 주택:상가 = H_A(건물일) 400M : (토지일 가목 120M + 건물일 상가건물 80M) 2:1로 600M/300M → 각 분 토지·건물 — 163,636,363/436,363,637 · 180M/120M · 개산공제 0 · 594,231,865", () => {
    const r = run(base(sep(ACTUAL)));
    expect(r.h.acq).toEqual([163_636_363, 436_363_637]);
    expect(r.c.acq).toEqual([180_000_000, 120_000_000]);
    expect(r.h.ded).toEqual([0, 0]);
    expect(r.c.ded).toEqual([0, 0]);
    expect(r.tax).toBe(594_231_865);
    // 같은 취득일이면 건물분이 다르다(304M 몫) — 별개 취득에서만 γ1 basis가 쓰인다
    expect(run(base(ACTUAL)).tax).toBe(611_249_483);
  });

  it("R-4 현행 감정 총액 모델: 취득가액은 실가와 같고 개산공제만 붙는다 — 588,622,345", () => {
    const r = run(base(sep(APPRAISAL)));
    expect(r.h.acq).toEqual([163_636_363, 436_363_637]);
    expect(r.h.ded).toEqual([2_880_000, 7_680_000]);
    expect(r.c.ded).toEqual([3_600_000, 2_400_000]);
    expect(r.tax).toBe(588_622_345);
  });

  it("R-5 현행 PHD 별개 취득(1998/2000, 환산): 주택 64,655,172/64,655,172 · 상가 51,724,137/31,034,483 · 809,196,027 — PHD는 토지일 가목 + 건물일 나목을 분자에 대입한다(Q3)", () => {
    const r = run(base(phdSep()));
    expect(r.h.acq).toEqual([64_655_172, 64_655_172]);
    expect(r.c.acq).toEqual([51_724_137, 31_034_483]);
    expect(r.h.ded).toEqual([1_875_000, 1_875_000]);
    expect(r.c.ded).toEqual([1_500_000, 900_000]);
    expect(r.tax).toBe(809_196_027);
  });

  it("R-6 단서(환산 + 큰 자본적지출): 현행 asset 단위 판정 'direct' — 양쪽 환산이면 B1 후에도 이 리터럴(584,582,624 · PHD 581,030,374)", () => {
    const e = run(base(sep({ capitalExpenditure: 900_000_000, transferExpense: 30_000_000 })));
    expect(e.proviso).toBe("direct");
    expect(e.tax).toBe(584_582_624);
    const p = run(base(phdSep({ capitalExpenditure: 900_000_000, transferExpense: 30_000_000 })));
    expect(p.proviso).toBe("direct");
    expect(p.tax).toBe(581_030_374);
  });

  it("R-7 현행 차단: 겸용 실가 + PHD 조합은 엔진 throw — B1은 이 총액 모델의 가드를 유지하고, 파트 모델(S-4)에서만 PHD × 실가 파트를 연다", () => {
    expect(() => run(base(phdSep(ACTUAL)))).toThrow(/미공시\(PHD\)/);
  });

  it("R-8 (D-4 권장 유지) `isSeparateAcquisition()`의 겸용 제외는 해제하지 않는다 — 겸용은 날짜가 달라도 false", () => {
    expect(
      isSeparateAcquisition({
        hasSeperateLandAcquisitionDate: true,
        landAcquisitionDate: "2005-06-10",
        acquisitionDate: "2010-03-15",
        assetKind: "housing",
        isMixedUseHouse: true,
      }),
    ).toBe(false);
    expect(
      isSeparateAcquisition({
        hasSeperateLandAcquisitionDate: true,
        landAcquisitionDate: "2005-06-10",
        acquisitionDate: "2010-03-15",
        assetKind: "housing",
        isMixedUseHouse: false,
      }),
    ).toBe(true);
  });

  it("R-9 환산 파트 취득가액은 상대 파트 모드와 독립(설계 불변식)의 전제 — 현행 환산 총액 = 주택 413,793,103(= 양도 주택분 × H_A ÷ H_T) · 상가 206,896,551", () => {
    const r = run(base(sep()));
    expect(r.h.acq[0] + r.h.acq[1]).toBe(413_793_103);
    expect(r.c.acq[0] + r.c.acq[1]).toBe(206_896_551);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (P) 현행 고정 — Do 시 뒤집힌다 (부정형: 긍정 짝 = (B) R-B1)
// ═══════════════════════════════════════════════════════════════════════
const L2 = 1_800_000;
function body(over: Record<string, unknown> = {}, mixedOver: Record<string, unknown> = {}) {
  return {
    transferPrice: P,
    acquisitionPrice: 900_000_000,
    acquisitionDate: "2010-03-15",
    transferDate: "2024-08-20",
    expenses: 0,
    useEstimatedAcquisition: true,
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 0,
    propertyType: "mixed-use-house" as const,
    ...over,
    mixedUse: {
      isMixedUseHouse: true as const,
      residentialFloorArea: 100,
      nonResidentialFloorArea: 100,
      buildingFootprintArea: 100,
      totalLandArea: 200,
      landAcquisitionDate: "2005-06-10",
      buildingAcquisitionDate: "2010-03-15",
      transferStandardPrice: {
        housingPrice: 1_600_000_000,
        commercialBuildingPrice: 100_000_000,
        landPricePerSqm: 12_000_000,
        housingBuildingPrice: 800_000_000,
      },
      acquisitionStandardPrice: {
        housingPrice: 400_000_000,
        commercialBuildingPrice: 80_000_000,
        landPricePerSqm: 1_200_000,
        landPricePerSqmAtBuildingAcq: L2,
        housingBuildingPrice: 320_000_000,
      },
      residencePeriodYears: 0,
      isOneHouseExempt: false,
      isMetropolitanArea: true,
      zoneType: "general_residential" as const,
      ...mixedOver,
    },
  };
}
async function post(payload: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return {
    status: res.status,
    json: (await res.json()) as {
      data?: {
        mode: string;
        result: {
          total: { determinedTax: number };
          housingPart: { landAcqPrice: number; buildingAcqPrice: number; landAppraisalDed: number; buildingAppraisalDed: number };
          commercialPart: { landAcqPrice: number; buildingAcqPrice: number };
        };
      };
      error?: unknown;
    },
  };
}
const SEP_AA = {
  landMode: "actual",
  buildingMode: "actual",
  landAcquisitionPrice: 500_000_000,
  buildingAcquisitionPrice: 400_000_000,
};

describe("(P) 현행 고정 — 신규 중첩 필드는 지금 ⑫에서 침묵 strip된다 (Do가 이 단언을 뒤집는다)", () => {
  it("P-1 mixedUse.separateAcquisition을 실어도 결과가 불변 — 주택 토지 취득가액 112,852,664 · 680,547,003 (환산 모델 그대로). 긍정 짝 = R-B1", async () => {
    const plain = await post(body());
    const withField = await post(body({}, { separateAcquisition: SEP_AA }));
    expect(plain.status).toBe(200);
    expect(withField.status).toBe(200);
    expect(withField.json.data!.result.housingPart.landAcqPrice).toBe(112_852_664);
    expect(withField.json.data!.result.total.determinedTax).toBe(680_547_003);
    expect(withField.json.data!.result.total.determinedTax).toBe(plain.json.data!.result.total.determinedTax);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (B) 신규 동작 — it.skip. 해제 = B1 완료 기준
// ═══════════════════════════════════════════════════════════════════════
describe("(B) B1 신규 동작 (skip — 설계서 §3·§7)", () => {
  /** S-1: 토지 파트 → 주택부수토지/상가부수토지 = 토지일 가목 비율(같은 필지 = 면적 비율) 120M : 120M */
  const landSplit = (v: number) => ap(v, 120_000_000, 120_000_000);
  /** S-2: 건물 파트 → 주택건물/상가건물 = 건물일 나목 비율 320M : 80M (용도별 계약액이 있으면 그 금액) */
  const bldSplit = (v: number) => ap(v, 320_000_000, 80_000_000);

  function expectParts(
    r: ReturnType<typeof run>,
    e: { hl: number; hb: number; cl: number; cb: number; dHL: number; dHB: number; dCL: number; dCB: number },
  ) {
    expect(r.h.acq).toEqual([e.hl, e.hb]);
    expect(r.c.acq).toEqual([e.cl, e.cb]);
    expect(r.h.ded).toEqual([e.dHL, e.dHB]);
    expect(r.c.ded).toEqual([e.dCL, e.dCB]);
    expect(r.h.tp).toEqual(TP_H);
    expect(r.c.tp).toEqual(TP_C);
    expect(r.h.gain).toEqual([TP_H[0] - e.hl - e.dHL, TP_H[1] - e.hb - e.dHB]);
    expect(r.c.gain).toEqual([TP_C[0] - e.cl - e.dCL, TP_C[1] - e.cb - e.dCB]);
  }

  it.skip("B-1 양쪽 실가(토지 500M·건물 400M): S-1 면적비 250M/250M · S-2 나목비 320M/80M · 개산공제 0 · 양도가액 불변 · 취득시 기준시가 H_A·L_b 불요(필수 술어가 모드 키)", () => {
    const [hl, cl] = landSplit(500_000_000);
    const [hb, cb] = bldSplit(400_000_000);
    expect([hl, cl, hb, cb]).toEqual([250_000_000, 250_000_000, 320_000_000, 80_000_000]);
    const r = run(
      base(
        sep({
          // H_A·L_b 없이도 계산된다 — 실가 파트는 γ1 basis를 쓰지 않는다
          acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 320_000_000 },
          separateAcquisition: SEP_AA,
        }),
      ),
    );
    expectParts(r, { hl, hb, cl, cb, dHL: 0, dHB: 0, dCL: 0, dCB: 0 });
  });

  it.skip("B-2 토지 실가 + 건물 감정(400M): 건물 파트만 개산공제 — 주택건물 basis 256M·상가건물 80M × 3% = 7,680,000·2,400,000 · 토지 파트 0", () => {
    const [hl, cl] = landSplit(500_000_000);
    const [hb, cb] = bldSplit(400_000_000);
    const r = run(
      base(sep({ separateAcquisition: { ...SEP_AA, buildingMode: "appraisal" } })),
    );
    expectParts(r, { hl, hb, cl, cb, dHL: 0, dHB: pct3(BASIS_H[1]), dCL: 0, dCB: pct3(BASIS_C[1]) });
    expect([pct3(BASIS_H[1]), pct3(BASIS_C[1])]).toEqual([7_680_000, 2_400_000]);
  });

  it.skip("B-3 토지 감정(500M) + 건물 실가(400M): 토지 파트만 개산공제 — 주택부수토지 basis 96M(γ1)·상가부수토지 120M × 3% = 2,880,000·3,600,000", () => {
    const [hl, cl] = landSplit(500_000_000);
    const [hb, cb] = bldSplit(400_000_000);
    const r = run(
      base(sep({ separateAcquisition: { ...SEP_AA, landMode: "appraisal" } })),
    );
    expectParts(r, { hl, hb, cl, cb, dHL: pct3(BASIS_H[0]), dHB: 0, dCL: pct3(BASIS_C[0]), dCB: 0 });
    expect([pct3(BASIS_H[0]), pct3(BASIS_C[0])]).toEqual([2_880_000, 3_600_000]);
  });

  it.skip("B-4 토지 실가(500M) + 건물 환산: 건물 환산 값은 양쪽 환산일 때와 같다(상대 파트 모드와 독립) — 300,940,439/82,758,621 · 개산공제 건물만", () => {
    const [hl, cl] = landSplit(500_000_000);
    const r = run(
      base(
        sep({
          separateAcquisition: { landMode: "actual", buildingMode: "estimated", landAcquisitionPrice: 500_000_000 },
        }),
      ),
    );
    expectParts(r, {
      hl, hb: EST_H[1], cl, cb: EST_C[1],
      dHL: 0, dHB: pct3(BASIS_H[1]), dCL: 0, dCB: pct3(BASIS_C[1]),
    });
  });

  it.skip("B-5 토지 환산 + 건물 실가(400M): 토지 환산 값 112,852,664/124,137,930(양쪽 환산 값과 동일) · 개산공제 토지만 2,880,000/3,600,000", () => {
    const [hb, cb] = bldSplit(400_000_000);
    const r = run(
      base(
        sep({
          separateAcquisition: { landMode: "estimated", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 },
        }),
      ),
    );
    expectParts(r, {
      hl: EST_H[0], hb, cl: EST_C[0], cb,
      dHL: pct3(BASIS_H[0]), dHB: 0, dCL: pct3(BASIS_C[0]), dCB: 0,
    });
  });

  it.skip("B-6 양쪽 환산을 파트 모델 필드로 보내도 현행 총액-환산 모델과 1원 동일(동치) — 680,547,003", () => {
    const r = run(base(sep({ separateAcquisition: { landMode: "estimated", buildingMode: "estimated" } })));
    expect(r.h.acq).toEqual(EST_H);
    expect(r.c.acq).toEqual(EST_C);
    expect(r.tax).toBe(680_547_003);
  });

  it.skip("B-7 S-2 용도별 계약액 우선(건물 실가 총액 400M 중 주택건물 도급 300M): 주택건물 300M · 상가건물 100M(= 총액 − 주택건물, 도출) — 나목 비율 320M/80M을 쓰지 않는다", () => {
    const r = run(
      base(
        sep({
          separateAcquisition: { ...SEP_AA, housingBuildingContractPrice: 300_000_000 },
        }),
      ),
    );
    expect(r.h.acq[1]).toBe(300_000_000);
    expect(r.c.acq[1]).toBe(100_000_000);
    expect(r.h.acq[0]).toBe(250_000_000);
    expect(r.c.acq[0]).toBe(250_000_000);
  });

  it.skip("B-8 매매사례 토지(520M) + 건물 실가: 토지 파트는 salesCase 값으로 분할(260M/260M)·개산공제 · `landSalesCaseValue`가 값 필드 (감정은 landAcquisitionPrice 공용 — 단건 주택 split 규약)", () => {
    const [hl, cl] = landSplit(520_000_000);
    const [hb, cb] = bldSplit(400_000_000);
    const r = run(
      base(
        sep({
          separateAcquisition: {
            landMode: "salesCase", buildingMode: "actual",
            landSalesCaseValue: 520_000_000, buildingAcquisitionPrice: 400_000_000,
          },
        }),
      ),
    );
    expectParts(r, { hl, hb, cl, cb, dHL: pct3(BASIS_H[0]), dHB: 0, dCL: pct3(BASIS_C[0]), dCB: 0 });
  });

  it.skip("B-9 S-4 PHD × 파트 모델: 토지 실가 300M + 건물 환산 — 토지 150M/150M(S-1: 토지일 ㎡당 500k 면적비) · 건물 환산은 PHD 값 64,655,172/31,034,483 · 개산공제 건물만 1,875,000/900,000 (R-5와 같은 건물 값)", () => {
    const [hl, cl] = ap(300_000_000, 50_000_000, 50_000_000);
    expect([hl, cl]).toEqual([150_000_000, 150_000_000]);
    const r = run(
      base(
        phdSep({
          separateAcquisition: { landMode: "actual", buildingMode: "estimated", landAcquisitionPrice: 300_000_000 },
        }),
      ),
    );
    expectParts(r, {
      hl, hb: 64_655_172, cl, cb: 31_034_483,
      dHL: 0, dHB: 1_875_000, dCL: 0, dCB: 900_000,
    });
  });

  it.skip("B-10 §97②2호 단서는 **환산 파트 묶음**으로 판정: 양쪽 환산 + 큰 자본적지출 = 현행과 동일 'direct' 584,582,624(R-6 승계) — 한쪽만 환산이면 그 쪽(토지측/건물측)만 비교하고 실가 파트는 §97②1호 가산", () => {
    const both = run(
      base(
        sep({
          separateAcquisition: { landMode: "estimated", buildingMode: "estimated" },
          capitalExpenditure: 900_000_000, transferExpense: 30_000_000,
        }),
      ),
    );
    expect(both.proviso).toBe("direct");
    expect(both.tax).toBe(584_582_624);
  });

  it.skip("B-11 결합 제외 가드(엔진 throw): 파트 모델 + 용도변경 / 공익수용 / 상속·증여 / 총액 모델 플래그 동시 / 같은 취득일 / 값 누락", () => {
    const sepAa = { separateAcquisition: SEP_AA };
    expect(() =>
      run(base(sep({ ...sepAa, partialUsageChange: { direction: "house_to_commercial", usageChangeDate: D("2018-01-01") } }))),
    ).toThrow();
    expect(() => run(base(sep({ ...sepAa, transferCause: "public_expropriation" })))).toThrow();
    expect(() => run(base(sep({ ...sepAa, acquisitionByInheritance: true })))).toThrow();
    expect(() => run(base(sep({ ...sepAa, acquisitionByGift: true })))).toThrow();
    expect(() => run(base(sep({ ...sepAa, ...ACTUAL })))).toThrow(); // 총액 모델과 동시 지정 = 두 번째 override가 첫째를 가리는 상태
    expect(() => run(base({ ...sepAa }))).toThrow(); // 두 취득일이 같다 — 별개 취득 아님
    expect(() =>
      run(base(sep({ separateAcquisition: { landMode: "actual", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 } }))),
    ).toThrow(); // 토지 실가 미입력 — 자동 안분 fallback 금지
  });

  it.skip("R-B1 (P-1의 긍정 짝) Route: separateAcquisition이 ⑫를 통과해 엔진에 도달 — 주택 토지 250,000,000 · 건물 320,000,000 · 상가 250,000,000/80,000,000 · 값을 바꾸면 결과가 바뀐다(strip 아님)", async () => {
    const a = await post(body({}, { separateAcquisition: SEP_AA }));
    expect(a.status).toBe(200);
    const r = a.json.data!.result;
    expect([r.housingPart.landAcqPrice, r.housingPart.buildingAcqPrice]).toEqual([250_000_000, 320_000_000]);
    expect([r.commercialPart.landAcqPrice, r.commercialPart.buildingAcqPrice]).toEqual([250_000_000, 80_000_000]);
    const b = await post(body({}, { separateAcquisition: { ...SEP_AA, landAcquisitionPrice: 600_000_000 } }));
    expect(b.json.data!.result.housingPart.landAcqPrice).toBe(300_000_000);
  });

  it.skip("R-B2 Route 400: 총액 모델 플래그와 동시(useActualAcquisition) · 값 누락 · 같은 취득일 · 용도별 계약액 > 건물 총액", async () => {
    const conflict = await post(body({}, { separateAcquisition: SEP_AA, useActualAcquisition: true, acquisitionActualTotalPrice: 900_000_000 }));
    expect(conflict.status).toBe(400);
    const noLand = await post(body({}, { separateAcquisition: { landMode: "actual", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 } }));
    expect(noLand.status).toBe(400);
    expect(JSON.stringify(noLand.json)).toContain("landAcquisitionPrice");
    const sameDate = await post(body({}, { separateAcquisition: SEP_AA, landAcquisitionDate: "2010-03-15" }));
    expect(sameDate.status).toBe(400);
    const overContract = await post(body({}, { separateAcquisition: { ...SEP_AA, housingBuildingContractPrice: 450_000_000 } }));
    expect(overContract.status).toBe(400);
  });

  it.skip("R-B3 필수 술어는 모드 키(⑧ 8번째 동기화): 양쪽 실가면 H_A·L_b·건물일 개별주택가격 없이 200 · 한쪽이라도 비-실가(감정)면 H_A 없이 400(housingPrice)", async () => {
    const noHA = {
      housingPrice: undefined as number | undefined,
      commercialBuildingPrice: 80_000_000,
      landPricePerSqm: 1_200_000,
      housingBuildingPrice: 320_000_000,
    };
    const ok = await post(body({}, { acquisitionStandardPrice: noHA, separateAcquisition: SEP_AA }));
    expect(ok.status).toBe(200);
    const bad = await post(body({}, { acquisitionStandardPrice: noHA, separateAcquisition: { ...SEP_AA, buildingMode: "appraisal" } }));
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.json)).toContain("housingPrice");
  });
});
