/**
 * E2E: **부동산 ↔ 기타자산 §102② 크로스 차손 통산** (PR-4)
 *
 * 계획서: `docs/00-pm/cross-engine-102-2-loss-offset.plan.md` §8 CL-1~CL-3
 *
 * ## 왜 E2E여야 하는가
 *
 * 통산 «계산»은 순수 함수라 vitest가 본다(PR-3). 그런데 **세액이 바뀌는 곳은 배선**이다 —
 * 크로스 화면이 두 엔진을 다시 돌리며 주입하는 그 지점. 라이브러리 anchor는
 * 「화면이 그 함수를 부르는가」를 보지 못하고, 이 저장소에서 **여섯 번 연속** 그 갭이
 * 재현됐다([[feedback_library_anchor_does_not_prove_component_uses_it]]).
 *
 * ⇒ 계획서 §7의 뮤테이션 **P-5(배선 제거)**를 잡는 것은 이 spec뿐이다.
 *
 * 실행: npx playwright test e2e/cross-102-2-loss-offset.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { createInitialStockFormData } from "../lib/stores/calc-wizard-stock-store";

const NOW = "2026-09-17T00:00:00.000Z";

/**
 * ⚠️ **앱의 기본 폼에서 출발한다** — 손으로 최소 필드만 적으면 신규 배열 필드가 추가될 때마다
 *   픽스처가 조용히 낡아 화면이 죽는다([[feedback_fixture_default_masks_gate_defect]]).
 */
function propertyForm(o: { acqPrice: string; price: string }) {
  return {
    ...createDefaultTransferFormData(),
    assets: [
      {
        ...makeDefaultAsset(1),
        addressJibun: "서울 강남구 테스트동 1-1",
        assetKind: "land",
        acquisitionDate: "2018-06-01",
        acquisitionArea: "1000",
        useEstimatedAcquisition: false,
        isAppraisalAcquisition: false,
        isSalesCaseAcquisition: false,
        fixedAcquisitionPrice: o.acqPrice,
        directExpenses: "0",
        isNonBusinessLand: false,
        reductions: [],
      },
    ],
    transferDate: "2024-06-01",
    filingDate: "",
    contractTotalPrice: o.price,
    householdHousingCount: "1",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isOneHousehold: false,
  };
}

