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

// 상속·증여일(DateInput 연/월/일 3필드) 입력 → 평가연도 자동 도출.
async function fillEventDate(page: Page, iso: string) {
  const [y, m, d] = iso.split("-");
  await page.getByLabel("연도", { exact: true }).fill(y);
  await page.getByLabel("월", { exact: true }).fill(m);
  await page.getByLabel("일", { exact: true }).fill(d);
}

test("상속·증여 기본 — 224,600,000 (BSP-01)", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();

  await page.getByPlaceholder("신축연도 (4자리)").fill("2020"); // 신축연도
  await page.getByPlaceholder("건물 연면적").fill("200"); // 연면적

  await fillEventDate(page, "2025-03-15"); // 상속·증여일 → 평가연도 2025 자동
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

  await page.getByPlaceholder("신축연도 (4자리)").fill("2010"); // 신축연도
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

  await page.getByPlaceholder("신축연도 (4자리)").fill("2020"); // 신축연도
  await page.getByPlaceholder("기계식 주차대수").fill("50"); // 주차대수
  await fillEventDate(page, "2025-03-15"); // 상속·증여일 → 평가연도 2025 자동

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

test("모드 전환 시 평가시점 날짜 초기화 — 새 입력 강제", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();
  await fillEventDate(page, "2025-03-15"); // 상속·증여일 입력
  await expect(page.getByLabel("연도", { exact: true })).toHaveValue("2025");

  // 양도 모드로 전환 → 다시 상속·증여 → 날짜 비워져 있어야 함(양도일↔상속·증여일 혼입 방지)
  await page.getByText("취득·양도 2시점").click();
  await page.getByText("상속·증여(1시점)").click();
  await expect(page.getByLabel("연도", { exact: true })).toHaveValue("");
});

test("복합구조 + 공용시설 안분 — 합계 187,640,000", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();

  await page.getByPlaceholder("신축연도 (4자리)").fill("2000"); // 신축연도
  await fillEventDate(page, "2026-03-15"); // 상속·증여일 → 평가연도 2026 (부분 구조/용도 옵션 활성화 선행)

  await page.getByText("복합구조 (층·구역별 구조·용도 상이)").click(); // 토글 ON
  await page.getByPlaceholder("기타 면적").fill("90"); // 부속 기타(공용) → 공용 조정률 노출

  // 부분 1: 1층 슈퍼 (근생 #41, 조정 108, 공용 54)
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^41\./);
  await page.getByPlaceholder("부분 면적").fill("100");
  await page.getByPlaceholder("100").nth(0).fill("108"); // 조정률%
  await page.getByPlaceholder("100").nth(1).fill("54"); // 공용 조정률%

  // 부분 2: 2~3층 주택 (단독 #2, 조정 100, 공용 60)
  await page.getByRole("button", { name: "+ 부분 추가" }).click();
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^2\./);
  await page.getByPlaceholder("부분 면적").nth(1).fill("200");
  await page.getByPlaceholder("100").nth(2).fill("100"); // 부분2 조정률%
  await page.getByPlaceholder("100").nth(3).fill("60"); // 부분2 공용 조정률%

  await page.getByPlaceholder("원/㎡").fill("2500000"); // 단일 공시지가(위치지수)

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("187,640,000");
});

test("공동주택 고시 전 취득 환산 — 취득당시 128,660,408", async ({ page }) => {
  await page.goto(URL);
  // 기본 양도 모드

  await page.getByPlaceholder("신축연도 (4자리)").fill("1998"); // 신축연도
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

test("계산서 서식 — 양도 양도당시·취득당시 2벌 + ⑪ (BSP-06)", async ({ page }) => {
  await page.goto(URL);
  // 기본 양도 모드: 취득 2015 / 양도 2025 (BSP-06과 동일 입력)
  await page.getByPlaceholder("신축연도 (4자리)").fill("2010");
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
  // 국세청 계산서 서식 — 펼치기
  await page.getByRole("button", { name: /국세청.*계산서/ }).click();
  await expect(page.getByText("양도당시 기준시가 계산")).toBeVisible();
  await expect(page.getByText("취득당시 기준시가 계산")).toBeVisible();
  // ⑪ 양도당시 90,000,000 / 취득당시 82,200,000
  await expect(page.getByTestId("nts-bsp-6-no11").first()).toContainText("90,000,000");
  await expect(page.getByTestId("nts-bsp-6-no11").nth(1)).toContainText("82,200,000");
  // 인쇄 미디어에서도 서식 렌더(자동 펼침)
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("nts-bsp-report")).toBeVisible();
});

test("계산서 서식 — 상속 복합 작성례(3) ⑪ 200,540,000", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();
  await page.getByPlaceholder("신축연도 (4자리)").fill("2000");
  await fillEventDate(page, "2023-03-15"); // 상속·증여일 → 평가연도 2023

  await page.getByText("복합구조 (층·구역별 구조·용도 상이)").click();
  await page.getByPlaceholder("기타 면적").fill("90"); // 부속(주차60+보일러30 → 기타 합계)

  // 부분 1: 지상1 근생(#41) + 조정률 번호 9·20, 공용 9·24
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^41\./);
  await page.getByPlaceholder("부분 면적").fill("100");
  await page.getByPlaceholder("조정률 번호 (선택)", { exact: true }).fill("9,20");
  await page.getByPlaceholder("공용 조정률 번호 (선택)", { exact: true }).fill("9,24");

  // 부분 2: 지상2 단독(#2) + 공용 24
  await page.getByRole("button", { name: "+ 부분 추가" }).click();
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^2\./);
  await page.getByPlaceholder("부분 면적").nth(1).fill("100");
  await page.getByPlaceholder("공용 조정률 번호 (선택)", { exact: true }).nth(1).fill("24");

  // 부분 3: 지상3 단독(#2) + 공용 24
  await page.getByRole("button", { name: "+ 부분 추가" }).click();
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /^2\./);
  await page.getByPlaceholder("부분 면적").nth(2).fill("100");
  await page.getByPlaceholder("공용 조정률 번호 (선택)", { exact: true }).nth(2).fill("24");

  await page.getByPlaceholder("원/㎡").fill("2500000");
  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  await expect(page.getByTestId("bsp-result")).toBeVisible();
  await page.getByRole("button", { name: /국세청.*계산서/ }).click();
  await expect(page.getByTestId("nts-bsp-6-no11")).toContainText("200,540,000");
  // Ⅲ 지상1 조정률 번호 "0.9(9)" 표기
  await expect(page.getByTestId("nts-bsp-3-row0")).toContainText("0.9(9)");
});

