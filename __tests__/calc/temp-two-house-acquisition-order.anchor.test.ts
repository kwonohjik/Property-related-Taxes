/**
 * anchor — §155① 종전·신규 주택 **취득 선후**: 1년 요건이 면제돼도 신규 주택이 먼저(같은 날 포함)면 일시적 2주택이 아니다
 * (`docs/00-pm/temp-two-house-acquisition-order.plan.md` D-1~D-3 · Q-1~Q-3 (a)).
 *
 * 「역순」 시료: 양도 주택 2021-09-01 취득 · 신규 주택 2021-06-01 취득(먼저) · 양도 2024-05-01 · 경남(조정 이력 없음) · 10억.
 * 1년 요건 면제 사유는 §154① 단서 3호(부득이 — 거주 1년 이상)로 건다.
 *
 * | # | 주장 |
 * |---|---|
 * | AO-1 | API 직접 · 역순 · 3호 — 과세 · 요건 표 1년 행 unmet + 역순 note · 계산기 경고에 같은 사유 |
 * | AO-2 | API 직접 · 역순 · §155⑯ — 과세 |
 * | AO-3 | 증여세 부담부증여 화면 · 역순 · 3호 — ⑧ 통과(Q-2 (a)) · 과세 · 결과 경고에 사유 |
 * | AO-4 | 계산기 옛 저장 이력(명부 + 직접 선언) · 역순 · 3호 — ⑧ 통과 · 과세 |
 * | AO-5 | 정순 · 3호(신규가 1년 안) — 비과세 유지(면제는 그대로 작동) |
 * | AO-6 | 같은 날 · 3호 — 불성립 + 확인 필요(Q-1 (a)) |
 * | AO-7 | 역순 · 처분기한 지남 · 3호 — 판정 보류가 「기한 안에 양도하면」을 약속하지 않는다 |
 * | AO-8 | 2010 양도 · 역순 · 3호 — 218,900,000 · 요건 표가 「요건 없음」이 아니라 unmet |
 * | AO-9 | 승계조합원 완공APT · 사용승인 전 취득 주택 · API 직접 · 3호 — 375,111,000 |
 * | AO-10 | 강남 2주택 역순 · 3호 — 300,410,000(15호 의제 꺼져 중과) · 정순 대조 비과세 |
 * | AO-11 | 부담부증여 · 신규 주택이 기존주택의 연장(원조합원 기존주택·자가 재건축) · 역순 · 3호 — 과세 · 정순 비과세 |
 * | AO-12 | 화면 카드(판정 메뉴·부담부증여 공용 leaf) — 역순이면 요건 A 미충족 + 같은 사유 · 정순은 사유 없음 |
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const judged: any[] = [];
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
// 판정 결과(요건 표·판정 보류)를 함께 보려고 정본 판정을 감싸 기록한다 — 동작은 그대로다.
vi.mock("@/lib/tax-engine/one-house/judge", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await importOriginal<any>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    judgeOneHouseExemptionFromInput: (...a: any[]) => {
      const r = actual.judgeOneHouseExemptionFromInput(...a);
      judged.push(r);
      return r;
    },
  };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { runCalc, postTransfer, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  judged.length = 0;
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NR = "4682025021";
const GANGNAM = "1168010100";
const ORDER_TEXT = /먼저 취득했습니다 — 양도하는 주택이 나중에 취득한 주택이라 일시적 2주택\(.*§155①\)이 적용되지 않습니다/;
const UNAVOIDABLE = { oneHouseExemptionProviso: { reason: "unavoidable" } };

function housing(o: { acq: string; other: string; td: string; resIn: string; resOut: string; region?: string; otherPrice?: string; formOver?: object }) {
  const region = o.region ?? NR;
  return redevAptForm({
    kind: "housing",
    houses: [
      houseRow("n1", o.other, {
        region: "non_capital",
        regionCode: NR,
        officialPrice: o.otherPrice ?? "100000000",
        isApartment: false,
        acquisitionOrigin: "general",
      } as never),
    ],
    count: "2",
    price: "1000000000",
    assetOver: { acquisitionDate: o.acq, regionCode: region, residencePeriods: [{ moveInDate: o.resIn, moveOutDate: o.resOut }] },
    formOver: { transferDate: o.td, isRegulatedArea: region === GANGNAM, wasRegulatedAtAcquisition: region === GANGNAM, ...o.formOver } as never,
  });
}
const REVERSED = { acq: "2021-09-01", other: "2021-06-01", td: "2024-05-01", resIn: "2021-09-01", resOut: "2024-04-30" };

/** 계산기 본문에 일시적 2주택 두 날짜를 직접 실어 보낸다(API 직접 호출) */
async function direct(form: ReturnType<typeof housing>, tth: Record<string, unknown>, extra: object = UNAVOIDABLE) {
  const base = await runCalc(form);
  judged.length = 0;
  return postTransfer({ ...base.body, temporaryTwoHouse: { newHouseRegionCode: NR, ...tth }, ...extra });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lastJudge = () => judged[judged.length - 1] as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const oneYearItem = () => lastJudge().requirementReview.items.find((x: any) => x.id === "one-year");

describe("API 직접 · 일반 주택", () => {
  it("AO-1 역순 · 3호 — 과세 · 요건 표 unmet + 사유 · 계산기 경고", async () => {
    const r = await direct(housing(REVERSED), { previousAcquisitionDate: "2021-09-01", newAcquisitionDate: "2021-06-01" });
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(190_366_000);
    expect(oneYearItem()).toMatchObject({ status: "unmet", note: expect.stringMatching(ORDER_TEXT) });
    expect(r.result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(ORDER_TEXT)]));
  });

  it("AO-2 역순 · §155⑯ — 과세", async () => {
    const r = await direct(housing(REVERSED), { previousAcquisitionDate: "2021-09-01", newAcquisitionDate: "2021-06-01", publicInstitutionRelocation: true }, {});
    expect(r.result.isExempt).toBe(false);
    expect(oneYearItem().status).toBe("unmet");
  });

  it("AO-5 정순 · 3호(신규가 1년 안) — 비과세 유지 · 사유 없음", async () => {
    const r = await direct(housing({ ...REVERSED, acq: "2021-06-01", other: "2021-09-01", resIn: "2021-06-01" }), {
      previousAcquisitionDate: "2021-06-01",
      newAcquisitionDate: "2021-09-01",
    });
    expect(r.result.isExempt).toBe(true);
    expect(oneYearItem().status).toBe("waived");
    expect(oneYearItem().note).not.toMatch(ORDER_TEXT);
    expect(r.result.warnings ?? []).not.toEqual(expect.arrayContaining([expect.stringMatching(ORDER_TEXT)]));
  });

  it("AO-6 같은 날 · 3호 — 불성립 + 확인 필요", async () => {
    const r = await direct(housing({ ...REVERSED, other: "2021-09-01" }), { previousAcquisitionDate: "2021-09-01", newAcquisitionDate: "2021-09-01" });
    expect(r.result.isExempt).toBe(false);
    expect(oneYearItem()).toMatchObject({ status: "unmet", note: expect.stringContaining("같은 날") });
    expect(oneYearItem().note).toContain("확인 필요");
  });

  it("AO-7 역순 · 처분기한 지남 · 3호 — 판정 보류가 처분기한을 약속하지 않는다", async () => {
    const r = await direct(housing({ ...REVERSED, td: "2024-08-01", resOut: "2024-07-31" }), {
      previousAcquisitionDate: "2021-09-01",
      newAcquisitionDate: "2021-06-01",
    });
    expect(r.result.isExempt).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(lastJudge().pending.map((p: any) => p.id)).not.toContain("155-1-disposal-deadline");
  });

  it("AO-8 2010 양도 · 역순 · 3호 — 218,900,000 · 요건 표 unmet(「요건 없음」 아님)", async () => {
    const r = await direct(housing({ acq: "2009-03-01", other: "2008-12-01", td: "2010-09-01", resIn: "2009-03-01", resOut: "2010-08-31" }), {
      previousAcquisitionDate: "2009-03-01",
      newAcquisitionDate: "2008-12-01",
    });
    expect(r.result.totalTax).toBe(218_900_000);
    expect(oneYearItem()).toMatchObject({ status: "unmet", label: "종전주택을 먼저 취득한 뒤 신규주택 취득", note: expect.stringMatching(ORDER_TEXT) });
  });

  it("AO-10 강남 2주택 역순 · 3호 — 중과 과세 · 정순 대조 비과세", async () => {
    const g = { acq: "2020-03-01", td: "2022-04-01", resIn: "2020-03-01", resOut: "2021-12-31", region: GANGNAM, otherPrice: "400000000" };
    const rev = await direct(housing({ ...g, other: "2020-01-01" }), { previousAcquisitionDate: "2020-03-01", newAcquisitionDate: "2020-01-01" });
    expect(rev.result.isExempt).toBe(false);
    expect(rev.result.totalTax).toBe(300_410_000);
    expect(rev.result.appliedRate).toBe(0.6);
    const fwd = await direct(housing({ ...g, other: "2020-06-01" }), { previousAcquisitionDate: "2020-03-01", newAcquisitionDate: "2020-06-01" });
    expect(fwd.result.isExempt).toBe(true);
  });
});

