/**
 * E2E: 축 B(같은 물건 지분 분할) 조합원입주권 — 둘째 지분 카드도 첫 카드의 §89①4호 판정 선언을 쓴다.
 *
 * 계획서: `docs/00-pm/second-share-card-redev-judgment-facts-copy.plan.md`
 *
 * 둘째 카드는 화면이 만드는 그대로(`makeDefaultAsset(2)` — 판정 선언 빈 값·저장 자산 종류 기본값) 시드한다.
 * 화면 요약이 첫 카드 선언을 보이는지, ⑬ 본문이 그 값을 싣는지, 두 지분 모두 비과세인지를 함께 본다.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-axis-b-right-judgment-facts.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 지분 카드마다 입력하는 값(취득·§166) — 두 지분 같음. */
const perShare = {
  assetKind: "right_to_move_in",
  redevSubject: "right",
  acquisitionCause: "purchase",
  acquisitionDate: "2008-01-01",
  // 원조합원 카드는 상단 「취득가액」 칸이 화면에 없다(취득가액은 아래 redevActualAcquisitionPrice) — 숨은 칸을 비운 화면 모양
  fixedAcquisitionPrice: "",
  redevApprovalDate: "2022-03-01",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "25000000",
  redevRightsValue: "900000000",
  redevIsSuccessorMember: "no",
  redevActualAcquisitionPrice: "400000000",
  ownershipNumerator: "50",
  ownershipDenominator: "100",
  ownershipRemainderThirdParty: "",
};

function seedForm() {
  const first = makeDefaultAsset(1);
  const second = makeDefaultAsset(2);
  return {
    state: {
      formData: {
        assets: [
          {
            ...first,
            ...perShare,
            addressJibun: "서울 테스트동 1",
            actualSalePrice: "1000000000",
            // 판정 메뉴가 첫 카드에만 받는 §89①4호 선언
            redevExemptionEligibleAtApproval: "yes",
            redevPriorHouseHoldingMonths: "60",
            redevPriorHouseResidenceMonths: "36",
          },
          // 저장 자산 종류는 기본값으로 둔다 — 화면이 ①을 숨기고 첫 카드 값을 쓴다.
          { ...second, ...perShare, assetKind: second.assetKind },
        ],
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1000000000",
        householdHousingCount: "0",
        householdRightCount: "1",
        isOneHousehold: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        residencePeriodMonths: "60",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpen(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("축 B 조합원입주권 — 둘째 지분 판정 선언", () => {
  test("둘째 카드 요약이 첫 카드 선언을 보이고, 두 지분 모두 §89①4호 비과세", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    // 둘째 카드의 읽기 전용 요약 — 첫 카드 「충족 선언」(접힌 섹션도 마운트돼 있다)
    const second = page.locator('[data-asset-card-index="1"]');
    await expect(second.getByTestId("imported-redev-right-facts")).toContainText("충족 선언");

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const sent = resp.request().postDataJSON() as {
      companionAssets?: { redevelopment?: { exemptionEligibleAtApproval?: boolean; priorHouseResidenceMonths?: number } }[];
    };
    expect(sent.companionAssets?.[0].redevelopment?.exemptionEligibleAtApproval).toBe(true);
    expect(sent.companionAssets?.[0].redevelopment?.priorHouseResidenceMonths).toBe(36);

    const body = await resp.json();
    const props = body.data.aggregated.properties as { redevelopmentDetail?: { oneRightExemptionApplied?: boolean } }[];
    expect(props).toHaveLength(2);
    for (const p of props) expect(p.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(body.data.aggregated.totalTax).toBe(0);
  });
});
