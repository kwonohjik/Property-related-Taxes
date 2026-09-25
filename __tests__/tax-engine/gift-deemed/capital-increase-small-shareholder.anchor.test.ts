import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 「상증법」§39② — "**제1항제1호를 적용할 때** 이익을 증여한 자가 대통령령으로 정하는 소액주주
 * (이하 이 항 및 제39조의3에서 "소액주주"라 한다)로서 **2명 이상인 경우에는 이익을 증여한
 * 소액주주가 1명인 것으로 보고 이익을 계산한다.**"
 * 「상증령」§29⑤ — "…발행주식총수등의 **100분의 1미만**을 소유하는 경우로서 주식등의
 * **액면가액의 합계액이 3억원 미만**인 주주등"
 *
 * 총액은 바뀌지 않는다 — §29② 각 호 산식 어디에도 「증여자 수」가 변수로 들어가지 않고,
 * 증여자측 수량은 전부 **주식수의 합**(실권주 총수·특수관계인의 실권주수)이라 N명을 1명으로
 * 보아도 그 합이 같다. 바뀌는 것은 **증여자 단위**(= §47② 동일인 합산 단위 → §26 누진구간)다.
 *
 * 픽스처: 증자전 ㉮ 100,000원 / 발행주식총수 100,000주 / 신주 인수가 50,000원 / 신주 50,000주.
 *   대주주 A 96,400주(96.4% · 액면 482,000,000) — 균등 48,200주 + 재배정 1,800주 인수
 *   소액주주 s1~s4 각 900주(0.9% · 액면 4,500,000) — 균등 450주 전량 포기
 *   ⇒ ㉯ 83,333 · A delta +59,951,200 · s_i delta −15,000,300 (각 25%)
 *   ⇒ 재배정분(§39①1호 **가목**)이라 특수관계·기준금액 게이트를 받지 않는다.
 */

const FACE = 5_000; // 1주당 액면가액 가정

function small(id: string): CapShareholder {
  return { id, name: id, preShares: 900, entitledShares: 450, subscribedShares: 0, faceValueSum: 900 * FACE };
}

/** 액면가액 합계 미입력(현행 데이터) — §29⑤ 판정 불가 */
function smallNoFace(id: string): CapShareholder {
  return { id, name: id, preShares: 900, entitledShares: 450, subscribedShares: 0 };
}

const major: CapShareholder = {
  id: "A",
  name: "A",
  preShares: 96_400,
  entitledShares: 48_200,
  subscribedShares: 50_000,
  reallocatedShares: 1_800,
  faceValueSum: 96_400 * FACE,
};

const base = { direction: "low", preIssuePrice: 100_000, newSharePrice: 50_000 } as const;