describe("화면 경로", () => {
  it("AO-4 계산기 옛 저장 이력(명부 + 직접 선언) · 역순 · 3호 — ⑧ 통과 · 과세", async () => {
    const f = housing({ ...REVERSED, formOver: { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2021-06-01", provisoReason: "unavoidable" } });
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(r.body.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: "2021-09-01", newAcquisitionDate: "2021-06-01" });
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(190_366_000);
  });

  function giftItem(o: { acq: string; done: string; kind?: string; R?: string; proviso?: boolean }): EstateItem {
    return {
      id: "apt-1",
      category: "real_estate_apartment",
      name: "아파트",
      standardPrice: 800_000_000,
      leaseDeposit: 300_000_000,
      mortgageAmount: 200_000_000,
      assumedDebtForGift: 500_000_000,
      monthlyRent: 0,
      burdenedGiftTransferTax: {
        acquisitionDate: new Date(o.acq),
        standardPriceAtAcquisition: 400_000_000,
        isOneHousehold: true,
        householdHousingCount: 2,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: 30,
        isUnregistered: false,
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date(o.acq),
          newAcquisitionDate: new Date(o.done),
          ...(o.kind ? { newHouseOriginKind: o.kind, newHouseRightAcquisitionDate: o.R } : {}),
        },
        ...(o.proviso === false ? {} : { provisoReason: "unavoidable" }),
      },
    } as unknown as EstateItem;
  }
  async function gift(item: EstateItem, giftDate: string) {
    const form = { ...INITIAL_FORM, giftDate, donor: "father", donorRelation: "lineal_ascendant_adult", giftItems: [item] } as FormState;
    const issue = validateStep(1, form);
    const r = await postTransfer(buildGiftBurdenedTransferBody(item, form));
    return { issue, r };
  }

  it("AO-3 부담부증여 · 역순 · 3호 — ⑧ 통과 · 과세 · 결과 경고에 사유", async () => {
    const { issue, r } = await gift(giftItem({ acq: "2021-09-01", done: "2021-06-01" }), "2024-05-01");
    expect(issue).toBeNull();
    expect(r.result.isExempt).toBe(false);
    expect(r.result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(ORDER_TEXT)]));
  });

  it("AO-11 부담부증여 · 기존주택의 연장 · 역순 · 3호 — 과세 / 정순 — 비과세", async () => {
    for (const kind of ["original_member_house", "self_rebuild"]) {
      const { issue, r } = await gift(giftItem({ acq: "2021-06-01", done: "2023-06-01", kind, R: "2021-01-01" }), "2023-12-01");
      expect(issue).toBeNull();
      expect(r.result.isExempt).toBe(false);
      expect(r.result.totalTax).toBe(78_386_000);
    }
    const fwd = await gift(giftItem({ acq: "2020-06-01", done: "2023-06-01", kind: "original_member_house", R: "2021-09-01" }), "2024-06-01");
    expect(fwd.r.result.isExempt).toBe(true);
  });

  it("AO-9 승계조합원 완공APT · 사용승인 전 취득 주택 · API 직접 · 3호 — 과세", async () => {
    const f = redevAptForm({
      houses: [houseRow("n1", "2020-09-01", { region: "non_capital", regionCode: NR, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" } as never)],
      count: "2",
      price: "1000000000",
      assetOver: {
        acquisitionDate: "2019-06-01",
        redevIsSuccessorMember: "yes",
        redevApprovalDate: "2019-03-15",
        redevCompletionDate: "2021-02-15",
        redevActualAcquisitionPrice: "100000000",
        fixedAcquisitionPrice: "100000000",
        redevSettlementAmount: "0",
        regionCode: NR,
        residenceInputMode: "interval",
        residencePeriods: [{ moveInDate: "2021-03-01", moveOutDate: "2023-03-31" }],
      },
      formOver: { transferDate: "2023-04-01" } as never,
    });
    const base = await runCalc(f);
    const r = await postTransfer({
      ...base.body,
      temporaryTwoHouse: { previousAcquisitionDate: "2019-06-01", newAcquisitionDate: "2020-09-01", newHouseRegionCode: NR },
      ...UNAVOIDABLE,
    });
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(375_111_000);
  });
});

describe("AO-12 화면 카드 leaf", () => {
  const card = (prev: string, next: string) =>
    judgeTempTwoHouseFromForm({
      previousAcquisitionDate: prev,
      newHouseAcquisitionDate: next,
      transferDate: "2024-05-01",
      provisoReason: "unavoidable",
      provisoDepartureDate: "",
      provisoExpropriationDate: "",
      provisoBusinessApprovalDate: "",
      residencePeriodMonths: "30",
      regionCode: NR,
      newHouseRegionCode: NR,
    });

  it("역순 — 요건 A 미충족 + 같은 사유 · 불성립", () => {
    const v = card("2021-09-01", "2021-06-01");
    expect(v).toMatchObject({ status: "ineligible", oneYearMet: false, orderNote: expect.stringMatching(ORDER_TEXT) });
  });
  it("정순 — 사유 없음 · 면제로 성립", () => {
    const v = card("2021-06-01", "2021-09-01");
    expect(v).toMatchObject({ status: "eligible", oneYearMet: true });
    expect(v).not.toHaveProperty("orderNote");
  });
});
