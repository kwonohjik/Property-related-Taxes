"use client";

/**
 * 의제취득일(1985.1.1.) 이후 상속 취득가액 입력 (case B)
 *
 * 취득가액 = 상속세 신고 시 평가가액 (매매사례·감정·수용·유사매매·보충적평가 중 신고한 가액)
 * 근거: 소득세법 시행령 §163 ⑨ · 상증법 §60 · §61
 *
 * UI 순서 = 엔진 계산 로직 순서:
 * ① 평가방법 선택 → ② 신고가액 → ③ (보충적평가 선택 시) 보조계산
 */

import { useState } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { HouseValuationSection } from "./HouseValuationSection";
import { sec164HouseStatus, sec164LandStatus } from "@/lib/calc/sec164-required-fields";
import { InheritanceHouseKindPicker } from "./InheritanceHouseKindPicker";
import { deriveInheritanceHouseKind } from "@/lib/calc/transfer-tax-api-helpers";
import { inheritanceReportedValuePartSuffix } from "@/lib/calc/inheritance-reported-value-scope";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별주택가격 최초 공시일 */
const HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30";
/** 개별공시지가 최초 고시일 (소령 §164④) */
const LAND_FIRST_DISCLOSURE_DATE = "1990-08-30";

import { LAW_BADGE_CLASS } from "@/components/calc/shared/lawBadge";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TONE } from "@/components/calc/shared/tones";

const VALUATION_METHOD_OPTIONS = [
  { value: "market_value",        label: "매매사례가액 (시가)" },
  { value: "appraisal",           label: "감정평가액" },
  { value: "auction_public_sale", label: "수용·경매·공매가액" },
  { value: "similar_sale",        label: "유사매매사례가액" },
  { value: "supplementary",       label: "보충적평가액 (공시가격)" },
] as const;

type ValuationMethod = typeof VALUATION_METHOD_OPTIONS[number]["value"] | "";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — HouseValuationSection에 전달 */
  transferDate?: string;
}

