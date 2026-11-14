/**
 * @vitest-environment jsdom
 *
 * anchor(⑤⑦) — 계획서 `rental-155-20-textbook-gaps.plan.md` PR-3 문구 4건(세액 불변)
 *
 * | # | 주장 |
 * |---|---|
 * | W-1 | G-1 임대 구분 — 「장기일반 (단기 4년 등록 포함)」 라벨(testid 불변) + hint(가목 2020.7.10. 이전 · 마목 2020.7.11. 이후) |
 * | W-2 | G-2 ㉓ 1/2 미달 문구 — 자동말소는 「자동말소된 주택도 …」(0692), 자진말소·미선택 문구는 그대로 |
 * | W-3 | G-6·Q-1 질문·고지가 「요건을 갖춘 상태로 양도」(과세 신고 포함 · 사전-2023-법규재산-0393) |
 * | W-4 | G-7 ㉒ 사후 추징 예외 문장이 엔진 고지·판정 결과·입력 카드 3곳에 같은 상수로 나온다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { RentalUnitPeriodPriceBlock } from "@/components/calc/transfer/RentalUnitPeriodPriceBlock";
import { RentalLifetimeLimitBlock } from "@/components/calc/transfer/RentalLifetimeLimitBlock";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { buildFailMessage } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/fail-messages";
import { buildRentalPeriodPendingNotice } from "@/lib/tax-engine/transfer-tax-rental-housing-judge";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import { RENTAL_155_22_EXCEPTIONS_LONG, RENTAL_155_22_EXCEPTIONS_SHORT } from "@/lib/calc/rental-155-22-exceptions";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { withToday } from "./_one-house-pr6a-routes";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";
import cases from "./one-house-rulings/cases/E177.json";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ");
type Unit = ReturnType<typeof makeDefaultRentalUnit>;

describe("G-1 임대 구분 안내", () => {
  it("W-1 ★ 라벨 · hint · testid 불변", () => {
    render(<RentalUnitCard unit={makeDefaultRentalUnit()} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.getByTestId("rental-category-long_general-0")).toBeTruthy();
    expect(norm(screen.getByTestId("rental-category-long_general-0").closest("label")?.textContent ?? "")).toContain("장기일반 (단기 4년 등록 포함)");
    const hint = norm(screen.getByTestId("rental-category-hint-0").textContent);
    expect(hint).toBe(
      "2020.8.17. 이전에 4년 단기민간임대로 등록했다면 「장기일반」을 고르세요. 지자체 등록 신청일이 2020.7.10. 이전이면 가목, 2020.7.11. 이후면 마목(아파트 제외)으로 판정합니다.",
    );
    expect(hint).not.toContain("구 임대주택법");
  });

  it("W-1b AI 카탈로그 라벨", () => {
    const f = ONE_HOUSE_FIELD_CATALOG.find((x) => x.path === "asset.rentalHousingException.rentalUnits[].rentalCategory");
    expect(JSON.stringify(f)).toContain("장기일반 (단기 4년 등록 포함)");
  });
});

describe("G-2 ㉓ 1/2 미달 문구", () => {
  const unit = (over: Partial<RentalUnitInput>): RentalUnitInput =>
    ({
      rentalCategory: "long_general", rentalAcquisitionType: "purchase", isApartment: true,
      rentalMonths: 36, terminatedRegistrationType: "long_term_general", ...over,
    }) as RentalUnitInput;
  const msg = (u: RentalUnitInput) => buildFailMessage("RENTAL_TERMINATION_RESTRICTED", 0, "마", 8, 600_000_000, u);

  it("W-2 ★ 자동말소 분기", () => {
    const m = msg(unit({ terminationReason: "auto" }));
    expect(m).toContain("자동말소된 주택도 「민간임대주택에 관한 특별법」 제43조 임대의무기간(8년)의 1/2(48개월) 이상 임대하지 않은 상태에서 등록이 말소되면");
    expect(m).toContain("현재: 36개월");
    expect(m).toContain("서면-2024-법규재산-0692");
    expect(m).not.toContain("자진말소는");
  });

  it("W-2b 자진말소·미선택은 종전 문구", () => {
    for (const reason of ["voluntary", undefined] as const) {
      const m = msg(unit({ terminationReason: reason }));
      expect(m).toContain("자진말소는 「민간임대주택에 관한 특별법」 제43조 임대의무기간(8년)의 1/2(48개월) 이상 임대해야 합니다");
    }
  });
});

describe("G-6·Q-1 요건을 갖춘 상태로 양도", () => {
  it("W-3 ★ 생애 1회 이력 라디오 · 카탈로그 · 엔진 고지", () => {
    render(
      <RentalLifetimeLimitBlock
        rh={{ applyException: true, scenario: "A" } as never}
        onChange={vi.fn()}
      />,
    );
    const used = norm(document.body.textContent);
    expect(used).toContain("이 특례의 요건을 갖춘 상태로 양도했습니다");
    expect(used).toContain("사전-2023-법규재산-0393");
    expect(used).not.toContain("이 특례를 적용받았습니다");
    const f = ONE_HOUSE_FIELD_CATALOG.find((x) => x.path === "asset.rentalHousingException.priorRentalExemptionHistory");
    expect(JSON.stringify(f)).toContain("요건을 갖춘 상태로");
    expect(JSON.stringify(f)).toContain("사전-2023-법규재산-0393");
    expect(JSON.stringify(f)).not.toContain("특례를 적용받았습니다");
  });
});

describe("G-7 ㉒ 사후 추징 예외", () => {
  it("W-4 ★ 상수 — 법령 원문 요지만(미확인 해석례 없음)", () => {
    expect(RENTAL_155_22_EXCEPTIONS_LONG).toContain("수용(협의매수 포함)되거나 사망으로 상속된 경우에는 계속 임대하는 것으로 봅니다(소득세법 시행령 §155㉒2호가목 · 소득세법 시행규칙 §74의2)");
    expect(RENTAL_155_22_EXCEPTIONS_LONG).toContain("관리처분계획등 인가일 전 6개월부터 준공일 후 6개월까지 빼고(같은 호 나목·다목)");
    expect(RENTAL_155_22_EXCEPTIONS_LONG).toContain("(같은 호 라목)");
    expect(RENTAL_155_22_EXCEPTIONS_LONG).not.toMatch(/2021중2756|2024-0800/);
    expect(RENTAL_155_22_EXCEPTIONS_SHORT).toBe("수용·사망 상속·정비사업·말소 등은 사후 추징의 예외가 있습니다(소득세법 시행령 §155㉒2호).");
  });

  it("W-4a 엔진 고지에 긴 문장", () => {
    expect(buildRentalPeriodPendingNotice([0])).toContain(RENTAL_155_22_EXCEPTIONS_LONG);
  });

  it("W-4b 입력 카드(⑳ 임대 호)에 짧은 문장", () => {
    render(
      <RentalUnitPeriodPriceBlock
        unit={{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2016-01-01", rentalRegistrationDate: "2016-01-01" } as Unit}
        index={0}
        set={vi.fn()}
        onChange={vi.fn()}
        transferDate="2024-01-01"
        reqYears={5}
        showAcqPrice
        capLabel="6억(수도권)"
        rentalStartDate=""
        showTermination={false}
      />,
    );
    expect(norm(document.body.textContent)).toContain(RENTAL_155_22_EXCEPTIONS_SHORT);
  });

  it("W-4c 판정 결과 화면에 긴 문장(§155㉑ 통과 호가 있을 때)", async () => {
    const base = (cases as RulingCase[]).find((c) => c.id === "E177-era")!;
    const asset = { ...(base.form!.asset as Record<string, unknown>) };
    const rhe = asset.rentalHousingException as { rentalUnits: Record<string, unknown>[] } & Record<string, unknown>;
    const unit = { ...rhe.rentalUnits[0], businessRegistrationDate: "2018-06-01", rentalRegistrationDate: "2018-06-01", rentalRegisteredDate: "2018-06-01", rentalMonths: "20", rentalCategory: "pre_2018" };
    const c: RulingCase = { ...base, form: { ...base.form!, asset: { ...asset, fixedAcquisitionPrice: "300000000", addressJibun: "서울특별시 종로구 청운동 1", rentalHousingException: { ...rhe, rentalUnits: [unit] } } } };
    await withToday(c.today, async () => {
      buildCaseForm(c);
      const r = await judgeAndRender(c, true, true);
      expect(r.status).toBe(200);
      expect(screen.getByTestId("one-house-rental-155-22-exceptions").textContent).toBe(RENTAL_155_22_EXCEPTIONS_LONG);
    });
  });
});
