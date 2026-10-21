/**
 * transfer-multi-step-gate.spec.ts
 *
 * 다건(연간 합산)은 목록의 「공통 설정으로」만 자산별 필수 검증(`areAllPropertiesReady`)으로 막고 있었다.
 * 그런데 같은 이동을 하는 다른 입구 — 단계 표시 「공통 설정」 탭, 편집 화면 마지막 단계의 「공통 설정으로 →」·
 * 「+ 양도 건 추가」(현재 단계만 검증) — 로 들어가면 소재지·동·호가 빠진 건이 그대로 계산됐다(실측 200·결과 화면).
 * 계획서 `docs/00-pm/address-dongho-other-calcs-and-multi-gate.plan.md` B(M1·M2, Q-3 a·Q-4 a)
 *
 * 실행: E2E_PORT=3108 npx playwright test e2e/transfer-multi-step-gate.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const KEY = "multi-transfer-tax-wizard";

/** 소재지·동·호 말고는 필수 입력이 다 찬 1주택 양도 — `over`로 한 가지를 비운다 */
function form(over: Record<string, unknown> = {}) {
  return {
    assets: [
      {
        ...makeDefaultAsset(1), ...DIRECT_RESIDENCE,
        addressJibun: "강원특별자치도 춘천시 테스트동 1",
        regionCode: "5111010100",
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2015-01-01",
        actualSalePrice: "900000000",
        fixedAcquisitionPrice: "300000000",
        ...over,
      },
    ],
    transferDate: "2026-06-01",
    contractTotalPrice: "900000000",
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
  };
}
const NO_UNIT = { hasAddressUnits: true, addressDong: "", addressHo: "" };

/** 다건 세션을 만든다. `forms[i]`가 i번째 건. 편집(edit)이면 마법사 store에도 활성 건을 싣는다. */
async function seed(page: Page, forms: Record<string, unknown>[], activeStep: "list" | "settings" | "edit") {
  await page.goto("/calc/transfer-tax/multi");
  await page.waitForFunction((k) => !!sessionStorage.getItem(k), KEY);
  await page.evaluate(
    ({ k, forms, activeStep }) => {
      const parsed = JSON.parse(sessionStorage.getItem(k)!);
      const base = parsed.state.form.properties[0];
      parsed.state.form.properties = forms.map((f, i) => ({
        ...base,
        propertyId: `p${i + 1}`,
        propertyLabel: `양도 ${i + 1}번`,
        form: { ...base.form, ...f },
      }));
      parsed.state.form.activeStep = activeStep;
      parsed.state.form.activePropertyIndex = 0;
      parsed.state.form.taxYear = 2026;
      sessionStorage.setItem(k, JSON.stringify(parsed));
      const w = JSON.parse(sessionStorage.getItem("transfer-tax-wizard")!);
      w.state.formData = { ...w.state.formData, ...forms[0] };
      w.state.currentStep = 0;
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(w));
    },
    { k: KEY, forms, activeStep },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 연간 합산 과세 계산" }).waitFor();
}

function countCalls(page: Page) {
  const calls: number[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/calc/transfer/multi")) calls.push(r.status());
  });
  return calls;
}

const step = (page: Page) =>
  page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)!).state.form.activeStep as string, KEY);

test.describe("다건 — 어느 입구로도 필수 정보가 빠진 건은 계산되지 않는다", () => {
  test("G-1: 목록에서 단계 표시 「공통 설정」을 눌러도 동·호가 빠진 건이 있으면 넘어가지 않는다(M2)", async ({ page }) => {
    await seed(page, [form(NO_UNIT)], "list");
    await expect(page.getByRole("button", { name: "공통 설정으로" })).toBeDisabled();
    await page.getByText("공통 설정", { exact: true }).first().click();
    await page.waitForTimeout(300);
    expect(await step(page)).toBe("list");
    await expect(page.getByRole("button", { name: "세액 계산" })).toHaveCount(0);
  });

  test("G-2: 공통 설정 화면에 이미 와 있어도 「세액 계산」은 계산하지 않고 그 건을 알린다(M1 최종 관문)", async ({ page }) => {
    const calls = countCalls(page);
    await seed(page, [form(), form({ addressJibun: "", addressRoad: "" })], "settings");
    await page.getByRole("button", { name: "세액 계산" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "필수 정보가 입력되지 않은 양도 건이 있습니다" });
    await expect(alert).toContainText("「양도 2번」 자산: 소재지를 입력하세요");
    await expect(alert).not.toContainText("「양도 1번」");
    expect(calls).toEqual([]);
    expect(await step(page)).toBe("settings");
  });

  for (const button of ["공통 설정으로 →", "+ 양도 건 추가"] as const) {
    test(`G-3: 편집 화면에서 단계 탭으로 「가산세」에 가서 「${button}」를 눌러도 1단계 누락에서 멈춘다(M2)`, async ({ page }) => {
      const calls = countCalls(page);
      await seed(page, [form(NO_UNIT)], "edit");
      await page.getByRole("button", { name: "가산세" }).first().click();
      await page.getByRole("button", { name: button }).click();
      await expect(page.getByTestId("validation-issues").getByText(/동·호를 선택하세요/)).toBeVisible();
      expect(await step(page)).toBe("edit");
      const props = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)!).state.form.properties.length, KEY);
      expect(props).toBe(1); // 「+ 양도 건 추가」도 새 건을 만들지 않았다
      expect(calls).toEqual([]);
    });
  }

  test("G-4: 이 건은 완성됐지만 다른 건이 남았으면 「공통 설정으로 →」가 안내가 있는 목록으로 보낸다(M2)", async ({ page }) => {
    await seed(page, [form(), form(NO_UNIT)], "edit");
    await page.getByRole("button", { name: "가산세" }).first().click();
    await page.getByRole("button", { name: "공통 설정으로 →" }).click();
    await expect.poll(() => step(page)).toBe("list");
    await expect(page.getByText("일부 자산의 필수 정보가 입력되지 않았습니다")).toBeVisible();
  });

  test("G-5 반례: 모든 건이 완성됐으면 단계 표시 「공통 설정」 → 「세액 계산」이 종전대로 계산된다", async ({ page }) => {
    const calls = countCalls(page);
    await seed(page, [form()], "list");
    await page.getByText("공통 설정", { exact: true }).first().click();
    await page.getByRole("button", { name: "세액 계산" }).click();
    await expect.poll(() => step(page), { timeout: 15_000 }).toBe("result");
    expect(calls).toEqual([200]);
  });

  test("G-6 반례: 완성된 건은 편집 화면 「공통 설정으로 →」로 공통 설정에 간다", async ({ page }) => {
    await seed(page, [form()], "edit");
    await page.getByRole("button", { name: "가산세" }).first().click();
    await page.getByRole("button", { name: "공통 설정으로 →" }).click();
    await expect.poll(() => step(page)).toBe("settings");
  });
});
