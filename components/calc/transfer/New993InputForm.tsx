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
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReductionPhdInput, type ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { calcReductionAcquisitionStdPrice, canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";
import { isAddenda29_2WindowIso } from "@/lib/tax-engine/transfer-reductions/new-99-3-era";
import { isNew993PriorRuleEraIso } from "@/lib/tax-engine/transfer-reductions/new-99-3-era";
import { needsFirstContractAnswer } from "@/lib/tax-engine/transfer-reductions/new-99-acquisition-cause";
import { New99LuxuryHouseFields } from "@/components/calc/transfer/New99LuxuryHouseFields";
import { New99FirstContractField } from "@/components/calc/transfer/New99LuxuryHouseFields";
import { NEW_99_3_ADDENDA_6762 } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import type { RedevMemberFormScope } from "@/lib/calc/redev-field-scope";
import { RedevMemberNewHouseFields } from "@/components/calc/transfer/RedevMemberNewHouseFields";

/** YYYY-MM-DD 문자열의 연도에 n년 가산 (new Date 금지 정책 회피 — 5년 시점 referenceDate 파생). */
function addYearsStr(dateStr: string | undefined, n: number): string | undefined {
  if (!dateStr || dateStr.length < 10) return undefined;
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!Number.isFinite(year)) return undefined;
  return `${year + n}${dateStr.slice(4)}`;
}

