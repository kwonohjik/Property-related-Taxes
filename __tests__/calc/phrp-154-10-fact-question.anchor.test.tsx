/**
 * anchor — §154⑩ 사실 질문(계획서 `docs/00-pm/phrp-154-10-undeclared-one-house.plan.md` Q-1 (a) · Q-2 (a) · Q-3 (a)).
 *
 * 종전(계획서 §3 실측): 임대 등록 이력이 있는 마지막 1주택(직전거주주택보유주택)을 평범한 1주택으로 넣으면 판정 메뉴 「비과세」 ·
 * 계산기 결정세액 0이었다 — §154⑩ 선언(⑳ 토글 → B → 자동 생성 1호 삭제)을 해야 「기간분 비과세」 · 19,225,000이었다.
 * 이제 판정 메뉴·부담부증여 화면이 그 사실을 예/아니오로 반드시 묻고, 「예」면 같은 선언을 쓴다(엔진·④ 무변경).
 *
 * 시료(#2583 PC-1과 같다): 8억(취득가 6억) · 1주택 · 2018-06-01 취득·임대 등록 · 직전거주주택 2019-03-01 양도 · 2020-07-01 양도(보유 2년 1개월)
 * · 거주 13개월 · 비조정. 계산기 §161 기준시가 3억/3.5억/4억.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { handoff, runJudgment, withToday } from "./_one-house-pr6a-routes";
import { runCalc, allIssues } from "./_one-house-pr3a-calc-route";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset, makeDefaultRentalUnit, migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import {
  applyPhrp154_10Answer,
  phrp154_10AnswerOf,
  phrp154_10QuestionInScope,
  PHRP_154_10_QUESTION_FIELD,
} from "@/lib/calc/phrp-154-10-fact-question";
import { giftBurdenedRentalExceptionError } from "@/lib/calc/gift-burdened-rental-exception";
import { mergeExtractedForm } from "@/lib/one-house-ai/merge-form";
import { answerTargetOf, readAnswer, writeAnswer } from "@/lib/one-house-ai/question-answer";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Rh = AssetForm["rentalHousingException"];
const TODAY = "2020-07-02";

function jForm(rhOver: (rh: Rh) => Rh = (rh) => rh, over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const base = makeDefaultAsset(1);
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...base,
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2018-06-01",
        addressJibun: "경상남도 창원시 의창구 용호동 1",
        fixedAcquisitionPrice: "600000000",
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "13",
        rentalHousingException: rhOver(base.rentalHousingException),
      },
    ],
    transferDate: "2020-07-01",
    contractTotalPrice: "800000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
    presaleRights: [],
    householdNoPresaleRightsConfirmed: true,
    ...over,
  } as OneHouseJudgmentFormData;
}

const yes = (rh: Rh): Rh => ({ ...applyPhrp154_10Answer(rh, "yes"), priorResidenceTransferDate: "2019-03-01" });
const no = (rh: Rh): Rh => applyPhrp154_10Answer(rh, "no");
const errorsOf = (f: OneHouseJudgmentFormData) => validateAllSteps(f).filter((e) => e.severity === "error");
const phrpErrors = (f: OneHouseJudgmentFormData) => errorsOf(f).filter((e) => e.field === PHRP_154_10_QUESTION_FIELD);

async function judge(f: OneHouseJudgmentFormData) {
  const o = await withToday(TODAY, () => runJudgment(f));
  expect(o.status).toBe(200);
  const r = render(<OneHouseJudgmentResultView result={o.data} transferDate={f.transferDate} />);
  const text = (r.container.textContent ?? "").replace(/\s+/g, " ");
  cleanup();
  return { ...o, text };
}

describe("판정 메뉴 — §154⑩ 사실 질문", () => {
  it("PQ-1 ★ 미응답이면 ⑧이 막는다 — 종전에는 이 상태가 그대로 「비과세」였다", () => {
    const f = jForm();
    expect(phrp154_10QuestionInScope(f.assets[0].rentalHousingException, f.transferDate)).toBe(true);
    expect(phrpErrors(f).map((e) => e.message)).toEqual([
      "장기임대주택 특례(소득세법 시행령 §154⑩): 이 주택을 임대주택으로 등록했거나 어린이집으로 운영한 적이 있고, 보유하는 동안 다른 거주주택을 양도한 적이 있는지 「예」 또는 「아니오」로 답하세요.",
    ]);
  });

  it("PQ-2 「아니오」 → ⑧ 통과 · 판정 「비과세」 · 계산기 0 (종전 미선언과 같은 결론)", async () => {
    const f = jForm(no);
    expect(errorsOf(f)).toEqual([]);
    const v = await judge(f);
    expect(v.data.judgment.isExempt).toBe(true);
    expect(v.text).not.toContain("기간분 비과세");
    const r = await withToday(TODAY, () => runCalc(handoff(f)));
    expect(r.issues).toEqual([]);
    expect(r.totalTax).toBe(0);
  });

  it("PQ-3 ★ 「예」 → §154⑩ 선언(B · 임대주택 0호 · 등록 사실) → 판정 「기간분 비과세」 · 계산기 §161 안분 19,225,000(#2583 PC-1 대조값)", async () => {
    const f = jForm(yes);
    const rh = f.assets[0].rentalHousingException;
    expect(rh).toMatchObject({ applyException: true, scenario: "B", rentalUnits: [], wasRegisteredRentalOrChildcare: true, phrp154_10Answer: "yes" });
    expect(errorsOf(f)).toEqual([]);
    const v = await judge(f);
    expect(v.text).toContain("기간분 비과세");

    // 계산기 — §161① 안분 입력(세액 축)은 계산기에서 받는다(Q-7). 비우면 ⑧이 막는다.
    const calc = handoff(f);
    expect(allIssues(calc).some((i) => i.includes("취득 당시 기준시가"))).toBe(true);
    const withPrices = {
      ...calc,
      assets: [
        {
          ...calc.assets[0],
          rentalHousingException: {
            ...calc.assets[0].rentalHousingException,
            standardPriceAtAcquisitionForPhrp: "300,000,000",
            standardPriceAtPriorTransfer: "350,000,000",
            standardPriceAtTransferForPhrp: "400,000,000",
          },
        },
        ...calc.assets.slice(1),
      ],
    } as typeof calc;
    const r = await withToday(TODAY, () => runCalc(withPrices));
    expect(r.issues).toEqual([]);
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.r.determinedTax).toBe(19_225_000);
  });

  it("PQ-4 게이트 — ⑳ 임대주택 1호 이상 선언 · 2011.10.14. 전 양도 · 입주권 양도는 묻지 않는다", () => {
    const withUnit = (rh: Rh): Rh => ({ ...rh, applyException: true, scenario: "A", rentalUnits: [makeDefaultRentalUnit()] });
    expect(phrp154_10QuestionInScope(withUnit(jForm().assets[0].rentalHousingException), "2020-07-01")).toBe(false);
    expect(phrpErrors(jForm(withUnit))).toEqual([]);
    // §154⑩ <신설 2011.10.14> · 대통령령 제23218호 부칙 제2조 「이 영 시행 후 최초로 양도하는 주택부터」
    const rh0 = jForm().assets[0].rentalHousingException;
    expect(phrp154_10QuestionInScope(rh0, "2011-10-13")).toBe(false);
    expect(phrp154_10QuestionInScope(rh0, "2011-10-14")).toBe(true);
    expect(phrp154_10QuestionInScope(rh0, "")).toBe(true);
    const right = jForm(undefined, {});
    right.assets[0] = { ...right.assets[0], assetKind: "right_to_move_in" } as AssetForm;
    expect(phrpErrors(right)).toEqual([]);
  });

  it("PQ-5 V-5 — 응답은 선언 상태에서 도출한다: 「예」 뒤 ⑳ 토글을 끄면 미응답으로 돌아가고, 「아니오」는 §154⑩ 선언만 거둔다", () => {
    const declared = jForm(yes).assets[0].rentalHousingException;
    expect(phrp154_10AnswerOf(declared)).toBe("yes");
    const toggledOff = { ...declared, applyException: false };
    expect(phrp154_10AnswerOf(toggledOff)).toBeUndefined();
    expect(phrpErrors(jForm(() => toggledOff))).toHaveLength(1);
    const undone = applyPhrp154_10Answer(declared, "no");
    expect(undone).toMatchObject({ applyException: false, scenario: "A", phrp154_10Answer: "no" });
    expect(phrp154_10AnswerOf(undone)).toBe("no");
    // ⑳ 토글을 켰다 끈 뒤(자동 생성 1호가 남는다) 「예」 — 남은 호를 비워야 §154⑩ 선언(0호)이 된다
    const stale = { ...jForm().assets[0].rentalHousingException, rentalUnits: [makeDefaultRentalUnit()] };
    const fromStale = applyPhrp154_10Answer(stale, "yes");
    expect(fromStale.rentalUnits).toEqual([]);
    expect(phrp154_10AnswerOf(fromStale)).toBe("yes");
    // 저장된 「예」만으로는 「예」가 아니다 — 선언이 없으면 엔진은 §154⑩을 모른다
    expect(phrp154_10AnswerOf({ ...toggledOff, phrp154_10Answer: "yes" })).toBeUndefined();
  });

  it("PQ-6 V-4 마이그레이션 — 구 기록(필드 없음)은 미응답 · ⑳ 토글로 §154⑩을 선언한 구 기록은 「예」", () => {
    const legacy = (rh: Partial<Rh>) => {
      const a = { ...makeDefaultAsset(1), rentalHousingException: { ...makeDefaultAsset(1).rentalHousingException, ...rh } } as AssetForm;
      delete (a.rentalHousingException as Partial<Rh>).phrp154_10Answer;
      migrateAsset(a as never);
      return a.rentalHousingException;
    };
    expect(legacy({}).phrp154_10Answer).toBe("");
    expect(phrp154_10AnswerOf(legacy({}))).toBeUndefined();
    expect(phrp154_10AnswerOf(legacy({ applyException: true, scenario: "B", rentalUnits: [] }))).toBe("yes");
  });
});

describe("부담부증여(증여세 화면 양도분) — Q-3 (a) 같은 질문·같은 ⑧", () => {
  const item = (rh?: Rh): EstateItem =>
    ({
      id: "apt-1",
      category: "real_estate_apartment",
      name: "테스트 아파트",
      standardPrice: 300_000_000,
      leaseDeposit: 150_000_000,
      mortgageAmount: 0,
      assumedDebtForGift: 150_000_000,
      monthlyRent: 0,
      burdenedGiftTransferTax: {
        acquisitionDate: new Date("2018-06-01"),
        standardPriceAtAcquisition: 150_000_000,
        isOneHousehold: true,
        householdHousingCount: 1,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: 13,
        isUnregistered: false,
        ...(rh ? { rentalHousingException: rh } : {}),
      },
    }) as EstateItem;
  const err = (rh?: Rh, giftDate = "2020-07-01") =>
    giftBurdenedRentalExceptionError(item(rh), item(rh).burdenedGiftTransferTax!, giftDate, "테스트 아파트");
  const base = makeDefaultAsset(1).rentalHousingException;

  it("PG-1 ★ 미응답(옛 기록 — 특례 입력 없음 포함)이면 막고, 「아니오」면 통과한다", () => {
    expect(err()).toContain("§154⑩");
    expect(err(base)).toContain("§154⑩");
    expect(err(no(base))).toBeNull();
    expect(err(undefined, "2011-10-13")).toBeNull();
  });

  it("PG-2 「예」 → 같은 §154⑩ 선언 — 이후는 계산기와 같은 leaf가 §161① 입력을 요구한다", () => {
    expect(err(yes(base))).toContain("취득 당시 기준시가");
  });
});

describe("AI 사실 추출 — 같은 칸을 같은 쓰기로", () => {
  const spec = ONE_HOUSE_FIELD_CATALOG.find((s) => s.path === "asset.rentalHousingException.phrp154_10Answer");

  it("PA-1 필드 사전에 있고, 답하면 화면 질문과 같은 선언을 쓴다 · 읽기는 도출값", () => {
    expect(spec).toBeDefined();
    const f = jForm();
    const target = answerTargetOf("asset.rentalHousingException.phrp154_10Answer", spec, f)!;
    expect(target).not.toBeNull();
    expect(readAnswer(f, target)).toBe("");
    const answered = writeAnswer(f, target, "yes");
    expect(answered.assets[0].rentalHousingException).toMatchObject({ applyException: true, scenario: "B", rentalUnits: [], wasRegisteredRentalOrChildcare: true });
    expect(readAnswer(answered, target)).toBe("yes");
    expect(readAnswer(writeAnswer(answered, target, "no"), target)).toBe("no");
  });

  it("PA-2 추출 결과에 「예」가 있으면 합칠 때 선언으로 옮긴다", () => {
    const merged = mergeExtractedForm({ asset: { assetKind: "housing", rentalHousingException: { phrp154_10Answer: "yes" } } } as never);
    expect(merged.assets[0].rentalHousingException).toMatchObject({ applyException: true, scenario: "B", rentalUnits: [], wasRegisteredRentalOrChildcare: true });
  });
});
