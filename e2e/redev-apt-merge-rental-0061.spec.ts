/**
 * 재개발·재건축 완공APT × §155④⑤ 합가 상대 쪽 임대(기준-2024-법규재산-0061) — 브라우저 경로
 * 세액·술어는 anchor(`__tests__/calc/redev-apt-merge-rental-0061.anchor.test.tsx`)가 고정한다. 여기서만 보이는 것:
 * ⑤ 카드가 열려 거주 문항에 답할 수 있고, 답이 계산 본문에 실리며, 근거가 결과 화면에 보인다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";

const NC = "4682025021";
const GANGNAM = "1168010100";
const RULING = /기준-2024-법규재산-0061/;
const other = (id: string, over: Record<string, unknown> = {}) =>
  otherHouse(id, "2018-09-27", { regionCode: NC, officialPrice: "100000000", mergeOrigin: "counterpart_side", ...over });
const unit = () => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2019-09-26",
  rentalRegistrationDate: "2019-09-26",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct",
  rentalMonths: "48",
  requirementsConfirmed: true,
});

function seed(o: { answer?: "yes" | "no"; regionCode?: string; transferDate?: string; price?: string; houses?: Record<string, unknown>[]; asset?: Record<string, unknown>; declared?: boolean } = {}) {
  const transferDate = o.transferDate ?? "2023-09-18";
  const price = o.price ?? "1000000000";
  return {
    houses: o.houses ?? [other("a"), other("b", { isLongTermRental: true })],
    assetOver: {
      assetKind: "redevelopment_apt",
      acquisitionDate: "2008-01-01",
      addressJibun: "경상남도 고성군 테스트리 1",
      regionCode: o.regionCode ?? NC,
      actualSalePrice: price,
      fixedAcquisitionPrice: "",
      redevSubject: "apt",
      redevApprovalDate: "2016-06-01",
      redevApprovalLawBasis: "urban_renovation_art_74",
      redevOriginalAssetType: "housing",
      redevSettlementDirection: "pay",
      redevSettlementAmount: "100000000",
      redevRightsValue: "900000000",
      redevIsSuccessorMember: "no",
      redevActualAcquisitionPrice: "400000000",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "0",
      residencePeriods: [],
      ...(o.declared === false
        ? {}
        : { rentalHousingException: { applyException: true, scenario: "A", priorRentalExemptionHistory: "none", rentalUnits: [unit()], counterpartHouseResidedTwoYears: o.answer ?? "" } }),
      ...o.asset,
    },
    formOver: {
      transferDate,
      filingDate: `${transferDate.slice(0, 4)}-11-30`,
      contractTotalPrice: price,
      parentalCareMergeDate: "2023-06-28",
      parentalCareParentAge: "over_60",
      isFirstTransferredInMerge: true,
    },
  };
}

/** 자산 목록 단계의 ⑤ 기타 특례를 연다. */
async function openExtras(page: Page, o: Parameters<typeof seed>[0] = {}) {
  await gotoTransferHoldingsStep(page, seed(o));
  await page.getByRole("button", { name: "자산 목록" }).first().click();
  await expandAssetSection(page, 5);
}

/** 계산 버튼이 있는 마지막 단계로 간다. */
async function gotoLastStep(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
}

async function calculate(page: Page) {
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.ok(), `계산 API 비정상 응답 ${res.status()}`).toBe(true);
  const request = res.request().postDataJSON() as { rentalHousingException?: { counterpartHouseResidedTwoYears?: boolean } };
  const { result } = ((await res.json()) as { data: { result: { isExempt: boolean; totalTax: number } } }).data;
  return { request, result };
}

