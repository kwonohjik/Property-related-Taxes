/**
 * 주택 감면 자산 종류 게이트 — E2E (2026-06-29)
 *
 * 장기임대(§97)·신축(§99)·미분양(§98·§99의2) 감면은 주택 양도에만 적용.
 * - 비주택 자산(토지) → 3개 카테고리 전부 비활성(활성 0) + 게이트 사유.
 * - 분양권 → (B) 차별화: 장기임대(§97)는 차단, 신축주택은 허용.
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-housing-reduction-asset-kind-gate.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const GATE_REASON = "주택 양도에만 적용";

async function gotoReductionStep(page: import("@playwright/test").Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
  await page.getByTestId("transfer-date").getByLabel("월").fill("06");
  await page.getByTestId("transfer-date").getByLabel("일").fill("01");
  // 점진적 노출 — 자산 종류 라디오가 기본정보(①) 안
  await expandAssetSection(page, 1);
}

test.describe("주택 감면 자산 종류 게이트", () => {
  test("토지 자산 → 3개 카테고리 전부 비활성 + 게이트 사유", async ({ page }) => {
    await gotoReductionStep(page);

    // 자산 종류를 토지로 변경 (비주택)
    await page.getByRole("button", { name: "토지·농지" }).click();

    // 감면·공제 단계로 이동
    await page.getByRole("button", { name: "감면·공제" }).click();

    // 3개 카테고리 펼침 → 각각 게이트 사유 노출 (헤더 제목 앵커 — 펼침 시 생기는 §97 배지와 구분)
    for (const cat of [/^장기임대주택/, /^신축주택/, /^미분양주택/]) {
      await page.getByRole("button", { name: cat }).click();
    }
    // 게이트 사유가 최소 1건 이상 보임 (비주택 자산)
    await expect(page.getByText(GATE_REASON, { exact: false }).first()).toBeVisible();
  });

  test("분양권 자산 → (B) 장기임대 차단 · 신축주택 허용", async ({ page }) => {
    await gotoReductionStep(page);

    // 자산 종류를 분양권으로 변경
    await page.getByRole("button", { name: "분양권" }).click();
    await page.getByRole("button", { name: "감면·공제" }).click();

    // 장기임대주택(§97) 펼침 → 게이트 사유 노출 (분양권 배제)
    await page.getByRole("button", { name: /^장기임대주택/ }).click();
    await expect(page.getByText(GATE_REASON, { exact: false }).first()).toBeVisible();

    // 장기임대 접기 → DOM에서 rental 게이트 텍스트 제거
    await page.getByRole("button", { name: /^장기임대주택/ }).click();
    await expect(page.getByText(GATE_REASON, { exact: false })).toHaveCount(0);

    // 신축주택(§99) 펼침 → 게이트 사유 없음 (분양권 허용)
    await page.getByRole("button", { name: /^신축주택/ }).click();
    await expect(page.getByText(GATE_REASON, { exact: false })).toHaveCount(0);
  });
});
