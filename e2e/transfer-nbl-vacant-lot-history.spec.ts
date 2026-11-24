/**
 * transfer-nbl-vacant-lot-history.spec.ts
 *
 * NBL-STATE-HISTORY-E3-④ — 13호(무주택 1세대 1필지 나지) × 소유기간 중 이력 · 「세대 주택 소유 기간」 질문·행 — 입력 → 계산 → 결과
 * (UI 계획서 `nbl-state-history-e3-4-ho13-bare-land.ui.plan.md` §11.2 E1~E7 · 엔진 케이스 표 `__tests__/tax-engine/_helpers/nbl-state-history-e3-4-table.ts` H·W·X·UI 시료).
 * 선례: `transfer-nbl-house-prior-demolished.spec.ts`(sessionStorage 시드 + 화면에서 입력) · `transfer-nbl-other-state-history-u3.spec.ts`(인쇄).
 *
 * 공통 시료(엔진 표): 기타토지(잡종지) 600㎡ · 일반주거 · 13호 · 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일) · 취득가 3억 · 양도가 10억. 전량 사업용 B = 198,210,000 · 전량 비사업용 N = 253,960,000.
 *  E1  S2 철거 후 나지(H1): 13호 입력 안내 C-1 · 위젯 노출 · 결과 꼬리 행 접미 «13호 인정 214일» · 13호 변형 고지
 *  E2  S3 신축으로 끝(H2): 꼬리 건물이라 hoFail + 위젯·C-1(과거 나지 구간을 읽는다) · 13호는 N → B(차액 −55,750,000) · 같은 입력의 호 «해당 없음» 대조 = N
 *  E3  S5 660㎡ 초과(H5): C-4 부분 면적 안내 · 위젯 노출 · 결과 고지 PARTIAL · 엔진은 이력 미적용
 *  E4  호 전환: 13호 ↔ 해당 없음 — 위젯·안내 on/off · 저장 행은 되돌리면 복원
 *  E5  S4 행 입력(W2): ⑧ 차단 3종(HH-1 질문 · HH-2 0행 · HH-3 시작일 빈칸) → 입력 → 미리보기 → body에 행 도달(종료일 비움 = 키 생략) → B → N
 *  E6  인쇄: «전체 선택» → print 미디어에서 13호 적용 기간 블록이 보이고 잘리지 않는다
 *  E7  이력 OFF + 행(W2): «양도일 현재 상태를 소유기간 전체에 적용» 거짓 안내가 없고 13호 적용 기간 블록 + 이력 OFF 변형 고지가 보인다
 *  E8  시각: 라이트/다크 글자 대비 4.5 · 375px 입력 영역·결과 블록 가로 스크롤 없음
 *
 * 폼은 sessionStorage로 시드한다. 외부 API 의존 없음 — mock 불필요.
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-vacant-lot-history.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import {
  NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE,
  NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE,
  NBL_VACANT_LOT_BARE_ONLY_INPUT_NOTICE,
  NBL_VACANT_LOT_HOUSE_PERIODS_INPUT_NOTICE,
  NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE,
} from "../lib/tax-engine/nbl-confirm-notices";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };

const BASE_FORM = { transferDate: "2024-01-01", filingDate: "2025-12-31", contractTotalPrice: "1000000000" };
const B = 198_210_000;
const N = 253_960_000;
const HO13 = "vacant_lot_1household";

/** 기타토지(잡종지) 정밀판정 ON · 13호 · 꼬리 나지(종합합산) — 엔진 표 공통 시료. 이력·질문은 케이스에서 정한다. */
const LAND = {
  assetKind: "land", acquisitionArea: "600", transferArea: "600", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
  nblOtherHasBuilding: false, nblOtherPropertyTaxType: "comprehensive", nblOtherRelatedBusinessType: HO13,
  nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [],
};
const REMOVED = (date: string) => ({ kind: "building_removed", date, propertyTaxTypeBefore: "comprehensive" });
const BUILT = (date: string) => ({ kind: "building_built", date, propertyTaxTypeBefore: "" });
/** 마지막 사건 = 신축 → 꼬리 건물(별도합산 · 바닥면적 250㎡) — 엔진 표 H2 */
const TAIL_BUILDING = { nblOtherHasBuilding: true, nblOtherPropertyTaxType: "separate", nblOtherBuildingFloorArea: "250" };

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

