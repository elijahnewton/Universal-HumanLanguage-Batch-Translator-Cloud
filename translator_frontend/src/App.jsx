import React, { useState, useEffect, useRef } from "react";

export default function App() {
  // Input Component States
  const [file, setFile] = useState(null);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("lg");
  const [languages, setLanguages] = useState({});
  const [completedFiles, setCompletedFiles] = useState([]);

  // Live Task Tracker States
  const [taskId, setTaskId] = useState(localStorage.getItem("active_translation_task") || null);
  const [taskStatus, setTaskStatus] = useState("idle"); // idle, processing, complete, failed
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [logTrace, setLogTrace] = useState("No active worker tracking execution vectors.");
  const [latestDownload, setLatestDownload] = useState(null);

  // UI Processing States
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const pollIntervalRef = useRef(null);

  // Phase 1: Initialize System Dependencies on Mount
  useEffect(() => {
    fetchLanguages();
    fetchHistory();
    
    if (taskId) {
      setTaskStatus("processing");
      startPolling(taskId);
    }
    
    return () => clearInterval(pollIntervalRef.current);
  }, []);

  const fetchLanguages = async () => {
    try {
      const res = await fetch("/languages");
      const data = await res.json();
      setLanguages(data);
      if (data["luganda"]) setTargetLang(data["luganda"]);
    } catch (err) {
      setLogTrace("Error loading system language maps framework matrix.");
    }
  };

  const fetchHistory = async () => {
    setIsFetchingHistory(true);
    try {
      const res = await fetch("/completed-files");
      const data = await res.json();
      setCompletedFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error syncing storage map arrays:", err);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  // Phase 2: Orchestrate Live Task Tracking Loop
  const startPolling = (id) => {
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/status/${id}`);
        if (!res.ok) throw new Error("Task target context traces missing from thread stack mapping.");
        const data = await res.json();

        if (data.status === "processing") {
          setTaskStatus("processing");
          setProgress(data.progress || 0);
          setStatusMessage(`Translating... (${data.progress}%)`);
          setLogTrace(`${data.message || "Processing batch matrix frames..."}\n\n[You can safely close this window or device profile context. Task is running permanently on cloud clusters]`);
        } else if (data.status === "complete") {
          clearInterval(pollIntervalRef.current);
          localStorage.removeItem("active_translation_task");
          setTaskId(null);
          setTaskStatus("complete");
          setProgress(100);
          setStatusMessage("Finished! Task execution fully synced.");
          setLogTrace("Asset processed and safely isolated into R2 production buckets!");
          setLatestDownload(data.translated_file);
          fetchHistory();
        } else if (data.status === "failed") {
          clearInterval(pollIntervalRef.current);
          localStorage.removeItem("active_translation_task");
          setTaskId(null);
          setTaskStatus("failed");
          setStatusMessage("Translation execution faulted.");
          setLogTrace(`Error details returned: ${data.error}`);
        }
      } catch (err) {
        clearInterval(pollIntervalRef.current);
        setTaskStatus("failed");
        setStatusMessage("Connection link dropped.");
        setLogTrace(`Tracing network link state exceptions: ${err.message}`);
      }
    }, 2500);
  };

  // Phase 3: Submit Action Handlers
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatusMessage("Choose a compatible text (.txt) payload sequence asset first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("source_lang", sourceLang);
    formData.append("target_lang", targetLang);

    setIsUploading(true);
    setTaskStatus("processing");
    setStatusMessage("Uploading asset matrix stream...");
    setLogTrace("Handing file tokens off to server instance background threads...");
    setLatestDownload(null);

    try {
      const res = await fetch("/translate", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server runtime verification exception.");

      localStorage.setItem("active_translation_task", data.task_id);
      setTaskId(data.task_id);
      startPolling(data.task_id);
    } catch (err) {
      setTaskStatus("failed");
      setStatusMessage(err.message);
      setLogTrace(err.stack || err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    clearInterval(pollIntervalRef.current);
    localStorage.removeItem("active_translation_task");
    setFile(null);
    setTaskId(null);
    setTaskStatus("idle");
    setProgress(0);
    setStatusMessage("Ready.");
    setLogTrace("No active worker tracking execution vectors.");
    setLatestDownload(null);
  };

  // Helper formatting calculation engines
  const formatFileName = (rawName) => {
    let name = rawName.replace("translated_", "");
    if (name.includes("_") && /^\d+$/.test(name.split("_")[0])) {
      name = name.split("_", 1)[1];
    }
    return name;
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Batch Translator Pro</h1>
        <p>High-performance asynchronous natural language processing pipeline powered by Render computation engines and Cloudflare R2 distributed storage fabrics.</p>
      </header>

      <main className="app-grid">
        {/* Module Area A: Upload and Processing Automation Configuration Context */}
        <section className="app-card">
          <form onSubmit={handleFormSubmit} className="interactive-form">
            <div className="language-selector-group">
              <label>
                <span>Source Language</span>
                <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} disabled={taskStatus === "processing"}>
                  <option value="auto">Detect Language (Auto)</option>
                  {Object.entries(languages).map(([name, code]) => (
                    <option key={`src-${code}`} value={code}>{name.charAt(0).toUpperCase() + name.slice(1)}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Target Language</span>
                <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} disabled={taskStatus === "processing"}>
                  {Object.entries(languages).map(([name, code]) => (
                    <option key={`tgt-${code}`} value={code}>{name.charAt(0).toUpperCase() + name.slice(1)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className={`dropzone-wrapper ${file ? "has-file" : ""}`}>
              <div className="dropzone-content">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <div>{file ? `Selected Asset: ${file.name}` : "Click or drag plain text payload file mapping"}</div>
                <input type="file" accept=".txt" onChange={(e) => setFile(e.target.files[0])} disabled={taskStatus === "processing"} />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={taskStatus === "processing" || isUploading || !file}>
                {isUploading ? "Uploading..." : "Translate File"}
              </button>
              <button type="button" className="btn-secondary" onClick={handleClear}>Clear Interface</button>
            </div>
          </form>

          {/* Precision Native React Progress Analytics Engine Rendering Grid */}
          {taskStatus === "processing" && (
            <div className="progress-analysis-container">
              <div className="progress-metrics-header">
                <span className="live-pulse-badge">Live System Thread Active</span>
                <span className="percentage-counter">{progress}%</span>
              </div>
              <div className="progress-track-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          )}

          <div className="status-label-bar">{statusMessage}</div>

          {latestDownload && (
            <div className="completion-alert-box animate-fade-in">
              <div className="alert-header">
                <strong>Active Thread Output Asset Compiled Successfully:</strong>
                <span>{formatFileName(latestDownload)}</span>
              </div>
              <a href={`/download/${encodeURIComponent(latestDownload)}`} className="btn-success-download" target="_blank" rel="noopener noreferrer">
                Download Result Asset Stream
              </a>
            </div>
          )}

          <div className="terminal-logging-workspace">
            <h5>System Logging Matrix Output</h5>
            <pre>{logTrace}</pre>
          </div>
        </section>

        {/* Module Area B: Cloud Storage Ledger Archive Tracking Interface Context */}
        <section className="app-card">
          <div className="history-header-wrapper">
            <h3>All Finished Files (Cloud R2 Bucket)</h3>
            <button className="btn-refresh" onClick={fetchHistory} disabled={isFetchingHistory}>
              {isFetchingHistory ? "Syncing..." : "Refresh Catalog"}
            </button>
          </div>

          <div className="ledger-scroll-viewport">
            {completedFiles.length === 0 ? (
              <div className="empty-state-fallback">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                <p>No historical elements located in your object container registry directory paths.</p>
              </div>
            ) : (
              <ul className="ledger-structured-list">
                {completedFiles.map((item) => {
                  const timestampStr = new Date(item.last_modified).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  const sizeKb = (item.size_bytes / 1024).toFixed(1);
                  return (
                    <li key={item.raw_name} className="ledger-item-row animate-fade-in">
                      <div className="item-meta-details">
                        <span className="item-display-title" title={item.display_name}>{item.display_name}</span>
                        <span className="item-structural-subtext">{timestampStr} • {sizeKb} KB</span>
                      </div>
                      <a href={`/download/${encodeURIComponent(item.raw_name)}`} target="_blank" rel="noopener noreferrer" className="btn-table-download">
                        Download File
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <div>Credit to <strong>Musiitwa Elijah & Aheebwa Mike</strong></div>
        <a href="https://github.com/elijahnewton" target="_blank" rel="noopener noreferrer" className="footer-github-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
          github.com/elijahnewton
        </a>
        <a href="https://github.com/AheebwaMike" target="_blank" rel="noopener noreferrer" className="footer-github-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
          github.com/AheebwaMike
        </a>
      </footer>
    </div>
  );
}