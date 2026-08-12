/**
 * E2E: 부담부증여 결과탭 — 증여세 신고서 양식(별지 제10호) 출력
 *
 * 요구의 핵심은 **위치**다 — 「건물 기준시가 계산서」 바로 위.
 * `PrintSection`이 `data-print-id`를 DOM에 남기므로(`PrintSection.tsx:27`) 기준시가 계산서
 * 내부가 스냅샷 부재로 비어 있어도 **래퍼는 존재**해 순서를 정확히 비교할 수 있다.
 *
 * 계획서: docs/01-plan/features/burdened-gift-filing-form-in-transfer-result.plan.md
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/**
 * 인수채무 B = 보증금 10억 + 차입금 31.2억 = 41.2억.
 * 증여재산가액 C는 `stdPrice`로 조절한다 — C > B면 무상이전분이 남아 증여세가 산출된다.
 */
function seedAsset(stdPrice: string) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building" as const,
    transferType: "burdened_gift" as const,
    bgValuationMode: "sangjeungbeop_standard" as const,
    bgLendingDepositTotal: "1000000000",
    bgMortgageDebtAmount: "3120000000",
    bgDonorRelation: "lineal_descendant" as const,
    bgGiftBuildingStdPriceAtTransfer: stdPrice,
    standardPriceAtTransfer: stdPrice,
    standardPriceAtAcq: "800000000",
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2012-01-01",
  };
}

const FORM = '[data-print-id="gift-filing-form"]';
const STD_REPORT = '[data-print-id="building-std-report"]';

async function calcTo(page: Page, stdPrice: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((asset) => {
    sessionStorage.setItem(
      "transfer-tax-wizard",
      JSON.stringify({
        state: { formData: { assets: [asset], transferDate: "2025-03-15" }, pendingMigration: false },
        version: 0,
      }),
    );
  }, seedAsset(stdPrice));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  const card = page.locator('[data-asset-card-index="0"]');
  await fillDateAndVerify(page, { year: "2025", month: "03", day: "15" }, { scope: card });
  await expandAssetSection(page, 2);

  for (let i = 0; i < 4; i++) {
    const next = page.getByRole("button", { name: /다음|계산하기/ }).last();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(500);
  }
  // ⚠️ 결과 도달 판정에 `getByText("총 납부세액")`을 쓰지 말 것 — 같은 라벨이 요약 카드(인쇄용
  //    hidden)에도 있어 `.first()`가 hidden을 잡고 toBeVisible이 실패한다(e2e/CLAUDE.md §3).
  //    기준시가 계산서 PrintSection 래퍼는 결과 화면에서 항상 렌더되므로 이것으로 판정한다.
  await expect(page.locator(STD_REPORT)).toHaveCount(1, { timeout: 20000 });
}

test.describe("부담부증여 결과탭 — 증여세 신고서 양식", () => {
  test("BGF-1: 무상이전분이 있으면 서식이 렌더된다", async ({ page }) => {
    await calcTo(page, "5000000000"); // C 50억 > B 41.2억 → 무상이전분 8.8억
    await expect(page.locator(FORM)).toHaveCount(1);
    await expect(
      page.getByText("증여세 신고서 양식 (별지 제10호서식 [2020.03.13. 개정])"),
    ).toBeVisible();
  });

  test("BGF-2: 납세의무자가 수증자임을 밝힌다 (양도세와 주체가 다름)", async ({ page }) => {
    await calcTo(page, "5000000000");
    const notice = page.locator(FORM).getByText(/납세의무자는.*수증자/);
    await expect(notice).toBeVisible();
  });

  test("BGF-3: 서식이 건물 기준시가 계산서보다 앞에 온다 (요구의 핵심)", async ({ page }) => {
    await calcTo(page, "5000000000");
    // 두 PrintSection 래퍼는 내용 유무와 무관하게 존재한다 → DOM 순서 비교가 항상 성립
    await expect(page.locator(STD_REPORT)).toHaveCount(1);
    const order = await page.evaluate(
      ([f, s]) => {
        const form = document.querySelector(f);
        const std = document.querySelector(s);
        if (!form || !std) return null;
        // Node.DOCUMENT_POSITION_FOLLOWING = 4 → form 다음에 std가 온다
        return (form.compareDocumentPosition(std) & 4) !== 0;
      },
      [FORM, STD_REPORT],
    );
    expect(order).toBe(true);
  });

  /**
   * 상증법 §47① — 「증여재산가액에서 수증자가 인수한 채무를 뺀 금액」이 과세가액이다.
   * ⑰에는 **채무 차감 전 총 평가액**, ㉒에 채무액이 각각 드러나야 한다.
   * (2026-08-12 사용자 지적 — 종전에는 ⑰에 이미 뺀 값이 들어가고 ㉒가 0으로 표시됐다)
   */
  test("BGF-4: ⑰ 총 평가액 − ㉒ 채무액 = ㉔ 과세가액", async ({ page }) => {
    await calcTo(page, "5000000000"); // C 50억, B 41.2억 → 과세가액 8.8억
    await expect(page.locator('[data-testid="bg-besshi10-⑰"]')).toContainText("5,000,000,000");
    await expect(page.locator('[data-testid="bg-besshi10-㉒"]')).toContainText("4,120,000,000");
    await expect(page.locator('[data-testid="bg-besshi10-㉔"]')).toContainText("880,000,000");
  });

  /**
   * 채무액이 증여가액을 전부 덮으면(B = C) 무상이전분이 0이라 증여세 자체가 산출되지 않는다.
   * ⚠️ 관계(donorRelation) 미선택은 미렌더 조건이 아니다 — 엔진에 fallback이 있다.
   */
  test("BGF-5: 무상이전분이 0이면 서식이 없다", async ({ page }) => {
    await calcTo(page, "2000000000"); // 보충적 20억 < 담보평가 41.2억 → C = B → 무상이전분 0
    await expect(page.locator(FORM)).toHaveCount(0);
  });

  test("BGF-6: 선택 출력 패널에 항목이 뜬다", async ({ page }) => {
    await calcTo(page, "5000000000");
    // 화면 렌더와 별개로 availablePrintIds에 등록돼야 인쇄 항목으로 고를 수 있다.
    await expect(
      page.getByText("증여세 신고서 양식 (별지 제10호)", { exact: false }).first(),
    ).toBeVisible();
  });
});

