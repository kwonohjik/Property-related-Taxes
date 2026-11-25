/**
 * 재산세 토지 — 분리과세(공장·목장) 면적 한도 초과분 «종합합산 이관 세액» E2E (PSE-U3).
 *
 * SE-1 공장 초과(F-1) 2,976,000 · SE-2 타 종합합산 2억(F-2) 3,096,000 · SE-3 목장(P-1) 133,874 · SE-4 이내(F-0) 불변 1,344,000
 * SE-5 합산 칸 빈칸 차단 · SE-6 면적을 줄이면 칸·body 키 사라짐(값 보존) · SE-7 Step 2 미완 StepIndicator 우회 · SE-8 375px·다크
 * SE-9 세부담상한 — direct(상한 미적용 고지) · recompute(F-3 1,890,000)
 *
 * 세액 오라클: docs/01-plan/features/property-separated-excess-transfer.engine.plan.md §3.2·§6 (손계산).
 * 실행: E2E_PORT=3217 npx playwright test e2e/property-separated-excess.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import {
  amountInput,
  calc,
  captureBody,
  exact,
  fillAmount,
  fillSeparatedFactory,
  fillSeparatedPasture,
  pickLandType,
  startLand,
  totalPayable,
} from "./_helpers/property-land";

const INDUSTRIAL = /산업단지·지정 공업지역 내/;

/** F-1: 공시가격 15억 · 산업단지 공장 부속토지 15,000㎡(기준 12,000㎡) → Step 3 */
async function toStep3Factory(page: Page, price = "1500000000", total = "15000") {
  await startLand(page, price);
  await pickLandType(page, /분리과세대상/);
  await fillSeparatedFactory(page, { location: INDUSTRIAL, total, floor: "1200", rate: "12" });
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe("재산세 토지 — 분리과세 면적 한도 초과분 종합합산 이관", () => {
  test("SE-1: F-1 공장 15,000㎡ 초과 3,000㎡ · 타 0 → 분리과세분 1,680,000 + 이관분 800,000 → 총 2,976,000", async ({ page }) => {
    const box = captureBody(page);
    await toStep3Factory(page);
    // Step 3: 왜 이 칸이 나왔는지(엔진 판정 값) + 종합합산 칸 하나만
    await expect(page.getByTestId("land-split-inputs-excess")).toContainText("공장입지기준면적 12,000㎡");
    await expect(page.getByTestId("land-split-inputs-excess")).toContainText("부속토지 15,000㎡");
    await expect(page.getByTestId("land-split-inputs-excess")).toContainText("초과 면적 3,000㎡");
    await expect(page.getByTestId("other-comprehensive-value")).toBeVisible();
    await expect(page.getByTestId("other-separate-aggregate-value")).toHaveCount(0);
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "0");
    await calc(page);

    await expect(page.getByTestId("land-split-separated-section")).toContainText("840,000,000");
    await expect(page.getByTestId("land-split-separated-area-limit")).toContainText("12,000㎡");
    await expect(page.getByTestId("land-split-row-separated")).toContainText("1,680,000");
    await expect(page.getByTestId("land-split-comprehensive")).toContainText("210,000,000");
    await expect(page.getByTestId("land-split-row-comprehensive")).toContainText("800,000");
    await expect(page.getByTestId("land-split-row-total")).toContainText("2,480,000");
    await expect(page.getByTestId("land-split-row-separate")).toHaveCount(0);
    await expect(totalPayable(page)).toHaveText(exact("2,976,000"));
    expect(box.bodies[0]).toMatchObject({
      landTaxType: "separated",
      otherComprehensiveValue: 0,
      separateTaxationItem: { isFactoryLand: true, factoryTotalLandArea: 15000 },
    });
    expect(box.bodies[0]).not.toHaveProperty("otherSeparateAggregateValue");
  });

  test("SE-2: F-2 타 종합합산 2억 → 합산 5억 → 몫 900,000 → 총 3,096,000", async ({ page }) => {
    const box = captureBody(page);
    await toStep3Factory(page);
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "200000000");
    await calc(page);
    await expect(page.getByTestId("land-split-comprehensive")).toContainText("500,000,000");
    await expect(page.getByTestId("land-split-row-comprehensive")).toContainText("900,000");
    await expect(page.getByTestId("land-split-row-total")).toContainText("2,580,000");
    await expect(totalPayable(page)).toHaveText(exact("3,096,000"));
    expect(box.bodies[0]).toMatchObject({ otherComprehensiveValue: 200_000_000 });
  });

  test("SE-3: P-1 목장 2,000㎡ · 한우 50마리 · 부대시설 → 분리과세분 15,312 + 이관분 96,250 → 총 133,874", async ({ page }) => {
    const box = captureBody(page);
    await startLand(page, "100000000");
    await pickLandType(page, /분리과세대상/);
    await fillSeparatedPasture(page, { total: "2000", livestock: /^한우\(육우\) 사육사업/, count: "50", facility: true });
    await expect(page.getByTestId("land-split-inputs-excess")).toContainText("가축별 기준면적 625㎡");
    await expect(page.getByTestId("land-split-inputs-excess")).toContainText("초과 면적 1,375㎡");
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "0");
    await calc(page);
    await expect(page.getByTestId("land-split-row-separated")).toContainText("15,312");
    await expect(page.getByTestId("land-split-row-comprehensive")).toContainText("96,250");
    await expect(page.getByTestId("land-split-row-total")).toContainText("111,562");
    await expect(totalPayable(page)).toHaveText(exact("133,874"));
    expect(box.bodies[0]).toMatchObject({
      otherComprehensiveValue: 0,
      separateTaxationItem: { isLivestockFarm: true, pastureTotalLandArea: 2000, pastureLivestockType: "hanwoo_breeding", pastureLivestockCount: 50 },
    });
  });

  test("SE-4: F-0 공장 8,000㎡(기준 이내) → 합산 칸·요약 줄·카드 없음 · 총 1,344,000(현행 불변) · body에 합산 칸 없음", async ({ page }) => {
    const box = captureBody(page);
    await toStep3Factory(page, "800000000", "8000");
    await expect(page.getByRole("heading", { name: "전년도 세액 (선택)" })).toBeVisible();
    await expect(page.getByTestId("land-split-inputs-excess")).toHaveCount(0);
    await expect(page.getByTestId("other-comprehensive-value")).toHaveCount(0);
    const resp = page.waitForResponse((r) => r.url().includes("/api/calc/property") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    expect((await resp).ok()).toBe(true);
    await expect(totalPayable(page)).toHaveText(exact("1,344,000"));
    await expect(page.getByTestId("property-land-split-card")).toHaveCount(0);
    expect(box.bodies[0]).not.toHaveProperty("otherComprehensiveValue");
  });

  test("SE-5: 합산 칸 빈칸 → ⑧ 문구로 차단 · 서버 호출 0", async ({ page }) => {
    const box = captureBody(page);
    await toStep3Factory(page);
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    await expect(page.getByText(/같은 지방자치단체 관할구역에서 이 토지 외에 소유한 종합합산과세대상/)).toBeVisible();
    expect(box.bodies).toHaveLength(0);
  });

  test("SE-6a: 면적을 줄여 초과 0이 되면 칸·카드가 사라지고 body에 합산 칸이 없다(stale 미전송)", async ({ page }) => {
    const box = captureBody(page);
    await toStep3Factory(page);
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "200000000");
    await page.getByRole("button", { name: /^이전$/ }).click();
    await page.getByTestId("pt-factory-total-area").fill("8000");
    await page.getByRole("button", { name: /^다음$/ }).click();
    await expect(page.getByTestId("other-comprehensive-value")).toHaveCount(0);
    const resp = page.waitForResponse((r) => r.url().includes("/api/calc/property") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    expect((await resp).ok()).toBe(true);
    await expect(page.getByTestId("property-land-split-card")).toHaveCount(0);
    expect(box.bodies[0]).not.toHaveProperty("otherComprehensiveValue");
  });

  test("SE-6b: 다시 15,000㎡로 늘리면 칸이 돌아오고 입력값이 보존된다", async ({ page }) => {
    await toStep3Factory(page);
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "200000000");
    await page.getByRole("button", { name: /^이전$/ }).click();
    await page.getByTestId("pt-factory-total-area").fill("8000");
    await page.getByRole("button", { name: /^다음$/ }).click();
    await expect(page.getByTestId("other-comprehensive-value")).toHaveCount(0);
    await page.getByRole("button", { name: /^이전$/ }).click();
    await page.getByTestId("pt-factory-total-area").fill("15000");
    await page.getByRole("button", { name: /^다음$/ }).click();
    await expect(page.getByTestId("other-comprehensive-value")).toHaveValue("200,000,000");
  });

  test("SE-7: Step 2 면적을 비운 채 StepIndicator로 Step 3 → 합산 카드 없음 · 계산 시 Step 2 문구로 차단(서버 호출 0)", async ({ page }) => {
    const box = captureBody(page);
    await startLand(page, "1500000000");
    await pickLandType(page, /분리과세대상/);
    await fillSeparatedFactory(page, { location: INDUSTRIAL, next: false });
    await page.getByRole("button", { name: "전년도 세액 단계로 이동" }).click();
    await expect(page.getByTestId("other-comprehensive-value")).toHaveCount(0);
    await expect(page.getByTestId("land-split-inputs-pending")).toHaveCount(0);
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    await expect(page.getByText("입력값이 올바르지 않습니다.")).toHaveCount(0);
    await expect(page.getByTestId("pt-factory-total-area")).toBeVisible(); // Step 2로 복귀
    expect(box.bodies).toHaveLength(0);
  });

  test("SE-8: 375px — Step 3 카드·결과 카드 가로 넘침 없음 (라이트·다크)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await toStep3Factory(page);
      expect(await overflow(page)).toBe(false);
      await fillAmount(page, page.getByTestId("other-comprehensive-value"), "200000000");
      await calc(page);
      await expect(page.getByTestId("land-split-separated-section")).toBeVisible();
      expect(await overflow(page)).toBe(false);
    }
  });

  test("SE-9a: 직전연도 세액 직접 입력 → 상한 미적용 안내 + 카드 고지 · 총 2,976,000 그대로", async ({ page }) => {
    const box = captureBody(page);
    await toStep3Factory(page);
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "0");
    await expect(page.getByTestId("land-split-direct-cap-note")).toContainText("세부담상한에 쓰지 않습니다");
    await fillAmount(page, amountInput(page, /전년도 재산세 납부액/), "1000000");
    await calc(page);
    await expect(page.getByTestId("land-split-notices")).toContainText("세부담상한(150%)을 적용하지 않았습니다");
    await expect(totalPayable(page)).toHaveText(exact("2,976,000"));
    expect(box.bodies[0]).toMatchObject({ previousYearTax: 1_000_000 });
  });

  test("SE-9b: 직전 과세표준 재산정(5억, F-3) → 직전 세액상당액 1,050,000 → 상한 1,575,000 · 총 1,890,000", async ({ page }) => {
    const box = captureBody(page);
    await toStep3Factory(page);
    await fillAmount(page, page.getByTestId("other-comprehensive-value"), "0");
    await page.getByRole("radio", { name: /직전연도 과세표준으로 재산정/ }).check();
    await fillAmount(page, amountInput(page, /직전연도 과세표준/), "500000000");
    await calc(page);
    await expect(page.getByTestId("land-split-cap")).toContainText("직전연도 분리과세분 세액상당액");
    await expect(page.getByTestId("land-split-cap-result")).toContainText("1,575,000");
    await expect(totalPayable(page)).toHaveText(exact("1,890,000"));
    expect(box.bodies[0]).toMatchObject({ taxCapMode: "recompute", previousYearTaxBase: 500_000_000 });
    expect(box.bodies[0]).not.toHaveProperty("previousYearTax");
  });
});
