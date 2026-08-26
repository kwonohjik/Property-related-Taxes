/** @vitest-environment jsdom */
/**
 * anchor — 입주권 §⑥ 비과세 카드의 두 안내가 **프로덕션 경로에서** 도달한다 (U1-03)
 *
 * ## 왜 종전 anchor가 못 잡았나 — 진입점이 결함보다 아래였다
 *
 * `RedevelopmentRightExemptionSection`은 `wasRegulatedAtAcquisition`·`transferPrice`
 * 두 optional prop으로 「12억 초과 안분 안내」와 「거주요건 미충족 경고」를 켠다.
 * 그런데 **프로덕션의 유일한 렌더 경로**는 그 둘을 한 번도 넘기지 않았다:
 *
 *   Step1 → CompanionAssetsSection → CompanionAssetCard → AssetSectionAcquisition
 *         → RedevelopmentBlock → RedevelopmentRightExemptionSection
 *
 * `AssetSectionAcquisition.tsx:328`이 `asset`·`onChange`·`isOneHouseSingle` 3개만 넘기고,
 * 위 4계층 어디에도 두 prop이 없다 — **명시 prop 매핑 침묵 strip**
 * (memory `feedback_explicit_prop_mapping_strip`). 기본값이 `false`/`undefined`라
 * `wasRegulatedAtAcquisition`은 항상 false, `parseAmount(undefined ?? "") = 0`이라
 * `isHighValue`도 항상 false가 된다.
 *
 * 기존 anchor 2개(`redev-exemption-toggle-tri-state` · `redev-163-9-priority-notice`)는
 * `RedevelopmentBlock`을 **직접 렌더하면서 두 prop을 모두 넘긴다**. 그래서 배선 단절을
 * 구조적으로 관측할 수 없었다 — 통과가 곧 도달을 뜻하지 않았다.
 *
 * ⇒ **이 anchor는 `Step1`에서 시작한다.** 중간 계층이 하나라도 prop을 떨어뜨리면 실패한다.
 *
 * ## 2026-08-26 실측 (수정 전)
 *
 * 입주권 · 양도가액 20억 · 조정대상지역 취득 · §⑥ 토글 ON · 보유 36개월 · 거주 10개월:
 *
 * | 화면 | 실측 |
 * |---|---|
 * | 「양도가액 12억 초과 → … 안분과세 적용」 | **뜨지 않음** |
 * | 「⚠️ 비과세 요건 미충족 가능성」(거주) | **뜨지 않음** |
 *
 * 같은 자산을 `RedevelopmentBlock`에 두 prop을 넘겨 직접 렌더하면 둘 다 뜬다.
 *
 * ## 세액 영향 — 없다. 그래서 더 조용했다
 *
 * 두 분기 모두 **안내·경고 표시 전용**이고 store에 쓰지 않는다. 다만 §89①4호 가목
 * 자기선언의 **유일한 검증 장치**가 무력화된 상태였다.
 *
 * ## 조문
 *
 * · 「소득세법」 §89①4호 각 목 외의 부분 단서 — 「해당 조합원입주권의 양도 당시 실지거래가액이
 *   12억원을 초과하는 경우에는 양도소득세를 과세한다」(12억 안내의 근거).
 * · 「소득세법 시행령」 §154① — 「취득 당시에 … 조정대상지역에 있는 주택의 경우에는 …
 *   그 보유기간 중 거주기간이 2년 이상인 것」(거주 경고의 근거).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const HIGH_VALUE = "2000000000"; // 20억 — 12억 초과
const LOW_VALUE = "900000000"; //  9억 — 12억 이하

function rightAsset(over: Partial<AssetForm> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  a.assetKind = "right_to_move_in";
  a.redevSubject = "right";
  a.acquisitionDate = "2010-01-01";
  a.actualSalePrice = HIGH_VALUE;
  a.redevApprovalDate = "2020-10-23";
  a.redevRightsValue = "800000000";
  a.redevSettlementDirection = "pay";
  a.redevSettlementAmount = "100000000";
  // §⑥ 토글 ON — 경고는 **자기선언을 검증**하는 것이라 선언이 전제다.
  a.redevExemptionEligibleAtApproval = "yes";
  a.redevPriorHouseHoldingMonths = "36"; // 보유 경고는 끈다 — 거주 축만 관측
  a.redevPriorHouseResidenceMonths = "10";
  return Object.assign(a, over);
}

/**
 * **프로덕션 경로 그대로** 렌더한다 — 중간 계층이 prop을 떨어뜨리면 여기서 드러난다.
 *
 * `errorMessage`를 주는 이유는 `CompanionAssetCard`의 `forceOpenAll = !!errorMessage`로
 * ③ 취득정보 섹션을 펼치기 위해서다(접혀 있으면 카드가 DOM에 없다).
 */
