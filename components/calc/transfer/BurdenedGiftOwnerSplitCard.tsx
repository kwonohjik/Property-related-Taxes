"use client";

/**
 * 부담부증여 × 토지·건물 소유자 분리 — 증여한 부분(본인 소유분)만 §159로 계산하는 입력 (계획서 `docs/00-pm/bg-owner-split-159.plan.md` §7 · PR-3).
 *
 * 노출 술어는 ④(`bgOwnerSplitInfoPatch`)·⑧(`validateBgOwnerSplit`)·⑫와 같은 `bgOwnerSplitActive` 하나다(3중 패턴). 범위 밖(주택·매매 외 취득·매매사례/감정·공유지분·함께 양도)은
 * 토글을 켤 수 없고(⑤ `AssetOwnershipSplitSection`) 켜진 저장값은 ⑧이 같은 사유 문구로 막는다.
 * 비소유 파트의 값은 받지도 보내지도 않는다 — 평가액·증여가액은 증여한 자산의 값이다(「소득세법 시행령」 제159조 제1항). 자동 안분은 없다.
 *
 * 800줄 정책으로 `BurdenedGiftBlock.tsx`에서 갈라낸 조각: 안내(상단) · 채무 확인 · 시가 칸 · 기준시가 카드.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { bgAcqStdPriceNeededBase } from "@/lib/calc/burdened-gift-acq-std-price";
import { bgOwnerSplitActive, bgOwnerSplitOwnedPart, bgOwnerSplitTransferStdNeeded } from "@/lib/calc/bg-owner-split-scope";
import { PartAcqStdPrice } from "./LandBuildingSplitSection";
import { TransferBuildingStdFields, TransferLandStdFields } from "./TransferStdPriceCards";

/** 양도시 건물 기준시가 칸 hint — `TransferBuildingStdFields placement="ownedPart"`와 같은 문안. */
const OWNED_TRANSFER_HINT = "증여한 건물분의 평가액(증여가액·양도가액 산정 기준) — 계산기로 산정 (§99①1호 나목). 위치지수·부속토지 값은 계산기 안에서 입력합니다";

type Common = { asset: AssetForm; onChange: (patch: Partial<AssetForm>) => void };

const partName = (asset: AssetForm) => (bgOwnerSplitOwnedPart(asset) === "land" ? "토지" : "건물");

/** 부담부증여 블록 위 안내 — 증여한 부분만 계산하고 비소유 파트는 입력하지 않는다. */
export function BurdenedGiftOwnerSplitNotice({ asset }: { asset: AssetForm }) {
  if (!bgOwnerSplitActive(asset)) return null;
  const name = partName(asset);
  const other = name === "건물" ? "토지" : "건물";
  return (
    <ToneCard tone="amber" title={`토지·건물 소유자 분리 × 부담부증여 — 증여한 ${name}분만 계산`} bodyClassName="space-y-1">
      <div data-testid="bg-owner-split-notice" className="space-y-1">
        <p className="text-caption text-amber-900 dark:text-amber-200">
          증여한 {name}분만 「소득세법 시행령」 §159로 계산합니다. 평가액·증여가액은 <b>증여한 부분의 값</b>이므로 아래 칸에는 증여한 {name}분만 입력하세요 —
          {other}은 본인 소유가 아니라 입력하지 않으며 계산에 넣지 않습니다. <LawArticleModal legalBasis="소득세법 시행령 §159" label="시행령 §159" />
        </p>
        <p className="text-caption text-amber-800 dark:text-amber-200">
          계산 범위: 증여자가 매매로 취득한 단독 소유 건물(주택이 아닌 건물) 단건. 취득가액은 기준시가·실지취득가액·환산취득가액을 계산하고, 매매사례가액·감정가액·이월과세·공유지분·함께 양도는 계산하지 않습니다.
        </p>
      </div>
    </ToneCard>
  );
}

/** 인수 채무 카드 아래 — 증여한 부분에 대한 채무만 입력했다는 확인(공동담보 안분 칸은 없다 · 계획서 Q-3 a). */
export function BgOwnerSplitDebtConfirm({ asset, onChange }: Common) {
  if (!bgOwnerSplitActive(asset)) return null;
  const name = partName(asset);
  return (
    <div data-testid="bg-owner-split-debt-confirm" className="space-y-1.5">
      <p className="text-caption text-rose-700 dark:text-rose-300">증여한 {name}에 대한 채무만 입력하세요.</p>
      <ToggleCard
        tone="amber"
        data-field="bgOwnerSplitDebtConfirmed"
        title={`인수한 채무는 증여자 본인 채무이며 증여한 ${name}에만 관련됩니다`}
        description="타인 소유 부분과 함께 담보로 설정한 채무(공동저당)는 증여한 부분만의 담보평가액으로 안분해야 하는데 입력 칸이 없어 계산하지 않습니다 (상증령 §63①2호)"
        checked={asset.bgOwnerSplitDebtConfirmed === true}
        onCheckedChange={(v) => onChange({ bgOwnerSplitDebtConfirmed: v })}
      />
    </div>
  );
}

