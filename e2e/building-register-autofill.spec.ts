/**
 * E2E: 건축물대장 자동조회 → 건물 기준시가 폼 자동채움 (/tools/building-standard-price)
 *
 * 검증:
 *   1. 자동채움 happy path(상증) — 구조·용도·연면적·신축연도
 *   2. 복합구조 모드 ON → 버튼 disabled
 *   3. 기계식주차 모드 ON → 소재지 카드(버튼) 숨김
 *   4. medium confidence → "확인 권장" 배지
 *   5. configMissing → 미설정 안내
 *   6. 매핑 불가(구조·용도 null) → "직접 선택" 안내 + 해당 필드 미채움(연면적은 채움)
 *   7. 양도시점 자동채움 + 취득시점(acq*) 미채움 (F10)
 *
 * 설계: docs/02-design/features/building-register-autofill.design.md §8.3
 */
import { test, expect, type Page } from "@playwright/test";

const URL = "/tools/building-standard-price";
const ADDR_ROAD = "서울 강남구 삼성로 212";

/** 주소 검색 + 동/호 units mock — 주소 선택 시 pnu(19자리) 세팅 */
async function mockAddressRoutes(page: Page) {
  await page.route("**/api/address/search**", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            pnu: "1168010600103160000",
            title: "서울 강남구 대치동 316",
            road: ADDR_ROAD,
            jibun: "서울 강남구 대치동 316",
            building: "은마아파트",
            zipcode: "06280",
            lng: "127.06",
            lat: "37.49",
          },
        ],
      },
    }),
  );
  await page.route("**/api/address/standard-price**", (route) =>
    route.fulfill({ json: { units: [] } }),
  );
}

/** 건축물대장 조회 mock — 시나리오별 응답 주입 */
async function mockBuildingRegister(page: Page, json: unknown) {
  await page.route("**/api/address/building-register**", (route) =>
    route.fulfill({ json }),
  );
}

/** 주소 선택(pnu 세팅) */
async function selectAddress(page: Page) {
  await page.getByPlaceholder(/도로명 또는 지번 주소/).fill("대치동 316");
  await page.getByText(ADDR_ROAD).click();
}

/** 상증 모드 + 평가연도 2023(조회 버튼 year 충족) */
async function setupInheritance2023(page: Page) {
  await page.getByText("상속·증여(1시점)").click();
  await page.getByLabel("연도", { exact: true }).fill("2023");
  await page.getByLabel("월", { exact: true }).fill("03");
  await page.getByLabel("일", { exact: true }).fill("15");
}

test("1. 건축물대장 조회 → 구조·용도·연면적·신축연도 자동채움 (상증)", async ({
  page,
}) => {
  await mockAddressRoutes(page);
  await mockBuildingRegister(page, {
    success: true,
    data: {
      structureKey: "rc",
      usageNo: 1,
      confidence: "high",
      floorArea: 200,
      builtYear: 2020,
      floorsAbove: 14,
      floorsBelow: 1,
    },
  });
  await page.goto(URL);
  await setupInheritance2023(page);
  await selectAddress(page);

  const lookupBtn = page.getByRole("button", { name: "건축물대장 조회" });
  await expect(lookupBtn).toBeEnabled();
  await lookupBtn.click();

  await expect(page.getByText(/자동 입력됨/)).toBeVisible();
  await expect(page.getByPlaceholder("신축연도 (4자리)")).toHaveValue("2020");
  await expect(page.getByPlaceholder("건물 연면적")).toHaveValue("200");
  await expect(page.getByText(/철근콘크리트조/).first()).toBeVisible();
  await expect(page.getByText(/아파트/).first()).toBeVisible();
  // high → 배지 없음
  await expect(page.getByText("확인 권장")).toHaveCount(0);
});

test("2. 복합구조 모드 ON → 조회 버튼 비활성(disabled 가드)", async ({
  page,
}) => {
  await mockAddressRoutes(page);
  await page.goto(URL);
  const btn = page.getByRole("button", { name: "건축물대장 조회" });
  await expect(btn).toBeVisible();
  await page.getByText("복합구조 (층·구역별 구조·용도 상이)").click();
  await expect(btn).toBeDisabled();
});

