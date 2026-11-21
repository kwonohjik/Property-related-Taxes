/**
 * 비사업용 토지 리뷰 2026-11 후속 C6·C7·C8 — **실제 브라우저 화면 경로** 검증 (마커 NBL2611-E2E-C6C8).
 *
 * 검증 대상 / 근거 PR
 *  - C7 #3521 : 주택 축 B(같은 물건 지분) 둘째 이후 지분의 «부수토지 소재지 구분» 막다른 길 해소 — 첫 카드에서만 선택해도 ⑧ 통과 · ⑫ `companionHousingLand.zone` 전달
 *  - C6 #3518 : 축 B 둘째 이후 지분에 배율 초과분 수용 의제(사업인정 고시일)·유예 행 도달 — ④ `companionAssets[].appurtenantExcessFacts`
 *  - C8 #3524 : 신축 취득 주택의 «초과분 미분리» 고지가 신축임을 밝히고 매매 + 「토지·건물 취득일 다름」 분리 경로를 안내
 *
 * anchor(vitest)가 고정한 세액은 mock 세율표 기준이다 — 여기서는 키(body)·세율군·고지·«같은 주택을 100% 단건으로 넣은 폼과 총세액이 같다»(정답 기준 ②)를 단언한다.
 * 시료: 주택 · 1세대1주택 · 양도 2024-09-01 · 양도가액 10억 · 토지 3,000㎡ / 정착 100㎡ / 수도권 주거 3배 → 초과 2,700㎡ · 지분 10% / 90%.
 * 폼은 sessionStorage로 시드하고(기존 축 B spec 방식), 검증 대상 입력(소재지 구분·양도원인·고시일·유예 행·취득원인 전환)은 화면에서 조작한다.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const hShare = (n: number, o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(n), assetId: `s${n}`, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
  landAcquisitionDate: "2014-01-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "450000000", buildingAcquisitionPrice: "50000000", actualSalePrice: "1000000000", saleSplitMode: "actual",
  landTransferPrice: "700000000", buildingTransferPrice: "300000000", landStandardPriceAtTransfer: "700000000",
  buildingStandardPriceAtTransfer: "300000000", ownershipNumerator: n === 1 ? "10" : "90", ownershipDenominator: "100",
  residenceInputMode: "direct", residencePeriodMonthsAsset: "0", ...o,
});
const OBJ = { acquisitionArea: "3000", buildingFootprintArea: "100" };
const BASE = {
  transferDate: "2024-09-01", filingDate: "2024-11-30", contractTotalPrice: "1000000000", isOneHousehold: true, householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0",
};

async function seed(page: Page, assets: unknown[], mode: "fractional" | "single") {
  const formData = { ...createDefaultTransferFormData(), ...BASE, assetSplitMode: mode, bundledSaleMode: "actual", assets };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}
async function gotoLastStep(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
}


/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };
async function calc(page: Page): Promise<Resp> {
  await gotoLastStep(page);
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const r = await resp;
  return { status: r.status(), req: r.request().postDataJSON(), json: await r.json() };
}
const totalOf = (r: Resp): number => (r.json.data?.aggregated?.totalTax ?? r.json.data?.result?.totalTax) as number;
const propsOf = (r: Resp): any[] => r.json.data?.aggregated?.properties ?? [];
const warningsOf = (r: Resp): string[] => r.json.data?.aggregated?.warnings ?? r.json.data?.result?.warnings ?? [];
const card = (page: Page, i = 0) => page.locator(`[data-asset-card-index="${i}"]`);
const money = (scope: Locator, id: string) => scope.locator(`input[data-testid="${id}"], [data-testid="${id}"] input`).first();
const fill3 = async (scope: Locator, y: string, m: string, d: string) => {
  await scope.getByLabel("연도", { exact: true }).fill(y);
  await scope.getByLabel("월", { exact: true }).fill(m);
  await scope.getByLabel("일", { exact: true }).fill(d);
};
const ZONE_RADIO = /수도권 도시지역/;
const ZONED = { ...OBJ, appurtenantLandZone: "metropolitan_residential" };
const DEEMED = /비사업용 토지로 보지 않아 \+10%p 가산·장기보유특별공제 배제를 적용하지 않았습니다/;
const SINGLE_100 = { ownershipNumerator: "100", ownershipDenominator: "100" };

/** 같은 주택을 지분 분할 없이 100% 한 장으로 — 정답 기준(지분 분할이 땅의 성질을 바꾸지 않는다). */
async function singleTotal(page: Page, over: Record<string, unknown>, drive?: (page: Page) => Promise<void>): Promise<Resp> {
  await seed(page, [hShare(1, { ...ZONED, ...SINGLE_100, ...over })], "single");
  if (drive) await drive(page);
  return calc(page);
}

