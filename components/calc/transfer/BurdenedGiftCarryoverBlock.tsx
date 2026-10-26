"use client";

/**
 * 부담부증여 ③-b 이월과세 §97의2 — 「당초 증여자」 취득 당시 값 한 벌 (D-7b).
 * `BurdenedGiftBlock`에서 800줄 정책으로 분리(2026-10-16, 동작 무변경). 마운트 조건(`isCarryover`)은 부모가 판단한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { isBgPresumedMethod } from "@/lib/calc/burdened-gift-presumed-acquisition";
import { BurdenedGiftPresumedAcquisitionSection } from "./BurdenedGiftPresumedAcquisitionSection";
import { CarryoverDonorBuiltSection } from "./CarryoverDonorBuiltSection";
import { bgCarryoverForm, bgCarryoverFormKey, bgCarryoverParts } from "@/lib/calc/bg-carryover-parts";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** K-1~K-3(기준시가) · K-5(환산) · K-6/K-7 — 당초 증여자 취득 당시 기준시가가 필요한가(부모 `coDonorNeedsStdPrice`). */
  coDonorNeedsStdPrice: boolean;
  /** 지분 분할 취득·함께 부담부증여 묶음 — 당초 증여자 신축·증축 토글을 새로 보이지 않는다(⑫·⑧ 범위 밖) */
  bundled?: boolean;
}

