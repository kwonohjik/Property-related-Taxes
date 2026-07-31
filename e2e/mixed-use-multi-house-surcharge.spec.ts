/**
 * 겸용주택 다주택 중과 E2E — 실제 브라우저에서 폼→API→결과 카드까지.
 *
 * 계획서: docs/02-design/features/transfer-mixed-use-residence-surcharge.plan.md §5 (Phase B)
 *
 * 엔진 anchor(`__tests__/tax-engine/transfer/mixed-use-104-7-surcharge.anchor.test.ts` 27건)가
 * 계산을 커버한다. 여기서는 **엔진이 아니라 배관과 표시**를 본다:
 *   ⑭ route가 top-level `houses`·`isRegulatedArea`를 `mixedAsset.multiHouse`로 넘기는가
 *   ⑦ 결과 카드가 「장기보유공제 (배제)」·「산출세액 (자산별 합계)」를 표시하는가
 *
 * 배관이 끊기면 세액이 조용히 낮아질 뿐 화면은 정상으로 보인다 — 그래서 브라우저 검증이 필요하다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/mixed-use-multi-house-surcharge.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function mixedUseAsset() {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    // ⚠️ 2009-03-16 ~ 2012-12-31 **밖**이어야 한다 — 그 구간 취득은 부칙 §9270호 §14①로
    //    중과 **세율**이 배제되어(장특 배제는 존속) §104⑤2호 채택 화면을 볼 수 없다.
    //    그 분기는 아래 세 번째 test가 따로 고정한다.
    acquisitionDate: "2014-03-15",
    // 매매 취득(§100② 실거래가 안분) — 미입력 시 validate가 차단한다.
    fixedAcquisitionPrice: "700000000",
    isOneHousehold: false,
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "1600000000",
    mixedTransferLandPricePerSqm: "12000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true,
  };
}

/** 세대 보유 주택 2채(양도 겸용주택 + 1) · 조정대상지역 · 중과 한시배제(~2026-05-09) 종료 후 양도 */
function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [mixedUseAsset()],
        transferDate: "2026-06-01",
        filingDate: "2026-08-31",
        contractTotalPrice: "4000000000",
        householdHousingCount: "2",
        isOneHousehold: true,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        houses: [
          {
            id: "h2",
            region: "capital",
            acquisitionDate: "2015-03-01",
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
  await page.evaluate((seed) => {
    sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
  }, seedForm(over));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("주택부분 양도소득금액").first().waitFor({ timeout: 20000 });
}

test.describe("겸용주택 다주택 중과 (§104⑦·§95②)", () => {
  test("조정대상지역 2주택 — 장특 배제 + 자산별 합계 세액이 화면에 표시된다", async ({ page }) => {
    test.setTimeout(60_000);

    // ⑭ 배관 검증 — request body에 houses가 실려 나가는지 직접 확인한다.
    let sentHouses: unknown;
    page.on("request", (req) => {
      if (req.url().includes("/api/calc/transfer") && req.method() === "POST") {
        try {
          const body = JSON.parse(req.postData() ?? "{}");
          sentHouses = body.houses;
        } catch {
          /* ignore */
        }
      }
    });

    await seedAndCalc(page);

    expect(Array.isArray(sentHouses), "houses가 API로 전송되어야 중과 판정이 돈다").toBe(true);

    // ⑦ §95② — 중과 대상 주택은 장기보유특별공제 배제
    await expect(page.getByText("장기보유공제 (배제)").first()).toBeVisible();
    await expect(
      page.getByText("장기보유특별공제 배제", { exact: false }).first(),
    ).toBeVisible();

    // ⑦ §104⑤2호 — 자산별 산출세액 합계가 채택되면 라벨·산식이 바뀐다
    await expect(page.getByText("산출세액 (자산별 합계)").first()).toBeVisible();
    await expect(
      page.getByText("주택분 과세표준 × (누진세율 + 20.00%)", { exact: false }).first(),
    ).toBeVisible();
  });

  test("2008 위기취득(2009-03-16~2012-12-31) — 세율은 배제, 장특 배제는 존속", async ({ page }) => {
    test.setTimeout(60_000);
    // 부칙 §9270호 §14① · 서울행정법원 2024구단72950 — 세율과 장특의 술어가 다르다는 것이
    // 실제 화면에서 갈리는지 본다.
    await seedAndCalc(page, {
      assets: [{ ...mixedUseAsset(), acquisitionDate: "2010-03-15" }],
    });
    await expect(page.getByText("장기보유공제 (배제)").first()).toBeVisible();
    // 세율 가산이 없으므로 §104⑤2호가 채택되지 않는다.
    await expect(page.getByText("산출세액 (기본세율)").first()).toBeVisible();
  });

  test("비조정대상지역 — 중과 미적용 · 장특 라벨이 종전대로", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, { isRegulatedArea: false });

    await expect(page.getByText("장기보유공제 (배제)")).toHaveCount(0);
    await expect(page.getByText("산출세액 (기본세율)").first()).toBeVisible();
  });
});
