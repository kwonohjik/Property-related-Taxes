/**
 * 상속·증여 UI 리뷰 — G4 배치(게이트 OFF 값 정리) 순수 anchor.
 *
 * 이 배치의 공통 형태: «화면 게이트가 닫아 버린 칸»을 ⑧validate·⑫Zod·④API가 계속
 * 보고 있어서, 사용자가 볼 수도 지울 수도 없는 값이 차단하거나 계산을 바꾼다.
 * ⇒ 판정 술어를 «렌더 게이트와 같은 것»으로 맞추거나, 게이트가 닫힐 때 값도 정리한다.
 *
 * 각 축은 양성(요구한다)·음성(요구하지 않는다) 쌍으로 둔다 —
 * 음성만 두면 구별력이 0이다(memory feedback_negative_anchor_needs_positive_twin).
 */

import { describe, it, expect } from "vitest";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import {
  INITIAL_DEEMED,
  makeRcShareholderRow,
  makeRcIntermediaryRow,
  makeRcSalesRow,
} from "@/components/calc/deemed-gift/deemed-form-state";
import type { DeemedFormState } from "@/components/calc/deemed-gift/shared";
import {
  deriveIsHeirFromHeir,
  deriveBeneficiaryTypeFromHeir,
} from "@/lib/calc/prior-gift-donee-derive";
import { convertibleBondItemSchema } from "@/lib/validators/estate-item-schema";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

// ────────────────────────────────────────────────
// §45의3 일감몰아주기 — roster 공통 픽스처
// 다른 규칙(R-1~R-4·R-6 매출처)에 먼저 걸리면 이 anchor가 측정하려는 축에
// 도달조차 못 하므로, 그 앞단을 전부 통과하는 최소 폼을 만든다.
// ────────────────────────────────────────────────
function rcForm(over: Partial<DeemedFormState> = {}): DeemedFormState {
  const sh = (id: string, isCorporate: boolean, pct: string) => ({
    ...makeRcShareholderRow(id),
    name: `주주${id}`,
    relation: "self",
    directRatioPctStr: pct,
    isCorporate,
  });
  return {
    ...INITIAL_DEEMED,
    type: "related_corp",
    giftDate: "2024-12-31",
    rcEnterpriseSize: "large",
    rcTotalSalesStr: "1000000000",
    rcPreTaxAdjOperatingIncomeStr: "100000000",
    rcTaxableIncomeStr: "100000000",
    rcCorporateTaxNetStr: "10000000",
    rcShareholders: [sh("a", false, "60"), sh("b", false, "40")],
    rcIntermediaryCorps: [],
    rcSalesPartners: [
      { ...makeRcSalesRow("s1"), name: "매출처1", salesAmountStr: "1000000000" },
    ],
    ...over,
  } as DeemedFormState;
}

