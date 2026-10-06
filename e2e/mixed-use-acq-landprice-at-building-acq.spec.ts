/**
 * B0 — 겸용주택 「주택부수토지 개별공시지가 — 건물 취득일 기준」 칸 E2E
 *
 * 결함: 토지·건물 취득일이 다르면 개별주택가격(건물 취득일 공시)에서 **토지 취득일** 공시지가를 빼서
 *       건물분 기준시가를 구했다(서로 다른 날짜의 값끼리의 뺄셈). → 별개 취득이면 건물 취득일 기준
 *       공시지가를 따로 입력받는다. 노출·전송·필수가 같은 술어(엔진 leaf `isBuildingDayLandPriceRequired`).
 *
 * 설계: docs/02-design/features/mixed-use-acq-std-date-mismatch.ui.design.md §7
 * 규약: 미노출 단언(E-2·E-6)에는 같은 spec의 긍정 단언(E-1)이 짝으로 있다.
 *
 * worktree 실행: E2E_PORT=3116 npx playwright test e2e/mixed-use-acq-landprice-at-building-acq.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const FIELD_TID = "mixed-acq-land-price-at-building-acq";
const INPUT_TID = "mixed-acq-land-price-at-building-acq-input";

function mixedAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    isOneHousehold: false,
    isMixedUseHouse: true,
    hasSeperateLandAcquisitionDate: true,
    acquisitionDate: "2010-03-15", // 건물 취득일
    landAcquisitionDate: "2005-06-10", // 토지 취득일 (다름)
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000", // 토지 취득일 기준 (기존 칸)
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true,
    fixedAcquisitionPrice: "700000000",
    // 단건 모드의 총 양도가액 정본 — 자산 편집 시 `updateAssets`가 이 값으로 contractTotalPrice를 다시 쓴다
    // (비워 두면 첫 입력 직후 「총 양도가액을 입력하세요」로 막힌다).
    actualSalePrice: "1500000000",
    ...over,
  };
}

/** 시드 후 ③ 취득 섹션을 연다 — 취득시 기준시가 입력칸이 이 섹션에 있다(접힌 섹션은 DOM엔 있으나 hidden). */
async function seed(page: Page, asset: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = {
    ...createDefaultTransferFormData(),
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assets: [asset],
    transferDate: "2026-02-16",
    filingDate: "2026-04-30",
    contractTotalPrice: "1500000000",
    householdHousingCount: "1",
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
  };
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // dev 서버 Next.js 표시기 배지가 하단 버튼을 덮는다
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  await expandAssetSection(page, 3);
}

async function fillDate(page: Page, testid: string, y: string, m: string, d: string) {
  const root = page.getByTestId(testid);
  await root.getByLabel("연도").fill(y);
  await root.getByLabel("월").fill(m);
  await root.getByLabel("일").fill(d);
}

/** 계산 요청 body 의 겸용 서브객체 */
interface CapturedMixedUse {
  acquisitionStandardPrice: { landPricePerSqm?: number; landPricePerSqmAtBuildingAcq?: number };
}
async function calcAndCaptureMixedUse(page: Page): Promise<CapturedMixedUse> {
  const reqPromise = page.waitForRequest(
    (r) => r.url().includes("/api/calc/transfer") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const req = await reqPromise;
  const body = req.postDataJSON() as { mixedUse?: CapturedMixedUse; assets?: Array<{ mixedUse?: CapturedMixedUse }> };
  return (body.mixedUse ?? body.assets?.[0]?.mixedUse) as CapturedMixedUse;
}

test.describe("B0 겸용 — 건물 취득일 기준 공시지가 칸", () => {
  test("E-1 노출 · E-2 날짜를 같게 하면 미렌더 · E-6 PHD ON 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, mixedAsset());
    // E-1 긍정
    const field = page.getByTestId(FIELD_TID);
    await expect(field).toBeVisible();
    await expect(field).toContainText("토지 취득일(2005-06-10)");
    await expect(field).toContainText("건물 취득일(2010-03-15)");
    // 기존 토지일 칸은 그대로 + 캡션
    await expect(page.getByPlaceholder("취득시 개별공시지가 /㎡")).toHaveCount(1);
    await expect(page.getByText("토지 취득일 기준", { exact: true })).toBeVisible();

    // E-2: 같은 시드에서 토지일을 건물일과 같게 → DOM에서 사라진다(display:none 아님)
    await fillDate(page, "acq-date-land", "2010", "03", "15");
    await expect(page.getByTestId(FIELD_TID)).toHaveCount(0);
    await expect(page.getByText("토지 취득일 기준", { exact: true })).toHaveCount(0);
  });

  test("E-6 PHD ON → 칸 부재 (같은 날짜 상이 시드의 E-1 긍정과 짝)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, mixedAsset({ acquisitionDate: "2000-01-01", landAcquisitionDate: "1995-06-10", usePreHousingDisclosure: true }));
    await expect(page.getByTestId(FIELD_TID)).toHaveCount(0);
  });

  test("E-3 미입력 차단 — 오류 문구 + 신규 칸으로 포커스 이동", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, mixedAsset());
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toContainText(
      /건물 취득일\(2010-03-15\) 기준 주택부수토지/,
    );
    const input = page.getByTestId(INPUT_TID);
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
  });

  test("E-4 request body — 신규 키와 토지일 키가 서로 다른 값으로 전달", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, mixedAsset());
    await page.getByTestId(INPUT_TID).fill("3000000");
    const mixedUse = await calcAndCaptureMixedUse(page);
    expect(mixedUse.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq).toBe(3_000_000);
    expect(mixedUse.acquisitionStandardPrice.landPricePerSqm).toBe(2_500_000);
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30000 });
  });

  test("E-5 날짜가 같으면 값이 store에 남아 있어도 미전송", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(
      page,
      mixedAsset({ landAcquisitionDate: "2010-03-15", mixedAcqLandPricePerSqmAtBuildingAcq: "3000000" }),
    );
    await expect(page.getByTestId(FIELD_TID)).toHaveCount(0);
    const mixedUse = await calcAndCaptureMixedUse(page);
    expect(mixedUse.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq).toBeUndefined();
    expect(mixedUse.acquisitionStandardPrice.landPricePerSqm).toBe(2_500_000);
  });
});
