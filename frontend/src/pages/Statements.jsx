import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { rupee } from "../format.js";
import {
  Alert, Button, Chip, Combobox, DatePicker, EmptyState, Field, Input, Panel, Spinner,
} from "../components/ui.jsx";

function statementYear(statement) {
  return (statement.period_end || statement.period_start || statement.created_at || "").slice(0, 4);
}

// Statement management lives here; transaction exploration has its own page.
export default function Statements() {
  const [statements, setStatements] = useState(null);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");
  const [editing, setEditing] = useState(null);
  const [cardFilter, setCardFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .listStatements()
      .then(setStatements)
      .catch((err) => { setError(err.message); setStatements([]); });
    api.listCards().then(setCards).catch(() => {});
  }, []);

  const cardLabels = useMemo(
    () => new Map(cards.map((card) => [card.id, `${card.issuer} ${card.name}`.trim()])),
    [cards]
  );

  const orderedStatements = useMemo(
    () => [...(statements || [])].sort((a, b) =>
      (b.period_end || b.created_at || "").localeCompare(a.period_end || a.created_at || "")
    ),
    [statements]
  );

  const cardOptions = useMemo(() => {
    const ids = new Set((statements || []).map((statement) => statement.card_id));
    return [...ids].map((id) => ({
      value: id,
      label: cardLabels.get(id) || "Unknown card",
    }));
  }, [statements, cardLabels]);

  const yearOptions = useMemo(() => {
    const years = new Set((statements || []).map(statementYear).filter(Boolean));
    return [...years]
      .sort((a, b) => b.localeCompare(a))
      .map((year) => ({ value: year, label: year }));
  }, [statements]);

  const filteredStatements = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orderedStatements.filter((statement) => {
      const searchable = [
        cardLabels.get(statement.card_id),
        statement.period_start,
        statement.period_end,
        statement.note,
        statement.total_spend,
        rupee(statement.total_spend || 0),
        statement.points_earned,
      ].filter((value) => value != null).join(" ").toLowerCase();
      return (
        (!cardFilter || statement.card_id === cardFilter)
        && (!yearFilter || statementYear(statement) === yearFilter)
        && (!q || searchable.includes(q))
      );
    });
  }, [orderedStatements, cardLabels, cardFilter, yearFilter, query]);

  const activeFilters = Boolean(cardFilter || yearFilter || query);
  const clearFilters = () => { setCardFilter(""); setYearFilter(""); setQuery(""); };

  function startEditing(statement) {
    setError("");
    setEditing({
      id: statement.id,
      total_spend: statement.total_spend ?? "",
      points_earned: statement.points_earned ?? "",
      period_start: statement.period_start || "",
      period_end: statement.period_end || "",
      note: statement.note || "",
      saving: false,
    });
  }

  const setEditField = (field) => (event) => {
    setEditing((current) => ({ ...current, [field]: event.target.value }));
  };

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing || editing.saving) return;

    const statementId = editing.id;
    setError("");
    setEditing((current) => ({ ...current, saving: true }));
    try {
      const updated = await api.updateStatement(statementId, {
        total_spend: Number(editing.total_spend),
        points_earned: editing.points_earned === "" ? null : Number(editing.points_earned),
        period_start: editing.period_start || null,
        period_end: editing.period_end || null,
        note: editing.note || null,
      });
      setStatements((current) => current.map((item) =>
        item.id === statementId ? updated : item
      ));
      setEditing(null);
    } catch (err) {
      setError(err.message);
      setEditing((current) => current && { ...current, saving: false });
    }
  }

  async function removeStatement(statement) {
    const label = cardLabels.get(statement.card_id) || "this card";
    const period = statement.period_end ? ` ending ${statement.period_end}` : "";
    const count = statement.transaction_count || 0;
    const rowsMessage = count
      ? ` Its ${count} transaction${count === 1 ? "" : "s"} will also be deleted.`
      : " Any linked transactions will also be deleted.";
    if (!confirm(`Delete the ${label} statement${period}?${rowsMessage}`)) return;

    setError("");
    setDeleting(statement.id);
    try {
      await api.deleteStatement(statement.id);
      setStatements((current) => current.filter((item) => item.id !== statement.id));
      setEditing((current) => current?.id === statement.id ? null : current);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting("");
    }
  }

  if (statements === null) {
    return <p className="font-body-md text-slate-400">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="flex justify-between items-center gap-4">
        <div className="min-w-0">
          <h2 className="font-headline-lg text-headline-lg-mobile md:text-display-lg md:font-display-lg text-white tracking-tight m-0">
            Statements
          </h2>
          <p className="font-body-sm text-[12px] text-slate-500 mt-1.5 m-0">
            {statements.length} saved statement{statements.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link to="/upload" className="shrink-0 no-underline">
          <Button>
            <span className="material-symbols-outlined text-base">add</span> Add Statement
          </Button>
        </Link>
      </div>

      <Alert>{error}</Alert>

      {orderedStatements.length === 0 ? (
        <EmptyState icon="description" title="No statements yet">
          Upload a statement PDF or enter its figures manually to start tracking spend.
        </EmptyState>
      ) : (
        <>
          <Panel
            icon="filter_alt"
            title="Filters"
            meta={`${filteredStatements.length}/${orderedStatements.length}`}
            accent
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Combobox
                options={cardOptions}
                value={cardFilter}
                onChange={setCardFilter}
                placeholder="All cards"
                emptyText="No cards"
              />
              <Combobox
                options={yearOptions}
                value={yearFilter}
                onChange={setYearFilter}
                placeholder="All statement years"
                emptyText="No years"
              />
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-600">
                  search
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search statements…"
                  aria-label="Search statements"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-10 pr-3 py-2 font-body-sm text-[13px] font-normal text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>

            {activeFilters && (
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-800/60">
                <span className="font-label-md text-[10px] uppercase tracking-widest text-slate-600">
                  Showing {filteredStatements.length} of {orderedStatements.length}
                </span>
                {cardFilter && (
                  <Chip tone="emerald">
                    {cardOptions.find((item) => item.value === cardFilter)?.label}
                  </Chip>
                )}
                {yearFilter && <Chip tone="emerald">{yearFilter}</Chip>}
                {query && <Chip>“{query}”</Chip>}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="font-label-md text-[10px] uppercase tracking-widest text-slate-500 hover:text-emerald-400 bg-transparent border-0 p-0 cursor-pointer transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </Panel>

          {filteredStatements.length === 0 ? (
            <EmptyState icon="search_off" title="No statements match those filters">
              Try clearing the card, year, or search filter.
            </EmptyState>
          ) : (
            <Panel
              icon="description"
              title="Saved statements"
              meta={`${filteredStatements.length}`}
            >
              <div className="divide-y divide-slate-800/60">
                {filteredStatements.map((statement) => {
                  const count = statement.transaction_count || 0;
                  const period = statement.period_start || statement.period_end
                    ? `${statement.period_start || "—"} → ${statement.period_end || "—"}`
                    : "Period unavailable";
                  return (
                    <div
                      key={statement.id}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <article className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-label-md text-[12px] text-slate-200 truncate m-0">
                            {cardLabels.get(statement.card_id) || "Unknown card"}
                          </p>
                          <p className="font-body-sm text-[10px] text-slate-600 mt-1 m-0">
                            {period} · {count} transaction{count === 1 ? "" : "s"}
                          </p>
                          {statement.note && (
                            <p className="font-body-sm text-[10px] text-slate-500 mt-1 m-0 truncate">
                              {statement.note}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                          <div className="text-left sm:text-right">
                            <p className="font-numeric-data text-[14px] text-slate-200 m-0">
                              {rupee(statement.total_spend || 0)}
                            </p>
                            {statement.points_earned != null && (
                              <p className="font-body-sm text-[10px] text-slate-600 m-0">
                                {statement.points_earned.toLocaleString("en-IN")} points
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="px-3"
                              disabled={Boolean(deleting) || editing?.saving}
                              onClick={() => startEditing(statement)}
                              aria-expanded={editing?.id === statement.id}
                              aria-label={`Edit statement for ${cardLabels.get(statement.card_id) || "unknown card"}`}
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              className="px-3"
                              disabled={Boolean(deleting) || editing?.saving}
                              onClick={() => removeStatement(statement)}
                              aria-label={`Delete statement for ${cardLabels.get(statement.card_id) || "unknown card"}`}
                              title="Delete statement"
                            >
                              {deleting === statement.id
                                ? <Spinner />
                                : <span className="material-symbols-outlined text-base">delete</span>}
                              {deleting === statement.id ? "Deleting…" : "Delete"}
                            </Button>
                          </div>
                        </div>
                      </article>

                      {editing?.id === statement.id && (
                        <form
                          onSubmit={saveEdit}
                          className="mt-4 pt-4 border-t border-slate-800/60 space-y-4"
                        >
                          <p className="font-body-sm text-[10px] text-slate-600 m-0">
                            Editing summary fields does not change the parsed transaction rows.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Total spend (₹)">
                              <Input
                                type="number"
                                step="0.01"
                                value={editing.total_spend}
                                onChange={setEditField("total_spend")}
                                required
                              />
                            </Field>
                            <Field label="Points earned" hint="Blank = recalculate from spend.">
                              <Input
                                type="number"
                                step="any"
                                value={editing.points_earned}
                                onChange={setEditField("points_earned")}
                              />
                            </Field>
                            <Field label="Period start">
                              <DatePicker
                                value={editing.period_start}
                                onChange={(value) => setEditing((current) => ({
                                  ...current, period_start: value,
                                }))}
                                placeholder="Choose start date"
                              />
                            </Field>
                            <Field label="Period end">
                              <DatePicker
                                value={editing.period_end}
                                onChange={(value) => setEditing((current) => ({
                                  ...current, period_end: value,
                                }))}
                                placeholder="Choose end date"
                              />
                            </Field>
                            <Field className="sm:col-span-2" label="Note">
                              <Input
                                value={editing.note}
                                onChange={setEditField("note")}
                                placeholder="Optional statement note"
                              />
                            </Field>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={editing.saving}
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={editing.saving}>
                              {editing.saving
                                ? <Spinner />
                                : <span className="material-symbols-outlined text-base">save</span>}
                              {editing.saving ? "Saving…" : "Save changes"}
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
