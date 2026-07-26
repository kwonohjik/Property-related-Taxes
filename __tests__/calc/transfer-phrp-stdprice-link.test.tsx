/**
 * @vitest-environment jsdom
 *
 * §155⑳ 시나리오 B 취득·양도시 기준시가 ↔ 환산취득가 기준시가 연동 anchor.
 * 계획서: docs/02-design/features/transfer-phrp-stdprice-link.plan.md
 *
 * A1: predicate 전 분기 (C1 true / C2~C6c false)
 * A2: ④ 변환 — linked 자산 → asset 값 전송
 * A3: ④ 변환 — linked + stale rhe 값 → asset 값이 이김 (C8)
 * A4: ⑧ validate — linked 시 asset 값으로 통과/차단, 비연동 회귀
 * A5: ⑤ RTL — linked 시 취득/현양도 입력 미렌더 + echo 카드, prior 입력 존치
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { isPhrpStdPriceLinked } from "@/lib/calc/transfer-phrp-stdprice-link";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-helpers";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import {
  makeDefaultAsset,
  makeDefaultRentalUnit,
  RENTAL_HOUSING_EXCEPTION_DEFAULTS,
} from "@/lib/stores/calc-wizard-asset-factory";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

/** C1 — 스크린샷 사례: 환산 모드 + purchase + 비겸용 + 비PHD, 기준시가 3억/5억 */
function makeLinkedAsset(over: Partial<AssetForm> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  a.assetKind = "housing";
  a.useEstimatedAcquisition = true;
  a.acquisitionDate = "2009-10-01";
  a.standardPriceAtAcq = "300,000,000";
  a.standardPriceAtTransfer = "500,000,000";
  a.residencePeriodMonthsAsset = "38";
  return { ...a, ...over };
}

function makeScenarioBRhe(
  over: Partial<AssetForm["rentalHousingException"]> = {},
): AssetForm["rentalHousingException"] {
  const unit = makeDefaultRentalUnit();
  unit.businessRegistrationDate = "2009-10-01";
  unit.rentalRegistrationDate = "2009-10-01";
  unit.standardPriceAtRentalStart = "300,000,000";
  unit.rentalMonths = "96";
  unit.requirementsConfirmed = true;
  return {
    ...RENTAL_HOUSING_EXCEPTION_DEFAULTS,
    applyException: true,
    scenario: "B",
    rentalUnits: [unit],
    priorResidenceTransferDate: "2016-08-01",
    standardPriceAtPriorTransfer: "450,000,000",
    ...over,
  };
}

describe("A1 — isPhrpStdPriceLinked predicate 전 분기", () => {
  it("C1: 환산 + purchase + 비겸용 + 비PHD → true", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset())).toBe(true);
  });

  it("C1(입주권): right_to_move_in도 purchase 환산이면 true", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset({ assetKind: "right_to_move_in" }))).toBe(true);
  });

  it("C2: 실가 모드 → false", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset({ useEstimatedAcquisition: false }))).toBe(false);
  });

  it("C3: 감정가액 플래그 혼재(stale) → false (우선순위 2위 배제)", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset({ isAppraisalAcquisition: true }))).toBe(false);
  });

  it("C6c: 매매사례가액 플래그 혼재(stale) → false (우선순위 1위 배제)", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset({ isSalesCaseAcquisition: true }))).toBe(false);
  });

  it("C4: 겸용주택 → false", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset({ isMixedUseHouse: true }))).toBe(false);
  });

  it("C5: PHD §164⑤ 3-시점 모드 → false", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset({ usePreHousingDisclosure: true }))).toBe(false);
  });

  it("C6: 상속 취득 → false", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset({ acquisitionCause: "inheritance" }))).toBe(false);
  });

  it("C6b: 부담부증여 → false", () => {
    expect(isPhrpStdPriceLinked(makeLinkedAsset({ transferType: "burdened_gift" }))).toBe(false);
  });
});

describe("A2·A3 — ④ API 변환 소스 ternary", () => {
  it("A2: linked + rhe 취득/현양도 빈 값 → asset 값 전송 (3억/5억)", () => {
    const asset = makeLinkedAsset();
    asset.rentalHousingException = makeScenarioBRhe();
    const payload = toRentalHousingExceptionApi(asset) as Record<string, unknown>;
    expect(payload.standardPriceAtAcquisitionForPhrp).toBe(300_000_000);
    expect(payload.standardPriceAtTransferForPhrp).toBe(500_000_000);
    // prior는 rhe 소스 유지 (자산-수준 대응 필드 없음)
    expect(payload.standardPriceAtPriorTransfer).toBe(450_000_000);
  });

  it("A3(C8): linked + stale rhe 값(다른 금액) → asset 값이 이김", () => {
    const asset = makeLinkedAsset();
    asset.rentalHousingException = makeScenarioBRhe({
      standardPriceAtAcquisitionForPhrp: "111,111,111",
      standardPriceAtTransferForPhrp: "999,999,999",
    });
    const payload = toRentalHousingExceptionApi(asset) as Record<string, unknown>;
    expect(payload.standardPriceAtAcquisitionForPhrp).toBe(300_000_000);
    expect(payload.standardPriceAtTransferForPhrp).toBe(500_000_000);
  });

  it("회귀: 비연동(실가) + rhe 값 → rhe 값 전송 (현행 유지)", () => {
    const asset = makeLinkedAsset({ useEstimatedAcquisition: false });
    asset.rentalHousingException = makeScenarioBRhe({
      standardPriceAtAcquisitionForPhrp: "300,000,000",
      standardPriceAtTransferForPhrp: "500,000,000",
    });
    const payload = toRentalHousingExceptionApi(asset) as Record<string, unknown>;
    expect(payload.standardPriceAtAcquisitionForPhrp).toBe(300_000_000);
    expect(payload.standardPriceAtTransferForPhrp).toBe(500_000_000);
  });
});

