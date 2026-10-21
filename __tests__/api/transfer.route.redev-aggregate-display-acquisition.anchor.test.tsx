/**
 * anchor — **§166 자산의 취득가액·필요경비 표시는 단건 신고서와 같은 역산 leaf**(`redevFilingTotals`)다 (2026-10-21).
 *
 * 계획서: `docs/00-pm/redev-aggregate-display-acquisition.plan.md` (Q-1 a · Q-2 b).
 *
 * ## 결함 (표시 전용 — 세액은 모든 경우 같다)
 * 1. 함께 양도·다건 표시 echo(`resolveDisplayAcquisitionAndExpense`)에 §166 분기가 없었다.
 *    환산이면 화면에 없는 일반 기준시가 칸으로 재환산(빈 값 0 · 옛 값이면 그 비율), 실가면 종전 취득가액만 읽고
 *    필요경비를 역산했다 — 원조합원 입주권 양도 1,000,000,000: 환산 «0 · 403,000,000»(옛 값 «200,000,000 · 203,000,000»),
 *    실가 «400,000,000 · 100,000,000». 단건 신고서는 «400,000,000 · 3,000,000» · «500,000,000 · 0».
 * 2. 전액 비과세 §166은 엔진이 분기 차익을 0으로 마스킹해, 역산 취득가액이 «양도가액 − 경비»(1,000,000,000)였다 —
 *    단건 신고서도 같았다. 마스킹 전 값(`gainAfterAllocation`)을 leaf가 읽어 과세 시와 같은 500,000,000이 된다.
 *
 * fixture는 V5 anchor(`transfer.route.companion-orig-member-acq-price`)와 같은 화면 모양이다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc, redevAptForm } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { redevFilingTotals } from "@/lib/tax-engine/redev-acquisition-inverse";
import { effectiveGrossGainOfProperty } from "@/components/calc/results/transfer/exempt-gross-gain";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { case47RedevelopmentInfo } from "../tax-engine/transfer-tax/redevelopment/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(() => cleanup());

/** 원조합원 입주권 — 화면 입력 칸만. 일반 취득가액·기준시가 칸은 화면에 없다(빈 값). */
const ORIG: Partial<AssetForm> = {
  assetKind: "right_to_move_in",
  isSuccessorRightToMoveIn: false,
  redevSubject: "right",
  acquisitionCause: "purchase",
  acquisitionDate: "2008-01-01",
  fixedAcquisitionPrice: "",
  actualSalePrice: "1000000000",
  standardPriceAtAcq: "",
  standardPriceAtTransfer: "",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2016-06-01",
  redevOriginalAssetType: "housing",
  redevRightsValue: "900000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "100000000",
  redevPreApprovalExpenses: "0",
  redevExemptionEligibleAtApproval: "yes",
  redevPriorHouseHoldingMonths: "60",
  redevPriorHouseResidenceMonths: "36",
} as Partial<AssetForm>;
const EST = {
  ...ORIG,
  useEstimatedAcquisition: true,
  redevActualAcquisitionPrice: "",
  redevManagementDisposalHousingPrice: "300000000",
  redevAcquisitionHousingPrice: "100000000",
} as Partial<AssetForm>;
const ACT = { ...ORIG, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "400000000" } as Partial<AssetForm>;
/** 화면에 없는 일반 칸에 남은 옛 값(자산 종류를 바꾸기 전 입력). */
const STALE = { standardPriceAtAcq: "100000000", standardPriceAtTransfer: "500000000" };
const HOUSE: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "600000000",
  standardPriceAtTransfer: "400000000",
  useEstimatedAcquisition: false,
};
const COMPANION = {
  contractTotalPrice: "1600000000",
  assetSplitMode: "companion",
  householdHousingCount: "1",
  isOneHousehold: false,
} as unknown as Partial<TransferFormData>;
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };

function mkForm(assets: Partial<AssetForm>[], extra: Partial<TransferFormData>, bundledSaleMode = "actual"): TransferFormData {
  const form = withTestAddress(createDefaultTransferFormData());
  form.transferDate = "2024-06-01";
  form.filingDate = "2024-08-31";
  form.householdHousingCount = "0";
  form.isOneHousehold = true;
  form.bundledSaleMode = bundledSaleMode as never;
  Object.assign(form, {
    householdRightCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "60",
  });
  form.assets = assets.map(
    (over, i) =>
      ({
        ...(i === 0 ? form.assets[0] : makeDefaultAsset(i + 1)),
        addressJibun: i === 0 ? form.assets[0].addressJibun : "서울 강남구 테스트동 1-1",
        assetId: `a${i}`,
        ...over,
      }) as AssetForm,
  );
  Object.assign(form, extra);
  return form;
}

