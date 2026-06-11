/**
 * E2E: 상속세 단계 상태 배지(③) + 검증 오류 일괄 표시(①)
 *
 * 검증:
 *   STS-1: 빈 1단계에서 "다음" → 누락 오류 2건(상속개시일·상속인)이 한 번에 표시
 *          (기존: 첫 오류 1건씩 두더지잡기식 노출)
 *   STS-2: 1단계 유효 입력 → step-circle-0 data-status="complete"(✓).
 *          상속재산 미입력 상태로 마지막 단계 점프 → 건너뛴 2단계 attention(!).
 *   STS-3: 상속재산 입력 → step-circle-1 complete 전환.
 *
 * data-status 계약: StepIndicator의 각 단계 원(div[data-testid=step-circle-N])에
 *   "complete" | "attention" | "neutral" 부여. collectStepErrors와 동일 규칙.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  addHeir,
  addLandAsset,
  nextSteps,
} from "./_helpers/tax-flow";

test.describe("상속세 단계 상태 배지 · 오류 일괄 표시", () => {
  test("STS-1: 빈 1단계에서 다음 → 누락 오류 2건 동시 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/inheritance-tax");

    // 아무 입력 없이 "다음" — 상속개시일·상속인 두 오류가 함께 나와야 함
    await page.getByRole("button", { name: /^다음/ }).click();

    const box = page.getByTestId("inheritance-step-error");
    await expect(box).toBeVisible();
    await expect(box).toContainText("상속개시일");
    await expect(box).toContainText("상속인·수유자를 1명 이상");
  });

  test("STS-2: 1단계 완료 배지 + 건너뛴 단계 attention 배지", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/inheritance-tax");

    await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
    await addHeir(page, "heir", "child");

    // 1단계(피상속인·상속인) 필수 충족 → 완료 배지
    await expect(page.getByTestId("step-circle-0")).toHaveAttribute(
      "data-status",
      "complete",
    );

    // 상속재산 미입력 상태로 마지막 단계(공제·세액공제)로 점프
    await page.getByTestId("step-circle-4").click();

    // 건너뛴 상속재산(2단계) → 입력 필요 배지
    await expect(page.getByTestId("step-circle-1")).toHaveAttribute(
      "data-status",
      "attention",
    );
    // 1단계는 여전히 완료 유지
    await expect(page.getByTestId("step-circle-0")).toHaveAttribute(
      "data-status",
      "complete",
    );
  });

  test("STS-3: 상속재산 입력 → 2단계 complete 전환", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/inheritance-tax");

    await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
    await addHeir(page, "heir", "child");
    await nextSteps(page, 1); // → 상속재산
    await addLandAsset(page, { area: "300", unitPrice: "10000000" });

    // 상속재산 입력됨 → 2단계 완료 배지
    await expect(page.getByTestId("step-circle-1")).toHaveAttribute(
      "data-status",
      "complete",
    );
  });
});