describe("A4 — ⑧ validate 소스 ternary (3중 패턴)", () => {
  const TRANSFER_DATE = "2025-06-01";

  it("linked + asset 값 존재 + rhe 취득/현양도 빈 값 → 통과(null)", () => {
    const asset = makeLinkedAsset();
    asset.rentalHousingException = makeScenarioBRhe();
    expect(
      validateRentalHousingException(asset.rentalHousingException, asset, "자산 1", TRANSFER_DATE),
    ).toBeNull();
  });

  it("linked + asset 취득시 기준시가 빈 값 → 취득 정보 위치 안내 오류", () => {
    const asset = makeLinkedAsset({ standardPriceAtAcq: "" });
    asset.rentalHousingException = makeScenarioBRhe();
    const msg = validateRentalHousingException(
      asset.rentalHousingException,
      asset,
      "자산 1",
      TRANSFER_DATE,
    );
    expect(msg).toContain("취득 정보의 환산 취득시 기준시가");
  });

  it("회귀: 비연동(실가) + rhe 빈 값 → 기존 오류 문구", () => {
    const asset = makeLinkedAsset({ useEstimatedAcquisition: false });
    asset.rentalHousingException = makeScenarioBRhe();
    const msg = validateRentalHousingException(
      asset.rentalHousingException,
      asset,
      "자산 1",
      TRANSFER_DATE,
    );
    expect(msg).toContain("취득 당시 기준시가를 입력하세요");
  });

  it("linked + 순서 위반(asset 취득시 > prior) → 기존 순서 검증 유지", () => {
    const asset = makeLinkedAsset({ standardPriceAtAcq: "460,000,000" });
    asset.rentalHousingException = makeScenarioBRhe(); // prior 4.5억 < 취득 4.6억
    const msg = validateRentalHousingException(
      asset.rentalHousingException,
      asset,
      "자산 1",
      TRANSFER_DATE,
    );
    expect(msg).toContain("직전 양도 당시 기준시가");
  });
});

describe("A5 — ⑤ UI: linked 시 입력 숨김 + echo 카드", () => {
  function renderSection(asset: AssetForm) {
    return render(
      <RentalHousingExceptionSection
        rh={asset.rentalHousingException}
        asset={asset}
        acquisitionDate={asset.acquisitionDate}
        transferDate="2025-06-01"
        onChange={() => {}}
      />,
    );
  }

  it("linked: 취득/현양도 입력 미렌더 + echo 카드(값 3억/5억) + prior 입력 존치", () => {
    const asset = makeLinkedAsset();
    asset.rentalHousingException = makeScenarioBRhe();
    const { queryByText, getByTestId, getByText } = renderSection(asset);

    const echo = getByTestId("phrp-stdprice-linked-echo");
    expect(echo.textContent).toContain("300,000,000");
    expect(echo.textContent).toContain("500,000,000");
    expect(queryByText("취득 당시 기준시가")).toBeNull();
    expect(queryByText("현 양도 당시 기준시가")).toBeNull();
    expect(getByText("직전거주주택 양도 당시 기준시가")).toBeTruthy();
  });

  it("비연동(실가): 현행 입력 3필드 렌더 + echo 카드 없음", () => {
    const asset = makeLinkedAsset({ useEstimatedAcquisition: false });
    asset.rentalHousingException = makeScenarioBRhe();
    const { queryByTestId, getByText } = renderSection(asset);

    expect(queryByTestId("phrp-stdprice-linked-echo")).toBeNull();
    expect(getByText("취득 당시 기준시가")).toBeTruthy();
    expect(getByText("현 양도 당시 기준시가")).toBeTruthy();
    expect(getByText("직전거주주택 양도 당시 기준시가")).toBeTruthy();
  });

  it("linked + asset 기준시가 미입력: echo 카드에 선입력 안내", () => {
    const asset = makeLinkedAsset({ standardPriceAtAcq: "", standardPriceAtTransfer: "" });
    asset.rentalHousingException = makeScenarioBRhe();
    const { getByTestId } = renderSection(asset);
    expect(getByTestId("phrp-stdprice-linked-echo").textContent).toContain(
      "취득 정보에서 먼저 입력하세요",
    );
  });
});