/** 법률 제6762호 부칙 §29② — 2003.1.1. 전 공사 착수 여부 (2호 · 사용승인 2003.1.1.~6.30.만 묻는다). */
const CONSTRUCTION_START_OPTIONS = [
  {
    value: "yes" as const,
    label: "예 — 2003.1.1. 전에 공사에 착수했다",
    description: "종전 규정 적용(가격 급등 지역 제외 없음 · 종전 고급주택 기준)",
    testId: "new993-construction-start-yes",
  },
  {
    value: "no" as const,
    label: "아니오 — 2003.1.1. 이후에 착수했다",
    description: "개정규정 적용(가격 급등 지역 제외 · 양도 당시 고가주택 기준)",
    testId: "new993-construction-start-no",
  },
  {
    value: "unknown" as const,
    label: "모름",
    description: "개정규정으로 계산하고 결과에 확인 필요로 표시합니다",
    testId: "new993-construction-start-unknown",
  },
];

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
  assetId,
  assetPhdSnapshot,
  acquisitionCause,
  assetContractDate,
  redevMember,
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
  assetId?: string;
  assetPhdSnapshot?: ReductionPhdValue;
  /** 자산 취득 원인 — 매매 취득일 때만 최초 계약 여부를 묻는다(상속·증여는 엔진이 불성립, NH-17) */
  acquisitionCause?: string;
  /** 자산-수준 매매계약일 — 1호 기준일(종전 규정 시기 판정, NH-02) */
  assetContractDate?: string;
  /** 재개발 완공 아파트 조합원 갈래(NH-36) — 취득 유형·매매계약일 대신 준공일로 판정하고, 주택 출자면 재개발 변형이 고정된다(NH-32) */
  redevMember?: RedevMemberFormScope;
}) {
  // 조합원 갈래 — 엔진(`income-deduction-router` evalNew993)·⑧·④와 같은 축: 자기건설·준공일·출자 자산 사실 변형
  const memberCompletion = redevMember ? redevMember.completionDate || undefined : undefined;
  const effType = redevMember ? ("self_built" as const) : value.acquisitionType993;
  const effUsage = redevMember ? memberCompletion : value.usageApprovalDate993;
  /** 신축주택 취득일 — 조합원은 준공일(서면인터넷방문상담4팀-2145 · NH-63). 기준시가 조회 기준일도 이 날이다. */
  const newHouseAcqDate = redevMember ? memberCompletion : acquisitionDate;
  const variantOn = redevMember ? redevMember.houseContributed : !!value.isRedevelopedNewHouse993;
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
      acquisitionDate={newHouseAcqDate}
      jibun={jibun}
      snapshotKeyPrefix="red993"
      assetId={assetId}
      fieldType="new_99_3"
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
          최초공시 전 환산 자동 계산(§164⑦):{" "}
          <span className="font-semibold font-mono tabular-nums">
            {phdEchoAcqStdPrice != null ? `${phdEchoAcqStdPrice.toLocaleString()} 원` : "위 환산 입력을 완료하세요"}
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
        data-field="reduction.new_99_3.standardPriceAtAcquisition"
        value={value.standardPriceAtAcquisition993}
        onChange={(v) => onUpdate("standardPriceAtAcquisition993", v)}
        jibun={jibun}
        dong={dong}
        ho={ho}
        referenceDate={newHouseAcqDate}
        hint="최초공시 전 취득이면 위 「최초공시 전 환산」 토글을 켜세요"
        onExclusiveArea={(area) => onUpdate("exclusiveAreaSqm993", String(area))}
        testidPrefix="new993-stdprice-acq"
      />
    </div>
  );

  const previousHouseStdField = (
        <div>
          <label className="mb-1 block text-xs font-medium">종전주택 취득 당시 기준시가</label>
          <CurrencyInput
            data-field="reduction.new_99_3.previousHouseStdPrice993"
            value={value.previousHouseStdPrice993}
            onChange={(v) => onUpdate("previousHouseStdPrice993", v)}
            label=""
          />
          <p className="mt-1 text-micro text-muted-foreground">
            정비사업조합 조합원이 관리처분계획에 따라 취득했거나, 거주·보유 중 소실·붕괴·노후로
            멸실되어 재건축한 경우에 해당합니다 (법 §98의3② 각 호)
          </p>
        </div>
  );

  return (
    <div className="mt-2 ml-7 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <p className="text-xs font-semibold text-primary">조특법 §99의3 신축주택 과세특례 입력</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §99의3" label="§99의3 신축주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §99의3" label="조특령 §99의3" />
      </div>

      {/* Round 9 정정 (2026-05-06): 1호(주건업) 시한 기준은 상단 "매매계약일"을 재사용. 본 폼에서는 입력 X. */}
      {!redevMember && value.acquisitionType993 === "from_builder" && (
        <div className="rounded-md border border-dashed border-primary/40 bg-primary/10 px-2.5 py-1.5">
          <p className="text-micro text-primary leading-relaxed">
            ℹ️ 1호 매매계약일은 <strong>상단 펼침 영역의 &ldquo;매매계약일 (분양/매매)&rdquo;</strong>을 사용합니다.
            §99의3 시한 판정 + 고가주택 적용기준일이 동일하게 처리됩니다.
          </p>
        </div>
      )}

      {/* NH-17 — 1호 매매 취득은 최초 계약자인지 묻는다(분양권 승계 불성립). ⑧·④가 같은 술어. */}
      {!redevMember && needsFirstContractAnswer(value.acquisitionType993, acquisitionCause) && (
        <div data-field="reduction.new_99_3.firstContract993">
          <New99FirstContractField
            testidPrefix="new993"
            value={value.firstContract993 ?? ""}
            onChange={(v) => onUpdate("firstContract993", v)}
            lawLabel="조세특례제한법 §99의3①1호"
          />
        </div>
      )}

      {/* ① 형제 감면 폼 10종과 같은 「색상 카드 + 섹션 번호」 패턴 (2026-09-07 UI 리뷰 L5).
          외곽 primary 래퍼는 저장소 관용구라 그대로 둔다 — 갈린 것은 번호 축뿐이었다. */}
      <ToneCard tone="sky" sectionNum="①" title="취득 유형 · 소재지" bodyClassName="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {redevMember ? (
          <RedevMemberNewHouseFields
            article="new_99_3"
            member={redevMember}
            remainderContract={value.remainderContract993 ?? ""}
            onRemainderContractChange={(v) => onUpdate("remainderContract993", v)}
          />
        ) : (
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
        )}

        <div>
          <label className="mb-1 block text-xs font-medium">소재지</label>
          <Select
            value={value.region993}
            onValueChange={(v) => v && onUpdate("region993", v as "outside_speculation" | "speculation")}
          >
            <SelectTrigger>
              <SelectValue>
                {value.region993 === "speculation"
                  ? "가격 급등 지역(서울·과천·5대 신도시) — 2003.1.1. 이후 계약·승인분만 적용 배제"
                  : "가격 급등 지역 외"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outside_speculation">가격 급등 지역 외</SelectItem>
              <SelectItem value="speculation">가격 급등 지역(서울·과천·5대 신도시) — 2003.1.1. 이후 계약·승인분만 적용 배제</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-micro text-muted-foreground">
            지역 제외는 2003.1.1. 시행 개정규정부터입니다 — 그 전 계약·사용승인분은 종전 규정이라 해당 지역이어도 배제하지 않습니다 ({NEW_99_3_ADDENDA_6762.PRIOR_CONTRACT_OR_APPROVAL})
          </p>
        </div>

        {!redevMember && value.acquisitionType993 === "self_built" && (
          <div>
            <label className="mb-1 block text-xs font-medium">사용승인일</label>
            <DateInput data-field="reduction.new_99_3.usageApprovalDate993" value={value.usageApprovalDate993 ?? ""} onChange={(v) => onUpdate("usageApprovalDate993", v)} />
            <p className="mt-1 text-micro text-muted-foreground">2001.5.23~2003.6.30 시한</p>
          </div>
        )}

        {/* 부칙 §29② — 사용승인이 2003.1.1.~6.30.일 때만 묻는다. 모름도 선택지(= 개정규정 + 확인 필요)이며 미응답은 validate(⑧)가 막는다. */}
        {isAddenda29_2WindowIso(effType, effUsage) && (
          <div className="space-y-1.5 sm:col-span-2" data-field="reduction.new_99_3.constructionStartedBefore2003_993">
            <p className="text-caption text-muted-foreground font-medium">2003.1.1. 전에 공사에 착수했나요?</p>
            <RadioCardGroup
              name="new993-construction-start"
              tone="amber"
              layout="stack"
              options={CONSTRUCTION_START_OPTIONS}
              value={value.constructionStartedBefore2003_993 ?? ""}
              onChange={(v) => onUpdate("constructionStartedBefore2003_993", v)}
              data-testid="new993-construction-start"
            />
            <p className="text-micro text-muted-foreground">
              사용승인일이 2003.1.1.~2003.6.30.인 자기건설 주택은 2003.1.1. 전에 공사에 착수한 경우에만 종전 규정이 적용됩니다 ({NEW_99_3_ADDENDA_6762.PRIOR_CONSTRUCTION_STARTED})
            </p>
          </div>
        )}
      </div>

      </ToneCard>

      {/* ② 기준시가 3시점 + 전용면적. PHD 환산은 취득시 기준시가 직전 배치(입력→출력 순서) —
          ON 시 취득시 기준시가는 아래 echo로 자동 산출된다. */}
      <ToneCard tone="emerald" sectionNum="②" title="기준시가 · 전용면적" bodyClassName="space-y-3">
      {phdSection}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {acqStdPriceBlock}

        <div className="sm:col-span-2">
          <HousingStdPriceLookupField
            label="5년 시점 기준시가"
            data-field="reduction.new_99_3.standardPriceAt5Years"
            value={value.standardPriceAt5Years}
            onChange={(v) => onUpdate("standardPriceAt5Years", v)}
            jibun={jibun}
            dong={dong}
            ho={ho}
            referenceDate={addYearsStr(newHouseAcqDate, 5)}
            hint="취득일 + 5년 시점 인접 고시일 가격"
            onExclusiveArea={(area) => onUpdate("exclusiveAreaSqm993", String(area))}
            testidPrefix="new993-stdprice-5y"
          />
        </div>

        <div className="sm:col-span-2">
          <HousingStdPriceLookupField
            /**
             * 🔴 라벨이 ⑧의 필수 여부를 따라간다 (2026-09-07 UI 리뷰) — 재개발 변형을 켜면
             *    5년 **이내** 양도도 안분 경로라 이 값이 없으면 엔진이 감면 0을 낸다.
             */
            label={
              variantOn
                ? "양도시 기준시가 (필수 — 재개발 변형)"
                : "양도시 기준시가 (5년 경과 양도 시 필수)"
            }
            data-field="reduction.new_99_3.standardPriceAtTransfer993"
            value={value.standardPriceAtTransfer993 ?? ""}
            onChange={(v) => onUpdate("standardPriceAtTransfer993", v)}
            jibun={jibun}
            dong={dong}
            ho={ho}
            referenceDate={transferDate}
            hint="5년 후 양도 시 안분 계산에 필수 — 환산취득가액·기준시가 안분 모드가 아니면 자산값이 전달되지 않으므로 직접 입력하세요"
            onExclusiveArea={(area) => onUpdate("exclusiveAreaSqm993", String(area))}
            testidPrefix="new993-stdprice-transfer"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">전용면적 (㎡)</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <DecimalInput data-field="reduction.new_99_3.exclusiveAreaSqm993" value={value.exclusiveAreaSqm993} onChange={(v) => onUpdate("exclusiveAreaSqm993", v)} />
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
          <p className="mt-1 text-micro text-muted-foreground">공동주택 조회 시 자동 채움 · 종전 규정 적용분(2002.12.31. 이전 계약·승인 등)의 고급주택 판정(165/149㎡ AND 6억 초과)</p>
        </div>
      </div>
      {/* NH-02 — 종전 규정 적용분은 당시 소득세법 시행령 §156(공동·단독·시설 — 3호는 단독만). ⑧·⑫와 같은 술어. 기준일이 모두 2001년 이후라 하한은 기준시가 4천만원. */}
      {isNew993PriorRuleEraIso(
        effType,
        redevMember ? undefined : value.contractDate993 || assetContractDate,
        effUsage,
        newHouseAcqDate,
        value.constructionStartedBefore2003_993,
      ) && (
        <New99LuxuryHouseFields
          reductionType="new_99_3"
          testidPrefix="993"
          floorLabel="소득세법 §99①1호나목 기준시가가 4천만원 이상"
          value={{
            houseType: value.houseType993 ?? "",
            grossFloorAreaSqm: value.grossFloorAreaSqm993 ?? "",
            attachedLandAreaSqm: value.attachedLandAreaSqm993 ?? "",
            stdPriceFloorMet: value.stdPriceFloorMet993 ?? "",
            luxuryFacility: value.luxuryFacility993 ?? "",
          }}
          onChange={(p) =>
            onUpdateMany({
              ...(p.houseType !== undefined ? { houseType993: p.houseType } : {}),
              ...(p.grossFloorAreaSqm !== undefined ? { grossFloorAreaSqm993: p.grossFloorAreaSqm } : {}),
              ...(p.attachedLandAreaSqm !== undefined ? { attachedLandAreaSqm993: p.attachedLandAreaSqm } : {}),
              ...(p.stdPriceFloorMet !== undefined ? { stdPriceFloorMet993: p.stdPriceFloorMet } : {}),
              ...(p.luxuryFacility !== undefined ? { luxuryFacility993: p.luxuryFacility } : {}),
            })
          }
        />
      )}
      </ToneCard>

      {/* 조특령 §99의3④는 법 §99의3①1호의 사유 — 2호(자기건설)에는 묻지 않는다 (리뷰 NH-57). ⑧·엔진과 같은 술어(2호가 아니면 1호). */}
      {!redevMember && value.acquisitionType993 !== "self_built" && (
        <ToggleCard
          tone="rose"
          title="2001.5.23 전 분양계약 해제 후 재계약·대체취득"
          description="해제한 본인·배우자(직계존비속·형제자매 포함)가 당초 주택을 다시 분양받거나 대체하여 다른 주택을 분양받아 취득한 주택은 배제됩니다 (조특령 §99의3④)"
          checked={value.isRecontractExcluded993}
          onCheckedChange={(v) => onUpdate("isRecontractExcluded993", v)}
        >
          {/* 조특칙 §44의4 카브백 — 없으면 부득이한 사유 대체취득자를 법 근거 없이 배제한다. */}
          <ToggleCard
            variant="chip"
            tone="emerald"
            title="부득이한 사유로 «다른 주택»을 분양받아 취득"
            description={"취학·근무상 형편·1년 이상 치료를 요하는 질병·학교폭력 전학 사유로 다른 시·군으로 주거를 이전하면서 «당해 주택건설업자로부터 다른 주택»을 분양받은 경우에는 배제하지 않습니다 (조특칙 §44의4 → 소득세법 시행규칙 §71③)"}
            checked={value.recontractUnavoidableCause993}
            onCheckedChange={(v) => onUpdate("recontractUnavoidableCause993", v)}
          />
        </ToggleCard>
      )}

      {/*
        조특령 §99의3② 1호 단서·2호 괄호 — 재개발·재건축 신축주택 안분 변형.
        §99(`New99InputForm.tsx` ③ 섹션)와 동일 패턴. 대상은 「법 §98의3② 각 호」:
          1호 정비사업조합 조합원이 관리처분계획에 따라 취득하는 주택
          2호 거주·보유 중 소실·붕괴·노후 등으로 멸실되어 재건축한 주택
      */}
      {/* NH-32 — 재개발 완공 아파트 조합원은 출자 자산 사실이 정한다: 주택 출자면 항상 적용(토글 없음), 토지 출자·승계면 해당 없음(엔진·⑧과 같은 술어). */}
      {redevMember ? (
        redevMember.houseContributed && (
          <ToneCard tone="violet" title="종전주택을 재개발·재건축하여 취득한 신축주택 — 적용" bodyClassName="space-y-2">
            <p className="text-micro text-muted-foreground">
              주택을 출자한 조합원의 신축주택이라 5년 이내 양도도 안분하고 분모가 종전주택 취득 당시 기준시가입니다 (조특령 §99의3② 1호 단서·2호 괄호 · 법 §98의3②1호)
            </p>
            {previousHouseStdField}
          </ToneCard>
        )
      ) : (
        <ToggleCard
          tone="violet"
          title="종전주택을 재개발·재건축하여 취득한 신축주택"
          description="5년 이내 양도도 안분 적용 — 분모가 종전주택 취득 당시 기준시가로 바뀝니다 (조특령 §99의3② 1호 단서·2호 괄호)"
          checked={value.isRedevelopedNewHouse993}
          onCheckedChange={(v) => onUpdate("isRedevelopedNewHouse993", v)}
        >
          {previousHouseStdField}
        </ToggleCard>
      )}

      {!redevMember && value.acquisitionType993 === "from_builder" && (
        <ToggleCard
          variant="chip"
          checked={value.hasOccupancyAtContract ?? false}
          onCheckedChange={(v) => onUpdate("hasOccupancyAtContract", v)}
          title="매매계약일 현재 입주한 사실 있음"
          description="법 §99의3①1호 단서 「매매계약일 현재 입주한 사실이 있거나」 — 적용 배제"
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

