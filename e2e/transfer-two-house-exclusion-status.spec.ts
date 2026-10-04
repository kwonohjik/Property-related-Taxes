/**
 * §167의10①3호·7호 기산 상태 — 빈 날짜의 두 뜻(「진행 중·미해소」 / 「모름」)을 명시 선택으로 가른다
 * (사용자 결정 2026-10-04 「모름은 납세자에게 불리하게」). 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.8.
 *
 * 종전 화면은 날짜 칸 하나였고 라벨이 「미입력=진행 중」이었다. 이제 날짜를 비우면 ⑧이 막고,
 * 「양도일 현재 소송 진행 중」을 고르면 날짜 칸이 사라지고 통과한다. 세액은 route anchor가 고정한다
 * (`__tests__/api/transfer.route.unknown-unfavorable-1-6-9.anchor.test.ts` U9).
 *
 * worktree 실행: E2E_PORT=3169 npx playwright test e2e/transfer-two-house-exclusion-status.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { STEP1_FIELD_JUMP_CASES as FIELD_JUMP_CASES } from "./_helpers/validation-field-jump-cases-step1";

async function seedAndOpen(page: Page, patch: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...patch };
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

const formOf = (name: string) => {
  const c = FIELD_JUMP_CASES.find((x) => x.name === name);
  if (!c) throw new Error(`case not found: ${name}`);
  return c.form();
};

test("양도 주택 7호 — 날짜를 비우면 막히고, 「양도일 현재 소송 진행 중」을 고르면 날짜 칸이 사라지고 다음 단계로 간다", async ({ page }) => {
  await seedAndOpen(page, formOf("step1: 양도 주택 소송 상태"));
  await page.getByRole("button", { name: "보유 상황" }).first().click();

  const section = page.getByText("양도 주택 중과배제 특례 (2주택 시)").locator("xpath=ancestor::*[.//*[@data-testid='selling-litigation-pending']][1]");
  await expect(section.getByText(/소송 확정판결일/).first()).toBeVisible();
  await expect(page.getByText(/미입력=진행 중/)).toHaveCount(0);

  const next = page.getByRole("button", { name: "다음", exact: true });
  await next.click();
  const panel = page.getByTestId("validation-issues");
  await expect(panel.getByRole("button", { name: /^양도 주택 소송 주택: 소송 확정판결일을 입력하거나/ })).toBeVisible();

  await page.getByTestId("selling-litigation-pending").click();
  await expect(page.locator('[data-field="sellingHouseExclusion.litigationAcquisitionDate"]')).toHaveCount(0);

  const stored = await page.evaluate(() => sessionStorage.getItem("transfer-tax-wizard"));
  expect(JSON.parse(stored ?? "{}").state.formData.sellingHouseExclusion).toMatchObject({
    isLitigationHousing: true,
    litigationPending: true,
  });

  await next.click();
  // 다음 단계(감면·공제)로 넘어갔다 — 오류 항목이 사라지고 그 단계에만 있는 감면 목록이 뜬다.
  //   (단계 라벨은 막혀 있어도 존재하므로 라벨로 판정하지 않는다.)
  await expect(panel.getByRole("button", { name: /소송 확정판결일을 입력하거나/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^장기임대주택조특법 §97 시리즈/ })).toBeVisible();
});
