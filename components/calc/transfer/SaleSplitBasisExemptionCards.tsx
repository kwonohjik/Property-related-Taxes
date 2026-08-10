"use client";

/**
 * 축 A 부속 — 양도가액 **안분 basis(감정평가가액)** + **§166⑧ 예외** 입력 (Phase 1-E)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.3 · §12.6
 *
 * ## 왜 축 A에 두는가
 *
 * 두 입력 모두 **양도가액을 어떻게 나눌지**를 결정한다 — 취득가액 축(축 B)과 무관하다.
 *
 * | 입력 | 노출 조건 | 이유 |
 * |---|---|---|
 * | 감정평가가액 3필드 | **모드 무관** | 일괄양도의 안분 basis이자 구분양도의 30% 비교 대상이다 |
 * | §166⑧ 예외 | **구분양도 전용** | 30% 판정 자체가 구분 기재가 있어야 돈다 |
 *
 * ## 토글 상태를 폼에 저장하지 않는 이유
 *
 * 값의 유무로 열림을 판정하면 「입력하다가 지웠을 때 카드가 접히는」 문제가 생기고, 별도
 * 토글 필드를 두면 값과 상태 두 벌을 동기화해야 한다. ⇒ **로컬 `useState` + 초기값만 폼에서
 * 파생**한다(세션 복원 시 값이 있으면 열린 채 시작). 로컬 state는 store 미러링이 아니므로
 * `useEffect → store` 금지 정책과 무관하다.
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import type { SaleSplitMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/**
 * ── 안분 방식 **3-way 선택지** — 일반건물·주택 두 경로가 공유한다 (2026-08-07) ──
 *
 * 순서는 **법정 우선순위** 그대로다: 구분 기장이 원칙(「소득세법」 §100②)이고, 안분해야 한다면
 * 감정평가액(「부가가치세법 시행령」 §64①1호)이 기준시가(같은 항 2호)에 앞선다.
 *
 * 라벨을 한 곳에 두는 이유는 두 화면이 **같은 것을 다르게 부르지 않게** 하기 위함이다 —
 * 종전에는 같은 축을 일반건물은 「일괄양도 (양도시 기준시가 비율로 안분)」, 주택은
 * 「일괄양도 (양도시 기준시가 안분)」으로 달리 불렀다.
 */
/**
 * 섹션 제목 — 라벨과 **같은 이유로** 한 곳에 둔다.
 *
 * 2026-08-08 사용자 확정 문구다(「양도가액 결정 방식」 → 「양도가액 토지·건물 안분 방식」).
 * #1139가 선택지·전환 patch만 통일하고 제목은 각자 두어 주택 경로에 종전 문구가 남았다
 * — 같은 축을 다르게 부르면 사용자가 다른 기능으로 읽는다(2026-08-09 화면 실측에서 발견).
 *
 * ⚠️ 이 문구를 바꾸면 축 B의 환산 안내(`LandBuildingSplitSection`의 `transferSource`)가
 *    가리키는 이름도 함께 바꿔야 한다 — 없는 카드 이름을 가리키게 된다.
 */
export const SALE_SPLIT_SECTION_TITLE = "양도가액 토지·건물 안분 방식";

/**
 * 라벨은 **괄호 안 설명문만** 남긴다 (2026-08-11 사용자 요청).
 *
 * 종전 「구분양도 (계약서에 구분 기재)」·「감정평가 (감정평가가액으로 안분)」·
 * 「기준시가 안분 (양도시 기준시가 비율)」은 괄호 앞뒤가 같은 말의 중복이었다. 섹션 제목이
 * 이미 「양도가액 토지·건물 안분 방식」이라 축은 제목이 말해 주므로, 선택지는 **무엇으로
 * 나누는지**만 말하면 된다.
 *
 * ⚠️ E2E는 이 라벨을 접근성 이름으로 라디오를 고른다(`e2e/split-mode-gating.spec.ts`) —
 *    바꾸면 그 spec의 `getByRole("radio", { name })`도 함께 바꿔야 한다.
 */
