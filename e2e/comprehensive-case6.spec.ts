import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 사례6 — 주택 건물·부속토지 소유자 분리(시가표준액 비율 안분, ≠1세대1주택)
 *
 * 국세청 사례집 제8장 사례6 (2022 귀속). 부속토지만 100% 소유(건물 0%).
 *   당해 안분 = 토지 8억 / 전체 10억 = 0.8 → 15억 × 0.8 = 12억
 *   직전 안분 = 토지 7.8억 / 전체 10.4억 = 0.75 → 14억 × 0.75 = 10.5억
 *   ⑤ 납부할세액 = 1,367,616
 *
 * worktree: E2E_PORT=3003 npx playwright test e2e/comprehensive-case6.spec.ts
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

test.describe("종합부동산세 사례6 — 건물·부속토지 소유자 분리(시가표준액 안분)", () => {
  test("C6-E1: 토지만 100% 소유 — ⑤ 1,367,616 + 안분 80%", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);

    // Step1: 2022 + ≠1세대1주택 (부부특례 미선택)
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page); // → Step2

    // Step2: 공시 15억 + 건물·부속토지 분리 ON + 시가표준액 (cap-mode-auto 전 입력 → "금액 입력" nth 안정)
    await page.getByPlaceholder("금액 입력").first().fill("1500000000");
    // 분리 토글 ON — none 모드 단일주택 switch: [0]당해 조정2주택 [1]건물·부속토지 분리 → 분리 = nth(1)
    await page.getByRole("switch").nth(1).click();
    await expect(page.getByText("당해연도 시가표준액")).toBeVisible(); // 펼침 확인
    await expect(page.getByText("토지만 소유")).toBeVisible(); // 기본 선택
    // "금액 입력": nth(0)=공시, (1)=당해토지, (2)=당해건물, (3)=직전토지, (4)=직전건물
    await page.getByPlaceholder("금액 입력").nth(1).fill("800000000");
    await page.getByPlaceholder("금액 입력").nth(2).fill("200000000");
    await page.getByPlaceholder("금액 입력").nth(3).fill("780000000");
    await page.getByPlaceholder("금액 입력").nth(4).fill("260000000");
    // 안분비율 80.00% 자동 표시
    await expect(page.getByText(/안분비율: 80\.00%/)).toBeVisible();

    // Step2: 세부담상한 자동모드 + 직전 공시 14억 (직전공시는 getByLabel — 시가표준액 nth 충돌 회피)
    await page.getByTestId("cap-mode-auto").click();
    await page.getByLabel("직전연도 공시가격").nth(0).fill("1400000000");
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await calcAndWait(page);

    // 당해 ⑤ 납부할세액 = 1,367,616
    await expect(page.getByText(/1,367,616/).first()).toBeVisible({
      timeout: 30_000,
    });

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
