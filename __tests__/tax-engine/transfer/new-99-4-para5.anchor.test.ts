/**
 * L8 NH-51 anchor — 조특법 §99의4⑤ (2019.1.1.~2020.12.31. 양도분): 수도권 조정대상지역 2주택 중 1주택을 양도하고
 * 소득세법 §105①1호 본문 기간(양도일이 속하는 달의 말일부터 2개월) 안에 농어촌주택등을 취득하면 §104⑦ 비적용 · 장특 허용.
 *
 * 법문·부칙(KoreanLaw MCP 실독 2026-11-06): 조특법 2019.04.30. 시행본(MST 208557) §99의4⑤ · 법률 제16009호 부칙 제1조(2019.1.1. 시행)·
 * 제2조③(양도소득세 개정규정은 시행 이후 양도하는 경우부터) · 소득세법 2020.07.01. 시행본 §105①1호 본문 · 법률 제21223호(2025.12.23.,
 * 2026.1.1. 시행)가 ⑤를 삭제했고 양도소득세 경과조치·적용례는 없다.
 *
 * 공통 사실관계: 양도 2020-08-01 · 양도가 12억 · 취득 2015-03-01 5억 · 양도 주택 강남구(1168010100) 공시가격 3억 + 다른 주택 서초구
 * (1165010100) 2.5억 = 합산 5.5억 · 농어촌주택 150㎡·대지 500㎡·기준시가 1.5억 · 소재지 요건 확인.
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | P5-0 | 수정 전 재현 — 선언 없음 → 2주택 중과 359,436,000 · 장특 0 |
 * | P5-1 | 성립 → 250,371,000(−109,065,000) · 중과 없음 · 장특 70,000,000 · 계산 과정·배제 사유·⑥ 고지 |
 * | P5-2 | 예정신고기한 경계 — 양도일이 속하는 달의 말일부터 2개월(2020-10-31) 성립 / 11-01 불성립 · 같은 날 취득 불성립 |
 * | P5-3 | 합산 6억 경계 — 600,000,000 성립 / 600,000,001 불성립 |
 * | P5-4 | 양도일 범위 — 2020-12-31 성립 / 2021-01-01 · 2018-12-31 평가 안 함(고지 없음) |
 * | P5-5 | 모름 = 불성립 + 확인 필요 — 보유 주택 목록 없음 · 다른 주택 법정동코드 없음 · 공시가격 없음 |
 * | P5-6 | 2주택만 — 3채 · 분양권 보유 · 다른 주택 비수도권/비조정 불성립 |
 * | P5-7 | 농어촌주택 요건(① 가액·소재지·취득기간 종기 2020.12.31.) 미달 → 불성립 |
 * | P5-8 | 고향주택 선언도 같은 경로 · ③ 연접 「예」여도 ⑤는 묻지 않는다 |
 * | P5-9 | 감시 — 취득이 양도 전(①)이면 ⑤를 평가하지 않는다 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { newPreliminaryFilingDeadline } from "@/lib/tax-engine/transfer-reductions/new-99-4-para5";
import { makeMockRatesWithHouseEngine, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";

const rates = makeMockRatesWithHouseEngine();
const D = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const rural = (acq: string, over: Record<string, unknown> = {}) => ({
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: D(acq),
  ruralHouseStdPrice: 150_000_000,
  isRegisteredHanok: false,
  adjacentArea994: "no" as const,
  meetsLocationRequirement: true,
  ruralLandAreaSqm994: 500,
  ruralHouseType994: "other" as const,
  ruralHouseAreaSqm994: 100,
  ...over,
});
const sell = (over = {}) =>
  makeHouseInfo("selling", {
    acquisitionDate: D("2015-03-01"),
    officialPrice: 300_000_000,
    transferOfficialPrice: 300_000_000,
    region: "capital",
    regionCode: "1168010100",
    ...over,
  });
const other = (over = {}) =>
  makeHouseInfo("other", {
    acquisitionDate: D("2016-03-01"),
    officialPrice: 250_000_000,
    transferOfficialPrice: 250_000_000,
    region: "capital",
    regionCode: "1165010100",
    ...over,
  });

const BASE_TAX = 359_436_000;
const P5_TAX = 250_371_000;

function run(over: Partial<TransferTaxInput>) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2015-03-01"),
      transferDate: D("2020-08-01"),
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: true,
      regionCode: "1168010100",
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      houses: [sell(), other()],
      sellingHouseId: "selling",
      ...over,
    }),
    rates,
  );
}
const p5Step = (r: ReturnType<typeof run>) => r.steps.find((s) => s.label.includes("§99의4⑤"));
const warns = (r: ReturnType<typeof run>) => r.multiHouseSurchargeDetail?.warnings ?? [];

describe("P5-0·1 성립", () => {
  it("[P5-0] 수정 전 재현 — 선언이 없으면 2주택 중과 359,436,000 · 장특 0", () => {
    const r = run({ reductions: [] });
    expect(r.totalTax).toBe(BASE_TAX);
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(p5Step(r)).toBeUndefined();
  });

  it("[P5-1] 양도 2020-08-01 · 농어촌 2020-09-15 취득 → 중과 비적용 · 장특 70,000,000 · 250,371,000", () => {
    const r = run({ reductions: [rural("2020-09-15")] });
    expect(r.totalTax).toBe(P5_TAX);
    expect(BASE_TAX - r.totalTax).toBe(109_065_000);
    expect(r.surchargeType).toBeUndefined();
    expect(r.longTermHoldingDeduction).toBe(70_000_000);
    expect(p5Step(r)?.label).toContain("중과 비적용");
    expect(p5Step(r)?.formula).toContain("합산 550,000,000원");
    expect(p5Step(r)?.formula).toContain("2020-10-31");
    expect(r.multiHouseSurchargeDetail?.exclusionReasons.map((x) => x.detail)).toEqual([
      expect.stringContaining("조특법 §99의4⑤"),
    ]);
    // ⑥ 사후관리 고지(보유 3년·거주 2년) + 해석 칸 확인 필요
    expect(warns(r).some((w) => w.includes("조특법 §99의4⑥") && w.includes("3년 이상 보유하지 아니하거나"))).toBe(true);
    expect(warns(r).some((w) => w.includes("확인 필요"))).toBe(true);
  });

  it("[P5-1+] 짝 — 같은 사실에서 다른 주택이 비조정(서울 외 수도권 비지정 지역 대신 비수도권)이면 중과 그대로", () => {
    const r = run({ reductions: [rural("2020-09-15")], houses: [sell(), other({ region: "non_capital", regionCode: "2644010100" })] });
    expect(r.totalTax).toBeGreaterThan(P5_TAX);
    expect(p5Step(r)?.label).toContain("적용하지 않음");
  });
});

describe("P5-2 소득세법 §105①1호 본문 기간", () => {
  it("[P5-2a] 기한 계산 — 8월 양도 → 10월 31일 / 11월 양도 → 이듬해 1월 31일 / 12월 양도 → 2월 28일(평년)·29일(윤년)", () => {
    expect(iso(newPreliminaryFilingDeadline(D("2020-08-01")))).toBe("2020-10-31");
    expect(iso(newPreliminaryFilingDeadline(D("2020-11-30")))).toBe("2021-01-31");
    expect(iso(newPreliminaryFilingDeadline(D("2019-12-15")))).toBe("2020-02-29");
    expect(iso(newPreliminaryFilingDeadline(D("2020-12-31")))).toBe("2021-02-28");
  });
  it("[P5-2b] 2020-10-31 취득 → 성립 / 2020-11-01 → 불성립(중과 그대로) · 사유가 계산 과정에 남는다", () => {
    expect(run({ reductions: [rural("2020-10-31")] }).totalTax).toBe(P5_TAX);
    const late = run({ reductions: [rural("2020-11-01")] });
    expect(late.totalTax).toBe(BASE_TAX);
    expect(p5Step(late)?.formula).toContain("2020-10-31까지");
    expect(warns(late).some((w) => w.includes("넘었습니다"))).toBe(true);
  });
  it("[P5-2c] 양도일과 같은 날 취득 → 불성립 + 확인 필요", () => {
    const r = run({ reductions: [rural("2020-08-01")] });
    expect(r.totalTax).toBe(BASE_TAX);
    expect(warns(r).some((w) => w.startsWith("확인 필요") && w.includes("양도일과 같아"))).toBe(true);
  });
});

describe("P5-3 합산 6억원 이하", () => {
  it("[P5-3] 양도 시 공시가격 합산 600,000,000 성립 / 600,000,001 불성립", () => {
    expect(run({ reductions: [rural("2020-09-15")], houses: [sell({ transferOfficialPrice: 350_000_000 }), other()] }).totalTax).toBe(P5_TAX);
    const over = run({ reductions: [rural("2020-09-15")], houses: [sell({ transferOfficialPrice: 350_000_001 }), other()] });
    expect(over.totalTax).toBe(BASE_TAX);
    expect(warns(over).some((w) => w.includes("600,000,001원이 6억원을 넘습니다"))).toBe(true);
  });
  it("[P5-3+] 양도 시 가격(transferOfficialPrice)이 있으면 취득 시 가격보다 우선한다", () => {
    const r = run({
      reductions: [rural("2020-09-15")],
      houses: [sell({ officialPrice: 100_000_000, transferOfficialPrice: 400_000_000 }), other()],
    });
    expect(r.totalTax).toBe(BASE_TAX);
  });
});

describe("P5-4 양도일 범위 2019.1.1.~2020.12.31.", () => {
  it("[P5-4] 2020-12-31 양도(농어촌 2020-12-31 취득 아님 — 2021-02-28까지 기한이나 종기 2020.12.31.) 경계", () => {
    // 양도 2020-12-31 · 농어촌 2020-12-31 = 같은 날 → 불성립(P5-2c). 양도 2020-12-30 · 취득 2020-12-31 → 성립
    expect(run({ transferDate: D("2020-12-30"), reductions: [rural("2020-12-31")] }).totalTax).toBeLessThan(BASE_TAX);
  });
  it("[P5-4+] 2021-01-01 양도 · 2018-12-31 양도 → ⑤를 평가하지 않는다(계산 과정 없음 · 중과 그대로)", () => {
    for (const [t, a] of [["2021-01-01", "2021-02-15"], ["2018-12-31", "2019-01-20"]] as const) {
      const r = run({ transferDate: D(t), reductions: [rural(a)] });
      expect(p5Step(r)).toBeUndefined();
      expect(r.surchargeType).toBe("multi_house_2");
    }
  });
  it("[P5-4++] 취득기간 종기 2020.12.31. — 양도 2020-12-15 · 취득 2021-01-10(기한 안이나 종기 밖) → 불성립", () => {
    const r = run({ transferDate: D("2020-12-15"), reductions: [rural("2021-01-10")] });
    expect(r.surchargeType).toBe("multi_house_2");
    expect(warns(r).some((w) => w.includes("취득기간(2003.8.1~2020.12.31) 외"))).toBe(true);
  });
});

describe("P5-5 모름 = 불성립 + 확인 필요", () => {
  it("[P5-5a] 보유 주택 목록이 없으면 적용하지 않는다(⑤는 목록에서만 판정) — 레거시 경로 중과 유지", () => {
    const r = run({ reductions: [rural("2020-09-15")], houses: undefined });
    expect(r.totalTax).toBe(BASE_TAX);
  });
  it("[P5-5b] 다른 주택의 법정동코드가 없으면 조정대상지역을 알 수 없다 → 불성립 + 확인 필요", () => {
    const r = run({ reductions: [rural("2020-09-15")], houses: [sell(), other({ regionCode: undefined })] });
    expect(r.totalTax).toBe(BASE_TAX);
    expect(warns(r).some((w) => w.startsWith("확인 필요") && w.includes("법정동코드"))).toBe(true);
  });
  it("[P5-5c] 공시가격이 없는 주택이 있으면 합산을 알 수 없다 → 불성립 + 확인 필요", () => {
    const r = run({
      reductions: [rural("2020-09-15")],
      houses: [sell({ officialPrice: 0, transferOfficialPrice: undefined }), other()],
    });
    expect(r.totalTax).toBe(BASE_TAX);
    expect(warns(r).some((w) => w.startsWith("확인 필요") && w.includes("개별주택가격"))).toBe(true);
  });
});

describe("P5-6 「2주택만을 소유」", () => {
  it("[P5-6a] 3채 보유 → 불성립(3주택 중과 그대로)", () => {
    const r = run({
      reductions: [rural("2020-09-15")],
      householdHousingCount: 3,
      houses: [sell(), other(), makeHouseInfo("third", { regionCode: "1165010100" })],
    });
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(warns(r).some((w) => w.includes("3채"))).toBe(true);
  });
  it("[P5-6b] 분양권 보유 → 불성립", () => {
    const r = run({
      reductions: [rural("2020-09-15")],
      presaleRights: [{ id: "p1", type: "presale_right", acquisitionDate: D("2020-03-01"), region: "capital" }],
    });
    expect(warns(r).some((w) => w.includes("분양권·조합원입주권"))).toBe(true);
    expect(p5Step(r)?.label).toContain("적용하지 않음");
  });
  it("[P5-6c] 다른 주택이 수도권이지만 조정대상지역 밖(경기 이천 4150010100)이면 불성립", () => {
    const r = run({ reductions: [rural("2020-09-15")], houses: [sell(), other({ regionCode: "4150010100" })] });
    expect(r.totalTax).toBe(BASE_TAX);
    expect(p5Step(r)?.label).toContain("적용하지 않음");
  });
});

describe("P5-7 농어촌주택 요건", () => {
  it("[P5-7a] 취득 당시 기준시가 합계 2억 초과(양도 2020 — 한도 2억) → 불성립 · 2억 이하 성립", () => {
    expect(run({ reductions: [rural("2020-09-15", { ruralHouseStdPrice: 200_000_000 })] }).totalTax).toBe(P5_TAX);
    const r = run({ reductions: [rural("2020-09-15", { ruralHouseStdPrice: 200_000_001 })] });
    expect(r.totalTax).toBe(BASE_TAX);
    expect(warns(r).some((w) => w.includes("기준시가 합계가 한도(2억)를 초과"))).toBe(true);
  });
  it("[P5-7b] 소재지 요건 미확인 → 불성립 / 대지면적 미입력(2021.1.1. 전 양도 660㎡ 요건) → 불성립 + 확인 필요", () => {
    expect(run({ reductions: [rural("2020-09-15", { meetsLocationRequirement: false })] }).totalTax).toBe(BASE_TAX);
    const r = run({ reductions: [rural("2020-09-15", { ruralLandAreaSqm994: undefined })] });
    expect(r.totalTax).toBe(BASE_TAX);
    expect(warns(r).some((w) => w.startsWith("확인 필요") && w.includes("대지면적"))).toBe(true);
  });
});

describe("P5-8 고향주택 · ③", () => {
  it("[P5-8a] 고향주택 선언(2009.1.1. 이후 취득 · 고향 요건 확인)도 같은 경로로 성립", () => {
    const r = run({
      reductions: [
        {
          type: "new_99_4_hometown" as const,
          ruralHouseAcquisitionDate: D("2020-09-15"),
          ruralHouseStdPrice: 150_000_000,
          isRegisteredHanok: false,
          adjacentArea994: "no" as const,
          meetsLocationRequirement: true,
          meetsHometownRequirement: true,
          ruralLandAreaSqm994: 500,
          ruralHouseType994: "other" as const,
          ruralHouseAreaSqm994: 100,
        },
      ],
    });
    expect(r.totalTax).toBe(P5_TAX);
  });
  it("[P5-8b] ③ 연접 「예」여도 ⑤는 묻지 않는다(③은 제1항에 한정) — 짝: ①이면 불성립", () => {
    expect(run({ reductions: [rural("2020-09-15", { adjacentArea994: "yes" })] }).totalTax).toBe(P5_TAX);
  });
});

describe("P5-9 취득이 양도 전이면 ①의 몫", () => {
  it("[P5-9] 농어촌 2020-05-01 취득(양도 전) → ⑤ 계산 과정 없음", () => {
    const r = run({ reductions: [rural("2020-05-01")] });
    expect(p5Step(r)).toBeUndefined();
  });
});