test("[RME-1] ★ 문항에 답하지 않으면 막히고, ⑤에서 「예」를 고르면 비과세 · 0061 근거", async ({ page }) => {
  test.setTimeout(90_000);
  await openExtras(page);
  await expect(page.getByTestId("imported-rental-housing-facts")).toBeVisible();
  await expect(page.getByTestId("rental-counterpart-resided-yes")).toBeVisible();

  await gotoLastStep(page);
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText(/합가 상대 쪽 주택에 2년 이상 거주했는지 답하세요/).first()).toBeVisible();

  // 계산 실패가 문항으로 데려다준다 — ⑤ 헤더를 또 누르면 자동 펼침과 겹쳐 접힐 수 있다.
  await expect(page.getByTestId("rental-counterpart-resided-yes")).toBeFocused();
  await page.getByTestId("rental-counterpart-resided-yes").click();
  await expect(page.getByTestId("validation-issues")).toHaveCount(0);
  // 오류가 풀려도 ⑤는 펼친 채 남아 답의 결과가 바로 보인다.
  await expect(page.getByText("합가 상대 쪽 임대 경로라 적용하지 않음", { exact: false })).toBeVisible();

  await gotoLastStep(page);
  const { request, result } = await calculate(page);
  expect(request.rentalHousingException?.counterpartHouseResidedTwoYears).toBe(true);
  expect(result.isExempt).toBe(true);
  expect(result.totalTax).toBe(0);
  await expect(page.getByText(RULING).first()).toBeVisible();
});

/**
 * 계산기 ⑧은 요건 미달을 막지 않는다(`axis-b-late-share-surcharge-and-rhe-dead-end.plan.md` B) — 판정 메뉴처럼 「과세」로 계산된다.
 * 종전에는 「거주 2년」으로 막고 계산기에 선언을 끌 칸이 없어 세액을 낼 수 없었다.
 */
test("[RME-2] 「아니오」 → ⑤에 미충족 안내 · 막지 않고 특례 없이 과세", async ({ page }) => {
  await openExtras(page, { answer: "no" });
  await expect(page.getByText("거주주택 요건이 충족되지 않으면 본 특례가 적용되지 않고 일반 양도소득세로 계산됩니다").first()).toBeVisible();
  await gotoLastStep(page);
  const { result } = await calculate(page);
  expect(result.isExempt).toBe(false);
  expect(result.totalTax).toBeGreaterThan(0);
  await expect(page.getByText(/거주주택 거주기간 2년\(24개월\) 이상이 필요합니다/)).toHaveCount(0);
});

test("[RME-3] 강남 거주 0 · 2026-06 → 3주택 중과와 그 근거가 결과에 보인다", async ({ page }) => {
  test.setTimeout(90_000);
  const pricey = { region: "capital", regionCode: GANGNAM, officialPrice: "400000000", isApartment: true };
  await openExtras(page, {
    answer: "yes",
    regionCode: GANGNAM,
    transferDate: "2026-06-18",
    price: "2000000000",
    houses: [other("a", pricey), other("b", { ...pricey, isLongTermRental: true })],
    asset: { acquisitionDate: "2018-01-01", redevApprovalDate: "2019-06-01" },
  });
  await gotoLastStep(page);
  const { result } = await calculate(page);
  expect(result.isExempt).toBe(false);
  expect(result.totalTax).toBeGreaterThan(0);
  await expect(page.getByText(/중과 판정의 주택 수는 따로 세어 3주택으로 보고/).first()).toBeVisible();
  // 0061 경로로 판정했지만 §154① 거주가 모자라 과세 — 사유 고지(`rhe-e1-notice-and-card-verdict-mismatch.plan.md` A · V-A2 결과 화면)
  await expect(page.getByText(/§155④로 판정했지만, 양도 주택이 「소득세법 시행령」 §154① 거주 2년\(현재 0개월\) 요건을 충족하지 못해 비과세되지 않습니다/).first()).toBeVisible();
});

