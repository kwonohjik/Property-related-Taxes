/**
 * 승계조합원 완공 APT — 결과 카드·계산명세서가 §166 안분 문구(「권리가액」 등)를 쓰지 않는다
 * (계획서 `docs/02-design/features/redev-successor-actual-result-wording.plan.md` Q-1 a · Q-2 a · Q-3 a).
 *
 * 종전: 값은 맞고 문구가 안분 구조였다 — 카드 「− 권리가액(상속·증여 평가액)」 · 3분할 표 「안분 취득가액(=권리가액)」 ·
 *       명세서 「920,000,000 × (0 ÷ 0) …」 · 「의제 = 권리가액 = … (§166②1호 안분 분자)」.
 * 시료: #2940 route anchor와 같다(입주권 승계 2020-04-15 · 준공 2022-12-02 · 양도 920,000,000 · 승계 취득가액 450,000,000).
 * 대조군: 원조합원(§166 안분)의 문구는 그대로(기존 `DetailedStatementRedevelopmentBuilders.test.ts`가 고정한다).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { applyRedevelopmentOverrides } from "@/components/calc/results/transfer/DetailedStatementRedevOverrides";
import { buildRedevPerAssetForTransfer, buildRedevPerAssetForAcquisition, buildRedevPerAssetForGain } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";

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


afterEach(cleanup);
const INH = { acquisitionCause: "inheritance", fixedAcquisitionPrice: "", publishedValueAtInheritance: "450,000,000", inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "2010-01-01" };
const CAUSES: [string, Record<string, unknown>][] = [
  ["매매 실거래가", {}],
  ["증여", { acquisitionCause: "gift" }],
  ["상속", INH],
  ["부담부증여 매매", BG],
  ["매매 감정가액", APPRAISAL],
];
const OLD = /권리가액|분양가 안분|안분 분자|\(0 ÷ 0\)|안분 취득가액|안분 양도가액|의제 =/;
const PAIR: Record<string, number> = {};

describe.each(CAUSES)("%s", (name, over) => {
  it("① 결과 카드 — 「권리가액」·안분 문구가 없고 「취득가액」 행이 있다", async () => {
    const r = await run(single(over));
    expect(r.status).toBe(200);
    const d = r.result?.redevelopmentDetail;
    const { container } = render(React.createElement(RedevelopmentDetailCard, { detail: d }));
    const text = container.textContent ?? "";
    expect(text).not.toMatch(OLD);
    expect(text).toContain("취득가액");
    expect(text).toContain("소득세법 시행령 §162①4호");
    PAIR[name] = r.gain as number;
  });

  it("② 계산명세서 — 양도가액·취득가액·양도차익 행(인가전·인가후·청산금)에 안분 문구가 없다", async () => {
    const r = await run(single(over));
    const d = r.result?.redevelopmentDetail;
    const rows = [
      ...buildRedevPerAssetForTransfer(d, 920_000_000, "apt", "pay"),
      ...buildRedevPerAssetForAcquisition(d, "apt", "pay"),
      ...buildRedevPerAssetForGain(d, "apt", "pay"),
    ];
    for (const row of rows) expect(row.formula, row.label).not.toMatch(OLD);
    const transferPost = buildRedevPerAssetForTransfer(d, 920_000_000, "apt", "pay")[1];
    expect(transferPost.formula).toContain(transferPost.value.toLocaleString("ko-KR"));
    expect(transferPost.formula).toContain("안분 없음");
    const acqPost = buildRedevPerAssetForAcquisition(d, "apt", "pay")[1];
    expect(acqPost.formula).toContain(acqPost.value.toLocaleString("ko-KR"));
  });

  it("③ 합계 줄 설명(Overrides) — §166 안분 구조 설명이 아니라 승계 단순 차감 설명이다", async () => {
    const r = await run(single(over));
    const d = r.result?.redevelopmentDetail;
    const mk = (key: string) => ({ key, label: key, value: 0, formula: "", legalBasis: "", perAsset: undefined });
    const items = new Map<string, any>([["transferPrice", mk("transferPrice")], ["acquisitionPrice", mk("acquisitionPrice")]]); // eslint-disable-line @typescript-eslint/no-explicit-any
    applyRedevelopmentOverrides(items, d, 920_000_000, "apt", "pay");
    for (const k of ["transferPrice", "acquisitionPrice"]) {
      expect(items.get(k).formula, k).not.toMatch(/§166 —|인가후\(분양가 안분\)|권리가액|청산금\(청산금 의제\)/);
      expect(items.get(k).formula, k).toContain("승계조합원");
    }
  });
});

describe("④ 값은 바뀌지 않는다 — 세액 경로 불변", () => {
  it("양도차익: 매매 470,000,000 · 증여 470,000,000 · 상속 470,000,000 · 부담부증여 153,260,870 · 감정가액 461,000,000", async () => {
    for (const [name, over] of CAUSES) expect((await run(single(over))).gain, name).toBe({ "매매 실거래가": 470_000_000, 증여: 470_000_000, 상속: 470_000_000, "부담부증여 매매": 153_260_870, "매매 감정가액": 461_000_000 }[name]);
  });
});
