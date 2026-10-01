/**
 * 검증 오류 → 입력칸 이동 — 장기임대 §97 시리즈 중 **「공실 여부」를 화면에서 고른 뒤에야 닿는** 메시지.
 *
 * 왜 메인 spec(`transfer-validation-field-jump.spec.ts`)이 아니라 여기인가:
 * 세션 복원(`calc-wizard-asset-migrate-rental-split.ts` `normalizeRentalAndSplitFields`)이 §97 시리즈 감면의
 * `hasVacancyOverGrace`를 **항상 null로 되돌린다.** 시드로는 「없음/있음」을 고른 상태를 만들 수 없고,
 * 미선택이면 그 오류가 먼저 나서 뒤의 메시지에 닿지 못한다. 그래서 같은 입력(`REDUCTION_VACANCY_PREPARED`)을
 * 시드한 뒤 **화면에서 그 라디오를 고르고** 「다음」을 누른다. 입력이 정말 그 오류를 내는지는 vitest
 * (`transfer-validation-field-jump-cases.test.ts`)가 같은 케이스로 먼저 고정한다.
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/transfer-validation-field-jump-reduction-rental.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { REDUCTION_VACANCY_PREPARED } from "./_helpers/validation-field-jump-cases-reduction";

async function ready(page: Page) {
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // hydration 전 클릭은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function seedAndOpen(page: Page, patch: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...patch };
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await ready(page);
}

const panel = (page: Page) => page.getByTestId("validation-issues");

test.describe("검증 오류 → 입력칸 이동 (장기임대 — 공실 여부를 고른 뒤)", () => {
  test("케이스가 있다 (공백 통과 방지)", () => {
    expect(REDUCTION_VACANCY_PREPARED.length).toBeGreaterThanOrEqual(20);
  });

  for (const { case: c, type, vacancy } of REDUCTION_VACANCY_PREPARED) {
    test(c.name ?? c.field, async ({ page }) => {
      await seedAndOpen(page, c.form());
      await page.getByRole("button", { name: "감면·공제" }).first().click();

      // 시드로 만들 수 없는 값 — 화면에서 고른다(접힌 섹션 안이라 evaluate click, 반영은 checked로 확인)
      const radio = page.locator(`[data-field="reduction.${type}.hasVacancyOverGrace"] input[value="${vacancy}"]`);
      await radio.evaluate((el: HTMLInputElement) => el.click());
      await expect(radio).toBeChecked();

      await page.getByRole("button", { name: "다음", exact: true }).click();
      const item = panel(page).getByRole("button", { name: c.message });
      await expect(item).toBeVisible();
      await item.click();

      await expect
        .poll(() =>
          page.evaluate((key) => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            return {
              inField: !!el.closest(`[data-field="${CSS.escape(key)}"]`),
              card: el.closest("[data-asset-card-index]")?.getAttribute("data-asset-card-index") ?? null,
            };
          }, c.field),
        )
        .toMatchObject({ inField: true, card: String(c.assetIndex) });
      await expect(page.locator(":focus")).toBeInViewport();
    });
  }
});