test("[RME-4] ★ 판정 메뉴에서 답하고 넘어와 완공APT로 바꿔도 사실과 문항 답이 ⑤에 남는다", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2023-09-18",
    contractTotalPrice: "800000000",
    parentalCareMergeDate: "2023-06-28",
    parentalCareParentAge: "over_60",
    isFirstTransferredInMerge: true,
    assets: [{
      assetKind: "housing", acquisitionDate: "2019-08-08", regionCode: NC, addressJibun: "경상남도 창원시 테스트동 1",
      residenceInputMode: "direct", residencePeriodMonthsAsset: "0",
      rentalHousingException: {
        applyException: true, scenario: "A", priorRentalExemptionHistory: "none",
        rentalUnits: [{
          unitId: "b", businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26", rentalCategory: "long_general", rentalAcquisitionType: "purchase",
          isApartment: false, region: "seoul-metro", standardPriceAtRentalStart: "300000000", acquisitionOfficialPrice: "300000000", isNationalSizeHousing: true, hasMinimum2Units: true,
          rentalMonths: "48", requirementsConfirmed: true,
        }],
      },
    }],
    houses: [other("a")],
  });
  await page.getByTestId("rental-merge-origin-0-counterpart").click();
  await page.getByTestId("rental-counterpart-resided-yes").click();
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await page.getByTestId("one-house-to-calculator").click();
  await page.waitForURL(/\/calc\/transfer-tax/);
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByRole("button", { name: "재개발/재건축 APT" }).click();
  await expandAssetSection(page, 5);
  await expect(page.getByTestId("imported-rental-housing-facts")).toBeVisible();
  await expect(page.getByText("합가 상대 쪽 임대 경로라 적용하지 않음", { exact: false })).toBeVisible();
});

test("[RME-5] 선언 없는 완공APT → ⑤가 판정 메뉴로 안내 · 수령 단독신고는 ⑤ 없음", async ({ page }) => {
  await openExtras(page, { declared: false });
  await expect(page.getByTestId("rental-housing-handoff-notice")).toBeVisible();

  await gotoTransferHoldingsStep(page, seed({ declared: false, asset: { redevSettlementDirection: "receive", redevReceiveOnlyMode: "yes" } }));
  await page.getByRole("button", { name: "자산 목록" }).first().click();
  await expect(page.locator('[data-asset-card-index="0"] [data-asset-section="4"]')).toBeVisible();
  await expect(page.locator('[data-asset-card-index="0"] [data-asset-section="5"]')).toHaveCount(0);
});

for (const [name, asset] of [
  ["완공APT", {}],
  ["일반 주택", { assetKind: "housing", acquisitionDate: "2019-08-08", fixedAcquisitionPrice: "300000000" }],
] as const) {
  test(`[RME-7] ★ ${name} — 문항 미답 오류는 계산 실패 즉시, 그리고 안내를 누르면 거주 문항으로 간다`, async ({ page }) => {
    await openExtras(page, { asset });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // dev 표시기가 하단 버튼을 덮는다
    await gotoLastStep(page);
    await page.getByRole("button", { name: /계산하기/ }).click();

    const question = page.getByTestId("rental-counterpart-resided-yes");
    await expect(question).toBeFocused();
    await expect(question).toBeInViewport();

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await expect(question).not.toBeFocused();
    await expect(question).not.toBeInViewport();

    const issue = page.getByTestId("validation-issues").getByRole("button", { name: /합가 상대 쪽 주택에 2년 이상 거주했는지 답하세요/ });
    await issue.click();
    await expect(question).toBeFocused();
    await expect(question).toBeInViewport();

    await question.click();
    await expect(issue).toHaveCount(0);
  });
}

for (const [name, colorScheme] of [["다크 375", "dark"], ["라이트 375", "light"]] as const) {
  test.describe(name, () => {
    test.use({ colorScheme, viewport: { width: 375, height: 800 } });
    test(`[RME-6] ${name} — 문항 카드 가로 넘침 없음`, async ({ page }) => {
      await openExtras(page);
      await expect(page.getByTestId("rental-counterpart-resided-hint")).toBeVisible();
      const o = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(o.s).toBeLessThanOrEqual(o.c);
    });
  });
}
