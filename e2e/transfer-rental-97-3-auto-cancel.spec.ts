/**
 * §97의3 자동말소 아파트 매입임대 8년 간주(구 조특령 §97의3②2호) — 폼 → 계산 → 결과 (M-13)
 *
 * 계획서 docs/01-plan/features/rental-97-3-auto-cancel-deemed-8y.plan.md. 사실관계 = 사전-2025-법규재산-0726:
 * 단기 2016-11-24 · 임대 2016-12-23 · 장기 변경 2019-07-12 · 자동말소 2024-11-26 · 양도 2025-07-30.
 * 실제 통산 7년이라 간주 없으면 부적격 — 토글을 켜면 8년 간주 → 50%.
 *
 * worktree 실행: E2E_PORT=3976 npx playwright test e2e/transfer-rental-97-3-auto-cancel.spec.ts
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const REDUCTION = {
  ...getReductionDefault("rental_97_3"),
  registrationDate: "2016-11-24",
  rentalStartDate: "2016-12-23",
  isTaxRegistered: true,
  taxRegistrationDate: "2016-11-24",
  shortTermConversionMode: "before",
  conversionReportedDate: "2019-07-12",
  conversionAcceptedDate: "2019-07-12",
  rentIncreaseViolationMode: "none",
  hasVacancyOverGrace: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: "200000000",
  stdPriceAtRentalEnd: "400000000",
  stdPriceAtAcquisition: "200000000",
  stdPriceAtTransfer: "450000000",
};

test("말소 선택 → 말소일 → 자동말소 토글 → request body · 50% · 결과 카드", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionCause: "purchase", acquisitionDate: "2017-01-06", reductions: [REDUCTION] },
    formOver: { transferDate: "2025-07-30" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);

  // ⑤ 「양도일까지 유지」 상태에서는 토글이 없다
  const toggle = page.locator('[data-field="reduction.rental_97_3.autoCancelled973"]');
  await expect(toggle).toHaveCount(0);

  await page.getByRole("radio", { name: "양도 전에 임대 종료 또는 등록 말소" }).click();
  const end = page.locator('[data-field="reduction.rental_97_3.rentalEndDate"]');
  await fillDateAndVerify(page, { year: "2024", month: "11", day: "26" }, { scope: end });

  await expect(toggle).toBeVisible();
  await toggle.getByRole("switch").first().click();
  await expect(page.getByTestId("rental973-auto-cancel-preview")).toContainText("8년 · 50%");

  await page.getByRole("button", { name: "가산세" }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

  // ④⑬ request body
  const req = resp.request().postDataJSON() as { assets?: { reductions?: Record<string, unknown>[] }[]; reductions?: Record<string, unknown>[] };
  const red = (req.reductions ?? req.assets?.[0]?.reductions ?? []).find((r) => r.type === "rental_97_3")!;
  expect(red).toMatchObject({ autoCancelled973: true, rentalContinuesToTransfer: false, rentalEndDate: "2024-11-26" });

  const body = (await resp.json()) as { data: { result: Record<string, unknown> } };
  expect(body.data.result.rental97LthdDetail).toMatchObject({
    isEligible: true,
    overrideRate: 0.5,
    eligibleRentalYears: 8,
    autoCancelDeemed973: { cancelledDate: "2024-11-26", actualYears: 7 },
  });

  // ⑦ 결과 카드
  const card = page.getByTestId("rental973-auto-cancel-detail");
  await expect(card).toBeVisible();
  await expect(card).toContainText("8년 (실제 통산 7년)");
});
