/**
 * transfer-nbl-other-state-history-e3-1b.spec.ts
 *
 * NBL-STATE-HISTORY-E3-1b — 기타토지 «건축물 없는 구간(나대지)의 재산세 구분» — 입력 → 계산 → 결과 (UI 계획서 §10 · 엔진 계획서 §5 R1~R7).
 * 선례: `transfer-nbl-other-state-history-e3-1.spec.ts`(sessionStorage 시드 + 화면에서 사건 입력).
 *
 * 검증:
 *  1) R1: 신축 2023-06-01 + 앞 나대지 = 공지상태 별도합산(한도 이내) — 화면 입력 → 미리보기 «충족» → body에 선언 3칸 도달(⑫ 침묵 strip 방지) → 사업용 + 결과 구간표에 근거 · 대조군(선언 없음)은 비사업용 + body 키 byte-identical.
 *  2) 면적한도 «일부 초과»·«모름» → 그 구간 종합합산 + 면적한도 고지 → 비사업용 (R3 · R2e — «일부 초과»가 «모름»보다 유리하지 않다).
 *  3) 근거 «모름» → 근거 미확인 고지 + 비사업용(R2).
 *  4) 나대지 위 구분 변경(R7: tax-only · 토글 off · 공지상태 → 종합합산) — ⑧ 차단 없음 · body 도달 · 사업용.
 *  5) 구분을 바꾸면 근거·면적한도가 리셋된다(onChange 시점 쓰기) · 선택지에 철거ㆍ멸실이 없다.
 *  6) 시각: 입력 영역·결과 카드 라이트/다크 글자 대비 4.5 · 375px 사건 영역·결과 카드 가로 스크롤 없음(스크린샷 `e2e/_artifacts/e3-1b-*.png`).
 *
 * 폼은 sessionStorage로 시드한다. 외부 API 의존 없음 — mock 불필요.
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-other-state-history-e3-1b.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };
type Kind = "built" | "removed" | "taxchange";
type Ptax = "exempt" | "special_sum" | "separate" | "comprehensive" | "unknown";

const BASE_FORM = { transferDate: "2024-01-01", filingDate: "2024-03-31", contractTotalPrice: "1000000000" };
/** 기타토지 정밀 판정 ON · 취득 2014-01-01(소유 3,651일) · 양도 2024-01-01 — 엔진 계획서 §6 공통 시료. 질문(모드)은 비워 둔다(화면에서 답한다). */
const LAND = {
  assetKind: "land", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
  nblOtherStateHistoryMode: "", nblOtherStateEvents: [],
};

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

async function seed(page: Page, assets: unknown[], mode: "single" | "fractional" = "single") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...BASE_FORM, assetSplitMode: mode, bundledSaleMode: "actual", assets };
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

const chooseMode = (page: Page, mode: "unchanged" | "changed" | "unknown") => pick(page.getByTestId(`nbl-other-state-mode-${mode}`));

async function setEventDate(page: Page, i: number, iso: string) {
  const [y, m, d] = iso.split("-");
  const date = page.getByTestId(`nbl-other-state-event-${i}-date`);
  await date.getByLabel("연도").fill(y);
  await date.getByLabel("월").fill(m);
  await date.getByLabel("일").fill(d);
  await expect(date.getByLabel("연도")).toHaveValue(y);
  await expect(date.getByLabel("일")).toHaveValue(d);
}