function renderStep1(asset: AssetForm, form: Partial<TransferFormData> = {}): string {
  const formData: TransferFormData = {
    ...createDefaultTransferFormData(),
    transferDate: "2024-06-01",
    contractTotalPrice: asset.actualSalePrice,
    assets: [asset],
    ...form,
  };
  render(
    <Step1 form={formData} onChange={() => {}} errorAssetIndex={0} errorMessage="섹션 강제 펼침" />,
  );
  return document.body.textContent ?? "";
}

const HIGH_VALUE_NOTICE = "12억 초과 → §89①4호 각 목 외의 부분 단서 안분과세 적용";
const WARNING_CARD = "비과세 요건 미충족 가능성";

/**
 * 화면 전체 텍스트를 `toContain`으로 단언하면 실패 메시지에 Step1 전체가 찍혀 읽을 수 없다.
 * **불리언으로 좁혀** 어떤 안내가 없는지만 남긴다.
 */
function shows(body: string, needle: string): boolean {
  return body.includes(needle);
}

describe("U1-03 · 12억 초과 안분 안내 — 프로덕션 경로 도달", () => {
  it("U1-03-00: 대조군 — §⑥ 카드 자체는 프로덕션 경로에서 렌더된다", () => {
    expect(shows(renderStep1(rightAsset()), "1세대1입주권 비과세 요건"), "§⑥ 카드 미렌더").toBe(true);
  });

  it("U1-03-01: 🔑 양도가액 20억 → 12억 초과 안내가 뜬다", () => {
    // 수정 전: `transferPrice` prop이 4계층 어디에도 없어 `parseAmount("") = 0` → 항상 false.
    expect(shows(renderStep1(rightAsset()), HIGH_VALUE_NOTICE), "12억 초과 안내 미노출").toBe(true);
  });

  it("U1-03-02: 대조군 — 양도가액 9억이면 뜨지 않는다 (12억이 실제 경계다)", () => {
    expect(shows(renderStep1(rightAsset({ actualSalePrice: LOW_VALUE })), HIGH_VALUE_NOTICE)).toBe(false);
  });

  it("U1-03-03: 경계 — 12억 정확히는 「초과」가 아니다", () => {
    expect(
      shows(renderStep1(rightAsset({ actualSalePrice: "1200000000" })), HIGH_VALUE_NOTICE),
      "12억 정확히에서 안내가 떴다",
    ).toBe(false);
    cleanup();
    expect(
      shows(renderStep1(rightAsset({ actualSalePrice: "1200000001" })), HIGH_VALUE_NOTICE),
      "12억+1원에서 안내가 없다",
    ).toBe(true);
  });
});

describe("U1-03 · 거주요건 미충족 경고 — 프로덕션 경로 도달", () => {
  it("U1-03-04: 🔑 조정대상지역 취득 + 거주 10개월 → 경고가 뜬다", () => {
    // 수정 전: `wasRegulatedAtAcquisition` prop이 없어 기본값 false → residenceWarning 항상 false.
    const body = renderStep1(rightAsset(), { wasRegulatedAtAcquisition: true });
    expect(shows(body, WARNING_CARD), "경고 카드 미노출").toBe(true);
    expect(shows(body, "거주 월수 10개월"), "거주 경고 문구 미노출").toBe(true);
  });

  it("U1-03-05: 대조군 — 비조정대상지역이면 거주 경고가 없다 (게이트가 실제 축이다)", () => {
    const body = renderStep1(rightAsset(), { wasRegulatedAtAcquisition: false });
    expect(shows(body, WARNING_CARD), "비조정대상지역인데 경고가 떴다").toBe(false);
  });

  it("U1-03-06: 보유 24개월 미만 경고는 이 prop과 무관하다 (카드 자체는 종전에도 도달했다)", () => {
    const body = renderStep1(rightAsset({ redevPriorHouseHoldingMonths: "10" }), {
      wasRegulatedAtAcquisition: false,
    });
    expect(shows(body, WARNING_CARD)).toBe(true);
    expect(shows(body, "보유 월수 10개월")).toBe(true);
  });

  it("U1-03-07: §⑥ 토글 OFF면 경고가 없다 (자기선언이 전제)", () => {
    const body = renderStep1(rightAsset({ redevExemptionEligibleAtApproval: "" }), {
      wasRegulatedAtAcquisition: true,
    });
    expect(shows(body, WARNING_CARD), "토글 OFF인데 경고가 떴다").toBe(false);
  });
});
