/**
 * RTL — 겸용주택 × 부담부증여 화면 (PR-3 · UI 설계 §9.1).
 *
 * 시드는 엔진 anchor F1(주택 100㎡·상가 100㎡ · 양도(증여)일 2024-03-01 · 시가 15억 · 채무 6억)의 화면 폼 재현이다.
 * 단언 축은 «값»이다 — 라디오는 `radioValues`/`checkedRadioValue`, 금액은 정확한 원 단위, 토글은 `aria-checked`/`data-disabled`.
 * 부재 단언에는 같은 시드의 긍정 짝을 둔다(`feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
  BuildingStdPriceModalButton: () => <button type="button">기준시가 계산</button>,
}));

import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { BurdenedGiftHousingAppraisalField } from "@/components/calc/transfer/BurdenedGiftMixedUsePanel";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { MixedUseToggleRow } from "@/components/calc/transfer/MixedUseSection";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { MixedUseLegacyStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseLegacyStdPrice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { stdPriceAtTransferComesFromElsewhere } from "@/lib/calc/burdened-gift-transfer-price-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { radioValues, checkedRadioValue } from "./_helpers/radio-values";

afterEach(cleanup);

const MIXED: Partial<AssetForm> = {
  assetId: "a1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  mixedAcqPerPartMode: false,
  acquisitionDate: "2010-03-15",
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
  mixedIsMetropolitanArea: true,
};
const BG: Partial<AssetForm> = {
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "700000000",
  bgHousingAppraisalDeclared: "none",
};
/** 기준시가 모드 — 비겸용 짝에서 «증여일 주택 기준시가» 칸이 렌더되는 모드다(시가 모드는 그 칸이 비겸용에서도 숨는다). */
const STD_MODE: Partial<AssetForm> = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "", bgHousingAppraisalDeclared: "" };
const seed = (over: Partial<AssetForm> = {}): AssetForm => ({ ...makeDefaultAsset(1), ...MIXED, ...BG, ...over }) as AssetForm;

/** 상태를 실제로 갖는 하네스 — 클릭이 폼을 바꾸는 경로를 그대로 탄다. */
function Harness({ initial, onState }: { initial: AssetForm; onState?: (a: AssetForm) => void }) {
  const [a, setA] = useState(initial);
  onState?.(a);
  return <TransferModeBlock asset={a} onChange={(p) => setA((prev) => ({ ...prev, ...p }))} transferDate="2024-03-01" />;
}

describe("BGM-U1 · 겸용 × 부담부증여에서 기준시가 요약 패널이 나오고 중복 입력칸은 숨는다", () => {
  it("기준시가 모드: 요약 패널이 있고, 증여일 주택 기준시가 칸(bg-gift-building-std)은 없다 · 시가 모드도 요약 패널이 있다", () => {
    const { container } = render(<Harness initial={seed(STD_MODE)} />);
    expect(container.querySelector('[data-testid="bg-mixed-valuation-summary"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bg-gift-building-std"]')).toBeNull();
    cleanup();
    const market = render(<Harness initial={seed()} />);
    expect(market.container.querySelector('[data-testid="bg-mixed-valuation-summary"]')).not.toBeNull();
  });

  it("🔴 짝: 같은 기준시가 모드의 비겸용 주택 × 부담부증여에는 요약 패널이 없고 bg-gift-building-std가 있다", () => {
    const { container } = render(<Harness initial={seed({ ...STD_MODE, isMixedUseHouse: false })} />);
    expect(container.querySelector('[data-testid="bg-mixed-valuation-summary"]')).toBeNull();
    expect(container.querySelector('[data-testid="bg-gift-building-std"]')).not.toBeNull();
  });

  it("양도시·취득시 총액 칸을 요구하는 두 술어가 겸용에서 꺼진다 (⑧ 면제와 같은 leaf)", () => {
    // 기준시가 모드라야 다른 항들이 모두 참이 되어 겸용 가드가 «유일한 이유»가 된다(시가 + 실지 시드는 겸용 가드 없이도 거짓이라 구별력이 없다)
    expect(needsBgAcqStdPriceInput(seed(STD_MODE) as never)).toBe(false);
    expect(needsBgAcqStdPriceInput(seed({ ...STD_MODE, isMixedUseHouse: false }) as never)).toBe(true);
    expect(stdPriceAtTransferComesFromElsewhere(seed(STD_MODE) as never)).toBe(true);
    // 짝 — 같은 기준시가 모드의 비겸용은 종전대로(공용 칸이 있다)
    expect(stdPriceAtTransferComesFromElsewhere(seed({ ...STD_MODE, isMixedUseHouse: false }) as never)).toBe(false);
  });
});

