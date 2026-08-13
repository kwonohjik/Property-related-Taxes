/**
 * @vitest-environment jsdom
 *
 * anchor: 일반건물 증축 **4조합** UI 축 — 라디오·게이트·결과 배지
 *
 * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md` §6 Q-1 · §4 D-4~D-9
 *
 * ## 고정 계약
 *
 *   U1. 일반건물 「취득가액 산정 방식」은 **2옵션**이다 (「토지·건물 일괄 (증축분 별도)」 제거)
 *   U2. 증축 토글은 **취득가액 산정 방식과 무관하게** 항상 보인다 (dead-end 금지)
 *   U3. 원건물 실가 + 증축이면 취득가액 라벨이 「토지·원건물 일괄 취득가액 (증축분 제외)」 —
 *       **증축분 방식(실가/환산)과 무관**하다
 *   U4. 같은 조건에서 「토지·원건물 일괄 취득 시 필요경비」 칸이 열린다
 *   U5. 결과 표 배지는 카드의 `usedEstimatedAcquisition`에서 파생된다 (하드코딩 금지)
 *
 * ⚠️ **대조군 쌍으로 읽을 것** — 조합 A만 통과하는 것은 구별력이 없다. 그것이 종전 결함의 모양이었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

afterEach(cleanup);

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-06-01",
    gbLandArea: "200",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "100",
    ...over,
  } as AssetForm;
}

/** `CompanionAcqPurchaseBlock`의 필수 props를 최소로 채운다. */
function renderAcqBlock(
  asset: AssetForm,
  opts: { shareAcquisitionOnly?: boolean; onAssetChange?: (p: Partial<AssetForm>) => void } = {},
) {
  return render(
    <CompanionAcqPurchaseBlock
      assetKind="general_building"
      asset={asset}
      onAssetChange={opts.onAssetChange ?? (() => {})}
      acquisitionDate={asset.acquisitionDate}
      onAcquisitionDateChange={() => {}}
      useEstimatedAcquisition={!!asset.useEstimatedAcquisition}
      onUseEstimatedChange={() => {}}
      isAppraisalAcquisition={asset.isAppraisalAcquisition}
      onIsAppraisalAcquisitionChange={() => {}}
      gbHasExtension={asset.gbHasExtension}
      fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
      onFixedAcquisitionPriceChange={() => {}}
      standardPriceAtAcq={asset.standardPriceAtAcq}
      onStandardPriceAtAcqChange={() => {}}
      standardPriceAtTransfer={asset.standardPriceAtTransfer}
      onStandardPriceAtTransferChange={() => {}}
      transferDate="2024-06-01"
    />,
  );
}

// ── U1 · 라디오 2옵션 ───────────────────────────────────────────────────

describe("U1 — 일반건물 취득가액 산정 방식은 2옵션이다", () => {
  it("「토지·건물 일괄 (증축분 별도)」 옵션이 없다", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false }));
    expect(screen.queryByText("토지·건물 일괄 (증축분 별도)")).toBeNull();
  });

  it("실거래가·환산취득가 두 옵션은 있다 (대조군 — 컴포넌트가 렌더되긴 했다)", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false }));
    expect(screen.getByText("실거래가")).toBeInTheDocument();
    expect(screen.getByText("환산취득가")).toBeInTheDocument();
  });
});

// ── U2 · 증축 토글 진입점 ───────────────────────────────────────────────

/**
 * 🔀 **토글은 `GeneralBuildingAcquisitionCards` 최상단에 있다** (2026-08-12 재배치).
 *
 * 종전에는 두 곳에 있었다 — 취득가액 라디오 직후(`CompanionAcqPurchaseBlock`)와
 * 상세 카드(`GeneralBuildingExtensionSection`)의 스위치. 그런데 앞의 것은 **매매 취득
 * 전용 블록**이고 분리 ON에서도 숨겨져, 6경로 중 매매·분리OFF 1곳에서만 보였다.
 * 결과: 그 1곳에서만 토글이 둘로 보이고, 나머지 5경로는 상세 카드 스위치가 유일 진입점.
 *
 * ⇒ 모든 취득원인이 공유하는 자리로 올리고 상세 카드의 스위치는 없앴다.
 *   아래 `U2b`가 **6경로 전수**를 고정한다 — 하나라도 빠지면 그 경로에서 증축이 dead-end다
 *   (`feedback_ui_gate_removes_sole_input_path`).
 */