type Prop = {
  acquisitionPrice: number;
  necessaryExpense: number;
  transferPrice: number;
  transferGain: number;
  isExempt?: boolean;
  exemptGrossGain?: number;
  redevelopmentDetail?: NonNullable<Parameters<typeof redevFilingTotals>[0]>;
};
async function bundled(form: TransferFormData) {
  const r = await runCalc(form);
  expect(r.status).toBe(200);
  const data = r.json.data;
  const props = data.aggregated.properties as Prop[];
  return { data, totalTax: data.aggregated.totalTax as number, redev: props.filter((p) => p.redevelopmentDetail) };
}
const shown = (p: Prop) => [p.acquisitionPrice, p.necessaryExpense];

/** 신고서 양식 표의 행(라벨 → 열 값). */
function formTableRows(container: HTMLElement): Record<string, number[]> {
  const table = container.querySelector('[data-print-id="form-table"]');
  expect(table, "신고서 양식 표가 없다").not.toBeNull();
  const out: Record<string, number[]> = {};
  for (const tr of table!.querySelectorAll("tr")) {
    const cells = [...tr.querySelectorAll("th,td")].map((c) => (c.textContent ?? "").trim());
    const label = cells[0];
    if (!label || label in out) continue;
    out[label] = cells.slice(1).map((v) => Number(v.replace(/[^\d-]/g, "")));
  }
  return out;
}

describe("RA · 함께 양도 §166 자산 — 표시 취득가액·필요경비 = 단건 신고서 역산", () => {
  it("RA-1 환산 컴패니언: 숨은 기준시가 칸이 비었든 옛 값이든 400,000,000 · 3,000,000 · 세액 불변", async () => {
    for (const over of [{}, STALE, { standardPriceAtAcq: "100000000" }, { standardPriceAtTransfer: "500000000" }]) {
      const r = await bundled(mkForm([HOUSE, { ...EST, ...over }], COMPANION));
      expect(r.redev.map(shown)).toEqual([[400_000_000, 3_000_000]]);
      expect(r.totalTax).toBe(304_646_760);
    }
  });

  it("RA-2 입주권이 주 자산이어도 같다 (옛 값 무관)", async () => {
    for (const over of [{}, STALE]) {
      const r = await bundled(mkForm([{ ...EST, ...over }, HOUSE], COMPANION));
      expect(r.redev.map(shown)).toEqual([[400_000_000, 3_000_000]]);
      expect(r.totalTax).toBe(304_646_760);
    }
  });

  it("RA-3 안분 모드(양도시 기준시가는 보이는 안분 키) — 취득시 옛 값이 남아도 400,000,000 · 3,000,000", async () => {
    const key = { standardPriceAtTransfer: "500000000" };
    for (const over of [key, { ...key, standardPriceAtAcq: "100000000" }]) {
      const r = await bundled(mkForm([HOUSE, { ...EST, ...over }], COMPANION, "apportioned"));
      expect(r.redev.map(shown)).toEqual([[400_000_000, 3_000_000]]);
      expect(r.totalTax).toBe(295_406_760);
    }
  });

  it("RA-4 실가: 납부 청산금은 취득가액 칸 — 500,000,000 · 0 = 같은 자산 단건 신고서 합계 열", async () => {
    const single = await runCalc(mkForm([ACT], { contractTotalPrice: "1000000000" } as never));
    const singleTotals = redevFilingTotals(single.result.redevelopmentDetail, 1_000_000_000);
    for (const order of [[HOUSE, ACT], [ACT, HOUSE]]) {
      const r = await bundled(mkForm(order, COMPANION));
      expect(r.redev.map(shown)).toEqual([[500_000_000, 0]]);
      expect(r.redev[0].acquisitionPrice).toBe(singleTotals.acquisition);
      expect(r.totalTax).toBe(267_003_000);
    }
  });

  it("RA-6 렌더: 신고서 양식 표의 §166 열이 옛 값 유래 숫자 없이 검산식을 만족한다", async () => {
    const form = mkForm([HOUSE, { ...EST, ...STALE }], COMPANION);
    const { data } = await bundled(form);
    const { container } = render(
      <BundledAllocationCard
        apportionment={data.apportionment}
        aggregated={data.aggregated}
        formData={form}
        onBack={() => {}}
        onReset={() => {}}
      />,
    );
    const rows = formTableRows(container);
    // 열 = 합계 · 주 자산(주택) · 자산 2(입주권)
    expect(rows["취득가액"]).toEqual([700_000_000, 300_000_000, 400_000_000]);
    expect(rows["필요경비"]).toEqual([3_000_000, 0, 3_000_000]);
    for (let c = 0; c < 3; c++) {
      expect(rows["양도가액"][c] - rows["취득가액"][c] - rows["필요경비"][c]).toBe(rows["전체 양도차익"][c]);
    }
    expect(container.querySelector('[data-print-id="form-table"]')!.textContent).not.toContain("200,000,000");
  });
});

