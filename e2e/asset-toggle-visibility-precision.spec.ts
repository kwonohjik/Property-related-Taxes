/**
 * E2E: 자산 카드 토글 자동 노출 정밀화 (2026-06-05)
 *
 * 계획서: docs/00-pm/asset-toggle-visibility-precision.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 변경:
 *   §3-1 chip-config 시맨틱 정정 — resolveChips 칩 행은 visibility==="default"만 노출
 *     (hidden_expandable은 칩 행 제외 → 추가옵션 패널로).
 *   §3-2 MATRIX — (a) 부동산 3종 금융공제 hidden_permanent / (c) 기타재산 영농·가업 hidden_expandable.
 *
 * 법령: 상증령 §19①(금융재산=금융회사 취급 한정 → 부동산 미열거) · §16⑤·§15⑤.
 *
 * 시나리오 (칩 행 testid `estate-chip-{key}-{itemId}`):
 *   ATV-1: 아파트 → 금융재산공제(section22) 칩 미노출 (a)
 *   ATV-2: 기타재산 → 영농(farming)·가업(family-business) 칩 미노출 (c) + §3-1
 *   ATV-3: 토지 → 영농·가업 칩 노출(default 회귀) + 금융공제 칩 미노출(a)
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

/** Step0: 상속개시일 + 자녀 1명 → Step1 이동 (상속인 편집 모달 닫고 진행) */
async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 자산 추가 → 편집 모달 자동 오픈(E-1). 칩은 모달 안에 위치 (모달 유지). */
async function addAssetByType(page: Page, typeLabel: string | RegExp) {
  await page
    .getByRole("button", { name: /재산 추가|상속재산 추가/ })
    .first()
    .click();
  if (typeof typeLabel === "string") {
    await page.getByText(typeLabel, { exact: true }).click();
  } else {
    await page.getByRole("button", { name: typeLabel }).first().click();
  }
  // estate-card-shell은 테이블 전환으로 폐기 → 편집 모달 자동 오픈으로 대체
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
}

test.describe("자산 토글 자동 노출 정밀화", () => {
  test("ATV-1: 아파트 → 금융재산공제(section22) 칩 미노출 (hidden_permanent)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addAssetByType(page, /주택/);

    // §19① 부동산 금융재산 불가 → 칩 행에 금융공제 칩 없음
    await expect(
      page.locator('[data-testid^="estate-chip-section22-"]'),
    ).toHaveCount(0);
    // 가업 §15⑤도 hidden_expandable → §3-1로 칩 행 제외
    await expect(
      page.locator('[data-testid^="estate-chip-family-business-"]'),
    ).toHaveCount(0);
  });

  test("ATV-2: 기타재산 → 영농·가업 칩 미노출 (hidden_expandable → 추가옵션)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addAssetByType(page, "기타 재산");

    // (c) + §3-1: 칩 행에서 영농·가업 제외 (현금성 노이즈 제거)
    await expect(
      page.locator('[data-testid^="estate-chip-farming-"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="estate-chip-family-business-"]'),
    ).toHaveCount(0);
    // 금융공제도 hidden_expandable → 칩 행 제외 (D-2 부수 효과)
    await expect(
      page.locator('[data-testid^="estate-chip-section22-"]'),
    ).toHaveCount(0);
  });

  test("ATV-3: 토지 → 영농·가업 칩 노출(default 회귀) + 금융공제 칩 미노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addAssetByType(page, /토지/);

    // default 유지 — 영농·가업 칩 노출 (과도한 숨김 아님을 회귀로 검증)
    await expect(
      page.locator('[data-testid^="estate-chip-farming-"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid^="estate-chip-family-business-"]').first(),
    ).toBeVisible();
    // (a) 토지 금융공제 칩 미노출
    await expect(
      page.locator('[data-testid^="estate-chip-section22-"]'),
    ).toHaveCount(0);
  });
});
