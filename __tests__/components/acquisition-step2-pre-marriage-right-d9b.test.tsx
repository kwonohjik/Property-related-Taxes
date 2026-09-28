/**
 * @vitest-environment jsdom
 *
 * anchor: 취득세 Step2 — 지방세법 시행령 §28의4⑥6호 입력 (계획서 D-9b) · **실제 컴포넌트**
 *
 * - 「혼인 전 소유한 주택분양권으로 취득」은 「분양권·입주권으로 주택 취득」 안에서만 열린다.
 * - 켜야 주택 행에 「배우자 소유 주택」 칸이 나온다(6호는 「주택」만 뺀다 — 오피스텔·권리 행에는 없다).
 * - 컴포넌트로 만든 폼이 ④ → ⑫ → 엔진까지 가서 배우자의 혼인 전 주택을 뺀다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Step2 } from "@/components/calc/acquisition/Step2";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";

afterEach(cleanup);

let latest: FormState;

function Harness({ initial }: { initial: FormState }) {
  const [form, setForm] = useState<FormState>(initial);
  useEffect(() => {
    latest = form;
  });
  return (
    <Step2
      form={form}
      set={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
      isHousing
      isCorporation={false}
      isIndividual
    />
  );
}

const BASE: FormState = {
  ...INITIAL_FORM,
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: "500000000",
  standardValue: "500000000",
  isRegulatedArea: false,
  isMetropolitanRegion: true,
  balancePaymentDate: "2024-06-01",
};

const PRE_MARRIAGE = "혼인 전 소유한 주택분양권으로 취득 (§28의4⑥6호)";
const SPOUSE = "배우자 소유 주택";

function sw(name: string): HTMLElement | null {
  return screen.queryAllByRole("switch").find((e) => e.getAttribute("aria-label") === name) ?? null;
}

describe("Step2 — §28의4⑥6호 입력 (D-9b)", () => {
  it("분양권 취득 토글 안에서만 열리고, 켜야 주택 행에 배우자 칸이 생긴다", () => {
    render(<Harness initial={BASE} />);
    fireEvent.click(screen.getByRole("button", { name: "+ 보유 주택 추가" }));
    expect(sw(PRE_MARRIAGE)).toBeNull();
    expect(sw(SPOUSE)).toBeNull();

    fireEvent.click(sw("분양권·입주권으로 주택 취득")!);
    expect(sw(PRE_MARRIAGE)).not.toBeNull();
    expect(sw(SPOUSE)).toBeNull();

    fireEvent.click(sw(PRE_MARRIAGE)!);
    expect(latest.acquiredViaPreMarriageRight).toBe(true);
    expect(sw(SPOUSE)).not.toBeNull();

    // 오피스텔 행으로 바꾸면 칸이 사라진다 — 6호는 「주택」만 뺀다
    fireEvent.change(screen.getByDisplayValue("주택 (아파트·단독·연립 등)"), { target: { value: "officetel" } });
    expect(sw(SPOUSE)).toBeNull();
  });

  it("컴포넌트로 만든 폼 → ④ → ⑫ → 엔진: 배우자 혼인 전 주택 제외 → 2주택 1%", () => {
    render(<Harness initial={BASE} />);
    fireEvent.click(screen.getByRole("button", { name: "+ 보유 주택 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 보유 주택 추가" }));
    fireEvent.click(sw("분양권·입주권으로 주택 취득")!);
    fireEvent.click(sw(PRE_MARRIAGE)!);
    fireEvent.click(screen.getAllByRole("switch").filter((e) => e.getAttribute("aria-label") === SPOUSE)[1]);
    expect(latest.ownedHouses.map((h) => h.ownedBySpouse)).toEqual([false, true]);

    const form: FormState = {
      ...latest,
      rightAcquisitionDate: "2022-05-01",
      marriageDate: "2023-01-10",
      ownedHouses: [
        { ...latest.ownedHouses[0], standardValue: "300000000", acquisitionDate: "2015-01-01" },
        { ...latest.ownedHouses[1], standardValue: "300000000", acquisitionDate: "2018-01-01" },
      ],
    };
    const parsed = acquisitionTaxInputSchema.safeParse(buildAcquisitionTaxBody(form));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    if (!parsed.success) return;
    const r = calcAcquisitionTax(parsed.data);
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
  });
});