describe("BGM-U2 · 요약 합계는 원 단위로 정확하다", () => {
  it("양도시 12억(주택 6억 + 상가 부수토지 5억 + 상가건물 1억) · 취득시 6억", () => {
    const { getByTestId } = render(<Harness initial={seed()} />);
    expect(getByTestId("bg-mixed-std-housing").textContent).toBe("600,000,000");
    expect(getByTestId("bg-mixed-std-commercial-land").textContent).toBe("500,000,000");
    expect(getByTestId("bg-mixed-std-commercial-building").textContent).toBe("100,000,000");
    expect(getByTestId("bg-mixed-std-total-transfer").textContent).toBe("1,200,000,000");
    expect(getByTestId("bg-mixed-std-total-acq").textContent).toBe("600,000,000");
  });

  it("입력이 비면 0으로 메우지 않고 «아직 입력하지 않은 칸»을 안내한다 (자동 안분 fallback 금지)", () => {
    const { getByTestId } = render(<Harness initial={seed({ mixedTransferHousingPrice: "" })} />);
    expect(getByTestId("bg-mixed-std-total-transfer").textContent).toBe("—");
    expect(getByTestId("bg-mixed-valuation-missing").textContent).toContain("양도시 개별주택공시가격");
  });
});

describe("BGM-U3 · 채무 귀속 라디오 — 항목별, 기본값 없음", () => {
  it("담보차입금 귀속 선택지 값은 [housing, commercial, unallocated, split]이고 아무것도 선택되어 있지 않다", () => {
    const { container } = render(<Harness initial={seed()} />);
    expect(radioValues(container, "bgMortgageAttribution")).toEqual(["housing", "commercial", "unallocated", "split"]);
    expect(checkedRadioValue(container, "bgMortgageAttribution")).toBeUndefined();
  });

  it("🔴 짝: 임대보증금이 0이면 임대보증금 귀속 그룹은 없다 (입력한 항목만 묻는다)", () => {
    const { container } = render(<Harness initial={seed()} />);
    expect(radioValues(container, "bgDepositAttribution")).toEqual([]);
    cleanup();
    const both = render(<Harness initial={seed({ bgLendingDepositTotal: "100000000" })} />);
    expect(radioValues(both.container, "bgDepositAttribution")).toEqual(["housing", "commercial", "unallocated", "split"]);
  });

  it("선택하면 그 값이 폼에 들어간다 (상가)", () => {
    let latest: AssetForm | undefined;
    const { container } = render(<Harness initial={seed()} onState={(a) => (latest = a)} />);
    const radio = container.querySelector<HTMLInputElement>('input[type="radio"][name^="bgMortgageAttribution"][value="commercial"]')!;
    fireEvent.click(radio);
    expect(latest?.bgMortgageAttribution).toBe("commercial");
    expect(checkedRadioValue(container, "bgMortgageAttribution")).toBe("commercial");
  });
});

describe("BGM-U4 · 나누어 입력(split)", () => {
  it("split을 고르면 3칸과 «남은 금액»이 나온다 — 합이 맞으면 0원", () => {
    const { getByTestId, queryByTestId } = render(
      <Harness initial={seed({ bgMortgageAttribution: "split", bgMortgageSplitHousing: "100000000", bgMortgageSplitCommercial: "200000000", bgMortgageSplitUnallocated: "300000000" })} />,
    );
    expect(getByTestId("bg-attr-remainder-mortgage").textContent).toContain("남은 금액 0원");
    cleanup();
    const part = render(<Harness initial={seed({ bgMortgageAttribution: "split", bgMortgageSplitHousing: "100000000" })} />);
    expect(part.getByTestId("bg-attr-remainder-mortgage").textContent).toContain("남은 금액 500,000,000원");
    cleanup();
    // 짝 — split이 아니면 남은 금액 줄이 없다
    const other = render(<Harness initial={seed({ bgMortgageAttribution: "unallocated" })} />);
    expect(other.queryByTestId("bg-attr-remainder-mortgage")).toBeNull();
    expect(queryByTestId).toBeDefined();
  });

  it("모드를 split → 구분 불분명으로 바꿔도 분할 입력값은 폼에 보존된다 (지우지 않는다)", () => {
    let latest: AssetForm | undefined;
    const { container } = render(
      <Harness initial={seed({ bgMortgageAttribution: "split", bgMortgageSplitHousing: "100000000" })} onState={(a) => (latest = a)} />,
    );
    fireEvent.click(container.querySelector<HTMLInputElement>('input[type="radio"][name^="bgMortgageAttribution"][value="unallocated"]')!);
    expect(latest?.bgMortgageAttribution).toBe("unallocated");
    expect(latest?.bgMortgageSplitHousing).toBe("100000000");
  });
});

