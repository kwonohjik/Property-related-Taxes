/**
 * E2E: 이월과세 증여자 사망 배제 (§97의2① 괄호)
 *
 * 🔑 **여기서만 검증되는 것 — UI 입력 경로**.
 *
 * 단위 테스트(`__tests__/calc/carryover-donor-death-wiring.test.ts`)는 payload 변환부터
 * 본다. 그 위에 「화면의 라디오·토글이 실제로 store에 쓰는가」가 남는데, 그것이 빠지면
 * **API는 열렸는데 세액이 안 바뀌는** no-op이 된다(memory
 * `feedback_api_trigger_without_input_path_is_noop`).
 *
 * ⇒ 관계·사망은 **시드하지 않는다**. 화면에서 직접 클릭하고, 그 값이 store에 남는지 본다.
 *
 * ## 이 spec이 덮지 않는 것 (명시)
 *
 * 「클릭 → 계산 → 결과 화면」 전 구간을 한 번에 태우지는 **못했다**. 이 시드는
 * `contractTotalPrice`만 채우고 자산의 `actualSalePrice`는 비워 두는데, **단건 모드에서는
 * 그 관계가 뒤집혀 있다** — 총 양도가액 칸은 분할 모드에서만 렌더되고(`Step1.tsx:162`),
 * 단건에서는 `contractTotalPrice`가 `assets[0].actualSalePrice`의 **파생값**이다
 * (`Step1.tsx:119`). 그래서 첫 자산 patch에서 파생이 돌며 `""`가 된다.
 *
 * ⇒ **결함이 아니라 설계대로**다. 실사용에서는 그 칸이 보이지 않으므로 이런 조합 자체가
 *   만들어지지 않는다. 통합까지 태우려면 시드를 `actualSalePrice` 기준으로 다시 짜야 한다.
 *
 * 대신 구간을 나눠 전부 잇는다:
 * · UI → store        : 이 파일 (DD-E2·E4)
 * · store → payload   : `__tests__/calc/carryover-donor-death-wiring.test.ts`
 * · payload → 세액    : `__tests__/tax-engine/transfer-tax/carryover-donor-death.anchor.test.ts`
 */

import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/**
 * 증여자 취득가 1억 ↔ 증여 당시 평가 6억 — 이월과세를 적용하면(시나리오 A)
 * 양도차익이 커져 §97의2②3호 MAX가 A를 채택한다. 배제되면 B로 떨어진다.
 */
function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "carryover_gift",
            acquisitionDate: "2023-06-01",
            carryover: {
              giftRegistryDate: "2023-06-01",
              donorAcquisitionDate: "2012-01-01",
              donorAcquisitionCause: "purchase",
              donorAcquisitionPrice: "100000000",
              useEstimatedAcquisition: false,
              estimationMode: "",
              giftTaxAmount: "0",
              giftTaxCalculated: "",
              giftTaxBase: "",
              donorCapitalExpenditure: "0",
              giftDateValuation: "600000000",
              // 🔑 관계·사망은 비워 둔다 — 화면에서 입력할 대상이다.
              donorRelation: "",
              donorDeceased: false,
              exclusionDeclared: {},
            },
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "900000000",
        householdHousingCount: "2",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openWizard(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // ⚠️ 취득정보는 **접혀 있다**. 펴지 않으면 셀렉터가 못 찾는다 —
  //    반대로 `toHaveText` 계열은 hidden도 통과해 검증이 조용히 약해진다.
  await page.getByRole("button", { name: /취득정보/ }).first().click();
  await page.getByRole("radio", { name: "배우자" }).first().waitFor();
}

/** 화면 조작 결과가 store(sessionStorage)에 실제로 기록됐는지 읽는다. */
async function readCarryover(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    const c = raw ? JSON.parse(raw)?.state?.formData?.assets?.[0]?.carryover : undefined;
    return {
      donorRelation: c?.donorRelation as string | undefined,
      donorDeceased: c?.donorDeceased as boolean | undefined,
    };
  });
}

test.describe("이월과세 증여자 사망 배제 — UI 입력 경로", () => {
  test("DD-E1: 관계를 고르기 전에는 사망 토글이 비활성이다", async ({ page }) => {
    await openWizard(page);
    const deathToggle = page.getByRole("switch", { name: /사망/ }).first();
    await expect(deathToggle).toBeDisabled();
  });

  test("DD-E2: 배우자 + 사망을 클릭하면 store에 기록된다 [입력 경로]", async ({ page }) => {
    await openWizard(page);

    // ① 관계 라디오 — 화면에서 직접 클릭
    await page.getByRole("radio", { name: "배우자" }).first().check();

    // ② 관계별 문언이 그대로 뜨는지 (「사망으로 혼인관계가 소멸」 — 이혼과 구분되는 표현)
    const deathToggle = page
      .getByRole("switch", { name: /사망으로 혼인관계가 소멸/ })
      .first();
    await expect(deathToggle).toBeEnabled();
    await deathToggle.setChecked(true);

    // 🔑 여기가 이 spec의 존재 이유 — 화면 조작이 store까지 도달했는가.
    expect(await readCarryover(page)).toEqual({
      donorRelation: "spouse",
      donorDeceased: true,
    });
  });

  test("DD-E3: 직계존비속을 고르면 묻는 문언이 바뀐다 [관계별 분기]", async ({ page }) => {
    await openWizard(page);
    await page.getByRole("radio", { name: "직계존비속" }).first().check();

    // 직계존비속에는 혼인관계가 없다 — 「양도 당시 사망」으로 물어야 한다.
    await expect(
      page.getByRole("switch", { name: /양도 당시 증여자가 사망/ }).first(),
    ).toBeVisible();
  });

  test("DD-E4: 관계만 고르고 사망을 안 고르면 false로 남는다 [양성 대조군]", async ({
    page,
  }) => {
    await openWizard(page);
    await page.getByRole("radio", { name: "배우자" }).first().check();

    // 관계 선택이 사망을 함께 켜버리면 **모든 이월과세가 배제**된다 — 그 회귀를 막는다.
    expect(await readCarryover(page)).toEqual({
      donorRelation: "spouse",
      donorDeceased: false,
    });
  });

  test("RS-E1: 「그 외」를 고르면 사망 토글이 잠기고 안내가 뜬다", async ({ page }) => {
    await openWizard(page);
    await page.getByRole("radio", { name: /그 외/ }).first().check();

    // ① 요건 자체가 불충족이므로 사망 여부를 물을 이유가 없다.
    await expect(page.getByRole("switch", { name: /사망/ }).first()).toBeDisabled();
    await expect(
      page.getByText(/배우자 또는 직계존비속.*으로부터 증여받은 경우에만/).first(),
    ).toBeVisible();

    expect((await readCarryover(page)).donorRelation).toBe("other");
  });

  test("DD-E5: 관계를 바꾸면 사망 선택이 초기화된다 [문언 의미가 바뀌므로]", async ({
    page,
  }) => {
    await openWizard(page);
    await page.getByRole("radio", { name: "배우자" }).first().check();
    await page
      .getByRole("switch", { name: /사망으로 혼인관계가 소멸/ })
      .first()
      .setChecked(true);

    await page.getByRole("radio", { name: "직계존비속" }).first().check();

    // 「사망으로 혼인관계가 소멸」과 「양도 당시 사망」은 다른 질문이다 —
    // 앞선 답을 그대로 끌고 가면 사용자가 답하지 않은 사실을 선언한 것이 된다.
    expect(await readCarryover(page)).toEqual({
      donorRelation: "lineal",
      donorDeceased: false,
    });
  });
});
