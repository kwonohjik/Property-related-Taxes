/**
 * @vitest-environment jsdom
 *
 * S03-7 — 취득세 Step2 **실제 컴포넌트**: 오피스텔 행의 한시 특례는 §28의4⑥8·9호 선택지·사실 칸을 띄우고(주택용 ②1~3호 아님),
 * 그렇게 입력한 폼이 ④ → ⑫ → 엔진까지 가서 주택 수에서 뺀다. 종전에는 오피스텔 행에도 주택용 토글이 떠서 값이 ④에서 소실됐다.
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
    <Step2 form={form} set={(k, v) => setForm((f) => ({ ...f, [k]: v }))} isHousing isCorporation={false} isIndividual />
  );
}

const BASE: FormState = {
  ...INITIAL_FORM, propertyType: "housing", acquisitionCause: "purchase", acquiredBy: "individual",
  reportedPrice: "500000000", standardValue: "500000000", isRegulatedArea: true, isMetropolitanRegion: true,
  balancePaymentDate: "2025-06-01", houseCountAfter: "1",
};
const OFFICE_TOGGLE = "오피스텔 한시 특례 해당 (주택 수 제외)";
const HOUSING_TOGGLE = "한시 특례 해당 (주택 수 제외)";
const sw = (name: string) => screen.queryAllByRole("switch").find((e) => e.getAttribute("aria-label") === name) ?? null;

describe("Step2 — 오피스텔 행 한시 특례 (§28의4⑥8·9호)", () => {
  it("[UO-1] 주택 행은 주택용 토글, 오피스텔 행은 오피스텔 토글과 8호·9호 선택지를 띄운다", () => {
    render(<Harness initial={BASE} />);
    fireEvent.click(screen.getByRole("button", { name: "+ 보유 주택 추가" }));
    expect(sw(HOUSING_TOGGLE)).not.toBeNull();
    expect(sw(OFFICE_TOGGLE)).toBeNull();

    fireEvent.change(screen.getByDisplayValue("주택 (아파트·단독·연립 등)"), { target: { value: "officetel" } });
    expect(sw(HOUSING_TOGGLE)).toBeNull();
    fireEvent.click(sw(OFFICE_TOGGLE)!);
    expect(document.body.textContent).toContain("§28의4⑥8호");
    expect(document.body.textContent).toContain("§28의4⑥9호");
    expect(document.body.textContent).not.toContain("미분양 아파트 수도권 외 85㎡");
  });

  it("[UO-2] 컴포넌트로 입력한 8호 사실 → ④ → ⑫ → 엔진: 1주택 1% · 5,000,000", () => {
    render(<Harness initial={BASE} />);
    fireEvent.click(screen.getByRole("button", { name: "+ 보유 주택 추가" }));
    fireEvent.change(screen.getByDisplayValue("주택 (아파트·단독·연립 등)"), { target: { value: "officetel" } });
    fireEvent.click(sw(OFFICE_TOGGLE)!);
    fireEvent.click(screen.getByLabelText(/사용승인을 받은 신축 오피스텔을 최초로 유상승계취득/));
    expect(latest.ownedHouses[0].hansiBenefitType).toBe("new_build");
    fireEvent.change(screen.getByTestId(`office-hansi-area-${latest.ownedHouses[0].id}`), { target: { value: "50" } });
    expect(latest.ownedHouses[0].officeExclusiveAreaSqm).toBe("50");

    const form: FormState = {
      ...latest,
      ownedHouses: [{
        ...latest.ownedHouses[0], standardValue: "200000000", acquisitionDate: "2025-03-01",
        isMetropolitanRegion: true, officeAcquisitionValue: "200000000", officeApprovalDate: "2025-02-01",
      }],
    };
    const parsed = acquisitionTaxInputSchema.safeParse(buildAcquisitionTaxBody(form));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    if (!parsed.success) return;
    const r = calcAcquisitionTax(parsed.data);
    expect(r.houseCountDetail?.effectiveCount).toBe(1);
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
  });
});
