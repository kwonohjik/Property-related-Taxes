/**
 * @vitest-environment jsdom
 *
 * 상속·증여 UI 리뷰 — G4 배치(게이트 OFF 값 정리) «렌더» anchor.
 *
 * G1·G2에서 두 번 배운 것: 헬퍼·순수함수만 단언한 anchor는 «컴포넌트가 그것을 부른다»를
 * 증명하지 못해 호출부를 되돌리는 뮤테이션에 구별력이 0이었다
 * (memory feedback_library_anchor_does_not_prove_component_uses_it).
 * ⇒ 게이트가 닫힐 때 «값이 실제로 정리되는가»는 렌더해서 onUpdate/set payload로 잰다.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { RelatedCorpFields } from "@/components/calc/deemed-gift/related-corp-form";
import {
  INITIAL_DEEMED,
  makeRcShareholderRow,
  makeRcIntermediaryRow,
} from "@/components/calc/deemed-gift/deemed-form-state";
import type { DeemedFormState } from "@/components/calc/deemed-gift/shared";

import { EstateBodySupplementaryValuation } from "@/components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation";
import { GiftRowEditor } from "@/components/calc/prior-gift/GiftRowEditor";
import { makeEmptyGift } from "@/components/calc/prior-gift/meta";
import { EstimatedProfitToggle } from "@/components/calc/inheritance/unlisted-stock-v2/EstimatedProfitToggle";
import { PreIpoListingToggle } from "@/components/calc/inheritance/unlisted-stock-v2/PreIpoListingToggle";
import { Step2 } from "@/components/calc/inheritance/steps";
import { Step4DeductionChecklist } from "@/components/calc/inheritance/Step4DeductionChecklist";
import { EstateItemEditor } from "@/components/calc/EstateItemEditor";
import type { AutoChecklistKey } from "@/lib/calc/inheritance-deduction-checklist";
import { INITIAL_FORM } from "@/components/calc/inheritance/shared";

import type { EstateItem, PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);
const noop = () => {};

// ════════════════════════════════════════════════
// IG-021 — 법인주주를 개인으로 되돌리면 «완성된» 간접출자법인 행이 사라진다
// ════════════════════════════════════════════════
function rcFormWith(rows: DeemedFormState["rcIntermediaryCorps"]): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "related_corp",
    rcShareholders: [
      { ...makeRcShareholderRow("corp-1"), name: "법인주주", directRatioPctStr: "60", isCorporate: true },
      { ...makeRcShareholderRow("p-1"), name: "개인주주", directRatioPctStr: "40", isCorporate: false },
    ],
    rcIntermediaryCorps: rows,
  } as DeemedFormState;
}

/** 「주주 1 유형」 select를 개인으로 되돌린다. */
function flipFirstShareholderToPerson() {
  const sel = screen.getByLabelText("주주 1 유형") as HTMLSelectElement;
  fireEvent.change(sel, { target: { value: "person" } });
}

describe("IG-021 — 화면에서 사라진 간접출자법인 행이 그대로 전송되지 않는다", () => {
  it("R-1 (양성): 법인주주를 개인으로 되돌리면 그 주주를 참조하던 완성 행이 같은 patch에서 제거된다", () => {
    const set = vi.fn();
    const filled = {
      ...makeRcIntermediaryRow("i-1"),
      corpShareholderId: "corp-1",
      stakeInBeneficiaryPctStr: "30",
    };
    render(<RelatedCorpFields form={rcFormWith([filled])} set={set} />);
    flipFirstShareholderToPerson();

    expect(set).toHaveBeenCalledTimes(1);
    const patch = set.mock.calls[0][0] as Partial<DeemedFormState>;
    expect(patch.rcShareholders?.[0].isCorporate).toBe(false);
    expect(patch.rcIntermediaryCorps).toEqual([]); // 참조가 끊긴 행은 남기지 않는다
  });

  it("R-2 (음성·대조군): 아직 법인주주를 고르지 않은 «빈 행»은 지우지 않는다 (사용자가 방금 추가한 행)", () => {
    const set = vi.fn();
    render(<RelatedCorpFields form={rcFormWith([makeRcIntermediaryRow("i-1")])} set={set} />);
    flipFirstShareholderToPerson();

    const patch = set.mock.calls[0][0] as Partial<DeemedFormState>;
    expect(patch.rcIntermediaryCorps).toBeUndefined(); // 변경 없음 → 키 자체를 안 넣는다
  });
});

