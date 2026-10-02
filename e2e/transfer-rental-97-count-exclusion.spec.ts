/**
 * 양도세 계산기 — 조특법 §97② 장기임대주택을 명부 행 ⑥ `special`에서 지정 → 계산 → 비과세 (브라우저 경로)
 *
 * 엔진·④·⑧·⑫·⑭ 주장은 anchor가 고정한다(`__tests__/calc/rental-97-count-exclusion.anchor.test.ts`).
 * 여기서만 보이는 것: 행 모달에서 고른 조문·임대개시일이 그 행에 붙어 계산 본문에 실리고 결과가 비과세인가.
 *
 * 사실관계(계획서 `one-house-exemption-fix.plan.md` §9.8): 춘천 비조정 · 양도 2026-08-01 · 10억 ·
 * 양도 주택 취득 2019-06-01 · 취득가 3억 · 다른 주택 r(1998-01-01 취득, 1999-03-01 임대개시).
 *
 * worktree 실행: E2E_PORT=3197 npx playwright test e2e/transfer-rental-97-count-exclusion.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const SEED = {
  houses: [otherHouse("r", "1998-01-01")],
  assetOver: { acquisitionDate: "2019-06-01", actualSalePrice: "1000000000", fixedAcquisitionPrice: "300000000" },
  formOver: { transferDate: "2026-08-01", contractTotalPrice: "1000000000" },
};

async function calculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return {
    request: resp.request().postDataJSON() as { specialHouseExclusions?: Record<string, unknown>[] },
    body: (await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number } } },
  };
}

test("[R97-E1] 행 ⑥ §97 장기임대주택 + 임대개시일 → 본문에 행 id·임대개시일 → 비과세", async ({ page }) => {
  await gotoTransferHoldingsStep(page, SEED);

  await page.getByRole("button", { name: "주택 1 편집" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("house-row-count-exclusion-special").click();
  await dialog.getByRole("combobox").filter({ hasText: "조문 선택" }).click();
  await page.getByRole("option", { name: /§97 장기임대주택/ }).click();
  // DateInput은 연·월·일 세 칸이다
  const rentalStart = dialog.getByTestId("special-house-exclusion-rental-start-date").locator("input");
  await rentalStart.nth(0).fill("1999");
  await rentalStart.nth(1).fill("03");
  await rentalStart.nth(2).fill("01");
  await dialog.getByRole("switch", { name: /해당 조문 본 요건 충족 확인/ }).click();
  await dialog.getByRole("button", { name: "완료" }).click();

  const { request, body } = await calculate(page);
  expect(request.specialHouseExclusions).toEqual([
    expect.objectContaining({ article: "rental_97", houseId: "r", houseRentalStartDate: "1999-03-01", requirementsConfirmed: true }),
  ]);
  expect(body.data.result.isExempt).toBe(true);
  expect(body.data.result.totalTax).toBe(0);
});

test("[R97-E1+] 짝 — 지정하지 않으면 2주택 과세 237,435,000", async ({ page }) => {
  await gotoTransferHoldingsStep(page, SEED);
  const { request, body } = await calculate(page);
  expect(request.specialHouseExclusions ?? []).toEqual([]);
  expect(body.data.result.isExempt).toBe(false);
  expect(body.data.result.totalTax).toBe(237_435_000);
});
