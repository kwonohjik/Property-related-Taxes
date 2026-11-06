/**
 * anchor — NH-59 — 재개발 완공 아파트 청산금 수령 단독신고에서도 §99의4 주택 수 제외 상세(§99의4⑥ 추징 경고)가 결과에 남는다.
 * 주택 수 제외는 청산금분 비과세의 「1세대1주택」 판정을 바꾸므로 그 근거를 싣는다(세액 불변).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case47RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

describe("NH-59 — 청산금 수령 단독신고 × §99의4 농어촌주택", () => {
  it("주택 수 제외 상세(3년 미보유 추징 경고 포함)가 결과에 실린다", () => {
    const redev = { ...case47RedevelopmentInfo(), receiveOnlyMode: true };
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt",
        transferPrice: redev.settlementAmount,
        transferDate: redev.settlementSaleDate!,
        acquisitionDate: D("2001-01-01"),
        acquisitionPrice: 100_000_000,
        expenses: 0,
        useEstimatedAcquisition: false,
        isOneHousehold: true,
        householdHousingCount: 2,
        residencePeriodMonths: 254,
        redevelopment: redev,
        finalOneHouseRestart: { hadOtherHouseDisposal: false, disposals: [] },
        reductions: [
          {
            type: "new_99_4_rural",
            ruralHouseAcquisitionDate: D("2020-06-01"),
            ruralHouseStdPrice: 200_000_000,
            isRegisteredHanok: false,
            isAdjacentArea: false,
            adjacentArea994: "no", // L2b(#2943) 연접 3-state — 「아니오」
            meetsLocationRequirement: true,
          },
        ],
      } as never) as TransferTaxInput,
      rates,
    );
    expect(r.totalTax).toBe(0);
    const d = r.new994Detail;
    expect(d?.isEligible).toBe(true);
    expect(d && d.isEligible && d.clawbackWarning).toBe(true);
  });
});
