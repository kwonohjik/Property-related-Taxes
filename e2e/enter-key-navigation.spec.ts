/**
 * E2E: 전역 Enter 키 입력 이동 (EnterKeyNavigationProvider)
 *
 * 검증 (docs/00-pm/ui-polish-sidebar-label-enter.plan.md 작업 3):
 *   1. 텍스트 입력에서 Enter → 같은 스코프의 다음 입력으로 포커스 이동
 *      (비상장 V2 정식평가 카드의 법인명 → 사업자등록번호 → 대표자 연속 입력)
 *   2. 마지막 의미 입력에서 Enter 시 폼 제출/페이지 이동이 발생하지 않음
 *
 * 진입 경로는 inheritance-unlisted-fiscal-year-annualize.spec.ts 헬퍼와 동일.
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

/** V2 정식평가 카드 모드로 진입 (법인명 등 연속 텍스트 입력 노출) */
async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 입력
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");

  // 상속인 1명(자녀) 등록 — 2단계 picker + 모달 RRN 자동입력·닫기 (PR #68)
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);

  // Step1(상속재산 평가)으로 이동
  await page.getByRole("button", { name: /^다음/ }).click();

  // StockValuationForm: "주식·지분 추가" → "비상장주식" → "정식평가"
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

test.describe("전역 Enter 키 입력 이동", () => {
  test("텍스트 입력에서 Enter → 다음 입력으로 포커스 이동", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    const company = page.getByPlaceholder("법인명 입력");
    await expect(company).toBeVisible({ timeout: 5_000 });

    await company.click();
    await company.fill("기계 주식회사");
    await page.keyboard.press("Enter");

    // 법인명 다음 입력(사업자등록번호)으로 포커스 이동
    await expect(page.getByPlaceholder("사업자등록번호 (선택)")).toBeFocused();

    // 한 번 더 Enter → 대표자 입력으로 이동
    await page.keyboard.press("Enter");
    await expect(page.getByPlaceholder("대표자 이름 (선택)")).toBeFocused();
  });

  test("Enter 시 페이지 이동/폼 제출이 발생하지 않는다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    const company = page.getByPlaceholder("법인명 입력");
    await company.click();
    await company.fill("기계 주식회사");

    const urlBefore = page.url();
    await page.keyboard.press("Enter");
    // 같은 Step1 페이지 유지 (URL 불변), 입력 폼 여전히 노출
    expect(page.url()).toBe(urlBefore);
    await expect(page.getByPlaceholder("법인명 입력")).toBeVisible();
  });
});
