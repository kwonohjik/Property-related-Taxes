"use client";

/**
 * 겸용주택 × 부담부증여 — **채무 귀속** 카드 (엔진 D-7).
 *
 * 인수 채무(임대보증금·담보차입금)가 주택 또는 상가 중 어디에 속하는지를 **사실로 선언**받는다.
 * 근거: 국세청 부동산거래관리과-119(2010.01.22.) — 「증여가액 중 채무액에 상당하는 부분이 주택 또는 상가에 대한 부분으로 구분이 분명한 경우에는
 * 그 채무액이 속하는 주택 또는 상가의 양도로 보아 양도차익을 산정」. 소득세법 §88 1호 후단 · 시행령 §159.
 *
 * ## 설계 원칙
 *  · **기본값이 없다** — `""`(미선택)이면 어느 쪽에도 넣지 않는다. 「전부 구분 불분명」을 기본으로 두면 해석례가 답하지 않은 안분(을설)을
 *    사용자가 모르게 고르게 된다(자동 안분 fallback 금지). 선택 지우기 UI는 없고 다른 값으로 바꾸기만 가능하다 → 막다른 길이 없다.
 *  · **총액을 다시 받지 않는다** — `bgLendingDepositTotal`·`bgMortgageDebtAmount`가 정본이다. 비분할 모드는 구조상 합이 총액과 같다.
 *    분할 모드(`split`)의 3칸 합만 총액과 일치해야 한다(「남은 금액」은 표시 파생 — store에 쓰지 않는다).
 *  · 분할 3칸은 `split`일 때만 읽는다 — 모드를 바꿔도 값은 보존되지만 ④는 전송하지 않는다(`mixedBgDebtAttribution`).
 *  · 표시·④·⑧은 같은 leaf(`burdened-gift-mixed-use-scope.ts`)를 본다 — 컴포넌트 안에 합계 산식을 두지 않는다.
 *
 * 설계: docs/02-design/features/transfer-burdened-gift-mixed-use.ui.design.md §5.6
 */
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { BgAttrItem, BgAttrMode } from "@/lib/calc/burdened-gift-mixed-use-scope";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

const MODE_OPTIONS: { value: Exclude<BgAttrMode, "">; label: string }[] = [
  { value: "housing", label: "주택" },
  { value: "commercial", label: "상가" },
  { value: "unallocated", label: "구분 불분명" },
  { value: "split", label: "나누어 입력" },
];

const fmt = (n: number) => n.toLocaleString("ko-KR");

interface RowProps {
  item: BgAttrItem;
  assetId: string;
  total: number;
  mode: BgAttrMode;
  split: { housing: string; commercial: string; unallocated: string };
  onMode: (v: Exclude<BgAttrMode, "">) => void;
  onSplit: (key: "housing" | "commercial" | "unallocated", v: string) => void;
}

/** 항목(임대보증금·담보차입금) 한 줄 — 두 항목이 같은 위젯 한 벌을 쓴다. */
function DebtAttributionRow({ item, assetId, total, mode, split, onMode, onSplit }: RowProps) {
  const isDeposit = item === "deposit";
  const label = isDeposit ? "임대보증금" : "담보차입금";
  const modeField = isDeposit ? "bgDepositAttribution" : "bgMortgageAttribution";
  const splitField = isDeposit ? "bgDepositSplitHousing" : "bgMortgageSplitHousing";
  const splitLabels = isDeposit
    ? ["주택 임차분", "상가 임차분", "임차 대상이 분명하지 않은 금액"]
    : ["주택 담보분", "상가 담보분", "귀속이 분명하지 않은 금액"];
  const splitSum = parseAmount(split.housing) + parseAmount(split.commercial) + parseAmount(split.unallocated);
  const remainder = total - splitSum;
  return (
    <div className="space-y-2" data-testid={`bg-attr-${item}`}>
      <FieldCard
        stacked
        required
        label={`${label} ${fmt(total)}원의 귀속`}
        hint={
          isDeposit
            ? "임차 대상이 주택이면 주택, 상가면 상가입니다. 건물 전체를 일괄 임대하는 등 분명하지 않으면 「구분 불분명」을 선택합니다."
            : "근저당이 건물 전체에 설정되어 대상이 분명하지 않으면 「구분 불분명」을 선택합니다. 대출이 여러 건이라 귀속이 서로 다르면 「나누어 입력」을 선택합니다."
        }
      >
        <RadioCardGroup
          name={`${modeField}-${assetId}`}
          data-field={modeField}
          tone="rose"
          layout="inline"
          value={mode}
          onChange={onMode}
          options={MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </FieldCard>
      {mode === "split" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <FieldCard stacked label={splitLabels[0]} field={splitField}>
            <CurrencyInput label="" hideUnit value={split.housing} onChange={(v) => onSplit("housing", v)} />
          </FieldCard>
          <FieldCard stacked label={splitLabels[1]}>
            <CurrencyInput label="" hideUnit value={split.commercial} onChange={(v) => onSplit("commercial", v)} />
          </FieldCard>
          <FieldCard stacked label={splitLabels[2]}>
            <CurrencyInput label="" hideUnit value={split.unallocated} onChange={(v) => onSplit("unallocated", v)} />
          </FieldCard>
          <p
            data-testid={`bg-attr-remainder-${item}`}
            className={`sm:col-span-3 text-caption ${remainder === 0 ? "text-emerald-700" : "text-rose-700"}`}
          >
            {remainder === 0
              ? "남은 금액 0원 — 총액과 일치합니다"
              : remainder > 0
                ? `남은 금액 ${fmt(remainder)}원 — 아직 배분하지 않았습니다`
                : `${fmt(-remainder)}원 초과 배분했습니다`}
          </p>
        </div>
      )}
    </div>
  );
}

