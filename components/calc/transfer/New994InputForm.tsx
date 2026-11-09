"use client";

/**
 * §99의4 농어촌주택·고향주택 — 주택수 제외 입력 폼 (rural/hometown 공용)
 *
 * 효과: 농어촌주택등을 소유주택에서 제외하여 1세대1주택으로 보아 소법 §89①3호 적용
 *       (비과세·12억 안분·장기보유특별공제 표2). 다주택 중과 주택수에는 미반영(R-D).
 *
 * 다-섹션 색상 카드 + 번호: ① amber 취득 정보 ② sky 가액 요건 ③ rose 소재지·자격
 * + emerald 자동 표시 (useMemo 파생, store 미기록 — 적격 판정은 엔진 단일 진실).
 */

import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { toOptionalDate } from "@/lib/api/date-coerce";
import {
  NEW_99_4_HANOK_DECREE,
  NEW_99_4_STD_PRICE_ADDENDA,
  NEW_HOUSING_SUB_ARTICLE,
} from "@/lib/tax-engine/legal-codes/transfer";
import { resolveNew994StdPriceLimit } from "@/lib/tax-engine/transfer-reductions/new-99-4";
import {
  new994OpportunityZoneApplies,
  new994RegulatedAreaLabel,
  resolveNew994AdjacentScope,
} from "@/lib/tax-engine/transfer-reductions/new-99-4-area";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { new994CapitalRegionConflict, resolveNew994SizeScope } from "@/lib/tax-engine/transfer-reductions/new-99-4-size";
import { new994AdjacentAnswer } from "@/lib/calc/new-99-4-form";

type New994Rural = Extract<AssetReductionForm, { type: "new_99_4_rural" }>;
type New994Hometown = Extract<AssetReductionForm, { type: "new_99_4_hometown" }>;
type New994Form = New994Rural | New994Hometown;

interface Props {
  value: New994Form;
  onChange: (patch: Partial<New994Hometown>) => void;
  /** 자산의 양도일 — 보유기간 미리보기·추징 경고 예고 */
  transferDate?: string;
  /**
   * 명부 행 ⑥에서 쓸 때(판정 메뉴·계산기) — 취득일·주소는 **행 값**이다(`HouseEntry.countExclusion` 주석).
   * 주면 두 칸을 입력으로 받지 않고 읽기 전용으로 보여 준다(두 벌 입력 금지).
   */
  rowFacts?: {
    acquisitionDate: string;
    jibun: string;
    /** 행 전용면적(㎡) — 공동주택 면적 요건(NH-05 PR-2b)은 이 값으로 본다 */
    exclusiveArea?: string;
    /** 행 법정동코드 — 수도권 모순 안내(NH-20) */
    regionCode?: string;
  };
}

/**
 * 보유 연수 — **엔진과 같은 함수**(`calculateHoldingPeriod`)를 쓴다.
 *
 * 🔴 종전에는 월 단위 뺄셈이라 **일(day)을 보지 않았다**: 취득 2020-03-31 → 양도 2023-03-01이면
 *    months = 36이 되어 「3년」으로 표시됐다(실제 2년 11개월). 그 결과 아래 `< 3` 조건이
 *    거짓이 되어 「⚠ 보유 3년 미만 — … 2개월 내 납부해야 합니다 (§99의4⑥)」 **추징 경고가
 *    사라졌다** — 사후 추징 위험이 있는 사용자에게 안전하다는 신호를 준 셈이다.
 *
 * 엔진의 보유기간 함수(`calculateHoldingPeriod`, §95④ 초일 산입)를 그대로 빌려 화면과 계산이
 * 갈리지 않게 한다.
 */
function diffYears(from: string, to: string): number | null {
  if (!from || !to) return null;
  const d1 = new Date(from);
  const d2 = new Date(to);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  if (d2.getTime() < d1.getTime()) return null;
  return calculateHoldingPeriod(d1, d2).years;
}

/**
 * ③ 소재지 토글 설명 — 「취득 당시」 기준(§99의4①1호가목·2호나목). 배제 지역 문언은 취득일(지정지역→조정대상지역,
 * 법률 제17759호 부칙 제21조①), 기회발전특구는 양도일(법률 제19936호 부칙 제16조), 수도권 예외 가평군은
 * 양도일(조세특례제한법 시행규칙 기획재정부령 제1119호 부칙 제4조 「이 규칙 시행 이후 주택을 양도하는 경우부터」)로 갈린다. 엔진 사유와 같은 함수(`new-99-4-area`)로 문언을 고른다.
 */
