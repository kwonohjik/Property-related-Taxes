/**
 * E2E: 이월과세 §97의2②2호 — 배우자 예외 사실 · 레거시 선언 전환 (D45)
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §3.
 *
 * 🔑 여기서만 검증되는 것 — **UI 입력 경로**(화면 조작 → store).
 * · 배우자를 고르면 「증여일 현재 1세대1주택이던 주택을 배우자로부터 증여받았습니다」 문항이 뜨고,
 *   체크가 store의 `spouseGiftOneHouseAtGiftDate`에 남는다. 직계존비속으로 바꾸면 함께 지워진다.
 * · 옛 이력(`oneHouseExemptionApplies: true`)을 시드하면 ③ normalize가 레거시 플래그로 옮기고,
 *   안내 카드의 「자동 판정으로 전환」이 그 플래그를 지운다(Q-3).
 * · ②2호 자기선언 토글은 없다.
 *
 * store → payload → 세액은 `__tests__/calc/transfer-carryover-legacy-declaration-d45.test.ts` ·
 * `__tests__/api/transfer.route.carryover-d45.anchor.test.ts` · 엔진 anchor가 잇는다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(exclusionDeclared: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "carryover_gift",
            acquisitionDate: "2023-06-01",
            carryover: {
              giftRegistryDate: "2023-06-01",
              donorAcquisitionDate: "2000-06-01",
              donorAcquisitionCause: "purchase",
              donorAcquisitionPrice: "10000000",
              useEstimatedAcquisition: false,
              estimationMode: "",
              giftTaxAmount: "0",
              giftTaxCalculated: "",
              giftTaxBase: "",
              donorCapitalExpenditure: "0",
              giftDateValuation: "1500000000",
              donorRelation: "",
              donorDeceased: false,
              exclusionDeclared,
            },
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "1500000000",
        householdHousingCount: "1",
        isOneHousehold: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openWizard(page: Page, exclusionDeclared: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(exclusionDeclared),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: /취득정보/ }).first().click();
  await page.getByRole("radio", { name: "배우자" }).first().waitFor();
}

async function readCarryover(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    const c = raw ? JSON.parse(raw)?.state?.formData?.assets?.[0]?.carryover : undefined;
    return {
      spouseGiftOneHouseAtGiftDate: c?.spouseGiftOneHouseAtGiftDate as boolean | undefined,
      legacy: c?.exclusionDeclared?.legacyOneHouseExemptionDeclared as boolean | undefined,
      oldKey: c?.exclusionDeclared?.oneHouseExemptionApplies as boolean | undefined,
    };
  });
}

const SPOUSE_FACT = /증여일 현재 1세대1주택이던 주택을 배우자로부터 증여받았습니다/;

test.describe("D45 — 이월과세 ②2호 UI 입력 경로", () => {
  test("S-E1: ②2호 자기선언 토글이 없고, 배우자 예외 문항은 배우자일 때만 뜬다", async ({ page }) => {
    await openWizard(page);
    await expect(page.getByRole("switch", { name: /② 2호 — 1세대1주택 비과세 해당/ })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: SPOUSE_FACT })).toHaveCount(0);

    await page.getByRole("radio", { name: "배우자" }).first().check();
    const fact = page.getByRole("switch", { name: SPOUSE_FACT }).first();
    await expect(fact).toBeVisible();
    await fact.setChecked(true);
    expect((await readCarryover(page)).spouseGiftOneHouseAtGiftDate).toBe(true);

    // 관계를 바꾸면 배우자 전용 사실은 함께 지워진다(stale 금지).
    await page.getByRole("radio", { name: "직계존비속" }).first().check();
    await expect(page.getByRole("switch", { name: SPOUSE_FACT })).toHaveCount(0);
    expect((await readCarryover(page)).spouseGiftOneHouseAtGiftDate).toBe(false);
  });

  test("L-E1: 옛 이력의 자기선언 → 레거시 안내 · 「자동 판정으로 전환」이 플래그를 지운다", async ({ page }) => {
    await openWizard(page, { expropriationWithin2Years: false, oneHouseExemptionApplies: true, isFamilyBusinessInheritedAsset: false });
    // 안내가 뜬다 = ③ normalize가 옛 키를 레거시 플래그로 옮겼다(메모리 store 기준).
    // ⚠️ sessionStorage는 다음 persist 전까지 시드 원문 그대로라 여기서 읽지 않는다.
    await expect(page.getByText(/저장 당시 직접 선언한/).first()).toBeVisible();

    await page.getByRole("button", { name: "자동 판정으로 전환" }).click();
    await expect(page.getByText(/저장 당시 직접 선언한/)).toHaveCount(0);
    // 전환은 store를 갱신한다 → persist된 값은 새 모양(옛 키 없음 · 플래그 false)이다.
    const after = await readCarryover(page);
    expect(after.legacy).toBe(false);
    expect(after.oldKey).toBeUndefined();
  });

  test("L-E2: 음성 짝 — 옛 선언이 없으면 레거시 안내가 없다", async ({ page }) => {
    await openWizard(page, { expropriationWithin2Years: false, oneHouseExemptionApplies: false, isFamilyBusinessInheritedAsset: false });
    await expect(page.getByText(/자동 판정합니다/).first()).toBeVisible();
    await expect(page.getByText(/저장 당시 직접 선언한/)).toHaveCount(0);
  });
});
