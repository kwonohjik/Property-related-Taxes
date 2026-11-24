/**
 * transfer-nbl-other-state-history-e3-5.spec.ts
 *
 * NBL-STATE-HISTORY-E3-⑤ 「철거 후 재산세 한시 지위(영 §103의2)」 — 화면 E2E. 이 파일은 E3f-1a(U-1)가 만들고 E3f-1b·E3f-2 PR이 E5-3~E5-8을 이어 붙인다.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.ui.plan.md §4.1 · §11.2
 *
 * 검증(E3f-1a — 새 입력 0 · 판정·세액 불변, 안내만):
 *  E5-1  철거 행 입력 → `…-grace-nudge` 보임 → 「유예기간 추가」 9호 + 기산일 → 안내 숨음 → 계산 · 결과 비사업용(9호 없음) → 사업용(9호 있음) — 계획서 S23 → S22 시료(양도 2025-06-01 · 철거 2018-01-01).
 *  E5-2  꼬리 근거 «철거ㆍ멸실» 안내가 양도일 시행본으로 갈린다 — 양도일 2026-05-31(빈집 3년 시행본 · 6개월) ↔ 2026-06-01(1년), 양도일을 화면에서 바꾸면 안내도 따라 바뀐다.
 *  E5-V  시각: 라이트/다크 글자 대비 4.5 · 375px 새 영역 안쪽 가로 넘침 없음(스크린샷 `e2e/_artifacts/e3-5a-*.png`).
 *
 * 폼은 sessionStorage로 시드한다. 외부 API 의존 없음 — mock 불필요.
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-other-state-history-e3-5.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };

const BASE_FORM = { transferDate: "2025-06-01", filingDate: "2025-08-31", contractTotalPrice: "1000000000" };
/** 기타토지 정밀 판정 ON · 취득 2014-01-01 · 일반주거 1,000㎡ — 질문(모드)은 비워 둔다(화면에서 답한다). */
const LAND = {
  assetKind: "land", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
  nblOtherStateHistoryMode: "", nblOtherStateEvents: [],
};
/** 양도일 현재 «나대지 + 종합합산» — S23/S22 시료의 꼬리. */
const BARE_COMPREHENSIVE = { nblOtherHasBuilding: false, nblOtherPropertyTaxType: "comprehensive" };
/** 양도일 현재 «나대지 + 별도합산 + 근거 철거ㆍ멸실(종전 바닥면적 400㎡)» — E5-2의 꼬리. */
const TAIL_DEMOLISHED = { nblOtherHasBuilding: false, nblOtherPropertyTaxType: "separate", nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedFloorArea: "400" };

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

async function seed(page: Page, assets: unknown[], form: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...BASE_FORM, ...form, assetSplitMode: "single", bundledSaleMode: "actual", assets };
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

async function setDate(scope: Locator, iso: string) {
  const [y, m, d] = iso.split("-");
  await scope.getByLabel("연도").fill(y);
  await scope.getByLabel("월").fill(m);
  await scope.getByLabel("일").fill(d);
  await expect(scope.getByLabel("연도")).toHaveValue(y);
  await expect(scope.getByLabel("일")).toHaveValue(d);
}

/** 사건 «건축물 멸실·철거·붕괴» 행 1건(철거 직전 구분 = 별도합산)을 화면에서 입력한다. */
async function addRemovedRow(page: Page, date: string) {
  await pick(page.getByTestId("nbl-other-state-mode-changed"));
  await page.getByTestId("nbl-other-state-event-add").click();
  await pick(page.getByTestId("nbl-other-state-event-0-kind-removed"));
  await setDate(page.getByTestId("nbl-other-state-event-0-date"), date);
  await pick(page.getByTestId("nbl-other-state-event-0-ptax-separate"));
}

async function calc(page: Page): Promise<Resp> {
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const r = await resp;
  return { status: r.status(), req: r.request().postDataJSON(), json: await r.json() };
}

const banner = {
  business: (page: Page) => page.getByText("사업용 토지 — 일반세율이 적용됩니다."),
  nonBusiness: (page: Page) => page.getByText(/비사업용 토지 — 기본세율 \+10%p 중과/),
};
const nudge = (page: Page) => page.getByTestId("nbl-other-state-event-0-grace-nudge");

