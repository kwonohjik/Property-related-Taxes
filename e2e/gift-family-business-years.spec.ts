/**
 * E2E: 증여세 §30의6① 가업 영위기간 입력 → 한도 분기 + 한도 초과분 일반 스트림 이관
 *
 * 시나리오 [E2E-GFY-1] (영위 25년 → 한도 400억, 초과 없음):
 *   1. 증여일 2025-01-15, 토지 350억 입력
 *   2. Step3 — 가업승계(§30의6) 선택 → "부모 가업 영위기간" 필드 노출 확인
 *   3. 영위기간 25 입력 → 계산
 *   4. request body: creditInput.familyBusinessYears === 25 (⑬⑭ 도달 검증)
 *   5. 결과: finalTax 5,600,000,000 (340억 과세표준 → 120억 10% + 220억 20%)
 *
 * 시나리오 [E2E-GFY-2] (미입력 → 기본 10년 한도 300억, 초과 50억 일반 이관):
 *   결과: finalTax 6,554,550,000 (특례 46억 + 일반 1,954,550,000)
 *
 * 주의사항:
 *   - worktree 실행 시 E2E_PORT=3100 필수 (memory: feedback_e2e_worktree_port_isolation)
 */
import { test, expect } from "@playwright/test";
import {
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  nextSteps,
} from "./_helpers/tax-flow";

async function setupTo350bStep3(page: import("@playwright/test").Page) {
  await fillDateAndVerify(page, { year: "2025", month: "1", day: "15" });
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step1: 토지 350억 (3,500㎡ × 1천만)
  await addLandAsset(page, {
    area: "3500",
    unitPrice: "10000000",
    addButtonName: /증여재산 추가/,
    keepModalOpen: true,
  });
  await page.getByPlaceholder(/본가 토지/).fill("가업 자산");
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

  await nextSteps(page, 2);

  // Step3: 가업승계 선택 → 영위기간 필드 노출
  await page.getByText("가업승계 증여세 과세특례 (§30의6)").click();
  await expect(page.getByText("부모 가업 영위기간 (§30의6①)")).toBeVisible();
}

test.describe("§30의6① 가업 영위기간 — 한도 분기 + 초과분 일반 이관", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
  });

  test("[E2E-GFY-1] 영위 25년 입력 → body 도달 + 한도 400억 finalTax 56억", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await setupTo350bStep3(page);

    // 영위기간 25 입력 (DecimalInput placeholder "영위 기간 입력")
    await page.getByPlaceholder("영위 기간 입력").fill("25");

    // request body 검증 (⑬ fetch body → ⑫ Zod → ⑭ 엔진 도달)
    const reqPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/calc/gift") && req.method() === "POST",
    );
    await calcAndWaitResult(page, { taxType: "gift" });
    const req = await reqPromise;
    const body = req.postDataJSON() as {
      creditInput: { familyBusinessYears?: number };
    };
    expect(body.creditInput.familyBusinessYears).toBe(25);

    // 한도 400억(20년 이상 30년 미만) → 초과 없음 → finalTax 56억
    await expect(page.getByText("5,600,000,000").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[E2E-GFY-2] 미입력(기본 10년·한도 300억) → 초과 50억 일반 이관 finalTax 6,554,550,000", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await setupTo350bStep3(page);

    // 영위기간 미입력 → body에서 strip 확인
    const reqPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/calc/gift") && req.method() === "POST",
    );
    await calcAndWaitResult(page, { taxType: "gift" });
    const req = await reqPromise;
    const body = req.postDataJSON() as {
      creditInput: { familyBusinessYears?: number };
    };
    expect(body.creditInput.familyBusinessYears).toBeUndefined();

    // 한도 300억 → 초과 50억 일반 스트림 → 특례 46억 + 일반 1,954,550,000
    await expect(page.getByText("6,554,550,000").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
