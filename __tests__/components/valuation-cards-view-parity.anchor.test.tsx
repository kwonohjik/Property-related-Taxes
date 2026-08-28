/**
 * anchor: **네 결과뷰가 같은 산출근거 카드를 렌더한다** (결과탭 코드리뷰 Lane 5 · S2 — #017 #063 #086).
 *
 * ## 세 갈래
 *
 * | # | 무엇이 사라졌나 | 어디서 |
 * |---|---|---|
 * | #063 | §164⑨1호 split 중첩 카드 2종 | 일괄·다건 (단건만 인라인 배선) |
 * | #017 | 상가 환산 카드의 「양도소득금액」 행 | 단건 (존재하지 않는 필드로 게이트) |
 * | #086 | 겸용의 「확인이 필요한 사항」 공용 카드 | 겸용 (자체 마크업) |
 *
 * ## #017은 리뷰가 지목한 그대로였다
 *
 * `taxableIncome={(result as any).taxableIncome}` — `TransferTaxResult`에 **없는 필드**다.
 * 항상 undefined라 카드의 「양도소득금액 = 양도차익 − 장기보유특별공제」 행이 영영 렌더되지
 * 않았고, 바로 아래 「과세표준 = 양도소득금액 − 기본공제 2,500,000」이 화면에 없는 값을
 * 참조했다. 같은 카드가 일괄·다건에서는 `incomeAfterOffset`을 받아 그 행을 그린다.
 *
 * 아울러 `lthdRate`를 아무 호출부도 넘기지 않아 라벨이 「× 장특공률」이라는 **변수명**을
 * 그대로 출력했다 — 「결과 산식은 한국어 풀어쓰기·값 인라인」 규약 위반이다.
 *
 * ## ⚠️ 리뷰의 #086 처방은 그대로 쓰면 표시가 줄어든다
 *
 * 「단건의 12개 인라인 렌더를 `<ValuationDetailCards/>` 한 줄로 교체」라고 적혀 있으나,
 * 단건은 상가 카드에 `taxBase`·`taxAmount`·`localTax`·`totalTax`·`swapApplied`를 **더**
 * 넘긴다(공용 leaf는 안 넘긴다). 교체하면 그 행들이 사라진다. 또 단건의 카드들은
 * `phd`·`split-detail` 등 **서로 다른 `PrintSection`**에 흩어져 있어 한 leaf로 모으면
 * 인쇄 선택 단위가 바뀐다. ⇒ 교체하지 않고 **빠진 카드만 leaf에 더한다**.
 *
 * 법령: 소득세법 시행령 §164⑨1호 · §164⑥ · §176의2②2호
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ValuationDetailCards } from "@/components/calc/results/transfer/ValuationDetailCards";
import { CommercialBuildingValuationDetailCard } from "@/components/calc/results/CommercialBuildingValuationDetailCard";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { makeCase29Input } from "../tax-engine/transfer-tax/_helpers/case-29-fixtures";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";

afterEach(cleanup);

const D = (s: string) => new Date(s);

// ════════════════════════════════════════════════════════════════════
// A. §164⑨ split 중첩 카드가 공용 leaf에도 있다 (#063)
// ════════════════════════════════════════════════════════════════════

const rates = makeMockRates();

/**
 * 건물 환산 + 토지·건물 취득일 분리(split) + 공익수용.
 * 픽스처를 손으로 만들지 않고 **엔진 실제 출력**을 쓴다 — 손으로 만든 이상적인 객체를 넣으면
 * 필드 누락을 못 보고, 회귀 테스트가 조용히 무의미해진다.
 */
