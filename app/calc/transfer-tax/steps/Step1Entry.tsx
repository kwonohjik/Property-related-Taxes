"use client";

/**
 * Step1Entry — 양도세 마법사 1단계 진입 분기: 「자산 소재」 라디오 + (국내 `Step1` | 국외 `ForeignRealEstateStep`)
 *
 * 국내 `Step1`은 그대로다(props 통과만) — 라디오가 그 위에 얹힐 뿐이다(회귀 가드 FRE-4).
 * 국외를 고르면 국내 자산 카드·판정 불러오기·함께 양도 토글을 **마운트하지 않는다**(값은 폼에 남는다 · D-4).
 * 다건 편집 화면(`/multi`)에도 같은 라디오가 보인다 — 국외 건도 입력을 받는다(사용자 결정 C-1).
 */
import { AssetLocationBlock } from "@/components/calc/transfer/foreign/AssetLocationBlock";
import { ForeignRealEstateStep } from "@/components/calc/transfer/foreign/ForeignRealEstateStep";
import { isForeignRealEstateForm } from "@/lib/calc/transfer-foreign-scope";
import { Step1 } from "./Step1";

type Step1Props = Parameters<typeof Step1>[0];

export function Step1Entry(props: Step1Props) {
  const { form, onChange, assetErrors } = props;
  return (
    <>
      <AssetLocationBlock
        value={form.assetLocation}
        onChange={(assetLocation) => onChange({ assetLocation })}
        embeddedInMulti={props.embeddedInMulti === true}
      />
      {isForeignRealEstateForm(form) ? (
        <ForeignRealEstateStep form={form} onChange={onChange} assetErrors={assetErrors} />
      ) : (
        <Step1 {...props} />
      )}
    </>
  );
}
