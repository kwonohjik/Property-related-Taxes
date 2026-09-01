// D4-09 · D3-08 · D5-01 · D4-06 anchor — 모드 2 주택수 제외의 취득기간 판정 기준은 조문마다 다르다
//
// 조문 실측 (조특법):
//  · §98의8① 「… 2015년 1월 1일부터 2015년 12월 31일까지 **최초로 매매계약을 체결**하고
//    5년 이상 임대한 주택 …」 — 취득일 기준 창이 없다 ⇒ contract_only (D4-09)
//  · §99의2① 「… 2013년 4월 1일부터 2013년 12월 31일까지 … **최초로 매매계약을 체결하여
//    그 계약에 따라 취득**(2013년 12월 31일까지 매매계약을 체결하고 계약금을 지급한 경우를
//    포함)한 경우 …」 — 기간이 지배하는 것은 매매계약 체결이다 ⇒ contract_only (D4-09)
//  · §98의6① 1호는 「사업주체등이 … 2011년 12월 31일까지 **임대계약을 체결**하여 2년 이상
//    임대한 주택으로서 … 최초로 매매계약을 체결하고 취득한 주택」, 2호는 매수자의 임대계약이
//    2011.12.31 이전일 것. 매수자의 취득·매매계약일에는 기한이 없고 ②에도 취득기간 문언이
//    없다 ⇒ 창 자체가 없다 (D5-01). 종전 창 [2011-03-29, 2011-12-31]은 1호를 구조적으로 탈락시켰다.
//  · §99①1호 「1998년 5월 22일부터 1999년 6월 30일까지의 기간(**국민주택의 경우에는**
//    1998년 5월 22일부터 1999년 12월 31일까지로 한다. 이하 이 조에서 "신축주택취득기간")」
//    ⇒ 종기가 국민주택 여부로 갈린다 (D3-08). 감면 본판정 new-99.ts와 상수를 공유한다.
//  · §99의3② 「「소득세법」 제89조제1항제3호를 적용할 때 제1항을 적용받는 신축주택과 그 외의
//    주택을 보유한 거주자가 그 신축주택 외의 주택을 2007년 12월 31일까지 양도하는 경우에만
//    그 신축주택을 거주자의 소유주택으로 보지 아니한다」 — §99②와 문언 동일인데 모드 2
//    선택지에 없었다 (D4-06). 창은 §99의3① 「2001년 5월 23일부터 2003년 6월 30일까지」.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveSpecialHouseExclusions,
  SPECIAL_HOUSE_EXCLUSION_WINDOWS,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import {
  NEW_99_PERIOD_END,
  NEW_99_PERIOD_END_NATIONAL,
} from "@/lib/tax-engine/transfer-reductions/new-99";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const D = (s: string) => new Date(s);
const T = D("2024-06-01");
const T_2007 = D("2007-06-15");

const count = (e: object[], transferDate = T) =>
  resolveSpecialHouseExclusions(e as never, transferDate).excludedCount;
const reason = (e: object[], transferDate = T) =>
  resolveSpecialHouseExclusions(e as never, transferDate).entries[0]?.reason ?? "";

