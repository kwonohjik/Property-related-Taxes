/**
 * 일반건물(GB) 수정신고·경정청구 — 입력 UI E2E
 *
 * `transfer-bundled-amendment.spec.ts`와 **같은 규약**이다 — 이 영역의 E2E는 입력 UI 도달성만
 * 보고, 엔진·가드·결과뷰 정확성은 vitest가 맡는다:
 *   - route ⑭ 배관 : `__tests__/api/transfer.route.gb-amendment.predo.anchor.test.ts`
 *   - 이력 게이트   : `__tests__/lib/calc/gb-amendment-gate.predo.anchor.test.ts`
 *   - 결과뷰 렌더   : `__tests__/components/gb-amendment-result-view.predo.anchor.test.tsx`
 *
 * 🔴 **종전에는 GB가 이 화면에 도달할 수 없었다** — 이력 게이트가 `assets.length>1`을 요구해
 *    단일 물건인 일반건물이 「자연 배제」됐고(`transfer-amendment-entry.ts` 주석), 버튼 자체가
 *    뜨지 않았다. 배제 근거 조문은 부존재한다(국세기본법 §45①·§45의2① — 요건은 신고 주체와 기한뿐).
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-gb-amendment.spec.ts
 */
import { test, expect } from "@playwright/test";

/** 일반건물 = 단일 물건(assets 1개). 종전 게이트가 바로 이 조건에서 탈락시켰다. */
function seedGbAmendment(correctionKind: "amend" | "refund_claim") {
  return {
    state: {
      formData: {
        assets: [{ assetKind: "general_building", addressJibun: "서울 성북구 정릉동 229-2" }],
        transferDate: "2026-02-19",
        amendmentMode: true,
        correctionKind,
        originalDeterminedTax: "6974113",
        statutoryFilingDeadline: "2027-05-31",
        ...(correctionKind === "refund_claim"
          ? {
              applyUnderReportingPenalty: false,
              applyLatePaymentPenalty: false,
              amendedFilingDate: "2026-07-03",
            }
          : {}),
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

test.describe("일반건물 수정신고·경정청구 UI", () => {
  test("수정신고 진입 → 배너 노출 (단일 물건 general_building)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.evaluate((seed) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
    }, seedGbAmendment("amend"));
    await page.reload();

    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expect(page.getByText(/수정신고 작성 중/)).toBeVisible({ timeout: 15000 });
  });

  test("경정청구 진입 → 배너 노출", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.evaluate((seed) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
    }, seedGbAmendment("refund_claim"));
    await page.reload();

    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expect(page.getByText(/경정청구 작성 중/)).toBeVisible({ timeout: 15000 });
  });
});
