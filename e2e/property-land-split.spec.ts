/**
 * 재산세 토지 — 별도합산·종합합산 분류별 합산 과세(PSA-E4) E2E (재산세 토지 E2E 첫 spec)
 *
 * 1. S-1 철거 1년 초과(PSA-U1: 철거된 것의 종류 «건축물» 선택 — 기간 밖이라 그 밖의 사실 칸은 묻지 않는다) 상업 300㎡ 전량 이관 → 총 납부세액 960,000 · 카드 «종합합산 이관분 800,000»
 * 2. S-5 공업 1,000㎡·바닥 100 + 타 종합합산 2억 → 3,063,000 · 요청 body에 합산 칸 도달
 * 3. S-7 별도합산 + 직전 과세표준 재산정 → 900,000 (상한 750,000) · body에 recompute 칸 도달
 * 4. 합산 칸 빈칸 → 화면 차단(서버 호출 0)
 * 5. StepIndicator 우회 → 계산 직전 재검증이 구체 문구로 차단(서버 400 «입력값이 올바르지 않습니다.» 아님)
 * 6. 직접 종합합산 + 타 종합합산 1억 → 1,035,000
 *
 * 세액 오라클: docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md §13.4.
 * 실행: E2E_PORT=3161 npx playwright test e2e/property-land-split.spec.ts
 */
import { test, expect } from "@playwright/test";
import {
  YEAR,
  amountInput,
  calc,
  captureBody,
  exact,
  fillAmount,
  fillSeparateDetail,
  pickLandType,
  startLand,
  totalPayable,
} from "./_helpers/property-land";

