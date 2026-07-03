/**
 * §166⑥ 일괄양도(bundled, 다자산) 수정신고·경정청구 — 입력 UI E2E
 *
 * bundled은 단건과 동일 마법사(calc-wizard-store)를 재사용 → 이력 진입(enterAmendment)과 동등한 상태를
 * 시딩하면 companionAssets(assets>1)가 있어도 amendmentMode 배너 + AmendmentBlock이 정상 노출됨을 검증.
 * 엔진·가드·저장소 정확성은 vitest(multi-amendment / classify-amendable-transfer / multi-amendment-dedup)로 커버.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-bundled-amendment.spec.ts
 */
import { test, expect } from "@playwright/test";

function seedBundledAmendment(correctionKind: "amend" | "refund_claim") {
  return {
    state: {
      formData: {
        // 2자산(§166⑥ companionAssets) — bundled 판별
        assets: [
          { assetKind: "land", addressJibun: "서울 강남구 대치동 1-1" },
          { assetKind: "land", addressJibun: "서울 강남구 대치동 1-2" },
        ],
        transferDate: "2026-02-15",
        amendmentMode: true,
        correctionKind,
        originalDeterminedTax: "30000000",
        statutoryFilingDeadline: "2027-05-31",
        ...(correctionKind === "refund_claim"
          ? { applyUnderReportingPenalty: false, applyLatePaymentPenalty: false, amendedFilingDate: "2026-07-03" }
          : {}),
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

test.describe("§166⑥ 일괄양도 수정신고·경정청구 UI", () => {
  test("수정신고 진입 → 배너 노출 (companionAssets 2자산)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.evaluate((seed) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
    }, seedBundledAmendment("amend"));
    await page.reload();

    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expect(page.getByText(/수정신고 작성 중/)).toBeVisible({ timeout: 15000 });
  });

  test("경정청구 진입 → 배너 노출", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.evaluate((seed) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
    }, seedBundledAmendment("refund_claim"));
    await page.reload();

    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expect(page.getByText(/경정청구 작성 중/)).toBeVisible({ timeout: 15000 });
  });
});
