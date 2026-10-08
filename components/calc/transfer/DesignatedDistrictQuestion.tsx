"use client";

/**
 * 「지정 지구 안인가」 질문 — 소재 법정동이 **동 안 일부 지구만 조정대상지역**이었던 동일 때만 뜬다.
 *
 * 예: 2019.11.8.~2020.6.18. 고양시 일산서구 대화동은 「킨텍스1단계 도시개발지구」만 조정대상지역이었다.
 * 법정동 코드로는 지구 안·밖을 가를 수 없으므로 사용자가 고른다(사용자 결정 2026-10-08). 고르지 않으면 엔진은
 * 지정 지구 안으로 보고(모름=불리) 확인 필요를 낸다. 값은 위치 사실이라 취득·양도·신규 취득 판정이 같은 값을 쓴다.
 *
 * 양도 주택·명부 행·분양권/입주권 행이 같은 위젯을 쓴다(엔진 `isRegulatedByBjdCode`의 `inDistrict`).
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { designatedDistrictsForCode } from "@/lib/tax-engine/data/regulated-areas";

const dot = (d: string) => `${d.replace(/-/g, ".")}.`;

interface Props {
  regionCode: string | undefined;
  value: boolean | undefined;
  onChange: (inDistrict: boolean) => void;
  /** 같은 화면에 여러 개가 뜰 수 있어 셀렉터·radio name을 가른다 */
  idSuffix: string;
}

export function DesignatedDistrictQuestion({ regionCode, value, onChange, idSuffix }: Props) {
  const districts = designatedDistrictsForCode(regionCode);
  if (districts.length === 0) return null;
  return (
    <ToneCard tone="amber" title="조정대상지역 지정 지구 안인가요?">
      <div data-testid={`designated-district-question-${idSuffix}`} className="space-y-2">
        {districts.map((d) => (
          <p key={`${d.district}-${d.appliesFrom ?? ""}`} className="text-xs leading-relaxed">
            {d.area}은{" "}
            {d.appliesFrom || d.appliesTo
              ? `${d.appliesFrom ? dot(d.appliesFrom) : ""}~${d.appliesTo ? dot(d.appliesTo) : ""} 동안 `
              : "지정 기간 동안 "}
            동 전체가 아니라 <b>{d.district}</b>만 조정대상지역이었습니다.
          </p>
        ))}
        <RadioCardGroup
          name={`designated-district-${idSuffix}`}
          layout="inline"
          tone="amber"
          value={value === undefined ? "" : value ? "in" : "out"}
          onChange={(v) => onChange(v === "in")}
          options={[
            { value: "in", label: "지구 안", testId: `designated-district-in-${idSuffix}` },
            { value: "out", label: "지구 밖", testId: `designated-district-out-${idSuffix}` },
          ]}
        />
        <p className="text-caption text-muted-foreground">
          고르지 않으면 지구 안으로 보고 조정대상지역으로 판정합니다(확인 필요).
        </p>
      </div>
    </ToneCard>
  );
}
