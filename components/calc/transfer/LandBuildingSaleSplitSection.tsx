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
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { TransferStdPriceCard } from "./TransferStdPriceCards";
import { SaleAppraisalBasisCard, SaleSplitExemptionCard } from "./SaleSplitBasisExemptionCards";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const SALE_MODE_OPTIONS: RadioCardOption<"actual" | "apportioned">[] = [
  { value: "actual", label: "구분양도 (직접입력)" },
  { value: "apportioned", label: "일괄양도 (양도시 기준시가 안분)" },
];

interface Props {
  /** 부담부증여(§159 자동 산정) — 양도가액을 직접 입력하지 않는다(안내만 표시) */
  isBurdenedGift?: boolean;

  saleSplitMode: "actual" | "apportioned";
  onSaleSplitModeChange: (v: "actual" | "apportioned") => void;

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
        <p className="text-sm font-medium leading-tight">
          이 자산의 토지·건물 양도가액 결정 방식
        </p>
        <div data-testid="sale-split-mode">
          <RadioCardGroup
            name="saleSplitMode"
            tone="amber"
            layout="inline"
            options={SALE_MODE_OPTIONS}
            value={props.saleSplitMode}
            onChange={props.onSaleSplitModeChange}
          />
        </div>
        {props.saleSplitMode === "actual" && (
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="토지 양도가액" hint="소득령 §166⑥">
              <CurrencyInput label="" value={props.landTransferPrice} onChange={props.onLandTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-land-transfer-price" />
            </FieldCard>
            <FieldCard label="건물 양도가액">
              <CurrencyInput label="" value={props.buildingTransferPrice} onChange={props.onBuildingTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-building-transfer-price" />
            </FieldCard>
          </div>
        )}
      </div>

      {/*
        순서는 **엔진 로직 순서**를 따른다(계획서 §12.3 · UI 순서 = 로직 순서 규칙):
        ① 구분 기재 여부(위 라디오) → ② 안분 basis 해석(**감정 > 기준시가** 서열) → ③ §100③ 판정 → ④ 예외.
        감정평가가액이 기준시가보다 위에 오는 것은 서열 그대로다.
      */}
      {props.asset && props.onAssetChange && (
        <SaleAppraisalBasisCard asset={props.asset} onChange={props.onAssetChange} />
      )}

      {props.showStdCard && props.asset && props.onAssetChange && (
        <TransferStdPriceCard
          asset={props.asset}
          onChange={props.onAssetChange}
          transferDate={props.transferDate}
        />
      )}

      {props.saleSplitMode === "actual" && props.asset && props.onAssetChange && (
        <SaleSplitExemptionCard asset={props.asset} onChange={props.onAssetChange} />
      )}
    </div>
  );
}
