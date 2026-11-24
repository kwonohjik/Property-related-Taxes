/**
 * transfer-nbl-house-state-history.spec.ts
 *
 * NBL-STATE-HISTORY-E3-③ A — 주택부수토지 «소유기간 중 주택 신축·멸실 이력» — 입력 → 계산 → 결과
 * (UI 계획서 `nbl-state-history-e3-3-house-appurtenant.ui.plan.md` §11.2 E1~E12 · 엔진 케이스 표 `__tests__/tax-engine/_helpers/nbl-state-history-e3-3-table.ts`).
 * 선례: `transfer-nbl-other-state-history-e3-1b.spec.ts` · `transfer-nbl-revenue-period.spec.ts`(sessionStorage 시드 + 화면에서 입력).
 *
 * 공통 시료(엔진 표 A): 주택부수토지 500㎡ · 양도일 현재 정착면적 100㎡ · 수도권 밖 일반주거(5배 → 허용 500㎡ = 이내) · 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일) · 취득가 3억 · 양도가 10억.
 *  E1  M15: 질문 «바뀐 적 있음» + 주택 신축 2023-06-01 → body(모드·사건·`nblOtherHasBuilding: true`) → 비사업용 + 구간표(주택 변형) + 일 단위 고지 · «바뀐 적 없음» 대비 +55,750,000
 *  E2  «바뀐 적 없음» byte-identical: body mode `unchanged` · 사건 [] · 구간표 없음 · 사업용
 *  E3  질문 미선택 → ⑧ 차단(요청 없음) · 오류 목록 문구
 *  E4  «모름»: 현행 판정 + 모름 고지
 *  E5  양도일 현재 배율 초과(정착 40㎡): 질문 필수 유지 · 안내 1줄 · 이력 미반영(구간표 없음) + 엔진 PARTIAL 고지
 *  E6  기타토지 stale(`tax_type_changed` 행 + 연접 다필지 ON) → 주택 카드: 질문 노출 · 행 보임 · H4 차단 · 삭제 후 통과
 *  E7  마지막 사건 = 철거: H5 차단 + «지목을 「나대지·잡종지」로 바꿔» 안내
 *  E7b H3c/H3f: 철거 2016-01-01(정착 100 이내 / 50 초과) → 재신축 2023-01-01 — 허용 면적 미리보기 · body 정착면적 도달 · 초과면 그 구간 비사업용 + 고지
 *  E7c H9 차단 격자: 정착면적 빈칸·0·600(> 토지 500㎡) → 차단 문구 + «모름» 탈출구 안내 → 질문 «모름»으로 바꾸면 통과
 *  E8  사건 역순·같은 날 → ⑧ 차단
 *  E9  축 B(지분 2장): 첫 카드의 이력이 companion body에도 실리고 두 지분 모두 같은 판정
 *  E10 9호 유예 병행: 하단 GRACE_ROW 고지 · 초과 구간 + 9호면 `HOUSE_EXCEEDED_GRACE` 고지(입력·결과 모두)
 *  E11 지목 왕복(주택 → 기타토지 → 주택): 저장값 보존
 *  E12 시각: 라이트/다크 글자 대비 4.5 · 375px 입력 영역·결과 카드 가로 스크롤 없음
 *
 * 폼은 sessionStorage로 시드한다. 외부 API 의존 없음 — mock 불필요.
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-house-state-history.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import {
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_UNKNOWN_NOTICE,
} from "../lib/tax-engine/nbl-confirm-notices";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };
type Kind = "built" | "removed";

const BASE_FORM = { transferDate: "2024-01-01", filingDate: "2025-12-31", contractTotalPrice: "1000000000" };
/** 주택부수토지 정밀판정 ON — 엔진 표 A 공통 시료. 질문(모드)은 비워 둔다(화면에서 답한다). */
const HOUSE = {
  assetKind: "land", acquisitionArea: "500", transferArea: "500", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "housing_site", nblZoneType: "general_residential",
  nblIsMetropolitanArea: "no", nblHousingFootprint: "100",
  nblOtherStateHistoryMode: "", nblOtherStateEvents: [],
};
const SWING = 55_750_000; // 엔진 표 `E3D_SWING_2014` — 같은 거래의 전량 비사업용 − 전량 사업용 세액

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

