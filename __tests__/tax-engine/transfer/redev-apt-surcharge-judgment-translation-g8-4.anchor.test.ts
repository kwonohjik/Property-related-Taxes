/**
 * G8-4 anchor — 재개발 완공 신축주택(`redevelopment_apt`)도 **중과 배제 ①②요소**가 비과세 판정과 같은
 * 번역 입력(`translateRedevAptForHousingJudgment`)을 본다.
 *
 * ## 결함 (수정 전 실측)
 * 중과 STEP 0.5의 ① 요소(§155 의제 · §89② 게이트 · §156의2·§156의3 예외 의제)와 ② 요소(§154① 충족)가
 * 번역하지 않은 입력(`propertyType: "redevelopment_apt"` · 승계조합원 입주권 취득일)을 읽었다.
 *   · `resolveArticle89Clause2`는 `propertyType !== "housing"`이면 늘 `not_applicable` ⇒ §89②로 비과세가
 *     꺼진 세대에 중과 배제가 서고, §156의2·§156의3 예외 의제는 열리지 않았다.
 *   · 승계조합원은 비과세가 준공일 기준 보유 미달인데 ② 요소는 입주권 취득일 기준으로 충족이었다.
 *
 * ## 법령 (KoreanLaw MCP — 소득세법 MST 280405 · 같은 법 시행령 MST 290841 원문)
 * - 「소득세법」 제89조제2항: 「1세대가 주택 … 과 조합원입주권 또는 분양권을 보유하다가 그 주택을 양도하는
 *   경우에는 제1항에도 불구하고 같은 항 제3호를 적용하지 아니한다」 — 판단 대상은 「그 주택」의 양도이지
 *   내부 자산 태그가 아니다.
 * - 「소득세법 시행령」 제167조의4제3항제7호·제167조의10제1항제15호·제167조의3제1항제13호·제167조의11제1항제13호:
 *   「제155조 … 에 따라 … 제154조제1항이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택」
 *   ⇒ §89②로 §154①이 적용되지 않으면 ① 요소가 서지 않고, §156의2·§156의3 예외를 충족하면 의제가 선다.
 * - 「소득세법 시행령」 제162조제1항제4호: 「자기가 건설한 건축물에 있어서는 … 사용승인서 교부일」.
 *   승계조합원 신축주택의 취득시기를 준공일로 보는 근거는 코드 주석이 인용한 사전-2019-법령해석재산-0649인데
 *   **해석 원문은 이번에도 확인하지 못했다(확인 필요)**. 다만 엔진은 비과세·세율 보유기간에 이미 준공일을 쓴다 —
 *   ② 요소만 다른 취득일을 쓰는 것은 내부 불일치다(이 anchor는 그 일관성만 고정한다).
 *
 * ⚠️ 세액은 §166 산식 차가 섞이므로 **판정(중과 유형 · 배제 사유)만** 단언한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { translateRedevAptForHousingJudgment } from "@/lib/tax-engine/one-house/redev-apt-judgment-input";
import { baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const GN = "1168010100";
const h = (id: string, acq: string): HouseInfo => ({
  id, acquisitionDate: D(acq), officialPrice: 300_000_000, region: "capital", regionCode: GN,
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
});
const RIGHT = (acq: string) => ({ id: "r", type: "redevelopment_right", acquisitionDate: D(acq), region: "capital", regionCode: GN });
const REDEV = {
  subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: D("2017-01-01"),
  rightsValue: 500_000_000, settlementDirection: "pay", settlementAmount: 0,
  preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "housing", completionDate: D("2020-01-01"),
} as never;

function base(x: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 2_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01"),
    transferDate: D("2026-09-18"), isRegulatedArea: true, wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 0, regionCode: GN, sellingHouseId: "selling", ...x,
  });
}
const housing = (x: Partial<TransferTaxInput>) => base({ ...x, propertyType: "housing" });
const redev = (x: Partial<TransferTaxInput>, r = REDEV) =>
  base({ ...x, propertyType: "redevelopment_apt", redevelopment: r });

function mh(i: TransferTaxInput) {
  const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  const e = r.multiHouseSurchargeEvaluation;
  return { isExempt: r.isExempt, surchargeType: e?.surchargeType, reasons: (e?.exclusionReasons ?? []).map((x) => x.type) };
}

const TEMP = { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D("2025-01-01") };
/** 주택 2 + 입주권(2012 취득 — §156의2③ 3년 초과·예외 없음) + 일시적 2주택 */
const R2N = {
  householdHousingCount: 2, houses: [h("selling", "2015-01-01"), h("n", "2025-01-01")],
  temporaryTwoHouse: TEMP, presaleRights: [RIGHT("2012-01-01")] as never,
};
/** 주택 1 + 입주권(2025 취득 — §156의2③ 3년 내 예외) */
const R1 = { householdHousingCount: 1, houses: [h("selling", "2015-01-01")], presaleRights: [RIGHT("2025-01-01")] as never };

