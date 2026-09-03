/**
 * E2E: 분양권(presale_right) × 컴패니언(다른 물건 함께양도).
 *
 * 유닛 anchor(`__tests__/api/transfer.route.companion-presale-right.anchor.test.ts`)가 배관 각
 * 층을 보지만, **화면에서 실제로 열리는지**는 여기서만 확인된다. 종전에는 ⑧이 명시 차단했고
 * (「분양권은 함께 양도와 같이 계산할 수 없습니다」), ④의 `toEngineAssetKind`가 분양권을
 * 주택으로 접어 **200이면서 §104①1호 60%가 사라지는** 상태였다.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-companion-presale-right.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** primary 주택(2015 취득) + companion 분양권(2022 취득) — 각 6억, 총액 12억. */
const ASSETS = [
  {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "400000000",
    standardPriceAtAcq: "200000000",
  },
  {
    ...makeDefaultAsset(2),
    assetKind: "presale_right",
    acquisitionCause: "purchase",
    acquisitionDate: "2022-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "400000000",
    standardPriceAtAcq: "200000000",
  },
];

function seedForm(assets: Record<string, unknown>[]) {
  return {
    state: {
      formData: {
        assets,
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1200000000",
        householdHousingCount: "2",
        isOneHousehold: false,
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

async function seedAndOpen(page: Page, assets: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(assets),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  return resp;
}

test.describe("컴패니언 × 분양권 (소득세법 §104①1호)", () => {
  test("차단이 풀리고 분양권이 60% 단일세율군으로 분리된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, ASSETS);

    // 차단이 남아 있으면 계산 요청 자체가 나가지 않아 아래 waitForResponse가 타임아웃된다.
    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    // ④ — 주택으로 접히지 않고 분양권 그대로 나간다.
    const sent = resp.request().postDataJSON() as { companionAssets?: { assetKind?: string }[] };
    expect(sent.companionAssets?.[0].assetKind).toBe("presale_right");

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");

    // §104①1호 60% 단일세율군에 **컴패니언만** 든다. primary 주택은 누진에 남는다.
    const groups = body.data.aggregated.groupTaxes as {
      group: string;
      appliedRate: number;
      assetIds: string[];
      groupCalculatedTax: number;
    }[];
    expect(groups).toHaveLength(2);
    const flat = groups.find((g) => g.appliedRate === 0.6);
    expect(flat, "60% 세율군 부재 — fold 잔존").toBeDefined();
    expect(flat!.assetIds).toHaveLength(1);
    expect(flat!.assetIds[0]).not.toBe("primary");
    expect(groups.find((g) => g.group === "progressive")!.assetIds).toEqual(["primary"]);
  });
});
