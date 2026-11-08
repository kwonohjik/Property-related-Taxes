/**
 * @vitest-environment jsdom
 *
 * ⑤ 이월과세 토지 — 비사업용 토지 정밀판정 소유기간 기산일 안내 (L22). 판정값 단언은 route anchor
 * (`__tests__/api/transfer.route.nh99-l22-carryover-nbl-donor-acq-date.anchor.test.ts`)가 한다. 여기서는 화면 고지만 본다.
 * 부정형(이월과세가 아니면 없음)에는 긍정 짝을 둔다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CarryoverOwnershipPeriodNotice } from "@/components/calc/transfer/nbl/shared/CarryoverOwnershipPeriodNotice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);
const asset = (over: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), assetKind: "land", ...over }) as AssetForm;
const carryover = (donorAcquisitionDate: string) => ({ giftRegistryDate: "2022-03-01", donorAcquisitionDate }) as AssetForm["carryover"];

describe("CarryoverOwnershipPeriodNotice", () => {
  it("이월과세 · 증여자 취득일 입력 → 그 날부터 센다는 고지와 해석례 인용·확인 필요", () => {
    render(<CarryoverOwnershipPeriodNotice asset={asset({ acquisitionCause: "carryover_gift", acquisitionDate: "2005-01-01", carryover: carryover("2017-01-01") })} />);
    const text = screen.getByTestId("nbl-carryover-period-notice").textContent ?? "";
    expect(text).toContain("증여자 취득일(2017-01-01)부터 양도일까지");
    expect(text).not.toContain("2005-01-01"); // 원시 취득일 잔재는 보이지 않는다
    expect(text).toContain("부동산납세과-539");
    expect(text).toContain("확인이 필요합니다");
  });
  it("이월과세 · 증여자 취득일 비움 → 입력 안내", () => {
    render(<CarryoverOwnershipPeriodNotice asset={asset({ acquisitionCause: "carryover_gift", carryover: carryover("") })} />);
    expect(screen.getByTestId("nbl-carryover-period-notice").textContent).toContain("증여자 취득일을 이월과세 정보에 입력하면");
  });
  it("매매 토지 → 고지 없음", () => {
    render(<CarryoverOwnershipPeriodNotice asset={asset({ acquisitionCause: "purchase", acquisitionDate: "2017-01-01" })} />);
    expect(screen.queryByTestId("nbl-carryover-period-notice")).toBeNull();
  });
});