describe("D4-09 §98의8·§99의2 — 매매계약일만이 판정 기준", () => {
  it("D4-09-1: §98의8 계약 2014-11-01(창 밖) + 취득 2015-06-01(창 안) → 불적격", () => {
    const e = [{
      article: "unsold_98_8",
      houseContractDate: D("2014-11-01"),
      houseAcquisitionDate: D("2015-06-01"),
      requirementsConfirmed: true,
    }];
    expect(count(e)).toBe(0);
    expect(reason(e)).toContain("최초 매매계약일");
  });

  it("D4-09-2: §98의8 계약이 창 안이면 취득일이 밖이어도 적격", () => {
    expect(count([{
      article: "unsold_98_8",
      houseContractDate: D("2015-12-31"),
      houseAcquisitionDate: D("2017-03-01"),
      requirementsConfirmed: true,
    }])).toBe(1);
  });

  it("D4-09-3: §98의8 계약일 미입력 → 취득일이 창 안이어도 불적격 (자동 fallback 없음)", () => {
    const e = [{ article: "unsold_98_8", houseAcquisitionDate: D("2015-06-01"), requirementsConfirmed: true }];
    expect(count(e)).toBe(0);
    expect(reason(e)).toContain("입력되지 않았습니다");
  });

  it("D4-09-4: §99의2도 동일 — 계약 2014-01-05(창 밖) + 취득 2013-12-01(창 안) → 불적격", () => {
    expect(count([{
      article: "unsold_99_2",
      houseContractDate: D("2014-01-05"),
      houseAcquisitionDate: D("2013-12-01"),
      requirementsConfirmed: true,
    }])).toBe(0);
  });

  it("D4-09-5 대조군: OR 기준 조문(§98의7)은 취득일 단독으로도 통과한다", () => {
    expect(count([{
      article: "unsold_98_7",
      houseAcquisitionDate: D("2012-10-15"),
      requirementsConfirmed: true,
    }])).toBe(1);
  });
});

describe("D3-08 §99 신축주택취득기간 — 국민주택 종기 연장", () => {
  it("D3-08-1: 상수를 new-99.ts와 공유한다 (두 소비 지점의 기준 분열 방지)", () => {
    const w = SPECIAL_HOUSE_EXCLUSION_WINDOWS.new_99;
    expect(w.windows[0][1]).toBe(NEW_99_PERIOD_END);
    expect(w.nationalHousingWindows?.[0][1]).toBe(NEW_99_PERIOD_END_NATIONAL);
  });

  it("D3-08-2: 비국민주택 1999-09-01 취득 → 불적격 (~1999.6.30)", () => {
    expect(count([{
      article: "new_99",
      houseAcquisitionDate: D("1999-09-01"),
      requirementsConfirmed: true,
    }], T_2007)).toBe(0);
  });

  it("D3-08-3: 같은 입력에 국민주택 선언 → 적격 (~1999.12.31)", () => {
    expect(count([{
      article: "new_99",
      houseAcquisitionDate: D("1999-09-01"),
      isNationalHousing: true,
      requirementsConfirmed: true,
    }], T_2007)).toBe(1);
  });

  it("D3-08-4 경계: 비국민주택 1999-06-30 적격 / 1999-07-01 불적격", () => {
    const at = (d: string) =>
      count([{ article: "new_99", houseAcquisitionDate: D(d), requirementsConfirmed: true }], T_2007);
    expect(at("1999-06-30")).toBe(1);
    expect(at("1999-07-01")).toBe(0);
  });

  it("D3-08-5: 국민주택이어도 양도시한(2007.12.31) 초과면 불적격", () => {
    expect(count([{
      article: "new_99",
      houseAcquisitionDate: D("1999-09-01"),
      isNationalHousing: true,
      requirementsConfirmed: true,
    }], T)).toBe(0);
  });
});

describe("D5-01 §98의6 — 매수자 취득기간 창 없음", () => {
  it("D5-01-1: ①1호 케이스(임대계약 2011-06 · 사업주체 2년 임대 · 취득 2013-06-01) → 적격", () => {
    expect(count([{
      article: "unsold_98_6",
      houseAcquisitionDate: D("2013-06-01"),
      houseContractDate: D("2013-05-01"),
      requirementsConfirmed: true,
    }])).toBe(1);
  });

  it("D5-01-2: 일자를 아예 넣지 않아도 적격 (창 판정 자체가 없다)", () => {
    expect(count([{ article: "unsold_98_6", requirementsConfirmed: true }])).toBe(1);
  });

  it("D5-01-3: 요건 확인 토글은 여전히 필수 (과잉완화 방지)", () => {
    expect(count([{ article: "unsold_98_6", requirementsConfirmed: false }])).toBe(0);
  });

  it("D5-01-4: 창 테이블이 비어 있고 basis가 none이다", () => {
    const w = SPECIAL_HOUSE_EXCLUSION_WINDOWS.unsold_98_6;
    expect(w.windows).toEqual([]);
    expect(w.basis).toBe("none");
  });
});

