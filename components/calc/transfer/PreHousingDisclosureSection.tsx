"use client";

/**
 * 개별주택가격 미공시 취득 시 3-시점 환산취득가 입력 패널
 *
 * 주택 취득 당시 개별주택가격이 공시되지 않은 경우, 최초 공시 시점을 기준으로
 * 취득·최초공시·양도 3시점의 기준시가를 입력해 취득시 기준시가를 역산한다.
 *
 * 법령 근거: 소득세법 시행령 §164 ⑦
 */

import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ThreePointStandardPriceInput } from "./ThreePointStandardPriceInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import { isPhdEligible } from "@/lib/calc/phd-eligibility";
import { phdAcqDisclosedPriceName, phdClause, phdConvertedPriceName } from "@/lib/calc/phd-housing-term";
import { phdAssistNeeds164_5 } from "@/lib/calc/phd-converted-housing-price";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { derivePre1990PlainHousePhdLandPricePerSqmAtAcqString } from "@/lib/calc/transfer-pre1990-phd-bridge";

// ─── Props ────────────────────────────────────────────────────────

interface Props {
  asset: AssetForm;
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
  /**
   * `"phd"`(기본) — 환산취득가 3-시점 입력(양도시 3칸 포함 11칸, ⑧ 이 요구하고 ④ 가 전송한다).
   * `"assist"` — **계산 보조**: 환산이 아닌 방식(실거래가·감정가액·매매사례가액)의 «환산 …가격 계산해 채우기»(개별·공동주택)(`PhdConvertedPriceFill`)가
   * 같은 카드를 재사용한다. 양도시 입력(양도시 개별주택가격·③ 양도시 기준시가)은 환산 개별주택가격에 쓰이지 않아 숨기고, 입력값은 ④ 가 보내지 않고 ⑧ 도 요구하지 않는다
   * (`phdFlagEffective` 가 방식 축으로 false). 같은 `phd*` 칸을 쓰므로 환산으로 돌아오면 같은 사실(최초 고시·취득 당시·최초 고시 당시 값)이 그대로 복귀한다.
   */
  mode?: "phd" | "assist";
}

// ─── 법령 배지 ─────────────────────────────────────────────────────

// 공동주택은 처음 매겨진 가격의 주체에 따라 §164⑥(국세청장 고시)·§164⑦(국토교통부장관 공시) — 산식이 같아 함께 적는다(`phdClause`)
function LegalBadge({ apartment }: { apartment: boolean }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
      {apartment ? `소득세법 시행령 ${phdClause(true)}` : "소득세법 시행령 §164 ⑦"}
    </span>
  );
}

// ─── 메인 패널 ────────────────────────────────────────────────────

// ─── 주택유형 옵션 ──────────────────────────────────────────────

type HousingType = "individual" | "apartment";

const HOUSING_TYPE_OPTIONS: { value: HousingType; label: string; description: string }[] = [
  { value: "individual", label: "단독·다가구주택",  description: "개별주택가격 기준 (부동산공시가격알리미)" },
  { value: "apartment",  label: "공동주택 (아파트)", description: "공동주택가격 기준 (부동산공시가격알리미)" },
];

// 주택유형별 공시가격 라벨
const PRICE_LABEL: Record<HousingType, { first: string; transfer: string }> = {
  individual: { first: "최초 고시 개별주택가격",  transfer: "양도시 개별주택가격" },
  apartment:  { first: "최초 고시 가격(국세청장 고시 기준시가 또는 공동주택가격)",  transfer: "양도시 공동주택가격" },
};

// ─── 메인 패널 ────────────────────────────────────────────────

