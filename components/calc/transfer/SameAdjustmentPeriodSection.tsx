"use client";

/**
 * 동일조정기간 내 취득·양도 시 「양도당시 기준시가」 환산 — ⑤ 입력 위젯
 *
 * 근거: 소득세법 시행령 §164⑧ · 시행규칙 §80①~⑤
 *
 * ## 왜 필요한가
 *
 * 보유기간 중 새 기준시가가 고시되지 않으면 취득·양도 기준시가가 **같아진다**(§164③).
 * 환산취득가액 = 양도가액 × (취득기준시가 ÷ 양도기준시가)에서 분자·분모가 같아지므로
 * **환산취득가액이 양도가액과 일치해 양도차익이 0**이 된다. §164⑧은 그 구간에서
 * 기준시가 상승률로 양도당시 기준시가를 보정해 과세를 성립시키는 규정이다.
 *
 * ## 노출 게이트
 *
 * 환산취득가액 모드 + 취득·양도 기준시가가 **같을 때만** 뜬다. 다르면 §164⑧ 요건 자체가
 * 성립하지 않아 입력받을 이유가 없다(입력해도 엔진이 no-op).
 *
 * ⚠️ 게이트가 유일한 입력 경로를 지우지 않도록, 기간 요건(§80①1호) 미충족은 **숨기지 않고**
 *    안내로 알린다 — 숨기면 사용자가 왜 칸이 없는지 알 수 없다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  noticeYearFor,
  priorNoticeYearFor,
  deriveAdjustmentMonths,
} from "@/lib/calc/same-adjustment-period-lookup";
import { resolveSapPriorStdPrice } from "@/lib/calc/transfer-same-adjustment-period-input";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** §80①1호 기간 요건 — 취득일이 속하는 연도의 다음 연도 말일 이전 양도 */
export function isWithinSameAdjustmentWindow(
  acquisitionDate: string | undefined,
  transferDate: string | undefined,
): boolean {
  if (!acquisitionDate || !transferDate) return false;
  const acqYear = Number(acquisitionDate.slice(0, 4));
  const tsfYear = Number(transferDate.slice(0, 4));
  if (!Number.isFinite(acqYear) || !Number.isFinite(tsfYear)) return false;
  return tsfYear <= acqYear + 1;
}

export interface SameAdjustmentPeriodSectionProps {
  asset: Pick<
    AssetForm,
    | "sapEnabled"
    | "sapFormula"
    | "sapPriorStdPrice"
    | "sapNewStdPrice"
    | "sapAdjustMonths"
    | "sapPriorBasis"
    | "sapPriceSource"
    | "sapFirstNoticeStdPrice"
    | "sapNoticeBaseRate"
    | "sapPriorLandBuildingSum"
    | "sapAcqLandBuildingSum"
    | "standardPriceAtAcq"
    | "acquisitionDate"
  >;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate: string | undefined;
  /** 나목 선택 가능 여부 — 양도일부터 2월이 되는 날이 속한 월 말일까지 새 기준시가 고시 */
  newNoticeAvailable?: boolean;
  /** 소재지(PNU 조회용). 없으면 자동 조회 버튼 비활성 */
  jibun?: string;
  dong?: string;
  ho?: string;
  /**
   * 자산 종류 — 조회 API의 `propertyType`을 가른다.
   * 🔴 안 보내면 route 기본값이 `housing`이라 **토지 자산인데 주택 공시가격이 조회된다**
   *    (`app/api/address/standard-price/route.ts:221`).
   */
  assetKind?: string;
  /** 토지 면적(㎡) — 토지 조회는 **원/㎡**로 오므로 총액 환산에 필요하다 */
  landAreaSqm?: number;
}

