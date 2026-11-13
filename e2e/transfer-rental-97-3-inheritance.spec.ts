/**
 * §97의3 상속 임대주택 피상속인 임대기간 합산 (V-14) — 폼 → 계산 → 결과
 *
 * 계획서 docs/01-plan/features/rental-97-3-inheritance-merge.plan.md. 상속개시일 2019-01-01(카드 취득일) ·
 * 상속인 등록·임대 2019-02-01 · 피상속인 2016-05-01 · 양도 2026-06-01 → 통산 10년 → 장기보유특별공제율 70%.
 * 합산이 없으면 상속인 분만 7년 → 부적격.
 *
 * worktree 실행: E2E_PORT=3973 npx playwright test e2e/transfer-rental-97-3-inheritance.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const REDUCTION = {
  ...getReductionDefault("rental_97_3"),
  registrationDate: "2019-02-01",
  rentalStartDate: "2019-02-01",
  isTaxRegistered: true,
  taxRegistrationDate: "2019-02-01",
  rentIncreaseViolationMode: "none",
  hasVacancyOverGrace: false,
  rentalContinuesToTransfer: true,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: "300000000",
};
const INHERITED = { acquisitionCause: "inheritance", acquisitionDate: "2019-01-01", decedentAcquisitionDate: "2010-01-01", publishedValueAtInheritance: "400000000" };
const TITLE = "상속받은 임대주택 — 피상속인 임대기간 합산";

async function openRentalCategory(page: Page, assetOver: Record<string, unknown>) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { ...assetOver, reductions: [REDUCTION] },
    formOver: { transferDate: "2026-06-01" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);
}

test("상속 자산 — 토글 켜고 피상속인 날짜 입력 → 미리보기 · request body · 결과 카드", async ({ page }) => {
  test.setTimeout(120_000);
  await openRentalCategory(page, INHERITED);

  // ⑤ 토글을 화면에서 켠다 — 피상속인 날짜 2칸이 나타난다
  await expect(page.getByText(TITLE)).toBeVisible();
  const toggle = page.locator('[data-field="reduction.rental_97_3.isInherited973"]');
  await toggle.getByRole("switch").first().click();
  const reg = page.locator('[data-field="reduction.rental_97_3.decedentRegistrationDate973"]');
  const start = page.locator('[data-field="reduction.rental_97_3.decedentRentalStartDate973"]');
  await fillDateAndVerify(page, { year: "2016", month: "05", day: "01" }, { scope: reg });
  await fillDateAndVerify(page, { year: "2016", month: "05", day: "01" }, { scope: start });

  // ⑤ 자동 산출 박스 — 엔진과 같은 통산 연수
  const preview = page.getByTestId("rental973-merged-preview");
  await expect(preview).toContainText("2016-05-01 ~ 2019-01-01");
  await expect(preview).toContainText("10년");

  await page.getByRole("button", { name: "가산세" }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

  // ④⑬ request body — 상속개시일 = 카드 취득일
  const req = resp.request().postDataJSON() as { assets?: { reductions?: Record<string, unknown>[] }[]; reductions?: Record<string, unknown>[] };
  const red = (req.reductions ?? req.assets?.[0]?.reductions ?? []).find((r) => r.type === "rental_97_3")!;
  expect(red.inheritance973).toEqual({ inheritanceDate: "2019-01-01", decedentRegistrationDate: "2016-05-01", decedentRentalStartDate: "2016-05-01" });

  const body = (await resp.json()) as { data: { result: Record<string, unknown> } };
  expect(body.data.result.rental97LthdDetail).toMatchObject({
    isEligible: true,
    overrideRate: 0.7,
    eligibleRentalYears: 10,
    rentalPeriod973: { decedent: { start: "2016-05-01", end: "2019-01-01" }, heir: { start: "2019-02-01", end: "2026-06-01" } },
  });

  // ⑦ 결과 카드 — 구간과 「확인 필요」 고지
  const card = page.getByTestId("rental973-period-detail");
  await expect(card).toBeVisible();
  await expect(card).toContainText("2016-05-01 ~ 2019-01-01");
  await expect(card).toContainText("2019-02-01 ~ 2026-06-01");
  await expect(card).toContainText("확인이 필요합니다");
});

test("매매 자산 — 토글이 보이지 않는다", async ({ page }) => {
  await openRentalCategory(page, { acquisitionCause: "purchase", acquisitionDate: "2019-01-01" });
  await expect(page.getByText("임대주택 취득 유형").or(page.getByText("단기민간임대주택 → 장기일반 변경신고")).first()).toBeVisible();
  await expect(page.getByText(TITLE)).toHaveCount(0);
});
