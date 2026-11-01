"use client";

import type { MergeRentalState } from "@/lib/calc/merge-rental-carveout-form";
import { useEffect, useRef } from "react";
import { type AssetForm, type TransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { Button } from "@/components/ui/button";
import { CompanionAssetCard } from "./CompanionAssetCard";
import type { BundledSaleMode } from "./CompanionSaleModeBlock";
import type { AssetSplitMode } from "./OwnershipRatioInput";
import { appurtenantLimitShareOfAssets } from "@/lib/calc/housing-excess-split";

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
  /** 기한 경과 안내 뒷부분 — 가산세 상태대로 (Step1 산출) */
  filingOverdueNote?: string;
  /** 신고기한 문자열 (Step1 산출) */
  filingDeadline?: string;
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
  /**
   * 판정 메뉴에서 사실을 넘겨받은 적이 있는가 (`hasJudgmentProvenance`) — P6-c-5.
   * 자산 카드 안의 두 안내 문구가 「가라」/「선언이 없다」를 가른다.
   */
  judgmentLoaded?: boolean;
  /** §155⑳ 카드 거주요건 표시용 — 폼-전역 「취득 당시 조정대상지역」 저장값·법정동코드 폴백(G1-13). 주소가 있으면 카드가 주소 판정을 쓴다. */
  wasRegulatedAtAcquisition?: boolean;
  formRegionCode?: string;
  /** §155④⑤ × ⑳ 상대 쪽 임대 — 첫 자산 카드에만 넘긴다 */
  mergeRental?: MergeRentalState;
  /*
   * 🔄 `wasRegulatedAtAcquisition`은 **지웠다** (P6-c-1) — 입주권 §⑥ 카드가 판정 메뉴
   *    전용이 되면서 이 체인의 소비처가 사라졌다. U1-03 감시는 판정 메뉴 경로로 옮겼다.
   *    (위 `wasRegulatedAtAcquisition`은 그 입주권 카드가 아니라 §155⑳ 카드 표시용으로 G1-13에서 다시 둔 것이다.)
   */
  /** 자산 인덱스 → 그 카드의 첫 검증 오류 (카드 배너 + 섹션 강제 펼침) */
  assetErrors?: Record<number, string>;
  /** 자산 분할 모드 (Step1 단일 소스) — ③ 토글 B + "+ 추가" 버튼 분기 */
  splitMode: AssetSplitMode;
  /** 토글 B(지분분할) on/off 핸들러 — Step1 정의 */
  onFractionalToggle: (yes: boolean) => void;
  /**
   * 카드 재마운트 세대 — 올리면 모든 카드가 다시 마운트된다(카드 안 «접기 상태»는 마운트 때만 계산되므로 자산 순서를 바꾼 뒤 새 첫 카드가 ①을 펼친 채 시작하게 한다).
   * 입력값은 스토어에 있어 보존된다. 기본 0.
   */
  remountEpoch?: number;
  /**
   * 자산 삭제 — 있으면 배열 빼기 대신 이것을 부른다. 첫 자산 삭제는 폼 전역 미등기·주 자산 플래그·기본 라벨을
   * 함께 맞춰야 해서(`lib/calc/asset-removal.ts`) 폼 전역 키를 쓸 수 있는 Step1이 처리한다.
   */
  onRemoveAsset?: (currentAssets: AssetForm[], idx: number) => void;
  /** 스토어의 최신 자산 배열 — 언마운트 뒤 늦게 도착한 카드 패치가 단계를 떠날 때의 스냅샷을 덮어쓰지 않게 한다(아래 updateAsset). */
  getLatestAssets?: () => AssetForm[];
}

