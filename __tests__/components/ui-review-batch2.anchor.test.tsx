/**
 * @vitest-environment jsdom
 *
 * anchor — UI 리뷰 대장 **밖** 미판정 23건 중 배치② 렌더 축 (R14 · R16).
 * 대장: `docs/reviews/transfer-ui-review-2026-09-unjudged.md`
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HousingContribEstimatedSection } from "@/components/calc/transfer/HousingContribEstimatedSection";
import { BurdenedGiftPriorGiftsBlock } from "@/components/calc/transfer/BurdenedGiftPriorGiftsBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { computeLumpSumDeductionBase } from "@/lib/tax-engine/tax-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/* ══ R14 · §166③ 미리보기 개산공제는 «지분» 기준시가로 잰다 ══════════════════
 *
 * 엔진은 `computeLumpSumDeductionBase(housingStdPriceAtAcq, input.ownershipRatio)`를
 * 쓰는데(`redevelopment.ts:540`) 미리보기만 100% 기준시가에 3%를 곱해,
 * 지분 자산에서 **화면 금액과 실제 계산이 갈렸다**.
 *
 * 픽스처: 취득시 PHD 4억 · 인가시 PHD 8억 · 권리가액 10억 · 지분 1/2
 *   개산공제 base = 4억 × 1/2 = 2억 → 개산공제 = 6,000,000
 *   (종전 미리보기: 4억 × 3% = 12,000,000 — **2배**)
 */
describe("R14 · 출자 환산 미리보기 개산공제 = 지분 기준시가 × 3%", () => {
  const asset = (over: Partial<AssetForm> = {}): AssetForm => ({
    ...makeDefaultAsset(1),
    redevRightsValue: "1,000,000,000",
    redevHousingStdPriceAtAcq: "400,000,000",
    redevHousingStdPriceAtApproval: "800,000,000",
    ownershipNumerator: "1",
    ownershipDenominator: "2",
    ...over,
  });

  it("🔴 지분 1/2이면 6,000,000이다 — 종전에는 12,000,000이었다", () => {
    render(<HousingContribEstimatedSection asset={asset()} onChange={vi.fn()} />);
    expect(screen.getByText("6,000,000")).toBeDefined();
    expect(screen.queryByText("12,000,000")).toBeNull();
  });

  it("🔑 산식 base가 자기 금액을 재현한다 — 100%를 echo하지 않는다", () => {
    render(<HousingContribEstimatedSection asset={asset()} onChange={vi.fn()} />);
    // base = 200,000,000 (지분 기준시가)
    expect(screen.getByText(/200,000,000/)).toBeDefined();
  });

  it("지분 자산에는 base가 지분 기준시가임을 밝히는 주석이 붙는다", () => {
    render(<HousingContribEstimatedSection asset={asset()} onChange={vi.fn()} />);
    expect(screen.getByTestId("housing-contrib-ratio-note")).toBeDefined();
  });

  it("🔴 대조군 — 단독소유(100%)는 종전과 같다 (12,000,000 · 주석 없음)", () => {
    render(
      <HousingContribEstimatedSection
        asset={asset({ ownershipNumerator: "100", ownershipDenominator: "100" })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("12,000,000")).toBeDefined();
    expect(screen.queryByTestId("housing-contrib-ratio-note")).toBeNull();
  });

  it("🔴 대조군 — 환산취득가는 지분 스케일 대상이 «아니다» (엔진 산식과 동일)", () => {
    render(<HousingContribEstimatedSection asset={asset()} onChange={vi.fn()} />);
    // 10억 × 4억 / 8억 = 500,000,000 — 지분과 무관
    expect(screen.getByText("500,000,000")).toBeDefined();
  });

  it("엔진 leaf와 같은 값을 쓴다 (dual-truth 방지)", () => {
    expect(computeLumpSumDeductionBase(400_000_000, 0.5)).toBe(200_000_000);
    expect(computeLumpSumDeductionBase(400_000_000, 1)).toBe(400_000_000);
  });
});

/* ══ R16 · 사전증여 안내문이 «차단»을 차단이라고 말한다 ═══════════════════════
 *
 * ⑧ `transfer-tax-validate-bg.ts:306-313`은 유효한 사전증여 행에 당시 산출세액·과세표준이
 * 없으면 **계산을 막는다**. 그런데 안내문은 「미입력 시 합산 누진만 적용되고 공제가
 * 누락됩니다」라며 **진행된다고** 말했다.
 */
describe("R16 · 사전증여 안내문 ↔ 검증 일치", () => {
  const asset = { ...makeDefaultAsset(1), bgPriorGifts: [] } as AssetForm;

  it("🔴 「계산이 차단됩니다」라고 말한다", () => {
    render(<BurdenedGiftPriorGiftsBlock asset={asset} onChange={vi.fn()} />);
    expect(screen.getByText(/계산이 차단됩니다/)).toBeDefined();
  });

  it("🔴 「공제가 누락됩니다」라는 반대 서술이 남아 있지 않다", () => {
    const { container } = render(
      <BurdenedGiftPriorGiftsBlock asset={asset} onChange={vi.fn()} />,
    );
    expect(container.textContent ?? "").not.toContain("공제가 누락됩니다");
  });

  it("해소 방법(행 삭제)을 함께 알려준다 — dead-end 방지", () => {
    const { container } = render(
      <BurdenedGiftPriorGiftsBlock asset={asset} onChange={vi.fn()} />,
    );
    expect(container.textContent ?? "").toContain("삭제");
  });

  it("🔴 대조군 — §47②·§58 근거 인용은 그대로다", () => {
    const { container } = render(
      <BurdenedGiftPriorGiftsBlock asset={asset} onChange={vi.fn()} />,
    );
    expect(container.textContent ?? "").toContain("§47②");
    expect(container.textContent ?? "").toContain("§58");
  });
});
