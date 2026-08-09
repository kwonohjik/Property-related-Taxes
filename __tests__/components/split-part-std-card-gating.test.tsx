/**
 * anchor: 별개취득 축 B — 파트별 취득시 기준시가 카드 노출 게이트 (§99①1호 가목·나목).
 *
 * 계획서: docs/02-design/features/transfer-split-part-std-card-gating.plan.md
 *
 * 🔴 D1: 파트 카드 게이트(`LandBuildingSplitSection.tsx:253-258`)에 **취득 모드가 없다** —
 *   양쪽 실지거래가액이면 취득시 기준시가는 계산 어디에도 등장하지 않는데(`requiresAcqStdPrice` false)
 *   카드가 계속 노출된다. 같은 값을 받는 자산 전체 블록은 이미 술어로 게이팅돼 있어 **서로 모순**이다.
 * 🔴 D2: 주택 역산 안내가 "위 취득시 기준시가에서 뺀 값"이라 하는데 그 블록이 숨겨져 dangling.
 * 🔴 D3: 환산 안내가 "**아래** 양도시 기준시가"라 하나 실제 축 A는 **위**(2026-07-29 축 A 분리 이동 드리프트).
 * 🔴 D6: `selfOwns="building_only"`면 토지 카드가 소유 게이트에 갇혀 렌더되지 않는데,
 *   주택 건물분은 `결합 총액 − 토지분` 역산이라 토지분이 필요 → 입력 칸 없는 `TaxCalculationError`.
 *
 * 불변식:
 *   · 카드 노출 = `requiresAcqStdPrice` 술어 (엔진·validate와 **단일 소스**)
 *   · 자산 전체 블록 ↔ 파트 카드는 **항상 동시** 노출/숨김 (non-PHD·non-겸용·non-상가 한정)
 *   · 소유 여부 ≠ 계산 입력 필요 여부 — 비소유 토지라도 역산 소스로 필요하면 렌더
 *   · 숨겨도 **값은 지우지 않는다**
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

type Init = Partial<AssetForm> & { useEstimatedAcquisition?: boolean };

function Harness({ init = {}, onAsset }: { init?: Init; onAsset?: (a: AssetForm) => void }) {
  const { useEstimatedAcquisition = false, ...assetInit } = init;
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2025-08-29",
    landAcquisitionDate: "2015-01-08",
    hasSeperateLandAcquisitionDate: true,
    addressJibun: "서울특별시 강남구 삼성동 100",
    ...assetInit,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) =>
    setAsset((a) => {
      const next = { ...a, ...p };
      onAsset?.(next);
      return next;
    });
  return (
    <CompanionAcqPurchaseBlock
      acquisitionDate={asset.acquisitionDate}
      onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
      useEstimatedAcquisition={useEstimatedAcquisition}
      onUseEstimatedChange={() => {}}
      fixedAcquisitionPrice={asset.fixedAcquisitionPrice ?? ""}
      onFixedAcquisitionPriceChange={(v) => patch({ fixedAcquisitionPrice: v })}
      standardPriceAtAcq={asset.standardPriceAtAcq ?? ""}
      onStandardPriceAtAcqChange={(v) => patch({ standardPriceAtAcq: v })}
      standardPriceAtTransfer={asset.standardPriceAtTransfer ?? ""}
      onStandardPriceAtTransferChange={(v) => patch({ standardPriceAtTransfer: v })}
      standardPricePerSqmAtAcq={asset.standardPricePerSqmAtAcq ?? ""}
      onStandardPricePerSqmAtAcqChange={(v) => patch({ standardPricePerSqmAtAcq: v })}
      assetKind={asset.assetKind}
      transferDate="2026-03-06"
      jibun={asset.addressJibun}
      acquisitionArea={asset.acquisitionArea}
      onAcquisitionAreaChange={(v) => patch({ acquisitionArea: v })}
      hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
      onHasSeperateLandAcquisitionDateChange={(v) => patch({ hasSeperateLandAcquisitionDate: v })}
      landAcquisitionDate={asset.landAcquisitionDate}
      onLandAcquisitionDateChange={(v) => patch({ landAcquisitionDate: v })}
      selfOwns={asset.selfOwns ?? "both"}
      onSelfOwnsChange={(v) => patch({ selfOwns: v })}
      landTransferPrice={asset.landTransferPrice ?? ""}
      onLandTransferPriceChange={(v) => patch({ landTransferPrice: v })}
      buildingTransferPrice={asset.buildingTransferPrice ?? ""}
      onBuildingTransferPriceChange={(v) => patch({ buildingTransferPrice: v })}
      landAcquisitionPrice={asset.landAcquisitionPrice ?? ""}
      onLandAcquisitionPriceChange={(v) => patch({ landAcquisitionPrice: v })}
      buildingAcquisitionPrice={asset.buildingAcquisitionPrice ?? ""}
      onBuildingAcquisitionPriceChange={(v) => patch({ buildingAcquisitionPrice: v })}
      landStandardPriceAtTransfer={asset.landStandardPriceAtTransfer ?? ""}
      onLandStandardPriceAtTransferChange={(v) => patch({ landStandardPriceAtTransfer: v })}
      buildingStandardPriceAtTransfer={asset.buildingStandardPriceAtTransfer ?? ""}
      onBuildingStandardPriceAtTransferChange={(v) => patch({ buildingStandardPriceAtTransfer: v })}
      landDirectExpenses={asset.landDirectExpenses ?? ""}
      onLandDirectExpensesChange={(v) => patch({ landDirectExpenses: v })}
      buildingDirectExpenses={asset.buildingDirectExpenses ?? ""}
      onBuildingDirectExpensesChange={(v) => patch({ buildingDirectExpenses: v })}
      asset={asset}
      onAssetChange={patch}
    />
  );
}

// ── 셀렉터 (신설 testid — 카드 wrapper. 내부 input으로 대리 판정하면 거짓 통과) ──
const landCard = () => screen.queryAllByTestId("split-land-std-acq-card");
const buildingCard = () => screen.queryAllByTestId("split-building-std-acq-card");
const derivedNote = () => screen.queryAllByTestId("split-housing-building-derived-note");
const areaInput = () => screen.queryAllByTestId("split-land-std-acq-area");
const assetTotalBlock = () => screen.queryAllByText(/^취득시 기준시가 \(원\)/);
const landModeRadio = () => screen.queryAllByTestId("part-acq-mode-land");
const estimatedNote = (part: "land" | "building") =>
  screen.queryAllByTestId(`split-${part}-estimated-note`);

/** 양쪽 실지거래가액 + 구분양도 가액 입력 有 → 취득시 기준시가 불요 (매트릭스 #1) */
const ACTUAL_SPLIT_SALE: Init = {
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "240000000",
  buildingAcquisitionPrice: "60000000",
  saleSplitMode: "actual",
  landTransferPrice: "400000000",
  buildingTransferPrice: "100000000",
};

