/**
 * §99의4 농어촌·고향주택 — 기준시가 조회형(주소 검색 → 공시가격 조회) E2E
 *
 * 검증: New994InputForm ② 가액요건에서 농어촌주택 주소(별개 물건)를 검색·선택하면
 *       ruralHouseJibun이 채워지고, "공시가격 조회"로 ruralHouseStdPrice(취득 당시
 *       기준시가 합계)가 자동 입력된다. (PR #813 — 계획 reduction-994-stdprice-lookup.plan.md)
 *
 * 외부 API(/api/address/search·standard-price)는 mock — 정부사이트 조회는 결정적 재현 위해 mock.
 */
import { test, expect } from "@playwright/test";

test.describe("§99의4 농어촌주택 기준시가 조회형", () => {
  test("주소 검색 → 선택 → 공시가격 조회 → ruralHouseStdPrice 자동 입력", async ({ page }) => {
    // ── 외부 조회 mock ──
    await page.route("**/api/address/search**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              pnu: "1111010100100010000",
              title: "서울특별시 종로구 청운동 1",
              road: "",
              jibun: "서울특별시 종로구 청운동 1",
              building: "",
              zipcode: "03047",
              lng: "126.97",
              lat: "37.58",
            },
          ],
        },
      }),
    );
    await page.route("**/api/address/standard-price**", (route) =>
      route.fulfill({ json: { price: 250_000_000, priceType: "indvd_housing_price" } }),
    );

    // ── 마법사 진입 + 양도일 ──
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    // ── 감면·공제 단계 → 신축주택 그룹 → §99의4 농어촌주택 ──
    await page.getByRole("button", { name: "감면·공제" }).click();
    await page.getByRole("button", { name: /신축주택/ }).first().click();
    await page.getByText("§99의4 (농어촌주택)", { exact: false }).first().click();

    // ── New994 폼: 농어촌주택 주소 필드(조회형) 렌더 확인 ──
    await expect(page.getByText("농어촌주택 주소 (기준시가 조회용)").first()).toBeVisible();

    // ── ① 농어촌주택 취득일 (referenceDate → 조회 추천 연도 → 조회 버튼 활성화) ──
    // 감면 그룹 상단 매매계약일 DateInput과 구분하기 위해 취득일 label 컨테이너로 스코프
    const acqDateBlock = page.getByText("농어촌주택 취득일", { exact: true }).locator("xpath=..");
    await acqDateBlock.getByLabel("연도").fill("2015");
    await acqDateBlock.getByLabel("월").fill("03");
    await acqDateBlock.getByLabel("일").fill("15");

    // ── 주소 검색 → 결과 선택 → ruralHouseJibun 반영 ──
    await page.getByPlaceholder(/도로명 또는 지번 주소/).fill("청운동 1");
    // 입력 후 300ms debounce 자동 검색 → 결과 드롭다운(mock 응답) 대기 후 선택
    await page.getByRole("button", { name: /청운동 1/ }).first().click();

    // ── 공시가격 조회 → ruralHouseStdPrice 자동 입력 ──
    const lookupBtn = page.getByTestId("new994-stdprice-lookup-btn");
    await expect(lookupBtn).toBeEnabled(); // 지번 채워지면 활성
    await lookupBtn.click();

    // ── 검증: 기준시가 250,000,000 반영 ──
    const priceInput = page.getByTestId("new994-stdprice-price-input").locator("input");
    await expect(priceInput).toHaveValue("250,000,000");
    // 개별주택가격 배지 노출
    await expect(page.getByTestId("new994-stdprice-pricetype-badge")).toContainText("개별주택");
  });
});
