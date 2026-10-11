/**
 * S04-2 anchor — D13(종전주택을 보유하기 전에 신규 주택을 계약한 세대): 엔진이 2019.12.17. 체제(1년·세대전원 전입·임차인 단서)를 적용하면
 * 입력 노출 술어(⑤ 칸·⑧ 경고)도 **같은 n**(= max(min(취득, 계약), 종전주택 취득일))으로 전입일·임차인 칸을 열어야 한다.
 *
 * 법령(원문 확인): 대통령령 제30395호 부칙 제15조② — 「…조정대상지역에 종전의 주택을 **보유한** 1세대가 2019년 12월 16일 이전에 …
 * 신규 주택을 취득(계약)한 경우」만 종전 규정 · 기획재정부 재산세제과-512(2021.5.25.) 별첨 Case 2 — 「'19.12.17. 이후 → 1년」.
 * 이 파일은 엔진 체제가 맞다는 전제(반박 검토가 원문·DRF 부칙으로 확인)에서 **엔진 체제 = 입력 노출**의 내부 정합만 단언한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { judgmentDerivedNewHouse, judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { TempTwoHouseRegulatedInputs } from "@/components/calc/transfer/TempTwoHouseRegulatedInputs";
import { temporaryTwoHouseEraInputRelevance } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";

afterEach(cleanup);

const mk = (prev: string): RulingCase => ({
  id: "a", docNo: "-", docDate: "-", basis: "era", today: "2022-05-01", summary: "", bucket: "match",
  form: {
    prevHouseRegulatedAtNewAcquisition: "yes", newHouseRegulatedAtAcquisition: "yes", isRegulatedArea: true, wasRegulatedAtAcquisition: true,
    newHouseContractDate: "2019-06-01", isOneHousehold: true, contractTotalPrice: "800000000", transferDate: "2022-04-01",
    asset: { assetKind: "housing", acquisitionDate: prev, residenceInputMode: "direct", residencePeriodMonthsAsset: "26" },
    houses: [{ id: "b", region: "capital", acquisitionDate: "2021-03-02" }],
  } as RulingCase["form"],
});

type Card = { deadlineYears: number; moveInPending: boolean; regulated: { moveInRelevant: boolean } };
function view(c: RulingCase) {
  const form = buildCaseForm(c);
  const card = judgmentTempTwoHouseVerdict(form, judgmentDerivedNewHouse(form)) as unknown as Card;
  const { queryByTestId } = render(
    <TempTwoHouseRegulatedInputs
      form={form as never}
      onChange={() => {}}
      regulated={card.regulated as never}
      newHouseAcquisitionDate="2021-03-02"
    />,
  );
  const ui = { moveIn: !!queryByTestId("temp-two-house-move-in-date"), tenant: !!queryByTestId("temp-two-house-existing-tenant") };
  const warn = validateAllSteps(form).some((e) => e.field === "newHouseMoveInDate");
  return { card, ui, warn };
}

describe("S04-2 D13 — 엔진 체제와 입력 노출이 같은 n을 쓴다", () => {
  it("종전주택 2020-01-10(계약 2019-06-01 뒤) → 1년 체제 · 전입일·임차인 칸 열림 · ⑧ 전입일 경고", () => {
    const v = view(mk("2020-01-10"));
    expect(v.card.deadlineYears).toBe(1);
    expect(v.card.moveInPending).toBe(true);
    expect(v.card.regulated.moveInRelevant).toBe(true);
    expect(v.ui).toEqual({ moveIn: true, tenant: true });
    expect(v.warn).toBe(true);
  });
  it("짝 — 종전주택을 계약 전에 보유(2019-01-10) → 2년 체제 · 칸 닫힘 · 경고 없음", () => {
    const v = view(mk("2019-01-10"));
    expect(v.card.deadlineYears).toBe(2);
    expect(v.card.regulated.moveInRelevant).toBe(false);
    expect(v.ui).toEqual({ moveIn: false, tenant: false });
    expect(v.warn).toBe(false);
  });
});

describe("S04-2 leaf — temporaryTwoHouseEraInputRelevance가 종전주택 취득일을 받는다", () => {
  const base = { newAcquisitionDate: new Date("2021-03-02"), newContractDate: new Date("2019-06-01"), transferDate: new Date("2022-04-01") };
  it("종전주택 취득이 계약 뒤(D13) → moveIn", () => {
    expect(temporaryTwoHouseEraInputRelevance({ ...base, previousAcquisitionDate: new Date("2020-01-10") }).moveIn).toBe(true);
  });
  it("종전주택 취득이 계약 앞 → moveIn 아님", () => {
    expect(temporaryTwoHouseEraInputRelevance({ ...base, previousAcquisitionDate: new Date("2019-01-10") }).moveIn).toBe(false);
  });
  it("종전주택 취득일을 넘기지 않으면(원조합원 경로 등) 종전과 같이 계약일 기준", () => {
    expect(temporaryTwoHouseEraInputRelevance(base).moveIn).toBe(false);
  });
});
