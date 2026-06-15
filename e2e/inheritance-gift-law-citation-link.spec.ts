/**
 * E2E: 상속·증여 계산 마법사 법조문 링크 배지(LawArticleModal) → 조문 HTML 팝업
 *
 * 검증 대상: Phase 3 후속 선별 전수에서 추가한 계산 마법사 내 LawArticleModal 배지.
 *   (기존 e2e/law-article-popup.spec.ts는 /law 리서치 페이지의 ArticleModal — 별개 컴포넌트)
 *
 * 진입점: 간주상속재산(DeemedCategorySection) — 자산 편집 모달 안 §8·§9·§10·상증령§19① 배지.
 *   deemed-category-toggle-visibility.spec.ts의 도달 패턴 차용.
 *
 * LAW-LINK-1: 본법 §8 보험금 배지 클릭 → 조문 팝업 헤더 "상속세및증여세법 제8조"
 * LAW-LINK-2: 약칭 상증령 §19① 배지 클릭 → parseLawRef 정식명 "상속세및증여세법 시행령 제19조"
 * LAW-LINK-3: ESC로 조문 팝업만 닫힘 (자산 편집 모달은 유지 — 중첩 dialog 독립)
 *
 * 비고: 조문 본문은 법제처 API(KOREAN_LAW_OC) 의존 → 팝업 헤더(법령명·조문번호, props 기반)만 단정.
 *       본문 텍스트는 비단정(law-article-popup.spec.ts와 동일 철학).
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 간주분류 칩 선택 → base 종류 클릭 → 자산 편집 모달 자동 오픈 (DeemedCategorySection 노출) */
async function addDeemedInsuranceAsset(page: Page) {
  await page
    .getByRole("button", { name: /재산 추가|상속재산 추가/ })
    .first()
    .click();
  await page.getByRole("button", { name: /보험금/ }).click(); // 간주분류 칩
  await page.getByText("예금·펀드·채권·공제금", { exact: true }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  // 간주분류 칩(보험금 §8) 클릭 → EstateChipInlineExpand가 DeemedCategorySection 인라인 펼침
  // (§8·§9·§10·상증령§19① LawArticleModal 배지는 이 펼침 패널 안에 렌더)
  await page.getByRole("button", { name: "보험금 §8" }).click();
  await expect(
    page.locator('[data-testid^="estate-inline-expand-classification-"]'),
  ).toBeVisible();
}

test.describe("계산 마법사 법조문 링크 → 조문 팝업", () => {
  test("LAW-LINK-1: 간주상속재산 §8 보험금 배지 → 본법 제8조 팝업 헤더", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addDeemedInsuranceAsset(page);

    // DeemedCategorySection 헤더 아래 §8 보험금 배지 (자산 편집 모달 안)
    await page.getByRole("button", { name: /§8 보험금/ }).click();
    // 조문 팝업 헤더 — props 기반(parseLawRef 결과, 법제처 API 무관 즉시 렌더)
    await expect(
      page.getByText("상속세및증여세법 제8조"),
    ).toBeVisible();
  });

  test("LAW-LINK-2: 약칭 상증령 §19① 배지 → 정식명 시행령 제19조 헤더", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addDeemedInsuranceAsset(page);

    await page.getByRole("button", { name: /상증령 §19① 금융재산/ }).click();
    // parseLawRef: "상증령" alias → "상속세및증여세법 시행령", §19① → 제19조
    await expect(
      page.getByText("상속세및증여세법 시행령 제19조"),
    ).toBeVisible();
  });

  test("LAW-LINK-3: ESC로 조문 팝업만 닫힘 (자산 편집 모달 유지)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addDeemedInsuranceAsset(page);

    await page.getByRole("button", { name: /§10 퇴직금/ }).click();
    await expect(page.getByText("상속세및증여세법 제10조")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("상속세및증여세법 제10조")).toBeHidden();
    // 조문 팝업만 닫히고 자산 편집 모달은 유지 (중첩 dialog 독립)
    await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  });
});
