/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 1h-G1-2(결정 #23 B): 평가방식 라디오·«양도 시 시가» 칸을 없애고 증여세 평가에서 파생해 읽기 전용으로 보인다.
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | UI-V1 | 기준시가 평가 → «보충적 평가 → 기준시가 안분», 시가 평가 → «시가 평가(K-4/K-5)» + 평가액. 라디오·시가 입력 칸이 없다 |
 * | UI-V2 | 옛 저장 기록 고지(양방향): 시가→기준시가면 «쓰지 않는다», 기준시가→시가면 «시가 평가로 계산» |
 * | UI-V3 | 담보평가(§66)가 시가보다 크면 산정방식 라디오 없이 확인 필요 카드(취득시 기준시가 입력 안내) |
 * | UI-V4 | 양도시 기준시가(공시가격) 칸은 시가 평가에서도 보인다(환산·담보 승 필수) · 토지 K-5의 ㎡당 칸은 없다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import { ValuationModeSection } from "@/components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function apt(over: Partial<EstateItem> = {}, bgt: Partial<BurdenedGiftTransferTaxInput> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 900_000_000,
    leaseDeposit: 300_000_000,
    mortgageAmount: 0,
    assumedDebtForGift: 300_000_000,
    ...over,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2016-01-10"),
      standardPriceAtAcquisition: 500_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 60,
      ...bgt,
    },
  } as unknown as EstateItem;
}
const section = (item: EstateItem) =>
  render(<ValuationModeSection bgt={item.burdenedGiftTransferTax!} set={() => {}} item={item} isLandType={item.category === "real_estate_land"} />);
const id = (t: string) => screen.queryByTestId(t);

describe("UI-V1 읽기 전용 표시", () => {
  it("★ 기준시가 평가(시가·감정가·매매사례가 없음): 보충적 평가 → 기준시가 안분 · 라디오/시가 칸/산정방식 없음", () => {
    section(apt());
    expect(id("bg-valuation-basis-standard")?.textContent).toContain("보충적 평가(기준시가) → 기준시가 안분 (K-1~K-3)");
    expect(id("bg-valuation-basis-market")).toBeNull();
    for (const t of ["bg-valuation-mode-standard", "bg-valuation-mode-market", "bg-market-value-at-transfer", "bg-acq-method-actual", "bg-acq-method-converted"]) {
      expect(id(t)).toBeNull();
    }
  });
  it("★ 매매사례가액으로 평가: 시가 평가(K-4/K-5) + 평가액 · 산정방식 라디오는 있고 시가 입력 칸은 없다", () => {
    section(apt({ similarSalesValue: 1_400_000_000 }));
    const t = id("bg-valuation-basis-market")?.textContent ?? "";
    expect(t).toContain("유사매매사례가액");
    expect(t).toContain("1,400,000,000");
    expect(t).toContain("시가 평가 (K-4/K-5)");
    expect(id("bg-acq-method-actual")).not.toBeNull();
    expect(id("bg-acq-method-converted")).not.toBeNull();
    expect(id("bg-market-value-at-transfer")).toBeNull();
    expect(id("bg-valuation-mode-market")).toBeNull();
  });
  it("감정가액·시가도 시가 평가다(증여세 평가와 같은 우선순위)", () => {
    section(apt({ appraisedValue: 1_100_000_000 }));
    expect(id("bg-valuation-basis-market")?.textContent).toContain("감정가액");
    cleanup();
    section(apt({ marketValue: 1_200_000_000, appraisedValue: 1_100_000_000 }));
    expect(id("bg-valuation-basis-market")?.textContent).toContain("1,200,000,000");
  });
});

