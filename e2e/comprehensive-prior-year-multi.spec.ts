import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, addHouse, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종합부동산세 — 직전연도 자동계산 다주택 중과세율 (사례4) E2E
 *
 * 교재 제3편 종합부동산세 사례4 "일시적 1세대 2주택자(=1세대1주택)" 2022 귀속
 *   - 당해: 2주택(13억 + 일시적2주택 14억) → §8④2호 의제(11억·일반 1.2%) → ⑤ 6,464,123
 *   - 직전(2021): 일시적2주택 특례 미적용 → 일반 2주택 조정 중과 3.6%
 *     · 직전 주택별 공시 12억·13억 → 재산세상당액 4,740,000(주택별 합산)
 *     · 종부세 과표 18.05억(25억−6억, FMR95%) × 3.6% = 43,380,000
 *     · 직전 종부세상당액 39,556,223 · 총상당액(나) 44,296,223
 *
 * worktree: E2E_PORT=3003 npx playwright test e2e/comprehensive-prior-year-multi.spec.ts
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

test.describe("종합부동산세 사례4 — 직전연도 다주택 중과 자동계산", () => {
  test("PYM-E1: 사례4 — ⑤ 6,464,123 + 직전 종부세상당액 39,556,223(중과 3.6%)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);

    // Step1: 2022, 1세대1주택 OFF (기본 — 일시적2주택 의제는 §8④로 자동)
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // Step2: 주택1 공시 13억 (모달 안 금액 first)
    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("1300000000");
    await closeHouseModal(page);
    // 주택2 추가 + 공시 14억 (모달 안 금액 first)
    await addHouse(page);
    await page.getByPlaceholder("금액 입력").first().fill("1400000000");
    // 주택2 §8④ ToggleCard ON — 고급 옵션 펼친 뒤 모달 안 마지막 switch(§8④ 의제)
    await expandHouseAdvanced(page);
    await page.getByRole("dialog").getByRole("switch").last().click();
    // 일시적 2주택 (§8④2호) 라디오 (신규취득일은 검증 전용 optional — 미입력) — 모달 안
    await page.getByRole("dialog").getByRole("radio", { name: /일시적 2주택/ }).check();
    await closeHouseModal(page);

    // Step2: 자동계산 모드 (공통설정·모달 밖, 직전 공시 단일 입력원)
    await page.getByTestId("cap-mode-auto").click();
    // 당해 2주택 → 주택별 직전 공시 입력 (각 주택 모달을 따로 열어서 → 모달 안 .first())
    await openHouseModal(page, 0);
    await page.getByLabel("직전연도 공시가격").first().fill("1200000000");
    await closeHouseModal(page);
    await openHouseModal(page, 1);
    await page.getByLabel("직전연도 공시가격").first().fill("1300000000");
    await closeHouseModal(page);
    // 직전연도 조정대상지역 2주택 토글 ON (공통설정·모달 밖)
    //   auto 모드섹션 switch 순서: [0] 당해 조정2주택(OFF 유지) [1] 직전 조정2주택 [2] 직전 1세대1주택
    await expect(
      page.getByText("직전연도 조정대상지역 2주택 이상"),
    ).toBeVisible();
    await page.getByRole("switch").nth(1).click();
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await calcAndWait(page);

    // 당해 납부할세액 ⑤ = 6,464,123
    await expect(page.getByText(/6,464,123/).first()).toBeVisible({
      timeout: 30_000,
    });

    // 신고서 서식 펼침 → 직전 종부세상당액 39,556,223 (Buppyo5Sub)
    await page.getByRole("button", { name: /신고서 서식/ }).click();
    await expect(page.getByText(/39,556,223/).first()).toBeVisible({
      timeout: 10_000,
    });
    // 직전 재산세상당액 4,740,000 (주택별 합산)
    await expect(page.getByText(/4,740,000/).first()).toBeVisible();

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });

  test("REGR: 사례2 단일 주택 자동 — 294,923 (신규 필드 추가 후 회귀)", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(PAGE);

    // Step1: 2022, 1세대1주택 OFF
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // Step2: 단일 주택 공시 10억 + 감면율 25% + 자동모드 + 단일 직전 공시 9억
    //   공시·감면율은 모달 안 (모달엔 한 주택만 → .first())
    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("1000000000");
    await page.getByPlaceholder("숫자 입력").nth(1).fill("25");
    await closeHouseModal(page);
    // 자동모드 (공통설정·모달 밖)
    await page.getByTestId("cap-mode-auto").click();
    // 직전 공시 9억 — 주택 모달을 열어서 입력 (모달 안 .first())
    await openHouseModal(page, 0);
    await page.getByLabel("직전연도 공시가격").first().fill("900000000");
    await closeHouseModal(page);
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await calcAndWait(page);

    await expect(page.getByText(/294,923/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