export function BurdenedGiftCarryoverBlock({ asset, onChange, coDonorNeedsStdPrice, bundled }: Props) {
  // 증여받은 파트의 칸만 보인다(④ 전송·⑧ 필수와 같은 술어 · `gb-bg-part-carryover-calc.plan.md` §4.6). 일반건물 분리 ON에서만 갈린다.
  const parts = bgCarryoverParts(asset);
  const partial = parts.land !== parts.building;
  // 당초 증여자 신축·증축 값은 증여 사건 서브폼에 있다 — 건물만 이월과세면 건물 블록(`buildingCarryover`).
  const eventForm = bgCarryoverForm(asset);
  const eventKey = bgCarryoverFormKey(asset);
  return (
    <div
      className="rounded-lg border border-sky-300 bg-sky-50/70 p-3 space-y-2 dark:bg-sky-950/40"
      data-testid="bg-codonor-block"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-sky-900 dark:text-sky-200">
          이월과세 — 「당초 증여자」 취득 당시 값
        </span>
        <LawArticleModal legalBasis="소득세법 §97조의2" label="§97의2①1호" />
        <LawArticleModal legalBasis="소득세법 시행령 §159" label="시행령 §159①1호" />
      </div>

      <div className="rounded border border-sky-200 bg-white/70 dark:bg-white/5 p-2 text-caption text-sky-900 space-y-1 dark:text-sky-200">
        <p>
          <b>당초 증여자</b> = 지금 부담부증여를 하는 <b>양도인에게 이 자산을 증여한 사람</b>입니다.
          위쪽 취득 입력(양도인 기준)과 <b>다른 사람</b>이니 혼동하지 마세요.
        </p>
        <p>
          국세청 <b>재산세과-1059</b>에 따라, 증여받은 자산을 다시 부담부증여하면 시행령
          §159①1호의 취득가액에 이월과세가 적용되어 <b>당초 증여자의 취득 당시</b> 가액을 씁니다.
        </p>
        <p>
          두 벌을 <b>모두</b> 입력해야 합니다 — §97의2②3호가 「이월과세를 적용한 세액」과
          「적용하지 않은 세액」을 <b>비교</b>하므로 양쪽 기준값이 동시에 필요합니다.
        </p>
        {partial && (
          <p data-testid="bg-codonor-part-note">
            <b>{parts.land ? "토지" : "건물"}</b>만 증여받았으므로 당초 증여자 값은 <b>{parts.land ? "토지" : "건물"}</b> 칸만 받습니다 —
            {parts.land ? " 건물" : " 토지"}은 위쪽 양도인 취득 입력 그대로 계산합니다(§97의2①1호 「해당 자산」).
          </p>
        )}
      </div>

      {coDonorNeedsStdPrice ? (
        <>
          {isBgPresumedMethod(asset.bgAcquisitionMethod) && (
            <BurdenedGiftPresumedAcquisitionSection
              asset={asset}
              onChange={onChange}
              method={asset.bgAcquisitionMethod}
              carryover
            />
          )}
          {parts.land && (
            <FieldCard
              label="당초 증여자 취득 당시 토지 기준시가"
              hint="개별공시지가 × 면적. 토지가 없으면 0을 입력하세요."
            >
              <CurrencyInput
                label=""
                hideUnit
                data-testid="bg-codonor-land-std" data-field="bgCoDonorLandStdPriceAtAcq"
                value={asset.bgCoDonorLandStdPriceAtAcq}
                onChange={(v) => onChange({ bgCoDonorLandStdPriceAtAcq: v })}
              />
            </FieldCard>
          )}
          {parts.building && (
            <FieldCard
              label="당초 증여자 취득 당시 건물 기준시가"
              hint="건물이 없으면 0을 입력하세요 — 빈칸은 「미입력」으로 처리되어 계산이 차단됩니다."
            >
              <CurrencyInput
                label=""
                hideUnit
                data-testid="bg-codonor-building-std" data-field="bgCoDonorBuildingStdPriceAtAcq"
                value={asset.bgCoDonorBuildingStdPriceAtAcq}
                onChange={(v) => onChange({ bgCoDonorBuildingStdPriceAtAcq: v })}
              />
            </FieldCard>
          )}
          {asset.bgAcquisitionMethod === "converted" && (
            <div className="rounded border border-sky-200 bg-sky-100/60 p-2 text-caption text-sky-800 dark:text-sky-200 dark:bg-sky-900/40">
              환산취득가액은 {partial ? "이 칸을" : "이 두 칸을"} <b>분자로 자동 사용</b>합니다 — 환산 전용 입력은 없습니다.
            </div>
          )}
        </>
      ) : asset.bgAcquisitionMethod === "actual" ? (
        <>
          {asset.assetKind === "general_building" || asset.assetKind === "land" ? (
            <>
              {parts.land && (
                <FieldCard label="당초 증여자의 토지 실지취득가액">
                  <CurrencyInput
                    label=""
                    hideUnit
                    data-testid="bg-codonor-actual-land" data-field="bgCoDonorActualAcquisitionLand"
                    value={asset.bgCoDonorActualAcquisitionLand}
                    onChange={(v) => onChange({ bgCoDonorActualAcquisitionLand: v })}
                  />
                </FieldCard>
              )}
              {asset.assetKind === "general_building" && parts.building && (
                <FieldCard label="당초 증여자의 건물 실지취득가액">
                  <CurrencyInput
                    label=""
                    hideUnit
                    data-testid="bg-codonor-actual-building" data-field="bgCoDonorActualAcquisitionBuilding"
                    value={asset.bgCoDonorActualAcquisitionBuilding}
                    onChange={(v) => onChange({ bgCoDonorActualAcquisitionBuilding: v })}
                  />
                </FieldCard>
              )}
            </>
          ) : (
            <FieldCard
              label="당초 증여자의 실지취득가액 (전체)"
            >
              <CurrencyInput
                label=""
                hideUnit
                data-testid="bg-codonor-actual-total" data-field="bgCoDonorActualAcquisitionTotal"
                value={asset.bgCoDonorActualAcquisitionTotal}
                onChange={(v) => onChange({ bgCoDonorActualAcquisitionTotal: v })}
              />
            </FieldCard>
          )}
        </>
      ) : (
        <FieldCard
          label="당초 증여자 취득 당시 시가 평가액"
          hint="상증법 §60② 시가(매매사례·감정·보상·경매·공매가)"
        >
          <CurrencyInput
            label=""
            hideUnit
            data-testid="bg-codonor-market" data-field="bgCoDonorMarketValueAtAcquisition"
            value={asset.bgCoDonorMarketValueAtAcquisition}
            onChange={(v) => onChange({ bgCoDonorMarketValueAtAcquisition: v })}
          />
        </FieldCard>
      )}

      {/* 당초 증여자 취득 입력 다음 — 그 건물이 당초 증여자 신축·증축인가 (§114조의2, K-5 환산·K-7 감정만). 노출 술어는 ④ 전송·⑧ 필수와 같다(`donor-built-bg-scope.ts`). */}
      <CarryoverDonorBuiltSection
        mode="bg"
        bgBundled={bundled}
        asset={{ ...asset, carryover: eventForm }}
        transferDate=""
        onChange={onChange}
        onCarryoverChange={(patch) => onChange({ [eventKey]: { ...(eventForm ?? CARRYOVER_DEFAULTS), ...patch } })}
      />
    </div>
  );
}
