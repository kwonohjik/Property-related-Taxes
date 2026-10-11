/**
 * 1h-G1-12 anchor(결정 #27 C) — §155④⑤ 합가 전 구성 「모름=허용」 예외는 증여세 마법사 화면의 **표식**
 * (`burdenedGiftInfo.houseRosterInputUnavailable`)이 있을 때만 선다. 양도 형태(`transferType`)로 화면을 짐작하지 않는다.
 *
 * 근거: Q-10(2026-10-05) — 세대 보유 주택 명부 입력 칸이 없는 화면에서 「모름」을 불리하게 쓰면 고칠 수 없는 항목으로
 * 불이익이 된다. 양도세 계산기 부담부증여 모드에는 명부 입력 칸이 있으므로(`house-count-inputs-scope`) 예외 밖이다.
 * 「소득세법 시행령」 §155⑤는 합가 전 각자 1주택 보유를 요건으로 둔다.
 *
 * 시료: 취득 2015-01-01 · 증여(양도) 2023-06-01 · 혼인 2020-01-01 · 먼저 양도 · 세대 2주택 · 명부 0행.
 * 금액은 mock 세율표 실측 — 방향만 유효하다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { giftBody, giftItem, giftForm, run, bodyOf, type Obj } from "./_gift-burdened-pr7-harness";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

const MERGE = {
  acquisitionDate: new Date("2015-01-01"),
  householdHousingCount: 2,
  marriageDate: "2020-01-01",
  isFirstTransferredInMerge: true,
};
const GIFT_DATE = "2023-06-01";
const NOTICE = "§155④⑤ 합가 특례 — 확인 필요";

/** 표식을 뺀 같은 body — 표식 없는 API 직접 호출. */
function withoutMarker(body: Obj): Obj {
  const { houseRosterInputUnavailable: _drop, ...info } = body.burdenedGiftInfo as Obj;
  void _drop;
  return { ...body, burdenedGiftInfo: info };
}

describe("G1-12 ④ — 증여세 화면만 표식을 싣는다", () => {
  it("12-A ★ 증여 화면 body의 burdenedGiftInfo.houseRosterInputUnavailable === true", () => {
    expect((giftBody(GIFT_DATE, MERGE).burdenedGiftInfo as Obj).houseRosterInputUnavailable).toBe(true);
  });
});

describe("G1-12 ⑭ route — 표식이 있을 때만 합가 구성 「모름」을 허용한다", () => {
  it("12-B ★ 표식 있음(증여 화면): 혼인합가 비과세 유지(명부 입력 칸이 없는 화면)", async () => {
    const r = await run(giftBody(GIFT_DATE, MERGE));
    expect(r.isExempt).toBe(true);
    expect(String(r.exemptReason)).toContain("혼인 합가");
  });

  it("12-C ★ 표식 없음(API 직접 호출): 같은 사실이 불성립 + 확인 필요 고지(PR-2 「모름=불리」)", async () => {
    const r = await run(withoutMarker(giftBody(GIFT_DATE, MERGE)));
    expect(r.isExempt).toBe(false);
    expect((r.warnings as string[]).some((w) => w.startsWith(NOTICE))).toBe(true);
  });

  it("12-E body 최상위에 noMergeRosterInputPath:true를 넣어도 효과 없다(⑫ strip — 공개 입력이 아니다)", async () => {
    const r = await run({ ...withoutMarker(giftBody(GIFT_DATE, MERGE)), noMergeRosterInputPath: true });
    expect(r.isExempt).toBe(false);
  });
});