test.describe("재산세 토지 — 분류별 합산 과세(PSA-E4)", () => {
  test("1: S-1 철거 1년 초과 상업 300㎡ 전량 이관 → 총 960,000", async ({ page }) => {
    const box = captureBody(page);
    await startLand(page, "300000000");
    await pickLandType(page, /별도합산과세대상/);
    await fillSeparateDetail(page, { areaBasis: "absent", zoning: /상업지역/, area: "300", floor: "100", demolished: { date: `${YEAR - 2}-01-01`, kind: "building" } });
    // 전량 이관 → 종합합산 칸만 노출
    await expect(page.getByTestId("other-comprehensive-value")).toBeVisible();
    await expect(page.getByTestId("other-separate-aggregate-value")).toHaveCount(0);
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "0");
    await calc(page);

    await expect(page.getByTestId("land-split-row-comprehensive")).toContainText("800,000");
    await expect(page.getByTestId("land-split-row-total")).toContainText("800,000");
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    expect(box.bodies[0]).toMatchObject({ otherComprehensiveValue: 0 });
    expect(box.bodies[0]).not.toHaveProperty("otherSeparateAggregateValue");
  });

  test("2: S-5 공업 1,000㎡·바닥 100 + 타 종합합산 2억 → 총 3,063,000", async ({ page }) => {
    const box = captureBody(page);
    await startLand(page, "1000000000");
    await pickLandType(page, /별도합산과세대상/);
    await fillSeparateDetail(page, { areaBasis: "required", zoning: /공업지역/, area: "1000", floor: "100", permit: "yes" });
    await fillAmount(page, page.getByTestId("other-separate-aggregate-value"), "0");
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "200000000");
    await calc(page);

    await expect(page.getByTestId("land-split-row-separate")).toContainText("640,000");
    await expect(page.getByTestId("land-split-row-comprehensive")).toContainText("1,912,500");
    await expect(totalPayable(page)).toHaveText(exact("3,063,000"));
    expect(box.bodies[0]).toMatchObject({ otherSeparateAggregateValue: 0, otherComprehensiveValue: 200_000_000 });
  });

  test("3: S-7 별도합산 + 직전 과세표준 재산정(1.5억) → 상한 750,000 · 총 900,000", async ({ page }) => {
    const box = captureBody(page);
    await startLand(page, "300000000");
    await pickLandType(page, /별도합산과세대상/);
    await fillSeparateDetail(page, { areaBasis: "absent", zoning: /상업지역/, area: "300", floor: "100", demolished: { date: `${YEAR - 2}-01-01`, kind: "building" } });
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "0");
    // 별도합산에도 재산정 선택지가 열려 있고, 직접 입력 선택 시 상한 미적용 안내가 보인다
    await expect(page.getByText(/세부담상한에 쓰지 않습니다/)).toBeVisible();
    await page.getByRole("radio", { name: /직전연도 과세표준으로 재산정/ }).check();
    await fillAmount(page, amountInput(page, /직전연도 과세표준/), "150000000");
    await calc(page);

    await expect(page.getByTestId("land-split-cap-result")).toContainText("750,000");
    await expect(totalPayable(page)).toHaveText(exact("900,000"));
    expect(box.bodies[0]).toMatchObject({ taxCapMode: "recompute", previousYearTaxBase: 150_000_000 });
  });

  test("4: 합산 칸 빈칸 → 화면이 막고 서버 호출 0", async ({ page }) => {
    const box = captureBody(page);
    await startLand(page, "300000000");
    await pickLandType(page, /별도합산과세대상/);
    await fillSeparateDetail(page, { areaBasis: "required", zoning: /상업지역/, area: "300", floor: "100", permit: "yes" });
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    await expect(page.getByText(/같은 지방자치단체 관할구역에서 이 토지 외에 소유한 별도합산과세대상/)).toBeVisible();
    expect(box.bodies).toHaveLength(0);
  });

  test("5: StepIndicator로 step 3 점프 → 계산 직전 재검증이 구체 문구로 차단", async ({ page }) => {
    const box = captureBody(page);
    await page.goto("/calc/property-tax");
    await page.getByRole("radio", { name: "토지" }).check();
    // 공시가격·토지 유형 미입력 상태에서 마지막 단계(전년도 세액)로 점프
    await page.getByRole("button", { name: "전년도 세액 단계로 이동" }).click();
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    await expect(page.getByText("공시가격을 입력하세요.")).toBeVisible();
    await expect(page.getByText("입력값이 올바르지 않습니다.")).toHaveCount(0);
    expect(box.bodies).toHaveLength(0);
  });

  test("5b: 공시가격만 입력하고 토지 유형 미선택 → step 3 점프 시 step 1 오류로 복귀", async ({ page }) => {
    const box = captureBody(page);
    await page.goto("/calc/property-tax");
    await page.getByRole("radio", { name: "토지" }).check();
    await fillAmount(page, amountInput(page, /^공시가격/), "300000000");
    await page.getByRole("button", { name: "전년도 세액 단계로 이동" }).click();
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    await expect(page.getByText("토지 과세 유형을 선택하세요.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "토지 과세 유형" })).toBeVisible();
    expect(box.bodies).toHaveLength(0);
  });

  test("6: 직접 종합합산 + 타 종합합산 1억 → 합산이 세액을 바꾼다(1,035,000)", async ({ page }) => {
    const box = captureBody(page);
    await startLand(page, "300000000");
    await pickLandType(page, /종합합산과세대상/);
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "100000000");
    await calc(page);
    await expect(page.getByTestId("land-split-row-comprehensive")).toContainText("862,500");
    await expect(totalPayable(page)).toHaveText(exact("1,035,000"));
    expect(box.bodies[0]).toMatchObject({ landTaxType: "comprehensive_aggregate", otherComprehensiveValue: 100_000_000 });
  });

  test("7: 375px — 결과 카드·합산 칸 가로 넘침 없음", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await startLand(page, "1000000000");
    await pickLandType(page, /별도합산과세대상/);
    await fillSeparateDetail(page, { areaBasis: "required", zoning: /공업지역/, area: "1000", floor: "100", permit: "yes" });
    const overflowStep3 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowStep3).toBe(false);
    await fillAmount(page, page.getByTestId("other-separate-aggregate-value"), "0");
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "200000000");
    await calc(page);
    const overflowResult = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowResult).toBe(false);
  });
});
