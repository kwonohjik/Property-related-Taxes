/**
 * PR-13 anchor (2026-11 리뷰 「판정 화면 표시」) — D-11 · D-28 · D-29 · D-30(+§91① 사유) · D-31 최소안 · D-32 1단계 · I-13 · I-15 · D-49 · D-55 · D-75 · D-90.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runJudgment, withToday, handoff } from "./_one-house-pr6a-routes";
import { allIssues } from "./_one-house-pr3a-calc-route";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { mkCase } from "./_one-house-pr3a-judge-route";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { MultiHouseSurchargeResultView } from "@/components/calc/results/MultiHouseSurchargeResultView";
import { OneHouseJudgmentProvenanceLine } from "@/components/calc/results/transfer/OneHouseJudgmentProvenanceLine";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { POST as surchargePOST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { validateAllSurchargeSteps } from "@/lib/calc/multi-house-surcharge-validate";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { computeOneHouseJudgmentSummary } from "@/lib/calc/one-house-judgment-summary";
import { handoffRemainingInputs } from "@/lib/calc/judgment-handoff-remaining";
import { applyPhrp154_10Answer, PHRP_154_10_QUESTION_FIELD } from "@/lib/calc/phrp-154-10-fact-question";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(cleanup);

type Rh = AssetForm["rentalHousingException"];
const TODAY = "2020-07-02";
/** §154⑩ 사실 질문이 열리는 시료(`phrp-154-10-fact-question.anchor` PQ와 같은 사실). */
function jForm(rhOver: (rh: Rh) => Rh = (rh) => rh, over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const base = makeDefaultAsset(1);
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...base, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-06-01",
        addressJibun: "경상남도 창원시 의창구 용호동 1", fixedAcquisitionPrice: "600000000",
        residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "13",
        rentalHousingException: rhOver(base.rentalHousingException),
      },
    ],
    transferDate: "2020-07-01", contractTotalPrice: "800000000", isOneHousehold: true,
    isRegulatedArea: false, wasRegulatedAtAcquisition: false, houses: [], presaleRights: [], householdNoPresaleRightsConfirmed: true,
    ...over,
  } as OneHouseJudgmentFormData;
}
const yes = (rh: Rh): Rh => ({ ...applyPhrp154_10Answer(rh, "yes"), priorResidenceTransferDate: "2019-03-01" });
const textOf = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ");

describe("D-30 · Q-10 미등기", () => {
  const f = jForm((rh) => rh, { isUnregistered: true });
  it("1주택 메뉴 ⑧은 §154⑩ 답을 요구하지 않는다 · 중과 메뉴 ⑧은 그대로 요구한다", () => {
    expect(validateAllSteps(f).filter((e) => e.field === PHRP_154_10_QUESTION_FIELD)).toEqual([]);
    expect(validateAllSurchargeSteps(f).some((e) => e.field === PHRP_154_10_QUESTION_FIELD && e.severity === "error")).toBe(true);
    // 대조 — 등기 자산이면 1주택 메뉴도 요구한다
    expect(validateAllSteps(jForm()).some((e) => e.field === PHRP_154_10_QUESTION_FIELD)).toBe(true);
  });
  it("결과에 §91① 사유가 보인다", async () => {
    const o = await judgeAndRender(mkCase("2025-05-01", {
      isOneHousehold: true, transferDate: "2025-06-01", contractTotalPrice: "500000000", isUnregistered: true,
      asset: { assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: "4182025021", residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0" }, houses: [],
    }));
    expect(o.status).toBe(200);
    expect(o.text).toContain("미등기 양도자산 — 비과세 배제");
    expect(o.text).toContain("소득세법 §91①");
  });
  it("미등기 토글이 §155의2 장기저당담보 토글보다 앞이다", () => {
    const r = render(<Step3 form={jForm()} onChange={() => {}} />);
    const t = textOf(r.container);
    expect(t.indexOf("미등기 양도자산입니다")).toBeGreaterThan(-1);
    expect(t.indexOf("미등기 양도자산입니다")).toBeLessThan(t.indexOf("장기저당담보주택 특례"));
  });
});

describe("D-11 입주권 양도 — 양도하는 입주권을 목록에 다시 넣으면 경고(차단 아님)", () => {
  const right = (rowAcq: string) =>
    buildCaseForm(mkCase("2025-05-01", {
      isOneHousehold: true, transferDate: "2025-05-30", contractTotalPrice: "500000000",
      asset: { assetKind: "right_to_move_in", acquisitionDate: "2015-03-01", redevSubject: "right", redevExemptionEligibleAtApproval: "yes", redevApprovalDate: "2021-05-01" },
      houses: [],
      presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: rowAcq, region: "capital" }],
    }));
  it("취득일이 같으면 경고 1건 · 오류 0건 · 다르면 경고 없음", () => {
    const same = validateAllSteps(right("2015-03-01")).filter((e) => e.field === "presaleRights.0.acquisitionDate");
    expect(same.map((e) => e.severity)).toEqual(["warning"]);
    expect(validateAllSteps(right("2019-03-01")).filter((e) => e.field === "presaleRights.0.acquisitionDate")).toEqual([]);
  });
});