describe("BGM-U5 · 부분별 채무비율 표 — «양도 없음» 배지, 비과세 말 금지", () => {
  it("상가 귀속만 → 주택분 «양도 없음» 배지, 상가분 배지 없음", () => {
    const { getByTestId, queryByTestId, container } = render(<Harness initial={seed({ bgMortgageAttribution: "commercial" })} />);
    expect(getByTestId("bg-attr-debt-housing").textContent).toBe("0");
    expect(getByTestId("bg-attr-debt-commercial").textContent).toBe("600,000,000");
    expect(getByTestId("bg-attr-not-transferred-housing").textContent).toContain("양도 없음");
    expect(queryByTestId("bg-attr-not-transferred-commercial")).toBeNull();
    expect(getByTestId("bg-attr-parts").textContent).not.toMatch(/비과세/);
    expect(container.textContent).toBeTruthy();
  });

  it("전부 구분 불분명 → 양쪽 3억씩(증여가액 비율), 배지 없음, 확인 필요 고지", () => {
    const { getByTestId, queryByTestId, container } = render(<Harness initial={seed({ bgMortgageAttribution: "unallocated" })} />);
    expect(getByTestId("bg-attr-debt-housing").textContent).toBe("300,000,000");
    expect(getByTestId("bg-attr-debt-commercial").textContent).toBe("300,000,000");
    expect(queryByTestId("bg-attr-not-transferred-housing")).toBeNull();
    expect(container.textContent).toContain("해석례가 직접 답하지 않아 확인이 필요합니다");
  });
});

describe("BGM-U6 · 구분 감정평가 선언 (G-13) — 필수·기본값 없음", () => {
  it("선택지 값은 [none, exists]이고 기본은 미선택, exists면 주택분 시가 칸이 열린다", () => {
    const { container, queryByTestId } = render(<BurdenedGiftHousingAppraisalField asset={seed({ bgHousingAppraisalDeclared: "" })} onChange={() => {}} />);
    expect(radioValues(container, "bgHousingAppraisalDeclared")).toEqual(["none", "exists"]);
    expect(checkedRadioValue(container, "bgHousingAppraisalDeclared")).toBeUndefined();
    expect(container.querySelector('[data-field="bgHousingAppraisalValue"]')).toBeNull();
    cleanup();
    const on = render(<BurdenedGiftHousingAppraisalField asset={seed({ bgHousingAppraisalDeclared: "exists" })} onChange={() => {}} />);
    expect(on.container.querySelector('[data-field="bgHousingAppraisalValue"]')).not.toBeNull();
    expect(queryByTestId).toBeDefined();
  });
});

