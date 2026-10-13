/**
 * @vitest-environment jsdom
 *
 * anchor — 기존주택 원조합원 입주권 행의 「건물 소유자」: 세대원이 건물을 소유하고 본인은 토지만 출자했으면
 * §156의2③·④로 판정한다(사용자 결정 2026-10-13, #13 후속).
 *
 * 행의 「취득 경위」는 사용자가 고르고 엔진은 `original_house`(§155①) / `original_non_house`·`successor`(§156의2③·④)를
 * 가른다. 세대원 건물 소유 선언은 새 엔진 필드가 아니라 **④ 전송 값**(`effectiveMemberOrigin`)으로 흡수한다 —
 * ⑤ 칸 노출 · ④ payload · 3년 예외 안내 범위가 같은 함수를 본다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { effectiveMemberOrigin, originalMemberFactErrors } from "@/lib/calc/right-member-origin-scope";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
import { rightThreeYearExceptionRightKinds } from "@/lib/calc/right-three-year-exception-scope";
// ⚠️ barrel과 순환 import — 서브를 먼저 로드하면 TDZ로 터진다.
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const D = (s: string) => new Date(s);

const row = (over: Partial<PresaleRightEntry> = {}): PresaleRightEntry => ({
  id: "r1",
  type: "redevelopment_right",
  acquisitionDate: "2021-06-01",
  region: "capital",
  memberOrigin: "original_house",
  ...over,
});

/** ④ → ⑫ → ⑭ → 엔진 §89② 판정. A 주택 2018-01-01 취득, 양도 2024-08-01(입주권 행 날짜 + 3년 경과) + §156의2④ 선언. */
function verdictThroughAllLayers(r: PresaleRightEntry) {
  const payload = buildPresaleRightsPayload("housing", [r]);
  if (!payload) throw new Error("④ payload 없음");
  const engineRows = mapPresaleRightsToEngine(
    payload.map((p) => presaleRightSchema.parse(p)),
    undefined,
  );
  if (!engineRows) throw new Error("⑭ 매핑 없음");
  return resolveArticle89Clause2(
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionDate: D("2018-01-01"),
      transferDate: D("2024-08-01"),
      presaleRights: engineRows,
      rightThreeYearException: {
        kind: "new_house",
        completionDate: D("2024-01-15"),
        movedInWithin3Years: true,
        residedOneYearOrMore: true,
      },
    }),
    undefined,
  );
}

describe("BO-1 effectiveMemberOrigin", () => {
  it("기존주택 + 세대원 소유만 상가·토지 원조합원(§156의2③·④)으로 본다", () => {
    expect(effectiveMemberOrigin(row({ originalHouseBuildingOwner: "household_member" }))).toBe("original_non_house");
  });
  it("본인 소유·미입력은 기존주택 그대로(§155①) — 종전 동작", () => {
    expect(effectiveMemberOrigin(row({ originalHouseBuildingOwner: "self" }))).toBe("original_house");
    expect(effectiveMemberOrigin(row())).toBe("original_house");
  });
  it("다른 경위·분양권에 남은 값은 읽지 않는다", () => {
    expect(effectiveMemberOrigin(row({ memberOrigin: "successor", originalHouseBuildingOwner: "household_member" }))).toBe("successor");
    expect(effectiveMemberOrigin(row({ type: "presale_right", originalHouseBuildingOwner: "household_member" }))).toBe("original_house");
  });
});

