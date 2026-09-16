/**
 * E2E: 이력에서 **주식 신고서를 골라 합산**하는 진입점 (제보 기능 본체)
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §2 G-A · §4.4 (PR-3)
 *
 * ## 왜 E2E여야 하는가
 *
 * 이 경로는 이력 카드 버튼 → 모달 → store 편입 → 마법사까지 **컴포넌트 경계를 셋** 지난다.
 * vitest anchor 는 `buildStockAggregateSession`(순수 함수)만 볼 뿐 「버튼이 그 함수에 닿는가」를
 * 못 본다 — PR-1 P-7 · PR-2 Q-7 에서 같은 구조가 두 번 확인됐다
 * ([[feedback_library_anchor_does_not_prove_component_uses_it]]).
 *
 * 실행: npx playwright test e2e/stock-history-aggregate-entry.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";

function stockRecord(id: string, name: string, transferDate: string, finalTax: number) {
  return {
    id,
    userId: "local-user",
    taxType: "stock_transfer",
    title: `주식 양도세 — ${name}`,
    inputData: {
      securityName: name,
      marketType: "unlisted",
      isMajorShareholder: true,
      // 영 §157 — 대주주면 지분율·시가총액 중 하나가 필수다. 빠뜨리면 ⑧이 종목을 지목해
      // 차단한다(실측: 「1번째 종목 「SK하이닉스」: … 1개 이상 입력하세요」).
      selfShareRatio: "5",
      acquisitionDate: "2021-01-02",
      transferDate,
      priorYearEndDate: "2023-12-31",
      shareCount: "100",
      totalIssuedShares: "1000000",
      acquisitionCause: "purchase",
      transferActualInputMode: "total",
      transferTotalPrice: "100000000",
      acquisitionMode: "actual",
      perShareAcquisitionPrice: "500000",
      expenseMode: "actual",
      filingType: "preliminary",
      // 예정신고 기한은 §105①2호로 **반기 말일 + 2개월** — 상·하반기가 다른 신고서다.
      filingDate: transferDate < `${transferDate.slice(0, 4)}-07-01` ? `${transferDate.slice(0, 4)}-08-31` : `${Number(transferDate.slice(0, 4)) + 1}-02-28`,
    },
    resultData: { finalTax, localIncomeTax: Math.floor(finalTax / 10) },
    taxLawVersion: transferDate,
    linkedCalculationId: null,
    clientId: null,
    createdAt: `${transferDate}T00:00:00.000Z`,
    updatedAt: `${transferDate}T00:00:00.000Z`,
  };
}

/** 같은 과세연도 2건 + 다른 연도 1건 */
async function seedAll(page: Page) {
  await page.goto("/history");
  await putCalculationRecord(page, stockRecord("s-late", "삼성전자", "2024-09-01", 9_000_000));
  await putCalculationRecord(page, stockRecord("s-early", "SK하이닉스", "2024-02-01", 5_000_000));
  await putCalculationRecord(page, stockRecord("s-other", "카카오", "2023-05-01", 3_000_000));
  await page.reload();
  await page.waitForLoadState("networkidle");
}