test("동일연도 §164⑧ — 양도시점 상세 숨김 + 환산 62,450,000", async ({ page }) => {
  await page.goto(URL);
  // 기본 양도 모드
  await page.getByPlaceholder("신축연도 (4자리)").fill("2005");
  await page.getByPlaceholder("건물 연면적").fill("100");

  // 취득 시점 2010
  await selectOption(page, "연도 선택", "2010년");
  await page.getByText("구조 선택").first().click();
  await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
  await page.getByText("용도 선택").first().click();
  await page.getByRole("option", { name: /아파트/ }).first().click();
  await page.getByPlaceholder("원/㎡").first().fill("4500000");

  // 양도연도 = 취득연도 → 양도당시 구조·용도·공시지가 숨김 + 동일연도 섹션 노출
  await selectOption(page, "연도 선택", "2010년");
  await expect(page.getByText("양도당시 구조·용도·공시지가 입력이 필요 없습니다", { exact: false })).toBeVisible();
  await expect(page.getByText("양도당시 구조", { exact: true })).toHaveCount(0);
  await expect(page.getByText("동일연도 환산 (§164⑧)")).toBeVisible();

  // §164⑧ 제1산식: 취득전기 공시지가 + 보유월수
  await page.getByPlaceholder("원/㎡").nth(1).fill("4000000"); // 취득전기 공시지가
  await page.getByPlaceholder("보유월수").fill("6");

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("62,450,000"); // 폼 단위 테스트와 동일 anchor
});

test("조정률 모달 — 구조지수 100 미만 구조에서 지붕재료(I구분) 활성", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();
  await fillEventDate(page, "2025-03-15"); // 상속·증여일 → 평가연도 2025

  // 연와조 = 구조지수 95 (< 100) → 지붕재료 적용 대상
  await selectOption(page, "구조 선택", /연와조/);
  // "건물 특성으로 계산" 라디오 클릭 → 모달 자동 오픈(별도 버튼 없음)
  await page.getByText("건물 특성으로 계산", { exact: true }).click();

  const roofPanel = page.getByRole("radio", { name: "패널·유리·슬레이트 등 (80)" });
  await expect(roofPanel).toBeEnabled();
  await roofPanel.click();
  await expect(page.getByText("예상 조정률: 80.0%")).toBeVisible();
  await page.getByRole("button", { name: "취소" }).click();

  // 철근콘크리트조 = 구조지수 100 → 지붕재료 비활성 (트리거는 선택된 라벨 표시 중)
  await page.getByText("연와조 (지수 95)").first().click();
  await page.getByRole("option", { name: /^철근콘크리트조/ }).first().click();
  // 취소 후 features 모드 유지·미적용 → "건물 특성으로 계산 열기" 링크로 재오픈
  await page.getByRole("button", { name: "건물 특성으로 계산 열기" }).click();
  await expect(page.getByRole("radio", { name: "패널·유리·슬레이트 등 (80)" })).toBeDisabled();
  await expect(page.getByText("구조지수 100 이상 — 미적용")).toBeVisible();
});

test("조정률 — 기본 직접입력 / 건물 특성 라디오 클릭 시 모달 자동 오픈 + 주거용 토글 모달 내부", async ({
  page,
}) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();
  await fillEventDate(page, "2025-03-15");
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /아파트/);

  // 기본값 = 직접 입력(%) → 조정률 DecimalInput 노출, 모달/주거용 토글은 미노출
  await expect(page.getByPlaceholder("100")).toBeVisible();
  await expect(page.getByText("주거용 건물", { exact: true })).toHaveCount(0);

  // "건물 특성으로 계산" 라디오 클릭 → 모달 자동 오픈
  await page.getByText("건물 특성으로 계산", { exact: true }).click();
  await expect(page.getByText("개별건물 특성 조정률")).toBeVisible();
  // 주거용 토글이 모달 내부에 있음
  const modalResidential = page.getByText("주거용 건물", { exact: true });
  await expect(modalResidential).toBeVisible();

  // II 최고층수 입력 → 적용 → 섹션에 "특성 N개 적용 · 조정률 X%" 배지
  await page.getByPlaceholder("지상 최고층수").fill("15");
  await page.getByRole("button", { name: "적용" }).click();
  await expect(page.getByText(/특성 \d+개 적용 · 조정률/)).toBeVisible();

  // "다시 계산" 링크로 재오픈
  await page.getByRole("button", { name: "다시 계산" }).click();
  await expect(page.getByText("개별건물 특성 조정률")).toBeVisible();
});

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
