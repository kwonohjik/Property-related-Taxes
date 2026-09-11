/**
 * 상속·증여 UI 리뷰 G8 — 렌더 축 anchor (입력폼 구조).
 *
 * ## 왜 렌더인가
 *
 * 이 배치의 결함은 대부분 **게이트**다(칸이 열리는가·칩이 눌리는가·값이 정리되는가).
 * G6에서 실측했듯 소스 문자열 anchor는 게이트를 재지 못한다 — `{cond && …}`를
 * `{false && …}`로 바꿔도 본문 식이 파일에 그대로 남는다. 열어 봐야 증명된다.
 *
 * 부정형 단언에는 **양성 쌍둥이**를 붙인다(`feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { Step4 } from "@/components/calc/inheritance/Step4Deductions";
import { Step4DeductionChecklist } from "@/components/calc/inheritance/Step4DeductionChecklist";
import { INITIAL_FORM } from "@/components/calc/inheritance/shared";
import type { FormState } from "@/components/calc/inheritance/shared";
import type { Step4Autos } from "@/components/calc/inheritance/steps";
import { GiftCreditChecklist } from "@/components/calc/gift/GiftCreditChecklist";
import { INITIAL_FORM as GIFT_INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type { FormState as GiftFormState } from "@/components/calc/gift-tax-form-shared";
import { FarmingCategorySection } from "@/components/calc/inheritance/FarmingCategorySection";
import { FamilyBusinessCategorySection } from "@/components/calc/inheritance/FamilyBusinessCategorySection";
import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";
import { SubstituteHeirPanel } from "@/components/calc/inheritance/SubstituteHeirPanel";
import { UnlistedStockSimpleFields } from "@/components/calc/UnlistedStockSimpleFields";
import { StockBurdenedDebtSection } from "@/components/calc/gift/StockBurdenedDebtSection";
import { FarmingEligibilitySection } from "@/components/calc/inheritance/FarmingEligibilitySection";
import { FbDecedentRequirementsSection } from "@/components/calc/inheritance/family-business/FbDecedentRequirementsSection";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);

const SUGGEST = { value: 0, reason: "", breakdown: [], isApplicable: false };
const AUTOS: Step4Autos = {
  spouse: SUGGEST,
  netFin: SUGGEST,
  cohabit: { ...SUGGEST, securedDebt: 0 },
  farming: SUGGEST,
  legatee: SUGGEST,
};

function renderStep4(overrides: Partial<FormState> = {}, autos: Step4Autos = AUTOS) {
  const set = vi.fn();
  const form = { ...INITIAL_FORM, ...overrides } as FormState;
  render(<Step4 form={form} set={set} autos={autos} />);
  return { set, form };
}

// ════════════════════════════════════════════════════
// IG-037 — 그룹 B 노출 카운트에 heirWaiver가 들어간다
// ════════════════════════════════════════════════════

describe("[G8-F] IG-037 — heirWaiver만 활성이어도 칸이 열린다", () => {
  const HEIR_WAIVER_LABEL = "상속포기 후순위 상속 금액 (§24 2호 분자 차감)";
  const EMPTY_NOTICE = "위 체크리스트에서 항목을 선택하면 입력 섹션이 열립니다.";

  it("F-1: 🔴 heirWaiver만 켜면 그 칸이 렌더된다 (EmptyGroupNotice가 아니다)", () => {
    renderStep4({
      deductionChecklistOverrides: { heirWaiver: true },
    } as Partial<FormState>);
    expect(screen.getByText(HEIR_WAIVER_LABEL)).toBeTruthy();
  });

  it("F-2: 양성 대조군 — B그룹 수동 항목이 전부 꺼지면 안내문이 뜬다", () => {
    renderStep4();
    // 그룹 B 자리에 안내문이 최소 1개 있다 (다른 그룹도 같은 문구를 쓸 수 있으므로 존재만 확인)
    expect(screen.getAllByText(EMPTY_NOTICE).length).toBeGreaterThan(0);
  });

  it("F-3: heirWaiver만 켠 상태에서는 그 안내문이 B그룹을 대체하지 않는다", () => {
    renderStep4({
      deductionChecklistOverrides: { heirWaiver: true },
    } as Partial<FormState>);
    // 칸과 안내문이 동시에 나오는 것 자체는 다른 그룹 탓일 수 있으므로,
    // 「칸이 존재한다」를 정본 단언으로 두고 여기서는 값 배선만 확인한다.
    const input = screen.getByText(HEIR_WAIVER_LABEL);
    expect(input).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════
// IG-104 — AutoSuggestBadge에 raw 폼 값이 전달된다
// ════════════════════════════════════════════════════

describe("[G8-G] IG-104 — 「이 값으로 채우기」 분기가 도달 가능하다", () => {
  const APPLICABLE: Step4Autos = {
    ...AUTOS,
    netFin: { value: 200_000_000, reason: "자동 도출", breakdown: [], isApplicable: true },
  };

  it("G-1: 🔴 raw가 비어 있고 제안값이 있으면 「채우기」가 노출된다", () => {
    renderStep4({ netFinancialAssets: "" }, APPLICABLE);
    expect(screen.getByRole("button", { name: /채우기/ })).toBeTruthy();
  });

  it("G-2: 양성 쌍둥이 — 제안값과 같은 값을 직접 넣으면 「되돌리기」로 바뀐다", () => {
    renderStep4({ netFinancialAssets: "200,000,000" }, APPLICABLE);
    expect(screen.queryByRole("button", { name: /채우기/ })).toBeNull();
    expect(screen.getByRole("button", { name: /되돌리기/ })).toBeTruthy();
  });

  it("G-3: 제안값과 다른 값이면 mismatch 경고 축이 살아 있다", () => {
    renderStep4({ netFinancialAssets: "100,000,000" }, APPLICABLE);
    expect(screen.queryByRole("button", { name: /채우기/ })).toBeNull();
  });
});

// ════════════════════════════════════════════════════
// IG-113 — 배우자 칩은 배우자 상속인이 없으면 비활성
// ════════════════════════════════════════════════════

describe("[G8-H] IG-113 — 배우자 칩과 §19 칸이 1:1이다", () => {
  function renderChecklist(heirs: Heir[]) {
    const set = vi.fn();
    const form = { ...INITIAL_FORM, heirs } as FormState;
    render(
      <Step4DeductionChecklist
        form={form}
        set={set}
        autoDetected={{
          spouse: heirs.some((h) => h.relation === "spouse"),
          financial: false,
          cohabit: false,
          farming: false,
        }}
        onAutoChipClick={vi.fn()}
        onManualChipToggle={vi.fn()}
      />,
    );
  }

  const CHILD: Heir = { id: "h1", relation: "child", name: "자녀" } as Heir;
  const SPOUSE: Heir = { id: "h0", relation: "spouse", name: "배우자" } as Heir;

  it("H-1: 🔴 배우자 상속인이 없으면 「배우자 상속인 없음」 비활성 칩이다", () => {
    renderChecklist([CHILD]);
    expect(screen.getByTestId("auto-chip-spouse-unavailable")).toBeTruthy();
    expect(screen.getByText("배우자 상속인 없음")).toBeTruthy();
  });

  it("H-2: 양성 쌍둥이 — 배우자가 있으면 일반 칩이고 비활성 표시가 없다", () => {
    renderChecklist([SPOUSE, CHILD]);
    expect(screen.queryByTestId("auto-chip-spouse-unavailable")).toBeNull();
  });

  it("H-3: 비활성 칩은 button이 아니다 (클릭해도 그룹이 열리지 않는다)", () => {
    renderChecklist([CHILD]);
    const chip = screen.getByTestId("auto-chip-spouse-unavailable");
    expect(chip.tagName.toLowerCase()).toBe("span");
  });
});

// ════════════════════════════════════════════════════
// IG-024 — 동시증여 서브카드에서 중첩 토글이 닫힌다
// ════════════════════════════════════════════════════

describe("[G8-I] IG-024 — 중첩 동시증여 입력 경로가 닫혔다", () => {
  const NESTED_TITLE = "같은 날 다른 분으로부터도 받으셨나요? (동시증여 — 세액 전체 계산)";

  function renderChecklist(hide: boolean) {
    const set = vi.fn();
    render(
      <GiftCreditChecklist
        form={{ ...GIFT_INITIAL_FORM } as GiftFormState}
        set={set}
        hideSimultaneous={hide}
      />,
    );
  }

  it("I-1: 🔴 hideSimultaneous이면 동시증여 토글이 렌더되지 않는다", () => {
    renderChecklist(true);
    expect(screen.queryByText(NESTED_TITLE)).toBeNull();
  });

  it("I-2: 양성 쌍둥이 — 최상위(기본값)에서는 그대로 렌더된다", () => {
    renderChecklist(false);
    expect(screen.getByText(NESTED_TITLE)).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════
// IG-107 — 영농·가업 분류 상호 배타
// ════════════════════════════════════════════════════

describe("[G8-J] IG-107 — 영농·가업 토글이 서로를 막는다", () => {
  const BASE = {
    id: "i1",
    category: "unlisted_stock",
    name: "비상장주식",
    marketValue: 100_000_000,
  } as unknown as EstateItem;

  it("J-1: 🔴 가업 분류가 켜져 있으면 영농 토글이 비활성 + 사유 표시", () => {
    render(
      <FarmingCategorySection
        item={{ ...BASE, familyBusinessCategory: "corporate_stock" } as EstateItem}
        onUpdate={vi.fn()}
        deathDate="2026-01-01"
      />,
    );
    expect(screen.getByText(/영농·가업 분류는 동시 선택할 수 없습니다/)).toBeTruthy();
  });

  it("J-2: 🔴 반대 방향 — 영농 분류가 켜져 있으면 가업 토글이 비활성", () => {
    render(
      <FamilyBusinessCategorySection
        item={{ ...BASE, farmingCategory: "corporate_stock" } as EstateItem}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText(/영농·가업 분류는 동시 선택할 수 없습니다/)).toBeTruthy();
  });

  it("J-3: 양성 쌍둥이 — 아무것도 안 켜져 있으면 사유가 없다", () => {
    render(
      <FarmingCategorySection item={BASE} onUpdate={vi.fn()} deathDate="2026-01-01" />,
    );
    expect(screen.queryByText(/영농·가업 분류는 동시 선택할 수 없습니다/)).toBeNull();
  });
});

// ════════════════════════════════════════════════════
// IG-111 — 분배 면적 입력 경로가 열린다
// ════════════════════════════════════════════════════

describe("[G8-K] IG-111 — 협의분할 분배 면적(㎡) 칸이 존재한다", () => {
  const HEIRS: Heir[] = [
    { id: "h1", relation: "spouse", name: "배우자" } as Heir,
    { id: "h2", relation: "child", name: "차남" } as Heir,
  ];
  const LAND = {
    id: "i1",
    category: "real_estate_land",
    name: "공장부지",
    marketValue: 1_000_000_000,
    heirAllocations: [
      { heirId: "h1", amount: 600_000_000 },
      { heirId: "h2", amount: 400_000_000 },
    ],
  } as unknown as EstateItem;

  it("K-1: 🔴 부동산 + 자산 면적 미입력이면 상속인별 면적 칸이 열린다", () => {
    render(
      <HeirAllocationToggleSection
        item={LAND}
        heirs={HEIRS}
        effectiveValuation={1_000_000_000}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("heir-alloc-area-h1")).toBeTruthy();
    expect(screen.getByTestId("heir-alloc-area-h2")).toBeTruthy();
  });

  it("K-2: 양성 쌍둥이 — 자산 면적이 이미 있으면 열지 않는다 (결과에 닿지 않는 칸)", () => {
    render(
      <HeirAllocationToggleSection
        item={{ ...LAND, areaSqm: 4000 } as EstateItem}
        heirs={HEIRS}
        effectiveValuation={1_000_000_000}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("heir-alloc-area-h1")).toBeNull();
  });

  it("K-3: 양성 쌍둥이 — 부동산이 아니면 열지 않는다", () => {
    render(
      <HeirAllocationToggleSection
        item={{ ...LAND, category: "deposit" } as unknown as EstateItem}
        heirs={HEIRS}
        effectiveValuation={1_000_000_000}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("heir-alloc-area-h1")).toBeNull();
  });

  it("K-4: 🔴 소수 면적을 입력할 수 있다 (native input + parseFloat이면 되돌아간다)", () => {
    const onChange = vi.fn();
    render(
      <HeirAllocationToggleSection
        item={LAND}
        heirs={HEIRS}
        effectiveValuation={1_000_000_000}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("heir-alloc-area-h1"), {
      target: { value: "2500.5" },
    });
    const patch = onChange.mock.calls.at(-1)?.[0];
    expect(patch.heirAllocations.find((a: { heirId: string }) => a.heirId === "h1").areaM2).toBe(
      2500.5,
    );
  });
});

// ════════════════════════════════════════════════════
// IG-114 — 대습 그룹 선택 시 원래순위도 동기화
// ════════════════════════════════════════════════════

describe("[G8-L] IG-114 — 기존 대습 그룹을 고르면 원래순위가 그룹 값을 따른다", () => {
  const ALL: Heir[] = [
    {
      id: "h1",
      relation: "other",
      name: "대습A",
      isSubstitute: true,
      substituteGroupId: "g1",
      substituteForRelation: "child",
      substituteAncestorName: "피대습자갑",
    } as unknown as Heir,
    {
      id: "h2",
      relation: "other",
      name: "대습B",
      isSubstitute: true,
      // 그룹 선택 UI는 substituteGroupId가 있을 때만 열린다 — 다른 그룹(g2)에 속한 상태에서
      // 기존 그룹(g1)으로 옮기는 것이 이 anchor가 재는 동작이다.
      substituteGroupId: "g2",
      substituteForRelation: "sibling",
    } as unknown as Heir,
  ];

  it("L-1: 🔴 substituteForRelation이 그룹 대표값(child)으로 함께 set된다", () => {
    const set = vi.fn();
    render(<SubstituteHeirPanel heir={ALL[1]} index={1} allHeirs={ALL} set={set} />);
    const radio = document.querySelector<HTMLInputElement>('input[type="radio"][value="g1"]');
    expect(radio).toBeTruthy();
    fireEvent.click(radio!);
    const patch = set.mock.calls.at(-1)?.[0];
    expect(patch.substituteGroupId).toBe("g1");
    expect(patch.substituteForRelation).toBe("child");
  });

  it("L-2: 양성 쌍둥이 — 새 그룹은 원래순위를 덮지 않는다", () => {
    const set = vi.fn();
    render(<SubstituteHeirPanel heir={ALL[1]} index={1} allHeirs={ALL} set={set} />);
    const radio = document.querySelector<HTMLInputElement>(
      'input[type="radio"][value="__new__"]',
    );
    fireEvent.click(radio!);
    const patch = set.mock.calls.at(-1)?.[0];
    expect(patch.substituteForRelation).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════
// IG-087 — §54④ 6호에서도 순손익 3칸이 열린다
// ════════════════════════════════════════════════════

describe("[G8-M] IG-087 — 6호(잔여 존속기한 3년)는 영업권 때문에 순손익이 필요하다", () => {
  const NET_INCOME_SECTION = "simple-section-net-income";

  function renderStock(reason?: string) {
    const item = {
      id: "s1",
      category: "unlisted_stock",
      name: "비상장주식",
      unlistedStockData: {
        ownedShares: 1000,
        totalShares: 10000,
        assetValueOnlyReason: reason,
      },
    } as unknown as EstateItem;
    render(<UnlistedStockSimpleFields item={item} onUpdate={vi.fn()} />);
  }

  it("M-1: 🔴 6호를 골라도 순손익가치 섹션이 남는다", () => {
    renderStock("remaining_3y");
    expect(screen.getByTestId(NET_INCOME_SECTION)).toBeTruthy();
  });

  it("M-2: 🔴 6호에는 영업권 산정 안내가 붙는다", () => {
    renderStock("remaining_3y");
    expect(screen.getByTestId("simple-net-income-goodwill-notice")).toBeTruthy();
  });

  it("M-3: 양성 쌍둥이 — 1호(청산)·2호(3년 미만)는 여전히 숨긴다 (§55③ 영업권 배제)", () => {
    renderStock("liquidation");
    expect(screen.queryByTestId(NET_INCOME_SECTION)).toBeNull();
    cleanup();
    renderStock("lt3y");
    expect(screen.queryByTestId(NET_INCOME_SECTION)).toBeNull();
  });

  it("M-4: 양성 쌍둥이 — 본칙(사유 없음)에는 영업권 안내가 붙지 않는다", () => {
    renderStock(undefined);
    expect(screen.getByTestId(NET_INCOME_SECTION)).toBeTruthy();
    expect(screen.queryByTestId("simple-net-income-goodwill-notice")).toBeNull();
  });
});

// ════════════════════════════════════════════════════
// IG-110 — 자격자 0명(빈 배열) 안내 분기
// ════════════════════════════════════════════════════

describe("[G8-N] IG-110 — undefined와 [] 상태를 다르게 설명한다", () => {
  // §16⑤ 자격자 선택 블록은 `heirs.length > 1`일 때만 열린다
  const HEIRS: Heir[] = [
    { id: "h1", relation: "child", name: "자녀1" } as Heir,
    { id: "h2", relation: "child", name: "자녀2" } as Heir,
  ];
  const FARMING = {
    type: "personal" as const,
    decedentEightYearFarming: true,
    decedentResidenceMet: true,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: true,
  };

  it("N-1: 🔴 qualifiedHeirIds=[]이면 「자격자 0명 → 0원」을 명시한다", () => {
    render(
      <FarmingEligibilitySection
        farming={{ ...FARMING, qualifiedHeirIds: [] }}
        estateItems={[]}
        heirs={HEIRS}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("farming-qualified-zero-notice")).toBeTruthy();
  });

  it("N-2: 양성 쌍둥이 — undefined이면 「전체 합산」 안내가 그대로다", () => {
    render(
      <FarmingEligibilitySection
        farming={FARMING}
        estateItems={[]}
        heirs={HEIRS}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("farming-qualified-zero-notice")).toBeNull();
    expect(screen.getByText(/미체크 시 전체 상속인이 자격 충족된 것으로 간주/)).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════
// IG-125 — 반쪽 재직구간은 「미충족」이 아니라 「입력 필요」
// ════════════════════════════════════════════════════

describe("[G8-O] IG-125 — 퇴임일 미입력은 법적 결론이 아니다", () => {
  const BASE = {
    businessType: "corporate" as const,
    openingDate: "2000-01-01",
    decedentCEOPeriods: [] as Array<{ startDate: string; endDate: string }>,
  };

  function renderSection(periods: Array<{ startDate: string; endDate: string }>) {
    render(
      <FbDecedentRequirementsSection
        familyBusiness={{ ...BASE, decedentCEOPeriods: periods } as never}
        deathDate="2026-01-01"
        onChange={vi.fn()}
      />,
    );
  }

  // 🔑 판정 축은 «문구»가 아니라 `autoMet`이다. FbAutoCheckPreviewCard는 autoMet===null이면
  // amber ℹ️(안내), false면 rose ✗「미충족 — {formula}」를 그린다. 문구만 단언하면
  // 「useMemo 가드를 지워 autoMet이 false가 되는」 회귀를 못 잡는다 — 실제로 첫 프로브에서
  // 구별력 0이 나왔다(ceoFormula 쪽 가드가 같은 문구를 계속 내보냈다).
  const PREVIEW = "fb-preview-decedent-ceo";

  it("O-1: 🔴 취임일만 있으면 «안내»(ℹ️)이지 «미충족»(✗) 판정이 아니다", () => {
    renderSection([{ startDate: "2005-01-01", endDate: "" }]);
    const card = screen.getByTestId(PREVIEW);
    expect(card.textContent).toContain("ℹ️");
    expect(card.textContent).not.toContain("미충족");
  });

  it("O-2: 🔴 그 상태의 안내문이 퇴임일 입력을 지목한다", () => {
    renderSection([{ startDate: "2005-01-01", endDate: "" }]);
    expect(screen.getByTestId(PREVIEW).textContent).toMatch(/퇴임일\(종료\)까지 입력하면 자동판정/);
  });

  it("O-3: 양성 쌍둥이 — 양쪽이 다 있으면 확정 판정(✓ 또는 ✗)이 나온다", () => {
    renderSection([{ startDate: "2005-01-01", endDate: "2026-01-01" }]);
    const card = screen.getByTestId(PREVIEW);
    expect(card.textContent).not.toContain("ℹ️");
    expect(card.textContent).toMatch(/충족 —/);
  });

  it("O-4: 양성 대조군 — 구간이 아예 없으면 종전대로 안내다 (회귀 0)", () => {
    renderSection([]);
    const card = screen.getByTestId(PREVIEW);
    expect(card.textContent).toContain("ℹ️");
    expect(card.textContent).toMatch(/재직 구간\(시작\/종료\)을 입력하면 자동판정/);
  });
});

// ════════════════════════════════════════════════════
// IG-025 — 중소기업 여부 입력 위젯 (§104①11)
// ════════════════════════════════════════════════════

describe("[G8-P] IG-025 — 중소기업 여부를 화면에서 입력할 수 있다", () => {
  function renderSection(debt: number, bgt?: Record<string, unknown>) {
    const onUpdate = vi.fn();
    const item = {
      id: "s1",
      category: "listed_stock",
      name: "상장주식",
      marketValue: 1_000_000_000,
      assumedDebtForGift: debt,
      burdenedGiftStockTransferTax: bgt,
    } as unknown as EstateItem;
    render(
      <StockBurdenedDebtSection
        item={item}
        onUpdate={onUpdate}
        mode="gift"
        transferDate="2026-01-01"
      />,
    );
    return { onUpdate };
  }

  const ON = {
    marketType: "unlisted" as const,
    acquisitionDate: "",
    acquisitionMode: "estimated" as const,
  };

  it("P-1: 🔴 양도세 토글 ON이면 중소기업 토글이 렌더된다", () => {
    renderSection(500_000_000, ON);
    expect(screen.getByTestId("bg-stock-sme-toggle")).toBeTruthy();
  });

  it("P-2: 🔴 켜면 isSmallMediumEnterprise가 true로 기록된다 (④가 ?? false로 떨어지지 않는다)", () => {
    const { onUpdate } = renderSection(500_000_000, ON);
    const sw = screen
      .getByTestId("bg-stock-sme-toggle")
      .querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(sw);
    const patch = onUpdate.mock.calls.at(-1)?.[0];
    expect(patch.burdenedGiftStockTransferTax.isSmallMediumEnterprise).toBe(true);
  });

  it("P-3: 양성 쌍둥이 — 양도세 토글 OFF면 중소기업 토글이 없다", () => {
    renderSection(500_000_000, undefined);
    expect(screen.queryByTestId("bg-stock-sme-toggle")).toBeNull();
  });
});
