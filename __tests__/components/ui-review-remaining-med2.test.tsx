/**
 * @vitest-environment jsdom
 *
 * anchor: 대장 재대조 **보류 14건 2차 판정**에서 살아 있던 7건.
 *
 * 순수 함수 축(#6·#15)은 `ui-review-remaining-med2.anchor.test.ts`에 있다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { Rental97MainInputForm } from "@/components/calc/transfer/rental/Rental97MainInputForm";
import { HouseValuationSection } from "@/components/calc/transfer/inheritance/HouseValuationSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

afterEach(cleanup);

/* ── #2 §127⑦ 배너가 §97 세액감면 카드에도 붙는다 ─────────────── */

const rentalResult = () =>
  ({
    steps: [],
    rentalReductionDetail: {
      reductionRate: 0.5,
      reductionAmount: 10_000_000,
      article: "조특법 §97",
      appliedArticleLabel: "§97",
      ineligibleReasons: [],
      warnings: [],
      rentIncreaseValidation: { isAllValid: true, violations: [] },
    },
    reductionTypeApplied: "self_farming",
  }) as unknown as TransferTaxResult;

describe("#2 — 배제된 §97 감면이 자기 세액을 그대로 인쇄하지 않는다", () => {
  const props = {
    calculatedTax: 50_000_000,
    taxBase: 200_000_000,
    longTermHoldingDeduction: 0,
  };

  it("🔑 A-1: 승자가 자경이면 §97 카드에 §127⑦ 배제 배너가 붙는다", () => {
    render(
      <ReductionDetailCards
        result={rentalResult()}
        {...props}
        appliedReductionType="self_farming"
      />,
    );
    expect(screen.getByText(/127/)).toBeTruthy();
  });

  it("A-2: §97이 승자면 배너를 붙이지 않는다", () => {
    render(
      <ReductionDetailCards
        result={rentalResult()}
        {...props}
        appliedReductionType="long_term_rental"
      />,
    );
    expect(screen.queryByText(/127/)).toBeNull();
  });
});

/* ── #35 §97 폼의 섹션 번호가 렌더 순서대로다 ────────────────── */

describe("#35 — 한 화면에 같은 번호가 두 번 나오지 않는다", () => {
  const renderForm = (value: Record<string, unknown>) =>
    render(
      <Rental97MainInputForm
        value={{ type: "rental_97", ...value } as never}
        onChange={() => {}}
      />,
    );

  it("🔑 B-1: 비-단서 + 1985년 이전 신축 — ②와 ③이 하나씩", () => {
    renderForm({ constructionYear: "1984" });
    expect(screen.getAllByText("②")).toHaveLength(1);
    expect(screen.getAllByText("③")).toHaveLength(1);
  });

  it("🔑 B-2: 단서 + 나목 — ②③④가 하나씩", () => {
    renderForm({ type: "rental_97_proviso", provisoCase: "b_purchase", constructionYear: "" });
    expect(screen.getAllByText("②")).toHaveLength(1);
    expect(screen.getAllByText("③")).toHaveLength(1);
    expect(screen.getAllByText("④")).toHaveLength(1);
  });

  it("B-3: 조건부 카드가 없으면 그 섹션이 번호를 차지하지 않는다", () => {
    renderForm({ constructionYear: "" });
    expect(screen.getAllByText("①")).toHaveLength(1);
    expect(screen.getAllByText("②")).toHaveLength(1);
    // 🔴 종전에는 「③이 없다」로 확인했는데, 그 배지는 **공통 필드가 3·4를 아라비아 숫자로**
    //    찍고 있어서 없던 것이다(2026-09-07 대장 재대조 #28에서 원문자로 통일). 이제 ③④는
    //    공통 필드 자리로 정상 이어진다 — 확인해야 할 것은 「조건부 카드가 번호를 안 먹는다」다.
    expect(screen.queryByText("§97①2호 요건")).toBeNull();
    expect(screen.queryByText("단서 분기 — 100% 감면 요건")).toBeNull();
    expect(screen.getAllByText("③")).toHaveLength(1);
    expect(screen.getAllByText("④")).toHaveLength(1);
    expect(screen.queryByText("⑤")).toBeNull();
  });
});

/* ── #22·#33·#34 증여 라벨 · 공용 조회 위젯 ─────────────────── */

function giftHouseAsset(cause: "inheritance" | "gift"): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: cause,
    acquisitionDate: "2000-03-01",
    inheritanceStartDate: cause === "inheritance" ? "2000-03-01" : "",
    inhHouseValLandArea: "200",
    addressJibun: "서울시 강남구 역삼동 123",
  } as unknown as AssetForm;
}

describe("#22 — 증여 진입점이 「상속개시일」이라 말하지 않는다", () => {
  it("🔑 C-1: 취득원인이 증여면 안내문이 「증여일」이다", () => {
    render(
      <HouseValuationSection
        asset={giftHouseAsset("gift")}
        onChange={() => {}}
        transferDate="2025-05-01"
      />,
    );
    expect(screen.getByText(/증여일\(2000-03-01\)/)).toBeTruthy();
  });

  it("C-2: 상속이면 종전대로 「상속개시일」", () => {
    render(
      <HouseValuationSection
        asset={giftHouseAsset("inheritance")}
        onChange={() => {}}
        transferDate="2025-05-01"
      />,
    );
    expect(screen.getByText(/상속개시일\(2000-03-01\)/)).toBeTruthy();
  });
});

describe("#33·#34 — 개별공시지가 3칸 모두 공용 조회 위젯이다", () => {
  it("🔑 D-1: 취득시점 칸에도 기준연도 드롭다운·조회 버튼이 있다", () => {
    render(
      <HouseValuationSection
        asset={giftHouseAsset("inheritance")}
        onChange={() => {}}
        transferDate="2025-05-01"
      />,
    );
    // 공용 위젯은 시점마다 「공시지가 조회」 버튼을 낸다 — 3시점 전부.
    expect(screen.getAllByRole("button", { name: /공시지가 조회/ }).length).toBeGreaterThanOrEqual(3);
  });
});