describe("BGM-U7 · 같이 계산할 수 없는 조합은 «켜는 쪽만» 막는다 (막다른 길 방지)", () => {
  const rootOf = (c: HTMLElement, field: string) => c.querySelector<HTMLElement>(`[data-field="${field}"]`);

  it("보유 중 일부 용도변경 토글: 꺼져 있으면 비활성(사유 표시)", () => {
    const { container } = render(<MixedUseToggleRow asset={seed()} onChange={() => {}} />);
    const root = rootOf(container, "hasPartialUsageChange")!;
    expect(root.getAttribute("data-disabled")).toBe("true");
    expect(root.textContent).toContain("부담부증여는 보유 중 일부 용도변경과 함께 계산할 수 없습니다");
  });

  it("🔴 짝1: 이미 켜져 있으면 비활성이 아니다 — 끌 수 있어야 한다", () => {
    const { container } = render(<MixedUseToggleRow asset={seed({ hasPartialUsageChange: true })} onChange={() => {}} />);
    expect(rootOf(container, "hasPartialUsageChange")!.getAttribute("data-disabled")).toBeNull();
  });

  it("🔴 짝2: 부담부증여가 아니면(일반 양도 겸용) 켜는 쪽도 막지 않는다", () => {
    const { container } = render(<MixedUseToggleRow asset={seed({ transferType: "regular" })} onChange={() => {}} />);
    expect(rootOf(container, "hasPartialUsageChange")!.getAttribute("data-disabled")).toBeNull();
  });

  it("PHD 토글: 꺼져 있으면 비활성 / 켜져 있으면 끌 수 있다 / 일반 양도는 막지 않는다", () => {
    const props = { onChange: () => {}, transferDate: "2024-03-01", useEstimatedAcquisition: true } as const;
    const off = render(<MixedUseAssetMajorStdPrice asset={seed({ useEstimatedAcquisition: true })} {...props} />);
    expect(rootOf(off.container, "usePreHousingDisclosure")?.getAttribute("data-disabled")).toBe("true");
    cleanup();
    const on = render(<MixedUseAssetMajorStdPrice asset={seed({ useEstimatedAcquisition: true, usePreHousingDisclosure: true })} {...props} />);
    expect(rootOf(on.container, "usePreHousingDisclosure")?.getAttribute("data-disabled")).toBeNull();
    cleanup();
    const regular = render(<MixedUseAssetMajorStdPrice asset={seed({ useEstimatedAcquisition: true, transferType: "regular" })} {...props} />);
    expect(rootOf(regular.container, "usePreHousingDisclosure")?.getAttribute("data-disabled")).toBeNull();
  });
});

describe("BGM-U7b · 레거시 레이아웃의 PHD 토글도 같은 규칙", () => {
  it("꺼져 있으면 비활성 / 켜져 있으면 끌 수 있다 / 일반 양도는 막지 않는다", () => {
    const root = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-field="usePreHousingDisclosure"]');
    const props = { onChange: () => {}, transferDate: "2024-03-01", useEstimatedAcquisition: true } as const;
    const off = render(<MixedUseLegacyStdPrice asset={seed({ useEstimatedAcquisition: true })} {...props} />);
    expect(root(off.container)?.getAttribute("data-disabled")).toBe("true");
    cleanup();
    const on = render(<MixedUseLegacyStdPrice asset={seed({ useEstimatedAcquisition: true, usePreHousingDisclosure: true })} {...props} />);
    expect(root(on.container)?.getAttribute("data-disabled")).toBeNull();
    expect(root(on.container)).not.toBeNull();
    cleanup();
    const regular = render(<MixedUseLegacyStdPrice asset={seed({ useEstimatedAcquisition: true, transferType: "regular" })} {...props} />);
    expect(root(regular.container)).not.toBeNull();
    expect(root(regular.container)?.getAttribute("data-disabled")).toBeNull();
  });
});

describe("BGM-U8 · 취득 원인 — 증여자가 상속·증여로 취득한 조합은 선택지에서 막는다(현재 값은 막지 않는다)", () => {
  const radioEl = (c: HTMLElement, v: string) => c.querySelector<HTMLInputElement>(`input[type="radio"][name^="acquisitionCause"][value="${v}"]`)!;

  it("매매 선택 상태: 상속·증여·이월과세·신축은 disabled, 매매는 선택 가능", () => {
    const { container } = render(<CompanionAcquisitionCauseSection asset={seed()} onChange={() => {}} transferDate="2024-03-01" isNewConstruction={false} />);
    for (const v of ["inheritance", "gift", "carryover_gift", "newConstruction"]) {
      expect(radioEl(container, v), v).not.toBeNull();
      expect(radioEl(container, v).disabled, v).toBe(true);
    }
    expect(radioEl(container, "purchase").disabled).toBe(false);
  });

  it("🔴 짝1: 이미 상속으로 선택된 값은 막지 않는다 — ⑧이 점프시킨 칸에서 다른 옵션을 고를 수 있다", () => {
    const { container } = render(<CompanionAcquisitionCauseSection asset={seed({ acquisitionCause: "inheritance" })} onChange={() => {}} transferDate="2024-03-01" isNewConstruction={false} />);
    expect(radioEl(container, "purchase").disabled).toBe(false);
    expect(radioEl(container, "inheritance").disabled).toBe(false);
  });

  it("🔴 짝2: 부담부증여가 아니면(일반 양도) 어느 옵션도 막지 않는다", () => {
    const { container } = render(<CompanionAcquisitionCauseSection asset={seed({ transferType: "regular" })} onChange={() => {}} transferDate="2024-03-01" isNewConstruction={false} />);
    expect(radioEl(container, "inheritance").disabled).toBe(false);
  });
});
