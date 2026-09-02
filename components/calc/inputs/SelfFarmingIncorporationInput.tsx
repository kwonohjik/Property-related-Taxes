"use client";

/**
 * 자경농지 편입 입력 (조특령 §66④1호 배제 · 법 §69①단서 + 영 §66⑦ 부분감면)
 *
 * Step5에서 reductionType === "self_farming" 선택 시 노출된다.
 * 토글이 켜진 경우에만 편입일·지역·기준시가 3필드를 수집해 API로 전송.
 *
 * 편입당시 기준시가 자동계산:
 *   - 편입연도 선택 + vworld 개별공시지가 조회
 *   - 조회 성공 시: 단가(원/㎡) × 면적(㎡) = 기준시가 자동 입력
 */

import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";

/** 조특령 §66④1호 본문 — 3년 배제가 걸리는 소재지 범위 */
const LOCATION_OPTIONS = [
  {
    value: "metro_or_city",
    label: "특별시·광역시·시 (광역시의 군, 도농복합시·행정시의 읍·면 제외)",
  },
  { value: "gun_or_eup_myeon", label: "그 밖의 지역 (군·읍·면 등)" },
] as const;

const ZONE_OPTIONS = [
  { value: "residential", label: "주거지역" },
  { value: "commercial", label: "상업지역" },
  { value: "industrial", label: "공업지역" },
] as const;

/**
 * 의제취득일(소득세법 부칙 1985.1.1. 개정 §98) — 1984.12.31. 이전 취득은 1985.1.1. 취득으로 간주.
 * 앱은 1985.1.1. 미만 취득일을 "1985-01-01"로 클램핑하므로(CompanionAcqPurchaseBlock),
 * 판정은 `<=`로 한다(동일: CompanionAcqPurchaseBlock 의제취득 배지 판정).
 * 이 시점은 개별공시지가(최초 1990) 부재 → 취득시 기준시가는 자산-수준 환산값을 자동 사용.
 */
const DEEMED_ACQUISITION_DATE = "1985-01-01";

interface SelfFarmingIncorporationInputProps {
  useSelfFarmingIncorporation: boolean;
  selfFarmingIncorporationDate: string;
  selfFarmingIncorporationZone: "residential" | "commercial" | "industrial" | "";
  selfFarmingIncorporationLocation: "metro_or_city" | "gun_or_eup_myeon" | "";
  selfFarmingIncorporationProvisoException: boolean;
  selfFarmingStandardPriceAtIncorporation: string;
  selfFarmingStandardPriceAtAcquisition: string;
  selfFarmingStandardPriceAtTransfer: string;
  onChange: (patch: Partial<{
    useSelfFarmingIncorporation: boolean;
    selfFarmingIncorporationDate: string;
    selfFarmingIncorporationZone: "residential" | "commercial" | "industrial" | "";
    selfFarmingIncorporationLocation: "metro_or_city" | "gun_or_eup_myeon" | "";
    selfFarmingIncorporationProvisoException: boolean;
    selfFarmingStandardPriceAtIncorporation: string;
    selfFarmingStandardPriceAtAcquisition: string;
    selfFarmingStandardPriceAtTransfer: string;
  }>) => void;
  /** vworld 조회용 지번 주소 */
  jibun?: string;
  /** 면적 (㎡) — 기준시가 자동 계산용 */
  landAreaM2?: string;
  /** 취득일 — 취득시 기준시가 공시지가 조회 기준연도 */
  acquisitionDate?: string;
  /** 양도일 — 양도시 기준시가 공시지가 조회 기준연도 */
  transferDate?: string;
  /** 자산 목록의 취득시 기준시가(총액). 의제취득(≤1985.1.1) 시 읽기전용 자동 표시 소스. 엔진 fallback과 동일 값. */
  assetStandardPriceAtAcq?: string;
}

