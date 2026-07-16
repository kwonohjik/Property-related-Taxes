"use client";

/**
 * 토지/건물 가액 분리 입력 섹션 (직접 입력 모드 전용)
 *
 * `hasSeperateLandAcquisitionDate === true` 이고 `landSplitMode === "actual"` 시 렌더.
 *
 * 취득가액 칸 노출은 **취득가액 산정 방식**이 결정한다(2026-07-16):
 *   실거래가·감정가액 → 노출(총액이 입력되므로 잔액 도출 성립)
 *   환산취득가        → 숨김 + 양도시 기준시가 칸(부분별 환산)
 *   매매사례가액      → 숨김 (추계액 — 토지/건물 개별 실지가액이 존재하지 않음, §166⑥)
 *   부담부증여        → 숨김 (§159 자동 산정) — `acqPriceMode`가 아니라 **transferType 축**이라 우선 판정
 *
 * 양도가액 칸은 산정 방식과 무관하게 항상 노출 — 총양도가액은 늘 입력된다.
 *
 * 미입력 시 엔진 동작(`transfer-tax-split-gain.ts` splitPair):
 *   한쪽만 입력 → 반대쪽 = 총액 − 입력값(**잔액**, 안분 아님) / 둘 다 미입력 → 기준시가 비율 안분(§166⑥).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";

/**
 * 취득가액 산정 방식 — 단일 유니온.
 * boolean 3개(useEstimated·isAppraisal·isSalesCase) 조합은 무효 상태(appraisal && salesCase 등)를
 * 표현할 수 있어 dual-truth가 된다 → 호출부에서 파생해 하나로 넘긴다.
 */
export type AcqPriceMode = "actual" | "appraisal" | "estimated" | "salesCase";

interface Props {
  acqPriceMode: AcqPriceMode;
  /** 부담부증여(§159 자동 산정) — acqPriceMode보다 우선해 취득가액 칸을 숨긴다 */
  isBurdenedGift?: boolean;
  landTransferPrice: string;
  onLandTransferPriceChange: (v: string) => void;
  buildingTransferPrice: string;
  onBuildingTransferPriceChange: (v: string) => void;
  landAcquisitionPrice: string;
  onLandAcquisitionPriceChange: (v: string) => void;
  buildingAcquisitionPrice: string;
  onBuildingAcquisitionPriceChange: (v: string) => void;
  landStandardPriceAtTransfer: string;
  onLandStandardPriceAtTransferChange: (v: string) => void;
  buildingStandardPriceAtTransfer: string;
  onBuildingStandardPriceAtTransferChange: (v: string) => void;
  landDirectExpenses: string;
  onLandDirectExpensesChange: (v: string) => void;
  buildingDirectExpenses: string;
  onBuildingDirectExpensesChange: (v: string) => void;
}

export function LandBuildingSplitSection(props: Props) {
  const isEstimated = props.acqPriceMode === "estimated";
  // 취득가액 직접 입력이 성립하려면 총액이 사용자 입력이어야 한다(잔액 = 총액 − 입력값).
  // 환산·매매사례는 총액을 엔진이 산출하고, 부담부증여는 §159가 산정한다 → 칸 숨김.
  const showAcqInputs =
    !props.isBurdenedGift && (props.acqPriceMode === "actual" || props.acqPriceMode === "appraisal");
  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        토지 / 건물 각 가액 직접 입력 — 필드별 독립 입력 가능
      </p>
      <p className="text-xs text-muted-foreground -mt-1">
        한쪽만 알면 그 칸만 입력하세요 — 나머지는 <strong>총액에서 뺀 잔액</strong>으로 자동 계산됩니다.
        둘 다 비우면 기준시가 비율로 나눕니다(소득령 §166⑥).
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §166⑥" label="§166⑥ 안분" />
      </div>

      {/* 양도가액 — 산정 방식 무관 항상 노출(총양도가액은 늘 입력된다) */}
      <div className="grid grid-cols-2 gap-2">
        <FieldCard label="토지 양도가액" hint="소득령 §166⑥">
          <CurrencyInput label="" value={props.landTransferPrice} onChange={props.onLandTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-land-transfer-price" />
        </FieldCard>
        <FieldCard label="건물 양도가액">
          <CurrencyInput label="" value={props.buildingTransferPrice} onChange={props.onBuildingTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-building-transfer-price" />
        </FieldCard>
      </div>

      {showAcqInputs && (
        <div className="grid grid-cols-2 gap-2">
          <FieldCard label="토지 취득가액">
            <CurrencyInput label="" value={props.landAcquisitionPrice} onChange={props.onLandAcquisitionPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-land-acq-price" />
          </FieldCard>
          <FieldCard label="건물 취득가액">
            <CurrencyInput label="" value={props.buildingAcquisitionPrice} onChange={props.onBuildingAcquisitionPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-building-acq-price" />
          </FieldCard>
        </div>
      )}

      {/* 매매사례가액 — 추계액이라 토지/건물 개별 실지가액이 없다(§166⑥ "구분할 수 없는 때") → 기준시가 안분 */}
      {!props.isBurdenedGift && props.acqPriceMode === "salesCase" && (
        <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground" data-testid="split-salescase-note">
          매매사례가액(추계)은 토지·건물 각각의 실지 취득가액이 존재하지 않아 <strong>기준시가 비율로 안분</strong>됩니다
          (소득령 §166⑥·§176의2③1호).
        </p>
      )}

      {/* 부담부증여 — §159가 취득가액을 자동 산정(acqPriceMode 무관·transferType 축) */}
      {props.isBurdenedGift && (
        <p className="rounded-md bg-fuchsia-50/60 px-2.5 py-1.5 text-xs text-fuchsia-800" data-testid="split-burdened-note">
          부담부증여는 취득가액을 <strong>§159로 자동 산정</strong>하므로 토지·건물 취득가액을 직접 입력하지 않습니다.
        </p>
      )}

      {isEstimated && (
        <div className="grid grid-cols-2 gap-2">
          <FieldCard label="토지 양도시 기준시가" hint="환산취득가 분리 계산용">
            <CurrencyInput label="" value={props.landStandardPriceAtTransfer} onChange={props.onLandStandardPriceAtTransferChange} placeholder="미입력 시 안분 추정" />
          </FieldCard>
          <FieldCard label="건물 양도시 기준시가">
            <CurrencyInput label="" value={props.buildingStandardPriceAtTransfer} onChange={props.onBuildingStandardPriceAtTransferChange} placeholder="미입력 시 안분 추정" />
          </FieldCard>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <FieldCard label="토지 자본적지출" hint="토지에 귀속되는 자본적지출만 입력, 없으면 비워두세요">
          <CurrencyInput label="" value={props.landDirectExpenses} onChange={props.onLandDirectExpensesChange} placeholder="없으면 비워두세요" />
        </FieldCard>
        <FieldCard label="건물 자본적지출" hint="건물에 귀속되는 자본적지출만 입력, 없으면 비워두세요">
          <CurrencyInput label="" value={props.buildingDirectExpenses} onChange={props.onBuildingDirectExpensesChange} placeholder="없으면 비워두세요" />
        </FieldCard>
      </div>
    </div>
  );
}
