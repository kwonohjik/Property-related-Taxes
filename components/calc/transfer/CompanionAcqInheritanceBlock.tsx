"use client";

/**
 * 상속 취득 입력 통합 셸 (B1 통합 — P2b)
 *
 * 상속 취득가액 입력을 단일 흐름으로 통합:
 *   1. 헤더: 상속개시일·피상속인 취득일
 *   2. §154⑧3호 동일세대 통산 토글 (주택 전용)
 *   3. 자산 구분 (토지/개별주택/공동주택)
 *   4. 취득가액 산정 — InheritedAcquisitionDeemedSection (의제취득일 전후 자동 분기)
 *
 * 기존 auto/manual 토글·상단 공시가격/직접입력(fixedAcquisitionPrice)을 제거하고,
 * 취득가액은 하단 평가방법 축(post-deemed)·환산(pre-deemed)으로 일원화한다.
 * 토지 신고가액은 총액(publishedValueAtInheritance) 단일 의미로 통일 (route 경로 통일, R0″).
 *
 * inheritanceValuationMode는 항상 "auto"(factory 기본·migration 전환) — UI에 토글 없음.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { InheritedAcquisitionDeemedSection } from "./InheritedAcquisitionDeemedSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const INHERITANCE_ASSET_KIND_OPTIONS = [
  { value: "land", label: "토지 (공시지가 × 면적)" },
  { value: "house_individual", label: "개별·다세대주택 (개별주택가격)" },
  { value: "house_apart", label: "공동주택 (공동주택가격)" },
] as const;

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 의제분기 섹션의 환산 계산에 전달 */
  transferDate?: string;
}

export function CompanionAcqInheritanceBlock({ asset, onChange, transferDate }: Props) {
  // 겸용주택 모드: 취득가액은 §163⑨ 상속개시일 평가액을 ② 주택·③ 상가 기준시가 섹션에서
  // 직접 산정(MixedUseAssetMajorStdPrice) — 여기의 자산 구분·취득가액 의제 특례는 겸용 엔진이
  // 소비하지 않는 dead 입력이라 숨긴다(CompanionAcqPurchaseBlock.tsx의 기존 isMixedUse 파생 패턴 재사용).
  const isMixedUse = !!asset.isMixedUseHouse;
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">상속개시일</label>
          <DateInput
            value={asset.acquisitionDate}
            onChange={(v) =>
              onChange({ acquisitionDate: v, inheritanceStartDate: v, inheritanceDate: v })
            }
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">피상속인 취득일</label>
          <DateInput
            value={asset.decedentAcquisitionDate}
            onChange={(v) => onChange({ decedentAcquisitionDate: v })}
          />
          <p className="text-caption text-muted-foreground">단기보유 통산용 (소득세법 §104②1호)</p>
        </div>
      </div>

      {/* §154⑧3호 상속주택 자체 양도 — 동일세대 보유기간 통산 (주택 전용) */}
      {asset.assetKind === "housing" && (
        <ToggleCard
          variant="card"
          tone="violet"
          checked={asset.decedentSameHouseholdBeforeInheritance}
          onCheckedChange={(v) => {
            onChange({
              decedentSameHouseholdBeforeInheritance: v,
              ...(v ? {} : { decedentCohabitationHoldingStartDate: "", decedentCohabitationResidenceMonths: "" }),
            });
          }}
          title="상속개시 당시 피상속인과 동일세대"
          description="동일세대로 함께 거주·보유하던 상속주택을 양도하는 경우, 상속개시 전 동일세대 보유·거주기간을 1세대1주택 비과세·표2 장특공제 판정에 통산합니다 (소령 §154⑧3호)"
        >
          <div className="space-y-2 pt-1">
            <div className="space-y-1">
              <label className="block text-caption text-muted-foreground font-medium">
                동일세대 거주·보유 개시일
              </label>
              <DateInput
                value={asset.decedentCohabitationHoldingStartDate}
                onChange={(v) => onChange({ decedentCohabitationHoldingStartDate: v })}
              />
              <p className="text-caption text-muted-foreground/70">
                상속개시 전 피상속인과 동일세대로서 이 주택에 거주·보유하기 시작한 날 (비과세 보유기간 기산).
              </p>
            </div>
            <div className="space-y-1">
              <label className="block text-caption text-muted-foreground font-medium">
                동일세대 통산 거주기간 (개월)
              </label>
              <div className="w-32">
                <DecimalInput
                  value={asset.decedentCohabitationResidenceMonths}
                  onChange={(v) => onChange({ decedentCohabitationResidenceMonths: v })}
                />
              </div>
              <p className="text-caption text-muted-foreground/70">
                상속개시 전 피상속인과 동일세대로서 이 주택에 실제 거주한 기간(개월). 비과세 거주요건·표2
                장특공제 대상 판정에 통산됩니다. 상속개시일 이후 상속인 본인 실거주는 &lsquo;거주기간&rsquo;에 별도 입력.
              </p>
            </div>
          </div>
        </ToggleCard>
      )}

      {/* 자산 구분 (상속개시일 기준) — 하단 의제분기 섹션이 이 값으로 토지/주택 UI 분기 (비-겸용 전용) */}
      {!isMixedUse && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="block text-sm font-medium">자산 구분 (상속개시일 기준)</label>
            <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />
            <LawArticleModal legalBasis="상속세및증여세법 §61" label="상증법 §61" />
          </div>
          <RadioCardGroup
            name={`inh-kind-${asset.assetId}`}
            tone="amber"
            layout="stack"
            options={INHERITANCE_ASSET_KIND_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
            value={asset.inheritanceAssetKind ?? ""}
            onChange={(v) =>
              onChange({
                inheritanceAssetKind: v as AssetForm["inheritanceAssetKind"],
                // 자산구분 변경 시 보충적평가 보조계산 입력 초기화 (토지↔주택 stale 방지)
                useSupplementaryHelper: false,
                supplementaryLandUnitPrice: "",
                supplementaryLandArea: "",
                supplementaryBuildingValue: "",
              })
            }
          />
        </div>
      )}

      {/* 취득가액 산정 — 의제취득일(1985.1.1.) 전후 자동 분기 (pre/post, 비-겸용 전용) */}
      {!isMixedUse && (
        <InheritedAcquisitionDeemedSection asset={asset} onChange={onChange} transferDate={transferDate} />
      )}

      {/* 겸용주택 안내 — 자산 구분·취득가액 의제 특례 대신 §163⑨ 직접 산정 경로로 유도 */}
      {isMixedUse && (
        <ToneCard
          tone="violet"
          title="취득가액 — 겸용주택 상속개시일 평가액 자동 적용"
          titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
        >
          <p className="text-xs text-violet-800">
            겸용주택(주택+상가)은 상속개시일 현재 상증법 §60~66 평가액을 취득가액으로 직접
            사용합니다. 아래 &ldquo;주택 기준시가&rdquo;·&ldquo;상가 기준시가&rdquo; 섹션의
            &ldquo;상속개시일&rdquo; 입력에서 산정하므로, 이 화면의 자산 구분·취득가액 의제
            특례 입력은 표시하지 않습니다.
          </p>
        </ToneCard>
      )}
    </div>
  );
}