describe("G8-4 — 완공APT 중과 ① 요소의 §89② 게이트", () => {
  it("R2n 대조 — housing은 §89②로 의제가 꺼져 3주택+ 중과(배제 사유 없음)", () => {
    expect(mh(housing(R2N))).toMatchObject({ isExempt: false, surchargeType: "multi_house_3plus", reasons: [] });
  });

  it("R2n — 같은 사실의 완공APT도 housing과 같은 중과 판정(수정 전: none + temporary_two_house 배제)", () => {
    const r = mh(redev(R2N));
    expect(r).toMatchObject({ isExempt: false, surchargeType: "multi_house_3plus", reasons: [] });
  });

  it("R1 대조 — housing은 §156의2③ 예외 의제가 서서 중과 배제(right_holding_one_house)", () => {
    expect(mh(housing(R1))).toMatchObject({ surchargeType: "none", reasons: ["right_holding_one_house"] });
  });

  it("R1 — 같은 사실의 완공APT도 예외 의제가 선다(수정 전: 의제 미개방으로 중과)", () => {
    expect(mh(redev(R1))).toMatchObject({ surchargeType: "none", reasons: ["right_holding_one_house"] });
  });

  it("긍정 짝 — 권리가 없는 일시적 2주택 완공APT는 종전대로 §155① 의제로 배제(번역이 정상 배선을 깨지 않는다)", () => {
    const c = { householdHousingCount: 2, houses: [h("selling", "2015-01-01"), h("n", "2025-01-01")], temporaryTwoHouse: TEMP };
    expect(mh(redev(c))).toMatchObject({ surchargeType: "none", reasons: ["temporary_two_house"] });
    expect(mh(housing(c))).toMatchObject({ surchargeType: "none", reasons: ["temporary_two_house"] });
  });
});

describe("G8-4 — 승계조합원 완공APT ② 요소(§154① 충족)의 보유 기산일 = 준공일", () => {
  const succ = (completion: string) =>
    ({
      ...(REDEV as object), approvalDate: D("2014-01-01"), rightsValue: 0,
      isSuccessorMember: true, completionDate: D(completion),
    }) as never;
  // 거주 36개월 — 취득 당시 조정대상지역(강남 · regionCode 정밀 판정) 거주요건 2년은 충족시켜 **보유 기산일만** 갈리게 한다.
  // 종전주택(=입주권 승계 취득일)은 2015-01-01 — §155① 「1년 이상 후 신규 취득」 타이밍은 어느 준공일에서도 충족된다.
  // 갈리는 것은 §154① 보유 기산일뿐이다(번역 전 = 입주권 취득일 2015 · 번역 후 = 준공일).
  const facts = {
    residencePeriodMonths: 36,
    householdHousingCount: 2,
    houses: [h("selling", "2015-01-01"), h("n", "2026-01-01")],
    temporaryTwoHouse: { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D("2026-01-01") },
    isSuccessorRightToMoveIn: true,
  };

  it("준공 2025-06-01(보유 2년 미달) — 비과세도 ② 요소도 불성립: 15호 배제 없이 2주택 중과", () => {
    expect(mh(redev(facts, succ("2025-06-01")))).toMatchObject({
      isExempt: false, surchargeType: "multi_house_2", reasons: [],
    });
  });

  it("긍정 짝 — 준공 2020-01-01(보유 2년 이상) — 같은 사실에서 ② 요소가 서서 §155① 배제", () => {
    expect(mh(redev(facts, succ("2020-01-01")))).toMatchObject({
      surchargeType: "none", reasons: ["temporary_two_house"],
    });
  });
});

