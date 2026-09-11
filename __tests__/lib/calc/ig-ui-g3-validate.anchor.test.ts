/**
 * 상속·증여 UI 리뷰 G3 — ⑧validate 차단 축 anchor.
 *
 * ## 이 배치의 공통 결함 형태
 *
 * 「미입력 → 조용히 0」이다. 엔진이 곱셈 인자를 0으로 받으면 증여재산가액이 0원이 되고,
 * **틀린 제외 사유**(「이익이 기준금액 미만」·「증자 후 1주가가 인수가 이하 — 이익 없음」)까지
 * 함께 표시된다. 사용자에게는 과세 대상이 아닌 것으로 보인다.
 *
 * 저장소 원칙은 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」이므로 ⑧에서 막는다.
 * 각 항목마다 **양성 쌍둥이**(값을 채우면 통과)를 붙여 「항상 막는다」로 퇴화하지 않게 한다.
 */
import { describe, it, expect } from "vitest";

import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM as GIFT_INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type { FormState as GiftFormState } from "@/components/calc/gift-tax-form-shared";
import { validateFamilyBusinessEnterpriseSize } from "@/lib/calc/inheritance-validate";

// 공통 선행 검사(증여일 등)를 통과시키는 최소 기반 — 이 anchor가 재는 축은 그 «다음»이다.
const D = (patch: Partial<DeemedFormState>): DeemedFormState =>
  ({ ...INITIAL_DEEMED, giftDate: "2026-01-01", ...patch }) as DeemedFormState;

// ════════════════════════════════════════════════════
// IG-017 — 합병 §38 「대주주등 주식수」
// ════════════════════════════════════════════════════

describe("[G3-A] IG-017 — 합병 대주주등 주식수는 이익에 곱해지는 유일한 수량이다", () => {
  const base = {
    type: "merger" as const,
    mrgFaceValue: "5000",
    mrgOvervaluedPrice: "3000",
  };

  it("A-1: 🔴 주식 외 재산 교부(§28③2) — 비면 차단된다 (형제 인스턴스)", () => {
    const err = validateDeemedInput(D({ ...base, mrgCaseType: "non_stock", mrgMajorShares: "" }));
    expect(err).toBe("대주주등 주식수를 입력하세요");
  });

  it("A-2: 양성 쌍둥이 — 채우면 이 칸으로는 막지 않는다", () => {
    const err = validateDeemedInput(
      D({ ...base, mrgCaseType: "non_stock", mrgMajorShares: "1000" }),
    );
    expect(err).not.toBe("대주주등 주식수를 입력하세요");
  });

  it("A-3: 🔴 주식교부 단일 대주주 모드 — 비면 차단된다", () => {
    const err = validateDeemedInput(
      D({
        type: "merger",
        mrgCaseType: "stock",
        mrgUseShareholders: false,
        mrgOvervaluedPrice: "3000",
        mrgExchangedShares: "500",
        mrgMergedPriceMode: "direct",
        mrgMergedPrice: "4000",
        mrgMajorShares: "",
      }),
    );
    expect(err).toBe("대주주등 주식수를 입력하세요");
  });

  it("A-4: 양성 쌍둥이 — 주주 매트릭스 ON 경로는 이 칸을 요구하지 않는다 (④가 0을 보낸다)", () => {
    const err = validateDeemedInput(
      D({
        type: "merger",
        mrgCaseType: "stock",
        mrgUseShareholders: true,
        mrgOvervaluedPrice: "3000",
        mrgMajorShares: "",
      }),
    );
    expect(err).not.toBe("대주주등 주식수를 입력하세요");
  });
});

// ════════════════════════════════════════════════════
// IG-016 — 증자 §39 「이익 귀속 주식수」
// ════════════════════════════════════════════════════

describe("[G3-B] IG-016 — 증자 이익 귀속 주식수", () => {
  const base = {
    type: "capital_increase" as const,
    ciPrePrice: "10000",
    ciPreShares: "10000",
  };

  it("B-1: 🔴 비면 차단되고, 메시지가 하위유형 라벨을 그대로 쓴다", () => {
    const err = validateDeemedInput(D({ ...base, ciForfeitedShares: "" }));
    expect(err).toMatch(/입력하세요$/);
    expect(err).not.toBeNull();
    // 라벨 재사용 — 「실권주수」·「직접배정 신주수」·「초과배정 신주수」 중 하나
    expect(err).toMatch(/주수|신주수/);
  });

  it("B-2: 양성 쌍둥이 — 채우면 이 칸으로는 막지 않는다", () => {
    const err = validateDeemedInput(D({ ...base, ciForfeitedShares: "300" }));
    expect(err).toBeNull();
  });
});

// ════════════════════════════════════════════════════
// IG-015 — 저가감자 산식 인자 2칸
// ════════════════════════════════════════════════════