export function SameAdjustmentPeriodSection({
  asset,
  onChange,
  transferDate,
  newNoticeAvailable = true,
  jibun,
  dong,
  ho,
  assetKind,
  landAreaSqm,
}: SameAdjustmentPeriodSectionProps) {
  const withinWindow = isWithinSameAdjustmentWindow(asset.acquisitionDate, transferDate);
  const formula = asset.sapFormula ?? "prev";
  const [lookupState, setLookupState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string }
  >({ status: "idle" });

  const canLookup = Boolean(jibun && asset.acquisitionDate);

  const priorBasis = asset.sapPriorBasis ?? "direct";
  const isDerivedBasis = priorBasis === "first_notice_rate" || priorBasis === "ratio_conversion";

  /**
   * §80③ 대체 산정값은 **저장하지 않는다** — 읽는 시점에 ④⑧과 같은 leaf로 구한다.
   *
   * onChange에서 계산해 적어 두면 3호의 피연산자인 「취득당시의 기준시가」가 **다른
   * 섹션**에서 바뀔 때 이 값만 낡은 채로 남는다. 화면·검증·엔진이 서로 다른 값을 보게 된다.
   * 저장하지 않으므로 근거를 「실제 전기 기준시가」로 되돌리면 직접 입력값이 그대로 살아 있다.
   */
  const derivedPrior = isDerivedBasis ? resolveSapPriorStdPrice(asset) : 0;

  /**
   * 전기의 기준시가 자동 조회 (§164③ 직전 고시분 + §80②1호 조정월수 파생).
   *
   * 조회 실패·미고시 지역은 **수동 입력을 그대로 열어둔다** — 자동 조회를 필수 게이트로
   * 만들면 입력 경로가 사라진다. 추정 공시일이면 조정월수는 채우지 않고 안내만 한다.
   */
  async function lookupPrior() {
    if (!canLookup || !asset.acquisitionDate) return;
    setLookupState({ status: "loading" });
    try {
      const priorYear = priorNoticeYearFor(asset.acquisitionDate);
      const acqYear = noticeYearFor(asset.acquisitionDate);
      // 🔴 `propertyType`을 반드시 보낸다 — 미지정 시 route 기본값이 `housing`이라
      //    토지 자산에서 개별공시지가 대신 주택 공시가격이 조회된다.
      const propertyType = assetKind === "land" ? "land" : "housing";
      const q = (y: number) =>
        `/api/address/standard-price?jibun=${encodeURIComponent(jibun!)}&year=${y}` +
        `&propertyType=${propertyType}` +
        (dong ? `&dong=${encodeURIComponent(dong)}` : "") +
        (ho ? `&ho=${encodeURIComponent(ho)}` : "");
      const [priorRes, acqRes] = await Promise.all([fetch(q(priorYear)), fetch(q(acqYear))]);
      if (!priorRes.ok) throw new Error("전기 기준시가를 찾지 못했습니다");
      const prior = await priorRes.json();
      const acq = acqRes.ok ? await acqRes.json() : undefined;

      /**
       * 토지 조회 결과는 **원/㎡**다(개별공시지가). 전기의 기준시가는 **총액**이므로
       * 면적을 곱해야 한다. 면적을 모르면 값을 채우지 않는다 — 단위가 다른 값을
       * 「자동 조회」 배지까지 달아 넣으면 검산 신호가 사라진다.
       */
      const rawPrice = Number(prior.price ?? 0);
      const priorTotal =
        propertyType === "land"
          ? (landAreaSqm && landAreaSqm > 0 ? Math.floor(rawPrice * landAreaSqm) : 0)
          : rawPrice;

      if (!(priorTotal > 0)) {
        setLookupState({
          status: "error",
          message:
            propertyType === "land" && !(landAreaSqm && landAreaSqm > 0)
              ? "토지는 개별공시지가(원/㎡)로 조회되어 면적이 필요합니다. 면적을 입력하거나 전기의 기준시가를 직접 넣으세요."
              : "조회 결과에 금액이 없습니다. 직접 입력하세요.",
        });
        return; // 🔴 기존 입력을 빈 값으로 덮어쓰지 않는다
      }

      const patch: Partial<AssetForm> = {
        sapPriorStdPrice: String(priorTotal),
        sapPriceSource: "lookup",
        sapPriorBasis: "direct",
      };
      const derived = deriveAdjustmentMonths("prev", acq, prior);
      if (derived.months !== null) {
        patch.sapAdjustMonths = String(derived.months);
        setLookupState({ status: "idle" });
      } else {
        setLookupState({
          status: "error",
          message:
            derived.reason === "estimated_notice_date"
              ? "공시일이 추정값이라 조정월수를 자동 계산하지 않았습니다. 결정일을 확인해 직접 입력하세요."
              : "공시일 정보가 없어 조정월수를 자동 계산하지 않았습니다. 직접 입력하세요.",
        });
      }
      onChange(patch);
    } catch (e) {
      setLookupState({
        status: "error",
        message: e instanceof Error ? e.message : "조회에 실패했습니다. 직접 입력하세요.",
      });
    }
  }

  return (
    <ToggleCard
      checked={asset.sapEnabled}
      onCheckedChange={(v) => onChange({ sapEnabled: v })}
      title="동일조정기간 양도당시 기준시가 환산"
      description="보유기간 중 새 기준시가가 고시되지 않아 취득·양도 기준시가가 같은 경우 (소득세법 시행령 §164⑧)"
      tone="sky"
      lawLinks="소득세법"
    >
      {!withinWindow && (
        <ToneCard tone="amber">
          취득일이 속하는 연도의 <strong>다음 연도 말일 이후</strong> 양도입니다. 시행규칙
          §80①2호에 따라 <strong>양도당시 기준시가는 취득당시 기준시가</strong>가 되며 환산은
          적용되지 않습니다. 아래 값을 입력해도 계산은 달라지지 않습니다.
        </ToneCard>
      )}

      <RadioCardGroup
        name="sapFormula"
        value={formula}
        onChange={(v) => onChange({ sapFormula: v })}
        tone="sky"
        lawLinks="소득세법"
        options={[
          {
            value: "prev" as const,
            label: "양도일까지 새 기준시가가 고시되지 않은 경우",
            description: "시행규칙 §80①1호 가목 — 취득당시 기준시가와 전기의 기준시가 차이로 보정",
            hint: "양도당시 = 취득당시 + (취득당시 − 전기) × 보유월수 ÷ 조정월수 (100분의 100 한도)",
          },
          {
            value: "new" as const,
            label: "양도일부터 2월이 되는 날이 속하는 월의 말일까지 새 기준시가가 고시된 경우",
            description: "시행규칙 §80①1호 나목 — 거주자가 이 산식으로 확정신고를 선택한 경우에 적용",
            hint: "양도당시 = 취득당시 + (새로운 − 취득당시) × 보유월수 ÷ 조정월수",
            disabled: !newNoticeAvailable,
          },
        ]}
      />

      {formula === "prev" && (
        <FieldCard
          label="전기의 기준시가 산정 근거"
          hint="해당 자산에 전기의 기준시가가 없으면 시행규칙 §80③에 따라 대체 산정한다. 2호·3호를 고르면 아래 피연산자로 값을 자동 산정한다."
        >
          <RadioCardGroup
            name="sapPriorBasis"
            value={priorBasis}
            onChange={(v) => onChange({ sapPriorBasis: v })}
            tone="sky"
            layout="inline"
            lawLinks="소득세법"
            options={[
              { value: "direct" as const, label: "실제 전기 기준시가", description: "§80②2호 — 취득당시 결정일 전일의 기준시가" },
              { value: "nearby_land" as const, label: "인근토지 전기 기준시가", description: "§80③1호 — 토지: 지목·이용상황이 유사한 인근토지" },
              { value: "first_notice_rate" as const, label: "최초고시 × 기준율", description: "§80③2호 — 건물: 국세청장 최초고시 기준시가 × 고시 기준율" },
              { value: "ratio_conversion" as const, label: "합계액 비율환산", description: "§80③3호 — 오피스텔·상업용건물·주택: 취득당시 × (전기 합계 ÷ 취득당시 합계)" },
            ]}
          />
        </FieldCard>
      )}

      {formula === "prev" && priorBasis === "first_notice_rate" && (
        <>
          <FieldCard
            label="국세청장이 최초로 고시한 기준시가"
            required
            hint="시행규칙 §80③2호 — 전기의 기준시가가 없는 건물의 대체 기준"
          >
            <CurrencyInput
              label="국세청장이 최초로 고시한 기준시가"
              hideLabel
              value={asset.sapFirstNoticeStdPrice ?? ""}
              onChange={(v) => onChange({ sapFirstNoticeStdPrice: v })}
            />
          </FieldCard>
          <FieldCard
            label="고시 기준율"
            required
            unit="%"
            hint="취득연도·신축연도·구조·내용연수를 고려하여 국세청장이 고시한 기준율 (시행규칙 §80③2호)"
          >
            <DecimalInput
              value={asset.sapNoticeBaseRate ?? ""}
              onChange={(v) => onChange({ sapNoticeBaseRate: v })}
              unit="%"
              data-testid="sap-notice-base-rate"
            />
          </FieldCard>
        </>
      )}

      {formula === "prev" && priorBasis === "ratio_conversion" && (
        <>
          <FieldCard
            label="전기의 토지·건물 기준시가 합계액"
            required
            hint="시행규칙 §80③3호 — 전기의 (가목 + 나목) 합계액"
          >
            <CurrencyInput
              label="전기의 토지·건물 기준시가 합계액"
              hideLabel
              value={asset.sapPriorLandBuildingSum ?? ""}
              onChange={(v) => onChange({ sapPriorLandBuildingSum: v })}
            />
          </FieldCard>
          <FieldCard
            label="취득당시의 토지·건물 기준시가 합계액"
            required
            hint="시행규칙 §80③3호 — 취득당시의 (가목 + 나목) 합계액. 취득당시 기준시가는 위 취득 정보에서 가져온다."
          >
            <CurrencyInput
              label="취득당시의 토지·건물 기준시가 합계액"
              hideLabel
              value={asset.sapAcqLandBuildingSum ?? ""}
              onChange={(v) => onChange({ sapAcqLandBuildingSum: v })}
            />
          </FieldCard>
        </>
      )}

      {formula === "prev" ? (
        <FieldCard
          label="전기의 기준시가"
          required
          hint={
            isDerivedBasis
              ? "위 피연산자로 시행규칙 §80③에 따라 산정한 값입니다. 직접 입력하려면 산정 근거를 「실제 전기 기준시가」로 되돌리세요."
              : "취득당시 기준시가 결정일 전일의 기준시가 (시행규칙 §80②2호)"
          }
          badge={
            isDerivedBasis
              ? "§80③ 산정"
              : asset.sapPriceSource === "lookup"
                ? "자동 조회"
                : undefined
          }
          trailing={
            isDerivedBasis ? undefined : (
              <Button
                type="button"
                variant="modalLauncher"
                onClick={lookupPrior}
                disabled={!canLookup || lookupState.status === "loading"}
              >
                {lookupState.status === "loading" ? "조회 중…" : "직전 고시분 조회"}
              </Button>
            )
          }
          warning={lookupState.status === "error" ? lookupState.message : undefined}
        >
          <CurrencyInput
            label="전기의 기준시가"
            hideLabel
            value={isDerivedBasis ? (derivedPrior > 0 ? String(derivedPrior) : "") : asset.sapPriorStdPrice}
            disabled={isDerivedBasis}
            onChange={(v) => onChange({ sapPriorStdPrice: v, sapPriceSource: "manual" })}
          />
        </FieldCard>
      ) : (
        <FieldCard
          label="새로운 기준시가"
          required
          hint="양도일 후 2월이 되는 날이 속하는 월의 말일까지 고시된 기준시가"
        >
          <CurrencyInput
            label="새로운 기준시가"
            hideLabel
            value={asset.sapNewStdPrice}
            onChange={(v) => onChange({ sapNewStdPrice: v, sapPriceSource: "manual" })}
          />
        </FieldCard>
      )}

      <FieldCard
        label="기준시가 조정월수"
        unit="개월"
        hint={
          formula === "prev"
            ? "전기의 기준시가 결정일부터 취득당시 기준시가 결정일 전일까지 (시행규칙 §80②1호). 비워두면 12개월"
            : "취득당시 기준시가 결정일부터 새로운 기준시가 결정일 전일까지 (시행규칙 §80②1호). 비워두면 12개월"
        }
      >
        <CurrencyInput
          label="기준시가 조정월수"
          hideLabel
          value={asset.sapAdjustMonths}
          onChange={(v) => onChange({ sapAdjustMonths: v })}
        />
      </FieldCard>

      <ToneCard tone="sky">
        보유기간 월수는 취득일·양도일에서 자동 계산됩니다. 1개월 미만의 일수는 1개월로 봅니다
        (시행규칙 §80⑤).
        {formula === "prev" && (
          <>
            {" "}계산 결과가 취득당시 기준시가보다 적으면 취득당시 기준시가를 양도당시 기준시가로
            합니다 (시행규칙 §80①1호 단서).
          </>
        )}
      </ToneCard>
    </ToggleCard>
  );
}
