/**
 * @vitest-environment jsdom
 *
 * anchor — §154①1호(건설임대·공공매입임대 거주 5년): **「임차일부터 양도일까지 세대전원 거주」를 전용 칸으로 받는다**.
 *
 * 1호는 취득 전 임차 거주를 포함한다(서면인터넷방문상담5팀-1760 — 당초 임차일부터 5년). 본문 거주요건은 「보유기간 중
 * 거주」라 구간 입력이 취득 전 입주를 막는다 — 같은 칸을 풀면 본문 거주까지 부풀어 1호 불성립 사안이 비과세된다.
 * 그래서 1호만 따로 받고, 비우면 본문 거주기간(취득일 기산 — 이 기간 이하)으로 판정한다. route 결론은 평가셋
 * F259-era(71개월 → 비과세) · N-F259-lease-unset(비움 → 과세)이 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | L-1 | 엔진 | 전용 값이 있으면 그 값으로 60개월 경계 · 없으면 본문 거주기간 |
 * | L-2 | ④ | 1호일 때만 싣는다(계산기·판정 메뉴·다건) · 빈 값은 싣지 않는다 |
 * | L-3 | ⑧ | 숫자가 아니면 오류 · 비우면 통과 |
 * | L-4 | ⑤ | 1호를 고르면 칸이 뜬다 · 다른 사유면 없다 |
 * | L-5 | 클라이언트 판정 | 일시적 2주택 1년 요건 면제 카드(계산기·판정 메뉴)와 거주요건 안내 입력이 같은 값을 쓴다 |
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { resolveExemptionProviso } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { buildExemptionProvisoPayload } from "@/lib/calc/exemption-proviso-payload";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { collectExemptionProvisoErrors } from "@/lib/calc/exemption-proviso-validate";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api-residence";
import { giftBurdenedOneHouseSlice } from "@/lib/calc/gift-burdened-one-house";
import { judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";

afterEach(cleanup);

const D = (s: string) => new Date(s);

describe("L-1 엔진", () => {
  const r = (lease: number | undefined, residenceMonths: number) =>
    resolveExemptionProviso({
      acquisitionDate: D("2006-03-14"),
      transferDate: D("2007-03-15"),
      residencePeriodMonths: residenceMonths,
      oneHouseExemptionProviso: {
        reason: "rental_5yr_residence",
        ...(lease !== undefined ? { rentalLeaseResidenceMonths: lease } : {}),
      },
    } as never);
  it("전용 값 60개월 경계", () => {
    expect(r(60, 12)).toBe("both");
    expect(r(59, 12)).toBeNull();
  });
  it("전용 값이 없으면 본문 거주기간", () => {
    expect(r(undefined, 60)).toBe("both");
    expect(r(undefined, 12)).toBeNull();
  });
});

describe("L-2 ④", () => {
  it("계산기 공용 조립 — 1호일 때만 · 빈 값 미전송", () => {
    const form = { ...createDefaultTransferFormData(), provisoRentalLeaseResidenceMonths: "71" };
    const rental = buildExemptionProvisoPayload({ ...form, provisoReason: "rental_5yr_residence" }, "one_house") as {
      oneHouseExemptionProviso: Record<string, unknown>;
    };
    expect(rental.oneHouseExemptionProviso.rentalLeaseResidenceMonths).toBe(71);
    const other = buildExemptionProvisoPayload({ ...form, provisoReason: "unavoidable" }, "one_house") as {
      oneHouseExemptionProviso: Record<string, unknown>;
    };
    expect(other.oneHouseExemptionProviso.rentalLeaseResidenceMonths).toBeUndefined();
    const blank = buildExemptionProvisoPayload(
      { ...form, provisoReason: "rental_5yr_residence", provisoRentalLeaseResidenceMonths: "" },
      "one_house",
    ) as { oneHouseExemptionProviso: Record<string, unknown> };
    expect("rentalLeaseResidenceMonths" in blank.oneHouseExemptionProviso).toBe(false);
  });
  it("판정 메뉴 · 다건도 같은 키", () => {
    const f = {
      ...createInitialOneHouseJudgmentForm(),
      transferDate: "2007-03-15",
      provisoReason: "rental_5yr_residence" as const,
      provisoRentalLeaseResidenceMonths: "71",
    };
    f.assets = [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2006-03-14" }];
    const body = buildOneHouseExemptionApiBody(f) as { oneHouseExemptionProviso?: Record<string, unknown> };
    expect(body.oneHouseExemptionProviso?.rentalLeaseResidenceMonths).toBe(71);
    const multi = buildPropertyPayload(f) as { oneHouseExemptionProviso?: Record<string, unknown> };
    expect(multi.oneHouseExemptionProviso?.rentalLeaseResidenceMonths).toBe(71);
    // 증여세 부담부증여 양도분 — 같은 카드·같은 조립을 쓰는 슬라이스가 값을 넘긴다
    const gift = giftBurdenedOneHouseSlice({ provisoReason: "rental_5yr_residence", provisoRentalLeaseResidenceMonths: "71" } as never, "2007-03-15");
    expect(gift.provisoRentalLeaseResidenceMonths).toBe("71");
  });
});

describe("L-3 ⑧", () => {
  const errs = (v: string) => collectExemptionProvisoErrors({ reason: "rental_5yr_residence", rentalLeaseResidenceMonths: v });
  it("숫자가 아니면 오류 · 비우면 통과", () => {
    expect(errs("abc").join()).toMatch(/임차일부터 거주한 개월/);
    expect(errs("")).toEqual([]);
    expect(errs("71")).toEqual([]);
  });
});

describe("L-4 ⑤", () => {
  const props = {
    provisoDepartureDate: "",
    provisoExpropriationDate: "",
    provisoBusinessApprovalDate: "",
    provisoRentalLeaseResidenceMonths: "",
    provisoPreContractNoHouse: false,
    mode: "one_house" as const,
    onChange: () => {},
  };
  it("1호를 고르면 칸 · 다른 사유면 없음", () => {
    render(<ExemptionProvisoSection {...props} provisoReason="rental_5yr_residence" />);
    expect(screen.getByText("임차일부터 세대전원 거주 개월")).toBeTruthy();
    cleanup();
    render(<ExemptionProvisoSection {...props} provisoReason="unavoidable" />);
    expect(screen.queryByText("임차일부터 세대전원 거주 개월")).toBeNull();
  });
});

describe("L-5 클라이언트 일시적 2주택 판정", () => {
  it("1년 요건 면제가 같은 값을 쓴다", () => {
    const base = {
      previousAcquisitionDate: "2006-03-14",
      newHouseAcquisitionDate: "2006-09-01",
      transferDate: "2007-03-15",
      provisoReason: "rental_5yr_residence",
      provisoDepartureDate: "",
      provisoExpropriationDate: "",
      provisoBusinessApprovalDate: "",
      residencePeriodMonths: "12",
    };
    const waived = (lease?: string) => {
      const v = judgeTempTwoHouseFromForm({ ...base, ...(lease !== undefined ? { provisoRentalLeaseResidenceMonths: lease } : {}) });
      return v.status === "pending" ? undefined : v.oneYearWaived;
    };
    expect(waived("71")).toBe(true);
    expect(waived(undefined)).toBe(false);
  });
  it("판정 메뉴 슬라이스 · 거주요건 안내 입력도 싣는다", () => {
    const f = {
      ...createInitialOneHouseJudgmentForm(),
      transferDate: "2007-03-15",
      isOneHousehold: true,
      provisoReason: "rental_5yr_residence" as const,
      provisoRentalLeaseResidenceMonths: "71",
      houses: [{ id: "n", acquisitionDate: "2006-09-01", region: "capital" }],
    } as never as ReturnType<typeof createInitialOneHouseJudgmentForm>;
    f.assets = [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2006-03-14" }];
    const v = judgmentTempTwoHouseVerdict(f, { previousAcquisitionDate: "2006-03-14", newAcquisitionDate: "2006-09-01" } as never);
    expect(v.status !== "pending" && v.oneYearWaived).toBe(true);
    const calc = {
      ...createDefaultTransferFormData(),
      transferDate: "2007-03-15",
      provisoReason: "rental_5yr_residence" as const,
      provisoRentalLeaseResidenceMonths: "71",
    };
    calc.assets = [{ ...calc.assets[0], assetKind: "housing", acquisitionDate: "2006-03-14" }];
    expect(buildResidenceReqInput(calc).oneHouseExemptionProviso?.rentalLeaseResidenceMonths).toBe(71);
  });
});
