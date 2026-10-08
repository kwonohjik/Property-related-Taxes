/**
 * E2E: 소령 §167의3①3호 감면대상장기임대주택 — 양도 주택 입력 → 요청 본문 → 결과 화면.
 *
 * 🔴 종전에는 이 호에 닿는 입력 칸이 화면에 없었다(엔진만 판정). 여기서는 2주택 세대가 보유 상황
 *    단계의 「양도 주택이 조특법 감면 임대주택인 경우」 칸을 켜고 임대기간·국민주택을 넣으면
 *    ① 양도 주택 행에 `isTaxIncentiveRental`·`rentalPeriodYears`·`isNationalSizeHousing`이 실려 가고
 *    ② 결과에 「조특법 감면 임대주택」 배제 사유가 나오는지 본다.
 *
 * 세액은 dev 서버의 세율 원천(DB/fallback)에 따라 달라질 수 있어 단언하지 않는다 — 금액 anchor는
 * `__tests__/api/transfer.route.tax-incentive-rental-3ho.anchor.test.ts`.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-tax-incentive-rental-3ho.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const GANGNAM = "1168010100";

function seedForm() {
  return {
    state: {
      formData: {
        householdNoPresaleRightsConfirmed: true, // roster-required PR-D
        assets: [
          {
            ...makeDefaultAsset(1), ...DIRECT_RESIDENCE,
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            // 1995 취득(anchor 시나리오)은 화면 경로에서 토지·건물 분리 기준시가를 추가로 요구한다 —
            // 세액을 단언하지 않는 이 spec은 그 축과 무관한 취득일을 쓴다.
            acquisitionDate: "2013-06-01",
            fixedAcquisitionPrice: "100,000,000",
            regionCode: GANGNAM,
          },
        ],
        transferDate: "2026-08-01",
        contractTotalPrice: "1,500,000,000",
        householdHousingCount: "2",
        isOneHousehold: true,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: "0",
        houses: [
          {
            id: "house_other_1",
            region: "capital",
            regionCode: GANGNAM,
            acquisitionDate: "2014-01-01",
            officialPrice: "300000000",
            isInherited: false,
            isLongTermRental: false,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openHolding(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("§167의3①3호 감면대상장기임대주택 — 입력 → 요청 → 결과", () => {
  test("양도 주택 3호를 켜고 임대기간·국민주택을 넣으면 행에 실리고 결과에 배제 사유가 나온다", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page);

    const card = page.getByTestId("selling-tax-incentive-rental-toggle");
    await expect(card).toBeVisible();
    await card.getByRole("switch", { name: /^양도 주택이 조특법 감면 임대주택/ }).click();
    await card.getByPlaceholder("임대기간 입력").fill("6");
    await card.getByRole("switch", { name: /^국민주택/ }).click();

    for (const step of ["감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    const errText = resp.ok() ? "" : (await resp.text()).slice(0, 600);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()} ${errText}`).toBe(true);

    const sent = resp.request().postDataJSON() as { houses?: Record<string, unknown>[] };
    expect(sent.houses?.[0]).toMatchObject({
      id: "selling",
      isTaxIncentiveRental: true,
      rentalPeriodYears: 6,
      isNationalSizeHousing: true,
    });
    expect(sent.houses?.[1]).not.toHaveProperty("isTaxIncentiveRental");

    const body = await resp.json();
    const reasons = (body.data.result.multiHouseSurchargeEvaluation?.exclusionReasons ?? []) as { type: string }[];
    expect(reasons.map((r) => r.type)).toEqual(["tax_incentive_rental"]);
    await expect(page.getByText("조특법 감면 임대주택", { exact: true }).first()).toBeVisible();
  });
});
