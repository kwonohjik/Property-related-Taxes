/**
 * @vitest-environment jsdom
 *
 * ⑤ 소령 §167의3⑪ 기한 연장 사실 입력 — 2호(명부 행·양도 주택) · §155⑳ 임대주택 카드 · 3-state 전환.
 *
 * route anchor(`transfer.route.apt-deadline-extension-inputs.anchor.test.ts`)는 폼 값을 **직접 만들어** 본다 —
 * 화면에 칸이 없으면 그 값은 영원히 undefined이고 route anchor는 그대로 초록이다
 * ([[feedback_required_field_needs_an_input_path]]). 이 파일이 칸의 존재·범위·상호 배타 정리를 고정한다.
 *
 * | # | 주장 |
 * |---|---|
 * | AE-1 | 계산기 명부 행: 장기임대 가목 아파트면 칸이 있고, 비아파트·다목·사목·유형 미선택이면 없다 |
 * | AE-2 | 판정 메뉴(중과 엔진 미호출)에서는 칸을 열지 않는다 |
 * | AE-3 | 양도 주택 2호 섹션: 가목 아파트면 칸이 있다 |
 * | AE-4 | 3-state 전환 — 「없음」·「모름」은 날짜를 버리고, 날짜 입력은 「있음」으로 올라간다 |
 * | AE-5 | §155⑳ 임대주택 카드: 가목 아파트면 칸이 있고, ㉓ 말소 경로·비아파트면 없다 |
 * | AE-6 | ④·⑧ leaf — 상태별 본문 · 「있음」+빈 날짜 판정 |
 * | AE-7 | ⑧ 차단 — 명부 행·§155⑳ 임대주택 (양성/음성 짝, 범위 밖 stale 값은 막지 않음) |
 * | AE-8 | ⑪3호 — 인가·지정일 칸 · 「이전고시 전」(켜면 이전고시일 삭제·칸 숨김) · 단서 3-state(3호 사실 있을 때만) |
 * | AE-9 | ④·⑧ leaf — 3호 신규 사실의 본문 · 「이전고시 전」만으로 「있음」 성립 · 단서 게이트 |
 * | AE-10 | ⑧ 3호 사실이 있으면 이전고시일 또는 「이전고시 전」 필수 — leaf · 명부 행 · 양도 주택 · §155⑳ (양성/음성 짝) |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { SellingHouseLongTermRentalSection } from "@/components/calc/transfer/SellingHouseLongTermRentalSection";
import { AptDeadlineExtensionFields } from "@/components/calc/transfer/AptDeadlineExtensionFields";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import {
  aptDeadlineExtensionIncomplete,
  aptDeadlineExtensionPayload,
  aptDeadlineExtensionStatus,
  aptDeadlineRelocationFactPresent,
} from "@/lib/calc/apt-deadline-extension-scope";
import { createDefaultTransferFormData, type HouseEntry } from "@/lib/stores/calc-wizard-store";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

const row = (over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h1",
  region: "capital",
  acquisitionDate: "2017-06-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  isRegisteredRental: true,
  rentalRegistrationDate: "2018-01-01",
  businessRegistrationDate: "2018-01-01",
  rentalType: "A",
  ...over,
});
const ROW_EXT = "apt-deadline-ext-rental-h1";

describe("⑤ 2호 명부 행", () => {
  it("AE-1 계산기: 가목 아파트 → 칸 있음 / 비아파트·다목·사목·유형 미선택 → 없음", () => {
    const { rerender } = render(<HouseEntryEditor house={row()} onUpdate={() => {}} taxIncentiveRentalEnabled />);
    expect(screen.queryByTestId(ROW_EXT)).not.toBeNull();
    for (const over of [{ isApartment: false }, { rentalType: "C" as const }, { rentalType: "G" as const }, { rentalType: undefined }]) {
      rerender(<HouseEntryEditor house={row(over)} onUpdate={() => {}} taxIncentiveRentalEnabled />);
      expect(screen.queryByTestId(ROW_EXT)).toBeNull();
    }
    // 나·라·마목도 대상(가목2)·나목2)·라목8)·마목4))
    for (const t of ["B", "D", "E"] as const) {
      rerender(<HouseEntryEditor house={row({ rentalType: t })} onUpdate={() => {}} taxIncentiveRentalEnabled />);
      expect(screen.queryByTestId(ROW_EXT)).not.toBeNull();
    }
  });

  it("AE-2 판정 메뉴(기본 props): 같은 행이어도 칸을 열지 않는다", () => {
    render(<HouseEntryEditor house={row()} onUpdate={() => {}} />);
    expect(screen.queryByTestId(ROW_EXT)).toBeNull();
  });

  it("AE-3 양도 주택 2호 섹션: 가목 아파트 → 칸 있음, 「없음」 선택이 longTermRental 묶음으로 올라간다", () => {
    const onChange = vi.fn();
    render(
      <SellingHouseLongTermRentalSection
        value={{ longTermRental: { isLongTermRental: true, isApartment: true, rentalType: "A" } }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("apt-deadline-ext-none-rental-selling"));
    expect(onChange.mock.calls.at(-1)?.[0].longTermRental.rentalAptDeadlineExtension).toEqual({ status: "none" });
  });
});

describe("AE-4 3-state 전환 (상호 배타 정리는 onChange에서)", () => {
  const withDates = { status: "has" as const, dutyPeriodEndCancellationDate: "2027-06-01" };
  it("「없음」 → 날짜를 버린다 / 「모름」 → undefined / 「있음」 → 날짜 유지", () => {
    const onChange = vi.fn();
    render(<AptDeadlineExtensionFields value={withDates} onChange={onChange} idPrefix="t" />);
    fireEvent.click(screen.getByTestId("apt-deadline-ext-none-t"));
    expect(onChange).toHaveBeenLastCalledWith({ status: "none" });
    fireEvent.click(screen.getByTestId("apt-deadline-ext-unknown-t"));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
  it("「있음」을 고르면 날짜 칸이 열리고, 날짜 입력은 status:has로 올라간다", () => {
    const onChange = vi.fn();
    const { rerender } = render(<AptDeadlineExtensionFields value={undefined} onChange={onChange} idPrefix="t" />);
    expect(screen.queryByTestId("apt-deadline-ext-d1-t")).toBeNull();
    fireEvent.click(screen.getByTestId("apt-deadline-ext-has-t"));
    expect(onChange).toHaveBeenLastCalledWith({ status: "has" });
    rerender(<AptDeadlineExtensionFields value={{ status: "has" }} onChange={onChange} idPrefix="t" />);
    const box = screen.getByTestId("apt-deadline-ext-d1-t");
    fireEvent.change(within(box).getByLabelText("연도"), { target: { value: "2027" } });
    fireEvent.change(within(box).getByLabelText("월"), { target: { value: "06" } });
    fireEvent.change(within(box).getByLabelText("일"), { target: { value: "01" } });
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ status: "has", dutyPeriodEndCancellationDate: "2027-06-01" });
  });
});

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];
const unit = (over: Partial<Unit> = {}): Unit => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2016-06-01",
  rentalRegistrationDate: "2016-06-01",
  isApartment: true,
  ...over,
});

describe("⑤ §155⑳ 임대주택 카드", () => {
  const card = (u: Unit) =>
    render(<RentalUnitCard unit={u} index={0} onChange={() => {}} onRemove={() => {}} canRemove={false} />);
  it("AE-5 가목 아파트 → 칸 있음 / ㉓ 말소 경로·비아파트 → 없음", () => {
    card(unit());
    expect(screen.queryByTestId("apt-deadline-ext-unit-0")).not.toBeNull();
    cleanup();
    card(unit({ rentalAutoTermination: true }));
    expect(screen.queryByTestId("apt-deadline-ext-unit-0")).toBeNull();
    cleanup();
    card(unit({ isApartment: false }));
    expect(screen.queryByTestId("apt-deadline-ext-unit-0")).toBeNull();
  });
});

describe("AE-6 ④·⑧ leaf", () => {
  it("상태 해석 · 본문 · 빈 날짜 판정", () => {
    expect(aptDeadlineExtensionStatus(undefined)).toBe("unknown");
    expect(aptDeadlineExtensionStatus({ relocationAnnouncementDate: "2027-06-01" })).toBe("has"); // #1914 저장분
    expect(aptDeadlineExtensionPayload(undefined)).toBeUndefined();
    expect(aptDeadlineExtensionPayload({ status: "none", dutyPeriodEndCancellationDate: "2027-06-01" })).toEqual({
      confirmedNone: true,
    });
    expect(aptDeadlineExtensionPayload({ status: "has" })).toBeUndefined();
    expect(aptDeadlineExtensionIncomplete({ status: "has" })).toContain("하나 이상");
    expect(aptDeadlineExtensionIncomplete({ status: "has", relocationAnnouncementDate: "2027-06-01" })).toBeNull();
    expect(aptDeadlineExtensionIncomplete({ status: "none" })).toBeNull();
  });
});

describe("AE-7 ⑧ 「연장 사유 있음」 + 빈 날짜 차단 (⑤·④와 같은 범위)", () => {
  const msg = (issues: { message: string }[]) => issues.some((i) => i.message.includes("§167의3⑪"));
  it("명부 행 — 가목 아파트 「있음」+빈 날짜 → 차단 / 「없음」 → 통과 / 비아파트(범위 밖 stale) → 통과", () => {
    const f = createDefaultTransferFormData();
    f.householdHousingCount = "2";
    f.houses = [row({ rentalAptDeadlineExtension: { status: "has" }, rentalPeriodYears: "9", rentalStartOfficialPrice: "300000000" })];
    expect(msg(collectStep1Issues(f))).toBe(true);
    f.houses = [row({ rentalAptDeadlineExtension: { status: "none" }, rentalPeriodYears: "9", rentalStartOfficialPrice: "300000000" })];
    expect(msg(collectStep1Issues(f))).toBe(false);
    f.houses = [row({ isApartment: false, rentalAptDeadlineExtension: { status: "has" }, rentalPeriodYears: "9", rentalStartOfficialPrice: "300000000" })];
    expect(msg(collectStep1Issues(f))).toBe(false);
  });
  it("§155⑳ 임대주택 — 가목 아파트 「있음」+빈 날짜 → 차단 / 날짜 있음 → 이 사유로는 막지 않는다", () => {
    const f = createDefaultTransferFormData();
    const asset = { ...f.assets[0], assetKind: "housing" as const };
    const rh = (u: Unit) => ({ ...asset.rentalHousingException, applyException: true, scenario: "A" as const, rentalUnits: [u] });
    const full = unit({ standardPriceAtRentalStart: "300,000,000", rentalMonths: "96", requirementsConfirmed: true });
    const blocked = validateRentalHousingException(rh({ ...full, aptDeadlineExtension: { status: "has" } }), asset, 0, "자산1");
    const ok = validateRentalHousingException(
      rh({ ...full, aptDeadlineExtension: { status: "has", relocationAnnouncementDate: "2027-06-01" } }),
      asset,
      0,
      "자산1",
    );
    expect(blocked ?? "").toContain("§167의3⑪");
    expect(ok ?? "").not.toContain("§167의3⑪");
  });
});

describe("AE-8 ⑤ ⑪3호 인가·지정 · 이전고시 전 · 단서", () => {
  it("단서 질문은 3호 사실(인가일·이전고시일·이전고시 전)이 있을 때만 나온다", () => {
    const { rerender } = render(
      <AptDeadlineExtensionFields value={{ status: "has", dutyPeriodEndCancellationDate: "2028-06-01" }} onChange={() => {}} idPrefix="t" />,
    );
    expect(screen.getByTestId("apt-deadline-ext-d3auth-t")).toBeTruthy();
    expect(screen.queryByTestId("apt-deadline-ext-exprop-t")).toBeNull();
    for (const v of [
      { relocationAuthorizationDate: "2027-06-01" },
      { relocationAnnouncementDate: "2033-05-01" },
      { relocationNotYetAnnounced: true },
    ]) {
      rerender(<AptDeadlineExtensionFields value={{ status: "has", ...v }} onChange={() => {}} idPrefix="t" />);
      expect(screen.queryByTestId("apt-deadline-ext-exprop-t")).not.toBeNull();
    }
  });

  it("인가일 입력은 status:has로 올라간다 · 「이전고시 전」을 켜면 이전고시일을 지우고 칸을 숨긴다", () => {
    const onChange = vi.fn();
    const { rerender } = render(<AptDeadlineExtensionFields value={{ status: "has" }} onChange={onChange} idPrefix="t" />);
    const box = screen.getByTestId("apt-deadline-ext-d3auth-t");
    fireEvent.change(within(box).getByLabelText("연도"), { target: { value: "2027" } });
    fireEvent.change(within(box).getByLabelText("월"), { target: { value: "06" } });
    fireEvent.change(within(box).getByLabelText("일"), { target: { value: "01" } });
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ status: "has", relocationAuthorizationDate: "2027-06-01" });

    const v = { status: "has" as const, relocationAuthorizationDate: "2027-06-01", relocationAnnouncementDate: "2033-05-01" };
    rerender(<AptDeadlineExtensionFields value={v} onChange={onChange} idPrefix="t" />);
    expect(screen.getByTestId("apt-deadline-ext-d3-t")).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("apt-deadline-ext-d3pending-t")).getByRole("switch"));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({
      status: "has",
      relocationAuthorizationDate: "2027-06-01",
      relocationAnnouncementDate: undefined,
      relocationNotYetAnnounced: true,
    });
    rerender(
      <AptDeadlineExtensionFields value={{ status: "has", relocationNotYetAnnounced: true }} onChange={onChange} idPrefix="t" />,
    );
    expect(screen.queryByTestId("apt-deadline-ext-d3-t")).toBeNull();
  });

  it("단서 3-state — 예/아니오/모름이 true/false/undefined로 올라간다", () => {
    const onChange = vi.fn();
    const v = { status: "has" as const, relocationAnnouncementDate: "2033-05-01" };
    render(<AptDeadlineExtensionFields value={v} onChange={onChange} idPrefix="t" />);
    fireEvent.click(screen.getByTestId("apt-deadline-ext-exprop-yes-t"));
    expect(onChange.mock.calls.at(-1)?.[0].relocationExpropriationTransfer).toBe(true);
    fireEvent.click(screen.getByTestId("apt-deadline-ext-exprop-no-t"));
    expect(onChange.mock.calls.at(-1)?.[0].relocationExpropriationTransfer).toBe(false);
  });
});

describe("AE-9 ④·⑧ leaf — ⑪3호 신규 사실", () => {
  it("「이전고시 전」만으로 「있음」이 성립하고(⑧ 통과) 본문에 실린다 · 이전고시일과 함께면 날짜를 빼고 싣는다", () => {
    expect(aptDeadlineExtensionIncomplete({ status: "has", relocationNotYetAnnounced: true })).toBeNull();
    expect(aptDeadlineExtensionPayload({ status: "has", relocationNotYetAnnounced: true })).toEqual({ relocationNotYetAnnounced: true });
    expect(
      aptDeadlineExtensionPayload({ status: "has", relocationNotYetAnnounced: true, relocationAnnouncementDate: "2033-05-01" }),
    ).toEqual({ relocationNotYetAnnounced: true });
    expect(aptDeadlineExtensionPayload({ status: "has", relocationAuthorizationDate: "2027-06-01" })).toEqual({
      relocationAuthorizationDate: "2027-06-01",
    });
  });
  it("단서는 3호 사실이 있을 때만 싣는다(⑤와 같은 게이트) · 「없음」이면 싣지 않는다", () => {
    const stale = { status: "has" as const, dutyPeriodEndCancellationDate: "2028-06-01", relocationExpropriationTransfer: true };
    expect(aptDeadlineRelocationFactPresent(stale)).toBe(false);
    expect(aptDeadlineExtensionPayload(stale)?.relocationExpropriationTransfer).toBeUndefined();
    const live = { ...stale, relocationAnnouncementDate: "2033-05-01" };
    expect(aptDeadlineExtensionPayload(live)?.relocationExpropriationTransfer).toBe(true);
    expect(aptDeadlineExtensionPayload({ ...live, relocationExpropriationTransfer: false })?.relocationExpropriationTransfer).toBe(false);
    expect(aptDeadlineExtensionPayload({ ...live, status: "none" })).toEqual({ confirmedNone: true });
  });
});

describe("AE-10 ⑧ 3호 이전고시 상태 필수 (사용자 결정 2026-10-04 · ⑫ refine 미러)", () => {
  const AUTH_ONLY = { status: "has" as const, relocationAuthorizationDate: "2027-06-01" };
  const msg = (issues: { message: string }[]) => issues.some((i) => i.message.includes("이전고시일을 입력하거나"));
  it("leaf — 인가일만 → 차단 문구 / +이전고시일 · +이전고시 전 → 통과 / 3호 사실 없는 2호만 → 통과", () => {
    expect(aptDeadlineExtensionIncomplete(AUTH_ONLY)).toContain("이전고시");
    expect(aptDeadlineExtensionIncomplete({ ...AUTH_ONLY, relocationAnnouncementDate: "2033-05-01" })).toBeNull();
    expect(aptDeadlineExtensionIncomplete({ ...AUTH_ONLY, relocationNotYetAnnounced: true })).toBeNull();
    expect(aptDeadlineExtensionIncomplete({ status: "has", dutyPeriodEndCancellationDate: "2028-06-01" })).toBeNull();
    // 「없음」으로 바꾸면 stale 3호 값은 보내지 않으므로 막지 않는다
    expect(aptDeadlineExtensionIncomplete({ ...AUTH_ONLY, status: "none" })).toBeNull();
  });
  it("명부 행 · 양도 주택 2호 섹션 — 인가일만 → 차단 / 이전고시일 추가 → 통과", () => {
    const f = createDefaultTransferFormData();
    f.householdHousingCount = "2";
    const base = { rentalPeriodYears: "9", rentalStartOfficialPrice: "300000000" };
    f.houses = [row({ ...base, rentalAptDeadlineExtension: AUTH_ONLY })];
    expect(msg(collectStep1Issues(f))).toBe(true);
    f.houses = [row({ ...base, rentalAptDeadlineExtension: { ...AUTH_ONLY, relocationAnnouncementDate: "2033-05-01" } })];
    expect(msg(collectStep1Issues(f))).toBe(false);
    f.houses = [];
    f.sellingHouseExclusion = {
      longTermRental: { ...row(base), rentalAptDeadlineExtension: AUTH_ONLY },
    } as typeof f.sellingHouseExclusion;
    expect(msg(collectStep1Issues(f))).toBe(true);
    f.sellingHouseExclusion = {
      longTermRental: { ...row(base), rentalAptDeadlineExtension: { ...AUTH_ONLY, relocationNotYetAnnounced: true } },
    } as typeof f.sellingHouseExclusion;
    expect(msg(collectStep1Issues(f))).toBe(false);
  });
  it("§155⑳ 임대주택 — 인가일만 → 차단 / 이전고시 전 추가 → 통과", () => {
    const f = createDefaultTransferFormData();
    const asset = { ...f.assets[0], assetKind: "housing" as const };
    const rh = (u: Unit) => ({ ...asset.rentalHousingException, applyException: true, scenario: "A" as const, rentalUnits: [u] });
    const full = unit({ standardPriceAtRentalStart: "300,000,000", rentalMonths: "96", requirementsConfirmed: true });
    const blocked = validateRentalHousingException(rh({ ...full, aptDeadlineExtension: AUTH_ONLY }), asset, 0, "자산1");
    const ok = validateRentalHousingException(
      rh({ ...full, aptDeadlineExtension: { ...AUTH_ONLY, relocationNotYetAnnounced: true } }),
      asset,
      0,
      "자산1",
    );
    expect(blocked ?? "").toContain("이전고시일을 입력하거나");
    expect(ok ?? "").not.toContain("§167의3⑪");
  });
});
