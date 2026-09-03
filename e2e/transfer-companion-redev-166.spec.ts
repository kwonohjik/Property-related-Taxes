/**
 * E2E: 조합원입주권·재개발APT × 컴패니언(다른 물건 함께양도) — 시행령 §166.
 *
 * 유닛 anchor(`__tests__/api/transfer.route.companion-redev-166.anchor.test.ts`)가 배관 각 층을
 * 보지만, **화면에서 실제로 열리는지**는 여기서만 확인된다. 두 자산의 장벽이 서로 달랐다 —
 * 입주권은 ④ fold(200이면서 §166 없이 주택 계산), 재개발APT는 ⑩ enum(400).
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-companion-redev-166.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** §166 필수입력 전건 — 원조합원 실가 모드 · 청산금 납부 · 종전자산 주택. */
const REDEV_166 = {
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2018-05-01",
  redevRightsValue: "350000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "50000000",
  redevPreApprovalExpenses: "0",
  redevOriginalAssetType: "housing",
  redevActualAcquisitionPrice: "300000000",
};

function assets(companionKind: string) {
  return [
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
      assetKind: companionKind,
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-01",
      useEstimatedAcquisition: false,
      fixedAcquisitionPrice: "300000000",
      actualSalePrice: "600000000",
      standardPriceAtTransfer: "400000000",
      standardPriceAtAcq: "200000000",
      ...REDEV_166,
    },
  ];
}

function seedForm(list: Record<string, unknown>[]) {
  return {
    state: {
      formData: {
        assets: list,
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

async function seedAndOpen(page: Page, list: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(list),
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

for (const [label, kind, subject] of [
  ["조합원입주권", "right_to_move_in", "right"],
  ["재개발·재건축 APT", "redevelopment_apt", "apt"],
] as const) {
  test.describe(`컴패니언 × ${label} (시행령 §166)`, () => {
    test("차단이 풀리고 §166 서브객체가 엔진까지 도달한다", async ({ page }) => {
      test.setTimeout(90_000);
      await seedAndOpen(page, assets(kind));

      // 차단이 남아 있으면 계산 요청이 나가지 않아 waitForResponse가 타임아웃된다.
      const resp = await calculate(page);
      expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

      const sent = resp.request().postDataJSON() as {
        companionAssets?: { assetKind?: string; redevelopment?: { subject?: string; rightsValue?: number } }[];
      };
      // ④ — 접히지 않고 자산 종류가 보존된다.
      expect(sent.companionAssets?.[0].assetKind).toBe(kind);
      // ⑫⑬ — §166 서브객체가 실려 나간다(등록 누락 시 침묵 strip).
      expect(sent.companionAssets?.[0].redevelopment?.subject).toBe(subject);
      expect(sent.companionAssets?.[0].redevelopment?.rightsValue).toBe(350_000_000);

      const body = await resp.json();
      expect(body.data.mode).toBe("bundled");

      // ⑭ — 산출물이 **컴패니언에만** 실린다. 「둘 다 없음」으로 통과하는 것을 막는다.
      const props = body.data.aggregated.properties as { redevelopmentDetail?: unknown }[];
      expect(props).toHaveLength(2);
      expect(props[0].redevelopmentDetail).toBeUndefined();
      expect(props[1].redevelopmentDetail, "§166 산출물 부재 — 엔진 미도달").toBeDefined();
    });
  });
}
