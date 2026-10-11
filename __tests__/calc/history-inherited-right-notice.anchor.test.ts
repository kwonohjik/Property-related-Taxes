/**
 * 결정 #8 조건 6 — 상속 권리 「상속개시 당시 보유」 날짜 판정 이전에 저장한 이력은 재계산하면 결론이 바뀔 수 있다는 고지.
 * 긍정(옛 토글 「예」 · 상속 권리 행 · 판정 메뉴) · 부정(변경 후 저장 · 상속 권리 없음 · 타 세목 · 저장 시각 불명) 짝.
 */
import { describe, expect, it } from "vitest";
import {
  INHERITED_RIGHT_DATE_RULE_SINCE,
  INHERITED_RIGHT_HISTORY_NOTICE,
  inheritedRightHistoryNotice,
} from "@/lib/calc/history-inherited-right-notice";

const OLD = "2026-10-07T03:00:00.000Z";
const NEW = "2026-10-12T03:00:00.000Z";
const inheritedRow = { id: "r1", type: "presale_right", isInherited: true };

function rec(over: { taxType?: string; inputData?: Record<string, unknown>; updatedAt?: string }) {
  return {
    taxType: (over.taxType ?? "transfer") as never,
    inputData: over.inputData ?? {},
    updatedAt: over.updatedAt ?? OLD,
  };
}

describe("이력 고지 — 상속 권리 날짜 판정 이전 저장분 (결정 #8 조건 6)", () => {
  it("옛 토글 「예」로 저장한 양도세 이력 → 고지", () => {
    expect(inheritedRightHistoryNotice(rec({ inputData: { generalHouseHeldAtInheritance: true } }))).toBe(
      INHERITED_RIGHT_HISTORY_NOTICE,
    );
  });

  it("10-05~10-09 저장 + 상속 분양권 행 → 고지(토글 미선언이어도)", () => {
    expect(
      inheritedRightHistoryNotice(rec({ updatedAt: "2026-10-06T01:00:00.000Z", inputData: { presaleRights: [inheritedRow] } })),
    ).toBe(INHERITED_RIGHT_HISTORY_NOTICE);
  });

  it("판정 메뉴·다건(최상위 presaleRights) 이력도 고지", () => {
    expect(
      inheritedRightHistoryNotice(rec({ taxType: "one_house_exemption", inputData: { presaleRights: [inheritedRow] } })),
    ).toBe(INHERITED_RIGHT_HISTORY_NOTICE);
    expect(
      inheritedRightHistoryNotice(rec({ inputData: { __multiTransfer: true, properties: [], presaleRights: [inheritedRow] } })),
    ).toBe(INHERITED_RIGHT_HISTORY_NOTICE);
  });

  it("상속 권리 행도 옛 토글도 없는 옛 이력 → 고지 없음", () => {
    expect(
      inheritedRightHistoryNotice(rec({ inputData: { presaleRights: [{ id: "r2", type: "presale_right", isInherited: false }] } })),
    ).toBeNull();
    expect(inheritedRightHistoryNotice(rec({ inputData: { generalHouseHeldAtInheritance: false } }))).toBeNull();
    expect(inheritedRightHistoryNotice(rec({}))).toBeNull();
  });

  it("변경 후 저장한 이력은 상속 권리 행이 있어도 고지 없음(경계: 기준 시각 1ms 전은 고지 · 정각은 없음)", () => {
    const input = { presaleRights: [inheritedRow], generalHouseHeldAtInheritance: true };
    expect(inheritedRightHistoryNotice(rec({ inputData: input, updatedAt: NEW }))).toBeNull();
    expect(inheritedRightHistoryNotice(rec({ inputData: input, updatedAt: INHERITED_RIGHT_DATE_RULE_SINCE }))).toBeNull();
    const before = new Date(Date.parse(INHERITED_RIGHT_DATE_RULE_SINCE) - 1).toISOString();
    expect(inheritedRightHistoryNotice(rec({ inputData: input, updatedAt: before }))).toBe(INHERITED_RIGHT_HISTORY_NOTICE);
  });

  it("영향 없는 세목 · 저장 시각을 못 읽는 이력 → 고지 없음", () => {
    expect(inheritedRightHistoryNotice(rec({ taxType: "gift", inputData: { presaleRights: [inheritedRow] } }))).toBeNull();
    expect(inheritedRightHistoryNotice(rec({ updatedAt: "not-a-date", inputData: { presaleRights: [inheritedRow] } }))).toBeNull();
  });
});