export function PreHousingDisclosureSection({ asset, transferDate, onChange, mode = "phd" }: Props) {
  const assist = mode === "assist";
  // 🔴 폼-지속 상태다 — 로컬 `useState`면 단계 이동·새로고침에 「단독·다가구」로 되돌아가
  //    **저장된 공동주택가격에 개별주택가격 라벨**이 붙는다(R12). API 페이로드에는 싣지
  //    않는다(표시 축).
  const housingType: HousingType = asset.phdHousingType ?? "individual";
  const setHousingType = (v: HousingType) => onChange({ phdHousingType: v });

  const priceLabel = PRICE_LABEL[housingType];
  // 보조(assist) 모드 문구의 §164⑦ 산식 결과 이름 — 위 라디오(주택유형)를 따른다(결과 화면과 같은 단일 정의)
  const apartment = housingType === "apartment";
  const convertedName = phdConvertedPriceName(apartment);
  const clause = phdClause(apartment);
  const acqDisclosedName = phdAcqDisclosedPriceName(apartment);
  // §164⑦ 게이트 비교일 — 이월과세(§97의2)는 증여자 취득가액 기준이므로 증여자 취득일
  const phdCompareDate =
    asset.acquisitionCause === "carryover_gift"
      ? (asset.carryover?.donorAcquisitionDate ?? "")
      : asset.acquisitionDate;
  // 개별/공동주택 공시가격 자동조회 — StandardPriceInput 재사용 (propertyKind로 분기)
  const housePropertyKind = housingType === "apartment" ? "house_apart" : "house_individual";

  // 건물 기준시가 계산기 모달 소재지 prefill — GeneralBuildingBlock 패턴 복제
  const stdPriceAddress = stdPriceAddressOf(asset);

  /**
   * 1990.8.30. 이전 취득 — 그날 이전에는 **개별공시지가가 고시되지 않았다**.
   * 영 §164④ 등급가액 환산이 §164⑦ 분자의 「취득당시의 법 §99①1호 **가목**의 가액」을 채운다
   * (법 §99③2호가 「…공시되기 전에 취득한 **토지 및 주택**」을 한 호에서 위임).
   *
   * ⚠️ 파생값은 **store에 쓰지 않는다** — 아래 `landPricePerSqmAtAcq`의 display fallback으로만
   *    전달한다(useEffect→store 미러링 금지). ④·⑧도 **같은 함수**를 부른다(3중 패턴).
   */
  const acqDateForPre1990 = asset.landAcquisitionDate || asset.acquisitionDate;
  const isPre1990Acq = !!acqDateForPre1990 && acqDateForPre1990 < "1990-08-30";
  const pre1990DerivedPerSqm = derivePre1990PlainHousePhdLandPricePerSqmAtAcqString(
    asset,
    transferDate,
  );

  return (
    <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {assist ? `${convertedName} 계산용 입력` : "주택공시가격 미공시 취득 (3-시점 환산)"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {assist
              ? `취득 당시 주택공시가격이 고시되지 않은 주택의 ${convertedName}을 계산합니다. 양도시 값은 필요하지 않으며, 이 입력은 세금 계산에 전송되지 않습니다.`
              : "취득 당시 주택공시가격이 고시되지 않은 경우, 최초 공시일의 주택공시가격을 기준으로 취득시 기준시가를 역산합니다."}
          </p>
        </div>
        <LegalBadge apartment={apartment} />
      </div>

      {/* 주택유형 선택 */}
      <RadioCardGroup
        name={`housingType-${asset.assetId ?? "primary"}`}
        value={housingType}
        onChange={setHousingType}
        options={HOUSING_TYPE_OPTIONS}
        layout="inline"
        tone="amber"
      />

      {/* ① 최초 고시일 (토지 면적은 ① 기본정보로 이전 — 아래 주석)

          토지 면적(`acquisitionArea`) 입력 칸을 여기서 제거했다(2026-08-04).
          이 패널은 `usePreHousingDisclosure` 토글 아래에 있어 **토글을 끄면 사라지는데**,
          같은 필드를 ① 기본정보 축 A(`asset-sections/AssetAreaSection.tsx`)도 입력받아
          같은 값을 두 곳에서 받고 있었다. 이 패널이 열리는 자산유형은 `housing`과
          (분리취득 시) `building`뿐이고(`CompanionAcqPurchaseBlock.tsx:115-116·417`)
          둘 다 축 A에 등재되어 있어(`AREA_SCENARIOS_BY_ASSET_KIND`) 입력 경로는 남는다.
          전용 블록 4종과 같은 처리다 — `GeneralBuildingBlock.tsx:299` 참조.
          ⛔ 여기에 면적 칸을 다시 추가하지 말 것.
          anchor: `__tests__/components/asset-area-input-no-duplication.anchor.test.tsx`
                  ("공유 섹션" describe) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-caption text-muted-foreground">
          <b>토지 면적</b>은 ① 기본정보에서 입력합니다
          {asset.acquisitionArea ? ` — 현재 ${asset.acquisitionArea}㎡` : " (미입력)"}.
          이 패널의 3-시점 기준시가는 그 면적을 곱셈 인자로 씁니다.
        </div>

        <FieldCard label="최초 고시일" field="phdFirstDisclosureDate" required stacked>
          <DateInput
            value={asset.phdFirstDisclosureDate}
            onChange={(v) => onChange({ phdFirstDisclosureDate: v })}
          />
          {housingType === "apartment" && (
            <p className="mt-1 text-caption text-amber-700 dark:text-amber-300">
              공동주택은 단지별 최초고시일이 다릅니다. 홈택스 기준시가 조회에서 해당 단지의 최초 고시일을 확인하세요.
              처음 매겨진 가격이 국세청장 고시 기준시가면(§164⑥) 그 고시일과 금액을, 국토교통부장관 공시 공동주택가격이면(§164⑦) 그 공시일과 금액을 넣습니다.
              아래 자동조회는 공동주택가격만 찾으므로 국세청장 고시 기준시가는 직접 입력하세요.
            </p>
          )}
        </FieldCard>
      </div>

      {/* §164⑦ 적용가능 게이트 경고 — 취득일(이월과세는 증여자 취득일·의제 1985-01-01 반영) ≥ 최초고시일 (validate ⑧과 동일 게이트) */}
      {!isPhdEligible(phdCompareDate, asset.phdFirstDisclosureDate) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-900 dark:text-rose-200 dark:bg-rose-950/40">
          <p className="font-medium">⚠️ 3-시점 환산({clause}) 대상이 아닙니다</p>
          <p className="mt-0.5 text-caption leading-relaxed text-rose-800 dark:text-rose-200">
            {assist
              ? `취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후이므로 취득 당시 ${acqDisclosedName}이 이미 고시되어 있습니다. ${convertedName}을 계산하지 않고, 취득일 현재 고시된 ${acqDisclosedName}을 취득시 기준시가 칸에 직접 입력하세요.`
              : `취득일(이월과세는 증여자 취득일, 의제취득일 1985-01-01 반영)이 최초 고시일 이후이므로 취득 당시 ${acqDisclosedName}이 이미 고시되어 있습니다. 3-시점 환산을 끄고 취득일 현재 고시된 ${acqDisclosedName}(취득시 기준시가)을 직접 입력하세요. 이 상태로는 계산이 진행되지 않습니다.`}
          </p>
        </div>
      )}

      {/* ③④ 최초 고시 주택공시가격 P_F · 양도시 주택공시가격 P_T (한 행, StandardPriceInput 자동조회) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StandardPriceInput
          data-field="phdFirstDisclosureHousingPrice"
          propertyKind={housePropertyKind}
          totalPrice={asset.phdFirstDisclosureHousingPrice}
          onTotalPriceChange={(v) => onChange({ phdFirstDisclosureHousingPrice: v })}
          jibun={asset.addressJibun || undefined}
          dong={asset.addressDong || undefined}
          ho={asset.addressHo || undefined}
          referenceDate={asset.phdFirstDisclosureDate}
          label={priceLabel.first}
          required
        />
        {!assist && (
          <StandardPriceInput
            data-field="phdTransferHousingPrice"
            propertyKind={housePropertyKind}
            totalPrice={asset.phdTransferHousingPrice}
            onTotalPriceChange={(v) => onChange({ phdTransferHousingPrice: v })}
            jibun={asset.addressJibun || undefined}
            dong={asset.addressDong || undefined}
            ho={asset.addressHo || undefined}
            referenceDate={transferDate}
            label={priceLabel.transfer}
            required
          />
        )}
      </div>

      {/* ⑤ 3-시점 기준시가 입력 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {assist ? "취득시·최초공시일 기준시가 입력" : "3시점 기준시가 입력"} — 토지 단위 공시지가(원/㎡) + 건물 기준시가(원)
        </p>
        {/*
          영 §164④ 토지등급가액 환산 — 1990.8.30. 이전 취득 주택 전용.
          아래 3-시점 입력의 「취득시 공시지가」가 이 환산값으로 자동 채워진다.
        */}
        {isPre1990Acq && (
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-800 dark:bg-amber-900/15">
            <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              1990.8.30. 이전 취득 — 개별공시지가 고시 전이므로 토지등급가액으로 환산합니다
              (소득세법 시행령 §164④).
            </p>
            <Pre1990LandValuationInput
              form={{
                pre1990Enabled: asset.pre1990Enabled,
                pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
                pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
                pre1990Grade_current: asset.pre1990Grade_current,
                pre1990Grade_prev: asset.pre1990Grade_prev,
                pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
                pre1990GradeMode: asset.pre1990GradeMode,
              }}
              onChange={(patch) => onChange(patch)}
              acquisitionArea={asset.acquisitionArea || undefined}
              jibun={asset.addressJibun || undefined}
              acquisitionDate={acqDateForPre1990 || undefined}
              transferDate={transferDate}
            />
          </div>
        )}

        {/* §164⑥·⑦ 후단(§164⑤ 준용) — 보조 모드 전용 확인. 환산 모드는 3시점 일괄 계산기가 ≤2000을 준용 산정한다(`phd-building-std-batch.ts`).
            보조 모드는 칸별 계산기라 사용자가 연도를 «취득연도»로 골라야 준용이 적용된다 — 확인해야 채우기 버튼이 켜진다(Q-4 (b)). */}
        {assist && phdAssistNeeds164_5(asset) && (
          <div data-field="phdAssistBuildingStdBy164_5">
            <ToneCard tone="amber">
              <div className="flex flex-wrap items-center gap-1.5">
                {apartment && <LawArticleModal legalBasis="소득세법 시행령 §164 ⑥" label="§164⑥ 후단" />}
                <LawArticleModal legalBasis="소득세법 시행령 §164 ⑦" label="§164⑦ 후단" />
                <LawArticleModal legalBasis="소득세법 시행령 §164 ⑤" label="§164⑤" />
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-200">
                취득일(의제취득일 1985-01-01 반영) 또는 최초 고시일이 <b>2000년 이전</b>이면 그 시점의 건물 기준시가는{" "}
                <b>국세청 고시 전이라 존재하지 않습니다</b>. {clause} 후단에 따라 <b>§164⑤를 준용</b>해 산정합니다 — 2001년 지수표 금액에
                「취득당시 건물기준시가 산정기준율」을 적용합니다.
              </p>
              <p className="text-caption text-amber-700 dark:text-amber-300">
                각 칸의 <b>[건물 기준시가 계산]</b>에서 그 시점의 연도를 <b>취득연도</b>로 고르면 준용이 적용됩니다(최초 고시 시점 칸도
                같습니다). 계산기가 지원하지 않는 구조는 직접 산정한 금액을 입력하세요.
              </p>
              <ToggleCard
                tone="amber"
                variant="chip"
                checked={!!asset.phdAssistBuildingStdBy164_5}
                onCheckedChange={(v) => onChange({ phdAssistBuildingStdBy164_5: v })}
                title="§164⑤ 준용으로 산정한 금액입니다"
                description="확인해야 계산해 채우기 버튼이 켜집니다"
              />
            </ToneCard>
          </div>
        )}

        <ThreePointStandardPriceInput
          fieldLandAtAcq="phdLandPricePerSqmAtAcq"
          fieldBuildingAtAcq="phdBuildingStdPriceAtAcq"
          fieldLandAtFirst="phdLandPricePerSqmAtFirst"
          fieldBuildingAtFirst="phdBuildingStdPriceAtFirst"
          fieldLandAtTransfer="phdLandPricePerSqmAtTransfer"
          fieldBuildingAtTransfer="phdBuildingStdPriceAtTransfer"
          jibun={asset.addressJibun || undefined}
          landArea={asset.acquisitionArea || undefined}
          stdPriceSnapshotPrefix={`bsp-${asset.assetId}-phd`}
          stdPriceAddress={stdPriceAddress}
          enableBatchCalc={!assist}
          hideTransferColumn={assist}
          // 건물 기준시가·batch·신축연도는 건물 취득일 기준(건물 std valuationYear ≥ 신축연도).
          // 단, 취득 부수토지 개별공시지가는 토지 취득일 기준(§166⑥, 부수토지 기준시가 = 공시지가 × 면적의
          // land value — 건물 위치지수용 아님) → acqLandReferenceDate로 분리(2026-07-11, B안).
          acquisitionDate={asset.acquisitionDate}
          acqLandReferenceDate={asset.landAcquisitionDate || asset.acquisitionDate}
          landPriceYearAtAcq={asset.phdLandPriceYearAtAcq}
          landPriceYearAtAcqIsManual={asset.phdLandPriceYearAtAcqIsManual}
          onLandPriceYearAtAcqChange={(year, isManual) =>
            onChange({ phdLandPriceYearAtAcq: year, phdLandPriceYearAtAcqIsManual: isManual })
          }
          landPricePerSqmAtAcq={asset.phdLandPricePerSqmAtAcq || pre1990DerivedPerSqm}
          onLandPricePerSqmAtAcqChange={(v) => onChange({ phdLandPricePerSqmAtAcq: v })}
          buildingStdPriceAtAcq={asset.phdBuildingStdPriceAtAcq}
          onBuildingStdPriceAtAcqChange={(v) => onChange({ phdBuildingStdPriceAtAcq: v })}
          // 최초공시일
          firstDisclosureDate={asset.phdFirstDisclosureDate}
          landPriceYearAtFirst={asset.phdLandPriceYearAtFirst}
          landPriceYearAtFirstIsManual={asset.phdLandPriceYearAtFirstIsManual}
          onLandPriceYearAtFirstChange={(year, isManual) =>
            onChange({ phdLandPriceYearAtFirst: year, phdLandPriceYearAtFirstIsManual: isManual })
          }
          landPricePerSqmAtFirst={asset.phdLandPricePerSqmAtFirst}
          onLandPricePerSqmAtFirstChange={(v) => onChange({ phdLandPricePerSqmAtFirst: v })}
          buildingStdPriceAtFirst={asset.phdBuildingStdPriceAtFirst}
          onBuildingStdPriceAtFirstChange={(v) => onChange({ phdBuildingStdPriceAtFirst: v })}
          // 양도시
          transferDate={transferDate}
          landPriceYearAtTransfer={asset.phdLandPriceYearAtTransfer}
          landPriceYearAtTransferIsManual={asset.phdLandPriceYearAtTransferIsManual}
          onLandPriceYearAtTransferChange={(year, isManual) =>
            onChange({
              phdLandPriceYearAtTransfer: year,
              phdLandPriceYearAtTransferIsManual: isManual,
            })
          }
          landPricePerSqmAtTransfer={asset.phdLandPricePerSqmAtTransfer}
          onLandPricePerSqmAtTransferChange={(v) => onChange({ phdLandPricePerSqmAtTransfer: v })}
          buildingStdPriceAtTransfer={asset.phdBuildingStdPriceAtTransfer}
          onBuildingStdPriceAtTransferChange={(v) =>
            onChange({ phdBuildingStdPriceAtTransfer: v })
          }
        />
      </div>
    </div>
  );
}
