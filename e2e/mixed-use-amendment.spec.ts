/**
 * 겸용주택 수정신고·경정청구 E2E
 *
 * 국세기본법 §45·§45의2 — 겸용주택(mode:"mixed-use") 정정 지원.
 * 엔진 앵커(__tests__/tax-engine/transfer-tax/mixed-use-amendment.test.ts)가 계산을 커버 —
 *   여기서는 실제 브라우저(store→API→result→결과 카드 DOM)에서 표시·라벨을 검증한다.
 *
 * 시딩: mixed-use-filing-form-4col.spec.ts의 겸용 자산 + transfer-amendment.spec.ts의 amendmentMode 주입 결합
 *       (동일 키 sessionStorage("transfer-tax-wizard")).
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/mixed-use-amendment.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 일반 겸용주택(§97 직접 환산, PHD 미적용) — 4col 스펙과 동일 자산 */
function mixedUseAsset() {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-15",
    isOneHousehold: false,
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true,
    // 겸용주택 실가 모드의 §100② **피안분액** — 없으면 validate가 계산을 차단해
    // 결과 화면에 도달하지 못한다("자산: 겸용주택 취득 실거래가액을 입력하세요").
    // 정본 시드는 mixed-use-filing-form-4col.spec.ts.
    fixedAcquisitionPrice: "700000000",
  };
}

/** 겸용 자산 + 정정 모드 주입 (이력 진입 hydration과 동등한 상태) */
function seedForm(correction: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [mixedUseAsset()],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "1500000000",
        householdHousingCount: "1",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        ...correction,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, correction: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((seed) => {
    sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
  }, seedForm(correction));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByTestId("amendment-result").waitFor({ timeout: 20000 });
}

test.describe("겸용주택 수정신고·경정청구", () => {
  test("수정신고 — 추가납부 hero + 표 라벨 '수정 후 전체 세액'", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {
      amendmentMode: true,
      correctionKind: "amend",
      originalDeterminedTax: "30000000",
      statutoryFilingDeadline: "2027-05-31",
    });

    const hero = page.getByTestId("amendment-result");
    await expect(hero).toBeVisible();
    await expect(hero.getByText("추가 납부세액", { exact: false }).first()).toBeVisible();

    // D10: 세액표 결론 행이 카드 라벨("참고 · 수정 후 전체 세액")과 일치 — 같은 금액에 다른 라벨 금지
    await expect(page.getByText("수정 후 전체 세액").first()).toBeVisible();
    // exact — 카드 산출근거의 "수정신고 총 납부세액"(추가본세+가산세, 별개 개념)은 부분일치로 걸린다
    await expect(page.getByText("총 납부세액", { exact: true })).toHaveCount(0);
  });

  test("경정청구 — 환급 hero + 표 라벨 '경정 후 전체 세액'", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {
      amendmentMode: true,
      correctionKind: "refund_claim",
      claimReasonType: "ordinary",
      originalDeterminedTax: "900000000",
      statutoryFilingDeadline: "2027-05-31",
      amendedFilingDate: "2027-06-01",
    });

    const hero = page.getByTestId("amendment-result");
    await expect(hero.getByText("환급 청구세액")).toBeVisible();
    await expect(page.getByText("경정 후 전체 세액").first()).toBeVisible();
    // exact — 카드 산출근거의 "수정신고 총 납부세액"(추가본세+가산세, 별개 개념)은 부분일치로 걸린다
    await expect(page.getByText("총 납부세액", { exact: true })).toHaveCount(0);
  });

  test("비-정정 겸용주택은 기존 표시 유지 — hero 없음 + '총 납부세액'", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((seed) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
    }, seedForm({}));
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    await expect(page.getByText("총 납부세액").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("amendment-result")).toHaveCount(0);
  });
});
