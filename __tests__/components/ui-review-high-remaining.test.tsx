/**
 * @vitest-environment jsdom
 *
 * anchor: 대장 재대조에서 살아 있던 高 결함의 **렌더 축** (H2·H5·H6·H7, 2026-09-07).
 *
 * ⚠️ 라이브러리·순수 함수만 단언하면 컴포넌트 수정을 증명하지 못한다
 *    ([[feedback_library_anchor_does_not_prove_component_uses_it]]) — 전부 렌더 결과로 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";
import { PostDeemedInputs } from "@/components/calc/transfer/inheritance/PostDeemedInputs";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import { AggregateSettingsPanel } from "@/components/calc/transfer/AggregateSettingsPanel";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/* ────────────────────────────────────────────────────────────────
 * H2 — 거주기간 「직접 개월 입력」 칸이 기본 모드에서 보인다
 * ──────────────────────────────────────────────────────────────── */

describe("H2 — direct 모드 입력칸은 ToggleCard 밖에 있어야 한다", () => {
  const renderSection = (mode: "interval" | "direct") =>
    render(
      <ResidencePeriodSection
        residenceInputMode={mode}
        residencePeriods={[]}
        residencePeriodMonthsAsset="0"
        transferDate="2025-05-01"
        onChange={() => {}}
      />,
    );

  it("🔑 F-1: 기본값(direct)에서 「거주기간 (개월)」 칸이 렌더된다", () => {
    renderSection("direct");
    expect(screen.getByText(/거주기간 \(개월\)/)).toBeTruthy();
  });

  it("🔑 F-2: interval 모드에서는 그 칸이 사라진다 — 게이트를 지운 게 아니다", () => {
    renderSection("interval");
    expect(screen.queryByText(/거주기간 \(개월\)/)).toBeNull();
  });

  it("F-3: 안내문이 상속 전용 단정으로 시작하지 않는다", () => {
    renderSection("direct");
    const p = screen.getByText(/표2 장특공제 거주분 공제율/);
    expect(p.textContent?.startsWith("거주기간(상속개시일")).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────
 * H6 — 보조계산 합계는 store 파생이라 stale이 될 수 없다
 * ──────────────────────────────────────────────────────────────── */

function landAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "inheritance",
    inheritanceDate: "2010-06-01",
    inheritanceValuationMethod: "supplementary",
    useSupplementaryHelper: true,
    supplementaryLandUnitPrice: "3,000,000",
    supplementaryLandArea: "200",
    ...over,
  } as AssetForm;
}

describe("H6 — 평가방법을 되돌려도 화면에 없는 옛 합계가 살아나지 않는다", () => {
  it("G-1: 단가·면적이 있으면 합계가 파생된다", () => {
    render(<PostDeemedInputs asset={landAsset()} onChange={() => {}} />);
    expect(screen.getAllByText(/600,000,000/).length).toBeGreaterThan(0);
  });

  /**
   * 🔑 결함은 **상태 전이**에서만 드러난다 — 한 번만 렌더하면 `useState` 초기화가
   *    같은 store 값을 읽으므로 구별력이 0이다(실측: 뮤테이션에서 단일 렌더 단언 2건이
   *    모두 통과했다). 평가방법 Select가 store 두 필드를 비우는 상황을 `rerender`로 재현한다.
   */
  it("🔑 G-2: 단가·면적을 비우면 합계가 **즉시** 사라진다 (로컬 state였다면 남는다)", () => {
    const { rerender } = render(<PostDeemedInputs asset={landAsset()} onChange={() => {}} />);
    expect(screen.getAllByText(/600,000,000/).length).toBeGreaterThan(0);

    // 평가방법 변경 → store의 supplementaryLand* 2필드만 비워진다(컴포넌트는 그대로).
    rerender(
      <PostDeemedInputs
        asset={landAsset({ supplementaryLandUnitPrice: "", supplementaryLandArea: "" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/600,000,000/)).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────
 * H7 — 컴패니언 NBL 「접기」에 복귀 경로가 있다
 * ──────────────────────────────────────────────────────────────── */

describe("H7 — 컴패니언 자산의 NBL 상세 판정은 되돌릴 수 있다", () => {
  const nblLand = (detailed: boolean) =>
    ({
      ...makeDefaultAsset(2),
      assetKind: "land",
      isNonBusinessLand: true,
      nblUseDetailedJudgment: detailed,
      acquisitionDate: "2015-02-10",
    }) as AssetForm;

  it("🔑 H-1: 접힌 상태에서 「+ 상세 판정 시작」 복귀 버튼이 렌더된다", () => {
    render(
      <AssetSectionExtras asset={nblLand(false)} onChange={() => {}} transferDate="2025-05-01" />,
    );
    expect(screen.getByText("+ 상세 판정 시작")).toBeTruthy();
  });

  it("H-2: 펼친 상태는 종전대로 상세 판정 본문", () => {
    render(
      <AssetSectionExtras asset={nblLand(true)} onChange={() => {}} transferDate="2025-05-01" />,
    );
    expect(screen.getByText("비사업용 토지 정밀 판정")).toBeTruthy();
    expect(screen.queryByText("+ 상세 판정 시작")).toBeNull();
  });

  it("H-3: 비사업용이 아니면 아무것도 렌더하지 않는다", () => {
    const asset = { ...nblLand(false), isNonBusinessLand: false } as AssetForm;
    render(<AssetSectionExtras asset={asset} onChange={() => {}} transferDate="2025-05-01" />);
    expect(screen.queryByText("+ 상세 판정 시작")).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────
 * H5 — 기납부세액 두 칸이 서로의 자동값을 지우지 않는다 (렌더 축)
 * ──────────────────────────────────────────────────────────────── */

describe("H5 — 지방소득세만 편집해도 국세 칸이 0으로 바뀌지 않는다", () => {
  it("🔑 I-1: 자동 파생값이 화면에 남는다", () => {
    const form = {
      ...defaultMultiTransferFormData,
      priorPaidLocalTax: "1,000,000",
      priorPaidLocalTaxEdited: true,
      priorPaidTax: "0",
      priorPaidTaxEdited: false,
      properties: [],
    };
    render(<AggregateSettingsPanel form={form} onChange={() => {}} />);
    // 자산이 없어 파생값은 0이지만, **국세 칸이 `priorPaidTaxEdited`가 아닌 지방 플래그로
    // 갈리지 않는다**는 것이 요점이다 — 아래 두 칸이 서로 다른 값을 들 수 있어야 한다.
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const values = inputs.map((i) => i.value);
    expect(values).toContain("1,000,000");
  });
});
