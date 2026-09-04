"use client";

/**
 * 감면 조문 공용 기준시가 섹션 — PHD 환산 + 3시점 조회형 + 전용면적.
 *
 * §99의3(New993InputForm) 패턴을 접미사-독립 generic으로 추출 (Phase 2, 2026-07-27).
 * 감면소득금액 차감(5년 안분) 조문(§99·§98의3/5/6/7/8·§99의2)이 자기 접미사 필드를
 * generic value/onChange mapper로 연결해 재사용. 접미사 매핑은 부모 폼이 담당.
 *
 * 설계: docs/02-design/features/reduction-stdprice-lookup-phd-unification.plan.md §4-C
 */

import { useMemo, useState } from "react";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ReductionPhdInput, type ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import { calcReductionAcquisitionStdPrice, canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";

/** YYYY-MM-DD 문자열의 연도에 n년 가산 (new Date 금지 정책 회피 — 5년 시점 referenceDate 파생). */
function addYearsStr(dateStr: string | undefined, n: number): string | undefined {
  if (!dateStr || dateStr.length < 10) return undefined;
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!Number.isFinite(year)) return undefined;
  return `${year + n}${dateStr.slice(4)}`;
}

export interface ReductionStdPriceSectionProps {
  /** PHD 환산 값 (generic — 접미사 독립) */
  phd: ReductionPhdValue;
  /** PHD 부분 갱신 — 부모가 접미사 필드로 매핑 후 배치 반영 */
  onPhdChange: (patch: Partial<ReductionPhdValue>) => void;

  /** 취득시 기준시가 (PHD ON 시 echo로 대체 표시) */
  stdPriceAtAcquisition: string;
  onStdPriceAtAcquisitionChange: (v: string) => void;
  /** 취득일+5년 시점 기준시가 */
  stdPriceAt5Years: string;
  onStdPriceAt5YearsChange: (v: string) => void;
  /** 양도시 기준시가 (선택 — 미입력 시 자산값 fallback) */
  stdPriceAtTransfer: string;
  onStdPriceAtTransferChange: (v: string) => void;

  /** 전용면적 (㎡) — 조문에 전용면적 필드가 없으면 생략(§98의5/7). 3시점 조회 시 자동채움 대상도 없어짐 */
  exclusiveArea?: string;
  onExclusiveAreaChange?: (v: string) => void;

  /** 자산 취득일 — PHD 자동 활성화 + 취득/5년 기준시가 referenceDate */
  acquisitionDate?: string;
  /** 자산 양도일 — 양도시 기준시가 referenceDate */
  transferDate?: string;
  /** 양도물건 지번 — 기준시가 자동조회 소스 */
  jibun?: string;
  dong?: string;
  ho?: string;
  /** 자산-수준 PHD 스냅샷 — "자산 카드 PHD 가져오기" 버튼 소스 */
  assetPhdSnapshot?: ReductionPhdValue;

  /** testid 접두사 (예: "new99") — 조회형 필드/버튼 셀렉터 안정 */
  testidPrefix: string;
  /** 건물 기준시가 모달 스냅샷 복원 키 prefix (예: "red99") — legacy fallback */
  snapshotKeyPrefix: string;
  /** 자산 식별자 — 건물 기준시가 계산서 스냅샷 키(bsp-${assetId}-red-phd) 소속 판정용(결과탭 노출) */
  assetId?: string;
  /** 전용면적 안내 문구 (조문별 고가주택 기준 상이) */
  areaHint?: string;
  /**
   * 전용면적 입력 블록 표시 여부 (기본 true).
   * 조문 폼에 면적 필드가 별도 섹션에 이미 있으면 false — 면적 단일출처(§4-A).
   * false여도 3시점 조회의 onExclusiveArea 콜백은 유지되어 조회 시 기존 면적 필드가 자동 채워진다.
   */
  showExclusiveArea?: boolean;
}

