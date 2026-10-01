"use client";

/**
 * TaxIncentiveRentalFields — 소령 §167의3①3호 「감면대상장기임대주택」 사실 입력 (명부 행·양도 주택 공용)
 *
 * 법문(MST 290841 실독): 「「조세특례제한법」 제97조ㆍ제97조의2 및 제98조에 따라 양도소득세가 감면되는
 * 임대주택으로서 5년 이상 임대한 국민주택」 + 후단 「… 장기일반민간임대주택 중 아파트(「주택법」에 따른
 * 도시형 생활주택인 아파트는 제외한다 …)를 임대하는 민간매입임대주택 또는 … 단기민간임대주택 중 아파트를
 * 임대하는 민간매입임대주택인 경우에는 제11항에 따른 기한까지 양도하는 주택으로 한정한다」.
 *
 * 후단 사실은 엔진이 판정하는 순서(`isTaxIncentiveRentalAptGateApplicable`)대로 묻는다 — 매입 여부 →
 * 등록 유형 → 도시형 생활주택 → ⑪ 연장 사실. 앞 사실이 「대상 아님」이면 뒤는 묻지 않는다.
 * 「모름」(미입력)은 엔진이 판정 보류(종전 기준 유지 + 확인 필요 고지)로 처리한다.
 *
 * 정책: ToggleCard/RadioCardGroup/DateInput/DecimalInput 전용 · onChange 직접 patch(useEffect 미러링 금지).
 */

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type {
  AptDeadlineExtensionForm,
  TaxIncentiveRentalFacts,
  TaxIncentiveRentalRegistrationType,
} from "@/lib/stores/calc-wizard-asset-nbl";

interface Props {
  value: TaxIncentiveRentalFacts;
  onPatch: (patch: TaxIncentiveRentalFacts) => void;
  /** 라디오 그룹 `name` 유일성 — 명부 행은 행 id, 양도 주택은 `"selling"`. */
  idPrefix: string;
  /** 후단(아파트 한정)을 물을지 — 아파트 여부의 **유효값**(양도 주택은 2호 칸을 쓸 수 있다). */
  isApartment: boolean;
  /** 아파트 여부 칩을 이 위젯이 그린다(양도 주택 · 2호 미선언). 명부 행은 「특례 구분」 칩이 이미 있다. */
  showApartmentToggle?: boolean;
  /** 임대기간을 2호 칸에서 가져온다 — 이 위젯은 그 칸을 다시 그리지 않고 안내만 한다. */
  rentalPeriodSharedWith2ho?: boolean;
  /** 국민주택(규모)을 2호 칸(나목)에서 가져온다. */
  nationalSizeSharedWith2ho?: boolean;
  /** 임대기간 칸의 입력칸 이동 앵커(`data-field`) — 검증 오류가 이 칸을 가리킨다. */
  fieldRentalPeriod?: string;
}

const LABEL = "block text-caption text-muted-foreground font-medium";
const HINT = "text-caption text-muted-foreground/70";

type Tri = "yes" | "no" | "unknown";
const toTri = (b: boolean | undefined): Tri => (b === undefined ? "unknown" : b ? "yes" : "no");
const fromTri = (t: Tri): boolean | undefined => (t === "unknown" ? undefined : t === "yes");

