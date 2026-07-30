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
 * ## 엔진 전달 방식 (엔진 변경 0)
 * 엔진은 파트별 취득 **방식**(`landAcqMode` 4-way)만 알고 취득 **원인**은 모른다.
 * 상속 §163⑨ 평가액·증여 신고가액은 모두 "확인된 취득가액"이므로 `landAcqMode="actual"` +
 * `landAcquisitionPrice`로 흘리는 것이 법령상 정합적이다. `landAcquisitionCause`는
 * 라벨·안내를 바꾸는 UI 전용 필드다.
 *
 * ## 알려진 한계
 * 상속 토지의 §104②1호 **단기보유 통산**(피상속인 취득일 합산)은 반영되지 않는다 —
 * 세율 판정이 자산 전체 단일(`acquisitionDate` 기준)이기 때문으로, 이는 split 경로의
 * 기존 한계다(`transfer-tax-split-gain.ts:350-353` "단기세율 혼합 케이스 미구현").
 * 장기보유특별공제는 파트별 보유기간으로 정상 적용된다(`transfer-tax-helpers.ts`).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LandBuildingSaleSplitSection } from "./LandBuildingSaleSplitSection";
import { saleStdPlacement } from "@/lib/calc/transfer-tax-split-acq-mode";
import { isLandBuildingSplitable } from "./AssetOwnershipSplitSection";
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

  if (asset.acquisitionCause !== "newConstruction") return null;
  if (!isLandBuildingSplitable(asset.assetKind)) return null;
  // 겸용주택은 자체 4부분 안분이 축을 지배한다.
  if (asset.isMixedUseHouse) return null;

  const active = !!asset.landAcquisitionCause;
  const cause = (asset.landAcquisitionCause || "inheritance") as LandCause;
  const meta = CAUSE_META[cause];

  // 양도시 기준시가 배치 — 축 A와 **같은 1회 계산**을 공유한다(하위 재파생 금지 규약).
  // 두 파트 모두 확인된 취득가액(actual)이라 환산 분모는 쓰이지 않는다.
  const saleStdPlace = saleStdPlacement({
    saleSplitMode: asset.saleSplitMode ?? "apportioned",
    landMode: "actual",
    buildingMode: "actual",
    selfOwns: asset.selfOwns ?? "both",
  });

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
              (소득세법 시행령 §166⑥·§95④).
            </p>
          </ToneCard>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-amber-800">토지 취득 원인</p>
            <div data-testid="land-acq-cause">
              <RadioCardGroup
                name="landAcquisitionCause"
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
          </div>

          <p className="text-caption text-muted-foreground">
            건물 취득가액은 아래 <strong>신축비용</strong> 칸을, 건물 취득일은 위{" "}
            <strong>사용승인일 등 4시점</strong>을 사용합니다.
          </p>

          {/* 축 A — 양도가액을 토지·건물로 구분(§166⑥). 두 파트의 양도차익을 나누려면 필수. */}
          <LandBuildingSaleSplitSection
            isBurdenedGift={asset.transferType === "burdened_gift"}
            saleSplitMode={asset.saleSplitMode ?? "apportioned"}
            onSaleSplitModeChange={(v) => onChange({ saleSplitMode: v })}
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
