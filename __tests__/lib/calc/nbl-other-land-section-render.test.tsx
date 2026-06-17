// @vitest-environment jsdom
/**
 * ⑤ UI 위젯 anchor — OtherLandDetailSection §168의11① 호별 면적기준 (갭 3a)
 *
 * RadioCardGroup 호 옵션 렌더 + 선택 시 조건부 면적인자 입력 노출 + onAssetChange wiring 검증.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

describe("[NBL-OTHER-UI] ⑤ §168의11① 호별 면적기준 위젯", () => {
  it("호 옵션(부설주차장·하치장·청소년수련시설)이 RadioCardGroup으로 렌더된다", () => {
    const asset = makeDefaultAsset(1);
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/부설주차장 \(2호 가목\)/)).toBeTruthy();
    expect(screen.getByText(/하치장·야적장·적치장 \(7호\)/)).toBeTruthy();
    expect(screen.getByText(/청소년수련시설 \(4호\)/)).toBeTruthy();
  });

  it("호 라디오 선택 시 onAssetChange(nblOtherRelatedBusinessType) 호출", () => {
    const asset = makeDefaultAsset(1);
    const onChange = vi.fn();
    render(<OtherLandDetailSection asset={asset} onAssetChange={onChange} />);
    const radio = screen.getByTestId("nbl-other-related-parking_attached");
    fireEvent.click(radio);
    expect(onChange).toHaveBeenCalledWith({ nblOtherRelatedBusinessType: "parking_attached" });
  });

  it("parking_attached 선택 시 '기준면적 (㎡)' 입력이 노출된다", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "parking_attached" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/기준면적 \(㎡\)/)).toBeTruthy();
  });

  it("hatchang 선택 시 '매년 최대 사용면적 (㎡)' 입력이 노출된다", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "hatchang" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/매년 최대 사용면적 \(㎡\)/)).toBeTruthy();
  });

  it("vacant_lot_1household 선택 시 안내(660㎡)만 노출, 면적 입력 없음", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "vacant_lot_1household" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    // 안내 카드 고유 문구(별도 면적 입력 불필요) — 옵션 설명과 구분
    expect(screen.getByText(/별도 면적 입력 불필요/)).toBeTruthy();
    expect(screen.queryByText(/기준면적 \(㎡\)/)).toBeNull();
  });

  it("none(해당 없음) 선택 시 면적인자 입력(라벨 ㎡) 미노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "none" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    // FieldCard 라벨은 '(㎡)' 접미 — 옵션 설명("매년 최대 사용면적 × 120%...")과 구분
    expect(screen.queryByText(/기준면적 \(㎡\)/)).toBeNull();
    expect(screen.queryByText(/매년 최대 사용면적 \(㎡\)/)).toBeNull();
  });

  // F2 Phase B — sports: 체육시설 유형 RadioCardGroup + (default workplace) 종목 select 노출.
  it("sports 선택 시 '체육시설 유형'(직장/운동경기업/종업원) + 종목 select 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "sports" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/체육시설 유형/)).toBeTruthy();
    expect(screen.getByTestId("nbl-other-sports-category-business")).toBeTruthy();
    expect(screen.getByTestId("nbl-other-sports-category-employee")).toBeTruthy();
    expect(screen.getByText(/체육시설 종목/)).toBeTruthy(); // default workplace → 종목 select
  });

  // F2 Phase B — employee: 종업원 수 + 보유 시설(운동장·코트·실내) 토글 노출.
  it("sports + employee 선택 시 '종업원 수'·보유 시설 토글 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "sports" as const, nblOtherSportsCategory: "employee" };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/종업원 수/)).toBeTruthy();
    expect(screen.getByTestId("nbl-other-employee-kind-field")).toBeTruthy();
    expect(screen.getByTestId("nbl-other-employee-kind-court")).toBeTruthy();
    expect(screen.getByTestId("nbl-other-employee-kind-indoor")).toBeTruthy();
  });

  // F2 Phase B — 유형 선택 onAssetChange wiring.
  it("체육시설 유형(운동경기업) 선택 시 onAssetChange(nblOtherSportsCategory) 호출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "sports" as const };
    const onChange = vi.fn();
    render(<OtherLandDetailSection asset={asset} onAssetChange={onChange} />);
    fireEvent.click(screen.getByTestId("nbl-other-sports-category-business"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherSportsCategory: "business" });
  });

  // F2 Phase A — reserve_forces: 부대규모 select + 부대규모 선택 시 시설 토글 노출.
  it("reserve_forces + 부대규모 선택 시 '부대편성인원 (별표6)'·시설 토글 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "reserve_forces" as const, nblOtherReserveUnitSize: "le2400" };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/부대편성인원 \(별표6\)/)).toBeTruthy();
    expect(screen.getByTestId("nbl-other-reserve-fac-tactical")).toBeTruthy();
  });

  // F2 Phase B(B-3) — resort: 6호 휴양 §83의4⑫ 3요소 입력 노출.
  it("resort 선택 시 6호 휴양 3요소(옥외·부설주차장·건축물 부속토지) 입력 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "resort" as const };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/옥외 방목장·식물원 면적/)).toBeTruthy();
    expect(screen.getByText(/부설주차장 설치기준면적 \(㎡\)/)).toBeTruthy(); // 옵션 설명과 구분 위해 (㎡) 한정
    expect(screen.getByText(/건축물 바닥면적/)).toBeTruthy();
  });

  // F2 Phase B(B-2) — 선수가산: 테니스 선택 시 선수 수 입력 노출.
  it("sports 테니스 선택 시 '선수 수' 입력 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "sports" as const, nblOtherSportsFacilityType: "tennis" };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/선수 수/)).toBeTruthy();
  });

  // F2 Phase B(B-2) — 실내미설치: workplace 실내 종목 선택 시 토글 노출.
  it("sports workplace 실내(수영) 선택 시 '실내체육시설 미설치' 토글 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "sports" as const, nblOtherSportsCategory: "workplace", nblOtherSportsFacilityType: "swimming" };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-other-indoor-not-installed")).toBeTruthy();
  });

  // F2 Phase B(B-2) — 종목합산: 종목 선택 시 추가 보유 종목 토글 노출.
  it("sports 종목 선택 시 추가 보유 종목 토글 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "sports" as const, nblOtherSportsFacilityType: "soccer" };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-other-sports-extra-baseball")).toBeTruthy();
  });

  // F2 Phase B(B-2) — 실내 부속토지: 실내 종목 선택 시 실내 시설 바닥면적 입력 노출.
  it("sports 실내 종목(수영) 선택 시 '실내 시설 바닥면적' 입력 노출", () => {
    const asset = { ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "sports" as const, nblOtherSportsFacilityType: "swimming" };
    render(<OtherLandDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(screen.getByText(/실내 시설 바닥면적/)).toBeTruthy();
  });
});
