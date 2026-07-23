"use client";

/**
 * 재산세 비주거용 건축물 시가표준액 — 서울 ETAX 자동조회 필드.
 *
 * 소재지 PNU(서울)로 `/api/address/building-standard-price-etax` 조회 → 시가표준액 계(건축물+시설)를
 * publishedPrice에 채운다. 총액 직접 입력(area-mode 없음). 다중 결과(집합건물 호별)는 picker 모달.
 *
 * - 채움은 버튼 콜백에서 직접 `onPublishedPriceChange` — useEffect→store 미러링 금지(mirror-pattern 정책).
 * - 조회 대상: ETAX "주택외건물"(주택 제외). 근거 §104-2→§6④(시설 포함), 소방분 base 동일(§146④).
 * 설계: docs/02-design/features/property-building-nonresidential-stdprice-etax-lookup.plan.md §5.2
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { EtaxBuildingStdResult } from "@/lib/geo/etax-building-std";

interface Props {
  /** 소재지 PNU(19자리) — 서울("11" 시작)일 때만 조회 활성 */
  pnu: string;
  /** 시가표준액 총액 (원) — publishedPrice */
  publishedPrice: string;
  onPublishedPriceChange: (v: string) => void;
}
// Phase 1은 dong/hosu로 etax를 좁히지 않는다 — property 폼의 dong/ho("201동"·"3204")는 공동주택 표시형식이라
// etax 숫자 dong/hosu 코드("0000"·"00000")와 형식 불일치 → 전달 시 과필터로 0행 위험. 집합건물 다행은 picker로 disambiguate.

type PriceSource = "lookup" | "manual" | "lookup-edited";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 2011 },
  (_, i) => CURRENT_YEAR - i,
);

export function BuildingStdPriceEtaxLookupField({
  pnu,
  publishedPrice,
  onPublishedPriceChange,
}: Props) {
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [source, setSource] = useState<PriceSource>("manual");
  const [breakdown, setBreakdown] = useState<{
    building: number | null;
    facility: number | null;
  } | null>(null);
  const [pickerResults, setPickerResults] = useState<EtaxBuildingStdResult[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isSeoul = !!pnu && pnu.startsWith("11");
  const canLookup = isSeoul;

  const disabledHint = !pnu
    ? "물건 소재지를 검색·선택하면 조회할 수 있습니다."
    : !isSeoul
      ? "서울 소재 건축물만 ETAX 조회가 가능합니다(그 외 지역은 직접 입력)."
      : null;

  function applyResult(r: EtaxBuildingStdResult) {
    onPublishedPriceChange(String(r.total));
    setBreakdown({ building: r.building, facility: r.facility });
    setSource("lookup");
    setLookupError(null);
  }

  async function handleLookup() {
    if (!canLookup) return;
    setIsLookingUp(true);
    setLookupError(null);
    try {
      const params = new URLSearchParams({ pnu, year });
      const res = await fetch(
        `/api/address/building-standard-price-etax?${params}`,
      );
      const json = await res.json();
      if (json.error) {
        setLookupError(json.error);
        return;
      }
      const results: EtaxBuildingStdResult[] = json.results ?? [];
      if (results.length === 0) {
        setLookupError(json.warnings?.[0] ?? "조회 자료가 없습니다.");
        return;
      }
      if (results.length === 1) {
        applyResult(results[0]);
      } else {
        // 집합건물 호별 다중 결과 → picker 강제(자동 채움 금지)
        setPickerResults(results);
        setPickerOpen(true);
      }
    } catch {
      setLookupError("네트워크 오류");
    } finally {
      setIsLookingUp(false);
    }
  }

  function handleManualEdit(v: string) {
    onPublishedPriceChange(v);
    setBreakdown(null);
    setSource(source === "lookup" ? "lookup-edited" : "manual");
  }

  const badge =
    source === "lookup" ? (
      <span className="rounded bg-green-100 px-1.5 py-0.5 text-micro font-medium text-green-700">
        ETAX 자동
      </span>
    ) : source === "lookup-edited" ? (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-micro font-medium text-amber-700">
        수정됨
      </span>
    ) : null;

  return (
    <div className="space-y-2">
      {/* 연도 선택 + 조회 버튼 */}
      <div className="flex items-center gap-2">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm bg-background"
          aria-label="시가표준액 조회 연도"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={String(y)}>
              {y}년
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="modalLauncher"
          size="xs"
          onClick={handleLookup}
          disabled={!canLookup || isLookingUp}
          data-testid="etax-stdprice-lookup"
        >
          {isLookingUp ? "조회 중…" : "시가표준액 조회"}
        </Button>
        {badge}
      </div>

      {disabledHint && (
        <p className="text-xs text-muted-foreground">{disabledHint}</p>
      )}
      {lookupError && <p className="text-xs text-destructive">{lookupError}</p>}

      {/* 시가표준액 총액 입력 */}
      <CurrencyInput
        label=""
        value={publishedPrice}
        onChange={handleManualEdit}
        placeholder="금액 입력 (원)"
      />

      {/* 조회 내역 보조표시 (건축물/시설) */}
      {breakdown && (breakdown.building != null || breakdown.facility != null) && (
        <p className="text-xs text-muted-foreground">
          건축물 {(breakdown.building ?? 0).toLocaleString()}원
          {breakdown.facility != null && (
            <> + 시설 {breakdown.facility.toLocaleString()}원</>
          )}
        </p>
      )}

      {/* 다중 결과 picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>조회 결과 선택</DialogTitle>
            <DialogDescription>
              해당 소재지에 여러 건물·세대가 조회되었습니다. 대상을 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5">번호</th>
                  <th className="px-2 py-1.5">물건명</th>
                  <th className="px-2 py-1.5">호수</th>
                  <th className="px-2 py-1.5 text-right">연면적(㎡)</th>
                  <th className="px-2 py-1.5 text-right">시가표준액(계)</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {pickerResults.map((r, i) => (
                  <tr key={`${r.no}-${i}`} className="border-b">
                    <td className="px-2 py-1.5">{r.no}</td>
                    <td className="px-2 py-1.5">{r.name}</td>
                    <td className="px-2 py-1.5">{r.ho}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.area != null ? r.area.toLocaleString() : "-"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                      {r.total.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                        onClick={() => {
                          applyResult(r);
                          setPickerOpen(false);
                        }}
                      >
                        선택
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
