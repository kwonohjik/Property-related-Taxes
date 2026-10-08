/**
 * E2E: 부담부증여 양도소득세 — 「지정 지구 안인가」 선언이 요청 본문에 실린다 (#2055 후속)
 *
 * 헬퍼·선택자 정책은 `gift-burdened-transfer-remaining-e1r.spec.ts`와 같다. 양도세 API는 route intercept로 모킹하고
 * 요청 본문을 본다 — 판정·경고는 anchor(`gift-burdened-designated-district.anchor.test.tsx`)가 고정한다.
 *
 * 대화동(고양시 일산서구)은 2019.11.8.~2020.6.18. 킨텍스1단계 도시개발지구만 조정대상지역이었다.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import {
  addApartmentWithDebt,
  enableBurdenedTransferToggle,
  fillApartmentTransferInfo,
  setupTransferApiMock,
} from "./_helpers/gift-burdened-transfer";

const ADDRESSES = {
  대화동: { pnu: "4128710400100120000", title: "대화동 1-2", road: "경기 고양시 일산서구 킨텍스로 1", jibun: "경기 고양시 일산서구 대화동 1-2" },
  역삼동: { pnu: "1168010100107360000", title: "역삼동 736", road: "서울 강남구 테헤란로 152", jibun: "서울 강남구 역삼동 736" },
};

async function mockAddresses(page: Page) {
  await page.route("**/api/address/search**", (route) => {
    const q = decodeURIComponent(new URL(route.request().url()).search);
    const hit = q.includes("대화동") ? ADDRESSES.대화동 : ADDRESSES.역삼동;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ ...hit, building: "", zipcode: "", lng: "", lat: "" }] }),
    });
  });
  await page.route("**/api/address/standard-price**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
}

async function search(dialog: Awaited<ReturnType<typeof addApartmentWithDebt>>, key: keyof typeof ADDRESSES) {
  const addr = dialog.getByPlaceholder("도로명 또는 지번 주소 입력").first();
  await addr.fill(ADDRESSES[key].title);
  await dialog.getByRole("button", { name: new RegExp(ADDRESSES[key].title) }).click();
  await expect(addr).toHaveValue(ADDRESSES[key].road, { timeout: 15_000 });
}

async function start(page: Page) {
  const mock = await setupTransferApiMock(page);
  await mockAddresses(page);
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, { year: "2020", month: "3", day: "2" });
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();
  const dialog = await addApartmentWithDebt(page);
  await search(dialog, "대화동");
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog);
  return { mock, dialog };
}

async function calculateAndCapture(page: Page, mock: Awaited<ReturnType<typeof setupTransferApiMock>>) {
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  const transferResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  await transferResponse;
  expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
  return mock.bodies[0];
}

test("[DD-1] 대화동 → 질문이 뜨고 「지구 밖」 → 본문 regionInDesignatedDistrict=false · 양도시 조정 아님", async ({ page }) => {
  test.setTimeout(120_000);
  const { mock, dialog } = await start(page);
  await expect(dialog.getByTestId("designated-district-question-bg-gift-house")).toBeVisible();
  await dialog.getByTestId("designated-district-out-bg-gift-house").click();
  await expect(dialog.getByRole("switch", { name: /양도시\(증여일\) 조정대상지역/ })).toHaveAttribute("aria-checked", "false");
  const body = await calculateAndCapture(page, mock);
  expect(body).toMatchObject({ regionCode: "4128710400", regionInDesignatedDistrict: false, isRegulatedArea: false });
});

test("[DD-2] 답한 뒤 소재지를 역삼동으로 바꾸면 질문이 사라지고 답이 본문에서 빠진다", async ({ page }) => {
  test.setTimeout(120_000);
  const { mock, dialog } = await start(page);
  await dialog.getByTestId("designated-district-out-bg-gift-house").click();
  await search(dialog, "역삼동");
  await expect(dialog.getByTestId("designated-district-question-bg-gift-house")).toHaveCount(0);
  const body = await calculateAndCapture(page, mock);
  expect(body.regionCode).toBe("1168010100");
  expect(body).not.toHaveProperty("regionInDesignatedDistrict");
});
