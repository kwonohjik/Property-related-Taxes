import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 사례5 — 부부공동명의 1주택(§10의2) + 지방저가주택(§8④4호) + 직전 §8④ 안분
 *
 * 교재 제3편 종합부동산세 사례5 (2022 귀속, 부부 공동명의 1세대1주택자 특례 신청, 70세)
 *   - 당해: 성동 15억(부부합산) + 세종 2억(지방저가) → 11억 의제 → ⑤ 969,711
 *   - 직전(2021): 1세대1주택 의제(11억) + 주택별 재산세 합산 + §9⑦ §8④ 안분 고령자 공제
 *     · 직전 주택별 공시 성동 13억·세종 1.95억
 *     · 직전 종부세상당액 1,182,305 (§9⑦ 안분 13억/14.95억 × 직전 69세 30%)
 *
 * worktree: E2E_PORT=3003 npx playwright test e2e/comprehensive-case5.spec.ts
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

test.describe("종합부동산세 사례5 — 부부특례+지방저가+직전 §8④ 안분", () => {
  test("C5-E1: 사례5 — ⑤ 969,711 + 직전 종부세상당액 1,182,305(§9⑦ 안분)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);

    // Step1: 2022 + §10의2 부부특례(두 번째 switch) + 70세(1952-01-01)·취득 2018-01-01
    await page.getByRole("radio", { name: "2022" }).check();
    await page.getByRole("switch").nth(1).click();
    await page.getByLabel("연도").first().fill("1952");
    await page.getByLabel("월").first().fill("1");
    await page.getByLabel("일").first().fill("1");
    await page.getByLabel("연도").nth(1).fill("2018");
    await page.getByLabel("월").nth(1).fill("1");
    await page.getByLabel("일").nth(1).fill("1");
    await clickNext(page); // → Step2

    // Step2: 성동 15억 + 세종 2억(지방저가 비수도권 §8④4호)
    await page.getByPlaceholder("금액 입력").first().fill("1500000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await page.getByPlaceholder("금액 입력").nth(1).fill("200000000");
    await page.getByPlaceholder("0.00").nth(1).fill("60");
    await page
      .locator('select:has(option[value="non_metro"])')
      .nth(1)
      .selectOption("non_metro");
    await page.getByRole("switch").last().click(); // 주택2 §8④ ON (마지막 주택의 마지막 switch — 분리 토글 추가에 견고)
    await page.getByRole("radio", { name: /지방 저가주택/ }).check();
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await clickNext(page); // → Step5

    // Step5: 자동모드 + 직전 주택별 공시(성동 13억, 세종 1.95억) + 직전 1세대1주택 토글
    await page.getByTestId("cap-mode-auto").click();
    await page.getByPlaceholder("0").nth(0).fill("1300000000");
    await page.getByPlaceholder("0").nth(1).fill("195000000");
    // Step5 switch: [0]당해 조정2주택(OFF) [1]직전 조정2주택(OFF) [2]직전 1세대1주택(ON)
    await expect(page.getByText("직전연도 1세대1주택자")).toBeVisible();
    await page.getByRole("switch").nth(2).click();
    await calcAndWait(page);

    // 당해 납부할세액 ⑤ = 969,711
    await expect(page.getByText(/969,711/).first()).toBeVisible({
      timeout: 30_000,
    });

    // 신고서 서식 펼침 → 직전 종부세상당액 1,182,305 (Buppyo5Sub §9⑦ 안분)
    await page.getByRole("button", { name: /신고서 서식/ }).click();
    await expect(page.getByText(/1,182,305/).first()).toBeVisible({
      timeout: 10_000,
    });

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