describe("D-28 · D-29 §154⑩ 「예」", () => {
  it("결과 카드는 기간분 비과세(amber 술어) — 「요건 충족」·⑳ 특례 제목이 아니다", async () => {
    const o = await withToday(TODAY, () => runJudgment(jForm(yes)));
    const r = render(<OneHouseJudgmentResultView result={o.data} transferDate="2020-07-01" />);
    const t = textOf(r.container);
    expect(t).toContain("직전거주주택보유주택 — 기간분 비과세");
    expect(t).not.toContain("장기임대주택 보유자 거주주택 특례");
    expect(textOf(screen.getByTestId("one-house-rental-verdict"))).toContain("기간분에 대해서만");
    expect(t).toContain("소령 §161① 안분");
  });
  it("사이드바 「선언한 특례」에 §154⑩이 적힌다 · 「아니오」면 없다", () => {
    const declared = (f: OneHouseJudgmentFormData) => computeOneHouseJudgmentSummary(f).find((i) => i.label === "선언한 특례")?.value ?? "";
    expect(declared(jForm(yes))).toContain("직전거주주택보유주택(§154⑩)");
    expect(declared(jForm((rh) => applyPhrp154_10Answer(rh, "no")))).not.toContain("§154⑩");
  });
});

describe("D-55 · D-90 중과 메뉴 요약 뒤 쟁점·기한·보류 카드", () => {
  const CASES = path.join(__dirname, "one-house-rulings/cases");
  const ruling = (file: string, id: string) =>
    (JSON.parse(fs.readFileSync(path.join(CASES, file), "utf8")) as RulingCase[]).find((c) => c.id === id)!;
  async function surcharge(c: RulingCase) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
    try {
      const f = buildCaseForm(c);
      const res = await surchargePOST(
        new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
          method: "POST",
          headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
          body: JSON.stringify(buildMultiHouseSurchargeApiBody(f)),
        }),
      );
      const json = await res.json();
      expect(res.status, JSON.stringify(json.error)).toBe(200);
      const r = render(<MultiHouseSurchargeResultView result={json.data} formHouses={f.houses} formRights={f.presaleRights} sellingStdPrice="" />);
      return { data: json.data, container: r.container };
    } finally {
      vi.useRealTimers();
    }
  }
  it("E083-dual — 「해석이 갈림」이면 쟁점 카드가 있고 「아래 판정 내역」 지시가 없다", async () => {
    const { data, container } = await surcharge(ruling("E083.json", "E083-dual"));
    expect(data.exemption.contestedIssues?.length).toBeGreaterThan(0);
    expect(textOf(screen.getByTestId("surcharge-exemption-verdict"))).toBe("해석이 갈림");
    expect(container.querySelector('[data-testid^="one-house-contested-"]')).not.toBeNull();
    expect(textOf(container)).not.toContain("(아래 판정 내역)");
    expect(textOf(container)).toContain("(양도소득세 계산기)");
  });
  it("N-E067-no-decedent-date — 과세 + 기한 안내가 요약이 가리키는 카드로 보인다", async () => {
    const { data, container } = await surcharge(ruling("E067.json", "N-E067-no-decedent-date"));
    expect(data.exemption.judgment.pending.length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid^="one-house-pending-"]')).not.toBeNull();
  });
  it("P-E112-post2013 — 판정 보류가 있는 비과세면 「판정하지 않은 부분」이 보인다", async () => {
    const { data, container } = await surcharge(ruling("E112.json", "P-E112-post2013"));
    expect(data.exemption.judgment.undetermined.length).toBeGreaterThan(0);
    expect(textOf(container)).toContain("판정하지 않은 부분");
  });
});

