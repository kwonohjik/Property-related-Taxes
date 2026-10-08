/**
 * E2E 공용 — 토지·건물 별개 취득(split) 결과 표시 spec 둘(`transfer-split-acq-result-display` · `transfer-split-acq-owner-split-display`)의 시드·표 읽기 헬퍼.
 *
 * 800줄 정책 분리(2026-10-08) — 시드·추출 함수만 있고 단언은 없다.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "../../lib/stores/calc-wizard-store";
import { putCalculationRecord } from "./history-seed";
import { openHistoryModal } from "./navigation";
import { DIRECT_RESIDENCE } from "./residence-direct";

export type Over = Record<string, unknown>;
export const won = (n: number) => n.toLocaleString("en-US");
export const num = (s: string | undefined) => {
  const m = /^-?[\d,]+/.exec((s ?? "").trim());
  return m ? Number(m[0].replace(/,/g, "")) : 0;
};

// ───────────────────────────────────────────────────────────────────────────
// 시드
// ───────────────────────────────────────────────────────────────────────────
/** 주택 · 별개 취득(토지 2010-03-15 / 건물 2018-06-01) · 양도 900,000,000 — 설계서 §1.2 실측 시드와 같은 값 */
export function housing(over: Over = {}) {
  return {
    ...makeDefaultAsset(1), ...DIRECT_RESIDENCE,
    addressJibun: "강원특별자치도 춘천시 테스트동 1",
    regionCode: "5111010100",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-06-01",
    landAcquisitionDate: "2010-03-15",
    hasSeperateLandAcquisitionDate: true,
    actualSalePrice: "900000000",
    acquisitionArea: "200",
    transferArea: "200",
    standardPricePerSqmAtAcq: "500000",
    buildingStandardPriceAtAcq: "50000000",
    landStandardPriceAtTransfer: "300000000",
    buildingStandardPriceAtTransfer: "100000000",
    saleSplitMode: "apportioned",
    ...over,
  };
}

