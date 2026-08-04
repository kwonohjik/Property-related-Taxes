"use client";

/**
 * 신축주택 부수토지 한도 산정 섹션 (영 §154⑦, 2022년 개정 후 3단계)
 *
 * 건물 정착면적 × 배율 = 부수토지 인정 한도
 *   - 수도권 도시지역(주거·상업·공업): 3배
 *   - 수도권 녹지 또는 수도권 외 도시지역: 5배
 *   - 도시지역 외: 10배
 *
 * companion 토지 면적이 한도를 초과하면 초과분은 일반 나대지로 분리과세.
 *
 * 렌더 조건:
 *   - acquisitionCause === "newConstruction" 이거나
 *   - isMixedUseHouse === true (겸용주택 PHD 재사용 컨텍스트)
 * 단, 이 컴포넌트는 신축주택 케이스 전용으로 호출 측에서 조건 제어.
 *
 * tone: sky (면적·규모 섹션)
 * 규칙: DecimalInput 사용 (소수점 허용), RadioCardGroup 사용 (3옵션 zone 선택)
 */

import { useMemo } from "react";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";

type AppurtenantLandZone =
  | "metropolitan_residential"
  | "non_metropolitan_or_green"
  | "non_urban";

/**
 * ⚠️ **표시 전용**이다 — 입력 콜백을 받지 않는다(2026-08-04).
 *
 * 정착면적·소재지 구분 두 필드는 **① 기본정보**가 입력받는다
 * (`asset-sections/AssetAreaSection.tsx:481·514` — 축 C). 종전에는 이 카드가 같은 두 필드를
 * **같은 옵션 문구의 같은 위젯**으로 한 번 더 입력받았고(`AssetAreaSection.tsx:157` 주석이
 * 그 중복을 기록하고 있다), 그 상태로 신축주택(`acquisitionCause === "newConstruction"` +
 * `assetKind === "housing"`)에서 ①과 동시에 렌더됐다.
 *
 * 🔴 단순 중복을 넘어 **표시와 저장이 어긋났다**: 여기서는 `?? "metropolitan_residential"`
 * display fallback을 걸어 미선택 상태를 "수도권 도시지역 3배 **선택됨**"으로 보여주고
 * 한도까지 계산해 줬지만, store는 `undefined`로 남아
 * `transfer-tax-validate-split.ts:117-126`이 "「부수토지 소재지 구분」을 선택하세요"로
 * **차단**했다(memory `feedback_store_default_vs_ui_display_fallback`).
 * 게다가 그 3배 fallback은 같은 validate 주석의 R-7이 "초과면적을 과다 산출해 **납세자에게
 * 불리**"하다고 명시한 바로 그 가정이다.
 *
 * ⇒ 입력은 ① 하나로 모으고, 이 카드는 **한도 계산 결과만** 보여준다.
 *   미선택이면 3배를 가정하지 않고 계산을 **생략**한다(R-7).
 * anchor: `__tests__/components/new-construction-footprint-display-only.anchor.test.tsx`
 */
interface Props {
  /** 건물 정착면적 (㎡, 문자열) — ① 기본정보가 입력한 값 */
  buildingFootprintArea: string;
  /** 부수토지 인정 zone (3/5/10배 결정) — ① 기본정보가 입력한 값. `undefined` = 미선택 */
  appurtenantLandZone: AppurtenantLandZone | undefined;
  /** companion 토지 면적 (㎡, 문자열) — 한도 초과 판정용. 없으면 계산 생략 */
  companionLandArea?: string;
}

const ZONE_OPTIONS: ReadonlyArray<{
  value: AppurtenantLandZone;
  label: string;
  description: string;
  multiplier: number;
}> = [
  {
    value: "metropolitan_residential",
    label: "수도권 도시지역 (주거·상업·공업)",
    description: "수도권정비계획법상 수도권 도시지역의 주거·상업·공업지역 — 정착면적 × 3배 한도",
    multiplier: 3,
  },
  {
    value: "non_metropolitan_or_green",
    label: "수도권 녹지 / 수도권 외 도시지역",
    description: "수도권 도시지역 중 녹지지역 또는 수도권 밖 도시지역 — 정착면적 × 5배 한도",
    multiplier: 5,
  },
  {
    value: "non_urban",
    label: "도시지역 외",
    description: "국토계획법상 도시지역 이외 (관리·농림·자연환경보전 등) — 정착면적 × 10배 한도",
    multiplier: 10,
  },
];

/**
 * 미선택(`undefined`)은 **`null`**이다 — 3배로 가정하지 않는다.
 * 그 가정은 `transfer-tax-validate-split.ts` R-7이 "초과면적을 과다 산출해 납세자에게 불리"로
 * 배제한 것이고, 엔진도 미선택 시 배율 판정 자체를 하지 않는다.
 */
function multiplierOf(zone: AppurtenantLandZone | undefined): number | null {
  switch (zone) {
    case "metropolitan_residential":
      return 3;
    case "non_metropolitan_or_green":
      return 5;
    case "non_urban":
      return 10;
    default:
      return null; // 미선택 — 계산 생략 (R-7: 3배 가정은 납세자에게 불리)
  }
}

function zoneLabel(zone: AppurtenantLandZone | undefined): string {
  return ZONE_OPTIONS.find((o) => o.value === zone)?.label ?? "미선택";
}

