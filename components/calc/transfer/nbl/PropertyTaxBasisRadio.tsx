"use client";

/**
 * 기타토지 «재산세 분류 근거» 라디오 — **공용 표현 컴포넌트**(NBL-STATE-HISTORY-E3-1b).
 *
 * 선택지 라벨·법 인용 설명은 엔진 단일 소스(`PROPERTY_TAX_BASIS_LABEL`·`PROPERTY_TAX_BASIS_LEGAL`)를 그대로 읽는다. 두 곳이 쓴다:
 *  · 양도일 현재(꼬리) 근거 — `OtherLandPropertyTaxBasisField`(V1-A)
 *  · 나대지 구간을 닫는 사건 행의 근거 — `OtherLandBareIntervalFields`(E3-1b)
 * 어떤 선택지를 줄지(`options`)는 호출자가 엔진 술어로 정한다 — 이 컴포넌트는 판정하지 않는다.
 */
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import type { ToggleCardTone } from "@/components/calc/inputs/ToggleCard";
import {
  PROPERTY_TAX_BASIS_LABEL,
  PROPERTY_TAX_BASIS_LEGAL,
  type PropertyTaxBasis,
} from "@/lib/tax-engine/non-business-land/property-tax-basis";

interface Props {
  name: string;
  options: readonly PropertyTaxBasis[];
  /** 선택값 — 선택지에 없는 stale 값은 호출자가 `""`(미선택)로 걸러 넘긴다. */
  value: "" | PropertyTaxBasis;
  onChange: (v: PropertyTaxBasis) => void;
  tone: ToggleCardTone;
  /** 선택지별 testid */
  testIdOf: (basis: PropertyTaxBasis) => string;
  "data-field"?: string;
}

export function PropertyTaxBasisRadio({ name, options, value, onChange, tone, testIdOf, "data-field": dataField }: Props) {
  const radioOptions: RadioCardOption<PropertyTaxBasis>[] = options.map((b) => ({
    value: b,
    label: PROPERTY_TAX_BASIS_LABEL[b],
    description: PROPERTY_TAX_BASIS_LEGAL[b],
    testId: testIdOf(b),
  }));
  return <RadioCardGroup name={name} tone={tone} options={radioOptions} value={value} onChange={onChange} data-field={dataField} />;
}
