"use client";

/**
 * 건물은 **신축**, 그 토지는 **상속·증여**로 취득한 자산의 토지 파트 입력.
 *
 * 계획서: docs/02-design/features/transfer-part-acquisition-cause.plan.md
 *
 * `acquisitionCause`가 자산 단위 단일값이라 "건물=신축 / 토지=상속"을 표현할 수 없었다.
 * 취득원인을 「신축」으로 고르면 사용승인일 4시점 + 신축비용만 받고, **토지 취득일·취득가액을
 * 넣을 칸이 아예 없어** 토지 취득가액이 0으로 계산됐다(과대과세).
 *
 * ## 엔진 전달 방식
 * 취득가액: 상속 §163⑨ 평가액·증여 신고가액은 모두 "확인된 취득가액"이므로 `landAcqMode="actual"` +
 * `landAcquisitionPrice`로 흘린다(상속·증여 토지의 추계는 엔진·⑫·⑧이 막는다 — D0 G-2).
 * 세율 보유기간: `landAcquisitionCause`·`landDecedentAcquisitionDate`가 엔진에 전달되어 상속 토지는
 * 피상속인 취득일부터 통산한다(「소득세법」 §104②1호 — `transfer-tax-appurtenant-land.ts`). 단순 증여는
 * 통산 대상이 아니다(같은 항 2호는 §97의2① 이월과세 자산만). 장기보유특별공제는 파트별 취득일부터(§95④).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LandBuildingSaleSplitSection } from "./LandBuildingSaleSplitSection";
import { saleStdPlacement } from "@/lib/calc/transfer-tax-split-acq-mode";
import { landPartCauseApplicable } from "@/lib/calc/transfer-land-part-cause";
import { effectiveLandAcquisitionCause } from "@/lib/calc/transfer-land-part-cause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type LandCause = "inheritance" | "gift";

const CAUSE_OPTIONS: RadioCardOption<LandCause>[] = [
  { value: "inheritance", label: "상속" },
  { value: "gift", label: "증여" },
];

/** 취득원인별 취득가액 라벨·근거 — 상속은 §163⑨, 증여는 증여세 신고가액. */
const CAUSE_META: Record<LandCause, { priceLabel: string; hint: string }> = {
  inheritance: {
    priceLabel: "토지 상속개시일 평가액",
    hint: "상속세 신고서상 토지 평가액 (소득세법 시행령 §163⑨ — 상속개시일 현재 상증법 §60~§66 평가액)",
  },
  gift: {
    priceLabel: "토지 증여 신고가액",
    hint: "증여세 신고서상 토지 평가액 (증여일 현재 시가 또는 보충적 평가액)",
  },
};

