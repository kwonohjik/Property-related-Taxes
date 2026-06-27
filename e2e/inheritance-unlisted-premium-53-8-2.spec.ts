/**
 * E2E: 비상장주식 V2 §53⑧2호 전부매각 보조입력 UI 통합
 *
 * 게이트 결과 분기(배제/기간초과/전부매각아님)는 anchor(stock-premium-53-8-2-integration)가 보증.
 * 본 spec은 UI 배선 검증: 최대주주 ON → 배제사유 select → 2호 선택 시 보조입력 펼침,
 * 다른 사유 전환 시 숨김, transferType 기본값이 계산 세목(상속)에서 seed됨.
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_gift_modal_chip_switch_selectors]]
 * 진입 패턴: inheritance-unlisted-treasury-stock.spec.ts 재사용
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoStep0AndFillDeathDate(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openV2FormalCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

/** 최대주주 ON → 회사규모·배제사유 펼침 */
async function enableMaxShareholder(page: Page) {
  await page.getByText("최대주주 등 해당", { exact: true }).click();
}

test.describe("비상장 V2 §53⑧2호 전부매각 보조입력", () => {
  test("U-1: 배제사유 2호 선택 → 전부매각 보조입력 펼침", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);
    await enableMaxShareholder(page);

    // 배제사유 select 노출 + 2호 선택
    const select = page.getByTestId("unlisted-premium-exclusion-select");
    await expect(select).toBeVisible();
    await select.selectOption("all_sold_within_6m");

    // 2호 보조입력 펼침 (전부매각·§49①1호·매매계약일·구분)
    await expect(page.getByText("§53⑧2호 전부매각 요건")).toBeVisible();
    await expect(page.getByTestId("unlisted-premium-53-8-2-all-sold")).toBeVisible();
    await expect(page.getByTestId("unlisted-premium-53-8-2-art49")).toBeVisible();
    await expect(page.getByTestId("unlisted-premium-53-8-2-sale-date")).toBeVisible();
    await expect(page.getByTestId("unlisted-premium-53-8-2-transfer-type")).toBeVisible();
  });

  test("U-2: 2호 → 다른 사유 전환 시 보조입력 숨김", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);
    await enableMaxShareholder(page);

    const select = page.getByTestId("unlisted-premium-exclusion-select");
    await select.selectOption("all_sold_within_6m");
    await expect(page.getByTestId("unlisted-premium-53-8-2-all-sold")).toBeVisible();

    // 1호(계속결손)로 전환 → 2호 보조입력 숨김
    await select.selectOption("continuous_loss_3y");
    await expect(page.getByTestId("unlisted-premium-53-8-2-all-sold")).toHaveCount(0);
  });

  test("U-3: 상속 계산 — transferType 기본값이 '상속'으로 seed", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);
    await enableMaxShareholder(page);

    await page.getByTestId("unlisted-premium-exclusion-select").selectOption("all_sold_within_6m");
    // 전부매각 체크 → onChange로 객체 생성, transferType seed=상속(inheritance-tax)
    await page.getByTestId("unlisted-premium-53-8-2-all-sold").click();

    // 구분 라디오에서 '상속'이 선택 상태 (RadioCardGroup aria-checked)
    const transferType = page.getByTestId("unlisted-premium-53-8-2-transfer-type");
    await expect(transferType.getByText("상속", { exact: true })).toBeVisible();
    await expect(transferType.locator('input[value="inheritance"]')).toBeChecked();
  });
});
