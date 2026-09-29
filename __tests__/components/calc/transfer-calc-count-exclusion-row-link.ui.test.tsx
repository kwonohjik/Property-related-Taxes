/**
 * 양도세 계산기 — 조특법 주택 수 제외의 **입력 위치**가 명부 행 ⑥으로 옮겨졌다 (⑤·⑥·⑦)
 *
 * 계획서 `docs/00-pm/transfer-calc-count-exclusion-row-link.plan.md` Q-2′·Q-3·Q-6.
 * 엔진·④·⑧은 `__tests__/calc/transfer-calc-count-exclusion-row-link.anchor.test.ts`가 고정한다.
 * 여기서만 보이는 것: 패널에서 사라졌는가 · 명부 모달에 ⑥이 뜨는가(게이트) · 옛 선언 카드가
 * 차단을 푸는가 · 결과 카드가 어느 주택인지 말하는가.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const ROW: HouseEntry = {
  id: "r",
  region: "non_capital",
  acquisitionDate: "2021-01-01",
  officialPrice: "150000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
} as HouseEntry;

const RURAL = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "2021-01-01",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
  ruralHouseJibun: "",
} as AssetReductionForm;

function form(
  over: Partial<TransferFormData> = {},
  assetKind: AssetForm["assetKind"] = "housing",
  reductions: AssetReductionForm[] = [],
): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "2",
    ...over,
    assets: base.assets.map((a, i) =>
      i === 0 ? ({ ...a, assetKind, acquisitionDate: "2015-01-01", reductions } as AssetForm) : a,
    ),
  };
}

describe("⑤ ③ 감면 패널 — 세 유형은 목록에서 빠진다 (Q-3)", () => {
  it("[UI-1] 신축·미분양 그룹을 펼쳐도 §99의4·§98의9가 없고, 어디서 입력하는지 안내한다", () => {
    const asset = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2015-01-01" } as AssetForm;
    const { container } = render(<UnifiedReductionPanel asset={asset} transferDate="2024-06-01" onChange={() => {}} />);
    fireEvent.click(screen.getByText("신축주택").closest("button")!);
    fireEvent.click(screen.getByText("미분양주택").closest("button")!);
    const text = container.textContent ?? "";
    // 짝: 같은 그룹의 다른 조문은 그대로 보인다(셀렉터가 무의미하지 않다)
    expect(text).toContain("§99의3");
    expect(text).toContain("§98의8");
    expect(text).not.toContain("§99의4 (농어촌주택)");
    expect(text).not.toContain("§99의4 (고향주택)");
    expect(text).not.toContain("§98의9 — 수도권 밖 준공후미분양");
    expect(screen.getByTestId("reduction-row-count-exclusion-hint-new_housing").textContent).toContain(
      "⑥ 주택 수 제외(조특법)",
    );
    expect(screen.getByTestId("reduction-row-count-exclusion-hint-unsold_housing").textContent).toContain("§98의9");
  });
});

describe("⑤ ② 명부 행 편집 ⑥ — 게이트 (Q-2′)", () => {
  const openRow = () => fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));

  it("[UI-2] 주택 양도 — 행 편집에 ⑥이 뜨고, 폼 전역 감면주택 섹션은 없다", () => {
    render(<Step4 form={form({ houses: [ROW] })} onChange={() => {}} />);
    expect(screen.queryAllByText(/조특법 감면주택 보유 — 주택 수 제외/)).toHaveLength(0);
    openRow();
    expect(screen.getByTestId("house-row-count-exclusion")).toBeTruthy();
  });

  it("[UI-2r] 재개발 아파트 양도도 ⑥이 뜬다(V-1 — 선언이 세액을 바꾼다)", () => {
    render(<Step4 form={form({ houses: [ROW] }, "redevelopment_apt")} onChange={() => {}} />);
    openRow();
    expect(screen.getByTestId("house-row-count-exclusion")).toBeTruthy();
  });

  it("[UI-2+] 짝 — 입주권 양도는 ⑥을 띄우지 않고 종전 폼 전역 섹션이 남는다", () => {
    render(<Step4 form={form({ houses: [ROW] }, "right_to_move_in")} onChange={() => {}} />);
    expect(screen.getAllByText(/조특법 감면주택 보유 — 주택 수 제외/)).toHaveLength(1);
    openRow();
    expect(screen.queryByTestId("house-row-count-exclusion")).toBeNull();
  });
});

describe("⑤ ② 옛 선언 안내 카드 (Q-1)", () => {
  it("[UI-3] 행 없는 옛 선언을 나열하고, 확인 후 삭제하면 그 선언만 지운다", () => {
    const other = { type: "self_farming", farmingYears: "8" } as unknown as AssetReductionForm;
    let patch: Partial<TransferFormData> | undefined;
    render(
      <Step4 form={form({ houses: [ROW] }, "housing", [other, RURAL])} onChange={(p) => (patch = p)} />,
    );
    const card = screen.getByTestId("one-house-legacy-count-exclusion");
    expect(card.textContent).toContain("취득일 2021-01-01");
    fireEvent.click(within(card).getByTestId("one-house-legacy-count-exclusion-clear"));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(patch?.assets?.[0].reductions.map((r) => r.type)).toEqual(["self_farming"]);
  });

  it("[UI-3+] 짝 — 입주권 양도에서는 카드를 띄우지 않는다(효과 0 · ⑧도 막지 않는다)", () => {
    render(<Step4 form={form({ houses: [ROW] }, "right_to_move_in", [RURAL])} onChange={() => {}} />);
    expect(screen.queryByTestId("one-house-legacy-count-exclusion")).toBeNull();
  });
});

describe("⑥ 사이드바 칩", () => {
  it("[UI-4] 행 ⑥의 선언도 대표 자산 감면 칩에 들어간다 — 패널에서 옮겨도 칩이 사라지지 않는다", () => {
    const f = form({
      houses: [{ ...ROW, countExclusion: { kind: "reduction", reduction: RURAL } } as HouseEntry],
    });
    expect(computeTransferPerAssetSummary(f, null).rows[0].reductionTypes).toContain("new_99_4_rural");
  });
});

describe("⑦ 결과 카드 — 어느 주택인가 (Q-6)", () => {
  const detail = {
    id: "new_99_4_rural",
    isEligible: true,
    legalBasis: "조세특례제한법 §99의4",
    effectCategory: "house_count_exclusion",
    houseCountExclusion: 1,
    ruralHoldingYears: 3,
    clawbackWarning: false,
    surchargeNotAffected: true,
    houseId: "r",
  };
  const renderCards = (houses?: HouseEntry[]) =>
    render(
      <ReductionDetailCards
        result={{ new994Detail: detail } as never}
        calculatedTax={0}
        taxBase={0}
        longTermHoldingDeduction={0}
        houses={houses}
      />,
    );

  it("[UI-5] 명부를 넘기면 「보유 주택 N (취득일)」을 표시한다", () => {
    renderCards([{ ...ROW, id: "n", acquisitionDate: "2023-12-01" } as HouseEntry, ROW]);
    expect(screen.getByTestId("count-exclusion-house-ref").textContent).toBe("대상: 보유 주택 2 (2021-01-01 취득)");
  });

  it("[UI-5+] 짝 — 명부를 모르는 화면은 표시를 생략한다(행 id를 노출하지 않는다)", () => {
    renderCards(undefined);
    expect(screen.queryByTestId("count-exclusion-house-ref")).toBeNull();
    expect(document.body.textContent).not.toContain('"r"');
  });
});
