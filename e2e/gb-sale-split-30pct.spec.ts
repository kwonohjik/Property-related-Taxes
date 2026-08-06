/**
 * E2E: 일반건물 **구분양도 + §100③ 30% 의제** 실플로우 (Phase 2-F).
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §5 · §16.6
 *
 * 각 계층 anchor(G-1~G-6 엔진 · ④⑧⑫ 배관 · ⑤ 위젯)는 계층을 따로 잡는다. 이 spec은
 * **폼에 값이 있을 때 판정이 결과 화면까지 도달하는가**를 한 번에 통과시킨다.
 *
 * ## fixture — 사례 31 (`general-building-case-31.test.ts`와 같은 자산)
 *
 * 총액 925,000,000 · 양도시 기준시가 토지 920,550,000 / 건물 20,629,440
 * ⇒ 안분값 **토지 904,725,192 / 건물 20,274,808**.
 *
 * 건물이 실질 제약이다 — 분모가 작아 같은 차이 금액이 큰 비율이 된다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            acquisitionCause: "purchase",
            acquisitionDate: "1999-05-24",
            useEstimatedAcquisition: true,
            gbLandArea: "85",
            gbBuildingArea: "180.96",
            gbBuildingFootprintArea: "90.48",
            gbTransferLandPricePerSqm: "10830000",
            gbTransferBuildingValue: "20629440",
            gbAcqLandPricePerSqm: "2800000",
            gbAcqBuildingValue: "28144700",
            gbBuildingAcquisitionCause: "purchase",
            gbZoneType: "commercial",
            gbIsMetropolitan: true,
            // ⚠️ `actualSalePrice`는 두지 않는다 — 단건 총 양도가액은 폼-전역 `contractTotalPrice`
            //    에서 온다(`transfer-tax-api.ts:232-238`). 통과 선례(`general-building-97-2-swap`)도 같다.
            ...over,
          },
        ],
        transferDate: "2023-02-19",
        filingDate: "2023-04-30",
        contractTotalPrice: "925000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, over: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20_000 });
}

const SPLIT = { saleSplitMode: "actual" };

test.describe("일반건물 §100③ 30% 의제 (Phase 2-F)", () => {
  test("적정범위 구분 기재(9억/2,500만) → 구분값이 그대로 적용된다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {
      ...SPLIT,
      landTransferPrice: "900000000",
      buildingTransferPrice: "25000000",
    });

    const block = page.getByTestId("sale-split-judgment");
    await expect(block).toBeVisible();
    await expect(block).toContainText("30% 미만 차이로 그대로 적용");
    // 적용 가액이 구분값이다 — 안분값(904,725,192)이 아니다
    await expect(block).toContainText("900,000,000");
    await expect(block).not.toContainText("안분가액을 적용했습니다");
  });

  test("🔴 건물 몰아주기(8.25억/1억) → 안분가액으로 되돌아온다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {
      ...SPLIT,
      landTransferPrice: "825000000",
      buildingTransferPrice: "100000000",
    });

    const block = page.getByTestId("sale-split-judgment");
    await expect(block).toBeVisible();
    await expect(block).toContainText("안분가액을 적용했습니다");
    // 적용 가액 = 사례 31 안분값
    await expect(block).toContainText("904,725,192");
    await expect(block).toContainText("20,274,808");
  });

  /**
   * 🔴 감정평가가액 축 — **⑭ Date 변환까지 실증한다.**
   *
   * 감정일자는 JSON을 거쳐 **문자열**로 도착한다. route helper가 `Date`로 바꾸지 않으면 엔진의
   * 유효 창 비교(`getTime()`)가 런타임에 깨지는데, 그 구간은 vitest 배관 anchor가 닿지 않는다
   * (Zod parse 결과를 엔진에 직접 넣기 때문이다).
   *
   * 감정 토지 4억 / 건물 5.25억(합 = 총액) ⇒ 감정 비율 안분은 그대로 4억 / 5.25억이고,
   * 기준시가 안분값(904,725,192)과 확연히 다르다 — 어느 basis를 썼는지 화면에서 갈린다.
   */
  test("🔴 감정평가가액이 있으면 기준시가 대신 그 비율로 안분한다 (부가령 §64①1호 단서)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {
      landAppraisalAtTransfer: "400000000",
      buildingAppraisalAtTransfer: "525000000",
      appraisalDateAtTransfer: "2022-06-01", // 양도 2023-02-19 ⇒ 창 [2022-01-01, 2023-12-31]
    });

    const allocation = page.getByRole("heading", { name: "양도가액 안분" }).locator("..").locator("..");
    await expect(allocation).toContainText("400,000,000");
    await expect(allocation).toContainText("525,000,000");
    await expect(allocation, "기준시가 안분값이 나오면 감정가액이 무시된 것이다").not.toContainText("904,725,192");
  });

  test("일괄양도(기본)는 판정 블록이 뜨지 않는다 — 비교 대상이 없다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {});
    await expect(page.getByTestId("sale-split-judgment")).toHaveCount(0);
    // 종전 안분 표시는 그대로다(회귀 0) — 일반건물 실화면은 다자산 뷰의 「양도가액 안분」 카드다
    await expect(page.getByRole("heading", { name: "양도가액 안분" })).toBeVisible();
  });
});