export function TaxIncentiveRentalFields({
  value: v,
  onPatch,
  idPrefix,
  isApartment,
  showApartmentToggle = false,
  rentalPeriodSharedWith2ho = false,
  nationalSizeSharedWith2ho = false,
  fieldRentalPeriod,
}: Props) {
  const ext = v.taxIncentiveRentalAptDeadlineExtension ?? {};
  const patchExt = (p: AptDeadlineExtensionForm) =>
    onPatch({ taxIncentiveRentalAptDeadlineExtension: { ...ext, ...p } });
  const typeTargeted =
    v.taxIncentiveRentalRegistrationType === "long_term_general" ||
    v.taxIncentiveRentalRegistrationType === "short_term";

  return (
    <div className="space-y-3 pt-1">
      {rentalPeriodSharedWith2ho ? (
        <p className={HINT}>
          임대기간·아파트 여부는 위 「장기임대주택」 칸에 적은 값을 함께 씁니다 (같은 주택의 같은 사실).
        </p>
      ) : (
        <div className="space-y-1" data-field={fieldRentalPeriod}>
          <label className={LABEL}>임대기간 (년)</label>
          <DecimalInput
            value={v.rentalPeriodYears ?? ""}
            onChange={(s) => onPatch({ rentalPeriodYears: s || undefined })}
            placeholder="임대기간 입력"
          />
          <p className={HINT}>5년 이상 임대해야 합니다 (소령 §167의3①3호).</p>
        </div>
      )}

      {nationalSizeSharedWith2ho ? (
        <p className={HINT}>국민주택 여부는 위 「장기임대주택」 나목의 국민주택규모 칸을 함께 씁니다.</p>
      ) : (
        <ToggleCard
          variant="chip"
          tone="violet"
          checked={v.isNationalSizeHousing ?? false}
          onCheckedChange={(b) => onPatch({ isNationalSizeHousing: b })}
          title="국민주택"
        />
      )}

      {showApartmentToggle && !rentalPeriodSharedWith2ho && (
        <ToggleCard
          variant="chip"
          tone="violet"
          checked={v.isApartment ?? false}
          onCheckedChange={(b) => onPatch({ isApartment: b })}
          title="임대주택이 아파트"
        />
      )}

      {isApartment && (
        <div
          className="space-y-2.5 rounded-md border border-violet-200/70 bg-violet-50/30 p-2.5"
          data-testid={`tax-incentive-rental-apt-gate-${idPrefix}`}
        >
          <p className="text-caption text-violet-700/80">
            아파트인 민간매입임대주택(장기일반·단기)은 2027.12.31.(또는 ⑪ 각 호의 날 중 늦은 날)까지
            양도한 경우에만 해당합니다 (소령 §167의3①3호 후단·⑪). 모르는 칸은 「모름」으로 두면 판정을
            보류하고 종전 기준대로 계산한 뒤 확인이 필요하다고 안내합니다.
          </p>

          <div className="space-y-1">
            <label className={LABEL}>민간매입임대주택 여부</label>
            <RadioCardGroup<Tri>
              name={`tir-purchase-${idPrefix}`}
              layout="inline"
              tone="violet"
              value={toTri(v.isTaxIncentiveRentalPurchase)}
              onChange={(t) => onPatch({ isTaxIncentiveRentalPurchase: fromTri(t) })}
              options={[
                { value: "yes", label: "민간매입임대주택" },
                { value: "no", label: "민간매입임대주택 아님" },
                { value: "unknown", label: "모름" },
              ]}
            />
          </div>

          {v.isTaxIncentiveRentalPurchase === true && (
            <div className="space-y-1">
              <label className={LABEL}>등록 유형 (종전 「민간임대주택에 관한 특별법」 제2조)</label>
              <RadioCardGroup<TaxIncentiveRentalRegistrationType | "unknown">
                name={`tir-type-${idPrefix}`}
                layout="inline"
                tone="violet"
                value={v.taxIncentiveRentalRegistrationType ?? "unknown"}
                onChange={(t) =>
                  onPatch({ taxIncentiveRentalRegistrationType: t === "unknown" ? undefined : t })
                }
                options={[
                  { value: "long_term_general", label: "장기일반민간임대주택 (제5호)" },
                  { value: "short_term", label: "단기민간임대주택 (제6호)" },
                  { value: "other", label: "그 밖의 유형" },
                  { value: "unknown", label: "모름" },
                ]}
              />
            </div>
          )}

          {v.isTaxIncentiveRentalPurchase === true && typeTargeted && (
            <div className="space-y-1">
              <label className={LABEL}>「주택법」에 따른 도시형 생활주택인 아파트</label>
              <RadioCardGroup<Tri>
                name={`tir-urban-${idPrefix}`}
                layout="inline"
                tone="violet"
                value={toTri(v.isUrbanLifeHousingApartment)}
                onChange={(t) => onPatch({ isUrbanLifeHousingApartment: fromTri(t) })}
                options={[
                  { value: "yes", label: "도시형 생활주택" },
                  { value: "no", label: "도시형 생활주택 아님" },
                  { value: "unknown", label: "모름" },
                ]}
              />
            </div>
          )}

          {v.isTaxIncentiveRentalPurchase === true && typeTargeted && v.isUrbanLifeHousingApartment === false && (
            <div className="space-y-2">
              <p className={HINT}>
                ⑪ 기한 연장 사유가 있으면 그 날을 적으세요 — 2027.12.31.과 각 날부터 1년이 되는 날 중 가장
                늦은 날이 기한입니다. 하나도 적지 않으면 연장 여부를 모르는 것으로 보아 판정을 보류합니다.
              </p>
              <div className="space-y-1">
                <label className={LABEL}>⑪1호 — 임대주택 등록이 말소되는 날 (임대의무기간 2027.1.1. 이후 종료)</label>
                <DateInput
                  value={ext.dutyPeriodEndCancellationDate ?? ""}
                  onChange={(s) => patchExt({ dutyPeriodEndCancellationDate: s || undefined })}
                />
              </div>
              <div className="space-y-1">
                <label className={LABEL}>⑪2호 — 조정대상지역 공고일 (2027.1.1. 이후 신규 지정)</label>
                <DateInput
                  value={ext.newRegulatedAreaAnnouncementDate ?? ""}
                  onChange={(s) => patchExt({ newRegulatedAreaAnnouncementDate: s || undefined })}
                />
              </div>
              <div className="space-y-1">
                <label className={LABEL}>⑪3호 — 이전고시일 (재건축·재개발·소규모주택정비)</label>
                <DateInput
                  value={ext.relocationAnnouncementDate ?? ""}
                  onChange={(s) => patchExt({ relocationAnnouncementDate: s || undefined })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
