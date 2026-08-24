/**
 * B-4 **발현 조건** — 한 자산에 두 조문의 감면 PHD를 함께 입력할 수 있다.
 * 계획서: docs/00-pm/red-phd-snapshot-followups.plan.md (B-4)
 *
 * 감면 그룹 라디오(`toggleGroupRadio`)는 **같은 category 안에서만** 배타이고,
 * PHD 보유 8개 조문은 `new_housing`(2) · `unsold_housing`(6) 두 category에 걸쳐 있다.
 * ⇒ §99의3(new_housing) + §98의8(unsold_housing) 동시 선택이 가능하고, 그래서 종전의
 *   단일 키(`bsp-{assetId}-red-phd`)가 서로를 덮어썼다.
 *
 * ⚠️ **이 spec은 키 분리 자체를 검증하지 않는다** — 런처 4개는 두 폼이 렌더되기만 하면
 *    나오므로 키 생성을 되돌려도 통과한다(2026-08-24 코드 리뷰 지적).
 *    키 분리는 `__tests__/components/calc/reduction-phd-building-stdprice.test.tsx`의
 *    스텁 anchor가 고정한다. 여기서 확인하는 것은 **두 폼이 실제 브라우저에서 공존한다**는
 *    발현 조건뿐이다.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2003-11-28",
          actualAcquisitionPrice: "200000000",
          // 🔑 두 category에서 각각 하나씩 — 그룹 라디오가 서로를 지우지 않는다
          reductions: [
            { ...getReductionDefault("new_99_3"), phdMode993: true },
            { ...getReductionDefault("unsold_98_8"), phdMode988: true },
          ],
        }],
        transferDate: "2026-03-02",
        filingDate: "2026-04-30",
        contractTotalPrice: "420000000",
        householdHousingCount: "2",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

test("두 조문의 감면 PHD가 동시에 열리고 건물기준시가 런처가 조문마다 뜬다", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // 사이드바에서 「감면·공제」 스텝으로 점프 (currentStep은 persist되지 않는다)
  await page.getByRole("button", { name: "감면·공제", exact: true }).click();

  // 카테고리 섹션은 기본 접힘(`openCategories` 초기값 전부 false) — 두 category를 각각 펼친다.
  // 이것이 이 결함의 발현 조건이기도 하다: 두 category에 하나씩 선택할 수 있어야 키가 충돌한다.
  await page.getByRole("button", { name: /신축주택/ }).first().click();
  await page.getByRole("button", { name: /미분양주택/ }).first().click();

  // 두 조문의 PHD 폼이 함께 렌더 → 런처는 조문당 2개(취득시·최초공시시) = 총 4개.
  // 종전에는 폼이 둘 다 떠도 **같은 스냅샷 키**를 써서 계산이 서로를 덮어썼다.
  const launchers = page.getByRole("button", { name: /건물 기준시가 계산/ });
  await expect(launchers).toHaveCount(4, { timeout: 15000 });
});