describe("UI-V2 옛 저장 기록 양방향 고지", () => {
  it("★ 시가로 저장돼 있었는데 지금 증여세 평가가 기준시가: 입력해 둔 시가·실지취득가액은 쓰지 않는다", () => {
    section(apt({}, { valuationMode: "sangjeungbeop_market", acquisitionMethod: "actual", actualAcquisitionTotal: 123 }));
    expect(id("bg-valuation-stale-market")?.textContent).toContain("기준시가 안분으로 계산");
    expect(id("bg-valuation-stale-standard")).toBeNull();
  });
  it("★ 기준시가로 저장돼 있었는데 지금 시가 평가이고 산정방식이 없다: 시가 평가로 계산 · 산정방식 선택 안내", () => {
    section(apt({ similarSalesValue: 1_400_000_000 }, { valuationMode: "sangjeungbeop_standard" }));
    expect(id("bg-valuation-stale-standard")?.textContent).toContain("시가 평가");
  });
  it("부정 짝 — 새 기록(저장된 평가방식 없음)·같은 방식·산정방식 선택 완료면 고지 없음", () => {
    section(apt({ similarSalesValue: 1_400_000_000 }));
    expect(id("bg-valuation-stale-standard")).toBeNull();
    cleanup();
    section(apt({ similarSalesValue: 1_400_000_000 }, { valuationMode: "sangjeungbeop_standard", acquisitionMethod: "converted" }));
    expect(id("bg-valuation-stale-standard")).toBeNull();
    cleanup();
    section(apt({}, { valuationMode: "sangjeungbeop_standard" }));
    expect(id("bg-valuation-stale-market")).toBeNull();
  });
});

describe("UI-V3 담보평가(§66)가 시가보다 크다", () => {
  it("★ 산정방식 라디오 없이 확인 필요 카드 · 취득시 기준시가 입력 안내", () => {
    section(apt({ similarSalesValue: 500_000_000, leaseDeposit: 0, mortgageAmount: 600_000_000, assumedDebtForGift: 600_000_000 }));
    expect(id("bg-valuation-collateral-forced")?.textContent).toContain("확인이 필요합니다");
    expect(id("bg-valuation-collateral-forced")?.textContent).toContain("취득시 기준시가를 입력하세요");
    expect(id("bg-acq-method-actual")).toBeNull();
    expect(id("bg-acq-method-converted")).toBeNull();
  });
  it("부정 짝 — 채무가 시가보다 작으면 카드 없음 · 라디오 있음", () => {
    section(apt({ similarSalesValue: 500_000_000, leaseDeposit: 0, mortgageAmount: 300_000_000, assumedDebtForGift: 300_000_000 }));
    expect(id("bg-valuation-collateral-forced")).toBeNull();
    expect(id("bg-acq-method-actual")).not.toBeNull();
  });
});

describe("UI-V4 양도시 기준시가 칸", () => {
  const renderGift = (item: EstateItem) =>
    render(<EstateBodyRealEstate item={item} onUpdate={() => {}} valuationDate="2025-06-01" mode="gift" showCollateralDeductToggle={false} />);

  it("★ 시가 평가(K-5 환산)에서도 양도시 기준시가(공시가격) 칸이 보인다(종전엔 시가 모드가 숨겨 ⑧만 요구하던 막다른 길)", () => {
    renderGift(apt({ similarSalesValue: 1_400_000_000 }, { acquisitionMethod: "converted" }));
    expect(id("bg-transfer-transfer-stdprice")).not.toBeNull();
  });
  it("기준시가 평가에서도 보인다", () => {
    renderGift(apt());
    expect(id("bg-transfer-transfer-stdprice")).not.toBeNull();
  });
  it("★ 토지 K-5: ㎡당 «양도시 개별공시지가 (원/㎡) — K-5 환산 분모» 칸이 없다 — 총액 한 칸(보충적 평가)만", () => {
    const land = {
      id: "land-1", category: "real_estate_land", name: "토지", standardPrice: 450_000_000, marketValue: 600_000_000,
      leaseDeposit: 0, mortgageAmount: 300_000_000, assumedDebtForGift: 300_000_000, areaSqm: 100,
      burdenedGiftTransferTax: { acquisitionDate: new Date("2010-03-01"), standardPriceAtAcquisition: 150_000_000, acquisitionMethod: "converted" },
    } as unknown as EstateItem;
    renderGift(land);
    expect(screen.queryByText(/K-5 환산 분모/)).toBeNull();
    expect(id("bg-transfer-transfer-stdprice-land")).not.toBeNull();
  });
});