test.describe("주식 이력 합산 진입점", () => {
  test("SA-1: 🔴 주식 이력 카드에 「합산」 버튼이 있다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAll(page);
    await expect(page.getByTestId("aggregate-s-late")).toBeVisible({ timeout: 30_000 });
  });

  test("SA-2: 모달이 같은 과세연도만 선택 가능하게 하고 다른 연도는 사유를 붙여 비활성한다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAll(page);
    await page.getByTestId("aggregate-s-late").click();

    await expect(page.getByTestId("history-aggregate-modal")).toBeVisible({ timeout: 30_000 });
    // 기준은 맨 앞·항상 선택
    await expect(page.getByTestId("aggregate-record-s-late")).toHaveAttribute("aria-pressed", "true");
    // 같은 연도는 선택 가능
    await expect(page.getByTestId("aggregate-record-s-early")).toBeEnabled();
    // 다른 연도는 비활성 + 사유 표시(지우지 않는다)
    await expect(page.getByTestId("aggregate-record-s-other")).toBeDisabled();
    await expect(page.getByText(/2023년 \(과세연도 불일치\)/)).toBeVisible();
    // 1건만 선택된 상태에서는 진행 불가
    await expect(page.getByTestId("aggregate-confirm")).toBeDisabled();
  });

  test("SA-3: 🔴 2건 선택 → 마법사에 **양도일 오름차순**으로 편입된다 (§103②)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAll(page);
    await page.getByTestId("aggregate-s-late").click();
    await expect(page.getByTestId("history-aggregate-modal")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("aggregate-record-s-early").click();
    await expect(page.getByTestId("aggregate-confirm")).toBeEnabled();
    await page.getByTestId("aggregate-confirm").click();

    // 주식 마법사 1단계 — 확정 목록 1건 + 편집기 1건 = 2건
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible({ timeout: 30_000 });
    // 🔴 편입 순번은 양도일 오름차순 — 2월(SK하이닉스)이 목록, 9월(삼성전자)이 편집기
    await expect(page.getByPlaceholder("종목명을 입력하세요")).toHaveValue("삼성전자");
    await expect(page.getByTestId("stock-item-edit-0")).toBeVisible();
  });

  test("SA-4: 편입 후 합산 계산이 **items 2건**으로 나간다 (경로 전체 연결)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAll(page);
    await page.getByTestId("aggregate-s-late").click();
    await expect(page.getByTestId("history-aggregate-modal")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("aggregate-record-s-early").click();
    await page.getByTestId("aggregate-confirm").click();
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible({ timeout: 30_000 });

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    // 사이드바 4단계(결과)로 바로 이동
    await page.getByRole("button", { name: /결과/ }).first().click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    const body = JSON.parse(resp.request().postData() ?? "{}");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(body.deductionMode).toBe("aggregate");
  });
  test("SA-5: 🔴 기납부세액이 **마지막 예정신고서를 제외한** 나머지로 자동 채워진다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAll(page);
    await page.getByTestId("aggregate-s-late").click();
    await expect(page.getByTestId("history-aggregate-modal")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("aggregate-record-s-early").click();
    await page.getByTestId("aggregate-confirm").click();
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible({ timeout: 30_000 });

    // 3단계로 이동 — 확정신고로 전환돼 있어야 입력란이 보인다
    await page.getByRole("button", { name: "필요경비·신고 단계로 이동" }).click();
    await expect(page.getByText("예정신고 기납부세액 (§111③)")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: "확정신고" }).first()).toBeChecked();

    // 🔴 SK하이닉스(2024-02 양도 → 신고 2024-08-31)만 기신고분.
    //    삼성전자(2024-09 양도 → 신고 2025-02-28)는 마지막 신고서라 제외된다.
    await expect(
      page.locator('div:has(> label:has-text("기납부 양도소득세 (국세)")) input[type="text"]').first(),
    ).toHaveValue("5,000,000");
    await expect(
      page.locator('div:has(> label:has-text("기납부 지방소득세")) input[type="text"]').first(),
    ).toHaveValue("500,000");
  });

  test("SA-6: 자동값이 ⑬body를 타고 ⑦결과 정산 행으로 돌아온다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAll(page);
    await page.getByTestId("aggregate-s-late").click();
    await expect(page.getByTestId("history-aggregate-modal")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("aggregate-record-s-early").click();
    await page.getByTestId("aggregate-confirm").click();
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible({ timeout: 30_000 });

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "결과 단계로 이동" }).click();
    const resp = await calcResponse;
    const body = JSON.parse(resp.request().postData() ?? "{}");
    expect(body.preliminaryPaidTax).toBe(5_000_000);
    expect(body.preliminaryPaidLocalTax).toBe(500_000);

    await expect(page.getByTestId("stock-aggregate-settlement")).toBeVisible({ timeout: 30_000 });
  });
});
