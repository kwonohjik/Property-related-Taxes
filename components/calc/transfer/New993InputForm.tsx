"use client";

/**
 * §99의3 신축주택 과세특례 본격 입력 폼 (UnifiedReductionPanel 800줄 정책 분리, P4 2026-06-12)
 *
 * 외부 계약 무변경 — 패널에서 import 1줄.
 */

import { useMemo, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReductionPhdInput, type ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { calcReductionAcquisitionStdPrice, canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";

/** YYYY-MM-DD 문자열의 연도에 n년 가산 (new Date 금지 정책 회피 — 5년 시점 referenceDate 파생). */
function addYearsStr(dateStr: string | undefined, n: number): string | undefined {
  if (!dateStr || dateStr.length < 10) return undefined;
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!Number.isFinite(year)) return undefined;
  return `${year + n}${dateStr.slice(4)}`;
}

// ============================================================================
// 서브 컴포넌트: §99의3 본격 입력 폼
// ============================================================================

export function New993InputForm({
  value,
  onUpdate,
  onUpdateMany,
  acquisitionDate,
  transferDate,
  jibun,
  dong,
  ho,
  assetPhdSnapshot,
}: {
  value: Extract<AssetReductionForm, { type: "new_99_3" }>;
  onUpdate: <K extends keyof Extract<AssetReductionForm, { type: "new_99_3" }>>(
    key: K,
    v: Extract<AssetReductionForm, { type: "new_99_3" }>[K],
  ) => void;
  /** 여러 필드 동시 갱신(단일 update) — 건물 기준시가 "모두 적용"처럼 한 이벤트에서 2필드 이상 변경 시 필수. */
  onUpdateMany: (patch: Partial<Extract<AssetReductionForm, { type: "new_99_3" }>>) => void;
  /** 자산의 취득일 — PHD 자동 활성화 권장 판정용 + 취득시/5년 기준시가 조회 referenceDate */
  acquisitionDate?: string;
  /** 자산의 양도일 — 양도시 기준시가 조회 referenceDate */
  transferDate?: string;
  /** 양도물건(asset) 지번 주소 — Vworld 기준시가 자동조회 소스 */
  jibun?: string;
  /** 양도물건 공동주택 동 — 세대 식별 */
  dong?: string;
  /** 양도물건 공동주택 호 — 세대 식별 */
  ho?: string;
  /** 자산-수준 PHD 데이터 스냅샷 — "자산 카드 PHD 데이터 가져오기" 버튼용 */
  assetPhdSnapshot?: ReductionPhdValue;
}) {
  const [areaLoading, setAreaLoading] = useState(false);
  const [areaMsg, setAreaMsg] = useState<string | null>(null);

  // 전용면적 전용 조회 — 기준시가 조회와 별개로 양도물건 주소·동/호로 Vworld 전용면적(prvuseAr)만 채움.
  // 전용면적은 연도 무관(고정) → 최근 연도부터 데이터 있는 해까지 순차 시도(AddressSearch 패턴).
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
          onUpdate("exclusiveAreaSqm993", String(json.exclusiveArea));
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

  // PHD 환산 ON — 취득시 기준시가는 PHD 환산으로 자동 산출(상단 수동 조회 숨김 + echo).
  const phdActive = value.phdMode993 === true;
  const phdEchoAcqStdPrice = useMemo(() => {
    if (!phdActive) return null;
    const phdInput = {
      firstDisclosurePrice: parseAmount(value.phdFirstDisclosurePrice993 ?? "0"),
      landAreaSqm: parseDecimal(value.phdLandAreaSqm993 ?? "0"),
      landPricePerSqmAtAcquisition: parseAmount(value.phdLandPricePerSqmAtAcq993 ?? "0"),
      landPricePerSqmAtFirstDisclosure: parseAmount(value.phdLandPricePerSqmAtFirst993 ?? "0"),
      buildingStdPriceAtAcquisition: parseAmount(value.phdBuildingStdAtAcq993 ?? "0"),
      buildingStdPriceAtFirstDisclosure: parseAmount(value.phdBuildingStdAtFirst993 ?? "0"),
    };
    if (!canCalcReductionPhd(phdInput)) return null;
    return calcReductionAcquisitionStdPrice(phdInput).estimatedAcquisitionStdPrice;
  }, [
    phdActive,
    value.phdFirstDisclosurePrice993,
    value.phdLandAreaSqm993,
    value.phdLandPricePerSqmAtAcq993,
    value.phdLandPricePerSqmAtFirst993,
    value.phdBuildingStdAtAcq993,
    value.phdBuildingStdAtFirst993,
  ]);

  // PHD 환산 위젯 (재사용) — 재배치 시 취득시 기준시가 직전, 미배치 시 하단.
  const phdSection = (
    <ReductionPhdInput
      acquisitionDate={acquisitionDate}
      jibun={jibun}
      snapshotKeyPrefix="red993"
      value={{
        phdMode: value.phdMode993,
        firstDisclosureDate: value.phdFirstDisclosureDate993,
        firstDisclosurePrice: value.phdFirstDisclosurePrice993,
        landAreaSqm: value.phdLandAreaSqm993,
        landPricePerSqmAtAcq: value.phdLandPricePerSqmAtAcq993,
        landPricePerSqmAtFirst: value.phdLandPricePerSqmAtFirst993,
        buildingStdAtAcq: value.phdBuildingStdAtAcq993,
        buildingStdAtFirst: value.phdBuildingStdAtFirst993,
      }}
      onChange={(patch) => {
        // 한 patch의 모든 키를 단일 update로 반영 — 개별 onUpdate 연속 호출은 stale reductions
        // spread로 서로를 덮어씀("취득·최초고시 모두 적용" 시 취득값이 옛 값으로 되돌아가는 버그).
        const mapped: Partial<Extract<AssetReductionForm, { type: "new_99_3" }>> = {};
        if (patch.phdMode !== undefined) mapped.phdMode993 = patch.phdMode;
        if (patch.firstDisclosureDate !== undefined) mapped.phdFirstDisclosureDate993 = patch.firstDisclosureDate;
        if (patch.firstDisclosurePrice !== undefined) mapped.phdFirstDisclosurePrice993 = patch.firstDisclosurePrice;
        if (patch.landAreaSqm !== undefined) mapped.phdLandAreaSqm993 = patch.landAreaSqm;
        if (patch.landPricePerSqmAtAcq !== undefined) mapped.phdLandPricePerSqmAtAcq993 = patch.landPricePerSqmAtAcq;
        if (patch.landPricePerSqmAtFirst !== undefined) mapped.phdLandPricePerSqmAtFirst993 = patch.landPricePerSqmAtFirst;
        if (patch.buildingStdAtAcq !== undefined) mapped.phdBuildingStdAtAcq993 = patch.buildingStdAtAcq;
        if (patch.buildingStdAtFirst !== undefined) mapped.phdBuildingStdAtFirst993 = patch.buildingStdAtFirst;
        onUpdateMany(mapped);
      }}
      assetHasPhdData={!!assetPhdSnapshot}
      onCopyFromAsset={
        assetPhdSnapshot
          ? () => {
              // 스냅샷 7필드 동시 반영 — 단일 update. 개별 onUpdate 연속 호출은 stale spread로 덮어씀.
              const s = assetPhdSnapshot;
              const mapped: Partial<Extract<AssetReductionForm, { type: "new_99_3" }>> = {};
              if (s.firstDisclosureDate !== undefined) mapped.phdFirstDisclosureDate993 = s.firstDisclosureDate;
              if (s.firstDisclosurePrice !== undefined) mapped.phdFirstDisclosurePrice993 = s.firstDisclosurePrice;
              if (s.landAreaSqm !== undefined) mapped.phdLandAreaSqm993 = s.landAreaSqm;
              if (s.landPricePerSqmAtAcq !== undefined) mapped.phdLandPricePerSqmAtAcq993 = s.landPricePerSqmAtAcq;
              if (s.landPricePerSqmAtFirst !== undefined) mapped.phdLandPricePerSqmAtFirst993 = s.landPricePerSqmAtFirst;
              if (s.buildingStdAtAcq !== undefined) mapped.phdBuildingStdAtAcq993 = s.buildingStdAtAcq;
              if (s.buildingStdAtFirst !== undefined) mapped.phdBuildingStdAtFirst993 = s.buildingStdAtFirst;
              onUpdateMany(mapped);
            }
          : undefined
      }
    />
  );

  // 취득시 기준시가 — PHD ON이면 echo(자동 산출), OFF면 수동 조회 위젯.
  const acqStdPriceBlock = phdActive ? (
    <div className="sm:col-span-2" data-testid="new993-stdprice-acq-echo">
      <label className="mb-1 block text-xs font-medium">취득시 기준시가</label>
      <div className="rounded-md border border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
        <p className="text-xs text-amber-900 dark:text-amber-200">
          PHD 환산 자동 계산(§164⑤):{" "}
          <span className="font-semibold font-mono">
            {phdEchoAcqStdPrice != null ? `${phdEchoAcqStdPrice.toLocaleString()} 원` : "위 PHD 입력을 완료하세요"}
          </span>
        </p>
        <p className="mt-0.5 text-micro text-amber-800 dark:text-amber-300">
          최초공시 전 취득 — 취득시 기준시가는 위 PHD 환산으로 자동 산출됩니다.
        </p>
      </div>
    </div>
  ) : (
    <div className="sm:col-span-2">
      <HousingStdPriceLookupField
        label="취득시 기준시가"
        value={value.standardPriceAtAcquisition993}
        onChange={(v) => onUpdate("standardPriceAtAcquisition993", v)}
        jibun={jibun}
        dong={dong}
        ho={ho}
        referenceDate={acquisitionDate}
        hint="최초고시 전 취득이면 위 PHD 환산 토글을 켜세요"
        onExclusiveArea={(area) => onUpdate("exclusiveAreaSqm993", String(area))}
        testidPrefix="new993-stdprice-acq"
      />
    </div>
  );

  return (
    <div className="mt-2 ml-7 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <p className="text-xs font-semibold text-primary">조특법 §99의3 신축주택 과세특례 입력</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §99의3" label="§99의3 신축주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §99" label="조특령 §99" />
      </div>

      {/* Round 9 정정 (2026-05-06): 1호(주건업) 시한 기준은 상단 "매매계약일"을 재사용. 본 폼에서는 입력 X. */}
      {value.acquisitionType993 === "from_builder" && (
        <div className="rounded-md border border-dashed border-primary/40 bg-primary/10 px-2.5 py-1.5">
          <p className="text-micro text-primary leading-relaxed">
            ℹ️ 1호 매매계약일은 <strong>상단 펼침 영역의 &ldquo;매매계약일 (분양/매매)&rdquo;</strong>을 사용합니다.
            §99의3 시한 판정 + 고가주택 적용기준일이 동일하게 처리됩니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">취득 유형</label>
          <Select
            value={value.acquisitionType993}
            onValueChange={(v) => v && onUpdate("acquisitionType993", v as "from_builder" | "self_built")}
          >
            <SelectTrigger>
              <SelectValue>
                {value.acquisitionType993 === "self_built"
                  ? "2호 — 자기건설 신축"
                  : "1호 — 주택건설사업자로부터 취득"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="from_builder">1호 — 주택건설사업자로부터 취득</SelectItem>
              <SelectItem value="self_built">2호 — 자기건설 신축</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">소재지</label>
          <Select
            value={value.region993}
            onValueChange={(v) => v && onUpdate("region993", v as "outside_speculation" | "speculation")}
          >
            <SelectTrigger>
              <SelectValue>
                {value.region993 === "speculation"
                  ? "가격 급등 지역(서울·과천·5대 신도시) — 적용 배제"
                  : "가격 급등 지역 외"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outside_speculation">가격 급등 지역 외</SelectItem>
              <SelectItem value="speculation">가격 급등 지역(서울·과천·5대 신도시) — 적용 배제</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.acquisitionType993 === "self_built" && (
          <div>
            <label className="mb-1 block text-xs font-medium">사용승인일</label>
            <DateInput value={value.usageApprovalDate993 ?? ""} onChange={(v) => onUpdate("usageApprovalDate993", v)} />
            <p className="mt-1 text-micro text-muted-foreground">2001.5.23~2003.6.30 시한</p>
          </div>
        )}
      </div>

      {/* PHD 환산 — 취득시 기준시가 직전 배치(입력→출력 순서). ON 시 취득시 기준시가는 아래 echo로 자동 산출. */}
      {phdSection}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {acqStdPriceBlock}

        <div className="sm:col-span-2">
          <HousingStdPriceLookupField
            label="5년 시점 기준시가"
            value={value.standardPriceAt5Years}
            onChange={(v) => onUpdate("standardPriceAt5Years", v)}
            jibun={jibun}
            dong={dong}
            ho={ho}
            referenceDate={addYearsStr(acquisitionDate, 5)}
            hint="취득일 + 5년 시점 인접 고시일 가격"
            onExclusiveArea={(area) => onUpdate("exclusiveAreaSqm993", String(area))}
            testidPrefix="new993-stdprice-5y"
          />
        </div>

        <div className="sm:col-span-2">
          <HousingStdPriceLookupField
            label="양도시 기준시가 (선택)"
            value={value.standardPriceAtTransfer993 ?? ""}
            onChange={(v) => onUpdate("standardPriceAtTransfer993", v)}
            jibun={jibun}
            dong={dong}
            ho={ho}
            referenceDate={transferDate}
            hint="미입력 시 자산의 양도시 기준시가 사용"
            onExclusiveArea={(area) => onUpdate("exclusiveAreaSqm993", String(area))}
            testidPrefix="new993-stdprice-transfer"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">전용면적 (㎡)</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <DecimalInput value={value.exclusiveAreaSqm993} onChange={(v) => onUpdate("exclusiveAreaSqm993", v)} />
            </div>
            <button
              type="button"
              onClick={lookupExclusiveArea}
              disabled={!jibun || areaLoading}
              data-testid="new993-area-lookup-btn"
              className="h-9 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors"
            >
              {areaLoading ? "조회 중…" : "전용면적 조회"}
            </button>
          </div>
          {areaMsg ? (
            <p className="mt-1 text-micro text-destructive" data-testid="new993-area-status">{areaMsg}</p>
          ) : !jibun ? (
            <p className="mt-1 text-micro text-muted-foreground">소재지 지번 입력 시 조회 가능</p>
          ) : null}
          <p className="mt-1 text-micro text-muted-foreground">공동주택 조회 시 자동 채움 · 2002.12.31 이전 취득 고가주택 판정(165/149㎡ AND 6억 초과)</p>
        </div>
      </div>

      {value.acquisitionType993 === "from_builder" && (
        <ToggleCard
          variant="chip"
          checked={value.hasOccupancyAtContract ?? false}
          onCheckedChange={(v) => onUpdate("hasOccupancyAtContract", v)}
          title="매매계약일 현재 다른 자가 입주한 사실 있음"
          description="1호 단서 — 적용 배제"
          tone="rose"
        />
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          checked={value.isResident993}
          onCheckedChange={(v) => onUpdate("isResident993", v)}
          title="거주자"
          description="체크 해제 시 적용 배제"
          tone="violet"
        />
        <ToggleCard
          variant="chip"
          checked={value.isHousingConstructionBusiness993}
          onCheckedChange={(v) => onUpdate("isHousingConstructionBusiness993", v)}
          title="본인이 주택건설사업자"
          description="체크 시 적용 배제"
          tone="rose"
        />
      </div>

      <p className="text-micro text-muted-foreground">
        ※ 5년 내 양도 = 양도소득금액 전액 차감 / 5년 후 양도 = 5년 안분 산식 적용
      </p>
    </div>
  );
}

