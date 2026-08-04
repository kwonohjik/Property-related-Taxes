/**
 * E2E: 상속·증여 보충평가(§61 경로 B) — 건물 연면적·부수토지 면적 저장 + 계산기 prefill
 *
 * 종전에는 이 화면에서 계산기를 열면 연면적·토지면적이 비어 매번 손입력해야 했다.
 * 상가·일반건물 화면은 prefill을 넘기므로 같은 계산기가 화면에 따라 다르게 동작했다.
 *
 * 두 가지를 검증한다:
 *   T1 전체 건물 연면적이 **경로 B 공통 입력**으로 노출된다(종전에는 공실 토글 안에만 있어
 *      월 임대료가 없으면 입력 경로 자체가 없었다) → 계산기에 연면적이 시드된다.
 *   T2 부수토지 대지면적이 **store에 저장**된다(종전에는 StandardPriceInput 내부 state라
 *      카드를 닫으면 사라졌다) → 계산기에 토지면적이 시드된다.
 *
 * 정책: feedback_browser_verify_with_playwright
 * 공유 컴포넌트(EstateBodySupplementaryValuation)는 상속·증여 동일 — 상속 플로우로 검증.
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

function fieldInput(page: Page, label: string) {
  return page
    .locator(`xpath=//*[normalize-space(text())="${label}"]/ancestor::*[self::div][1]//input`)
    .first();
}

async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openCommercialBuildingSupplementary(page: Page) {
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByRole("button", { name: /상업용 건물/ }).first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  // 경로 B(건물 + 부수토지 분리) — 연면적·부수토지 입력이 여기서만 의미가 있다
  await page.locator('[data-testid^="cb-route-separate-"]').click();
}

test.describe("보충평가 §61 경로 B — 면적 저장 + 계산기 prefill", () => {
  test("T1: 전체 건물 연면적이 공실 토글 없이 입력 가능 + 계산기에 시드", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await openCommercialBuildingSupplementary(page);

    // 월 임대료 없이도(= 공실 토글 미노출 상태) 연면적을 입력할 수 있어야 한다
    await expect(page.getByText("일부만 임대 중 (미임대 공실 있음)", { exact: true })).toHaveCount(0);
    await fieldInput(page, "전체 건물 연면적 (㎡)").fill("720");

    await page.getByRole("button", { name: "건물 기준시가 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "건물 기준시가 계산" }).last();
    await expect(modal.getByPlaceholder("건물 연면적")).toHaveValue("720");
  });

  test("T2: 부수토지 대지면적이 저장되어 계산기에 시드된다", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await openCommercialBuildingSupplementary(page);

    await fieldInput(page, "전체 건물 연면적 (㎡)").fill("720");
    // 부수토지 섹션의 면적 칸 — 단가×면적 → 총액 자동계산
    const landSection = page.locator('div:has-text("부수토지 개별공시지가 (§61①1호)")').last();
    await landSection.locator('input').filter({ hasNot: page.locator("[disabled]") }).nth(1).fill("330");

    await page.getByRole("button", { name: "건물 기준시가 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "건물 기준시가 계산" }).last();
    await expect(modal.getByPlaceholder("부속토지 면적")).toHaveValue("330");
  });
});
