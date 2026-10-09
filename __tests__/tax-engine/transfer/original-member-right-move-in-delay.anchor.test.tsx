/**
 * @vitest-environment jsdom
 *
 * #2054 후속 — 기존주택 원조합원 조합원입주권의 §155① 판정 사실 입력.
 *
 * 기존주택 원조합원은 §155① 일시적 2주택(신규 주택 = 입주권이 된 기존주택 · 기산일 = 기존주택 취득일 —
 * 사전-2018-법령해석재산-0620)으로 판정한다. 그 경로에 일시적 2주택과 같은 두 사실을 받는다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | M-1 | 엔진 | §155①2호 가목(2019-12-17 체제) — 전입일이 1년 이내면 성립 · 늦으면 불성립 · 없으면 불성립+확인 필요 |
 * | M-2 | 엔진 | §155①2호 단서 — 기존 임차인 종료일까지 전입·양도 기한이 늘어난다 |
 * | M-3 | 엔진 | §155⑱ — 3년을 넘겨도 사유가 있으면 성립(요건 A·전입은 그대로) |
 * | P-1 | ④⑫⑭ | 기존주택 원조합원 행에만 · 임차인 종료일은 토글 ON일 때만 · Zod·route가 날짜·사유를 엔진으로 넘긴다 |
 * | V-1 | ⑧ | 임차인 토글 ON + 종료일 없음/취득일 이하 → 오류 · 칸이 닫힌 행은 보지 않는다 |
 * | W-1 | ⑤ | 전입 칸은 2019-12-17 체제에서만 · §155⑱ 사유는 기존주택 원조합원 행에 늘 · 판정 메뉴 명부도 양도일을 넘긴다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
// 스키마 모듈 순환 초기화 순서 — 진입 모듈을 먼저 불러야 sub의 shape가 정의된다(redev-right-approval-date-plumbing 선례).
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import { originalMemberFactErrors, originalMemberMoveInRelevant } from "@/lib/calc/right-member-origin-scope";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput } from "../_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const GANGNAM = "11680";

/** A 2018-01-01 · B(기존주택) 2020-03-01 · 둘 다 조정(강남) · 양도 2021-02-01 — 2019-12-17 체제(1년 + 전입). */
function moveInCase(r: Partial<PresaleRight>, over: Partial<TransferTaxInput> = {}) {
  return resolveArticle89Clause2(
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionDate: D("2018-01-01"),
      transferDate: D("2021-02-01"),
      regionCode: GANGNAM,
      presaleRights: [
        {
          id: "r1",
          type: "redevelopment_right",
          acquisitionDate: D("2020-03-01"),
          region: "capital",
          memberOrigin: "original_house",
          regionCode: GANGNAM,
          ...r,
        },
      ],
      ...over,
    }),
    undefined,
  );
}

describe("M-1 §155①2호 가목 — 기존주택 전입", () => {
  it("1년 이내 전입 → 성립 · 늦은 전입 → 불성립(확인 필요 없음) · 미입력 → 불성립 + 확인 필요", () => {
    expect(moveInCase({ originalMemberMoveInDate: D("2020-09-01") }).status).toBe("exception_met");
    const late = moveInCase({ originalMemberMoveInDate: D("2021-04-01") });
    expect(late.status).toBe("excluded");
    expect(late.confirmNotes).toBeUndefined();
    const none = moveInCase({});
    expect(none.status).toBe("excluded");
    expect(none.confirmNotes?.join(" ")).toContain("기존주택 전입일을 입력하세요");
  });
});

describe("M-2 §155①2호 단서 — 기존 임차인", () => {
  it("임대차 종료일(1년 후·2년 이내)까지 양도·전입 기한이 늘어난다 — 단서가 없으면 1년을 넘긴 양도는 불성립(짝)", () => {
    const after = { transferDate: D("2021-06-01") };
    const moveIn = { originalMemberMoveInDate: D("2021-08-01") };
    expect(moveInCase({ ...moveIn, originalMemberTenantLeaseEndDate: D("2021-09-30") }, after).status).toBe("exception_met");
    expect(moveInCase({ originalMemberMoveInDate: D("2020-09-01") }, after).status).toBe("excluded");
  });
});

