/**
 * 부수토지 카드의 «주택부수토지로서» 보유 시작일 leaf — 계획서 `docs/02-design/features/bundled-appurtenant-card-later-land-holding.plan.md` (AH-1 ~ AH-4).
 * 시작일 = `max(카드 취득일, 짝 주택 취득일, 합가일)`.
 */
import { describe, expect, it } from "vitest";
import {
  appurtenantCardHoldingStart,
  appurtenantCardLaterLandNotice,
} from "@/lib/tax-engine/appurtenant-card-holding-start";
import { appurtenantCardSurchargeRateInput } from "@/lib/tax-engine/appurtenant-card-surcharge";
import { appurtenantCardHouseHoldingMonths } from "@/lib/tax-engine/land-only-owner-household";
import type { SurchargeApplication } from "@/lib/tax-engine/transfer-tax-surcharge-predicate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

// API 경유 날짜와 같은 UTC 자정 — 고지 문구가 `toISOString()`으로 날짜를 쓴다
const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const iso = (x: Date) => x.toISOString().slice(0, 10);
type Verdict = NonNullable<TransferTaxInput["appurtenantHouseVerdict"]>;
const verdict = (over: Partial<Verdict> = {}) =>
  ({ isExempt: false, isPartialExempt: false, houseAcquisitionDate: d(2014, 1, 1), carryoverOneHouseExcluded: false, ...over }) as Verdict;
const TRANSFER = d(2026, 2, 16);
const HOUSE_MONTHS = 12 * 12 + 1; // 2014-01-01 ~ 2026-02-16 (초일산입 12년 1개월)

describe("AH-1 appurtenantCardHoldingStart — max(카드, 짝 주택, 합가일)", () => {
  it("카드가 가장 늦으면 카드 취득일 · 합가일이 가장 늦으면 합가일 · 카드가 이르거나 같으면 짝 주택 취득일", () => {
    expect(iso(appurtenantCardHoldingStart(verdict(), d(2025, 6, 1)))).toBe("2025-06-01");
    expect(iso(appurtenantCardHoldingStart(verdict({ houseMergeDate: d(2020, 3, 1) }), d(2018, 6, 1)))).toBe("2020-03-01");
    expect(iso(appurtenantCardHoldingStart(verdict({ houseMergeDate: d(2020, 3, 1) }), d(2022, 6, 1)))).toBe("2022-06-01");
    expect(iso(appurtenantCardHoldingStart(verdict(), d(2010, 1, 1)))).toBe("2014-01-01");
    expect(iso(appurtenantCardHoldingStart(verdict(), d(2014, 1, 1)))).toBe("2014-01-01");
    expect(iso(appurtenantCardHoldingStart(verdict(), undefined))).toBe("2014-01-01");
  });
});

describe("AH-2 appurtenantCardHouseHoldingMonths — 카드 취득일 인자", () => {
  it("카드가 짝 주택보다 이르거나 같거나 미지정이면 종전(defaultMonths) 그대로", () => {
    for (const card of [undefined, d(2014, 1, 1), d(2010, 5, 5)]) {
      expect(appurtenantCardHouseHoldingMonths(verdict(), TRANSFER, HOUSE_MONTHS, card)).toBe(HOUSE_MONTHS);
    }
    expect(appurtenantCardHouseHoldingMonths(undefined, TRANSFER, HOUSE_MONTHS, d(2025, 6, 1))).toBe(HOUSE_MONTHS);
  });
  it("카드가 늦으면 카드 취득일부터의 개월 — 2025-06-01 ~ 2026-02-16 = 8개월 · 2022-06-01 = 3년 8개월 · 2018-06-01 = 7년 8개월", () => {
    expect(appurtenantCardHouseHoldingMonths(verdict(), TRANSFER, HOUSE_MONTHS, d(2025, 6, 1))).toBe(8);
    expect(appurtenantCardHouseHoldingMonths(verdict(), TRANSFER, HOUSE_MONTHS, d(2022, 6, 1))).toBe(44);
    expect(appurtenantCardHouseHoldingMonths(verdict(), TRANSFER, HOUSE_MONTHS, d(2018, 6, 1))).toBe(92);
  });
  it("합가일이 카드보다 늦으면 합가일부터(#2672 종전 값 그대로)", () => {
    // 2024-03-01 ~ 2026-02-16 = 1년 11개월 = 23개월
    expect(appurtenantCardHouseHoldingMonths(verdict({ houseMergeDate: d(2024, 3, 1) }), TRANSFER, HOUSE_MONTHS, d(2018, 6, 1))).toBe(23);
    expect(appurtenantCardHouseHoldingMonths(verdict({ houseMergeDate: d(2024, 3, 1) }), TRANSFER, HOUSE_MONTHS)).toBe(23);
  });
});

