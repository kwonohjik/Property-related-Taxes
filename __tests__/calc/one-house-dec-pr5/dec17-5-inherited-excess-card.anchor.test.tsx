/**
 * #17-5 ② ⑤ — 개별주택가격(보충적 평가) 상속·증여 주택의 배율 초과분 분리 카드: 취득시 개별주택가격은 상속·증여 평가액 그 자체라 칸을 따로 받지 않고(네 칸),
 * 계약서 토지·건물 구분금액(매매계약서의 가액 구분) 칸도 열지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HousingExcessSplitCard } from "@/components/calc/transfer/HousingExcessSplitCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const BASE: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "inheritance",
  acquisitionDate: "2012-01-02",
  inheritanceStartDate: "2012-01-02",
  decedentAcquisitionDate: "2005-06-01",
  inheritanceAssetKind: "house_individual",
  inheritanceValuationMethod: "supplementary",
  publishedValueAtInheritance: "300000000",
  addressJibun: "서울 테스트동 1",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  areaScenario: "same",
  acquisitionArea: "500",
  transferArea: "500",
};
const make = (over: Partial<AssetForm> = {}) => ({ ...makeDefaultAsset(1), ...BASE, ...over }) as AssetForm;
const noop = () => {};

describe("HousingExcessSplitCard — 보충적 평가 상속·증여", () => {
  it("🔑 상속 + 초과 200㎡ → 카드가 뜨고 총액 칸 없이 «평가액을 그대로 씁니다» · 네 칸 · 상증 해석 근거 문구", () => {
    render(<HousingExcessSplitCard asset={make()} onChange={noop} transferDate="2026-02-16" />);
    expect(screen.getByTestId("housing-excess-split-card")).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-acq-total")).toBeNull();
    expect(screen.getByTestId("housing-excess-acq-total-elsewhere").textContent).toContain("상속·증여 평가액");
    expect(screen.getByText(/아래 네 칸을 모두 입력하세요/)).toBeTruthy();
    expect(screen.getByText(/서면인터넷방문상담4팀-688/)).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-acq-contract")).toBeNull();
  });

  it("대조 — 매매 취득은 종전처럼 총액 칸과 다섯 칸 · 계약서 구분금액 칸", () => {
    render(<HousingExcessSplitCard asset={make({ acquisitionCause: "purchase", fixedAcquisitionPrice: "500000000" })} onChange={noop} transferDate="2026-02-16" />);
    expect(screen.getByTestId("housing-excess-acq-total")).toBeTruthy();
    expect(screen.getByText(/아래 다섯 칸을 모두 입력하세요/)).toBeTruthy();
    expect(screen.getByTestId("housing-excess-acq-contract")).toBeTruthy();
  });

  it("대조 — 시가 평가 상속은 분리 경로 밖이라 카드가 없다", () => {
    render(<HousingExcessSplitCard asset={make({ inheritanceValuationMethod: "market_value" })} onChange={noop} transferDate="2026-02-16" />);
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
  });

  it("대조 — 함께 양도 카드(isNonPrimary)는 카드가 없다", () => {
    render(<HousingExcessSplitCard asset={make()} onChange={noop} transferDate="2026-02-16" isNonPrimary />);
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
  });
});