describe("§39② 소액주주 1인 의제 — cap-table 저가 (§39①1호)", () => {
  it("[SS39-1] 액면가액 합계 미입력 → 판정 불가 → 의제 없음(증여자 4행 유지)", () => {
    const r = calcCapitalIncreaseAllocation({
      ...base,
      shareholders: [{ ...major, faceValueSum: undefined }, smallNoFace("s1"), smallNoFace("s2"), smallNoFace("s3"), smallNoFace("s4")],
    });
    const a = r.perBeneficiary.find((b) => b.beneficiaryId === "A")!;
    expect(a.byDonor).toHaveLength(4);
    expect(a.total).toBe(59_951_200);
  });

  it("[SS39-2] 소액주주 4명 → 1명으로 보고 계산 (증여자 1행 · 총액 불변)", () => {
    const r = calcCapitalIncreaseAllocation({
      ...base,
      shareholders: [major, small("s1"), small("s2"), small("s3"), small("s4")],
    });
    const a = r.perBeneficiary.find((b) => b.beneficiaryId === "A")!;
    expect(a.byDonor).toHaveLength(1);
    expect(a.byDonor[0].value).toBe(59_951_200);
    expect(a.byDonor[0].imputedSmallShareholderIds).toEqual(["s1", "s2", "s3", "s4"]);
    // 🔑 긍정 짝 — 의제는 분할 단위만 바꾼다. 총액은 [SS39-1]과 **같은 값**이다.
    expect(a.total).toBe(59_951_200);
  });

  it("[SS39-3] 검증내역(zero-sum 축)은 의제에 접촉하지 않는다", () => {
    const withImp = calcCapitalIncreaseAllocation({
      ...base,
      shareholders: [major, small("s1"), small("s2"), small("s3"), small("s4")],
    });
    const withoutImp = calcCapitalIncreaseAllocation({
      ...base,
      shareholders: [{ ...major, faceValueSum: undefined }, smallNoFace("s1"), smallNoFace("s2"), smallNoFace("s3"), smallNoFace("s4")],
    });
    expect(withImp.byShareholder).toEqual(withoutImp.byShareholder);
    expect(withImp.reconciliation).toEqual(withoutImp.reconciliation);
    expect(withImp.perShareAfter).toBe(withoutImp.perShareAfter);
  });

  it("[SS39-4] 소액주주가 1명뿐이면 의제하지 않는다 (「2명 이상」)", () => {
    // s1만 소액주주, s2~s4는 액면 3억 이상 → 소액주주 아님
    const r = calcCapitalIncreaseAllocation({
      ...base,
      shareholders: [
        major,
        small("s1"),
        { ...small("s2"), faceValueSum: 300_000_000 },
        { ...small("s3"), faceValueSum: 300_000_000 },
        { ...small("s4"), faceValueSum: 300_000_000 },
      ],
    });
    const a = r.perBeneficiary.find((b) => b.beneficiaryId === "A")!;
    expect(a.byDonor).toHaveLength(4);
    // 행 수만 보면 「1명을 1행으로 의제」를 놓친다 — 의제 표식 자체가 없어야 한다.
    expect(a.byDonor.every((d) => d.imputedSmallShareholderIds === undefined)).toBe(true);
    expect(a.total).toBe(59_951_200);
  });

  it("[SS39-5] 액면 정확히 3억은 「미만」이 아니다 — 소액주주 2명만 병합, 나머지 2행 유지", () => {
    const r = calcCapitalIncreaseAllocation({
      ...base,
      shareholders: [
        major,
        small("s1"),
        small("s2"),
        { ...small("s3"), faceValueSum: 300_000_000 },
        { ...small("s4"), faceValueSum: 300_000_000 },
      ],
    });
    const a = r.perBeneficiary.find((b) => b.beneficiaryId === "A")!;
    expect(a.byDonor).toHaveLength(3);
    expect(a.byDonor.filter((d) => d.imputedSmallShareholderIds)).toHaveLength(1);
    expect(a.byDonor.find((d) => d.imputedSmallShareholderIds)!.imputedSmallShareholderIds).toEqual(["s1", "s2"]);
    expect(a.total).toBe(59_951_200);
  });

  it("[SS39-6] 정확히 100분의 1 소유는 「미만」이 아니다 — 소액주주에서 빠진다", () => {
    // preShares 1,000 = 정확히 1%. 나머지 합이 100,000이 되도록 A를 96,300으로 맞춘다.
    const r = calcCapitalIncreaseAllocation({
      ...base,
      shareholders: [
        { ...major, preShares: 96_300, entitledShares: 48_150, subscribedShares: 50_000, reallocatedShares: 1_850 },
        { ...small("s1"), preShares: 1_000, entitledShares: 500, faceValueSum: 1_000 * FACE },
        small("s2"),
        small("s3"),
        small("s4"),
      ],
    });
    const a = r.perBeneficiary.find((b) => b.beneficiaryId === "A")!;
    // s1은 1% 이상이라 소액주주가 아니다 ⇒ s2·s3·s4 3명만 1행으로 병합 + s1 1행 = 2행
    expect(a.byDonor).toHaveLength(2);
    expect(a.byDonor.find((d) => d.imputedSmallShareholderIds)!.imputedSmallShareholderIds).toEqual(["s2", "s3", "s4"]);
  });

  it("[SS39-7] splits(평면 배열)도 의제 결과를 그대로 담는다", () => {
    const r = calcCapitalIncreaseAllocation({
      ...base,
      shareholders: [major, small("s1"), small("s2"), small("s3"), small("s4")],
    });
    expect(r.splits).toHaveLength(1);
    expect(r.splits[0].value).toBe(59_951_200);
  });
});

describe("§39② 적용 범위 — 「제1항제1호를 적용할 때」", () => {
  // 고가발행(§39①**2호**)에는 §39②이 미치지 않는다. 법문이 제1항제1호로 한정한다.
  // 픽스처: ㉮ 100,000 / 인수가 150,000 / 포기자 B 96,400주(수증자) · 인수자 s1~s4 각 12,500주(증여자)
  //   ⇒ ㉯ 116,666 · B delta +1,606,602,400 · s_i delta −401,675,600 (각 25%)
  const highDonor = (id: string): CapShareholder => ({
    id,
    name: id,
    preShares: 900,
    entitledShares: 450,
    subscribedShares: 12_500,
    faceValueSum: 900 * FACE,
  });

  it("[SS39-8] 고가발행 — 증여자가 전원 소액주주여도 병합하지 않는다", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "high",
      preIssuePrice: 100_000,
      newSharePrice: 150_000,
      shareholders: [
        {
          id: "B",
          name: "B",
          preShares: 96_400,
          entitledShares: 48_200,
          subscribedShares: 0,
          relatedTo: ["s1", "s2", "s3", "s4"],
          faceValueSum: 96_400 * FACE,
        },
        highDonor("s1"),
        highDonor("s2"),
        highDonor("s3"),
        highDonor("s4"),
      ],
    });
    const b = r.perBeneficiary.find((x) => x.beneficiaryId === "B")!;
    expect(b.byDonor).toHaveLength(4);
    expect(b.byDonor.every((d) => d.imputedSmallShareholderIds === undefined)).toBe(true);
    expect(b.total).toBe(1_606_602_400);
  });
});
