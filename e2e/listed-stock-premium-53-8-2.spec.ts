/**
 * E2E: 상장주식 §53⑧2호 전부매각 할증배제 게이트
 *
 * 시나리오 (UI Design §5 / 케이스 매트릭스):
 *   케이스1 — 상속·기간내·전부매각·정상거래 → 할증 배제(⑩ = ⑨ × 100%)
 *   케이스3 — 매매계약일 기간초과 → 게이트 실패 → 할증 적용(⑩ = ⑨ × 120%)
 *
 * 평가기준일 D = 2022-07-06 (상속). 허용기간 ±6월: 2022-01-06 ~ 2023-01-06.
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_gift_modal_chip_switch_selectors]]
 * Design: docs/02-design/features/stock-premium-exclusion-53-8-2-correction.ui.design.md §5
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify, addHeir, closeHeirEditModal, closeStockModal } from "./_helpers/tax-flow";

async function gotoStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2022", month: "7", day: "6" });
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openListedStockCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("상장주식", { exact: true }).click();
}

/** 모달 안: 평균가·주식수 + §63③ 최대주주(대기업) + 배제사유 2호 선택 */
async function fillBaseAndMajorShareholder(page: Page, avg: number, shares: number) {
  // 주식수·평균가는 라벨 기반(numeric 인덱스는 순서 의존 — 종목섹션이 먼저라 어긋남)
  await page.getByPlaceholder("주식 수 입력").fill(String(shares));
  await page.getByPlaceholder("주당 순손익 입력 (원)").fill(String(avg));
  // §63③ 최대주주 할증 토글 ON (ToggleCard = role=switch)
  await page.getByRole("switch", { name: /§63③ 최대주주/ }).click();
  // 기업 규모: 대기업 (할증 20% 적용 가능)
  await page.getByText("대기업", { exact: true }).click();
  // 배제 사유 select → §53⑧2호(all_sold_within_6m)
  await page.locator("select").last().selectOption("all_sold_within_6m");
}

/** 2호 보조입력: 전부매각·§49①1호·매매계약일·상속 */
async function fillSection53_8_2(
  page: Page,
  sale: { year: string; month: string; day: string },
) {
  await page.getByTestId("premium-53-8-2-all-sold").click();
  await page.getByTestId("premium-53-8-2-art49").click();
  await fillDateAndVerify(page, sale, { scope: page.getByTestId("premium-53-8-2-sale-date") });
  // 구분: 상속 (RadioCardGroup) — 기본값이지만 명시 클릭
  await page
    .getByTestId("premium-53-8-2-transfer-type")
    .getByText("상속", { exact: true })
    .click();
}

async function gotoResult(page: Page) {
  for (let i = 0; i < 6; i++) {
    const nextBtn = page.getByRole("button", { name: /^다음/ });
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(200);
    }
  }
  const calcBtn = page.getByRole("button", { name: /계산하기/ });
  if (await calcBtn.isVisible().catch(() => false)) {
    await calcBtn.click();
  }
  await expect(page.getByTestId("ls-besshi-result-section")).toBeVisible({ timeout: 10_000 });
}

test.describe("LS-§53⑧2호: 전부매각 할증배제 게이트", () => {
  test("케이스1 — 상속·기간내(2022-08-01)·전부매각·정상거래 → 할증 배제(⑨ × 100%)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);
    await openListedStockCard(page);
    await fillBaseAndMajorShareholder(page, 8452, 100);
    await fillSection53_8_2(page, { year: "2022", month: "8", day: "1" });
    await closeStockModal(page);
    await gotoResult(page);

    // 배제 성공 → ⑩ = ⑨ = 8,452 (할증 0) + §53⑧2호 배제 사유 라벨 노출
    await expect(page.getByTestId("ls-besshi-p1-premium-exclusion")).toContainText(/§53.*2호/);
    await expect(page.getByTestId("ls-besshi-p1-⑩")).toContainText("8,452");
  });

  test("케이스3 — 기간초과(2023-06-01) → 게이트 실패 → 할증 적용(⑨ × 120%)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);
    await openListedStockCard(page);
    await fillBaseAndMajorShareholder(page, 8452, 100);
    await fillSection53_8_2(page, { year: "2023", month: "6", day: "1" });
    await closeStockModal(page);
    await gotoResult(page);

    // 게이트 실패 → 할증 20% (⑩ = floor(8,452 × 1.2) = 10,142) + 배제 라벨 미노출
    await expect(page.getByTestId("ls-besshi-p1-⑩")).toContainText("10,142");
    await expect(page.getByTestId("ls-besshi-p1-premium-exclusion")).toHaveCount(0);
  });
});
