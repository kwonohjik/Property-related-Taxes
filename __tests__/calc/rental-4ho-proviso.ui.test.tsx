/**
 * @vitest-environment jsdom
 *
 * anchor(⑤·⑧) — OH-38 삭제 전 §154①4호 입력 위젯을 **실제 Step4**로 렌더해 노출 범위와 검증을 본다.
 *
 * - 사유 「4호 임대사업자 등록」을 고르면 신청일 2칸·등록 상태가 열린다.
 * - 신청 당시 1주택 선언·증여 포괄승계 별도세대는 2020-02-11 이후 양도에만 묻는다(부칙<제30395호> 제38조②).
 * - 임대의무기간·5%는 「등록 유지」일 때만, 증액 계약일은 5% 초과 「예」일 때만.
 * - ⑧은 보이는 칸만 필수로 본다(같은 술어 `rental4hoFieldScope`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { collectExemptionProvisoErrors } from "@/lib/calc/exemption-proviso-validate";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

function initial(overrides: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2018-03-01" } : a,
    ),
    transferDate: "2026-07-01",
    isOneHousehold: true,
    householdHousingCount: "1",
    wasRegulatedAtAcquisition: true,
    ...overrides,
  };
}

function Harness({ start }: { start: TransferFormData }) {
  const [form, setForm] = useState(start);
  return <Step4 form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />;
}

const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));
const has = (testId: string) => screen.queryByTestId(testId) !== null;

describe("OH-38 ⑤ — 4호 입력 칸의 노출", () => {
  it("★ 사유를 고르면 입력 칸이 열리고, 상태에 따라 단서 질문이 열린다", () => {
    render(<Harness start={initial()} />);
    expect(has("proviso-4ho-fields")).toBe(false);
    click("proviso-reason-rental_4ho");
    expect(has("proviso-4ho-fields")).toBe(true);
    expect(screen.getByText("사업자등록 신청일")).toBeTruthy();
    expect(screen.getByText("임대사업자 등록 신청일")).toBeTruthy();
    // 2026 양도 → 부칙 제38조② 요건 질문이 보인다
    expect(has("proviso-4ho-regulated-one-house-yes")).toBe(true);
    expect(screen.getByText(/증여로 임대사업자 지위를 넘겨받고/)).toBeTruthy();
    // 상태 미선택 → 단서 질문 없음
    expect(has("proviso-4ho-during-mandatory-yes")).toBe(false);
    click("proviso-4ho-status-maintained");
    expect(has("proviso-4ho-during-mandatory-yes")).toBe(true);
    expect(has("proviso-4ho-rent-over5-yes")).toBe(true);
    expect(screen.queryByText("5% 넘게 올린 계약의 체결·갱신일")).toBeNull();
    click("proviso-4ho-rent-over5-yes");
    expect(screen.getByText("5% 넘게 올린 계약의 체결·갱신일")).toBeTruthy();
    // 말소로 바꾸면 단서 질문이 닫힌다
    click("proviso-4ho-status-auto_cancelled");
    expect(has("proviso-4ho-during-mandatory-yes")).toBe(false);
    expect((screen.getByTestId("proviso-reason-rental_4ho") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("proviso-4ho-status-auto_cancelled") as HTMLInputElement).checked).toBe(true);
  });

  it("2020-02-10 양도(부칙 제38조①)에는 신청 당시 1주택·증여 승계 질문을 하지 않는다", () => {
    render(<Harness start={initial({ transferDate: "2020-02-10", provisoReason: "rental_registration_4ho" })} />);
    expect(has("proviso-4ho-fields")).toBe(true);
    expect(has("proviso-4ho-regulated-one-house-yes")).toBe(false);
    expect(screen.queryByText(/증여로 임대사업자 지위를 넘겨받고/)).toBeNull();
  });

  it("2주택(일시적 2주택 맥락 아님)이면 §154① 단서 카드 자체가 없다", () => {
    render(<Harness start={initial({ householdHousingCount: "3" })} />);
    expect(has("proviso-reason-rental_4ho")).toBe(false);
  });
});

describe("OH-38 ⑧ — 보이는 칸만 필수", () => {
  const base = { reason: "rental_registration_4ho" };
  it("빈 입력 → 신청일 2·1주택 선언·상태 필수", () => {
    const e = collectExemptionProvisoErrors({ ...base, rental4ho: { transferDate: "2026-07-01" } });
    expect(e.join("\n")).toContain("사업자등록 신청일");
    expect(e.join("\n")).toContain("임대사업자 등록 신청일");
    expect(e.join("\n")).toContain("조정대상지역 1주택");
    expect(e.join("\n")).toContain("등록 상태");
    expect(e.join("\n")).not.toContain("임대의무기간");
  });
  it("2020-02-10 양도면 1주택 선언을 요구하지 않는다", () => {
    const e = collectExemptionProvisoErrors({ ...base, rental4ho: { transferDate: "2020-02-10" } });
    expect(e.join("\n")).not.toContain("조정대상지역 1주택");
  });
  it("유지 + 5% 초과 예 → 임대의무기간·계약일 필수 / 계약일이 양도일 뒤면 오류", () => {
    const e = collectExemptionProvisoErrors({
      ...base,
      rental4ho: {
        transferDate: "2026-07-01",
        proviso4hoBusinessRegDate: "2018-06-01",
        proviso4hoRentalRegDate: "2018-06-01",
        proviso4hoRegulatedOneHouse: "yes",
        proviso4hoStatus: "maintained",
        proviso4hoRentOver5: "yes",
        proviso4hoRentOver5ContractDate: "2026-08-01",
      },
    });
    expect(e.join("\n")).toContain("임대의무기간 중 양도인지");
    expect(e.join("\n")).toContain("양도일 이전이어야");
  });
  it("모두 채우면 오류 없음 — 신청일이 기한 뒤인 것은 오류가 아니다(엔진이 「적용되지 않음」 사유를 낸다)", () => {
    const e = collectExemptionProvisoErrors({
      ...base,
      rental4ho: {
        transferDate: "2026-07-01",
        proviso4hoBusinessRegDate: "2020-03-01",
        proviso4hoRentalRegDate: "2020-03-01",
        proviso4hoRegulatedOneHouse: "no",
        proviso4hoStatus: "voluntary_cancelled",
      },
    });
    expect(e).toEqual([]);
  });
});
