/**
 * anchor — 부담부증여 **단건** 결과의 상세 계산 명세서·신고서 양식(요약표) 정합 (V-4, 2026-10-14).
 *
 * 종전 결함(문제 20 상황 1 화면 실측): 명세서가 「취득가액 −30,000,000 (실제 거래가액)」·「양도비 1,080,000」으로
 * 적고 양도가액 값이 0, 신고서 양식 표는 양도가액·취득가액이 「-」였다. 원인은 단건 경로가 부담부증여를 몰라
 * 폼의 `contractTotalPrice`(부담부증여는 빈 칸이 정상 = 0)에서 취득가액을 **역산**했기 때문이다.
 * 일반건물 집계 경로는 `transferBurdenedGiftBreakdown.perAsset.*` echo를 읽어 이미 정상이었다 — 단건도 같은 echo·같은 산식 빌더를 쓴다.
 *
 * 값은 **실제 엔진 결과**에서 읽는다(손으로 만든 result가 아니다). 항등식 「양도가액 − 취득가액 − 필요경비 = 전체 양도차익」이
 * 명세서·신고서 양식 양쪽에서 성립해야 한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const COMMON = {
  lendingDepositTotal: 0,
  mortgageDebtAmount: 80_000_000,
  annualRentTotal: 0,
  donorRelation: "lineal_descendant",
  landStdPriceAtTransfer: 320_000_000,
  buildingStdPriceAtTransfer: 0,
  landStdPriceAtAcquisition: 180_000_000,
  buildingStdPriceAtAcquisition: 0,
} as const;

const market = (over: Partial<BurdenedGiftInfo>): BurdenedGiftInfo =>
  ({ ...COMMON, valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 400_000_000, ...over }) as BurdenedGiftInfo;

function run(info: BurdenedGiftInfo, extra: Record<string, unknown> = {}) {
  const i = baseTransferInput({
    propertyType: "land",
    transferType: "burdened_gift",
    transferDate: new Date("2026-10-20"),
    transferPrice: 80_000_000,
    acquisitionPrice: 0,
    acquisitionDate: new Date("2018-10-20"),
    burdenedGiftInfo: info,
    ...extra,
  } as never);
  return calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
}

const formData = { ...createDefaultTransferFormData(), transferDate: "2026-10-20", contractTotalPrice: "" };
const asset = {
  ...makeDefaultAsset(1),
  assetKind: "land",
  acquisitionDate: "2018-10-20",
  transferType: "burdened_gift",
} as AssetForm;

/** 명세서·신고서 양식의 양도가액·취득가액·필요경비·전체 양도차익 값을 뽑는다. */
function view(result: ReturnType<typeof run>) {
  const items = buildStatementItems(result, formData, asset, undefined, undefined);
  const { mode } = deriveColumns(result, undefined, undefined, undefined);
  const rows = buildRows(result, mode, formData, asset);
  const cell = (label: string) => rows.find((r) => r.label === label)?.values.total;
  return {
    items,
    st: {
      transfer: items.get("transferPrice")!.value as number,
      acq: items.get("acquisitionPrice")!.value as number,
      exp: items.get("expenses")!.value as number,
      gain: items.get("transferGain")!.value as number,
    },
    form: {
      transfer: cell("양도가액"),
      acq: cell("취득가액"),
      exp: cell("필요경비"),
      gain: cell("전체 양도차익"),
    },
    text: (k: string) => String(items.get(k)!.formula),
  };
}

const CASES: Array<[string, BurdenedGiftInfo, Record<string, unknown>, { acq: number; exp: number; gain: number }]> = [
  ["K-7 감정가액 (문제 20 상황 1)", market({ acquisitionMethod: "appraisal", presumedLandAcquisitionPrice: 250_000_000, presumedBuildingAcquisitionPrice: 0 }), {}, { acq: 50_000_000, exp: 1_080_000, gain: 28_920_000 }],
  ["K-6 매매사례가액", market({ acquisitionMethod: "salesCase", presumedLandAcquisitionPrice: 250_000_000, presumedBuildingAcquisitionPrice: 0 }), {}, { acq: 50_000_000, exp: 1_080_000, gain: 28_920_000 }],
  ["K-1~K-3 기준시가 (문제 20 상황 2)", { ...COMMON, valuationMode: "sangjeungbeop_standard" } as BurdenedGiftInfo, {}, { acq: 45_000_000, exp: 1_350_000, gain: 33_650_000 }],
  [
    "K-4 실지취득가액 (실비 안분)",
    market({ acquisitionMethod: "actual", actualLandAcquisitionPrice: 250_000_000, actualBuildingAcquisitionPrice: 0 }),
    { capitalExpenditure: 10_000_000, transferExpense: 5_000_000 },
    { acq: 50_000_000, exp: 3_000_000, gain: 27_000_000 },
  ],
  ["K-5 환산취득가액", market({ acquisitionMethod: "converted" }), {}, { acq: 45_000_000, exp: 1_080_000, gain: 33_920_000 }],
];

