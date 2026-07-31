/**
 * 일시적 2주택 §155① 의제 → 다주택 중과 배제(영 §167의10①15호) E2E.
 *
 * 계획서: docs/02-design/features/transfer-surcharge-155-deeming-coverage.plan.md §7 S-7
 *
 * 엔진 anchor(`__tests__/tax-engine/transfer-tax/temporary-two-house-surcharge.anchor.test.ts`)가
 * 계산을 커버한다. 여기서 보는 것은 **배관과 표시**다:
 *   ④⑬⑭ 폼 토글(temporaryTwoHouseSpecial + newHouseAcquisitionDate) → API → 엔진 의제 선판정
 *   ⑦ 결과 카드가 「중과 배제 사유 — 일시적 2주택 특례」를 표시하는가
 *
 * 종전에는 중과 전용 `multiHouseTemporaryTwoHouse`(주택 ID 매칭)를 **아무도 채우지 않아**
 * 이 배제가 통째로 잠들어 있었다(계획서 F-1, 과다과세 +137,130,000).
 * 배관이 끊기면 세액이 조용히 **높아질** 뿐 화면은 정상으로 보인다 — 그래서 브라우저 검증이 필요하다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-155-temp-two-house-surcharge-exclusion.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 12억 초과 고가주택 — §155① 의제가 서면 비과세도 함께 서므로, 중과 배제 효과는 초과분에서만 보인다 */
function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-01-01",
            fixedAcquisitionPrice: "700000000",
            transferPrice: "2000000000",
            residencePeriodYears: "3",
          },
        ],
        transferDate: "2026-06-01", // 중과 한시배제(~2026-05-09) 종료 후
        filingDate: "2026-08-31",
        contractTotalPrice: "2000000000",
        isOneHousehold: true,
        householdHousingCount: "2",
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        temporaryTwoHouseSpecial: true,
        newHouseAcquisitionDate: "2025-01-01", // 종전+1년 경과 · 3년 내 양도
        houses: [
          {
            id: "h2",
            region: "capital",
            acquisitionDate: "2025-01-01",
            officialPrice: "800000000",
            isInherited: false,
            isLongTermRental: false,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
          },
        ],
        presaleRights: [],
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (seed) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("산출세액").first().waitFor({ timeout: 20000 });
}

test.describe("일시적 2주택 §155① 의제 → 중과 배제 (§167의10①15호)", () => {
  test("조정대상지역 2주택 + 일시적 2주택 특례 → 「중과 배제 사유」 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    // 판정 카드 자체가 떠 있어야 아래 단언이 유효하다(카드 미렌더 시 침묵 통과 방지)
    await expect(page.getByText("다주택 중과세 판정 상세").first()).toBeVisible();
    await expect(page.getByText("중과 배제 사유").first()).toBeVisible();
    await expect(page.getByText("일시적 2주택 특례", { exact: true }).first()).toBeVisible();
  });

  test("특례 미적용(토글 OFF) → 배제 없이 중과 적용 (대조군)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {
      temporaryTwoHouseSpecial: false,
      newHouseAcquisitionDate: "",
    });

    await expect(page.getByText("다주택 중과세 판정 상세").first()).toBeVisible();
    await expect(page.getByText("중과 배제 사유")).toHaveCount(0);
  });
});
