/**
 * 의제취득일(1985.1.1.) 전 상속·증여 상가 — ③의 분자 = §164⑥ 값 ⑤ 화면 (사용자 결정 A안 · 계획서 `commercial-pre-deemed-converted-numerator.plan.md`).
 *
 * · 양도세 계산기: 의제취득일 기준시가 칸이 §164⑥ 값을 잠근 채 보여 준다(주택·토지 자동값과 같은 규약 — 직접 입력 토글로 해제).
 *   §164⑥ 섹션은 이 칸보다 아래에 그려지므로 문구가 「아래」를 가리킨다.
 * · §164⑥ 섹션 문구: 의제취득일 전이면 ②이자 ③의 분자(1985~2004 상속은 종전 문구).
 * · 증여세 계산기: 시가 평가도 §164⑥ 8칸이 다 차면 칸을 비워도 된다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PreDeemedConversionFields } from "@/components/calc/transfer/inheritance/PreDeemedConversionFields";
import { CommercialInheritanceStdPriceSection } from "@/components/calc/transfer/CommercialInheritanceStdPriceSection";
import { BurdenedGiftTransferSection } from "@/components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

afterEach(cleanup);

const CB8: Partial<AssetForm> = {
  cbExclusiveArea: "50",
  cbSharedArea: "20",
  cbLandArea: "100",
  cbUnitPriceAtFirstOrAcq: "10000000",
  cbLandPricePerSqmAtAcq: "500000",
  cbLandPricePerSqmAtFirst: "700000",
  cbBuildingStdPriceAtAcq: "30000000",
  cbBuildingStdPriceAtFirst: "40000000",
  cbAcqBuildingStdBy164_5: true,
};
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "commercial_building",
    acquisitionCause: "inheritance",
    acquisitionDate: "1983-07-26",
    inheritanceStartDate: "1983-07-26",
    decedentAcquisitionDate: "1970-01-01",
    standardPriceAtAcq: "200000000",
    standardPriceAtTransfer: "600000000",
    ...over,
  }) as AssetForm;

function fields(a: AssetForm) {
  const { container } = render(
    <PreDeemedConversionFields asset={a} onChange={() => {}} transferDate="2023-02-16" baseDate="1983-07-26" showHouseValuation={false} />,
  );
  const card = container.querySelector('[data-field="standardPriceAtAcq"]') as HTMLElement;
  const input = card.querySelector("input") as HTMLInputElement;
  return { text: card.textContent ?? "", input, all: container.textContent ?? "" };
}

describe("양도세 계산기 — 의제취득일 기준시가 칸", () => {
  it("F-1 §164⑥ 8칸이 다 차면 칸이 509,090,909을 잠근 채 보여 주고 「아래 §164⑥」을 가리킨다", () => {
    const f = fields(asset(CB8));
    expect(f.input.value.replace(/,/g, "")).toBe("509090909");
    expect(f.input.disabled).toBe(true);
    expect(f.text).toContain("아래 §164⑥ 취득당시 기준시가 사용 중");
    expect(f.all).toContain("의제취득일 시점 기준시가 직접 입력");
  });

  it("F-2 직접 입력 토글을 켜면 칸 값(200,000,000)을 입력할 수 있다", () => {
    const f = fields(asset({ ...CB8, useStandardPriceAtAcqOverride: true }));
    expect(f.input.value.replace(/,/g, "")).toBe("200000000");
    expect(f.input.disabled).toBe(false);
  });

  it("F-3 8칸이 없으면 직접 입력 칸이고 안내가 아래 §164⑥ 8칸을 알린다 · 직접 입력 토글은 없다", () => {
    const f = fields(asset());
    expect(f.input.disabled).toBe(false);
    expect(f.text).toContain("아래 §164⑥ 취득당시 기준시가 8개 항목을 모두 입력하면 그 값이 자동으로 쓰입니다");
    expect(f.all).not.toContain("의제취득일 시점 기준시가 직접 입력");
  });

  it("F-4 토지는 종전 문구 그대로(상가 문구가 새지 않는다)", () => {
    const f = fields(asset({ assetKind: "land" }));
    expect(f.text).not.toContain("§164⑥");
  });
});

describe("양도세 계산기 — §164⑥ 섹션 문구", () => {
  const section = (a: AssetForm) => render(<CommercialInheritanceStdPriceSection asset={a} onChange={() => {}} transferDate="2023-02-16" />);

  it("S-1 의제취득일 전 일반 양도 — ②이자 ③의 의제취득일 기준시가", () => {
    const { container } = section(asset(CB8));
    const note = container.querySelector('[data-testid="cb164-6-pre-deemed-note"]');
    expect(note?.textContent).toContain("②이자 ③ 환산취득가액의 의제취득일 기준시가");
    expect(note?.textContent).toContain("① 상속개시일 상증법 평가액·② 이 값·③ 환산취득가액 중 큰 금액");
  });

  it("S-2 1995 상속(의제취득일 이후)은 종전 문구 — ③을 말하지 않는다", () => {
    const { container } = section(asset({ ...CB8, acquisitionDate: "1995-07-26", inheritanceStartDate: "1995-07-26" }));
    expect(container.querySelector('[data-testid="cb164-6-pre-deemed-note"]')).toBeNull();
    expect(container.textContent).toContain("상증법 평가액과 §164⑥ 취득당시 기준시가 중 큰 금액");
  });

  it("S-3 부담부증여 시가 평가 — ② 후보이자 ③의 의제취득일 기준시가", () => {
    const { container } = section(
      asset({
        ...CB8,
        transferType: "burdened_gift",
        bgValuationMode: "sangjeungbeop_market",
        bgMarketValueAtTransfer: "920000000",
        bgMortgageDebtAmount: "460000000",
        bgDonorRelation: "lineal_descendant",
      }),
    );
    expect(container.querySelector('[data-testid="cb164-6-bg-note"]')?.textContent).toContain("③ 환산취득가액의 의제취득일 기준시가");
  });
});

describe("증여세 계산기 — 비주택 건물", () => {
  const C164: Partial<BurdenedGiftTransferTaxInput> = {
    c164ExclusiveArea: "50",
    c164SharedArea: "20",
    c164LandArea: "100",
    c164UnitPriceAtFirst: "10000000",
    c164LandPricePerSqmAtAcq: "500000",
    c164LandPricePerSqmAtFirst: "700000",
    c164BuildingStdPriceAtAcq: "30000000",
    c164BuildingStdPriceAtFirst: "40000000",
    c164AcqBuildingStdBy164_5: true,
  };
  const item = (bgt: Partial<BurdenedGiftTransferTaxInput>): EstateItem =>
    ({
      id: "b-1",
      category: "real_estate_building",
      name: "테스트 상가",
      standardPrice: 1_243_350_000,
      areaSqm: 184.2,
      marketValue: 920_000_000,
      leaseDeposit: 0,
      mortgageAmount: 460_000_000,
      assumedDebtForGift: 460_000_000,
      monthlyRent: 0,
      burdenedGiftTransferTax: {
        acquisitionDate: new Date("1983-07-26"),
        standardPriceAtAcquisition: 202_620_000,
        acquisitionCause: "inheritance",
        decedentAcquisitionDate: "1970-01-01",
        isHousing: false,
        ...bgt,
      },
    }) as unknown as EstateItem;
  const view = (it: EstateItem) =>
    render(<BurdenedGiftTransferSection item={it} onChange={() => {}} hasOtherBurdenedGiftTransfer={false} transferDate="2023-02-16" />).container;

  it("G-1 시가 평가 · 8칸 — 의제취득일 기준시가 칸은 필수가 아니고 §164⑥이 ③의 분자라고 알린다 · §164⑥ 카드도 ③을 말한다", () => {
    const c = view(item(C164));
    expect(c.textContent).toContain("(시가 평가면 ③ 환산취득가액의 분자) — 이 칸은 입력하지 않아도 됩니다");
    expect(c.querySelector('[data-testid="bg-c164-note"]')?.textContent).toContain("③ 환산취득가액의 의제취득일 기준시가");
  });

  it("G-2 8칸이 없으면 종전 안내(칸이 ③의 분자)", () => {
    const c = view(item({}));
    expect(c.textContent).not.toContain("이 칸은 입력하지 않아도 됩니다");
  });
});