// ════════════════════════════════════════════════
// IG-045 — §61 경로 A 전환 시 경로 B 전용 5필드 정리
// ════════════════════════════════════════════════
describe("IG-045 — 경로 A 전환이 숨겨질 5필드를 함께 지운다", () => {
  const item = {
    id: "b-1",
    category: "real_estate_building",
    name: "상가",
    standardPrice: 500_000_000,
    appurtenantLandStandardPrice: 300_000_000,
    appurtenantLandArea: 200,
    totalBuildingArea: 1000,
    vacantBuildingArea: 400,
    vacantBuildingStandardPrice: 120_000_000,
    monthlyRent: 5_000_000,
  } as unknown as EstateItem;

  it("R-3: 일괄고시(경로 A)를 고르면 부수토지·연면적·공실 3필드가 전부 undefined로 정리된다", () => {
    const set = vi.fn();
    render(
      <EstateBodySupplementaryValuation
        item={item}
        set={set}
        cat="real_estate_building"
        propertyKind="building_non_residential"
        valuationDate="2024-06-01"
        addrValue={{ road: "", jibun: "", building: "", detail: "", lng: "", lat: "" }}
        supplementaryLabel="보충적 평가"
      />,
    );
    fireEvent.click(screen.getByTestId("cb-route-lump-b-1"));

    const patch = set.mock.calls.at(-1)![0] as Record<string, unknown>;
    for (const k of [
      "appurtenantLandStandardPrice",
      "appurtenantLandArea",
      "totalBuildingArea",
      "vacantBuildingArea",
      "vacantBuildingStandardPrice",
    ]) {
      expect(patch).toHaveProperty(k);
      expect(patch[k]).toBeUndefined();
    }
  });
});

// ════════════════════════════════════════════════
// IG-064 · IG-065 · IG-139 — GiftRowEditor
// ════════════════════════════════════════════════
function renderInheritanceMode(gift: PriorGift, onUpdate: (g: PriorGift) => void) {
  return render(
    <GiftRowEditor
      gift={gift}
      index={0}
      hideHeader
      showIsHeir
      showGiftPhaseA={false}
      onUpdate={onUpdate}
      onRemove={noop}
    />,
  );
}

describe("IG-064 — §53의2 칸이 사라지면 그 값도 함께 정리된다", () => {
  it("R-4 (양성): 관계를 배우자로 바꾸면 marriageBirthDeduction이 undefined가 된다", () => {
    const onUpdate = vi.fn();
    const gift = {
      ...makeEmptyGift(),
      doneeRelation: "lineal_descendant",
      marriageBirthDeduction: 100_000_000,
    } as PriorGift;
    renderInheritanceMode(gift, onUpdate);

    const sel = screen.getByText("수증인과의 관계").parentElement!.querySelector("select")!;
    fireEvent.change(sel, { target: { value: "spouse" } });

    const next = onUpdate.mock.calls.at(-1)![0] as PriorGift;
    expect(next.doneeRelation).toBe("spouse");
    expect(next.marriageBirthDeduction).toBeUndefined();
  });

  it("R-5 (음성·대조군): 적격 관계끼리 바꾸면 값을 건드리지 않는다", () => {
    const onUpdate = vi.fn();
    const gift = {
      ...makeEmptyGift(),
      doneeRelation: "lineal_descendant",
      marriageBirthDeduction: 100_000_000,
    } as PriorGift;
    renderInheritanceMode(gift, onUpdate);

    const sel = screen.getByText("수증인과의 관계").parentElement!.querySelector("select")!;
    fireEvent.change(sel, { target: { value: "lineal_descendant" } });

    const next = onUpdate.mock.calls.at(-1)![0] as PriorGift;
    expect(next.marriageBirthDeduction).toBe(100_000_000);
  });
});

describe("IG-065 — 영리법인 수증자를 고르면 «모드 플래그»도 함께 정리된다", () => {
  const CORP = { id: "corp-1", relation: "corporate", name: "A법인" } as unknown as import("@/lib/tax-engine/types/inheritance-gift.types").Heir;
  const CHILD = { id: "child-1", relation: "child", name: "자녀" } as unknown as import("@/lib/tax-engine/types/inheritance-gift.types").Heir;

  function renderWithHeirs(gift: PriorGift, onUpdate: (g: PriorGift) => void) {
    return render(
      <GiftRowEditor
        gift={gift}
        index={0}
        hideHeader
        showIsHeir
        showGiftPhaseA={false}
        heirs={[CHILD, CORP]}
        onUpdate={onUpdate}
        onRemove={noop}
      />,
    );
  }

  const manualGift = {
    ...makeEmptyGift(),
    giftAmount: 700_000_000,
    giftTaxBase: 700_000_000,
    priorGiftTaxBaseInputMode: "manual",
  } as unknown as PriorGift;

  it("R-16 (양성): 영리법인을 고르면 과세표준과 «모드 플래그»가 같은 patch에서 지워진다", () => {
    const onUpdate = vi.fn();
    renderWithHeirs(manualGift, onUpdate);
    fireEvent.change(screen.getByTestId("gift-donee-select"), { target: { value: "corp-1" } });

    const next = onUpdate.mock.calls.at(-1)![0] as PriorGift & {
      priorGiftTaxBaseInputMode?: string;
    };
    expect(next.beneficiaryType).toBe("corporate");
    expect(next.giftTaxBase).toBeUndefined();
    expect(next.priorGiftTaxBaseInputMode).toBeUndefined(); // ← 블록이 언마운트되는 축
  });

  it("R-17 (음성·대조군): 자연인 상속인을 고르면 모드 플래그는 그대로 남는다 (블록이 계속 보인다)", () => {
    const onUpdate = vi.fn();
    renderWithHeirs(manualGift, onUpdate);
    fireEvent.change(screen.getByTestId("gift-donee-select"), { target: { value: "child-1" } });

    const next = onUpdate.mock.calls.at(-1)![0] as PriorGift & {
      priorGiftTaxBaseInputMode?: string;
    };
    expect(next.priorGiftTaxBaseInputMode).toBe("manual");
  });
});

