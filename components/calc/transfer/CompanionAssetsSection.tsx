"use client";

import { useRef } from "react";
import { type AssetForm, type TransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { Button } from "@/components/ui/button";
import { CompanionAssetCard } from "./CompanionAssetCard";
import type { BundledSaleMode } from "./CompanionSaleModeBlock";

interface Props {
  assets: AssetForm[];
  bundledSaleMode: BundledSaleMode;
  onChange: (assets: AssetForm[]) => void;
  /** 단일 자산 모드: 첫 번째 카드에 singleMode를 전달 */
  singleMode?: boolean;
  /** 양도일 (공시가격 기준연도 자동 계산용 + ① 양도일 위젯) */
  transferDate?: string;
  /** 폼-전역 신고일 (① 신고일 위젯) */
  filingDate?: string;
  /** 신고기한 초과 여부 (Step1 산출) */
  filingOverdue?: boolean;
  /** 신고기한 문자열 (Step1 산출) */
  filingDeadline?: string;
  /** 전 자산 부담부증여 여부 (Step1 산출) */
  burdenedGiftDeadline?: boolean;
  /** 폼-전역 패치 (양도일·신고일 write — handleFormChange 경유) */
  onFormChange?: (patch: Partial<TransferFormData>) => void;
  /** 폼-수준 총 양도가액 — 지분 모드 자동 계산용 */
  contractTotalPrice?: string;
  /** 폼-수준 총 양도비 — 자산별 자동 안분 표시용 */
  totalTransferExpense?: string;
  /**
   * 1세대1주택 + householdHousingCount === 1 충족 여부 (form-전역).
   * 사례 45 — RedevelopmentBlock §⑤ 거주월수 분리 입력 카드 가시성 가드.
   */
  isOneHouseSingle?: boolean;
  /** 검증 실패 자산 인덱스 — 해당 카드에 인라인 에러 배너 표시 */
  errorAssetIndex?: number | null;
  /** 검증 실패 메시지 (errorAssetIndex 카드에 표시) */
  errorMessage?: string | null;
}

export function CompanionAssetsSection({ assets, bundledSaleMode, onChange, singleMode, transferDate, filingDate, filingOverdue, filingDeadline, burdenedGiftDeadline, onFormChange, contractTotalPrice, totalTransferExpense, isOneHouseSingle, errorAssetIndex, errorMessage }: Props) {
  // 연속된 onChange 호출에서 stale closure를 피하기 위해
  // 최신 assets를 ref로 동기 추적 (렌더링 중 동기화)
  /* eslint-disable react-hooks/refs -- props→ref 동기 sync. useEffect로 옮기면 stale closure 발생 */
  const assetsRef = useRef(assets);
  if (assetsRef.current !== assets) {
    assetsRef.current = assets;
  }
  /* eslint-enable react-hooks/refs */

  function commitAssets(next: AssetForm[]) {
    assetsRef.current = next;
    onChange(next);
  }

  function addAsset(patch?: Partial<AssetForm>) {
    const base = makeDefaultAsset(assetsRef.current.length + 1);
    commitAssets([...assetsRef.current, patch ? { ...base, ...patch } : base]);
  }

  function removeAsset(idx: number) {
    commitAssets(assetsRef.current.filter((_, i) => i !== idx));
  }

  function updateAsset(idx: number, patch: Partial<AssetForm>) {
    commitAssets(
      assetsRef.current.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    );
  }

  return (
    <div className="space-y-4">
      {assets.map((asset, idx) => (
        <CompanionAssetCard
          key={asset.assetId}
          index={idx}
          asset={asset}
          bundledSaleMode={bundledSaleMode}
          onChange={(patch) => updateAsset(idx, patch)}
          onRemove={assets.length > 1 ? () => removeAsset(idx) : undefined}
          singleMode={singleMode && assets.length === 1}
          transferDate={transferDate}
          filingDate={filingDate}
          filingOverdue={filingOverdue}
          filingDeadline={filingDeadline}
          burdenedGiftDeadline={burdenedGiftDeadline}
          showFormDates={idx === 0}
          onFormChange={onFormChange}
          contractTotalPrice={contractTotalPrice}
          totalTransferExpense={totalTransferExpense}
          onAddAsset={(patch) => addAsset(patch)}
          primaryAsset={idx > 0 ? assets[0] : undefined}
          isOneHouseSingle={isOneHouseSingle}
          errorMessage={errorAssetIndex === idx ? errorMessage ?? undefined : undefined}
        />
      ))}

      {assets.length > 1 && (
        <Button type="button" variant="outline" onClick={() => addAsset()} className="w-full">
          + 자산 추가
        </Button>
      )}
    </div>
  );
}
