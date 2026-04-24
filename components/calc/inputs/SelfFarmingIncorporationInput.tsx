"use client";

/**
 * 자경농지 편입일 부분감면 입력 (조특령 §66 ⑤⑥)
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

const ZONE_OPTIONS = [
  { value: "residential", label: "주거지역" },
  { value: "commercial", label: "상업지역" },
  { value: "industrial", label: "공업지역" },
] as const;

interface SelfFarmingIncorporationInputProps {
  useSelfFarmingIncorporation: boolean;
  selfFarmingIncorporationDate: string;
  selfFarmingIncorporationZone: "residential" | "commercial" | "industrial" | "";
  selfFarmingStandardPriceAtIncorporation: string;
  onChange: (patch: Partial<{
    useSelfFarmingIncorporation: boolean;
    selfFarmingIncorporationDate: string;
    selfFarmingIncorporationZone: "residential" | "commercial" | "industrial" | "";
    selfFarmingStandardPriceAtIncorporation: string;
  }>) => void;
  /** vworld 조회용 지번 주소 */
  jibun?: string;
  /** 면적 (㎡) — 기준시가 자동 계산용 */
  landAreaM2?: string;
}

export function SelfFarmingIncorporationInput({
  useSelfFarmingIncorporation,
  selfFarmingIncorporationDate,
  selfFarmingIncorporationZone,
  selfFarmingStandardPriceAtIncorporation,
  onChange,
  jibun,
  landAreaM2,
}: SelfFarmingIncorporationInputProps) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-amber-300/60 bg-amber-50/30 p-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="self-farming-incorp"
          checked={useSelfFarmingIncorporation}
          onChange={(e) =>
            onChange({
              useSelfFarmingIncorporation: e.target.checked,
              ...(e.target.checked
                ? {}
                : {
                    selfFarmingIncorporationDate: "",
                    selfFarmingIncorporationZone: "",
                    selfFarmingStandardPriceAtIncorporation: "",
                  }),
            })
          }
          className="h-4 w-4"
        />
        <Label htmlFor="self-farming-incorp" className="text-sm cursor-pointer font-medium">
          주거·상업·공업지역 편입 (조특령 §66 ⑤⑥ 편입일 부분감면)
        </Label>
      </div>
      <p className="text-xs text-muted-foreground pl-6 -mt-1">
        2002.1.1 이후 편입 시 편입일까지의 양도소득만 감면 대상이 됩니다. 편입일부터 3년이 지난 후 양도하면 감면이 전부 상실됩니다.
      </p>

      {useSelfFarmingIncorporation && (
        <div className="space-y-3 pl-6">
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
            />
          </div>
        </div>
      )}
    </div>
  );
}