describe("I-15 · D-49 계산기에서 더 넣을 값", () => {
  const fill: Record<string, Record<string, string>> = {
    소재지: { addressJibun: "서울특별시 강남구 역삼동 1" },
    취득가액: { fixedAcquisitionPrice: "300000000" },
    권리가액: { redevRightsValue: "300000000" },
    "관리처분계획 인가 전 부분의 종전 주택 취득가액": { redevActualAcquisitionPrice: "200000000" },
  };
  const cases: [string, Record<string, unknown>][] = [
    ["주택 · 소재지 없음", { assetKind: "housing", acquisitionDate: "2015-01-01", residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "30" }],
    ["주택 · 소재지 있음", { assetKind: "housing", acquisitionDate: "2015-01-01", addressJibun: "서울특별시 강남구 역삼동 1", residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "30" }],
    ["입주권", { assetKind: "right_to_move_in", acquisitionDate: "2015-03-01", redevSubject: "right", redevExemptionEligibleAtApproval: "yes", redevApprovalDate: "2021-05-01" }],
  ];
  it.each(cases)("%s — 목록대로 채우면 계산기 ⑧ 0건 · 하나라도 빼면 막힌다", (_n, asset) => {
    const f = buildCaseForm(mkCase("2025-05-01", { isOneHousehold: true, transferDate: "2025-06-01", contractTotalPrice: "500000000", asset, houses: [] }));
    const list = handoffRemainingInputs(f);
    const t = handoff(f);
    const withFill = (labels: string[]) => ({ ...t, assets: [{ ...t.assets[0], ...Object.assign({}, ...labels.map((l) => fill[l])) }] });
    expect(allIssues(withFill(list) as never)).toEqual([]);
    for (const drop of list) expect(allIssues(withFill(list.filter((l) => l !== drop)) as never).length).toBeGreaterThan(0);
  });
  it("결과 화면 문구 — 목록 · 공동명의 지분 안내 · 면책 고지(I-13)", async () => {
    const o = await withToday(TODAY, () => runJudgment(jForm()));
    render(<OneHouseJudgmentResultView result={o.data} transferDate="2020-07-01" onCalculateTax={() => {}} remainingInputs={["취득가액"]} />);
    expect(textOf(screen.getByTestId("one-house-to-calculator-remaining"))).toContain("취득가액");
    expect(textOf(screen.getByTestId("one-house-to-calculator-remaining"))).not.toContain("필요경비를 추가로");
    expect(textOf(screen.getByTestId("one-house-to-calculator-share-note"))).toContain("공유 지분율");
    expect(textOf(document.body)).toContain("본 판정 결과는 참고용");
  });
});

describe("D-32 · D-31 출처 줄 문구", () => {
  it("기준값이 없으면 원인을 단정하지 않고 제목도 1주택 메뉴로 고정하지 않는다", async () => {
    render(<OneHouseJudgmentProvenanceLine form={{ importedOneHouseFacts: {} } as never} />);
    await waitFor(() => expect(screen.getByTestId("one-house-judgment-provenance")).toBeTruthy());
    const t = textOf(screen.getByTestId("one-house-judgment-provenance"));
    expect(t).not.toContain("기준값이 없는 이전 세션에서 넘어온 값입니다");
    expect(t).toContain("다주택 중과 판정 메뉴에서 넘겼거나");
    expect(t).not.toContain("출처 — 1세대1주택 비과세 판정");
  });
});

describe("D-75 장기저당담보 세 칸 — 필수 표시와 오류 이동 앵커", () => {
  it("토글을 켜면 세 칸에 data-field가 있다", () => {
    const r = render(<Step3 form={jForm((rh) => rh, { longTermMortgageSpecial: true })} onChange={() => {}} />);
    for (const f of ["longTermMortgageContractDate", "longTermMortgageBorrowerAge", "longTermMortgageContractYears"]) {
      expect(r.container.querySelector(`[data-field="${f}"]`), f).not.toBeNull();
    }
  });
});