const EXT_TOGGLE = "증축한 부분이 있음";

function renderCards(over: Partial<AssetForm> = {}, props: { shareAcquisitionOnly?: boolean } = {}) {
  return render(
    <GeneralBuildingAcquisitionCards
      asset={gbAsset(over)}
      onChange={() => {}}
      transferDate="2024-06-01"
      shareAcquisitionOnly={props.shareAcquisitionOnly}
    />,
  );
}

describe("U2 — 증축 토글은 취득가액 산정 방식과 무관하게 보인다", () => {
  const cases: Array<[string, Partial<AssetForm>]> = [
    ["실거래가 · 증축 OFF (종전에 dead-end였던 조합)", { useEstimatedAcquisition: false }],
    ["환산취득가 · 증축 OFF", { useEstimatedAcquisition: true }],
    ["실거래가 · 증축 ON", { useEstimatedAcquisition: false, gbHasExtension: true }],
    ["환산취득가 · 증축 ON", { useEstimatedAcquisition: true, gbHasExtension: true }],
  ];

  for (const [label, over] of cases) {
    it(label, () => {
      renderCards(over);
      expect(screen.getByText(EXT_TOGGLE)).toBeInTheDocument();
    });
  }

  it("부담부증여에서는 숨긴다 (§159 자동 산정 — 비스코프)", () => {
    renderCards({ transferType: "burdened_gift" } as Partial<AssetForm>);
    expect(screen.queryByText(EXT_TOGGLE)).toBeNull();
  });

  it("지분 카드에서는 숨긴다 (물건 사건 — 중복 입력 금지)", () => {
    renderCards({ gbHasExtension: true }, { shareAcquisitionOnly: true });
    expect(screen.queryByText(EXT_TOGGLE)).toBeNull();
  });
});

/**
 * 🔑 **이 재배치의 존재 이유**. 종전 실측(2026-08-12):
 *   매매·분리OFF ✅ / 매매·분리ON ❌ / 상속 ❌ / 증여 ❌ / 신축 ❌ / 이월과세 ❌
 * 한 경로라도 false로 돌아가면 그 경로에서 증축을 켤 방법이 사라진다.
 */
describe("U2b — 취득원인·분리 6경로 **전수**에서 토글이 보인다", () => {
  const paths: Array<[string, Partial<AssetForm>]> = [
    ["매매 · 분리OFF", { acquisitionCause: "purchase" }],
    ["매매 · 분리ON", {
      acquisitionCause: "purchase",
      hasSeperateLandAcquisitionDate: true,
      gbBuildingAcquisitionCause: "purchase",
    }],
    ["상속", { acquisitionCause: "inheritance" }],
    ["증여", { acquisitionCause: "gift" }],
    ["신축(자가건축)", { acquisitionCause: "newConstruction" }],
    ["이월과세(증여)", { acquisitionCause: "carryover_gift" }],
  ];

  for (const [label, over] of paths) {
    it(label, () => {
      renderCards(over as Partial<AssetForm>);
      expect(screen.getByText(EXT_TOGGLE)).toBeInTheDocument();
    });
  }
});

// ── U3 · U4 · 취득가액 칸의 성격 ────────────────────────────────────────

describe("U3 — 취득가액 라벨은 증축분 방식과 무관하다", () => {
  it("원건물 실가 + 증축 **환산** → 「토지·원건물 일괄 취득가액 (증축분 제외)」", () => {
    renderAcqBlock(
      gbAsset({
        useEstimatedAcquisition: false,
        gbHasExtension: true,
        gbExtensionAcquisitionMode: "estimated",
      }),
    );
    expect(screen.getByText(/토지·원건물 일괄 취득가액/)).toBeInTheDocument();
  });

  it("🔴 원건물 실가 + 증축 **실가** → 같은 라벨 (종전에는 「취득가액」으로 떨어졌다)", () => {
    renderAcqBlock(
      gbAsset({
        useEstimatedAcquisition: false,
        gbHasExtension: true,
        gbExtensionAcquisitionMode: "actual",
      }),
    );
    expect(screen.getByText(/토지·원건물 일괄 취득가액/)).toBeInTheDocument();
  });

  it("증축이 없으면 일반 라벨이다 (대조군)", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false, gbHasExtension: false }));
    expect(screen.queryByText(/토지·원건물 일괄 취득가액/)).toBeNull();
  });
});

