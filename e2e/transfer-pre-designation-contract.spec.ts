/**
 * E2E: 조정대상지역 **공고 전 매매계약** 중과 배제(영 §167의10①11호 등) — 폼 입력 → 요청 본문 → 결과 화면.
 * 계획서: docs/00-pm/regulated-area-region-code-match.plan.md (D-2 입력 경로 · D-3 두 축 분리).
 *
 * 🔴 종전에는 이 호에 닿는 입력 칸이 화면에 없었다. 여기서는 사용자가 보유 상황 단계에서 새 칸을 켜고
 *    양도 매매계약일을 넣으면 ① 양도 주택 행에 `contractDate`·`saleDepositReceived`가 실려 가고
 *    ② 결과에 「조정대상지역 공고일 이전 매매계약」과 공고일(2017-11-10)이 나오는지 본다.
 *
 * 세액은 dev 서버의 세율 원천(DB/fallback)에 따라 달라질 수 있어 단언하지 않는다 — 금액 anchor는
 * `__tests__/api/transfer.route.pre-designation-contract.anchor.test.ts`(단건 = 다건 · 겸용).
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-pre-designation-contract.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const GANGNAM = "1168010100";

function seedForm(transferDate: string, regionCode = GANGNAM) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2013-06-01",
            fixedAcquisitionPrice: "300,000,000",
            regionCode,
          },
        ],
        transferDate,
        contractTotalPrice: "2,000,000,000",
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

async function openHolding(page: Page, transferDate: string, regionCode?: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(transferDate, regionCode));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("공고 전 매매계약(영 §167의10①11호) — 입력 → 요청 → 결과", () => {
  test("칸을 켜고 계약일을 넣으면 양도 주택 행에 실리고 결과에 공고일 배제가 나온다", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page, "2018-09-01");

    // 공고일 안내 — 2017년 차수는 2017.11.10.(지정 효력 2017.8.3.)
    await expect(page.getByTestId("pre-designation-announcement")).toContainText("2017.11.10.");
    await expect(page.getByTestId("pre-designation-sale-contract-date")).toHaveCount(0);
    await page.getByTestId("pre-designation-sale-deposit-toggle").getByRole("switch").click();
    const date = page.getByTestId("pre-designation-sale-contract-date");
    await date.locator("input").nth(0).fill("2017");
    await date.locator("input").nth(1).fill("07");
    await date.locator("input").nth(2).fill("01");

    for (const step of ["감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const sent = resp.request().postDataJSON() as { houses?: Record<string, unknown>[] };
    expect(sent.houses?.[0]).toMatchObject({ id: "selling", contractDate: "2017-07-01", saleDepositReceived: true });
    expect(sent.houses?.[1]?.contractDate).toBeUndefined();

    const body = await resp.json();
    const reasons = (body.data.result.multiHouseSurchargeEvaluation?.exclusionReasons ?? []) as { type: string; detail: string }[];
    expect(reasons.map((r) => r.type)).toEqual(["pre_designation_contract"]);
    expect(reasons[0].detail).toContain("2017-11-10");

    await expect(page.getByText("조정대상지역 공고일 이전 매매계약").first()).toBeVisible();
    await expect(page.getByText(/조정대상지역 공고일\(2017-11-10/).first()).toBeVisible();
  });

  test("[짝] 양도일이 조정대상지역이 아니면(청주 2019) 칸 자체가 없다 — ④·⑧과 같은 범위", async ({ page }) => {
    await openHolding(page, "2019-06-01", "4311110100");
    await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId("pre-designation-sale-deposit-toggle")).toHaveCount(0);
  });
});
