/**
 * E2E: 상속세 Step 4(공제·세액공제) 접이식 그룹화(②)
 *
 * 검증:
 *   G4G-1: 4개 그룹 헤더 노출 + 기본 펼침(필드 즉시 표시 — 회귀 안전성) +
 *          그룹 헤더 클릭으로 접기/펼치기 동작.
 *   G4G-2: 그룹 내 입력 시 헤더에 "입력됨" 배지 노출.
 *
 * 설계: 기본 펼침이라 기존 Step4 직접입력 스펙(외국납부·연부연납·물납 등)은 영향 없음.
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
  test("G4G-1: 4개 그룹 헤더 + 기본 펼침 + 접기/펼치기", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    // 4개 그룹 헤더 노출
    await expect(page.getByTestId("step4-group-deduction")).toBeVisible();
    await expect(page.getByTestId("step4-group-adjust")).toBeVisible();
    await expect(page.getByTestId("step4-group-credit")).toBeVisible();
    await expect(page.getByTestId("step4-group-payment")).toBeVisible();

    // 기본 펼침 — 납부 방법 그룹의 연부연납 토글이 바로 보여야 함(회귀 안전성)
    await expect(page.getByText("연부연납 신청 (상증법 §71)")).toBeVisible();

    // 그룹 헤더 클릭 → 내부 필드 숨김(접힘)
    await page.getByRole("button", { name: /납부 방법/ }).click();
    await expect(page.getByText("연부연납 신청 (상증법 §71)")).toBeHidden();

    // 다시 클릭 → 펼침
    await page.getByRole("button", { name: /납부 방법/ }).click();
    await expect(page.getByText("연부연납 신청 (상증법 §71)")).toBeVisible();
  });

  test("G4G-2: 입력 시 그룹 헤더에 '입력됨' 배지", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    const paymentGroup = page.getByTestId("step4-group-payment");
    // 입력 전 — 배지 없음
    await expect(paymentGroup.getByText("입력됨")).toHaveCount(0);

    // 연부연납 토글 ON → 납부 방법 그룹에 데이터 발생
    await page.getByText("연부연납 신청 (상증법 §71)").click();

    // 헤더에 "입력됨" 배지 노출
    await expect(paymentGroup.getByText("입력됨")).toBeVisible();
  });
});
