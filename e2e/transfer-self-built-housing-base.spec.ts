/**
 * E2E — 일체 주택 본인 신축 × 「소득세법」 §114조의2 환산·감정가액 5% 가산세: base 를 «해당 건물»분으로 (Q-12 PR-2: ④⑤⑧)
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7.6~7.10 · §9 PR-2)
 * 시드 수치는 엔진 anchor 와 같다 — 신축 2022-01-10 · 양도 2026-03-01 · 양도가 10억 · 주택공시가격 취득 2억/양도 4억 ·
 * 취득 당시 토지 1억(㎡당 100만 × 100㎡)·건물 6천만 · 양도 당시 토지 2.4억(㎡당 240만 × 100㎡)·건물 1.6억 → 건물분 base 187,500,000 · 가산세 9,375,000
 * (종전 자산 전체 base 500,000,000 · 25,000,000).
 *
 *  SB-1 입력을 시드로 채운 환산: request body 의 `selfBuiltHousing` 5값 · 신고서 가산세액 9,375,000
 *  SB-2 UI 입력 경로: 토글 ON → 카드가 빈 채로 뜬다(pageerror 0) → 칸을 입력 → body·결과 · 앵커 각 1개
 *  SB-3 ⑧ 차단: 칸이 비면 «다음» 이 막히고 화면에 있는 첫 칸으로 이동 → 채울 때마다 다음 칸 → 통과
 *  SB-4 감정: 건물 감정가액 직접 입력(5,500,000) ↔ 「구분 표시 없음」(5,625,000) — 토글이 칸을 바꾼다
 *  SB-5 노출 구별력: 토글 OFF · 5년 경과 · 실거래가 · 증축 · 비주택 · PHD · 소유자 분리에서는 카드가 없다
 *  SB-6 방식 전환 stale: 환산 → 실거래가 후 계산하면 body 에 키가 없고 ⑧이 요구하지 않는다
 *  SB-8 컴패니언: 함께 양도 자산 2 의 신축 → companionAssets[0].selfBuiltHousing · 자산 2 가산세
 *  SB-9 375px 가로 스크롤 없음 · 카드 안내 글자 라이트·다크 대비 4.5 이상
 *
 * 결과 화면의 건물분 산식 줄(4뷰)은 PR-3 범위다. 사람이 브라우저로 직접 한 수동 확인은 아니다(headless).
 * 실행(워크트리): E2E_PORT=3298 npx playwright test e2e/transfer-self-built-housing-base.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard } from "./_helpers/split-acq-display";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";

type Over = Record<string, unknown>;

const INPUTS = {
  standardPricePerSqmAtAcq: "1000000",
  buildingStandardPriceAtAcq: "60000000",
  standardPricePerSqmAtTransfer: "2400000",
  buildingStandardPriceAtTransfer: "160000000",
};
const BLANK_INPUTS = Object.fromEntries(Object.keys(INPUTS).map((k) => [k, ""]));

const asset = (over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  // regionCode 를 두지 않는다 — 주소 코드가 있으면 조정대상지역 여부를 주소에서 판정해 폼에 싣는데(효과 실행 시점에 따라 바뀐다),
  // 함께 양도 주택 2채는 그 값에 따라 «같은 날 양도 순서» 차단(`sameDayHousingBundleIssue`)이 걸리고 풀려 SB-8 이 간헐 실패했다.
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2022-01-10",
  actualSalePrice: "1000000000",
  useEstimatedAcquisition: true,
  standardPriceAtAcq: "200000000",
  standardPriceAtTransfer: "400000000",
  isSelfBuilt: true,
  buildingType: "new",
  constructionDate: "2022-01-10",
  acquisitionArea: "100",
  transferArea: "100",
  saleSplitMode: "apportioned",
  ...INPUTS,
  ...over,
});

const seed = (assets: Over[], formOver: Over = {}) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-03-01",
      filingDate: "2026-04-30",
      contractTotalPrice: "1000000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      ...formOver,
    },
    pendingMigration: false,
  },
  version: 0,
});

type Wire = { selfBuiltHousing?: Record<string, unknown>; companionAssets?: { selfBuiltHousing?: Record<string, unknown> }[] };

const APPRAISAL = { useEstimatedAcquisition: false, isAppraisalAcquisition: true, fixedAcquisitionPrice: "300000000" };
const card = (page: Page) => page.getByTestId("self-built-housing-share");

/** 첫 자산의 신축 토글·카드가 있는 ③ 취득 섹션을 연다 */
async function openAcq(page: Page) {
  await expandAssetSection(page, 3);
}