/** 사건 행을 더하고 종류·날짜(·변경/철거 직전 구분)를 입력한다. */
async function addEvent(page: Page, kind: Kind, date: string, before?: Ptax) {
  const rows = page.locator('[data-testid^="nbl-other-state-event-"][data-testid$="-date"]');
  const i = await rows.count();
  await page.getByTestId("nbl-other-state-event-add").click();
  await expect(rows).toHaveCount(i + 1);
  await pick(page.getByTestId(`nbl-other-state-event-${i}-kind-${kind}`));
  await setEventDate(page, i, date);
  if (before) await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-${before}`));
  return i;
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

const banner = {
  business: (page: Page) => page.getByText("사업용 토지 — 일반세율이 적용됩니다."),
  nonBusiness: (page: Page) => page.getByText(/비사업용 토지 — 기본세율 \+10%p 중과/),
};


type Basis = "statutory_exempt" | "separate_taxation" | "vacant_state" | "unknown";
type Limit = "within" | "exceeded" | "unknown";

/** 양도일 현재 «건축물 있음(250㎡) + 별도합산» — R1 계열의 꼬리. */
const BUILDING_SEPARATE = { nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherPropertyTaxType: "separate" };
/** 양도일 현재 «나대지 + 종합합산» — R7 계열의 꼬리(건축물 사건이 없어 토글이 초기 건축물 상태). */
const BARE_COMPREHENSIVE = { nblOtherHasBuilding: false, nblOtherPropertyTaxType: "comprehensive" };

/** 사건 행 i의 나대지 선언 3칸을 화면에서 고른다. */
async function declare(page: Page, i: number, before: Ptax, basis?: Basis, limit?: Limit) {
  await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-${before}`));
  if (basis) await pick(page.getByTestId(`nbl-other-state-event-${i}-basis-${basis}`));
  if (limit) await pick(page.getByTestId(`nbl-other-state-event-${i}-limit-${limit}`));
}

const intervalRow = (page: Page, i: number) => page.getByTestId(`nbl-state-history-interval-${i}`);
const bareNotice = (page: Page, i: number, kind: "unconfirmed" | "area" | "accepted") => page.getByTestId(`nbl-other-state-event-${i}-bare-${kind === "unconfirmed" ? "unconfirmed" : kind === "area" ? "area" : "accepted"}-notice`);

