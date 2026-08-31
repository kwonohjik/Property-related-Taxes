/**
 * anchor: 주식 부담부증여 ⑤ — §157 대주주 실입력 · 상장 환산 1개월 종가평균
 *
 * ## 무엇을 잡는가
 *
 * 종전 이 섹션의 유일한 대주주 입력은 「대주주」 boolean 토글 하나였는데, ④가 판정 근거
 * (지분율·시총)를 전부 0으로 하드코딩해 엔진 자동 판정이 **항상 비대주주**였다.
 * 토글은 ④⑫⑭를 다 통과하고도 세액을 한 원도 바꾸지 못하는 dead input이었다
 * (ON/OFF 실측 동일 179,500,000).
 *
 * 상장 환산도 같은 구조다 — 1개월 종가평균 입력 칸이 아예 없어 `calcListedValuation`의
 * 0-가드에 걸려 취득가액·개산공제가 둘 다 0이 됐다.
 *
 * **입력 UI 없이 ④ 배선만 추가하면 no-op**이므로(memory
 * `feedback_api_trigger_without_input_path_is_noop`) 이 파일이 그 경로의 존재를 고정한다.
 * 노출 범위가 정확해야 한다 — 종가평균은 상장 × 환산 전용이고, 대주주 판정은
 * 상장 3시장과 **비상장 모두**(§167의8①2호)가 대상이다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { StockBurdenedDebtSection } from "@/components/calc/gift/StockBurdenedDebtSection";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

afterEach(cleanup);

const ID = "s1";

function renderSection(
  bgt: Partial<BurdenedGiftStockTransferTaxInput> | undefined,
  onUpdate: (u: EstateItem) => void = () => {},
  transferDate = "2025-06-02",
) {
  const item = {
    id: ID,
    name: "삼성전자",
    category: "listed_stock",
    marketValue: 100_000_000,
    listedStockShares: 1000,
    assumedDebtForGift: 10_000_000,
    burdenedGiftStockTransferTax: bgt
      ? {
          marketType: "kospi",
          acquisitionDate: "2015-03-02",
          acquisitionMode: "estimated",
          ...bgt,
        }
      : undefined,
  } as unknown as EstateItem;
  return render(
    <StockBurdenedDebtSection
      item={item}
      onUpdate={onUpdate}
      mode="gift"
      transferDate={transferDate}
    />,
  );
}

describe("BG-UI-AVG — 상장 환산 1개월 종가평균 (§176의2②1호)", () => {
  it("BG-UI-AVG-1: 상장 × 환산이면 분모·분자 2칸이 렌더된다", () => {
    renderSection({});
    expect(screen.queryByTestId(`stock-bg-transfer-avg-${ID}`)).not.toBeNull();
    expect(screen.queryByTestId(`stock-bg-acq-avg-${ID}`)).not.toBeNull();
  });

  it("BG-UI-AVG-2: 실지취득가 모드에는 렌더되지 않는다 (조용히 무시되는 칸 금지)", () => {
    renderSection({ acquisitionMode: "actual" });
    expect(screen.queryByTestId(`stock-bg-transfer-avg-${ID}`)).toBeNull();
    expect(screen.queryByTestId(`stock-bg-acq-avg-${ID}`)).toBeNull();
  });

  it("BG-UI-AVG-3: 비상장 환산에는 렌더되지 않는다 (§165④ 보충평가 경로)", () => {
    renderSection({ marketType: "unlisted" });
    expect(screen.queryByTestId(`stock-bg-transfer-avg-${ID}`)).toBeNull();
  });

  it("BG-UI-AVG-4: 입력값이 bgt에 저장된다", () => {
    const onUpdate = vi.fn();
    renderSection({}, onUpdate);
    const input = screen.getByTestId(`stock-bg-transfer-avg-${ID}`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "100000" } });
    expect(onUpdate).toHaveBeenCalled();
    const patched = onUpdate.mock.calls[0][0] as EstateItem;
    expect(patched.burdenedGiftStockTransferTax?.transferDatePriceAvg1Month).toBe(100_000);
  });
});

describe("BG-UI-MJ — §157·§167의8 대주주 판정 실입력", () => {
  it("BG-UI-MJ-1: 상장이면 판정기준일·지분율·시총 칸이 렌더된다", () => {
    renderSection({});
    expect(screen.queryByTestId(`stock-bg-judgment-date-${ID}`)).not.toBeNull();
    expect(screen.queryByTestId(`stock-bg-self-ratio-${ID}`)).not.toBeNull();
    expect(screen.queryByTestId(`stock-bg-self-cap-${ID}`)).not.toBeNull();
  });

  it("BG-UI-MJ-2: 비상장도 판정 대상이다 (§167의8①2호 — 종전엔 아예 없었다)", () => {
    renderSection({ marketType: "unlisted" });
    expect(screen.queryByTestId(`stock-bg-self-ratio-${ID}`)).not.toBeNull();
    expect(screen.queryByTestId(`stock-bg-self-cap-${ID}`)).not.toBeNull();
  });

  it("BG-UI-MJ-3: 세액에 닿지 않던 boolean 토글은 사라졌다", () => {
    renderSection({});
    expect(screen.queryByTestId(`stock-bg-major-shareholder-${ID}`)).toBeNull();
  });

  it("BG-UI-MJ-4: 지분율 입력이 isMajorShareholder echo를 같은 patch에 싣는다", () => {
    const onUpdate = vi.fn();
    renderSection({}, onUpdate);
    const input = screen.getByTestId(`stock-bg-self-ratio-${ID}`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2" } });
    const patched = onUpdate.mock.calls[0][0] as EstateItem;
    expect(patched.burdenedGiftStockTransferTax?.selfShareRatioPercent).toBe(2);
    // 2024-12-31 기준 KOSPI 임계 1% → 대주주
    expect(patched.burdenedGiftStockTransferTax?.isMajorShareholder).toBe(true);
  });

  it("BG-UI-MJ-5: 임계 미리보기가 **증여일** 축 기준일을 쓴다 (취득일 아님)", () => {
    renderSection({ selfShareRatioPercent: 1.5 });
    const preview = screen.getByTestId(`stock-bg-major-preview-${ID}`);
    expect(preview.textContent).toContain("2024-12-31");
    expect(preview.textContent).not.toContain("2014-12-31");
    expect(preview.textContent).toContain("대주주");
    expect(preview.textContent).not.toContain("대주주 아님");
  });

  it("BG-UI-MJ-6: 판정기준일 직접 입력은 **측정 축만** 옮긴다 (임계 행은 양도일)", () => {
    renderSection({ selfShareRatioPercent: 1.5, majorJudgmentDate: "2015-03-31" });
    const preview = screen.getByTestId(`stock-bg-major-preview-${ID}`);

    // 측정 축 — override 가 파생값(2024-12-31)을 이긴다
    expect(preview.textContent).toContain("2015-03-31");
    expect(preview.textContent).not.toContain("2024-12-31");

    /**
     * 임계 축 — 행 선택은 **양도일**이다(부칙 「양도하는 분부터」 · PR #1357 정정).
     * 2025-06-02 행은 지분율 1% 이므로 1.5% 는 대주주다.
     *
     * ⚠️ 종전 기대값은 「대주주 아님」이었다 — 2015-03-31 로 표를 뒤지던 **옛 축**의
     *    산물이다. 두 축을 섞으면 화면이 「지분율 2% … → 대주주」처럼 자기모순에 빠진다.
     */
    expect(preview.textContent).toContain("양도일 2025-06-02 기준 임계");
    expect(preview.textContent).toContain("지분율 1%");
    expect(preview.textContent).toContain("대주주");
    expect(preview.textContent).not.toContain("대주주 아님");
  });

  it("BG-UI-MJ-7: 합산 축은 최대주주그룹 토글 ON일 때만 열린다 (§157①1호 단서)", () => {
    // ToggleCard는 data-testid를 DOM에 흘리지 않는다(공용 카드) — 펼침 children의 존재로 본다.
    renderSection({});
    expect(screen.queryByTestId(`stock-bg-combined-ratio-${ID}`)).toBeNull();
    cleanup();
    renderSection({ isLargestShareholderGroup: true });
    expect(screen.queryByTestId(`stock-bg-combined-ratio-${ID}`)).not.toBeNull();
    expect(screen.queryByTestId(`stock-bg-combined-cap-${ID}`)).not.toBeNull();
  });
});
