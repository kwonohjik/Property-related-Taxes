/**
 * 비주택 → 주택 용도변경 end-to-end (「소득세법」 §95⑤·⑥ · 시행령 §154⑤ 단서).
 *
 * 참조 사례: 『2026 양도·상속·증여세 이론 및 계산실무』 사례 30 (533~538p)
 *   오피스텔을 업무용으로 취득(2018-02-10) → 주거용 전환(2022-11-25) → 양도(2026-01-27)
 *
 * 세액 자체는 anchor(`non-housing-to-housing-conversion.anchor.test.ts`)가 원 단위로 고정한다.
 * 본 스펙은 **UI 배선**을 검증한다 — 입력 미리보기가 엔진과 같은 값을 내는지, 그 입력이
 * 5단 파이프라인(폼 → API 변환 → Zod → Route → 엔진)을 통과해 결과 화면에 닿는지.
 *
 * ⚠️ **sessionStorage 시드 방식**이 양도세 E2E 정본이다(`commercial-building-97-2-swap.spec.ts`).
 *    §95⑤ 게이트(1세대1주택 + 통산 거주 2년 + 2025-01-01 이후 양도)를 충족하는 필드를
 *    빠뜨리면 조용히 표1 단독 경로로 떨어져 20%가 아니라 14%가 나온다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/non-housing-to-housing-conversion.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** PDF 사례 30 시드 — 15억 양도·6억 취득 고가주택, 거주 3년 */
function seedForm(overrides: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2018-02-10",
          fixedAcquisitionPrice: "600000000",
          actualSalePrice: "1500000000",
          capitalExpenditure: "7300000",
          transferExpense: "0",
          // §95⑤ 토글 — 이 2필드가 혼합 공제율의 유일한 입력이다
          hasNonHousingConversion: true,
          residentialUseStartDate: "2022-11-25",
          // 거주 3년 → 표2 거주분 12%. 이 값이 없으면 표2 대상 판정 자체가 무너진다
          residenceInputMode: "direct",
          residencePeriodMonthsAsset: "36",
          ...overrides,
        }],
        transferDate: "2026-01-27",
        filingDate: "2026-03-31",
        contractTotalPrice: "1500000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: true,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, overrides: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(overrides),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 위젯은 자산 카드 ③ 취득 섹션 안에 있다. 접힌 채로는 DOM에만 있고 보이지 않아
  // toBeVisible 단언이 실패한다(toHaveText는 hidden도 통과하므로 검증이 약해진다).
  await expandAssetSection(page, 3);
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("비주택 → 주택 용도변경 §95⑤·⑥", () => {
  test("입력 미리보기가 기간을 비주택·주택으로 나눠 공제율을 보여준다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);

    // 미리보기는 엔진 헬퍼(calcUsagePeriodInfo·calcConversionHoldingPct)를 직접 호출한다 —
    // 여기 값이 어긋나면 화면과 계산이 갈렸다는 뜻이다.
    await expect(page.getByTestId("conversion-total-holding")).toHaveText("7년 11개월");
    await expect(page.getByTestId("conversion-nonhousing-holding")).toContainText("표1 8%");
    await expect(page.getByTestId("conversion-housing-holding")).toContainText("표2 12%");
    await expect(page.getByTestId("conversion-holding-rate")).toHaveText("20%");
    // 20% < 40%라 단서가 발동하지 않는다
    await expect(page.getByTestId("conversion-rate-capped")).toHaveCount(0);
  });

  test("§95⑤1호 단서 — 표1+표2 합계가 40%를 넘으면 자른다", async ({ page }) => {
    test.setTimeout(120_000);
    // 비주택 12년(표1 24%) + 주택 8년(표2 32%) = 56% → 40%
    await seed(page, { acquisitionDate: "2005-01-10", residentialUseStartDate: "2018-01-10" });

    await expect(page.getByTestId("conversion-nonhousing-holding")).toContainText("표1 24%");
    await expect(page.getByTestId("conversion-housing-holding")).toContainText("표2 32%");
    await expect(page.getByTestId("conversion-holding-rate")).toHaveText("40%");
    await expect(page.getByTestId("conversion-rate-capped")).toBeVisible();
  });

  test("시행일 전 양도는 종전 방식으로 계산한다 (부칙 제19933호 제7조)", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    // 양도일을 2024-12-31로 되돌리면 §95⑤이 적용되지 않는다
    await page.evaluate(() => {
      const raw = sessionStorage.getItem("transfer-tax-wizard")!;
      const s = JSON.parse(raw);
      s.state.formData.transferDate = "2024-12-31";
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s));
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);

    await expect(
      page.getByText("2025년 1월 1일 이후 양도분부터 적용됩니다").first(),
    ).toBeVisible();
    await expect(page.getByTestId("conversion-holding-rate")).toHaveCount(0);
  });

  test("★ 계산 결과 — 혼합 공제율이 결과 화면·명세서에 닿는다", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page);
    await calculate(page);

    // 상세 카드 — 보유분이 표1+표2로 나뉜 근거
    await expect(page.getByText("비주택으로 보유한 기간 4년 → 표1").first()).toBeVisible();
    await expect(page.getByText("주택으로 보유한 기간 3년 → 표2").first()).toBeVisible();

    // 산출 단계 산식 — 자기일관(보유 20% + 거주 12% = 32%)
    await expect(
      page.getByText(/비주택 보유 4년 표1 8% \+ 주택 보유 3년 표2 12%/).first(),
    ).toBeVisible();

    // 장기보유특별공제 총액 (anchor: 178,540,000 × 32%)
    await expect(page.getByText("57,132,800").first()).toBeVisible();

    // 명세서 보유/거주 기간분 — 20:12 안분. 총 보유 기준(28:12)이면 39,992,960이 나온다.
    await expect(page.getByText("35,708,000").first()).toBeVisible();
    await expect(page.getByText("21,424,800").first()).toBeVisible();

    // 산출세액·지방소득세 (anchor 고정값)
    await expect(page.getByText("26,177,520").first()).toBeVisible();
    await expect(page.getByText("2,617,752").first()).toBeVisible();
  });

  test("토글을 끄면 종전 표2 경로로 돌아간다 (회귀 0)", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, { hasNonHousingConversion: false, residentialUseStartDate: "" });
    await calculate(page);

    // 총 보유 7년 표2 = 28% + 거주 12% = 40% → 178,540,000 × 40%
    await expect(page.getByText("71,416,000").first()).toBeVisible();
    // §95⑤ 상세 카드는 나타나지 않는다
    await expect(page.getByText("비주택 → 주택 용도변경 장기보유특별공제")).toHaveCount(0);
  });
});
