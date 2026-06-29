/**
 * E2E: §23의2 동거주택공제 — 조합원입주권·분양권 미적용 UI 검증
 *
 * 시나리오 1: 1+1 조합원입주권 선택 시 미적용 배지 노출 + CohabitRequirementBlock 외 진행 확인
 * 시나리오 2: 분양권 선택 시 rose 안내 노출
 *
 * 서버: E2E_PORT 환경변수 또는 기본 3000
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

const PORT = process.env.E2E_PORT ?? "3000";
const BASE = `http://localhost:${PORT}`;

// ─────────────────────────────────────────────
// 헬퍼: Step0 자녀(동거) 추가 + Step1 아파트 추가 + 동거주택 토글 ON
// ─────────────────────────────────────────────

async function setupCohabitApartmentWithChild(page: Page) {
  await page.goto(`${BASE}/calc/inheritance-tax`);

  // 상속개시일: 2024-06-01
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("1");

  // 자녀 추가 — 동거 토글이 "상속인 편집" 모달 안 → 모달 유지
  await addHeir(page, "heir", "child", { keepModalOpen: true });

  // 동거주택 상속공제 해당 (isCohabitant) 토글 ON (모달 안, role=switch)
  await page.getByRole("switch", { name: /동거주택 상속공제 해당/ }).click();
  await closeHeirEditModal(page);

  // Step0 → Step1
  await page.getByRole("button", { name: /^다음/ }).click();

  // 아파트 추가
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /주택/ }).click();

  // 보충적 평가(주택 기준시가) 토글 ON — 금액 입력 펼침 (2026-06-09 토글 전환)
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  // 기준시가 입력
  await page.locator('[placeholder="금액 입력"]').first().fill("800000000");

  // 담보·임대 섹션 토글 ON → 동거주택 공제 대상 토글 ON (2026-06-09 토글 전환)
  await page.getByRole("switch", { name: /담보·임대/ }).click();
  // role=switch (getByText는 §23의2 법령 배지 클릭→모달). 자산 모달은 유지(자산 유형 radio 상호작용).
  await page.getByRole("switch", { name: /동거주택 공제 대상/ }).click();

  // RadioCardGroup이 노출되는지 확인 (자산 유형 선택 섹션)
  await expect(
    page.getByText("자산 유형 선택 (§23의2 적용 여부)")
  ).toBeVisible();
}

// ─────────────────────────────────────────────
// 시나리오 1: 1+1 조합원입주권 선택 → 미적용 안내 노출
// ─────────────────────────────────────────────

test.describe("§23의2 조합원입주권·분양권 미적용 UI", () => {
  test("E2E-COHABIT-REDEV-1: 1+1 입주권 선택 시 rose 미적용 안내 표시", async ({ page }) => {
    await setupCohabitApartmentWithChild(page);

    // 1+1 조합원입주권 선택
    await page.getByText("1+1 조합원입주권 (미적용)").click();

    // rose 미적용 안내 노출
    await expect(
      page.getByText("§23의2 동거주택 상속공제 미적용입니다")
    ).toBeVisible();

    // testid 확인
    const estateCards = page.locator('[data-testid^="cohabit-excluded-notice-"]');
    await expect(estateCards.first()).toBeVisible();
  });

  test("E2E-COHABIT-REDEV-2: 분양권 선택 시 rose 미적용 안내 표시", async ({ page }) => {
    await setupCohabitApartmentWithChild(page);

    // 분양권 선택
    await page.getByText("분양권 (미적용)").click();

    // rose 안내 노출
    await expect(
      page.getByText("§23의2 동거주택 상속공제 미적용입니다")
    ).toBeVisible();
  });

  test("E2E-COHABIT-REDEV-3: 일반주택 선택 시 미적용 안내 미노출", async ({ page }) => {
    await setupCohabitApartmentWithChild(page);

    // 일반주택 선택
    await page.getByText("일반주택 (공제 적용)").click();

    // rose 안내 미노출
    await expect(
      page.locator('[data-testid^="cohabit-excluded-notice-"]')
    ).toHaveCount(0);
  });
});
