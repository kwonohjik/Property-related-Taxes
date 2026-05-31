/**
 * E2E: 상속공제 정밀산식 UI 통합 (2026-05-31)
 *
 * 계획: docs/00-pm/inheritance-spouse-deduction-consultation-split.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * 통합 4,600m(교재 종합사례)은 엔진 anchor CI-8로 검증. E2E는 정밀산식 I-1 UI 통합:
 *   배우자+자녀1, 토지 30억, Step4 미입력 → 배우자 법정상속분(정밀) 3,000M×1.5/2.5 = 1,800M
 *   → 상속공제 = 일괄 500M + 배우자 1,800M = 2,300,000,000.
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoStep1SpouseChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
  // 배우자 추가 (추가 시 패널 닫힘)
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("배우자", { exact: true }).click();
  // 자녀 추가 (패널 재오픈)
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

test("정밀산식 I-1 — 배우자+자녀1 토지 30억 → 상속공제 2,300,000,000", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoStep1SpouseChild(page);

  // 토지 30억 (면적 3,000㎡ × 공시지가 1,000,000)
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("3000");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");

  // Step2(비과세) → Step3(사전증여) → Step4(공제, 모두 미입력 — 자동)
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();

  // 계산
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText("상속세 결정세액")).toBeVisible({ timeout: 15_000 });

  // ⑤ 상속공제 = 일괄 500M + 배우자 정밀 1,800M = 2,300,000,000 (집계표)
  await expect(page.getByText("2,300,000,000").first()).toBeVisible({
    timeout: 5_000,
  });
});

test("일괄공제 토글 제거 — 공제 단계에 '일괄공제 선택' 토글 없음 (§21① 항상 자동)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoStep1SpouseChild(page);

  // 단계 진행용 최소 재산 (토지 10억)
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("1000");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");

  // Step2 → Step3 → Step4(공제·세액공제 통합)
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();

  // 공제 단계 도달 (계산하기 버튼 노출) → '일괄공제 선택' 토글이 더 이상 없어야 함
  await expect(page.getByRole("button", { name: /계산하기/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/일괄공제 선택/)).toHaveCount(0);
});

test("§21② 배우자 단독상속 → 일괄공제 배제 안내 노출", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
  // 배우자만 상속인 (자녀 미추가 → 배우자 단독상속)
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("배우자", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();

  // 토지 20억
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("2000");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");

  // Step2 → Step3 → Step4 → 계산
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText("상속세 결정세액")).toBeVisible({ timeout: 15_000 });

  // 상속공제 상세 내역 펼침 → §21② 배제 안내 + 일괄공제 Row 없음
  await page.getByText("상속공제 상세 내역").click();
  await expect(page.getByText(/배우자 단독상속 — 일괄공제 배제/)).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText("일괄공제 (§21)")).toHaveCount(0);
});