test.describe("NBL2611-E2E-C6C8 · 축 B 지분 × 배율 초과분", () => {
  test("[C7] 첫 카드에서만 소재지 구분 선택 → 둘째 지분 오류 없이 계산 · body zone · 두 지분 비사업용 · 단건 100%와 총세액 동일", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, [hShare(1, OBJ), hShare(2)], "fractional"); // 소재지 구분 미선택 — 첫 카드만 칸이 있다
    // 둘째 지분 카드에는 소재지 구분 칸이 없다(① 기본정보 숨김)
    await expect(card(page, 1).locator('[data-field="appurtenantLandZone"]')).toHaveCount(0);
    await expect(card(page, 0).locator('[data-field="appurtenantLandZone"]')).toHaveCount(1);
    // 미선택이면 계산이 막힌다(⑧) — 고칠 칸은 첫 카드에 있다
    await gotoLastStep(page);
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/입력 확인이 필요합니다/).first()).toBeVisible();
    await expect(page.getByText(/「부수토지 소재지 구분」을 선택하세요/).first()).toBeVisible();
    // 첫 카드에서 선택 → 둘째 지분 오류까지 함께 사라지고 계산이 진행된다
    await card(page, 0).getByRole("radio", { name: ZONE_RADIO }).click();
    await expect(card(page, 0).getByRole("radio", { name: ZONE_RADIO })).toBeChecked();
    const share = await calc(page);
    expect(share.status, JSON.stringify(share.json).slice(0, 300)).toBe(200);
    expect(share.req.companionAssets[0].companionHousingLand.zone).toBe("metropolitan_residential");
    expect(share.req.companionAssets[0].companionHousingLand).toEqual({ landAreaM2: 3000, footprintM2: 100, zone: "metropolitan_residential" });
    await expect(page.getByText(/「부수토지 소재지 구분」을 선택하세요/)).toHaveCount(0);
    const props = propsOf(share);
    expect(props.map((p) => p.rateGroup)).toEqual(["non_business_land", "non_business_land"]);
    expect(props[0].income * 9).toBe(props[1].income); // 초과 비율이 같아 소득금액이 지분율(10 : 90)대로 나뉜다
    expect(warningsOf(share).some((w) => /소재지 구분이 없어 배율 한도/.test(w))).toBe(false);
    // 결과 화면 — 두 지분 모두 «배율 초과 부수토지 — 비사업용 토지로 분리해 전액 과세»
    await expect(page.getByText("배율 초과 부수토지 — 비사업용 토지로 분리해 전액 과세").first()).toBeVisible();
    expect((await page.locator("body").innerText()).match(/배율 초과 부수토지 — 비사업용 토지로 분리해 전액 과세/g)?.length).toBeGreaterThanOrEqual(2);
    console.log("[C7] 지분 총세액", totalOf(share), "소득", props.map((p) => p.income));
    // 정답 기준 ② — 같은 주택 100% 단건
    const single = await singleTotal(page, {});
    expect(single.status).toBe(200);
    console.log("[C7] 단건 100% 총세액", totalOf(single));
    expect(totalOf(share)).toBe(totalOf(single));
  });

  test("[C6-1] 첫 카드 공익수용 + 사업인정 고시일 → body 고시일 · 두 지분 모두 의제 적용(초과분 가산 없음)", async ({ page }) => {
    test.setTimeout(120_000);
    const drive = async (pg: Page) => {
      await expandAssetSection(pg, 2);
      await card(pg, 0).getByTestId("expr-cause-radio").click();
      await expect(card(pg, 0).getByTestId("expr-notice-date")).toBeVisible();
      await money(card(pg, 0), "expr-cash").fill("1000000000"); // 화면이 요구하는 보상액(양도가액과 같게)
      await fill3(card(pg, 0).getByTestId("expr-notice-date"), "2021", "03", "01");
      // 수용 선택 시 자동 활성되는 §77 감면을 끈다 — 이 시나리오는 사업용 의제(영 §168의14③3호)만 본다(anchor도 감면 없음)
      await pg.getByRole("button", { name: "감면·공제" }).first().click();
      // 지분 카드마다 스위치가 있다(켜진 것은 수용을 고른 첫 카드뿐) — 켜진 것만 끈다
      const on77 = pg.locator('[role="switch"][aria-label*="공익사업 수용 감면"][aria-checked="true"]');
      await expect(on77).toHaveCount(1);
      await on77.click();
      await expect(on77).toHaveCount(0);
    };
    await seed(page, [hShare(1, ZONED), hShare(2)], "fractional");
    await drive(page);
    const share = await calc(page);
    expect(share.status, JSON.stringify(share.json).slice(0, 300)).toBe(200);
    expect(share.req.companionAssets[0].appurtenantExcessFacts.expropriationNoticeDate).toBe("2021-03-01");
    expect(share.req.appurtenantExcessFacts?.expropriationNoticeDate ?? share.req.expropriationNoticeDate).toBe("2021-03-01");
    // 의제 적용 — 두 지분 다 비사업용 세율군이 아니다(수정 전 둘째 지분만 미적용 → non_business_land)
    expect(propsOf(share).map((p) => p.rateGroup)).toEqual(["progressive", "progressive"]);
    expect(warningsOf(share).filter((w) => DEEMED.test(w)).length).toBe(2);
    expect(warningsOf(share).some((w) => /사업인정 고시일이 입력되지 않아/.test(w))).toBe(false);
    await expect(page.getByText(/비사업용 토지로 보지 않아 \+10%p 가산/).first()).toBeVisible();
    console.log("[C6-1] 지분 총세액", totalOf(share), propsOf(share).map((p) => [p.rateGroup, p.income]));
    const single = await singleTotal(page, {}, drive);
    expect(single.status).toBe(200);
    expect(warningsOf(single).filter((w) => DEEMED.test(w)).length).toBe(1);
    console.log("[C6-1] 단건 100% 총세액", totalOf(single));
    expect(totalOf(share)).toBe(totalOf(single));
  });

  test("[C6-2] 첫 카드 유예 행(6호 저당권 실행·청산) → 둘째 지분 body graceIntervals 기산 = 그 지분 토지 취득일", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, [hShare(1, ZONED), hShare(2, { landAcquisitionDate: "2018-01-01" })], "fractional");
    const grace = card(page, 0).getByTestId("housing-excess-grace");
    await expect(grace).toBeVisible();
    await grace.getByRole("button", { name: /유예기간 추가/ }).click();
    await grace.getByRole("combobox").first().click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("listbox").getByRole("option", { name: /저당권 실행·청산 분배/ }).click();
    await expect(grace.getByTestId("nbl-grace-auto-end-0")).toBeVisible();
    const share = await calc(page);
    expect(share.status, JSON.stringify(share.json).slice(0, 300)).toBe(200);
    expect(share.req.appurtenantExcessFacts.graceIntervals).toEqual([{ startDate: "2014-01-01", endDate: "2016-01-01" }]); // 첫 지분: 토지 2014-01-01 + 2년
    expect(share.req.companionAssets[0].appurtenantExcessFacts.graceIntervals).toEqual([{ startDate: "2018-01-01", endDate: "2020-01-01" }]); // 둘째 지분: 자기 토지 취득일 + 2년
    console.log("[C6-2] 지분 총세액", totalOf(share), propsOf(share).map((p) => [p.rateGroup, p.income]));
  });
});

