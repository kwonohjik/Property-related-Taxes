"use client";

/**
 * 의제취득일(1985.1.1.) 전 상속·증여 — ③ 환산취득가액의 분자(의제취득일 기준시가)·분모(양도시 기준시가) 입력 (PR-5에서 분리).
 *
 * 상속(`PreDeemedInputs`)과 증여(`GiftPreDeemedConversionSection`)가 같은 칸·같은 자동값 규약을 쓴다.
 * ③ = 양도가액 × 의제취득일 기준시가 ÷ 양도시 기준시가 (영 §163⑫ → §176조의2④ → ②2호, 엔진 `calcPreDeemed`).
 * 토지는 §164④ 등급 환산값, 주택은 §164⑦ 3시점 환산값이 있으면 분자에 자동으로 쓰인다(엔진 `inheritance-acquisition-helpers.ts`의
 * 자동 주입과 같은 결과). 주택은 「양도 당시 공시된 개별주택가격」이 분모 자동값이다.
 */
import { useMemo, type ReactNode } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LAW_BADGE_CLASS } from "@/components/calc/shared/lawBadge";
import { preDeemedAutoStdPrices } from "@/lib/calc/pre-deemed-auto-std-price";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 상속개시일 또는 증여일 — 3시점·등급 환산의 기준일 */
  baseDate: string;
  /** §164⑦ 3시점 입력이 열려 있는가(주택) — 분자·분모 자동값의 출처 */
  showHouseValuation: boolean;
  /** 두 칸 사이에 둘 입력(상속 토지의 등급 환산 위젯). 증여는 등급 입력이 ② 섹션에 있어 비운다. */
  between?: ReactNode;
  /** 재개발 종전자산은 ③이 §166③이라 두 칸을 숨긴다(`between`만 그린다). */
  hideFields?: boolean;
}

export function PreDeemedConversionFields({ asset, onChange, transferDate, baseDate, showHouseValuation, between, hideFields }: Props) {
  const isLand = asset.assetKind === "land";
  // hint 텍스트: 자산 종류에 따라 다르게 표시
  // 토지 등급 입력이 두 칸 사이(`between` — 상속)에 있으면 「아래」, 없으면(증여 — 위 §164④ 섹션) 「위」다.
  const stdPriceHint = isLand
    ? between
      ? "1985.1.1. 개별공시지가 × 면적. 아래 토지등급가액 환산을 사용하면 자동 입력됩니다."
      : "1985.1.1. 개별공시지가 × 면적. 위 §164④ 토지등급을 모두 입력하면 그 환산값이 자동으로 쓰입니다."
    : "국세청 기준시가 직접 입력.";

  // 자동값 — ④ 전송 판단과 같은 단일 소스(`lib/calc/pre-deemed-auto-std-price.ts`).
  const auto = useMemo(
    () => preDeemedAutoStdPrices(asset, baseDate, showHouseValuation, transferDate),
    [asset, baseDate, showHouseValuation, transferDate],
  );
  const autoStdPriceAtTransfer = auto.atTransfer;
  const autoStdPriceAtAcq = auto.atDeemed;
  const stdPriceAtAcqAutoActive = autoStdPriceAtAcq !== null && !asset.useStandardPriceAtAcqOverride;
  const stdPriceAtTransferAutoActive = autoStdPriceAtTransfer !== null && !asset.useStandardPriceAtTransferOverride;

  return (
    <>
    {/* ① 의제취득일(1985.1.1.) 시점 기준시가 — 재개발은 ③이 §166③이라 숨긴다 */}
    {!hideFields && (
    <div className="space-y-1">
      <FieldCard
        field="standardPriceAtAcq"
        label={showHouseValuation ? "의제취득일(1985.1.1.) 시점 합계 기준시가" : "의제취득일(1985.1.1.) 시점 기준시가"}
        hint={
          stdPriceAtAcqAutoActive
            ? `자동 계산값: ${autoStdPriceAtAcq!.toLocaleString()} (위 환산 결과 사용 중). 직접 입력하려면 아래 직접 입력 토글을 켜세요.`
            : showHouseValuation
              ? "위 3-시점 환산 결과(토지+주택 합계)가 있으면 자동 계산됩니다. 또는 직접 입력."
              : stdPriceHint
        }
        disabled={stdPriceAtAcqAutoActive}
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §164"
            label="소령 §164"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <CurrencyInput
          label=""
          hideUnit
          value={
            stdPriceAtAcqAutoActive
              ? String(autoStdPriceAtAcq ?? "")
              : asset.standardPriceAtAcq
          }
          onChange={(v) => onChange({ standardPriceAtAcq: v })}
          disabled={stdPriceAtAcqAutoActive}
        />
      </FieldCard>
      {autoStdPriceAtAcq !== null && (
        <ToggleCard
          tone="amber"
          size="sm"
          title="의제취득일 시점 기준시가 직접 입력"
          checked={asset.useStandardPriceAtAcqOverride}
          onCheckedChange={(v) =>
            onChange({
              useStandardPriceAtAcqOverride: v,
              ...(!v && { standardPriceAtAcq: "" }),
            })
          }
        />
      )}
    </div>
    )}

      {between}
    {/* ② 양도시 기준시가 — 재개발은 숨긴다(위와 같은 이유) */}
    {!hideFields && (
    <div className="space-y-1">
      <FieldCard
        field="standardPriceAtTransfer"
        label="양도시 기준시가"
        unit="원"
        hint={
          stdPriceAtTransferAutoActive
            ? `자동 계산값: ${autoStdPriceAtTransfer!.toLocaleString()} (양도 당시 공시된 개별주택가격 사용). 직접 입력하려면 아래 직접 입력 토글을 켜세요.`
            : "환산취득가 공식 분모 — 양도일 직전 공시된 기준시가."
        }
        disabled={stdPriceAtTransferAutoActive}
      >
        <CurrencyInput
          label=""
          hideUnit
          value={
            stdPriceAtTransferAutoActive
              ? String(autoStdPriceAtTransfer ?? "")
              : asset.standardPriceAtTransfer
          }
          onChange={(v) => onChange({ standardPriceAtTransfer: v })}
          disabled={stdPriceAtTransferAutoActive}
        />
      </FieldCard>
      {autoStdPriceAtTransfer !== null && (
        <ToggleCard
          tone="emerald"
          size="sm"
          title="양도시 기준시가 직접 입력"
          checked={asset.useStandardPriceAtTransferOverride}
          onCheckedChange={(v) =>
            onChange({
              useStandardPriceAtTransferOverride: v,
              ...(!v && { standardPriceAtTransfer: "" }),
            })
          }
        />
      )}
    </div>
    )}

    </>
  );
}
