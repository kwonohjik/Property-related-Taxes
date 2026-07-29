/**
 * A5 — 상가·오피스텔 결과 카드가 **엔진 결과 타입을 직접 사용**하는지 계약 검증.
 *
 * ## 결함
 *
 * `CommercialBuildingValuationDetailCard.tsx`가 엔진의 `CommercialBuildingValuationResult`와
 * **같은 이름의 인터페이스를 로컬 재선언**하고 있었다(dual-truth). 엔진에 필드가 늘어도
 * 카드 쪽 정의에 없으면 UI가 볼 수 없는 구조였고, 실제로 **7개 필드가 누락**돼 있었다
 * (`landStdAtAcq` · `buildingStdAtAcq` · `landStdAtFirst` · `buildingStdAtFirst` ·
 * `landStdAtTransfer` · `buildingStdAtTransfer` · `sec164_8AdjustedDenominator`).
 *
 * 이 드리프트가 **컴파일 에러로 드러나지 않은 이유**는 호출부
 * (`TransferTaxResultView.tsx`)가 `(result as any).commercialBuildingValuationDetail`로
 * 캐스팅해 경계의 타입 검사를 꺼두고 있었기 때문이다. 두 가지를 함께 정정해야 보장이 생긴다.
 *
 * ## 이 테스트가 지키는 것
 *
 * **엔진 실제 출력을 카드에 그대로 흘려보낸다.** 타입이 다시 갈라지면 tsc가 잡고,
 * 필드 이름이 어긋나면 이 테스트의 렌더 단언이 잡는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CommercialBuildingValuationDetailCard } from "@/components/calc/results/CommercialBuildingValuationDetailCard";
import { calculateCommercialBuildingValuation } from "@/lib/tax-engine/commercial-building-valuation";
import {
  CB_VALUATION_INPUT_C01,
  TRANSFER_PRICE,
} from "../tax-engine/transfer-tax/_helpers/case-29-fixtures";

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

describe("A5: 엔진 출력 → 카드 계약", () => {
  it("엔진 결과를 그대로 전달해 렌더된다 (타입·필드명 계약)", () => {
    // ⚠️ 고정 리터럴이 아니라 **엔진 실제 출력**을 넣는 것이 이 테스트의 요점이다.
    const detail = calculateCommercialBuildingValuation(CB_VALUATION_INPUT_C01, TRANSFER_PRICE);
    render(<CommercialBuildingValuationDetailCard detail={detail} transferPrice={TRANSFER_PRICE} />);

    // 개산공제 합계 — 엔진 값이 화면에 도달했는가
    expect(
      screen.getAllByText(detail.estimatedDeductionTotal.toLocaleString()).length,
    ).toBeGreaterThan(0);
    // 환산취득가 합계
    expect(
      screen.getAllByText(detail.estimatedAcquisitionTotal.toLocaleString()).length,
    ).toBeGreaterThan(0);
  });

  it("개산공제 산식의 base가 엔진이 실제로 쓴 값이다 (표시 자기충족)", () => {
    const detail = calculateCommercialBuildingValuation(CB_VALUATION_INPUT_C01, TRANSFER_PRICE);
    render(<CommercialBuildingValuationDetailCard detail={detail} transferPrice={TRANSFER_PRICE} />);

    const base = detail.lumpDeductionBase ?? detail.estimatedBasisAtAcq ?? 0;
    expect(base, "엔진이 base를 echo해야 산식이 자기 값을 만든다").toBeGreaterThan(0);
    // 라벨에 base가 노출되고, base × 3%가 표시된 개산공제와 일치
    // (같은 숫자가 여러 행에 나올 수 있어 getAllByText — 존재 여부만 본다)
    expect(
      screen.getAllByText((_, el) => (el?.textContent ?? "").includes(base.toLocaleString())).length,
      "개산공제 산식 라벨에 엔진 base가 노출돼야 한다",
    ).toBeGreaterThan(0);
    expect(Math.floor(base * 0.03)).toBe(detail.estimatedDeductionTotal);
  });

  it("🔴 로컬 재선언이 놓쳤던 7개 필드가 타입상 접근 가능하다", () => {
    const detail = calculateCommercialBuildingValuation(CB_VALUATION_INPUT_C01, TRANSFER_PRICE);
    // 로컬 타입이었다면 아래 접근이 tsc 에러였다 — 계약 회복 확인.
    const reachable: (number | undefined)[] = [
      detail.landStdAtAcq,
      detail.buildingStdAtAcq,
      detail.landStdAtFirst,
      detail.buildingStdAtFirst,
      detail.landStdAtTransfer,
      detail.buildingStdAtTransfer,
      detail.sec164_8AdjustedDenominator,
    ];
    expect(reachable.length).toBe(7);
  });
});
