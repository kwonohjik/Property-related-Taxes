"use client";

/**
 * 주택 공시가격(공동·개별주택가격) 기준연도 선택 + Vworld 조회 위젯 (다른 보유 주택 편집).
 *
 * 소재지 주소(addressPnu)가 있으면 연도 드롭다운에서 기준연도를 골라 해당 연도 공시가격을
 * 재조회한다. `/api/address/standard-price?propertyType=housing&pnu=&year=&dong=&ho=`.
 * 조회 성공 시 officialPrice·officialPriceYear·(빈 값이면 exclusiveArea) 자동 채움 + 배지.
 * 주소 미선택 시 직접 입력(조회 버튼 비활성).
 */

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

// 주택 공시가격 공시 개시(공동주택가격 2006~) 이후 연도. new Date는 클라이언트 컴포넌트라 허용.
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2005 }, (_, i) => CURRENT_YEAR - i);

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
}

export function HousePriceYearLookup({ house, onUpdate }: Props) {
  const [year, setYear] = useState(house.officialPriceYear || String(CURRENT_YEAR));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canLookup = !!house.addressPnu && !loading;

  async function handleLookup() {
    if (!house.addressPnu) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        pnu: house.addressPnu,
        propertyType: "housing",
        year,
      });
      if (house.addressDong) params.set("dong", house.addressDong);
      if (house.addressHo) params.set("ho", house.addressHo);
      const res = await fetch(`/api/address/standard-price?${params}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error?.message ?? "조회 실패");
        return;
      }
      if (json.price && json.price > 0) {
        const patch: Partial<HouseEntry> = {
          officialPrice: String(json.price),
          officialPriceYear: year,
          addressLookupFilled: true,
        };
        if (typeof json.exclusiveArea === "number" && json.exclusiveArea > 0 && !house.exclusiveArea) {
          patch.exclusiveArea = String(json.exclusiveArea);
        }
        onUpdate(patch);
      } else {
        setError("해당 연도 공시가격 없음");
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1 sm:col-span-3">
      <div className="flex items-center gap-2">
        <label className="text-caption text-muted-foreground font-medium">공시가격</label>
        {house.addressLookupFilled && (
          <span className="text-micro rounded-full bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/40 dark:text-green-300">
            조회값{house.officialPriceYear ? ` ${house.officialPriceYear}년` : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select value={year} onValueChange={(v) => v && setYear(v)}>
          <SelectTrigger className="h-9 w-24 shrink-0">
            <span>{year}년</span>
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}년
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={handleLookup}
          disabled={!canLookup}
          className="h-9 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors"
        >
          {loading ? "조회 중…" : "조회"}
        </button>
        <div className="min-w-0 flex-1">
          <CurrencyInput
            label="공시가격"
            hideLabel
            value={house.officialPrice}
            onChange={(v) => onUpdate({ officialPrice: v, addressLookupFilled: false })}
          />
        </div>
      </div>
      {error && <p className="text-micro text-destructive">{error}</p>}
      <p className="text-micro text-muted-foreground">
        {house.addressPnu
          ? "공동·개별주택가격 (원) — 연도 선택 후 조회"
          : "공동·개별주택가격 (원) — 소재지 주소 선택 시 연도별 조회"}
      </p>
    </div>
  );
}