describe.each(CASES)("%s — 단건 명세서·신고서 양식이 엔진 값과 일치", (_name, info, extra, want) => {
  const result = run(info, extra);
  const v = view(result);

  it("엔진 값 확인(기준)", () => {
    expect(result.transferGain).toBe(want.gain);
  });

  it("명세서: 양도가액 80,000,000 · 취득가액 · 필요경비 · 항등식", () => {
    expect(v.st.transfer).toBe(80_000_000);
    expect(v.st.acq).toBe(want.acq);
    expect(v.st.exp).toBe(want.exp);
    expect(v.st.transfer - v.st.acq - v.st.exp).toBe(v.st.gain);
  });

  it("신고서 양식(요약표): 양도가액 · 취득가액 · 필요경비가 「-」가 아니다", () => {
    expect(v.form.transfer).toBe(80_000_000);
    expect(v.form.acq).toBe(want.acq);
    expect(v.form.exp).toBe(want.exp);
    expect((v.form.transfer as number) - (v.form.acq as number) - (v.form.exp as number)).toBe(v.form.gain);
  });

  it("명세서 산식: 부담부증여 근거로 적히고 역산 오표기(실제 거래가액·양도비·음수)가 없다", () => {
    const acq = v.text("acquisitionPrice");
    const exp = v.text("expenses");
    expect(acq).not.toContain("실제 거래가액");
    expect(acq).not.toContain("-30,000,000");
    expect(exp).not.toContain("중개수수료");
    expect(acq).toContain(_name.startsWith("K-5") ? "취득시 기준시가 / 양도시 기준시가" : "채무액 / 증여재산 평가액");
  });
});

describe("방식별 산식 문구 (적힌 산식이 적힌 값을 만든다)", () => {
  it("K-7: 취득가액 = 감정가액 × 채무액 / 증여재산 평가액 · 필요경비 = 개산공제(취득시 기준시가 기준)", () => {
    const v = view(run(market({ acquisitionMethod: "appraisal", presumedLandAcquisitionPrice: 250_000_000, presumedBuildingAcquisitionPrice: 0 })));
    expect(v.text("acquisitionPrice")).toContain("취득가액 = 감정가액 × 채무액 / 증여재산 평가액");
    expect(v.text("acquisitionPrice")).toContain("= 250,000,000 × 80,000,000 / 400,000,000");
    expect(v.text("expenses")).toContain("= 180,000,000 × 80,000,000 / 400,000,000 × 0.03");
    expect(v.text("expenses")).toContain("자본적지출·양도비는 공제하지 않습니다");
  });

  it("K-4: 취득가액 = 실지취득가액 × 채무비율 · 필요경비 = 실비 안분(개산공제 아님)", () => {
    const v = view(
      run(market({ acquisitionMethod: "actual", actualLandAcquisitionPrice: 250_000_000, actualBuildingAcquisitionPrice: 0 }), {
        capitalExpenditure: 10_000_000,
        transferExpense: 5_000_000,
      }),
    );
    expect(v.text("acquisitionPrice")).toContain("취득가액 = 실지취득가액 × 채무액 / 증여재산 평가액");
    expect(v.text("expenses")).toContain("채무비율 안분 실비");
    expect(v.text("expenses")).not.toContain("개산공제, 소령");
  });

  it("K-5 swap 발동(자본적지출이 커서 실비 채택): 취득가액 0 + 실비 — 항등식 유지", () => {
    const r = run(market({ acquisitionMethod: "converted" }), { capitalExpenditure: 400_000_000, transferExpense: 0 });
    const v = view(r);
    expect(r.transferBurdenedGiftBreakdown?.necessaryExpenseSwap?.chosen).toBe("direct");
    expect(v.st.acq).toBe(0);
    expect(v.st.transfer - v.st.acq - v.st.exp).toBe(v.st.gain);
    expect(v.text("acquisitionPrice")).toContain("§97②2호 단서");
  });

  it("기준시가 모드: 종전 문구 유지", () => {
    const v = view(run({ ...COMMON, valuationMode: "sangjeungbeop_standard" } as BurdenedGiftInfo));
    expect(v.text("acquisitionPrice")).toContain("기준시가 모드 환산");
    expect(v.text("expenses")).toContain("안분 취득가액 × 3% (개산공제, 소령 §163⑥)");
  });
});

describe("건물(단일 총액) — 건물 슬롯 하나만 있어 접두 없이 한 줄", () => {
  it("K-7 감정가액 총액: 취득가액 50,000,000 · 필요경비 1,080,000 · 항등식", () => {
    const r = run(
      {
        ...COMMON,
        valuationMode: "sangjeungbeop_market",
        marketValueAtTransfer: 400_000_000,
        acquisitionMethod: "appraisal",
        presumedAcquisitionTotal: 250_000_000,
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 320_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 180_000_000,
      } as BurdenedGiftInfo,
      { propertyType: "building" },
    );
    const v = view(r);
    expect(v.st.acq).toBe(50_000_000);
    expect(v.st.exp).toBe(1_080_000);
    expect(v.st.transfer - v.st.acq - v.st.exp).toBe(v.st.gain);
    expect(v.text("acquisitionPrice").startsWith("취득가액 = 감정가액")).toBe(true);
    expect(v.form.acq).toBe(50_000_000);
  });
});

describe("회귀 0 — 부담부증여가 아닌 단건은 종전 경로", () => {
  it("일반 매매 단건: 취득가액은 실지 역산 문구 그대로", () => {
    const i = baseTransferInput({
      propertyType: "land",
      transferDate: new Date("2026-10-20"),
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2018-10-20"),
    } as never);
    const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
    const items = buildStatementItems(r, { ...formData, contractTotalPrice: "500000000" }, { ...asset, transferType: "" } as AssetForm, undefined, undefined);
    expect(String(items.get("acquisitionPrice")!.formula)).toContain("(실제 거래가액)");
    expect(items.get("transferPrice")!.value).toBe(500_000_000);
  });
});
