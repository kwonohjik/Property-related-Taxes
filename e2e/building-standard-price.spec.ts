/**
 * E2E: 건물 기준시가 계산기 (독립 페이지 /tools/building-standard-price)
 *
 * 검증:
 *   1. 상속·증여 기본(U-01): 2025 평가·rc·아파트·공시지가 7,500,000 → 224,600,000 (BSP-01 anchor)
 *   2. 양도 2시점(U-02): 취득 2015 / 양도 2025 → 취득 81,300,000 / 양도 90,000,000 (BSP-06)
 *   3. 기계식주차(U-08): 토글 ON → 주차대수 50 → 255,000,000 (BSP-MECH)
 *   4. 검증 차단: 미입력 시 오류 메시지
 *
 * 설계: docs/02-design/features/building-standard-price.ui.design.md §11 DoD
 */
import { test, expect, type Page } from "@playwright/test";

const URL = "/tools/building-standard-price";

async function selectOption(page: Page, triggerText: string, optionName: string | RegExp) {
  await page.getByText(triggerText, { exact: false }).first().click();
  await page.getByRole("option", { name: optionName }).first().click();
}

test("상속·증여 기본 — 224,600,000 (BSP-01)", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();

  await page.getByPlaceholder("예: 2010").fill("2020"); // 신축연도
  await page.getByPlaceholder("건물 연면적").fill("200"); // 연면적

  await selectOption(page, "연도 선택", "2025년"); // 평가연도
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /아파트/);
  await page.getByPlaceholder("원/㎡").fill("7500000"); // 공시지가

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("224,600,000");
});

test("양도 2시점 — 취득 82,200,000 / 양도 90,000,000 (BSP-06)", async ({ page }) => {
  await page.goto(URL);
  // 기본이 양도 모드

  await page.getByPlaceholder("예: 2010").fill("2010"); // 신축연도
  await page.getByPlaceholder("건물 연면적").fill("100"); // 연면적

  // 취득 시점
  await selectOption(page, "연도 선택", "2015년"); // 취득연도(첫 연도 Select)
  await page.getByText("구조 선택").first().click();
  await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
  await page.getByText("용도 선택").first().click();
  await page.getByRole("option", { name: /아파트/ }).first().click();
  await page.getByPlaceholder("원/㎡").first().fill("5000000");

  // 양도 시점
  await selectOption(page, "연도 선택", "2025년");
  await page.getByText("구조 선택").first().click();
  await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
  await page.getByText("용도 선택").first().click();
  await page.getByRole("option", { name: /아파트/ }).first().click();
  await page.getByPlaceholder("원/㎡").nth(1).fill("7500000");

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("82,200,000"); // 2015년 50년버킷 잔존율 0.20
  await expect(result).toContainText("90,000,000");
});

test("기계식주차 — 255,000,000 (BSP-MECH)", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();
  await page.getByText("기계식주차전용빌딩").click(); // 토글 ON

  await page.getByPlaceholder("예: 2010").fill("2020"); // 신축연도
  await page.getByPlaceholder("예: 50").fill("50"); // 주차대수
  await selectOption(page, "연도 선택", "2025년"); // 평가연도

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("255,000,000");
});

test("검증 차단 — 미입력 시 오류", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();
  await page.getByRole("button", { name: "기준시가 계산하기" }).click();
  await expect(page.getByTestId("bsp-error")).toBeVisible();
});

test("복합구조 + 공용시설 안분 — 합계 187,640,000", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();

  await page.getByPlaceholder("예: 2010").fill("2000"); // 신축연도
  await selectOption(page, "연도 선택", "2026년"); // 평가연도 (부분 구조/용도 옵션 활성화 선행)

  await page.getByText("복합구조 (층·구역별 구조·용도 상이)").click(); // 토글 ON
  await page.getByPlaceholder("공용시설 면적 (없으면 비워두세요)").fill("90"); // → 공용 조정률 노출

  // 부분 1: 1층 슈퍼 (근생 #41, 조정 108, 공용 54)
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^41\./);
  await page.getByPlaceholder("부분 면적").fill("100");
  await page.getByPlaceholder("100").nth(0).fill("108"); // 조정률
  await page.getByPlaceholder("100").nth(1).fill("54"); // 공용 조정률

  // 부분 2: 2~3층 주택 (단독 #2, 조정 100, 공용 60)
  await page.getByRole("button", { name: "+ 부분 추가" }).click();
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^2\./);
  await page.getByPlaceholder("부분 면적").nth(1).fill("200");
  await page.getByPlaceholder("100").nth(2).fill("100"); // 부분2 조정률
  await page.getByPlaceholder("100").nth(3).fill("60"); // 부분2 공용 조정률

  await page.getByPlaceholder("원/㎡").fill("2500000"); // 단일 공시지가(위치지수)

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("187,640,000");
});

