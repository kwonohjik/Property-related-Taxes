import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  PROPERTY_TYPE_LABELS,
  INITIAL_FORM,
  labelCls,
  selectCls,
  infoBannerCls,
  warnBannerCls,
  isDeemedAcquisitionCause,
  type FormState,
} from "./shared";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import type { Dispatch, SetStateAction } from "react";

interface Step0Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  setForm: Dispatch<SetStateAction<FormState>>;
  setStep: Dispatch<SetStateAction<number>>;
  setResult: Dispatch<SetStateAction<AcquisitionTaxResult | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  isOnerous: boolean;
  isBurdened: boolean;
  isOriginal: boolean;
  isGiftLike: boolean;
  isInheritance: boolean;
}

/**
 * Step 0: 취득 정보 — 취득자유형·물건종류·취득원인·취득가액·취득일
 * tone: violet (취득 원인) / sky (물건 종류)
 */
export function Step0({
  form,
  set,
  setForm,
  setStep,
  setResult,
  setError,
  isOnerous,
  isBurdened,
  isOriginal,
  isGiftLike,
  isInheritance,
}: Step0Props) {
  const isDeemed = isDeemedAcquisitionCause(form.acquisitionCause);

  /** 간주취득 선택 시 물건 유형 자동 설정 */
  function handleAcquisitionCauseChange(cause: string) {
    set("acquisitionCause", cause);
    if (cause === "deemed_major_shareholder") {
      set("propertyType", "building");
    } else if (cause === "deemed_land_category") {
      set("propertyType", "land");
    } else if (cause === "deemed_renovation") {
      set("propertyType", "building");
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
        <ResetButton
          onReset={() => {
            setForm(INITIAL_FORM);
            setStep(0);
            setResult(null);
            setError(null);
          }}
        />
      </div>

      {/* 취득자 유형 — violet 카드 */}
      <ToneCard
        tone="violet"
        sectionNum={1}
        title="취득자 유형"
        bodyClassName="space-y-2"
        noDark
        titleExtra={
          <TaxHelp
            title="법인 취득자 — 휴면법인 판정"
            summary="법인은 주택 취득 시 12% 중과. 휴면법인 인수 시 설립 시점 기산 5년 이내로 간주."
            details={`## 법인 주택 취득 (지방세법 §13의2①1호)
법인이 주택을 취득하면 **12% 중과세율**이 적용됩니다. (단, 주택건설사업자 등 5종 제외)

## 휴면법인 판정 6유형 (§13의2 시행령)
- 해산 법인
- 해산간주 법인 (2년 이상 영업 미실시)
- 폐업 법인
- 폐업 후 재사업자등록 1년 이내
- 계속등기 없이 1년 경과
- 임원 50% 이상 교체

**판정 효과**: 휴면법인 인수 시 과점주주 도달 시점 = 법인 설립 시점으로 기산 → 5년 이내 취득으로 처리됩니다.

## 중과제외 법인 (시행령 §28의2 8호 나목)
주택건설사업자·주택조합·민간임대·공공주택건설·도시정비사업자 5종은 §13의2① 1호 적용 제외`}
            legalBasis="지방세법 제13조의2 제1항"
          />
        }
      >
        <RadioCardGroup
          tone="violet"
          layout="inline"
          name="acquiredBy"
          value={form.acquiredBy}
          onChange={(v) => set("acquiredBy", v)}
          options={[
            { value: "individual", label: "개인" },
            { value: "corporation", label: "법인" },
            { value: "government", label: "국가·지자체" },
            { value: "nonprofit", label: "비영리법인" },
          ]}
        />
      </ToneCard>

      {/* 물건 유형 — sky 카드 (간주취득 시 자동 설정, 읽기 전용 표시) */}
      <ToneCard
        tone="sky"
        sectionNum={2}
        title="물건 유형"
        bodyClassName="space-y-2"
        noDark
        titleExtra={isDeemed ? (
          <span className="text-micro rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 font-medium">자동 설정</span>
        ) : undefined}
      >
        <select
          className={selectCls}
          value={form.propertyType}
          onChange={(e) => set("propertyType", e.target.value)}
          disabled={isDeemed}
        >
          {PROPERTY_TYPE_LABELS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {isDeemed && (
          <p className="text-xs text-muted-foreground">
            {form.acquisitionCause === "deemed_land_category" ? "지목변경 간주취득 — 토지로 자동 설정" : "간주취득 — 건물(법인자산)로 자동 설정"}
          </p>
        )}
      </ToneCard>

      {/* 취득 원인 — violet 카드 */}
      <ToneCard
        tone="violet"
        sectionNum={3}
        title="취득 원인"
        bodyClassName="space-y-2"
        noDark
        titleExtra={
          <TaxHelp
            title="신축·증축 취득 (원시취득)"
            summary="원시취득은 공사비 × 2.8%. 부담부증여의 유상분과 다릅니다."
            details={`## 원시취득 (지방세법 §11①3호·과세표준 §10의4)
신축·건축·공유수면 매립·간척 등으로 **최초로** 부동산을 취득하는 방법.
기존 소유권을 승계하지 않는 새로운 소유권 창설 (세율 2.8%).

## 원시취득 세율
- 주택·건물 신축: **2.8%** (공사비 합계 기준)
- 유상취득(매매): 주택 1~3%, 토지·건물 4% — 원시취득과 세율 다름

## 부담부증여와의 차이
- 부담부증여: 증여자의 채무를 승계 → 채무분은 **유상취득**(매매세율), 나머지는 무상취득(증여세율)
- 원시취득(신축): 공사비 전체에 2.8% 단일 세율

## 증축의 경우
기존 건물의 기존 면적분: 원시취득 아님 (매매·보존등기 시점 기준)
**증가한 면적분**: 원시취득으로 2.8% 별도 과세`}
            legalBasis={["지방세법 제11조 제1항 제3호", "지방세법 제10조의4"]}
          />
        }
      >
        <select
          className={selectCls}
          value={form.acquisitionCause}
          onChange={(e) => handleAcquisitionCauseChange(e.target.value)}
        >
          <optgroup label="유상취득">
            <option value="purchase">매매</option>
            <option value="exchange">교환</option>
            <option value="auction">공매·경매</option>
            <option value="in_kind_investment">현물출자</option>
          </optgroup>
          <optgroup label="무상취득">
            <option value="inheritance">상속</option>
            <option value="inheritance_farmland">농지 상속 (2.3% 특례)</option>
            <option value="gift">증여</option>
            <option value="burdened_gift">부담부증여</option>
            <option value="donation">기부</option>
          </optgroup>
          <optgroup label="원시취득">
            <option value="new_construction">신축</option>
            <option value="extension">증축</option>
            <option value="reconstruction">개축</option>
            <option value="reclamation">공유수면 매립·간척</option>
          </optgroup>
          <optgroup label="간주취득 (지방세법 §7④⑤·§10의6)">
            <option value="deemed_major_shareholder">간주취득 — 과점주주</option>
            <option value="deemed_land_category">간주취득 — 지목변경</option>
            <option value="deemed_renovation">간주취득 — 건물 개수(改修)</option>
          </optgroup>
        </select>

        {/* 간주취득 안내 배너 */}
        {isDeemed && (
          <div className="rounded-md bg-violet-100 border border-violet-200 px-3 py-2 text-xs text-violet-800 space-y-1">
            <p className="font-semibold">간주취득 — 실제 소유권 이전 없이 과세 (§7④⑤·§10의6)</p>
            <p>중과세 없음. 다음 단계에서 유형별 세부 정보를 입력합니다.</p>
          </div>
        )}
      </ToneCard>

      {/* 소재지 (공시가격 조회용) */}
      <div className="space-y-1.5">
        <label className={labelCls}>
          물건 소재지 <span className="text-muted-foreground font-normal">(선택)</span>
        </label>
        <AddressSearch
          value={{ road: form.road, jibun: form.jibun, building: form.building, detail: "", lng: "", lat: "" } satisfies AddressValue}
          onChange={(v) => setForm((f) => ({ ...f, jibun: v.jibun, road: v.road, building: v.building, dong: v.dong ?? "", ho: v.ho ?? "" }))}
        />
        <p className="text-xs text-muted-foreground">
          입력하면 다음 단계에서 시가표준액을 자동 조회할 수 있습니다.
        </p>
      </div>

      {/* 연부취득 토글 — 매매 선택 시만 표시 */}
      {!isDeemed && form.acquisitionCause === "purchase" && (
        <ToggleCard
          tone="amber"
          title="연부취득 (2년 이상 분할 지급, §10의3)"
          description="매매대금을 2년 이상에 걸쳐 분할 지급하는 방식. 각 회차 지급일마다 별도 신고 의무 발생."
          checked={form.isInstallmentAcquisition ?? false}
          onCheckedChange={(v) => {
            set("isInstallmentAcquisition", v);
            if (v && (form.installments ?? []).length === 0) {
              // ON 진입 시 초기 3행(계약금·중도금·잔금) 시딩 — 이벤트 핸들러에서
              // 처리 (useEffect → store 미러링 금지 정책)
              set("installments", [
                { id: crypto.randomUUID(), label: "계약금", paymentDate: "", amount: "" },
                { id: crypto.randomUUID(), label: "중도금", paymentDate: "", amount: "" },
                { id: crypto.randomUUID(), label: "잔금",   paymentDate: "", amount: "" },
              ]);
            }
            if (!v) {
              set("installmentContractDate", "");
            }
          }}
          trailing={
            <TaxHelp
              title="연부취득 (지방세법 §10의3·시행령 §20⑤)"
              summary="매매대금을 2년 이상 분할 지급하는 취득. 각 회차마다 별도 신고 의무."
              details={`## 연부취득이란 (§6 20호)\n매매대금을 취득일부터 **2년 이상**에 걸쳐 분할 지급하는 매매 방식입니다.\n\n## 취득 시기 (시행령 §20⑤)\n각 회차 지급일이 **각각의 취득 시기**입니다.\n계약금 지급일, 중도금 지급일, 잔금 지급일 모두 별개의 취득일이 됩니다.\n\n## 신고·납부 의무 (§20①)\n각 회차 지급일부터 **60일 이내**에 취득세를 신고·납부해야 합니다.\n미신고·지연 시 가산세가 부과됩니다.\n\n## 과세표준 (§10의3 유상승계)\n각 회차의 **사실상 지급액**이 과세표준입니다.\n이 계산기는 모든 회차 합산을 간이 계산합니다.\n\n## 주의사항\n- 분할 지급 기간이 2년 미만이면 연부취득 요건 미충족\n  → 잔금 지급일 기준 일반 매매로 처리됨\n- 등기는 잔금 납부 후 일괄 처리 가능\n- 실무상 각 회차 납부 증빙 보관 필수`}
              legalBasis="지방세법 §10의3"
            />
          }
        >
          {/* 연부 ON 시: 매매계약일 + 총 계약금액 입력 */}
          <div>
            <label className={labelCls}>매매계약일</label>
            <DateInput
              value={form.installmentContractDate ?? ""}
              onChange={(v) => set("installmentContractDate", v)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              연부취득 요건 검증 기준일 (§6 제20호: 계약일부터 2년 이상 분할)
            </p>
          </div>
          <CurrencyInput
            label="총 매매계약금액 (선택)"
            value={form.installmentTotalContractPrice ?? ""}
            onChange={(v) => set("installmentTotalContractPrice", v)}
            placeholder="시가표준액 비교용 (과세표준은 회차 합산으로 결정)"
          />
          <div className={infoBannerCls}>
            회차별 지급일·지급액은 다음 단계(물건 상세)에서 입력합니다.
          </div>
        </ToggleCard>
      )}

      {/* 취득가액 — 취득 원인에 따라 분기 (간주취득·연부취득 시 미표시) */}
      {!isDeemed && isOnerous && !(form.isInstallmentAcquisition && form.acquisitionCause === "purchase") && (
        <CurrencyInput
          label="취득가액 (실거래가)"
          value={form.reportedPrice}
          onChange={(v) => set("reportedPrice", v)}
          placeholder="계약서상 거래금액"
        />
      )}
      {/* 연부취득 ON 시 안내 배너 */}
      {!isDeemed && isOnerous && form.isInstallmentAcquisition && form.acquisitionCause === "purchase" && (
        <div className={warnBannerCls}>
          연부취득의 과세표준은 각 회차 지급액의 합산입니다. 총 계약금액은 위 입력란에 참고용으로 입력하세요.
        </div>
      )}

      {!isDeemed && isBurdened && (
        <>
          <CurrencyInput
            label="취득가액 (시가)"
            value={form.marketValue}
            onChange={(v) => set("marketValue", v)}
            placeholder="부담부증여 전체 시가"
          />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className={labelCls}>승계 채무액</label>
              <TaxHelp
                title="부담부증여 채무액 — 배우자·직계존비속 적용 배제"
                summary="배우자·직계존비속 간 부담부증여는 전체 무상취득으로 처리. 채무액 분리 불가."
                details={`## 부담부증여란
증여자의 채무를 수증자가 인수(승계)하는 조건으로 이루어지는 증여.
채무분은 유상취득(매매세율), 순증여분은 무상취득(증여세율)으로 분리 계산.

## 배우자·직계존비속 간 적용 배제 (지방세법 §7⑫ 단서·§7⑪)
배우자 또는 직계존속·직계비속 간 부담부증여는 **전체를 무상취득**으로 처리합니다(§7⑫ 단서 → §7⑪ 증여 의제 적용).
채무액이 있어도 분리하지 않고 증여세율(3.5%)로 전체 과세.

이유: 가족 간 채무는 실제 이행이 불확실하다는 과세 정책적 판단.

## 제3자 간 부담부증여 (일반)
채무 승계액: 매매·경매 세율 (주택 1~3%, 토지·건물 4%)
나머지(증여분): 무상취득 세율 (3.5% 또는 2.8%)

## 다음 단계에서 관계 선택 가능
Step 3 "부담부증여 관계" 토글에서 배우자·직계존비속 여부 선택.`}
                size="sm"
              />
            </div>
            <CurrencyInput
              label=""
              value={form.encumbrance}
              onChange={(v) => set("encumbrance", v)}
              placeholder="유상분 (채무 승계 금액)"
            />
          </div>
        </>
      )}

      {!isDeemed && isOriginal && (
        <CurrencyInput
          label="공사비 (사실상 취득가액)"
          value={form.constructionCost}
          onChange={(v) => set("constructionCost", v)}
          placeholder="공사비 + 설계비 합계"
        />
      )}

      {/* 취득일 — 원인별 분기 (간주취득은 Step1에서 별도 입력) */}
      {!isDeemed && isOnerous && (
        <>
          {/* 연부취득 OFF 시에만 잔금 지급일 표시 (ON 시 마지막 회차 자동 대체) */}
          {!form.isInstallmentAcquisition && (
          <div>
            <label className={labelCls}>잔금 지급일 <span className="text-muted-foreground font-normal">(선택)</span></label>
            <DateInput
              value={form.balancePaymentDate}
              onChange={(v) => set("balancePaymentDate", v)}
            />
          </div>
          )}
          <div>
            <label className={labelCls}>등기접수일 <span className="text-muted-foreground font-normal">(선택)</span></label>
            <DateInput
              value={form.registrationDate}
              onChange={(v) => set("registrationDate", v)}
            />
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            잔금지급일·등기접수일 중 빠른 날이 취득일입니다. 미입력 시 오늘 날짜 사용.
          </p>
          <ReferenceSiteLinks sites={[REFERENCE_SITES.realEstateRegister]} />
        </>
      )}

      {!isDeemed && isGiftLike && (
        <div>
          <label className={labelCls}>증여계약일 <span className="text-muted-foreground font-normal">(선택)</span></label>
          <DateInput
            value={form.contractDate}
            onChange={(v) => set("contractDate", v)}
          />
        </div>
      )}

      {!isDeemed && isInheritance && (
        <div>
          <label className={labelCls}>상속개시일 (피상속인 사망일) <span className="text-muted-foreground font-normal">(선택)</span></label>
          <DateInput
            value={form.balancePaymentDate}
            onChange={(v) => set("balancePaymentDate", v)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            상속 신고기한 = 상속개시일로부터 6개월
          </p>
        </div>
      )}

      {!isDeemed && isOriginal && (
        <div>
          <label className={labelCls}>사용승인서 발급일 <span className="text-muted-foreground font-normal">(선택)</span></label>
          <DateInput
            value={form.usageApprovalDate}
            onChange={(v) => set("usageApprovalDate", v)}
          />
        </div>
      )}

      {!isDeemed && isOriginal && (
        <div>
          <div className="flex items-center gap-2">
            <label className={labelCls}>
              사실상 사용 개시일 <span className="text-muted-foreground font-normal">(선택)</span>
            </label>
            <TaxHelp
              title="사실상 사용 개시일 (지방세법 제20조)"
              summary="사용승인일 이전에 실제로 사용을 개시한 경우, 그 날짜를 취득시기로 봅니다."
              details={`## 사실상 사용 개시일 (지방세법 제20조)
사용승인서 발급일 이전에 건물을 실제로 사용·수익하기 시작한 경우,
그 사실상 사용 개시일을 취득시기로 봅니다.

## 판정 기준
- 실제 이사·입주 또는 영업 개시 날짜
- 전기·수도 등 유틸리티 개통일과 일치하는 것이 일반적
- 사용승인 이전에 실거주 또는 사용을 입증하는 서류 필요

## 신고기한에 미치는 영향
취득시기가 앞당겨지면 60일 신고기한의 기산일도 함께 앞당겨집니다.`}
              legalBasis="지방세법 제20조"
            />
          </div>
          <DateInput
            value={form.actualUsageDate ?? ""}
            onChange={(v) => set("actualUsageDate", v)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            사용승인 이전 실거주 시 입력. 입력 시 해당 일이 취득시기로 적용됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
