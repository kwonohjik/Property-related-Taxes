"use client";

/**
 * 이월과세(증여) ② 증여자 취득가액 — 환산 방식 선택 + 입력 패널
 *
 * useEstimatedAcquisition === true 시에만 렌더됨.
 * 환산 방식 3가지: general(일반 기준시가) / phd(개별주택가격 미공시) / apd(공동주택 최초고시 전)
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PreHousingDisclosureSection } from "./PreHousingDisclosureSection";
import { isFractionalOwnership } from "@/lib/calc/transfer-tax-api-helpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm, CarryoverEstimationMode } from "@/lib/stores/calc-wizard-asset-carryover";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";

// ── 법령 배지 ────────────────────────────────────────────────────
function LegalBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
      {text}
    </span>
  );
}

// ── 환산 방식 옵션 ────────────────────────────────────────────────
const ESTIMATION_MODE_OPTIONS: {
  value: CarryoverEstimationMode;
  label: string;
  description: string;
}[] = [
  {
    value: "general",
    label: "일반 기준시가 환산",
    description: "취득시·양도시 공동주택가격(또는 개별주택가격)을 직접 입력 (§97①1호 나목, 시행령 §163⑨)",
  },
  {
    value: "phd",
    label: "개별주택가격 미공시 §164⑤",
    description: "증여자 취득 당시 개별주택가격이 공시되지 않은 경우 — 3-시점 환산 방식 적용",
  },
  {
    value: "apd",
    label: "공동주택 최초고시 전 취득",
    description: "공동주택(아파트 등) 최초 공시일 이전에 증여자가 취득한 경우",
  },
];

interface Props {
  asset: AssetForm;
  carryover: CarryoverTaxationForm;
  transferDate: string;
  onCarryoverChange: (patch: Partial<CarryoverTaxationForm>) => void;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function CarryoverEstimationSection({
  asset,
  carryover: c,
  transferDate,
  onCarryoverChange,
  onAssetChange,
}: Props) {
  return (
    <div className="space-y-3">
      {/* 환산 방식 선택 */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-amber-800">환산 방식 선택</p>
        <RadioCardGroup
          name="carryoverEstimationMode"
          tone="amber"
          layout="stack"
          options={ESTIMATION_MODE_OPTIONS}
          value={c.estimationMode ?? ""}
          onChange={(v) =>
            onCarryoverChange({ estimationMode: v as CarryoverEstimationMode })
          }
        />
      </div>

      {/* 일반 기준시가 환산 입력 */}
      {c.estimationMode === "general" && (
        <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3">
          <p className="text-xs font-semibold text-amber-700">
            취득시·양도시 기준시가 입력
          </p>
          <p className="text-xs text-muted-foreground">
            환산취득가 = 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가)
            <br />
            개산공제 = 취득시 기준시가 × 3% (소득세법 시행령 §163⑥)
          </p>

          {/*
            지분(공유) 모드 — 기준시가 2칸은 ④ 변환에서 **의도적으로 미스케일**이다
            (`transfer-tax-api-carryover.ts` topLevelOverrides · `-gb-carryover.ts` PART_SCALE).
            위 환산 산식에서 분자·분모로 함께 나타나 지분율이 약분되므로, 두 칸 모두
            공시된 가격(물건 전체 기준)을 그대로 넣어야 기준이 맞는다.
            판정 술어는 `OwnershipRatioInput`과 동일 소스(`isFractionalOwnership`).
          */}
          {isFractionalOwnership(asset) && (
            <p className="text-xs text-amber-800">
              지분 모드 — 취득시·양도시 기준시가는 공시된 가격(물건 전체 기준)을 두 칸 모두 그대로
              입력합니다. 지분율로 나누지 않습니다.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 시행령 §163 ⑥" label="시행령 §163⑥" />
          </div>

          <FieldCard
            label="취득시 기준시가"
            hint="증여자 취득일 기준 공동주택가격 또는 개별주택가격 (부동산공시가격알리미 조회)"
            trailing={<LegalBadge text="시행령 §163⑨" />}
          >
            <CurrencyInput
              label=""
              value={c.donorStandardPriceAtAcquisition}
              onChange={(v) => onCarryoverChange({ donorStandardPriceAtAcquisition: v })}
              placeholder="취득시 기준시가 (원)"
            />
          </FieldCard>

          <FieldCard
            label="양도시 기준시가"
            hint="양도일 기준 공동주택가격 또는 개별주택가격 (부동산공시가격알리미 조회)"
          >
            <CurrencyInput
              label=""
              value={c.donorStandardPriceAtTransfer}
              onChange={(v) => onCarryoverChange({ donorStandardPriceAtTransfer: v })}
              placeholder="양도시 기준시가 (원)"
            />
          </FieldCard>

          {/* 환산취득가 미리보기 */}
          {parseAmount(c.donorStandardPriceAtAcquisition) > 0 &&
            parseAmount(c.donorStandardPriceAtTransfer) > 0 && (
              <div className="rounded bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                <span className="font-medium">개산공제 (참고)</span>
                <br />
                개산공제 = 취득시 기준시가{" "}
                <span className="font-mono tabular-nums whitespace-nowrap">
                  {parseAmount(c.donorStandardPriceAtAcquisition).toLocaleString()}
                </span>{" "}
                × 3% ={" "}
                <span className="font-mono tabular-nums whitespace-nowrap">
                  {Math.floor(parseAmount(c.donorStandardPriceAtAcquisition) * 0.03).toLocaleString()}
                </span>
              </div>
            )}
        </div>
      )}

      {/* PHD §164⑤ 입력 — PreHousingDisclosureSection 재사용 */}
      {c.estimationMode === "phd" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground text-amber-700">
            증여자 취득일이 개별주택가격 최초 고시 이전인 경우, 3-시점 기준시가로 취득시가를 역산합니다.
            <br />
            취득일은 증여자 취득일(위 ① 섹션 입력값)을 사용합니다.
          </p>
          <PreHousingDisclosureSection
            asset={{
              ...asset,
              // 증여자 취득일을 acquisitionDate로 주입 — PHD 3-시점 역산의 취득 시점
              acquisitionDate: c.donorAcquisitionDate || asset.acquisitionDate,
              usePreHousingDisclosure: true,
            }}
            transferDate={transferDate}
            onChange={(patch) => {
              // PHD 필드는 asset 수준 phdXxx 필드에 저장 (기존 PHD와 동일 경로)
              // usePreHousingDisclosure 변경은 무시 (carryover 모드 선택으로 제어)
              const { usePreHousingDisclosure: _, ...rest } = patch;
              onAssetChange(rest);
            }}
          />
        </div>
      )}

      {/* APD — 공동주택 최초고시 전 (PHD와 동일 경로 재사용) */}
      {c.estimationMode === "apd" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground text-amber-700">
            공동주택(아파트 등)이 최초로 공시된 날 이전에 증여자가 취득한 경우,
            최초공시일을 기준으로 공동주택가격 3-시점 역산을 적용합니다.
          </p>
          <PreHousingDisclosureSection
            asset={{
              ...asset,
              acquisitionDate: c.donorAcquisitionDate || asset.acquisitionDate,
              usePreHousingDisclosure: true,
            }}
            transferDate={transferDate}
            onChange={(patch) => {
              const { usePreHousingDisclosure: _, ...rest } = patch;
              onAssetChange(rest);
            }}
          />
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _defaults = CARRYOVER_DEFAULTS;