describe("M-3 §155⑱ 처분기한 예외", () => {
  /** B 2021-06-01 · 양도 2024-08-01 — 2023-01-12 이후 양도라 본문 3년(말일 2024-06-03) 경과 */
  const late = (r: Partial<PresaleRight>) =>
    moveInCase({ acquisitionDate: D("2021-06-01"), regionCode: undefined, ...r }, { transferDate: D("2024-08-01"), regionCode: undefined });
  it("사유가 있으면 기한을 넘겨도 성립 · 없으면 불성립(짝)", () => {
    expect(late({}).status).toBe("excluded");
    const v = late({ originalMemberDisposalDelayReason: "auction" });
    expect(v.status).toBe("exception_met");
  });
  it("⑱은 기한만 치유한다 — 1년 요건(종전 주택 취득 후 1년 지나 기존주택 취득)은 그대로", () => {
    // A 2018-01-01 · B 2018-06-01(5개월 뒤) — 사유가 있어도 요건 A 미충족으로 불성립
    expect(late({ originalMemberDisposalDelayReason: "auction", acquisitionDate: D("2018-06-01") }).status).toBe("excluded");
    // 짝 — B 2019-06-01(1년 뒤)이면 같은 사유로 성립
    expect(late({ originalMemberDisposalDelayReason: "auction", acquisitionDate: D("2019-06-01") }).status).toBe("exception_met");
  });
});

const row = (over: Partial<PresaleRightEntry> = {}): PresaleRightEntry => ({
  id: "p1",
  type: "redevelopment_right",
  acquisitionDate: "2020-03-01",
  region: "capital",
  memberOrigin: "original_house",
  ...over,
});

describe("P-1 ④ · ⑫ · ⑭", () => {
  const facts = {
    originalMemberMoveInDate: "2020-09-01",
    originalMemberExistingTenant: true,
    originalMemberTenantLeaseEndDate: "2021-09-30",
    originalMemberDisposalDelayReason: "auction",
  };
  it("기존주택 원조합원 행이면 싣고 Zod·route를 거쳐 엔진 Date·사유로 넘어간다", () => {
    const [p] = buildPresaleRightsPayload("housing", [row(facts)])!;
    expect(p).toMatchObject({
      originalMemberMoveInDate: "2020-09-01",
      originalMemberTenantLeaseEndDate: "2021-09-30",
      originalMemberDisposalDelayReason: "auction",
    });
    const [e] = mapPresaleRightsToEngine([presaleRightSchema.parse(p)])!;
    expect(e.originalMemberMoveInDate?.toISOString().slice(0, 10)).toBe("2020-09-01");
    expect(e.originalMemberTenantLeaseEndDate?.toISOString().slice(0, 10)).toBe("2021-09-30");
    expect(e.originalMemberDisposalDelayReason).toBe("auction");
  });
  it("다른 경위·임차인 토글 OFF·빈 사유는 싣지 않는다", () => {
    const [succ] = buildPresaleRightsPayload("housing", [row({ ...facts, memberOrigin: "successor" })])!;
    expect(succ).not.toHaveProperty("originalMemberMoveInDate");
    expect(succ).not.toHaveProperty("originalMemberDisposalDelayReason");
    const [off] = buildPresaleRightsPayload("housing", [
      row({ ...facts, originalMemberExistingTenant: false, originalMemberDisposalDelayReason: "" }),
    ])!;
    expect(off).not.toHaveProperty("originalMemberTenantLeaseEndDate");
    expect(off).not.toHaveProperty("originalMemberDisposalDelayReason");
    expect(off).toHaveProperty("originalMemberMoveInDate", "2020-09-01");
  });
});

