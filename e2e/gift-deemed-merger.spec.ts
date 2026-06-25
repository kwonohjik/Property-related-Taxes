import { test, expect, type Page } from "@playwright/test";

/** E2E: 합병 §38 보완 — 단순평균액 자동(§28⑤) + 주주 매트릭스 자기증여 차감(재산세과-799). */

async function openDetail(page: Page, type: string) {
  await page.getByTestId(`deemed-type-${type}`).click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("합병 §38 — 평가 보조·주주 매트릭스", () => {
  test("Phase A direct (사례1, 회귀) → 병 466,620,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "merger");
    await page.getByTestId("mrg-over-price").fill("30000"); // 과대평가(B) 1주평가
    await page.getByPlaceholder("합병 전 주식수").fill("100000");
    await page.getByPlaceholder("교부받은 주식수").fill("100000");
    await page.getByPlaceholder("합병 후 1주당 평가가액 (원)").fill("36666"); // 단순평균액(직접입력)
    await page.getByPlaceholder("대주주등 주식수").fill("70000"); // 병
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("466,620,000");
  });

  test("Phase B 주주 매트릭스 자기증여 차감 (사례2) → 갑 400,000,000·병 600,000,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "merger");
    await page.getByText("다수 대주주·동일인 자기증여 입력").click(); // 매트릭스 모드 ON
    await page.getByTestId("mrg-over-price").fill("10000");
    await page.getByTestId("mrg-under-price").fill("50000");
    await page.getByTestId("mrg-post-total").fill("300000");
    await page.getByTestId("mrg-ex-numer").fill("1");
    await page.getByTestId("mrg-ex-denom").fill("2");
    // 과대평가(이익측) 주주 2명
    await page.getByTestId("mrg-over-add").click();
    await page.getByTestId("mrg-over-name-0").fill("갑");
    await page.getByTestId("mrg-over-shares-0").fill("140000");
    await page.getByTestId("mrg-over-add").click();
    await page.getByTestId("mrg-over-name-1").fill("병");
    await page.getByTestId("mrg-over-shares-1").fill("60000");
    // 과소평가(증여자측) 주주 3명
    await page.getByTestId("mrg-under-add").click();
    await page.getByTestId("mrg-under-name-0").fill("갑");
    await page.getByTestId("mrg-under-shares-0").fill("100000");
    await page.getByTestId("mrg-under-add").click();
    await page.getByTestId("mrg-under-name-1").fill("을");
    await page.getByTestId("mrg-under-shares-1").fill("60000");
    await page.getByTestId("mrg-under-add").click();
    await page.getByTestId("mrg-under-name-2").fill("소액");
    await page.getByTestId("mrg-under-shares-2").fill("40000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    const matrix = page.getByTestId("merger-matrix");
    await expect(matrix).toContainText("400,000,000"); // 갑 순이익
    await expect(matrix).toContainText("600,000,000"); // 병 순이익
    await expect(matrix).toContainText("240,000,000"); // 갑 ← 을
    await expect(matrix).toContainText("300,000,000"); // 병 ← 갑
  });

  test("Phase C 분할합병 순자산비율(§28⑦) → 과대평가 안분 → 350,000,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "merger");
    // 분할합병 토글 ON (Switch aria-label) + 순자산비율 모드
    await page.getByRole("switch", { name: "분할합병 (§28⑦)" }).click();
    await page.getByTestId("mrg-split-ratio").click();
    await page.getByTestId("mrg-split-pre").fill("50000");
    await page.getByTestId("mrg-split-bna").fill("3000000000");
    await page.getByTestId("mrg-split-cna").fill("10000000000");
    await page.getByPlaceholder("합병 전 주식수").fill("100000");
    await page.getByPlaceholder("교부받은 주식수").fill("100000");
    await page.getByPlaceholder("합병 후 1주당 평가가액 (원)").fill("20000");
    await page.getByPlaceholder("대주주등 주식수").fill("70000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("350,000,000");
  });
});
