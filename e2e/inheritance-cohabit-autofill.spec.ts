/**
 * E2E (Anchor C): 상속세 — §23의2 동거주택 자산 체크 → Step4 동거주택 공시가격 가시적 자동채움
 *
 * 검증:
 *   - 동거 자녀가 있을 때만 자산 카드 '동거주택 공제 대상' 체크 활성(hasCohabitantChild 게이팅, R-2)
 *   - 주택을 동거주택으로 체크하면 그 기준시가(gross)가 Step4 동거주택 공시가격 칸에 자동 표시(display fallback, E-1)
 *
 * 설계: docs/02-design/features/inheritance-additional-deduction-autofill-v3.ui.design.md
 */
import { test, expect, type Page } from "@playwright/test";

/** Step0: 상속개시일 + 자녀 1명 등록 (cohabit 옵션) → Step1 아파트 추가 + 기준시가 입력 */
async function setupAptCard(page: Page, opts: { cohabitChild: boolean }) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2023");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("10");

  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();

  // 자녀 동거(isCohabitant) 표시 — HeirComposition '동거주택 상속공제 해당' 토글
  if (opts.cohabitChild) {
    await page.getByText("동거주택 상속공제 해당").click();
  }

  await page.getByRole("button", { name: /^다음/ }).click();

  // 상속재산 추가 → 주택, 기준시가 총액 6억 직접 입력
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /주택/ }).click();
  // 보충적 평가(주택 기준시가) 토글 ON — 금액 입력 펼침 (2026-06-09 토글 전환)
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await page.getByPlaceholder("금액 입력").first().fill("600000000");

  // 담보·임대 섹션 토글 ON — §23의2 동거주택 공제 대상 토글 펼침 (2026-06-09 토글 전환)
  await page.getByRole("switch", { name: /담보·임대/ }).click();
}

test.describe("§23의2 동거주택 자동채움", () => {
  test("동거 자녀 + 동거주택 체크 → Step4 동거주택 공시가격 칸에 6억 자동 표시", async ({ page }) => {
    await setupAptCard(page, { cohabitChild: true });

    // 동거주택 공제 대상 체크 (활성 상태)
    await page.getByText("동거주택 공제 대상 (§23의2)").click();

    // Step1 → 2 → 3 → 4
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /^다음/ }).click();
    }

    // Step4 동거주택 공시가격 칸에 gross 기준시가 자동 표시 (display fallback)
    const cohabitField = page.getByPlaceholder(
      "자산 카드 동거주택 체크 또는 직접 입력",
    );
    await expect(cohabitField).toHaveValue("600,000,000");
  });

  test("동거 자녀 없음 → 동거주택 체크 비활성(disabledReason 노출)", async ({ page }) => {
    await setupAptCard(page, { cohabitChild: false });

    // 비활성 사유 표시 — 체크 불가
    await expect(
      page.getByText(/상속인 구성.*자녀의 동거/),
    ).toBeVisible();
  });
});
