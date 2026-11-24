/**
 * transfer-nbl-house-prior-demolished.spec.ts
 *
 * NBL-STATE-HISTORY-E3-③ B — 기타토지 «주택을 철거하고 나대지로 양도» — 철거 행 «철거된 건축물 종류(주택)» · 철거 직전 정착면적 · 조건부 수도권 — 입력 → 계산 → 결과
 * (UI 계획서 `nbl-state-history-e3-3-house-appurtenant.ui.plan.md` §11.2 EB1~EB10 · 엔진 케이스 표 `__tests__/tax-engine/_helpers/nbl-state-history-e3-3b-table.ts` B1~).
 * 선례: `transfer-nbl-house-state-history.spec.ts`(A) · `transfer-nbl-other-state-history-e3-1b.spec.ts`(sessionStorage 시드 + 화면에서 사건 입력).
 *
 * 공통 시료(엔진 표 B): 기타토지(잡종지) 1,000㎡ · 일반주거 · 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일) · 취득가 3억 · 양도가 10억 · 꼬리 나대지 + 종합합산 · 사건 «철거 2021-01-01»(소유 시작 때 건축물이 있었다).
 *  EB1  B1: 종류 «주택» + 정착 200㎡ + 수도권 «비수도권» → body에 `buildingKindBefore`·`houseFootprintBefore`·**수도권 값이 비워지지 않고** 도달 → 사업용(B) · 같은 거래의 종류 «그 밖»(구분 «모름»)은 비사업용(N) · 차액 −55,750,000
 *  EB2  B1b 경계: 정착 199.99(허용 999.95 → 초과 0.05㎡ — 그 구간 비사업용) / 200.00(이내) — 미리보기·세액이 절벽에서 갈린다
 *  EB3  B1c: 수도권 정착 333.34(허용 1,000.02 이내) / 333.33(초과 0.01㎡) · 수도권 → 비수도권으로 바꾸면 같은 정착면적이 5배 기준
 *  EB4  수도권 칸 조건부 노출: 녹지 · «그 밖» 철거 행 · 철거 행 없음 = 칸 없음 · 주·상·공 + 주택 철거 행 = 칸 노출 + 미선택이면 ⑧ H10 차단
 *  EB5  Q-12 우회 안내: 종류 «그 밖» + 철거 직전 재산세 구분 «별도합산» — hint 상수 · 차단하지 않는다(바이트 동일 B)
 *  EB6  H11: 주택 구간 안 `tax_type_changed` → ⑧ 차단 · 행 삭제 후 통과
 *  EB7  stale: 철거 행을 «주택» → «그 밖»으로 바꾸면 정착면적 미전송 · 모드 «바뀐 적 없음» + stale 주택 행은 수도권 칸·H10 없음
 *  EB8  9호 유예 + 초과 구간 → `HOUSE_EXCEEDED_GRACE` 고지(입력·결과) · 겸용주택 안내 문구
 *  EB9  축 B(50/50 지분 2장) × B: 첫 카드의 이력·정착면적·수도권이 companion body에도 실린다
 *  EB10 의제 사유 선택 + 주택 철거 행: 기존 의제 안내 · ⑧이 정착면적·수도권을 요구하지 않는다 · 이력 미적용
 *  EB11 후속 L1: 양도 2021-12-31(종전 영 §168의12 — 수도권이 배율을 가르지 않음) + 주·상·공 + 주택 철거 행 → 수도권 칸 없음 · ⑧ H10 없음 · 요청의 수도권은 비워 보낸다 · 양도 2022-01-01은 칸 노출(경계)
 *  EB12 후속 #1: 면적 일부만 비사업용(건물 배율 초과)이면 엔진이 철거 행 이력을 읽지 않는다 → 정착면적 «필수» 해제 · 수도권 칸 숨김 · PARTIAL 고지 · ⑧이 요구하지 않는다 · 엔진은 이력 미적용 · 같은 입력의 배율 이내 대조는 «필수»·칸 노출
 *  E12  시각: 라이트/다크 글자 대비 4.5 · 375px 입력 영역·결과 카드 가로 스크롤 없음
 *
 * 폼은 sessionStorage로 시드한다. 외부 API 의존 없음 — mock 불필요.
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-house-prior-demolished.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import {
  NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE,
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE,
  NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE,
} from "../lib/tax-engine/nbl-confirm-notices";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };

const BASE_FORM = { transferDate: "2024-01-01", filingDate: "2025-12-31", contractTotalPrice: "1000000000" };
/** 기타토지(잡종지) 정밀판정 ON — 엔진 표 B 공통 시료. 질문(모드)·수도권은 비워 둔다(화면에서 답한다). 꼬리 = 나대지 + 종합합산. */
const LAND = {
  assetKind: "land", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
  nblOtherHasBuilding: false, nblOtherPropertyTaxType: "comprehensive",
  nblOtherStateHistoryMode: "", nblOtherStateEvents: [],
};
const SWING = 55_750_000; // 엔진 표 `E3D_SWING_2014` — 같은 거래의 전량 비사업용 − 전량 사업용 세액
const HOUSE_ROW = (fp: string, over: Record<string, unknown> = {}) => ({ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: fp, ...over });

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

