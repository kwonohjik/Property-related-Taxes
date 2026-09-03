"use client";

/**
 * 지분율 입력 위젯 (양도세 자산 카드 — 단일 백분율 %).
 *
 * UI는 1칸 백분율(%) 입력. 내부 모델은 분자/분모(numerator/denominator) 유지 —
 * 입력 %는 numerator=%, denominator="100"으로 저장(ratio = %/100). 다운스트림
 * (getOwnershipRatio·applyRatio·validate·isFullFractionalBundle)은 무변경.
 *
 * 라벨은 문맥별(호출부 결정): 지분 분할 취득 = "취득 지분율" / 공유 소유·부분소유 = "공유 지분율".
 * 배지("100% 기준 입력")는 개별 ratio(분자<분모)로 게이트 — 계산 방식 신호(라벨 축과 별개).
 *
 * 사용자 입력은 100% 기준 모든 금액(양도가·취득가·필요경비). API 변환 시 × ratio 자동 적용.
 *
 * 참고: 예제 사례 27 (아파트 2회 지분취득) 패턴.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { isFractionalRatioStr } from "@/lib/calc/transfer-tax-api-helpers";
import { cn } from "@/lib/utils";

/** 자산 분할 모드 — 토글 A(함께양도)·토글 B(지분분할)·없음. Step1↔③ 4레벨 prop 공유 타입. */
export type AssetSplitMode = "none" | "companion" | "fractional";

export interface OwnershipRatioInputProps {
  /** 분자 (문자열) */
  numerator: string;
  /** 분모 (문자열) */
  denominator: string;
  /** onChange — 부분 업데이트 patch 전달 */
  onChange: (patch: { numerator?: string; denominator?: string }) => void;
  /** 라벨 — 문맥별 결정(호출부). 기본 "공유 지분율", 지분 분할 모드는 "취득 지분율". */
  label?: string;
}

/**
 * `OwnershipRatioBlock` 전용 추가 props — 「나머지 지분은 타인 소유」 선언 (R4).
 *
 * **두 값이 모두 주어질 때만** 토글을 렌더한다. 지분 분할 모드(③ 취득정보)의 호출부는
 * 넘기지 않으므로 그쪽에는 뜨지 않는다 — 축 B에는 이 선언이 뜻이 없다(게이트가 다르다).
 */
export interface OwnershipRemainderProps {
  /** 선언값 — `"yes"`면 축 A(공유 소유)임을 사용자가 선언한 것. */
  remainderThirdParty?: "" | "yes";
  /** 선언 변경 핸들러. */
  onRemainderChange?: (v: "" | "yes") => void;
}

/**
 * @deprecated `lib/calc/transfer-tax-api-helpers`의 `isFractionalRatioStr` 사용 권장.
 * 본 export는 기존 호출부 호환을 위해 유지 (CompanionAssetCard 등). 단일 진실 공급원에 위임.
 */
export const isFractionalMode = isFractionalRatioStr;

export function OwnershipRatioInput({
  numerator,
  denominator,
  onChange,
  label = "공유 지분율",
}: OwnershipRatioInputProps) {
  const fractional = isFractionalRatioStr(numerator, denominator);

  // 백분율 표시값 — 내부 모델은 분자/분모 유지. 신규 입력은 분모=100(백분율)로 저장하고,
  // 레거시 데이터(분모≠100, 예 1/2)는 백분율로 환산해 표시.
  const pctValue =
    numerator === ""
      ? ""
      : denominator === "" || denominator === "100"
        ? numerator
        : (() => {
            const n = parseFloat(numerator);
            const d = parseFloat(denominator);
            return isFinite(n) && isFinite(d) && d > 0
              ? String(parseFloat(((n / d) * 100).toFixed(4)))
              : numerator;
          })();

  return (
    <FieldCard
      label={label}
      hint="소유·취득 지분을 백분율(%)로 입력 (단독 소유는 100)"
      trailing={
        fractional ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-micro font-semibold text-amber-800">
            100% 기준 입력
          </span>
        ) : null
      }
    >
      <div className="flex items-center gap-2">
        <div className="w-28">
          <DecimalInput
            value={pctValue}
            // 백분율 입력 → 분자=입력값, 분모=100 (내부 ratio = 입력/100).
            onChange={(v) => onChange({ numerator: v, denominator: "100" })}
            placeholder="지분율"
          />
        </div>
        <span
          className={cn("text-sm font-semibold text-muted-foreground select-none")}
        >
          %
        </span>
      </div>
    </FieldCard>
  );
}

/**
 * 지분율 입력 + **100% 기준 입력 안내**를 한 덩어리로 묶은 블록 (2026-08-11 추출).
 *
 * 두 섹션이 배타적으로 렌더한다 — 지분 분할 모드는 ③ 취득정보 최상단(취득시기·원인이 지분마다
 * 다른 최상위 분기라 그 자산을 규정하는 첫 입력값), 그 외에는 ① 기본정보 끝(자산 정체성).
 * 위젯과 안내가 갈라지면 한쪽에만 안내가 붙는 사고가 나므로 **함께** 옮긴다.
 */
export function OwnershipRatioBlock({
  numerator,
  denominator,
  onChange,
  label,
  remainderThirdParty,
  onRemainderChange,
}: OwnershipRatioInputProps & OwnershipRemainderProps) {
  const fractional = isFractionalRatioStr(numerator, denominator);
  return (
    <>
      <OwnershipRatioInput
        numerator={numerator}
        denominator={denominator}
        onChange={onChange}
        label={label}
      />
      {/* 「나머지 지분은 타인 소유」 선언 (R4) — 지분율 < 100%일 때만.
          100%면 축 A/B 구별이 무의미해 뜻 없는 선택을 강요하게 된다.
          자동판정 금지: 폼 데이터로는 「공유 소유」와 「다회 분할취득 오입력」이 구별되지 않는다.
          계획서: docs/02-design/features/transfer-fractional-single-asset-declaration.plan.md */}
      {fractional && onRemainderChange && (
        <ToggleCard
          checked={remainderThirdParty === "yes"}
          onCheckedChange={(v) => onRemainderChange(v ? "yes" : "")}
          tone="violet"
          title="이 물건의 나머지 지분은 타인 소유입니다"
          description="켜면 이 자산 1건만으로 계산합니다. 나머지 지분도 내 것(같은 물건을 여러 번에 나눠 취득)이라면 끄고 그 지분을 별도 자산으로 추가하세요 — 켜면 그 지분이 계산에서 빠집니다."
        />
      )}
      {fractional && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50/70 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className="text-amber-600 font-bold text-base leading-none mt-0.5"
            >
              ⚠
            </span>
            <div className="space-y-1.5 flex-1">
              <p className="font-semibold text-amber-900">
                지분 모드 — 모든 금액을{" "}
                <span className="underline">100% 기준</span>으로 입력하세요
              </p>
              <ul className="text-xs text-amber-800 space-y-0.5 leading-relaxed list-disc list-inside">
                <li>
                  <strong>양도가액·취득가액·필요경비</strong>는 물건 전체(100%) 기준으로
                  입력합니다. 시스템이 지분율({numerator}/{denominator})을 자동으로 적용합니다.
                </li>
                <li>
                  예: 60% 지분의 실제 매매가 600,000,000원 → 100% 기준{" "}
                  <strong>1,000,000,000원</strong>으로 입력 (600M ÷ 0.6).
                </li>
                <li>
                  상속 보충적평가는 공동주택가격(100%)을 그대로 입력하면 됩니다.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
