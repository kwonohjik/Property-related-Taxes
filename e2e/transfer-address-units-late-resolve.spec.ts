/**
 * transfer-address-units-late-resolve.spec.ts
 *
 * 주소를 고르면 `AddressSearch`가 공동주택 세대 목록을 조회하고(`/api/address/standard-price`,
 * 연도별 최대 4회), 끝나면 `hasAddressUnits`를 자산에 기록한다. 이 조회가 **자산 목록 단계를 떠난 뒤에**
 * 끝나면, 언마운트된 `CompanionAssetsSection`이 단계를 떠날 때의 자산 배열로 저장해
 *   A. 다음 단계에서 바꾼 자산 값이 지워졌고(비사업용 토지 스위치가 켜졌다가 꺼짐)
 *   B. 값이 그대로여도 저장 경로가 계산 결과를 지웠다(결과 화면 → 입력 화면).
 *
 * 발견: `transfer-nbl-surcharge-amount.spec.ts` 간헐 실패(master 30회 중 1회 — 산출세액 차이 0,
 * 수정 중 30회 중 1회 — 결과 표가 사라져 타임아웃). 외부 조회가 느릴 때만 드러나므로 여기서는 조회 응답을
 * 붙잡아 두었다가 원하는 시점에 풀어 늘 같은 순서로 재현한다.
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/transfer-address-units-late-resolve.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { setupAddress } from "./_helpers/fill-address";

/** 세대 조회를 붙잡아 둔다. `release()` 뒤에는 `units`로 답한다. */
async function holdUnits(page: Page, units: unknown[]) {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const state = { served: 0, release: () => release() };
  await page.route("**/api/address/standard-price*", async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ units }) });
    state.served++;
  });
  return state;
}

/** 단순토지(독립 나대지) 1건 — 양도 2026-02-18 · 20억, 취득 2013-01-01 매매 · 4억. 자산 목록 단계에서 끝난다. */
async function fillLand(page: Page) {
  await page.goto("/calc/transfer-tax?new=1");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("02");
  await page.getByTestId("transfer-date").getByLabel("일").fill("18");

  await expandAssetSection(page, 1);
  await setupAddress(page);
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);

  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();
  await page.getByPlaceholder("면적 입력").first().fill("1000");
  await page.locator('label:has-text("양도가액 (원)")').locator("xpath=..").locator("input").first().fill("2000000000");
  await page.getByRole("radio", { name: "매매", exact: true }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("2013");
  await page.getByLabel("월", { exact: true }).nth(2).fill("01");
  await page.getByLabel("일", { exact: true }).nth(2).fill("01");
  await page.locator('label:has-text("취득가액 (원)")').locator("xpath=..").locator("input").first().fill("400000000");
}

test("A. 세대 조회가 다음 단계에서 «세대 있음»으로 끝나도 그 단계에서 켠 비사업용 토지 스위치가 유지된다", async ({ page }) => {
  const units = await holdUnits(page, [{ dong: "101", ho: "101", floor: "1", price: 100000000, year: "2026" }]);
  await fillLand(page);

  await page.getByRole("button", { name: "보유 상황" }).first().click();
  const sw = page.getByRole("switch", { name: /비사업용 토지/ });
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect(units.served, "조회가 스위치보다 먼저 끝났다 — 재현 순서가 아니다").toBe(0);

  units.release();
  await expect.poll(() => units.served).toBe(1); // 첫 연도에서 세대를 찾으면 멈춘다
  // 응답 뒤 finally → onUnitsResolved → 저장까지 한 틱 안에 끝난다. 넉넉히 기다린 뒤 본다.
  await page.waitForTimeout(500);
  await expect(sw).toHaveAttribute("aria-checked", "true");
});

test("B. 세대 조회가 계산 결과를 띄운 뒤 «세대 없음»으로 끝나도 결과가 지워지지 않는다", async ({ page }) => {
  const units = await holdUnits(page, []);
  await fillLand(page);

  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const taxBaseRow = page.locator('tr:has(td:has-text("과세표준"))').first();
  await expect(taxBaseRow).toBeVisible({ timeout: 20000 });
  expect(units.served, "조회가 계산보다 먼저 끝났다 — 재현 순서가 아니다").toBe(0);

  units.release();
  await expect.poll(() => units.served).toBe(4); // 세대가 없으면 4개 연도를 다 묻는다
  await page.waitForTimeout(500);
  await expect(taxBaseRow).toBeVisible();
});
