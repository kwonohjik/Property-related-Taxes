/**
 * anchor — §100③ 판정 **표시** (Phase 1-E · ⑦ · U-9)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.5
 *
 * ## U-9 계약 — 표시는 엔진 판정을 **그대로 읽는다**
 *
 * 화면이 「구분값 대 안분값」을 다시 나누면 경계(정확히 30%)에서 엔진과 갈릴 수 있다. 그래서
 * 이 파일은 **엔진을 실제로 돌린 결과**를 렌더한다 — 손으로 만든 detail을 넣으면 「엔진이 준
 * 값을 쓰는가」가 아니라 「내가 넣은 값을 쓰는가」를 확인하게 된다.
 *
 * ⚠️ 이탈률 bp는 **절댓값**이다(`sale-split-deemed-unclear.ts` `deviationBp`). 화면이 초과/미달
 *    방향을 붙이면 그 자체가 재계산이므로, 부호 없이 크기만 표시하는 것이 계약이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rates = makeMockRates();

/** 계획서 §3.2 probe와 같은 자산 — 안분값 토지 9억 / 건물 6억 */
const mk = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2016-06-01"),
    landAcquisitionDate: new Date("2014-06-01"),
    acquisitionPrice: 0,
    landAcquisitionPrice: 400_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    landStandardPriceAtTransfer: 900_000_000,
    buildingStandardPriceAtTransfer: 600_000_000,
    isOneHousehold: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    ...over,
  });

/** 엔진을 실제로 돌려 그 결과를 렌더한다 */
function renderFor(over: Partial<TransferTaxInput> = {}, exemptionNote?: string) {
  const result = calculateTransferTax(mk(over), rates);
  render(
    <SplitGainDetailSection
      splitDetail={result.splitDetail!}
      assetKind="housing"
      {...(exemptionNote ? { exemptionNote } : {})}
    />,
  );
  return result.splitDetail!.saleSplitJudgment;
}

/** 토지 몰아주기 — 토지 14억 / 건물 1억 (안분 9억 / 6억) */
const OVER = { landTransferPrice: 1_400_000_000, buildingTransferPrice: 100_000_000 };

describe("U-9-1 — 발동 시 판정 근거를 표시한다", () => {
  it("발동 사실과 적용 가액이 화면에 있다", () => {
    const j = renderFor(OVER);
    expect(j!.deemedUnclear).toBe(true);
    expect(screen.getByTestId("sale-split-judgment")).toBeTruthy();
    expect(screen.getByText(/안분가액을 적용했습니다/)).toBeTruthy();
    // 적용 가액 = 안분값(9억 / 6억)
    expect(screen.getAllByText("900,000,000").length).toBeGreaterThan(0);
  });

  it("🔴 이탈률은 엔진 bp를 그대로 읽는다 — 화면이 다시 나누지 않는다", () => {
    const j = renderFor(OVER);
    // |14억 − 9억| / 9억 = 55.55…% · |1억 − 6억| / 6억 = 83.33…%
    expect(j!.landDeviationBp).toBe(5555);
    expect(j!.buildingDeviationBp).toBe(8333);
    // 화면 값이 엔진 bp에서 파생된 것과 일치한다
    expect(screen.getByText("55.6%")).toBeTruthy();
    expect(screen.getByText("83.3%")).toBeTruthy();
  });

  it("안분 기준(basis)을 밝힌다 — 기준시가로 안분됐다", () => {
    renderFor(OVER);
    expect(screen.getByText(/안분 기준: 양도시 기준시가/)).toBeTruthy();
  });
});

describe("U-9-2 — 미발동·예외도 각각 다르게 말한다", () => {
  it("범위 안이면 「그대로 적용」이라고 표시한다 (침묵하지 않는다)", () => {
    const j = renderFor({ landTransferPrice: 1_000_000_000, buildingTransferPrice: 500_000_000 });
    expect(j!.deemedUnclear).toBe(false);
    expect(screen.getByText(/30% 미만 차이로 그대로 적용/)).toBeTruthy();
  });

  it("§166⑧ 예외로 면한 경우 사유를 밝힌다 — 「차이가 없었다」와 다른 사실이다", () => {
    const j = renderFor({ ...OVER, saleSplitExemption: "other_law" });
    expect(j!.deemedUnclear).toBe(false);
    expect(j!.exemptionApplied).toBe("other_law");
    expect(screen.getByText(/예외로 구분 기재 가액을 인정했습니다/)).toBeTruthy();
    expect(screen.getByText(/§166⑧1호/)).toBeTruthy();
    // 이탈 사실 자체는 남는다 — 예외는 「면제」지 「차이 없음」이 아니다
    expect(screen.getByText("55.6%")).toBeTruthy();
  });

  it("일괄양도는 판정 자체가 없으므로 블록도 뜨지 않는다", () => {
    const j = renderFor();
    expect(j).toBeUndefined();
    expect(screen.queryByTestId("sale-split-judgment")).toBeNull();
  });
});