async function seed(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...BASE_FORM, assetSplitMode: "single", bundledSaleMode: "actual", assets };
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await waitHydrated(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

const landAsset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "100", ownershipDenominator: "100", ...over });

async function gotoHolding(page: Page) {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await expect(page.getByTestId("nbl-other-state-history").first(), "건축물 이력 질문이 보여야 함").toBeVisible({ timeout: 20_000 });
}

/** 라디오를 누르고 React가 렌더한 결과(체크)를 확인한다(e2e/CLAUDE.md §6). */
async function pick(radio: Locator) {
  await radio.click();
  await expect(radio).toBeChecked();
}

async function toLastStep(page: Page) {
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
}

async function calc(page: Page): Promise<Resp> {
  await toLastStep(page);
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const r = await resp;
  return { status: r.status(), req: r.request().postDataJSON(), json: await r.json() };
}

/** 계산 요청이 **나가지 않는지** — ⑧ 차단 확인용. */
async function calcBlocked(page: Page): Promise<boolean> {
  let posted = false;
  const onReq = (r: { url(): string; method(): string }) => {
    if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true;
  };
  page.on("request", onReq);
  await toLastStep(page);
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.waitForTimeout(1500);
  page.off("request", onReq);
  return !posted;
}

const taxOf = (r: Resp): number => Number(r.json.data?.result?.calculatedTax ?? r.json.data?.aggregated?.totalTax);
const nblOf = (r: Resp) => (r.json.data?.result?.nonBusinessLandJudgmentDetail ?? r.json.data?.aggregated?.properties?.[0]?.nonBusinessLandJudgmentDetail) as Record<string, any> | undefined;
const warnings = (r: Resp) => ((nblOf(r)?.warnings as string[] | undefined) ?? []);
const widget = (page: Page) => page.getByTestId("nbl-other-household-house");
const c1 = (page: Page) => page.getByTestId("nbl-other-ho13-scope-notice");

async function setRowDate(page: Page, i: number, which: "start" | "end", iso: string) {
  const [y, m, d] = iso.split("-");
  const date = page.getByTestId(`nbl-other-household-house-${i}-${which}`);
  await date.getByLabel("연도").fill(y);
  await date.getByLabel("월").fill(m);
  await date.getByLabel("일").fill(d);
  await expect(date.getByLabel("연도")).toHaveValue(y);
  await expect(date.getByLabel("일")).toHaveValue(d);
}