test.describe("E3-⑤ E3f-1a — 철거 행 + 9호 유예 부재 안내 (N-2)", () => {
  test("E5-1: 철거 행만 입력하면 안내가 보이고 비사업용 → 9호 행을 입력하면 안내가 숨고 사업용 (S23 → S22 · 양도 2025-06-01 · 철거 2018-01-01)", async ({ page }) => {
    test.setTimeout(200_000);
    // ① 철거 행만 — 9호 없음
    await seed(page, [landAsset(BARE_COMPREHENSIVE)]);
    await gotoHolding(page);
    await expect(nudge(page), "사건을 입력하기 전에는 안내가 없다").toHaveCount(0);
    await addRemovedRow(page, "2018-01-01");
    await expect(nudge(page)).toBeVisible();
    await expect(nudge(page)).toContainText("유예 없이 판정합니다");
    await expect(page.getByTestId("nbl-state-history-grace-row-notice"), "상시 고지는 그대로").toBeVisible();
    const without = await calc(page);
    expect(without.status, JSON.stringify(without.json).slice(0, 300)).toBe(200);
    expect(without.req.nonBusinessLandRaw?.nblGracePeriods ?? []).toEqual([]);
    await expect(banner.nonBusiness(page)).toBeVisible();
    console.log("[E5-1 9호 없음] 산출세액", JSON.stringify(without.json.data?.result?.calculatedTax ?? without.json.data?.aggregated?.totalTax));

    // ② 같은 입력 + 9호(건축물 멸실·철거·붕괴) 철거일 기산 — 안내가 사라지고 사업용
    await seed(page, [landAsset(BARE_COMPREHENSIVE)]);
    await gotoHolding(page);
    await addRemovedRow(page, "2018-01-01");
    await expect(nudge(page)).toBeVisible();
    await page.getByRole("button", { name: /유예기간 추가/ }).first().click();
    await expect(nudge(page), "유예 행이 추가돼도 사유가 9호가 아니면 안내는 남는다").toBeVisible();
    await page.getByRole("combobox").filter({ hasText: /./ }).last().click();
    await page.getByRole("listbox").getByRole("option", { name: /건축물 멸실·철거·붕괴 \(9호\)/ }).click();
    await setDate(page.locator('[data-field="nblGracePeriods.0.anchorDate"]'), "2018-01-01");
    await expect(nudge(page), "9호 행이 있으면 숨는다").toHaveCount(0);
    await expect(page.getByTestId("nbl-state-history-grace-row-notice")).toBeVisible();
    const withNine = await calc(page);
    expect(withNine.status, JSON.stringify(withNine.json).slice(0, 300)).toBe(200);
    expect(withNine.req.nonBusinessLandRaw?.nblGracePeriods, "9호 행이 엔진까지 도달").toEqual([expect.objectContaining({ reasonCode: "demolition", anchorDate: "2018-01-01" })]);
    await expect(banner.business(page)).toBeVisible();
    console.log("[E5-1 9호 있음] 산출세액", JSON.stringify(withNine.json.data?.result?.calculatedTax ?? withNine.json.data?.aggregated?.totalTax));
  });
});

test.describe("E3-⑤ E3f-1a — 꼬리 근거 «철거ㆍ멸실» 안내 연혁화 (N-1)", () => {
  const notice = (page: Page) => page.getByTestId("nbl-other-tax-basis-demolished-notice");

  test("E5-2: 양도일 2026-05-31 ↔ 2026-06-01 — 안내가 6개월(시행본) ↔ 1년으로 바뀐다 · 양도일을 화면에서 바꾸면 따라 바뀐다", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(TAIL_DEMOLISHED)], { transferDate: "2026-05-31", filingDate: "2026-08-31" });
    await gotoHolding(page);
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText("6개월이 지나지 않은 건축물");
    await expect(notice(page)).not.toContainText("1년이 지나지 않은 건축물");
    await expect(page.getByTestId("nbl-other-tax-basis-demolished-direction")).toContainText("건축물 멸실·철거·붕괴」(9호)");

    await page.getByRole("button", { name: "자산 목록" }).first().click();
    await fillDateAndVerify(page, { year: "2026", month: "6", day: "1" }, { scope: page.getByTestId("transfer-date") });
    await gotoHolding(page);
    await expect(notice(page)).toContainText("1년이 지나지 않은 건축물");
    await expect(notice(page)).not.toContainText("6개월이 지나지 않은 건축물");
  });

  test("E5-2b: 양도일 미입력이면 시행본 연혁 한 줄 — 단일 시행본을 단정하지 않는다", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(TAIL_DEMOLISHED)], { transferDate: "", filingDate: "" });
    await gotoHolding(page);
    await expect(notice(page)).toContainText("양도일을 입력하면 해당 시행본으로 안내합니다");
  });
});

test.describe("E3-⑤ E3f-1a — 시각(라이트·다크·375px)", () => {
  test("E5-V: 철거 행 안내 카드·꼬리 근거 안내 — 라이트/다크 글자 대비 4.5 이상 · 375px 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 375, height: 900 });
    await seed(page, [landAsset({ ...TAIL_DEMOLISHED })], { transferDate: "2026-06-01", filingDate: "2026-08-31" });
    await gotoHolding(page);
    await addRemovedRow(page, "2024-01-01");
    const nudgeCard = nudge(page);
    await expect(nudgeCard).toBeVisible();
    const tail = page.getByTestId("nbl-other-tax-basis");
    await expect(page.getByTestId("nbl-other-tax-basis-demolished-notice")).toBeVisible();
    for (const [name, loc] of [["nudge", nudgeCard], ["tail", tail]] as const) {
      const b = await loc.boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 375 + 0.5, `${name} 카드가 375px 안`).toBe(true);
    }
    await nudgeCard.screenshot({ path: "e2e/_artifacts/e3-5a-nudge-375.png" });
    await tail.screenshot({ path: "e2e/_artifacts/e3-5a-tail-375.png" });
    // 입력 화면 전체의 페이지 가로 스크롤은 이 PR 밖의 기존 요소(「무조건 사업용 토지 판정」 이농 농지 토글 줄)가 만든다 — 이 PR이 추가한 영역(사건 이력 섹션·꼬리 근거 칸)만 안쪽 넘침이 없는지 본다.
    for (const id of ["nbl-other-state-history", "nbl-other-tax-basis"]) {
      const over = await page.getByTestId(id).first().evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `${id} 안쪽 가로 넘침`).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await expectLightContrast(page, nudgeCard);
    await expectLightContrast(page, tail);
    await nudgeCard.screenshot({ path: "e2e/_artifacts/e3-5a-nudge-light.png" });
    await expectDarkContrast(page, nudgeCard);
    await expectDarkContrast(page, tail);
    await nudgeCard.screenshot({ path: "e2e/_artifacts/e3-5a-nudge-dark.png" });
  });
});
