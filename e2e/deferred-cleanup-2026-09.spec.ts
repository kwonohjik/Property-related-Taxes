/**
 * E2E: 별건으로 남겨 뒀던 항목들의 **배선** 검증 (2026-09-11)
 *
 * 두 항목은 순수 함수로 잴 수 없다 — 게이트가 컴포넌트 안에 있다.
 *
 *  1. 상속 납부지연가산세 ⑧ — 토글 ON + 미납액 공란이면 계산이 막힌다.
 *     leaf(`validateLatePaymentFields`)는 단위 테스트가 덮지만, 그것을
 *     `handleCalculate`가 실제로 **부르는지**는 leaf 호출로 증명되지 않는다
 *     ([[feedback_leaf_anchor_skips_zod_layer]]).
 *
 *  2. 재산세 결과 화면 「다시 계산」 — 규약(components/calc/CLAUDE.md:13)대로
 *     **값을 유지한 채** 입력 단계로 돌아가고, 전체 폐기는 확인 Dialog 를 거치는
 *     별도 버튼에만 달린다. 종전엔 「다시 계산하기」가 확인 없이 전부 지웠다.
 *
 * 실행: npx playwright test e2e/deferred-cleanup-2026-09.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  addHeir,
} from "./_helpers/tax-flow";

function amountInputByLabel(page: Page, labelText: string | RegExp) {
  return page
    .locator("div")
    .filter({ hasText: labelText })
    .locator('input[inputmode="numeric"]')
    .last();
}

// ════════════════════════════════════════════════════
// 1. 상속 — 납부지연 토글 ON + 미납액 공란 차단
// ════════════════════════════════════════════════════

test.describe("상속 납부지연가산세 ⑧ 배선", () => {
  test("LP-E2E-1: 토글 ON + 미납액 공란이면 계산이 막히고 사유가 뜬다", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/calc/inheritance-tax");
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
    await addHeir(page, "heir", "child", { residentNumber: "700101-1000001" });
    await nextSteps(page, 1);
    await addLandAsset(page, { area: "600", unitPrice: "10000000" });
    await nextSteps(page, 3); // → Step4

    // 신고 상태 그룹을 펼쳐야 납부지연 블록이 보인다.
    await page
      .getByRole("button", { name: /신고 상태·외국납부·단기재상속 세액공제/ })
      .click();

    const toggle = page.getByText("납부지연가산세 (국세기본법 §47의4)", { exact: false }).first();
    await expect(toggle).toBeVisible();
    await toggle.click();

    // 미납액·기한을 **비운 채** 계산 → ⑧이 막는다.
    await page.getByRole("button", { name: /^계산하기$/ }).click();
    await expect(page.getByText(/미납·과소납부세액을 입력하세요/)).toBeVisible({
      timeout: 15_000,
    });
  });
});

// ════════════════════════════════════════════════════
// 2. 재산세 — 결과 화면 버튼 라벨 ↔ 동작 1:1
// ════════════════════════════════════════════════════

test.describe("재산세 결과 화면 — 「다시 계산」은 폐기가 아니다", () => {
  test("PR-E2E-1: 「다시 계산」은 입력값을 유지하고, 폐기는 확인 Dialog 를 거친다", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/calc/property-tax");
    await amountInputByLabel(page, /^공시가격/).fill("700000000");
    await page.getByRole("button", { name: /^다음$/ }).click();

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/property") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    expect((await calcResponse).ok()).toBe(true);
    await expect(page.getByText("총 납부세액").first()).toBeVisible({ timeout: 30_000 });

    // ── 라벨이 규약대로 둘로 나뉘어 있다
    await expect(page.getByRole("button", { name: "다시 계산", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "처음부터 새로" })).toBeVisible();
    // 종전 라벨은 사라졌다 — 그것이 폐기를 달고 있었다.
    await expect(page.getByRole("button", { name: "다시 계산하기" })).toHaveCount(0);

    // ── 「다시 계산」 → 첫 입력 단계로 돌아가되 **공시가격이 남아 있다**
    await page.getByRole("button", { name: "다시 계산", exact: true }).click();
    await expect(amountInputByLabel(page, /^공시가격/)).toHaveValue(/700,?000,?000/);
  });

  test("PR-E2E-2: 「처음부터 새로」는 확인 Dialog 를 거쳐야 지운다", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/calc/property-tax");
    await amountInputByLabel(page, /^공시가격/).fill("700000000");
    await page.getByRole("button", { name: /^다음$/ }).click();
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/property") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    expect((await calcResponse).ok()).toBe(true);
    await expect(page.getByText("총 납부세액").first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "처음부터 새로" }).click();
    // 즉시 지우지 않는다 — 확인을 먼저 묻는다.
    await expect(page.getByText("입력값을 모두 삭제할까요?")).toBeVisible();
    await page.getByRole("button", { name: /삭제하고 처음부터/ }).click();
    await expect(amountInputByLabel(page, /^공시가격/)).toHaveValue("");
  });
});
