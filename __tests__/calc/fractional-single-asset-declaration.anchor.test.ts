/**
 * anchor — R4 「단건 공유지분」 선언 토글 (Gate-A 예외).
 *
 * 계획서: `docs/02-design/features/transfer-fractional-single-asset-declaration.plan.md`
 *
 * ## 무엇이 깨져 있었나
 *
 * ① 기본정보는 「공유 지분율」 칸과 「모든 금액을 100% 기준으로 입력하세요」 안내를
 * **단건에도 렌더**한다(`AssetSectionBasic.tsx` — `splitMode !== "fractional"`).
 * 그런데 값을 넣으면 `transfer-tax-validate-asset.ts`의 Gate-A가 무조건 막았다 —
 * **화면에 입력칸이 있는데 통과 경로가 없는 dead-end**
 * (memory `feedback_ui_gate_removes_sole_input_path`).
 *
 * 차단은 부담부증여 특유가 아니었다. **전 양도형태**의 축 A를 함께 막았다(D1·D3).
 *
 * ## 왜 그냥 열면 안 되는가
 *
 * 폼 데이터로는 두 사용자가 구별되지 않는다:
 *  - 축 A(공유 소유): 물건의 60%만 내 것 → 이 1건 계산이 **정확**
 *  - 축 B 오입력: 100% 내 것인데 60%+40% 2회 취득 → 나머지 40%가 **누락 = 세액 과소**
 *
 * ⇒ 사용자 선언으로 가른다. **자동판정 금지** — 판별 불가한 것을 추정하면 조용히 틀린다.
 */
import { describe, it, expect } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const BLOCK = /단독으로 계산할 수 없습니다/;

const asset = (over: Record<string, unknown>): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-01",
    fixedAcquisitionPrice: "300,000,000",
    standardPriceAtTransfer: "800,000,000",
    ...over,
  }) as AssetForm;

const form = (assets: AssetForm[]): TransferFormData =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    contractTotalPrice: "1,000,000,000",
    householdHousingCount: "2",
    houses: [],
    presaleRights: [],
    assets,
  }) as unknown as TransferFormData;

const msgs = (assets: AssetForm[]) =>
  collectStepIssues(0, form(assets) as never).map((i) => i.message);
const blocked = (assets: AssetForm[]) => msgs(assets).some((m) => BLOCK.test(m));

/** 부담부증여 자산 — R4 본체(축 A × §159). */
const bg = (over: Record<string, unknown> = {}) =>
  asset({
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "200,000,000",
    bgMortgageDebtAmount: "100,000,000",
    standardPriceAtAcq: "400,000,000",
    ...over,
  });

describe("R4 D — 단건 공유지분 선언 게이트", () => {
  it("D1 선언 OFF · 지분 60% · 일반양도 → 차단 (회귀 가드 — 현행 유지)", () => {
    expect(blocked([asset({ ownershipNumerator: "60", ownershipDenominator: "100" })])).toBe(true);
  });

  it("D2 선언 ON · 지분 60% · 일반양도 → 통과", () => {
    expect(
      blocked([
        asset({
          ownershipNumerator: "60",
          ownershipDenominator: "100",
          ownershipRemainderThirdParty: "yes",
        }),
      ]),
    ).toBe(false);
  });

  it("D3 선언 OFF/ON · 지분 50% · 부담부증여 → 차단/통과 (R4 본체)", () => {
    expect(blocked([bg({ ownershipNumerator: "50", ownershipDenominator: "100" })])).toBe(true);
    expect(
      blocked([
        bg({
          ownershipNumerator: "50",
          ownershipDenominator: "100",
          ownershipRemainderThirdParty: "yes",
        }),
      ]),
    ).toBe(false);
  });

  it("D4 지분 100% — 선언 유무와 무관하게 통과 (토글이 단독 소유에 간섭하지 않는다)", () => {
    expect(blocked([asset({})])).toBe(false);
    expect(blocked([asset({ ownershipRemainderThirdParty: "yes" })])).toBe(false);
  });

  it("D5 다자산(축 B) — Gate-A 미발동 · 선언 없이도 통과", () => {
    // `form.assets.length === 1` 조건이 살아 있는지 고정한다. 축 B는 별개 게이트 소관이다.
    const a1 = asset({ assetId: 1, ownershipNumerator: "60", ownershipDenominator: "100" });
    const a2 = asset({ assetId: 2, ownershipNumerator: "40", ownershipDenominator: "100" });
    expect(blocked([a1, a2])).toBe(false);
  });

  it("D6 차단 메시지는 두 갈래를 모두 제시한다", () => {
    const m = msgs([asset({ ownershipNumerator: "60", ownershipDenominator: "100" })]).find((x) =>
      BLOCK.test(x),
    )!;
    expect(m).toContain("별도 자산으로 추가");
    expect(m).toContain("타인 소유");
  });

  it("D7 부담부증여 × 축 B는 여전히 차단된다 (Gate-B 무간섭 — D5와 짝)", () => {
    // 선언을 켜도 축 B의 부담부증여는 `transfer-tax-validate.ts` Gate-B가 막는다.
    const a1 = bg({ assetId: 1, ownershipNumerator: "60", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
    const a2 = bg({ assetId: 2, ownershipNumerator: "40", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
    expect(
      msgs([a1, a2]).some((m) => /부담부증여·공익수용은 지분 분할 취득과 함께/.test(m)),
    ).toBe(true);
  });
});