describe("[G3-C] IG-015 — 저가감자는 ⑧이 지키던 칸이 산식에 안 쓰였다", () => {
  const base = {
    type: "capital_decrease" as const,
    cdCaseType: "low" as const,
    cdUseShareholders: false,
    cdSharePrice: "5000",
    cdTotalShares: "1000",
  };

  it("C-1: 🔴 대주주등 감자후 지분비율이 비면 차단된다", () => {
    const err = validateDeemedInput(D({ ...base, cdMajorRatioPct: "", cdRelatedShares: "500" }));
    expect(err).toBe("대주주등 감자후 지분비율을 입력하세요");
  });

  it("C-2: 🔴 대주주등 특수관계인 감자 주식수가 비면 차단된다", () => {
    const err = validateDeemedInput(D({ ...base, cdMajorRatioPct: "30", cdRelatedShares: "" }));
    expect(err).toBe("대주주등 특수관계인 감자 주식수를 입력하세요");
  });

  it("C-3: 양성 쌍둥이 — 둘 다 채우면 통과한다", () => {
    const err = validateDeemedInput(D({ ...base, cdMajorRatioPct: "30", cdRelatedShares: "500" }));
    expect(err).toBeNull();
  });
});

// ════════════════════════════════════════════════════
// IG-018 — 전환주식 시점별 분모 신주수
// ════════════════════════════════════════════════════

describe("[G3-D] IG-018 — 전환주식은 한 시점만 비어도 결과가 뒤집힌다", () => {
  const base = {
    type: "convertible_stock" as const,
    csDirection: "high" as const,
    csSubType: "third_party" as const,
    csConvPrePrice: "10000",
    csConvPreShares: "10000",
    csIssuePrePrice: "9000",
    csIssuePreShares: "10000",
  };

  it("D-1: 🔴 전환 시점 분모 신주수가 비면 차단된다", () => {
    const err = validateDeemedInput(
      D({ ...base, csConvRatioDenomShares: "", csIssueRatioDenomShares: "100" }),
    );
    expect(err).toBe("전환 시점 분모 신주수를 입력하세요");
  });

  it("D-2: 🔴 발행 시점 분모 신주수가 비면 차단된다", () => {
    const err = validateDeemedInput(
      D({ ...base, csConvRatioDenomShares: "100", csIssueRatioDenomShares: "" }),
    );
    expect(err).toBe("발행 시점 분모 신주수를 입력하세요");
  });

  it("D-3: 양성 쌍둥이 — 둘 다 채우면 통과한다", () => {
    const err = validateDeemedInput(
      D({ ...base, csConvRatioDenomShares: "100", csIssueRatioDenomShares: "100" }),
    );
    expect(err).toBeNull();
  });

  it("D-4: 양성 쌍둥이 — 실권주 미배정(needsRatio=false)은 요구하지 않는다", () => {
    const err = validateDeemedInput(
      D({
        ...base,
        csSubType: "forfeited_realloc",
        csConvRatioDenomShares: "",
        csIssueRatioDenomShares: "",
      }),
    );
    expect(err).toBeNull();
  });
});

// ════════════════════════════════════════════════════
// IG-019 — 초과배당 정산에는 증여자 관계가 필수다
// ════════════════════════════════════════════════════

describe("[G3-E] IG-019 — 정산을 켜면 관계 선택은 「선택」이 아니다", () => {
  // 앞선 F1~F4(주주 roster) 검사를 통과시키는 최소 구성 — 이 anchor가 재는 축은 F7 «다음»이다.
  const base = {
    type: "excess_dividend" as const,
    edSettlementMode: true,
    edActualIncomeTax: "0",
    edIncomeTaxMode: "separate" as const,
    edSeparateTaxAmount: "0",
    edShareholders: [
      {
        id: "s1",
        name: "최대주주",
        role: "major_shareholder" as const,
        ownershipRatioPctStr: "60",
        actualDividendStr: "0",
      },
      {
        id: "s2",
        name: "특수관계인",
        role: "related_party" as const,
        ownershipRatioPctStr: "40",
        actualDividendStr: "100000000",
      },
    ],
  };

  it("E-1: 🔴 관계 미선택이면 차단된다 (엔진은 정산을 아예 돌리지 않는다)", () => {
    const err = validateDeemedInput(D({ ...base, edDonorRelationship: undefined }));
    expect(err).toBe("정산 계산에는 증여자와의 관계 선택이 필요합니다");
  });

  it("E-2: 양성 쌍둥이 — 관계를 고르면 이 칸으로는 막지 않는다", () => {
    const err = validateDeemedInput(D({ ...base, edDonorRelationship: "lineal_ascendant_adult" }));
    expect(err).not.toBe("정산 계산에는 증여자와의 관계 선택이 필요합니다");
  });

  it("E-3: 양성 대조군 — 정산 OFF면 관계가 없어도 막지 않는다", () => {
    const err = validateDeemedInput(
      D({ ...base, edSettlementMode: false, edDonorRelationship: undefined }),
    );
    expect(err).not.toBe("정산 계산에는 증여자와의 관계 선택이 필요합니다");
  });
});

