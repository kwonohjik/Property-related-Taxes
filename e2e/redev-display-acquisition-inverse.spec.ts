/**
 * E2E: §166 자산의 결과 화면 취득가액·필요경비 = 단건 신고서 역산 leaf(`redevFilingTotals`) — #2336.
 *
 * 유닛 anchor(`__tests__/api/transfer.route.redev-aggregate-display-acquisition.anchor.test.tsx`)는
 * route 응답과 컴포넌트 렌더를 따로 본다. 여기서는 **폼 → 계산 → 결과 화면 신고서 양식 표**를 한 번에 본다.
 *
 * 1. 함께 양도 환산: 원조합원 입주권 컴패니언의 숨은 일반 기준시가 칸에 옛 값이 남아도 400,000,000 · 3,000,000
 *    (수정 전 200,000,000 · 203,000,000). 세액은 그대로다.
 * 2. 단건 전액 비과세 실가: 마스킹 전 분기 차익으로 역산해 취득가액 500,000,000 · 전체 양도차익 500,000,000
 *    (수정 전 1,000,000,000 · 0 — 열 단위 검산식 불성립).
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/redev-display-acquisition-inverse.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const JIBUN = "서울 강남구 테스트동 1-1";

/** 원조합원 입주권 — 화면 입력 칸만. 일반 취득가액·기준시가 칸은 화면에 없다(빈 값). */
const ORIG = {
  assetKind: "right_to_move_in",
  isSuccessorRightToMoveIn: false,
  redevSubject: "right",
  acquisitionCause: "purchase",
  acquisitionDate: "2008-01-01",
  fixedAcquisitionPrice: "",
  actualSalePrice: "1000000000",
  standardPriceAtAcq: "",
  standardPriceAtTransfer: "",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2016-06-01",
  redevOriginalAssetType: "housing",
  redevRightsValue: "900000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "100000000",
  redevPreApprovalExpenses: "0",
  redevExemptionEligibleAtApproval: "yes",
  redevPriorHouseHoldingMonths: "60",
  redevPriorHouseResidenceMonths: "36",
};
const EST = {
  ...ORIG,
  useEstimatedAcquisition: true,
  redevActualAcquisitionPrice: "",
  redevManagementDisposalHousingPrice: "300000000",
  redevAcquisitionHousingPrice: "100000000",
};
const ACT = { ...ORIG, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "400000000" };
/** 화면에 없는 일반 기준시가 칸에 남은 옛 값(자산 종류를 바꾸기 전 입력). */
const STALE = { standardPriceAtAcq: "100000000", standardPriceAtTransfer: "500000000" };
const HOUSE = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "600000000",
  standardPriceAtTransfer: "400000000",
  useEstimatedAcquisition: false,
};

function seedForm(list: Record<string, unknown>[], extra: Record<string, unknown>) {
  return {
    state: {
      formData: {
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        householdRightCount: "1",
        residencePeriodMonths: "60",
        assets: list.map((over, i) => ({ ...makeDefaultAsset(i + 1), addressJibun: JIBUN, ...over })),
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        householdHousingCount: "0",
        isOneHousehold: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        bundledSaleMode: "actual",
        houses: [],
        presaleRights: [],
        ...extra,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

/** 시드 → 계산 → 결과 화면 신고서 양식 표(라벨 → 열 값). */
async function calcFormTable(page: Page, seed: unknown): Promise<Record<string, number[]>> {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.ok(), `계산 API 비정상 응답 ${r.status()}`).toBe(true);

  const table = page.locator('[data-print-id="form-table"]').first();
  await expect(table).toBeVisible({ timeout: 30_000 });
  return table.evaluate((t) => {
    const out: Record<string, number[]> = {};
    for (const tr of t.querySelectorAll("tr")) {
      const cells = [...tr.querySelectorAll("th,td")].map((c) => (c.textContent ?? "").trim());
      if (!cells[0] || cells[0] in out) continue;
      out[cells[0]] = cells.slice(1).map((v) => Number(v.replace(/[^\d-]/g, "")));
    }
    return out;
  });
}

function expectColumnIdentity(rows: Record<string, number[]>) {
  for (let c = 0; c < rows["양도가액"].length; c++) {
    expect(
      rows["양도가액"][c] - rows["취득가액"][c] - rows["필요경비"][c],
      `열 ${c}: 양도가액 − 취득가액 − 필요경비 = 전체 양도차익`,
    ).toBe(rows["전체 양도차익"][c]);
  }
}

test.describe("§166 표시 취득가액 = 단건 신고서 역산 (#2336)", () => {
  test("함께 양도 환산: 입주권 숨은 기준시가 칸의 옛 값이 표시에 섞이지 않는다", async ({ page }) => {
    test.setTimeout(90_000);
    const rows = await calcFormTable(
      page,
      seedForm([HOUSE, { ...EST, ...STALE }], {
        contractTotalPrice: "1600000000",
        assetSplitMode: "companion",
        householdHousingCount: "1",
        isOneHousehold: false,
      }),
    );
    // 열 = 합계 · 주 자산(주택) · 자산 2(입주권)
    expect(rows["취득가액"]).toEqual([700_000_000, 300_000_000, 400_000_000]);
    expect(rows["필요경비"]).toEqual([3_000_000, 0, 3_000_000]);
    expect(rows["전체 양도차익"]).toEqual([897_000_000, 300_000_000, 597_000_000]);
    expectColumnIdentity(rows);
    // 세액 불변(anchor RA-1과 같은 값) — 결정세액 + 지방세 결정세액
    expect(rows["결정세액"][0] + rows["지방세 결정세액"][0]).toBe(304_646_760);
  });

  test("단건 전액 비과세 실가: 취득가액·전체 양도차익이 과세 시와 같다", async ({ page }) => {
    test.setTimeout(90_000);
    const rows = await calcFormTable(page, seedForm([ACT], { contractTotalPrice: "1000000000" }));
    // 열 = 합계 · ① 인가 전 분 · ② 인가 후 분(청산금 납부)
    expect(rows["취득가액"]).toEqual([500_000_000, 400_000_000, 100_000_000]);
    expect(rows["전체 양도차익"]).toEqual([500_000_000, 500_000_000, 0]);
    expect(rows["비과세 양도차익"]).toEqual([500_000_000, 500_000_000, 0]);
    expectColumnIdentity(rows);
    expect(rows["결정세액"][0]).toBe(0);
  });
});
