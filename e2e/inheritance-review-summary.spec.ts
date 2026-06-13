/**
 * E2E: 상속세 계산 직전 입력 요약 검토 카드(④)
 *
 * 검증:
 *   RVW-1: Step 4 하단 요약 카드 노출 + 건수(재산 1건·상속인 1명) + 일괄공제 칩 + 신고 상태.
 *   RVW-2: 배우자 등록 시 배우자공제 칩 / 연부연납 토글 ON 시 납부 방법 칩 반영.
 *
 * 설계: read-only 파생 카드(금액 합계는 사이드바 위임). dual-truth 없음.
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addHeir,
  addLandAsset,
  nextSteps,
} from "./_helpers/tax-flow";

async function setupAndGotoStep4(page: Page, opts: { spouse?: boolean } = {}) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child");
  if (opts.spouse) await addHeir(page, "heir", "spouse");
  await nextSteps(page, 1); // → 상속재산
  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
  await nextSteps(page, 3); // → 공제·세액공제 (마지막 단계)
}

test.describe("상속세 계산 직전 입력 요약 카드", () => {
  test("RVW-1: 요약 카드 + 건수 + 일괄공제 칩 + 신고 상태", async ({ page }) => {
    test.setTimeout(90_000);
    await setupAndGotoStep4(page);

    const card = page.getByTestId("inheritance-review-summary");
    await expect(card).toBeVisible();

    // 건수 — 재산 1건, 상속인 1명
    await expect(card.getByText("상속재산")).toBeVisible();
    await expect(card.getByText("1건")).toBeVisible();
    await expect(card.getByText("1명")).toBeVisible();

    // 일괄공제는 항상 적용 예정
    await expect(card.getByText(/일괄공제/)).toBeVisible();
    // 기본 정기신고
    await expect(card.getByText("정기신고")).toBeVisible();
  });

  test("RVW-2: 배우자공제 칩 + 연부연납 납부 방법 칩", async ({ page }) => {
    test.setTimeout(90_000);
    await setupAndGotoStep4(page, { spouse: true });

    const card = page.getByTestId("inheritance-review-summary");
    await expect(card).toBeVisible();
    // 배우자 등록 → 배우자공제 적용 예정
    await expect(card.getByText("배우자공제")).toBeVisible();

    // 그룹 D(납부 방법) 헤더 클릭 → 펼침
    await page.getByRole("button", { name: /납부 방법/ }).click();
    // 연부연납 토글 ON → 납부 방법 칩 반영
    await page.getByText("연부연납 신청 (상증법 §71)").click();
    await expect(card.getByText("연부연납")).toBeVisible();
  });
});
