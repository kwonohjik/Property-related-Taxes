import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 사례7 — 다가구주택 면적안분 재산세 ⓐ 자동화 (트랙 A · floorUnits) E2E
 *
 * 교재 사례7(다가구 ≠1세대1주택, 2022 귀속). 수동입력(propertyTaxAmount) 없이
 * 통합공시 8억 + 층별 면적(120/120/60)만 입력 → 엔진이 구별 안분·누진 합산하여 ⓐ=714,000 자동 산정.
 *
 * 검증 경로: UI 입력(다가구 토글 + DecimalInput 면적) → API body floorUnits → 엔진 calcMultiFamilyHousingTax
 *   → 결과 ⓐ 714,000 · ① 720,000 · ⓓ 159,405 · ⑤ 560,595 + 구별 안분 명세 echo
 *
 * worktree: E2E_PORT=3101 npx playwright test e2e/comprehensive-case7-multifamily.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function calcAndWait(page: Page): Promise<void> {
  const calcResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/calc/comprehensive") &&
      r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 ${resp.status()}`).toBe(true);
}

test.describe("종합부동산세 사례7 — 다가구 면적안분 자동(floorUnits) 폼→결과", () => {
  test("통합공시 8억 + 층별 면적 120/120/60 → ⑤ 560,595 (수동입력 없이)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);

    // Step1: 2022 과세연도, 1세대1주택 OFF (다가구 ≠ 1세대1주택)
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // Step2: 통합공시 8억 (부과재산세는 입력하지 않음 — floorUnits 자동 경로)
    await page.getByPlaceholder("금액 입력").nth(0).fill("800000000");

    // "다가구주택 층별(구별) 면적 입력" 토글 ON (card variant label 클릭 → Switch 토글)
    await page.getByText("다가구주택 층별(구별) 면적 입력").click();

    // 층별 면적 3행 입력: 1층 120 · 2층 120 · 지하 60 (toggle ON 시 1행 자동 생성)
    await page.getByPlaceholder("전용면적").nth(0).fill("120");
    await page.getByRole("button", { name: /구별\(층별\) 추가/ }).click();
    await page.getByPlaceholder("전용면적").nth(1).fill("120");
    await page.getByRole("button", { name: /구별\(층별\) 추가/ }).click();
    await page.getByPlaceholder("전용면적").nth(2).fill("60");

    // 라이브 안분 미리보기 — 순수 산술 안분 공시(세액 아님) 확인
    await expect(page.getByText(/안분 공시가격 미리보기/)).toBeVisible();
    await expect(page.getByText(/320,000,000/).first()).toBeVisible();

    await clickNext(page); // → Step3
    await clickNext(page); // → Step4(토지·계산)

    // 세부담상한 모드 미사용(기본 none) → ⑤=taxBeforeCap
    await calcAndWait(page);

    // 결과: 납부할세액 560,595
    await expect(page.getByText(/560,595/).first()).toBeVisible({
      timeout: 30_000,
    });

    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();

    // ① 산출세액 720,000
    await expect(page.getByTestId("payable-step1")).toContainText("720,000원");
    // ⓓ 공제할 재산세 159,405 (round 안분)
    await expect(page.getByTestId("payable-step2")).toContainText("159,405원");
    // ⑤ 납부할세액 560,595
    await expect(page.getByTestId("payable-step6")).toContainText("560,595원");

    // 다가구 구별 안분 명세 echo (트랙 A — manual·단일 ⓐ와 직교, floorUnits 자동 시만 노출)
    await expect(card.getByText(/다가구 구별 안분 명세/)).toBeVisible();
    await card.getByText(/다가구 구별 안분 명세/).click();
    await expect(card.getByText(/재산세 300,000/).first()).toBeVisible();
    await expect(card.getByText(/재산세 114,000/)).toBeVisible();

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
