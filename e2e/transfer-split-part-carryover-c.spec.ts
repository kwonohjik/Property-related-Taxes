/**
 * E2E — 주택 split 파트 이월과세(소득세법 §97의2) P2 C: 통째 이월과세 + 증여자가 토지·건물을 다른 날 취득.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §3 · 계획서 §11
 *
 * ## 이 spec이 vitest와 다른 것
 * 폼에서 새 키(`carryoverGiftEvent`·`landCarryoverPart`·`buildingCarryoverPart`)가 **실제로 body에 실리는지**는 브라우저에서만 보인다 —
 * vitest는 payload를 손으로 만들어 route를 부르므로 «폼에서 키가 안 만들어지는» 결함을 통과시킨다(`general-building-carryover.spec.ts` 교훈).
 *
 * 시드 수치는 엔진 anchor(`transfer.route.split-part-carryover.p1.test.ts` C_NEW)와 같다 — 토지 증여자 1995-03-01 5천만 · 건물 2015-06-01 5천만 ·
 * 증여세 산출 3천만 / 과세가액 9억(토지 2.4억 + 건물 6.6억) · 양도 12억 · 양도일 2025-06-30 → 결정세액 300,018,000(토지 ②3호 배제 · 건물 적용).
 *
 * 실행(워크트리): E2E_PORT=3273 npx playwright test e2e/transfer-split-part-carryover-c.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { formRow, num, stmtRow, stmtText, stmtValue, won } from "./_helpers/split-acq-display";
import { giftHandoffAsset } from "../lib/calc/gift-household-handoff";
import { landStandalone, multiForm } from "./_helpers/split-acq-display";
import { openHistoryModal } from "./_helpers/navigation";
import { putCalculationRecord } from "./_helpers/history-seed";

type Over = Record<string, unknown>;

export const cAsset = (over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "carryover_gift",
  carryoverDonorSplit: true,
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2023-03-01",
    donorAcquisitionDate: "2015-06-01",
    donorAcquisitionPrice: "50000000",
    giftTaxCalculated: "30000000",
    giftTaxBase: "900000000",
    donorRelation: "lineal",
    donorSameHousehold: "no", // P5 — 통째 증여(C)는 세대 사실이 필수 질문이다
  },
  landCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: "50000000" },
  landAcquisitionPrice: "240000000",
  buildingAcquisitionPrice: "660000000",
  actualSalePrice: "1200000000",
  saleSplitMode: "actual",
  landTransferPrice: "700000000",
  buildingTransferPrice: "500000000",
  landStandardPriceAtTransfer: "700000000",
  buildingStandardPriceAtTransfer: "500000000",
  ...over,
});

export const cSeed = (assets: Over[] = [cAsset()], formOver: Over = {}) => ({
  state: {
    formData: {
      assets,
      transferDate: "2025-06-30",
      filingDate: "2025-08-31",
      contractTotalPrice: "1200000000",
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

async function seedWizard(page: Page, seed: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

/** 가산세 단계까지 가서 계산한다 — 요청 body와 결과 화면(신고서) 렌더까지 기다린다. */
async function calculate(page: Page): Promise<Record<string, unknown>> {
  const sidebarStep = page.getByRole("button", { name: "가산세", exact: true }).first();
  if (await sidebarStep.isVisible()) {
    await sidebarStep.click();
  } else {
    // 모바일 폭 — 사이드바가 없다. 「다음」으로 마지막 단계까지 간다.
    for (let i = 0; i < 4 && !(await page.getByRole("button", { name: "세금 계산하기" }).isVisible()); i++) {
      await page.getByRole("button", { name: "다음", exact: true }).click();
    }
  }
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON();
  await page.locator('[data-print-id="form-table"]').first().waitFor({ timeout: 60_000 });
  return body;
}

async function fillDate(scope: Locator, ymd: string) {
  const [y, m, d] = ymd.split("-");
  await scope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
  await scope.locator('input[type="text"][aria-label="월"]').first().fill(m);
  await scope.locator('input[type="text"][aria-label="일"]').first().fill(d);
}

