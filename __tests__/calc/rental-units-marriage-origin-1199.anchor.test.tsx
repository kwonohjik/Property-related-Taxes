/**
 * @vitest-environment jsdom
 *
 * 혼인합가 1199 — 판정 메뉴 명부 밖 장기임대주택의 **혼인 전 보유자** 입력(`rentalUnits[].mergeOrigin`) 배선.
 * 엔진 규칙은 `__tests__/tax-engine/transfer/merge-composition-1199-marriage-rentals.anchor.test.ts`, route 결론은 평가셋
 * `E132-*`(과세) · `P-E132-1062` · `P-E132-seller-rentals-only`(비과세)가 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | G-1 | ⑤⑧ 게이트 | 혼인일 + §155⑳ 선언 + 임대주택 1호 이상 + 합가 칸 노출일 때만 |
 * | V-1 | ⑧ | 게이트 안에서 보유자 미선택이면 차단(호마다) · 고르면 통과 |
 * | P-1 | ④ · ⑫ · ⑭ | API 변환이 싣고, Zod가 받고, route 매핑이 엔진으로 넘긴다 |
 * | W-1 | ⑤ | 칸을 고르면 그 호의 `mergeOrigin`으로 올라간다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { judgmentMarriageRentalOriginVisible } from "@/lib/calc/one-house-judgment-section-scope";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { rentalUnitSchema } from "@/lib/api/transfer-tax-schema-rental-exception";
import { toRentalHousingExceptionEngineInput } from "@/app/api/calc/transfer/_rental-engine-input";
import { RentalUnitsMarriageOriginSection } from "@/app/calc/one-house-exemption/steps/RentalUnitsMarriageOriginSection";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

afterEach(cleanup);

type Unit = ReturnType<typeof makeDefaultRentalUnit>;

function formWith(o: { marriageDate?: string; applyException?: boolean; units?: Partial<Unit>[]; roster?: number } = {}) {
  const f = createInitialOneHouseJudgmentForm();
  const a = f.assets[0];
  return {
    ...f,
    marriageDate: o.marriageDate ?? "2021-06-15",
    houses: Array.from({ length: o.roster ?? 1 }, (_, i) => ({ id: `h${i}`, acquisitionDate: "2016-03-15", mergeOrigin: "counterpart_side" })),
    assets: [
      {
        ...a,
        assetKind: "housing",
        rentalHousingException: {
          ...a.rentalHousingException,
          applyException: o.applyException ?? true,
          rentalUnits: (o.units ?? [{}, {}]).map((u) => ({ ...makeDefaultRentalUnit(), ...u })),
        },
      },
    ],
  } as unknown as OneHouseJudgmentFormData;
}

describe("G-1 · V-1 게이트와 ⑧", () => {
  it("혼인일 · 특례 선언 · 임대주택 · 합가 칸 노출이 모두 있을 때만", () => {
    expect(judgmentMarriageRentalOriginVisible(formWith())).toBe(true);
    expect(judgmentMarriageRentalOriginVisible(formWith({ marriageDate: "" }))).toBe(false);
    expect(judgmentMarriageRentalOriginVisible(formWith({ applyException: false }))).toBe(false);
    expect(judgmentMarriageRentalOriginVisible(formWith({ units: [] }))).toBe(false);
    expect(judgmentMarriageRentalOriginVisible(formWith({ roster: 0 }))).toBe(false); // 1주택 세대 — 합가 칸 없음
  });
  it("미선택 호마다 차단 · 모두 고르면 통과", () => {
    const fields = (f: OneHouseJudgmentFormData) =>
      validateStep2(f).filter((e) => e.severity === "error").map((e) => e.field);
    expect(fields(formWith({ units: [{}, { mergeOrigin: "seller_side" }] }))).toContain("rentalUnits.0.mergeOrigin");
    expect(fields(formWith({ units: [{}, { mergeOrigin: "seller_side" }] }))).not.toContain("rentalUnits.1.mergeOrigin");
    expect(
      fields(formWith({ units: [{ mergeOrigin: "after_merge" }, { mergeOrigin: "counterpart_side" }] })).filter((x) =>
        x?.startsWith("rentalUnits."),
      ),
    ).toEqual([]);
  });
});

describe("P-1 ④ · ⑫ · ⑭", () => {
  it("API 변환 → Zod → route 매핑까지 값이 그대로 간다", () => {
    const f = formWith({ units: [{ mergeOrigin: "counterpart_side" }] });
    const body = toRentalHousingExceptionApi(f.assets[0]) as { rentalUnits: Record<string, unknown>[] };
    expect(body.rentalUnits[0].mergeOrigin).toBe("counterpart_side");
    // 기본 호는 날짜가 비어 전체 스키마는 통과하지 못한다 — 이 필드만 본다(키가 스키마에 없으면 pick이 던진다).
    const parsed = rentalUnitSchema.pick({ mergeOrigin: true }).parse(body.rentalUnits[0]);
    expect(parsed.mergeOrigin).toBe("counterpart_side");
    expect(rentalUnitSchema.pick({ mergeOrigin: true }).safeParse({ mergeOrigin: "second_merge_side" }).success).toBe(false);
    const engine = toRentalHousingExceptionEngineInput({
      ...(body as object),
      rentalUnits: [{ ...body.rentalUnits[0], ...parsed }],
    } as never);
    expect(engine?.rentalUnits[0].mergeOrigin).toBe("counterpart_side");
  });
});

describe("W-1 ⑤ 칸", () => {
  it("고르면 그 호의 mergeOrigin으로 올라간다", () => {
    const onChange = vi.fn();
    const f = formWith();
    render(<RentalUnitsMarriageOriginSection form={f} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("rental-merge-origin-1-counterpart"));
    const patch = onChange.mock.calls.at(-1)![0] as Partial<OneHouseJudgmentFormData>;
    const units = patch.assets![0].rentalHousingException!.rentalUnits;
    expect(units[1].mergeOrigin).toBe("counterpart_side");
    expect(units[0].mergeOrigin).toBeUndefined();
  });
});
