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

import { useState, useEffect } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { HouseValuationSection } from "./HouseValuationSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별주택가격 최초 공시일 */
const HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30";

const LAW_BADGE_CLASS =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
  "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 " +
  "hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors shrink-0 whitespace-nowrap cursor-pointer";

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

  // 주택 자산 + 상속개시일 < 2005-04-30 → HouseValuationSection 보조 노출
  const inheritanceDate = asset.inheritanceStartDate || asset.acquisitionDate || "";
  const isHouse = asset.inheritanceAssetKind === "house_individual" || asset.inheritanceAssetKind === "house_apart";
  const showHouseValuation = isHouse && isSupplementary && !!inheritanceDate && inheritanceDate < HOUSE_FIRST_DISCLOSURE_DATE;

  // 보충적평가 보조계산: 토지 단가 × 면적 = 자동 합산
  const [landTotal, setLandTotal] = useState(() => {
    const unitPrice = parseAmount(asset.supplementaryLandUnitPrice);
    const area = parseFloat(asset.supplementaryLandArea) || 0;
    return unitPrice > 0 && area > 0 ? Math.floor(unitPrice * area).toLocaleString() : "";
  });

  // 보충적평가 보조계산: 합산 → inheritanceReportedValue 자동 동기화
  useEffect(() => {
    if (!asset.useSupplementaryHelper || !isSupplementary) return;
    const landAmt = parseAmount(landTotal);
    const buildingAmt = parseAmount(asset.supplementaryBuildingValue);
    const total = landAmt + buildingAmt;
    if (total > 0) {
      onChange({ inheritanceReportedValue: total.toLocaleString() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landTotal, asset.supplementaryBuildingValue, asset.useSupplementaryHelper]);

  function handleLandUnitPriceChange(v: string) {
    onChange({ supplementaryLandUnitPrice: v });
    const unitPrice = parseAmount(v);
    const area = parseFloat(asset.supplementaryLandArea) || 0;
    if (unitPrice > 0 && area > 0) {
      setLandTotal(Math.floor(unitPrice * area).toLocaleString());
    } else {
      setLandTotal("");
    }
  }

  function handleLandAreaChange(v: string) {
    onChange({ supplementaryLandArea: v });
    const unitPrice = parseAmount(asset.supplementaryLandUnitPrice);
    const area = parseFloat(v.replace(/,/g, "")) || 0;
    if (unitPrice > 0 && area > 0) {
      setLandTotal(Math.floor(unitPrice * area).toLocaleString());
    } else {
      setLandTotal("");
    }
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
          label="상속세 신고가액"
          required
          unit="원"
          hint="상속세 신고서 또는 결정통지서에 기재된 평가가액"
        >
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inheritanceReportedValue}
            onChange={(v) => onChange({ inheritanceReportedValue: v })}
            placeholder="신고가액 입력 (원)"
          />
        </FieldCard>
      )}

      {/* 평가 근거 메모 */}
      {method && (
        <FieldCard
          label="평가 근거 메모"
          hint="감정평가서 번호·매매사례 일자 등 (선택)"
        >
          <input
            type="text"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={asset.inheritanceValuationEvidence}
            onChange={(e) => onChange({ inheritanceValuationEvidence: e.target.value })}
            placeholder="예: 감정평가 2022-1234호"
            maxLength={200}
          />
        </FieldCard>
      )}

      {/* ③ 보충적평가 보조계산 (supplementary 선택 시만) */}
      {isSupplementary && (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/30 p-2.5">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={asset.useSupplementaryHelper}
              onChange={(e) => onChange({ useSupplementaryHelper: e.target.checked })}
            />
            <span>보충적평가 보조계산 사용</span>
            <LawArticleModal
              legalBasis="상속세및증여세법 §61"
              label="상증법 §61"
              className={LAW_BADGE_CLASS}
            />
          </label>
          <p className="text-[11px] text-muted-foreground pl-5">
            토지·건물 공시가격을 입력하면 합산 후 신고가액 자동 채움
          </p>

          {asset.useSupplementaryHelper && (
            <div className="pl-5 space-y-3 pt-1">
              {/* 토지 */}
              <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                <p className="text-xs font-medium text-muted-foreground">토지</p>
                <div className="grid grid-cols-2 gap-2">
                  <FieldCard label="개별공시지가" unit="원/㎡">
                    <CurrencyInput
                      label=""
                      hideUnit
                      value={asset.supplementaryLandUnitPrice}
                      onChange={handleLandUnitPriceChange}
                      placeholder="원/㎡"
                    />
                  </FieldCard>
                  <FieldCard label="면적" unit="㎡">
                    <input
                      type="number"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={asset.supplementaryLandArea}
                      onChange={(e) => handleLandAreaChange(e.target.value)}
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                  </FieldCard>
                </div>
                {landTotal && (
                  <p className="text-[11px] text-muted-foreground">
                    토지 보충적평가액: {landTotal}원
                  </p>
                )}
              </div>

              {/* 건물·주택 */}
              <FieldCard label="건물·주택 공시가격" unit="원" hint="개별주택가격 또는 공동주택가격 (원 총액)">
                <CurrencyInput
                  label=""
                  hideUnit
                  value={asset.supplementaryBuildingValue}
                  onChange={(v) => onChange({ supplementaryBuildingValue: v })}
                  placeholder="공시가격 총액 (원)"
                />
              </FieldCard>

              {/* 합산 */}
              {(parseAmount(landTotal) > 0 || parseAmount(asset.supplementaryBuildingValue) > 0) && (
                <div className="rounded-md bg-primary/5 border border-primary/20 p-2.5">
                  <p className="text-sm font-semibold">
                    보충적평가액 합계:{" "}
                    {(
                      parseAmount(landTotal) + parseAmount(asset.supplementaryBuildingValue)
                    ).toLocaleString()}원
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    위 금액이 신고가액 필드에 자동 반영됩니다
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 주택 + 보충적평가 + 미공시: 3-시점 보조 계산기 */}
      {showHouseValuation && (
        <HouseValuationSection
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}
    </div>
  );
}
