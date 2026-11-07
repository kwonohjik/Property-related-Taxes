/**
 * E2E: 분양권(presale_right) §104①4호 단서(영 §167의6 1·2호) — 별건 5.
 *
 * 구 §104①4호(조정대상지역 주택분양권 50%, 2018.1.1~2021.5.31 양도분)의 단서는 종전에
 * `householdHousingCount === 0`(무주택) **하나만으로** 성립했다(과소과세 위험 — 시행령
 * §167의6 1·2호를 보지 않았다). 지금은 ① 세대 보유 주택 수 0채 ② 다른 분양권 미보유
 * ③ 30세 이상 또는 배우자 중 **셋 다 명시적으로 확인**돼야 단서가 성립한다(모름 = 혜택
 * 불성립). 유닛 anchor(`short-term-rate-era-housing-and-clause4.anchor.test.ts` B-2a~e)가
 * 엔진 산식을 보지만, **화면에서 "0채" 버튼·확인 토글 2종이 실제로 나타나고 세액에
 * 반영되는지**는 여기서만 확인된다.
 *
 * 실행: E2E_PORT=<워크트리 포트> npx playwright test e2e/transfer-presale-right-clause4-proviso.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 분양권 1건 — 2015년 취득(보유 5년↑ ⇒ §104①1호 괄호 미해당, 4호만 다툰다), 2020-06-01 양도. */
const ASSET = {
  ...makeDefaultAsset(1),
  addressJibun: "서울특별시 강남구 테스트동 1-1",
  assetKind: "presale_right",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-06-01",
  useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "900000000",
  standardPriceAtTransfer: "400000000",
  standardPriceAtAcq: "200000000",
};

function seedForm(address = ASSET.addressJibun) {
  return {
    state: {
      formData: {
        assets: [{ ...ASSET, addressJibun: address }],
        transferDate: "2020-06-01",
        filingDate: "2020-08-31",
        contractTotalPrice: "900000000",
        householdHousingCount: "1",
        isOneHousehold: false,
        // 분양권의 «양도일 기준 조정대상지역» 칸은 §104①4호 구간(2018.1.1~2021.5.31 양도)에서만 있다(A-3).
        // 이 시드는 값을 false로 두고 주소(서울특별시 강남구, 2017.8.3.~ 상시 지정)의 자동판별이 완료되길
        // 기다린다(seedAndOpen) — 사용자가 칸을 만지지 않았으면 판정값이 저장값을 이긴다.
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        houses: [],
        presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpen(page: Page, address?: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(address),
  );
  const regulatedResp = page.waitForResponse((r) => r.url().includes("/api/address/regulated-area"));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).click();
  // 조정대상지역 자동판별(주소 기반)이 완료될 때까지 기다린다 — 끝나기 전에 진행하면
  // 리셋 effect가 세팅한 false가 그대로 전송된다.
  await regulatedResp;
  if (address) await expect(page.getByText(/양도일\(2020-06-01\):/)).toBeVisible();
  else await expect(page.getByText(/조정대상지역 ✓/)).toBeVisible();
}

async function calculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  return resp;
}

test.describe("분양권 §104①4호 단서(영 §167의6) — 별건 5", () => {
  test("세대 보유 주택 수 0채 선택 시에만 단서 확인 토글 2종이 나타난다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    // 1채(기본값)에서는 단서 확인 블록이 없다.
    await expect(page.locator('[data-field="presaleRightClause4Proviso"]')).toHaveCount(0);

    // "0채" 버튼 — 이번 작업으로 추가된 입력 경로.
    await page.getByTestId("household-house-count-buttons").getByRole("button", { name: "0채" }).click();

    await expect(page.locator('[data-field="presaleRightClause4Proviso"]')).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "다른 분양권을 보유하고 있지 않습니다" }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "양도자가 30세 이상이거나 배우자가 있습니다" }),
    ).toBeVisible();

    // 다시 1채로 바꾸면 블록이 사라진다(리셋 effect — stale 토글 방지).
    await page.getByTestId("household-house-count-buttons").getByRole("button", { name: "1채" }).click();
    await expect(page.locator('[data-field="presaleRightClause4Proviso"]')).toHaveCount(0);
  });

  test("단서 미확인(0채만)이면 여전히 50% 단일세율이다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);
    await page.getByTestId("household-house-count-buttons").getByRole("button", { name: "0채" }).click();

    // 단서 토글을 켜지 않은 채 계산 — 여전히 §104①4호 50%가 적용돼야 한다(모름 = 혜택 불성립).
    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const sent = resp.request().postDataJSON() as Record<string, unknown>;
    expect(sent.householdHousingCount).toBe(0);
    expect(sent.presaleRightNoOtherRight).toBeFalsy();
    expect(sent.presaleRightAgeOrSpouseMet).toBeFalsy();
    const body = await resp.json();
    expect(body.data.result.appliedRate).toBe(0.5);
    expect(body.data.result.rateClause).toBe("104-1-4");
  });

  test("단서 3요건(0채 + 영 §167의6 1·2호)을 모두 확인하면 4호가 배제된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);
    await page.getByTestId("household-house-count-buttons").getByRole("button", { name: "0채" }).click();
    await page.getByRole("switch", { name: "다른 분양권을 보유하고 있지 않습니다" }).click();
    await page.getByRole("switch", { name: "양도자가 30세 이상이거나 배우자가 있습니다" }).click();

    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const sent = resp.request().postDataJSON() as Record<string, unknown>;
    expect(sent.presaleRightNoOtherRight).toBe(true);
    expect(sent.presaleRightAgeOrSpouseMet).toBe(true);
    const body = await resp.json();
    expect(body.data.result.appliedRate).not.toBe(0.5);
    expect(body.data.result.rateClause).not.toBe("104-1-4");
  });
});

test.describe("분양권 «양도일 기준 조정대상지역» 칸 — A-3 (§104①4호 구간)", () => {
  /** 춘천 — 전 기간 미지정이라 자동판별은 «아님»이다. 칸을 켜야 4호가 성립한다. */
  const UNDESIGNATED = "강원특별자치도 춘천시 테스트동 1";

  test("주소 판정이 «아님»이어도 칸으로 «지정»을 고르면 4호 50% — 보유 상황을 나갔다 돌아와도 선택이 유지된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, UNDESIGNATED);

    // testid는 ToggleCard 래퍼에 붙으므로 스위치는 role로 잡는다(e2e/CLAUDE.md — 공용 카드 testid 미전달).
    const toggle = page.getByRole("switch", { name: "양도일 기준 조정대상지역" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toBeChecked();

    // 단계를 나갔다 돌아온다 — Step4 마운트 리셋 effect가 선택을 지우면 안 된다(자동판별 «아님»으로 되돌아가는 것이 종전 동작).
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("button", { name: "보유 상황" }).click();
    await expect(page.getByRole("switch", { name: "양도일 기준 조정대상지역" })).toBeChecked();

    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const sent = resp.request().postDataJSON() as Record<string, unknown>;
    expect(sent.isRegulatedArea).toBe(true);
    const body = await resp.json();
    expect(body.data.result.appliedRate).toBe(0.5);
    expect(body.data.result.rateClause).toBe("104-1-4");
  });
});
