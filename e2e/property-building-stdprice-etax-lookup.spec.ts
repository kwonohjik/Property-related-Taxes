/**
 * 재산세 비주거용 건축물 시가표준액 서울 ETAX 자동조회 E2E
 *
 * 1. 주소 미선택 → 조회 버튼 disabled + 안내문구
 * 2. 서울 주소 선택 → 조회(etax 모킹) → 시가표준액 계(225,037,140,965) 채움 + 건축물/시설 내역
 * 3. 비서울 주소 선택 → 조회 버튼 disabled + "서울만 조회 가능" 안내
 *
 * 외부(Vworld 주소검색·ETAX)는 전부 네트워크 모킹(키·외부 비의존).
 * 실행: E2E_PORT=3120 npx playwright test e2e/property-building-stdprice-etax-lookup.spec.ts
 *
 * 계획서: docs/02-design/features/property-building-nonresidential-stdprice-etax-lookup.plan.md §11 P3
 */

import { test, expect, type Page } from "@playwright/test";

const ADDR_PLACEHOLDER = "도로명 또는 지번 주소 입력 (예: 테헤란로 123)";

/** RadioCardGroup 카드를 라벨 텍스트로 클릭 */
function radioCard(page: Page, labelText: string | RegExp) {
  return page.locator("label").filter({ hasText: labelText }).first();
}

/** 공시가격 섹션의 금액 입력(CurrencyInput) */
function publishedPriceInput(page: Page) {
  return page
    .locator("div")
    .filter({ hasText: /^공시가격/ })
    .locator('input[inputmode="numeric"]')
    .last();
}

async function mockAddressSearch(page: Page, pnu: string, jibun: string) {
  await page.route("**/api/address/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            pnu,
            title: jibun,
            road: "",
            jibun,
            building: "",
            zipcode: "",
            lng: "127.0",
            lat: "37.5",
          },
        ],
      }),
    }),
  );
  // 선택 시 fetchUnits(standard-price) 호출 — 빈 응답
  await page.route("**/api/address/standard-price**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "PRICE_NOT_FOUND" } }),
    }),
  );
}

async function mockEtaxAnchor(page: Page) {
  await page.route("**/api/address/building-standard-price-etax**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        results: [
          {
            no: "1",
            year: "2025",
            lot: "0737-0000",
            dongNo: "0000",
            ho: "00000",
            name: "강남구 역삼동 737",
            total: 225037140965,
            building: 223958545915,
            facility: 1078595050,
            area: 212615.29,
          },
        ],
      }),
    }),
  );
}

test.describe("재산세 비주거용 건축물 시가표준액 ETAX 조회", () => {
  test("1: 주소 미선택 → 조회 버튼 disabled + 안내", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await radioCard(page, "건축물 (비주거용)").click();

    await expect(page.getByTestId("etax-stdprice-lookup")).toBeDisabled();
    await expect(page.getByText(/물건 소재지를 검색·선택하면/)).toBeVisible();
  });

  test("2: 서울 주소 → 조회 → 시가표준액 계 채움 + 건축물/시설 내역", async ({
    page,
  }) => {
    await mockAddressSearch(page, "1168010100107370000", "서울 강남구 역삼동 737");
    await mockEtaxAnchor(page);

    await page.goto("/calc/property-tax");
    await radioCard(page, "건축물 (비주거용)").click();

    await page.getByPlaceholder(ADDR_PLACEHOLDER).fill("역삼동 737");
    await page.getByRole("button", { name: /역삼동 737/ }).click();

    const btn = page.getByTestId("etax-stdprice-lookup");
    await expect(btn).toBeEnabled();
    await btn.click();

    await expect(publishedPriceInput(page)).toHaveValue("225,037,140,965");
    await expect(
      page.getByText(/건축물 223,958,545,915원 \+ 시설 1,078,595,050원/),
    ).toBeVisible();
  });

  test("3: 비서울 주소 → 조회 버튼 disabled + 서울만 안내", async ({ page }) => {
    await mockAddressSearch(page, "2653010100100010000", "부산 사상구 감전동 1");

    await page.goto("/calc/property-tax");
    await radioCard(page, "건축물 (비주거용)").click();

    await page.getByPlaceholder(ADDR_PLACEHOLDER).fill("감전동");
    await page.getByRole("button", { name: /감전동/ }).click();

    await expect(page.getByTestId("etax-stdprice-lookup")).toBeDisabled();
    await expect(page.getByText(/서울 소재 건축물만/)).toBeVisible();
  });
});
