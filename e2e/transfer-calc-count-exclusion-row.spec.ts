/**
 * 양도세 계산기 — 조특법 주택 수 제외를 **명부 행 ⑥**에서 지정 → 계산 → 결과 (브라우저 경로)
 *
 * 계획서 `docs/00-pm/transfer-calc-count-exclusion-row-link.plan.md`. 엔진·④·⑧ 주장은 anchor가 고정한다
 * (`__tests__/calc/transfer-calc-count-exclusion-row-link.anchor.test.ts`). 여기서만 보이는 것:
 * 행 모달 입력이 그 행에 붙어 계산 본문에 실리고, 결과 카드가 그 주택을 가리키는가 · 옛 선언 카드가
 * 차단을 푸는가.
 *
 * 사실관계(C2 — 해석례 서면-2021-부동산-6220과 같은 구조): 양도 대상 2015-01-01 취득 · 2024-06-01 양도 ·
 * 9억 · 농어촌주택 R 2021-01-01 · 신규 일반주택 N 2023-12-01.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const HOUSES = [otherHouse("r", "2021-01-01"), otherHouse("n", "2023-12-01")];

async function calculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return {
    request: resp.request().postDataJSON() as { reductions?: { type: string; houseId?: string }[] },
    body: (await resp.json()) as { data: { result: { isExempt: boolean } } },
  };
}

test("[CCX-1] 행 편집 ⑥ 농어촌주택 → 배지 → 본문에 행 id → 비과세 · 결과가 그 주택을 가리킨다", async ({ page }) => {
  await gotoTransferHoldingsStep(page, { houses: HOUSES });

  await page.getByRole("button", { name: "주택 1 편집" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("house-row-count-exclusion-new_99_4_rural").click();
  await dialog.getByTestId("new994-stdprice-price-input").locator("input").fill("150000000");
  await dialog.getByRole("switch", { name: /소재지 요건 충족 확인/ }).click();
  await dialog.getByRole("button", { name: "완료" }).click();
  await expect(page.getByTestId("house-count-exclusion-badge-r")).toHaveText("주택 수 제외: 농어촌주택");

  const { request, body } = await calculate(page);
  expect(request.reductions).toEqual([
    expect.objectContaining({ type: "new_99_4_rural", houseId: "r", ruralHouseAcquisitionDate: "2021-01-01" }),
  ]);
  expect(body.data.result.isExempt).toBe(true);
  await expect(page.getByTestId("count-exclusion-house-ref")).toHaveText("대상: 보유 주택 1 (2021-01-01 취득)");
});

test("[CCX-1+] 짝 — 지정하지 않으면 3주택 과세", async ({ page }) => {
  await gotoTransferHoldingsStep(page, { houses: HOUSES });
  const { request, body } = await calculate(page);
  expect((request.reductions ?? []).filter((r) => r.type === "new_99_4_rural")).toEqual([]);
  expect(body.data.result.isExempt).toBe(false);
});

test("[CCX-2] 어느 주택인지 모르는 옛 선언 — 안내 카드에 나오고, 삭제하면 사라진다", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("n", "2016-01-01")],
    assetOver: {
      reductions: [
        {
          type: "new_99_4_rural",
          ruralHouseAcquisitionDate: "2021-01-01",
          ruralHouseStdPrice: "150000000",
          ruralHouseJibun: "",
          isRegisteredHanok: false,
          isAdjacentArea: false,
          meetsLocationRequirement: true,
        },
      ],
    },
  });
  const card = page.getByTestId("one-house-legacy-count-exclusion");
  await expect(card).toContainText("취득일 2021-01-01");
  await card.getByTestId("one-house-legacy-count-exclusion-clear").click();
  await page.getByRole("button", { name: "삭제" }).click();
  await expect(card).toHaveCount(0);
});

/**
 * 겸용주택 양도 — 같은 행 ⑥ 선언이 겸용 결과뷰(`MixedUseResultCard`)에도 카드로 뜬다.
 * 종전에는 겸용 엔진이 detail을 결과 최상위에 싣는데도 결과뷰가 감면 detail 묶음만 넘겨
 * 카드가 한 번도 그려지지 않았다(`__tests__/components/mixed-use-count-exclusion-cards.anchor.test.tsx`).
 */
test("[CCX-3] 겸용주택 — 행 ⑥ 농어촌주택이 본문에 행 id로 실리고 결과 카드가 그 주택을 가리킨다", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [
      otherHouse("r", "2020-05-01", {
        countExclusion: {
          kind: "reduction",
          reduction: {
            type: "new_99_4_rural",
            ruralHouseAcquisitionDate: "2020-05-01",
            ruralHouseStdPrice: "150000000",
            ruralHouseJibun: "",
            isRegisteredHanok: false,
            isAdjacentArea: false,
            meetsLocationRequirement: true,
          },
        },
      }),
    ],
    assetOver: {
      acquisitionDate: "2014-03-15",
      fixedAcquisitionPrice: "700000000",
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
      mixedIsMetropolitanArea: false,
    },
    formOver: { transferDate: "2026-06-01", filingDate: "2026-08-31", contractTotalPrice: "2000000000" },
  });
  await expect(page.getByTestId("house-count-exclusion-badge-r")).toHaveText("주택 수 제외: 농어촌주택");

  const { request } = await calculate(page);
  expect(request.reductions).toEqual([
    expect.objectContaining({ type: "new_99_4_rural", houseId: "r", ruralHouseAcquisitionDate: "2020-05-01" }),
  ]);
  await page.getByText("주택부분 양도소득금액").first().waitFor();
  await expect(page.getByText("§99의4 — 농어촌주택 소유주택 제외").first()).toBeVisible();
  await expect(page.getByTestId("count-exclusion-house-ref")).toHaveText("대상: 보유 주택 1 (2020-05-01 취득)");
});
