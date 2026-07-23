/**
 * @vitest-environment jsdom
 *
 * anchor: HousesListSection GracePeriodSection — §167의3①12의2 나·다목 UI (2026-07-24)
 *
 * 검증 항목:
 *  T-01: 토글 ON → 나/다 분기 RadioCardGroup 렌더 (native radio 아님)
 *  T-02: 나목 선택 → 허가 신청일·허가 수령·계약금 증빙 위젯 노출
 *  T-03: 다목 선택 → 나목 전용 필드(허가 신청일·허가 수령) 비노출 + 계약금 증빙만 노출
 *  T-04: 나목 선택 시 이전에 입력된 나목 전용 값이 다목 전환 시 초기화(silent 잔존 방지)
 *  T-05: 소재지 강남구(11680, 4개월) 기한 미리보기 — "적용 개월수: 4개월"
 *  T-06: 소재지 성남 분당구(41135, 6개월 — 2025-10-16 지정) 기한 미리보기 — "적용 개월수: 6개월"
 *  T-07: regionCode 미확보 시 경고 문구 노출
 *  T-08: 조건 충족 시 "충족" 미리보기, 미충족 시 "미충족" 미리보기
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function baseForm(overrides: Partial<TransferFormData> = {}): TransferFormData {
  const form = createDefaultTransferFormData();
  form.householdHousingCount = "2";
  form.isOneHousehold = true;
  form.transferDate = "2026-06-01"; // 가목 윈도우(≤2026-05-09) 이후 — 나·다목 판정 대상
  const primary = makeDefaultAsset(1);
  primary.assetKind = "housing";
  form.assets = [primary];
  // showGracePeriod = isOneHousehold && householdCount>=2 && (houses>0 || presaleRights>0) 게이트 충족용
  form.houses = [
    {
      id: "house_1",
      region: "capital",
      acquisitionDate: "2019-01-01",
      officialPrice: "300000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: false,
      isOfficetel: false,
      isUnsoldHousing: false,
    },
  ];
  return { ...form, ...overrides };
}

function renderSection(form: TransferFormData, onChange: (d: Partial<TransferFormData>) => void) {
  return render(<HousesListSection form={form} onChange={onChange} />);
}

describe("GracePeriodSection — §167의3①12의2 나·다목 UI", () => {
  it("T-01: 토글 ON → 나/다 RadioCardGroup 렌더", () => {
    let form = baseForm();
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    const { rerender } = renderSection(form, onChange);

    fireEvent.click(screen.getByRole("switch", { name: "중과 경과조치 조건 입력 (§167의3①12의2 나·다목)" }));
    rerender(<HousesListSection form={form} onChange={onChange} />);

    expect(screen.getByTestId("grace-period-basis-na")).toBeTruthy();
    expect(screen.getByTestId("grace-period-basis-da")).toBeTruthy();
    expect(screen.getByTestId("grace-period-basis-na")).toHaveProperty("type", "radio");
  });

  it("T-02: 나목 선택 → 허가 신청일·허가 수령·계약금 증빙 노출", () => {
    let form = baseForm();
    form.gracePeriod = {
      contractDate: "",
      isLandPermitTarget: undefined,
      permitApplicationDate: undefined,
      permitGranted: false,
      depositReceiptConfirmed: false,
    };
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    const { rerender } = renderSection(form, onChange);

    fireEvent.click(screen.getByTestId("grace-period-basis-na"));
    rerender(<HousesListSection form={form} onChange={onChange} />);

    expect(screen.getByText(/토지거래허가 신청일/)).toBeTruthy();
    expect(screen.getByText("토지거래허가 수령")).toBeTruthy();
    expect(screen.getByText("계약금 수령 증빙 확인")).toBeTruthy();
  });

  it("T-03: 다목 선택 → 나목 전용 필드 비노출, 계약금 증빙만 노출", () => {
    let form = baseForm();
    form.gracePeriod = {
      contractDate: "",
      isLandPermitTarget: undefined,
      permitApplicationDate: undefined,
      permitGranted: false,
      depositReceiptConfirmed: false,
    };
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    const { rerender } = renderSection(form, onChange);

    fireEvent.click(screen.getByTestId("grace-period-basis-da"));
    rerender(<HousesListSection form={form} onChange={onChange} />);

    expect(screen.queryByText(/토지거래허가 신청일/)).toBeNull();
    expect(screen.queryByText("토지거래허가 수령")).toBeNull();
    expect(screen.getByText("계약금 수령 증빙 확인")).toBeTruthy();
  });

  it("T-04: 나목 → 다목 전환 시 나목 전용 값 초기화", () => {
    let form = baseForm();
    form.gracePeriod = {
      contractDate: "2026-06-01",
      isLandPermitTarget: true,
      permitApplicationDate: "2026-05-01",
      permitGranted: true,
      depositReceiptConfirmed: true,
    };
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    const { rerender } = renderSection(form, onChange);

    fireEvent.click(screen.getByTestId("grace-period-basis-da"));
    rerender(<HousesListSection form={form} onChange={onChange} />);

    expect(form.gracePeriod?.isLandPermitTarget).toBe(false);
    expect(form.gracePeriod?.permitApplicationDate).toBeUndefined();
    expect(form.gracePeriod?.permitGranted).toBe(false);
    // 계약일·계약금 증빙은 다목에도 필요하므로 유지
    expect(form.gracePeriod?.contractDate).toBe("2026-06-01");
    expect(form.gracePeriod?.depositReceiptConfirmed).toBe(true);
  });

  it("T-05: 소재지 강남구(4개월) — 기한 미리보기 4개월", () => {
    let form = baseForm();
    form.assets[0].regionCode = "1168010100"; // 강남구
    form.gracePeriod = {
      contractDate: "2026-04-01",
      isLandPermitTarget: false,
      permitApplicationDate: undefined,
      permitGranted: false,
      depositReceiptConfirmed: true,
    };
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    renderSection(form, onChange);

    expect(screen.getByText(/적용 개월수: 4개월/)).toBeTruthy();
  });

  it("T-06: 소재지 성남 분당구(6개월, 2025-10-16 지정) — 기한 미리보기 6개월", () => {
    let form = baseForm();
    form.assets[0].regionCode = "4113510100"; // 성남시 분당구
    form.gracePeriod = {
      contractDate: "2026-04-01",
      isLandPermitTarget: false,
      permitApplicationDate: undefined,
      permitGranted: false,
      depositReceiptConfirmed: true,
    };
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    renderSection(form, onChange);

    expect(screen.getByText(/적용 개월수: 6개월/)).toBeTruthy();
  });

  it("T-07: regionCode 미확보 시 경고 문구 노출", () => {
    let form = baseForm();
    form.gracePeriod = {
      contractDate: "2026-04-01",
      isLandPermitTarget: false,
      permitApplicationDate: undefined,
      permitGranted: false,
      depositReceiptConfirmed: true,
    };
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    renderSection(form, onChange);

    expect(screen.getByText(/소재지.*미확보/)).toBeTruthy();
  });

  it("T-08: 다목 조건 충족 시 '충족' 미리보기 표시", () => {
    let form = baseForm();
    form.assets[0].regionCode = "1168010100"; // 강남구, 4개월
    form.transferDate = "2026-07-01"; // 계약(4-01) + 4개월(8-01) 이내
    form.gracePeriod = {
      contractDate: "2026-04-01",
      isLandPermitTarget: false,
      permitApplicationDate: undefined,
      permitGranted: false,
      depositReceiptConfirmed: true,
    };
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    renderSection(form, onChange);

    expect(screen.getByText(/충족 — 중과 경과조치 배제 대상/)).toBeTruthy();
  });

  it("T-08b: 다목 조건 미충족(계약금 증빙 미확인) 시 '미충족' 미리보기 표시", () => {
    let form = baseForm();
    form.assets[0].regionCode = "1168010100";
    form.transferDate = "2026-07-01";
    form.gracePeriod = {
      contractDate: "2026-04-01",
      isLandPermitTarget: false,
      permitApplicationDate: undefined,
      permitGranted: false,
      depositReceiptConfirmed: false, // 미확인
    };
    const onChange = (d: Partial<TransferFormData>) => {
      form = { ...form, ...d };
    };
    renderSection(form, onChange);

    expect(screen.getByText(/미충족 — 현재 입력 기준/)).toBeTruthy();
  });
});