export function ReductionStdPriceSection({
  phd,
  onPhdChange,
  stdPriceAtAcquisition,
  onStdPriceAtAcquisitionChange,
  stdPriceAt5Years,
  onStdPriceAt5YearsChange,
  stdPriceAtTransfer,
  onStdPriceAtTransferChange,
  exclusiveArea,
  onExclusiveAreaChange,
  acquisitionDate,
  transferDate,
  jibun,
  dong,
  ho,
  assetPhdSnapshot,
  testidPrefix,
  snapshotKeyPrefix,
  assetId,
  areaHint,
  showExclusiveArea = true,
}: ReductionStdPriceSectionProps) {
  const [areaLoading, setAreaLoading] = useState(false);
  const [areaMsg, setAreaMsg] = useState<string | null>(null);

  // 전용면적 전용 조회 — 양도물건 주소·동/호로 Vworld 전용면적(prvuseAr)만 채움.
  // 전용면적은 연도 무관 → 최근 연도부터 데이터 있는 해까지 순차 시도.
  async function lookupExclusiveArea() {
    if (!jibun) return;
    setAreaLoading(true);
    setAreaMsg(null);
    try {
      const currentYear = new Date().getFullYear();
      for (let y = currentYear; y >= currentYear - 4; y--) {
        const params = new URLSearchParams({ jibun, propertyType: "housing", year: String(y) });
        if (dong) params.set("dong", dong);
        if (ho) params.set("ho", ho);
        const res = await fetch(`/api/address/standard-price?${params}`);
        if (!res.ok) continue;
        const json = await res.json();
        if (typeof json.exclusiveArea === "number" && json.exclusiveArea > 0) {
          onExclusiveAreaChange?.(String(json.exclusiveArea));
          setAreaMsg(null);
          return;
        }
      }
      setAreaMsg("전용면적 조회 실패 — 직접 입력하세요.");
    } catch {
      setAreaMsg("네트워크 오류 — 직접 입력하세요.");
    } finally {
      setAreaLoading(false);
    }
  }

  // PHD 환산 ON — 취득시 기준시가는 §164⑤ 환산으로 자동 산출(수동 조회 숨김 + echo).
  const phdActive = phd.phdMode === true;
  const phdEchoAcqStdPrice = useMemo(() => {
    if (!phdActive) return null;
    const phdInput = {
      firstDisclosurePrice: parseAmount(phd.firstDisclosurePrice ?? "0"),
      landAreaSqm: parseDecimal(phd.landAreaSqm ?? "0"),
      landPricePerSqmAtAcquisition: parseAmount(phd.landPricePerSqmAtAcq ?? "0"),
      landPricePerSqmAtFirstDisclosure: parseAmount(phd.landPricePerSqmAtFirst ?? "0"),
      buildingStdPriceAtAcquisition: parseAmount(phd.buildingStdAtAcq ?? "0"),
      buildingStdPriceAtFirstDisclosure: parseAmount(phd.buildingStdAtFirst ?? "0"),
    };
    if (!canCalcReductionPhd(phdInput)) return null;
    return calcReductionAcquisitionStdPrice(phdInput).estimatedAcquisitionStdPrice;
  }, [
    phdActive,
    phd.firstDisclosurePrice,
    phd.landAreaSqm,
    phd.landPricePerSqmAtAcq,
    phd.landPricePerSqmAtFirst,
    phd.buildingStdAtAcq,
    phd.buildingStdAtFirst,
  ]);

  return (
    <div className="space-y-3">
      {/* PHD 환산 — 취득시 기준시가 직전 배치(입력→출력 순서). ON 시 취득시 기준시가는 echo로 자동 산출. */}
      <ReductionPhdInput
        acquisitionDate={acquisitionDate}
        jibun={jibun}
        snapshotKeyPrefix={snapshotKeyPrefix}
        assetId={assetId}
        value={phd}
        onChange={onPhdChange}
        assetHasPhdData={!!assetPhdSnapshot}
        onCopyFromAsset={
          assetPhdSnapshot
            ? () => {
                // 스냅샷 7필드 동시 반영 — 단일 patch(부모 onChange 병합). phdMode는 제외.
                const s = assetPhdSnapshot;
                onPhdChange({
                  firstDisclosureDate: s.firstDisclosureDate,
                  firstDisclosurePrice: s.firstDisclosurePrice,
                  landAreaSqm: s.landAreaSqm,
                  landPricePerSqmAtAcq: s.landPricePerSqmAtAcq,
                  landPricePerSqmAtFirst: s.landPricePerSqmAtFirst,
                  buildingStdAtAcq: s.buildingStdAtAcq,
                  buildingStdAtFirst: s.buildingStdAtFirst,
                });
              }
            : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 취득시 기준시가 — PHD ON이면 echo(자동 산출), OFF면 수동 조회 위젯 */}
        {phdActive ? (
          <div className="sm:col-span-2" data-testid={`${testidPrefix}-stdprice-acq-echo`}>
            <label className="mb-1 block text-xs font-medium">취득시 기준시가</label>
            <div className="rounded-md border border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
              <p className="text-xs text-amber-900 dark:text-amber-200">
                최초공시 전 환산 자동 계산(§164⑤):{" "}
                <span className="font-semibold font-mono">
                  {phdEchoAcqStdPrice != null
                    ? `${phdEchoAcqStdPrice.toLocaleString()} 원`
                    : "위 환산 입력을 완료하세요"}
                </span>
              </p>
              <p className="mt-0.5 text-micro text-amber-800 dark:text-amber-300">
                최초공시 전 취득 — 취득시 기준시가는 위 환산으로 자동 산출됩니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <HousingStdPriceLookupField
              label="취득시 기준시가"
              value={stdPriceAtAcquisition}
              onChange={onStdPriceAtAcquisitionChange}
              jibun={jibun}
              dong={dong}
              ho={ho}
              referenceDate={acquisitionDate}
              hint="최초공시 전 취득이면 위 「최초공시 전 환산」 토글을 켜세요"
              onExclusiveArea={onExclusiveAreaChange ? (area) => onExclusiveAreaChange(String(area)) : undefined}
              testidPrefix={`${testidPrefix}-stdprice-acq`}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <HousingStdPriceLookupField
            label="5년 시점 기준시가"
            value={stdPriceAt5Years}
            onChange={onStdPriceAt5YearsChange}
            jibun={jibun}
            dong={dong}
            ho={ho}
            referenceDate={addYearsStr(acquisitionDate, 5)}
            hint="취득일 + 5년 시점 인접 고시일 가격 (5년 후 양도 시 필수)"
            onExclusiveArea={onExclusiveAreaChange ? (area) => onExclusiveAreaChange(String(area)) : undefined}
            testidPrefix={`${testidPrefix}-stdprice-5y`}
          />
        </div>

        <div className="sm:col-span-2">
          <HousingStdPriceLookupField
            label="양도시 기준시가"
            value={stdPriceAtTransfer}
            onChange={onStdPriceAtTransferChange}
            jibun={jibun}
            dong={dong}
            ho={ho}
            referenceDate={transferDate}
            hint="5년 후 양도 시 안분 계산에 필수 — 환산취득가액 모드가 아니면 자산값이 전달되지 않으므로 직접 입력하세요"
            onExclusiveArea={onExclusiveAreaChange ? (area) => onExclusiveAreaChange(String(area)) : undefined}
            testidPrefix={`${testidPrefix}-stdprice-transfer`}
          />
        </div>

        {showExclusiveArea && onExclusiveAreaChange && (
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium">전용면적 (㎡)</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <DecimalInput value={exclusiveArea ?? ""} onChange={onExclusiveAreaChange} />
            </div>
            <button
              type="button"
              onClick={lookupExclusiveArea}
              disabled={!jibun || areaLoading}
              data-testid={`${testidPrefix}-area-lookup-btn`}
              className="h-9 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors"
            >
              {areaLoading ? "조회 중…" : "전용면적 조회"}
            </button>
          </div>
          {areaMsg ? (
            <p className="mt-1 text-micro text-destructive" data-testid={`${testidPrefix}-area-status`}>
              {areaMsg}
            </p>
          ) : !jibun ? (
            <p className="mt-1 text-micro text-muted-foreground">소재지 지번 입력 시 조회 가능</p>
          ) : null}
          {areaHint && <p className="mt-1 text-micro text-muted-foreground">{areaHint}</p>}
        </div>
        )}
      </div>
    </div>
  );
}
