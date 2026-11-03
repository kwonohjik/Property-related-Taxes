/**
 * §97의4 임대기간 산정 — 폼 → 계산 → 결과 (리뷰 2026-11-02 R-1·R-3·R-4)
 *
 * 상속받은 임대주택: 피상속인 2012.1.1.~2016.1.1.(4년) + 상속인 2016.7.1.~2024.6.1.(7년 11개월) = 11년 11개월 → 추가율 10%.
 * 합산이 없으면 상속인 분만 7년 → 4%. 표1(2주택) 보유 8년 16% + 10% = 26%.
 *
 * worktree 실행: E2E_PORT=3974 npx playwright test e2e/transfer-rental-97-4-period.spec.ts
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const REDUCTION = {
  ...getReductionDefault("rental_97_4"),
  registrationDate: "2016-07-01",
  rentalStartDate: "2016-07-01",
  isTaxRegistered: true,
  taxRegistrationDate: "2016-07-01",
  rentIncreaseViolationMode: "none",
  hasVacancyOverGrace: false,
  rental974Category: "purchase_a",
  region: "non_capital",
  officialPriceAtStart: "200000000",
  isInherited974: true,
  inheritanceDate974: "2016-01-01",
  decedentRegistrationDate974: "2012-01-01",
  decedentRentalStartDate974: "2012-01-01",
};

test("상속 합산 — 화면 구간 표시 · request body · 결과 카드", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionDate: "2016-01-01", reductions: [REDUCTION] },
    formOver: { transferDate: "2024-06-01" },
  });

  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);
  // ⑤ 자동 산출 박스 — 피상속인 분과 상속인 분을 따로 보여 준다
  await expect(page.getByTestId("rental974-decedent-segment")).toContainText("2012-01-01→2016-01-01");
  await expect(page.getByTestId("rental974-own-segment")).toContainText("2016-07-01→2024-06-01");

  await page.getByRole("button", { name: "가산세" }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

  // ④⑬ request body — 신규 필드가 실려 간다
  const req = resp.request().postDataJSON() as { assets?: { reductions?: Record<string, unknown>[] }[]; reductions?: Record<string, unknown>[] };
  const red = (req.reductions ?? req.assets?.[0]?.reductions ?? []).find((r) => r.type === "rental_97_4")!;
  expect(red.taxRegistrationDate).toBe("2016-07-01");
  expect(red.inheritance974).toEqual({
    inheritanceDate: "2016-01-01",
    decedentRegistrationDate: "2012-01-01",
    decedentRentalStartDate: "2012-01-01",
  });

  const body = (await resp.json()) as { data: { result: Record<string, unknown> } };
  const detail = body.data.result.rental97LthdDetail as Record<string, unknown>;
  expect(detail.isEligible).toBe(true);
  expect(detail.additionalRate).toBe(0.1);
  expect(detail.rentalPeriod974).toEqual({
    heir: { start: "2016-07-01", end: "2024-06-01" },
    decedent: { start: "2012-01-01", end: "2016-01-01" },
    endReason: "transfer",
  });

  // ⑦ 결과 카드 — 구간과 「확인 필요」 고지
  const card = page.getByTestId("rental974-period-detail");
  await expect(card).toBeVisible();
  await expect(card).toContainText("2012-01-01 ~ 2016-01-01");
  await expect(card).toContainText("확인이 필요합니다");
});
