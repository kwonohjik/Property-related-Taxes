/**
 * @vitest-environment jsdom
 *
 * 결정 #47 (S14a-5) — 계산기 「양도일 현재도 배우자 쪽이 보유하나요」 질문: ⑤ 노출 · ⑧ 응답 요구 · ④⑫⑭ 엔진 도달 · 판정 메뉴 인계.
 *
 * 재현(종전): 판정 메뉴에서 넘어온 「배우자 쪽」 두 행(3주택, 혼인 5년 안, 조정 양도)은 칩이 꺼진 채 도착해 고지 없이 3주택 중과(433,686,000).
 * 응답 「예」면 차감되어 197,703,000.
 *
 * 게이트(후속): 조정대상지역을 저장된 토글만으로 읽어, 주소=조정·토글 꺼짐이면 엔진은 중과하는데 질문이 숨겨졌다(SQ-11~14).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { spouseHoldingQuestionApplies, spouseHoldingRowRole } from "@/lib/calc/spouse-holding-scope";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { calcForm, runCalc } from "./_one-house-pr11-helpers";
import { makeHouse } from "./one-house-rulings/harness";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const ROW = (id: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  makeHouse(id, { acquisitionDate: "2018-01-01", mergeOrigin: "counterpart_side", region: "capital", ...over });

/** 3주택(양도 + 배우자 쪽 2) · 혼인 2024-03-01 · 양도 2026-06-15(한시배제 종료 후) · 조정대상지역(주소 서울 강남구 + 토글). */
const form = (rows: HouseEntry[], over: Record<string, unknown> = {}, asset: Record<string, unknown> = {}): TransferFormData =>
  calcForm({
    acq: "2019-01-01",
    transfer: "2026-06-15",
    asset,
    top: { marriageDate: "2024-03-01", householdHousingCount: "3", isRegulatedArea: true, houses: rows, ...over } as never,
  });

/** 양도 주택 주소가 양도일(2026-06-15) 현재 조정대상지역이 아닌 곳(부산 중구) — 엔진은 주소로 판정해 중과하지 않는다. */
const NON_REGULATED_ADDRESS = { regionCode: "2611010100" };

/** 계산기 결과의 다주택 중과 상세 경고(`multiHouseSurchargeDetail.warnings`) — 확인 필요 고지가 실리는 자리. */
const surchargeWarnings = (r: Awaited<ReturnType<typeof runCalc>>): string[] =>
  ((r.result as { multiHouseSurchargeDetail?: { warnings?: string[] } } | undefined)?.multiHouseSurchargeDetail?.warnings ?? []);
const hasNotice = (r: Awaited<ReturnType<typeof runCalc>>) =>
  surchargeWarnings(r).some((w) => w.includes("확인되지 않은 것") && w.includes("확인 필요"));

const spouseIssues = (f: TransferFormData) =>
  collectStep1Issues(f).filter((i) => i.message.includes("양도일 현재도 배우자 쪽이"));

