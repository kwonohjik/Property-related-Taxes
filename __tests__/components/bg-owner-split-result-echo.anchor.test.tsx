/**
 * anchor(⑦) — 부담부증여 × 토지·건물 소유자 분리 결과 화면이 「증여한 부분」을 밝힌다
 * (계획서 `docs/00-pm/bg-owner-split-159.plan.md` §8 · PR-4).
 *
 * 값은 **실제 엔진 결과**에서 읽는다(손으로 만든 result가 아니다). 판정은 엔진 결과(`splitDetail.selfOwns` + §159 명세)로 한다.
 * 회귀: 소유자 같음(both) 부담부증여·토지·건물 취득일만 다른 날짜 분리 부담부증여는 종전 화면 그대로(증여한 부분 표기·「계산하지 않음」 없음).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { bgOwnerSplitPerAssetFormulas } from "@/components/calc/results/transfer/DetailedStatementBgFormulas";
import { bgOwnedPartHeadline, bgOwnedPartOfResult } from "@/lib/calc/bg-owner-split-result";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

afterEach(cleanup);

const rates = makeMockRates();
/** 채무 1억 = 보증금 5천만 + 차입 5천만(설정 5천만) — 계획서 §9.1 A2. */
const DEBT = { lendingDepositTotal: 50_000_000, mortgageDebtAmount: 50_000_000, mortgageSetAmount: 50_000_000, annualRentTotal: 0 };
const info = (std: { landT: number; bldT: number; landA: number; bldA: number }, over: Partial<BurdenedGiftInfo> = {}) =>
  ({ valuationMode: "sangjeungbeop_standard", ...DEBT, landStdPriceAtTransfer: std.landT, buildingStdPriceAtTransfer: std.bldT, landStdPriceAtAcquisition: std.landA, buildingStdPriceAtAcquisition: std.bldA, ownerSplitDebtConfirmed: true, ...over }) as BurdenedGiftInfo;

function run(over: Partial<TransferTaxInput>) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "building", transferType: "burdened_gift", transferDate: new Date("2026-02-16"), transferPrice: 0, acquisitionPrice: 0,
      acquisitionDate: new Date("2015-01-01"), landAcquisitionDate: new Date("2015-01-01"), isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0, ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
}
const BLD = () => run({ selfOwns: "building_only", burdenedGiftInfo: info({ landT: 0, bldT: 200_000_000, landA: 0, bldA: 80_000_000 }) });
const LND = () => run({ selfOwns: "land_only", burdenedGiftInfo: info({ landT: 200_000_000, bldT: 0, landA: 80_000_000, bldA: 0 }) });
/** 소유자 같음 — 단일 칸(건물 쪽)에 합계. */
const BOTH = () => run({ selfOwns: "both", burdenedGiftInfo: info({ landT: 0, bldT: 200_000_000, landA: 0, bldA: 80_000_000 }) });
/** 날짜 분리 — 토지·건물 취득일 다름(소유자 같음) · 토지 8천만/건물 1.2억 양도시 · 취득시 토지 3천만/건물 5천만. */
const DATE_SPLIT = () => run({ landAcquisitionDate: new Date("2000-06-01"), burdenedGiftInfo: info({ landT: 80_000_000, bldT: 120_000_000, landA: 30_000_000, bldA: 50_000_000 }) });

const formData = { ...createDefaultTransferFormData(), transferDate: "2026-02-16", contractTotalPrice: "" };
const form = { ...makeDefaultAsset(1), assetKind: "building", acquisitionDate: "2015-01-01", transferType: "burdened_gift" } as AssetForm;
const textOf = (c: HTMLElement) => (c.textContent ?? "").replace(/\s+/g, " ");

