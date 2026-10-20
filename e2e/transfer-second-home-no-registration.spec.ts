/**
 * E2E: 인구감소지역 세컨드홈(영 §167의3①12호 다·라목) — **등록·신청 요건 없음** (PR #2309).
 *
 * 다·라목 문언은 취득시기(2026.1.1.~)·소재·동일 시·군·구 아님·가액만 요구한다. 종전 화면은 「세컨드홈 특례 등록」
 * 칩을 켜야만 중과 주택 수에서 뺐다(근거 없는 요건 — 미체크 시 3주택 +30%p).
 *
 * 강남 양도 주택 + 강남 1채 + 평창(인구감소지역, 2026.1.15. 취득, 기준시가 5억 — 1호 「지방 3억 이하」를 피해 다목만 걸리게) 1채, 양도일 2026-11-10:
 *  ① 명부 편집 창에 「세컨드홈 특례 등록」 칩이 없고, 「인구감소지역 소재 주택」은 소재지 자동판정으로 켜져 보인다
 *  ② 요청 본문에 `isSecondHomeRegistered`가 실리지 않고, 결과는 평창 주택을 빼 2주택 중과(multi_house_2)
 *  ③ [짝] 토글을 끄면(소재 아님 선언) 3주택 중과(multi_house_3plus)
 *
 * 세액은 dev 서버 세율 원천에 따라 달라질 수 있어 단언하지 않는다 — 금액은 vitest anchor가 본다.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-second-home-no-registration.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const GANGNAM = "1168010100";
const PYEONGCHANG = "5176025021"; // 강원 평창군 — 인구감소지역(수도권 밖, 다목 9억)

function seedForm() {
  return {
    state: {
      formData: {
        householdNoPresaleRightsConfirmed: true,
        assets: [
          {
            ...makeDefaultAsset(1), ...DIRECT_RESIDENCE,
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2013-06-01",
            fixedAcquisitionPrice: "300,000,000",
            regionCode: GANGNAM,
          },
        ],
        transferDate: "2026-11-10",
        contractTotalPrice: "2,000,000,000",
        householdHousingCount: "3",
        isOneHousehold: true,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: "0",
        houses: [
          {
            id: "house_other_1",
            region: "capital",
            acquisitionOrigin: "general",
            regionCode: GANGNAM,
            acquisitionDate: "2014-01-01",
            officialPrice: "300000000",
            isInherited: false,
            isLongTermRental: false,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
          },
          {
            id: "house_pyeongchang",
            region: "non_capital",
            acquisitionOrigin: "general",
            regionCode: PYEONGCHANG,
            acquisitionDate: "2026-01-15",
            officialPrice: "500000000",
            isInherited: false,
            isLongTermRental: false,
            isApartment: false,
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
  await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
}

/** 평창 행(명부 두 번째 행) 편집 창을 연다 */
async function openPyeongchangEditor(page: Page) {
  const table = page.getByRole("table").first();
  await table.getByRole("button", { name: /편집/ }).nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 3000 });
  return dialog;
}

async function calculate(page: Page) {
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
  return resp;
}

type Eval = {
  surchargeType: string;
  effectiveHouseCount: number;
  excludedHouses: { houseId: string; reason: string }[];
};

test.describe("인구감소지역 세컨드홈 — 등록 요건 없음 (영 §167의3①12호 다·라목)", () => {
  test("등록 칩이 없고, 자동판정만으로 평창 주택을 빼 2주택 중과가 된다", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page);

    const dialog = await openPyeongchangEditor(page);
    const popToggle = dialog.getByRole("switch", { name: /인구감소지역 소재 주택/ });
    await expect(popToggle).toBeVisible();
    await expect(popToggle).toBeChecked(); // 소재지 자동판정(평창) — 엔진과 같은 술어로 표시
    await expect(dialog.getByRole("switch", { name: /세컨드홈 특례 등록/ })).toHaveCount(0);
    await expect(dialog.getByText("세컨드홈 특례 등록")).toHaveCount(0);
    await expect(dialog.getByText("등록 요건 없음", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "완료" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    const resp = await calculate(page);
    const sent = resp.request().postDataJSON() as { houses?: Record<string, unknown>[] };
    for (const h of sent.houses ?? []) expect(h).not.toHaveProperty("isSecondHomeRegistered");

    const body = await resp.json();
    const ev = body.data.result.multiHouseSurchargeEvaluation as Eval;
    expect(ev.excludedHouses).toEqual(
      expect.arrayContaining([expect.objectContaining({ houseId: "house_pyeongchang", reason: "population_decline_second_home" })]),
    );
    expect(ev.effectiveHouseCount).toBe(2);
    expect(ev.surchargeType).toBe("multi_house_2");
  });

  test("[짝] 「인구감소지역 소재 주택」을 끄면(소재 아님 선언) 산입되어 3주택 중과", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page);

    const dialog = await openPyeongchangEditor(page);
    const popToggle = dialog.getByRole("switch", { name: /인구감소지역 소재 주택/ });
    await popToggle.click();
    await expect(popToggle).not.toBeChecked();
    await dialog.getByRole("button", { name: "완료" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    const resp = await calculate(page);
    const sent = resp.request().postDataJSON() as { houses?: Record<string, unknown>[] };
    const pc = (sent.houses ?? []).find((h) => h.id === "house_pyeongchang");
    expect(pc?.isPopulationDeclineArea).toBe(false);

    const body = await resp.json();
    const ev = body.data.result.multiHouseSurchargeEvaluation as Eval;
    expect(ev.excludedHouses.some((e) => e.reason === "population_decline_second_home")).toBe(false);
    expect(ev.effectiveHouseCount).toBe(3);
    expect(ev.surchargeType).toBe("multi_house_3plus");
  });
});