export function CompanionAssetsSection({ assets, bundledSaleMode, onChange, singleMode, transferDate, filingDate, filingOverdue, filingOverdueNote, filingDeadline, onFormChange, contractTotalPrice, totalTransferExpense, isOneHouseSingle, judgmentLoaded, wasRegulatedAtAcquisition, formRegionCode, mergeRental, assetErrors, splitMode, onFractionalToggle, remountEpoch = 0, onRemoveAsset, getLatestAssets }: Props) {
  // 연속된 onChange 호출에서 stale closure를 피하기 위해
  // 최신 assets를 ref로 동기 추적 (렌더링 중 동기화)
  /* eslint-disable react-hooks/refs -- props→ref 동기 sync. useEffect로 옮기면 stale closure 발생 */
  const assetsRef = useRef(assets);
  if (assetsRef.current !== assets) {
    assetsRef.current = assets;
  }
  /* eslint-enable react-hooks/refs */

  // #17 후속(K1) — 배율 한도를 주 자산 주택 카드 토지와 부수토지 카드들이 함께 쓴다(일체과세 배지가 route와 같은 몫을 잰다).
  const appurtenantLimitShare = assets.length > 1 ? appurtenantLimitShareOfAssets(assets[0], assets.slice(1)) : undefined;

  // 언마운트 뒤 늦게 도착한 카드 패치를 가르기 위한 표지(아래 updateAsset)
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function commitAssets(next: AssetForm[]) {
    assetsRef.current = next;
    onChange(next);
  }

  function addAsset(patch?: Partial<AssetForm>) {
    const base = makeDefaultAsset(assetsRef.current.length + 1);
    commitAssets([...assetsRef.current, patch ? { ...base, ...patch } : base]);
  }

  function removeAsset(idx: number) {
    if (onRemoveAsset) {
      onRemoveAsset(assetsRef.current, idx);
      return;
    }
    commitAssets(assetsRef.current.filter((_, i) => i !== idx));
  }

  function updateAsset(idx: number, patch: Partial<AssetForm>) {
    // 🔴 늦게 끝난 비동기(주소 세대 조회 `onUnitsResolved`)는 이 섹션이 언마운트된 뒤에도 부른다. 그때 assetsRef는
    //    단계를 떠날 때의 스냅샷이라 ① 다음 단계에서 바꾼 자산 값(비사업용 토지 스위치 등)을 통째로 덮어썼고,
    //    ② 값이 같아도 저장 경로가 계산 결과를 지웠다. 언마운트 뒤에는 최신 배열에 assetId로 패치하고, 바뀌는 값이
    //    없으면 저장하지 않는다(e2e/transfer-address-units-late-resolve.spec.ts).
    if (!mountedRef.current && getLatestAssets) {
      const id = assetsRef.current[idx]?.assetId;
      const latest = getLatestAssets();
      const cur = latest.find((a) => a.assetId === id);
      if (!cur || (Object.keys(patch) as (keyof AssetForm)[]).every((k) => Object.is(cur[k], patch[k]))) return;
      commitAssets(latest.map((a) => (a.assetId === id ? { ...a, ...patch } : a)));
      return;
    }
    commitAssets(
      assetsRef.current.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    );
  }

  return (
    <div className="space-y-4">
      {assets.map((asset, idx) => (
        <CompanionAssetCard
          key={`${asset.assetId}:${remountEpoch}`}
          index={idx}
          asset={asset}
          bundledSaleMode={bundledSaleMode}
          onChange={(patch) => updateAsset(idx, patch)}
          onRemove={assets.length > 1 ? () => removeAsset(idx) : undefined}
          singleMode={singleMode && assets.length === 1}
          transferDate={transferDate}
          filingDate={filingDate}
          filingOverdue={filingOverdue}
          filingOverdueNote={filingOverdueNote}
          filingDeadline={filingDeadline}
          showFormDates={idx === 0}
          onFormChange={onFormChange}
          contractTotalPrice={contractTotalPrice}
          totalTransferExpense={totalTransferExpense}
          onAddAsset={(patch) => addAsset(patch)}
          hasIncrementAsset={assets.some((a) => a.isReplotIncrement)}
          primaryAsset={idx > 0 ? assets[0] : undefined}
          appurtenantLimitShare={idx > 0 ? appurtenantLimitShare : undefined}
          isOneHouseSingle={isOneHouseSingle}
          judgmentLoaded={judgmentLoaded}
          wasRegulatedAtAcquisition={wasRegulatedAtAcquisition}
          formRegionCode={formRegionCode}
          mergeRental={idx === 0 ? mergeRental : undefined}
          errorMessage={assetErrors?.[idx]}
          splitMode={splitMode}
          onFractionalToggle={onFractionalToggle}
          hasSiblings={assets.length > 1}
          // 일반건물 최초공시(물건 사건) 토글 — 주 자산 카드가 전 지분의 산정방식을 본다(축 B만).
          gbFractionalShares={splitMode === "fractional" && idx === 0 ? assets : undefined}
        />
      ))}

      {assets.length > 1 && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            addAsset(
              splitMode === "fractional"
                ? { ownershipNumerator: "", ownershipDenominator: "" }
                : undefined,
            )
          }
          className="w-full"
        >
          {splitMode === "fractional" ? "+ 지분 추가" : "+ 자산 추가"}
        </Button>
      )}
    </div>
  );
}