describe("G1-12 ⑭ route — 중과 배제(13·15호 ① 요소)도 같은 표식 기준이다", () => {
  /** 조정대상지역 · 양도일 2026-10-01(유예 종료 뒤) · 세대 2주택 · 혼인 합가 → 중과 배제가 서면 +20%p가 붙지 않는다. */
  const SUR = { ...MERGE, isRegulatedArea: true };
  const GD = "2026-10-01";

  it("12-F 표식 있음: 합가 의제로 1세대1주택 — 중과 없음", async () => {
    const r = await run(giftBody(GD, SUR));
    expect(r.surchargeType).toBeUndefined();
  });

  it("12-G 표식 없음: 합가 전 구성을 알 수 없어 의제 불성립 — 비과세와 같은 결론(중과 배제도 안 선다)", async () => {
    const withMark = await run(giftBody(GD, SUR));
    const noMark = await run(withoutMarker(giftBody(GD, SUR)));
    // 비과세 판정과 중과 배제 판정이 한 술어를 공유한다 — 한쪽만 표식을 보면 엇갈린다.
    expect(withMark.isExempt).toBe(true);
    expect(noMark.isExempt).toBe(false);
    expect(noMark.surchargeType).toBe("multi_house_2");
  });
});

// ─── 양도세 계산기 부담부증여 모드 ─────────────────────────────────────────────────

const calcAsset = (): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "150000000",
    bgMortgageDebtAmount: "0",
    standardPriceAtTransfer: "300000000",
    standardPriceAtAcq: "150000000",
  }) as AssetForm;

/** 계산기 fetch를 가로챈 body — 폼이 비워 둔 필수 기본 플래그를 채워 route에 보낸다(axis-b 배관 anchor와 같은 방식). */
const calcBody = async (): Promise<Obj> => ({
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  annualBasicDeductionUsed: 0,
  ...(await bodyOf(() => callTransferTaxAPI(calcForm()))),
});

const calcForm = (): TransferFormData =>
  ({
    transferDate: GIFT_DATE,
    filingDate: "2023-08-31",
    assets: [calcAsset()],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "150000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: true,
    marriageDate: "2020-01-01",
    isFirstTransferredInMerge: true,
    residencePeriodMonths: "0",
  }) as unknown as TransferFormData;

describe("G1-12 양도세 계산기 부담부증여 모드(명부 입력 칸이 있다) — 예외 밖", () => {
  it("12-H ★ 계산기 ④는 표식을 싣지 않는다", async () => {
    const body = await calcBody();
    expect((body.burdenedGiftInfo as Obj | undefined)?.houseRosterInputUnavailable).toBeUndefined();
    expect(body.transferType).toBe("burdened_gift");
  });

  it("12-I ★ 명부 0행 + 혼인합가: 비과세 0원 → 과세 + 「§155④⑤ 합가 특례 — 확인 필요」(일반 양도와 같은 결론)", async () => {
    const r = await run(await calcBody());
    expect(r.isExempt).toBe(false);
    expect((r.warnings as string[]).some((w) => w.startsWith(NOTICE))).toBe(true);
  });

  it("12-D ★ 뮤테이션 짝 — 계산기에서 명부(상대 쪽 1행)를 채우면 비과세 성립(명부가 있으면 구성을 판정한다)", async () => {
    const withRoster = {
      ...calcForm(),
      houses: [
        {
          id: "h1", region: "capital", acquisitionDate: "2012-01-01", officialPrice: "300000000",
          isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false,
          mergeOrigin: "counterpart_side",
        },
      ],
    } as unknown as TransferFormData;
    const body = {
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      annualBasicDeductionUsed: 0,
      ...(await bodyOf(() => callTransferTaxAPI(withRoster))),
    };
    expect((await run(body)).isExempt).toBe(true);
  });

  it("12-J 같은 증여 화면 body의 표식만 켜면(=증여세 화면) 비과세 — 표식이 유일한 차이", async () => {
    const base = await calcBody();
    const withMark = { ...base, burdenedGiftInfo: { ...(base.burdenedGiftInfo as Obj), houseRosterInputUnavailable: true } };
    expect((await run(withMark)).isExempt).toBe(true);
  });
});

// 타입·사용 확인(미사용 import 방지)
void giftItem; void giftForm; void buildGiftBurdenedTransferBody; void collectStepIssues;