describe("U4 — 일괄 필요경비 칸도 증축분 방식과 무관하게 열린다", () => {
  for (const mode of ["estimated", "actual"] as const) {
    it(`원건물 실가 + 증축 ${mode === "actual" ? "실가" : "환산"}`, () => {
      renderAcqBlock(
        gbAsset({
          useEstimatedAcquisition: false,
          gbHasExtension: true,
          gbExtensionAcquisitionMode: mode,
        }),
      );
      expect(screen.getByText(/토지·원건물 일괄 취득 시 필요경비/)).toBeInTheDocument();
    });
  }

  it("증축이 없으면 열리지 않는다 (대조군)", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false, gbHasExtension: false }));
    expect(screen.queryByText(/토지·원건물 일괄 취득 시 필요경비/)).toBeNull();
  });
});

// ── U6~U9 · 증축 유무를 **취득가액 칸 앞에서** 묻는다 (2026-08-12 UX 정정) ──

/**
 * 🔴 **혼동의 구조적 원인**: `gbHasExtension`이 바로 아래 취득가액 칸의 라벨·hint·「일괄
 * 필요경비」 칸 존재를 모두 가르는데, 유일한 쓰기 지점이 ②건물 기준시가 **뒤**의
 * 「증축 있음」 토글이었다 ⇒ 사용자가 그 칸을 채우는 시점에 증축 개념이 화면에 없어
 * **증축 포함 총액**을 넣게 됐다(CLAUDE.md 「모드 토글은 영향 필드 직전」 위반).
 *
 * 두 토글은 같은 필드를 양방향 read/write한다 — 별도 필드 신설·`useEffect` 미러링 금지.
 */
