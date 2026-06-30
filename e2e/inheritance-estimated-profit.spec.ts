/**
 * E2E: 비상장주식 V2 §56② 추정이익 갈음 옵션 (PR-G)
 *
 * 시나리오:
 *   T-EP-1 (상속): 토글 ON → 사유(기본) + 기관 2개(1,000·1,400) + 절차 3체크 → 미리보기 순손익가치 12,000 갈음
 *   T-EP-2 (상속): 기본 OFF — 미리보기 미표시 + 토글 존재
 *   T-EP-3 (증여): gift 경로 동일 토글 ON 동작 (공용 StockValuationForm)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md
 * UI Design: §11. 진입 헬퍼는 inheritance-unlisted-section22-toggle.spec.ts 패턴 재사용.
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoInheritanceV2Formal(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

async function gotoGiftV2Formal(page: Page) {
  await page.goto("/calc/gift-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  // donorRelation은 donor select에서 자동 도출 (G-M3) — 별도 RadioCardGroup 없음
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();
  // 증여 주식평가 섹션 (StockValuationForm 공용) — 별도 "주식·지분 추가"
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

async function turnOnEstimatedProfitAndFill(page: Page) {
  // 토글 ON — ToggleCard는 Switch 기반(BaseUI). title 텍스트 클릭은 Switch를 토글하지 못하므로
  // getByRole("switch")로 직접 토글 (통과 스펙 unlisted-stock-estimated-profit-agencies 패턴).
  await page.getByRole("switch", { name: /추정이익 평균가액 갈음/ }).click();
  const form = page.getByTestId("estimated-profit-form");
  await expect(form).toBeVisible();

  // 기관 2개 추정이익 — 추정이익 입력란은 CurrencyInput(inputmode=numeric).
  // 기관 행에는 유형 radio·기관명 text input도 있으므로 numeric 입력만 선택.
  const agencyInputs = page
    .getByTestId("estimated-profit-agencies")
    .locator('input[inputmode="numeric"]');
  await agencyInputs.nth(0).fill("1000");
  await agencyInputs.nth(1).fill("1400");

  // 절차 3요건 체크 (ToggleCard variant="chip" — Switch role로 토글)
  await page
    .getByRole("switch", { name: "신고기한 내 추정이익 평균가액 신고 (§56② 2호)" })
    .click();
  await page
    .getByRole("switch", { name: "산정기준일·평가서작성일이 신고기한 이내 (§56② 3호)" })
    .click();
  await page
    .getByRole("switch", { name: "산정기준일·상속개시(증여)일 동일 연도 (§56② 4호)" })
    .click();
}

test.describe("비상장주식 V2 §56② 추정이익 갈음", () => {
  test("T-EP-2: 기본 OFF — 미리보기 미표시 + 토글 존재", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoInheritanceV2Formal(page);
    await expect(
      page.getByText("§56② 추정이익 평균가액 갈음 옵션", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("estimated-profit-preview")).toHaveCount(0);
  });

  test("T-EP-1: 토글 ON + 2기관 + 절차 3체크 → 순손익가치 12,000 갈음", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoInheritanceV2Formal(page);
    await turnOnEstimatedProfitAndFill(page);

    const preview = page.getByTestId("estimated-profit-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("12,000"); // floor(1200/0.10)
    await expect(preview).toContainText("1,200"); // 평균가액
  });

  test("T-EP-3: 증여 경로 동일 토글 ON 동작", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoGiftV2Formal(page);
    await turnOnEstimatedProfitAndFill(page);

    const preview = page.getByTestId("estimated-profit-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("12,000");
  });
});
