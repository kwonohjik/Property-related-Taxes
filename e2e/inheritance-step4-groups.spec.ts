/**
 * E2E: 상속세 Step 4(공제·세액공제) 접이식 그룹화(②)
 *
 * 검증:
 *   G4G-1: 4개 그룹 헤더 노출 + 디폴트 접힘(내부 필드 미표시) +
 *          그룹 헤더 클릭으로 펼치기/접기 동작.
 *   G4G-2: 그룹 내 입력 시 헤더에 "입력됨" 배지 노출.
 *
 * 설계 변경(2026-06-13): 디폴트 접힘. Step4 진입 시 체크리스트 패널 + 접힌 그룹 4개 + 요약만 노출.
 *   그룹 내 필드에 접근하려면 그룹 헤더 클릭 또는 체크리스트 칩 클릭으로 펼침 필요.
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addHeir,
  addLandAsset,
  nextSteps,
} from "./_helpers/tax-flow";

async function gotoStep4(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child");
  await nextSteps(page, 1); // → 상속재산
  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
  await nextSteps(page, 3); // → 비과세 → 사전증여 → 공제·세액공제
}

test.describe("상속세 Step4 접이식 그룹", () => {
  test("G4G-1: 4개 그룹 헤더 + 디폴트 접힘 + 헤더 클릭 펼치기/접기", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    // 4개 그룹 헤더 노출
    await expect(page.getByTestId("step4-group-deduction")).toBeVisible();
    await expect(page.getByTestId("step4-group-adjust")).toBeVisible();
    await expect(page.getByTestId("step4-group-credit")).toBeVisible();
    await expect(page.getByTestId("step4-group-payment")).toBeVisible();

    // 디폴트 접힘 — 납부 방법 그룹의 연부연납 토글이 즉시 보이지 않아야 함
    await expect(page.getByText("연부연납 신청 (상증법 §71)")).toBeHidden();

    // 그룹 D 헤더 클릭 → 펼침
    await page.getByRole("button", { name: /납부 방법/ }).click();
    await expect(page.getByText("연부연납 신청 (상증법 §71)")).toBeVisible();

    // 다시 클릭 → 접힘
    await page.getByRole("button", { name: /납부 방법/ }).click();
    await expect(page.getByText("연부연납 신청 (상증법 §71)")).toBeHidden();
  });

  test("G4G-2: 입력 시 그룹 헤더에 '입력됨' 배지", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    const paymentGroup = page.getByTestId("step4-group-payment");
    // 입력 전 — 배지 없음
    await expect(paymentGroup.getByText("입력됨")).toHaveCount(0);

    // 그룹 D 헤더 클릭으로 펼침
    await page.getByRole("button", { name: /납부 방법/ }).click();

    // 연부연납 토글 ON → 납부 방법 그룹에 데이터 발생
    // ToggleCard는 BaseUI Switch(aria-label=title) — 제목 텍스트 클릭은 토글되지 않아 switch role로 켠다
    await page.getByRole("switch", { name: /연부연납 신청/ }).click();

    // 헤더에 "입력됨" 배지 노출
    await expect(paymentGroup.getByText("입력됨")).toBeVisible();
  });
});
