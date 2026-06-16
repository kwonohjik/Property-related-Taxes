import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 — 직전연도 입력 2단계 통합 (직전 공시가격 단일 입력원) E2E
 *
 * 직전 공시가격을 5단계가 아니라 2단계 주택 카드(당해 공시 직하)에 입력.
 * 세부담상한 모드 ① 적용 안 함 / ② 직전 공시가격 자동계산 (주택 목록 상단).
 * 마법사 4단계 (세부담상한 5단계 제거).
 *
 * 통합 numeric 안전: 사례8 ⑤ 16,747,099는 통합(§122+§10) 후에도 보존
 *   (§10 종부세 세부담상한은 당해 종부세 < 상한이라 미발동 — Phase A/probe 실측).
 *
 * worktree: E2E_PORT=3200 npx playwright test e2e/comprehensive-prior-year-2step.spec.ts
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

test.describe("종부세 직전연도 2단계 통합 — 직전 공시 단일 입력원", () => {
  test("N-2: 사례8 2주택 auto (직전공시 2단계) → ⑤ 16,747,099 (5단계 제거·결과 보존)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);

    // Step1: 2022, 1세대1주택 OFF
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // Step2: 당해 공시 먼저 입력 (cap-mode-auto 전 → 직전공시 미노출, placeholder nth 안정)
    //   서초 공시 20억(금액 nth0) + 감면율 30%(숫자 nth1)
    await page.getByPlaceholder("금액 입력").nth(0).fill("2000000000");
    await page.getByPlaceholder("숫자 입력").nth(1).fill("30");
    // 주택2(강남) 추가 + 공시 10억 (금액 nth2)
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await page.getByPlaceholder("금액 입력").nth(2).fill("1000000000");

    // 세부담상한 모드 ② auto (주택 목록 상단) → 각 주택 직전공시 노출
    await page.getByTestId("cap-mode-auto").click();
    // 당해 조정대상지역 2주택 토글 ON (중과 2.2%) — 모드 섹션 첫 switch
    await page.getByRole("switch").first().click();
    // 직전공시 입력 (getByLabel — placeholder nth 충돌 회피 안정 식별)
    await page.getByLabel("직전연도 공시가격").nth(0).fill("1500000000"); // 서초 직전
    await page.getByLabel("직전연도 공시가격").nth(1).fill("800000000"); // 강남 직전

    await clickNext(page); // → Step3 (합산배제)
    await clickNext(page); // → Step4 (토지)
    await calcAndWait(page);

    // 산출근거 카드 펼침 → ⑤ 납부할세액 16,747,099 (통합 §122+§10 후에도 보존)
    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();
    // ① 산출세액 18,960,000 (당해 조정2주택 중과 2.2%) · ⑤ 16,747,099
    await expect(page.getByTestId("payable-step1")).toContainText("18,960,000");
    await expect(page.getByTestId("payable-step6")).toContainText("16,747,099");
    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });

  test("N-3: none 모드(기본) → 직전공시 입력란 미노출 · auto 전환 시 노출", async ({
    page,
  }) => {
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // 기본 모드 none → 직전공시 라벨 없음
    await expect(page.getByLabel("직전연도 공시가격")).toHaveCount(0);
    // ② auto 전환 → 직전공시 노출
    await page.getByTestId("cap-mode-auto").click();
    await expect(page.getByLabel("직전연도 공시가격").first()).toBeVisible();
    // ① none 복귀 → 미노출
    await page.getByTestId("cap-mode-none").click();
    await expect(page.getByLabel("직전연도 공시가격")).toHaveCount(0);
  });

  test("N-4: auto 혼재(일부 미입력) → 2단계 다음에서 전 주택 필수 차단", async ({
    page,
  }) => {
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // 당해 공시 (주택1 nth0, 주택2 nth2)
    await page.getByPlaceholder("금액 입력").nth(0).fill("1300000000");
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await page.getByPlaceholder("금액 입력").nth(2).fill("1400000000");
    // auto + 주택1 직전공시만 입력 (주택2 미입력 → 혼재)
    await page.getByTestId("cap-mode-auto").click();
    await page.getByLabel("직전연도 공시가격").nth(0).fill("1200000000");
    // 다음 → 차단
    await clickNext(page);
    await expect(
      page.getByText(/모든 주택의 직전연도 공시가격을 입력/),
    ).toBeVisible();
  });
});