export const SALE_SPLIT_MODE_OPTIONS: RadioCardOption<SaleSplitMode>[] = [
  { value: "actual", label: "계약서에 구분 기재" },
  { value: "appraisal", label: "감정평가가액으로 안분" },
  { value: "apportioned", label: "양도시 기준시가 비율" },
];

/**
 * 구분양도 전용 — 「30% 판정 비교 기준」 감정평가액 (선택 입력).
 *
 * 「소득세법」 §100③은 구분 기재액을 「안분계산한 가액」과 견주는데, 그 안분값은 §166⑥ →
 * 부가령 §64①의 서열(감정평가액 > 기준시가)로 정해진다. ⇒ 감정평가서가 있으면 **30% 판정도
 * 그것과 해야 하므로** 구분양도에서도 입력 경로를 남긴다(3-way 배타로 없애면 감정평가가 있는데
 * 기준시가로 비교하게 되어 판정이 뒤집힌다).
 *
 * 열림은 값 유무에서 파생한 **로컬 state**다 — 폼에 상태 필드를 두면 값과 두 벌을 동기화해야 하고,
 * 값 유무로만 판정하면 「입력하다 지웠을 때 접히는」 문제가 생긴다.
 */
export function SaleSplitCompareBasisCard({ asset, onChange }: Props) {
  const [open, setOpen] = useState(
    () => !!(asset.landAppraisalAtTransfer || asset.buildingAppraisalAtTransfer || asset.appraisalDateAtTransfer),
  );
  return (
    <div data-testid="sale-compare-basis-toggle">
      <ToggleCard
        tone="emerald"
        checked={open}
        onCheckedChange={(v) => {
          setOpen(v);
          if (!v) {
            onChange({
              landAppraisalAtTransfer: "",
              buildingAppraisalAtTransfer: "",
              appraisalDateAtTransfer: "",
            });
          }
        }}
        title="30% 판정 비교 기준으로 감정평가가액 사용"
        description="비워두면 양도시 기준시가로 비교합니다 (소득세법 §100③ · 시행령 §166⑥)"
      >
        <SaleAppraisalFields asset={asset} onChange={onChange} />
      </ToggleCard>
    </div>
  );
}

/**
 * 감정평가가액 입력 **본문만** — 토글 껍데기 없이 재사용한다 (2026-08-07).
 *
 * 두 자리에서 쓰인다:
 *   · 안분 방식 라디오의 `"appraisal"` 선택 시 — **안분 basis**(부가령 §64①1호)
 *   · `"actual"`(구분양도) 하위 — 「소득세법」 §100③ **30% 판정의 비교 대상**
 *
 * 같은 필드를 두 위치에서 read/write 하는 기존 패턴이다(components/calc/CLAUDE.md
 * 「같은 의미 폼 필드의 양방향 read/write 통합」) — 별도 필드를 신설하지 않는다.
 */