test.describe("13호(무주택 1세대 1필지 나지) × 소유기간 중 이력 — 입력 → 계산 → 결과", () => {
  test("E1 S2 철거 후 나지(H1): C-1 안내 · 위젯 노출 · 결과 꼬리 행 접미 «13호 인정 214일» · 13호 변형 고지", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, [landAsset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [REMOVED("2023-06-01")], nblOtherHouseholdHouseStatus: "none" })]);
    await gotoHolding(page);
    await expect(c1(page)).toHaveText(NBL_VACANT_LOT_BARE_ONLY_INPUT_NOTICE);
    await expect(widget(page), "꼬리 나지 → 엔진이 행을 읽는다").toBeVisible();
    await expect(page.getByTestId("nbl-other-ho-fail-notice")).toHaveCount(0);
    await expect(page.getByTestId("nbl-state-history-applied-notice"), "입력 화면의 적용 고지도 13호 변형(결과 고지와 같다)").toHaveText(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherHouseholdHousePeriods, "질문 «없습니다» → 행 [] (질문 상태는 body에 없다)").toEqual([]);
    expect(r.req.nonBusinessLandRaw).not.toHaveProperty("nblOtherHouseholdHouseStatus");
    expect(nblOf(r)?.isNonBusinessLand).toBe(true);
    expect(nblOf(r)?.effectiveBusinessDays).toBe(214);
    expect(taxOf(r)).toBe(N);
    const rows = page.getByTestId(/^nbl-state-history-interval-\d+$/);
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("nbl-state-history-interval-0-vacant-lot")).toHaveCount(0);
    await expect(page.getByTestId("nbl-state-history-interval-1-vacant-lot")).toContainText("무주택1세대 1필지 나지 (13호) 인정 214일");
    await expect(page.getByTestId("nbl-vacant-lot-period-summary")).toContainText("214일 · 세대 주택 소유로 제외한 기간 0일");
    expect(warnings(r)).toContain(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
  });

  test("E2 S3 신축으로 끝(H2): 꼬리 건물 — hoFail + 위젯·C-1(과거 나지 3,437일 13호 인정) · 세액 N → B(차액 55,750,000) · 같은 입력 호 «해당 없음» = N", async ({ page }) => {
    test.setTimeout(240_000);
    const over = { nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [BUILT("2023-06-01")], ...TAIL_BUILDING, nblOtherHouseholdHouseStatus: "none" };
    // 대조 — 호 «해당 없음»(13호 무효와 같은 현행 값)
    await seed(page, [landAsset({ ...over, nblOtherRelatedBusinessType: "none" })]);
    await gotoHolding(page);
    await expect(widget(page)).toHaveCount(0);
    const control = await calc(page);
    expect(control.status, JSON.stringify(control.json).slice(0, 300)).toBe(200);
    expect(taxOf(control)).toBe(N);

    await seed(page, [landAsset(over)]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-ho-fail-notice"), "양도일 현재 건축물 → 13호 불인정 안내(바이트 유지)").toContainText("나지");
    await expect(c1(page)).toHaveText(NBL_VACANT_LOT_BARE_ONLY_INPUT_NOTICE);
    await expect(widget(page), "과거 나지 구간은 leaf가 읽는다").toBeVisible();
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(nblOf(r)?.isNonBusinessLand).toBe(false);
    expect(nblOf(r)?.effectiveBusinessDays).toBe(3651);
    expect(taxOf(r)).toBe(B);
    expect(taxOf(control) - taxOf(r), "과거 나지 구간 13호 인정 — 현행 N에서 B로").toBe(N - B);
    await expect(page.getByTestId("nbl-state-history-interval-0-vacant-lot")).toContainText("인정 3,437일");
    await expect(page.getByTestId("nbl-state-history-interval-1-vacant-lot")).toHaveCount(0);
    expect(warnings(r)).toContain(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
  });

  test("E3 S5 660㎡ 초과(H5): C-4 부분 면적 안내 · 위젯 노출(core가 행을 읽는다) · 결과 PARTIAL 고지 · 엔진은 이력 미적용", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, [landAsset({ acquisitionArea: "900", transferArea: "900", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [REMOVED("2023-06-01")], nblOtherHouseholdHouseStatus: "none" })]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-partial-area-notice")).toHaveText(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    await expect(widget(page)).toBeVisible();
    await expect(c1(page), "이력을 읽지 않으므로 C-1 없음").toHaveCount(0);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(nblOf(r)?.periodEvaluation?.basis, "엔진은 이력을 읽지 않는다").not.toBe("state_history");
    expect(warnings(r)).toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
  });

  test("E4 호 전환: 13호 → 해당 없음 → 13호 — 위젯·안내 on/off · 입력한 행은 되돌리면 복원", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, [landAsset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [REMOVED("2023-06-01")], nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [{ startDate: "2020-01-01", endDate: "" }] })]);
    await gotoHolding(page);
    await expect(widget(page)).toBeVisible();
    await expect(c1(page)).toBeVisible();
    await expect(page.getByTestId("nbl-other-household-house-0-summary")).toHaveText("계산에 쓰는 소유 기간: 2020-01-01 ~ 양도일까지 계속 소유");
    await pick(page.getByTestId("nbl-other-related-none"));
    await expect(widget(page)).toHaveCount(0);
    await expect(c1(page)).toHaveCount(0);
    await pick(page.getByTestId("nbl-other-related-vacant_lot"));
    await expect(widget(page)).toBeVisible();
    await expect(page.getByTestId("nbl-other-household-house-owned")).toBeChecked();
    await expect(page.getByTestId("nbl-other-household-house-0-summary")).toBeVisible();
    // 호 «해당 없음»이면 저장 행이 있어도 ④가 []를 보낸다(숨은 stale 행이 400을 만들지 않는다)
    await pick(page.getByTestId("nbl-other-related-none"));
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherHouseholdHousePeriods).toEqual([]);
  });

  test("E5 S4 행 입력(W2): ⑧ 차단 3종(질문 · 0행 · 시작일 빈칸) → 입력 → 미리보기 → body에 행 도달(종료일 비움 = 키 생략) → B → N", async ({ page }) => {
    test.setTimeout(300_000);
    await seed(page, [landAsset()]);
    await gotoHolding(page);
    await expect(widget(page)).toBeVisible();
    await expect(page.getByTestId("nbl-other-household-house-none")).not.toBeChecked();
    await expect(page.getByTestId("nbl-other-household-house-owned")).not.toBeChecked();
    expect(await calcBlocked(page), "HH-1 질문 미선택: 계산 요청이 나가지 않는다").toBe(true);

    await gotoHolding(page);
    await pick(page.getByTestId("nbl-other-household-house-owned"));
    await expect(page.getByTestId("nbl-other-household-house-input-notice")).toHaveText(NBL_VACANT_LOT_HOUSE_PERIODS_INPUT_NOTICE);
    expect(await calcBlocked(page), "HH-2 «있습니다» + 0행: 계산 요청이 나가지 않는다").toBe(true);

    await gotoHolding(page);
    await page.getByTestId("nbl-other-household-house-add").click();
    await expect(page.getByTestId("nbl-other-household-house-0-start")).toBeVisible();
    expect(await calcBlocked(page), "HH-3 시작일 빈칸: 계산 요청이 나가지 않는다").toBe(true);

    await gotoHolding(page);
    await setRowDate(page, 0, "start", "2020-01-01");
    await expect(page.getByTestId("nbl-other-household-house-0-summary")).toHaveText("계산에 쓰는 소유 기간: 2020-01-01 ~ 양도일까지 계속 소유");
    await expect(page.getByTestId("nbl-other-household-house-preview")).toContainText("13호로 인정되는 기간(예상): 2,190일 / 소유기간 3,651일 · 세대 주택 소유로 제외한 기간 1,461일");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherHouseholdHousePeriods, "Network body — 행 도달 · 종료일 비움은 키 생략").toEqual([{ startDate: "2020-01-01" }]);
    expect(r.req.nonBusinessLandRaw).not.toHaveProperty("nblOtherHouseholdHouseStatus");
    expect(nblOf(r)?.isNonBusinessLand).toBe(true);
    expect(nblOf(r)?.effectiveBusinessDays).toBe(2190);
    expect(taxOf(r), "W2: 행 입력으로 B → N").toBe(N);
    expect(taxOf(r) - B).toBe(N - B);
    expect(nblOf(r)?.periodEvaluation?.vacantLot).toMatchObject({ scope: "whole_period", houseOwnedDays: 1461 });
  });

  test("E7 이력 OFF + 행(W2): «양도일 현재 상태를 소유기간 전체에 적용» 거짓 안내 없음 · 13호 적용 기간 블록 · 이력 OFF 변형 고지(V-10)", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, [landAsset({ nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [{ startDate: "2020-01-01", endDate: "" }] })]);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(nblOf(r)?.periodEvaluation?.basis).toBe("usage_periods");
    await expect(page.getByTestId("nbl-period-state-at-transfer-notice")).toHaveCount(0);
    await expect(page.getByText("양도일 현재의 이용 상태를 소유기간 전체에 적용해 판정했습니다")).toHaveCount(0);
    await expect(page.getByTestId("nbl-vacant-lot-period-summary")).toContainText("무주택1세대 1필지 나지 (13호)로 사업용에 센 기간 2,190일 · 세대 주택 소유로 제외한 기간 1,461일");
    await expect(page.getByTestId("nbl-vacant-lot-period-scope")).toHaveText("소유기간 가운데 세대가 주택을 소유하지 않은 기간입니다.");
    expect(warnings(r)).toContain(NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE);
    expect(warnings(r)).toContain(NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE);
    await expect(page.getByText(NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE).first()).toBeVisible();
  });
});

