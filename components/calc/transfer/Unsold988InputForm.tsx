"use client";

/**
 * §98의8 준공후미분양주택 — 5년 발생분 50% 공제 입력 폼 (P1, 2026-06-11)
 *
 * 효과: 취득일부터 5년간 발생한 양도소득금액의 50%를 과세대상소득금액에서 공제 (차감형 —
 *       5년 내 세액감면 없음). 농특세 = 감면세액의 20%. 중과 배제 자동 (소령 §167의3①5호).
 *
 * ① sky 계약 정보 ② sky 가액·면적 (6억 AND 135㎡) ③ violet 임대 (령 §98의7⑤ → §98의5⑤ 기산·공실 구간)
 * ④ rose 자격 토글 3종 + emerald 안내. 적격 판정·산식은 엔진 단일 진실.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReductionStdPriceSection } from "@/components/calc/transfer/ReductionStdPriceSection";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold988Form = Extract<AssetReductionForm, { type: "unsold_98_8" }>;

interface Props {
  value: Unsold988Form;
  onChange: (patch: Partial<Unsold988Form>) => void;
  acquisitionDate?: string;
  transferDate?: string;
  jibun?: string;
  dong?: string;
  ho?: string;
  assetId?: string;
  assetPhdSnapshot?: ReductionPhdValue;
}

export function Unsold988InputForm({
  value,
  onChange,
  acquisitionDate,
  transferDate,
  jibun,
  dong,
  ho,
  assetId,
  assetPhdSnapshot,
}: Props) {
  function updateVacancy(idx: number, patch: Partial<{ startDate: string; endDate: string }>) {
    onChange({
      rentalVacancyPeriods988: value.rentalVacancyPeriods988.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }
  function removeVacancy(idx: number) {
    onChange({ rentalVacancyPeriods988: value.rentalVacancyPeriods988.filter((_, i) => i !== idx) });
  }
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의8①" label="§98의8① 준공후미분양 차감" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의7" label="조특령 §98의7" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      <ToneCard tone="sky" sectionNum="①" title="최초 매매계약 정보">
        <div>
          <label className="mb-1 block text-sm font-medium">최초 매매계약일</label>
          <DateInput value={value.contractDate988} onChange={(v) => onChange({ contractDate988: v })} />
          <p className="mt-1 text-xs text-muted-foreground">
            2015.1.1~2015.12.31 중 사업주체등과 최초로 체결한 매매계약 (법 §98의8①).
            취득일·양도일은 자산 기본 입력을 사용합니다
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="sky" sectionNum="②" title="가액·면적 요건 (모두 충족)">
        <div>
          <label className="mb-1 block text-sm font-medium">취득가액</label>
          <CurrencyInput
            data-field="reduction.unsold_98_8.acquisitionPrice988"
            value={value.acquisitionPrice988}
            onChange={(v) => onChange({ acquisitionPrice988: v })}
            label=""
          />
          <p className="mt-1 text-xs text-muted-foreground">
            6억원 이하 — 취득세 및 그 밖의 부대비용 제외 (조특령 §98의7②1호)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">연면적 (공동주택은 전용면적, ㎡)</label>
          <DecimalInput
            data-field="reduction.unsold_98_8.exclusiveAreaSqm988"
            value={value.exclusiveAreaSqm988}
            onChange={(v) => onChange({ exclusiveAreaSqm988: v })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            135㎡ 이하 — 취득가액과 면적 요건을 모두 충족해야 합니다 (한쪽만 초과해도 적용 제외)
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="violet" sectionNum="③" title="임대 정보 — 5년 이상 임대">
        <div>
          <label className="mb-1 block text-sm font-medium">임대계약 체결일</label>
          <DateInput
            data-field="reduction.unsold_98_8.rentalContractDate988"
            value={value.rentalContractDate988}
            onChange={(v) => onChange({ rentalContractDate988: v })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            사업자등록(소법 §168)과 임대사업자등록(민특법 §5)을 하고 2015.12.31 이전에 임대계약을
            체결한 경우로 한정합니다 (법 §98의8① 괄호)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">사업자등록일</label>
          <DateInput data-field="reduction.unsold_98_8.businessRegistrationDate988" value={value.businessRegistrationDate988} onChange={(v) => onChange({ businessRegistrationDate988: v })} />
          <p className="mt-1 text-xs text-muted-foreground">소득세법 §168에 따른 사업자등록일 (법 §98의8① 괄호). 2015.12.31 이전 등록에 한정하는 것으로 처리합니다</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">임대사업자등록일</label>
          <DateInput data-field="reduction.unsold_98_8.rentalRegistrationDate988" value={value.rentalRegistrationDate988} onChange={(v) => onChange({ rentalRegistrationDate988: v })} />
          <p className="mt-1 text-xs text-muted-foreground">
            민간임대주택에 관한 특별법 §5에 따른 임대사업자등록일. 임대기간은 두 등록을 한 후 임대를 개시하는 날부터 기산합니다 (조특령 §98의7⑤ → §98의5⑤1호)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">실제 임대개시일</label>
          <DateInput data-field="reduction.unsold_98_8.rentalStartDate988" value={value.rentalStartDate988} onChange={(v) => onChange({ rentalStartDate988: v })} />
          <p className="mt-1 text-xs text-muted-foreground">
            실제로 임대를 개시한 날. 등록일이 이보다 늦으면 등록일부터, 아니면 이 날부터 셉니다 (개시하는 날 당일 포함 — 조특령 §98의5⑤1호 준용)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">임대종료일 (비우면 양도일까지 임대 계속)</label>
          <DateInput data-field="reduction.unsold_98_8.rentalEndDate988" value={value.rentalEndDate988} onChange={(v) => onChange({ rentalEndDate988: v })} />
          <p className="mt-1 text-xs text-muted-foreground">양도일을 넘길 수 없습니다 (양도 후의 임대는 양도인의 임대기간이 아님)</p>
        </div>
        <div data-field="reduction.unsold_98_8.rentalVacancyPeriods988" className="space-y-2">
          <label className="block text-sm font-medium">공실 구간 (임대하지 않은 기간)</label>
          <p className="text-caption text-muted-foreground">
            조특령 §98의5⑤에는 공실을 임대기간에 넣는 규정이 없어, 임차인 교체 사이의 짧은 공백도 임대기간에서 뺍니다. 시작일·종료일 모두 공실에 포함되며, 공실로 나뉜 임대 구간마다 만 개월을 세어 더합니다.
          </p>
          {value.rentalVacancyPeriods988.map((period, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <DateInput value={period.startDate} onChange={(v) => updateVacancy(idx, { startDate: v })} />
              <span className="text-xs text-muted-foreground">~</span>
              <DateInput value={period.endDate} onChange={(v) => updateVacancy(idx, { endDate: v })} />
              <button type="button" onClick={() => removeVacancy(idx)} className="text-xs text-rose-700 hover:underline dark:text-rose-300">
                삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ rentalVacancyPeriods988: [...value.rentalVacancyPeriods988, { startDate: "", endDate: "" }] })}
            className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
          >
            + 공실 구간 추가
          </button>
        </div>
        <div data-field="reduction.unsold_98_8.inheritedRentalMonths988">
          <label className="mb-1 block text-sm font-medium">상속 합산 임대기간 (개월, 해당 시)</label>
          <IntegerInput
            allowEmpty
            value={value.inheritedRentalMonths988 === "" ? undefined : Number(value.inheritedRentalMonths988)}
            onChange={(v) => onChange({ inheritedRentalMonths988: v === undefined ? "" : String(v) })}
          />
          <p className="mt-1 text-xs text-muted-foreground">피상속인의 임대기간을 정수 개월로 합산 (조특령 §98의5⑤2호 준용)</p>
        </div>
      </ToneCard>

      <ToneCard tone="rose" sectionNum="④" title="자격 요건 확인">
        <ToggleCard
          tone="rose"
          title="준공후미분양주택 확인"
          description="사용검사·사용승인 후 2014.12.31까지 분양계약이 체결되지 않아 2015.1.1 이후 선착순으로 공급된 주택 (조특령 §98의7①)"
          checked={value.isUnsoldAfterCompletion988}
          onCheckedChange={(v) => onChange({ isUnsoldAfterCompletion988: v })}
        />
        <ToggleCard
          tone="rose"
          title="사업주체등과 최초 매매계약"
          description="사업주체·주택도시보증공사·시공자(공사대금)·기업구조조정리츠·신탁업자와 최초로 계약 (조특령 §98의7③)"
          checked={value.isFirstContract988}
          onCheckedChange={(v) => onChange({ isFirstContract988: v })}
        />
        <ToggleCard
          tone="rose"
          title="계약 해제 후 재계약 아님"
          description="2014.12.31 이전 계약을 해제한 본인·배우자(직계존비속·형제자매 포함)가 다시 계약한 주택이 아님 (조특령 §98의7②2·3호)"
          checked={value.isNotRecontract988}
          onCheckedChange={(v) => onChange({ isNotRecontract988: v })}
        />
      </ToneCard>

      {/* 5년 후 양도 안분용 기준시가 */}
      <ToneCard tone="sky" sectionNum="⑤" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)">
        <ReductionStdPriceSection
          phd={{
            phdMode: value.phdMode988,
            firstDisclosureDate: value.phdFirstDisclosureDate988,
            firstDisclosurePrice: value.phdFirstDisclosurePrice988,
            landAreaSqm: value.phdLandAreaSqm988,
            landPricePerSqmAtAcq: value.phdLandPricePerSqmAtAcq988,
            landPricePerSqmAtFirst: value.phdLandPricePerSqmAtFirst988,
            buildingStdAtAcq: value.phdBuildingStdAtAcq988,
            buildingStdAtFirst: value.phdBuildingStdAtFirst988,
          }}
          onPhdChange={(patch) => {
            const mapped: Partial<Unsold988Form> = {};
            if (patch.phdMode !== undefined) mapped.phdMode988 = patch.phdMode;
            if (patch.firstDisclosureDate !== undefined) mapped.phdFirstDisclosureDate988 = patch.firstDisclosureDate;
            if (patch.firstDisclosurePrice !== undefined) mapped.phdFirstDisclosurePrice988 = patch.firstDisclosurePrice;
            if (patch.landAreaSqm !== undefined) mapped.phdLandAreaSqm988 = patch.landAreaSqm;
            if (patch.landPricePerSqmAtAcq !== undefined) mapped.phdLandPricePerSqmAtAcq988 = patch.landPricePerSqmAtAcq;
            if (patch.landPricePerSqmAtFirst !== undefined) mapped.phdLandPricePerSqmAtFirst988 = patch.landPricePerSqmAtFirst;
            if (patch.buildingStdAtAcq !== undefined) mapped.phdBuildingStdAtAcq988 = patch.buildingStdAtAcq;
            if (patch.buildingStdAtFirst !== undefined) mapped.phdBuildingStdAtFirst988 = patch.buildingStdAtFirst;
            onChange(mapped);
          }}
          stdPriceAtAcquisition={value.standardPriceAtAcquisition988}
          onStdPriceAtAcquisitionChange={(v) => onChange({ standardPriceAtAcquisition988: v })}
          stdPriceAt5Years={value.standardPriceAt5Years988}
          onStdPriceAt5YearsChange={(v) => onChange({ standardPriceAt5Years988: v })}
          stdPriceAtTransfer={value.standardPriceAtTransfer988}
          onStdPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer988: v })}
          exclusiveArea={value.exclusiveAreaSqm988}
          onExclusiveAreaChange={(v) => onChange({ exclusiveAreaSqm988: v })}
          showExclusiveArea={false}
          acquisitionDate={acquisitionDate}
          transferDate={transferDate}
          jibun={jibun}
          dong={dong}
          ho={ho}
          assetId={assetId}
          assetPhdSnapshot={assetPhdSnapshot}
          testidPrefix="unsold988"
          fieldType="unsold_98_8"
          snapshotKeyPrefix="red988"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          새로운 기준시가가 고시되기 전이면 직전 기준시가를 적용합니다 (조특령 §40①)
        </p>
      </ToneCard>

      {/*
        D11-05 — 적용 주체 요건. 엔진에는 게이트가 있었으나(`unsold-98-8.ts:157`) ①④⑤⑫ 어디에도
        입력 경로가 없어 상수 `?? true` fallback으로 **영구 사문**이었다. §99의3 sibling
        (`isResident993`)과 같은 형태로 배선한다 — 기본값은 법문이 상정하는 통상의 경우이되
        **화면에 보이고 끌 수 있어야** 비거주자가 사실대로 신고할 수 있다.
      */}
      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          tone="violet"
          title="거주자"
          description="법 §98의8① 「거주자가 …」 — 체크 해제 시 적용 배제"
          checked={value.isResident988}
          onCheckedChange={(v) => onChange({ isResident988: v })}
        />
      </div>

      <ToneCard tone="emerald" bodyClassName="space-y-1" className="text-caption text-emerald-900 dark:text-emerald-200">
        <p>
          · 적용 효과: 취득일부터 5년간 발생한 양도소득금액의 100분의 50에 상당하는 금액을
          양도소득세 과세대상소득금액에서 공제합니다 (법 §98의8①).
        </p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>
          · 다주택 중과: 본 특례 적용 주택 양도 시 중과세율이 적용되지 않습니다
          (소득세법 시행령 §167의3①5호).
        </p>
      </ToneCard>
    </div>
  );
}
