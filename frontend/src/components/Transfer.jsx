// Export (CSV / Excel, selected or all matching) and Import (CSV / Excel with column check) for the Candidates page.
import { useRef, useState } from "react";
import { api } from "../api.js";
import { Icon, Modal, fmt, useToast } from "./ui.jsx";

async function saveResponse(res, fallback) {
  const cd = res.headers.get("content-disposition") || "";
  const name = (cd.match(/filename="?([^";]+)"?/) || [])[1] || fallback;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await res.blob());
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- export ----------
export function ExportModal({ selected, total, filters, onClose }) {
  const toast = useToast();
  const [scope, setScope] = useState(selected.length ? "selected" : "all");
  const [format, setFormat] = useState("xlsx");
  const [contact, setContact] = useState(true);
  const [busy, setBusy] = useState(false);
  const count = scope === "selected" ? selected.length : total;

  const run = async () => {
    setBusy(true);
    try {
      const body = { format, contact, ...(scope === "selected" ? { ids: selected } : { filters: { ...filters, page: "" } }) };
      const res = await api("/candidates/export", { method: "POST", body, raw: true });
      await saveResponse(res, `candidates.${format}`);
      toast(`Exported ${fmt(count)} candidate${count === 1 ? "" : "s"}`);
      onClose();
    } catch (ex) { toast(ex.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="mhead2"><h2>Export candidates</h2><button className="iconx" type="button" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="optgroup"><div className="optlabel">Which candidates</div>
        <label className={"opt" + (scope === "selected" ? " on" : "") + (!selected.length ? " off" : "")}>
          <input type="radio" name="scope" checked={scope === "selected"} disabled={!selected.length} onChange={() => setScope("selected")} />
          <div><b>Selected only ({fmt(selected.length)})</b><span>{selected.length ? "The candidates you ticked" : "Tick candidates in the list first"}</span></div></label>
        <label className={"opt" + (scope === "all" ? " on" : "")}>
          <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} />
          <div><b>All matching ({fmt(total)})</b><span>Everyone that matches your current search and filters</span></div></label>
      </div>
      <div className="optgroup"><div className="optlabel">File type</div>
        <div className="seg" role="group" aria-label="File type">
          <button type="button" aria-pressed={format === "xlsx"} onClick={() => setFormat("xlsx")}>Excel (.xlsx)</button>
          <button type="button" aria-pressed={format === "csv"} onClick={() => setFormat("csv")}>CSV</button>
        </div></div>
      <label className="chk"><input type="checkbox" checked={contact} onChange={(e) => setContact(e.target.checked)} /> Include email and phone</label>
      <div className="actions">
        <button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn primary" type="button" onClick={run} disabled={busy || !count}><Icon name="download" /> {busy ? "Preparing…" : `Export ${fmt(count)}`}</button>
      </div>
    </Modal>
  );
}

// ---------- import ----------
const MODES = [["fill", "Fill empty fields", "Add only what is missing; keep what is already there"],
  ["overwrite", "Overwrite", "Replace their details with the file's values"], ["skip", "Skip", "Leave existing candidates untouched"]];

export function ImportModal({ onClose, onDone }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);          // {name, data}
  const [pool, setPool] = useState("");
  const [mode, setMode] = useState("fill");
  const [check, setCheck] = useState(null);        // preview result
  const [mapping, setMapping] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const pick = (f) => {
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) return toast("Choose a .csv or .xlsx file", true);
    if (f.size > 8 * 1024 * 1024) return toast("File is too large (max 8 MB)", true);
    const rd = new FileReader();
    rd.onload = () => { setFile({ name: f.name, data: String(rd.result) }); setCheck(null); setMapping({}); };
    rd.readAsDataURL(f);
  };
  const send = async (commit, map = mapping) => {
    setBusy(true);
    try {
      const r = await api("/candidates/import", { method: "POST", body: { filename: file.name, data: file.data, pool, mode, mapping: map, commit } });
      if (commit) { setDone(r); onDone(); toast(`Imported: ${r.added} added, ${r.updated} updated`); }
      else { setCheck(r); setMapping(r.mapping); }
    } catch (ex) { toast(ex.message, true); } finally { setBusy(false); }
  };
  const template = async () => {
    try { await saveResponse(await api("/candidates/import/template", { raw: true }), "candidates-import-template.csv"); }
    catch (ex) { toast(ex.message, true); }
  };
  const remap = (h, f) => { const m = { ...mapping, [h]: f }; setMapping(m); send(false, m); };
  const mapped = Object.values(mapping);
  const ready = check && mapped.includes("name") && mapped.includes("linkedin_url") && (check.new + check.update) > 0;

  if (done) return (
    <Modal onClose={onClose}>
      <div className="mhead2"><h2>Import finished</h2><button className="iconx" type="button" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="istats">
        <div className="good"><b>{fmt(done.added)}</b><span>new candidates added</span></div>
        <div><b>{fmt(done.updated)}</b><span>existing updated</span></div>
        <div className={done.errors.length ? "bad" : ""}><b>{fmt(done.errors.length)}</b><span>rows skipped (problems)</span></div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>New candidates start as "Discovered", so the n8n enrichment will fill their LinkedIn details in its next runs.</p>
      <div className="actions"><button className="btn primary" type="button" onClick={onClose}>Done</button></div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} wide>
      <div className="mhead2"><h2>Import candidates</h2><button className="iconx" type="button" onClick={onClose} aria-label="Close">✕</button></div>
      <ol className="isteps"><li className={!check ? "on" : "ok"}>Choose file</li><li className={check ? "on" : ""}>Check columns</li><li>Import</li></ol>

      <div className={"drop" + (file ? " has" : "")} onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}>
        <Icon name={file ? "file" : "upload"} size={22} />
        {file ? <div><b>{file.name}</b><span>Click to choose another file</span></div>
          : <div><b>Drop a CSV or Excel file here, or click to choose</b><span>Needs at least a Name and a LinkedIn profile URL column</span></div>}
        <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <button type="button" className="linkbtn small" onClick={template}><Icon name="download" size={13} /> Download a sample file (template)</button>

      <div className="row2">
        <label className="f">Pool for rows without a Pool column
          <select value={pool} onChange={(e) => { setPool(e.target.value); setCheck(null); }}><option value="">Use the file's Pool column</option><option>ServiceNow</option><option>AI/ML</option></select></label>
        <label className="f">If a candidate already exists (same LinkedIn URL)
          <select value={mode} onChange={(e) => { setMode(e.target.value); setCheck(null); }}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <span className="small muted">{MODES.find((m) => m[0] === mode)[2]}</span></label>
      </div>

      {check && (
        <>
          <div className="istats">
            <div><b>{fmt(check.total)}</b><span>rows in file</span></div>
            <div className="good"><b>{fmt(check.new)}</b><span>new</span></div>
            <div><b>{fmt(check.update)}</b><span>will update</span></div>
            <div><b>{fmt(check.same + check.skip)}</b><span>no change / skipped</span></div>
            <div className={check.errors.length ? "bad" : ""}><b>{fmt(check.errors.length)}</b><span>with problems</span></div>
          </div>
          <div className="sec"><h4>Columns: what each one means</h4>
            <div className="maptbl">{check.headers.map((h) => (
              <div key={h} className="maprow"><div><b>{h}</b><span>{String(check.samples[h] || "").slice(0, 40) || "empty"}</span></div><span className="arrow">→</span>
                <select value={mapping[h] || ""} onChange={(e) => remap(h, e.target.value)}>
                  <option value="">Don't import</option>{Object.entries(check.fields).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>))}
            </div>
            {!(mapped.includes("name") && mapped.includes("linkedin_url")) && <div className="msg err">Choose which column is the Name and which is the LinkedIn URL.</div>}
          </div>
          {check.preview.length > 0 && <div className="sec"><h4>First rows</h4><div className="tbl"><table className="runtbl"><thead><tr><th>Row</th><th>Name</th><th>Pool</th><th>Email</th><th>Phone</th><th>Result</th></tr></thead>
            <tbody>{check.preview.map((p) => <tr key={p.row}><td className="mono small">{p.row}</td><td>{p.name}</td><td className="small">{p.pool}</td><td className="small">{p.email || "-"}</td><td className="small mono">{p.phone || "-"}</td>
              <td><span className={"chip " + (p.result === "New" ? "c-good" : /Update/.test(p.result) ? "c-info" : "c-mute")}>{p.result}</span></td></tr>)}</tbody></table></div></div>}
          {check.errors.length > 0 && <div className="sec"><h4>Rows with problems (these will be skipped)</h4>
            <div className="errlist">{check.errors.slice(0, 50).map((e) => <div key={e.row}><b>Row {e.row}{e.name ? " · " + e.name : ""}</b><span>{e.error}</span></div>)}</div></div>}
        </>
      )}

      <div className="actions">
        <button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
        {!check ? <button className="btn primary" type="button" disabled={!file || busy} onClick={() => send(false)}>{busy ? "Checking…" : "Check file"}</button>
          : <button className="btn primary" type="button" disabled={!ready || busy} onClick={() => send(true)}><Icon name="upload" /> {busy ? "Importing…" : `Import ${fmt(check.new + check.update)} candidates`}</button>}
      </div>
    </Modal>
  );
}