describe("BO-2 ④ → ⑫ → ⑭ → 엔진 — 같은 사실이 경위에 따라 갈린다", () => {
  it("★ 세대원 소유 → 3년 경과 후에도 §156의2④ 성립 (본인 소유면 §155①이라 불성립 — 짝)", () => {
    const member = verdictThroughAllLayers(row({ originalHouseBuildingOwner: "household_member" }));
    expect(member.status).toBe("exception_met");
    expect(member.exception).toBe(TRANSFER.RIGHT_3YR_EXCEPTION_156_2_4);
    expect(verdictThroughAllLayers(row({ originalHouseBuildingOwner: "self" })).status).toBe("excluded");
    expect(verdictThroughAllLayers(row()).status).toBe("excluded");
  });

  it("세대원 소유 행은 §155① 사실(전입일 등)을 싣지 않는다 — 남은 값이 엔진에 닿지 않게", () => {
    const payload = buildPresaleRightsPayload("housing", [
      row({ originalHouseBuildingOwner: "household_member", originalMemberMoveInDate: "2021-07-01", originalMemberDisposalDelayReason: "x" }),
    ])![0];
    expect(payload.memberOrigin).toBe("original_non_house");
    expect(payload.originalMemberMoveInDate).toBeUndefined();
    expect(payload.originalMemberDisposalDelayReason).toBeUndefined();
    const own = buildPresaleRightsPayload("housing", [row({ originalMemberMoveInDate: "2021-07-01" })])![0];
    expect(own.memberOrigin).toBe("original_house");
    expect(own.originalMemberMoveInDate).toBe("2021-07-01");
  });

  it("3년 예외 선언 안내 범위 — 세대원 소유 행은 §156의2④ 대상이다(본인 소유 행은 제외)", () => {
    const form = (r: PresaleRightEntry) =>
      ({ assets: [{ assetKind: "housing" }], transferDate: "2024-08-01", presaleRights: [r], houses: [] }) as unknown as TransferFormData;
    expect(rightThreeYearExceptionRightKinds(form(row({ originalHouseBuildingOwner: "household_member" })))).toEqual(["redevelopment_right"]);
    expect(rightThreeYearExceptionRightKinds(form(row()))).toEqual([]);
  });
});

describe("BO-2b ⑧ — 세대원 소유 행은 §155① 사실 검증 대상이 아니다", () => {
  // 2020-03-01 취득 · 2021-06-01 양도 — 2019-12-17 체제(전입·기존 임차인 단서 칸이 열리는 구간)
  const era = { acquisitionDate: "2020-03-01", originalMemberExistingTenant: true } as const;
  it("본인 소유: 기존 임차인 단서를 켜고 종료일이 없으면 막힌다 · 세대원 소유: 칸이 닫혀 막지 않는다", () => {
    expect(originalMemberFactErrors([row({ ...era })], "2021-06-01")).toHaveLength(1);
    expect(originalMemberFactErrors([row({ ...era, originalHouseBuildingOwner: "household_member" })], "2021-06-01")).toEqual([]);
  });
});

describe("BO-3 ⑤ 칸 — 질문은 기존주택 원조합원에만, 답이 날짜 칸 의미·§155① 칸을 바꾼다", () => {
  function renderRow(r: PresaleRightEntry, onChange = vi.fn()) {
    render(<PresaleRightsSection rights={[r]} onChange={onChange} primaryKind="housing" transferDate="2024-08-01" />);
    return onChange;
  }

  it("기존주택 원조합원이면 질문이 뜨고, 다른 경위면 안 뜬다", () => {
    renderRow(row());
    expect(screen.queryByTestId("presale-house-owner-self-0")).not.toBeNull();
    expect(screen.queryByTestId("presale-house-owner-member-0")).not.toBeNull();
    cleanup();
    renderRow(row({ memberOrigin: "successor" }));
    expect(screen.queryByTestId("presale-house-owner-self-0")).toBeNull();
  });

  it("세대원 소유를 고르면 날짜 칸이 인가일 의미로 바뀌고 §155① 칸이 닫힌다", () => {
    renderRow(row());
    expect(screen.queryByText("기존주택 취득일")).not.toBeNull();
    expect(screen.queryByTestId("original-member-temp-two-house-0")).not.toBeNull();
    cleanup();
    renderRow(row({ originalHouseBuildingOwner: "household_member" }));
    expect(screen.queryByText("입주권 취득일(관리처분계획 인가일)")).not.toBeNull();
    expect(screen.queryByText("기존주택 취득일")).toBeNull();
    expect(screen.queryByTestId("original-member-temp-two-house-0")).toBeNull();
  });

  it("선택이 행에 저장된다", () => {
    const onChange = renderRow(row());
    fireEvent.click(screen.getByTestId("presale-house-owner-member-0"));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as PresaleRightEntry[];
    expect(next[0].originalHouseBuildingOwner).toBe("household_member");
  });
});