/** 철거 행 정착면적 카드의 «필수»(*) 표시. */
const requiredMark = (page: Page, i: number) => page.locator(`[data-field="nblOtherStateEvents.${i}.houseFootprintBefore"] label .text-destructive`);
const chooseMode = (page: Page, mode: "unchanged" | "changed" | "unknown") => pick(page.getByTestId(`nbl-other-state-mode-${mode}`));
const metroField = (page: Page) => page.locator('[data-field="nblIsMetropolitanArea"]');
/** 수도권 칸의 «수도권»·«비수도권»·«미확인» 라디오(라벨 텍스트 정확 일치). */
const chooseMetro = (page: Page, label: "수도권" | "비수도권") => pick(metroField(page).getByLabel(label, { exact: true }));

async function setEventDate(page: Page, i: number, iso: string) {
  const [y, m, d] = iso.split("-");
  const date = page.getByTestId(`nbl-other-state-event-${i}-date`);
  await date.getByLabel("연도").fill(y);
  await date.getByLabel("월").fill(m);
  await date.getByLabel("일").fill(d);
  await expect(date.getByLabel("연도")).toHaveValue(y);
  await expect(date.getByLabel("일")).toHaveValue(d);
}

/** 금액·면적 칸은 fill 후 Tab(blur)으로 확정한다(e2e/CLAUDE.md). */
async function setFootprint(page: Page, i: number, value: string) {
  const input = page.getByTestId(`nbl-other-state-event-${i}-footprint`);
  await input.fill(value);
  await input.press("Tab");
  await expect(input).toHaveValue(value);
}

type Kind = "built" | "removed" | "taxchange";
/** 사건 행을 더하고 종류·날짜를 입력한다. */
async function addEvent(page: Page, kind: Kind, date: string) {
  const rows = page.locator('[data-testid^="nbl-other-state-event-"][data-testid$="-date"]');
  const i = await rows.count();
  await page.getByTestId("nbl-other-state-event-add").click();
  await expect(rows).toHaveCount(i + 1);
  await pick(page.getByTestId(`nbl-other-state-event-${i}-kind-${kind}`));
  await setEventDate(page, i, date);
  return i;
}