async function focusedField(page: Page) {
  return page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest("[data-field]")?.getAttribute("data-field") ?? null);
}

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test.describe("일체 주택 본인 신축 §114조의2 base 건물분", () => {
  test("SB-1 환산: body 의 selfBuiltHousing 5값 · 신고서 가산세액 9,375,000 (종전 25,000,000)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset()]));
    const body = (await calculate(page)) as Wire;
    expect(body.selfBuiltHousing).toEqual({
      landPricePerSqmAtAcquisition: 1_000_000,
      landArea: 100,
      buildingStdPriceAtAcquisition: 60_000_000,
      landStdPriceAtTransfer: 240_000_000,
      buildingStdPriceAtTransfer: 160_000_000,
    });
    expect(num((await formRow(page, "가산세액"))[1])).toBe(9_375_000);
  });

  test("SB-2 UI 입력 경로: 토글 ON → 카드가 빈 채로 뜬다(pageerror 0) → 칸 입력 → body·결과", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackPageErrors(page);
    // 본인 신축 토글만 OFF — 구분·완공일은 토글을 켜면서 직접 입력한다
    await seedWizard(page, seed([asset({ ...BLANK_INPUTS, isSelfBuilt: false, buildingType: "", constructionDate: "" })]));
    await openAcq(page);
    await expect(card(page)).toHaveCount(0);
    await page.locator('[data-field="isSelfBuilt"]').getByRole("switch").first().click();
    // 구분·완공일이 없으면 5년 창을 판정할 수 없어 카드는 아직 없다 — 입력 순서(위→아래)대로 진행된다
    await expect(card(page)).toHaveCount(0);
    await page.locator('[data-field="buildingType"]').getByRole("button", { name: "신축" }).click();
    const date = page.locator('[data-field="constructionDate"]');
    await date.locator('input[type="text"][aria-label="연도"]').first().fill("2022");
    await date.locator('input[type="text"][aria-label="월"]').first().fill("01");
    await date.locator('input[type="text"][aria-label="일"]').first().fill("10");
    await expect(card(page)).toBeVisible();
    // 앵커 각 1개 — ⑧ 이동 불능 0
    for (const key of ["standardPricePerSqmAtAcq", "buildingStandardPriceAtAcq", "standardPricePerSqmAtTransfer", "buildingStandardPriceAtTransfer", "acquisitionArea"]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
    await page.getByTestId("self-built-land-persqm").fill("1000000");
    await page.getByTestId("acq-building-std").fill("60000000");
    await page.getByTestId("split-land-std-transfer-persqm").fill("2400000");
    await page.getByTestId("split-building-std-transfer").fill("160000000");
    const body = (await calculate(page)) as Wire;
    expect(body.selfBuiltHousing).toMatchObject({ landPricePerSqmAtAcquisition: 1_000_000, buildingStdPriceAtAcquisition: 60_000_000, landStdPriceAtTransfer: 240_000_000, buildingStdPriceAtTransfer: 160_000_000 });
    expect(num((await formRow(page, "가산세액"))[1])).toBe(9_375_000);
    expect(errors).toEqual([]);
  });

  test("SB-3 ⑧ 차단: 칸이 비면 «다음» 이 막히고 화면에 있는 첫 칸으로 이동 → 채울 때마다 다음 칸", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackPageErrors(page);
    await seedWizard(page, seed([asset(BLANK_INPUTS)]));
    await openAcq(page);
    await expect(card(page)).toBeVisible();
    const next = page.getByRole("button", { name: "다음", exact: true });
    await next.click();
    await expect.poll(() => focusedField(page)).toBe("standardPricePerSqmAtAcq");
    await page.getByTestId("self-built-land-persqm").fill("1000000");
    await next.click();
    await expect.poll(() => focusedField(page)).toBe("buildingStandardPriceAtAcq");
    await page.getByTestId("acq-building-std").fill("60000000");
    await next.click();
    await expect.poll(() => focusedField(page)).toBe("standardPricePerSqmAtTransfer");
    await page.getByTestId("split-land-std-transfer-persqm").fill("2400000");
    await next.click();
    await expect.poll(() => focusedField(page)).toBe("buildingStandardPriceAtTransfer");
    await page.getByTestId("split-building-std-transfer").fill("160000000");
    await next.click();
    // 통과 — 다음 단계(보유 상황)로 넘어간다
    await expect(page.getByRole("button", { name: "다음", exact: true })).toBeVisible();
    await expect.poll(() => focusedField(page)).not.toBe("buildingStandardPriceAtTransfer");
    expect(errors).toEqual([]);
  });

  test("SB-4 감정: 건물 감정가액 직접 입력(5,500,000) ↔ 「구분 표시 없음」(5,625,000) — 토글이 칸을 바꾼다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset({ ...APPRAISAL, selfBuiltBuildingAppraisal: "110000000" })]));
    await openAcq(page);
    await expect(page.getByTestId("self-built-building-appraisal")).toBeVisible();
    await expect(page.getByTestId("self-built-housing-acq")).toHaveCount(0);
    const direct = (await calculate(page)) as Wire;
    expect(direct.selfBuiltHousing).toEqual({ buildingAppraisalValue: 110_000_000 });
    expect(num((await formRow(page, "가산세액"))[1])).toBe(5_500_000);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await openAcq(page);
    await page.getByTestId("self-built-appraisal-nosplit").getByRole("switch").first().click();
    await expect(page.getByTestId("self-built-building-appraisal")).toHaveCount(0);
    await expect(page.getByTestId("self-built-housing-acq")).toBeVisible();
    const ratio = (await calculate(page)) as Wire;
    expect(ratio.selfBuiltHousing).toEqual({ landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000 });
    expect(num((await formRow(page, "가산세액"))[1])).toBe(5_625_000);
  });

  test("SB-5 노출 구별력: 범위 밖에서는 카드가 없다", async ({ page }) => {
    test.setTimeout(240_000);
    const cases: [string, Over, Over?][] = [
      ["본인 신축 토글 OFF", { isSelfBuilt: false }],
      ["신축일부터 5년 경과", {}, { transferDate: "2027-01-11" }],
      ["실지거래가액", { useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000" }],
      ["증축", { buildingType: "extension", extensionFloorArea: "120", extensionStdPriceAtAcquisition: "40000000" }],
      ["비주택(건물 단독)", { assetKind: "building" }],
      ["소유자 분리(건물만 소유)", { selfOwns: "building_only" }],
    ];
    for (const [name, over, formOver] of cases) {
      await seedWizard(page, seed([asset(over)], formOver));
      await openAcq(page);
      await expect(card(page), name).toHaveCount(0);
    }
    // 대조군 — 같은 시드에 범위 안이면 뜬다
    await seedWizard(page, seed([asset()]));
    await openAcq(page);
    await expect(card(page)).toHaveCount(1);
  });

  test("SB-6 방식 전환 stale: 환산 입력을 비운 채 실지거래가액으로 바꿔도 막히지 않고 body 에 키가 없다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset({ ...BLANK_INPUTS, useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000" })]));
    const body = (await calculate(page)) as Wire;
    expect(body.selfBuiltHousing).toBeUndefined();
  });

  test("SB-8 컴패니언(함께 양도) 자산 2: companionAssets[0].selfBuiltHousing · 자산 2 가산세는 건물분(1,874,999)", async ({ page }) => {
    test.setTimeout(180_000);
    const second = asset({
      assetId: makeDefaultAsset(2).assetId,
      assetLabel: "자산 2",
      acquisitionDate: "2021-06-01",
      addressJibun: "서울 강남구 테스트동 2-2",
      standardPriceAtTransfer: "1000000001",
      constructionDate: "2021-06-01",
      standardPricePerSqmAtTransfer: "6000000",
      buildingStandardPriceAtTransfer: "400000000",
      actualSalePrice: "",
    });
    const first = asset({
      acquisitionDate: "2021-06-01",
      isSelfBuilt: false,
      buildingType: "",
      constructionDate: "",
      ...BLANK_INPUTS,
      standardPriceAtTransfer: "1000000001",
      actualSalePrice: "",
    });
    await seedWizard(page, seed([first, second], { transferDate: "2024-03-01", filingDate: "2024-05-31" }));
    // 함께 양도 카드에도 같은 카드가 뜬다
    await expandAssetSection(page, 3, 1);
    await expect(page.locator('[data-asset-card-index="1"]').getByTestId("self-built-housing-share")).toBeVisible();
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    const resp = await rp;
    expect(resp.status(), await resp.text()).toBe(200);
    const body = resp.request().postDataJSON() as Wire;
    expect(body.companionAssets?.[0].selfBuiltHousing).toEqual({
      landPricePerSqmAtAcquisition: 1_000_000,
      landArea: 100,
      buildingStdPriceAtAcquisition: 60_000_000,
      landStdPriceAtTransfer: 600_000_000,
      buildingStdPriceAtTransfer: 400_000_000,
    });
    const props = (await resp.json()).data.aggregated.properties as { penaltyTax: number; penaltyBase: number }[];
    expect(props[0].penaltyTax).toBe(0);
    expect(props[1]).toMatchObject({ penaltyBase: 37_499_999, penaltyTax: 1_874_999 });
  });

  test("SB-9 375px 가로 스크롤 없음 · 카드 안내 글자 라이트·다크 대비", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset()]));
    await openAcq(page);
    await expect(card(page)).toBeVisible();
    // 안내문(<p>)이 옅은 톤 카드 위 글자다 — 라이트·다크 모두 4.5 이상. 끝 상태를 375px 로 줄여 가로 스크롤을 잰다.
    await expectLightContrast(page, card(page).locator("p"));
    await expectDarkContrast(page, card(page).locator("p"));
    await expectNoPageHScroll(page);
  });
});
