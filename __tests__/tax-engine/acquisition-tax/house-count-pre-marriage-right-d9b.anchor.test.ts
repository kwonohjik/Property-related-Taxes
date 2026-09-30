/**
 * anchor: 취득세 주택 수 — 지방세법 시행령 §28의4⑥6호 (계획서 D-9b)
 *
 * 현행 본문(MST 288831) ⑥6호 — verbatim:
 *   「혼인한 사람이 혼인 전 소유한 주택분양권으로 주택을 취득하는 경우 다른 배우자가 혼인 전부터
 *     소유하고 있는 주택」 (2023.3.14. 대통령령 제33325호 ⑤6호 신설 → 2024.3.26. ⑥6호)
 * 부칙(대통령령 제33325호) 제2조 — 「제28조의2부터 제28조의4까지 … 의 개정규정은 이 영 시행 이후
 *   납세의무가 성립하는 분부터 적용한다」. 이후 모든 부칙에 6호 유효기간 없음(유효기간은 ⑥7~9호뿐).
 *
 * 종전 엔진은 **혼인 전 분양권 자체**를 빼고 2026.12.31에 끊었다 — 배우자의 혼인 전 주택은 셌다.
 * 변경 전 실측(같은 입력, 폼 → 빌더 → Zod → 엔진): 비조정 3주택 8% 취득세 40,000,000 /
 * 조정 3주택 12% 60,000,000. 6호대로면 2주택 — 비조정 1% 5,000,000 / 조정 8% 40,000,000.
 */

import { describe, it, expect } from "vitest";
import { INITIAL_FORM, createOwnedHouseInfo, type FormState } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { validateAcquisitionCrossFields } from "@/lib/calc/acquisition-tax-validate";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import { calculateHouseCount } from "@/lib/tax-engine/house-count/index";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";
import type { HouseCountInput } from "@/lib/tax-engine/house-count/types";

function house(id: string, acquisitionDate: string, ownedBySpouse = false) {
  return {
    ...createOwnedHouseInfo(id),
    standardValue: "300000000",
    acquisitionDate,
    isMetropolitanRegion: true,
    ownedBySpouse,
  };
}

/** A: 2022.5.1. 분양계약 → 2023.1.10. B와 혼인 → 2024.6.1. 잔금. A 주택(2015) · B 주택(2018, 혼인 전) */
function baseForm(over: Partial<FormState> = {}): FormState {
  return {
    ...INITIAL_FORM,
    propertyType: "housing",
    acquisitionCause: "purchase",
    reportedPrice: "500000000",
    standardValue: "500000000",
    acquiredBy: "individual",
    isMetropolitanRegion: true,
    isRegulatedArea: false,
    balancePaymentDate: "2024-06-01",
    acquiredViaRight: true,
    rightAcquisitionDate: "2022-05-01",
    acquiredViaPreMarriageRight: true,
    marriageDate: "2023-01-10",
    ownedHouses: [house("A", "2015-01-01"), house("B", "2018-01-01", true)],
    ...over,
  };
}

function calcViaRoute(form: FormState) {
  const parsed = acquisitionTaxInputSchema.safeParse(buildAcquisitionTaxBody(form));
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("unreachable");
  return calcAcquisitionTax(parsed.data);
}

const reasons = (r: ReturnType<typeof calcViaRoute>) =>
  r.houseCountDetail?.excludedDetails.map((e) => `${e.assetId}:${e.reason}`) ?? [];

