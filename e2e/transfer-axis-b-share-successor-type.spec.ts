/**
 * E2E: 축 B(같은 물건 지분 분할) 입주권 — 둘째 이후 지분 카드에서 조합원 유형(승계)을 화면으로 고르고 계산한다.
 *
 * 결함: 둘째 지분 카드는 ① 기본정보를 숨기는데 「조합원 유형」 토글은 ①에만 있어 둘째 지분을 승계로 표시할 수 없었다.
 * 수정: 둘째 이후 지분 카드 ③ 취득정보에 같은 컴포넌트가 뜬다(지분별 입력 — 첫 카드 값 복사 아님).
 *
 * 둘째 카드는 화면이 만드는 그대로(`makeDefaultAsset(2)` — 표지 false·승계 칸 비움·저장 자산 종류 기본값) 시드한다.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-axis-b-share-successor-type.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const half = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };

function seedForm() {
  const first = makeDefaultAsset(1);
  const second = makeDefaultAsset(2);
  return {
    state: {
      formData: {
        assets: [
          {
            ...first,
            ...half,
            assetKind: "right_to_move_in",
            isSuccessorRightToMoveIn: true,
            acquisitionCause: "purchase",
            acquisitionDate: "2020-03-01",
            redevApprovalDate: "2018-05-01",
            successorRightAcqPrice: "500000000",
            successorRightAddedContribution: "100000000",
            addressJibun: "서울 테스트동 1",
            actualSalePrice: "1000000000",
            standardPriceAtTransfer: "800000000",
          },
          // 저장 자산 종류는 기본값 — 화면이 ①을 숨기고 첫 카드 값을 쓴다. 취득일·인가일은 사용자가 이 카드에서 입력하는 값.
          { ...second, ...half, acquisitionCause: "purchase", acquisitionDate: "2020-03-01", redevApprovalDate: "2018-05-01" },
        ],
        assetSplitMode: "fractional",
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1000000000",
        householdHousingCount: "2",
        householdRightCount: "0",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
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

test.describe("축 B 입주권 — 둘째 지분 조합원 유형", () => {
  test("둘째 카드 ③에서 승계를 고르고 2칸을 입력하면 승계 계산(장특 0·§166 상세 없음)으로 간다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    const second = page.locator('[data-asset-card-index="1"]');
    // ① 기본정보는 숨겨져 있고, ③ 취득정보에 「조합원 유형」이 있다.
    await expect(second.locator('[data-asset-section="1"]')).toHaveCount(0);
    const typeToggle = second.locator('[data-asset-section="3"] [data-field="isSuccessorRightToMoveIn"]');
    await expect(typeToggle).toHaveCount(1);

    // ③ 접힘 → 펼치기 (섹션 헤더 버튼)
    await second.locator('[data-asset-section="3"] > button').click();
    await typeToggle.getByRole("button", { name: /승계조합원/ }).click();

    const acq = second.locator('[data-field="successorRightAcqPrice"] input');
    await acq.fill("500000000");
    await second.locator('[data-field="successorRightAddedContribution"] input').fill("100000000");

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
      companionAssets?: { isSuccessorRightToMoveIn?: boolean; redevelopment?: unknown; fixedAcquisitionPrice?: number }[];
    };
    expect(sent.companionAssets?.[0].isSuccessorRightToMoveIn).toBe(true);
    expect(sent.companionAssets?.[0].redevelopment).toBeUndefined();
    expect(sent.companionAssets?.[0].fixedAcquisitionPrice).toBe(300_000_000);

    const body = await resp.json();
    const props = body.data.aggregated.properties as {
      longTermHoldingDeduction: number;
      acquisitionPrice: number;
      redevelopmentDetail?: unknown;
    }[];
    expect(props).toHaveLength(2);
    for (const p of props) {
      expect(p.longTermHoldingDeduction).toBe(0);
      expect(p.redevelopmentDetail).toBeUndefined();
      expect(p.acquisitionPrice).toBe(300_000_000);
    }
  });
});