describe("IG-139 — 증여자를 「선택」으로 되돌리면 사망일도 정리된다", () => {
  function renderGiftMode(gift: PriorGift, onUpdate: (g: PriorGift) => void) {
    return render(
      <GiftRowEditor
        gift={gift}
        index={0}
        hideHeader
        showIsHeir={false}
        showGiftPhaseA
        onUpdate={onUpdate}
        onRemove={noop}
      />,
    );
  }

  it("R-6 (양성): donor를 비우면 donorDeceasedDate가 undefined로 정리된다", () => {
    const onUpdate = vi.fn();
    const gift = { ...makeEmptyGift(), donor: "father", donorDeceasedDate: "" } as PriorGift;
    renderGiftMode(gift, onUpdate);

    fireEvent.change(screen.getByTestId("gift-prior-donor-select"), { target: { value: "" } });
    const next = onUpdate.mock.calls.at(-1)![0] as PriorGift;
    expect(next.donor).toBeUndefined();
    expect(next.donorDeceasedDate).toBeUndefined();
  });

  it("R-7 (음성·대조군): 다른 증여자로 바꾸는 것은 사망일을 지우지 않는다 (카드가 계속 보인다)", () => {
    const onUpdate = vi.fn();
    const gift = { ...makeEmptyGift(), donor: "father", donorDeceasedDate: "2023-01-01" } as PriorGift;
    renderGiftMode(gift, onUpdate);

    fireEvent.change(screen.getByTestId("gift-prior-donor-select"), { target: { value: "mother" } });
    const next = onUpdate.mock.calls.at(-1)![0] as PriorGift;
    expect(next.donorDeceasedDate).toBe("2023-01-01");
  });
});

