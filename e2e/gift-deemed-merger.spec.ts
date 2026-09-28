import { test, expect, type Page } from "@playwright/test";
import { clickAndExpectUrl } from "./_helpers/navigation";

/** E2E: 합병 §38 보완 — 단순평균액 자동(§28⑤) + 주주 매트릭스 자기증여 차감(재산세과-799). */

async function openDetail(page: Page, type: string) {
  await page.getByTestId(`deemed-type-${type}`).click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

/** 사례2 주주 매트릭스 입력(모드 ON · 과대평가 갑·병 · 과소평가 갑·을·소액) — 상세 모달이 열린 상태에서 */
async function fillMatrixCase2(page: Page) {
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
}

test.describe("합병 §38 — 평가 보조·주주 매트릭스", () => {
  test("Phase A direct (사례1, 회귀) → 병 466,620,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "merger");
    await page.getByTestId("mrg-over-price").fill("30000"); // 과대평가(B) 1주평가
    await page.getByPlaceholder("합병 전 주식수").fill("100000");
    await page.getByPlaceholder("교부받은 주식수").fill("100000");
    await page.getByLabel("합병 후 1주당 평가가액", { exact: true }).fill("36666"); // 단순평균액(직접입력)
    await page.getByPlaceholder("대주주등 주식수").fill("70000"); // 병
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("466,620,000");
  });

  test("Phase B 주주 매트릭스 자기증여 차감 (사례2) → 갑 400,000,000·병 600,000,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "merger");
    await fillMatrixCase2(page);
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    const matrix = page.getByTestId("merger-matrix");
    await expect(matrix).toContainText("400,000,000"); // 갑 순이익
    await expect(matrix).toContainText("600,000,000"); // 병 순이익
    await expect(matrix).toContainText("240,000,000"); // 갑 ← 을
    await expect(matrix).toContainText("300,000,000"); // 병 ← 갑
  });

  test("Phase B + 갑이 영리법인(§4의2①·③) → 갑만 제외 · 과세 600,000,000 · 표에 사유", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "merger");
    await fillMatrixCase2(page);
    await page.getByTestId("mrg-over-corp-0").click(); // 과대평가(수증자) 갑 = 영리법인
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("600,000,000");
    const matrix = page.getByTestId("merger-matrix");
    await expect(matrix).toContainText("제외 — 영리법인 수증자");
    await expect(matrix).toContainText("400,000,000"); // 갑의 이익 자체는 표에 남는다
  });

  test("Phase B 수증자 선택 → 병 1인분(600,000,000)만 이관 — 합계 1,000,000,000이 아니다 (§4의2①·§68①)", async ({ page }) => {
    // 매트릭스 수증자는 각자 독립 납세의무자다. 종전에는 과세 수증자 전원 합계가 한 항목으로 넘어갔다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "merger");
    await fillMatrixCase2(page);
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    const selector = page.getByTestId("mrg-donee-selector");
    await expect(selector.locator("option")).toHaveCount(2);
    await selector.selectOption("1"); // 병
    // 화면이 고른 값을 유지해야 한다 — 표시 인덱스와 이관 인덱스가 다른 필드를 읽으면 선택기는 갑으로
    // 되돌아가 보이는데 이관은 병이 된다(DeemedGiftCalculator의 두 삼항이 짝으로 맞아야 한다)
    await expect(selector).toHaveValue("1");

    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);
    await page.getByTestId("gift-donor-select").selectOption("other_relative");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("합병에 따른 이익 증여이익 (병)")).toBeVisible();
    await expect(page.getByText("합병에 따른 이익 증여이익 (갑)")).toHaveCount(0);
    await expect(page.getByText("600,000,000").first()).toBeVisible();
    await expect(page.getByText("1,000,000,000")).toHaveCount(0);
  });

  test("Phase A 단일 + 대주주등이 영리법인(§4의2①·③) → 증여세 미적용 · 이관 없음 · 산출 이익 보존", async ({ page }) => {
    // 7-15 — 단일 모드는 수증자(대주주등)가 한 묶음이라 계산 단위 토글이 맞다. 매트릭스는 행 토글(7-13)이다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "merger");
    await page.getByTestId("mrg-over-price").fill("30000");
    await page.getByPlaceholder("합병 전 주식수").fill("100000");
    await page.getByPlaceholder("교부받은 주식수").fill("100000");
    await page.getByLabel("합병 후 1주당 평가가액", { exact: true }).fill("36666");
    await page.getByPlaceholder("대주주등 주식수").fill("70000");
    await page.getByRole("switch", { name: /수증자가 영리법인/ }).click();
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("영리법인 수증자");
    await expect(page.getByTestId("deemed-to-wizard")).toHaveCount(0);
    await expect(page.getByText("제외 전 산출 이익").first()).toBeVisible();
    // 매트릭스 모드의 공통 토글 비노출은 단위 anchor SFW-1이 모드 조합별로 고정한다
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
    await page.getByLabel("합병 후 1주당 평가가액", { exact: true }).fill("20000");
    await page.getByPlaceholder("대주주등 주식수").fill("70000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("350,000,000");
  });
});
