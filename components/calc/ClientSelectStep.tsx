"use client";

import { useEffect, useState } from "react";
import { clientRepository } from "@/lib/storage/client-repository";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { ClientForm } from "@/app/profile/ClientForm";
import { ClientSearchInput } from "./ClientSearchInput";
import type { Client } from "@/lib/storage/types";

const PAGE_SIZE = 20;

interface Props {
  onNext: () => void;
}

/**
 * 세무사 모드에서 계산 마법사 진입 시 표시되는 의뢰인 선택 단계.
 *
 * - 검색어 없음: ⭐최근사용 5명 + 전체(가나다순, 20개씩 페이지)
 * - 검색어 있음: 이름·전화·이메일 부분 일치 결과만 표시
 */
export function ClientSelectStep({ onNext }: Props) {
  const { activeClientId, setActiveClientId } = useProfessionalStore();

  const [allClients, setAllClients] = useState<Client[]>([]);
  const [recentClients, setRecentClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const [all, recent] = await Promise.all([
      clientRepository.list(),
      clientRepository.listRecent(5),
    ]);
    setAllClients(all);
    setRecentClients(recent);
  }

  useEffect(() => {
    Promise.all([
      clientRepository.list(),
      clientRepository.listRecent(5),
    ]).then(([all, recent]) => {
      setAllClients(all);
      setRecentClients(recent);
      setLoading(false);
    });
  }, []);

  function handleQueryChange(q: string) {
    setQuery(q);
    setPage(0);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    clientRepository.search(q).then(setSearchResults);
  }

  async function handleAdd(data: Omit<Client, "id" | "userId" | "lastUsedAt" | "createdAt" | "updatedAt">) {
    const created = await clientRepository.create(data);
    setShowAdd(false);
    await reload();
    setActiveClientId(created.id);
  }

  function handleSelect(id: string) {
    setActiveClientId(id);
  }

  const isSearching = query.trim().length > 0;
  const displayList = isSearching ? searchResults : allClients;
  const totalPages = Math.ceil(displayList.length / PAGE_SIZE);
  const paginated = isSearching
    ? displayList          // 검색 결과는 페이지 없이 전체 표시(최대 50)
    : displayList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // 선택된 의뢰인 이름
  const selectedName =
    [...allClients, ...recentClients].find((c) => c.id === activeClientId)?.name ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">의뢰인 선택</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          이번 계산의 납세자(의뢰인)를 선택하거나 새로 등록하세요.
        </p>
      </div>

      {/* 검색창 */}
      <ClientSearchInput
        value={query}
        onChange={handleQueryChange}
        autoFocus
      />

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground animate-pulse">불러오는 중...</p>
      ) : (
        <>
          {/* 검색 결과 */}
          {isSearching ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                검색 결과 {searchResults.length}명
              </p>
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  일치하는 의뢰인이 없습니다.
                </p>
              ) : (
                <ClientList
                  clients={searchResults}
                  selectedId={activeClientId}
                  onSelect={handleSelect}
                />
              )}
            </div>
          ) : (
            <>
              {/* 최근사용 */}
              {recentClients.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">최근 사용</p>
                  <div className="flex flex-wrap gap-2">
                    {recentClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelect(c.id)}
                        className={[
                          "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                          activeClientId === c.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted/40",
                        ].join(" ")}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 전체 목록 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    전체 {allClients.length}명
                    {totalPages > 1 && (
                      <span className="ml-1 text-muted-foreground/70">
                        ({page + 1}/{totalPages} 페이지)
                      </span>
                    )}
                  </p>
                </div>

                {allClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    등록된 의뢰인이 없습니다.
                  </p>
                ) : (
                  <ClientList
                    clients={paginated}
                    selectedId={activeClientId}
                    onSelect={handleSelect}
                  />
                )}

                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    onChange={setPage}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* 새 의뢰인 추가 */}
      {showAdd ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary mb-3">새 의뢰인 등록</p>
          <ClientForm
            onSubmit={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="w-full rounded-xl border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          + 새 의뢰인 등록
        </button>
      )}

      {/* 다음 버튼 */}
      <button
        type="button"
        onClick={onNext}
        disabled={!activeClientId}
        className="w-full rounded-lg bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {activeClientId && selectedName
          ? `${selectedName}으로 계산 시작`
          : "의뢰인을 선택하세요"}
      </button>
    </div>
  );
}

// ── 하위 컴포넌트 ──────────────────────────────────────────

function ClientList({
  clients,
  selectedId,
  onSelect,
}: {
  clients: Client[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="max-h-72 overflow-y-auto space-y-1.5 pr-0.5">
      {clients.map((c) => {
        const selected = selectedId === c.id;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={[
                "w-full rounded-xl border-2 px-4 py-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-muted/40",
              ].join(" ")}
            >
              <p className={`text-sm font-semibold ${selected ? "text-primary" : ""}`}>
                {c.name}
              </p>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {c.birthDate && <span>{c.birthDate}</span>}
                {c.phone && <span>{c.phone}</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  // 최대 5개 페이지 버튼 표시
  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
  const end = Math.min(totalPages, start + 5);
  const pages = Array.from({ length: end - start }, (_, i) => start + i);

  return (
    <div className="flex items-center justify-center gap-1 pt-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-40"
      >
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={[
            "rounded-md px-2.5 py-1 text-xs border transition-colors",
            p === page
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted/60",
          ].join(" ")}
        >
          {p + 1}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}