/** 시가 모드 — 양도시 시가 평가액. 소유자 분리 범위 안이면 증여한 부분의 시가 칸(총액 칸과 갈라 둔다 · 계획서 Q-4)이다. */
export function BgOwnerSplitMarketValueField({ asset, onChange }: Common) {
  const owned = bgOwnerSplitActive(asset);
  return owned ? (
    <FieldCard label={`양도시 시가 평가액 — 증여한 ${partName(asset)}분`} hint={`증여한 ${partName(asset)}분의 양도시 시가(감정평가서·증여세 신고서의 ${partName(asset)} 평가액) — 총액이 아니라 증여한 부분만`}>
      <CurrencyInput label="" hideUnit value={asset.bgMarketValueOwnedPart} data-field="bgMarketValueOwnedPart" onChange={(v) => onChange({ bgMarketValueOwnedPart: v })} />
    </FieldCard>
  ) : (
    <FieldCard label="양도시 시가 평가액 (총액)">
      <CurrencyInput label="" hideUnit value={asset.bgMarketValueAtTransfer} data-field="bgMarketValueAtTransfer" onChange={(v) => onChange({ bgMarketValueAtTransfer: v })} />
    </FieldCard>
  );
}

/** 증여한 부분의 양도시·취득시 기준시가 — 날짜 분리와 같은 파트 칸(건물 나목 · 토지 가목 = ㎡당 공시지가 × 면적). 비소유 파트 칸은 열지 않는다. */
export function BurdenedGiftOwnerSplitCard({ asset, onChange, transferDate }: Common & { transferDate?: string }) {
  if (!bgOwnerSplitActive(asset)) return null;
  const part = bgOwnerSplitOwnedPart(asset);
  const name = partName(asset);
  const market = asset.bgValuationMode === "sangjeungbeop_market";
  // 취득시 기준시가는 취득가액이 기준시가 × 채무비율이거나 환산·담보 승으로 읽을 때만 — ⑧(`validateBgOwnerSplit`)과 같은 술어.
  const acqNeeded = bgAcqStdPriceNeededBase(asset);
  // 양도시 기준시가는 기준시가 평가·시가 × 환산에서만 쓴다 — 시가 × 실지는 칸을 열지 않는다(⑧·엔진 계약과 같은 술어).
  const transferNeeded = bgOwnerSplitTransferStdNeeded(asset);
  if (!transferNeeded && !acqNeeded) return null;
  return (
    <div data-testid="bg-owner-split-card">
      <ToneCard tone="amber" title={`증여한 ${name}분의 기준시가 (소득세법 시행령 §159①)`}>
        <p className="text-caption text-amber-900 dark:text-amber-200">
          {market
            ? `증여한 ${name}분의 시가는 위 시가 평가 칸에 입력했습니다. 여기 기준시가는 ${transferNeeded ? "환산취득가액(양도가액에 취득시·양도시 기준시가 비율을 곱한 값) 계산에" : "취득가액(취득시 기준시가 × 채무비율) 계산에"} 씁니다.`
            : `증여가액(C)과 양도가액이 증여한 ${name}분의 기준시가로 정해집니다 — 취득가액은 취득시 기준시가에 채무비율을 곱합니다.`}
          {` ${name === "건물" ? "토지" : "건물"}분은 입력하지 않습니다.`}
        </p>
        {part === "land" ? (
          <>
            {transferNeeded && <TransferLandStdFields asset={asset} onChange={onChange} transferDate={transferDate} />}
            {acqNeeded && <PartAcqStdPrice part="land" asset={asset} onChange={onChange} transferDate={transferDate} />}
          </>
        ) : acqNeeded ? (
          <PartAcqStdPrice part="building" asset={asset} onChange={onChange} transferDate={transferDate} showTransfer={transferNeeded} transferHint={market ? undefined : OWNED_TRANSFER_HINT} />
        ) : (
          <TransferBuildingStdFields asset={asset} onChange={onChange} transferDate={transferDate} placement="ownedPart" />
        )}
      </ToneCard>
    </div>
  );
}
