/**
 * E2E: 부담부증여(소령 §159) — 지분 라벨(A2/PR #851) + 함께양도 토글 전이.
 *
 * ## 배경 — 도달성을 실측으로 확정했다 (추정 아님)
 *
 * A2(지분 모드 §159 평가액 미축소)를 고치면서 "UI에서 도달 가능한가"를 probe로 전수했다.
 *
 * | 조합 | 현행 동작 |
 * |---|---|
 * | 단건 + 지분<100% | `transfer-tax-validate-asset.ts` 차단 |
 * | 같은 물건 지분분할(fullFractional) + 부담부증여 | ✅ **2026-09-03 개방**(축 B) |
 * | 2자산 상태로 **처음부터** 진입 | 양도 형태 라디오 미노출 → 부담부증여 선택 불가 |
 *
 * → **A2의 계산 결함은 현재 UI로 도달할 수 없다.** 엔진 정정은 방어선이지 라이브 버그 수정이 아니다.
 *
 * ## 함께양도 토글 전이 (본 spec의 주 대상)
 *
 * 단건에서 부담부증여를 고른 뒤 **"같은 날 다른 부동산도 함께" 토글을 켜면** `transferType`이
 * `burdened_gift`로 남고 채무 입력 UI도 그대로 보인다. 종전에는 계산만 `mode: bundled`로 가서
 * §159가 조용히 빠졌고(응답에 `debtRatio` 0건), 그래서 **명시 차단**했다.
 *
 * 🔄 **2026-09-03 개방**. 차단 사유가 틀렸다 — 엔진 STEP 0.48이 §159 산정값으로 다시 덮어쓰므로
 * 스케일 충돌이 없다. 진짜 결함은 ④가 카드마다 그 물건 채무 **전액**을 실어 자산 수만큼
 * 곱해진 것이고(실측 2배), 신고 단위 채무 재배분으로 해소했다. 계획서:
 * `docs/02-design/features/transfer-companion-burdened-gift.plan.md`
 *
 * ⇒ 여기서는 **토글 전이**만 본다(단건 → 2자산). 계산·표시 실검증은
 *   `e2e/transfer-companion-burdened-gift.spec.ts`가 2자산을 직접 seed해서 담당한다.
 *
 * 실행: npx playwright test e2e/transfer-burdened-gift-fractional.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 단건 부담부증여 — 엔진 anchor B3와 동일 수치(판별력). */
const burdenedGift = {
  ...makeDefaultAsset(1),
  assetKind: "housing",
  transferType: "burdened_gift",
  acquisitionDate: "2009-03-01",
  bgValuationMode: "sangjeungbeop_standard",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "300000000",
  bgMortgageDebtAmount: "300000000",
  standardPriceAtTransfer: "1000000001",
  standardPriceAtAcq: "500000001",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "500000000",
};

