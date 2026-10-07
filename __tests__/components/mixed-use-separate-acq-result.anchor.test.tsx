/**
 * anchor: 겸용 별개 취득 파트 모델(B1) ⑦ — 결과 카드·신고서 4열·상세 명세서가 엔진 echo(`breakdown.separateAcquisition`)를 **route보다 먼저** 읽는다.
 *
 * 엔진은 파트 모델에 새 `acquisitionConversionRoute` 값을 만들지 않는다(`section97_direct`/`phd_corrected`로 나온다).
 * echo 분기가 없으면 실거래가 파트에도 「환산취득가액」 거짓 라벨이 붙는다 — 이 파일은 그 라벨 부재를 **긍정 짝과 함께** 고정한다.
 *
 * fixture는 가상. 값은 엔진이 만든 것을 읽을 뿐 표시층이 재도출하지 않는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { separateAcqFilingNotes } from "@/components/calc/results/mixed-use/mixed-use-separate-acq-text";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");

function base(over: Record<string, unknown> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2005-06-10"),
    buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
    acquisitionStandardPrice: {
      housingPrice: 400_000_000,
      commercialBuildingPrice: 80_000_000,
      landPricePerSqm: 1_200_000,
      landPricePerSqmAtBuildingAcq: 1_800_000,
      housingBuildingPrice: 320_000_000,
    },
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as unknown as MixedUseAssetInput;
}
const AA = { landMode: "actual", buildingMode: "actual", landAcquisitionPrice: 500_000_000, buildingAcquisitionPrice: 400_000_000 } as const;

const run = (over: Record<string, unknown>) => calcMixedUseTransferTax(3_000_000_000, TD, base(over), rates);
const text = (b: ReturnType<typeof run>) => {
  const t = render(<MixedUseResultCard breakdown={b} />).container.textContent ?? "";
  cleanup();
  return t;
};

describe("⑦ 결과 카드 — echo 분기가 route 분기보다 먼저다", () => {
  const aa = run({ separateAcquisition: { ...AA, housingBuildingContractPrice: 150_000_000 } });
  const aaText = text(aa);

  it("전제 — 엔진 route는 파트 모델에 새 값을 만들지 않는다(그래서 echo 우선이 필요하다)", () => {
    expect(aa.separateAcquisition).toBeDefined();
    expect(["section97_direct", "phd_corrected"]).toContain(aa.calculationRoute.acquisitionConversionRoute);
  });
  it("실거래가/실거래가 — 「환산취득가액」 거짓 라벨이 없고 파트별 산정방식·근거가 있다", () => {
    expect(aaText, "실거래가 파트에 환산 라벨이 붙으면 안 된다").not.toContain("환산취득가액");
    expect(aaText).toContain("주택 취득가액 (토지·건물 산정방식 각각)");
    expect(aaText).toContain("상가 취득가액 (토지·건물 산정방식 각각)");
    expect(aaText).toContain("토지 실거래가 · 건물 실거래가");
    // 토지는 면적비, 건물은 용도별 계약액
    expect(aaText).toContain("토지 취득가액 500,000,000");
    expect(aaText).toContain("같은 필지라 토지 기준시가 비율 = 면적 비율");
    expect(aaText).toContain("주택건물 계약액 150,000,000");
    expect(aaText).toContain("상가건물 계약액 = 총액에서 주택건물분을 뺀 값");
  });
  it("양쪽 계약액 + 취득시 기준시가 전무 — 쓰이지 않는 「취득시 상가부분 기준시가 합계 0」 행이 없다", () => {
    const none = run({ separateAcquisition: { ...AA, housingBuildingContractPrice: 150_000_000 }, acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 0, landPricePerSqm: 0 } });
    expect(text(none)).not.toContain("취득시 상가부분 기준시가 합계");
    // 긍정 짝 — 기준시가가 쓰이는 조합(건물 감정)에서는 있다
    const used = run({ separateAcquisition: { ...AA, buildingMode: "appraisal" } });
    expect(text(used)).toContain("취득시 상가부분 기준시가 합계");
  });
  it("건물 용도별 계약액이 없으면 건물 취득일 기준시가 비율을 밝힌다", () => {
    const ratio = text(run({ separateAcquisition: AA }));
    expect(ratio).toContain("주택건물 기준시가 320,000,000");
    expect(ratio).toContain("건물 취득일 기준");
    expect(ratio).not.toContain("주택건물 계약액");
  });
  it("실거래가 + 환산 혼합 — 환산 파트에만 「환산」이 붙고 실거래가 파트는 붙지 않는다", () => {
    const b = run({ separateAcquisition: { landMode: "actual", buildingMode: "estimated", landAcquisitionPrice: 500_000_000 } });
    const t = text(b);
    expect(t).toContain("토지 실거래가 · 건물 환산취득가");
    expect(t).toMatch(/주택건물분 취득가액 \(건물 환산취득가\)/);
    expect(t).toMatch(/주택부수토지분 취득가액 \(토지 실거래가\)/);
    expect(t).toContain("환산 파트 산식");
  });
  it("개산공제 — 비-실가 파트에만 「개산공제」, 실거래가 파트는 「개산공제」가 아니라 취득가액만", () => {
    const t = text(run({ separateAcquisition: { ...AA, buildingMode: "appraisal" } }));
    // 건물(감정) 파트는 개산공제 문구, 토지(실가) 파트는 실제 필요경비/무경비
    expect(t).toMatch(/건물분[\s\S]*개산공제/);
  });
  it("총액 모델(echo 없음)은 종전 표시 그대로 — 환산 라벨 유지(회귀 짝)", () => {
    const legacy = run({});
    expect(legacy.separateAcquisition).toBeUndefined();
    expect(text(legacy)).toContain("주택 환산취득가액");
  });
});

describe("⑦ 신고서 4열 — 취득가액 행 열별 주석(행 추가 없음)", () => {
  const rowsOf = (over: Record<string, unknown>) => {
    const b = run(over);
    const r = mixedUseToFilingResult(b);
    const { mode } = deriveColumns(r);
    // 취득일 행은 폼 자산의 토지·건물 취득일에서 읽는다(엔진 무변경) — 폼을 함께 넘긴다
    const fd = {
      transferDate: "2024-08-20",
      filingDate: "2024-10-31",
      contractTotalPrice: "3000000000",
      assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2010-03-15", landAcquisitionDate: "2005-06-10", hasSeperateLandAcquisitionDate: true }],
    } as unknown as TransferFormData;
    return { b, mode, rows: buildRows(r, mode, fd, undefined, 3_000_000_000) };
  };

  it("열마다 산정방식·안분 근거를 취득가액 행 notes에 싣는다 — 계약액/기준시가 비율/환산", () => {
    const { mode, rows } = rowsOf({ separateAcquisition: { ...AA, housingBuildingContractPrice: 150_000_000 } });
    expect(mode).toBe("mixed-4col");
    const acq = rows.find((x) => x.label === "취득가액")!;
    expect(acq.notes).toEqual({
      housingLand: "실거래가 · 면적비 안분",
      housingBuilding: "실거래가 · 용도별 계약액",
      commercialLand: "실거래가 · 면적비 안분",
      commercialBuilding: "실거래가 · 용도별 계약액",
    });
    const ratio = rowsOf({ separateAcquisition: AA }).rows.find((x) => x.label === "취득가액")!;
    expect(ratio.notes!.housingBuilding).toBe("실거래가 · 건물 기준시가 비율");
    const est = rowsOf({ separateAcquisition: { landMode: "estimated", buildingMode: "appraisal", buildingAcquisitionPrice: 400_000_000 } }).rows.find((x) => x.label === "취득가액")!;
    expect(est.notes!.housingLand).toBe("환산취득가");
    expect(est.notes!.commercialBuilding).toBe("감정가액 · 건물 기준시가 비율");
  });
  it("행 구성 불변 — 별지 서식 행을 추가하지 않는다(총액 모델과 같은 행 수) · 총액 모델은 notes 없음", () => {
    const part = rowsOf({ separateAcquisition: AA }).rows;
    const total = rowsOf({}).rows;
    expect(part.map((r) => r.label)).toEqual(total.map((r) => r.label));
    expect(total.find((x) => x.label === "취득가액")!.notes).toBeUndefined();
  });
  it("취득일 행 열별 표시는 회귀 없이 유지된다(토지 열 = 토지 취득일 · 건물 열 = 건물 취득일)", () => {
    const { rows } = rowsOf({ separateAcquisition: AA });
    const d = rows.find((x) => x.label.startsWith("취득일자"))!;
    expect(String(d.values.housingLand)).toContain("2005");
    expect(String(d.values.housingBuilding)).toContain("2010");
  });
  it("echo가 없으면 helper는 undefined", () => {
    expect(separateAcqFilingNotes(undefined)).toBeUndefined();
    expect(separateAcqFilingNotes(run({}))).toBeUndefined();
  });
});

describe("⑦ 상세 계산 명세서 — 파트 모델의 취득가액·필요경비 문장이 echo를 따른다", () => {
  it("실거래가 파트: 「취득가액(추계)」·「환산취득가」·「개산공제 = 취득시 기준시가 × …」 거짓 문장이 없다", () => {
    const b = run({ separateAcquisition: { ...AA, housingBuildingContractPrice: 150_000_000 } });
    const t = text(b);
    expect(t).toContain("토지(실거래가) 주택부수토지분");
    expect(t).toContain("건물(실거래가) 주택건물분");
    expect(t).not.toContain("취득가액(추계)");
    expect(t).toMatch(/필요경비 [\d,]+ = 실제 필요경비\(자본적지출·양도비\) 파트별 합계/);
  });
  it("실가 + 감정 혼합: 필요경비 문장이 실제 필요경비와 개산공제를 함께 밝힌다", () => {
    const t = text(run({ separateAcquisition: { ...AA, buildingMode: "appraisal" } }));
    expect(t).toMatch(/실거래가 파트는 실제 필요경비\(자본적지출·양도비\), 감정가액·매매사례가액·환산취득가 파트는 개산공제/);
  });
});
