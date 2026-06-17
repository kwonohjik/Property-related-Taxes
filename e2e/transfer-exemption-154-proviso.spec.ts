/**
 * transfer-exemption-154-proviso.spec.ts
 *
 * §154① 단서 — 1세대1주택 비과세 보유·거주 요건 면제 사유.
 * 양도세 Step 4(보유 상황)에서 1세대1주택(기본) + 주택 자산 시 ExemptionProvisoSection 노출,
 * 사유 선택에 따른 조건부 입력(해외이주→출국일 / 부득이→거주 힌트 / 5호→무주택 토글) 검증.
 *
 * 실행: E2E_PORT=3103 npx playwright test e2e/transfer-exemption-154-proviso.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoHoldingStep(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("§154① 단서 — 보유·거주 요건 면제 사유 UI", () => {
  test("사유별 조건부 입력 노출 (해외이주→출국일 / 부득이→거주힌트 / 5호→무주택)", async ({
    page,
  }) => {
    await gotoHoldingStep(page);

    // 1세대1주택(기본) + 주택 자산 → §154① 단서 섹션 노출
    await expect(
      page.getByText("§154① 단서 — 보유·거주 요건 면제 사유 (선택)"),
    ).toBeVisible({ timeout: 5000 });

    // 해외이주(2호 나목) 선택 → 출국일 FieldCard 노출
    await page.getByText("해외이주 (2호 나목)").click();
    await expect(page.getByText("양도 시 적용 (필수)")).toBeVisible();

    // 부득이(3호) 선택 → 거주 1년 힌트 노출 (출국일 FieldCard는 사라짐)
    await page.getByText("부득이한 사유 (3호)").click();
    await expect(page.getByText("1년 이상이어야 적용됩니다")).toBeVisible();
    await expect(page.getByText("양도 시 적용 (필수)")).toHaveCount(0);

    // 5호(조정 공고 전 계약) 선택 → 계약금일 무주택 확인 토글(switch) 노출
    await page.getByText("조정 공고 전 계약 (5호)").click();
    await expect(
      page.getByRole("switch", { name: /계약금 지급일 현재.*무주택/ }),
    ).toBeVisible();
  });
});
