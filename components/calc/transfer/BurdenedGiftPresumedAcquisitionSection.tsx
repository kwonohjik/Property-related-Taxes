"use client";

/**
 * 부담부증여 시가 모드 — 취득가액 산정방식 라디오 + 매매사례가액(K-6)·감정가액(K-7) 입력 블록.
 *
 * `BurdenedGiftBlock.tsx`가 800줄 한도에 닿아 분리했다(라디오는 거기서 옮겨 왔고, 입력 블록은 신설).
 *
 * 법령 근거: 소득세법 §97①1호나목 · 시행령 §163⑫ → §176의2③1호(매매사례)·2호(감정)·3호(환산).
 * 순차 적용(매매사례 → 감정 → 환산)이고 필요경비는 개산공제만이다(§97②2호 — 실비 택일은 환산 전용).
 * 계획서: docs/00-pm/burdened-gift-appraisal-sales-case-acquisition.plan.md §5.3
 *
 * ⚠️ 새 옵션의 label·description에 「환산취득가액」·「실지취득가액 안분」 문자열을 넣지 않는다 — 기존 E2E
 *    (`transfer-burdened-gift-acquisition-method.spec.ts`)가 두 정규식으로 라디오를 찾아 strict mode가 깨진다.
 * ⚠️ 방식 전환 시 값 초기화는 **onChange 핸들러**(`bgAcquisitionMethodPatch`)에서 한다 — useEffect 미러링 금지.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BURDENED_GIFT_TRANSFER } from "@/lib/tax-engine/legal-codes/burdened-gift";
import {
  BG_PRESUMED_LABEL,
  bgAppraisalExtensionPenaltyApplies,
  bgPresumedBlock,
  bgPresumedInputKind,
  isBgPostDeemedInheritance,
  isBgPresumedMethod,
  type BgPresumedMethod,
} from "@/lib/calc/burdened-gift-presumed-acquisition";

type AcqMethod = AssetForm["bgAcquisitionMethod"];

/**
 * 산정방식 전환 patch — 값 초기화를 onChange에서 한다.
 *
 * `bgPresumedAcquisition*` 3칸은 매매사례가액·감정가액이 **공유**하는데 두 값은 의미가 달라
 * (순차 적용의 서로 다른 단계), 방식이 바뀌면 이전 방식의 금액을 새 방식의 값으로 읽을 위험이 있다.
 * ⇒ 매매사례가액·감정가액에서 **다른 방식으로 옮겨 갈 때** 3칸을 비운다. 같은 방식 재선택은 값을 유지한다.
 * 실지취득가액 입력(K-4)은 의미가 하나뿐이라 종전대로 유지한다.
 */
export function bgAcquisitionMethodPatch(prev: AcqMethod, next: AcqMethod): Partial<AssetForm> {
  if (prev === next || !isBgPresumedMethod(prev)) return { bgAcquisitionMethod: next };
  return {
    bgAcquisitionMethod: next,
    bgPresumedAcquisitionLand: "",
    bgPresumedAcquisitionBuilding: "",
    bgPresumedAcquisitionTotal: "",
    // 증축한 부분의 감정가액은 감정가액 전용이라 방식이 바뀌면 같이 비운다
    bgPresumedExtensionAppraisal: "",
    // 이월과세 × 새 방식의 당초 증여자 값도 같은 이유로 비운다
    bgCoDonorPresumedAcquisitionLand: "",
    bgCoDonorPresumedAcquisitionBuilding: "",
    bgCoDonorPresumedAcquisitionTotal: "",
  };
}

interface FieldProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 폼-전역 양도일(= 증여일) — 감정가액 × 신축·증축 5년 이내(§114조의2) 판정. */
  transferDate?: string;
  /** 지분 분할 취득(축 B) — 증축 × 감정가액은 지분마다 증축한 부분의 감정가액을 받을 칸이 없어 이 축에서만 계속 막는다. */
  fractionalSplit?: boolean;
}