const seedState = (assets: unknown[]) => ({
  state: {
    formData: {
      assets,
      transferDate: "2024-03-01",
      filingDate: "2024-05-31",
      contractTotalPrice: "1000000000",
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
});

async function seedAndOpen(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedState(assets),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function gotoLastStep(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
}

/** 응답에서 §159 breakdown을 형태 가정 없이 찾는다 (e2e/CLAUDE.md §4 — 구조 추정 금지). */
function findBreakdown(node: unknown): Record<string, unknown> | null {
  if (node === null || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  if ("debtRatio" in o && "sangjeungbeopValuation" in o) return o;
  for (const v of Object.values(o)) {
    const hit = findBreakdown(v);
    if (hit) return hit;
  }
  return null;
}

test.describe("부담부증여 §159 (A2 / PR #851)", () => {
  test("단건 부담부증여 — §159가 적용되고 결과에 채무비율이 실린다 (회귀 가드)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, [burdenedGift]);
    await gotoLastStep(page);

    const rp = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await rp;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const body = await resp.json();
    expect(body.data.mode).toBe("single");

    const bg = findBreakdown(body);
    expect(bg, "§159 breakdown이 응답에 없다 — 부담부증여 경로 미도달").not.toBeNull();

    // C = max(보충적 1,000,000,001, 담보 600,000,000) = 보충적 → 채무비율 = 6억/C
    const val = bg!.sangjeungbeopValuation as Record<string, unknown>;
    expect(val.selectedMode).toBe("supplementary");
    expect(val.max).toBe(1_000_000_001);

    // 단독 소유이므로 지분 필드는 비어 있고, 물건 전체 평가액 = 보충적평가와 동일
    expect(bg!.ownershipRatio).toBeUndefined();
    expect(bg!.wholePropertySupplementary).toBe(1_000_000_001);

    // 양도가액 합 = 인수채무 B (§159①2호 항등)
    const per = bg!.perAsset as Record<string, { transferPrice: number }>;
    expect(per.land.transferPrice + per.building.transferPrice).toBe(600_000_000);
  });

  test("✅ 부담부증여 + 함께양도 → 차단이 아니라 컴패니언 규약으로 열린다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, [burdenedGift]);

    const card0 = page.locator('[data-asset-card-index="0"]');
    // ② 양도정보 펼침 — 자산 카드는 진입 시 전부 접힘(점진적 노출)
    await expandAssetSection(page, 2);
    // 단건 상태: 채무 입력 UI는 보이고, 컴패니언 규약 안내는 아직 없다
    await expect(card0.getByText("인수 채무 + 임대 평가 보조").first()).toBeVisible();
    await expect(card0.getByText(/이 물건에 설정된 금액/)).toHaveCount(0);

    // 함께양도 토글 ON → 자산 2건으로 전환
    await page.getByRole("switch", { name: /같은 날 다른 부동산도 함께/ }).setChecked(true);
    await expect(page.locator("[data-asset-card-index]")).toHaveCount(2);
    await expandAssetSection(page, 2);

    // 토글 후에도 부담부증여 선택과 채무 입력 UI가 유지된다
    await expect(card0.getByText("인수 채무 + 임대 평가 보조").first()).toBeVisible();
    await expect(card0.getByRole("radio", { name: /부담부증여/ })).toBeChecked();

    // ⑤ **제3의 규약** 안내가 뜬다 — 축 A(지분 인수분)·축 B(물건 전체)와 다르게
    // 「이 물건에 설정된 금액」이다. 침묵하면 사용자가 총액을 각 카드에 넣어
    // 자산 수만큼 곱해진다(개방 전 실측 2배).
    await expect(card0.getByText(/이 물건에 설정된 금액/).first()).toBeVisible();

    // 차단 메시지가 더는 뜨지 않는다.
    // 토글로 추가된 자산 2는 빈 상태라 step 0 검증 목록 **자체는** 뜬다 — 그 목록이
    // 렌더된 상태에서 부담부증여 차단만 없다는 것이 요지다(공백 통과 방지).
    await gotoLastStep(page);
    await page.getByRole("button", { name: /계산하기/ }).click();
    const issues = page.getByTestId("validation-issues");
    await expect(issues).toBeVisible({ timeout: 10_000 });
    await expect(issues.getByText(/부담부증여.*함께 양도와 같이 계산할 수 없습니다/)).toHaveCount(0);
  });

  test("⑤ 지분 자산은 채무 라벨이 '지분 인수분'으로 바뀐다 (A2 UI)", async ({ page }) => {
    test.setTimeout(60_000);
    // 지분 부담부증여는 계산이 차단되지만(위 표), 폼 렌더는 A2 UI 계약의 검증 대상이다.
    // 평가액은 물건 전체 / 채무는 지분 인수분이라는 **스케일 구분**이 화면에 드러나야 한다.
    await seedAndOpen(page, [
      { ...burdenedGift, ownershipNumerator: "50", ownershipDenominator: "100" },
    ]);

    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 2);
    await expect(card.getByText("인수 채무 + 임대 평가 보조").first()).toBeVisible();

    await expect(card.getByText(/공유지분\(50\/100\) 부담부증여/)).toBeVisible();
    await expect(card.getByText(/평가액은 물건 전체로 입력/)).toBeVisible();

    // 라벨이 단독 소유("총액"·"실제 채무잔액")와 구분된다
    await expect(card.getByText("임대보증금 (지분 인수분)")).toBeVisible();
    await expect(card.getByText("담보차입금 (지분 인수분)")).toBeVisible();
    await expect(card.getByText("임대보증금 총액")).toHaveCount(0);
  });
});