function splitExpropriation() {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "building",
      transferPrice: 1_000_000_000,
      transferDate: D("2023-06-01"),
      acquisitionDate: D("2015-06-01"),
      landAcquisitionDate: D("2010-06-01"),
      acquisitionPrice: 0,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      useEstimatedAcquisition: true,
      standardPriceAtTransfer: 500_000_000,
      landStandardPriceAtTransfer: 250_000_000,
      buildingStandardPriceAtTransfer: 250_000_000,
      standardPriceAtAcquisition: 200_000_000,
      standardPricePerSqmAtAcquisition: 500_000,
      acquisitionArea: 200,
      transferCause: "public_expropriation",
      splitLandCompensationTotal: 150_000_000,
      splitLandCompensationBasisTotal: 200_000_000,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("A-0 격자 — 중첩 detail이 실제로 채워진다", () => {
  it("엔진이 splitDetail **안쪽**에 §164⑨ detail을 싣는다", () => {
    const r = splitExpropriation();
    expect(
      r.splitDetail?.splitLandExpropriationValuationDetail,
      "중첩 detail이 없으면 이 anchor는 아무것도 재지 못한다",
    ).toBeDefined();
    // 최상위 필드와 **다른 경로**임을 못박는다 — 종전 계약 테스트가 최상위만 봐서 못 잡았다.
    expect(r.housingExpropriationValuationDetail).toBeUndefined();
  });
});

describe("A-1 공용 leaf가 §164⑨ 중첩 카드를 그린다 (#063)", () => {
  it("🔴 일괄·다건이 쓰는 leaf에 그 카드가 있다", () => {
    const r = splitExpropriation();
    const { container } = render(
      <ValuationDetailCards result={r as never} transferPrice={1_000_000_000} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("§164");
    // 채택 분모(보상 기준액)가 보여야 「왜 분모가 낮아졌는가」가 설명된다.
    expect(text).toContain("200,000,000");
  });
});

// ════════════════════════════════════════════════════════════════════
// B. 상가 환산 카드 — 양도소득금액 행·장특공률 (#017)
// ════════════════════════════════════════════════════════════════════

function commercialResult() {
  const r = calculateTransferTax(makeCase29Input(), rates);
  expect(
    r.commercialBuildingValuationDetail,
    "상가 환산 detail이 없으면 카드가 아예 안 뜬다",
  ).toBeDefined();
  return r;
}

function renderCommercial(props: Record<string, unknown>) {
  const r = commercialResult();
  return (
    render(
      <ValuationDetailCards
        result={r as never}
        transferPrice={800_000_000}
        transferGain={r.transferGain}
        longTermDeduction={r.longTermHoldingDeduction}
        {...props}
      />,
    ).container.textContent ?? ""
  );
}

describe("B-1 「양도소득금액」 행이 값을 받으면 렌더된다 (#017)", () => {
  it("🔴 taxableIncome을 넘기면 행이 나온다", () => {
    expect(renderCommercial({ taxableIncome: 308_000_000 })).toContain("양도소득금액");
  });

  it("대조군 — 넘기지 않으면 그 행이 없다 (종전 단건의 상태)", () => {
    expect(renderCommercial({})).not.toContain("양도소득금액 = 양도차익");
  });

  it("🔴 단건도 실재 필드로 그 값을 만들 수 있다", () => {
    const r = commercialResult();
    // 종전 게이트가 겨눈 `taxableIncome`은 `TransferTaxResult`에 **없는 필드**였다.
    expect((r as unknown as Record<string, unknown>).taxableIncome).toBeUndefined();
    // 단건 결과뷰가 이제 넘기는 식 — 실재 필드 둘로 만든다.
    expect(Math.max(0, r.taxableGain - r.longTermHoldingDeduction)).toBeGreaterThan(0);
  });
});

describe("B-2 장특공제 라벨이 변수명을 노출하지 않는다 (#017)", () => {
  /** 카드를 직접 렌더한다 — `lthdRate`는 단건 결과뷰가 **카드에 직접** 넘기는 prop이다. */
  const card = (props: Record<string, unknown>) => {
    const r = commercialResult();
    return (
      render(
        <CommercialBuildingValuationDetailCard
          detail={r.commercialBuildingValuationDetail!}
          transferPrice={800_000_000}
          acquisitionGain={r.transferGain}
          longTermDeduction={r.longTermHoldingDeduction}
          {...props}
        />,
      ).container.textContent ?? ""
    );
  };

  it("🔴 율을 못 받아도 「장특공률」이라고 적지 않는다", () => {
    const text = card({});
    expect(text).toContain("장기보유특별공제");
    expect(text, "산식에 변수명이 그대로 노출됐다").not.toContain("장특공률)");
  });

  it("율을 받으면 값을 인라인한다", () => {
    expect(card({ lthdRate: 0.12 })).toContain("12%");
  });
});

// ── B-3 단건 결과뷰 호출부 ──────────────────────────────────────────
describe("B-3 단건 결과뷰가 실제로 그 두 prop을 넘긴다 (#017)", () => {
  /**
   * ⚠️ B-1·B-2는 카드·leaf를 **직접** 부른다 — 그 위 계층(결과뷰 호출부)은 못 본다.
   *   #017의 본체는 바로 그 호출부였으므로 뷰를 렌더해 화면 문자열로 확인한다.
   */
  it("🔴 「양도소득금액」 행이 나오고 장특 라벨에 율이 인라인된다", () => {
    const r = commercialResult();
    const { container } = render(
      <TransferTaxResultView result={r} onReset={() => {}} onBack={() => {}} />,
    );
    const text = container.textContent ?? "";
    expect(text, "카드가 아예 안 떴다 — 이 anchor는 아무것도 재지 못한다").toContain(
      "상업용건물·오피스텔 환산취득가 산정 근거",
    );
    expect(text).toContain("양도소득금액 = 양도차익 − 장기보유특별공제");
    expect(text).not.toContain("장특공률)");
  });
});

// ════════════════════════════════════════════════════════════════════
// C. 겸용이 공용 경고 카드를 쓴다 (#086)
// ════════════════════════════════════════════════════════════════════

function mixed(warnings?: string[]) {
  const b = calcMixedUseTransferTax(
    3_000_000_000,
    D("2026-06-01"),
    { ...mixedUseCase14(), isOneHouseExempt: false } as never,
    makeMockRatesWithHouseEngine(),
  );
  return warnings ? { ...b, warnings } : b;
}

describe("C-0 격자 — 겸용 엔진의 warnings 배열이 실재한다", () => {
  it("배열이 있고, 이 격자에서는 비어 있다", () => {
    // ⚠️ 이 픽스처는 경고를 내지 않는다. 그래서 C-1은 **렌더 경로**를 재기 위해
    //   경고를 주입한다 — 「엔진이 경고를 내면 화면에 공용 카드로 나오는가」가 이 축이다.
    expect(Array.isArray(mixed().warnings)).toBe(true);
    expect(mixed().warnings.length).toBe(0);
  });
});

describe("C-1 겸용이 「확인이 필요한 사항」 공용 카드를 쓴다 (#086)", () => {
  it("🔴 나머지 세 뷰와 같은 제목·문구가 나온다", () => {
    const { container } = render(
      <MixedUseResultCard breakdown={mixed(["§155⑦3호 귀농주택 사후관리 대상입니다"]) as never} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("확인이 필요한 사항");
    expect(text).toContain("§155⑦3호 귀농주택 사후관리 대상입니다");
  });

  it("대조군 — 경고가 없으면 카드가 없다", () => {
    const { container } = render(<MixedUseResultCard breakdown={mixed()} />);
    expect(container.textContent ?? "").not.toContain("확인이 필요한 사항");
  });
});
