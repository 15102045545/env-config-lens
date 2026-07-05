import { Activity, ChevronDown, ChevronUp, Columns3, Copy, Database, Eye, FilePlus2, FolderOpen, RefreshCw, ScanLine, Settings2, ShieldCheck, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { comparisonStatusLabels, healthIssueLabels, sourceErrorLabels, sourceTypeLabels } from "../shared/displayText";
import type { ComparisonStatus, EnvComparisonResult, EnvComparisonRow, EnvHealthResult, EnvSource, EnvSourceContentResult, HealthIssueType, SourceErrorType, SourceReadStatus, SshRemoteFileConfig } from "../shared/types";
import { ApiClient, type RuntimeBoundary, readStartupToken } from "./api";

type View = "comparison" | "health" | "settings";
type StatusFilter = "problem" | ComparisonStatus | "all";
type SourceFormType = "local-file" | "ssh-standard" | "ssh-alias" | "uploaded-file";

interface SourceFormState {
  sourceType: SourceFormType;
  name: string;
  filePath: string;
  note: string;
  enabled: boolean;
  host: string;
  port: string;
  username: string;
  privateKeyPath: string;
  sshAlias: string;
  remoteEnvPath: string;
  keychainService: string;
  keychainAccount: string;
  uploadedFile: File | null;
}

const problemStatuses = new Set<ComparisonStatus>(["different", "missing", "empty", "source-only"]);
const statusFilters: StatusFilter[] = ["problem", "different", "missing", "empty", "source-only", "same", "all"];
const statusFilterLabels = {
  problem: "问题项",
  all: "全部"
} satisfies Record<Exclude<StatusFilter, ComparisonStatus>, string>;

const emptySourceForm: SourceFormState = {
  sourceType: "local-file",
  name: "",
  filePath: "",
  note: "",
  enabled: true,
  host: "",
  port: "22",
  username: "",
  privateKeyPath: "",
  sshAlias: "",
  remoteEnvPath: "",
  keychainService: "",
  keychainAccount: "",
  uploadedFile: null
};

export function App() {
  const [token] = useState(readStartupToken);
  const api = useMemo(() => new ApiClient(token), [token]);
  const [view, setView] = useState<View>("comparison");
  const [runtime, setRuntime] = useState<RuntimeBoundary | null>(null);
  const [sources, setSources] = useState<EnvSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<EnvComparisonResult | null>(null);
  const [health, setHealth] = useState<EnvHealthResult | null>(null);
  const [healthSourceId, setHealthSourceId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("problem");
  const [compareSearch, setCompareSearch] = useState("");
  const [healthSearch, setHealthSearch] = useState("");
  const [activeIssueTypes, setActiveIssueTypes] = useState<Set<HealthIssueType>>(new Set(Object.keys(healthIssueLabels) as HealthIssueType[]));
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [form, setForm] = useState<SourceFormState>(emptySourceForm);
  const [error, setError] = useState("");
  const [sourceContentSource, setSourceContentSource] = useState<EnvSource | null>(null);
  const [sourceContent, setSourceContent] = useState<EnvSourceContentResult | null>(null);
  const [sourceContentLoading, setSourceContentLoading] = useState(false);

  const enabledSources = useMemo(() => sources.filter((source) => source.enabled), [sources]);

  const refreshSources = useCallback(async () => {
    const nextSources = await api.listSources();
    setSources(nextSources);
    const enabledIds = nextSources.filter((source) => source.enabled).map((source) => source.id);
    setSelectedSourceIds((current) => current.filter((id) => enabledIds.includes(id)));
    if (!healthSourceId && enabledIds[0]) {
      setHealthSourceId(enabledIds[0]);
    }
    return nextSources;
  }, [api, healthSourceId]);

  const runCompare = useCallback(async (sourceIds: string[]) => {
    if (sourceIds.length === 0) {
      setComparison(null);
      return;
    }
    setComparison(await api.compare(sourceIds));
  }, [api]);

  const runHealth = useCallback(async (sourceId: string) => {
    if (!sourceId) {
      setHealth(null);
      return;
    }
    setHealth(await api.health(sourceId));
  }, [api]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [boundary, nextSources] = await Promise.all([api.getRuntimeBoundary(), api.listSources()]);
        if (!active) {
          return;
        }
        setRuntime(boundary);
        setSources(nextSources);
        const enabledIds = nextSources.filter((source) => source.enabled).map((source) => source.id);
        setSelectedSourceIds(enabledIds);
        if (enabledIds.length > 0) {
          setHealthSourceId(enabledIds[0]);
          await Promise.all([runCompare(enabledIds), runHealth(enabledIds[0])]);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "无法加载 Env Config Lens。");
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [api, runCompare, runHealth]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedSources = selectedSourceIds
    .map((sourceId) => sources.find((source) => source.id === sourceId))
    .filter((source): source is EnvSource => Boolean(source));

  const filteredRows = useMemo(() => {
    const query = compareSearch.trim().toLowerCase();
    return (comparison?.rows ?? []).filter((row) => {
      const statusMatch =
        statusFilter === "all" ||
        row.status === statusFilter ||
        (statusFilter === "problem" && problemStatuses.has(row.status));
      const text = [row.key, ...Object.values(row.valuesBySourceId)].join(" ").toLowerCase();
      return statusMatch && (!query || text.includes(query));
    });
  }, [comparison, compareSearch, statusFilter]);

  const filteredHealthEntries = useMemo(() => {
    const query = healthSearch.trim().toLowerCase();
    return Object.entries(health?.values ?? {}).filter(([key, value]) => {
      return !query || `${key} ${value}`.toLowerCase().includes(query);
    });
  }, [health, healthSearch]);

  const filteredIssues = useMemo(() => {
    return (health?.issues ?? []).filter((issue) => activeIssueTypes.has(issue.type));
  }, [health, activeIssueTypes]);

  async function reloadAll() {
    try {
      setError("");
      const nextSources = await refreshSources();
      const enabledIds = nextSources.filter((source) => source.enabled).map((source) => source.id);
      const compareIds = selectedSourceIds.length > 0 ? selectedSourceIds : enabledIds;
      await runCompare(compareIds);
      if (healthSourceId || enabledIds[0]) {
        await runHealth(healthSourceId || enabledIds[0]);
      }
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "刷新失败。");
    }
  }

  async function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created =
        form.sourceType === "local-file"
          ? await api.createLocalSource({
              name: form.name,
              filePath: form.filePath,
              note: form.note,
              enabled: form.enabled
            })
          : form.sourceType === "uploaded-file"
            ? await createUploadedSource(api, form)
            : await api.createSshSource({
                name: form.name,
                note: form.note,
                enabled: form.enabled,
                sshRemoteFile: buildSshRemoteFileConfig(form)
              });
      setForm({ ...emptySourceForm, sourceType: form.sourceType });
      const nextSources = await refreshSources();
      const nextSelected = [...selectedSourceIds, created.id];
      setSelectedSourceIds(nextSelected);
      await runCompare(nextSelected);
      if (!healthSourceId) {
        setHealthSourceId(created.id);
        await runHealth(created.id);
      }
      setToast(`已添加 ${created.name}`);
      setSources(nextSources);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "无法添加来源。");
    }
  }

  async function copyText(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    setToast(message);
  }

  function toggleExpanded(id: string) {
    setExpandedValues((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function toggleSource(source: EnvSource) {
    await api.updateSource(source.id, { enabled: !source.enabled });
    await reloadAll();
  }

  async function deleteSource(sourceId: string) {
    try {
      setError("");
      await api.deleteSource(sourceId);
      const nextSources = await api.listSources();
      const enabledIds = nextSources.filter((source) => source.enabled).map((source) => source.id);
      const nextSelectedIds = selectedSourceIds.filter((id) => id !== sourceId && enabledIds.includes(id));
      const nextHealthSourceId =
        healthSourceId && healthSourceId !== sourceId && enabledIds.includes(healthSourceId)
          ? healthSourceId
          : nextSelectedIds[0] ?? enabledIds[0] ?? "";

      setSources(nextSources);
      setSelectedSourceIds(nextSelectedIds);
      setHealthSourceId(nextHealthSourceId);
      await runCompare(nextSelectedIds);
      if (nextHealthSourceId) {
        await runHealth(nextHealthSourceId);
      } else {
        setHealth(null);
      }
      setToast("来源已删除");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "无法删除来源。");
    }
  }

  async function moveSource(sourceId: string, direction: -1 | 1) {
    const ordered = [...sources].sort((left, right) => left.displayOrder - right.displayOrder);
    const index = ordered.findIndex((source) => source.id === sourceId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const nextSources = await api.reorderSources(ordered.map((source) => source.id));
    setSources(nextSources);
    await runCompare(selectedSourceIds);
  }

  async function viewSourceContent(source: EnvSource) {
    setSourceContentSource(source);
    setSourceContent(null);
    setSourceContentLoading(true);
    try {
      setSourceContent(await api.readSourceContent(source.id));
    } catch (contentError) {
      setSourceContent({
        sourceId: source.id,
        sourceName: source.name,
        status: "failed",
        errorType: "unknown_error",
        errorMessage: contentError instanceof Error ? contentError.message : "来源读取失败。"
      });
    } finally {
      setSourceContentLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#eef3f8] text-[#182230] lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-4 py-4 lg:px-5 lg:py-6">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#182230] text-white">
            <ScanLine className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Env Config Lens</h1>
            <p className="truncate text-xs text-slate-500">本地 .env 对比控制台</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-2 lg:overflow-visible lg:px-5">
          <NavButton active={view === "comparison"} icon={<Columns3 className="h-4 w-4" />} label="对比" onClick={() => setView("comparison")} />
          <NavButton active={view === "health"} icon={<Activity className="h-4 w-4" />} label="健康" onClick={() => setView("health")} />
          <NavButton active={view === "settings"} icon={<Settings2 className="h-4 w-4" />} label="设置" onClick={() => setView("settings")} />
        </nav>

        <div className="hidden px-5 py-4 lg:block">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              运行边界
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <BoundaryItem label="绑定地址" value={runtime?.bindHost ?? "0.0.0.0"} />
              <BoundaryItem label="访问范围" value={labelAccessScope(runtime?.accessScope)} accent={runtime?.accessScope === "lan" ? "ok" : undefined} />
              <BoundaryItem label="会话令牌" value={runtime?.tokenRequired ? "Token 必需" : "未启用"} accent="ok" />
              <BoundaryItem label="存储范围" value={labelPersistedState(runtime?.persistedState)} />
            </dl>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">M2 SSH 远程来源</p>
              <h2 className="text-xl font-semibold">{titleFor(view)}</h2>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-2 xl:flex">
              <BoundaryPill icon={<ShieldCheck className="h-3.5 w-3.5" />} tone="blue" label={labelAccessScope(runtime?.accessScope)} />
              <BoundaryPill icon={<ShieldCheck className="h-3.5 w-3.5" />} tone="amber" label="Token 必需" />
              <BoundaryPill icon={<Database className="h-3.5 w-3.5" />} tone="emerald" label="SQLite 存储设置" />
              <BoundaryPill icon={<Copy className="h-3.5 w-3.5" />} tone="red" label="不提供完整 .env 导出" />
            </div>
          </div>
        </header>

        {error && <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 lg:mx-6">{error}</div>}

        {view === "comparison" && (
          <ComparisonView
            comparison={comparison}
            sources={selectedSources}
            allSources={enabledSources}
            selectedSourceIds={selectedSourceIds}
            filteredRows={filteredRows}
            statusFilter={statusFilter}
            compareSearch={compareSearch}
            expandedValues={expandedValues}
            setCompareSearch={setCompareSearch}
            setStatusFilter={setStatusFilter}
            setSelectedSourceIds={async (ids) => {
              setSelectedSourceIds(ids);
              await runCompare(ids);
            }}
            runCompare={() => runCompare(selectedSourceIds)}
            copyText={copyText}
            toggleExpanded={toggleExpanded}
          />
        )}

        {view === "health" && (
          <HealthView
            sources={enabledSources}
            health={health}
            healthSourceId={healthSourceId}
            setHealthSourceId={async (sourceId) => {
              setHealthSourceId(sourceId);
              await runHealth(sourceId);
            }}
            healthSearch={healthSearch}
            setHealthSearch={setHealthSearch}
            activeIssueTypes={activeIssueTypes}
            setActiveIssueTypes={setActiveIssueTypes}
            filteredHealthEntries={filteredHealthEntries}
            filteredIssues={filteredIssues}
            expandedValues={expandedValues}
            copyText={copyText}
            toggleExpanded={toggleExpanded}
            runHealth={() => runHealth(healthSourceId)}
          />
        )}

        {view === "settings" && (
          <SettingsView
            sources={sources}
            form={form}
            setForm={setForm}
            submitSource={submitSource}
            pickEnvPath={async () => {
              const result = await api.pickEnvPath();
              if (!result.canceled && result.filePath) {
                setForm((current) => ({ ...current, filePath: result.filePath ?? "" }));
              }
            }}
            pickPrivateKeyPath={async () => {
              const result = await api.pickPrivateKeyPath();
              if (!result.canceled && result.filePath) {
                setForm((current) => ({ ...current, privateKeyPath: result.filePath ?? "" }));
              }
            }}
            testSource={async (sourceId) => {
              const result = await api.testSource(sourceId);
              setToast(result.status === "success" ? `来源可读取：${result.keyCount} 个键` : `安全失败：${sourceErrorLabel(result.errorType)}`);
            }}
            toggleSource={toggleSource}
            moveSource={moveSource}
            viewSourceContent={viewSourceContent}
            deleteSource={async (sourceId) => {
              await deleteSource(sourceId);
            }}
          />
        )}
      </main>

      {sourceContentSource && (
        <EnvContentModal
          source={sourceContentSource}
          result={sourceContent}
          loading={sourceContentLoading}
          onClose={() => {
            setSourceContentSource(null);
            setSourceContent(null);
            setSourceContentLoading(false);
          }}
        />
      )}

      <div className={`fixed bottom-4 left-4 right-4 z-50 rounded-md border border-slate-800 bg-[#182230] px-4 py-3 text-sm font-medium text-white shadow-lg transition sm:left-auto sm:w-80 ${toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}>
        {toast || "已复制"}
      </div>
    </div>
  );
}

function ComparisonView(props: {
  comparison: EnvComparisonResult | null;
  sources: EnvSource[];
  allSources: EnvSource[];
  selectedSourceIds: string[];
  filteredRows: EnvComparisonRow[];
  statusFilter: StatusFilter;
  compareSearch: string;
  expandedValues: Set<string>;
  setCompareSearch: (value: string) => void;
  setStatusFilter: (value: StatusFilter) => void;
  setSelectedSourceIds: (value: string[]) => void | Promise<void>;
  runCompare: () => void | Promise<void>;
  copyText: (value: string, message: string) => Promise<void>;
  toggleExpanded: (value: string) => void;
}) {
  const summary = props.comparison?.summary;
  const failedSourceResults = (props.comparison?.sourceResults ?? []).filter((result) => result.status === "failed");
  return (
    <section className="px-4 py-5 lg:px-6">
      <div className="space-y-4">
        <Panel>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">对比运行</h3>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{summary?.successfulSourceCount ?? 0} 个成功</span>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">{summary?.failedSourceCount ?? 0} 个失败</span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">所选来源会按需读取。读取失败或解析失败的来源只在来源级展示，不参与行状态分类。</p>
            </div>
            <button onClick={props.runCompare} className="inline-flex items-center gap-2 rounded-md bg-[#182230] px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
              <RefreshCw className="h-4 w-4" />
              运行对比
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <SummaryCard label="来源" value={summary?.sourceCount ?? 0} />
            <SummaryCard label="合并键" value={summary?.unionKeyCount ?? 0} />
            <SummaryCard label="一致" value={summary?.sameCount ?? 0} tone="emerald" />
            <SummaryCard label="不一致" value={summary?.differentCount ?? 0} tone="blue" />
            <SummaryCard label="缺失" value={summary?.missingCount ?? 0} tone="amber" />
            <SummaryCard label="空值" value={summary?.emptyCount ?? 0} tone="red" />
            <SummaryCard label="仅此来源" value={summary?.sourceOnlyCount ?? 0} tone="purple" />
          </div>
          {failedSourceResults.length > 0 && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
              <h4 className="text-sm font-semibold text-red-900">来源读取失败</h4>
              <div className="mt-2 space-y-2">
                {failedSourceResults.map((result) => (
                  <div key={result.sourceId} className="grid gap-2 text-sm text-red-900 lg:grid-cols-[180px_140px_minmax(0,1fr)]">
                    <span className="font-semibold">{result.sourceName}</span>
                    <span className="text-xs font-semibold">{sourceErrorLabel(result.errorType)}</span>
                    <span>{result.errorMessage ?? "来源读取失败。"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto] xl:items-center">
            <label className="block">
              <span className="sr-only">搜索 key 或值</span>
              <input className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={props.compareSearch} onChange={(event) => props.setCompareSearch(event.target.value)} placeholder="搜索 key 或值" />
            </label>
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((filter) => (
                <button key={filter} className={chipClass(props.statusFilter === filter)} onClick={() => props.setStatusFilter(filter)}>
                  {labelStatus(filter)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {props.allSources.map((source) => {
              const active = props.selectedSourceIds.includes(source.id);
              return (
                <button
                  key={source.id}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}
                  onClick={() => {
                    const ids = active ? props.selectedSourceIds.filter((id) => id !== source.id) : [...props.selectedSourceIds, source.id];
                    void props.setSelectedSourceIds(ids);
                  }}
                >
                  {source.name}
                </button>
              );
            })}
          </div>
        </Panel>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[920px] border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 w-56 border-b border-slate-200 bg-slate-50 px-4 py-3 font-semibold">键名</th>
                  <th className="w-32 border-b border-slate-200 px-3 py-3 font-semibold">状态</th>
                  {props.sources.map((source) => (
                    <th key={source.id} className="w-64 border-b border-slate-200 px-3 py-3 font-semibold">{source.name}</th>
                  ))}
                  <th className="w-24 border-b border-slate-200 px-3 py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {props.filteredRows.map((row) => (
                  <ComparisonRowView key={row.key} row={row} sources={props.sources} expandedValues={props.expandedValues} copyText={props.copyText} toggleExpanded={props.toggleExpanded} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>正在显示 {props.filteredRows.length} 行。大规模 key 集保留横向滚动矩阵。</span>
            <span>不提供完整 .env 导出。</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComparisonRowView(props: {
  row: EnvComparisonRow;
  sources: EnvSource[];
  expandedValues: Set<string>;
  copyText: (value: string, message: string) => Promise<void>;
  toggleExpanded: (value: string) => void;
}) {
  const rowCopy = props.sources
    .map((source) => `${source.name}: ${props.row.presenceBySourceId[source.id] ? props.row.valuesBySourceId[source.id] : "<缺失>"}`)
    .join("\n");
  return (
    <tr className="align-top">
      <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-4 py-3 font-mono text-xs font-semibold text-[#182230]">{props.row.key}</th>
      <td className="border-b border-slate-200 px-3 py-3"><StatusBadge status={props.row.status} /></td>
      {props.sources.map((source) => {
        const value = props.row.valuesBySourceId[source.id];
        const present = props.row.presenceBySourceId[source.id];
        const valueId = `${props.row.key}-${source.id}`;
        const expanded = props.expandedValues.has(valueId);
        return (
          <td key={source.id} className="border-b border-slate-200 px-3 py-3">
            {present ? (
              <ValueBlock
                testId={`value-${valueId}`}
                label={`${source.name} 的 ${props.row.key}`}
                value={value}
                expanded={expanded}
                onToggle={() => props.toggleExpanded(valueId)}
                onCopy={() => props.copyText(value, "单个值已复制")}
              />
            ) : (
              <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">缺失</span>
            )}
          </td>
        );
      })}
      <td className="border-b border-slate-200 px-3 py-3">
        <button className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label={`复制 ${props.row.key} 行对比`} onClick={() => props.copyText(`${props.row.key}\n${rowCopy}`, "单键对比已复制")}>
          <Copy className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function HealthView(props: {
  sources: EnvSource[];
  health: EnvHealthResult | null;
  healthSourceId: string;
  setHealthSourceId: (sourceId: string) => void | Promise<void>;
  healthSearch: string;
  setHealthSearch: (value: string) => void;
  activeIssueTypes: Set<HealthIssueType>;
  setActiveIssueTypes: (value: Set<HealthIssueType>) => void;
  filteredHealthEntries: [string, string][];
  filteredIssues: EnvHealthResult["issues"];
  expandedValues: Set<string>;
  copyText: (value: string, message: string) => Promise<void>;
  toggleExpanded: (value: string) => void;
  runHealth: () => void | Promise<void>;
}) {
  return (
    <section className="px-4 py-5 lg:px-6">
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Panel>
            <label className="text-sm font-semibold" htmlFor="health-source">来源</label>
            <select id="health-source" className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={props.healthSourceId} onChange={(event) => void props.setHealthSourceId(event.target.value)}>
              {props.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
            <button onClick={props.runHealth} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#182230] px-3 py-2 text-sm font-medium text-white">
              <RefreshCw className="h-4 w-4" />
              读取来源
            </button>
          </Panel>

          <Panel>
            <h3 className="text-sm font-semibold">问题汇总</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(healthIssueLabels) as HealthIssueType[]).map((type) => (
                <button
                  key={type}
                  className={props.activeIssueTypes.has(type) ? "rounded-md border border-blue-600 bg-blue-50 p-3 text-left" : "rounded-md border border-slate-200 bg-white p-3 text-left"}
                  onClick={() => {
                    const next = new Set(props.activeIssueTypes);
                    if (next.has(type)) {
                      next.delete(type);
                    } else {
                      next.add(type);
                    }
                    props.setActiveIssueTypes(next);
                  }}
                >
                  <span className="block text-lg font-semibold">{props.health?.summary[type] ?? 0}</span>
                  <span className="text-xs text-slate-500">{healthIssueLabels[type]}</span>
                </button>
              ))}
            </div>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-semibold">{props.health?.sourceName ?? "来源"} 健康</h3>
                <p className="mt-1 text-sm text-slate-600">完整值显示在键值行中。错误会摘要展示，不倾倒完整来源内容。</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <MiniStat label="键" value={props.health?.keyCount ?? 0} />
                <MiniStat label="问题" value={props.health?.issues.length ?? 0} tone="red" />
                <MiniStat label="读取" value={labelReadStatus(props.health?.status)} tone={props.health?.status === "failed" ? "red" : "emerald"} />
              </div>
            </div>
          </Panel>

          <Panel>
            <input className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={props.healthSearch} onChange={(event) => props.setHealthSearch(event.target.value)} placeholder="在此来源中搜索 key 或值" />
          </Panel>

          {props.health?.status === "failed" && props.health.errorMessage && (
            <Panel>
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">来源读取失败</h3>
                  <span className="text-xs font-semibold">{sourceErrorLabel(props.health.errorType)}</span>
                </div>
                <p className="mt-2">{props.health.errorMessage}</p>
              </div>
            </Panel>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-semibold">键值事实</h3></div>
              <div className="overflow-x-auto">
                <table className="min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="w-56 border-b border-slate-200 px-4 py-3">键名</th><th className="border-b border-slate-200 px-3 py-3">值</th><th className="w-24 border-b border-slate-200 px-3 py-3">操作</th></tr>
                  </thead>
                  <tbody>
                    {props.filteredHealthEntries.map(([key, value]) => {
                      const id = `health-${key}`;
                      return (
                        <tr key={key}>
                          <th className="border-b border-slate-200 px-4 py-3 font-mono text-xs">{key}</th>
                          <td className="border-b border-slate-200 px-3 py-3">
                            <ValueBlock label={key} value={value} expanded={props.expandedValues.has(id)} onToggle={() => props.toggleExpanded(id)} onCopy={() => props.copyText(value, "单个值已复制")} />
                          </td>
                          <td className="border-b border-slate-200 px-3 py-3">
                            <button className="rounded-md border border-slate-200 p-2 text-slate-600" aria-label={`复制 ${key}`} onClick={() => props.copyText(value, "单个值已复制")}><Copy className="h-4 w-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-semibold">问题详情</h3></div>
              <div className="divide-y divide-slate-200">
                {props.filteredIssues.map((issue, index) => (
                  <div key={`${issue.type}-${issue.key ?? index}`} className="p-4">
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{healthIssueLabels[issue.type]}</span>
                    {issue.key && <p className="mt-2 font-mono text-xs font-semibold">{issue.key}</p>}
                    <p className="mt-2 text-xs text-slate-600">{issue.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsView(props: {
  sources: EnvSource[];
  form: SourceFormState;
  setForm: (form: SourceFormState | ((current: SourceFormState) => SourceFormState)) => void;
  submitSource: (event: FormEvent<HTMLFormElement>) => void;
  pickEnvPath: () => void | Promise<void>;
  pickPrivateKeyPath: () => void | Promise<void>;
  testSource: (sourceId: string) => void | Promise<void>;
  toggleSource: (source: EnvSource) => void | Promise<void>;
  moveSource: (sourceId: string, direction: -1 | 1) => void | Promise<void>;
  viewSourceContent: (source: EnvSource) => void | Promise<void>;
  deleteSource: (sourceId: string) => void | Promise<void>;
}) {
  return (
    <section className="px-4 py-5 lg:px-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <h3 className="text-base font-semibold">.env 来源</h3>
            <p className="mt-1 text-sm text-slate-600">来源设置会保存在本地。.env 内容、解析映射、对比结果和读取输出不会持久化。</p>
          </Panel>
          <Panel>
            <form className="space-y-4" onSubmit={props.submitSource}>
              <div className="flex flex-wrap gap-2">
                {[
                  ["local-file", "本地文件"],
                  ["ssh-standard", "SSH 标准"],
                  ["ssh-alias", "SSH 别名"],
                  ["uploaded-file", "上传文件"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={chipClass(props.form.sourceType === value)}
                    onClick={() => props.setForm((current) => ({ ...current, sourceType: value as SourceFormType }))}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(160px,220px)_minmax(0,1fr)]">
                <TextField label="来源名称" value={props.form.name} onChange={(name) => props.setForm((current) => ({ ...current, name }))} required />
                <TextField label="备注" value={props.form.note} onChange={(note) => props.setForm((current) => ({ ...current, note }))} />
              </div>

              {props.form.sourceType === "local-file" && (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <TextField label="本地 .env 路径" mono value={props.form.filePath} onChange={(filePath) => props.setForm((current) => ({ ...current, filePath }))} required placeholder="/path/to/.env" />
                  <div className="flex items-end">
                    <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium" onClick={props.pickEnvPath}><FolderOpen className="h-4 w-4" /> 选择</button>
                  </div>
                </div>
              )}

              {props.form.sourceType === "uploaded-file" && (
                <UploadedFilePicker
                  file={props.form.uploadedFile}
                  onFileChange={(uploadedFile) => props.setForm((current) => ({ ...current, uploadedFile }))}
                />
              )}

              {props.form.sourceType === "ssh-standard" && (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)]">
                    <TextField label="SSH 主机" value={props.form.host} onChange={(host) => props.setForm((current) => ({ ...current, host }))} required placeholder="example.com" />
                    <TextField label="端口" value={props.form.port} onChange={(port) => props.setForm((current) => ({ ...current, port }))} required inputMode="numeric" />
                    <TextField label="用户名" value={props.form.username} onChange={(username) => props.setForm((current) => ({ ...current, username }))} required placeholder="deploy" />
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <TextField label="私钥路径" mono value={props.form.privateKeyPath} onChange={(privateKeyPath) => props.setForm((current) => ({ ...current, privateKeyPath }))} required placeholder="/Users/name/.ssh/id_ed25519" />
                    <div className="flex items-end">
                      <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium" onClick={props.pickPrivateKeyPath}><FolderOpen className="h-4 w-4" /> 选择密钥</button>
                    </div>
                  </div>
                  <TextField label="远程 .env 路径" mono value={props.form.remoteEnvPath} onChange={(remoteEnvPath) => props.setForm((current) => ({ ...current, remoteEnvPath }))} required placeholder="/srv/app/.env" />
                </div>
              )}

              {props.form.sourceType === "ssh-alias" && (
                <div className="grid gap-3 lg:grid-cols-[minmax(160px,240px)_minmax(0,1fr)]">
                  <TextField label="SSH 别名" value={props.form.sshAlias} onChange={(sshAlias) => props.setForm((current) => ({ ...current, sshAlias }))} required placeholder="prod-api" />
                  <TextField label="远程 .env 路径" mono value={props.form.remoteEnvPath} onChange={(remoteEnvPath) => props.setForm((current) => ({ ...current, remoteEnvPath }))} required placeholder="/srv/app/.env" />
                </div>
              )}

              {(props.form.sourceType === "ssh-standard" || props.form.sourceType === "ssh-alias") && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <TextField label="Keychain 服务" value={props.form.keychainService} onChange={(keychainService) => props.setForm((current) => ({ ...current, keychainService }))} />
                  <TextField label="Keychain 账户" value={props.form.keychainAccount} onChange={(keychainAccount) => props.setForm((current) => ({ ...current, keychainAccount }))} />
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={props.form.enabled} onChange={(event) => props.setForm((current) => ({ ...current, enabled: event.target.checked }))} />
                  启用
                </label>
                <button className="inline-flex items-center justify-center gap-2 rounded-md bg-[#182230] px-3 py-2 text-sm font-medium text-white"><FilePlus2 className="h-4 w-4" /> {submitLabelFor(props.form.sourceType)}</button>
              </div>
            </form>
          </Panel>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-[940px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="w-24 border-b border-slate-200 px-4 py-3">顺序</th><th className="w-52 border-b border-slate-200 px-3 py-3">来源</th><th className="border-b border-slate-200 px-3 py-3">读取目标</th><th className="w-28 border-b border-slate-200 px-3 py-3">状态</th><th className="w-20 border-b border-slate-200 px-3 py-3">查看</th><th className="w-44 border-b border-slate-200 px-3 py-3">测试</th><th className="w-24 border-b border-slate-200 px-3 py-3">删除</th></tr>
                </thead>
                <tbody>
                  {props.sources.map((source) => (
                    <tr key={source.id}>
                      <td className="border-b border-slate-200 px-4 py-3">
                        <div className="flex gap-1">
                          <button className="rounded border border-slate-200 p-1" aria-label={`上移 ${source.name}`} onClick={() => props.moveSource(source.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
                          <button className="rounded border border-slate-200 p-1" aria-label={`下移 ${source.name}`} onClick={() => props.moveSource(source.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3"><p className="font-semibold">{source.name}</p><p className="text-xs text-slate-500">{sourceTypeLabels[source.type]}</p></td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs">{readTargetFor(source)}</td>
                      <td className="border-b border-slate-200 px-3 py-3"><button className={source.enabled ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-slate-500"} onClick={() => props.toggleSource(source)}>{source.enabled ? "已启用" : "已停用"}</button></td>
                      <td className="border-b border-slate-200 px-3 py-3"><button className="rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-50" aria-label={`查看 ${source.name} 的 .env 内容`} onClick={() => props.viewSourceContent(source)}><Eye className="h-4 w-4" /></button></td>
                      <td className="border-b border-slate-200 px-3 py-3"><button className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700" onClick={() => props.testSource(source.id)}>测试可读性</button></td>
                      <td className="border-b border-slate-200 px-3 py-3"><button className="rounded-md border border-red-200 p-2 text-red-700" aria-label={`删除 ${source.name}`} onClick={() => props.deleteSource(source.id)}><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <aside className="space-y-4">
          <Panel>
            <h3 className="text-sm font-semibold">存储模型</h3>
            <div className="mt-3 space-y-3">
              <InfoBox tone="emerald" title="已持久化" text="来源名称、启用状态、显示顺序、本地文件路径和备注" />
              <InfoBox tone="amber" title="本次内存" text="上传源的 .env 文件内容只保存在当前服务进程，重启后丢失" />
              <InfoBox tone="red" title="不持久化" text=".env 内容、.env 值、解析映射、对比结果、口令和私钥内容" />
            </div>
          </Panel>
          <Panel>
            <h3 className="text-sm font-semibold">M2 SSH 来源</h3>
            <p className="mt-2 text-sm text-slate-600">SSH 来源只读取已配置的远程 .env 路径。私钥内容、口令、.env 内容和读取结果都不会持久化。</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {(["connection_failed", "auth_failed", "permission_denied", "path_not_found", "parse_failed", "unknown_error"] as SourceErrorType[]).map((type) => <span key={type} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{sourceErrorLabel(type)}</span>)}
            </div>
          </Panel>
        </aside>
      </div>
    </section>
  );
}

function EnvContentModal(props: { source: EnvSource; result: EnvSourceContentResult | null; loading: boolean; onClose: () => void }) {
  const sourceName = props.result?.sourceName ?? props.source.name;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="env-content-title" className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">.env 内容</p>
            <h3 id="env-content-title" className="truncate text-base font-semibold">{sourceName}</h3>
          </div>
          <button className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="关闭 .env 内容查看器" onClick={props.onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {props.loading && <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">正在读取来源...</div>}
          {!props.loading && props.result?.status === "failed" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">来源读取失败</h3>
                <span className="text-xs font-semibold">{sourceErrorLabel(props.result.errorType)}</span>
              </div>
              <p className="mt-2">{props.result.errorMessage}</p>
            </div>
          )}
          {!props.loading && props.result?.status === "success" && <EnvFileContentViewer content={props.result.content} />}
        </div>
      </section>
    </div>
  );
}

function EnvFileContentViewer(props: { content: string }) {
  if (props.content.length === 0) {
    return <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">.env 文件为空。</div>;
  }

  return <pre data-testid="env-source-content" className="max-h-[60vh] overflow-auto rounded-md bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-50"><code>{props.content}</code></pre>;
}

function UploadedFilePicker(props: { file: File | null; onFileChange: (file: File | null) => void }) {
  function acceptFiles(files: FileList | File[] | null | undefined) {
    const file = files?.[0] ?? null;
    props.onFileChange(file);
  }

  return (
    <div className="space-y-2">
      <label
        data-testid="uploaded-file-dropzone"
        className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-blue-300 hover:bg-blue-50"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          acceptFiles(event.dataTransfer.files);
        }}
      >
        <FilePlus2 className="h-6 w-6 text-slate-500" />
        <span className="text-sm font-semibold text-[#182230]">选择或拖拽 .env 文件</span>
        <span className="text-xs text-slate-500">上传后内容只保存在当前服务进程内，重启后丢失。</span>
        <input
          aria-label="上传 .env 文件"
          className="sr-only"
          type="file"
          accept=".env,text/plain"
          onChange={(event) => acceptFiles(event.target.files)}
        />
      </label>
      {props.file && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="font-mono font-semibold">{props.file.name}</span>
          <span className="ml-2 text-blue-700">{formatBytes(props.file.size)}</span>
        </div>
      )}
    </div>
  );
}

function createUploadedSource(api: ApiClient, form: SourceFormState) {
  if (!form.uploadedFile) {
    throw new Error("请选择要上传的 .env 文件。");
  }
  return api.createUploadedSource({
    name: form.name,
    note: form.note,
    enabled: form.enabled,
    file: form.uploadedFile
  });
}

function buildSshRemoteFileConfig(form: SourceFormState): SshRemoteFileConfig {
  const keychain =
    form.keychainService.trim() && form.keychainAccount.trim()
      ? {
          keychainService: form.keychainService.trim(),
          keychainAccount: form.keychainAccount.trim()
        }
      : {};

  if (form.sourceType === "ssh-standard") {
    return {
      mode: "standard",
      host: form.host.trim(),
      port: Number(form.port || 22),
      username: form.username.trim(),
      privateKeyPath: form.privateKeyPath.trim(),
      remoteEnvPath: form.remoteEnvPath.trim(),
      ...keychain
    };
  }

  return {
    mode: "alias",
    sshAlias: form.sshAlias.trim(),
    remoteEnvPath: form.remoteEnvPath.trim(),
    ...keychain
  };
}

function readTargetFor(source: EnvSource) {
  if (source.type === "local-file") {
    return source.localFile?.filePath ?? "";
  }
  if (source.type === "uploaded-file") {
    const uploaded = source.uploadedFile;
    return uploaded ? `${uploaded.fileName} (${formatBytes(uploaded.sizeBytes)}，内存)` : "内存上传";
  }
  const ssh = source.sshRemoteFile;
  if (!ssh) {
    return "";
  }
  if (ssh.mode === "alias") {
    return `${ssh.sshAlias ?? ""}:${ssh.remoteEnvPath}`;
  }
  return `${ssh.username ?? ""}@${ssh.host ?? ""}:${ssh.remoteEnvPath}`;
}

function submitLabelFor(sourceType: SourceFormType) {
  if (sourceType === "local-file") {
    return "添加本地来源";
  }
  if (sourceType === "uploaded-file") {
    return "添加上传来源";
  }
  return "添加 SSH 来源";
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(sizeBytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  mono?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{props.label}</span>
      <input
        className={`h-10 w-full rounded-md border border-slate-200 px-3 text-sm ${props.mono ? "font-mono" : ""}`}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        required={props.required}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
      />
    </label>
  );
}

function ValueBlock(props: { testId?: string; label: string; value: string; expanded: boolean; onToggle: () => void; onCopy: () => void }) {
  const isEmpty = props.value === "";
  const isWhitespace = props.value !== "" && props.value.trim() === "";
  return (
    <div>
      {isEmpty || isWhitespace ? (
        <span className="rounded-md bg-red-50 px-2 py-1 font-mono text-xs text-red-700">{isEmpty ? "空字符串" : "仅空白值"}</span>
      ) : (
        <div data-testid={props.testId} className={`break-all rounded-md bg-slate-50 p-2 font-mono text-xs ${props.expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{props.value}</div>
      )}
      <div className="mt-2 flex gap-2">
        <button className="text-xs font-medium text-blue-700" aria-label={`${props.expanded ? "收起" : "展开"} ${props.label}`} onClick={props.onToggle}>{props.expanded ? "收起" : "展开"}</button>
        <button className="text-xs font-medium text-slate-600" aria-label={`复制 ${props.label}`} onClick={props.onCopy}>复制</button>
      </div>
    </div>
  );
}

function NavButton(props: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`flex min-w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition lg:w-full ${props.active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-slate-600 hover:bg-slate-50"}`} aria-current={props.active ? "page" : undefined} onClick={props.onClick}>{props.icon}<span>{props.label}</span></button>;
}

function Panel(props: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">{props.children}</div>;
}

function BoundaryItem(props: { label: string; value: string; accent?: "ok" }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">{props.label}</dt><dd className={`font-mono ${props.accent === "ok" ? "text-emerald-700" : "text-[#182230]"}`}>{props.value}</dd></div>;
}

function BoundaryPill(props: { icon: React.ReactNode; label: string; tone: "blue" | "emerald" | "amber" | "red" }) {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800"
  }[props.tone];
  return <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 ${toneClass}`}>{props.icon}{props.label}</span>;
}

function SummaryCard(props: { label: string; value: number; tone?: "emerald" | "blue" | "amber" | "red" | "purple" }) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    purple: "border-purple-200 bg-purple-50 text-purple-900"
  };
  const toneClass = props.tone ? toneClasses[props.tone] : "border-slate-200 bg-slate-50 text-[#182230]";
  return <div className={`rounded-md border p-3 ${toneClass}`}><p className="text-xs opacity-75">{props.label}</p><p className="mt-1 text-xl font-semibold">{props.value}</p></div>;
}

function MiniStat(props: { label: string; value: string | number; tone?: "red" | "emerald" }) {
  const tone = props.tone === "red" ? "border-red-200 bg-red-50 text-red-800" : props.tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-[#182230]";
  return <div className={`rounded-md border px-3 py-2 ${tone}`}><span className="block text-base font-semibold">{props.value}</span><span>{props.label}</span></div>;
}

function InfoBox(props: { tone: "emerald" | "amber" | "red"; title: string; text: string }) {
  const tone = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900"
  }[props.tone];
  return <div className={`rounded-md border p-3 ${tone}`}><p className="text-sm font-medium">{props.title}</p><p className="mt-1 text-xs opacity-80">{props.text}</p></div>;
}

function StatusBadge(props: { status: ComparisonStatus }) {
  const className = {
    same: "bg-emerald-50 text-emerald-700",
    different: "bg-blue-50 text-blue-700",
    missing: "bg-amber-50 text-amber-700",
    empty: "bg-red-50 text-red-700",
    "source-only": "bg-purple-50 text-purple-700"
  }[props.status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{comparisonStatusLabels[props.status]}</span>;
}

function chipClass(active: boolean) {
  return `rounded-md border px-3 py-2 text-xs font-medium ${active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`;
}

function labelStatus(status: StatusFilter) {
  if (status === "problem" || status === "all") {
    return statusFilterLabels[status];
  }
  return comparisonStatusLabels[status];
}

function titleFor(view: View) {
  return view === "comparison" ? "多环境对比" : view === "health" ? "单来源健康治理" : "设置";
}

function sourceErrorLabel(errorType: SourceErrorType | undefined) {
  return sourceErrorLabels[errorType ?? "unknown_error"];
}

function labelReadStatus(status: SourceReadStatus | undefined) {
  if (status === "success") {
    return "成功";
  }
  if (status === "failed") {
    return "失败";
  }
  return "未读取";
}

function labelPersistedState(value: string | undefined) {
  if (value === "settings-only" || !value) {
    return "仅设置";
  }
  return value;
}

function labelAccessScope(value: RuntimeBoundary["accessScope"] | undefined) {
  if (value === "local") {
    return "仅本机访问";
  }
  return "局域网可访问";
}
