/**
 * §97의5 등록 말소 후 종점 (D-1) — 폼 → 계산 → 결과
 *
 * 계획서 docs/01-plan/features/rental-97-5-deregistration-end.plan.md (Q-1 a). 교재 사례를 과거 날짜로 옮겼다:
 * 취득 2015-02-15(기준시가 2억) · 등록·임대 2015-04-15 · 자동말소 2025-04-15(5억) · 양도 2026-06-01(6억).
 * 「양도 전에 임대 종료 또는 등록 말소」 + 말소일 → 10년 충족 · 안분 비율 (5억 − 2억) ÷ (6억 − 2억) = 0.75.
 *
 * worktree 실행: E2E_PORT=3975 npx playwright test e2e/transfer-rental-97-5-deregistration-end.spec.ts
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const REDUCTION = {
  ...getReductionDefault("rental_97_5"),
  registrationDate: "2015-04-15",
  rentalStartDate: "2015-04-15",
  isTaxRegistered: true,
  taxRegistrationDate: "2015-04-15",
  isPurchaseRental: true,
  rentIncreaseViolationMode: "none",
  hasVacancyOverGrace: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: "200000000",
  stdPriceAtRentalEnd: "500000000",
  stdPriceAtAcquisition: "200000000",
  stdPriceAtTransfer: "600000000",
};

test("말소일을 종점으로 입력 → request body · 안분 비율 0.75 · 결과 카드", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionCause: "purchase", acquisitionDate: "2015-02-15", reductions: [REDUCTION] },
    formOver: { transferDate: "2026-06-01" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);

  // ⑤ 질문이 등록 말소를 묻는다 (D-1)
  await expect(page.getByText("장기일반민간임대주택 등록을 유지한 채 양도일까지 임대했습니까?")).toBeVisible();
  await expect(page.getByTestId("rental-dereg-hint")).toContainText("조특령 §97의5① 「그 등록한 기간 동안」");
  // 안내 문구에도 같은 선택지 이름이 들어 있다 — 라디오로 좁힌다
  await page.getByRole("radio", { name: "양도 전에 임대 종료 또는 등록 말소" }).click();

  await expect(page.getByText("임대 종료일 또는 등록 말소일 (먼저 온 날)")).toBeVisible();
  const end = page.locator('[data-field="reduction.rental_97_5.rentalEndDate"]');
  await fillDateAndVerify(page, { year: "2025", month: "04", day: "15" }, { scope: end });

  await page.getByRole("button", { name: "가산세" }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

  // ④⑬ request body — 입력 필드는 그대로(`rentalContinuesToTransfer`·`rentalEndDate`)
  const req = resp.request().postDataJSON() as { assets?: { reductions?: Record<string, unknown>[] }[]; reductions?: Record<string, unknown>[] };
  const red = (req.reductions ?? req.assets?.[0]?.reductions ?? []).find((r) => r.type === "rental_97_5")!;
  expect(red).toMatchObject({ rentalContinuesToTransfer: false, rentalEndDate: "2025-04-15" });

  const body = (await resp.json()) as { data: { result: Record<string, unknown> } };
  expect(body.data.result.rental97TaxDetail).toMatchObject({ id: "rental_97_5", isEligible: true, rentalGainRatio: 0.75 });

  // ⑦ 결과 카드 — 감면 카드가 그려진다
  await expect(page.getByText("장기임대주택 세액감면").first()).toBeVisible();
});
