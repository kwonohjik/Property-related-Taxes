/**
 * @vitest-environment jsdom
 *
 * anchor: 취득세 Step2 보유주택 목록 — **실제 컴포넌트**로 만든 폼이 ④·⑫를 통과하고 새 입력이 배선된다 (F1)
 *
 * - OH-02: 「+ 보유 주택 추가」 기본 행(주택)으로 만든 payload가 Zod를 통과한다(종전 항상 400).
 * - OH-03: 입주권·분양권·오피스텔 행에만 「매매·분양계약일」 칸이 나오고 ④가 contractDate로 싣는다.
 * - OH-52: 상속 → 「동순위」 토글이 있고, 켜야 거주자·최연장자 칸이 열린다. 다른 동순위 상속인이
 *   거주하면 최연장자 칸은 닫힌다(§28의4⑤1호가 먼저 정한다). ④가 tieInMaxShare·isOtherTiedHeirResident를 싣는다.
 * - ⑧: 입주권·분양권·오피스텔 취득일 · 소급 시 권리취득일 · 상속개시일 누락을 막는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { Step2 } from "@/components/calc/acquisition/Step2";
import { INITIAL_FORM, validateStep, type FormState } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";

afterEach(cleanup);

let latest: FormState;
const record = (f: FormState) => {
  latest = f;
};

function Harness({ initial, onForm = record }: { initial: FormState; onForm?: (f: FormState) => void }) {
  const [form, setForm] = useState<FormState>(initial);
  useEffect(() => onForm(form));
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
  isRegulatedArea: true,
  balancePaymentDate: "2024-06-01",
};

/** ToggleCard 스위치 — aria-label(=title)로 찾는다 (label 안 텍스트가 계산 이름을 덮어써 name 매칭이 흔들린다) */
function sw(name: string): HTMLElement | null {
  return screen.queryAllByRole("switch").find((e) => e.getAttribute("aria-label") === name) ?? null;
}

function addRow() {
  fireEvent.click(screen.getByRole("button", { name: "+ 보유 주택 추가" }));
}

describe("Step2 보유주택 목록 — F1", () => {
  it("OH-02: 기본 행(주택)으로 만든 payload가 ⑫ Zod를 통과한다", () => {
    render(<Harness initial={BASE} />);
    addRow();
    expect(latest.ownedHouses).toHaveLength(1);
    expect(latest.ownedHouses[0].propertyType).toBe("housing");
    const parsed = acquisitionTaxInputSchema.safeParse(
      buildAcquisitionTaxBody({
        ...latest,
        ownedHouses: [{ ...latest.ownedHouses[0], standardValue: "500000000", acquisitionDate: "2015-01-01" }],
      }),
    );
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("OH-03: 오피스텔 행에만 매매·분양계약일 칸 — 취득일은 필수 표시로 바뀐다", () => {
    render(<Harness initial={BASE} />);
    addRow();
    expect(screen.queryByText("매매·분양계약일 (선택)")).toBeNull();
    expect(screen.getByText("취득일 (선택)")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("주택 (아파트·단독·연립 등)"), { target: { value: "officetel" } });
    expect(screen.getByText("매매·분양계약일 (선택)")).toBeTruthy();
    expect(screen.queryByText("취득일 (선택)")).toBeNull();
    expect(screen.getByText("취득일")).toBeTruthy();

    // ⑧ — 오피스텔 취득일 누락은 차단
    expect(validateStep(2, latest)).toMatch(/취득일을 입력하세요/);

    // ④ — contractDate가 오피스텔 자산으로 실린다
    const body = buildAcquisitionTaxBody({
      ...latest,
      ownedHouses: [{ ...latest.ownedHouses[0], standardValue: "150000000", acquisitionDate: "2021-03-01", contractDate: "2020-08-11" }],
    });
    const hci = body.houseCountInput as { offices: { acquisitionDate: string; contractDate?: string }[] };
    expect(hci.offices[0]).toMatchObject({ acquisitionDate: "2021-03-01", contractDate: "2020-08-11" });
  });

  it("OH-52: 동순위 토글이 거주자·최연장자 칸을 열고, 다른 상속인 거주 시 최연장자 칸은 닫힌다", () => {
    render(<Harness initial={BASE} />);
    addRow();
    fireEvent.click(sw("상속으로 취득한 주택")!);
    // 동순위 토글 OFF — 거주자·최연장자 칸 없음
    expect(sw("본인이 그 주택에 거주")).toBeNull();

    fireEvent.click(sw("지분이 가장 큰 상속인이 두 명 이상 (동순위)")!);
    expect(latest.ownedHouses[0].tieInMaxShare).toBe(true);
    expect(sw("본인이 그 주택에 거주")).not.toBeNull();
    expect(sw("동순위 상속인 중 최연장자")).not.toBeNull();

    fireEvent.click(sw("다른 동순위 상속인이 그 주택에 거주")!);
    expect(latest.ownedHouses[0].otherTiedHeirResides).toBe(true);
    expect(sw("동순위 상속인 중 최연장자")).toBeNull();

    // 본인도 거주 → 거주자가 둘 → 「거주하는 동순위 상속인 중 최연장자」가 다시 열린다
    fireEvent.click(sw("본인이 그 주택에 거주")!);
    expect(sw("거주하는 동순위 상속인 중 최연장자")).not.toBeNull();

    // ⑧ — 상속개시일 누락 차단
    expect(validateStep(2, latest)).toMatch(/상속개시일을 입력하세요/);

    // ④ — 동순위·다른 상속인 거주가 엔진 필드로 실린다
    const body = buildAcquisitionTaxBody({
      ...latest,
      ownedHouses: [{ ...latest.ownedHouses[0], standardValue: "300000000", acquisitionDate: "2015-01-01", inheritanceDate: "2015-01-01", shareInInheritance: "0.5", maxShareInInheritors: "0.5" }],
    });
    const house = (body.houseCountInput as { houses: Record<string, unknown>[] }).houses[0];
    expect(house).toMatchObject({ tieInMaxShare: true, isOtherTiedHeirResident: true, isResidentInInheritedHouse: true });
  });

  it("⑧: 분양권·입주권으로 취득 — 권리취득일·모든 행 취득일 필요", () => {
    render(<Harness initial={{ ...BASE, acquiredViaRight: true }} />);
    addRow();
    const card = screen.getByText("보유 주택 #1").closest("div")!.parentElement!;
    // 소급 모드에서는 주택 행도 취득일이 필수로 표시된다
    expect(within(card).queryByText("취득일 (선택)")).toBeNull();
    expect(validateStep(2, latest)).toMatch(/권리취득일\(분양계약일\)을 입력하세요/);
    expect(validateStep(2, { ...latest, rightAcquisitionDate: "2021-03-01" })).toMatch(/소급 산정에는 취득일이 필요/);
    expect(
      validateStep(2, {
        ...latest,
        rightAcquisitionDate: "2021-03-01",
        ownedHouses: [{ ...latest.ownedHouses[0], acquisitionDate: "2019-01-01" }],
      }),
    ).toBeNull();
  });
});
