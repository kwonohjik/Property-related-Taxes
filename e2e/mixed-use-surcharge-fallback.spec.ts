/**
 * 겸용주택 §104⑦ 중과 — **세대 주택 목록 미입력 시 fallback** 실브라우저 회귀 E2E.
 *
 * 엔진 anchor(`__tests__/tax-engine/transfer/mixed-use-surcharge-fallback.anchor.test.ts`)는
 * `surchargeFallback`을 **직접 주입**하고, route anchor는 body만 준다. 본 spec은 그것이
 * **폼에서 실제로 만들어지는지**를 지킨다 — 폼→④→⑬→⑭→엔진→화면 전 구간.
 *
 * 종전: 목록을 채우지 않으면 겸용주택에 중과가 통째로 미적용됐다(실측 505,484,136원 과소).
 *
 * 검증:
 *   F-1 목록 미입력 + 조정·2주택 → 「장기보유공제 (배제)」 + 근사 경고
 *   F-2 목록 입력 시와 **같은 세액** (입력 방식이 세액을 가르지 않는다)
 *   F-3 대조군 비조정 → 배제·경고 모두 없음
 *
 * 계획서: docs/00-pm/transfer-mixed-use-surcharge-fallback.plan.md
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/mixed-use-surcharge-fallback.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function mixedUseAsset() {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    // ⚠️ 2009-03-16 ~ 2012-12-31 **밖** — 그 구간 취득은 부칙 §9270호 §14①로 세율만 배제된다.
    acquisitionDate: "2014-03-15",
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

/**
 * ⚠️ **양도일 2026-06-01은 고정 조건이다** — 2026-05-09 이하이면 영 §167의3①12의2 가목
 *    한시배제로 중과가 안 걸려 결함이 있어도 초록이 된다(구별력 0).
 */
function seedForm(withHouses: boolean, over: Record<string, unknown> = {}) {
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
        houses: withHouses
          ? [{
              id: "h2",
              region: "capital",
              acquisitionDate: "2015-03-01",
              officialPrice: "800000000",
              isInherited: false,
              isLongTermRental: false,
              isApartment: true,
              isOfficetel: false,
              isUnsoldHousing: false,
            }]
          : [],
        presaleRights: [],
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

/** 결과의 「주택부분 산출세액」 등 합계 세액을 API 응답에서 직접 읽는다 (표시 문구 의존 최소화). */
async function seedAndCalc(page: Page, withHouses: boolean, over: Record<string, unknown> = {}) {
  const bodies: unknown[] = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/calc/transfer")) {
      try {
        bodies.push(await res.json());
      } catch {
        /* noop */
      }
    }
  });
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(withHouses, over));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("주택부분 양도소득금액").first().waitFor({ timeout: 25000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (bodies[0] as any).data.result;
}

test.describe("겸용주택 §104⑦ — 목록 미입력 fallback", () => {
  test("F-1: 🔴 목록 없이 조정·2주택 → 장특 배제 + 근사 경고", async ({ page }) => {
    test.setTimeout(90_000);
    const r = await seedAndCalc(page, false);

    // 정밀 판정 없이 fallback으로 걸렸다.
    expect(r.multiHouseSurcharge).toBeUndefined();
    expect(r.total.surchargeAddon).toBe(0.2);
    expect(r.housingPart.longTermDeductionAmount).toBe(0);

    // 화면 — 결과 카드가 배제를 말한다.
    await expect(page.getByText("장기보유공제 (배제)").first()).toBeVisible();
  });

  test("F-2: 🔑 목록 입력 시와 **세액이 같다**", async ({ page }) => {
    test.setTimeout(90_000);
    const without = await seedAndCalc(page, false);
    const withList = await seedAndCalc(page, true);

    expect(withList.multiHouseSurcharge?.surchargeType).toBe("multi_house_2"); // 전제 확인
    expect(without.total.determinedTax).toBe(withList.total.determinedTax);
    expect(without.housingPart.longTermDeductionAmount).toBe(
      withList.housingPart.longTermDeductionAmount,
    );
  });

  test("F-3: 대조군 — 비조정지역은 배제·경고 모두 없다", async ({ page }) => {
    test.setTimeout(90_000);
    const r = await seedAndCalc(page, false, { isRegulatedArea: false });

    expect(r.total.surchargeAddon).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
    await expect(page.getByText("장기보유공제 (배제)")).toHaveCount(0);
  });
});
