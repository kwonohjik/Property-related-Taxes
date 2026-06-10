/**
 * E2E: 자산 카드 헤더 칩 UX 3건 수정 (2026-05-29)
 *
 * 계획서: docs/01-plan/estate-chip-ux-fixes.plan.md
 *
 * 시나리오:
 *   항목1 — §22 칩 라벨 "금융재산 공제" + 체크는 굵은 아이콘(✓ 텍스트 미포함) + aria-pressed
 *   항목2 — 협의분할 칩(법정분할) 클릭 → 인라인 토글 자동 ON + 첫 상속인 전액 배분
 *   항목3 — financial(예금·펀드·채권·공제금) 자산에 가업 §15⑤ 칩 미노출
 *
 * 정책:
 *   [[feedback_browser_verify_with_playwright]] — 수동 안내 금지, spec 통과로 브라우저 확인 충족
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal, addLandAsset } from "./_helpers/tax-flow";

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

/** financial(예금·펀드·채권·공제금) 카드 추가 */
async function addFinancialCard(page: Page) {
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByText("예금·펀드·채권·공제금", { exact: true }).click();
}

/**
 * 토지 카드 추가 + 면적·공시지가(3억) 입력 — 편집 모달 유지(keepModalOpen).
 * 공유 addLandAsset의 fillAndVerify로 값 커밋을 보장(보충평가 평가액이 협의분할 칩 클릭 전
 * 확정되어야 첫 상속인 전액 자동배분이 정확). 모달은 닫지 않아 칩 조작을 이어간다.
 */
async function addLandAssetWithValue(page: Page) {
  await addLandAsset(page, { area: "300", unitPrice: "1000000", keepModalOpen: true });
}

test.describe("항목1: §22 칩 '금융재산 공제' 라벨 + 굵은 체크", () => {
  test("financial 카드 §22 칩 — 라벨 '금융재산 공제', ✓ 텍스트 미포함, aria-pressed=true", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addFinancialCard(page);

    const section22Chip = page
      .locator('[data-testid^="estate-chip-section22-"]')
      .first();
    await expect(section22Chip).toBeVisible();
    await expect(section22Chip).toContainText("금융재산 공제");
    await expect(section22Chip).not.toContainText("✓");
    await expect(section22Chip).not.toContainText("§22"); // 조문번호는 라벨에서 제거
    await expect(section22Chip).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("항목2: 협의분할 칩 클릭 → 토글 자동 ON", () => {
  test("법정분할 칩 클릭 → 인라인 패널 펼침 + 협의분할 입력(ON) + 첫 상속인 전액", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addLandAssetWithValue(page);

    const heirChip = page
      .locator('[data-testid^="estate-chip-heir-allocation-"]')
      .first();
    await expect(heirChip).toBeVisible();
    // 클릭 전: 기본 법정분할
    await expect(heirChip).toContainText("법정분할");

    await heirChip.click();

    // 인라인 패널 펼침
    await expect(
      page.locator('[data-testid^="estate-inline-expand-heir-allocation-"]').first(),
    ).toBeVisible();

    // 토글 자동 ON 증명: HeirAllocationInput(children)은 ON일 때만 렌더 (2026-06-09 통합 행 — 내부 헤더 제거, testid로 검증)
    await expect(page.getByTestId("heir-allocation-input")).toBeVisible();

    // 칩 라벨이 "협의분할"(mark on)로 갱신
    await expect(heirChip).toContainText("협의분할");

    // 첫 상속인에게 평가액 전액(3억) 자동 배분 — 분배 금액 input value
    await expect(page.getByPlaceholder("분배 금액").first()).toHaveValue(
      "300,000,000",
    );
  });
});

test.describe("항목3: financial 자산 가업 §15⑤ 칩 미노출", () => {
  test("financial 카드 → estate-chip-family-business 부재", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addFinancialCard(page);

    // 자산 추가 → 편집 모달 자동 오픈 (estate-card-shell은 테이블 전환으로 폐기)
    await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();

    // 가업 §15⑤ 칩 미노출 (예금·펀드·채권은 §15⑤ 미해당)
    await expect(
      page.locator('[data-testid^="estate-chip-family-business-"]'),
    ).toHaveCount(0);
  });
});