describe("G8-4 — 승계조합원 × 주택 1 + 입주권(§156의2③ 예외): 보유 기산일은 준공일", () => {
  // ⚠️ ①(§156의2③ 예외 의제 — `resolveArticle89Clause2`의 E-5)과 ②(`sellingHouseMeetsOneHouseRequirements`) **둘 다**
  //    같은 번역 입력의 §154① 보유를 본다(겹친 방어). 그래서 ②의 번역만 되돌리는 뮤테이션은 이 시료에서 살아남는다 —
  //    ① 번역을 되돌리면(M3c) 죽는다. ② 번역은 겹친 방어라 단독 판별 시료가 없다(보고서에 한계로 적었다).
  const succ = (completion: string) =>
    ({
      ...(REDEV as object), approvalDate: D("2014-01-01"), rightsValue: 0,
      isSuccessorMember: true, completionDate: D(completion),
    }) as never;
  const facts = {
    residencePeriodMonths: 36, // 거주 요건(조정지역 취득 시 2년)은 충족시켜 **보유 기산일만** 갈리게 한다
    householdHousingCount: 1,
    houses: [h("selling", "2015-01-01")],
    // 입주권은 주택(=준공일 이후) 취득 뒤에 샀다 — §156의2③ 「주택 취득 후 3년 내 취득한 입주권」 예외가 서도록
    presaleRights: [RIGHT("2025-09-01")] as never,
    isSuccessorRightToMoveIn: true,
  };

  it("준공 2025-06-01(보유 2년 미달) — 비과세는 준공일 기준 불성립 → ② 요소도 불성립: 의제 배제 없음", () => {
    const r = mh(redev(facts, succ("2025-06-01")));
    expect(r.reasons).toEqual([]);
    expect(r.surchargeType).not.toBe("none");
  });

  it("긍정 짝 — 준공 2020-01-01(보유 2년 이상) — ②가 서서 §156의2③ 예외 의제로 중과 배제", () => {
    expect(mh(redev(facts, succ("2020-01-01")))).toMatchObject({ surchargeType: "none", reasons: ["right_holding_one_house"] });
  });
});

describe("G8-4 — leaf `translateRedevAptForHousingJudgment`", () => {
  it("완공APT가 아니면 동일 참조(번역 없음)", () => {
    const i = housing(R1);
    expect(translateRedevAptForHousingJudgment(i)).toBe(i);
    const right = redev(R1, { ...(REDEV as object), subject: "right" } as never);
    expect(translateRedevAptForHousingJudgment(right)).toBe(right);
  });

  it("원조합원 — housing으로 번역하되 취득일은 종전주택 그대로", () => {
    const t = translateRedevAptForHousingJudgment(redev(R1));
    expect(t.propertyType).toBe("housing");
    expect(t.acquisitionDate).toEqual(D("2015-01-01"));
  });

  it("승계조합원 — 취득일 = 준공일, 거주월수 = 신축 거주(분리 입력)", () => {
    const r = { ...(REDEV as object), isSuccessorMember: true, completionDate: D("2022-03-01"), newHouseResidenceMonths: 18, priorHouseResidenceMonths: 99 } as never;
    const t = translateRedevAptForHousingJudgment(redev({ ...R1, residencePeriodMonths: 60 }, r));
    expect(t.acquisitionDate).toEqual(D("2022-03-01"));
    expect(t.residencePeriodMonths).toBe(18);
  });
});
