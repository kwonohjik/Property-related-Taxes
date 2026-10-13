/**
 * @vitest-environment jsdom
 *
 * anchor(⑤·④·⑧·엔진) — 이월과세 폼 관계 「그 외」의 「증여자와 증여일부터 양도일까지 계속 같은 세대」 필수 질문 (결정 #38-2)
 *
 * ## 현재 관계 분기 (확인 결과)
 * 이월과세 폼(`CarryoverGiftBlock` → `CarryoverGiftExclusionSection`)의 관계 라디오는 배우자 · 직계존비속 · 그 외 셋이다.
 * 「그 외」는 §97의2① 이월과세 대상이 아니라 ⑧(`validateAssetAcquisition` (b-3a))이 「취득 원인을 증여로 변경」을 먼저 막는다.
 * 종전에는 「그 외」에서 세대 질문을 **묻지 않고**(⑤ 숨김 · ④ 미전송 · ⑧ 미요구) 엔진이 답 없는 값을 별도 세대로 읽었다(`carryoverGiftHouseholdBasis`) —
 * 판정 메뉴·계산기 일반 증여 칸은 관계와 무관하게 필수로 묻는데 이월과세 폼만 달랐다.
 *
 * ## 결정
 * 「그 외」에서도 같은 질문을 **필수로** 묻는다(「모름」 선택지 없음). ⑤·④·⑧이 한 술어(`carryoverHouseholdFactVisible`)를 쓰고, 답이 없는 값(API 직접 호출·옛 이력)은
 * 관계와 무관하게 미확인이다 — 통산하지 않고, 통산하면 결론이 달라질 때만 확인 필요를 고지한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | O-1 | 술어 격자 | 관계 × 사망 × 자산 종류에서 ⑤ 노출 = ④ 전송 가능 = ⑧ 요구가 한 술어로 갈린다 |
 * | O-2 | ⑤ | 「그 외」에서 질문이 보인다(재결합 선택지는 배우자만) · 「예」면 시작일·증여 전 거주 칸이 열린다 |
 * | O-3 | ⑧ | 「그 외」+ 미답이면 요구한다 · 답하면 풀린다 · 취득 원인 변경 차단(b-3a)이 먼저라 목록에는 그 오류가 앞선다 |
 * | O-4 | ④ | 「그 외」의 답을 싣는다 · 미답이면 미전송 |
 * | O-5 | 엔진 | 「그 외」 미답 직접 호출은 미확인(0 → 113,060,000 + 확인 필요) · 「아니오」는 별도 세대(0) · 「예」는 통산 |
 *
 * 부정형 단언에는 긍정 짝을 둔다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { buildCarryoverPayload, carryoverHouseholdFactVisible } from "@/lib/calc/transfer-tax-api-carryover";
import { validateCarryoverHouseholdFact } from "@/lib/calc/transfer-tax-validate-carryover-household";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { carryoverGiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { withPrimary } from "../../e2e/_helpers/validation-field-jump-cases";

afterEach(cleanup);

type Rel = "" | "spouse" | "lineal" | "other";
const carryoverAsset = (c: Partial<NonNullable<AssetForm["carryover"]>> = {}, over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2020-01-01",
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "other",
      giftDateValuation: "300000000",
      donorAcquisitionPrice: "200000000",
      ...c,
    },
    ...over,
  }) as AssetForm;

const ct = (a: AssetForm) => buildCarryoverPayload(a, "2026-02-16", 1)!.carryoverTaxation as Record<string, unknown>;
const check = (a: AssetForm) => collectWithFields(() => validateCarryoverHouseholdFact(a, a.carryover!, "자산"));

describe("O-1 술어 격자 — ⑤ 노출 = ④ 전송 = ⑧ 요구", () => {
  const relations: Rel[] = ["", "spouse", "lineal", "other"];
  for (const rel of relations) {
    for (const deceased of [false, true]) {
      for (const kind of ["housing", "land"] as const) {
        const expected = !deceased && kind === "housing";
        it(`[O-1] 관계 ${rel || "미선택"} · 사망 ${deceased} · ${kind} → ${expected ? "묻는다" : "묻지 않는다"}`, () => {
          const base = carryoverAsset({ donorRelation: rel, donorDeceased: deceased, donorSameHousehold: "" }, { assetKind: kind });
          // ⑤ 노출 술어
          expect(carryoverHouseholdFactVisible(base)).toBe(expected);
          // ⑧ 미답 요구 — 같은 술어
          const r = check(base);
          expect(r.result !== null).toBe(expected);
          if (expected) expect(r.fieldOf(r.result!)).toBe("carryover.donorSameHousehold");
          // ④ 「아니오」 답 전송 — 같은 술어
          const answered = carryoverAsset({ donorRelation: rel, donorDeceased: deceased, donorSameHousehold: "no" }, { assetKind: kind });
          expect(ct(answered).donorSameHouseholdContinuous === false).toBe(expected);
        });
      }
    }
  }
});

describe("O-2 ⑤ 위젯 — 「그 외」에서도 질문이 보인다", () => {
  const renderBlock = (a: AssetForm) => render(<CarryoverGiftBlock asset={a} transferDate="2026-02-16" onChange={() => {}} />);
  it("[O-2a] 관계 「그 외」 → 질문 + 「예」/「아니오」 선택지 · 재결합 선택지는 없다 · 증여자 사망이면 숨는다(긍정 짝)", () => {
    renderBlock(carryoverAsset());
    expect(screen.getByText(/증여자와 같은 세대 여부/)).toBeTruthy();
    expect(screen.getByLabelText(/예 — 계속 같은 세대/)).toBeTruthy();
    expect(screen.getByLabelText(/아니오 — 세대가 달랐거나/)).toBeTruthy();
    expect(screen.queryByLabelText(/이혼했다가 같은 사람과 재결합/)).toBeNull();
    cleanup();
    renderBlock(carryoverAsset({ donorDeceased: true }));
    expect(screen.queryByText(/증여자와 같은 세대 여부/)).toBeNull();
  });
  it("[O-2b] 「그 외」 + 「예」 → 세대 보유 시작일 · 증여 전 동일세대 거주기간 칸이 열린다 · 「아니오」면 둘 다 없다(긍정 짝)", () => {
    renderBlock(carryoverAsset({ donorSameHousehold: "yes" }));
    expect(screen.getByText("세대가 이 주택 보유를 시작한 날")).toBeTruthy();
    expect(screen.getByText("증여 전 동일세대 거주기간")).toBeTruthy();
    cleanup();
    renderBlock(carryoverAsset({ donorSameHousehold: "no" }));
    expect(screen.queryByText("세대가 이 주택 보유를 시작한 날")).toBeNull();
    expect(screen.queryByText("증여 전 동일세대 거주기간")).toBeNull();
  });
});

describe("O-3 ⑧", () => {
  it("[O-3a] 「그 외」 + 미답 → 요구한다 · 「아니오」면 풀린다 · 「예」 + 시작일 없음이면 시작일을 요구한다(긍정 짝)", () => {
    expect(check(carryoverAsset({ donorSameHousehold: "" })).result).toContain("계속 같은 세대였는지 선택하세요");
    expect(check(carryoverAsset({ donorSameHousehold: "no" })).result).toBeNull();
    const yes = check(carryoverAsset({ donorSameHousehold: "yes" }));
    expect(yes.fieldOf(yes.result!)).toBe("carryover.donorHouseholdHoldingStartDate");
    expect(check(carryoverAsset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2012-05-05" })).result).toBeNull();
  });
  it("[O-3b] 「재결합」은 배우자에게만 — 「그 외」에 남은 값은 막는다", () => {
    const r = check(carryoverAsset({ donorSameHousehold: "rejoined" }));
    expect(r.result).toContain("배우자에게서 증여받은 경우에만");
  });
  it("[O-3c] 목록에서는 취득 원인 변경 차단(b-3a)이 먼저다 — 「그 외」는 이월과세 대상이 아니므로 그 오류가 앞서고, 관계를 바꾸면 세대 질문이 같은 자리에서 요구된다", () => {
    const form = (rel: Rel) => withPrimary(carryoverAsset({ donorRelation: rel, donorSameHousehold: "" }) as unknown as Record<string, unknown>) as unknown as TransferFormData;
    const other = collectStepIssues(0, form("other")).map((i) => i.field);
    expect(other).toContain("acquisitionCause");
    expect(other).not.toContain("carryover.donorSameHousehold");
    // 긍정 짝: 대상 관계면 미답이 막는다
    expect(collectStepIssues(0, form("lineal")).map((i) => i.field)).toContain("carryover.donorSameHousehold");
  });
});

describe("O-4 ④ 전송", () => {
  it("[O-4a] 「그 외」의 답을 싣는다 — 예 + 시작일 + 증여 전 거주 개월 · 아니오 · 미답(미전송)", () => {
    const yes = ct(carryoverAsset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2012-05-05", donorPriorHouseholdResidenceMonths: "6" }));
    expect(yes.donorSameHouseholdContinuous).toBe(true);
    expect(yes.donorHouseholdHoldingStartDate).toBe("2012-05-05");
    expect(yes.donorPriorHouseholdResidenceMonths).toBe(6);
    expect(ct(carryoverAsset({ donorSameHousehold: "no" })).donorSameHouseholdContinuous).toBe(false);
    expect(ct(carryoverAsset({ donorSameHousehold: "" })).donorSameHouseholdContinuous).toBeUndefined();
  });
});

describe("O-5 엔진 입력 — 답이 없는 값은 관계와 무관하게 미확인", () => {
  const ctIn = (over: Record<string, unknown>) => ({
    giftRegistryDate: new Date("2023-03-15"),
    donorAcquisitionDate: new Date("2021-01-15"),
    ...over,
  });
  it("[O-5a] 「그 외」 미답 → continuousSameHousehold가 undefined(미확인) · 종전에는 false(별도 세대) — 직계존비속 미답과 같다", () => {
    expect(carryoverGiftHouseholdBasis(ctIn({ donorRelation: "other" }) as never, true).continuousSameHousehold).toBeUndefined();
    expect(carryoverGiftHouseholdBasis(ctIn({ donorRelation: "lineal" }) as never, true).continuousSameHousehold).toBeUndefined();
  });
  it("[O-5b] 명시한 답은 그대로 — 「그 외」+ 아니오 → false · 예 → true + 시작일 + 증여 전 거주 개월", () => {
    expect(carryoverGiftHouseholdBasis(ctIn({ donorRelation: "other", donorSameHouseholdContinuous: false }) as never, true).continuousSameHousehold).toBe(false);
    const yes = carryoverGiftHouseholdBasis(
      ctIn({ donorRelation: "other", donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: new Date("2022-01-01"), donorPriorHouseholdResidenceMonths: 9 }) as never,
      true,
    );
    expect(yes.continuousSameHousehold).toBe(true);
    expect(yes.priorHouseholdResidenceMonths).toBe(9);
  });
});
