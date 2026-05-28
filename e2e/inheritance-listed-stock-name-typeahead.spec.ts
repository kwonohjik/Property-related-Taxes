/**
 * E2E: 상속·증여 상장주식 종목명 typeahead — 회사명으로 종목코드 자동 채움
 *
 * 시나리오:
 *   - 상속세 마법사 → 상속인 추가 → 상장주식 카드 진입
 *   - 종목명 input에 "삼" 입력 → /api/kiwoom/search-by-name 응답(mocked) → dropdown 표시
 *   - 첫 매치 클릭 → 종목코드 input 자동 채움 + 키움 자동조회 warning 사라짐
 *
 * Plan: docs/00-pm/listed-stock-name-autocomplete.plan.md
 * UI Design: docs/02-design/features/listed-stock-name-typeahead.ui.design.md §7
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openListedStockCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("상장주식", { exact: true }).click();
}

test.describe("상장주식 종목명 typeahead", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/kiwoom/search-by-name", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      const q = (body.query ?? "") as string;
      if (q.startsWith("삼")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            matches: [
              {
                stockCode: "005930",
                stockName: "삼성전자",
                marketCode: "0",
                marketName: "KOSPI",
                marketTypeStore: "kospi",
                tradingHalt: false,
                adminIssue: false,
              },
              {
                stockCode: "006400",
                stockName: "삼성SDI",
                marketCode: "0",
                marketName: "KOSPI",
                marketTypeStore: "kospi",
                tradingHalt: false,
                adminIssue: false,
              },
            ],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ matches: [] }),
        });
      }
    });
  });

  test("종목명 입력 → 매치 선택 → 종목코드 자동 채움 + warning 사라짐", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);
    await openListedStockCard(page);

    const nameInput = page.getByTestId("ls-security-info-name-input");
    await nameInput.fill("삼");

    const samsungOption = page.getByRole("option", { name: /삼성전자/ });
    await expect(samsungOption).toBeVisible({ timeout: 5000 });
    await samsungOption.click();

    await expect(nameInput).toHaveValue("삼성전자");
    await expect(page.getByTestId("ls-security-info-code")).toHaveValue("005930");
    await expect(page.getByText("종목코드 6자리 입력 필요")).not.toBeVisible();
  });
});
