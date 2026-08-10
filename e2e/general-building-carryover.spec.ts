/**
 * Pre-Do E2E — 일반건물 × 배우자등 이월과세(§97의2).
 *
 * 계획: `docs/00-pm/transfer-gb-carryover-wiring.plan.md`
 * 설계: `docs/02-design/features/transfer-gb-carryover-wiring.engine.design.md` D3·D6
 *
 * ## 🔑 왜 E2E가 이 작업의 핵심인가
 *
 * 결함의 모양이 「**200 OK · 오류 없음 · 세액 그대로**」였다(계획 §2 ③). vitest는 payload를
 * 손으로 만들어 route를 부르므로 그 상태를 **통과시킨다** — 손으로 만든 payload에는
 * `landCarryoverTaxation`이 이미 들어 있기 때문이다.
 *
 * **폼에서 그 payload가 만들어지는지**는 E2E만 본다(PR #1161 교훈 — vitest anchor 48건이
 * green인 상태에서 UI 결함 4건이 나왔다).
 *
 * ## `test.fail()` 규약
 *
 * 아래 두 건은 **아직 구현되지 않았다**. 구현이 착지하면 `test.fail()`을 제거한다.
 * ⚠️ 다시 필요해지면 회귀 신호다 — 표기를 바꾸지 말고 원인을 고칠 것.
 *
 * ## 실행 (워크트리)
 *
 *   E2E_PORT=3130 npx playwright test e2e/general-building-carryover.spec.ts
 *
 * ⚠️ `E2E_PORT`를 빼면 메인 트리 서버를 재사용해 「내 코드가 아닌 것」을 테스트한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const TOTAL = "1000000000";

/** 일반건물 환산 모드 기준선 — 취득원인만 갈아끼운다. */
function seedForm(carryover: boolean) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            acquisitionCause: carryover ? "carryover_gift" : "purchase",
            gbBuildingAcquisitionCause: "purchase",
            acquisitionDate: "2021-03-01",
            useEstimatedAcquisition: true,
            landAcqMode: "estimated",
            buildingAcqMode: "estimated",
            gbLandArea: "100",
            gbBuildingArea: "200",
            gbBuildingFootprintArea: "50",
            gbTransferLandPricePerSqm: "2000000",
            gbTransferBuildingValue: "200000000",
            gbZoneType: "general_residential",
            gbAcqLandPricePerSqm: "1000000",
            gbAcqBuildingValue: "100000000",
            actualSalePrice: TOTAL,
            ...(carryover
              ? {
                  carryover: {
                    giftRegistryDate: "2021-03-01",
                    donorAcquisitionDate: "2005-06-15",
                    donorAcquisitionCause: "purchase",
                    useEstimatedAcquisition: false,
                    estimationMode: null,
                    donorStandardPriceAtAcquisition: "",
                    donorStandardPriceAtTransfer: "",
                    donorAcquisitionPrice: "150000000",
                    giftTaxAmount: "30000000",
                    donorCapitalExpenditure: "",
                    giftDateValuation: "400000000",
                    exclusionDeclared: {
                      expropriationWithin2Years: false,
                      oneHouseExemptionApplies: false,
                      isFamilyBusinessInheritedAsset: false,
                    },
                  },
                }
              : {}),
          },
        ],
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        contractTotalPrice: TOTAL,
        householdHousingCount: "2",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalculate(page: Page, carryover: boolean): Promise<number> {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(carryover),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await resp;
  expect(res.ok(), `계산 API 비정상 응답 ${res.status()}`).toBe(true);
  const body = await res.json();
  return body.data?.aggregated?.determinedTax as number;
}

test.describe("일반건물 × 이월과세(§97의2)", () => {
  // ══════════════════════════════════════════════════════════════════
  // K-17 — 폼에서 입력하면 세액이 **실제로** 바뀐다 🔴
  // ══════════════════════════════════════════════════════════════════
  test("K-17: 이월과세를 고르면 세액이 달라진다", async ({ page }) => {
    test.fail(); // 🔴 미구현 — ④가 서브객체를 만들지 않아 조용히 무시된다
    test.setTimeout(150_000);

    const off = await seedAndCalculate(page, false);
    const on = await seedAndCalculate(page, true);

    /**
     * 🔑 **차분으로 판정한다.** 절대값을 고정하면 mock이 아닌 실 세율표에서 깨지고,
     * 「달라졌다」만 보면 되므로 그게 이 anchor의 전부다.
     * 지금은 두 값이 **완전히 같다** — 그것이 결함의 증거다(계획 §2 ③).
     */
    expect(off, "기준선 세액을 못 읽었다").toBeGreaterThan(0);
    expect(on, "이월과세를 골랐는데 세액이 그대로다 — ④ 배선 미착지").not.toBe(off);
  });

  // ══════════════════════════════════════════════════════════════════
  // K-16 — 비교과세 근거 카드가 화면에 뜬다 🔴
  // ══════════════════════════════════════════════════════════════════
  test("K-16: 비교과세 결과 카드가 렌더된다", async ({ page }) => {
    test.fail(); // 🔴 미구현 — 카드가 단건 `result.carryoverTaxationDetail`만 읽는다(설계 D3)
    test.setTimeout(120_000);

    await seedAndCalculate(page, true);

    /**
     * 비교과세(§97의2②3호)는 두 시나리오 중 **세액이 큰 쪽**을 채택한다.
     * 근거를 안 보여주면 납세자가 검산할 수 없다.
     *
     * GB는 `mode: "bundled"`라 명세가 `aggregated.properties[]`에 실리는데,
     * `CarryoverComparisonCard`는 단건 `result.carryoverTaxationDetail`만 읽는다 ⇒ 미렌더.
     */
    await expect(
      page.getByText("이월과세 비교과세 결과").first(),
      "비교과세 카드가 없다 — 세액은 맞아도 근거를 검산할 수 없다",
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("[A] 이월과세 적용").first()).toBeVisible();
  });
});
