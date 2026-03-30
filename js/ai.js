// ════════════════════════════════════════════════════════════════
// AI LAYOUT ANALYSIS — Hybrid LLM + Rule-Based Parser
// Sends a small sample to Claude Haiku to detect structure,
// then feeds hints into the deterministic parser.
// ════════════════════════════════════════════════════════════════

const AI = {
  _cache: new Map(),

  getKey() {
    return localStorage.getItem('bp_api_key') || '';
  },
  setKey(key) {
    localStorage.setItem('bp_api_key', key.trim());
  },
  isEnabled() {
    return document.getElementById('ai-enabled')?.checked && this.getKey();
  },

  async _hash(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  },

  extractSample(grid) {
    const rows = grid.length;
    const cols = Math.max(...grid.map(r => r?.length || 0), 0);
    const head = grid.slice(0, Math.min(30, rows));
    const midStart = Math.max(30, Math.floor(rows * 0.4));
    const mid = grid.slice(midStart, Math.min(midStart + 15, rows));
    const tail = grid.slice(Math.max(0, rows - 15));

    let text = `GRID SIZE: ${rows} rows x ${cols} cols\n\n`;
    text += `=== ROWS 1-${Math.min(30, rows)} (top) ===\n`;
    head.forEach((r, i) => { text += `R${i + 1}: ${(r || []).join(' | ')}\n`; });
    if (midStart > 30) {
      text += `\n=== ROWS ${midStart + 1}-${Math.min(midStart + 15, rows)} (middle) ===\n`;
      mid.forEach((r, i) => { text += `R${midStart + i + 1}: ${(r || []).join(' | ')}\n`; });
    }
    text += `\n=== ROWS ${Math.max(1, rows - 14)}-${rows} (bottom) ===\n`;
    tail.forEach((r, i) => { text += `R${Math.max(1, rows - 14) + i}: ${(r || []).join(' | ')}\n`; });

    return text;
  },

  async analyze(grid) {
    const statusEl = document.getElementById('ai-status');

    const flatCSV = grid.map(r => (r || []).join(',')).join('\n');
    const hash = await this._hash(flatCSV);

    const cacheKey = `bp_ai_cache_${hash}`;
    const cached = this._cache.get(hash) || (() => {
      try { const s = localStorage.getItem(cacheKey); return s ? JSON.parse(s) : null; } catch(e) { return null; }
    })();
    if (cached) {
      console.log('%c[Blueprint Map] Using cached AI result (hash: ' + hash + ')', 'color:#5a7a9a');
      const hallNames = (cached.halls || []).map(h => h.name).join(', ');
      statusEl.className = 'ai-status active done';
      statusEl.innerHTML = `<strong>Cached:</strong> ${cached.layout_type} layout<br>` +
        `Site: ${cached.site_name || '?'} · Halls: ${hallNames || 'none'}<br>` +
        `${cached.racks_per_row}/row, serpentine: ${cached.serpentine ? 'yes' : 'no'}`;
      return cached;
    }

    statusEl.className = 'ai-status active analyzing';
    statusEl.textContent = 'Analyzing layout structure...';

    const sample = this.extractSample(grid);

    const prompt = `You are analyzing a datacenter overhead layout spreadsheet that has been exported to CSV. Each cell's position in the spreadsheet corresponds to a physical position in the datacenter.

Your job is to identify the STRUCTURE of this layout so a parser can render it correctly.

Here is a sample of the spreadsheet (cells separated by " | "):

${sample}

Analyze this and return a JSON object with this exact structure:
{
  "layout_type": "overhead" | "device_tracker" | "inventory" | "unknown",
  "site_name": "string or null",
  "halls": [
    {
      "name": "DH1",
      "header_row": 5,
      "col_range": [3, 18],
      "description": "brief description"
    }
  ],
  "rack_number_rows": [10, 12, 14, 16],
  "rack_type_rows": [11, 13, 15, 17],
  "racks_per_row": 10,
  "serpentine": true,
  "grid_labels": [
    { "text": "GRID-A POD A1", "row": 8, "col": 3 }
  ],
  "custom_type_prefixes": [
    { "prefix": "XYZ-", "likely_category": "compute" }
  ],
  "stat_rows": [50, 51, 52],
  "notes": "any important observations about the layout format"
}

Rules:
- Row numbers are 1-indexed (matching the R1, R2... labels in the sample)
- col_range is [start_col, end_col] (0-indexed)
- rack_number_rows: rows that contain rack numbers (integers like 1,2,3...10 or 20,19,18...11)
- rack_type_rows: rows that contain rack type labels (like HD-B2SCb, IB x8, T0-E, etc.)
- Only include custom_type_prefixes for types NOT in this built-in list: HD-B2, HD-GB, IB, XDR, SC-, T0-E, T1-E, T2-E, T3-E, T0-FE, T1-FE, T2-FE, DPR, FCR, CP, VAST, Fab, RES, U
- serpentine: true if rack numbers alternate direction (1-10 left-to-right, then 20-11 right-to-left)
- If this is NOT an overhead layout (e.g., a device tracker with Location/Serial/Status columns), set layout_type accordingly and leave structural fields empty

Return ONLY the JSON object, no markdown fences, no explanation.`;

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.getKey(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${resp.status}`);
      }

      const data = await resp.json();
      const text = data.content?.[0]?.text || '';

      const jsonStr = text.replace(/^```json?\s*/m, '').replace(/```\s*$/m, '').trim();
      const hints = JSON.parse(jsonStr);

      console.group('%c[Blueprint Map] AI Analysis Result', 'color:#4ac49a;font-weight:bold');
      console.log('Layout type:', hints.layout_type);
      console.log('Site:', hints.site_name);
      console.log('Halls:', hints.halls);
      console.log('Rack number rows:', hints.rack_number_rows);
      console.log('Rack type rows:', hints.rack_type_rows);
      console.log('Racks/row:', hints.racks_per_row);
      console.log('Serpentine:', hints.serpentine);
      console.log('Grid labels:', hints.grid_labels);
      console.log('Custom prefixes:', hints.custom_type_prefixes);
      console.log('Stat rows:', hints.stat_rows);
      console.log('Notes:', hints.notes);
      console.log('Raw JSON:', JSON.stringify(hints, null, 2));
      console.groupEnd();

      this._cache.set(hash, hints);
      try { localStorage.setItem(cacheKey, JSON.stringify(hints)); } catch(e) {}

      const hallNames = (hints.halls || []).map(h => h.name).join(', ');
      const numRows = (hints.rack_number_rows || []).length;
      const customPfx = (hints.custom_type_prefixes || []).map(p => p.prefix).join(', ');
      statusEl.className = 'ai-status active done';
      statusEl.innerHTML = `<strong>AI found:</strong> ${hints.layout_type} layout<br>` +
        `Site: ${hints.site_name || '?'}<br>` +
        `Halls: ${hallNames || 'none'}<br>` +
        `Rack rows: ${numRows} number + ${(hints.rack_type_rows || []).length} type<br>` +
        `${hints.racks_per_row}/row, serpentine: ${hints.serpentine ? 'yes' : 'no'}<br>` +
        (customPfx ? `Custom types: ${customPfx}<br>` : '') +
        (hints.notes ? `<em>${hints.notes}</em>` : '');

      return hints;
    } catch (err) {
      statusEl.className = 'ai-status active error';
      statusEl.textContent = `AI analysis failed: ${err.message}. Falling back to rule-based parsing.`;
      console.error('AI analysis error:', err);
      return null;
    }
  },
};

// Initialize saved key
(function initAI() {
  const key = AI.getKey();
  if (key) document.getElementById('ai-key').value = key.replace(/./g, '*').slice(0, 20) + '...';
  document.getElementById('btn-save-key').addEventListener('click', () => {
    const input = document.getElementById('ai-key');
    const val = input.value.trim();
    if (val && !val.includes('*')) {
      AI.setKey(val);
      input.value = val.replace(/./g, '*').slice(0, 20) + '...';
      toast('API key saved');
    }
  });
  document.getElementById('ai-key').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-save-key').click();
  });
  document.getElementById('ai-key').addEventListener('focus', function() {
    if (this.value.includes('*')) this.value = '';
  });
  document.getElementById('ai-key').addEventListener('blur', function() {
    if (!this.value.trim()) {
      const key = AI.getKey();
      if (key) this.value = key.replace(/./g, '*').slice(0, 20) + '...';
    }
  });
})();