export function singleSeed(assets: Over[], formOver: Over = {}) {
  return {
    state: {
      formData: {
        assets,
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: String(assets.length === 1 ? "900000000" : "1200000000"),
        householdHousingCount: "2",
        isOneHousehold: false,
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        ...formOver,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

export async function seedWizard(page: Page, seed: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

/** 가산세 단계로 가서 계산한다 — 요청 body와 결과 화면 렌더까지 기다린다. */
export async function calculate(page: Page): Promise<Record<string, unknown>> {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON();
  await page.locator('[data-print-id="form-table"]').first().waitFor({ timeout: 60_000 });
  return body;
}

/** 신고서 표 한 행의 셀 텍스트 — 첫 칸(라벨)이 정확히 일치하는 행. */
export async function formRow(page: Page, label: string): Promise<string[]> {
  const cells = await page
    .locator('[data-print-id="form-table"]')
    .first()
    .evaluate((el, lbl) => {
      for (const tr of Array.from(el.querySelectorAll("tr"))) {
        const c = Array.from(tr.children).map((x) => (x as HTMLElement).innerText.trim());
        if (c[0] === lbl) return c;
      }
      return null;
    }, label);
  expect(cells, `신고서에 「${label}」 행이 없다`).not.toBeNull();
  return cells!;
}

export const stmtRow = (page: Page, label: string) => page.locator(`[data-statement-row="${label}"]`).first();
/**
 * 명세서 행 전체 텍스트(공백 정규화). **`textContent`**를 읽는다 — 자산별 펼침(▼)은 닫힌 상태에서 `hidden`(display:none)이라 `innerText`에 빠진다.
 * 접힌 자산별 산식도 DOM에는 있고 인쇄 시 항상 펼쳐진다(`hidden print:block`).
 */
export const stmtText = async (page: Page, label: string) =>
  ((await stmtRow(page, label).evaluate((el) => el.textContent)) ?? "").replace(/\s+/g, " ");
export const stmtValue = async (page: Page, label: string) => num(await stmtRow(page, label).locator("[data-statement-value]").first().innerText());
export const card = (page: Page, id: string) => page.getByTestId(id).first();

/** 소유자 분리 3종 — 일괄양도 900,000,000 · 토지 실거래가 200,000,000 + 건물 환산(실가/환산 시드)에서 소유 파트만의 정답(설계서 §1.3 · fixture 독립 산식). */
export const OWNER_SPLIT = {
  both: { price: 900_000_000, acq: 312_500_000, exp: 1_500_000, gain: 586_000_000 },
  land_only: { price: 675_000_000, acq: 200_000_000, exp: 0, gain: 475_000_000 },
  building_only: { price: 225_000_000, acq: 112_500_000, exp: 1_500_000, gain: 111_000_000 },
} as const;
export type OwnerKey = keyof typeof OWNER_SPLIT;
export const OWNER_KEYS = Object.keys(OWNER_SPLIT) as OwnerKey[];

/** 임의 요소 안 표(`<tr>`)의 행 — 첫 칸(라벨)을 키로, 나머지 칸의 숫자. 접힌 자산별 펼침은 `display:none`이라 `textContent`를 읽는다. */
export async function rowsIn(el: Locator): Promise<Record<string, number[]>> {
  const rows = await el.evaluate((root) => {
    const out: Record<string, string[]> = {};
    for (const tr of Array.from(root.querySelectorAll("tr"))) {
      const c = Array.from(tr.children).map((x) => (x.textContent ?? "").trim());
      if (c[0] && !(c[0] in out)) out[c[0]] = c.slice(1);
    }
    return out;
  });
  return Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.map((x) => num(x))]));
}

export const landStandalone = (id = 2, over: Over = {}) => ({
  ...makeDefaultAsset(id), ...DIRECT_RESIDENCE,
  assetKind: "land",
  addressJibun: `강원특별자치도 춘천시 테스트동 ${id}`,
  regionCode: "5111010100",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  acquisitionArea: "1000",
  actualSalePrice: "300000000",
  fixedAcquisitionPrice: "100000000",
  directExpenses: "0",
  landNature: "standalone",
  standardPriceAtTransfer: "100000000",
  ...over,
});

export const multiProps = (formFor: (acq: Over) => Over) => [
  { propertyId: "np1", propertyLabel: "건1", completionPercent: 100, form: formFor(housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000" })) },
  {
    propertyId: "np2",
    propertyLabel: "건2",
    completionPercent: 100,
    form: {
      ...createDefaultTransferFormData(),
      assets: [landStandalone(1, { actualSalePrice: "300000000" })],
      transferDate: "2026-03-01",
      contractTotalPrice: "300000000",
      householdHousingCount: "1",
      isOneHousehold: false,
    },
  },
];

export async function runMulti(page: Page, id: string, title: string, props: unknown[]) {
  await page.goto("/history");
  await putCalculationRecord(page, {
    id,
    userId: "local-user",
    taxType: "transfer",
    title,
    inputData: {
      __multiTransfer: true,
      taxYear: 2026,
      properties: props,
      activePropertyIndex: 0,
      activeStep: "settings",
      annualBasicDeductionUsed: "0",
      basicDeductionAllocation: "MAX_BENEFIT",
    },
    resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "np1" }, { propertyId: "np2" }] },
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
  });
  await page.goto("/calc/transfer-tax/multi");
  await openHistoryModal(page, page.getByTestId("multi-load-history-btn").first(), page.getByText(title));
  await page.getByTestId(`load-record-${id}`).click();
  const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  expect((await respP).status()).toBe(200);
  await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 30_000 });
}

export const multiForm = (asset: Over, over: Over = {}) => ({
  ...createDefaultTransferFormData(),
  assets: [asset],
  transferDate: "2026-02-16",
  contractTotalPrice: "900000000",
  householdHousingCount: "1",
  isOneHousehold: false,
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  ...over,
});