export function NewConstructionLandAcqBlock(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}) {
  const { asset, onChange } = props;

  // 건물 신축 + 주택·건물(겸용은 자체 4부분 안분이 축을 지배한다) — ④·⑥·⑧과 같은 술어(D0 G-6).
  if (!landPartCauseApplicable(asset)) return null;

  // 토글 상태 = ④가 실제로 보내는 유효 원인 — 분리가 꺼진 잔재를 「켜짐」으로 그리지 않는다.
  const active = !!effectiveLandAcquisitionCause(asset);
  const cause = (asset.landAcquisitionCause || "inheritance") as LandCause;
  const meta = CAUSE_META[cause];

  // 양도시 기준시가 배치 — 축 A와 **같은 1회 계산**을 공유한다(하위 재파생 금지 규약).
  // ⏳ Phase 1-D부터 배치는 불변(항상 축 A) — §100③ 판정이 양쪽 기준시가를 요구한다.
  const saleStdPlace = saleStdPlacement();

  return (
    <div className="space-y-2" data-testid="newconstruction-land-acq">
      <ToggleCard
        variant="chip"
        tone="amber"
        title="토지는 다른 원인으로 취득"
        description="상속·증여받은 땅에 신축"
        checked={active}
        onCheckedChange={(checked) => {
          // 다중 키 **단일 배치 update**(feedback_multikey_patch_stale_spread_overwrite).
          // 취득일 분리를 함께 켜야 엔진이 파트별 경로로 흐른다(calcSplitGain 진입 가드).
          // 파트 방식은 양쪽 "actual" — 상속 평가액·신축비용 모두 확인된 취득가액이다.
          onChange(
            checked
              ? {
                  landAcquisitionCause: "inheritance",
                  hasSeperateLandAcquisitionDate: true,
                  landAcqMode: "actual",
                  buildingAcqMode: "actual",
                }
              : {
                  landAcquisitionCause: "",
                  hasSeperateLandAcquisitionDate: false,
                  landAcqMode: "",
                  buildingAcqMode: "",
                },
          );
        }}
      />

      {active && (
        <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
          <ToneCard tone="amber" noDark>
            <p className="text-xs text-amber-900">
              건물은 <strong>신축</strong>, 토지는 <strong>{cause === "inheritance" ? "상속" : "증여"}</strong>으로
              취득한 자산입니다. 취득가액·보유기간을 토지·건물 <strong>각각</strong> 산정합니다
              (소득세법 §95④·§104②, 같은 법 시행령 §163⑨).
            </p>
          </ToneCard>

          {/* 증여 — 배우자·직계존비속 이월과세(§97의2①)는 이 화면이 계산하지 않는다는 고지(D0 R-1).
              법이 자동 적용하는 규정이라 「증여」로 고른 사용자가 고지 없이 일반 증여로 계산받지 않게 한다. */}
          {cause === "gift" && (
            <ToneCard tone="amber" noDark>
              <p className="text-xs text-amber-900" data-testid="land-gift-carryover-notice">
                양도일부터 소급하여 10년 이내에 <strong>배우자·직계존비속</strong>으로부터 증여받은 토지는
                취득가액·보유기간을 증여자 기준으로 계산하는 이월과세 대상입니다(소득세법 §97의2①). 이 화면은 그
                계산을 지원하지 않으며, 아래 값은 일반 증여(증여일 평가액·증여일 취득)로 계산됩니다.
              </p>
            </ToneCard>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-amber-800">토지 취득 원인</p>
            <div data-testid="land-acq-cause">
              <RadioCardGroup
                name={`landAcquisitionCause-${asset.assetId ?? "primary"}`}
                tone="amber"
                layout="inline"
                options={CAUSE_OPTIONS}
                value={cause}
                onChange={(v) => onChange({ landAcquisitionCause: v })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 items-start">
            <FieldCard
              label={cause === "inheritance" ? "상속개시일" : "증여일"}
              hint="토지 취득일 — 장기보유특별공제 기산일 (소득세법 §95④)"
            >
              <DateInput
                value={asset.landAcquisitionDate}
                onChange={(v) => onChange({ landAcquisitionDate: v })}
                data-testid="acq-date-land"
              />
            </FieldCard>
            <FieldCard label={meta.priceLabel} unit="원" hint={meta.hint}>
              <CurrencyInput
                label=""
                hideUnit
                value={asset.landAcquisitionPrice ?? ""}
                onChange={(v) => onChange({ landAcquisitionPrice: v })}
                required
                data-testid="split-land-acq-price"
              />
            </FieldCard>
            {/* §104②1호 — 상속 토지의 세율 판정 보유기간은 피상속인 취득일부터 통산한다(필수 — ⑧·⑫).
                단순 증여는 통산 대상이 아니라 칸을 두지 않는다(2호는 §97의2① 이월과세 자산만 — D0 G-8). */}
            {cause === "inheritance" && (
              <FieldCard
                label="피상속인 취득일"
                field="landDecedentAcquisitionDate"
                hint="세율 판정 보유기간을 피상속인이 취득한 날부터 통산합니다 (「소득세법」 제104조 제2항 제1호)."
              >
                <DateInput
                  value={asset.landDecedentAcquisitionDate}
                  onChange={(v) => onChange({ landDecedentAcquisitionDate: v })}
                  data-testid="land-statutory-acq-date"
                />
              </FieldCard>
            )}
          </div>

          <p className="text-caption text-muted-foreground">
            건물 취득가액은 아래 <strong>신축비용</strong> 칸을, 건물 취득일은 위{" "}
            <strong>사용승인일 등 4시점</strong>을 사용합니다.
          </p>

          {/* 축 A — 양도가액을 토지·건물로 구분(§166⑥). 두 파트의 양도차익을 나누려면 필수. */}
          <LandBuildingSaleSplitSection
            isBurdenedGift={asset.transferType === "burdened_gift"}
            saleSplitMode={asset.saleSplitMode ?? "apportioned"}
            // patch 덩어리를 그대로 전달 — 전환 시 쓰지 않는 값 정리가 함께 들어 있다.
            onSaleSplitModeChange={onChange}
            landTransferPrice={asset.landTransferPrice ?? ""}
            onLandTransferPriceChange={(v) => onChange({ landTransferPrice: v })}
            buildingTransferPrice={asset.buildingTransferPrice ?? ""}
            onBuildingTransferPriceChange={(v) => onChange({ buildingTransferPrice: v })}
            showStdCard={saleStdPlace.saleAxis}
            asset={asset}
            onAssetChange={onChange}
            transferDate={props.transferDate}
          />
        </div>
      )}
    </div>
  );
}
