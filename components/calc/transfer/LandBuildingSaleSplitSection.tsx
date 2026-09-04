"use client";

/**
 * 축 A — 이 자산의 토지·건물 **양도가액** 결정 섹션 (소득세법 시행령 §166⑥)
 *
 * `LandBuildingSplitSection`(축 B — 취득가액 파트별)에서 분리(2026-07-29).
 *
 * **분리 이유**: 축 B는 자산 전체의 「취득가액 산정 방식」(실거래가/환산/감정/매매사례)이
 * 파트별 입력 칸의 노출을 결정하므로 그 뒤에 와야 한다(`CompanionAcqPurchaseBlock.tsx:711` 근거,
 * 2026-07-16). 반면 축 A는 그 의존이 없고, 확정 계산 규칙 순서가
 * **① 양도가액 구분 → ② 취득가액 산정**(2026-07-29 사용자 확정)이므로 축 B보다 **앞**에 온다.
 * 종전에는 한 컴포넌트라 축 A가 축 B 뒤에 밀려 역순이었다.
 *
 * **양도시 기준시가 카드는 일괄양도 전용이 됐다(2026-07-30).** 구분양도에서는 그 값이
 * 파트 환산 분모로만 쓰이므로 해당 파트 섹션(축 B)으로 이동했다 — 배치 판정은 호출부가
 * `saleStdPlacement`로 1회 계산해 `showStdCard`로 내려준다(하위 재파생 금지).
 *
 * 계획서: docs/02-design/features/transfer-split-input-flow-reorder.plan.md
 *       · docs/02-design/features/transfer-split-std-price-colocation.plan.md
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { TransferStdPriceCard } from "./TransferStdPriceCards";
import {
  SALE_SPLIT_MODE_OPTIONS,
  SALE_SPLIT_SECTION_TITLE,
  SaleAppraisalFields,
  SaleSplitCompareBasisCard,
  SaleSplitExemptionCard,
} from "./SaleSplitBasisExemptionCards";
import { saleSplitModePatch, type SaleSplitMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  /** 부담부증여(§159 자동 산정) — 양도가액을 직접 입력하지 않는다(안내만 표시) */
  isBurdenedGift?: boolean;

  saleSplitMode: SaleSplitMode;
  /**
   * 모드 전환 **patch** — 값 하나가 아니라 덩어리를 받는다 (2026-08-08).
   *
   * 전환 시 쓰지 않는 쪽 값을 함께 비워야 하는데(`saleSplitModePatch`), 모드와 정리를 나눠
   * 호출하면 뒤가 앞을 stale spread로 덮는다(`feedback_multikey_patch_stale_spread_overwrite`).
   * 호출부 3곳 모두 `onAssetChange`와 **같은 함수**를 넘기고 있어 시그니처만 넓히면 된다.
   */
  onSaleSplitModeChange: (patch: Partial<AssetForm>) => void;

  landTransferPrice: string;
  onLandTransferPriceChange: (v: string) => void;
  buildingTransferPrice: string;
  onBuildingTransferPriceChange: (v: string) => void;

  /**
   * 양도시 기준시가 카드를 이 축에 두는가 — `saleStdPlacement(...).saleAxis`.
   * **호출부가 계산해 주입**한다(`CompanionAcqPurchaseBlock`). 축 A·축 B가 각자 술어를 부르면
   * 인자가 어긋나는 순간 "같은 카드가 두 곳에 동시 노출"이 가능해진다.
   */
  showStdCard: boolean;

  asset?: AssetForm;
  onAssetChange?: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function LandBuildingSaleSplitSection(props: Props) {
  if (props.isBurdenedGift) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
        <p className="rounded-md bg-fuchsia-50/60 px-2.5 py-1.5 text-xs text-fuchsia-800" data-testid="split-burdened-note">
          부담부증여는 양도가액·취득가액을 <strong>§159 인수 채무액 기준으로 자동 산정</strong>하므로,
          토지·건물 각 가액은 직접 입력하지 않고 <strong>기준시가 비율로 안분</strong>됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <div className="space-y-1.5">
        {/* 제목은 일반건물 경로와 **같은 상수**를 쓴다 — 각자 두면 또 갈라진다(#1139 누락 경위는 상수 JSDoc). */}
        <p className="text-sm font-medium leading-tight">{SALE_SPLIT_SECTION_TITLE}</p>
        <div data-testid="sale-split-mode">
          <RadioCardGroup
            name="saleSplitMode"
            tone="amber"
            layout="inline"
            options={SALE_SPLIT_MODE_OPTIONS}
            value={props.saleSplitMode}
            onChange={(v) => props.onSaleSplitModeChange(saleSplitModePatch(v) as Partial<AssetForm>)}
          />
        </div>
        {props.saleSplitMode === "actual" && (
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="토지 양도가액">
              <CurrencyInput label="" value={props.landTransferPrice} onChange={props.onLandTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-land-transfer-price" />
            </FieldCard>
            <FieldCard label="건물 양도가액">
              <CurrencyInput label="" value={props.buildingTransferPrice} onChange={props.onBuildingTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-building-transfer-price" />
            </FieldCard>
          </div>
        )}
      </div>

      {/*
        ── 감정평가가액은 이제 **라디오의 한 선택지**다 (2026-08-08 · 일반건물과 통합) ──

        종전에는 라디오(일괄/구분) 밖에 「감정평가가액으로 안분」 토글이 따로 있어, 「일괄양도
        (양도시 **기준시가 안분**)」을 고른 채 토글을 켜면 실제로는 감정평가액으로 안분되는
        **라벨-동작 모순**이 있었다(`sale-split-apportion-basis.ts`의 부가령 §64① 서열).
        안분 basis는 축 하나이므로 선택지로 흡수했다.

        구분양도에서는 감정평가액이 basis가 아니라 §100③ **30% 판정의 비교 대상**이므로,
        그쪽 입력 경로는 아래 전용 카드로 남는다.
      */}
      {props.saleSplitMode === "appraisal" && props.asset && props.onAssetChange && (
        <div data-testid="sale-appraisal-basis">
          <SaleAppraisalFields asset={props.asset} onChange={props.onAssetChange} />
        </div>
      )}

      {props.showStdCard && props.asset && props.onAssetChange && (
        <TransferStdPriceCard
          asset={props.asset}
          onChange={props.onAssetChange}
          transferDate={props.transferDate}
        />
      )}

      {props.saleSplitMode === "actual" && props.asset && props.onAssetChange && (
        <>
          <SaleSplitExemptionCard asset={props.asset} onChange={props.onAssetChange} />
          {/* 30% 판정의 비교 대상 — 일반건물 경로와 공유한다(§100③ · 부가령 §64① 서열). */}
          <SaleSplitCompareBasisCard asset={props.asset} onChange={props.onAssetChange} />
        </>
      )}
    </div>
  );
}
