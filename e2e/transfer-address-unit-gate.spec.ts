/**
 * 소재지·집합건물 세대 게이트 — E2E
 *
 * 소재지는 물건 식별자다. 비어 있으면 서로 다른 물건이 같은 이력 `businessKey`를 갖고
 * **앞의 신고서를 덮어쓴다**(계획서 §1-1 실측 — 이력 1건). 같은 지번의 두 세대는 동·호가
 * 없으면 역시 같은 키가 된다(§1-2).
 *
 * 🔑 **vitest anchor로는 부족하다** — 「세대 목록이 있었다」는 `AddressSearch`의 런타임
 *    신호를 폼에 남겨야 ⑧이 판정할 수 있는데, 그 배선(onUnitsResolved → onChange)이
 *    실제로 저장되는지는 렌더된 화면에서만 확인된다
 *    (memory `feedback_browser_verify_with_playwright` · `feedback_library_anchor_does_not_prove_component_uses_it`).
 *
 * 계획서: `docs/00-pm/business-key-property-identity.plan.md`
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const JIBUN = "서울 강남구 대치동 316";

/** 주소 검색은 빈 결과(직접 입력 경로) · 세대 목록은 «있음»으로 고정 → 집합건물 상황 재현 */
async function mockApartment(page: Page) {
  await page.route("**/api/address/search*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
  await page.route("**/api/address/standard-price*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ units: [{ dong: "101동", ho: "501", price: 900000000, area: 84.9 }] }),
    }),
  );
}

async function openBasic(page: Page) {
  await page.goto("/calc/transfer-tax?new=1");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("06");
  await page.getByTestId("transfer-date").getByLabel("일").fill("03");
  await expandAssetSection(page, 1);
}

test.describe("소재지·세대 게이트", () => {
  test("UG-1: 소재지 미입력이면 다음 단계로 못 간다", async ({ page }) => {
    await openBasic(page);
    await page.getByRole("button", { name: "다음" }).click();
    // 차단 메시지는 인라인 오류 + 점프 링크 «두 곳»에 렌더된다 → first()
    await expect(page.getByText(/소재지를 입력하세요/).first()).toBeVisible();
  });

  test("UG-2: 검색 결과가 없어도 「입력한 주소 그대로 사용」으로 채울 수 있다", async ({ page }) => {
    await mockApartment(page);
    await openBasic(page);
    const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
    await input.fill(JIBUN);
    await input.press("Enter");
    // 🔑 검색이 유일한 입력 경로여서는 안 된다 — 이 버튼이 없으면 계산 자체가 막힌다
    await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
    await expect(page.getByText(JIBUN).first()).toBeVisible();
    await expect(page.getByText(/소재지를 입력하세요/)).toHaveCount(0);
  });

  test("UG-3: 집합건물(세대 목록 있음)에서 동·호를 안 고르면 차단된다", async ({ page }) => {
    await mockApartment(page);
    await openBasic(page);
    const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
    await input.fill(JIBUN);
    await input.press("Enter");
    await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
    // 세대 조회가 끝나 hasAddressUnits=true가 폼에 실릴 때까지 대기
    await expect(page.getByText(JIBUN).first()).toBeVisible();
    await page.waitForTimeout(1200);

    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText(/동·호를 선택하세요/).first()).toBeVisible();
  });
});
