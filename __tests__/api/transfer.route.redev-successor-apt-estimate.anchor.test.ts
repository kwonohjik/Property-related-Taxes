/**
 * 승계조합원 완공 아파트 — 취득가액 추계(감정가액·매매사례가액·환산취득가액) 지원 (계획서 `docs/02-design/features/redev-successor-apt-estimate.plan.md`).
 *
 * Q-1 a — 매매로 승계한 완공 APT(부담부증여 제외)는 추계 3종을 고를 수 있다. 계산은 「취득일 = 사용승인일인 일반 주택」과 같다
 *   (소득세법 시행령 §162①4호 · §176의2③ · §163⑥). 목표치는 계획서 §1.2 대조 H1~H3.
 * Q-2 a — §114의2 가산세는 적용하지 않고 결과에 「확인 필요」를 고지한다(감정가액·환산취득가액 · 사용승인일부터 5년 안).
 * 상속·증여·부담부증여 승계는 종전대로 추계 플래그를 읽지 않는다.
 *
 * 시료(#2582 anchor와 같은 값): 인가 2016-02-20 · 승계취득 2020-04-15 · 준공 2022-12-02 · 2023-02-16 양도 920,000,000 ·
 * 양도시 기준시가 600,000,000 · 취득시 기준시가 300,000,000(개산공제 9,000,000). 세율 mock.
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
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { buildRedevAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { buildRedevExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SUCC: Record<string, unknown> = {
  addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2020-04-15",
  actualSalePrice: "920,000,000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2016-02-20",
  redevIsSuccessorMember: "yes", redevCompletionDate: "2022-12-02", redevSettlementDirection: "pay", redevSettlementAmount: "0",
  redevPreApprovalExpenses: "0", redevPostApprovalExpenses: "0", fixedAcquisitionPrice: "450,000,000", standardPriceAtTransfer: "600,000,000",
};
const STD = { standardPriceAtAcq: "300,000,000" };
const APPRAISAL = { isAppraisalAcquisition: true, ...STD }; // 감정가액은 같은 칸(fixedAcquisitionPrice 450,000,000)
const SALES = { isSalesCaseAcquisition: true, similarSalesValue: "500,000,000", fixedAcquisitionPrice: "", ...STD };
const CONVERTED = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", ...STD };
const BG = {
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920,000,000",
  bgMortgageDebtAmount: "300,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "450,000,000", fixedAcquisitionPrice: "",
};
const HOUSE = {
  addressJibun: "제주특별자치도 강남구 테스트동 2-2", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase",
  acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "200,000,000",
};
const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: "920000000", assets: [{ ...makeDefaultAsset(1), ...SUCC, ...a } as AssetForm],
  }) as TransferFormData;
const bundle = (a: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: "1220000000",
    assets: [{ ...makeDefaultAsset(1), ...HOUSE } as AssetForm, { ...makeDefaultAsset(2), ...SUCC, ...a } as AssetForm],
  }) as TransferFormData;

async function run(f: TransferFormData, mutate?: (body: Loose) => void) {
  const issues = allIssues(f);
  const body = (await captureBody(f)) as Loose;
  mutate?.(body);
  const r = await postTransfer(body);
  const result = r.result as Loose | undefined;
  return {
    fields: issues.map((i) => i.field),
    body,
    status: r.status,
    fieldErrors: Object.keys(r.json?.error?.fieldErrors ?? {}),
    result,
    gain: result?.transferGain as number | undefined,
    tax: result?.calculatedTax as number | undefined,
    warnings: (result?.warnings ?? []) as string[],
    total: r.json?.data?.aggregated?.determinedTax as number | undefined,
    json: r.json as Loose,
  };
}
const has114_2Notice = (w: string[]) => w.some((s) => s.includes("제114조의2"));

describe("E — 매매 승계 완공 APT 추계 3종 = 취득일이 사용승인일인 일반 주택(계획서 §1.2 H1~H3)", () => {
  it("E-0 실거래가 450,000,000 → 470,000,000 · 327,250,000 (종전과 같다)", async () => {
    const r = await run(single());
    expect(r.fields).toEqual([]);
    expect(r.body.acquisitionMethod).toBe("actual");
    expect(r.gain).toBe(470_000_000);
    expect(r.tax).toBe(327_250_000);
    expect(has114_2Notice(r.warnings)).toBe(false);
  });
  it("E-1 감정가액 450,000,000 · 취득시 기준시가 300,000,000 → 920 − 450 − 개산공제 9 = 461,000,000 · 320,950,000", async () => {
    const r = await run(single(APPRAISAL));
    expect(r.fields).toEqual([]);
    expect(r.body.acquisitionMethod).toBe("appraisal");
    expect(r.body.appraisalValue).toBe(450_000_000);
    expect(r.body.standardPriceAtAcquisition).toBe(300_000_000);
    expect(r.status).toBe(200);
    expect(r.gain).toBe(461_000_000);
    expect(r.tax).toBe(320_950_000);
    const d = r.result?.redevelopmentDetail;
    expect(d.postApprovalExistingHouse.apportionedAcquisition).toBe(450_000_000);
    expect(d.postApprovalExistingHouse.expenses).toBe(9_000_000);
    expect(d.successorMemberDetail.acquisitionMethod).toBe("appraisal");
    expect(d.successorMemberDetail.estimatedDeduction).toBe(9_000_000);
  });
  it("E-2 매매사례가액 500,000,000 → 920 − 500 − 9 = 411,000,000 · 285,950,000", async () => {
    const r = await run(single(SALES));
    expect(r.fields).toEqual([]);
    expect(r.body.acquisitionMethod).toBe("salesCase");
    expect(r.body.similarSalesValue).toBe(500_000_000);
    expect(r.gain).toBe(411_000_000);
    expect(r.tax).toBe(285_950_000);
    expect(r.result?.redevelopmentDetail.successorMemberDetail.acquisitionMethod).toBe("salesCase");
  });
  it("E-3 환산 300/600 → 920 − 460(= 920 × 300/600) − 9 = 451,000,000 · 313,950,000", async () => {
    const r = await run(single(CONVERTED));
    expect(r.fields).toEqual([]);
    expect(r.body.useEstimatedAcquisition).toBe(true);
    expect(r.body.standardPriceAtTransfer).toBe(600_000_000);
    expect(r.gain).toBe(451_000_000);
    expect(r.tax).toBe(313_950_000);
    const d = r.result?.redevelopmentDetail;
    expect(d.postApprovalExistingHouse.apportionedAcquisition).toBe(460_000_000);
    expect(d.successorMemberDetail.acquisitionMethod).toBe("converted");
  });
  it("E-4 추계면 인가 후 필요경비를 빼지 않는다(§97②2호 본문 — 개산공제만) · 실거래가는 종전대로 뺀다", async () => {
    expect((await run(single({ ...APPRAISAL, redevPostApprovalExpenses: "50,000,000" }))).gain).toBe(461_000_000);
    expect((await run(single({ ...SALES, redevPostApprovalExpenses: "50,000,000" }))).gain).toBe(411_000_000);
    expect((await run(single({ redevPostApprovalExpenses: "50,000,000" }))).gain).toBe(420_000_000);
  });
  it("E-5 환산 · 자본적지출 등 500,000,000 > 환산 460,000,000 + 개산공제 9,000,000 → §97②2호 단서: 920 − 500 = 420,000,000", async () => {
    const r = await run(single({ ...CONVERTED, redevPostApprovalExpenses: "500,000,000" }));
    expect(r.fields).toEqual([]);
    expect(r.gain).toBe(420_000_000);
    const d = r.result?.redevelopmentDetail;
    expect(d.postApprovalExistingHouse.apportionedAcquisition).toBe(0);
    expect(d.postApprovalExistingHouse.expenses).toBe(500_000_000);
  });
  it("E-6 API — 감정가액 방식을 직접 보내도 개산공제가 붙는다(종전 470,000,000 — 계획서 §1.1 S1)", async () => {
    const r = await run(single(), (b) => {
      b.acquisitionMethod = "appraisal";
      b.appraisalValue = 450_000_000;
      b.acquisitionPrice = 0;
      b.standardPriceAtAcquisition = 300_000_000;
    });
    expect(r.status).toBe(200);
    expect(r.gain).toBe(461_000_000);
  });
});

describe("V — ⑧ 추계 칸 필수 (화면에 있는 칸으로 점프)", () => {
  it("V-1 감정가액 · 취득시 기준시가 비움 → standardPriceAtAcq", async () => {
    expect((await run(single({ ...APPRAISAL, standardPriceAtAcq: "" }))).fields).toEqual(["standardPriceAtAcq"]);
  });
  it("V-2 감정가액 비움 → fixedAcquisitionPrice(감정가액 칸)", async () => {
    expect((await run(single({ ...APPRAISAL, fixedAcquisitionPrice: "" }))).fields).toEqual(["fixedAcquisitionPrice"]);
  });
  it("V-3 매매사례가액 비움 → similarSalesValue · 기준시가 비움 → standardPriceAtAcq", async () => {
    expect((await run(single({ ...SALES, similarSalesValue: "" }))).fields).toEqual(["similarSalesValue"]);
    expect((await run(single({ ...SALES, standardPriceAtAcq: "" }))).fields).toEqual(["standardPriceAtAcq"]);
  });
  it("V-4 환산 · 취득시 기준시가 비움 → standardPriceAtAcq · 양도시 기준시가 비움 → standardPriceAtTransfer", async () => {
    expect((await run(single({ ...CONVERTED, standardPriceAtAcq: "" }))).fields).toEqual(["standardPriceAtAcq"]);
    expect((await run(single({ ...CONVERTED, standardPriceAtTransfer: "" }))).fields).toEqual(["standardPriceAtTransfer"]);
  });
});

describe("K — §114의2 가산세: 적용하지 않고 고지한다(Q-2 a)", () => {
  it("K-1 감정가액·환산(사용승인일부터 5년 안) → 고지 있음 · 가산세 0", async () => {
    for (const over of [APPRAISAL, CONVERTED]) {
      const r = await run(single(over));
      expect(has114_2Notice(r.warnings), JSON.stringify(over)).toBe(true);
      expect(r.result?.penaltyTax ?? 0, JSON.stringify(over)).toBe(0);
    }
  });
  it("K-2 매매사례가액 · 실거래가 → 고지 없음(§114의2는 감정가액·환산취득가액만)", async () => {
    expect(has114_2Notice((await run(single(SALES))).warnings)).toBe(false);
    expect(has114_2Notice((await run(single())).warnings)).toBe(false);
  });
  it("K-3 사용승인일부터 5년이 지난 양도 → 고지 없음", async () => {
    const f = single(APPRAISAL);
    f.transferDate = "2028-01-10";
    f.filingDate = "2028-03-31";
    expect(has114_2Notice((await run(f)).warnings)).toBe(false);
  });
});

describe("U — 상속·증여·부담부증여 승계는 종전대로 추계 플래그를 읽지 않는다", () => {
  it("U-1 증여 승계 · 남은 감정가액 플래그 → 증여 신고가액 450,000,000 · actual · 327,250,000", async () => {
    const r = await run(single({ acquisitionCause: "gift", ...APPRAISAL }));
    expect(r.fields).toEqual([]);
    expect(r.body.acquisitionMethod).toBe("actual");
    expect(r.tax).toBe(327_250_000);
  });
  it("U-2 부담부증여 매매 승계 · 남은 감정·환산 플래그 → §159 안분 값 그대로 153,260,870", async () => {
    for (const over of [APPRAISAL, { useEstimatedAcquisition: true, ...STD }]) {
      const r = await run(single({ ...BG, ...over }));
      expect(r.fields, JSON.stringify(over)).toEqual([]);
      expect(r.gain, JSON.stringify(over)).toBe(153_260_870);
    }
  });
});

describe("U′ — API로 추계 방식을 보내도 상속 승계는 평가액으로 계산한다(엔진 「매매 승계만」 게이트)", () => {
  it("U-3 상속 승계 · 본문에 감정가액 방식 · 감정가액 999,000,000 → 상속개시일 평가액 450,000,000으로 계산 · 470,000,000", async () => {
    const INH = { acquisitionCause: "inheritance", fixedAcquisitionPrice: "", publishedValueAtInheritance: "450,000,000", inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "2010-01-01" };
    const base = await run(single(INH));
    expect(base.status).toBe(200);
    const r = await run(single(INH), (b) => {
      b.acquisitionMethod = "appraisal";
      b.appraisalValue = 999_000_000;
      b.standardPriceAtAcquisition = 300_000_000;
    });
    // 상속 평가 단계(STEP 0.45)가 산정 방식을 실거래가로 정리한다 — 엔진 「매매 승계만」 게이트(`successorEstimateOf`)는 그 뒤의 방어선이다.
    expect(r.status).toBe(200);
    expect(r.gain).toBe(base.gain);
    expect(r.gain).toBe(470_000_000);
  });
});

describe("C — 함께 양도(둘째 자산) 승계 APT 추계 · ⑥ 사이드바", () => {
  it("C-1 컴패니언 감정가액 → 본문 appraisal · 안분 양도가액 915,000,000(= 1,220,000,000 × 600/800) − 450,000,000 − 개산공제 9,000,000 = 456,000,000", async () => {
    const r = await run(bundle(APPRAISAL));
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.companionAssets[0].acquisitionMethod).toBe("appraisal");
    const props = r.json?.data?.aggregated?.properties as Loose[];
    expect(props[1].transferGain).toBe(456_000_000);
    // 실거래가 대조 — 개산공제가 없고 같은 안분 양도가액: 915,000,000 − 450,000,000 = 465,000,000
    expect(((await run(bundle())).json?.data?.aggregated?.properties as Loose[])[1].transferGain).toBe(465_000_000);
  });
  it("C-2 사이드바 — 추계 승계 APT는 필요경비를 「계산 후 표시」로 미룬다(개산공제 · 일반 주택과 같다)", () => {
    const row = (over: Record<string, unknown>) => computeTransferPerAssetSummary(single(over), null).rows[0];
    expect(row(APPRAISAL).expensePending).toBe(true);
    expect(row({}).expensePending).toBe(false);
  });
});

describe("D — 계산명세서 산식(⑦)이 엔진 값을 그대로 적는다", () => {
  const formulas = async (over: Record<string, unknown>) => {
    const d = (await run(single(over))).result?.redevelopmentDetail;
    return { acq: buildRedevAcquisitionFormula("postApprovalExistingHouse", d), exp: buildRedevExpenseFormula("postApprovalExistingHouse", d) };
  };
  it("D-1 감정가액 → 「감정가액 = 450,000,000」 · 「개산공제 = 사용승인일 당시 기준시가 300,000,000 × 개산공제율 = 9,000,000」", async () => {
    const f = await formulas(APPRAISAL);
    expect(f.acq).toContain("감정가액 = 450,000,000");
    expect(f.exp).toContain("개산공제 = 사용승인일 당시 기준시가 300,000,000 × 개산공제율 = 9,000,000");
  });
  it("D-2 환산 → 「환산취득가액 = 양도가액 920,000,000 × (사용승인일 당시 기준시가 300,000,000를 양도 당시 기준시가로 나눈 비율) = 460,000,000」", async () => {
    expect((await formulas(CONVERTED)).acq).toContain("환산취득가액 = 양도가액 920,000,000 × (사용승인일 당시 기준시가 300,000,000를 양도 당시 기준시가로 나눈 비율) = 460,000,000");
  });
  it("D-3 §97②2호 단서 채택 → 취득가액 행 「환산취득가액 차감 안 함」 · 필요경비 행 자본적지출·양도비 등 500,000,000", async () => {
    const f = await formulas({ ...CONVERTED, redevPostApprovalExpenses: "500,000,000" });
    expect(f.acq).toContain("환산취득가액 차감 안 함");
    expect(f.exp).toContain("자본적지출·양도비 등 500,000,000");
  });
  it("D-4 실거래가는 종전 표시 그대로(추계 산식을 쓰지 않는다)", async () => {
    const f = await formulas({});
    expect(f.acq).not.toContain("감정가액");
    expect(f.exp).not.toContain("개산공제 =");
  });
});