describe("V-1 ⑧", () => {
  const T = "2021-02-01";
  it("임차인 토글 ON인데 종료일이 없거나 기존주택 취득일 이하면 오류", () => {
    expect(originalMemberFactErrors([row({ originalMemberExistingTenant: true })], T).map((e) => e.field)).toEqual([
      "presaleRights.0.originalMemberTenantLeaseEndDate",
    ]);
    expect(
      originalMemberFactErrors([row({ originalMemberExistingTenant: true, originalMemberTenantLeaseEndDate: "2020-03-01" })], T),
    ).toHaveLength(1);
    expect(
      originalMemberFactErrors([row({ originalMemberExistingTenant: true, originalMemberTenantLeaseEndDate: "2021-09-30" })], T),
    ).toEqual([]);
  });
  it("칸이 닫힌 행(체제 밖 양도일 · 다른 경위)은 보지 않는다", () => {
    expect(originalMemberFactErrors([row({ originalMemberExistingTenant: true })], "2024-03-01")).toEqual([]);
    expect(originalMemberFactErrors([row({ originalMemberExistingTenant: true, memberOrigin: "successor" })], T)).toEqual([]);
  });
  it("게이트 — 2019-12-17 이후 기존주택 취득 · 2020-02-11~2022-05-09 양도일 때만", () => {
    expect(originalMemberMoveInRelevant(row(), T)).toBe(true);
    expect(originalMemberMoveInRelevant(row({ acquisitionDate: "2019-06-01" }), T)).toBe(false);
    expect(originalMemberMoveInRelevant(row(), "2023-03-01")).toBe(false);
    expect(originalMemberMoveInRelevant(row(), undefined)).toBe(false);
  });
});

describe("W-1 ⑤", () => {
  const MOVE_IN = "original-member-move-in-date-0";
  const DELAY = "original-member-disposal-delay-0";
  it("체제 안이면 전입·임차인 칸이 뜨고, 입력이 같은 칸으로 올라간다", () => {
    const onChange = vi.fn();
    render(<PresaleRightsSection rights={[row()]} onChange={onChange} primaryKind="housing" transferDate="2021-02-01" />);
    expect(screen.getByTestId(MOVE_IN)).toBeTruthy();
    // 멸실로 전입하지 못해도 기한은 그대로다(기준-2025-법규재산-0005) — 엔진은 M-1과 같이 법문대로 본다.
    expect(screen.getByTestId("original-member-temp-two-house-0").textContent).toContain(
      "관리처분·멸실로 1년 안에 전입할 수 없게 된 경우에도 이 기한은 늘어나지 않습니다",
    );
    fireEvent.click(screen.getByTestId("original-member-existing-tenant-0").querySelector("[role=switch]")!);
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ originalMemberExistingTenant: true })]);
  });
  it("체제 밖이면 전입 칸은 없고 §155⑱ 사유만 — 고르면 같은 칸으로", () => {
    const onChange = vi.fn();
    render(<PresaleRightsSection rights={[row()]} onChange={onChange} primaryKind="housing" transferDate="2024-08-01" />);
    expect(screen.queryByTestId(MOVE_IN)).toBeNull();
    fireEvent.click(screen.getByTestId(DELAY).querySelector('input[value="auction"]')!);
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ originalMemberDisposalDelayReason: "auction" })]);
  });
  it("승계취득 행에는 두 칸 모두 없다", () => {
    render(
      <PresaleRightsSection rights={[row({ memberOrigin: "successor" })]} onChange={() => {}} primaryKind="housing" transferDate="2021-02-01" />,
    );
    expect(screen.queryByTestId(DELAY)).toBeNull();
    expect(screen.queryByTestId(MOVE_IN)).toBeNull();
  });
  it("입주권 양도(§89①4호 경로)에는 두지 않는다 — 원조합원 §155① 판정은 주택 양도에서만", () => {
    render(<PresaleRightsSection rights={[row()]} onChange={() => {}} primaryKind="right_to_move_in" transferDate="2021-02-01" />);
    expect(screen.queryByTestId(DELAY)).toBeNull();
    expect(screen.queryByTestId(MOVE_IN)).toBeNull();
  });
  it("판정 메뉴·계산기 명부(HousesListSection)도 양도일을 넘긴다", async () => {
    const { HousesListSection } = await import("@/app/calc/transfer-tax/steps/step4-sections/HousesListSection");
    const { createDefaultTransferFormData } = await import("@/lib/stores/calc-wizard-store");
    render(
      <HousesListSection
        form={{
          ...createDefaultTransferFormData(),
          transferDate: "2021-02-01",
          presaleRights: [row()],
          assets: [{ ...createDefaultTransferFormData().assets[0], assetKind: "housing" }],
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId(MOVE_IN)).toBeTruthy();
  });
});
