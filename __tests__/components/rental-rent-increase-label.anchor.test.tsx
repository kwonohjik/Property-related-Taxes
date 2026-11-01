/**
 * @vitest-environment jsdom
 *
 * anchor — 장기임대 감면 폼의 「임대료 증액 제한」 섹션 (리뷰 게이트 2026-11-01 결함 2·경미 결함 + 후속 확인)
 *
 * 1. 어느 조문이 묻는가 — 임대료 증액 제한은 §97의3·§97의4·§97의5에만 있다(KoreanLaw MCP 원문 실독).
 *    §97(본문·단서)·§97의2는 법 §97①·§97의2①, 령 §97·§97의2 어디에도 임대료 요건이 없다.
 *    종전에는 다섯 조문 폼이 모두 묻고 미선택이면 ⑧이 막았지만 평가기는 그 답을 읽지 않았다
 *    → 세 조문에서는 섹션을 그리지 않고(⑤), 막지 않고(⑧), 싣지 않는다(④).
 * 2. 라벨 — 엔진은 「있음」을 고른 경우에만 계약 이력을 받아 5%·1년 두 규정을 판정한다. 라벨이 「5% 증액 위반」뿐이면
 *    5% 이내로 1년 안에 올린 사용자가 「없음」을 골라 1년 규정이 판정되지 않았다 → 라벨에 1년 이내 재증액을 명시.
 * 3. 섹션 제목 — 종전에는 모두 「§97의3①2호」. §97의4는 소득세법 시행령 §167의3①2호, §97의5는 ①3호 → §97의3①2호.
 *
 * 문구가 이 테스트의 주제라 라벨을 단언한다. validate 메시지(⑧)는 `transfer-validation-field-jump-cases.test.ts`도 본다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { Rental97MainInputForm } from "@/components/calc/transfer/rental/Rental97MainInputForm";
import { Rental972InputForm } from "@/components/calc/transfer/rental/Rental972InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { hasRentIncreaseRule } from "@/lib/calc/rental-rent-increase-label";
import { rentIncreaseSectionTitle } from "@/lib/calc/rental-rent-increase-label";
import { RENT_INCREASE_VIOLATION_LABEL } from "@/lib/calc/rental-rent-increase-label";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { RentalReductionFormVariant } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

type Rental974Form = Extract<RentalReductionFormVariant, { type: "rental_97_4" }>;
type Rental97MainForm = Extract<RentalReductionFormVariant, { type: "rental_97_main" }>;
type Rental972Form = Extract<RentalReductionFormVariant, { type: "rental_97_2" }>;

describe("1. 임대료 증액 제한을 묻는 조문", () => {
  it.each(["rental_97_3", "rental_97_4", "rental_97_5"])("%s — 묻는다", (type) => {
    expect(hasRentIncreaseRule(type)).toBe(true);
  });

  it.each(["rental_97_main", "rental_97_proviso", "rental_97_2"])("🔴 %s — 묻지 않는다 (요건 없음)", (type) => {
    expect(hasRentIncreaseRule(type)).toBe(false);
  });

  it("🔴 ⑤ §97 본문 폼에 임대료 섹션이 없다 (종전: 「임대료 5% 증액 위반 이력」을 물었다)", () => {
    const { container } = render(
      <Rental97MainInputForm value={getReductionDefault("rental_97_main") as Rental97MainForm} onChange={() => {}} />,
    );
    expect(screen.queryByText(/임대료 증액 제한/)).toBeNull();
    expect(container.querySelector('[data-field="reduction.rental_97_main.rentIncreaseViolationMode"]')).toBeNull();
    expect(screen.getByText("공실 기간")).toBeTruthy();
  });

  it("🔴 ⑤ §97의2 폼에도 없다", () => {
    const { container } = render(
      <Rental972InputForm value={getReductionDefault("rental_97_2") as Rental972Form} onChange={() => {}} />,
    );
    expect(screen.queryByText(/임대료 증액 제한/)).toBeNull();
    expect(container.querySelector('[data-field="reduction.rental_97_2.rentIncreaseViolationMode"]')).toBeNull();
  });

  /** §97 본문 — 임대료 외 필수값을 채운 폼. 임대료는 미선택("")으로 둔다. */
  const mainForm = (over: Record<string, unknown> = {}) =>
    ({
      ...getReductionDefault("rental_97_main"),
      rentalStartDate: "2000-01-01",
      constructionYear: "1995",
      rentIncreaseViolationMode: "",
      hasVacancyOverGrace: false,
      hasMin5RentalUnits: true,
      belowMin5UnitsPeriods: [],
      ...over,
    }) as AssetReductionForm;

  it("🔴 ⑧ §97 본문은 임대료 미선택으로 막지 않는다 (종전: 「임대료 5% 증액 위반 이력 여부를 선택하세요」)", () => {
    const err = validateStep2Reductions(2, {
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "1999-01-01", reductions: [mainForm()] }],
      transferDate: "2010-01-01",
    } as unknown as TransferFormData);
    expect(err?.message ?? "").not.toMatch(/임대료/);
  });

  it("🔴 ④ §97 본문은 구 세션에 「있음」이 남아 있어도 임대료 값을 싣지 않는다", () => {
    const out = toEngineReductions(
      [
        mainForm({
          rentIncreaseViolationMode: "has_violation",
          rentHistory: [
            { contractDate: "2000-01-01", contractType: "jeonse", deposit: "100000000", monthlyRent: "" },
            { contractDate: "2001-01-01", contractType: "jeonse", deposit: "120000000", monthlyRent: "" },
          ],
        }),
      ],
      "purchase",
    )[0] as Record<string, unknown>;
    expect(out.rentIncreaseViolated).toBeUndefined();
    expect(out.rentHistory).toBeUndefined();
  });
});

describe("2·3. 라벨과 섹션 제목", () => {
  it("라벨에 1년 이내 재증액을 명시한다", () => {
    expect(RENT_INCREASE_VIOLATION_LABEL).toBe("임대료 증액 위반 이력(5% 초과 또는 1년 이내 재증액)");
  });

  it.each([
    ["rental_97_3", "임대료 증액 제한 (§97의3①2호)"],
    ["rental_97_5", "임대료 증액 제한 (§97의5①3호 → §97의3①2호)"],
    ["rental_97_4", "임대료 증액 제한 (소득세법 시행령 §167의3①2호)"],
  ])("섹션 제목 — %s → %s", (type, title) => {
    expect(rentIncreaseSectionTitle(type)).toBe(title);
  });

  it("🔴 §97의4 폼 — 새 라벨과 소득세법 시행령 §167의3①2호 제목 (종전: 「임대료 5% 증액 위반 이력」·§97의3①2호)", () => {
    render(<Rental974InputForm value={getReductionDefault("rental_97_4") as Rental974Form} onChange={() => {}} />);
    expect(screen.getByText(RENT_INCREASE_VIOLATION_LABEL)).toBeTruthy();
    expect(screen.queryByText("임대료 5% 증액 위반 이력")).toBeNull();
    expect(screen.getByText("임대료 증액 제한 (소득세법 시행령 §167의3①2호)")).toBeTruthy();
    expect(screen.queryByText("임대료 증액 제한 (§97의3①2호)")).toBeNull();
  });
});
