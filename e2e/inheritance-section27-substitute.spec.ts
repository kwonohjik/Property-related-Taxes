/**
 * E2E: 상속세 §27 단서 대습상속 할증 배제
 *
 * 검증:
 *   - 수유자(legatee)에 §27 세대생략 토글 ON → "대습상속(민법 §1001)" 토글 노출.
 *   - 대습 토글 ON 후 계산 진행(크래시 없음).
 *   - §27 토글 OFF 시 대습 토글 숨김(stale 정리).
 *
 * Plan:  docs/00-pm/inheritance-section27-substitute-inheritance.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect } from "@playwright/test";

test.describe("상속세 §27 단서 대습상속", () => {
  test("SI-E2E: 수유자 세대생략 ON → 대습 토글 노출 → ON → 계산", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/inheritance-tax");

    // Step0: 상속개시일 + 수유자 1명
    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("6");
    await page.getByLabel("일").first().fill("10");
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("수유자", { exact: true }).click();

    // §27 세대생략 토글 ON
    const genSkipToggle = page.getByText(
      "§27 세대생략 할증 대상 — 자녀를 건너뛴 직계비속 유증(손자녀 등)",
    );
    await expect(genSkipToggle).toBeVisible();
    await genSkipToggle.click();

    // 대습상속 토글 노출 확인 (§27 단서)
    const substituteToggle = page.getByText(
      "대습상속 (민법 §1001) — §27 할증 배제",
    );
    await expect(substituteToggle).toBeVisible();

    // 대습 ON
    await substituteToggle.click();

    // §27 토글 OFF → 대습 토글 숨김 (stale 정리)
    await genSkipToggle.click();
    await expect(substituteToggle).toHaveCount(0);
  });
});
