/**
 * comprehensive-land-parcel-sigungu.spec.ts
 *
 * 종부세 토지 필지 시군구(재산세 합산 단위) 자동 채움. 주소 검색 응답은 검색 방식에 따라 한쪽만 전체 주소로 온다.
 * 지번 검색이면 road가 「가락로 100」처럼 짧다(실제 API 실측). 종전에는 도로명만 봐서 지번 검색이면 칸이 비었고,
 * 시군구를 못 뽑는 주소로 바꾸면 옛 시군구가 남은 채 계산됐다(합산 그룹이 바뀌어 세액이 달라진다).
 * 계획서 `docs/00-pm/land-parcel-sigungu-autofill.plan.md` R1·R2(Q-1 a)
 *
 * 주소 검색은 실측 응답 그대로 `page.route`로 고정한다.
 *
 * 실행: E2E_PORT=3124 npx playwright test e2e/comprehensive-land-parcel-sigungu.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const RESULTS: Record<string, { pnu: string; road: string; jibun: string }> = {
  "석촌동 276-1": { pnu: "1171010500102760001", road: "가락로 100", jibun: "서울특별시 송파구 석촌동 276-1" },
  "보람동 1": { pnu: "3611011800100010000", road: "한누리대로 2130", jibun: "세종특별자치시 보람동 1" },
};

async function mockSearch(page: Page) {
  await page.route("**/api/address/search**", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    const hit = RESULTS[q];
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: hit ? [{ ...hit, title: "", building: "", zipcode: "", lng: "", lat: "" }] : [] }),
    });
  });
}

test("LS-1: 지번 검색으로 고르면 시군구가 채워지고, 시군구를 못 뽑는 주소로 바꾸면 비워져 계산이 막힌다", async ({ page }) => {
  await mockSearch(page);
  await page.goto("/calc/comprehensive-tax");
  await page.getByRole("radio", { name: "2024" }).check();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^다음/ }).click(); // → 토지
  await page.getByText("종합합산 토지 보유").click();
  await page.getByRole("radio", { name: /필지별 자동 계산/ }).first().check();
  await page.getByRole("button", { name: /필지 추가/ }).click();
  const dialog = page.getByTestId("land-aggregate-parcel-dialog");
  await expect(dialog).toBeVisible();
  const jurisdiction = dialog.getByTestId("land-aggregate-parcel-jurisdiction");

  const pick = async (q: string) => {
    const input = dialog.getByPlaceholder("도로명 또는 지번 주소 입력");
    await input.fill(q);
    await input.press("Enter");
    await dialog.getByRole("button", { name: new RegExp(RESULTS[q].road) }).click();
    await expect(dialog.getByRole("button", { name: "지우기" })).toBeVisible();
  };

  // R1 — 지번 검색 형식(road 짧음)도 지번의 전체 주소에서 채운다
  await pick("석촌동 276-1");
  await expect(jurisdiction).toHaveValue("송파구");

  // R2 — 시군구를 못 뽑는 주소(세종)로 바꾸면 옛 「송파구」를 남기지 않는다
  await dialog.getByRole("button", { name: "지우기" }).click();
  await pick("보람동 1");
  await expect(jurisdiction).toHaveValue("");

  await dialog.getByTestId("land-aggregate-parcel-area").locator("input").fill("1000");
  await dialog.getByTestId("land-aggregate-parcel-price").locator("input").last().fill("5000000");
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText(/모든 필지에 시군구를 입력하세요/).first()).toBeVisible();
});