/** 「취득가액 산정방식」 FieldCard + 4옵션 라디오 (법령 순차 적용 순서: 실지 → 매매사례 → 감정 → 환산). */
export function BurdenedGiftAcquisitionMethodField({
  asset,
  onChange,
  transferDate,
  fractionalSplit,
}: FieldProps) {
  // 상속받은 자산의 환산 차단(E-1 한계 G6) — ⑧ `validateBurdenedGiftAsset`과 같은 술어
  const inheritedConversionBlocked = isBgPostDeemedInheritance(asset);
  // 매매사례가액·감정가액을 고를 수 없는 자산(상속) — ⑧과 같은 `bgPresumedBlock`
  const presumedBlock = bgPresumedBlock(asset);
  // 증축 5년 이내 × 감정가액(§114조의2) — 엔진·⑧과 같은 단일 소스(`calculateBuildingPenalty`). 신축은 건물 전체 감정가액으로,
  // 증축은 「증축한 부분의 감정가액」 칸(아래 입력 블록)으로 가산세를 계산한다. 지분 분할 취득(축 B)만 그 칸을 받을 수 없어 막는다(⑧과 같은 조건).
  const appraisalPenaltyBlocked = !!fractionalSplit && bgAppraisalExtensionPenaltyApplies(asset, transferDate);

  return (
    <FieldCard
      label="취득가액 산정방식"
      hint="§100①: 양도가액을 시가(실지거래가액)로 산정한 경우 취득가액도 실지거래가액으로, 확인할 수 없으면 매매사례가액 → 감정가액 → 환산취득가액 순서로 산정(§97①1호나목 · 시행령 §176의2③)."
      trailing={
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §100" label="§100①" />
          <LawArticleModal legalBasis="소득세법 §97" label="§97①1호" />
          <LawArticleModal legalBasis="소득세법 시행령 §176의2" label="시행령 §176의2" />
        </div>
      }
    >
      <RadioCardGroup
        name={`bgAcquisitionMethod-${asset.assetId ?? "primary"}`}
        data-field="bgAcquisitionMethod"
        layout="stack"
        value={asset.bgAcquisitionMethod || ""}
        onChange={(v) => onChange(bgAcquisitionMethodPatch(asset.bgAcquisitionMethod, v))}
        options={[
          {
            value: "actual",
            label: "실지취득가액 안분",
            description: "양도인의 실제 취득가액 확인 시 — 실지취득가액 × 채무비율 (§97①1호가목)",
          },
          {
            value: "salesCase",
            label: BG_PRESUMED_LABEL.salesCase,
            description:
              presumedBlock?.short ??
              "실지거래가액 불명 시 1순위 — 취득일 전후 각 3개월 이내 동일·유사 자산 매매사례 (시행령 §176의2③1호). 필요경비는 개산공제만",
            disabled: presumedBlock !== null,
          },
          {
            value: "appraisal",
            label: BG_PRESUMED_LABEL.appraisal,
            description:
              presumedBlock?.short ??
              (appraisalPenaltyBlocked
                ? "지분 분할 취득에서 증축 건물을 5년 이내 양도하면 증축한 부분 감정가액의 5% 가산세(소득세법 §114조의2)가 붙는데 지분마다 그 감정가액을 받는 칸이 없어 쓸 수 없습니다"
                : "매매사례가 없을 때 — 취득일 전후 각 3개월 이내 감정평가법인등의 감정가액 (시행령 §176의2③2호). 필요경비는 개산공제만"),
            disabled: presumedBlock !== null || appraisalPenaltyBlocked,
          },
          {
            value: "converted",
            label: "환산취득가액",
            description:
              // 상속받은 자산(E-1 한계 G6) — 영 §163⑨ 평가액이 가목이라 환산 불가. ⑧과 같은 술어.
              inheritedConversionBlocked
                ? "상속받은 자산은 상속개시일 현재 상증법 평가액이 취득가액이라 쓸 수 없습니다 (소령 §163⑨)"
                : "실지취득가 불명 시 — 양도가액 × 「취득기준시가를 양도기준시가로 나눈 비율」 (§176의2③)",
            disabled: inheritedConversionBlocked,
          },
        ]}
      />
    </FieldCard>
  );
}

/** 입력 칸 제목 — 「감정가액」/「매매사례가액」. */
const PRESUMED_LAW_CONST: Record<BgPresumedMethod, string> = {
  salesCase: BURDENED_GIFT_TRANSFER.ACQUISITION_SALES_CASE_176_2_3_1,
  appraisal: BURDENED_GIFT_TRANSFER.ACQUISITION_APPRAISAL_176_2_3_2,
};

