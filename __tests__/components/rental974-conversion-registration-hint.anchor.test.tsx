/**
 * @vitest-environment jsdom
 *
 * anchor: §97의4 단기→장기 전환 주택의 「지자체 임대사업자 등록일」 안내.
 *
 * §97의4는 단기·장기 모두 대상(소령 §167의3①2호 가목)이라, 유형을 바꿔도 처음 등록한 날부터 센다(조특령 §97의4②).
 * 칸 이름만으로는 어느 날을 넣을지 알 수 없어, 전환일을 넣으면 2018.3.31. 단서와 6년 요건에 잘못 걸렸다
 * (2026-11-14 실측: 단기 2016.1. → 장기 2019.1.이면 REGISTRATION_AFTER_2018_03_31·RENTAL_PERIOD_SHORT).
 *
 * §97의3은 변경신고 주택의 임대개시 의제가 따로 있어(`rental-97-short-term-conversion.ts`) 이 안내를 내면 안 된다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { RentalReductionFormVariant } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

type Rental974Form = Extract<RentalReductionFormVariant, { type: "rental_97_4" }>;
type Rental973Form = Extract<RentalReductionFormVariant, { type: "rental_97_3" }>;

const HINT = /처음\(단기로\) 등록한 날을 입력하세요/;

describe("§97의4 단기→장기 전환 등록일 안내", () => {
  it("🔑 §97의4 폼: 등록일 칸 바로 아래에 안내가 나온다", () => {
    render(
      <Rental974InputForm value={getReductionDefault("rental_97_4") as Rental974Form} onChange={() => {}} />,
    );
    const hint = screen.getByText(HINT);
    const dateWrap = document.querySelector('[data-field="reduction.rental_97_4.registrationDate"]')?.closest("div");
    expect(dateWrap?.parentElement?.contains(hint)).toBe(true);
    expect(hint.textContent).toContain("조특령 §97의4②");
  });

  it("§97의3 폼에는 이 안내가 없다 (변경신고 의제가 따로 있다)", () => {
    render(
      <Rental973InputForm value={getReductionDefault("rental_97_3") as Rental973Form} onChange={() => {}} />,
    );
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