test.describe("기타토지 나대지 구간 재산세 구분(E3-1b) — 입력 → 계산 → 결과", () => {
  test("R1: 신축 2023-06-01 + 앞 나대지 공지상태 별도합산(한도 이내) — 미리보기 «충족» → body 3칸 도달 → 사업용 + 구간표 근거 · 대조군(선언 없음)은 비사업용 + body 키 byte-identical", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BUILDING_SEPARATE)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addEvent(page, "built", "2023-06-01");
    // 선언 없음(기본) = «종합합산» 선택 표시 · 근거·한도 카드·고지 없음
    await expect(page.getByTestId(`nbl-other-state-event-${i}-ptax-comprehensive`)).toBeChecked();
    await expect(page.getByTestId(`nbl-other-state-event-${i}-ptax-unknown`)).toHaveCount(0);
    await expect(page.getByTestId(`nbl-other-state-event-${i}-basis-vacant_state`)).toHaveCount(0);
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("종합합산(나대지 — 고정)");

    await declare(page, i, "separate");
    await expect(page.getByTestId(`nbl-other-state-event-${i}-basis-demolished`), "철거 행 앞 구간(첫 구간이 나대지 — 철거일 출처 없음)에서는 철거ㆍ멸실 근거를 받지 않는다(E3f-2: 철거 행 뒤 구간만 연다)").toHaveCount(0);
    await expect(bareNotice(page, i, "unconfirmed")).toBeVisible();
    await pick(page.getByTestId(`nbl-other-state-event-${i}-basis-vacant_state`));
    await expect(bareNotice(page, i, "unconfirmed")).toHaveCount(0);
    await expect(bareNotice(page, i, "area")).toBeVisible(); // 한도 미선택 = 모름과 같이 접힘
    await pick(page.getByTestId(`nbl-other-state-event-${i}-limit-within`));
    await expect(bareNotice(page, i, "area")).toHaveCount(0);
    await expect(bareNotice(page, i, "accepted")).toBeVisible();

    const row0 = page.getByTestId("nbl-state-history-preview-row-0");
    await expect(row0).toContainText("2014-01-02 ~ 2023-05-31");
    await expect(row0).toContainText("별도합산(나대지 — 공지상태 근거)");
    await expect(row0).toContainText("충족");

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents, "선언 3칸 도달(④⑫⑬⑭ — 침묵 strip 방지)").toEqual([
      { kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" },
    ]);
    await expect(banner.business(page)).toBeVisible();
    await expect(intervalRow(page, 0)).toContainText("2014-01-02 ~ 2023-05-31");
    await expect(intervalRow(page, 0)).toContainText("3,437일");
    await expect(intervalRow(page, 0)).toContainText("별도합산(나대지 — 공지상태 근거)");
    await expect(intervalRow(page, 0)).toContainText("사업용");
    await expect(page.getByText(/사용자가 확인해 선택한 사실로 보아 그 기간을 사업용 구간으로 판정했습니다/).first()).toBeVisible();
    console.log("[R1] 산출세액", JSON.stringify(r.json.data?.result?.calculatedTax ?? r.json.data?.aggregated?.totalTax));

    // 대조군 — 선언 없음: 종합합산으로 판정(비사업용) · body 사건 키는 종전과 byte-identical(근거·한도 키 없음)
    await seed(page, [landAsset(BUILDING_SEPARATE)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "built", "2023-06-01");
    const base = await calc(page);
    expect(base.status, JSON.stringify(base.json).slice(0, 300)).toBe(200);
    expect(base.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" }]);
    await expect(banner.nonBusiness(page)).toBeVisible();
    await expect(intervalRow(page, 0)).toContainText("종합합산");
    console.log("[R1 대조군] 산출세액", JSON.stringify(base.json.data?.result?.calculatedTax ?? base.json.data?.aggregated?.totalTax));
  });

  for (const [id, limit, label] of [["R3", "exceeded", "면적한도 일부 초과"], ["R2e", "unknown", "면적한도 모름"]] as const) {
    test(`${id}: 공지상태 ${label} → 그 구간 종합합산 + 면적한도 고지 → 비사업용 («일부 초과»가 «모름»보다 유리하지 않다)`, async ({ page }) => {
      test.setTimeout(150_000);
      await seed(page, [landAsset(BUILDING_SEPARATE)]);
      await gotoHolding(page);
      await chooseMode(page, "changed");
      const i = await addEvent(page, "built", "2023-06-01");
      await declare(page, i, "separate", "vacant_state", limit);
      await expect(bareNotice(page, i, "area")).toBeVisible();
      await expect(bareNotice(page, i, "accepted")).toHaveCount(0);
      await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText(`종합합산(나대지 — ${label} · 확인 필요)`);

      const r = await calc(page);
      expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
      expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([
        { kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: limit },
      ]);
      await expect(banner.nonBusiness(page)).toBeVisible();
      await expect(intervalRow(page, 0)).toContainText(`종합합산(나대지 — ${label} · 확인 필요)`);
      await expect(page.getByText(/호별 면적한도 이내인 경우에만 인정하는데/).first()).toBeVisible();
    });
  }

  test("R2: 근거 «모름» → 근거 미확인 고지 + 종합합산 → 비사업용 · body에 근거 «unknown» 도달", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BUILDING_SEPARATE)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addEvent(page, "built", "2023-06-01");
    await declare(page, i, "separate", "unknown");
    await expect(bareNotice(page, i, "unconfirmed")).toBeVisible();
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("종합합산(나대지 — 근거 모름 · 확인 필요)");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([
      { kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "unknown" },
    ]);
    await expect(banner.nonBusiness(page)).toBeVisible();
    await expect(intervalRow(page, 0)).toContainText("종합합산(나대지 — 근거 모름 · 확인 필요)");
    await expect(page.getByText(/그 근거를 확인하지 못해/).first()).toBeVisible();
  });

  test("R7: 나대지 위 구분 변경(tax-only · 토글 off · 공지상태 한도 이내 → 종합합산 2022-06-01) — ⑧ 차단 없음 · 5지선다 + 근거 카드 · body 도달 → 사업용 3,072일", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BARE_COMPREHENSIVE)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addEvent(page, "taxchange", "2022-06-01");
    await expect(page.getByTestId(`nbl-other-state-event-${i}-ptax-unknown`), "구분 변경 행은 «모름»이 있다(`\"\"` = 모름)").toBeVisible();
    await expect(page.getByTestId(`nbl-other-state-event-${i}-ptax-unknown-notice`)).toBeVisible();
    await declare(page, i, "separate", "vacant_state", "within");
    await expect(page.getByTestId(`nbl-other-state-event-${i}-ptax-unknown-notice`)).toHaveCount(0);
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("별도합산(나대지 — 공지상태 근거)");

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherHasBuilding).toBe(false);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([
      { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" },
    ]);
    await expect(banner.business(page)).toBeVisible();
    await expect(intervalRow(page, 0)).toContainText("2014-01-02 ~ 2022-05-31");
    await expect(intervalRow(page, 0)).toContainText("3,072일");
    await expect(intervalRow(page, 0)).toContainText("별도합산(나대지 — 공지상태 근거)");
    console.log("[R7] 산출세액", JSON.stringify(r.json.data?.result?.calculatedTax ?? r.json.data?.aggregated?.totalTax));
  });

  test("구분을 바꾸면 근거·면적한도가 리셋된다 · 종류를 바꾸면 선언 키까지 지운다(stale 방지 — onChange 시점 쓰기)", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BUILDING_SEPARATE)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addEvent(page, "built", "2023-06-01");
    await declare(page, i, "separate", "vacant_state", "within");
    await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-special_sum`));
    // 분리과세로 바꾸면 이전 근거(공지상태)·한도는 사라지고 새 선택지가 미선택으로 뜬다
    await expect(page.getByTestId(`nbl-other-state-event-${i}-basis-separate_taxation`)).not.toBeChecked();
    await expect(page.getByTestId(`nbl-other-state-event-${i}-basis-vacant_state`)).toHaveCount(0);
    await expect(page.getByTestId(`nbl-other-state-event-${i}-limit-within`)).toHaveCount(0);
    await expect(bareNotice(page, i, "unconfirmed")).toBeVisible();
    // 다시 별도합산 — 근거·한도는 비어 있다(되살아나지 않는다)
    await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-separate`));
    await expect(page.getByTestId(`nbl-other-state-event-${i}-basis-vacant_state`)).not.toBeChecked();
    await pick(page.getByTestId(`nbl-other-state-event-${i}-basis-vacant_state`));
    await expect(page.getByTestId(`nbl-other-state-event-${i}-limit-within`)).not.toBeChecked();
    // 종류를 철거로 바꾸면 나대지 카드가 사라지고 body에는 선언 키가 없다
    await pick(page.getByTestId(`nbl-other-state-event-${i}-kind-removed`));
    await expect(page.getByTestId(`nbl-other-state-event-${i}-bare`)).toHaveCount(0);
    await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-separate`));
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2023-06-01", propertyTaxTypeBefore: "separate" }]);
  });
});

test.describe("기타토지 나대지 구간 재산세 구분(E3-1b) — 시각(라이트·다크·375px)", () => {
  test("R1 입력 영역·결과 카드: 라이트/다크 글자 대비 4.5 이상 · 375px 사건 영역이 화면 안 · 결과 카드 페이지 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 375, height: 900 });
    await seed(page, [
      landAsset({
        ...BUILDING_SEPARATE,
        nblOtherStateHistoryMode: "changed",
        nblOtherStateEvents: [{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "exceeded" }],
      }),
    ]);
    await gotoHolding(page);
    const section = page.getByTestId("nbl-other-state-history");
    await section.scrollIntoViewIfNeeded();
    // 페이지 전체의 가로 넘침은 이 PR과 무관한 기존 현상이다(§168의14③ 의제 사유 토글 행, e3-1 spec 주석) — 이 섹션의 폭만 본다.
    const sectionRight = await page.getByTestId("nbl-other-state-events").evaluate((el) => el.getBoundingClientRect().right);
    expect(sectionRight, "사건 입력 영역이 375px 안").toBeLessThanOrEqual(375.5);
    for (const t of ["nbl-other-state-event-0-ptax-separate", "nbl-other-state-event-0-basis-vacant_state", "nbl-other-state-event-0-limit-within"]) {
      const b = await page.getByTestId(t).locator("xpath=ancestor::label[1]").boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 375 + 0.5, `${t} 카드가 화면 폭 안`).toBe(true);
    }
    await section.screenshot({ path: "e2e/_artifacts/e3-1b-input-375.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: "e2e/_artifacts/e3-1b-input-light.png" });
    await expectLightContrast(page, section);
    await expectDarkContrast(page, section);
    await section.screenshot({ path: "e2e/_artifacts/e3-1b-input-dark.png" });
    await page.emulateMedia({ media: "screen", colorScheme: "light" });

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const card = page.getByTestId("nbl-state-history-period");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-1b-card-light.png" });
    await expectLightContrast(page, card);
    await expectDarkContrast(page, card);
    await card.screenshot({ path: "e2e/_artifacts/e3-1b-card-dark.png" });
    await expectNoPageHScroll(page, 375);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-1b-card-375.png" });
  });
});