// ════════════════════════════════════════════════════
// IG-086 · IG-102 · IG-161 — 증여 폼 ⑧ ↔ ⑫ 미러링
// ════════════════════════════════════════════════════

describe("[G3-F] 증여 폼 step3 — ⑧이 ⑫와 같은 조합을 막는다", () => {
  const G = (patch: Partial<GiftFormState>): GiftFormState =>
    ({ ...GIFT_INITIAL_FORM, ...patch }) as GiftFormState;

  it("F-1: 🔴 IG-086 — 납부지연가산세 ON + 법정납부기한 미입력은 차단된다", () => {
    const err = validateStep(3, G({ applyLatePaymentPenalty: true, paymentDeadline: "" }));
    expect(err).toContain("법정납부기한을 입력하세요");
    // 상속과 같은 근거 문구를 쓴다 (두 세목 동작 일치)
    expect(err).toContain("§47의4①1호");
  });

  it("F-2: 양성 쌍둥이 — 기한을 채우면 이 축으로는 막지 않는다", () => {
    const err = validateStep(
      3,
      G({ applyLatePaymentPenalty: true, paymentDeadline: "2026-01-31" }),
    );
    expect(err ?? "").not.toContain("법정납부기한을 입력하세요");
  });

  it("F-3: 양성 대조군 — 토글 OFF면 기한이 없어도 막지 않는다", () => {
    const err = validateStep(3, G({ applyLatePaymentPenalty: false, paymentDeadline: "" }));
    expect(err ?? "").not.toContain("법정납부기한을 입력하세요");
  });

  /** 앞선 sub 루프(관계 미선택·§47② 동일그룹·증여재산 필수)를 통과하는 최소 추가 건. */
  const makeSub = (patch: Record<string, unknown> = {}) => {
    const sub = {
      ...GIFT_INITIAL_FORM,
      // 주 건의 기본 증여자는 "father"다 — 같은 §47② 그룹인 "mother"를 쓰면 그 검사에서 먼저 막힌다.
      donor: "spouse" as const,
      giftDate: "2026-01-01",
      giftItems: [
        { id: "g1", category: "deposit", name: "예금", marketValue: 100_000_000 },
      ],
      ...patch,
    };
    delete (sub as Record<string, unknown>).simultaneousGiftForms;
    return sub as never;
  };

  it("F-4: 🔴 IG-102·IG-161 — 동시증여 다중 건 + 대납은 ⑧에서 막힌다 (종전엔 서버 400)", () => {
    const sub = makeSub();
    const err = validateStep(
      3,
      G({
        donorPaysGiftTax: true,
        simultaneousGiftForms: [sub],
      }),
    );
    // Zod ⑫ superRefine과 **같은 문구**여야 한다
    expect(err).toBe("동시증여 다중 건 계산과 대납(代納)은 현재 함께 계산할 수 없습니다.");
  });

  it("F-5: 🔴 추가 건 자신의 대납도 막는다", () => {
    const sub = makeSub({ donorPaysGiftTax: true });
    const err = validateStep(3, G({ donorPaysGiftTax: false, simultaneousGiftForms: [sub] }));
    expect(err).toBe("동시증여 추가 건에는 대납(代納)을 사용할 수 없습니다.");
  });

  it("F-6: 양성 쌍둥이 — 대납 없이 동시증여만이면 이 축으로는 막지 않는다", () => {
    const sub = makeSub();
    const err = validateStep(3, G({ donorPaysGiftTax: false, simultaneousGiftForms: [sub] }));
    expect(err ?? "").not.toContain("대납(代納)");
  });
});

// ════════════════════════════════════════════════════
// IG-035 — 기업 규모 요건 필수 입력
// ════════════════════════════════════════════════════

describe("[G3-G] IG-035 — 미입력이 「규모 요건 통과」로 굳지 않는다", () => {
  it("G-1: 🔴 중소기업인데 자산총액 미입력이면 차단된다 (상증령 §15①3호)", () => {
    const err = validateFamilyBusinessEnterpriseSize({ enterpriseSize: "sme" });
    expect(err).toContain("자산총액을 입력하세요");
    expect(err).toContain("§15①3호");
  });

  it("G-2: 🔴 중견기업인데 평균매출 미입력이면 차단된다 (상증령 §15②3호)", () => {
    const err = validateFamilyBusinessEnterpriseSize({ enterpriseSize: "medium" });
    expect(err).toContain("평균 매출액을 입력하세요");
  });

  it("G-3: 양성 쌍둥이 — 값이 있으면 통과한다 (0도 정당한 입력)", () => {
    expect(validateFamilyBusinessEnterpriseSize({ enterpriseSize: "sme", totalAssets: 0 })).toBeNull();
    expect(
      validateFamilyBusinessEnterpriseSize({ enterpriseSize: "medium", averageRevenue3Y: 0 }),
    ).toBeNull();
  });

  it("G-4: 양성 대조군 — 가업상속공제 입력 자체가 없으면 막지 않는다", () => {
    expect(validateFamilyBusinessEnterpriseSize(undefined)).toBeNull();
  });
});