export function PostDeemedInputs({ asset, onChange, transferDate }: Props) {
  const method = (asset.inheritanceValuationMethod || "") as ValuationMethod;
  const isSupplementary = method === "supplementary";
  // 일반건물은 이 칸이 토지분이다(건물분 전용 칸이 따로 있다) — 판정·문구는 공용 단일 소스.
  const partSuffix = inheritanceReportedValuePartSuffix(asset.assetKind);

  // 주택 자산 + 상속개시일 < 2005-04-30(개별주택가격 미공시) → §164⑦ 환산 위젯 노출.
  // 평가방법(isSupplementary) 무관 — §163⑨2호는 상증법 평가액과 §164⑦을 비교하여 큰 금액을
  // 취득가액으로 하므로, ②(§164⑦)는 ①의 평가방법과 독립적으로 항상 산정 대상.
  const inheritanceDate = asset.inheritanceStartDate || asset.acquisitionDate || "";
  /** 개별공시지가 최초고시(1990.8.30.) 前 상속·증여 토지 → §164④ 등급환산 대상 (소령 §163⑨1호) */
  const landPre1990 = asset.assetKind === "land" && !!inheritanceDate && inheritanceDate < "1990-08-30";
  // 상가건물·오피스텔: 토지/주택 보충적평가 보조계산(개별공시지가×면적 / 주택가격)은 부적합 →
  // 신고가액 직접 입력(상증법 §60~66 평가액). §164⑥ 취득당시 기준시가는 별도 섹션(취득 정보)에서 처리.
  const isCommercial = asset.assetKind === "commercial_building";
  // 토지/주택 판정은 상단 assetKind로 파생(상속 자산구분 라디오 폐지 대응).
  const isLand = asset.assetKind === "land";
  const isHouse = asset.assetKind === "housing" || asset.assetKind === "redevelopment_apt";
  // 주택 개별/공동 — 미선택 시 동·호 유무로 기본 표시(세액 무관, 조회·라벨용). 파생은 공용 단일 소스.
  const kind = deriveInheritanceHouseKind(asset);
  const showHouseValuation = isHouse && !!inheritanceDate && inheritanceDate < HOUSE_FIRST_DISCLOSURE_DATE;
  // §164 필수 항목 개수는 단일 소스에서 받는다 — 문구에 숫자를 하드코딩하면 필드가 늘 때 낡는다.
  const houseSec164 = sec164HouseStatus(asset);
  const landSec164 = sec164LandStatus(asset);

  // 보충적평가 보조계산은 상속개시 시점에 공시가격이 존재해야 조회·재구성 가능.
  // 미공시 시점(토지 <1990.8.30 / 주택 <2005.4.30)은 §60~66 평가액을 공시가격으로 재구성할 수 없어
  // 신고가액 직접입력으로 유도(소령 §163⑨1·2호 병렬 대칭). 이중계상이 아니라 공시가격 부존재가 근거.
  const isPreDisclosure =
    (isLand && !!inheritanceDate && inheritanceDate < LAND_FIRST_DISCLOSURE_DATE) ||
    (isHouse && !!inheritanceDate && inheritanceDate < HOUSE_FIRST_DISCLOSURE_DATE);

  // 보충적평가 보조계산: 토지 단가 × 면적 = 자동 합산
  const [landTotal, setLandTotal] = useState(() => {
    const unitPrice = parseAmount(asset.supplementaryLandUnitPrice);
    const area = parseFloat(asset.supplementaryLandArea) || 0;
    return unitPrice > 0 && area > 0 ? Math.floor(unitPrice * area).toLocaleString() : "";
  });

  // 보충적평가 보조계산: 합산 → publishedValueAtInheritance(① 상증법 평가액, 엔진 실경로) 동기화.
  // memory `mirror-pattern` — useEffect→store 미러링 금지. onChange 핸들러에서 직접 패치.
  // 보조계산 활성 시에만 패치(미활성이면 수동 입력 보존). total 0이면 "" 로 초기화(stale 방지).
  function reportedPatch(landTotalStr: string, buildingStr: string) {
    if (!asset.useSupplementaryHelper || !isSupplementary) return {};
    // 토지=개별공시지가×면적. 주택=고시주택가격 단일(부수토지 일체 → 토지 별도가산 금지, 상증법 §61①4호).
    const total = isLand ? parseAmount(landTotalStr) : parseAmount(buildingStr);
    return { publishedValueAtInheritance: total > 0 ? total.toLocaleString() : "" };
  }

  function handleLandUnitPriceChange(v: string) {
    const unitPrice = parseAmount(v);
    const area = parseFloat(asset.supplementaryLandArea) || 0;
    const newLandTotal = unitPrice > 0 && area > 0 ? Math.floor(unitPrice * area).toLocaleString() : "";
    setLandTotal(newLandTotal);
    onChange({
      supplementaryLandUnitPrice: v,
      ...reportedPatch(newLandTotal, asset.supplementaryBuildingValue),
    });
  }

  function handleLandAreaChange(v: string) {
    const unitPrice = parseAmount(asset.supplementaryLandUnitPrice);
    const area = parseFloat(v.replace(/,/g, "")) || 0;
    const newLandTotal = unitPrice > 0 && area > 0 ? Math.floor(unitPrice * area).toLocaleString() : "";
    setLandTotal(newLandTotal);
    onChange({
      supplementaryLandArea: v,
      ...reportedPatch(newLandTotal, asset.supplementaryBuildingValue),
    });
  }

  function handleBuildingValueChange(v: string) {
    onChange({
      supplementaryBuildingValue: v,
      ...reportedPatch(landTotal, v),
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          의제취득일 이후 상속 — 상속세 신고가액을 취득가로 인정
        </p>
        <LawArticleModal
          legalBasis="소득세법시행령 §163"
          label="소령 §163 ⑨"
          className={LAW_BADGE_CLASS}
        />
      </div>

      {/* ① 평가방법 선택 — 메모리 feedback_select_component 준수: SelectValue 단독 금지 */}
      <FieldCard
        label="상속세 신고 시 평가방법"
        required
        trailing={
          <LawArticleModal
            legalBasis="상속세및증여세법 §60"
            label="상증법 §60"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <Select
          value={method}
          onValueChange={(v) =>
            onChange({
              inheritanceValuationMethod: v as AssetForm["inheritanceValuationMethod"],
              // 방법 변경 시 보조계산 초기화
              useSupplementaryHelper: false,
              supplementaryLandArea: "",
              supplementaryLandUnitPrice: "",
              supplementaryBuildingValue: "",
            })
          }
        >
          <SelectTrigger className="h-9 w-full">
            <span className="text-sm">
              {VALUATION_METHOD_OPTIONS.find((o) => o.value === method)?.label
                ?? "평가방법 선택"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {VALUATION_METHOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldCard>

      {/* ② 신고가액 */}
      {method && (
        <FieldCard
          label={`상속세 신고가액${partSuffix.label}`}
          required
          unit="원"
          hint={`상속세 신고서 또는 결정통지서에 기재된 평가가액${partSuffix.hint}`}
        >
          <CurrencyInput
            label=""
            hideUnit
            value={asset.publishedValueAtInheritance}
            onChange={(v) => onChange({ publishedValueAtInheritance: v })}
            placeholder="신고가액 입력 (원)"
          />
        </FieldCard>
      )}

      {/* ③ 보충적평가 보조계산 (supplementary 선택 + 공시 시점 자산만).
          토지=개별공시지가×면적 / 주택=고시주택가격 단일(부수토지 일체). 상증법 §61①.
          상가건물은 토지/주택 보조계산 부적합 → 신고가액 직접 입력(위 ②). */}
      {isSupplementary && !isPreDisclosure && !isCommercial && (isLand || isHouse) && (
        <ToggleCard
          tone="amber"
          title="보충적평가 보조계산 사용"
          description={
            isLand
              ? "개별공시지가·면적으로 토지 보충적평가액을 산정해 신고가액을 채웁니다"
              : "주택공시가격을 조회·입력하면 신고가액을 채웁니다"
          }
          trailing={
            <LawArticleModal
              legalBasis="상속세및증여세법 §61"
              label="상증법 §61"
              className={LAW_BADGE_CLASS}
            />
          }
          checked={asset.useSupplementaryHelper}
          onCheckedChange={(v) => {
            // 토글 ON 시 기존 입력값으로 즉시 동기화 (useEffect 대체).
            // 토지=단가×면적, 주택=고시주택가격 단독(토지 미가산). OFF 시 신고가액 보존.
            if (v && isSupplementary) {
              const total = isLand
                ? parseAmount(landTotal)
                : parseAmount(asset.supplementaryBuildingValue);
              onChange({
                useSupplementaryHelper: true,
                publishedValueAtInheritance: total > 0 ? total.toLocaleString() : "",
              });
            } else {
              onChange({ useSupplementaryHelper: v });
            }
          }}
        >
          {asset.useSupplementaryHelper && (
            <div className="space-y-3">
              {isHouse && (
                <InheritanceHouseKindPicker asset={asset} onChange={onChange} />
              )}
              {isLand ? (
                /* 토지 — 개별공시지가(Vworld 조회) + 면적. 토지기준시가 = 단가×면적(LandPriceLookupField 자동표시). */
                <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                  <p className="text-xs font-medium text-muted-foreground">토지 (개별공시지가 × 면적)</p>
                  <LandPriceLookupField
                    pricePerSqm={asset.supplementaryLandUnitPrice}
                    onPricePerSqmChange={handleLandUnitPriceChange}
                    area={parseFloat(asset.supplementaryLandArea) || undefined}
                    onAreaChange={handleLandAreaChange}
                    referenceDate={inheritanceDate}
                    jibun={asset.addressJibun || undefined}
                    label="개별공시지가 (원/㎡)"
                  />
                  <FieldCard label="면적" unit="㎡" stacked>
                    <DecimalInput
                      value={asset.supplementaryLandArea}
                      onChange={(v) => handleLandAreaChange(v)}
                    />
                  </FieldCard>

                </div>
              ) : (
                /* 주택 — 고시주택가격 단일(개별/공동, Vworld 조회). 부수토지 일체 → 토지 별도 입력 없음(§61①4호). */
                <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {kind === "house_apart" ? "공동주택가격" : "개별주택가격"} (부수토지 포함)
                  </p>
                  <StandardPriceInput
                    propertyKind={kind}
                    totalPrice={asset.supplementaryBuildingValue}
                    onTotalPriceChange={handleBuildingValueChange}
                    jibun={asset.addressJibun || undefined}
                    dong={asset.addressDong || undefined}
                    ho={asset.addressHo || undefined}
                    referenceDate={inheritanceDate}
                    label={kind === "house_apart" ? "공동주택가격 (원)" : "개별주택가격 (원)"}
                  />
                </div>
              )}

              {/* 신고가액 반영 안내 */}
              {(() => {
                const previewTotal = isLand
                  ? parseAmount(landTotal)
                  : parseAmount(asset.supplementaryBuildingValue);
                if (previewTotal <= 0) return null;
                const label = isLand
                  ? "토지 보충적평가액"
                  : kind === "house_apart"
                    ? "공동주택가격"
                    : "개별주택가격";
                return (
                  <div className="rounded-md bg-primary/5 border border-primary/20 p-2.5">
                    <p className="text-sm font-semibold">
                      {label}: {previewTotal.toLocaleString()}
                    </p>
                    <p className="text-caption text-muted-foreground mt-0.5">
                      위 금액이 신고가액 필드에 자동 반영됩니다
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </ToggleCard>
      )}

      {/* 미공시 시점(공시가격 부존재) — 보조계산 불가, 신고가액 직접입력 유도 (소령 §163⑨1·2호 대칭) */}
      {isSupplementary && isPreDisclosure && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            상속개시일에 {isLand ? "개별공시지가" : "주택공시가격"}이(가) 미공시되어 보충적평가 보조계산을
            사용할 수 없습니다. 위 <strong>상속세 신고가액</strong>에 상속세 신고서·결정통지서상 평가액을 직접
            입력하세요.
            {isHouse && " 취득당시 기준시가는 아래 §164⑦ 환산에서 산정됩니다."}
          </p>
        </div>
      )}

      {/* 주택 미공시(2005-04-30 이전 상속): §164⑦ 환산 위젯 — §163⑨2호 max(상증법 평가액, §164⑦) */}
      {showHouseValuation && (
        <ToneCard tone="amber">
          <p className={`text-xs font-medium ${TONE.amber.title}`}>
            개별주택가격 미공시(2005.4.30. 이전 상속) — 아래 §164⑦ 환산으로 취득당시 기준시가를 산정합니다.
            취득가액은 위 상속세 신고가액(상증법 평가액)과 §164⑦ 환산액 중 <strong>큰 금액</strong>으로 자동
            적용됩니다 (소득세법 시행령 §163⑨2호).{" "}
            <strong>{houseSec164 ? `${houseSec164.total}개 항목을 모두` : "항목을 모두"}</strong>{" "}
            입력한 경우에만 비교하며, <strong>일부만 입력하면 계산할 때 오류로 안내</strong>합니다.
          </p>
          <InheritanceHouseKindPicker asset={asset} onChange={onChange} />
          <HouseValuationSection
            asset={asset}
            onChange={onChange}
            transferDate={transferDate}
          />
        </ToneCard>
      )}

      {/* 토지 미공시(1990.8.30. 이전 상속·증여): §164④ 등급환산 — §163⑨**1호** max(상증법 평가액, §164④)
          1호는 「의제취득일」과 무관하다 — 조건은 「고시 前 상속·증여받은 토지」뿐이다.
          ⚠️ 이 기간에는 위 보충적평가 섹션이 `isPreDisclosure`로 **숨겨진다**(개별공시지가가 존재하지 않으므로).
             주택이 `showHouseValuation`으로 별도 경로를 갖는 것처럼, 토지도 여기가 **유일한 산정 경로**다. */}
      {landPre1990 && (
        <ToneCard tone="amber">
          <p className={`text-xs font-medium ${TONE.amber.title}`}>
            개별공시지가 미공시(1990.8.30. 이전 상속·증여) — 아래 토지등급가액 환산으로 취득당시
            기준시가를 산정합니다. 취득가액은 위 상속세 신고가액(상증법 평가액)과 §164④ 환산액 중{" "}
            <strong>큰 금액</strong>으로 자동 적용됩니다 (소득세법 시행령 §163⑨1호).{" "}
            <strong>{landSec164 ? `${landSec164.total}개 항목을 모두` : "항목을 모두"}</strong>{" "}
            입력한 경우에만 비교하며, <strong>일부만 입력하면 계산할 때 오류로 안내</strong>합니다.
          </p>
          <Pre1990LandValuationInput
            form={{
              pre1990Enabled: asset.pre1990Enabled,
              pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
              pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
              pre1990Grade_current: asset.pre1990Grade_current,
              pre1990Grade_prev: asset.pre1990Grade_prev,
              pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
              pre1990GradeMode: asset.pre1990GradeMode,
            }}
            onChange={(patch) => onChange(patch)}
            acquisitionArea={asset.acquisitionArea || undefined}
            jibun={asset.addressJibun || undefined}
            acquisitionDate={asset.acquisitionDate || undefined}
            transferDate={transferDate}
          />
        </ToneCard>
      )}
    </div>
  );
}