export function NewConstructionFootprintSection({
  buildingFootprintArea,
  appurtenantLandZone,
  companionLandArea,
}: Props) {
  const footprint = parseDecimal(buildingFootprintArea) || 0;
  const multiplier = multiplierOf(appurtenantLandZone);
  // 미선택이면 한도가 정의되지 않는다 — 0으로 떨어뜨리면 "전량 초과"라는 거짓 판정이 된다.
  const limitArea = multiplier !== null ? footprint * multiplier : null;

  const companionArea = companionLandArea ? parseDecimal(companionLandArea) || 0 : 0;
  const hasCompanionArea = companionArea > 0;
  const excessArea =
    hasCompanionArea && limitArea !== null ? Math.max(0, companionArea - limitArea) : 0;

  const isExcess = hasCompanionArea && limitArea !== null && excessArea > 0;

  const limitJudgment = useMemo(() => {
    if (!footprint || footprint <= 0) return null;
    if (!hasCompanionArea) return null;
    if (limitArea === null) return null;
    if (isExcess) {
      return {
        type: "excess" as const,
        message: `동반 토지 ${companionArea.toFixed(2)}㎡ > 인정 한도 ${limitArea.toFixed(2)}㎡ → 초과분 ${excessArea.toFixed(2)}㎡은 일반 나대지로 분리과세됩니다 (§154⑦)`,
      };
    }
    return {
      type: "ok" as const,
      message: `동반 토지 ${companionArea.toFixed(2)}㎡ ≤ 인정 한도 ${limitArea.toFixed(2)}㎡ → 전량 부수토지 인정 (§154⑦)`,
    };
  }, [footprint, companionArea, limitArea, excessArea, isExcess, hasCompanionArea]);

  return (
    <ToneCard tone="sky" sectionNum="§" bodyClassName="space-y-3" title="부수토지 한도 산정 (소득세법 시행령 §154⑦)" noDark>

      <p className="text-caption text-sky-600 leading-relaxed">
        주택과 함께 양도되는 부수토지의 인정 한도 = 건물 정착면적 × 배율.
        수도권 도시지역(주거·상업·공업)은 3배, 수도권 녹지·수도권 외 도시지역은 5배, 도시지역 외는 10배입니다.
        한도 초과분은 일반 나대지로 분리하여 토지 보유기간 기준 세율을 적용합니다.
      </p>

      {/* ①② 입력값 표시 — 두 필드 모두 ① 기본정보가 입력한다(파일 상단 Props 주석).
          여기에 입력 위젯을 다시 넣지 말 것. 특히 소재지 구분에 display fallback
          (`?? "metropolitan_residential"`)을 걸면 store가 미선택인데 선택된 것처럼 보여
          validate 차단과 어긋난다 — 그것이 이 카드가 표시 전용이 된 이유다. */}
      <div className="rounded-md border border-sky-200 bg-white/60 px-3 py-2 text-caption text-sky-900 space-y-1">
        <p>
          <b>건물 정착면적</b>{" "}
          {footprint > 0 ? `${buildingFootprintArea}㎡` : "— 미입력"}
        </p>
        <p>
          <b>소재지 구분</b>{" "}
          {appurtenantLandZone
            ? `${zoneLabel(appurtenantLandZone)} (×${multiplier}배)`
            : "— 미선택"}
        </p>
        <p className="text-sky-600">
          두 값 모두 <b>① 기본정보</b>에서 입력합니다.
        </p>
      </div>

      {/* 소재지 미선택 안내 — 3배를 가정해 한도를 보여주지 않는다(R-7). */}
      {footprint > 0 && limitArea === null && (
        <div className="rounded-md bg-sky-100/60 border border-sky-200 px-3 py-2 text-caption text-sky-800">
          ① 기본정보에서 <b>부수토지 소재지 구분</b>을 선택하면 인정 한도를 계산합니다.
          배율(3·5·10배)이 정해지지 않은 상태에서는 한도를 임의로 가정하지 않습니다.
        </div>
      )}

      {/* 자동 계산 결과 박스 */}
      {footprint > 0 && limitArea !== null && (
        <div className="rounded-md bg-sky-100/60 border border-sky-200 px-3 py-2 text-caption text-sky-800 space-y-1">
          <p className="font-semibold">부수토지 인정 한도 계산:</p>
          <p>
            건물 정착면적 {buildingFootprintArea}㎡ × {multiplier}배({zoneLabel(appurtenantLandZone)}) = <strong>{limitArea.toFixed(2)}㎡</strong>
          </p>
          {limitJudgment && (
            <p
              className={
                limitJudgment.type === "excess"
                  ? "text-rose-700 font-semibold"
                  : "text-sky-700"
              }
            >
              {limitJudgment.message}
            </p>
          )}
        </div>
      )}

      {/* 한도 초과 경고 배지 */}
      {isExcess && (
        <div className="rounded px-2 py-1.5 text-xs bg-rose-100 border border-rose-300 text-rose-800">
          <strong>부수토지 한도 초과 {excessArea.toFixed(2)}㎡</strong> —
          초과분은 일반 토지로 분리과세됩니다 (§154⑦).
          결과 표에서 &quot;토지(부수)&quot;와 &quot;토지(한도초과)&quot; 행이 분리 표시됩니다.
        </div>
      )}
    </ToneCard>
  );
}