test.describe("P2 C — 통째 이월과세 + 증여자 토지·건물 취득일 상이", () => {
  test("시드 → 카드 구성 → 계산 → 요청 body의 새 키 → 결과 4뷰", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, cSeed());
    await expandAssetSection(page, 3);

    // ⑤ 토글은 증여 등기접수일 직하·증여자 취득일(파트 카드) 앞에 있다. ON이면 토지·건물 파트 카드 2장, 자산 전체 1벌 입력(증여 당시 평가액·환산 토글)은 없다.
    const toggle = page.getByTestId("carryover-donor-split-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("data-checked", "true");
    await expect(page.getByTestId("split-carryover-land-card")).toBeVisible();
    await expect(page.getByTestId("split-carryover-building-card")).toBeVisible();
    await expect(page.getByText("환산취득가 사용")).toHaveCount(0);
    await expect(page.getByText("증여 당시 평가액")).toHaveCount(0);
    // 앵커는 각 1개 — ⑧ 이동 불능 0
    for (const key of [
      "carryover.giftRegistryDate", "landCarryover.donorAcquisitionDate", "landCarryover.donorAcquisitionPrice", "landAcquisitionPrice",
      "carryover.donorAcquisitionDate", "carryover.donorAcquisitionPrice", "buildingAcquisitionPrice", "carryover.giftTaxBase", "carryover.giftTaxCalculated",
      "carryoverDonorSplit",
    ]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
    // P5 — 1세대1주택 차단 안내(N4)·세대 사실 미반영 고지(N5)는 없고 세대 사실 질문을 묻는다(⑤⑧④ 같은 술어) + 취득 가정 문구 부재
    await expect(page.getByTestId("split-carryover-onehouse-notice")).toHaveCount(0);
    await expect(page.getByTestId("split-carryover-household-note")).toHaveCount(0);
    await expect(page.locator('[data-field="carryover.donorSameHousehold"]')).toHaveCount(1);
    await expect(page.getByText("취득 당시 개별주택가격 미공시")).toHaveCount(0);

    const body = await calculate(page);
    expect(body.carryoverGiftEvent).toMatchObject({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000, donorRelation: "lineal" });
    expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: 50_000_000 });
    expect(body.buildingCarryoverPart).toEqual({ donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 50_000_000 });
    expect(body.landAcquisitionCause).toBe("carryover_gift");
    expect(body.landAcquisitionDate).toBe("2023-03-01");
    expect(body.acquisitionDate).toBe("2023-03-01");
    expect(body.isSeparateAcquisition).toBe(false);
    // 쓰지 않는 키 부재
    for (const k of ["carryoverTaxation", "landDecedentAcquisitionDate", "landSec164Value", "preHousingDisclosure"]) expect(k in body, k).toBe(false);

    // ⑦ 카드 — 파트별 판정·기산일·비교·확인 필요
    const card = page.getByTestId("split-carryover-card").first();
    await expect(card).toBeVisible();
    await expect(page.getByTestId("split-carryover-land").first()).toHaveAttribute("data-judgment", "excluded");
    await expect(page.getByTestId("split-carryover-building").first()).toHaveAttribute("data-judgment", "applied");
    await expect(page.getByTestId("split-card-lthd-start-building").first()).toContainText("2015-06-01");
    await expect(page.getByTestId("split-card-lthd-start-land").first()).toContainText("2023-03-01");
    // 세율 기산일은 장기보유특별공제 기산일과 별도 행 — 엔진이 파트별로 세율을 판정했을 때만
    await expect(page.getByTestId("split-card-rate-basis-building").first()).toContainText("2015-06-01");
    await expect(page.getByTestId("split-card-rate-basis-land").first()).toContainText("2023-03-01");
    await expect(page.getByTestId("split-carryover-land-comparison").first()).toContainText("295,566,000");
    await expect(page.getByTestId("split-carryover-land-comparison").first()).toContainText("300,018,000");
    await expect(page.getByTestId("split-carryover-notice-0").first()).toContainText("확인 필요");

    // ⑦ 신고서 — 합계 = 토지(증여 신고가액 2.4억) + 건물(증여자 취득가액 5천만), 필요경비 = 건물 증여세 상당액 2천2백만, 항등식
    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    const gainRow = await formRow(page, "전체 양도차익");
    expect([num(acqRow[1]), num(acqRow[2]), num(acqRow[3])]).toEqual([290_000_000, 240_000_000, 50_000_000]);
    expect([num(expRow[1]), num(expRow[2]), num(expRow[3])]).toEqual([22_000_000, 0, 22_000_000]);
    expect(1_200_000_000 - num(acqRow[1]) - num(expRow[1])).toBe(num(gainRow[1]));
    // 취득일자 칸: 합계 = 증여 등기접수일, 건물 열 = 증여자 취득일(적용 파트), 토지 열 = 증여 등기접수일(미적용)
    const acqDate = await formRow(page, "취득일자");
    expect(acqDate.slice(1, 4).map((x) => x.split("\n")[0])).toEqual(["2023-03-01", "2023-03-01", "2015-06-01"]);
    const formTable = page.locator('[data-print-id="form-table"]').first();
    await expect(formTable).toContainText("건물 증여자 취득가액 50,000,000");
    await expect(formTable).toContainText("증여세 산출세액 30,000,000 × (건물 증여 신고가액 660,000,000) ÷ (증여세 과세가액 900,000,000) = 22,000,000");

    // ⑦ 상세명세서 — 값 = 신고서 합계 · 파트 태그 · 증여세 상당액 산식
    expect(await stmtValue(page, "취득가액")).toBe(290_000_000);
    expect(await stmtValue(page, "필요경비")).toBe(22_000_000);
    const stmtAcq = await stmtText(page, "취득가액");
    expect(stmtAcq).toContain(`토지(증여 신고가액) ${won(240_000_000)} + 건물(이월과세 — 증여자 취득가액) ${won(50_000_000)}`);
    expect(stmtAcq).toContain("신고 전체 결정세액 적용 295,566,000 / 미적용 300,018,000");
    // 상세명세서는 renderFormula가 괄호 피연산자를 분수(분자·분모 칸)로 그린다 — 텍스트는 분자 뒤에 분모가 이어 붙는다
    await expect(stmtRow(page, "필요경비")).toContainText("증여세 산출세액 30,000,000 × 건물 증여 신고가액 660,000,000증여세 과세가액 900,000,000 = 22,000,000");
    // 일자 그룹은 렌더하지 않는다 — 파트별 기산일은 세율이 있는 산출세액 행의 ※에 밝힌다
    await expect(stmtRow(page, "산출세액")).toContainText("이월과세(§97의2①) 장기보유특별공제 기산일: 토지 증여 등기접수일 2023-03-01 (이월과세 미적용) / 건물 증여자 취득일 2015-06-01");
  });

  test("P6 환산: 토지·건물 카드 각자 토글 ON → 증여자 취득 당시 기준시가 입력 → 계산 → body 환산 키 → 결과 환산 산식(파트별)", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(
      page,
      cSeed([
        cAsset({
          carryover: { ...(cAsset().carryover as Over), donorAcquisitionPrice: "" },
          landCarryover: { ...(cAsset().landCarryover as Over), donorAcquisitionPrice: "" },
        }),
      ]),
    );
    await expandAssetSection(page, 3);
    for (const k of ["landCarryover.partEstimated", "carryover.partEstimated"]) await expect(page.locator(`[data-field="${k}"]`), k).toHaveCount(1);
    await page.getByTestId("split-carryover-land-estimated").getByRole("switch").click();
    await page.getByTestId("split-carryover-building-estimated").getByRole("switch").click();
    for (const k of ["landCarryover.donorStandardPriceAtAcquisition", "carryover.donorStandardPriceAtAcquisition"]) await expect(page.locator(`[data-field="${k}"]`), k).toHaveCount(1);
    for (const k of ["landCarryover.donorAcquisitionPrice", "carryover.donorAcquisitionPrice"]) await expect(page.locator(`[data-field="${k}"]`), k).toHaveCount(0);
    await expect(page.getByText("아직 지원하지 않")).toHaveCount(0);
    await page.getByTestId("split-carryover-land-donor-std-price").fill("30000000");
    await page.getByTestId("split-carryover-building-donor-std-price").fill("40000000");
    const body = await calculate(page);
    expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "1995-03-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 30_000_000 });
    expect(body.buildingCarryoverPart).toEqual({ donorAcquisitionDate: "2015-06-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 40_000_000 });
    // 결과 — 파트별 환산 산식(토지·건물 각자 분자 ÷ 분모) + 건물 §114조의2 확인 필요
    const land = page.getByTestId("split-carryover-land-estimated").first();
    await expect(land).toContainText("토지 양도가액 700,000,000");
    await expect(land).toContainText("증여자 취득 당시 기준시가 30,000,000");
    const bldg = page.getByTestId("split-carryover-building-estimated").first();
    await expect(bldg).toContainText("건물 양도가액 500,000,000");
    await expect(bldg).toContainText("증여자 취득 당시 기준시가 40,000,000");
    await expect(page.getByTestId("split-carryover-card").first()).toContainText("소득세법 §114조의2");
    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    expect([num(acqRow[1]), num(acqRow[2]), num(acqRow[3])]).toEqual([70_000_000, 30_000_000, 40_000_000]);
    expect([num(expRow[1]), num(expRow[2]), num(expRow[3])]).toEqual([32_100_000, 8_900_000, 23_200_000]);
  });

  test("UI 입력: 자산 전체 이월과세 → 토글 ON → 파트 카드 입력 → 계산 — 같은 결과(300,018,000), 토글 OFF 시 파트 키 소멸", async ({ page }) => {
    test.setTimeout(180_000);
    // 토글 OFF 상태의 종전 화면(자산 전체 1벌 입력) — 파트 입력은 비어 있다. 양도 정보(축 A)는 시드로 둔다(토글 ON 때 노출).
    await seedWizard(
      page,
      cSeed([
        cAsset({
          carryoverDonorSplit: false,
          carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-03-01", donorRelation: "lineal" },
          landCarryover: { ...CARRYOVER_DEFAULTS },
          landAcquisitionPrice: "",
          buildingAcquisitionPrice: "",
        }),
      ]),
    );
    await expandAssetSection(page, 3);
    const toggle = page.getByTestId("carryover-donor-split-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toHaveAttribute("data-checked", "true");
    // OFF: 종전 화면(증여자 취득일 1칸 · 환산 토글 · 증여 당시 평가액) — 파트 카드는 없다
    await expect(page.getByText("환산취득가 사용")).toBeVisible();
    await expect(page.getByTestId("split-carryover-land-card")).toHaveCount(0);
    await expect(page.locator('[data-field="carryover.donorAcquisitionDate"]')).toHaveCount(1);

    // 켠다 — 토글은 등기접수일 직하·증여자 취득일 앞이다(DOM 순서)
    await toggle.getByRole("switch").click();
    await expect(page.getByTestId("split-carryover-land-card")).toBeVisible();
    await expect(page.getByText("환산취득가 사용")).toHaveCount(0);
    const order = await page.evaluate(() => {
      const idx = (sel: string) => {
        const all = Array.from(document.querySelectorAll("[data-field], [data-testid]"));
        return all.findIndex((el) => el.matches(sel));
      };
      return [idx('[data-field="carryover.giftRegistryDate"]'), idx('[data-testid="carryover-donor-split-toggle"]'), idx('[data-testid="split-carryover-land-card"]')];
    });
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    await expect(page.getByTestId("split-carryover-building-inherited-note")).toContainText("건물 기준");

    // 입력 — 위에서 아래로: 토지 → 건물 → 증여세
    await fillDate(page.getByTestId("split-carryover-land-donor-date"), "1995-03-01");
    await page.getByTestId("split-carryover-land-donor-price").fill("50000000");
    await page.getByTestId("split-carryover-land-gift-valuation").fill("240000000");
    await fillDate(page.getByTestId("split-carryover-building-donor-date"), "2015-06-01");
    await page.getByTestId("split-carryover-building-donor-price").fill("50000000");
    await page.getByTestId("split-carryover-building-gift-valuation").fill("660000000");
    await page.getByTestId("split-carryover-gift-tax-calculated").fill("30000000");
    await page.getByTestId("split-carryover-gift-tax-base").fill("900000000");
    // P5 — ON도 «증여자와 계속 같은 세대» 질문을 묻고 필수다(건물이 증여받은 주택)
    await page.getByRole("radio", { name: /아니오 — 세대가 달랐거나/ }).click();

    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    const body = await calculate(page);
    expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: 50_000_000 });
    expect(body.buildingCarryoverPart).toEqual({ donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 50_000_000 });
    expect(body.landAcquisitionPrice).toBe(240_000_000);
    expect(body.buildingAcquisitionPrice).toBe(660_000_000);
    const json = await (await respP).json();
    expect(json.data.result.determinedTax).toBe(300_018_000);

    // 입력으로 돌아가 토글을 끈다 → 다시 계산하면 새 키 3종이 사라지고(자산 전체 이월과세), 값은 보존돼 다시 켜면 복원된다
    await page.getByRole("button", { name: "자산 목록" }).first().click();
    await expandAssetSection(page, 3);
    await page.getByTestId("carryover-donor-split-toggle").getByRole("switch").click();
    await expect(page.getByTestId("split-carryover-land-card")).toHaveCount(0);
    // OFF 화면(자산 전체 1벌)의 필수 칸(증여 당시 평가액)을 채워 계산 — 새 키 3종은 없고 최상위 carryoverTaxation이 대신 간다(종전 경로 그대로)
    await page.locator('[data-field="carryover.giftDateValuation"] input').fill("900000000");
    // OFF에서도 «증여자와 계속 같은 세대» 질문은 같은 칸이다(ON에서 답한 값이 그대로 남는다)
    await expect(page.getByRole("radio", { name: /아니오 — 세대가 달랐거나/ })).toBeChecked();
    const offBody = await calculate(page);
    for (const k of ["carryoverGiftEvent", "landCarryoverPart", "buildingCarryoverPart", "landAcquisitionCause"]) expect(k in offBody && offBody[k] !== undefined, k).toBe(false);
    expect(offBody.carryoverTaxation).toBeTruthy();
    // 다시 켜면 값이 복원된다(읽는 쪽 파생 — 지우지 않는다)
    await page.getByRole("button", { name: "자산 목록" }).first().click();
    await expandAssetSection(page, 3);
    await page.getByTestId("carryover-donor-split-toggle").getByRole("switch").click();
    await expect(page.getByTestId("split-carryover-land-donor-price")).toHaveValue("50,000,000");
  });

  test("입력을 고친 뒤 다시 계산하면 옛 결과가 아니라 새 세액이다 (결과 무효화)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, cSeed());
    const first = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    await calculate(page);
    const before = (await (await first).json()).data.result.determinedTax as number;
    expect(before).toBe(300_018_000);
    // 건물 증여자 취득가액을 바꾼다 → 토지·건물 각각 비교가 달라져 세액이 달라진다
    await page.getByRole("button", { name: "자산 목록" }).first().click();
    await expandAssetSection(page, 3);
    const price = page.getByTestId("split-carryover-building-donor-price");
    await price.fill(""); // CurrencyInput은 기존 값 위에 fill하면 이어 붙는다 — 먼저 비운다
    await price.fill("700000000");
    await price.blur();
    await expect(price).toHaveValue("700,000,000");
    const second = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    const body = await calculate(page);
    expect((body.buildingCarryoverPart as { donorAcquisitionPrice: number }).donorAcquisitionPrice).toBe(700_000_000);
    const after = (await (await second).json()).data.result.determinedTax as number;
    expect(after).not.toBe(before);
  });

  test("컴패니언: 첫 자산의 N8 안내 + ⑧ 차단(앵커 = 토글), 둘째 이후 자산엔 토글 대신 N6 · 둘째를 지우면 통과", async ({ page }) => {
    test.setTimeout(180_000);
    const second = cAsset({
      ...makeDefaultAsset(2),
      addressJibun: "서울 강남구 테스트동 2-2",
      assetKind: "housing",
      acquisitionCause: "carryover_gift",
      carryoverDonorSplit: true, // 잔재 — 둘째 자산엔 토글이 없고 읽는 쪽이 «없음»으로 읽는다
      actualSalePrice: "100000000",
    });
    await seedWizard(page, cSeed([cAsset({ actualSalePrice: "1100000000" }), second], { contractTotalPrice: "1200000000", bundledSaleMode: "actual" }));
    await expandAssetSection(page, 3, 0);
    await expandAssetSection(page, 3, 1);
    // 첫 자산: C가 켜진 채 함께 양도 자산이 있다 → N8
    await expect(page.locator('[data-asset-card-index="0"]').getByTestId("split-carryover-companion-exists-note")).toContainText("함께 양도하는 다른 자산이 있으면");
    // 둘째 자산: 토글 없음 + N6, 파트 카드도 없다(잔재 토글이 켜져 있어도 «없음»)
    const card2 = page.locator('[data-asset-card-index="1"]');
    await expect(card2.getByTestId("carryover-donor-split-toggle")).toHaveCount(0);
    await expect(card2.getByTestId("split-carryover-companion-note")).toContainText("두 번째 이후 자산에는 토지·건물 파트 이월과세를 쓸 수 없습니다");
    await expect(card2.getByTestId("split-carryover-land-card")).toHaveCount(0);

    // ⑧ — 「다음」이 막고 첫 자산의 토글로 이동한다
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toContainText("함께 양도(일괄양도)하는 자산이 있으면 첫 자산의 토지·건물 파트 이월과세를 지원하지 않습니다");
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="carryoverDonorSplit"]')))
      .toBe(true);

    // 둘째 자산을 지우면 — N8이 사라지고 ⑧이 통과해 계산된다(요청에 새 키가 실린다)
    await card2.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByTestId("split-carryover-companion-exists-note")).toHaveCount(0);
    const body = await calculate(page);
    expect(body.carryoverGiftEvent).toBeTruthy();
    expect("companionAssets" in body && Array.isArray(body.companionAssets) && (body.companionAssets as unknown[]).length > 0).toBe(false);
  });

  test("1세대1주택 겹침(P5): 보유 상황 단계에서 막지 않고 계산한다 — §97의2②2호는 엔진이 판정 · body에 세대 사실", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, cSeed([cAsset()], { isOneHousehold: true, householdHousingCount: "1" }));
    await page.getByRole("button", { name: "보유 상황", exact: true }).first().click();
    await expect(page.getByTestId("validation-issues")).toHaveCount(0);
    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    const body = await calculate(page);
    expect(body.isOneHousehold).toBe(true);
    expect(body.carryoverGiftEvent).toMatchObject({ donorSameHouseholdContinuous: false });
    const json = await (await respP).json();
    expect(json.data?.result, JSON.stringify(json.error ?? {})).toBeTruthy();
    // 이월과세 없이도(증여 2년 3개월) 이미 비과세라 ②2호는 발동하지 않는다(사전-2016-법령해석재산-0374)
    expect(json.data.result.splitDetail.carryoverEvent.oneHouseExclusion).toBeUndefined();
  });

  test("판정 메뉴 handoff 상태(증여 주택이 이월과세로 넘어옴 · 1세대 해당): C를 켜도 세대 질문·답이 그대로 남고 계산된다(P5)", async ({ page }) => {
    test.setTimeout(180_000);
    // 판정 메뉴가 넘기는 자산 모양을 **실제 handoff 함수**로 만든다(`giftHandoffAsset`) — 일반 증여 주택 → 이월과세(증여) + 증여자 사실
    const giftAsset = {
      ...makeDefaultAsset(1),
      ...DIRECT_RESIDENCE,
      addressJibun: "서울 강남구 테스트동 1-1",
      regionCode: "1168010100",
      assetKind: "housing",
      acquisitionCause: "gift",
      acquisitionDate: "2023-03-01",
      donorAcquisitionDate: "2015-06-01",
      giftDonorRelation: "lineal",
      giftSameHousehold: "yes",
      giftHouseholdHoldingStartDate: "2016-01-01",
      actualSalePrice: "1200000000",
    } as unknown as Parameters<typeof giftHandoffAsset>[0];
    const handed = giftHandoffAsset(giftAsset, "2025-06-30") as unknown as Over;
    expect(handed.acquisitionCause).toBe("carryover_gift"); // handoff가 이월과세로 바꿨다(이 전제가 깨지면 이 테스트가 말하는 상태가 아니다)
    await seedWizard(page, cSeed([handed], { isOneHousehold: true, householdHousingCount: "1" }));
    await expandAssetSection(page, 3);
    // 넘어온 상태 = C OFF 화면: 세대 사실이 이미 답해져 있고(handoff가 채움) 토글은 꺼져 있다
    await expect(page.getByTestId("carryover-donor-split-toggle")).not.toHaveAttribute("data-checked", "true");
    await expect(page.getByText("증여자와 같은 세대 여부")).toBeVisible();
    await page.getByTestId("carryover-donor-split-toggle").getByRole("switch").click();
    // ON: 세대 질문·답이 그대로 · 차단 안내(N4) 없음
    await expect(page.getByText("증여자와 같은 세대 여부")).toBeVisible();
    await expect(page.getByTestId("split-carryover-onehouse-notice")).toHaveCount(0);
    await expect(page.locator('[data-field="carryover.donorHouseholdHoldingStartDate"]')).toHaveCount(1);
  });

  test("다건 합산: C를 켠 자산은 ⑧이 막는다(요청 자체가 나가지 않는다) — 이월과세 호스트는 다건 미지원", async ({ page }) => {
    test.setTimeout(180_000);
    const props = [
      { propertyId: "np1", propertyLabel: "건1", completionPercent: 100, form: multiForm(cAsset(), { transferDate: "2026-06-30", contractTotalPrice: "1200000000" }) },
      { propertyId: "np2", propertyLabel: "건2", completionPercent: 100, form: multiForm(landStandalone(1, { actualSalePrice: "300000000" }), { transferDate: "2026-08-01", contractTotalPrice: "300000000" }) },
    ];
    await page.goto("/history");
    await putCalculationRecord(page, {
      id: "e2e-spco-c-multi",
      userId: "local-user",
      taxType: "transfer",
      title: "파트 이월과세 C 다건 (E2E)",
      inputData: { __multiTransfer: true, taxYear: 2026, properties: props, activePropertyIndex: 0, activeStep: "settings", annualBasicDeductionUsed: "0", basicDeductionAllocation: "MAX_BENEFIT" },
      resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "np1" }, { propertyId: "np2" }] },
      taxLawVersion: "2026",
      linkedCalculationId: null,
      clientId: null,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    });
    await page.goto("/calc/transfer-tax/multi");
    await openHistoryModal(page, page.getByTestId("multi-load-history-btn").first(), page.getByText("파트 이월과세 C 다건 (E2E)"));
    await page.getByTestId("load-record-e2e-spco-c-multi").click();
    let multiPosts = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/calc/transfer/multi") && r.method() === "POST") multiPosts++;
    });
    await page.getByRole("button", { name: "세액 계산" }).click();
    await expect(page.getByText("배우자등 이월과세(§97의2)는 단건 계산기에서만 지원됩니다.").first()).toBeVisible({ timeout: 30_000 });
    expect(multiPosts).toBe(0);
  });

  test("이력 복원: 저장된 C 입력을 「편집」으로 열면 토글·파트 카드·값이 복원되고 다시 계산하면 같은 결과다", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/history");
    await putCalculationRecord(page, {
      id: "e2e-spco-c-restore",
      userId: "local-user",
      taxType: "transfer",
      title: "파트 이월과세 C (E2E 복원)",
      inputData: cSeed().state.formData,
      resultData: { mode: "single", result: { determinedTax: 300_018_000, localIncomeTax: 30_001_800 } },
      taxLawVersion: "2025",
      linkedCalculationId: null,
      clientId: null,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    });
    await page.reload();
    await page.getByTestId("resume-e2e-spco-c-restore").click();
    await page.waitForURL(/\/calc\/transfer-tax(\?|$)/);
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("carryover-donor-split-toggle")).toHaveAttribute("data-checked", "true");
    await expect(page.getByTestId("split-carryover-land-donor-price")).toHaveValue("50,000,000");
    await expect(page.getByTestId("split-carryover-building-gift-valuation")).toHaveValue("660,000,000");
    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    const body = await calculate(page);
    expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: 50_000_000 });
    expect((await (await respP).json()).data.result.determinedTax).toBe(300_018_000);
  });

  test("구 이력(신규 키 없음 · 자산 전체 이월과세): 편집으로 열면 토글은 꺼짐이고 종전 화면·종전 body 그대로(새 키 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    // 신규 키 3개가 없던 시절의 저장 모양 — 자산에서 키를 지운다
    const legacyAsset = {
      ...cAsset({
        carryoverDonorSplit: false,
        carryover: {
          ...CARRYOVER_DEFAULTS,
          giftRegistryDate: "2023-03-01",
          donorAcquisitionDate: "2015-06-01",
          donorAcquisitionPrice: "100000000",
          giftDateValuation: "900000000",
          giftTaxAmount: "30000000",
          donorRelation: "lineal",
          donorSameHousehold: "no",
        },
      }),
    } as Record<string, unknown>;
    delete legacyAsset.carryoverDonorSplit;
    delete legacyAsset.landCarryover;
    await page.goto("/history");
    await putCalculationRecord(page, {
      id: "e2e-spco-c-legacy",
      userId: "local-user",
      taxType: "transfer",
      title: "자산 전체 이월과세 구 이력 (E2E)",
      inputData: cSeed([legacyAsset]).state.formData,
      resultData: { mode: "single", result: { determinedTax: 1, localIncomeTax: 0 } },
      taxLawVersion: "2025",
      linkedCalculationId: null,
      clientId: null,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    });
    await page.reload();
    await page.getByTestId("resume-e2e-spco-c-legacy").click();
    await page.waitForURL(/\/calc\/transfer-tax(\?|$)/);
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("carryover-donor-split-toggle")).not.toHaveAttribute("data-checked", "true");
    await expect(page.getByText("환산취득가 사용")).toBeVisible(); // 종전 화면
    const body = await calculate(page);
    for (const k of ["carryoverGiftEvent", "landCarryoverPart", "buildingCarryoverPart", "landAcquisitionCause"]) expect(body[k], k).toBeUndefined();
    expect(body.carryoverTaxation).toBeTruthy();
  });

  test("⑧ 빈 상태에서 「다음」: 첫 빈 칸으로 이동 → 채우면 다음 칸 — 화면 위→아래(§3.5) 순서 그대로", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(
      page,
      cSeed([
        cAsset({
          carryover: { ...CARRYOVER_DEFAULTS, donorRelation: "lineal" },
          landCarryover: { ...CARRYOVER_DEFAULTS },
          landAcquisitionPrice: "",
          buildingAcquisitionPrice: "",
        }),
      ]),
    );
    await expandAssetSection(page, 3);
    const focusedIn = (key: string) =>
      expect
        .poll(() => page.evaluate((k) => !!(document.activeElement as HTMLElement | null)?.closest(`[data-field="${CSS.escape(k)}"]`), key))
        .toBe(true);
    const steps: Array<[string, () => Promise<void>]> = [
      ["carryover.giftRegistryDate", () => fillDate(page.locator('[data-field="carryover.giftRegistryDate"]'), "2023-03-01")],
      ["landCarryover.donorAcquisitionDate", () => fillDate(page.getByTestId("split-carryover-land-donor-date"), "1995-03-01")],
      ["landCarryover.donorAcquisitionPrice", () => page.getByTestId("split-carryover-land-donor-price").fill("50000000")],
      ["landAcquisitionPrice", () => page.getByTestId("split-carryover-land-gift-valuation").fill("240000000")],
      ["carryover.donorAcquisitionDate", () => fillDate(page.getByTestId("split-carryover-building-donor-date"), "2015-06-01")],
      ["carryover.donorAcquisitionPrice", () => page.getByTestId("split-carryover-building-donor-price").fill("50000000")],
      ["buildingAcquisitionPrice", () => page.getByTestId("split-carryover-building-gift-valuation").fill("660000000")],
      ["carryover.giftTaxBase", () => page.getByTestId("split-carryover-gift-tax-base").fill("900000000")],
      // P5 — 증여세 카드 아래 «증여자와 계속 같은 세대» 질문(필수)
      ["carryover.donorSameHousehold", () => page.getByRole("radio", { name: /아니오 — 세대가 달랐거나/ }).click()],
    ];
    for (const [key, fill] of steps) {
      await page.getByRole("button", { name: "다음", exact: true }).click();
      await focusedIn(key);
      await fill();
    }
    // 마지막 칸까지 채우면 다음 단계(보유 상황)로 넘어간다
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("button", { name: "보유 상황", exact: true }).first()).toHaveAttribute("aria-current", "step");
  });

  test("모바일 375px: 파트 카드·토글·결과 카드가 가로 스크롤 없이 렌더된다", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 800 });
    await seedWizard(page, cSeed());
    await expandAssetSection(page, 3);
    const toggle = page.getByTestId("carryover-donor-split-toggle");
    await toggle.scrollIntoViewIfNeeded();
    await expect(page.getByTestId("split-carryover-land-card")).toBeVisible();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByTestId("split-carryover-building-card").screenshot({ path: "e2e/_artifacts/spco-c-mobile-building-card.png" });
    await page.screenshot({ path: "e2e/_artifacts/spco-c-mobile-input.png", fullPage: false });
    await calculate(page);
    await page.getByTestId("split-carryover-card").first().scrollIntoViewIfNeeded();
    await page.getByTestId("split-carryover-card").first().screenshot({ path: "e2e/_artifacts/spco-c-mobile-result-card.png" });
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