describe("#47 ⑤ 노출 게이트 / ⑧ 응답 요구", () => {
  it("[SQ-1] 게이트 — 3주택·혼인 5년 안·조정 양도에서 열리고, 5년 경과·비조정·2주택·혼인 후 취득이면 닫힌다", () => {
    const rows = [ROW("b"), ROW("c")];
    expect(spouseHoldingQuestionApplies(form(rows))).toBe(true);
    expect(spouseHoldingQuestionApplies(form(rows, { transferDate: "2029-03-05" }))).toBe(false); // 혼인 5년 경과(2029-03-01 삼일절 → 민법 §161로 3-02까지, 3-05 월요일은 경과)
    expect(spouseHoldingQuestionApplies(form(rows, { transferDate: "2029-03-01" }))).toBe(true);
    expect(spouseHoldingQuestionApplies(form(rows, {}, NON_REGULATED_ADDRESS))).toBe(false); // 비조정 주소
    expect(spouseHoldingQuestionApplies(form([ROW("b")]))).toBe(false); // 2주택
    expect(spouseHoldingQuestionApplies(form([ROW("b"), ROW("c", { acquisitionDate: "2025-01-01" })]))).toBe(false); // 혼인 뒤 취득
    expect(spouseHoldingQuestionApplies(form(rows, { marriageDate: "" }))).toBe(false);
    // 중과 한시배제(2026-05-09까지, 보유 2년↑) 안의 양도는 중과가 없다
    expect(spouseHoldingQuestionApplies(form(rows, { transferDate: "2026-05-09" }))).toBe(false);
  });

  it("[SQ-2] ⑧ — 배우자 쪽 행이 미응답이면 막고, 예·아니오·모름은 통과 / 양도자 쪽 행·게이트 밖은 요구하지 않는다", () => {
    expect(spouseIssues(form([ROW("b"), ROW("c")]))).toHaveLength(2);
    expect(spouseIssues(form([ROW("b", { spouseHeldAtTransfer: "yes" }), ROW("c", { spouseHeldAtTransfer: "no" })]))).toHaveLength(0);
    expect(spouseIssues(form([ROW("b", { spouseHeldAtTransfer: "unknown" }), ROW("c", { spouseHeldAtTransfer: "unknown" })]))).toHaveLength(0);
    // 옛 저장분의 꺼진 칩(false)은 응답이 아니다 → 요구 / 켜진 칩(true)은 예
    expect(spouseIssues(form([ROW("b", { isSpouseOwned: false }), ROW("c", { isSpouseOwned: true })]))).toHaveLength(1);
    expect(spouseIssues(form([ROW("b", { mergeOrigin: "seller_side" }), ROW("c", { mergeOrigin: "seller_side" })]))).toHaveLength(0);
    expect(spouseIssues(form([ROW("b"), ROW("c")], {}, NON_REGULATED_ADDRESS))).toHaveLength(0);
  });

  it("[SQ-3] 이중 합가 — 동거봉양이 먼저면 「혼인한 배우자 쪽」(second_merge_side) 행만 필수", () => {
    const f = form([ROW("b", { mergeOrigin: "second_merge_side" }), ROW("c", { mergeOrigin: "counterpart_side" })], {
      parentalCareMergeDate: "2023-01-01",
    });
    expect(spouseHoldingRowRole(f.houses[0], f)).toBe("spouse_side");
    expect(spouseHoldingRowRole(f.houses[1], f)).toBe("other");
    expect(spouseIssues(f)).toHaveLength(1);
  });
});