describe("U-9-3 — 감정평가가액 basis와 배제 사유", () => {
  const APPRAISAL = {
    landAppraisalAtTransfer: 1_200_000_000,
    buildingAppraisalAtTransfer: 300_000_000,
    appraisalDateAtTransfer: new Date("2023-06-01"),
  };

  it("감정평가가액이 채택되면 그렇게 밝힌다", () => {
    renderFor({ landTransferPrice: 1_200_000_000, buildingTransferPrice: 300_000_000, ...APPRAISAL });
    expect(screen.getByText(/안분 기준: 감정평가가액/)).toBeTruthy();
  });

  it("🔴 감정이 배제되면 **이유를 표시한다** — 조용히 기준시가로 넘어가지 않는다", () => {
    renderFor({
      ...OVER,
      ...APPRAISAL,
      appraisalDateAtTransfer: new Date("2022-12-31"), // 창 시작 하루 전
    });
    expect(screen.getByText(/유효 기간을 벗어나/)).toBeTruthy();
    expect(screen.getByText(/안분 기준: 양도시 기준시가/)).toBeTruthy();
  });

  it("한쪽만 평가된 경우도 이유를 표시한다", () => {
    renderFor({
      ...OVER,
      landAppraisalAtTransfer: 1_200_000_000,
      appraisalDateAtTransfer: new Date("2023-06-01"),
    });
    expect(screen.getByText(/한쪽만 평가되어/)).toBeTruthy();
  });
});

describe("U-9-4 — 신고서 각주 + §166⑧ 예외 근거 문구 (§12.5 3·4항목)", () => {
  const OVER_LOCAL = { landTransferPrice: 1_400_000_000, buildingTransferPrice: 100_000_000 };

  it("🔴 예외 근거 문구를 화면에 표시한다 — 엔진을 거치지 않는 값이라 폼에서 받아야 한다", () => {
    renderFor({ ...OVER_LOCAL, saleSplitExemption: "other_law" }, "매매계약 특약 제3조");
    expect(screen.getByTestId("sale-split-exemption-note-display")).toBeTruthy();
    expect(screen.getByText(/매매계약 특약 제3조/)).toBeTruthy();
  });

  it("근거를 넘기지 않으면 그 줄은 뜨지 않는다 — 빈 근거를 지어내지 않는다", () => {
    renderFor({ ...OVER_LOCAL, saleSplitExemption: "other_law" });
    expect(screen.queryByTestId("sale-split-exemption-note-display")).toBeNull();
  });

  it("예외 적용 시 신고서에 사유를 적으라고 안내한다", () => {
    renderFor({ ...OVER_LOCAL, saleSplitExemption: "other_law" }, "근거 문서");
    // ⚠️ `<strong>`이 문장을 쪼개므로 **단일 텍스트 노드** 기준으로 찾는다 —
    //    `getByText`는 요소 하나의 텍스트를 보지, 자식으로 나뉜 문장 전체를 잇지 않는다.
    expect(screen.getByText(/사유로 위 내용을 기재하세요/)).toBeTruthy();
  });

  it("🔴 발동 시 신고서 양도가액이 **안분가액**임을 각주로 알린다 — 계약서 금액과 다르다", () => {
    renderFor(OVER_LOCAL);
    expect(screen.getByText(/신고서 양도가액은/)).toBeTruthy();
    expect(screen.getByText(/계약서상 구분 기재 금액과 다릅니다/)).toBeTruthy();
  });

  it("미발동이면 그 각주는 뜨지 않는다 — 구분값이 그대로 신고되므로 다를 것이 없다", () => {
    renderFor({ landTransferPrice: 1_000_000_000, buildingTransferPrice: 500_000_000 });
    expect(screen.queryByText(/계약서상 구분 기재 금액과 다릅니다/)).toBeNull();
  });
});
