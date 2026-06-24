/**
 * 재산세 도시지역분(§112) 용도지역 자동조회 E2E
 *
 * 1. 주소 미입력 → 자동조회 버튼 disabled + 안내문구
 * 2. 주소 선택 → 자동조회(urban 모킹) → 안내칩 + 원클릭 적용 → 도시지역 토글 ON
 * 3. 자동조회(non_urban 모킹) → OFF 유지 권장 메시지, 토글 미변경
 *
 * V-World는 전부 네트워크 모킹(키·외부 비의존).
 * 실행: npx playwright test e2e/property-urban-area-lookup.spec.ts
 *
 * 계획서: docs/00-pm/property-urban-area-auto-lookup.plan.md §7
 */

import { test, expect, type Page } from "@playwright/test";

const ADDR_PLACEHOLDER = "도로명 또는 지번 주소 입력 (예: 테헤란로 123)";

async function mockAddressSearch(page: Page) {
  await page.route("**/api/address/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            pnu: "1168010100107360000",
            title: "역삼동 736",
            road: "서울 강남구 테헤란로 152",
            jibun: "서울 강남구 역삼동 736",
            building: "",
            zipcode: "",
            lng: "127.0367",
            lat: "37.5006",
          },
        ],
      }),
    }),
  );
  // 동/호 units 조회는 빈 응답 (housing 선택 시 호출될 수 있음)
  await page.route("**/api/address/standard-price**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "PRICE_NOT_FOUND" } }),
    }),
  );
}

function mockLandUseZone(page: Page, verdict: "urban" | "non_urban") {
  const body =
    verdict === "urban"
      ? {
          uname: "제3종일반주거지역",
          verdict: "urban",
          suggestUrbanToggle: true,
          allZones: ["제3종일반주거지역"],
          source: "vworld_uq111",
        }
      : {
          uname: "계획관리지역",
          verdict: "non_urban",
          suggestUrbanToggle: false,
          allZones: ["계획관리지역"],
          source: "vworld_uq111",
        };
  return page.route("**/api/address/land-use-zone**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

test.describe("재산세 도시지역분 용도지역 자동조회 §112", () => {
  test("1: 주소 미입력 → 자동조회 버튼 disabled + 안내문구", async ({ page }) => {
    await page.goto("/calc/property-tax");
    const btn = page.getByTestId("urban-area-lookup-button");
    await expect(btn).toBeDisabled();
    await expect(
      page.getByText(/소재지\(주소\)를 먼저 입력하면/),
    ).toBeVisible();
  });

  test("2: 주소 선택 → urban 조회 → 원클릭 적용 → 도시지역 토글 ON", async ({
    page,
  }) => {
    await mockAddressSearch(page);
    await mockLandUseZone(page, "urban");

    await page.goto("/calc/property-tax");

    // 도시지역 토글 초기 OFF
    const toggle = page.getByRole("switch", { name: "도시지역 내 소재" });
    await expect(toggle).not.toBeChecked();

    // 주소 검색 → 결과 선택 → jibun 채움
    await page.getByPlaceholder(ADDR_PLACEHOLDER).fill("테헤란로 152");
    await page.getByRole("button", { name: /역삼동 736/ }).click();

    // 자동조회 → urban 안내칩
    await page.getByTestId("urban-area-lookup-button").click();
    await expect(page.getByTestId("urban-area-result-urban")).toContainText(
      "제3종일반주거지역",
    );

    // 원클릭 적용 → 토글 ON
    await page.getByTestId("urban-area-apply-button").click();
    await expect(toggle).toBeChecked();
  });

  test("3: non_urban 조회 → OFF 유지 권장, 토글 미변경", async ({ page }) => {
    await mockAddressSearch(page);
    await mockLandUseZone(page, "non_urban");

    await page.goto("/calc/property-tax");
    const toggle = page.getByRole("switch", { name: "도시지역 내 소재" });

    await page.getByPlaceholder(ADDR_PLACEHOLDER).fill("계획관리 지역");
    await page.getByRole("button", { name: /역삼동 736/ }).click();

    await page.getByTestId("urban-area-lookup-button").click();
    await expect(page.getByTestId("urban-area-result-non-urban")).toContainText(
      "계획관리지역",
    );
    await expect(toggle).not.toBeChecked();
  });
});
