import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 §3①2호 — 2020.2.11. 전 세무서에만 등록한 다가구(T-14 · 부칙<제30404호> 제6조) 폼 → 결과.
 * 다가구 층별 입력 켜기 → 합산배제 2호 → 토글 ON → 구별 공시가격 → 계산 → ④ 본문(지자체 날짜 없음 · deemedMultiFamily) → 결과 근거 경고.
 * 2025 과세 · 건물 7.5억 · 3구 각 40㎡·2.5억 · 세무서 2015-03-01 · 임대개시 2015-07-01 · 전환 없음.
 * 토글 OFF에서는 지자체 등록일 칸이 그대로(날짜 칸 개수 불변 — 기존 spec의 `getByLabel("연도").first()` 가정 보호).
 *
 * worktree 실행: E2E_PORT=3104 npx playwright test e2e/comprehensive-rental-multifamily-deemed.spec.ts
 */
const TOGGLE = "comprehensive-deemed-multifamily-toggle";

async function toStep3(page: Page) {
  await page.goto("/calc/comprehensive-tax");
  await page.getByRole("radio", { name: "2025" }).check();
  await page.getByRole("button", { name: /^다음/ }).click();
  await openHouseModal(page, 0);
  await page.getByPlaceholder("금액 입력").first().fill("750000000");
  await page.getByPlaceholder("0.00").first().fill("150");
  await expandHouseAdvanced(page);
  // 다가구 층별(구별) 면적 입력 ON → 3행
  await page.getByText("다가구주택 층별(구별) 면적 입력").click();
  await page.getByPlaceholder("전용면적").nth(0).fill("40");
  await page.getByRole("button", { name: /구별\(층별\) 추가/ }).click();
  await page.getByPlaceholder("전용면적").nth(1).fill("40");
  await page.getByRole("button", { name: /구별\(층별\) 추가/ }).click();
  await page.getByPlaceholder("전용면적").nth(2).fill("40");
  await page
    .getByRole("dialog")
    .locator('select:has(option[value="private_purchase_rental_short"])')
    .selectOption("private_purchase_rental_short");
  await closeHouseModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.locator('select:has(option[value="private_purchase_short"])')).toHaveValue("private_purchase_short");
}

async function fillDate(scope: ReturnType<Page["getByTestId"]>, y: string, m: string, d: string) {
  await scope.getByLabel("연도").fill(y);
  await scope.getByLabel("월").fill(m);
  await scope.getByLabel("일", { exact: true }).fill(d);
}

test("MFD-E2E-1: 토글 ON → 구별 공시가격 → 성립 · 지자체 날짜 미전송 · 결과에 근거 경고", async ({ page }) => {
  test.setTimeout(120_000);
  await toStep3(page);
  await page.getByTestId(TOGGLE).getByRole("switch").click();
  // 지자체 등록일 칸은 사라진다
  await expect(page.getByText("지방자치단체 임대사업자 등록증의 등록일")).toHaveCount(0);
  await page.getByTestId("comprehensive-deemed-no-conversion-yes").check();
  for (const i of [0, 1, 2]) await page.getByTestId(`comprehensive-deemed-unit-value-${i}`).fill("250000000");
  await fillDate(page.getByTestId("comprehensive-business-registration-date"), "2015", "3", "1");
  await fillDate(page.getByTestId("comprehensive-rental-start-date"), "2015", "7", "1");
  await page.getByRole("button", { name: /^다음/ }).click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.ok()).toBe(true);
  const body = r.request().postDataJSON() as { properties: { rentalInfo: Record<string, unknown> }[] };
  const info = body.properties[0].rentalInfo;
  expect(info).not.toHaveProperty("rentalRegistrationDate");
  expect(info).toMatchObject({
    registrationType: "private_purchase_short",
    businessRegistrationDate: "2015-03-01",
    deemedMultiFamily: {
      units: [
        { label: "구분1", area: 40, assessedValue: 250_000_000 },
        { label: "구분2", area: 40, assessedValue: 250_000_000 },
        { label: "구분3", area: 40, assessedValue: 250_000_000 },
      ],
      noConversionAfterCutoff: true,
    },
  });
  await expect(page.getByText(/지자체 임대사업자 등록 없이 세무서 사업자등록만으로 합산배제/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toHaveCount(0);
});

test("MFD-E2E-2: 토글 OFF 기본 화면 — 날짜 칸 개수 불변 · ON이면 지자체 칸 1개 감소 · 다시 OFF면 복귀", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);
  const years = page.getByLabel("연도");
  const off = await years.count();
  expect(off).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("지방자치단체 임대사업자 등록증의 등록일")).toBeVisible();
  const sw = page.getByTestId(TOGGLE).getByRole("switch");
  await sw.click();
  await expect(years).toHaveCount(off - 1);
  await sw.click();
  await expect(years).toHaveCount(off);
});