test.describe("13호 × 이력 — 인쇄(E6)", () => {
  test("«계산 결과 선택 출력» 전체 선택 → print 미디어(A4 내용폭): 13호 적용 기간 블록·구간표 접미가 보이고 잘리지 않는다", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, [landAsset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [BUILT("2023-06-01")], ...TAIL_BUILDING, nblOtherHouseholdHouseStatus: "none" })]);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    await expect(page.getByTestId("nbl-vacant-lot-period")).toBeVisible({ timeout: 20_000 });
    // 선택 없이 print만 켜면 섹션이 print:hidden이라 폭이 0이다(e2e/CLAUDE.md · 결함 오판 방지) — 「전체 선택」을 먼저 누른다.
    await page.getByRole("button", { name: "전체 선택" }).first().click();
    await page.setViewportSize({ width: 718, height: 1100 });
    await page.emulateMedia({ media: "print" });
    try {
      const block = page.getByTestId("nbl-vacant-lot-period");
      await expect(block).toBeVisible();
      const box = await block.boundingBox();
      expect(box?.width ?? 0, "0 가드 — 선택 단계가 빠지면 폭 0으로 통과하는 침묵 실패 방지").toBeGreaterThan(0);
      expect(box!.x + box!.width, "블록이 용지 내용폭을 넘지 않는다").toBeLessThanOrEqual(718 + 0.5);
      await expect(page.getByTestId("nbl-vacant-lot-period-summary")).toBeVisible();
      await expect(page.getByTestId("nbl-state-history-interval-0-vacant-lot"), "접미가 인쇄에도 남는다").toBeVisible();
      const suffix = await page.getByTestId("nbl-state-history-interval-0-vacant-lot").boundingBox();
      expect(suffix && suffix.x >= 0 && suffix.x + suffix.width <= 718 + 0.5, "접미가 내용폭 안").toBe(true);
    } finally {
      await page.emulateMedia({ media: "screen" });
    }
  });
});