/** 부동산 다자산 이력 — 차익 자산 1건. `resultData`는 화면의 «감지»가 읽는 최소 형태. */
function realEstateRecord(income: number) {
  return {
    id: "e2e-cross-loss-re",
    userId: "local-user",
    taxType: "transfer",
    title: "부동산 다건 2024",
    inputData: {
      __multiTransfer: true,
      taxYear: 2024,
      properties: [
        {
          propertyId: "rp1",
          propertyLabel: "토지 A",
          completionPercent: 100,
          form: propertyForm({ acqPrice: "500000000", price: "1000000000" }),
        },
      ],
      activePropertyIndex: 0,
      activeStep: "settings",
      annualBasicDeductionUsed: "0",
    },
    resultData: {
      groupTaxes: [],
      calculatedTaxByGroups: 153_060_000,
      calculatedTax: 153_060_000,
      determinedTax: 153_060_000,
      taxBase: 400_000_000,
      clause1BucketTaxBase: 400_000_000,
      clause1BucketTax: 153_060_000,
      clause8TaxBase: 0,
      clause8Tax: 0,
      basicDeduction: 2_500_000,
      reductionAmount: 0,
      // 🔑 크로스 차손 «감지»가 읽는 자리 — 통산 «전» 양도소득금액 + §102② 세율축
      properties: [
        {
          propertyId: "rp1",
          propertyLabel: "토지 A",
          income,
          lossOffsetRateKey: "prog:104-1-1",
          isExempt: false,
        },
      ],
    },
    taxLawVersion: "2024",
    linkedCalculationId: null,
    clientId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** 기타자산(§94①4호) 이력 — `transferIncome`이 음수면 크로스 차손이다. */
function otherAssetRecord(transferIncome: number, price: string) {
  return {
    id: "e2e-cross-loss-oa",
    userId: "local-user",
    taxType: "stock_transfer",
    title: "기타자산 2024",
    inputData: {
      // ⚠️ 부동산 쪽과 같은 이유로 **앱의 기본 폼에서 출발**한다 — 최소 필드만 적으면
      //   `parseIntOrZero(undefined)`가 터진다(실측: "Cannot read properties of undefined").
      ...createInitialStockFormData(),
      securityName: "과점주주 지분",
      marketType: "other_asset",
      isMajorShareholder: false,
      // §94①4호 다목 3요건 — 빠뜨리면 ⑧이 차단한다
      isQualifyingBlockShareholder: true,
      cumulativeTransferRatio: "60",
      blockShareholderRealEstateRatio: "60",
      blockShareholderOwnershipRatio: "60",
      aggregationFirstTransferDate: "2024-06-01",
      acquisitionDate: "2020-01-01",
      transferDate: "2024-06-01",
      priorYearEndDate: "2023-12-31",
      shareCount: "100",
      totalIssuedShares: "1000000",
      acquisitionCause: "purchase",
      transferActualInputMode: "total",
      transferTotalPrice: price,
      acquisitionMode: "actual",
      // 입력 방식 기본값은 「합계 직접 입력」이다 — 단가 축 seed 는 명시해야 한다(안 하면 취득가액 0)
      acquisitionActualInputMode: "per_share",
      perShareAcquisitionPrice: "5000000",
      expenseMode: "actual",
      filingType: "preliminary",
      filingDate: "2024-08-31",
    },
    resultData: {
      basicDeductionGroup: "real_estate_and_other_asset",
      taxCategory: "other_asset_block_shareholder",
      isShortTermHolding: false,
      isExempt: false,
      transferIncome,
      taxBase: Math.max(0, transferIncome),
      calculatedTax: 0,
      clause1BucketTaxBase: Math.max(0, transferIncome),
      clause1BucketTax: 0,
      clause9TaxBase: 0,
      clause9Tax: 0,
      basicDeduction: 0,
    },
    taxLawVersion: "2024-06-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function openWithSeeds(page: Page, oaIncome: number, oaPrice: string) {
  await page.goto("/calc/cross-104-5");
  await page.waitForLoadState("networkidle");
  await putCalculationRecord(page, realEstateRecord(440_000_000));
  await putCalculationRecord(page, otherAssetRecord(oaIncome, oaPrice));
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByText("부동산 다건 2024").click();
  await page.getByText("기타자산 2024").click();
}

test.describe("§102② 크로스 차손 통산", () => {
  test("CL-3: 🔒 차손이 없으면 통산 제안이 뜨지 않는다 (오탐 0)", async ({ page }) => {
    // 기타자산도 **차익**(양도 10억 − 취득 5억) → 통산할 차손이 없다
    await openWithSeeds(page, 500_000_000, "1000000000");
    await expect(page.getByTestId("cross-loss-offset-run")).toHaveCount(0);
  });

  test("CL-1: 🔴 기타자산 차손이 부동산 차익에서 공제되어 **세액이 줄어든다**", async ({ page }) => {
    test.setTimeout(120_000);
    // 기타자산 양도 3억 · 취득 5억 → 양도차손 −2억
    await openWithSeeds(page, -200_000_000, "300000000");

    await page.getByTestId("cross-loss-offset-run").click();
    const table = page.getByTestId("cross-loss-offset-table");
    await expect(table).toBeVisible({ timeout: 60_000 });

    // ① 부동산 자산의 양도소득금액이 **정확히 차손만큼** 줄었다 (영 §167의2①1호 — 같은 세율군)
    await expect(table).toContainText("450,000,000 → 250,000,000");
    await expect(table).toContainText("차손 200,000,000 공제");

    /**
     * ② 🔴 **세액이 그 통산 «후» 금액을 기준으로 나온다.**
     *
     * 과세표준 합계 247,500,000(= 250,000,000 − 기본공제 2,500,000) → 74,110,000.
     * 배선이 빠지면 부동산이 450,000,000 그대로라 과세표준이 447,500,000이 되고 세액이
     * **세 자릿수 만원 단위로** 커진다 — 그래서 이 숫자가 배선의 지문이다(계획서 §7 P-5).
     *
     * ⚠️ 「저장된 값으로 돌린 합산 계산」과 비교하지 «않는다» — 그쪽은 이 spec이 손으로 적은
     *   `resultData`라 재계산값과 축이 다르다. 비교하면 통산과 무관한 차이를 재게 된다.
     */
    await expect(page.getByText("§104⑤ 합산 산출세액")).toBeVisible();
    await expect(page.getByText("과세표준 합계 247,500,000")).toBeVisible();
    await expect(page.getByText("74,110,000").first()).toBeVisible();
  });

  test("CL-2: 통산 내역이 **자산별로** 보인다 (누가 얼마를 흡수했는가)", async ({ page }) => {
    test.setTimeout(120_000);
    await openWithSeeds(page, -200_000_000, "300000000");
    await page.getByTestId("cross-loss-offset-run").click();

    const table = page.getByTestId("cross-loss-offset-table");
    await expect(table).toBeVisible({ timeout: 60_000 });
    await expect(table).toContainText("부동산");
    await expect(table).toContainText("기타자산");
    // 흡수 행은 「통산 전 → 통산 후 (차손 N 공제)」 형태다
    await expect(table).toContainText("차손");
    await expect(table).toContainText("공제");
  });
});