describe("G4 — 게이트 OFF 값 정리 (순수 축)", () => {
  // ── IG-020 · 간접출자법인 빈 행 ─────────────────────────
  it("G-1 (음성): 법인주주가 없으면 섹션 3이 안 그려지므로 빈 간접출자법인 행을 요구하지 않는다", () => {
    const form = rcForm({
      rcIntermediaryCorps: [makeRcIntermediaryRow("i1")], // corpShareholderId: ""
    });
    expect(validateDeemedInput(form)).toBeNull();
  });

  it("G-2 (양성): 법인주주가 있으면 섹션 3이 그려지므로 빈 행을 그대로 차단한다", () => {
    const form = rcForm({
      rcShareholders: [
        { ...makeRcShareholderRow("a"), name: "주주a", relation: "self", directRatioPctStr: "60", isCorporate: true },
        { ...makeRcShareholderRow("b"), name: "주주b", relation: "self", directRatioPctStr: "40", isCorporate: false },
      ],
      rcIntermediaryCorps: [makeRcIntermediaryRow("i1")],
    });
    expect(validateDeemedInput(form)).toMatch(/법인주주를 선택하세요/);
  });

  // ── IG-022 · §⑭ 지배주주등 보유비율 ──────────────────────
  it("G-3 (음성): 비특수관계 매출처의 §⑭ 행은 블록이 언마운트되므로 요구하지 않는다", () => {
    const form = rcForm({
      rcSalesPartners: [
        {
          ...makeRcSalesRow("s1"),
          name: "매출처1",
          salesAmountStr: "1000000000",
          isRelated: false,
          rulingStakes: [{ shareholderId: "", ratioPctStr: "" }],
        },
      ],
    });
    expect(validateDeemedInput(form)).toBeNull();
  });

  it("G-4 (음성): 과세제외유형을 고른 매출처도 마찬가지다 — 엔진도 같은 술어로 건너뛴다", () => {
    const form = rcForm({
      rcSalesPartners: [
        {
          ...makeRcSalesRow("s1"),
          name: "매출처1",
          salesAmountStr: "1000000000",
          isRelated: true,
          exclusionType: "sec10_1",
          rulingStakes: [{ shareholderId: "", ratioPctStr: "" }],
        },
      ],
    });
    expect(validateDeemedInput(form)).toBeNull();
  });

  it("G-5 (양성): 특수관계 + 과세제외 없음이면 블록이 그려지므로 빈 §⑭ 행을 차단한다", () => {
    const form = rcForm({
      rcSalesPartners: [
        {
          ...makeRcSalesRow("s1"),
          name: "매출처1",
          salesAmountStr: "1000000000",
          isRelated: true,
          exclusionType: "",
          rulingStakes: [{ shareholderId: "", ratioPctStr: "" }],
        },
      ],
    });
    expect(validateDeemedInput(form)).toMatch(/§⑭ 1번 주주를 선택하세요/);
  });

  // ── IG-098 · 현물출자 소액주주 의제 ──────────────────────
  const conForm = (over: Partial<DeemedFormState>) =>
    buildDeemedGiftInput({
      ...INITIAL_DEEMED,
      type: "contribution",
      giftDate: "2024-12-31",
      conCaseType: "low", // 저가인수 — 소액주주 의제 토글이 있는 쪽
      conSmallImputation: true,
      ...over,
    } as unknown as DeemedFormState) as { smallShareholderImputation?: boolean };

  it("G-6 (음성): 당사자 명부가 켜지면 소액주주 의제 토글이 사라지므로 ④도 보내지 않는다", () => {
    expect(conForm({ conParties: [] } as Partial<DeemedFormState>).smallShareholderImputation).toBeUndefined();
  });

  it("G-7 (양성): 명부가 없으면 토글이 화면에 있으므로 그대로 전달한다", () => {
    expect(conForm({ conParties: undefined }).smallShareholderImputation).toBe(true);
  });

  // ── IG-084 · 대습상속인 isHeir ─────────────────────────
  it("G-8: 대습상속인은 isHeir:false여도 상속인이다 — 엔진 isRealHeir과 같은 술어", () => {
    const substitute = {
      id: "h1",
      relation: "other",
      isHeir: false,
      substituteGroupId: "g1",
    } as unknown as Heir;
    expect(deriveIsHeirFromHeir(substitute)).toBe(true);
    // §13 분류도 함께 따라온다 — 사전증여 합산기간 10년(비상속인 5년이 아니다)
    expect(deriveBeneficiaryTypeFromHeir(substitute)).toBe("heir");
  });

  it("G-9 (대조군): 대습이 아닌 「기타」 isHeir:false는 그대로 비상속인이다", () => {
    const other = { id: "h2", relation: "other", isHeir: false } as unknown as Heir;
    expect(deriveIsHeirFromHeir(other)).toBe(false);
    expect(deriveBeneficiaryTypeFromHeir(other)).toBe("legatee");
  });

  // ── IG-119 · 전환사채 거래소 ON × 전환 토글 ────────────────
  const cbBase = {
    id: "cb-1",
    category: "convertible_bond",
    name: "신주인수권증서",
    cbSecurityType: "preemptive_right",
    cbConvertible: true,
  };

  it("G-10 (음성): 거래소 ON이면 전환 블록이 언마운트되므로 그 안의 칸을 요구하지 않는다", () => {
    const r = convertibleBondItemSchema.safeParse({
      ...cbBase,
      cbTradedOnExchange: true,
      cbExchange2mAvg: 12_000,
    });
    expect(r.success).toBe(true);
  });

  it("G-11 (양성): 거래소 OFF면 블록이 화면에 있으므로 그대로 요구한다", () => {
    const r = convertibleBondItemSchema.safeParse({
      ...cbBase,
      cbTradedOnExchange: false,
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.success ? [] : r.error.issues)).toMatch(
      /권리락 전 주식가액을 입력하세요/,
    );
  });
});