const PRESUMED_HINT: Record<BgPresumedMethod, string> = {
  salesCase:
    "취득일 전후 각 3개월 이내에 동일·유사 자산의 매매사례가 있어야 합니다. 특수관계인 거래 등 객관적으로 부당한 매매사례는 적용하지 않습니다(시행령 §176의2③ 단서).",
  appraisal:
    "매매사례가액이 없을 때 적용합니다. 취득일 전후 각 3개월 이내에 감정평가법인등 둘 이상이 평가한 감정가액의 평균액(기준시가 10억원 이하는 하나)입니다. 특수관계인 거래 등 객관적으로 부당한 감정가액은 적용하지 않습니다.",
};

interface SectionProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  method: BgPresumedMethod;
  /**
   * 이월과세(§97의2) — 입력하는 값이 **당초 증여자**의 취득 당시 금액이다(`bgCoDonorPresumedAcquisition*`). 소법 §97의2①1호가
   * 취득가액을 당초 증여자 취득 당시 §97①1호 금액으로 정하기 때문이다. 양도인 쪽은 증여받은 자산이라 증여일 평가액(실지 칸).
   */
  carryover?: boolean;
  /**
   * 지분 분할 취득(축 B) — 값이 「취득일 전후 각 3개월」이라 지분마다 취득일이 다르면 달라진다. 그래서 **지분 카드마다** 자기 취득일 기준의
   * **물건 전체** 값을 받고 엔진이 지분율을 곱해 합산한다(`scaleBurdenedGiftInfo`). 안내 한 줄만 바꾼다.
   */
  fractionalSplit?: boolean;
  /** 개산공제 base(취득시 기준시가) 입력 위치 안내 — 기본 문구가 가리키는 칸이 이 카드에 없을 때(지분 컴패니언) 덮어쓴다. */
  basisNote?: string;
  /** 폼-전역 양도일(= 증여일) — 증축 × 5년 이내 판정(「증축한 부분의 감정가액」 칸 노출). */
  transferDate?: string;
  /** 일반건물 — 의제취득일 전 상속·증여 파트는 3자 max라 이 방식을 쓰지 않는다(Q-28 · PR-7b-6b) — 그 파트 칸을 숨긴다. */
  hidePart?: "land" | "building";
}

/**
 * K-6 매매사례가액·K-7 감정가액 입력 — 자산 종류별 3분기(K-4 실지취득가액 블록과 같은 구조):
 * 일반건물 토지·건물 2칸 / 토지 1칸 / 그 외(주택·건물·상업용·재개발 완공 APT) 총액 1칸.
 * 취득시 기준시가(개산공제 base)는 자산 종류별 기존 칸에서 받는다 — 일반건물은 취득 정보의 gb* 칸, 그 외는 「② 양도정보」.
 */
