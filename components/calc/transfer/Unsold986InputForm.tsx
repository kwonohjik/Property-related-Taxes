"use client";

/**
 * §98의6 준공후미분양 50% — 1호/2호 하이브리드 입력 폼 (P3, 2026-06-12)
 *
 * 1호: 사업주체등이 ~2011.12.31 임대계약 + 2년 임대 후 취득 — 5년 내 50% 세액감면 가능.
 * 2호: 취득 후 5년 임대 (등록 후 기산) — 5년 후 차감만. 농특세 과세.
 * 제외: 기준시가 합계 6억 초과 또는 연면적(전용) 149 초과 (령 §98의5② 단서).
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReductionStdPriceSection } from "@/components/calc/transfer/ReductionStdPriceSection";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold986Form = Extract<AssetReductionForm, { type: "unsold_98_6" }>;

interface Props {
  value: Unsold986Form;
  onChange: (patch: Partial<Unsold986Form>) => void;
  acquisitionDate?: string;
  transferDate?: string;
  jibun?: string;
  dong?: string;
  ho?: string;
  assetId?: string;
  assetPhdSnapshot?: ReductionPhdValue;
}

export function Unsold986InputForm({
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
  const isBuyerRented = value.hoType986 === "buyer_rented";
  function updateVacancy(idx: number, patch: Partial<{ startDate: string; endDate: string }>) {
    onChange({
      rentalVacancyPeriods986: value.rentalVacancyPeriods986.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }
  function removeVacancy(idx: number) {
    onChange({ rentalVacancyPeriods986: value.rentalVacancyPeriods986.filter((_, i) => i !== idx) });
  }
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의6①" label="§98의6① 준공후미분양 50%" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의5" label="조특령 §98의5" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      {/* US-42 — 적용 주체(법 §98의6① 「거주자 또는 「소득세법」 제120조에 따른 국내사업장이 없는 비거주자」). D11-05와 같이 화면에 보이고 끌 수 있다. */}
      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          tone="violet"
          title="거주자 또는 국내사업장 없는 비거주자"
          description="법 §98의6① — 국내사업장이 있는 비거주자는 해제(적용 배제)"
          checked={value.isEligibleSubject986 ?? true}
          onCheckedChange={(v) => onChange({ isEligibleSubject986: v })}
        />
      </div>

      <ToneCard tone="sky" sectionNum="①" title="적용 유형">
        <RadioCardGroup<Unsold986Form["hoType986"]>
          name="unsold986-ho"
          tone="sky"
          layout="stack"
          value={value.hoType986}
          // Q-21 — 1호(최초 임대개시 당시)↔2호(취득 당시)는 기준시점이 달라 값이 남으면 다른 시점 값이 6억 판정에 쓰인다.
          // 전환하는 그 이벤트에서 함께 비운다(onChange 한 번 — useEffect→store 미러링 금지). ⑧이 재입력을 요구한다.
          onChange={(v) => onChange(v === value.hoType986 ? { hoType986: v } : { hoType986: v, stdPriceSumAtBase986: "" })}
          options={[
            {
              value: "seller_rented",
              label: "1호 — 사업주체등이 임대한 주택을 취득",
              description: "사업주체등이 2011.12.31까지 임대계약을 체결하여 2년 이상 임대한 준공후미분양주택을 최초 매매계약으로 취득 — 5년 이내 양도 시 50% 세액감면 가능",
            },
            {
              value: "buyer_rented",
              label: "2호 — 취득 후 본인이 5년 이상 임대",
              description: "준공후미분양주택을 최초 매매계약으로 취득하고 5년 이상 임대 (2011.12.31 이전 임대계약 한정) — 5년이 지난 후 양도분 차감만 적용",
            },
          ]}
        />
        <p className="text-xs text-muted-foreground" data-testid="unsold-98-6-ho-switch-notice">
          1호와 2호는 기준시가 합계의 기준시점이 달라(최초 임대개시 당시 / 취득 당시) 유형을 바꾸면 아래 기준시가 합계가 비워집니다. 다시 입력하세요.
        </p>
      </ToneCard>

      <ToneCard tone="sky" sectionNum="②" title="기준시가 합계·면적">
        <div>
          <label className="mb-1 block text-sm font-medium">
            주택+부속토지 기준시가 합계 ({isBuyerRented ? "취득 당시" : "최초 임대개시 당시"})
          </label>
          <CurrencyInput
            data-field="reduction.unsold_98_6.stdPriceSumAtBase986"
            value={value.stdPriceSumAtBase986}
            onChange={(v) => onChange({ stdPriceSumAtBase986: v })}
            label=""
          />
          <p className="mt-1 text-xs text-muted-foreground">
            6억원 초과 시 제외됩니다 (조특령 §98의5② 단서 — 취득가액이 아닌 기준시가 합계 기준)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">연면적 (공동주택은 전용면적, ㎡)</label>
          <DecimalInput data-field="reduction.unsold_98_6.floorAreaSqm986" value={value.floorAreaSqm986} onChange={(v) => onChange({ floorAreaSqm986: v })} />
          <p className="mt-1 text-xs text-muted-foreground">149㎡ 초과 시 제외됩니다</p>
        </div>
      </ToneCard>

      <ToneCard tone="violet" sectionNum="③" title="임대 요건">
        {isBuyerRented ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">임대계약 체결일</label>
              <DateInput data-field="reduction.unsold_98_6.rentalContractDate986" value={value.rentalContractDate986} onChange={(v) => onChange({ rentalContractDate986: v })} />
              <p className="mt-1 text-xs text-muted-foreground">2011.12.31 이전 체결에 한정 (법 §98의6①2호)</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">사업자등록일</label>
              <DateInput data-field="reduction.unsold_98_6.businessRegistrationDate986" value={value.businessRegistrationDate986} onChange={(v) => onChange({ businessRegistrationDate986: v })} />
              <p className="mt-1 text-xs text-muted-foreground">소득세법 §168에 따른 사업자등록일 (법 §98의6①2호 괄호)</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">임대사업자등록일</label>
              <DateInput data-field="reduction.unsold_98_6.rentalRegistrationDate986" value={value.rentalRegistrationDate986} onChange={(v) => onChange({ rentalRegistrationDate986: v })} />
              <p className="mt-1 text-xs text-muted-foreground">
                민간임대주택에 관한 특별법 §5에 따른 임대사업자등록일. 임대기간은 두 등록을 한 후 임대를 개시하는 날부터 기산합니다 (조특령 §98의5⑤1호)
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">실제 임대개시일</label>
              <DateInput data-field="reduction.unsold_98_6.rentalStartDate986" value={value.rentalStartDate986} onChange={(v) => onChange({ rentalStartDate986: v })} />
              <p className="mt-1 text-xs text-muted-foreground">
                실제로 임대를 개시한 날. 등록일이 이보다 늦으면 등록일부터, 아니면 이 날부터 셉니다 (개시하는 날 당일 포함 — 조특령 §98의5⑤1호)
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">임대종료일 (비우면 양도일까지 임대 계속)</label>
              <DateInput data-field="reduction.unsold_98_6.rentalEndDate986" value={value.rentalEndDate986} onChange={(v) => onChange({ rentalEndDate986: v })} />
              <p className="mt-1 text-xs text-muted-foreground">양도일을 넘길 수 없습니다 (양도 후의 임대는 양도인의 임대기간이 아님)</p>
            </div>
            <div data-field="reduction.unsold_98_6.rentalVacancyPeriods986" className="space-y-2">
              <label className="block text-sm font-medium">공실 구간 (임대하지 않은 기간)</label>
              <p className="text-caption text-muted-foreground">
                조특령 §98의5⑤에는 공실을 임대기간에 넣는 규정이 없어, 임차인 교체 사이의 짧은 공백도 임대기간에서 뺍니다. 시작일·종료일 모두 공실에 포함됩니다.
              </p>
              {value.rentalVacancyPeriods986.map((period, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <DateInput value={period.startDate} onChange={(v) => updateVacancy(idx, { startDate: v })} />
                  <span className="text-xs text-muted-foreground">~</span>
                  <DateInput value={period.endDate} onChange={(v) => updateVacancy(idx, { endDate: v })} />
                  <button type="button" onClick={() => removeVacancy(idx)} className="text-xs text-rose-700 hover:underline dark:text-rose-400">
                    삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onChange({ rentalVacancyPeriods986: [...value.rentalVacancyPeriods986, { startDate: "", endDate: "" }] })}
                className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
              >
                + 공실 구간 추가
              </button>
            </div>
            <div data-field="reduction.unsold_98_6.inheritedRentalMonths986">
              <label className="mb-1 block text-sm font-medium">상속 합산 임대기간 (개월, 해당 시)</label>
              <IntegerInput
                allowEmpty
                value={value.inheritedRentalMonths986 === "" ? undefined : Number(value.inheritedRentalMonths986)}
                onChange={(v) => onChange({ inheritedRentalMonths986: v === undefined ? "" : String(v) })}
              />
              <p className="mt-1 text-xs text-muted-foreground">피상속인의 임대기간을 정수 개월로 합산 (조특령 §98의5⑤2호)</p>
            </div>
          </>
        ) : (
          <ToggleCard
            tone="violet"
            title="사업주체등이 2011.12.31까지 임대계약 + 2년 이상 임대"
            description="사업주체등이 임대계약을 체결하여 2년 이상 임대한 주택임이 임대차계약서 등으로 확인됨 (법 §98의6①1호 · 령 §98의5⑪). 임차인이 2011.3.29 현재 입주해 있던 주택의 취급은 아래 「준공 후 입주 사실 없음」 안내를 함께 확인하세요"
            checked={value.sellerRented2Years986}
            onCheckedChange={(v) => onChange({ sellerRented2Years986: v })}
          />
        )}
      </ToneCard>

      <ToneCard tone="rose" sectionNum="④" title="자격 요건 확인">
        <ToggleCard
          tone="rose"
          title="준공후미분양주택 확인"
          description="사용검사·사용승인 후 2011.3.29 현재 분양계약이 체결되지 않아 선착순으로 공급된 주택 (조특령 §98의5②)"
          checked={value.isUnsoldAfterCompletion986}
          onCheckedChange={(v) => onChange({ isUnsoldAfterCompletion986: v })}
        />
        <ToggleCard
          tone="rose"
          title="사업주체등과 최초 매매계약"
          description="사업주체·주택도시보증공사·시공자·기업구조조정리츠·신탁업자와 최초 계약 (법 §98의6① · 령 §98의5①)"
          checked={value.isFirstContract986}
          onCheckedChange={(v) => onChange({ isFirstContract986: v })}
        />
        <ToggleCard
          tone="rose"
          title="준공 후 입주 사실 없음"
          description="준공된 후 입주한 사실이 있는 주택은 제외됩니다 (조특령 §98의5③1호) — 임대 이력은 아래 안내를 확인하세요"
          checked={value.isNotOccupiedAfterCompletion986}
          onCheckedChange={(v) => onChange({ isNotOccupiedAfterCompletion986: v })}
        />
        <CollapsibleHintCard tone="rose" summary="입주 사실과 사업주체등의 임대 (부동산거래관리과-492)">
          <p>
            국세청은 2011.3.29 현재 입주한 사실이 있는 주택을 준공후미분양주택이 아니라고 회신했습니다(부동산거래관리과-492, 2012.9.17.).
            사업주체등이 임대해 임차인이 입주해 있었다면 입주 사실이 있는지 임대 이력으로 확인하세요.
            2011.3.29 이후 시작된 사업주체등의 임대나 그 전에 끝난 임대는 직접 해석례를 확인하지 못했습니다(확인 필요).
          </p>
        </CollapsibleHintCard>
        <ToggleCard
          tone="rose"
          title="계약 해제 후 재계약·대체취득 아님"
          description="해제한 본인·배우자(직계존비속·형제자매 포함)의 재계약 또는 대체취득 주택이 아님 (조특령 §98의5③2·3호)"
          checked={value.isNotRecontract986}
          onCheckedChange={(v) => onChange({ isNotRecontract986: v })}
        />
      </ToneCard>

      <ToneCard tone="amber" sectionNum="⑤" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)">
        <ReductionStdPriceSection
          phd={{
            phdMode: value.phdMode986,
            firstDisclosureDate: value.phdFirstDisclosureDate986,
            firstDisclosurePrice: value.phdFirstDisclosurePrice986,
            landAreaSqm: value.phdLandAreaSqm986,
            landPricePerSqmAtAcq: value.phdLandPricePerSqmAtAcq986,
            landPricePerSqmAtFirst: value.phdLandPricePerSqmAtFirst986,
            buildingStdAtAcq: value.phdBuildingStdAtAcq986,
            buildingStdAtFirst: value.phdBuildingStdAtFirst986,
          }}
          onPhdChange={(patch) => {
            const mapped: Partial<Unsold986Form> = {};
            if (patch.phdMode !== undefined) mapped.phdMode986 = patch.phdMode;
            if (patch.firstDisclosureDate !== undefined) mapped.phdFirstDisclosureDate986 = patch.firstDisclosureDate;
            if (patch.firstDisclosurePrice !== undefined) mapped.phdFirstDisclosurePrice986 = patch.firstDisclosurePrice;
            if (patch.landAreaSqm !== undefined) mapped.phdLandAreaSqm986 = patch.landAreaSqm;
            if (patch.landPricePerSqmAtAcq !== undefined) mapped.phdLandPricePerSqmAtAcq986 = patch.landPricePerSqmAtAcq;
            if (patch.landPricePerSqmAtFirst !== undefined) mapped.phdLandPricePerSqmAtFirst986 = patch.landPricePerSqmAtFirst;
            if (patch.buildingStdAtAcq !== undefined) mapped.phdBuildingStdAtAcq986 = patch.buildingStdAtAcq;
            if (patch.buildingStdAtFirst !== undefined) mapped.phdBuildingStdAtFirst986 = patch.buildingStdAtFirst;
            onChange(mapped);
          }}
          stdPriceAtAcquisition={value.standardPriceAtAcquisition986}
          onStdPriceAtAcquisitionChange={(v) => onChange({ standardPriceAtAcquisition986: v })}
          stdPriceAt5Years={value.standardPriceAt5Years986}
          onStdPriceAt5YearsChange={(v) => onChange({ standardPriceAt5Years986: v })}
          stdPriceAtTransfer={value.standardPriceAtTransfer986}
          onStdPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer986: v })}
          showExclusiveArea={false}
          acquisitionDate={acquisitionDate}
          transferDate={transferDate}
          jibun={jibun}
          dong={dong}
          ho={ho}
          assetId={assetId}
          assetPhdSnapshot={assetPhdSnapshot}
          testidPrefix="unsold986"
          fieldType="unsold_98_6"
          snapshotKeyPrefix="red986"
        />
      </ToneCard>

      <ToneCard tone="emerald" bodyClassName="space-y-1" className="text-caption text-emerald-900 dark:text-emerald-200">
        <p>
          · 적용 효과: 5년 이내 양도 시 양도소득세 50% 감면(1호 한정), 5년 후 양도 시 5년간 발생
          양도소득금액의 50%를 공제합니다 (법 §98의6①).
        </p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>
          · 장기보유특별공제는 소득세법 §95② 표1(같은 항 단서의 1세대1주택에 해당하면 표2)에 따른 보유기간별 공제율을 적용하고
          단기보유 세율 대신 기본세율을 적용합니다 (법 §98의6③). 표2에는 보유기간별 공제율과 함께 거주기간별 공제율이 있으며, 이 계산기는
          1세대1주택에 표2의 보유기간별·거주기간별 공제율을 합산해 적용합니다.
        </p>
        <p>
          · 확인 필요: 이 특례 조문의 「표2에 따른 보유기간별 공제율」에 거주기간별 공제율이 포함되는지를 직접 다룬 해석례는 확인하지 못했습니다.
          국세청 법규과-742(2025.4.9.)는 §98의2에 대한 회신에서 같은 문구를 개정 표2의 보유기간별 공제율로 산정하도록 안내했습니다(거주기간별 공제율은 언급 없음).
        </p>
        <p>· 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①5호).</p>
      </ToneCard>
    </div>
  );
}
