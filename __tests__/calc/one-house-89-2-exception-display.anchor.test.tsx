/**
 * anchor — 판정 메뉴 결과가 §89② 예외(「소득세법 시행령」 §156의2·§156의3)로 받은 비과세의 근거를 보인다.
 *
 * 종전: 엔진은 `article89Clause2.exception`(예: 「§156의2 ⑨3호나목」)을 계산했지만 결과 화면의 「적용된 특례」·「근거 조문」은
 *   본체 특례(혼인 2+2면 §155⑤)만 보였다. 조합원입주권·분양권이 있는 세대가 실제로 기댄 조문이 화면에서 사라졌다(2026-11-22 실측 —
 *   혼인 2+2 · 1주택 + 승계 입주권 §156의2③ 둘 다 화면에 「§156의2」가 한 번도 없었다).
 *   §156의2⑨ 「…2주택과 2조합원입주권 등을 소유하게 되는 경우 … 이를 1세대1주택으로 보아 제154조제1항을 적용한다」.
 *
 * | # | 사안 | 주장 |
 * |---|---|---|
 * | X-1 | 혼인 2주택 + 승계 입주권 2개 · 구성 「승계 입주권 · 주택 먼저」(⑨3호 나목) | 비과세 · 적용된 특례에 §89② 예외 줄 + §156의2 ⑨3호나목 · 근거 조문에도 |
 * | X-2 | 1주택 + 승계 입주권(3년 이내 양도 · §156의2③) | 적용된 특례 카드가 새로 뜨고 §156의2 ③ |
 * | X-3 | 짝 — 같은 혼인 2+2 · 구성 미선택(과세) | §89② 예외 줄 없음 |
 * | X-4 | 비과세를 거두면(`revokeOneHouseExemption`) 표시 줄도 지운다 | |
 */
import { describe, it, expect } from "vitest";
import type { RulingCase } from "./one-house-rulings/harness";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";
import { revokeOneHouseExemption } from "@/lib/tax-engine/one-house/revoke-exemption";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";

const LABEL = "주택과 조합원입주권·분양권을 함께 보유한 세대의 §89② 예외";
const ADDR = "경상북도 구미시 송정동 1";
const right = (id: string, acquisitionDate: string, extra: object = {}) => ({
  id, type: "redevelopment_right", acquisitionDate, region: "non_capital", memberOrigin: "successor", ...extra,
});
const mk = (form: Record<string, unknown>): RulingCase =>
  ({ id: "x", docNo: "-", docDate: "-", basis: "era", today: "2023-10-16", summary: "x", bucket: "match", form }) as unknown as RulingCase;

const marriage22 = (top: Record<string, unknown>) =>
  mk({
    isOneHousehold: true,
    transferDate: "2023-10-15",
    contractTotalPrice: "800000000",
    marriageDate: "2023-01-10",
    isFirstTransferredInMerge: true,
    asset: { assetKind: "housing", acquisitionDate: "2020-05-10", fixedAcquisitionPrice: "500000000", addressJibun: ADDR },
    houses: [{ id: "b", region: "non_capital", acquisitionDate: "2021-07-20", acquisitionOrigin: "general", mergeOrigin: "counterpart_side" }],
    presaleRights: [right("s", "2022-09-25"), right("c", "2022-11-01")],
    ...top,
  });

async function judge(c: RulingCase) {
  const v = await judgeAndRender(c);
  expect(v.status).toBe(200);
  expect(v.issues.filter((x: string) => x.startsWith("error"))).toEqual([]);
  const j = (v.data as { judgment: OneHouseJudgment }).judgment;
  return { j, text: v.text };
}

describe("§89② 예외 근거 표시", () => {
  it("X-1 혼인 2+2 · ⑨3호 나목 → 적용된 특례에 §89② 예외 줄 · 근거 조문에 §156의2 ⑨3호나목", async () => {
    const { j, text } = await judge(marriage22({ mergedHouseholdFirstHouseKind: "succeeded_right", mergedHouseholdOwnedBeforeRight: true }));
    expect(j.isExempt).toBe(true);
    expect(j.article89ExceptionApplied).toEqual({ label: LABEL, legalBasis: ["소득세법 시행령 §156의2 ⑨3호나목"] });
    expect(j.legalBasis).toEqual(["소득세법 시행령 §155⑤", "소득세법 시행령 §156의2 ⑨3호나목"]);
    expect(text).toContain(LABEL);
    expect(text).toContain("§156의2");
  });

  it("X-2 1주택 + 승계 입주권(§156의2③) → 적용된 특례 카드가 뜨고 §156의2 ③", async () => {
    const { j, text } = await judge(
      mk({
        isOneHousehold: true,
        transferDate: "2023-10-15",
        contractTotalPrice: "800000000",
        asset: { assetKind: "housing", acquisitionDate: "2020-05-10", fixedAcquisitionPrice: "500000000", addressJibun: ADDR },
        houses: [],
        presaleRights: [right("s", "2022-09-25")],
      }),
    );
    expect(j.isExempt).toBe(true);
    expect(j.appliedExceptions).toEqual([]);
    expect(j.article89ExceptionApplied?.legalBasis).toEqual(["소득세법 시행령 §156의2 ③"]);
    expect(text).toContain("적용된 특례");
    expect(text).toContain(LABEL);
  });

  it("X-3 짝 — 구성 미선택(과세)이면 §89② 예외 줄이 없다", async () => {
    const { j, text } = await judge(marriage22({}));
    expect(j.isExempt).toBe(false);
    expect(j.article89ExceptionApplied).toBeUndefined();
    // 같은 라벨을 불성립 카드(`89-2-exclusion-unmet`)가 쓰므로 문구가 아니라 「적용된 특례」 카드 유무로 본다
    expect(j.unmetExceptions.map((u) => u.id)).toContain("89-2-exclusion-unmet");
    expect(text).not.toContain("적용된 특례");
  });

  it("X-4 비과세를 거두면 표시 줄도 지운다", async () => {
    const { j } = await judge(marriage22({ mergedHouseholdFirstHouseKind: "succeeded_right", mergedHouseholdOwnedBeforeRight: true }));
    const revoked = revokeOneHouseExemption(j);
    expect(revoked.article89ExceptionApplied).toBeUndefined();
    expect(revoked.legalBasis).not.toContain("소득세법 시행령 §156의2 ⑨3호나목");
  });
});