/**
 * 🔴 일반건물(토지+건물 일괄)은 route가 `mode: "bundled"`로 분기해 `BundledAllocationCard`가
 *    결과뷰 종착지가 된다. 단건 뷰에만 배선했더니 이 경로에서 서식이 통째로 사라졌다
 *    (2026-08-12 사용자 제보). 경로별로 고정한다.
 */
test.describe("부담부증여 결과탭 — 일반건물(bundled) 경로", () => {
  async function calcGeneralBuilding(page: Page) {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    // seed는 `burdened-gift-std-price-calculator.spec.ts`의 GB 조합을 따른다.
    // ⚠️ 부분 asset을 손으로 만들면 store 반영 경로에서 TypeError가 난다 → makeDefaultAsset 스프레드 필수.
    // ⚠️ 채무 B가 평가액 C를 넘으면 EXCESS_BURDENED_GIFT로 계산이 차단된다(상증법 §47③).
    //    C = 토지 7,500,000×100 + 건물 631,846,500 ≈ 13.8억 → 채무는 3억으로 둬 무상이전분을 남긴다.
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "general_building" as const,
      transferType: "burdened_gift" as const,
      bgValuationMode: "sangjeungbeop_standard" as const,
      bgLendingDepositTotal: "100000000",
      bgMortgageDebtAmount: "200000000",
      bgDonorRelation: "lineal_descendant" as const,
      acquisitionCause: "purchase" as const,
      gbBuildingAcquisitionCause: "purchase" as const,
      acquisitionDate: "2015-01-01",
      gbLandArea: "100",
      gbBuildingArea: "200",
      gbBuildingFootprintArea: "100",
      gbZoneType: "commercial" as const,
      gbTransferLandPricePerSqm: "7500000",
      gbTransferBuildingValue: "631846500",
      gbAcqLandPricePerSqm: "2130000",
      gbAcqBuildingValue: "424472064",
    };
    await page.evaluate((a) => {
      sessionStorage.setItem(
        "transfer-tax-wizard",
        JSON.stringify({
          state: { formData: { assets: [a], transferDate: "2025-03-15" }, pendingMigration: false },
          version: 0,
        }),
      );
    }, asset);
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const card = page.locator('[data-asset-card-index="0"]');
    await fillDateAndVerify(page, { year: "2025", month: "03", day: "15" }, { scope: card });
    await expandAssetSection(page, 2);
    for (let i = 0; i < 4; i++) {
      const next = page.getByRole("button", { name: /다음|계산하기/ }).last();
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator(STD_REPORT)).toHaveCount(1, { timeout: 20000 });
  }

  test("BGF-GB-1: 일반건물 일괄 결과에도 서식이 렌더된다", async ({ page }) => {
    await calcGeneralBuilding(page);
    await expect(page.locator(FORM)).toHaveCount(1);
  });

  test("BGF-GB-2: 일반건물에서도 기준시가 계산서보다 앞에 온다", async ({ page }) => {
    await calcGeneralBuilding(page);
    const order = await page.evaluate(
      ([f, s]) => {
        const form = document.querySelector(f);
        const std = document.querySelector(s);
        if (!form || !std) return null;
        return (form.compareDocumentPosition(std) & 4) !== 0;
      },
      [FORM, STD_REPORT],
    );
    expect(order).toBe(true);
  });
});