// ════════════════════════════════════════════════
// IG-131 · IG-138 — 폐기 확인 게이트가 «입력 전부»를 데이터로 센다
// ════════════════════════════════════════════════
describe("IG-131 — 추정이익 폐기 확인이 기관명·사유도 데이터로 본다", () => {
  it("R-8 (양성): 금액 0이어도 기관명이 있으면 확인 다이얼로그가 뜬다 (즉시 파기 아님)", () => {
    const onChange = vi.fn();
    render(
      <EstimatedProfitToggle
        value={{
          reasonCode: "merger_split_business_change",
          agencyEstimates: [0, 0],
          agencies: [{ type: "credit_rating", name: "한국신용평가" }],
          filedWithinDeadline: false,
          baseDateAndReportWithinDeadline: false,
          sameYearAsInheritanceOrGift: false,
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onChange).not.toHaveBeenCalled(); // 확인 게이트에 걸렸다
  });

  it("R-9 (음성·대조군): 정말 아무것도 없으면 확인 없이 끈다", () => {
    const onChange = vi.fn();
    render(
      <EstimatedProfitToggle
        value={{
          reasonCode: "merger_split_business_change",
          agencyEstimates: [0, 0],
          agencies: undefined,
          filedWithinDeadline: false,
          baseDateAndReportWithinDeadline: false,
          sameYearAsInheritanceOrGift: false,
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("IG-138 — 기업공개 폐기 확인이 준비유형·신고일도 데이터로 본다", () => {
  const evalDate = new Date("2024-06-01T00:00:00.000Z");

  it("R-10 (양성): 준비 유형을 §63②2호로 바꿔 두면 확인 다이얼로그가 뜬다", () => {
    const onChange = vi.fn();
    render(
      <PreIpoListingToggle
        value={{
          publicOfferingPrice: 0,
          securitiesFilingDate: evalDate,
          taxKind: "inheritance",
          listingDate: undefined,
          preparationType: "association_registration",
        }}
        onChange={onChange}
        taxKind="inheritance"
        evaluationDate={evalDate}
      />,
    );
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("R-11 (음성·대조군): seed 그대로면 확인 없이 끈다", () => {
    const onChange = vi.fn();
    render(
      <PreIpoListingToggle
        value={{
          publicOfferingPrice: 0,
          securitiesFilingDate: evalDate,
          taxKind: "inheritance",
          listingDate: undefined,
          preparationType: "exchange_listing",
        }}
        onChange={onChange}
        taxKind="inheritance"
        evaluationDate={evalDate}
      />,
    );
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

// ════════════════════════════════════════════════
// IG-055 — 협의분할 모드 진입이 봉안비도 정리한다
// ════════════════════════════════════════════════
describe("IG-055 — 협의분할 모드 진입이 legacy 장례비 4필드를 모두 비운다", () => {
  it("R-12: 봉안비도 나머지 legacy 필드와 같은 patch에서 비워진다", () => {
    const set = vi.fn();
    render(
      <Step2
        form={{
          ...INITIAL_FORM,
          funeralExpense: "8000000",
          funeralBonganExpense: "5000000",
          funeralIncludesBongan: true,
          debts: "1000000",
        }}
        set={set}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /채무·공과·장례비 협의분할 입력/ }));

    const patch = set.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(patch.funeralExpense).toBe("");
    expect(patch.funeralBonganExpense).toBe(""); // ← 종전 누락분
    expect(patch.funeralIncludesBongan).toBe(false);
    expect(patch.debts).toBe("");
  });
});

// ════════════════════════════════════════════════
// IG-112 — 재해손실공제 카드가 자기 토글을 끄고 스스로 사라지지 않는다
// ════════════════════════════════════════════════
describe("IG-112 — 표시 축과 계산 축을 분리한다", () => {
  it("R-13: 칩을 켜면 계산 축(casualtyLossEnabled)과 «표시 축»(override)이 함께 켜진다", () => {
    const set = vi.fn();
    render(
      <Step4DeductionChecklist
        form={{ ...INITIAL_FORM, casualtyLossEnabled: false }}
        set={set}
        autoDetected={{} as Record<AutoChecklistKey, boolean>}
      />,
    );
    fireEvent.click(screen.getByText("재해손실공제 §23").closest("button")!);

    const patch = set.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(patch.casualtyLossEnabled).toBe(true);
    expect(
      (patch.deductionChecklistOverrides as Record<string, boolean>).casualtyLoss,
    ).toBe(true); // ← 이것이 있어야 카드 안 스위치를 내려도 카드가 남는다
  });

  it("R-14 (음성·대조군): 칩을 끄면 표시 축도 함께 꺼져 카드가 사라진다", () => {
    const set = vi.fn();
    render(
      <Step4DeductionChecklist
        form={{
          ...INITIAL_FORM,
          casualtyLossEnabled: true,
          deductionChecklistOverrides: { casualtyLoss: true },
        }}
        set={set}
        autoDetected={{} as Record<AutoChecklistKey, boolean>}
      />,
    );
    fireEvent.click(screen.getByText("재해손실공제 §23").closest("button")!);

    const patch = set.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(patch.casualtyLossEnabled).toBe(false);
    expect(
      (patch.deductionChecklistOverrides as Record<string, boolean>).casualtyLoss,
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════
// IG-115 — 카테고리 변경 Dialog는 «열 때마다» 마운트된다
// ════════════════════════════════════════════════
describe("IG-115 — 다이얼로그가 이전 선택을 들고 다시 열리지 않는다", () => {
  const item = {
    id: "e-1",
    category: "cash",
    name: "현금",
    amount: 100_000_000,
  } as unknown as EstateItem;

  const openDialog = () => {
    fireEvent.click(screen.getByTestId("estate-card-actions-menu-e-1"));
    fireEvent.click(screen.getByTestId("estate-card-category-change-e-1"));
  };

  it("R-15: 다른 카테고리를 고른 뒤 취소하고 다시 열면 «현재 카테고리»로 돌아가 있다", () => {
    render(
      <EstateItemEditor
        item={item}
        index={0}
        onUpdate={noop}
        onRemove={noop}
        mode="inheritance"
      />,
    );

    openDialog();
    // 다른 카테고리 선택 → 그룹 간 변경 경고가 뜬다
    fireEvent.click(screen.getByTestId("category-change-radio-real_estate_land-e-1"));
    expect(screen.getByText(/그룹 간 변경/)).toBeTruthy();

    // 취소 후 재오픈 — 항상 마운트돼 있으면 useState가 그 선택을 그대로 들고 있다
    fireEvent.click(screen.getByText("취소"));
    openDialog();
    expect(screen.queryByText(/그룹 간 변경/)).toBeNull();
  });
});
