/**
 * anchor — §155① 일시적 2주택 리뷰(2026-11-12) Low 묶음 B: 판정 보류(`pending`)·고지 게이트
 *
 * - J-4 기한 안내(`155-1-disposal-deadline`)와 검토표 기한 행은 「기한 말일에 양도했다면 §154① 보유·거주를 채우는가」를 본다
 *   (⑦3호·⑧ 축의 S07-4와 같은 확인). 못 채우면 기한을 약속하지 않고 검토표가 사유를 말한다.
 * - J-5 잔금 전 멸실 특약(2022.12.20. 이후 계약) — 주택으로 봐도 과세여도 기한형 안내는 나대지 양도에 성립하지 않으므로 비운다.
 * - J-6 §155⑱ 「그 방법으로 양도」 미확인 고지(`155-18-disposal-method-unverified`)는 결론을 가를 때만 낸다(#32) —
 *   1년 요건이 이미 불충족이면 내지 않는다 · ⑦ 농어촌주택 중첩 3주택(D3)도 §155① 분기라 같은 게이트로 본다.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { applyDemolishedBeforeBalanceVerdict } from "@/lib/tax-engine/one-house/demolished-before-balance";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { RETURN_TO_FARM_OK } from "../../_helpers/rural-return-to-farm-facts";

const D = (s: string) => new Date(s);
const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;

function judge(over: Partial<TransferTaxInput>) {
  const input = baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    isRegulatedArea: false,
    ...over,
  }) as OneHouseJudgeInput;
  return { input, j: checkExemption(input, rules, D("2021-01-01")) };
}
const pendingIds = (r: ReturnType<typeof judge>) => r.j.pending.map((p) => p.id);
const deadlineNote = (r: ReturnType<typeof judge>) =>
  r.j.requirementReview?.items.find((x) => x.id === "disposal-deadline")?.note ?? "";
const undeterminedIds = (r: ReturnType<typeof judge>) => r.j.undetermined.map((u) => u.id);

describe("J-4 기한 말일 기준 §154① 보유", () => {
  it("(a) 2012-06-29 전 양도(보유 3년) — 기한 2011-07-01에는 보유 2년 1개월이라 기한을 약속하지 않고 검토표가 사유를 말한다", () => {
    const r = judge({
      acquisitionDate: D("2009-06-01"),
      transferDate: D("2012-06-15"),
      temporaryTwoHouse: { previousAcquisitionDate: D("2009-06-01"), newAcquisitionDate: D("2009-07-01") },
    });
    expect(pendingIds(r)).not.toContain("155-1-disposal-deadline");
    expect(deadlineNote(r)).toContain("처분기한(2011-07-01)에 양도했더라도");
    expect(deadlineNote(r)).toContain("보유 3년");
    expect(deadlineNote(r)).not.toContain("까지 양도하면 이 요건을 충족합니다");
  });

  it("(b) ⑯ 1년 면제 + 조정→조정 1년 기한 — 기한 2021-01-04에는 종전주택 보유 1년이라 약속하지 않는다", () => {
    const r = judge({
      acquisitionDate: D("2020-01-02"),
      transferDate: D("2022-03-02"),
      regionCode: "1168010100",
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2020-01-02"),
        newAcquisitionDate: D("2020-01-03"),
        newHouseRegionCode: "1165010100",
        publicInstitutionRelocation: true,
        wholeHouseholdMoveInDate: D("2020-02-01"),
      },
    });
    expect(pendingIds(r)).not.toContain("155-1-disposal-deadline");
    expect(deadlineNote(r)).toContain("처분기한(2021-01-04)에 양도했더라도");
  });

  it("짝: 기한 말일에 보유 2년을 채우면 종전대로 기한을 안내한다", () => {
    const r = judge({
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2021-06-01"),
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2015-01-01"),
        newAcquisitionDate: D("2018-03-01"),
        newHouseRegulatedAtAcquisition: false,
      },
    });
    expect(pendingIds(r)).toContain("155-1-disposal-deadline");
    expect(deadlineNote(r)).toContain("2021-03-02까지 양도하면 이 요건을 충족합니다.");
  });
});

describe("J-5 잔금 전 멸실 — 주택으로 봐도 과세인 세대의 기한 안내", () => {
  const base = judge({
    acquisitionDate: D("2019-01-01"),
    transferDate: D("2025-06-01"),
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2019-01-01"),
      newAcquisitionDate: D("2022-03-01"),
      newHouseRegulatedAtAcquisition: false,
    },
  });
  it("전제: 주택으로 보면 과세 + 처분기한 안내가 있다", () => {
    expect(base.j.isExempt).toBe(false);
    expect(pendingIds(base)).toContain("155-1-disposal-deadline");
  });
  it("2022.12.20. 이후 계약 + 잔금 전 멸실 → 기한 안내를 비우고 사유를 밝힌다 · 예외 결정례 고지는 내지 않는다", () => {
    const after = applyDemolishedBeforeBalanceVerdict(
      base.j,
      { ...(base.input as TransferTaxInput), demolishedBeforeBalance: { contractDate: D("2025-01-10") } },
      false,
    );
    expect(after.pending).toEqual([]);
    expect(after.unmetExceptions.map((u) => u.id)).toContain("154-1-demolished-before-balance");
    expect(after.undetermined.map((u) => u.id)).not.toContain("154-1-demolished-before-balance-unverified");
    expect(after.isExempt).toBe(false);
  });
  it("짝: 2022.12.19. 계약이면 변화 없음", () => {
    const after = applyDemolishedBeforeBalanceVerdict(
      base.j,
      { ...(base.input as TransferTaxInput), demolishedBeforeBalance: { contractDate: D("2022-12-19") } },
      false,
    );
    expect(after).toBe(base.j);
  });
});

describe("J-6 §155⑱ 「그 방법으로 양도」 미확인 고지 — 결론을 가를 때만", () => {
  const METHOD = "155-18-disposal-method-unverified";
  // S15-14 시료 — 신규 2018-03-01(비조정) · 3년 말일 2021-03-02 · 양도 2021-06-01(2022-02-15 전) · kamco · 방법 미확인
  const tt = (prev: string, extra: Record<string, unknown> = {}) => ({
    previousAcquisitionDate: D(prev),
    newAcquisitionDate: D("2018-03-01"),
    newHouseRegulatedAtAcquisition: false,
    disposalDelayReason: "kamco" as const,
    ...extra,
  });
  it("짝(기존): 방법 확인이 결론을 가르면 고지", () => {
    const r = judge({ acquisitionDate: D("2015-01-01"), transferDate: D("2021-06-01"), temporaryTwoHouse: tt("2015-01-01") });
    expect(undeterminedIds(r)).toContain(METHOD);
  });
  it("1년 요건이 이미 불충족(종전 2017-10-01 → 신규 2018-03-01)이면 방법을 확인해도 과세라 고지하지 않는다", () => {
    const r = judge({ acquisitionDate: D("2017-10-01"), transferDate: D("2021-06-01"), temporaryTwoHouse: tt("2017-10-01") });
    expect(r.j.isExempt).toBe(false);
    expect(undeterminedIds(r)).not.toContain(METHOD);
  });

  const rural = {
    kind: "return_to_farm",
    ...RETURN_TO_FARM_OK,
    isOutsideCapitalEupMyeon: true,
    acquisitionDate: D("2017-01-10"),
    isHighPriceAtAcquisition: false,
    landAreaSqm: 300,
    wholeHouseholdMoved: true,
  } as TransferTaxInput["ruralHouse"];
  it("⑦ 농어촌주택 중첩 3주택(D3) — 방법 확인이 결론을 가르므로 고지한다(종전 `=== 2` 게이트는 놓쳤다)", () => {
    const r = judge({
      householdHousingCount: 3,
      ruralHouse: rural,
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2021-06-01"),
      temporaryTwoHouse: tt("2015-01-01"),
    });
    expect(r.j.isExempt).toBe(false);
    expect(undeterminedIds(r)).toContain(METHOD);
    const confirmed = judge({
      householdHousingCount: 3,
      ruralHouse: rural,
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2021-06-01"),
      temporaryTwoHouse: tt("2015-01-01", { disposalDelayDisposedByThatMethod: true }),
    });
    expect(confirmed.j.isExempt).toBe(true);
  });
});
