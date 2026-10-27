"use client";

/**
 * 주택·건물 부담부증여 × 토지·건물 취득일 다름 — 토지·건물 파트 값 (설계서 `docs/00-pm/bg-house-building-split.design.md` §5.2 · Q-2 a · Q-3 a).
 *
 * 엔진이 토지·건물을 파트로 나눠 §159를 계산한다. 그 재료 중 실지취득가액·매매사례가액·감정가액 파트 칸은 각 방식 블록이 받고,
 * 여기서는 파트 평가액(시가)·양도시/취득시 토지·건물 기준시가를 받는다. 노출 술어는 ④·⑧과 같은 `bgHouseSplitMode`다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { bgHouseSplitMode } from "@/lib/calc/bg-house-split";
import { TransferBuildingStdFields, TransferLandStdFields } from "./TransferStdPriceCards";
import { PartAcqStdPrice } from "./LandBuildingSplitSection";

export function BurdenedGiftHouseSplitCard({ asset, onChange, transferDate }: { asset: AssetForm; onChange: (patch: Partial<AssetForm>) => void; transferDate?: string }) {
  const mode = bgHouseSplitMode(asset);
  if (!mode) return null;
  const market = asset.bgValuationMode === "sangjeungbeop_market";
  const method = asset.bgAcquisitionMethod || "";
  // 기준시가 평가(파트 A = 기준시가)·환산(분모·분자) — 양도시 기준시가. 본인 취득이면 취득시 기준시가도(이월과세는 「당초 증여자」 블록이 받는다).
  const needsStd = !market || method === "converted";
  const sum = (parseAmount(asset.bgMarketValueLand) || 0) + (parseAmount(asset.bgMarketValueBuilding) || 0);
  return (
    <div data-testid="bg-house-split-card">
      <ToneCard tone="amber" title="토지·건물을 나눠 계산합니다 — 취득일이 다릅니다">
        <p className="text-caption text-amber-900 dark:text-amber-200">
          토지와 건물의 보유기간은 각각 그 자산의 취득일부터 셉니다{mode === "carryover" ? "(이월과세면 당초 증여자가 그 자산을 취득한 날)" : ""} — 「소득세법」 제95조 제4항.
          채무 인수분(「소득세법 시행령」 제159조)도 토지·건물 파트로 나눠 계산하므로 아래 값을 파트마다 입력하세요.{" "}
          <LawArticleModal legalBasis="소득세법 시행령 §159" label="시행령 §159" />
        </p>
        {market && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FieldCard label="토지분 평가액" field="bgMarketValueLand" hint="양도시 시가 중 토지분(감정평가서·증여세 신고서의 토지 평가액)">
              <CurrencyInput label="" hideUnit value={asset.bgMarketValueLand} onChange={(v) => onChange({ bgMarketValueLand: v })} />
            </FieldCard>
            <FieldCard
              label="건물분 평가액"
              field="bgMarketValueBuilding"
              hint={`양도시 시가 중 건물분 — 토지분 + 건물분 = 시가 평가액${sum > 0 ? ` (지금 합계 ${sum.toLocaleString("ko-KR")}원)` : ""}`}
            >
              <CurrencyInput label="" hideUnit value={asset.bgMarketValueBuilding} onChange={(v) => onChange({ bgMarketValueBuilding: v })} />
            </FieldCard>
          </div>
        )}
        {needsStd && (
          <>
            <TransferLandStdFields asset={asset} onChange={onChange} transferDate={transferDate} />
            {mode === "own" ? (
              <>
                <PartAcqStdPrice part="land" asset={asset} onChange={onChange} transferDate={transferDate} />
                <PartAcqStdPrice part="building" asset={asset} onChange={onChange} transferDate={transferDate} showTransfer />
              </>
            ) : (
              <TransferBuildingStdFields asset={asset} onChange={onChange} transferDate={transferDate} placement="part" />
            )}
          </>
        )}
      </ToneCard>
    </div>
  );
}
