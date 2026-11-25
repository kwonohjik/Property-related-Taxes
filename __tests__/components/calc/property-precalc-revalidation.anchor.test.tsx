/**
 * PSA-E4 후속 M3 — 계산 직전 0~3단계 재검증(UQ-6·UQ-12). StepIndicator로 단계를 건너뛴 경로가
 * 서버 400(「입력값이 올바르지 않습니다.」)이 아니라 그 단계의 구체 오류 + 첫 실패 단계 복귀로 막힌다.
 */
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/property-tax",
}));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ savedId: null }),
}));

import { PropertyTaxForm } from "@/components/calc/PropertyTaxForm";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("계산 직전 재검증 — 단계 우회 경로", () => {
  it("step 0 미입력(공시가격 빈칸) 상태에서 StepIndicator로 step 3에 가 계산 → 서버 호출 없이 step 0 오류로 복귀", async () => {
    render(<PropertyTaxForm />);
    // 주택 단계: ["기본 정보", "확인"] — 두 번째 원(확인)으로 점프
    fireEvent.click(screen.getByRole("button", { name: "확인 단계로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: /재산세 계산하기/ }));
    await waitFor(() => expect(screen.getByText("공시가격을 입력하세요.")).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/입력값이 올바르지 않습니다/)).toBeNull();
    // 첫 실패 단계(0)로 돌아갔다 — 물건 유형 선택 화면이 다시 보인다
    expect(screen.queryByRole("button", { name: /재산세 계산하기/ })).toBeNull();
  });
});
