/**
 * §97의3·§97의4 × §127⑦ — ⑤ 감면 패널이 임대 장특 특례와 다른 감면의 병용을 «택일» 배너로 알리고,
 * ⑧이 다음 단계로 넘기지 않는다 (계획서 docs/00-pm/rental-97-3-4-track-127-7.plan.md · 조심 2024서2915).
 *
 * 종전: 임대 범주(§97의4)와 신축주택 범주(§99의3)를 함께 담아도 배너가 없고 ⑧이 통과해
 * 엔진이 두 혜택을 모두 적용했다(총세액이 각 단독보다 적음).
 *
 * worktree 실행: E2E_PORT=3974 npx playwright test e2e/transfer-rental-97-3-4-track-127-7.spec.ts
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const RENTAL_COMMON = {
  registrationDate: "2014-01-01",
  rentalStartDate: "2014-01-01",
  isTaxRegistered: true,
  taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none",
  rentalContinuesToTransfer: true,
  hasVacancyOverGrace: false,
  officialPriceAtStart: "300000000",
};
const R974 = { ...getReductionDefault("rental_97_4"), ...RENTAL_COMMON, rental974Category: "purchase_a", region: "capital" };
const R993 = { ...getReductionDefault("new_99_3") };

test("§97의4 + §99의3 — 택일 배너 · 다음 단계 차단", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionDate: "2003-03-01", reductions: [R974, R993] },
    formOver: { transferDate: "2025-08-01" },
  });

  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);

  const banner = page.getByText("조특법 §127⑦ — 두 감면은 택일입니다");
  await expect(banner).toBeVisible();
  const body = page.locator("p").filter({ hasText: "조특법 §127⑦은 둘 이상의" });
  await expect(body).toContainText("장기보유특별공제 추가공제율 특례");
  await expect(body).toContainText("양도소득금액 차감");

  // ⑧ — 계산 요청을 보내지 않고 같은 문구를 보인다
  let posted = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true;
  });
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText(/조특법 §127⑦ 중복배제/).first()).toBeVisible();
  expect(posted, "⑧이 막았으면 계산 API를 부르지 않는다").toBe(false);
});

test("대조 — §97의4 단독은 배너가 없다", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionDate: "2003-03-01", reductions: [R974] },
    formOver: { transferDate: "2025-08-01" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);
  await expect(page.getByText("조특법 §127⑦ — 두 감면은 택일입니다")).toHaveCount(0);
});

// V-7 — 거주주택 특례(§155⑳) 선언이 실리는 첫 주택 카드에서는 택일 배너에 경로 안내가 붙는다 (⑧·⑫ 400 문구와 같은 술어·문구).
// 계획서 docs/00-pm/rental-97-v7-residence-path.plan.md Q-3 a. 차단 기준은 그대로다 — 안내는 «반영되지 않는 쪽을 해제하라»는 사실만 알린다.
const RENTAL_HOUSING_DECLARED = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: "2015-06-01",
      rentalRegistrationDate: "2015-06-01",
      rentalInputMode: "direct",
      rentalMonths: "120",
      requirementsConfirmed: true,
    },
  ],
};

test("V-7 — 거주주택 특례 선언 + §97의4 + §99의3: 배너에 경로 안내", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionDate: "2003-03-01", reductions: [R974, R993], rentalHousingException: RENTAL_HOUSING_DECLARED },
    formOver: { transferDate: "2025-08-01" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);

  await expect(page.getByText("조특법 §127⑦ — 두 감면은 택일입니다")).toBeVisible();
  const note = page.getByTestId("track-127-7-rental-housing-notice");
  await expect(note).toBeVisible();
  await expect(note).toContainText("장기임대주택 거주주택 비과세 특례(소득세법 시행령 §155⑳)를 선언한 계산입니다");
  await expect(note).toContainText("성립하지 않으면 일반 경로에서 반영됩니다");
});

test("V-7 대조 — 선언이 없으면 같은 충돌이어도 경로 안내가 없다", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionDate: "2003-03-01", reductions: [R974, R993] },
    formOver: { transferDate: "2025-08-01" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);
  await expect(page.getByText("조특법 §127⑦ — 두 감면은 택일입니다")).toBeVisible();
  await expect(page.getByTestId("track-127-7-rental-housing-notice")).toHaveCount(0);
});