const houseAsset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...HOUSE, ownershipNumerator: "100", ownershipDenominator: "100", ...over });

async function gotoHolding(page: Page) {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await expect(page.getByTestId("nbl-other-state-history").first(), "주택 이력 질문이 보여야 함").toBeVisible({ timeout: 20_000 });
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

/** 사건 행을 더하고 종류·날짜(·철거 행 정착면적)를 입력한다. */
async function addEvent(page: Page, kind: Kind, date: string, footprint?: string) {
  const rows = page.locator('[data-testid^="nbl-other-state-event-"][data-testid$="-date"]');
  const i = await rows.count();
  await page.getByTestId("nbl-other-state-event-add").click();
  await expect(rows).toHaveCount(i + 1);
  await pick(page.getByTestId(`nbl-other-state-event-${i}-kind-${kind}`));
  await setEventDate(page, i, date);
  if (footprint !== undefined) await setFootprint(page, i, footprint);
  return i;
}

async function setFootprint(page: Page, i: number, value: string) {
  const input = page.getByTestId(`nbl-other-state-event-${i}-footprint`);
  await input.fill(value);
  await expect(input).toHaveValue(value);
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

const banner = {
  business: (page: Page) => page.getByText("사업용 토지 — 일반세율이 적용됩니다."),
  nonBusiness: (page: Page) => page.getByText(/비사업용 토지 — 기본세율 \+10%p 중과/),
};
const intervalRow = (page: Page, i: number) => page.getByTestId(`nbl-state-history-interval-${i}`);
const errorText = (page: Page, re: RegExp) => page.getByText(re).first();

test.describe("주택부수토지 소유기간 중 주택 신축·멸실 이력(E3-③ A) — 입력 → 계산 → 결과", () => {
  test("E1·E2 M15: 질문 «바뀐 적 있음» + 주택 신축 2023-06-01 → body 도달 → 비사업용 + 구간표(주택 변형) + 일 단위 고지 · «바뀐 적 없음»은 byte-identical(사업용) · 차액 +55,750,000", async ({ page }) => {
    test.setTimeout(180_000);
    // E2 — «바뀐 적 없음»(현행): 모드 unchanged · 사건 [] · 구간표 없음 · 사업용
    await seed(page, [houseAsset()]);
    await gotoHolding(page);
    // 필수 질문 — 미선택이 기본이고 어느 쪽도 선택돼 있지 않다(가정값 채움 없음)
    for (const m of ["unchanged", "changed", "unknown"] as const) await expect(page.getByTestId(`nbl-other-state-mode-${m}`)).not.toBeChecked();
    await expect(page.getByText("소유기간 중 주택 신축·멸실 이력")).toBeVisible();
    await expect(page.getByTestId("nbl-other-has-building-toggle"), "주택은 «건축물 있음» 토글이 없다").toHaveCount(0);
    await chooseMode(page, "unchanged");
    const off = await calc(page);
    expect(off.status, JSON.stringify(off.json).slice(0, 300)).toBe(200);
    expect(off.req.nonBusinessLandRaw?.nblOtherStateHistoryMode).toBe("unchanged");
    expect(off.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([]);
    await expect(banner.business(page)).toBeVisible();
    await expect(page.getByTestId("nbl-state-history-period")).toHaveCount(0);
    expect(nblOf(off)?.periodEvaluation?.basis).toBe("not_judged");
    const baseTax = taxOf(off);
    console.log("[E2 현행] 산출세액", baseTax);

    // E1 — 주택 신축 2023-06-01
    await seed(page, [houseAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addEvent(page, "built", "2023-06-01");
    // 종류는 2종 — «재산세 과세 구분 변경» 없음 · 신축 행에는 나대지 선언 카드 · 정착면적 카드 없음
    await expect(page.getByTestId(`nbl-other-state-event-${i}-kind-taxchange`)).toHaveCount(0);
    await expect(page.getByText("신축 직전 나대지 기간의 재산세 구분")).toBeVisible();
    await expect(page.getByTestId(`nbl-other-state-event-${i}-footprint`)).toHaveCount(0);
    await expect(page.getByTestId("nbl-state-history-at-transfer")).toContainText("양도일 현재 주택: 있음");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("2014-01-02 ~ 2023-05-31");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("없음(나대지)");
    await expect(page.getByTestId("nbl-state-history-preview-row-1")).toContainText("2023-06-01 ~ 2023-12-31");
    await expect(page.getByTestId("nbl-state-history-preview-total")).toContainText("3,651일");
    // 입력 화면 고지 = 엔진 상수 단일 소스
    await expect(page.getByTestId("nbl-state-history-applied-notice")).toHaveText(NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE);
    await expect(page.getByTestId("nbl-state-history-daywise-notice")).toHaveText(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);

    const on = await calc(page);
    expect(on.status, JSON.stringify(on.json).slice(0, 300)).toBe(200);
    const raw = on.req.nonBusinessLandRaw;
    expect(raw?.nblOtherStateHistoryMode).toBe("changed");
    expect(raw?.nblOtherStateEvents, "사건 1행 도달(④⑫⑬⑭ — 신축 행은 정착면적 키 없음)").toEqual([{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" }]);
    expect(raw?.nblOtherHasBuilding, "A-12: 주택 카드는 토글이 아니라 true").toBe(true);
    await expect(banner.nonBusiness(page)).toBeVisible();
    // 결과 구간표 — 주택 변형(제목·열 라벨·«없음(나대지)»)
    const card = page.getByTestId("nbl-state-history-period");
    await expect(card).toContainText("소유기간 중 주택 신축·멸실 이력 반영");
    await expect(card).toContainText("재산세 구분 · 배율 판정");
    await expect(intervalRow(page, 0)).toContainText("2014-01-02 ~ 2023-05-31");
    await expect(intervalRow(page, 0)).toContainText("없음(나대지)");
    await expect(intervalRow(page, 0)).toContainText("비사업용");
    await expect(intervalRow(page, 1)).toContainText("양도일 현재 주택");
    await expect(page.getByText(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE).first()).toBeVisible();
    await expect(page.getByText(NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE).first()).toBeVisible();
    const n = nblOf(on);
    expect(n?.periodEvaluation?.basis).toBe("state_history");
    expect(n?.effectiveBusinessDays).toBe(214); // 엔진 표 M15
    expect(n?.totalOwnershipDays).toBe(3651);
    console.log("[E1 M15] 산출세액", taxOf(on), "차액", taxOf(on) - baseTax);
    expect(taxOf(on) - baseTax, "과소 해소: 같은 세율표에서 전량 비사업용 − 전량 사업용").toBe(SWING);
  });

  test("E3 질문 미선택 → 계산 차단(요청 없음) · 오류 목록에 «주택 부수토지 —» 문구 + «모름» 안내 · 질문에 답하면 통과", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [houseAsset()]);
    await gotoHolding(page);
    expect(await calcBlocked(page), "질문 미선택은 계산 요청이 나가지 않는다(미입력 ≠ 미해당)").toBe(true);
    await expect(errorText(page, /주택 부수토지 — 소유기간 중 이 토지 위 주택이 새로 지어지거나 없어진 적이 있는지 선택하세요/)).toBeVisible({ timeout: 15_000 });
    await gotoHolding(page);
    await chooseMode(page, "unchanged");
    const r = await calc(page);
    expect(r.status).toBe(200);
  });

  test("E4 «모름»: 현행 판정(사업용) + 엔진 모름 고지 1줄 — 입력 화면에도 같은 문구", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [houseAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "unknown");
    await expect(page.getByTestId("nbl-state-history-unknown-notice")).toHaveText(NBL_STATE_HISTORY_UNKNOWN_NOTICE);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateHistoryMode).toBe("unknown");
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([]);
    await expect(banner.business(page)).toBeVisible();
    await expect(page.getByText(NBL_STATE_HISTORY_UNKNOWN_NOTICE).first()).toBeVisible();
    expect(nblOf(r)?.periodEvaluation?.basis).toBe("not_judged");
  });

  test("E5 양도일 현재 배율 초과(정착 40㎡ → 허용 200㎡ < 500㎡): 질문은 그대로 필수 · 안내는 «바뀐 적 있음»일 때만(Low 1) · 사건은 body에 닿되 이력 미반영(구간표 없음) + 엔진 PARTIAL(주택 변형) 고지", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [houseAsset({ nblHousingFootprint: "40" })]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-state-mode")).toBeVisible();
    // Low 1 — 엔진은 `changed`일 때만 이 고지를 싣는다: 미선택·«바뀐 적 없음»에서는 안내가 없다
    await expect(page.getByTestId("nbl-housing-area-exceeded-notice")).toHaveCount(0);
    await chooseMode(page, "unchanged");
    await expect(page.getByTestId("nbl-housing-area-exceeded-notice")).toHaveCount(0);
    // Low 2 — 초과 + «모름»: 엔진 결과에 UNKNOWN 고지가 없으므로 입력 화면도 보이지 않는다
    await chooseMode(page, "unknown");
    await expect(page.getByTestId("nbl-state-history-unknown-notice")).toHaveCount(0);
    await chooseMode(page, "changed");
    await expect(page.getByTestId("nbl-housing-area-exceeded-notice")).toHaveText(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE);
    await addEvent(page, "built", "2023-06-01");
    // 구간 미리보기도 엔진이 이력을 읽지 않으므로 그리지 않는다
    await expect(page.getByTestId("nbl-state-history-preview")).toHaveCount(0);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toHaveLength(1);
    await expect(page.getByTestId("nbl-state-history-period")).toHaveCount(0);
    expect(nblOf(r)?.periodEvaluation?.basis).toBe("not_judged");
    expect(((nblOf(r)?.warnings as string[] | undefined) ?? []).filter((w) => w === NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE)).toHaveLength(1);
    await expect(page.getByText(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE).first()).toBeVisible();
  });

  test("E5b Low 3: 양도일 현재 배율 초과 + 철거 행 정착면적 빈칸 — 엔진이 이력을 읽지 않으므로 ⑧이 막지 않는다(계산 가능) · 같은 입력의 이내(정착 100)에서는 정착면적을 요구한다", async ({ page }) => {
    test.setTimeout(200_000);
    await seed(page, [houseAsset({ nblHousingFootprint: "100" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addEvent(page, "removed", "2016-01-01");
    await addEvent(page, "built", "2023-01-01");
    await expect(page.locator(`[data-field="nblOtherStateEvents.${i}.houseFootprintBefore"] .text-destructive`).first(), "이내: 필수 표시").toBeVisible();
    expect(await calcBlocked(page), "이내 + 정착면적 빈칸 = 차단").toBe(true);
    await expect(errorText(page, /철거 직전 주택 정착면적\(㎡\)을 입력하세요/)).toBeVisible({ timeout: 15_000 });

    await seed(page, [houseAsset({ nblHousingFootprint: "40" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "removed", "2016-01-01");
    await addEvent(page, "built", "2023-01-01");
    await expect(page.getByTestId("nbl-housing-area-exceeded-notice")).toBeVisible();
    await expect(page.locator('[data-field="nblOtherStateEvents.0.houseFootprintBefore"] .text-destructive')).toHaveCount(0);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(nblOf(r)?.periodEvaluation?.basis).toBe("not_judged");
    await expect(page.getByText(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE).first()).toBeVisible();
  });

  test("E6 기타토지 stale → 주택 카드: `tax_type_changed` 행 + 연접 다필지 ON — 질문 노출 · 행 보임 · ⑧ H4 차단 · 행 삭제 후 통과", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [
      houseAsset({
        nblOtherUseParcels: true,
        nblOtherStateHistoryMode: "changed",
        nblOtherStateEvents: [
          { kind: "tax_type_changed", date: "2020-01-01", propertyTaxTypeBefore: "separate" },
          { kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" },
        ],
      }),
    ]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-state-mode")).toBeVisible(); // 연접 다필지 stale이 주택 질문을 가리지 않는다
    await expect(page.getByTestId("nbl-other-state-event-0-house-taxchange-notice")).toBeVisible();
    await expect(page.getByTestId("nbl-other-state-event-0-kind-built")).not.toBeChecked();
    await expect(page.getByTestId("nbl-other-state-event-0-kind-removed")).not.toBeChecked();
    expect(await calcBlocked(page)).toBe(true);
    await expect(errorText(page, /주택 부수토지 — 재산세 과세 구분 변경 사건 1번째 행 — 주택부수토지 카드는/)).toBeVisible({ timeout: 15_000 });
    await gotoHolding(page);
    await page.getByTestId("nbl-other-state-event-0-remove").click();
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" }]);
  });

  test("E7 마지막 사건 = 철거: ⑧ H5 차단 + «지목을 「나대지·잡종지」로 바꿔» 안내", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [houseAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "built", "2016-01-01");
    await addEvent(page, "removed", "2018-01-01", "100");
    expect(await calcBlocked(page)).toBe(true);
    await expect(errorText(page, /주택 사건 2번째 행 — 마지막 주택 사건이 「멸실·철거·붕괴」입니다.*나대지·잡종지/)).toBeVisible({ timeout: 15_000 });
  });

  test("E7b H3c·H3f: 철거 2016-01-01(정착 100 → 이내) → 재신축 2023-01-01 — 허용 면적 미리보기 · body 정착면적 도달 · 비사업용 / 정착 50(초과)이면 미리보기 «초과» + 고지 · 같은 비사업용", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, [houseAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const r0 = await addEvent(page, "removed", "2016-01-01");
    await expect(page.getByTestId(`nbl-other-state-event-${r0}-footprint`)).toBeVisible();
    await expect(page.getByText("철거 직전 그 토지의 재산세 구분")).toHaveCount(0);
    await expect(page.getByTestId(`nbl-other-state-event-${r0}-footprint-preview`)).toHaveCount(0); // 빈칸은 빈칸 — 미리보기 없음
    await addEvent(page, "built", "2023-01-01");
    await setFootprint(page, r0, "100");
    const preview = page.getByTestId(`nbl-other-state-event-${r0}-footprint-preview`);
    await expect(preview).toContainText("정착면적 100㎡");
    await expect(preview).toContainText("허용 면적 500㎡");
    await expect(preview).toContainText("토지 면적 500㎡");
    await expect(preview).toContainText("배율 이내");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("충족");
    await expect(page.getByTestId("nbl-state-history-preview-row-1")).toContainText("없음(나대지)");

    const within = await calc(page);
    expect(within.status, JSON.stringify(within.json).slice(0, 300)).toBe(200);
    expect(within.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([
      { kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "100" },
      { kind: "building_built", date: "2023-01-01", propertyTaxTypeBefore: "" },
    ]);
    const nw = nblOf(within);
    expect(nw?.isNonBusinessLand).toBe(true); // 엔진 표 H3c — 총 비사업 2,557 > 1,460
    expect(nw?.effectiveBusinessDays).toBe(1094);
    const iv0 = nw?.periodEvaluation?.stateHistory?.intervals?.[0];
    expect(iv0).toMatchObject({ buildingKind: "house", houseOutcome: "within" });
    expect(iv0?.houseCheck).toMatchObject({ footprint: 100, allowedArea: 500, landArea: 500 });
    await expect(banner.nonBusiness(page)).toBeVisible();
    await expect(intervalRow(page, 0)).toContainText("정착면적 100㎡");
    await expect(intervalRow(page, 0)).toContainText("허용 면적 500㎡");
    await expect(intervalRow(page, 0)).toContainText("배율 이내");
    await expect(intervalRow(page, 0)).toContainText("사업용");

    // 정착 50 → 초과(허용 250㎡ < 토지 500㎡) — 그 구간 접힘(H3f). 계산 뒤에는 결과 화면이라 같은 입력을 다시 시드해 정착면적만 바꾼다.
    await seed(page, [houseAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "removed", "2016-01-01", "50");
    await addEvent(page, "built", "2023-01-01");
    await expect(page.getByTestId(`nbl-other-state-event-${r0}-footprint-preview`)).toContainText("초과 250㎡");
    await expect(page.getByTestId(`nbl-other-state-event-${r0}-footprint-exceeded-notice`)).toHaveText(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("미충족");
    const exceeded = await calc(page);
    expect(exceeded.status, JSON.stringify(exceeded.json).slice(0, 300)).toBe(200);
    const ne = nblOf(exceeded);
    expect(ne?.effectiveBusinessDays).toBe(365); // 엔진 표 H3f
    expect(ne?.periodEvaluation?.stateHistory?.intervals?.[0]).toMatchObject({ houseOutcome: "exceeded" });
    await expect(intervalRow(page, 0)).toContainText("초과 250㎡");
    await expect(page.getByText(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE).first()).toBeVisible();
    console.log("[E7b] 이내 산출세액", taxOf(within), "초과 산출세액", taxOf(exceeded));
  });

  test("E7c H9 차단 격자: 철거 행 정착면적 빈칸·0·600(> 토지 500㎡) → 차단 + «모름» 탈출구 안내 · 질문을 «모름»으로 바꾸면 통과(현행 판정)", async ({ page }) => {
    test.setTimeout(240_000);
    const cases: Array<[string, string, RegExp]> = [
      ["빈칸", "", /철거 직전 주택 정착면적\(㎡\)을 입력하세요/],
      ["0", "0", /철거 직전 주택 정착면적\(0㎡\)은 0보다 커야 합니다/],
      ["600", "600", /철거 직전 주택 정착면적\(600㎡\)이 토지 면적\(500㎡\)보다 큽니다/],
    ];
    for (const [label, value, msg] of cases) {
      await seed(page, [houseAsset()]);
      await gotoHolding(page);
      await chooseMode(page, "changed");
      const i = await addEvent(page, "removed", "2016-01-01", value || undefined);
      await addEvent(page, "built", "2023-01-01");
      if (label === "600") {
        await expect(page.getByTestId(`nbl-other-state-event-${i}-footprint-error`)).toContainText("토지 면적(500㎡)보다 큽니다");
        await expect(page.getByTestId(`nbl-other-state-event-${i}-footprint-preview`)).toHaveCount(0);
        await expect(page.getByTestId("nbl-state-history-preview-empty")).toBeVisible();
      }
      expect(await calcBlocked(page), `${label}: 계산 요청이 나가지 않는다`).toBe(true);
      await expect(errorText(page, msg), label).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/정착면적을 모르면|위 질문에서 「모름」을 선택하세요|이력 질문에서 「모름」을 선택하세요|「모름」을 선택하세요/).first(), `${label}: 탈출구 안내`).toBeVisible();
      // 탈출구 — 질문 «모름»: 통과 + 현행 판정(사업용)
      await gotoHolding(page);
      await chooseMode(page, "unknown");
      const r = await calc(page);
      expect(r.status, `${label}: ${JSON.stringify(r.json).slice(0, 200)}`).toBe(200);
      await expect(banner.business(page)).toBeVisible();
    }
  });

  test("E8 사건 역순·같은 날 → ⑧ 차단(기타토지와 같은 leaf · 문구 주체 «주택 사건»)", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [houseAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "removed", "2018-01-01", "100");
    await addEvent(page, "built", "2018-01-01");
    expect(await calcBlocked(page)).toBe(true);
    await expect(errorText(page, /주택 사건 2번째 행 — 사건일\(2018-01-01\)이 앞 사건과 같은 날입니다/)).toBeVisible({ timeout: 15_000 });
    await gotoHolding(page);
    await setEventDate(page, 1, "2017-01-01");
    expect(await calcBlocked(page)).toBe(true);
    await expect(errorText(page, /주택 사건 2번째 행 — 사건일\(2017-01-01\)이 앞 사건\(2018-01-01\)보다 빠릅니다/)).toBeVisible({ timeout: 15_000 });
  });

  test("E9 축 B(50/50 지분 2장): 첫 카드의 이력이 companion body에도 실리고 두 지분 모두 같은 판정(M15 — 비사업용)", async ({ page }) => {
    test.setTimeout(180_000);
    const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };
    await seed(
      page,
      [
        { ...houseAsset(), ...HALF, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" }] },
        { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", ...HALF },
      ],
      "fractional",
    );
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId("nbl-other-state-history").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("nbl-other-state-history"), "질문은 첫 카드에만").toHaveCount(1);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const companion = r.req.companionAssets?.[0]?.nonBusinessLandRaw;
    expect(companion?.nblOtherStateHistoryMode, "둘째 지분 raw에도 이력이 실린다").toBe("changed");
    expect(companion?.nblOtherStateEvents).toEqual([{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" }]);
    expect(companion?.nblOtherHasBuilding).toBe(true);
    const props = r.json.data.aggregated.properties as Array<{ nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean; periodEvaluation?: { basis?: string } } }>;
    expect(props.map((p) => p.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis)).toEqual(["state_history", "state_history"]);
    console.log("[E9] 지분별 비사업용", props.map((p) => p.nonBusinessLandJudgmentDetail?.isNonBusinessLand), "총세액", taxOf(r));
  });

  test("E10 9호 유예 병행: 사건은 유예를 자동 생성하지 않는다(GRACE_ROW 고지) · 초과 구간 + 9호 행이면 입력 화면·결과 모두 `HOUSE_EXCEEDED_GRACE` 고지", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, [
      houseAsset({
        nblOtherStateHistoryMode: "changed",
        nblOtherStateEvents: [
          { kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "50" },
          { kind: "building_built", date: "2023-01-01", propertyTaxTypeBefore: "" },
        ],
        nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2016-01-01" }],
      }),
    ]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-state-history-grace-row-notice")).toBeVisible();
    await expect(page.getByTestId("nbl-state-history-house-exceeded-grace-notice")).toHaveText(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect((nblOf(r)?.warnings as string[] | undefined) ?? []).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
    await expect(page.getByText(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE).first()).toBeVisible();
  });

  test("E11 지목 왕복(주택 → 기타토지 → 주택): 저장값이 지워지지 않는다 — 기타토지 질문·행 복원 · 돌아오면 정착면적 그대로", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [
      houseAsset({
        nblOtherStateHistoryMode: "changed",
        nblOtherPropertyTaxType: "comprehensive",
        nblOtherStateEvents: [
          { kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "100" },
          { kind: "building_built", date: "2023-01-01", propertyTaxTypeBefore: "" },
        ],
      }),
    ]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-state-event-0-footprint")).toHaveValue("100");
    const landType = page.locator('[data-field="nblLandType"]').getByRole("combobox");
    await landType.click();
    await page.getByRole("option", { name: /기타 토지/ }).click();
    await expect(page.getByTestId("nbl-other-state-mode-changed")).toBeChecked();
    await expect(page.getByTestId("nbl-other-state-event-0-footprint"), "기타토지는 정착면적 칸이 없다").toHaveCount(0);
    await expect(page.getByTestId("nbl-other-state-event-0-ptax-comprehensive").or(page.getByTestId("nbl-other-state-event-0-ptax-separate")).first()).toBeVisible();
    await landType.click();
    await page.getByRole("option", { name: /주택 부수 토지/ }).click();
    await expect(page.getByTestId("nbl-other-state-mode-changed")).toBeChecked();
    await expect(page.getByTestId("nbl-other-state-event-0-footprint")).toHaveValue("100");
  });
});

test.describe("주택부수토지 이력(E3-③ A) — 시각(라이트·다크·375px)", () => {
  test("E12 입력 영역·결과 카드: 라이트/다크 글자 대비 4.5 이상 · 375px 사건 영역이 화면 안 · 결과 카드 페이지 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 900 });
    await seed(page, [
      houseAsset({
        nblOtherStateHistoryMode: "changed",
        nblOtherStateEvents: [
          { kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "50" },
          { kind: "building_built", date: "2023-01-01", propertyTaxTypeBefore: "" },
        ],
      }),
    ]);
    await gotoHolding(page);
    const section = page.getByTestId("nbl-other-state-history");
    await section.scrollIntoViewIfNeeded();
    const sectionRight = await page.getByTestId("nbl-other-state-events").evaluate((el) => el.getBoundingClientRect().right);
    expect(sectionRight, "사건 입력 영역이 375px 안").toBeLessThanOrEqual(375.5);
    for (const t of ["nbl-other-state-event-0-kind-removed", "nbl-other-state-event-0-footprint", "nbl-other-state-event-1-kind-built"]) {
      const b = await page.getByTestId(t).boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 375 + 0.5, `${t} 칸이 화면 폭 안`).toBe(true);
    }
    await section.screenshot({ path: "e2e/_artifacts/e3-3a-input-375.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: "e2e/_artifacts/e3-3a-input-light.png" });
    await expectLightContrast(page, section);
    await expectDarkContrast(page, section);
    await section.screenshot({ path: "e2e/_artifacts/e3-3a-input-dark.png" });
    await page.emulateMedia({ media: "screen", colorScheme: "light" });

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const card = page.getByTestId("nbl-state-history-period");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-3a-card-light.png" });
    await expectLightContrast(page, card);
    await expectDarkContrast(page, card);
    await card.screenshot({ path: "e2e/_artifacts/e3-3a-card-dark.png" });
    await expectNoPageHScroll(page, 375);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-3a-card-375.png" });
  });
});