describe("D4-06 §99의3② — 모드 2 선택지 신설", () => {
  it("D4-06-1: 2002-08-01 취득 + 2007-11-30 양도 → 적격", () => {
    expect(count([{
      article: "new_99_3",
      houseAcquisitionDate: D("2002-08-01"),
      requirementsConfirmed: true,
    }], D("2007-11-30"))).toBe(1);
  });

  it("D4-06-2 경계: 2001-05-23 적격 / 2001-05-22 불적격 · 2003-06-30 적격 / 2003-07-01 불적격", () => {
    const at = (d: string) =>
      count([{ article: "new_99_3", houseAcquisitionDate: D(d), requirementsConfirmed: true }], D("2007-11-30"));
    expect(at("2001-05-23")).toBe(1);
    expect(at("2001-05-22")).toBe(0);
    expect(at("2003-06-30")).toBe(1);
    expect(at("2003-07-01")).toBe(0);
  });

  it("D4-06-3: 양도시한 2007.12.31 초과 → 불적격 + 사유에 §99의3②가 표시된다", () => {
    const e = [{ article: "new_99_3", houseAcquisitionDate: D("2002-08-01"), requirementsConfirmed: true }];
    expect(count(e, T)).toBe(0);
    // 종전에는 §99② 하드코딩이라 §99의3 선택 시 틀린 조문이 표시됐다
    expect(reason(e, T)).toContain("§99의3②");
    expect(reason(e, T)).not.toContain("§99②는");
  });

  it("D4-06-4: §99 선택 시에는 사유가 §99②로 표시된다 (문구 일반화 회귀)", () => {
    const e = [{ article: "new_99", houseAcquisitionDate: D("1999-06-01"), requirementsConfirmed: true }];
    expect(reason(e, T)).toContain("§99②");
    expect(reason(e, T)).toContain("2007.12.31");
  });
});

describe("④⑬⑫ 배관 — new_99_3 · isNationalHousing이 침묵 소실되지 않는다", () => {
  afterEach(() => vi.unstubAllGlobals());

  const row = {
    article: "new_99_3" as const,
    houseAcquisitionDate: "2002-08-01",
    houseContractDate: "",
    isNationalHousing: true,
    requirementsConfirmed: true,
  };

  it("PL-1 ④⑬: fetch body에 article·isNationalHousing이 그대로 실린다", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        captured.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    const form = {
      transferDate: "2007-11-30",
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "housing" as const,
          acquisitionCause: "purchase" as const,
          acquisitionDate: "2000-01-01",
          fixedAcquisitionPrice: "400,000,000",
          actualSalePrice: "800,000,000",
        },
      ],
      houses: [],
      presaleRights: [],
      specialHouseExclusions: [row],
    } as unknown as TransferFormData;
    await callTransferTaxAPI(form);
    const she = (captured.body?.specialHouseExclusions ?? []) as Array<Record<string, unknown>>;
    expect(she[0]?.article).toBe("new_99_3");
    expect(she[0]?.isNationalHousing).toBe(true);
  });

  it("PL-2 ⑫: Zod enum이 new_99_3을 받고 isNationalHousing을 stripping하지 않는다", () => {
    const parsed = propertySchema.parse({
      propertyType: "housing",
      transferDate: "2007-11-30",
      acquisitionDate: "2000-01-01",
      transferPrice: 800_000_000,
      acquisitionPrice: 400_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: true,
      annualBasicDeductionUsed: 0,
      specialHouseExclusions: [
        {
          article: "new_99_3",
          houseAcquisitionDate: "2002-08-01",
          isNationalHousing: true,
          requirementsConfirmed: true,
        },
      ],
    }) as { specialHouseExclusions: Array<Record<string, unknown>> };
    expect(parsed.specialHouseExclusions[0].article).toBe("new_99_3");
    expect(parsed.specialHouseExclusions[0].isNationalHousing).toBe(true);
  });
});