test.describe("13호 × 이력 — 시각(라이트·다크·375px)", () => {
  test("E8 입력 영역·결과 블록: 라이트/다크 글자 대비 4.5 이상 · 375px 질문·행·미리보기가 화면 안 · 페이지 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 375, height: 900 });
    await seed(page, [landAsset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [REMOVED("2023-06-01")], nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [{ startDate: "2016-01-01", endDate: "2017-06-01" }, { startDate: "2020-01-01", endDate: "" }] })]);
    await gotoHolding(page);
    const w = widget(page);
    await w.scrollIntoViewIfNeeded();
    for (const t of ["nbl-other-household-house-status", "nbl-other-household-house-periods", "nbl-other-household-house-0-start", "nbl-other-household-house-1-end", "nbl-other-household-house-preview"]) {
      const b = await page.getByTestId(t).boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 375 + 0.5, `${t} 칸이 화면 폭 안`).toBe(true);
    }
    await w.screenshot({ path: "e2e/_artifacts/e3-4-input-375.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await w.scrollIntoViewIfNeeded();
    await w.screenshot({ path: "e2e/_artifacts/e3-4-input-light.png" });
    await expectLightContrast(page, w);
    await expectDarkContrast(page, w);
    await w.screenshot({ path: "e2e/_artifacts/e3-4-input-dark.png" });
    await page.emulateMedia({ media: "screen", colorScheme: "light" });

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const block = page.getByTestId("nbl-vacant-lot-period");
    await block.scrollIntoViewIfNeeded();
    await block.screenshot({ path: "e2e/_artifacts/e3-4-card-light.png" });
    await expectLightContrast(page, block);
    await expectDarkContrast(page, block);
    await block.screenshot({ path: "e2e/_artifacts/e3-4-card-dark.png" });
    await expectNoPageHScroll(page, 375);
    await block.scrollIntoViewIfNeeded();
    await block.screenshot({ path: "e2e/_artifacts/e3-4-card-375.png" });
  });
});