describe("[D9B] §28의4⑥6호 — 폼 → 빌더 → Zod → 엔진", () => {
  it("[D9B-01] 비조정 — 배우자 혼인 전 주택 제외 → 2주택 1% (종전 3주택 8% 40,000,000)", () => {
    const r = calcViaRoute(baseForm());
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(reasons(r)).toEqual(["B:spouse_pre_marriage_house"]);
    expect(r.houseCountDetail?.excludedDetails[0].legalBasis).toBe(ACQUISITION.HOUSE_COUNT_PRE_MARRIAGE_RIGHT);
    expect(r.houseCountDetail?.legalBasis).toContain(ACQUISITION.HOUSE_COUNT_PRE_MARRIAGE_RIGHT_APPLICATION);
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
    expect(r.totalTax).toBe(6_500_000);
  });

  it("[D9B-02] 조정 — 2주택 8% (종전 3주택 12% 60,000,000)", () => {
    const r = calcViaRoute(baseForm({ isRegulatedArea: true }));
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.appliedRate).toBe(0.08);
    expect(r.acquisitionTax).toBe(40_000_000);
    expect(r.totalTax).toBe(45_000_000);
  });

  it("[D9B-03] 본인(A) 주택은 혼인 전 취득이어도 빼지 않는다 — 배우자 표시 없는 행", () => {
    const r = calcViaRoute(baseForm({ ownedHouses: [house("A", "2015-01-01"), house("B", "2018-01-01", false)] }));
    expect(r.houseCountDetail?.effectiveCount).toBe(3);
    expect(reasons(r)).toEqual([]);
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("[D9B-04] 혼인 전 분양권 토글 OFF → 배우자 표시가 남아 있어도 보내지 않는다(④ 게이트) — 3주택", () => {
    const form = baseForm({ acquiredViaPreMarriageRight: false });
    const hci = buildAcquisitionTaxBody(form).houseCountInput as HouseCountInput;
    expect(hci.houses.find((h) => h.id === "B")?.ownedBySpouse).toBeUndefined();
    expect(hci.pendingAcquisition?.viaPreMarriageSubscriptionRight).toBeUndefined();
    expect(hci.pendingAcquisition?.marriageDate).toBeUndefined();
    const r = calcViaRoute(form);
    expect(r.houseCountDetail?.effectiveCount).toBe(3);
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("[D9B-05] 분양권·입주권 취득 토글 OFF → 하위 입력(혼인 전 분양권)도 보내지 않는다", () => {
    const hci = buildAcquisitionTaxBody(baseForm({ acquiredViaRight: false })).houseCountInput as HouseCountInput;
    expect(hci.pendingAcquisition?.viaPreMarriageSubscriptionRight).toBeUndefined();
    expect(hci.houses.find((h) => h.id === "B")?.ownedBySpouse).toBeUndefined();
  });
});

describe("[D9B] 트리거·기간 쌍둥이 (엔진)", () => {
  function hc(over: {
    marriageDate?: string;
    rightAcquisitionDate?: string;
    referenceDate?: string;
    spouseHouseDate?: string;
    via?: boolean;
  }) {
    return calculateHouseCount({
      houses: [
        { id: "A", standardValue: 300_000_000, type: "housing", acquisitionDate: "2015-01-01", isMetropolitan: true },
        {
          id: "B",
          standardValue: 300_000_000,
          type: "housing",
          acquisitionDate: over.spouseHouseDate ?? "2018-01-01",
          isMetropolitan: true,
          ownedBySpouse: true,
        },
      ],
      rights: [],
      offices: [],
      pendingAcquisition: {
        isMetropolitan: true,
        acquisitionValue: 500_000_000,
        acquiredViaRight: true,
        rightAcquisitionDate: over.rightAcquisitionDate ?? "2022-05-01",
        viaPreMarriageSubscriptionRight: over.via ?? true,
        marriageDate: over.marriageDate ?? "2023-01-10",
      },
      referenceDate: over.referenceDate ?? "2024-06-01",
    });
  }

  it("[D9B-10] 분양권을 혼인 후 취득 → 「혼인 전 소유」 아님 → 제외 없음 + 경고", () => {
    const r = hc({ rightAcquisitionDate: "2023-02-01" });
    expect(r.effectiveCount).toBe(3);
    expect(r.excludedDetails).toEqual([]);
    expect(r.warnings.some((w) => w.includes("혼인일(2023-01-10) 전이 아니어서"))).toBe(true);
  });

  it("[D9B-11] 권리취득일 = 혼인일 → 「전」 아님 → 제외 없음", () => {
    expect(hc({ rightAcquisitionDate: "2023-01-10" }).effectiveCount).toBe(3);
  });

  it("[D9B-12] 배우자 주택을 혼인 후 취득 → 제외 없음 (2020.8.12. 전 권리 — 소급 없음 · 취득일 기준)", () => {
    // 권리 2019 → §28의4① 후단 소급 미적용(대통령령 제30939호 부칙 제2조) → 혼인 후 취득 주택도 산정 대상
    const r = hc({ rightAcquisitionDate: "2019-05-01", marriageDate: "2020-01-01", spouseHouseDate: "2021-01-01" });
    expect(r.effectiveCount).toBe(3);
    expect(r.excludedDetails.map((e) => e.reason)).not.toContain("spouse_pre_marriage_house");
  });

  it("[D9B-13] 같은 조건에서 배우자 주택이 혼인 전 취득이면 제외 (D9B-12 긍정 짝)", () => {
    const r = hc({ rightAcquisitionDate: "2019-05-01", marriageDate: "2020-01-01", spouseHouseDate: "2019-12-31" });
    expect(r.effectiveCount).toBe(2);
    expect(r.excludedDetails.map((e) => `${e.assetId}:${e.reason}`)).toEqual(["B:spouse_pre_marriage_house"]);
  });

  it("[D9B-14] 배우자 주택 취득일 = 혼인일 → 「혼인 전부터」 아님 → 제외 없음", () => {
    const r = hc({ rightAcquisitionDate: "2019-05-01", marriageDate: "2020-01-01", spouseHouseDate: "2020-01-01" });
    expect(r.effectiveCount).toBe(3);
  });

  it("[D9B-15] 취득일 2023.3.13. → ⑥6호 적용 전이지만 §28의4① 후단(권리취득일 현재 세대)으로 제외 — 조심 2023지4299", () => {
    // 종전 기대값(3 + 경고)은 6호만 보고 ① 후단 독법을 놓쳤다 — `house-count-pre-marriage-era.anchor.test.ts` PM-01·02
    const r = hc({ rightAcquisitionDate: "2021-05-01", marriageDate: "2022-01-10", referenceDate: "2023-03-13" });
    expect(r.effectiveCount).toBe(2);
    expect(r.excludedDetails.map((e) => e.reason)).toEqual(["spouse_not_in_household_at_right_date"]);
  });

  it("[D9B-16] 취득일 2023.3.14.(시행일) → 제외", () => {
    const r = hc({ rightAcquisitionDate: "2021-05-01", marriageDate: "2022-01-10", referenceDate: "2023-03-14" });
    expect(r.effectiveCount).toBe(2);
  });

  it("[D9B-17] 종전 엔진 기한(2026.12.31) 전후 모두 제외 — 문언·부칙에 종료일 없음", () => {
    expect(hc({ referenceDate: "2026-12-31" }).effectiveCount).toBe(2);
    expect(hc({ referenceDate: "2027-01-01" }).effectiveCount).toBe(2);
  });

  it("[D9B-18] 혼인 전 분양권 취득 표시가 없으면 배우자 표시만으로는 빼지 않는다", () => {
    expect(hc({ via: false }).effectiveCount).toBe(3);
  });

  it("[D9B-19] 종전 입력 `isPreMarriageSubscriptionRight` — 분양권을 빼지 않고 경고", () => {
    const r = calculateHouseCount({
      houses: [],
      rights: [
        { id: "r1", type: "subscription_right", rightAcquisitionDate: "2023-06-01", isPreMarriageSubscriptionRight: true },
      ],
      offices: [],
      referenceDate: "2025-06-01",
    });
    expect(r.effectiveCount).toBe(1);
    expect(r.excludedDetails).toEqual([]);
    expect(r.warnings.some((w) => w.includes("그 분양권은 주택 수에 넣었습니다"))).toBe(true);
  });
});

describe("[D9B] ⑧ validate · ⑫ Zod", () => {
  it("[D9B-20] 혼인일 미입력 → 차단", () => {
    expect(validateAcquisitionCrossFields(2, baseForm({ marriageDate: "" }))).toBe(
      "혼인 전 소유한 주택분양권으로 취득 — 혼인일(혼인신고일)을 입력하세요."
    );
  });

  it("[D9B-21] 권리취득일 ≥ 혼인일 → 차단", () => {
    expect(validateAcquisitionCrossFields(2, baseForm({ rightAcquisitionDate: "2023-01-10" }))).toContain(
      "권리취득일(분양계약일)이 혼인일보다 앞서야"
    );
  });

  it("[D9B-22] 정상 입력 → 통과 · 분양권 취득 OFF면 하위 입력 무시", () => {
    expect(validateAcquisitionCrossFields(2, baseForm())).toBeNull();
    expect(validateAcquisitionCrossFields(2, baseForm({ acquiredViaRight: false, marriageDate: "" }))).toBeNull();
  });

  it("[D9B-23] Zod — 혼인 전 분양권 취득인데 혼인일 없음 → 400", () => {
    const body = buildAcquisitionTaxBody(baseForm()) as { houseCountInput: HouseCountInput };
    delete body.houseCountInput.pendingAcquisition!.marriageDate;
    const parsed = acquisitionTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
  });
});