test.describe("NBL2611-E2E-C6C8 · 신축 주택 초과분 미분리 고지", () => {
  const NEW_CONS = { acquisitionCause: "newConstruction", acquisitionDate: "2010-03-01", occupancyApprovalDate: "2010-03-01", fixedAcquisitionPrice: "500000000" };
  const NOTICE = /신축 취득은 건물 신축비용만 입력받아 토지 취득가액·취득일이 없으므로/;
  const GUIDE = /취득원인 「매매」에서 「토지·건물 취득일 다름」을 켜고/;

  test("[C8] 신축 → 고지 + 안내 · 안내대로(매매 + 토지·건물 취득일 다름) 입력하면 고지가 사라지고 초과분이 분리된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, [hShare(1, {
      ...ZONED, ...SINGLE_100, ...NEW_CONS, hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "", landAcquisitionPrice: "", buildingAcquisitionPrice: "",
      landTransferPrice: "", buildingTransferPrice: "", landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "",
    })], "single");
    const before = await calc(page);
    expect(before.status, JSON.stringify(before.json).slice(0, 300)).toBe(200);
    expect(totalOf(before)).toBe(0);
    const notice = warningsOf(before).filter((w) => /초과분 미분리/.test(w));
    expect(notice).toHaveLength(1);
    expect(notice[0]).toMatch(NOTICE);
    expect(notice[0]).toMatch(GUIDE);
    expect(notice[0]).not.toMatch(/이 입력 조합/);
    await expect(page.getByText(NOTICE).first()).toBeVisible();
    await expect(page.getByText(GUIDE).first()).toBeVisible();

    // 안내대로 — 취득원인 「매매」 + 「토지·건물 취득일 다름」, 토지 2008-05-01 4.5억 / 건물 2010-03-01 0.5억
    await page.getByRole("button", { name: "자산 목록" }).first().click();
    const c = card(page, 0);
    await expandAssetSection(page, 3);
    await c.getByRole("radio", { name: "매매", exact: true }).click();
    const sw = c.getByRole("switch", { name: /토지·건물 취득일 다름/ });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await fill3(c.getByTestId("acq-date-land"), "2008", "05", "01");
    await fill3(c.getByTestId("acq-date-building"), "2010", "03", "01");
    await money(c, "split-land-acq-price").fill("450000000");
    await money(c, "split-building-acq-price").fill("50000000");
    await money(c, "split-land-transfer-price").fill("700000000");
    await money(c, "split-building-transfer-price").fill("300000000");
    await money(c, "split-land-std-transfer-persqm").fill("250000"); // 화면 요구 칸(양도시 기준시가 토지분 = ㎡당 × 면적) — anchor 7억과 값이 다르다(실가 안분이라 세액 무관)
    await money(c, "split-land-std-transfer-area").fill("3000");
    await money(c, "split-building-std-transfer").fill("300000000");
    const after = await calc(page);
    expect(after.status, JSON.stringify(after.json).slice(0, 300)).toBe(200);
    console.log("[C8] 신축 총세액", totalOf(before), "→ 안내대로 총세액", totalOf(after));
    expect(warningsOf(after).some((w) => /초과분 미분리/.test(w))).toBe(false);
    expect(after.json.data?.result?.splitDetail?.nonBusinessLandPart ?? after.json.data?.aggregated?.properties?.[0]?.splitDetail?.nonBusinessLandPart).toBeTruthy();
    expect(totalOf(after)).toBeGreaterThan(0);
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expect(page.getByText("배율 초과 부수토지 — 비사업용 토지로 분리해 전액 과세").first()).toBeVisible();
  });
});