describe("U6 — 증축 유무 토글이 취득가액 칸보다 **앞**에 온다", () => {
  it("DOM 순서: 토글 → 취득가액 입력 (매매 경로 — 두 요소가 한 트리에 있다)", () => {
    const { container } = renderCards({ acquisitionCause: "purchase", useEstimatedAcquisition: false });
    const toggle = screen.getByText(EXT_TOGGLE);
    const price = container.querySelector('[data-testid="fixed-acquisition-price"]');
    expect(price).not.toBeNull();
    /* 순서 비교는 문자열 위치가 아니라 DOM 관계로 — `DOCUMENT_POSITION_FOLLOWING`(4)이
       서면 toggle이 price보다 앞이다. 마크업이 바뀌어도 「앞」의 의미는 유지된다.
       (역방향이 거짓·포함관계가 아님은 2026-08-12 probe로 실측했다.) */
    expect(
      toggle.compareDocumentPosition(price!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("토글을 켜면 `gbHasExtension`을 쓴다", () => {
    const patches: Array<Partial<AssetForm>> = [];
    render(
      <GeneralBuildingAcquisitionCards
        asset={gbAsset({ acquisitionCause: "purchase" })}
        onChange={(p) => patches.push(p)}
        transferDate="2024-06-01"
      />,
    );
    /* 「토지·건물 취득일 다름」이 첫 스위치라 증축 토글은 두 번째다 —
       인덱스 가정이 깨지면 이 단언이 먼저 실패한다(라벨로 스코프할 수 없는 구조). */
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]);
    expect(patches).toContainEqual({ gbHasExtension: true });
  });
});

describe("U7 — 지분 카드에는 증축 유무 토글이 없다 (증축은 물건 사건)", () => {
  it("shareAcquisitionOnly면 숨는다", () => {
    renderCards({ useEstimatedAcquisition: false }, { shareAcquisitionOnly: true });
    expect(screen.queryByText(EXT_TOGGLE)).toBeNull();
  });

  it("대조군 — 첫 카드에는 있다", () => {
    renderCards({ useEstimatedAcquisition: false });
    expect(screen.getByText(EXT_TOGGLE)).toBeInTheDocument();
  });
});

/**
 * 🪤 **E2E 셀렉터 보호 — 토글 제목은 화면에 정확히 1회만 나온다.**
 *
 * 안내문이 토글 제목을 **그대로 인용**하면 그 제목으로 컨트롤을 잡는 셀렉터가 두 곳에 걸린다.
 * 🔴 실제로 밟았다(2026-08-12): 취득가액 hint에 「증축한 부분이 있음」을 인용했더니
 *    `getByText`가 2 elements로 strict mode 위반이 났다 → "위 토글을 먼저 켜세요"로 정정.
 *
 * 🔀 2026-08-12 재배치 후: 상세 카드의 스위치를 없앴으므로 「증축 있음」은 **어디에도 없다**.
 *    그 문자열이 되살아나면 종전 중복 상태로 돌아간 것이다.
 */
describe("U8 — 토글 제목 중복 금지", () => {
  const countOf = (needle: string) =>
    (document.body.textContent ?? "").split(needle).length - 1;

  it("「증축 있음」(종전 상세 카드 스위치 제목)은 이제 존재하지 않는다", () => {
    for (const on of [false, true]) {
      cleanup();
      render(
        <>
          <GeneralBuildingAcquisitionCards
            asset={gbAsset({ acquisitionCause: "purchase", gbHasExtension: on })}
            onChange={() => {}}
            transferDate="2024-06-01"
          />
          <GeneralBuildingBlock
            asset={gbAsset({ acquisitionCause: "purchase", gbHasExtension: on })}
            onChange={() => {}}
            transferDate="2024-06-01"
          />
        </>,
      );
      expect(countOf("증축 있음")).toBe(0);
    }
  });

  it("「증축한 부분이 있음」은 **정확히 1회**다 (0=소실 · 2+=중복 재발)", () => {
    for (const on of [false, true]) {
      cleanup();
      render(
        <>
          <GeneralBuildingAcquisitionCards
            asset={gbAsset({ acquisitionCause: "purchase", gbHasExtension: on })}
            onChange={() => {}}
            transferDate="2024-06-01"
          />
          <GeneralBuildingBlock
            asset={gbAsset({ acquisitionCause: "purchase", gbHasExtension: on })}
            onChange={() => {}}
            transferDate="2024-06-01"
          />
        </>,
      );
      expect(countOf(EXT_TOGGLE)).toBe(1);
    }
  });
});

/**
 * 상세 카드는 **스위치가 없는 입력 카드**다 — 켜고 끄는 주체는 위 토글 하나뿐이다.
 * 여기에 스위치가 되살아나면 매매·분리OFF에서 토글이 둘로 보이던 상태가 재발한다.
 */
describe("U8b — 증축 상세 카드에는 스위치가 없다", () => {
  it("gbHasExtension ON에서 **증축 카드 안** switch 개수 = 0", () => {
    render(
      <GeneralBuildingBlock
        asset={gbAsset({ gbHasExtension: true, useEstimatedAcquisition: true })}
        onChange={() => {}}
        transferDate="2024-06-01"
      />,
    );
    // 대조군 — 카드 자체는 렌더된다(스위치만 사라진 것이지 카드가 사라진 게 아니다)
    const title = screen.getByText("증축 정보");
    expect(title).toBeInTheDocument();

    /**
     * 🔎 **범위를 증축 카드로 좁혔다** (2026-08-13).
     *
     * 종전에는 `GeneralBuildingBlock` 전체의 switch를 셌다. 그때 이 블록에 스위치가 하나도
     * 없었기에 쓸 수 있던 **프록시**였을 뿐, 계약 자체는 헤더가 적은 대로
     * 「**증축 상세 카드**에 스위치가 없다」다(증축 토글이 둘로 보이던 중복의 재발 방지).
     *
     * §99-164-10 최초공시 토글이 같은 블록에 들어오면서(3시점 통합) 프록시가 깨졌다.
     * 그 토글은 증축과 **무관한 다른 축**이므로 계약을 약화시키지 않는다 —
     * 대신 세는 범위를 증축 카드로 정확히 좁힌다.
     */
    const extCard = title.closest("div.rounded-lg") as HTMLElement | null;
    expect(extCard).not.toBeNull();
    expect(within(extCard!).queryAllByRole("switch")).toHaveLength(0);
  });

  it("gbHasExtension OFF면 카드가 아예 없다 (렌더 게이트)", () => {
    render(
      <GeneralBuildingBlock
        asset={gbAsset({ gbHasExtension: false, useEstimatedAcquisition: true })}
        onChange={() => {}}
        transferDate="2024-06-01"
      />,
    );
    expect(screen.queryByText("증축 정보")).toBeNull();
  });
});

// ── U5 · 결과 표 배지 ───────────────────────────────────────────────────

/** 3-way 표가 요구하는 최소 형태의 `aggregated`. */
function makeAggregated(modes: {
  land: boolean;
  building1: boolean;
  building2: boolean;
}): AggregateTransferResult {
  const prop = (propertyId: string, propertyLabel: string) => ({
    propertyId,
    propertyLabel,
    isExempt: false,
    transferPrice: 100_000_000,
    acquisitionPrice: 50_000_000,
    necessaryExpense: 1_000_000,
    capitalExpenditureForDisplay: 0,
    determinedTax: 0,
    transferGain: 49_000_000,
    longTermHoldingDeduction: 0,
    income: 49_000_000,
    rateGroup: "progressive" as const,
    lossOffsetFromSameGroup: 0,
    lossOffsetFromOtherGroup: 0,
    incomeAfterOffset: 49_000_000,
    allocatedBasicDeduction: 0,
    taxBaseShare: 0,
  });
  return {
    properties: [
      prop("land", "토지(1001)"),
      prop("building1", "건물(3001)"),
      prop("building2", "증축건물(3002)"),
    ],
    generalBuildingValuationDetail: {
      assetCards: [
        { propertyId: "land", usedEstimatedAcquisition: modes.land },
        { propertyId: "building1", usedEstimatedAcquisition: modes.building1 },
        { propertyId: "building2", usedEstimatedAcquisition: modes.building2 },
      ],
    },
  } as unknown as AggregateTransferResult;
}

describe("U5 — 결과 표 배지는 카드에서 파생된다 (하드코딩 금지)", () => {
  it("조합 A(원건물 실가 + 증축 환산) — 건물2 「(환산)」·「(개산공제 §163⑥)」", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: false, building1: false, building2: true })}
      />,
    );
    expect(screen.getAllByText("(실거래가)")).toHaveLength(2); // 토지·건물1
    expect(screen.getByText("(환산)")).toBeInTheDocument(); // 건물2
    expect(screen.getByText("(개산공제 §163⑥)")).toBeInTheDocument();
  });

  it("🔴 조합 B(원건물 실가 + 증축 실가) — 건물2도 「(실거래가)」·「(실제 필요경비)」", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: false, building1: false, building2: false })}
      />,
    );
    expect(screen.getAllByText("(실거래가)")).toHaveLength(3);
    expect(screen.queryByText("(환산)")).toBeNull();
    expect(screen.getByText("(실제 필요경비)")).toBeInTheDocument();
    expect(screen.queryByText("(개산공제 §163⑥)")).toBeNull();
  });

  it("🔴 조합 C(원건물 환산 + 증축 환산) — 세 자산 모두 「(환산)」", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: true, building1: true, building2: true })}
      />,
    );
    expect(screen.getAllByText("(환산)")).toHaveLength(3);
    expect(screen.queryByText("(실거래가)")).toBeNull();
  });

  it("🔴 조합 D(원건물 환산 + 증축 실가) — 토지·건물1 환산, 건물2 실거래가", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: true, building1: true, building2: false })}
      />,
    );
    expect(screen.getAllByText("(환산)")).toHaveLength(2);
    expect(screen.getByText("(실거래가)")).toBeInTheDocument();
    expect(screen.getByText("(실제 필요경비)")).toBeInTheDocument();
  });

  it("설명문에 모드 서술이 남아 있지 않다 (「건물1(3001, 실가)」 하드코딩 제거)", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: true, building1: true, building2: false })}
      />,
    );
    expect(screen.queryByText(/건물1\(3001, 실가\)/)).toBeNull();
  });
});
