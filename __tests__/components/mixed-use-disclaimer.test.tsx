/**
 * anchor: 겸용주택 결과 화면·PDF에도 면책 고지가 붙는다 (UI 리뷰 보통 #44).
 *
 * 같은 물건을 단건(주택)으로 계산하면 `TransferTaxResultView`가 `<DisclaimerBanner />`를
 * 붙이는데(:709), 겸용 경로(`MixedUseResultCard`)에만 없었다 — **자산 종류를 겸용으로 바꾸는
 * 것만으로 고지가 사라졌다**. 선택 출력과 무관하게 항상 인쇄되어야 하므로 `PrintSection` 밖이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import {
  mixedUseCase14,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../tax-engine/_helpers/mixed-use-fixture";

afterEach(cleanup);

/**
 * 손으로 만든 breakdown 대신 **실제 엔진 산출**을 쓴다 — 픽스처가 렌더 경로를 우회하면
 * 「고지가 없다」는 결함을 잡지 못한다(메모리 `feedback_fixture_default_masks_gate_defect`).
 */
const breakdown = calcMixedUseTransferTax(
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
  mixedUseCase14(),
  makeMockRates(),
);

describe("겸용주택 결과 카드 — 면책 고지", () => {
  it("🔑 D-1: 면책 고지가 렌더된다", () => {
    render(<MixedUseResultCard breakdown={breakdown} formData={undefined} />);
    expect(screen.getByText(/면책 고지/)).toBeTruthy();
    expect(screen.getByText(/법적 효력이 없습니다/)).toBeTruthy();
  });
});