function locationDescription(isHometown: boolean, acquisitionDate: string, transferDate: string): string {
  const acquired = toOptionalDate(acquisitionDate);
  const transfer = toOptionalDate(transferDate);
  const regulated = new994RegulatedAreaLabel(acquired);
  if (isHometown) {
    return `취득 당시 별표12 시 지역에 있고 수도권·${regulated}·관광단지가 아니면 켜세요 (§99의4①2호나목)`;
  }
  const opportunity =
    new994OpportunityZoneApplies(transfer) === false
      ? ""
      : " · 기회발전특구에 있으면 충족(2024.1.1. 이후 양도분부터)";
  // 2026.2.27. 개정 전 조특령 §99의4② 「동」은 「일반주택이 소재하는 동과 같거나 연접하지 아니하는 동」이었다.
  // 날짜 값은 위 toOptionalDate로 검증된 YYYY-MM-DD라 문자열 비교로 시기를 가른다.
  const beforeDongRule = !acquired || acquisitionDate < "2026-01-01";
  const dong = beforeDongRule
    ? ` · 2026.1.1. 전 취득분이 동에 있으면 일반주택이 있는 동과 같거나 연접하지 아니하는 동이어야 합니다(2026.2.27. 개정 전 조특령 §99의4②${
        transfer && transferDate >= "2026-02-27" ? " — 2026.2.27. 이후 양도분에 적용되는지는 확인 필요" : ""
      })`
    : "";
  return (
    `취득 당시 읍·면 또는 별표12 시 지역에 속한 동에 있고, 수도권(접경지역 예외 — 연천·가평군, 강화·옹진군은 양도일에 따라 범위가 다르며 가평군은 2025.3.21. 이후 양도분부터)·` +
    `도시지역(인구감소지역 중 영암·해남, 태안 관광레저형 기업도시개발구역은 예외 — 조특령 §99의4④ 2023.2.28. 신설)·` +
    `${regulated}·허가구역·관광단지가 아니면 켜세요${opportunity}${dong} (§99의4①1호가목)`
  );
}