test("공동주택 고시 전 취득 환산 — 취득당시 128,660,408", async ({ page }) => {
  await page.goto(URL);
  // 기본 양도 모드

  await page.getByPlaceholder("예: 2010").fill("1998"); // 신축연도
  await page.getByText("공동주택 고시 전 취득 (취득당시 기준시가 환산)").click(); // 토글 ON (양도시점 숨김)
  await selectOption(page, "연도 선택", "1998년"); // 취득연도(유일한 연도 Select)

  await selectOption(page, "구조 선택", /철근콘크리트조/); // 2001년 지수표
  await selectOption(page, "용도 선택", /아파트/);

  await page.getByPlaceholder("최초고시 공동주택기준시가").fill("119000000");
  await page.getByPlaceholder("최초고시 연도 (4자리)").fill("1999");
  await page.getByPlaceholder("대지지분 면적").fill("33.15");
  await page.getByPlaceholder("건물 연면적").fill("105.78");

  // 공시지가 3종: building2001(0) / 최초고시(1) / 취득당시(2)
  await page.getByPlaceholder("원/㎡").nth(0).fill("1820000");
  await page.getByPlaceholder("원/㎡").nth(1).fill("1820000");
  await page.getByPlaceholder("원/㎡").nth(2).fill("2050000");

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("128,660,408");
});

test("공시지가 자동조회 — 소재지+연도 입력 후 조회 버튼 활성·자동 채움", async ({ page }) => {
  // 주소 검색 / 공시지가 조회 API mock (VWORLD 키·네트워크 비의존)
  await page.route("**/api/address/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            pnu: "1168010100101230000",
            title: "테헤란로 123",
            road: "서울 강남구 테헤란로 123",
            jibun: "서울 강남구 역삼동 123",
            building: "",
            zipcode: "",
            lng: "127.0",
            lat: "37.5",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/address/standard-price**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pnu: "1168010100101230000",
        priceType: "land_price",
        year: "2015",
        price: 6000000,
      }),
    }),
  );

  await page.goto(URL); // 기본 양도 모드

  // 취득연도 선택 → 공시지가 기준연도 자동 채움 (원인② referenceDate 배선 검증)
  await selectOption(page, "연도 선택", "2015년");
  await expect(page.getByText("2015년 (자동)").first()).toBeVisible();

  // 소재지 미입력 시 취득 조회 버튼 비활성 (원인① jibun 게이트)
  const lookupBtn = page.getByRole("button", { name: "공시지가 조회" }).first();
  await expect(lookupBtn).toBeDisabled();

  // 소재지 검색 → 결과 선택 → jibun 채움
  await page.getByPlaceholder("도로명 또는 지번 주소 입력 (예: 테헤란로 123)").fill("테헤란로 123");
  await page.getByRole("button", { name: /테헤란로 123/ }).click();

  // 조회 버튼 활성 → 클릭 → 취득당시 ㎡당 공시지가 자동 채움
  await expect(lookupBtn).toBeEnabled();
  await lookupBtn.click();
  await expect(page.getByPlaceholder("원/㎡").first()).toHaveValue("6,000,000");

  // 토지 면적 입력 → 토지기준시가 = 공시지가 × 면적 자동 계산 (6,000,000 × 100)
  await page.getByPlaceholder("부속토지 면적").fill("100");
  await expect(page.getByText("600,000,000")).toBeVisible();
});

test("결과 인쇄/PDF 서식 — 적용지수·적용요령 테이블 렌더", async ({ page }) => {
  await page.goto(URL);
  // 기본 양도 모드: 취득 2015 / 양도 2025 (BSP-06과 동일 입력)
  await page.getByPlaceholder("예: 2010").fill("2010");
  await page.getByPlaceholder("건물 연면적").fill("100");
  await selectOption(page, "연도 선택", "2015년");
  await page.getByText("구조 선택").first().click();
  await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
  await page.getByText("용도 선택").first().click();
  await page.getByRole("option", { name: /아파트/ }).first().click();
  await page.getByPlaceholder("원/㎡").first().fill("5000000");
  await selectOption(page, "연도 선택", "2025년");
  await page.getByText("구조 선택").first().click();
  await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
  await page.getByText("용도 선택").first().click();
  await page.getByRole("option", { name: /아파트/ }).first().click();
  await page.getByPlaceholder("원/㎡").nth(1).fill("7500000");
  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  await expect(page.getByTestId("bsp-result")).toBeVisible();
  // 인쇄 버튼 존재
  await expect(page.getByTestId("bsp-print")).toBeVisible();
  // 인쇄 전용 서식: 취득/양도 시점별 별도 테이블 + 적용요령(철근콘크리트조·천원미만 절사)
  await emulatePrint(page);
  await expect(page.getByText("취득당시 기준시가의 계산")).toBeVisible();
  await expect(page.getByText("양도당시 기준시가의 계산")).toBeVisible();
  await expect(page.getByText("(천원미만 절사)").first()).toBeVisible();
});

async function emulatePrint(page: Page) {
  await page.emulateMedia({ media: "print" });
}

test("계산기 → 홈으로 네비게이션 버튼", async ({ page }) => {
  await page.goto(URL);
  page.on("dialog", (d) => d.accept()); // 이동 확인 다이얼로그 수락
  await page.getByRole("button", { name: "홈으로 이동" }).click();
  await expect(page).not.toHaveURL(/building-standard-price/);
});

test("홈 링크 → 건물 기준시가 계산기 진입", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /건물 기준시가 계산기/ }).click();
  await expect(page).toHaveURL(/\/tools\/building-standard-price/);
  await expect(page.getByRole("heading", { name: "건물 기준시가 계산기" })).toBeVisible();
});