/** 첨부화면 재현: 일괄양도 + 양도시 기준시가 2필드 有 → hasSaleRatio true → 불요 (매트릭스 #2) */
const ACTUAL_APPORTIONED: Init = {
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "150000000",
  buildingAcquisitionPrice: "100000000",
  saleSplitMode: "apportioned",
  landStandardPriceAtTransfer: "111564000",
  buildingStandardPriceAtTransfer: "100835280",
};

describe("G1·G2 — 실가/실가에서 파트 카드 숨김 (D1)", () => {
  it("G1 매트릭스 #2 (첨부화면: 주택·일괄양도·실가/실가·양도시 2필드 有)", () => {
    render(<Harness init={ACTUAL_APPORTIONED} />);
    expect(landCard(), "취득시 기준시가는 환산해야 할 때만 필요하다(§99①1호 가목)").toHaveLength(0);
    expect(derivedNote(), "가리킬 대상이 없는 안내는 dangling reference(D2)").toHaveLength(0);
  });

  it("G2 매트릭스 #1 (주택·구분양도·실가/실가)", () => {
    render(<Harness init={ACTUAL_SPLIT_SALE} />);
    expect(landCard()).toHaveLength(0);
  });
});

describe("G3·G4·G6 — 필요한 경우는 종전대로 노출 (회귀 0)", () => {
  /**
   * ⚠️ **기대값 반전 (2026-07-30 — 술어 ⑤절 폐지)**.
   * 종전에는 "양도시 기준시가가 없으면 취득시 비율이 유일한 도출 수단"이라 카드를 띄웠다.
   * 그러나 엔진의 양도가액 축은 2026-07-29부터 취득시 비율로 후퇴하지 않는다
   * (`effectiveSaleLandRatio = saleRatio?.land ?? null`) — 계산에 쓰이지 않는 값을 요구하던
   * **거짓 요구**였다. 이 조합은 validate V7(일괄양도 양도시 기준시가 필수)이 차단한다.
   */
  it("G3 매트릭스 #3 (일괄양도 + 양도시 기준시가 미입력) — 취득시 카드는 뜨지 않는다", () => {
    render(
      <Harness init={{ ...ACTUAL_APPORTIONED, landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" }} />,
    );
    expect(
      landCard(),
      "양도가액을 나누지 못하는 문제이지 취득시 기준시가가 필요한 것이 아니다",
    ).toHaveLength(0);
  });

  it("G4 매트릭스 #5 (주택·토지 실가 / 건물 환산) — 파트 독립 (2026-07-30)", () => {
    render(<Harness init={{ ...ACTUAL_SPLIT_SALE, buildingAcqMode: "estimated" }} />);
    expect(landCard(), "토지분은 안분·환산 분자의 소스").toHaveLength(1);
    expect(
      buildingCard(),
      "별개취득에는 라목 결합 공시가 없어 건물분도 파트 독립 입력이다(§163⑥2호가목 «취득당시»)",
    ).toHaveLength(1);
    expect(derivedNote(), "역산 안내는 폐지 — 더 이상 역산하지 않는다").toHaveLength(0);
  });

  it("G6 매트릭스 #9 (일반건물·토지 환산 / 건물 실가)", () => {
    render(<Harness init={{ ...ACTUAL_SPLIT_SALE, assetKind: "building", landAcqMode: "estimated" }} />);
    expect(landCard()).toHaveLength(1);
    // 2026-07-30 파트별 게이팅 — 건물이 실거래가면 건물분 기준시가는 계산 어디에도 등장하지
    // 않는다(개산공제 base·환산 분자 모두 파트 자기 모드 게이트). 구분양도 + 양도가액 직접입력이라
    // 안분 비율도 소비되지 않으므로 요구할 근거가 없다. 종전 주석의 "결합 총액 역산 후퇴" 우려는
    // 별개취득에서 총액 전송이 차단되어(transfer-tax-api-split.ts) 성립하지 않는다.
    expect(buildingCard(), "실가 파트의 기준시가는 요구하지 않는다").toHaveLength(0);
  });

  // G6′(일괄양도 + 양도가액·양도시 기준시가 미입력 → 건물분도 필요)는 **폐지**한다 —
  // 그 케이스를 true로 만들던 술어 ⑤절이 2026-07-30에 제거됐다(거짓 요구).
  // 안분 비율이 실제로 소비되는 경로(2절 — 비-별개취득 + 파트 취득가액 2칸 미입력)는
  // `__tests__/calc/acq-std-predicate-sale-clause-removal.test.ts`가 커버한다.
});

describe("G5 — 일반건물 실가/실가는 두 카드 모두 숨김 (D1)", () => {
  it("G5 매트릭스 #8", () => {
    render(<Harness init={{ ...ACTUAL_SPLIT_SALE, assetKind: "building" }} />);
    expect(landCard()).toHaveLength(0);
    expect(buildingCard()).toHaveLength(0);
  });
});

describe("G7 — 별개취득이면 자산 전체 블록은 **항상** 숨김 (2026-07-30 불변식)", () => {
  /**
   * 종전 불변식은 "자산 전체 블록 ↔ 파트 카드 **동시** 노출/숨김"이었다. 그 시절에는 자산 전체가
   * 읽기 전용 파생 패널로 남아 있어 두 블록이 같은 게이트를 공유했다.
   * 이제 별개취득에서는 자산 전체 UI가 **조건 없이 0개**이고, 파트 카드만 파트별 술어로 갈린다
   * (계획서 transfer-split-acq-std-part-gating.plan.md §2).
   */
  it.each([
    ["파트 카드 숨김", ACTUAL_APPORTIONED],
    ["파트 카드 노출", { ...ACTUAL_APPORTIONED, landAcqMode: "estimated" as const }],
  ])("G7 %s 케이스에서도 자산 전체 블록은 0개", (_label, init) => {
    render(<Harness init={init} />);
    expect(assetTotalBlock()).toHaveLength(0);
  });
});

describe("G9 — 값 보존 (숨겨도 지우지 않는다)", () => {
  it("G9 환산 → 실가(숨김) → 환산 복귀 시 입력값 잔존", () => {
    let latest: AssetForm | undefined;
    const { rerender } = render(
      <Harness
        init={{ ...ACTUAL_SPLIT_SALE, landAcqMode: "estimated", standardPricePerSqmAtAcq: "540000", acquisitionArea: "206.6" }}
        onAsset={(a) => { latest = a; }}
      />,
    );
    expect(landCard()).toHaveLength(1);

    // 실가로 전환 → 카드 숨김
    cleanup();
    render(
      <Harness
        init={{ ...ACTUAL_SPLIT_SALE, landAcqMode: "actual", standardPricePerSqmAtAcq: "540000", acquisitionArea: "206.6" }}
        onAsset={(a) => { latest = a; }}
      />,
    );
    expect(landCard()).toHaveLength(0);

    // 환산 복귀 → 값이 그대로 살아 있어야 한다
    cleanup();
    render(
      <Harness
        init={{ ...ACTUAL_SPLIT_SALE, landAcqMode: "estimated", standardPricePerSqmAtAcq: "540000", acquisitionArea: "206.6" }}
      />,
    );
    expect(landCard()).toHaveLength(1);
    expect((areaInput()[0] as HTMLInputElement).value).toBe("206.6");
    void latest;
    void rerender;
    void fireEvent;
  });
});

describe("G8 — 환산 안내 문구 방향 (D3)", () => {
  it("G8-a '아래 양도시' 문구가 없다", () => {
    render(<Harness init={{ ...ACTUAL_SPLIT_SALE, landAcqMode: "estimated" }} />);
    expect(
      screen.queryAllByText(/아래 양도시 기준시가/),
      "축 A는 2026-07-29에 앞으로 옮겨졌다 — '아래'는 드리프트",
    ).toHaveLength(0);
  });

  /**
   * 🔴 2026-08-06 (Phase 1-D) — 배치가 「항상 축 A」로 불변이 되어 **안내 문구도 축 A를 가리킨다.**
   *
   * 2026-07-30 배치에서는 구분양도 + 파트 환산이면 카드가 그 파트 섹션에 있었으므로 안내가
   * 「토지 양도시 기준시가」를 가리켰다. §100③ 판정이 양쪽 기준시가를 요구하면서 카드가 축 A로
   * 통합됐고, 안내는 **컴포넌트가 배치에서 파생**하므로 자동으로 따라왔다(하드코딩 아님).
   * ⇒ 이제 구분양도·일괄양도 문구가 같다(아래 G8-e와 동일).
   */
  it("G8-b 구분양도+환산 — 안내가 축 A 「양도시 기준시가」 카드를 가리킨다", () => {
    render(<Harness init={{ ...ACTUAL_SPLIT_SALE, landAcqMode: "estimated" }} />);
    const note = estimatedNote("land")[0];
    expect(note, "testid 없이 텍스트 매칭하면 양쪽 환산 시 2개가 되어 strict 위반").toBeTruthy();
    expect(note.textContent).toMatch(/위 「양도시 기준시가」 카드\(양도가액 토지·건물 안분 방식 아래\)/);
  });

  it("G8-e 일괄양도 — 안내가 축 A 「양도시 기준시가」 카드를 가리킨다", () => {
    render(<Harness init={{ ...ACTUAL_APPORTIONED, landAcqMode: "estimated" }} />);
    const note = estimatedNote("land")[0];
    expect(note).toBeTruthy();
    expect(note.textContent).toMatch(/위 「양도시 기준시가」 카드\(양도가액 토지·건물 안분 방식 아래\)/);
  });

  it("G8-c DOM 순서 — 축 A와 취득시 카드가 모두 안내보다 앞", () => {
    render(<Harness init={{ ...ACTUAL_SPLIT_SALE, landAcqMode: "estimated" }} />);
    const note = estimatedNote("land")[0];
    const saleAxis = screen.getByTestId("sale-split-mode");
    const acqCard = landCard()[0];
    expect(
      note.compareDocumentPosition(saleAxis) & Node.DOCUMENT_POSITION_PRECEDING,
      "문자열만 고정하면 다음 재배치 때 같은 드리프트가 재발한다",
    ).toBeTruthy();
    expect(note.compareDocumentPosition(acqCard) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("G8-d 주택 건물 파트도 실재하는 카드를 가리킨다 (2026-07-30 파트 독립)", () => {
    render(<Harness init={{ ...ACTUAL_SPLIT_SALE, buildingAcqMode: "estimated" }} />);
    expect(buildingCard(), "주택도 건물분 카드를 노출한다").toHaveLength(1);
    const note = estimatedNote("building")[0];
    expect(note).toBeTruthy();
    expect(
      note.textContent,
      "카드가 실재하므로 dangling reference가 아니다 — 역산 서술은 폐지",
    ).toMatch(/위 「건물 취득시 기준시가」 카드/);
  });
});

describe("G12 — 면적 칸도 함께 숨김 (0단계 probe: 소비처 전부 미도달)", () => {
  it("G12-a 실가/실가에서 면적 칸 0", () => {
    render(<Harness init={ACTUAL_APPORTIONED} />);
    expect(areaInput()).toHaveLength(0);
  });

  it("G12-b 상속 취득으로 전환하면 복귀 (경로 소멸 고착 아님)", () => {
    render(<Harness init={{ ...ACTUAL_SPLIT_SALE, landAcqMode: "estimated" }} />);
    expect(areaInput()).toHaveLength(1);
  });
});

describe("G13 — PHD 양쪽 환산은 카드 대신 안내 (매트릭스 #14)", () => {
  const PHD: Init = {
    usePreHousingDisclosure: true,
    acquisitionDate: "2003-05-01",
    saleSplitMode: "apportioned",
    landStandardPriceAtTransfer: "111564000",
    buildingStandardPriceAtTransfer: "100835280",
  };

  it("G13-a 양쪽 환산 → 파트 카드 0 (엔진이 §164⑤ 경로로 early-return)", () => {
    render(<Harness init={{ ...PHD, landAcqMode: "estimated", buildingAcqMode: "estimated" }} />);
    expect(landCard(), "calcSplitGainPreDisclosure는 calcAcqStdPair에 도달하지 않는다").toHaveLength(0);
  });

  it("G13-b 한쪽만 환산 → 카드 1 (early-return 미발동)", () => {
    render(
      <Harness
        init={{ ...PHD, landAcqMode: "estimated", buildingAcqMode: "actual", buildingAcquisitionPrice: "60000000" }}
      />,
    );
    expect(landCard()).toHaveLength(1);
  });
});

describe("G14~G17 — building_only 역산 소스 (D6)", () => {
  const BUILDING_ONLY: Init = {
    selfOwns: "building_only",
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    saleSplitMode: "apportioned",
    landStandardPriceAtTransfer: "111564000",
    buildingStandardPriceAtTransfer: "100835280",
  };

  it("G14 주택 — 토지 카드·면적 노출, 토지 취득가액 라디오는 미노출", () => {
    render(<Harness init={BUILDING_ONLY} />);
    expect(landCard(), "주택 건물분은 결합 총액 − 토지분 역산 — 토지분 없으면 엔진 throw").toHaveLength(1);
    expect(areaInput()).toHaveLength(1);
    expect(landModeRadio(), "토지 gain은 폐기되므로 취득가액 입력을 요구하면 거짓 요구").toHaveLength(0);
  });

  it("G15 일반건물 — 토지·건물 카드 모두 노출", () => {
    render(<Harness init={{ ...BUILDING_ONLY, assetKind: "building" }} />);
    expect(landCard()).toHaveLength(1);
    expect(buildingCard()).toHaveLength(1);
  });

  it("G16 both·land_only는 종전 배치 유지 — 카드 중복 렌더 0", () => {
    render(<Harness init={{ ...BUILDING_ONLY, selfOwns: "both" }} />);
    expect(landCard(), "landOwned/!landOwned 배타 분기 — 2개면 testid strict 위반").toHaveLength(1);
    cleanup();
    render(<Harness init={{ ...BUILDING_ONLY, selfOwns: "land_only" }} />);
    expect(landCard()).toHaveLength(1);
  });

  it("G17 building_only + 실가/실가 → 토지 카드 0 (D6 해소가 D1 게이트를 무력화하지 않는다)", () => {
    render(
      <Harness
        init={{
          ...BUILDING_ONLY,
          landAcqMode: "actual",
          buildingAcqMode: "actual",
          buildingAcquisitionPrice: "100000000",
        }}
      />,
    );
    expect(landCard()).toHaveLength(0);
  });
});
