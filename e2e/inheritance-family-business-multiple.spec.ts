/**
 * E2E: 가업상속공제 복수가업 순차공제 (상증령 §15④ · 상증칙 §5 — PR-4)
 *
 * 검증: 공제 단계 → 가업상속공제 토글 ON → 영위연수 입력 →
 *       복수가업 토글 ON → 추가 가업 입력 → 순차공제 미리보기(엔진 단일 소스) 노출.
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — 미리보기는 클라이언트 즉시 계산이므로
 *       결과 단계까지 가지 않고 입력 단계에서 UI↔엔진 배선을 검증.
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

/** Step0(자녀 1명) → Step1(토지 3억) → Step4(공제) 도달 */
async function gotoDeductionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");

  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // 토지 3억 (공시지가 1,000,000 × 300㎡)
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await page.getByPlaceholder("면적 입력").fill("300");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");
  // 토지 편집 모달 닫기 (다음이 backdrop에 막히지 않게)
  const assetDialog = page.getByRole("dialog");
  await assetDialog.getByRole("button", { name: "닫기" }).click();
  await expect(assetDialog).toBeHidden();

  await page.getByRole("button", { name: /^다음/ }).click(); // → Step2
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step3
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step4 공제
  // Step4 공제 체크리스트(progressive disclosure) — 가업상속공제 입력 섹션 펼치기
  await page.getByRole("button", { name: /가업상속공제 §18의2/ }).click();
}

test.describe("복수가업 순차공제 입력·미리보기", () => {
  test("가업 토글 ON → 영위 30년 → 복수가업 토글 ON → 순차공제 미리보기(총한도 600억) 노출", async ({
    page,
  }) => {
    await gotoDeductionStep(page);

    // 가업상속공제 요건 입력 토글 ON
    await page.getByRole("switch", { name: /가업상속공제 요건 입력/ }).click();

    // 가업 영위 연수 30년
    await page.getByPlaceholder("영위 연수 입력 (년)").fill("30");

    // 복수가업 순차공제 토글 ON
    await page.getByRole("switch", { name: /복수가업 순차공제/ }).click();

    // 순차공제 미리보기 노출 (엔진 단일 소스) — 총한도 = 가장 긴(30년) = 600억
    const preview = page.getByText(/순차공제 미리보기/);
    await expect(preview).toBeVisible();
    await expect(page.getByText("60,000,000,000")).toBeVisible(); // 총한도 600억

    // + 추가 가업 버튼으로 항목 1개 더 추가 가능
    await page.getByRole("button", { name: /추가 가업/ }).click();
    await expect(page.getByText(/복수가업 공제 합계/)).toBeVisible();
  });

  test("복수가업 토글 OFF → 추가 가업 입력 영역 숨김", async ({ page }) => {
    await gotoDeductionStep(page);
    await page.getByRole("switch", { name: /가업상속공제 요건 입력/ }).click();
    await page.getByPlaceholder("영위 연수 입력 (년)").fill("25");

    // 토글 OFF 기본 — 미리보기 없음
    await expect(page.getByText(/순차공제 미리보기/)).toHaveCount(0);
  });
});
