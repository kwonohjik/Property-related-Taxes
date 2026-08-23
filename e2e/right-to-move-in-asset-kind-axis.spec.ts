/**
 * 자산 종류 축 일원화 — 입주권 / 재개발APT (2026-08-13 사용자 지시).
 *
 *   입주권(`right_to_move_in`)      = 조합원입주권 양도 전담 (§166① · §95② 단서 · §89①4호)
 *   재개발APT(`redevelopment_apt`)  = 재개발·재건축으로 완공된 APT 양도 전담 (§166②)
 *
 * 종전 결함: `AssetSectionAcquisition.tsx`의 렌더 게이트가 `redevelopment_apt` 하나뿐이라
 * **입주권을 고르면 §166 입력 UI가 아예 없었다**(관리처분 인가일·권리가액·청산금 입력 불가).
 * API 변환·validate·엔진은 이미 두 종류를 모두 §166 경로로 처리하고 있었다 — UI만 빠져 있었다.
 *
 * 함께 정리한 것:
 *   - ① 「양도 대상」 라디오 폐지 — 자산 종류가 축을 결정하므로 이중 입력이었다
 *   - ②-a 「조합원 구분」은 완공APT 전용 — 입주권의 승계 여부는 ① 기본정보 「조합원 유형」이 받는다
 *     (전자는 §166 우회 산식(사례 48), 후자는 §95② LTHD 배제 — **다른 사실**)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(
  assetKind: "right_to_move_in" | "redevelopment_apt",
  redevSubject = "",
  settlementDirection: "pay" | "receive" = "pay",
  extraAsset: Record<string, unknown> = {},
) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind,
          redevSubject,
          acquisitionCause: "purchase",
          acquisitionDate: "2009-04-09",
          fixedAcquisitionPrice: "180000000",
          useEstimatedAcquisition: false,
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: settlementDirection,
          redevApprovalDate: "2016-10-23",
          redevRightsValue: "300000000",
          redevSettlementAmount: "50000000",
          redevPreApprovalExpenses: "0",
          redevPostApprovalExpenses: "0",
          redevActualAcquisitionPrice: "180000000",
          ...extraAsset,
        }],
        transferDate: "2026-03-02",
        filingDate: "2026-04-30",
        contractTotalPrice: "420000000",
        // ⑥ 「거주개월 분리 입력」은 1세대1주택 게이트를 탄다
        // (`Step1.tsx:233` — isOneHousehold === true && householdHousingCount === "1").
        // A-6·A-7이 그 카드의 자산종류 분기를 보려면 게이트가 먼저 열려 있어야 한다.
        isOneHousehold: true,
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openAcquisitionStep(
  page: Page,
  assetKind: "right_to_move_in" | "redevelopment_apt",
  redevSubject = "",
  settlementDirection: "pay" | "receive" = "pay",
  extraAsset: Record<string, unknown> = {},
) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(assetKind, redevSubject, settlementDirection, extraAsset),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: /취득정보/ }).first().click();
}

test.describe("자산 종류 축 — 입주권 / 재개발APT", () => {
  test("A-1: 입주권 자산에서 §166 입력 UI가 표시된다 (종전에는 아예 없었다)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");

    await expect(page.getByText("재개발 일정·금액", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("관리처분 인가일").first()).toBeVisible();
    await expect(page.getByText("권리가액").first()).toBeVisible();
    await expect(page.getByText("인가전 분 종전 부동산 취득가액").first()).toBeVisible();
  });

  test("A-2: ① 「양도 대상」 라디오가 폐지됐다 (자산 종류가 축)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");

    await expect(page.getByRole("radio", { name: /완공 APT 양도/ })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /입주권 양도/ })).toHaveCount(0);
  });

  test("A-3: 입주권 자산에는 ②-a 「조합원 구분」이 없다 (완공APT 전용)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");

    await expect(page.getByText("조합원 구분")).toHaveCount(0);
    // 입주권의 승계 여부는 ① 기본정보의 「조합원 유형」이 받는다.
    await expect(page.getByText("조합원 유형").first()).toBeVisible();
  });

  test("A-4: 재개발APT 자산에는 ②-a 「조합원 구분」이 남는다 (사례 48)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "redevelopment_apt");

    await expect(page.getByText("조합원 구분").first()).toBeVisible();
  });

  test("A-5: 저장된 「APT 자산 + 입주권 양도」는 입주권 자산으로 승격된다 (의미 보존)", async ({ page }) => {
    test.setTimeout(60_000);
    // 마이그레이션 대상 조합을 그대로 seed — 종전 UI로 저장 가능했던 상태.
    await openAcquisitionStep(page, "redevelopment_apt", "right");

    // 자산 종류 버튼이 「입주권」으로 승격돼 선택돼 있다.
    const selected = page.locator("button", { hasText: /^입주권$/ }).first();
    await expect(selected).toHaveClass(/bg-primary/);
    // 승격됐으므로 완공APT 전용 카드는 사라진다.
    await expect(page.getByText("조합원 구분")).toHaveCount(0);
  });

  /**
   * A-6·A-7 (2026-08-14) — 완공 APT 전용 입력 2종의 대칭 회귀.
   *
   * 둘 다 **신축 APT가 존재해야** 성립하는 사실이라 완공 전 권리 양도인 입주권에는 없다.
   * 종전에는 입주권 화면에 그대로 노출됐고, 값이 세액을 조용히 바꿨다(실측):
   *   ③-a 청산금 수령분 단독 신고 → 양도가액이 청산금 수령액으로 교체(양도차익 1.7억 소실)
   *   ⑥  거주개월 분리 입력       → 입주권 LTHD 14% → 68%
   */
  test("A-6: 입주권에는 완공APT 전용 입력 2종이 없다 (청산금 수령 · 1세대1주택)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in", "", "receive");

    await expect(page.getByText("청산금 수령분 단독 신고")).toHaveCount(0);
    await expect(page.getByText("거주개월 분리 입력", { exact: false })).toHaveCount(0);
    // 입주권 고유 입력은 그대로 있어야 한다 (과잉 숨김 방지).
    await expect(page.getByText("청산금 방향").first()).toBeVisible();
    await expect(page.getByText("권리가액").first()).toBeVisible();
  });

  test("A-7: 재개발APT에는 두 입력이 남는다 (사례 45·46 회귀 방지)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "redevelopment_apt", "", "receive");

    await expect(page.getByText("청산금 수령분 단독 신고").first()).toBeVisible();
    await expect(page.getByText("거주개월 분리 입력", { exact: false }).first()).toBeVisible();
  });

  /**
   * A-9~A-12 (2026-08-23) — 상단 축 A(일반 「취득가액 산정 방식」·「취득가액」) 제거 +
   * 승계조합원 입주권 전용 경로.
   *
   * 계획서: docs/02-design/features/right-to-move-in-top-acq-axis-removal.plan.md
   *
   * 종전 결함(실측):
   *   · 상단 축 A가 입주권에도 보였는데, 실거래가 모드에서는 **무시**되고(§166 섹션 필드가 정본)
   *     감정·매매사례를 고르면 취득가액이 **0**이 되어 오류 없이 과대과세됐다.
   *   · 승계조합원 입주권은 「승계조합원 모드를 ON 하세요」 안내가 화면에 없는 토글을 가리켜
   *     **어느 경로로도 계산할 수 없었다**.
   */
  test("A-9: 입주권(원조합원)에 상단 축 A가 없고 §166 입력은 그대로다", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");

    // ⚠️ `exact: true` 필수 — 대체 안내 카드가 「상단 일반 "취득가액 산정 방식·취득가액" 입력은
    //    표시하지 않습니다」로 **제목을 인용**하므로 substring 매칭이면 안내문에 걸린다.

    await expect(page.getByText("취득가액 산정 방식", { exact: true })).toHaveCount(0);
    await expect(page.getByText("매매사례가액", { exact: true })).toHaveCount(0);
    await expect(page.getByText("감정가액", { exact: true })).toHaveCount(0);
    // 대체 안내가 어디에 입력하는지 지목한다.
    await expect(page.getByText("재개발 §166①1호 인가전 분에서 차감").first()).toBeVisible();
    // 과잉 숨김 방지 — 입주권 고유 입력은 그대로.
    await expect(page.getByText("재개발 일정·금액 (시행령 §166①)").first()).toBeVisible();
    await expect(page.getByText("인가전 분 종전 부동산 취득가액").first()).toBeVisible();
  });

  test("A-10: 완공APT에도 상단 축 A는 없다 (기존 동작 회귀 확인)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "redevelopment_apt");

    await expect(page.getByText("취득가액 산정 방식", { exact: true })).toHaveCount(0);
    await expect(page.getByText("취득가액 — 재개발 §166②1호 자동 산정").first()).toBeVisible();
  });

  test("A-11: 승계조합원 입주권은 §166 카드 대신 전용 취득 카드가 나온다", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in", "", "pay", {
      isSuccessorRightToMoveIn: true,
      acquisitionDate: "2020-05-01",
      successorRightAcqPrice: "350000000",
      successorRightAddedContribution: "90000000",
    });

    // 전용 카드 — §97①1호 가목 실지거래가액 2칸
    await expect(page.getByText("조합원입주권 승계취득 정보").first()).toBeVisible();
    await expect(page.getByText("승계취득가액").first()).toBeVisible();
    await expect(page.getByText("취득 후 납입 추가분담금").first()).toBeVisible();
    // 합계 미리보기 (350,000,000 + 90,000,000)
    await expect(page.getByText("440,000,000").first()).toBeVisible();

    // §166 입력·상단 축 A는 모두 없다 — 승계자는 §166①의 적용 대상이 아니다.
    await expect(page.getByText("취득가액 산정 방식", { exact: true })).toHaveCount(0);
    await expect(page.getByText("권리가액", { exact: true })).toHaveCount(0);
    await expect(page.getByText("청산금 방향", { exact: true })).toHaveCount(0);
    await expect(page.getByText("인가전 분 종전 부동산 취득가액", { exact: true })).toHaveCount(0);
  });

  test("A-12: stale 완공APT 필드가 남아 있어도 입주권 화면이 정상 렌더된다", async ({ page }) => {
    test.setTimeout(60_000);
    // 완공APT 시절 값 3종을 주입 — 마이그레이션이 비워야 한다.
    await openAcquisitionStep(page, "right_to_move_in", "", "pay", {
      redevIsSuccessorMember: "yes",
      isAppraisalAcquisition: true,
      isSalesCaseAcquisition: true,
    });

    // stale `redevIsSuccessorMember="yes"`가 살아 있으면 ⑤ 카드가 숨겨지고
    // validate가 「준공일을 입력하세요」로 막는다(그 입력칸도 숨겨져 영구 차단).
    await expect(page.getByText("인가전 분 종전 부동산 취득가액").first()).toBeVisible();
    await expect(page.getByText("조합원 구분")).toHaveCount(0);
    await expect(page.getByText("준공일", { exact: false })).toHaveCount(0);
  });

  /**
   * A-13 (2026-08-23) — **계산까지 도달**하는지. 종전에는 승계조합원 입주권이
   * 「인가일은 취득일 이후여야 합니다. … "승계조합원 모드"를 ON 하세요」로 막혔고,
   * 그 안내가 가리키는 토글은 화면에 없어 **영구 차단**이었다(계획서 §2.4(3) 실측).
   *
   * 계산 결과도 확인한다 — §166 3분할이 아니라 §97①1호 가목 단순 차감이어야 한다.
   *   양도가액 420,000,000 − (승계취득가 350,000,000 + 추가분담금 20,000,000) = 50,000,000
   */
  test("A-13: 승계조합원 입주권이 계산까지 도달하고 §97①1호로 산정된다", async ({ page }) => {
    test.setTimeout(90_000);
    await openAcquisitionStep(page, "right_to_move_in", "", "pay", {
      isSuccessorRightToMoveIn: true,
      acquisitionDate: "2020-05-01",
      successorRightAcqPrice: "350000000",
      successorRightAddedContribution: "20000000",
    });

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }

    const rp = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await rp;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const body = await resp.json();
    const result = body.data?.result ?? body.data;
    expect(result.transferGain, "양도가액 − (승계취득가 + 추가분담금)").toBe(50_000_000);
    expect(result.longTermHoldingDeduction, "§95② 괄호 — 승계분 LTHD 없음").toBe(0);
    expect(result.redevelopmentDetail, "§166 3분할을 타면 안 된다").toBeUndefined();

    // 결과 화면이 실제로 렌더된다 (redevelopmentDetail 부재 경로 — 계획서 V-4)
    await expect(page.getByText(/양도차익/).first()).toBeVisible();
  });

  /**
   * A-14 (2026-08-23) — 청산금 **수령**은 취득가액을 깎는 사안이 아니라 **별개의 양도**다.
   *
   * 종전 hint는 「청산금을 수령한 경우는 현재 지원하지 않습니다」로만 적혀 있어, 사용자가
   * **신고 의무 자체를 모를 수** 있었다. 「미지원」과 「따로 신고해야 한다」는 전혀 다른 정보다.
   *
   * 근거: 국세청 **사전-2023-법규재산-0450**(2024-06-27) — 승계조합원이 이전고시 후 조합으로부터
   * 지급받은 청산금 상당액은 양도소득세 과세대상이며, 양도시기는 소유권 이전고시일의 다음날이고
   * §105에 따라 신고. 관련 법령이 §88·§98·§105이지 **§97(취득가액)이 아니다**.
   */
  test("A-14: 승계조합원 입주권에 청산금 수령 시 별도 신고 안내가 나온다", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in", "", "pay", {
      isSuccessorRightToMoveIn: true,
      acquisitionDate: "2020-05-01",
      successorRightAcqPrice: "350000000",
    });

    // ⚠️ exact: true — 추가분담금 hint에도 「청산금」이 나온다(제목만 잡기 위함)
    await expect(page.getByText("청산금을 수령한 경우", { exact: true })).toBeVisible();

    // 핵심 — 「지원하지 않는다」로 끝나지 않고 **신고 의무**를 알려야 한다
    await expect(page.getByText(/별개의 양도/).first()).toBeVisible();
    await expect(page.getByText(/따로 양도소득세를 신고/).first()).toBeVisible();

    // 종전 문구가 남아 있으면 안 된다 (정정이 실제로 반영됐는지)
    await expect(page.getByText("청산금을 수령한 경우는 현재 지원하지 않습니다")).toHaveCount(0);
  });

  test("A-8: ④ 섹션 조문이 자산 종류를 따른다 (입주권 §166① / 완공APT §166②1호)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");
    await expect(page.getByText("재개발 일정·금액 (시행령 §166①)").first()).toBeVisible();

    await openAcquisitionStep(page, "redevelopment_apt");
    await expect(page.getByText("재개발 일정·금액 (시행령 §166②1호)").first()).toBeVisible();
  });
});