export function BurdenedGiftPresumedAcquisitionSection({ asset, onChange, method, carryover, fractionalSplit, basisNote, transferDate, hidePart }: SectionProps) {
  const label = BG_PRESUMED_LABEL[method];
  const kind = bgPresumedInputKind(asset);
  // 이월과세면 당초 증여자 칸을 읽고 쓴다 — 칸 이름만 다르고 입력 형태·검증 규칙은 같다.
  const prefix = carryover ? "당초 증여자의 " : "";
  // 증축 5년 이내 × 감정가액 — §114조의2 가산세 base인 「증축한 부분의 감정가액」을 받는다(엔진·⑧과 같은 술어). 이월과세·축 B는 받지 않는다.
  const showExtensionAppraisal =
    method === "appraisal" && !carryover && !fractionalSplit && bgAppraisalExtensionPenaltyApplies(asset, transferDate);
  const f = carryover
    ? ({ land: "bgCoDonorPresumedAcquisitionLand", building: "bgCoDonorPresumedAcquisitionBuilding", total: "bgCoDonorPresumedAcquisitionTotal" } as const)
    : ({ land: "bgPresumedAcquisitionLand", building: "bgPresumedAcquisitionBuilding", total: "bgPresumedAcquisitionTotal" } as const);
  return (
    <ToneCard
      tone="amber"
      title={`${prefix}${label} 입력`}
      titleExtra={
        <LawArticleModal
          legalBasis="소득세법 시행령 §176의2 ③"
          label={method === "appraisal" ? "시행령 §176의2③2호" : "시행령 §176의2③1호"}
        />
      }
    >
      <p className="text-caption text-amber-700 dark:text-amber-300" data-testid="bg-presumed-law-line">
        {PRESUMED_LAW_CONST[method]}
      </p>
      <ToneCard tone="sky" bodyClassName="space-y-1">
        <p className="text-caption text-sky-800 dark:text-sky-200" data-testid="bg-presumed-expense-notice">
          필요경비는 <b>개산공제</b>(취득시 기준시가 × 채무비율 × 개산공제율)만 인정되고 자본적지출·양도비는 공제하지 않습니다
          (소득세법 §97②2호 — 실비와 비교해 고르는 것은 환산 방식 전용).{" "}
          {basisNote
            ? basisNote
            : carryover
            ? "개산공제 기준이 되는 취득 당시 토지·건물 기준시가는 아래 「당초 증여자」 두 칸에서 입력하세요."
            : asset.assetKind === "general_building"
              ? "개산공제 기준이 되는 취득시 토지·건물 기준시가는 아래 일반건물 취득 정보에서 입력하세요."
              : "개산공제 기준이 되는 취득시 기준시가는 아래 「② 양도정보」에서 입력하세요."}
        </p>
      </ToneCard>
      {fractionalSplit && (
        <p className="text-caption text-amber-700 dark:text-amber-300" data-testid="bg-presumed-fractional-note">
          지분 분할 취득 — 이 지분의 <b>취득일 전후 각 3개월</b> 기준으로, <b>물건 전체</b>의 {label}을 입력하세요(지분율은 시스템이 곱합니다).
          다른 지분은 해당 지분 카드에서 따로 입력합니다.
        </p>
      )}
      {kind === "split" ? (
        <>
          {hidePart !== "land" && (
          <FieldCard label={`${prefix}토지 ${label}`} hint={PRESUMED_HINT[method]} field={carryover ? "bgCoDonorPresumedAcquisitionLand" : "bgPresumedAcquisitionLand"}>
            <CurrencyInput
              label=""
              hideUnit
              data-field={f.land}
              value={asset[f.land]}
              onChange={(v) => onChange({ [f.land]: v })}
            />
          </FieldCard>
          )}
          {hidePart !== "building" && (
          <FieldCard label={`${prefix}건물 ${label}`} field={carryover ? "bgCoDonorPresumedAcquisitionBuilding" : "bgPresumedAcquisitionBuilding"}>
            <CurrencyInput
              label=""
              hideUnit
              data-field={f.building}
              value={asset[f.building]}
              onChange={(v) => onChange({ [f.building]: v })}
            />
          </FieldCard>
          )}
        </>
      ) : kind === "land" ? (
        <FieldCard label={`${prefix}토지 ${label}`} hint={PRESUMED_HINT[method]}>
          <CurrencyInput
            label=""
            hideUnit
            data-field={f.land}
            value={asset[f.land]}
            onChange={(v) => onChange({ [f.land]: v })}
          />
        </FieldCard>
      ) : (
        <FieldCard label={`${prefix}${label} (주택·건물 전체)`} hint={PRESUMED_HINT[method]}>
          <CurrencyInput
            label=""
            hideUnit
            data-field={f.total}
            value={asset[f.total]}
            onChange={(v) => onChange({ [f.total]: v })}
          />
        </FieldCard>
      )}
      {showExtensionAppraisal && (
        <FieldCard
          label="증축한 부분의 감정가액"
          hint="건물을 증축하고 증축일부터 5년 이내에 양도하면 증축한 부분에 한정한 감정가액의 5%가 가산세로 붙습니다(소득세법 §114조의2①). 위 감정가액과 같은 기준(물건 전체)으로 입력하세요 — 채무비율 안분은 시스템이 합니다. 건물 전체 감정가액으로 대신할 수 없습니다."
        >
          <CurrencyInput
            label=""
            hideUnit
            data-field="bgPresumedExtensionAppraisal"
            data-testid="bg-presumed-extension-appraisal"
            value={asset.bgPresumedExtensionAppraisal}
            onChange={(v) => onChange({ bgPresumedExtensionAppraisal: v })}
          />
        </FieldCard>
      )}
    </ToneCard>
  );
}