/** 철거 행(2021-01-01)을 더하고 종류 «주택»을 고른 뒤 정착면적을 입력한다. */
async function addHouseRemoval(page: Page, footprint?: string, date = "2021-01-01") {
  const i = await addEvent(page, "removed", date);
  await pick(page.getByTestId(`nbl-other-state-event-${i}-building-kind-house`));
  if (footprint !== undefined) await setFootprint(page, i, footprint);
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
const houseInterval = (r: Resp) => ((nblOf(r)?.periodEvaluation?.stateHistory?.intervals ?? []) as Array<Record<string, any>>).find((iv) => iv.buildingKind === "house");

test.describe("기타토지 주택 철거 후 나대지 양도(E3-③ B) — 입력 → 계산 → 결과", () => {
  test("EB1 B1: 종류 «주택» + 정착 200㎡ + «비수도권» → body에 종류·정착면적·수도권 값이 닿고(비워지지 않는다) 사업용 · 같은 거래의 종류 «그 밖»(구분 «모름»)은 비사업용 · 차액 55,750,000", async ({ page }) => {
    test.setTimeout(240_000);
    // 현행 — 종류 «그 밖»(기본)·철거 직전 구분 «모름»: 주택을 모르는 입력 → 종합합산 + 확인 필요 → 비사업용
    await seed(page, [landAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i0 = await addEvent(page, "removed", "2021-01-01");
    await expect(page.getByTestId(`nbl-other-state-event-${i0}-building-kind-other`), "기본 표시 = «그 밖»(저장 키 없음 = 현행의 뜻)").toBeChecked();
    await expect(page.getByTestId(`nbl-other-state-event-${i0}-building-kind-house`)).not.toBeChecked();
    await expect(page.getByTestId(`nbl-other-state-event-${i0}-footprint`), "«그 밖»이면 정착면적 칸 없음").toHaveCount(0);
    await expect(metroField(page), "«그 밖»이면 수도권 칸 없음").toHaveCount(0);
    const legacy = await calc(page);
    expect(legacy.status, JSON.stringify(legacy.json).slice(0, 300)).toBe(200);
    expect(legacy.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" }]);
    expect(legacy.req.nonBusinessLandRaw?.nblIsMetropolitanArea, "기존 기타토지 입력은 수도권을 보내지 않는다(변화 0)").toBe("");
    await expect(banner.nonBusiness(page)).toBeVisible();
    const legacyTax = taxOf(legacy);
    console.log("[EB1 현행 «그 밖»·모름] 산출세액", legacyTax);

    // B1 — 종류 «주택» + 정착 200 + 수도권 밖
    await seed(page, [landAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addHouseRemoval(page);
    await expect(page.getByTestId(`nbl-other-state-event-${i}-building-kind-hint`)).toHaveText(NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE);
    await expect(page.getByTestId(`nbl-other-state-event-${i}-footprint`)).toBeVisible();
    await expect(page.getByText("철거 직전 그 토지의 재산세 구분"), "«주택»이면 재산세 구분 카드 숨김").toHaveCount(0);
    await expect(metroField(page), "주·상·공 + 주택 철거 행 → 수도권 칸").toHaveCount(1);
    await setFootprint(page, i, "200");
    await chooseMetro(page, "비수도권");
    const preview = page.getByTestId(`nbl-other-state-event-${i}-footprint-preview`);
    await expect(preview).toContainText("정착면적 200㎡");
    await expect(preview).toContainText("허용 면적 1,000㎡");
    await expect(preview).toContainText("배율 이내");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("있음(주택)");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("충족");
    await expect(page.getByTestId("nbl-state-history-daywise-notice")).toHaveText(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);
    await expect(page.getByTestId("nbl-state-history-house-before-notice")).toHaveText(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);

    const on = await calc(page);
    expect(on.status, JSON.stringify(on.json).slice(0, 300)).toBe(200);
    const raw = on.req.nonBusinessLandRaw;
    expect(raw?.nblOtherStateEvents, "④: 종류·정착면적 도달 · 주택 철거 행은 재산세 구분을 싣지 않는다(T-5)").toEqual([
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "200", buildingKindBefore: "house" },
    ]);
    expect(raw?.nblIsMetropolitanArea, "BP1 해소 — 수도권 값이 ④에서 비워지지 않는다").toBe("no");
    await expect(banner.business(page)).toBeVisible();
    const n = nblOf(on);
    expect(n?.periodEvaluation?.basis).toBe("state_history");
    expect(houseInterval(on)).toMatchObject({ buildingKind: "house", houseOutcome: "within" });
    expect(houseInterval(on)?.houseCheck).toMatchObject({ footprint: 200, multiplier: 5, allowedArea: 1000, landArea: 1000 });
    // ⑦ 결과 구간표: 기타토지 표 안의 주택 구간 행만 변형(제목·열은 기타토지 그대로)
    const card = page.getByTestId("nbl-state-history-period");
    await expect(card).toContainText("소유기간 중 건축물 유무·재산세 구분 이력 반영");
    const houseRowIdx = ((n?.periodEvaluation?.stateHistory?.intervals ?? []) as Array<Record<string, any>>).findIndex((iv) => iv.buildingKind === "house");
    await expect(intervalRow(page, houseRowIdx)).toContainText("있음(주택)");
    await expect(intervalRow(page, houseRowIdx)).toContainText("정착면적 200㎡");
    await expect(intervalRow(page, houseRowIdx)).toContainText("허용 면적 1,000㎡");
    await expect(intervalRow(page, houseRowIdx)).toContainText("배율 이내");
    await expect(page.getByText(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE).first()).toBeVisible();
    console.log("[EB1 B1 주택·정착 200] 산출세액", taxOf(on), "차액", taxOf(on) - legacyTax);
    expect(taxOf(on) - legacyTax, "과대 해소: 주택 철거를 «모름» 사슬로 읽은 N − 주택 이내 B").toBe(-SWING);
  });

  test("EB2 B1b 경계: 정착 199.99(허용 999.95 → 초과 0.05㎡) = 그 구간 비사업용(N) · 200.00(이내) = 사업용(B) — 0.05㎡ 절벽", async ({ page }) => {
    test.setTimeout(240_000);
    const taxes: Record<string, number> = {};
    for (const fp of ["199.99", "200.00"]) {
      await seed(page, [landAsset({ nblIsMetropolitanArea: "no" })]);
      await gotoHolding(page);
      await chooseMode(page, "changed");
      const i = await addHouseRemoval(page, fp);
      const preview = page.getByTestId(`nbl-other-state-event-${i}-footprint-preview`);
      if (fp === "199.99") {
        await expect(preview).toContainText("허용 면적 999.95㎡");
        await expect(preview).toContainText("초과 0.05㎡");
        await expect(page.getByTestId(`nbl-other-state-event-${i}-footprint-exceeded-notice`)).toHaveText(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
        await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("미충족");
      } else {
        await expect(preview).toContainText("배율 이내");
        await expect(page.getByTestId(`nbl-other-state-event-${i}-footprint-exceeded-notice`)).toHaveCount(0);
      }
      const r = await calc(page);
      expect(r.status, `${fp}: ${JSON.stringify(r.json).slice(0, 200)}`).toBe(200);
      expect(houseInterval(r)?.houseOutcome).toBe(fp === "199.99" ? "exceeded" : "within");
      if (fp === "199.99") await expect(page.getByText(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE).first()).toBeVisible();
      taxes[fp] = taxOf(r);
    }
    console.log("[EB2] 199.99 =", taxes["199.99"], "· 200.00 =", taxes["200.00"]);
    expect(taxes["199.99"] - taxes["200.00"], "초과 0.05㎡가 −55,750,000 ↔ 0을 가른다").toBe(SWING);
  });

  test("EB3 B1c: 수도권 정착 333.34(허용 1,000.02 이내) / 333.33(초과 0.01㎡) · «비수도권»으로 바꾸면 같은 정착면적이 5배 기준(허용 1,666.5)", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, [landAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addHouseRemoval(page, "333.34");
    await expect(metroField(page)).toHaveCount(1);
    await chooseMetro(page, "수도권");
    const preview = page.getByTestId(`nbl-other-state-event-${i}-footprint-preview`);
    await expect(preview).toContainText("허용 면적 1,000.02㎡");
    await expect(preview).toContainText("배율 이내");
    await setFootprint(page, i, "333.33");
    await expect(preview).toContainText("초과 0.01㎡");
    await chooseMetro(page, "비수도권");
    await expect(preview).toContainText("배율 이내"); // 333.33 × 5 = 1,666.65 ≥ 1,000
    await expect(preview).toContainText("허용 면적 1,666.65㎡");
    await chooseMetro(page, "수도권");
    await expect(preview).toContainText("초과 0.01㎡");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblIsMetropolitanArea).toBe("yes");
    expect(houseInterval(r)).toMatchObject({ houseOutcome: "exceeded" });
    expect(houseInterval(r)?.houseCheck).toMatchObject({ multiplier: 3, excessArea: 0.01 });
    await expect(banner.nonBusiness(page)).toBeVisible();
  });

  test("EB4 수도권 칸 조건부 노출: «그 밖» 철거 행·철거 행 없음·녹지 = 칸 없음 · 주·상·공 + 주택 철거 행 = 칸 노출 + 미선택이면 ⑧ H10 차단(점프 앵커 `nblIsMetropolitanArea`) · 답하면 통과", async ({ page }) => {
    test.setTimeout(240_000);
    // 녹지 — 수도권이 배율을 가르지 않는 용도지역
    await seed(page, [landAsset({ nblZoneType: "green" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addHouseRemoval(page, "200");
    await expect(metroField(page), "녹지: 칸 없음").toHaveCount(0);
    // 주·상·공 + «그 밖» 철거 행 / 철거 행 없음
    await seed(page, [landAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await expect(metroField(page), "철거 행 없음: 칸 없음").toHaveCount(0);
    const i = await addEvent(page, "removed", "2021-01-01");
    await expect(metroField(page), "«그 밖» 철거 행: 칸 없음").toHaveCount(0);
    await pick(page.getByTestId(`nbl-other-state-event-${i}-building-kind-house`));
    await expect(metroField(page), "«주택»으로 바꾸면 칸이 나타난다").toHaveCount(1);
    await setFootprint(page, i, "200");
    // 수도권 미선택 → ⑧ H10 차단
    expect(await calcBlocked(page), "수도권 미선택: 계산 요청이 나가지 않는다").toBe(true);
    await expect(errorText(page, /철거된 건축물을 「주택」으로 선택했습니다 — 철거 전 주택 구간의 배율은 수도권 여부에 따라 달라집니다/)).toBeVisible({ timeout: 15_000 });
    await gotoHolding(page);
    await chooseMetro(page, "비수도권");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblIsMetropolitanArea).toBe("no");
  });

  test("EB5 Q-12 우회 안내: 종류 «그 밖» + 철거 직전 재산세 구분 «별도합산» — hint 상수가 보이고 차단하지 않는다(종전 철거 행과 같은 결과 — 주택 echo·고지 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, [landAsset()]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addEvent(page, "removed", "2021-01-01");
    await expect(page.getByTestId(`nbl-other-state-event-${i}-building-kind-hint`)).toHaveText(NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE);
    await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-separate`));
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }]);
    expect(houseInterval(r), "주택 echo 없음").toBeUndefined();
    expect((nblOf(r)?.warnings as string[] | undefined) ?? []).not.toContain(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
    await expect(banner.business(page)).toBeVisible(); // 별도합산 위장 = 엔진 표 B8·B19 — 종전과 같은 사업용
    console.log("[EB5 «그 밖»+별도합산] 산출세액", taxOf(r));
  });

  test("EB6 H11: 주택 구간 안(철거 앞)의 «재산세 과세 구분 변경» → ⑧ 차단(구분이 바뀐 건축물 구간은 주택으로 입력 불가) · 변경 행 삭제 후 통과", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, [landAsset({ nblIsMetropolitanArea: "no" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "taxchange", "2017-01-01");
    await addHouseRemoval(page, "200");
    expect(await calcBlocked(page), "H11: 계산 요청이 나가지 않는다").toBe(true);
    await expect(errorText(page, /건축물 사건 2번째 행 — 철거된 건축물을 「주택」으로 선택했지만 그 건축물이 있던 동안 1번째 행에 「재산세 과세 구분 변경」 사건이 있습니다/)).toBeVisible({ timeout: 15_000 });
    await gotoHolding(page);
    await page.getByTestId("nbl-other-state-event-0-remove").click();
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toHaveLength(1);
  });

  test("EB7 stale: 철거 행을 «주택»→«그 밖»으로 바꾸면(정착면적 저장 잔존) body에 종류·정착면적이 없다 · 모드 «바뀐 적 없음» + stale 주택 행은 수도권 칸·⑧ H10이 없다", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, [landAsset({ nblIsMetropolitanArea: "no" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    const i = await addHouseRemoval(page, "200");
    await pick(page.getByTestId(`nbl-other-state-event-${i}-building-kind-other`));
    await expect(page.getByTestId(`nbl-other-state-event-${i}-footprint`), "«그 밖»이면 정착면적 칸이 숨는다").toHaveCount(0);
    await expect(metroField(page)).toHaveCount(0);
    await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-separate`));
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents, "stale 정착면적·종류 미전송").toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }]);

    // 모드 «바뀐 적 없음» + stale 주택 철거 행(정착면적 빈칸) + 수도권 미선택 → 화면에 없는 칸을 요구하지 않는다
    await seed(page, [landAsset({ nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [HOUSE_ROW("")] })]);
    await gotoHolding(page);
    await expect(metroField(page)).toHaveCount(0);
    const u = await calc(page);
    expect(u.status, JSON.stringify(u.json).slice(0, 300)).toBe(200);
    expect(u.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([]);
    expect(u.req.nonBusinessLandRaw?.nblIsMetropolitanArea).toBe("");
  });

  test("EB8 9호 유예 + 초과 구간 → `HOUSE_EXCEEDED_GRACE` 고지(입력·결과 모두) · 겸용주택 안내 문구가 종류 카드에 있다", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, [
      landAsset({
        nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed",
        nblOtherStateEvents: [HOUSE_ROW("100")],
        nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2021-01-01" }],
      }),
    ]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-state-event-0-building-kind-mixed-use")).toContainText("겸용주택");
    await expect(page.getByTestId("nbl-other-state-event-0-building-kind-mixed-use")).toContainText("「주택」으로 고르지 않습니다");
    await expect(page.getByTestId("nbl-other-state-event-0-footprint-preview")).toContainText("초과");
    await expect(page.getByTestId("nbl-state-history-house-exceeded-grace-notice")).toHaveText(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect((nblOf(r)?.warnings as string[] | undefined) ?? []).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
    expect(nblOf(r)?.gracePeriodDays).toBe(730);
    await expect(page.getByText(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE).first()).toBeVisible();
  });

  test("EB9 축 B(50/50 지분 2장) × B: 첫 카드의 이력·정착면적·수도권이 companion body에도 실리고 두 지분 모두 이력 판정(V-19: 지분 카드 토지 면적은 확인 필요 — 이 시료는 면적 1,000㎡ 그대로)", async ({ page }) => {
    test.setTimeout(180_000);
    const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };
    await seed(
      page,
      [
        landAsset({ ...HALF, nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [HOUSE_ROW("200")] }),
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
    expect(companion?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "200", buildingKindBefore: "house" }]);
    expect(companion?.nblIsMetropolitanArea, "수도권 값도 companion에 닿는다").toBe("no");
    const props = r.json.data.aggregated.properties as Array<{ nonBusinessLandJudgmentDetail?: { periodEvaluation?: { basis?: string } } }>;
    expect(props.map((p) => p.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis)).toEqual(["state_history", "state_history"]);
    console.log("[EB9] 총세액", taxOf(r));
  });

  test("EB10 UQ-12 (가) 의제: 양도일 의제 사유 선택 + 주택 철거 행 — 기존 의제 안내 · 구간 미리보기 없음 · ⑧이 정착면적·수도권을 요구하지 않는다 · 엔진도 이력을 읽지 않는다", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, [
      landAsset({
        nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-01-01",
        nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [HOUSE_ROW("")],
      }),
    ]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-state-history-deemed-notice")).toHaveText(NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE);
    await expect(page.getByTestId("nbl-state-history-preview")).toHaveCount(0);
    // 후속 L2 — ⑧이 건너뛰는 칸을 ⑤도 «필수»로 표시하지 않고(칸·값은 남는다) 수도권 칸도 열지 않는다
    await expect(page.getByTestId("nbl-other-state-event-0-footprint")).toBeVisible();
    await expect(requiredMark(page, 0), "의제: 정착면적 «필수» 표시 없음").toHaveCount(0);
    await expect(metroField(page), "의제: 수도권 칸 없음").toHaveCount(0);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(nblOf(r)?.periodEvaluation?.basis).not.toBe("state_history");
    expect((nblOf(r)?.warnings as string[] | undefined) ?? []).toContain(NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE);
    await expect(page.getByText(NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE).first()).toBeVisible();
  });

  test("EB11 후속 L1: 양도 2021-12-31(종전 규정 — 도시지역 일률 5배) + 주·상·공 + 주택 철거 행 → 수도권 칸 없음 · ⑧ H10 없음 · 요청 수도권 비움 · 양도 2022-01-01(경계)은 칸 노출 + H10 차단", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, [landAsset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [HOUSE_ROW("200")] })]);
    await page.evaluate(() => {
      const raw = JSON.parse(sessionStorage.getItem("transfer-tax-wizard")!);
      raw.state.formData.transferDate = "2021-12-31";
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(raw));
    });
    await page.reload();
    await waitHydrated(page);
    await gotoHolding(page);
    await expect(metroField(page), "종전 규정 양도: 수도권 칸 없음").toHaveCount(0);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblIsMetropolitanArea ?? "", "종전 규정: 수도권 값을 보내지 않는다").toBe("");
    expect(nblOf(r)?.periodEvaluation?.basis).toBe("state_history");
    expect(houseInterval(r)?.houseCheck).toMatchObject({ multiplier: 5 });
    // 경계 — 2022-01-01은 현행 표(수도권 3배 / 밖 5배)라 칸이 열리고 미선택이면 ⑧ H10이 막는다
    await page.evaluate(() => {
      const raw = JSON.parse(sessionStorage.getItem("transfer-tax-wizard")!);
      raw.state.formData.transferDate = "2022-01-01";
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(raw));
    });
    await page.reload();
    await waitHydrated(page);
    await gotoHolding(page);
    await expect(metroField(page), "2022-01-01: 수도권 칸 노출").toHaveCount(1);
    expect(await calcBlocked(page), "수도권 미선택: 계산 요청이 나가지 않는다").toBe(true);
  });

  test("EB12 후속 #1: 건물 배율 초과(면적 일부만 비사업용) — 엔진이 철거 행 이력을 읽지 않는다 → 정착면적 «필수» 해제 · 수도권 칸 숨김 · PARTIAL 고지 · ⑧ 통과 · 이력 미적용 · 같은 입력의 배율 이내 대조는 «필수»·칸 노출", async ({ page }) => {
    test.setTimeout(240_000);
    const BUILT_TAIL = { kind: "building_built", date: "2022-06-01", propertyTaxTypeBefore: "" };
    const partial = (floor: string) => landAsset({
      nblOtherHasBuilding: true, nblOtherPropertyTaxType: "separate", nblOtherBuildingFloorArea: floor, nblOtherBuildingValue: "100000000", nblOtherLandValue: "200000000",
      nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [HOUSE_ROW("", { date: "2016-01-01" }), BUILT_TAIL],
    });
    // 일반주거 4배: 바닥 100㎡ → 허용 400㎡ < 1,000㎡(부분 면적) · 바닥 400㎡ → 허용 1,600㎡(전량 사업용 — 엔진이 이력을 읽는다)
    await seed(page, [partial("100")]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-state-event-0-footprint")).toBeVisible();
    await expect(requiredMark(page, 0), "부분 면적: 정착면적 «필수» 표시 없음").toHaveCount(0);
    await expect(metroField(page), "부분 면적: 수도권 칸 없음").toHaveCount(0);
    await expect(page.getByTestId("nbl-other-partial-area-notice")).toHaveText(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(nblOf(r)?.periodEvaluation?.basis, "엔진은 이력을 읽지 않는다").toBe("state_at_transfer");
    expect((nblOf(r)?.warnings as string[] | undefined) ?? []).toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    // 대조 — 배율 이내면 같은 칸이 «필수»이고 수도권 칸이 열리며 빈 정착면적은 ⑧이 막는다
    await seed(page, [partial("400")]);
    await gotoHolding(page);
    await expect(requiredMark(page, 0), "배율 이내: 정착면적 «필수»").toHaveCount(1);
    await expect(metroField(page), "배율 이내: 수도권 칸 노출").toHaveCount(1);
    await expect(page.getByTestId("nbl-other-partial-area-notice")).toHaveCount(0);
    expect(await calcBlocked(page), "정착면적 빈칸: 계산 요청이 나가지 않는다").toBe(true);
  });
});