export function New994InputForm({ value, onChange, transferDate, rowFacts }: Props) {
  const isHometown = value.type === "new_99_4_hometown";
  const houseLabel = isHometown ? "고향주택" : "농어촌주택";
  const acquisitionDate = rowFacts ? rowFacts.acquisitionDate : value.ruralHouseAcquisitionDate;
  const jibun = rowFacts ? rowFacts.jibun : (value.ruralHouseJibun ?? "");

  // emerald 자동 표시 — 보유기간 미리보기 (엔진 판정과 별개 참고용)
  const holdingYears = useMemo(
    () => diffYears(acquisitionDate, transferDate ?? ""),
    [acquisitionDate, transferDate],
  );

  // 가액 한도 hint — 엔진과 같은 함수(양도일·취득일로 한도가 갈린다). store 기록 없는 파생값.
  const stdPriceHint = useMemo(() => {
    const transfer = toOptionalDate(transferDate);
    const acquired = toOptionalDate(acquisitionDate);
    if (!transfer || !acquired) {
      return "한도는 양도일·취득일에 따라 다릅니다(2023.1.1. 이후 양도 3억, 그 전 2억 등) — 양도일을 먼저 입력하세요";
    }
    const [amount, note] = resolveNew994StdPriceLimit({
      transferDate: transfer,
      ruralHouseAcquisitionDate: acquired,
      isRegisteredHanok: value.isRegisteredHanok,
    }).label.split(" — ");
    return `주택+부속토지 합계 — ${amount} 이하${note ? ` (${note})` : ""} 요건 (양도일·취득일 기준, §99의4①)`;
  }, [transferDate, acquisitionDate, value.isRegisteredHanok]);

  // ③ 비교 단위 — 엔진 사유와 같은 함수(취득일·양도일별). store 기록 없는 파생값.
  const adjacentScope = useMemo(
    () =>
      resolveNew994AdjacentScope({
        isHometown,
        ruralHouseAcquisitionDate: toOptionalDate(acquisitionDate),
        transferDate: toOptionalDate(transferDate),
      }),
    [isHometown, acquisitionDate, transferDate],
  );
  const adjacentTail = adjacentScope
    ? [adjacentScope.basis, adjacentScope.unsettled].filter(Boolean).join(" · ")
    : "";
  const adjacentUnit = adjacentScope ? adjacentScope.unit : "행정구역";

  // 종전 면적 요건 범위(대지 2021.1.1. 전 양도 · 주택 2017.1.1. 전 양도) — ⑧·엔진과 같은 함수. store 기록 없는 파생값.
  const sizeScope = useMemo(
    () =>
      resolveNew994SizeScope({
        transferDate: toOptionalDate(transferDate),
        ruralHouseAcquisitionDate: toOptionalDate(acquisitionDate),
      }),
    [transferDate, acquisitionDate],
  );

  // NH-20 — 행 주소가 예외 아닌 수도권인데 소재지 요건을 켰으면 ⑧·⑫가 막는다. 같은 문장을 여기서 먼저 보인다.
  const capitalConflict = new994CapitalRegionConflict({
    isHometown,
    meetsLocationRequirement: value.meetsLocationRequirement,
    regionCode: rowFacts?.regionCode,
    transferDate: toOptionalDate(transferDate),
    ruralHouseAcquisitionDate: toOptionalDate(acquisitionDate),
  });

  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §99의4①" label="§99의4① 농어촌·고향주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §99의4" label="조특령 §99의4" />
      </div>

      {/* ① 취득 정보 */}
      <ToneCard tone="amber" sectionNum="①" title={`${houseLabel} 취득 정보`}>
        <div>
          <label className="mb-1 block text-xs font-medium">{houseLabel} 취득일</label>
          {rowFacts ? (
            <p className="text-sm" data-testid="new994-row-acq-date">
              {rowFacts.acquisitionDate || "—"}{" "}
              <span className="text-caption text-muted-foreground">(이 주택의 기본 정보 취득일)</span>
            </p>
          ) : (
            <DateInput
              value={value.ruralHouseAcquisitionDate}
              onChange={(v) => onChange({ ruralHouseAcquisitionDate: v })}
            />
          )}
          <p className="mt-1 text-micro text-muted-foreground">
            취득기간 {isHometown ? "2009.1.1" : "2003.8.1"}~2028.12.31 — 일반주택(양도 주택)을 먼저
            취득한 후 취득한 {houseLabel}이어야 합니다 (§99의4①)
          </p>
          <p className="mt-1 text-micro text-muted-foreground" data-testid="new994-expansion-date-hint">
            증축 또는 부수토지 추가 취득이 있어도 보유기간·취득기간 이내 취득 여부·소재지 판정은 당초 취득일 기준입니다 — 이 칸에는 당초 취득일을
            입력하세요 ({NEW_HOUSING_SUB_ARTICLE.NEW_99_4_EXPANSION_HOLDING_DECREE}1호)
          </p>
          <p className="mt-1 text-micro text-muted-foreground" data-testid="new994-para5-hint">
            양도일이 2019.1.1.~2020.12.31.이면 양도 뒤 예정신고기한(양도일이 속하는 달의 말일부터 2개월)까지 취득한 경우도 같은
            칸에 입력하세요 — 수도권 조정대상지역 2주택(양도 시 개별주택가격·공동주택가격 합산 6억원 이하)이면 중과 배제·장기보유특별공제
            적용을 판정합니다 (§99의4⑤, 2025.12.23. 삭제 · 양도일 시행본 적용)
          </p>
        </div>
      </ToneCard>

      {/* ② 가액 요건 */}
      <ToneCard tone="sky" sectionNum="②" title="가액 요건">
        {/* 행에서 쓸 때는 주소도 행 값이다(기본 정보의 주소 검색). */}
        {!rowFacts && (
          <>
            {/* 농어촌주택 주소 — 기준시가 조회 소스(양도물건이 아닌 별개 물건) */}
            <div>
              <label className="mb-1 block text-xs font-medium">{houseLabel} 주소 (기준시가 조회용)</label>
              <AddressSearch
                value={
                  {
                    road: "",
                    jibun: value.ruralHouseJibun ?? "",
                    building: "",
                    detail: "",
                    lng: "",
                    lat: "",
                  } satisfies AddressValue
                }
                onChange={(v) => onChange({ ruralHouseJibun: v.jibun })}
                disableUnits
              />
              <p className="mt-1 text-micro text-muted-foreground">
                양도주택이 아닌 {houseLabel}의 주소 — 취득 당시 기준시가 조회에 사용합니다
              </p>
            </div>
          </>
        )}
        <HousingStdPriceLookupField
          label="취득 당시 기준시가 합계"
          value={value.ruralHouseStdPrice}
          onChange={(v) => onChange({ ruralHouseStdPrice: v })}
          jibun={jibun}
          referenceDate={acquisitionDate}
          hint={stdPriceHint}
          testidPrefix="new994-stdprice"
        />
        <p className="text-micro text-muted-foreground" data-testid="new994-expansion-price-hint">
          일반주택 양도일까지 {houseLabel}을 증축했거나 그 부수토지를 더 취득했다면, 늘어난 건물·토지의 기준시가도 이 합계에 포함해 입력하세요
          ({NEW_HOUSING_SUB_ARTICLE.NEW_99_4_EXPANSION_DECREE}). 늘어난 부분을 어느 시점 기준으로 평가하는지는 조문에 적혀 있지 않아 확인이 필요합니다.
        </p>
        <ToggleCard
          variant="chip"
          checked={value.isRegisteredHanok}
          onCheckedChange={(v) => onChange({ isRegisteredHanok: v })}
          title="등록 한옥"
          description={`2014.1.1. 이후 구입한 지자체 등록 한옥은 한도 4억 (${NEW_99_4_STD_PRICE_ADDENDA.HANOK_2014_PURCHASE} · ${NEW_99_4_HANOK_DECREE})`}
          tone="sky"
        />
        {(sizeScope.land || sizeScope.house) && (
          <div className="space-y-2" data-testid="new994-size-fields">
            <p className="text-xs font-medium">면적 요건 (양도일 기준 — 종전 조특법 §99의4①{isHometown ? "2호다목" : "1호나목"})</p>
            <p className="text-micro text-muted-foreground" data-testid="new994-expansion-area-hint">
              일반주택 양도일까지 증축 또는 부수토지 추가 취득이 있으면 늘어난 면적도 포함해 입력하세요 ({NEW_HOUSING_SUB_ARTICLE.NEW_99_4_EXPANSION_DECREE})
            </p>
            {sizeScope.land && (
              <div>
                <label className="mb-1 block text-xs font-medium">대지면적 (㎡)</label>
                <DecimalInput
                  data-testid="new994-land-area"
                  value={value.ruralLandAreaSqm994 ?? ""}
                  onChange={(v) => onChange({ ruralLandAreaSqm994: v })}
                  unit="㎡"
                />
                <p className="mt-1 text-micro text-muted-foreground">
                  2021.1.1. 전 양도분은 대지면적이 660㎡ 이내여야 합니다 (조특법 법률 제17759호 부칙 제21조② — 2021.1.1. 이후 양도분부터 삭제)
                </p>
              </div>
            )}
            {sizeScope.house && (
              <div className="space-y-2">
                <p className="text-xs font-medium">주택 유형 — 2017.1.1. 전 양도분 주택 면적 기준</p>
                <RadioCardGroup
                  name={`new994-house-type-${value.houseId ?? "form"}`}
                  tone="sky"
                  layout="stack"
                  value={value.ruralHouseType994 ?? ""}
                  onChange={(v) => onChange({ ruralHouseType994: v })}
                  options={[
                    {
                      value: "multi_unit" as const,
                      label: "공동주택",
                      description: "아파트·연립주택·다세대주택 — 전용면적 116㎡ 이내",
                      testId: "new994-house-type-multi_unit",
                    },
                    {
                      value: "other" as const,
                      label: "그 밖의 주택",
                      description: "단독주택·다가구주택 등 — 연면적 150㎡ 이내",
                      testId: "new994-house-type-other",
                    },
                  ]}
                />
                {value.ruralHouseType994 === "multi_unit" && (
                  <p className="text-xs" data-testid="new994-row-exclusive-area">
                    전용면적: {(rowFacts?.exclusiveArea ?? "") || "—"}
                    {rowFacts?.exclusiveArea ? "㎡" : ""}{" "}
                    <span className="text-caption text-muted-foreground">(이 주택의 기본 정보 전용면적)</span>
                  </p>
                )}
                {value.ruralHouseType994 === "other" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium">주택 연면적 (㎡)</label>
                    <DecimalInput
                      data-testid="new994-floor-area"
                      value={value.ruralHouseFloorAreaSqm994 ?? ""}
                      onChange={(v) => onChange({ ruralHouseFloorAreaSqm994: v })}
                      unit="㎡"
                    />
                  </div>
                )}
                <p className="text-micro text-muted-foreground">
                  주택의 연면적 150㎡(공동주택은 전용면적 116㎡) 이내 — 종전 조특령 §99의4⑤, 2017.1.1. 이후 양도분부터 삭제(조특법 법률 제14390호 부칙 제2조③)
                </p>
              </div>
            )}
          </div>
        )}
      </ToneCard>

      {/* ③ 소재지·자격 */}
      <ToneCard tone="rose" sectionNum="③" title="소재지·자격 요건">
        <ToggleCard
          checked={value.meetsLocationRequirement}
          onCheckedChange={(v) => onChange({ meetsLocationRequirement: v })}
          title="소재지 요건 충족 확인"
          description={locationDescription(isHometown, acquisitionDate, transferDate ?? "")}
          tone="rose"
        />
        {/* 🔑 testid는 바깥 div에 — `ToneCard`는 `data-testid`를 전달하지 않는다. */}
        {capitalConflict && (
          <div data-testid="new994-capital-conflict">
            <ToneCard tone="rose" title="수도권 주소">
              <p className="text-xs">{capitalConflict}</p>
            </ToneCard>
          </div>
        )}
        {/* NH-30 — 예/아니오/모름(기본값 없음 · ⑧ 필수). 모름은 불성립 + 확인 필요(엔진). */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium">
            {houseLabel}과 일반주택(양도 주택)이 행정구역상 같은 {adjacentUnit} 또는 연접한 {adjacentUnit}에 있나요?
          </p>
          <RadioCardGroup
            name={`new994-adjacent-${value.houseId ?? "form"}`}
            tone="rose"
            layout="inline"
            value={new994AdjacentAnswer(value)}
            onChange={(v) => onChange({ adjacentArea994: v, isAdjacentArea: undefined })}
            data-testid="new994-adjacent"
            options={[
              { value: "yes" as const, label: "예", description: "특례가 적용되지 않습니다", testId: "new994-adjacent-yes" },
              { value: "no" as const, label: "아니오", description: "같지도 연접하지도 않습니다", testId: "new994-adjacent-no" },
              { value: "unknown" as const, label: "모름", description: "적용하지 않고 결과에 확인 필요로 표시합니다", testId: "new994-adjacent-unknown" },
            ]}
          />
          <p className="text-micro text-muted-foreground">
            {adjacentScope
              ? `§99의4③${adjacentTail ? ` · ${adjacentTail}` : ""}`
              : `비교할 행정구역 단위는 ${isHometown ? "양도일에 따라 다릅니다(읍·면·시 / 시)" : "취득일·양도일에 따라 다릅니다(읍·면·시 / 읍·면 / 읍·면·동)"} — 날짜를 먼저 입력하세요 (§99의4③)`}
          </p>
        </div>
        {value.type === "new_99_4_hometown" && (
          <ToggleCard
            checked={value.meetsHometownRequirement}
            onCheckedChange={(v) => onChange({ meetsHometownRequirement: v })}
            title="고향 요건 충족"
            description="가족관계등록부에 10년 이상 등재된 등록기준지이면서 10년 이상 거주한 사실이 있는 시 지역(이와 연접한 시 지역과 두 요건을 모두 충족한 군 지역에 연접한 시 지역 포함)이면 켜세요 — 두 요건을 모두 충족해야 합니다 (조특령 §99의4⑥)"
            tone="violet"
          />
        )}
      </ToneCard>

      {/* emerald 자동 표시 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1 dark:bg-emerald-900/40">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">자동 산출 (참고용, 저장 안 됨)</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{houseLabel} 보유기간 (취득일→양도일)</span>
          <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">
            {holdingYears === null ? "—" : `${holdingYears}년`}
          </span>
        </div>
        {holdingYears !== null && holdingYears < 3 && (
          <p className="text-micro text-amber-700 dark:text-amber-300">
            ⚠ 보유 3년 미만 — 양도 후에도 특례는 적용되지만(④), 이후 {houseLabel}을 3년 이상
            보유하지 아니하게 되면 그 날이 속하는 달의 말일부터 2개월 이내에 특례로 줄어든 세액을
            양도소득세로 납부해야 합니다 (§99의4⑥. 수용(협의매수 포함)·사망으로 인한 상속·멸실은 제외 —
            조특령 §99의4⑨)
          </p>
        )}
        <p className="text-micro text-emerald-700 dark:text-emerald-300">
          ※ 적격 여부·1세대1주택 판정은 계산 시 엔진이 수행합니다. 다주택 중과 주택 수에는
          반영되지 않습니다.
        </p>
        <p className="text-micro text-emerald-700 dark:text-emerald-300">
          ※ 특례를 적용받으려면 과세특례신고서를 양도소득세 과세표준 신고기한(소득세법 §105·§110) 안에
          제출해야 합니다 (조특법 §99의4⑦·조특령 §99의4⑩).
        </p>
      </div>
    </div>
  );
}
