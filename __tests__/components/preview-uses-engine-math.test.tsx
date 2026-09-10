/**
 * anchor: 미리보기 **컴포넌트가** 엔진 산식을 쓴다 (UI 리뷰 보통 #29·#27·#14).
 *
 * ⚠️ **이 파일이 필요한 이유** — 같은 축을 라이브러리 함수(`addMonths`·`calculateHoldingPeriod`·
 *    `computeSalePriceTotal`)로만 단언하면 **컴포넌트가 그것을 부르는지는 증명되지 않는다**.
 *    실제로 작성 중 그렇게 만들었다가, 세 컴포넌트를 종전 산식으로 되돌리는 뮤테이션에서
 *    라이브러리 anchor 5건이 **전부 통과**해 구별력 0임이 드러났다
 *    (메모리 `feedback_anchor_observes_wrong_stage`).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";
import { RedevelopmentValuationSection } from "@/components/calc/transfer/RedevelopmentValuationSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

describe("§97의5 3개월 배지 — 말일 clamp (#29)", () => {
  const view = (acq: string, reg: string) =>
    render(
      <Rental975InputForm
        value={{ registrationDate: reg } as never}
        onChange={() => {}}
        acquisitionDate={acq}
      />,
    );

  it("🔑 B-1: 2018-11-30 취득 · 2019-03-01 등록은 「3개월 초과」다", () => {
    // 종전 `setMonth`는 2019-03-02를 기한으로 잡아 emerald ✓를 띄웠고, 엔진은 그 조합에서
    // §97의5①1호 불충족으로 **100% 세액감면을 전액 배제**했다.
    view("2018-11-30", "2019-03-01");
    expect(screen.getByText(/3개월 초과/)).toBeTruthy();
    expect(screen.queryByText(/✓ 취득 후 3개월 내 등록/)).toBeNull();
  });

  it("B-2: 2019-02-28 등록은 종전대로 「3개월 내」다 (축을 죽인 게 아니다)", () => {
    view("2018-11-30", "2019-02-28");
    expect(screen.getByText(/3개월 내 등록/)).toBeTruthy();
  });
});

describe("§99의4 보유기간 미리보기 — 일(day)까지 본다 (#27)", () => {
  const view = (acq: string, transfer: string) =>
    render(
      <New994InputForm
        value={{ type: "new_99_4", ruralHouseAcquisitionDate: acq } as never}
        onChange={() => {}}
        transferDate={transfer}
      />,
    );

  it("🔑 B-3: 2020-03-31 → 2023-03-01은 「2년」이고 추징 경고가 뜬다", () => {
    // 종전 월 단위 뺄셈은 36개월 → 「3년」 → `< 3` 이 거짓이 되어 §99의4⑥ 추징 경고가 사라졌다.
    view("2020-03-31", "2023-03-01");
    expect(screen.getByText("2년")).toBeTruthy();
    expect(screen.getByText(/보유 3년 미만/)).toBeTruthy();
  });

  it("B-4: 3년을 실제로 채우면 경고가 사라진다", () => {
    view("2020-03-31", "2023-04-30");
    expect(screen.getByText("3년")).toBeTruthy();
    expect(screen.queryByText(/보유 3년 미만/)).toBeNull();
  });
});

describe("토지 출자 §166③ 미리보기 — 청산금 방향 (#14)", () => {
  const landAsset = (direction: "pay" | "receive"): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevOriginalAssetType: "land",
      useEstimatedAcquisition: true,
      redevRightsValue: "1000000000",
      redevLandArea: "100",
      redevLandPricePerSqmAtAcq: "1000000",
      redevLandPricePerSqmAtApproval: "5000000",
      redevSettlementAmount: "200000000",
      redevSettlementDirection: direction,
      actualSalePrice: "2000000000",
    }) as AssetForm;

  const view = (direction: "pay" | "receive") =>
    render(<RedevelopmentValuationSection asset={landAsset(direction)} onChange={() => {}} />);

  it("🔑 B-5: 청산금 **수령**이면 인가후 양도차익 = 20억 − (10억 − 2억) = 12억", () => {
    view("receive");
    expect(screen.getByText("1,200,000,000")).toBeTruthy();
  });

  it("B-6: 청산금 **납부**는 종전대로 20억 − (10억 + 2억) = 8억", () => {
    view("pay");
    expect(screen.getByText("800,000,000")).toBeTruthy();
  });

  it("B-7: 두 방향의 표시값이 실제로 다르다 — 구별력 확인", () => {
    view("receive");
    expect(screen.queryByText("800,000,000")).toBeNull();
  });
});