test.describe("기타토지 주택 철거 이력(E3-③ B) — 시각(라이트·다크·375px)", () => {
  test("E12 입력 영역·결과 카드: 라이트/다크 글자 대비 4.5 이상 · 375px 종류·정착면적·수도권 영역이 화면 안 · 결과 카드 페이지 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 900 });
    await seed(page, [landAsset({ nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [HOUSE_ROW("150")] })]);
    await gotoHolding(page);
    const section = page.getByTestId("nbl-other-state-history");
    await section.scrollIntoViewIfNeeded();
    const sectionRight = await page.getByTestId("nbl-other-state-events").evaluate((el) => el.getBoundingClientRect().right);
    expect(sectionRight, "사건 입력 영역이 375px 안").toBeLessThanOrEqual(375.5);
    for (const t of ["nbl-other-state-event-0-building-kind-house", "nbl-other-state-event-0-building-kind-other", "nbl-other-state-event-0-footprint"]) {
      const b = await page.getByTestId(t).boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 375 + 0.5, `${t} 칸이 화면 폭 안`).toBe(true);
    }
    const metroBox = await page.getByTestId("nbl-house-prior-metro").boundingBox();
    expect(metroBox && metroBox.x >= 0 && metroBox.x + metroBox.width <= 375 + 0.5, "수도권 칸 영역이 화면 폭 안").toBe(true);
    await section.screenshot({ path: "e2e/_artifacts/e3-3b-input-375.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: "e2e/_artifacts/e3-3b-input-light.png" });
    await expectLightContrast(page, section);
    await expectDarkContrast(page, section);
    await section.screenshot({ path: "e2e/_artifacts/e3-3b-input-dark.png" });
    await page.emulateMedia({ media: "screen", colorScheme: "light" });

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const card = page.getByTestId("nbl-state-history-period");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-3b-card-light.png" });
    await expectLightContrast(page, card);
    await expectDarkContrast(page, card);
    await card.screenshot({ path: "e2e/_artifacts/e3-3b-card-dark.png" });
    await expectNoPageHScroll(page, 375);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-3b-card-375.png" });
  });
});
