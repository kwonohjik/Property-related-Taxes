/**
 * @vitest-environment jsdom
 *
 * anchor — 리뷰 게이트(2026-11-01) 결함 2: 1년 이내 재증액 금지가 화면 경로에서 판정되지 않았다.
 *
 * 엔진은 「임대료 … 위반 이력: 있음」을 고른 경우에만 계약 이력을 받는다(`transfer-tax-api-reductions.ts`).
 * 라벨이 「임대료 5% 증액 위반 이력」뿐이라, 5% 이내로 1년 안에 올린 사용자가 「없음」을 골라
 * §97의3·§97의4·§97의5의 1년 규정(조특령 §97의3③1호 후단 · 소령 §167의3①2호 가·다목 괄호)이 판정되지 않았다.
 * → 세 조문은 라벨에 1년 규정을 명시한다. 1년 규정이 없는 §97 본문·§97의2는 종전 라벨 그대로.
 *
 * 문구가 이 테스트의 주제라 라벨을 단언한다(값 축은 기존 `rentIncreaseViolationMode` 테스트가 본다).
 * validate 메시지(⑧)는 `transfer-validation-field-jump-cases.test.ts`가 조문별 정규식으로 본다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { Rental97MainInputForm } from "@/components/calc/transfer/rental/Rental97MainInputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { rentIncreaseViolationLabel } from "@/lib/calc/rental-rent-increase-label";
import type { RentalReductionFormVariant } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

type Rental974Form = Extract<RentalReductionFormVariant, { type: "rental_97_4" }>;
type Rental97MainForm = Extract<RentalReductionFormVariant, { type: "rental_97_main" }>;

const NEW_LABEL = "임대료 증액 위반 이력(5% 초과 또는 1년 이내 재증액)";
const OLD_LABEL = "임대료 5% 증액 위반 이력";

describe("임대료 증액 위반 이력 라벨", () => {
  it.each(["rental_97_3", "rental_97_4", "rental_97_5"])("🔴 %s — 1년 이내 재증액을 라벨에 명시", (type) => {
    expect(rentIncreaseViolationLabel(type)).toBe(NEW_LABEL);
  });

  it.each(["rental_97_main", "rental_97_2"])("%s — 1년 규정이 없어 종전 라벨", (type) => {
    expect(rentIncreaseViolationLabel(type)).toBe(OLD_LABEL);
  });

  it("🔴 §97의4 폼이 새 라벨을 렌더한다 (종전: 「임대료 5% 증액 위반 이력」)", () => {
    render(
      <Rental974InputForm value={getReductionDefault("rental_97_4") as Rental974Form} onChange={() => {}} />,
    );
    expect(screen.getByText(NEW_LABEL)).toBeTruthy();
    expect(screen.queryByText(OLD_LABEL)).toBeNull();
  });

  it("§97 본문 폼은 종전 라벨", () => {
    render(
      <Rental97MainInputForm value={getReductionDefault("rental_97_main") as Rental97MainForm} onChange={() => {}} />,
    );
    expect(screen.getByText(OLD_LABEL)).toBeTruthy();
  });
});