export function SaleAppraisalFields({ asset, onChange }: Props) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FieldCard label="토지 감정평가가액">
          <CurrencyInput
            label=""
            value={asset.landAppraisalAtTransfer}
            onChange={(v) => onChange({ landAppraisalAtTransfer: v })}
            data-testid="sale-appraisal-land"
          />
        </FieldCard>
        <FieldCard label="건물 감정평가가액">
          <CurrencyInput
            label=""
            value={asset.buildingAppraisalAtTransfer}
            onChange={(v) => onChange({ buildingAppraisalAtTransfer: v })}
            data-testid="sale-appraisal-building"
          />
        </FieldCard>
      </div>
      <FieldCard label="감정일자" hint="선택 입력 — 기록·신고서 참고용이며 안분 계산에는 쓰지 않습니다">
        <DateInput
          value={asset.appraisalDateAtTransfer}
          onChange={(v) => onChange({ appraisalDateAtTransfer: v })}
          data-testid="sale-appraisal-date"
        />
      </FieldCard>
      <p className="text-caption leading-snug text-muted-foreground">
        토지·건물 <strong>양쪽 모두</strong> 입력해야 안분 기준이 됩니다.
      </p>
      {/*
        🔴 시기 요건은 **프로그램이 판정하지 않는다**(Q-9 확정 — 계획서 §21). 부가령 §64①1호
           괄호의 기간 제한을 양도소득세에 적용하는 근거가 확정되지 않아, 엔진이 대신 판단하는
           대신 사실을 알리고 사용자 판단에 맡긴다.
      */}
      <p className="text-caption leading-snug text-amber-800">
        「부가가치세법 시행령」 제64조 제1항 제1호 괄호는 감정평가 시기에 제한을 두고 있습니다
        (공급시기가 속하는 과세기간의 <strong>직전 과세기간 개시일 ~ 종료일</strong>).
        이 프로그램은 그 요건을 <strong>검증하지 않으므로</strong> 충족 여부는 직접 확인하세요.
      </p>
    </div>
  );
}

/*
 * 🗑 `SaleAppraisalBasisCard`(토글형 「감정평가가액으로 안분」)는 **삭제했다** (2026-08-08).
 *
 * 그 카드가 라벨-동작 모순의 원인이었다 — 라디오에서 「기준시가 안분」을 골라도 토글을 켜면
 * 부가령 §64① 서열상 감정평가액이 이겨 실제로는 감정평가로 안분됐다. 감정평가는 **안분 방식의
 * 한 선택지**이므로 `SALE_SPLIT_MODE_OPTIONS`의 `"appraisal"`로 흡수했고, 일반건물·주택 두 경로
 * 모두 그것을 쓴다. 구분양도에서의 30% 비교 기준은 `SaleSplitCompareBasisCard`가 이어받았다.
 */

const EXEMPTION_OPTIONS: RadioCardOption<"other_law" | "demolished_land_only">[] = [
  { value: "other_law", label: "다른 법령에 구분 기준이 있는 경우" },
  { value: "demolished_land_only", label: "건물을 철거하고 토지만 사용하는 경우" },
];

export function SaleSplitExemptionCard({ asset, onChange }: Props) {
  const on = !!asset.saleSplitExemption;

  return (
    <div data-testid="sale-split-exemption-toggle">
    <ToggleCard
      tone="amber"
      checked={on}
      onCheckedChange={(v) =>
        // 켤 때 1호를 기본 선택한다 — 「켰는데 아무것도 안 고른」 중간 상태를 만들지 않는다.
        onChange(
          v
            ? { saleSplitExemption: "other_law" }
            : { saleSplitExemption: "", saleSplitExemptionNote: "" },
        )
      }
      title="구분 기재 가액을 그대로 인정받는 예외"
      description="선택하면 30% 차이가 나도 구분 기재한 가액을 씁니다 (소득세법 시행령 §166⑧)"
    >
      <div className="space-y-2">
        <RadioCardGroup
          name="saleSplitExemption"
          tone="amber"
          options={EXEMPTION_OPTIONS}
          value={asset.saleSplitExemption as "other_law" | "demolished_land_only"}
          onChange={(v) => onChange({ saleSplitExemption: v })}
        />
        <FieldCard label="근거" hint="신고서에 기재됩니다">
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={asset.saleSplitExemptionNote}
            onChange={(e) => onChange({ saleSplitExemptionNote: e.target.value })}
            placeholder="적용 법령·사실관계를 적으세요"
            data-testid="sale-split-exemption-note"
          />
        </FieldCard>
        {asset.saleSplitExemption === "demolished_land_only" && (
          <p className="text-caption leading-snug text-amber-800">
            건물을 철거하고 토지만 사용하는 경우이므로 <strong>건물 양도가액이 0에 가까운 것이 정상</strong>입니다.
          </p>
        )}
      </div>
    </ToggleCard>
    </div>
  );
}