describe("RA-5 · 전액 비과세 §166 — 마스킹 전 분기 차익으로 역산 (Q-2 b)", () => {
  const single = (a: Partial<AssetForm>, oneHouse: boolean) => {
    const f = mkForm([a], { contractTotalPrice: "1000000000" } as never);
    if (!oneHouse) Object.assign(f, { householdHousingCount: "2", isOneHousehold: false });
    return f;
  };

  it.each([
    ["실가", ACT, 500_000_000, 500_000_000],
    ["환산", EST, 400_000_000, 597_000_000],
  ] as const)("RA-5-%s 단건: 비과세의 역산 취득가액·전체 양도차익 = 같은 자산을 과세로 계산한 값", async (_l, a, acq, gross) => {
    const exempt = await runCalc(single(a, true));
    const taxable = await runCalc(single(a, false));
    expect(exempt.result.isExempt).toBe(true);
    expect(taxable.result.isExempt).toBe(false);
    for (const r of [exempt, taxable]) {
      const t = redevFilingTotals(r.result.redevelopmentDetail, 1_000_000_000);
      expect([t.acquisition, t.gain]).toEqual([acq, gross]);
    }
  });

  it.each([
    ["입주권(3열)", () => single(ACT, true)],
    // 완공APT(원조합원 · 1세대1주택 · 거주 5년) — 신고서가 4분할 열(`fillRedev4SplitBranchData`)을 탄다. 입주권 납부는 3열 경로.
    ["완공APT(4분할)", () => redevAptForm({ price: "1000000000" })],
  ] as const)("RA-5-표 %s 단건 비과세 신고서: 전체 = 비과세 + 과세대상, 열마다 검산식이 맞는다", async (_l, mkSingle) => {
    const form = mkSingle();
    const r = await runCalc(form);
    expect(r.result.isExempt).toBe(true);
    const { container } = render(
      <TransferTaxResultView result={r.result} formData={form} asset={form.assets[0]} onReset={() => {}} onBack={() => {}} />,
    );
    const rows = formTableRows(container);
    expect(rows["취득가액"][0]).toBe(500_000_000);
    expect(rows["전체 양도차익"][0]).toBe(500_000_000);
    expect(rows["비과세 양도차익"][0]).toBe(500_000_000);
    expect(rows["과세대상 양도차익"][0]).toBe(0);
    cleanup();
    for (let c = 0; c < rows["양도가액"].length; c++) {
      expect(rows["양도가액"][c] - rows["취득가액"][c] - rows["필요경비"][c]).toBe(rows["전체 양도차익"][c]);
      expect(rows["비과세 양도차익"][c] + rows["과세대상 양도차익"][c]).toBe(rows["전체 양도차익"][c]);
    }
  });

  it("RA-5-축B 50/50 비과세 지분: 카드마다 취득 250,000,000(종전 200,000,000 + 청산금 50,000,000) · 전체 차익 250,000,000", async () => {
    const card2 = {
      ...makeDefaultAsset(2),
      acquisitionCause: "purchase",
      acquisitionDate: "2008-01-01",
      fixedAcquisitionPrice: "",
      redevApprovalLawBasis: "urban_renovation_art_74",
      redevApprovalDate: "2016-06-01",
      redevOriginalAssetType: "housing",
      redevRightsValue: "900000000",
      redevSettlementDirection: "pay",
      redevSettlementAmount: "50000000",
      redevPreApprovalExpenses: "0",
      redevActualAcquisitionPrice: "400000000",
      ...HALF,
    } as Partial<AssetForm>;
    const r = await bundled(
      mkForm([{ ...ACT, ...HALF, redevSettlementAmount: "50000000" }, card2], {
        contractTotalPrice: "1000000000",
        assetSplitMode: "fractional",
      } as never),
    );
    expect(r.totalTax).toBe(0);
    expect(r.redev.map((p) => [p.isExempt, ...shown(p), effectiveGrossGainOfProperty(p)])).toEqual([
      [true, 250_000_000, 0, 250_000_000],
      [true, 250_000_000, 0, 250_000_000],
    ]);
  });
});

describe("RA-7 · 12억 안분 전 값이 있으면 그것이 전체 양도차익이다 (사례 47 — 값 불변)", () => {
  it("RA-7 사례 47(신축APT 20억 + 청산금 수령 동시신고 · 청산금분 비과세): 전체 차익 = 안분 전 분기 합 2,100,000,000", () => {
    const input = baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 2_000_000_000,
      transferDate: new Date("2022-03-01"),
      acquisitionDate: new Date("2001-01-01"),
      acquisitionPrice: 100_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 254,
      finalOneHouseRestart: { hadOtherHouseDisposal: false, disposals: [] },
      redevelopment: case47RedevelopmentInfo(),
    });
    const d = calculateTransferTax(input, makeMockRates()).redevelopmentDetail!;
    // 안분 후 보존값(gainAfterAllocation 210,000,000 · 560,000,000)과 안분 전 값이 다르다 — 순서를 바꾸면 945,000,000이 된다.
    expect(d.settlementExemptionApplied).toBe(true);
    expect([d.preApproval.gainBeforeAllocation, d.preApproval.gainAfterAllocation]).toEqual([525_000_000, 210_000_000]);
    const t = redevFilingTotals(d, 2_000_000_000);
    expect(t.gain).toBe(2_100_000_000);
    expect(t.acquisition).toBe(t.transferPrice - t.expenses - 2_100_000_000);
  });
});
