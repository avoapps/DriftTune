import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:8800';

const MODES = ['USB', 'Bluetooth', 'WiFi'];

export default function OBDScannerTab() {
  const [mode, setMode]               = useState('USB');
  const [ports, setPorts]             = useState([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [manualPort, setManualPort]   = useState('');
  const [baudrate, setBaudrate]       = useState('');
  const [wifiHost, setWifiHost]       = useState('192.168.0.10');
  const [wifiPort, setWifiPort]       = useState('35000');

  const [connState, setConnState]     = useState('idle'); // idle | connecting | connected | error
  const [connInfo, setConnInfo]       = useState(null);   // { protocol, port }
  const [error, setError]             = useState('');

  const [scanState, setScanState]     = useState('idle'); // idle | scanning | done
  const [progress, setProgress]       = useState({ pct: 0, msg: '' });
  const [results, setResults]         = useState([]);
  const [filterCat, setFilterCat]     = useState('All');

  const [watching, setWatching]       = useState(new Set());
  const [liveVals, setLiveVals]       = useState({});

  const pollRef = useRef(null);
  const liveRef = useRef(null);

  /* ── Load ports on mount / mode change ── */
  useEffect(() => {
    if (mode === 'WiFi') { setPorts([]); return; }
    fetch(`${API}/ports`)
      .then(r => r.json())
      .then(setPorts)
      .catch(() => setPorts([]));
  }, [mode]);

  /* ── Connect ── */
  async function doConnect() {
    setConnState('connecting');
    setError('');
    const body = { mode: mode.toLowerCase() };
    if (mode !== 'WiFi') {
      body.port = manualPort || selectedPort;
      if (baudrate) body.baudrate = baudrate;
    } else {
      body.wifi_host = wifiHost;
      body.wifi_port = parseInt(wifiPort);
    }
    try {
      const res = await fetch(`${API}/connect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(r => r.json());
      if (res.ok) {
        setConnState('connected');
        setConnInfo({ protocol: res.protocol, port: res.port });
      } else {
        setConnState('error');
        setError(res.error || 'Connection failed');
      }
    } catch {
      setConnState('error');
      setError('Cannot reach OBD scanner server (port 8800). Is obd_scanner.py running?');
    }
  }

  /* ── Scan ── */
  async function doScan() {
    setScanState('scanning');
    setResults([]);
    setProgress({ pct: 0, msg: 'Starting scan...' });
    try {
      await fetch(`${API}/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      pollRef.current = setInterval(async () => {
        const p = await fetch(`${API}/progress`).then(r => r.json());
        setProgress({ pct: p.pct, msg: p.msg });
        if (p.done) {
          clearInterval(pollRef.current);
          setResults(p.results || []);
          setScanState('done');
        }
      }, 400);
    } catch {
      setScanState('idle');
    }
  }

  /* ── Disconnect ── */
  async function doDisconnect() {
    clearInterval(pollRef.current);
    clearInterval(liveRef.current);
    await fetch(`${API}/disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    setConnState('idle');
    setConnInfo(null);
    setScanState('idle');
    setResults([]);
    setWatching(new Set());
    setLiveVals({});
  }

  /* ── Watch toggle ── */
  const toggleWatch = useCallback((cmd) => {
    setWatching(prev => {
      const next = new Set(prev);
      next.has(cmd) ? next.delete(cmd) : next.add(cmd);
      fetch(`${API}/watch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmds: [...next] })
      }).catch(() => {});
      return next;
    });
  }, []);

  /* ── Live polling ── */
  useEffect(() => {
    if (!watching.size) { clearInterval(liveRef.current); liveRef.current = null; return; }
    if (liveRef.current) return;
    liveRef.current = setInterval(async () => {
      const res = await fetch(`${API}/live`).then(r => r.json()).catch(() => ({ values: {} }));
      setLiveVals(res.values || {});
    }, 500);
    return () => { clearInterval(liveRef.current); liveRef.current = null; };
  }, [watching]);

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(liveRef.current); }, []);

  /* ── Derived ── */
  const liveCount  = results.filter(s => s.live).length;
  const supCount   = results.filter(s => s.supported && !s.live).length;
  const deadCount  = results.filter(s => !s.supported).length;
  const categories = ['All', ...new Set(results.map(s => s.category))];
  const filtered   = filterCat === 'All' ? results : results.filter(s => s.category === filterCat);

  const connLabel = { idle: 'DISCONNECTED', connecting: 'CONNECTING…', connected: 'CONNECTED', error: 'ERROR' }[connState];
  const connColor = { idle: 'var(--muted)', connecting: 'var(--warning)', connected: 'var(--ok)', error: 'var(--accent)' }[connState];

  return (
    <div className="obd-layout">

      {/* ── Sidebar ── */}
      <div className="obd-sidebar">

        {/* Logo + status */}
        <div className="obd-sidebar-header">
          <div className="obd-sidebar-title">OBD-II Scanner</div>
          <div className="obd-status-pill" style={{ color: connColor, borderColor: connColor }}>{connLabel}</div>
        </div>

        {/* Mode tabs */}
        <div className="obd-section">
          <div className="obd-section-label">Connection Type</div>
          <div className="obd-mode-tabs">
            {MODES.map(m => (
              <button key={m} className={`obd-mode-tab ${mode === m ? 'active' : ''}`}
                onClick={() => setMode(m)} disabled={connState === 'connected'}>{m}</button>
            ))}
          </div>
        </div>

        {/* Serial (USB/BT) */}
        {mode !== 'WiFi' && (
          <div className="obd-section">
            <div className="obd-section-label">Port</div>
            {ports.length > 0 ? (
              <div className="obd-ports-list">
                {ports.map(p => (
                  <div key={p.port}
                    className={`obd-port-item ${selectedPort === p.port ? 'selected' : ''}`}
                    onClick={() => { setSelectedPort(p.port); setManualPort(p.port); }}>
                    <span className={`obd-port-badge ${p.type === 'BT' ? 'bt' : 'usb'}`}>{p.type}</span>
                    <span className="obd-port-name">{p.port}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="obd-hint">No ports found — enter manually</div>
            )}
            <input className="obd-input" value={manualPort}
              onChange={e => setManualPort(e.target.value)}
              placeholder="/dev/cu.OBDII" disabled={connState === 'connected'} />
            <select className="obd-input" value={baudrate} onChange={e => setBaudrate(e.target.value)}
              disabled={connState === 'connected'}>
              <option value="">Baudrate: Auto</option>
              <option value="9600">9600</option>
              <option value="38400">38400</option>
              <option value="115200">115200</option>
            </select>
          </div>
        )}

        {/* WiFi */}
        {mode === 'WiFi' && (
          <div className="obd-section">
            <div className="obd-section-label">WiFi ELM327</div>
            <input className="obd-input" value={wifiHost} onChange={e => setWifiHost(e.target.value)}
              placeholder="192.168.0.10" disabled={connState === 'connected'} />
            <input className="obd-input" value={wifiPort} onChange={e => setWifiPort(e.target.value)}
              placeholder="35000" disabled={connState === 'connected'} />
          </div>
        )}

        {/* Connect / Disconnect */}
        {connState !== 'connected' ? (
          <button className="obd-btn primary" onClick={doConnect} disabled={connState === 'connecting'}>
            {connState === 'connecting' ? 'Connecting…' : 'Connect'}
          </button>
        ) : (
          <>
            {connInfo && (
              <div className="obd-conn-info">
                <div className="obd-conn-row"><span>Protocol</span><span className="obd-conn-val">{connInfo.protocol}</span></div>
                <div className="obd-conn-row"><span>Port</span><span className="obd-conn-val">{connInfo.port}</span></div>
              </div>
            )}
            <button className="obd-btn secondary" onClick={doScan} disabled={scanState === 'scanning'}>
              {scanState === 'scanning' ? 'Scanning…' : '🔍 Scan All Signals'}
            </button>
            <button className="obd-btn danger" onClick={doDisconnect} style={{ marginTop: 'auto' }}>
              ⏹ Disconnect
            </button>
          </>
        )}

        {/* Scan progress */}
        {scanState === 'scanning' && (
          <div className="obd-progress">
            <div className="obd-progress-bar-bg">
              <div className="obd-progress-bar-fill" style={{ width: progress.pct + '%' }} />
            </div>
            <div className="obd-progress-msg">{progress.msg}</div>
          </div>
        )}

        {error && <div className="obd-error">{error}</div>}
      </div>

      {/* ── Main panel ── */}
      <div className="obd-main">

        {/* Idle */}
        {connState !== 'connected' && (
          <div className="obd-empty">
            <div className="obd-empty-icon">🔌</div>
            <div className="obd-empty-text">
              {connState === 'error'
                ? <span style={{ color: 'var(--accent)' }}>{error}</span>
                : 'Choose connection type, select port and connect to OBD adapter.\nRequires obd_scanner.py running on port 8800.'}
            </div>
          </div>
        )}

        {/* Connected, no scan yet */}
        {connState === 'connected' && scanState === 'idle' && (
          <div className="obd-empty">
            <div className="obd-empty-icon">✅</div>
            <div className="obd-empty-text">Connected! Click <strong>Scan All Signals</strong> to discover available PIDs.</div>
          </div>
        )}

        {/* Scanning */}
        {scanState === 'scanning' && (
          <div className="obd-empty">
            <div className="obd-empty-icon">🔍</div>
            <div className="obd-empty-text">Scanning signals… this may take 30–60 seconds.</div>
            <div className="obd-scan-pct">{Math.round(progress.pct)}%</div>
          </div>
        )}

        {/* Results */}
        {scanState === 'done' && results.length > 0 && (
          <>
            {/* Stats */}
            <div className="obd-stats-bar">
              <div className="obd-stat-box"><div className="obd-stat-val" style={{ color: 'var(--ok)' }}>{liveCount}</div><div className="obd-stat-label">LIVE SIGNALS</div></div>
              <div className="obd-stat-box"><div className="obd-stat-val" style={{ color: 'var(--warning)' }}>{supCount}</div><div className="obd-stat-label">SUPPORTED</div></div>
              <div className="obd-stat-box"><div className="obd-stat-val" style={{ color: 'var(--muted)' }}>{deadCount}</div><div className="obd-stat-label">NOT SUPPORTED</div></div>
              <div className="obd-stat-box"><div className="obd-stat-val" style={{ color: 'var(--gold)' }}>{results.length}</div><div className="obd-stat-label">TOTAL CHECKED</div></div>
            </div>

            {/* Category filter */}
            <div className="obd-cat-filter">
              {categories.map(c => (
                <button key={c} className={`obd-cat-btn ${filterCat === c ? 'active' : ''}`}
                  onClick={() => setFilterCat(c)}>{c}</button>
              ))}
            </div>

            {/* Signal table */}
            <div className="obd-table-wrap">
              <table className="obd-signal-table">
                <thead>
                  <tr><th>Signal</th><th>Category</th><th>Value</th><th>Unit</th><th>Watch</th></tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const isWatching = watching.has(s.cmd);
                    const liveVal = liveVals[s.cmd];
                    return (
                      <tr key={s.cmd}>
                        <td>{s.label}</td>
                        <td><span className="obd-sig-cat">{s.category}</span></td>
                        <td>
                          {s.live
                            ? <span className="obd-sig-live">{liveVal !== undefined ? liveVal : s.value}</span>
                            : s.supported
                              ? <span className="obd-sig-supported">—</span>
                              : <span className="obd-sig-dead">✗</span>}
                        </td>
                        <td><span className="obd-sig-unit">{s.unit}</span></td>
                        <td>
                          {s.live && (
                            <button className={`obd-watch-btn ${isWatching ? 'watching' : ''}`}
                              onClick={() => toggleWatch(s.cmd)}>
                              {isWatching ? '● Live' : 'Watch'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Live bar (bottom) ── */}
      {watching.size > 0 && (
        <div className="obd-live-bar">
          {[...watching].map(cmd => {
            const sig = results.find(s => s.cmd === cmd) || {};
            return (
              <div key={cmd} className="obd-live-item">
                <div className="obd-live-val">
                  {liveVals[cmd] ?? '—'}
                  <span className="obd-live-unit">{sig.unit || ''}</span>
                </div>
                <div className="obd-live-label">{sig.label || cmd}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