export function SelfFarmingIncorporationInput({
  useSelfFarmingIncorporation,
  selfFarmingIncorporationDate,
  selfFarmingIncorporationZone,
  selfFarmingIncorporationLocation,
  selfFarmingIncorporationProvisoException,
  selfFarmingStandardPriceAtIncorporation,
  selfFarmingStandardPriceAtAcquisition,
  selfFarmingStandardPriceAtTransfer,
  onChange,
  jibun,
  landAreaM2,
  acquisitionDate,
  transferDate,
  assetStandardPriceAtAcq,
}: SelfFarmingIncorporationInputProps) {
  // 의제취득(≤1985.1.1): 개별공시지가 부재 → 취득시 기준시가는 조회 불가.
  // 자산-수준 값을 읽기전용 자동 표시하고 연도 드롭다운·조회 UI를 숨긴다(엔진은 이미 자산값 fallback).
  const isDeemedAcq = !!acquisitionDate && acquisitionDate <= DEEMED_ACQUISITION_DATE;
  // 표시값은 엔진 fallback 식(`reduction ?? asset`)과 동일하게 미러 — 표시≠엔진 drift 방지.
  const effectiveAcqPrice =
    parseAmount(selfFarmingStandardPriceAtAcquisition) > 0
      ? parseAmount(selfFarmingStandardPriceAtAcquisition)
      : parseAmount(assetStandardPriceAtAcq ?? "");
  return (
    <ToggleCard
      tone="amber"
      title="주거·상업·공업지역 편입"
      description="법 §69①단서 + 영 §66⑦ 부분감면 — 2002.1.1 이후 편입 시 편입일까지의 양도소득만 감면 대상. 별도로 영 §66④1호는 «특별시·광역시(군 제외)·시» 소재 농지가 편입 후 3년이 지나면 감면대상 토지에서 제외합니다(단서 예외 있음)."
      checked={useSelfFarmingIncorporation}
      onCheckedChange={(v) =>
        onChange({
          useSelfFarmingIncorporation: v,
          ...(v
            ? {
                // 토글 ON 시 controlled input 초기화 (기존 편입시 기준시가 패턴)
                selfFarmingStandardPriceAtAcquisition: selfFarmingStandardPriceAtAcquisition || "",
                selfFarmingStandardPriceAtTransfer: selfFarmingStandardPriceAtTransfer || "",
              }
            : {
                selfFarmingIncorporationDate: "",
                selfFarmingIncorporationZone: "",
                selfFarmingIncorporationLocation: "",
                selfFarmingIncorporationProvisoException: false,
                selfFarmingStandardPriceAtIncorporation: "",
                selfFarmingStandardPriceAtAcquisition: "",
                selfFarmingStandardPriceAtTransfer: "",
              }),
        })
      }
    >
      <div className="space-y-3">
        {/* 편입일 + 편입 지역 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">편입일</Label>
              <DateInput
                value={selfFarmingIncorporationDate}
                onChange={(v) => onChange({ selfFarmingIncorporationDate: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">편입 지역</Label>
              <select
                value={selfFarmingIncorporationZone}
                onChange={(e) =>
                  onChange({
                    selfFarmingIncorporationZone: e.target.value as "residential" | "commercial" | "industrial" | "",
                  })
                }
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">지역 유형 선택</option>
                {ZONE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 조특령 §66④1호 — 소재지 요건 + 단서 예외 */}
          <div className="space-y-1.5">
            <Label className="text-sm">양도일 현재 농지 소재지 (조특령 §66④1호)</Label>
            <select
              value={selfFarmingIncorporationLocation}
              onChange={(e) =>
                onChange({
                  selfFarmingIncorporationLocation: e.target.value as
                    | "metro_or_city"
                    | "gun_or_eup_myeon"
                    | "",
                })
              }
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">소재지 구분 선택</option>
              {LOCATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-micro text-muted-foreground">
              3년 경과 배제는 이 범위의 농지에만 적용됩니다 — 군·읍·면 소재 농지는 3년이 지나도
              배제되지 않습니다(부분감면은 별개로 적용).
            </p>
          </div>
          <ToggleCard
            tone="amber"
            title="§66④1호 단서(가·나·다목) 해당"
            description="대규모개발사업지역 안에서 사업시행자의 단계적 사업시행·보상지연으로 3년이 지난 경우, 국가·지방자치단체·공공기관이 시행하는 개발사업지역 안에서 부득이한 사유에 해당하는 경우 등 — 해당하면 3년 배제에서 제외됩니다."
            checked={selfFarmingIncorporationProvisoException}
            onCheckedChange={(v) => onChange({ selfFarmingIncorporationProvisoException: v })}
          />

          {/* 편입당시 기준시가 (개별공시지가 × 면적) */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              편입일 당시 기준시가 <span className="text-xs text-muted-foreground font-normal">(개별공시지가 × 면적, 원)</span>
            </label>
            <StandardPriceInput
              propertyKind="land"
              totalPrice={selfFarmingStandardPriceAtIncorporation}
              onTotalPriceChange={(v) => onChange({ selfFarmingStandardPriceAtIncorporation: v })}
              area={landAreaM2}
              jibun={jibun}
              referenceDate={selfFarmingIncorporationDate}
              label=""
              hint="편입일 직전 개별공시지가 × 토지면적(㎡)"
              enableLookup={true}
              unitPriceWide
            />
          </div>

          {/* 취득시·양도시 기준시가 — 편입 비율 = (편입−취득)/(양도−취득). 실지 모드 필수 입력 */}
          <p className="text-caption text-muted-foreground -mb-1">
            편입 부분감면 비율 = (편입시 − 취득시) ÷ (양도시 − 취득시) 기준시가. 실지거래가액 양도도 아래 3점이 필요합니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">취득시 기준시가 <span className="text-xs text-muted-foreground font-normal">(원)</span></label>
              {isDeemedAcq ? (
                effectiveAcqPrice > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-1">
                    <div className="text-right font-mono tabular-nums whitespace-nowrap text-sm font-medium">
                      {effectiveAcqPrice.toLocaleString()}
                    </div>
                    <p className="text-caption text-amber-700">
                      1985.1.1. 이전 취득(취득시기 의제) — 자산 목록의 취득시 기준시가를 자동 적용합니다.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2">
                    <p className="text-caption text-amber-700">
                      1985.1.1. 이전 취득(취득시기 의제) — 개별공시지가 조회 불가. 자산 목록에서 취득시 기준시가(환산 등)를 먼저 입력하세요.
                    </p>
                  </div>
                )
              ) : (
                <StandardPriceInput
                  propertyKind="land"
                  totalPrice={selfFarmingStandardPriceAtAcquisition}
                  onTotalPriceChange={(v) => onChange({ selfFarmingStandardPriceAtAcquisition: v })}
                  area={landAreaM2}
                  jibun={jibun}
                  referenceDate={acquisitionDate}
                  label=""
                  hint="취득일 직전 개별공시지가 × 면적(환산 모드는 자산 기준시가 자동)"
                  enableLookup={true}
                  unitPriceWide
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">양도시 기준시가 <span className="text-xs text-muted-foreground font-normal">(원)</span></label>
              <StandardPriceInput
                propertyKind="land"
                totalPrice={selfFarmingStandardPriceAtTransfer}
                onTotalPriceChange={(v) => onChange({ selfFarmingStandardPriceAtTransfer: v })}
                area={landAreaM2}
                jibun={jibun}
                referenceDate={transferDate}
                label=""
                hint="양도일 직전 개별공시지가 × 면적(환산 모드는 자산 기준시가 자동)"
                enableLookup={true}
                unitPriceWide
              />
            </div>
          </div>
      </div>
    </ToggleCard>
  );
}
