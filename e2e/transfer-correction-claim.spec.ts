/**
 * 양도소득세 경정청구(세액 감소·환급) — 입력 UI E2E
 *
 * 검증: correctionKind="refund_claim" 시 ① sky 배너 ② 가산세 스텝이 경정청구 블록으로 교체
 *   (당초 결정세액·사유유형 RadioCardGroup·청구기한 프리뷰) ③ posterior 선택 시 후발적 사유 안 날 노출.
 * 엔진 계산 정확성(환급세액·청구기한)은 vitest(__tests__/tax-engine/transfer/correction-claim.test.ts)로 커버.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-correction-claim.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope
    .locator(`label:has-text("${labelText}")`)
    .locator("xpath=..")
    .locator("input")
    .first();
}

function seedRefundState(page: Page, extra: Record<string, unknown>) {
  return page.evaluate((extraFields) => {
    sessionStorage.setItem(
      "transfer-tax-wizard",
      JSON.stringify({
        state: {
          formData: {
            assets: [{ assetKind: "land", addressJibun: "서울 강남구 대치동 1-1" }],
            transferDate: "2022-05-01",
            amendmentMode: true,
            correctionKind: "refund_claim",
            claimReasonType: "ordinary",
            originalDeterminedTax: "50000000",
            statutoryFilingDeadline: "2023-05-31",
            amendedFilingDate: "2026-07-02",
            ...(extraFields as Record<string, unknown>),
          },
          pendingMigration: false,
        },
        version: 0,
      }),
    );
  }, extra);
}

/** 나대지 10억(취득 3억) 과세 양도를 UI로 입력 후 계산 → 당초 신고 결과 */
async function seedOriginalLandReturn(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2023");
  await page.getByTestId("transfer-date").getByLabel("월").fill("05");
  await page.getByTestId("transfer-date").getByLabel("일").fill("01");

  await expandAssetSection(page, 1);
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);

  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();
  await page.getByPlaceholder("면적 입력").first().fill("300");
  await inputByLabel(page, "양도가액 (원)").fill("1000000000");

  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("radio", { name: "실거래가 계약서상 실거래가" }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("2010");
  await page.getByLabel("월", { exact: true }).nth(2).fill("03");
  await page.getByLabel("일", { exact: true }).nth(2).fill("27");
  await inputByLabel(page, "취득가액 (원)").fill("300000000");

  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

test.describe("양도소득세 경정청구 입력 UI", () => {
  test("refund_claim → sky 배너 + 경정청구 블록(사유유형·청구기한), 가산세 토글 미노출", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await seedRefundState(page, {});
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ① sky 배너
    await expect(page.getByText(/경정청구 작성 중/)).toBeVisible();

    // 가산세 스텝으로 점프
    await page.getByRole("button", { name: "가산세", exact: true }).click();

    // ② 경정청구 블록
    await expect(page.getByText("⑤ 경정청구")).toBeVisible();
    await expect(page.getByText(/경정청구 사유 유형/)).toBeVisible();
    await expect(page.getByText(/당초 결정세액/).first()).toBeVisible();

    // 청구기한 프리뷰 — 2023-05-31 + 5년 = 2028-05-31 (엔진 단일진실)
    await expect(page.getByText(/2028-05-31/)).toBeVisible();

    // ③ 신고불성실/납부지연 토글은 refund에서 미노출
    await expect(page.getByText(/신고불성실가산세 적용/)).toHaveCount(0);
  });

  test("후발적 사유 라디오 클릭 → 후발적 사유 안 날 필드 노출", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await seedRefundState(page, {}); // ordinary 기본
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "가산세", exact: true }).click();

    // ordinary 기본 → 후발적 필드 미노출 (라벨 exact — 힌트 문구와 구분)
    await expect(page.getByText("후발적 사유를 안 날", { exact: true })).toHaveCount(0);

    // 후발적 사유 라디오 클릭 → 조건부 필드 노출 (실사용 경로)
    await page.getByText("후발적 사유", { exact: true }).click();
    await expect(page.getByText("후발적 사유를 안 날", { exact: true })).toBeVisible();
  });

  test("이력 → 경정청구 작성 → sky 배너 + 당초 결정세액 자동 prefill (faithful 진입)", async ({ page }) => {
    // 1. 당초 신고 계산 → 결과 마운트 → 자동 저장
    await seedOriginalLandReturn(page);
    await expect(page.getByRole("button", { name: "다시 계산하기" })).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200); // IndexedDB auto-save 커밋 대기

    // 2. 이력 진입 → 레코드 열기
    await page.goto("/history");
    const record = page.locator("div.cursor-pointer").first();
    await expect(record).toBeVisible({ timeout: 15000 });
    await record.click();

    // 3. "경정청구 작성" (single-mode guard) → handleRefundClaim
    await page.getByTestId("drawer-correction").click();

    // 4. sky 배너
    await expect(page.getByText(/경정청구 작성 중/)).toBeVisible({ timeout: 15000 });

    // 5. 가산세 스텝 — 당초 결정세액 이력 자동 prefill(>0)
    await page.getByRole("button", { name: "가산세", exact: true }).click();
    const origInput = inputByLabel(page, "당초 결정세액");
    await expect(origInput).not.toHaveValue("");
    await expect(origInput).not.toHaveValue("0");
  });
});