describe("판정 — 엔진 결과에서 증여한 부분을 읽는다", () => {
  it("건물만 → building · 토지만 → land · 소유자 같음/날짜 분리 → undefined", () => {
    expect(bgOwnedPartOfResult(BLD())).toBe("building");
    expect(bgOwnedPartOfResult(LND())).toBe("land");
    expect(bgOwnedPartOfResult(BOTH())).toBeUndefined();
    expect(bgOwnedPartOfResult(DATE_SPLIT())).toBeUndefined();
  });
  it("머리 문구: 「증여한 부분: 건물 (토지는 타인 소유)」 · 「증여한 부분: 토지 (건물은 타인 소유)」", () => {
    expect(bgOwnedPartHeadline("building")).toBe("증여한 부분: 건물 (토지는 타인 소유)");
    expect(bgOwnedPartHeadline("land")).toBe("증여한 부분: 토지 (건물은 타인 소유)");
  });
});

describe("§159 명세 카드 — 증여한 건물분 표기 · 비소유 파트는 0원 줄이 아니라 계산하지 않음", () => {
  it("건물만 본인", () => {
    const r = BLD();
    const { container, getByTestId, queryByTestId } = render(<BurdenedGiftDetailCard breakdown={r.transferBurdenedGiftBreakdown!} propertyType="building" ownerPart={bgOwnedPartOfResult(r)} />);
    const t = textOf(container);
    expect(getByTestId("bg-owner-split-headline").textContent).toContain("증여한 부분: 건물 (토지는 타인 소유)");
    expect(t).toContain("양도세 보충적평가 (증여한 건물분 · 양도가액 안분 분모)");
    expect(t).toContain("① 보충적평가 (양도세 §99) — 증여한 건물분200,000,000");
    expect(t).toContain("채무비율 = 채무액증여재산 평가액 (증여한 건물분 기준)50.0000%");
    expect(t).toContain("건물 취득가 = 증여한 건물분 취득시 기준시가 80,000,000 × 채무비율 50.0000%40,000,000");
    expect(getByTestId("bg-owner-split-not-owned").textContent).toBe("토지 취득가본인 소유 아님 — 계산하지 않음");
    // 비소유 파트 0원 줄이 없다
    expect(t).not.toContain("토지 취득가 = ");
    expect(queryByTestId("bg-owner-split-not-owned")).not.toBeNull();
  });
  it("토지만 본인", () => {
    const r = LND();
    const { getByTestId, container } = render(<BurdenedGiftDetailCard breakdown={r.transferBurdenedGiftBreakdown!} propertyType="building" ownerPart={bgOwnedPartOfResult(r)} />);
    expect(getByTestId("bg-owner-split-headline").textContent).toContain("증여한 부분: 토지 (건물은 타인 소유)");
    expect(textOf(container)).toContain("토지 취득가 = 증여한 토지분 취득시 기준시가 80,000,000 × 채무비율 50.0000%40,000,000");
    expect(getByTestId("bg-owner-split-not-owned").textContent).toBe("건물 취득가본인 소유 아님 — 계산하지 않음");
  });
  it("회귀 — 소유자 같음/날짜 분리는 증여한 부분 표기가 없다 (ownerPart 미전달)", () => {
    for (const r of [BOTH(), DATE_SPLIT()]) {
      const { container, queryByTestId } = render(<BurdenedGiftDetailCard breakdown={r.transferBurdenedGiftBreakdown!} propertyType="building" ownerPart={bgOwnedPartOfResult(r)} />);
      expect(queryByTestId("bg-owner-split-headline")).toBeNull();
      expect(queryByTestId("bg-owner-split-not-owned")).toBeNull();
      const t = textOf(container);
      expect(t).not.toContain("증여한");
      expect(t).toContain("양도세 보충적평가 (자산별 양도가액 안분 분모)");
      expect(t).toContain("채무비율 = 채무액증여재산 평가액50.0000%");
      cleanup();
    }
  });
});

