/**
 * E2E: 합산배제 추징 계산기 (종합부동산세법 §17⑤1호 · 시행령 §10) — `/calc/comprehensive-recapture`
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6.6
 * 🔑 엔진·컴포넌트 단위 테스트로는 못 잡는 것: 폼 → ④ 변환 → fetch body → Zod → route → 결과 표시 전체 경로.
 *    ①은 네트워크 요청 body를 직접 확인한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";

const API = "**/api/calc/comprehensive-recapture";

async function open(page: Page) {
  await page.goto("/calc/comprehensive-recapture");
  await page.getByRole("heading", { name: "합산배제 추징 계산기" }).waitFor();
  // hydration 전 입력은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="rc-calc"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function fillRow(page: Page, i: number, year: string, amount: string) {
  await page.getByTestId(`rc-year-${i}`).fill(year);
  await page.getByTestId(`rc-amount-${i}`).fill(amount);
  await expect(page.getByTestId(`rc-year-${i}`)).toHaveValue(year);
}

async function fillNotice(page: Page, year: string, month: string, day: string) {
  await fillDateAndVerify(page, { year, month, day }, { scope: page.getByTestId("rc-notice-date") });
}

test.describe("합산배제 추징 계산기 (§17⑤1호 · 시행령 §10)", () => {
  test("RC-E2E-1: 사유 없음 · 2행 — 요청 body · 금액 · 구간 하위 행 · 기산일 이월 설명", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);

    await fillRow(page, 0, "2018", "1000000");
    await page.getByTestId("rc-add-row").click();
    await expect(page.getByTestId("rc-row-1")).toBeVisible();
    await fillRow(page, 1, "2021", "1000000");
    await fillNotice(page, "2024", "12", "1");

    const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/comprehensive-recapture") && r.method() === "POST");
    await page.getByTestId("rc-calc").click();
    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      noticeDate: "2024-12-01",
      rows: [
        { taxYear: 2018, amount: 1_000_000 },
        { taxYear: 2021, amount: 1_000_000 },
      ],
      exemption: { reason: "other" },
    });

    // 2018년분 516,170 + 2021년분 239,870 = 756,040 (손계산: 계획서 §10.3)
    await expect(page.getByTestId("rc-result")).toBeVisible();
    await expect(page.getByTestId("rc-total-tax")).toHaveText("2,000,000");
    await expect(page.getByTestId("rc-interest")).toHaveText("756,040");
    await expect(page.getByTestId("rc-total-payable")).toHaveText("2,756,040");

    // 구간이 갈리는 해는 하위 행으로 풀어 쓴다
    await expect(page.getByTestId("rc-annual-2018")).toContainText("2018.12.18.");
    await expect(page.getByTestId("rc-seg-2018-0")).toContainText("2018.12.18.~2019.2.11.");
    await expect(page.getByTestId("rc-seg-2018-0")).toContainText("56일");
    await expect(page.getByTestId("rc-seg-2018-0")).toContainText("1일 10만분의 30");
    await expect(page.getByTestId("rc-seg-2018-2")).toContainText("1일 10만분의 22");
    await expect(page.getByTestId("rc-seg-2021-0")).toContainText("2021.12.16.~2022.2.14.");
    await expect(page.getByTestId("rc-deadline-carry")).toContainText("납부기한 2018.12.17.(12.15.이 토요일 · 12.16.이 일요일) 다음 날");
    await expect(page.getByTestId("rc-notices")).toContainText("확인 필요");

    await expectNoPageHScroll(page);
  });

  test("RC-E2E-2: §10③2호 — 자동말소(§6⑤)는 「추징하지 않음」 · 금액 0 · 근거와 입력 사실", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);

    await page.getByTestId("rc-reason-registration_cancelled").click();
    await expect(page.getByTestId("rc-reason-facts")).toBeVisible();
    await page.getByTestId("rc-cancel-6⑤").click();
    await fillRow(page, 0, "2023", "1000000");
    await fillNotice(page, "2026", "11", "1");

    const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/comprehensive-recapture") && r.method() === "POST");
    await page.getByTestId("rc-calc").click();
    expect((await reqPromise).postDataJSON().exemption).toEqual({ reason: "registration_cancelled", cancelClause: "6⑤" });

    await expect(page.getByTestId("rc-exempt")).toBeVisible();
    await expect(page.getByTestId("rc-exempt")).toContainText("시행령 §10③2호");
    await expect(page.getByTestId("rc-total-tax")).toHaveText("0");
    await expect(page.getByTestId("rc-interest")).toHaveText("0");
    await expect(page.getByTestId("rc-facts")).toContainText("§6⑤");
    await expect(page.getByTestId("rc-annual-table")).toHaveCount(0);
    await expect(page.getByTestId("rc-total-payable")).toHaveCount(0);
  });

  test("RC-E2E-3: 입력 오류는 서버에 보내지 않는다 — 빈 폼 · 연도 중복 · 고지일이 납부기한 이전 → 요청 0건", async ({ page }) => {
    test.setTimeout(90_000);
    let calls = 0;
    await page.route(API, async (route) => {
      calls++;
      await route.continue();
    });
    await open(page);

    // 빈 폼
    await page.getByTestId("rc-calc").click();
    await expect(page.getByTestId("rc-errors")).toContainText("고지일을 입력하세요");
    await expect(page.getByTestId("rc-errors")).toContainText("과세연도를 입력하세요");

    // 연도 중복
    await fillRow(page, 0, "2021", "1000000");
    await page.getByTestId("rc-add-row").click();
    await fillRow(page, 1, "2021", "2000000");
    await fillNotice(page, "2024", "12", "1");
    await page.getByTestId("rc-calc").click();
    await expect(page.getByTestId("rc-errors")).toContainText("과세연도 2021이(가) 중복됩니다");

    // 고지일이 그해 납부기한 이전 — 2024년분 납부기한은 12.16.(12.15.이 일요일)이라 12.16. 고지는 이자 기간이 없다
    await page.getByTestId("rc-year-1").fill("2024");
    await fillNotice(page, "2024", "12", "16");
    await page.getByTestId("rc-calc").click();
    await expect(page.getByTestId("rc-errors")).toContainText("2024년분은 고지일이 그해 납부기한(2024.12.16.) 이전");

    expect(calls).toBe(0);
    await expect(page.getByTestId("rc-result")).toHaveCount(0);
  });
});