export function BurdenedGiftDebtAttributionCard({ asset, onChange }: Props) {
  // 표시는 총액과 선택값만 읽는다 — 합성값(`mixedBgDebtAttribution`)은 ④·⑧이 쓰는 같은 함수가 만든다.
  const deposit = parseAmount(asset.bgLendingDepositTotal) || 0;
  const mortgage = parseAmount(asset.bgMortgageDebtAmount) || 0;
  const assetId = asset.assetId ?? "primary";
  return (
    <ToneCard tone="rose" title="채무 귀속 — 주택 / 상가" bodyClassName="space-y-3">
      <div data-testid="bg-attr-card" className="space-y-3">
        <p className="text-caption text-rose-800">
          인수 채무가 주택 또는 상가에 속하는 것이 분명하면 <b>그 부분의 양도</b>로 봅니다(국세청 부동산거래관리과-119, 2010.1.22.).
          분명하지 않은 채무는 주택·상가 증여가액 비율로 나눕니다 — 이 안분은 해석례가 직접 답하지 않아 <b>확인이 필요</b>합니다.
        </p>
        <p className="text-caption text-rose-700">
          귀속은 임대차계약서의 임차 대상, 근저당 설정 대상 같은 증빙이 필요한 사실 선언입니다.
        </p>
        {deposit <= 0 && mortgage <= 0 ? (
          <p className="text-caption text-rose-700">인수 채무(임대보증금·담보차입금)를 먼저 입력하세요.</p>
        ) : null}
        {deposit > 0 && (
          <DebtAttributionRow
            item="deposit"
            assetId={assetId}
            total={deposit}
            mode={asset.bgDepositAttribution}
            split={{ housing: asset.bgDepositSplitHousing, commercial: asset.bgDepositSplitCommercial, unallocated: asset.bgDepositSplitUnallocated }}
            onMode={(v) => onChange({ bgDepositAttribution: v })}
            onSplit={(k, v) =>
              onChange(
                k === "housing" ? { bgDepositSplitHousing: v } : k === "commercial" ? { bgDepositSplitCommercial: v } : { bgDepositSplitUnallocated: v },
              )
            }
          />
        )}
        {mortgage > 0 && (
          <DebtAttributionRow
            item="mortgage"
            assetId={assetId}
            total={mortgage}
            mode={asset.bgMortgageAttribution}
            split={{ housing: asset.bgMortgageSplitHousing, commercial: asset.bgMortgageSplitCommercial, unallocated: asset.bgMortgageSplitUnallocated }}
            onMode={(v) => onChange({ bgMortgageAttribution: v })}
            onSplit={(k, v) =>
              onChange(
                k === "housing" ? { bgMortgageSplitHousing: v } : k === "commercial" ? { bgMortgageSplitCommercial: v } : { bgMortgageSplitUnallocated: v },
              )
            }
          />
        )}
      </div>
    </ToneCard>
  );
}