test("3. 기계식주차 모드 ON → 소재지 카드(조회 버튼) 숨김", async ({ page }) => {
  await mockAddressRoutes(page);
  await page.goto(URL);
  await expect(
    page.getByRole("button", { name: "건축물대장 조회" }),
  ).toBeVisible();
  await page.getByText("기계식주차전용빌딩").click();
  await expect(
    page.getByRole("button", { name: "건축물대장 조회" }),
  ).toHaveCount(0);
});

test("4. medium confidence → '확인 권장' 배지", async ({ page }) => {
  await mockAddressRoutes(page);
  await mockBuildingRegister(page, {
    success: true,
    data: {
      structureKey: "rc",
      usageNo: 29, // prefix 14 default = medium
      confidence: "medium",
      floorArea: 150,
      builtYear: 2019,
      floorsAbove: 5,
      floorsBelow: 1,
    },
  });
  await page.goto(URL);
  await setupInheritance2023(page);
  await selectAddress(page);
  await page.getByRole("button", { name: "건축물대장 조회" }).click();

  await expect(page.getByText(/자동 입력됨/)).toBeVisible();
  await expect(page.getByText("확인 권장")).toBeVisible();
});

test("5. configMissing → 미설정 안내", async ({ page }) => {
  await mockAddressRoutes(page);
  await mockBuildingRegister(page, {
    success: false,
    configMissing: true,
    error: "MOLIT_RTMS_API_KEY가 설정되지 않았습니다.",
  });
  await page.goto(URL);
  await setupInheritance2023(page);
  await selectAddress(page);
  await page.getByRole("button", { name: "건축물대장 조회" }).click();

  await expect(page.getByText(/API가 설정되지 않았습니다/)).toBeVisible();
});

test("6. 매핑 불가(구조·용도 null) → 직접 선택 안내 + 연면적만 채움", async ({
  page,
}) => {
  await mockAddressRoutes(page);
  await mockBuildingRegister(page, {
    success: true,
    data: {
      structureKey: null,
      usageNo: null,
      confidence: null,
      floorArea: 320,
      builtYear: 2018,
      floorsAbove: 3,
      floorsBelow: 0,
    },
    warnings: ["건물 구조를 대장에서 매핑할 수 없습니다(직접 선택)."],
  });
  await page.goto(URL);
  await setupInheritance2023(page);
  await selectAddress(page);
  await page.getByRole("button", { name: "건축물대장 조회" }).click();

  // 안내 + 공통 필드(연면적)는 채움
  await expect(page.getByText(/구조 직접 선택/)).toBeVisible();
  await expect(page.getByPlaceholder("건물 연면적")).toHaveValue("320");
  // 구조 Select는 미채움(placeholder 유지)
  await expect(page.getByText("구조 선택").first()).toBeVisible();
});

test("7. 양도시점 자동채움 + 취득시점(acq*) 미채움", async ({ page }) => {
  await mockAddressRoutes(page);
  await mockBuildingRegister(page, {
    success: true,
    data: {
      structureKey: "rc",
      usageNo: 1,
      confidence: "high",
      floorArea: 100,
      builtYear: 2015,
      floorsAbove: 14,
      floorsBelow: 1,
    },
  });
  await page.goto(URL);
  // 양도 기본 모드 — 취득·양도 연도 둘 다 2023(버튼 year=transferYear 충족)
  await page.getByText("연도 선택").first().click();
  await page.getByRole("option", { name: "2023년" }).first().click();
  await page.getByText("연도 선택").first().click();
  await page.getByRole("option", { name: "2023년" }).first().click();

  await selectAddress(page);
  const btn = page.getByRole("button", { name: "건축물대장 조회" });
  await expect(btn).toBeEnabled();
  await btn.click();

  await expect(page.getByText(/자동 입력됨/)).toBeVisible();
  // 양도시점만 채움 → 철근콘크리트조 1회(취득시점은 미채움 = 빈 placeholder)
  await expect(page.getByText(/철근콘크리트조/)).toHaveCount(1);
});