describe("AH-3 appurtenantCardSurchargeRateInput — §104⑦ 후단 비교 기산도 같은 시작일", () => {
  const app = { isSurchargeCase: true, isSuspended: false, isSurchargeApplied: true, isRateSurchargeApplied: true, effectiveSurchargeType: "multi_house_2", effectiveHouseCount: 2, surchargeTypeKey: "multi_house_2" } as SurchargeApplication;
  const card = (acq: Date, over: Partial<Verdict> = {}) =>
    ({ propertyType: "land", oneHouseUnitRole: "appurtenant_land", acquisitionDate: acq, transferDate: d(2026, 6, 15), appurtenantHouseVerdict: verdict({ houseSurcharge: app, ...over }) }) as unknown as TransferTaxInput;
  it("늦은 카드는 카드 취득일 · 이른 카드는 짝 주택 취득일 · 합가일이 늦으면 합가일", () => {
    expect(iso(appurtenantCardSurchargeRateInput(card(d(2025, 6, 1))).acquisitionDate)).toBe("2025-06-01");
    expect(iso(appurtenantCardSurchargeRateInput(card(d(2010, 1, 1))).acquisitionDate)).toBe("2014-01-01");
    expect(iso(appurtenantCardSurchargeRateInput(card(d(2018, 6, 1), { houseMergeDate: d(2024, 3, 1) })).acquisitionDate)).toBe("2024-03-01");
  });
  it("중과 대상이 아니면 입력 그대로", () => {
    const none = card(d(2025, 6, 1), { houseSurcharge: { ...app, isRateSurchargeApplied: false } });
    expect(appurtenantCardSurchargeRateInput(none)).toBe(none);
  });
});

describe("AH-4 appurtenantCardLaterLandNotice — 늦게 취득한 카드에만", () => {
  const card = (acq: Date, over: Partial<Verdict> = {}, role: string | null = "appurtenant_land") =>
    ({ propertyType: "land", oneHouseUnitRole: role, acquisitionDate: acq, transferDate: TRANSFER, appurtenantHouseVerdict: verdict(over) }) as unknown as TransferTaxInput;
  it("늦은 카드 → 날짜 둘과 「확인이 필요합니다」", () => {
    const n = appurtenantCardLaterLandNotice(card(d(2025, 6, 1)));
    expect(n).toContain("2025-06-01");
    expect(n).toContain("2014-01-01");
    expect(n).toContain("확인이 필요합니다");
  });
  it("합가일이 카드보다 늦으면 합가일 고지(#2672)의 몫이라 이 고지는 없다", () => {
    expect(appurtenantCardLaterLandNotice(card(d(2018, 6, 1), { houseMergeDate: d(2024, 3, 1) }))).toBeUndefined();
  });
  it("이르거나 같은 카드 · 다른 세대 · 카드 역할이 아닌 자산 · verdict 없음 → 없음", () => {
    expect(appurtenantCardLaterLandNotice(card(d(2014, 1, 1)))).toBeUndefined();
    expect(appurtenantCardLaterLandNotice(card(d(2010, 1, 1)))).toBeUndefined();
    expect(appurtenantCardLaterLandNotice(card(d(2025, 6, 1), { houseLandOnlyOtherHousehold: true }))).toBeUndefined();
    expect(appurtenantCardLaterLandNotice(card(d(2025, 6, 1), {}, null))).toBeUndefined();
    expect(appurtenantCardLaterLandNotice({ oneHouseUnitRole: "appurtenant_land", acquisitionDate: d(2025, 6, 1) } as unknown as TransferTaxInput)).toBeUndefined();
  });
});