describe("#47 ⑤⑧ 게이트의 조정대상지역 = ④와 같은 실효값 (주소 우선, 없으면 토글)", () => {
  const rows = () => [ROW("b"), ROW("c")];

  it("[SQ-11] 주소=조정(강남)·토글 꺼짐/미설정 → 엔진은 중과(433,686,000)하므로 질문이 열리고 ⑧이 배우자 쪽 두 행을 요구한다", async () => {
    for (const isRegulatedArea of [false, undefined]) {
      const f = form(rows(), { isRegulatedArea });
      expect(spouseHoldingQuestionApplies(f)).toBe(true);
      expect(spouseIssues(f)).toHaveLength(2);
    }
    // 엔진이 실제로 주소로 중과한다 — 숨겨진 질문이면 「예」로 답할 길이 없다
    const r = await runCalc(form(rows(), { isRegulatedArea: false }));
    expect(r.totalTax).toBe(433_686_000);
    const yes = await runCalc(
      form([ROW("b", { spouseHeldAtTransfer: "yes" }), ROW("c", { spouseHeldAtTransfer: "yes" })], { isRegulatedArea: false }),
    );
    expect(yes.totalTax).toBe(197_703_000);
  }, 120_000);

  it("[SQ-12] 주소=비조정(부산 중구)·토글 켜짐 → 엔진은 중과하지 않으므로(197,703,000) 질문을 닫고 ⑧도 요구하지 않는다", async () => {
    const f = form(rows(), { isRegulatedArea: true }, NON_REGULATED_ADDRESS);
    expect(spouseHoldingQuestionApplies(f)).toBe(false);
    expect(spouseIssues(f)).toHaveLength(0);
    expect((await runCalc(f)).totalTax).toBe(197_703_000);
  }, 60_000);

  it("[SQ-13] 주소가 없으면 저장된 토글을 읽는다 (엔진과 같은 폴백)", () => {
    expect(spouseHoldingQuestionApplies(form(rows(), { isRegulatedArea: true }, { regionCode: "" }))).toBe(true);
    expect(spouseHoldingQuestionApplies(form(rows(), { isRegulatedArea: false }, { regionCode: "" }))).toBe(false);
  });

  it("[SQ-15] 자산 주소가 없으면 폼 전역 주소(form.regionCode=강남)를 읽는다 — ④ 폴백(primary.regionCode || form.regionCode)과 짝", async () => {
    const f = form(rows(), { isRegulatedArea: false, regionCode: "1168010100" }, { regionCode: "" });
    expect(spouseHoldingQuestionApplies(f)).toBe(true);
    expect(spouseIssues(f)).toHaveLength(2);
    // 엔진도 폼 전역 주소로 중과한다
    expect((await runCalc(f)).totalTax).toBe(433_686_000);
  }, 60_000);

  it("[SQ-14] ⑤ 편집 창 — 주소=조정·토글 꺼짐이면 배우자 쪽 행에 질문이 보인다", () => {
    const f = form(rows(), { isRegulatedArea: false });
    render(<HousesListSection form={f} onChange={() => {}} mergeContext={{ kind: "marriage", mergeDate: "2024-03-01" }} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(screen.getByTestId("spouse-holding-spouse_side")).toBeTruthy();
  });
});

describe("#47 ④⑫⑭ — 엔진 도달 (판정 메뉴 인계 재현)", () => {
  const calc = (a?: "yes" | "no" | "unknown") =>
    runCalc(form([ROW("b", { spouseHeldAtTransfer: a }), ROW("c", { spouseHeldAtTransfer: a })]));

  it("[SQ-4] 응답 없음(인계 직후) → 종전과 같은 세액 + 확인 필요 고지 / 「예」 → 차감 197,703,000 / 「아니오」 → 433,686,000 고지 없음 / 「모름」 → 고지", async () => {
    const none = await calc(undefined);
    expect(none.status).toBe(200);
    expect(none.totalTax).toBe(433_686_000);
    expect(hasNotice(none)).toBe(true);
    const yes = await calc("yes");
    expect(yes.totalTax).toBe(197_703_000);
    expect(hasNotice(yes)).toBe(false);
    const no = await calc("no");
    expect(no.totalTax).toBe(433_686_000);
    expect(hasNotice(no)).toBe(false);
    const unknown = await calc("unknown");
    expect(unknown.totalTax).toBe(433_686_000);
    expect(hasNotice(unknown)).toBe(true);
  }, 120_000);

  it("[SQ-5] 레거시 칩 true(응답 없음)는 종전대로 차감 — 옛 저장분 세액 보존", async () => {
    const r = await runCalc(form([ROW("b", { isSpouseOwned: true }), ROW("c", { isSpouseOwned: true })]));
    expect(r.totalTax).toBe(197_703_000);
  }, 60_000);

  it("[SQ-6] 판정 메뉴 → 계산기 인계 patch는 명부 행에 응답을 지어내지 않는다", () => {
    const j = createInitialOneHouseJudgmentForm();
    const patch = toTransferFormPatch({ ...j, houses: [ROW("b"), ROW("c")] }) as { houses?: HouseEntry[] };
    for (const h of patch.houses ?? []) expect(h.spouseHeldAtTransfer).toBeUndefined();
  });
});

describe("#47 ⑤ 편집 창", () => {
  it("[SQ-7] 배우자 쪽 행은 예/아니오/모름 3지선다, 양도자 쪽 행은 예/아니오 2지선다, 칩은 없다", () => {
    const f = form([ROW("b"), ROW("c", { mergeOrigin: "seller_side" })]);
    render(<HousesListSection form={f} onChange={() => {}} mergeContext={{ kind: "marriage", mergeDate: "2024-03-01" }} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(screen.getByTestId("spouse-holding-spouse_side")).toBeTruthy();
    expect(screen.getByTestId("spouse-holding-unknown-b")).toBeTruthy();
    expect(screen.queryByText("배우자 단독 보유 주택")).toBeNull();
    // 주택 행의 근거는 §167의3⑨
    expect(screen.getByTestId("spouse-holding-spouse_side").textContent).toContain("(소득세법 시행령 §167의3⑨)");
    // 세대원 보유분 안내는 재산세제과-1400 인용과 함께, 양도자 쪽 행에는 이 안내가 없다
    expect(screen.getByTestId("spouse-holding-spouse_side").textContent).toContain(
      "(기획재정부 재산세제과-1400 (2023.12.18.) — 배우자 세대 소유 주택 모두 제외)",
    );
    cleanup();
    render(<HousesListSection form={f} onChange={() => {}} mergeContext={{ kind: "marriage", mergeDate: "2024-03-01" }} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 2 편집" }));
    expect(screen.getByTestId("spouse-holding-other")).toBeTruthy();
    expect(screen.getByTestId("spouse-holding-other").textContent).not.toContain("재산세제과-1400");
    expect(screen.queryByTestId("spouse-holding-unknown-c")).toBeNull();
  });

  it("[SQ-8] 고르면 spouseHeldAtTransfer가 patch로 나가고, 판정 메뉴(hideSpouseOwned)에는 질문이 없다", () => {
    const onChange = vi.fn();
    const f = form([ROW("b"), ROW("c")]);
    const { unmount } = render(
      <HousesListSection form={f} onChange={onChange} mergeContext={{ kind: "marriage", mergeDate: "2024-03-01" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    fireEvent.click(screen.getByTestId("spouse-holding-yes-b"));
    const patch = onChange.mock.calls.at(-1)?.[0] as { houses: HouseEntry[] };
    expect(patch.houses[0].spouseHeldAtTransfer).toBe("yes");
    unmount();
    render(<HousesListSection form={f} onChange={() => {}} hideSpouseOwned mergeContext={{ kind: "marriage", mergeDate: "2024-03-01" }} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(screen.queryByTestId("spouse-holding-spouse_side")).toBeNull();
  });
});

describe("#47 ⑤ 분양권·입주권 행 — 칩이 아니라 조건부 질문 (E2E 대체 근거)", () => {
  const right = { id: "r1", type: "presale_right" as const, acquisitionDate: "2022-01-01", region: "capital" as const };
  const withRight = (over: Record<string, unknown> = {}, asset: Record<string, unknown> = {}) =>
    form([ROW("b")], { presaleRights: [right], ...over }, asset);
  const renderRights = (f: TransferFormData) =>
    render(<HousesListSection form={f} onChange={() => {}} mergeContext={{ kind: "marriage", mergeDate: "2024-03-01" }} />);

  it("[SQ-9] 혼인일만 입력된 폼(조건 미충족)에서는 질문도 옛 칩도 없다", () => {
    renderRights(withRight({}, NON_REGULATED_ADDRESS));
    expect(screen.queryByTestId("spouse-holding-right")).toBeNull();
    expect(screen.queryByRole("switch", { name: /배우자 단독 보유/ })).toBeNull();
  });

  it("[SQ-10] 조건 충족(조정 · 혼인 5년 안 · 주택+권리 3↑)이면 예/아니오/모름 질문이 열린다 — 옛 칩은 없다", () => {
    renderRights(withRight());
    expect(screen.getByTestId("spouse-holding-right")).toBeTruthy();
    expect(screen.getByTestId("spouse-holding-yes-r1")).toBeTruthy();
    expect(screen.getByTestId("spouse-holding-unknown-r1")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /배우자 단독 보유/ })).toBeNull();
    // 분양권·입주권 행의 근거는 §167의4⑤ — §167의3⑨(주택 수)가 아니다
    const rightCard = screen.getByTestId("spouse-holding-right").textContent ?? "";
    expect(rightCard).toContain("(소득세법 시행령 §167의4⑤)");
    expect(rightCard).not.toContain("§167의3⑨");
    // 권리 행: 세대원 안내는 하되 해석례가 주택에 관한 것임을 밝힌다
    expect(rightCard).toContain("기획재정부 재산세제과-1400 (2023.12.18.))은 주택에 관한 것이며");
  });
});