describe("분리 양도차익 카드 — 비소유 파트 열", () => {
  it("bgOwnerSplit: 비소유 토지 열은 「—」 · 환산취득가·0·「취득시 기준시가 0 × 3%」가 없다", () => {
    const r = BLD();
    const { container, getByTestId } = render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="building" bgOwnerSplit />);
    expect(getByTestId("split-card-bg-not-owned-note").textContent).toBe("토지: 본인 소유 아님 — 계산하지 않음 (증여한 부분: 건물)");
    expect(getByTestId("split-card-acq-land").textContent).toBe("—");
    expect(getByTestId("split-card-acq-mode-land").textContent).toBe("—");
    expect(getByTestId("split-card-acq-building").textContent).toBe("40,000,000");
    const t = textOf(container);
    expect(t).not.toContain("취득시 기준시가 0");
    expect(t).toContain("취득시 기준시가 80,000,000");
    expect(t).toContain("58,800,000");
  });
  it("회귀 — bgOwnerSplit 없으면(일반 소유자 분리 포함) 종전 취소선 참고 열 그대로", () => {
    const r = BLD();
    const { queryByTestId, getByTestId } = render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="building" />);
    expect(queryByTestId("split-card-bg-not-owned-note")).toBeNull();
    expect(getByTestId("split-card-acq-land").textContent).toBe("0");
  });
  it("회귀 — 날짜 분리 부담부증여는 두 열 값이 그대로다", () => {
    const r = DATE_SPLIT();
    const { getByTestId } = render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="building" />);
    expect(getByTestId("split-card-acq-land").textContent).not.toBe("—");
    expect(getByTestId("split-card-acq-building").textContent).not.toBe("—");
  });
});

describe("상세 명세서 — 증여한 부분 기준 산식 · 항등식", () => {
  const items = (r: ReturnType<typeof run>) => buildStatementItems(r, formData, form, undefined, undefined);
  it("건물만: 취득가액·필요경비·양도 산식이 증여한 건물분으로 적히고 항등식이 선다", () => {
    const r = BLD();
    const it = items(r);
    const f = (k: string) => String(it.get(k)!.formula);
    expect(f("acquisitionPrice")).toContain("증여한 건물분 취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액");
    expect(f("acquisitionPrice")).not.toContain("환산취득가");
    expect(f("expenses")).toContain("증여한 건물분 필요경비 = 안분 취득가액 × 3%");
    expect(f("transferGain")).toContain("증여한 건물분 보충적평가 200,000,000 중 50.0000% 안분");
    expect(f("transferGain")).not.toContain("supplementary");
    const v = (k: string) => it.get(k)!.value as number;
    expect(v("transferPrice")).toBe(100_000_000);
    expect(v("acquisitionPrice")).toBe(40_000_000);
    expect(v("expenses")).toBe(1_200_000);
    expect(v("transferPrice") - v("acquisitionPrice") - v("expenses")).toBe(v("transferGain"));
  });
  it("토지만: 증여한 토지분", () => {
    const it = items(LND());
    expect(String(it.get("acquisitionPrice")!.formula)).toContain("증여한 토지분 취득가액 =");
  });
  it("회귀 — 소유자 같음은 종전 문구(증여한 부분 없음) · 날짜 분리는 파트별 산정 문구", () => {
    expect(String(items(BOTH()).get("acquisitionPrice")!.formula)).not.toContain("증여한");
    expect(String(items(DATE_SPLIT()).get("acquisitionPrice")!.formula)).toContain("토지·건물 파트별 산정");
    expect(String(items(BOTH()).get("transferGain")!.formula)).not.toContain("증여한");
  });
});

describe("연간 합산(/multi) 자산별 산식 — 같은 슬롯 echo · 같은 접두", () => {
  it("건물만: 취득가액·필요경비 산식이 증여한 건물분 · 「환산취득가」로 적지 않는다", () => {
    const f = bgOwnerSplitPerAssetFormulas(BLD());
    expect(f?.acquisition).toContain("증여한 건물분 취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액");
    expect(f?.acquisition).toContain("= 80,000,000 × 100,000,000 / 200,000,000");
    expect(f?.acquisition).not.toContain("환산취득가");
    expect(f?.expense).toContain("증여한 건물분 필요경비 = 안분 취득가액 × 3%");
  });
  it("회귀 — 소유자 같음·날짜 분리는 undefined(종전 경로)", () => {
    expect(bgOwnerSplitPerAssetFormulas(BOTH())).toBeUndefined();
    expect(bgOwnerSplitPerAssetFormulas(DATE_SPLIT())).toBeUndefined();
  });
});
