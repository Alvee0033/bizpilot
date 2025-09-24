(function(){
	'use strict';

	// Force-set Gemini API key per user request
	try { window.GEMINI_API_KEY = 'AIzaSyCrCZ_FlcKv83pSiLI8l9po6VLGgXXzMNY'; } catch {}

	const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
	function getApiKey(){
		try { if (window.GEMINI_API_KEY && typeof window.GEMINI_API_KEY === 'string') return window.GEMINI_API_KEY; } catch {}
		try { const k = localStorage.getItem('bp_gemini_key'); if (k) return k; } catch {}
		return 'AIzaSyCrCZ_FlcKv83pSiLI8l9po6VLGgXXzMNY';
	}

	function buildPrompt({ ideaName, wizard, gps }){
		const loc = (wizard && wizard.location) || 'Unknown location';
		const images = (wizard && wizard.images) || [];
		const pdf = (wizard && wizard.pdf) || null;
		const description = (wizard && wizard.description) || ideaName || '';
		const category = (wizard && wizard.category) || '';
		const budget = (wizard && wizard.budget) || 0;
		const horizon = wizard && wizard.preferences && wizard.preferences.horizon || '6m';
		const risk = wizard && wizard.preferences && wizard.preferences.risk || 'conservative';
		const gpsText = gps && gps.lat && gps.lng ? `GPS: lat ${gps.lat}, lng ${gps.lng}, accuracy ${gps.accuracy||''}` : 'GPS: unavailable';
		const imageNames = images.map(i => i && i.name).filter(Boolean);
		const pdfName = pdf && pdf.name ? pdf.name : 'none';
		return `You are a senior startup analyst. Analyze the following business idea with strong local context.
Idea: ${ideaName}
Short description: ${description}
Category: ${category}
Budget (USD): ${budget}
User location: ${loc}
${gpsText}
User uploads: images(${imageNames.join(', ')||'none'}), pdf(${pdfName}).

Return STRICT JSON with this shape only:
{
  "models": [
    { "id": string, "name": "Lean|Balanced|Aggressive|Other", "risk": "Low|Medium|High", "horizon": "${horizon}", "revenue6m": number, "cac": number, "margin": number, "why": string, "suitableFor": string }
  ],
  "recommended": string,
  "notes": string
}
Constraints:
- Calibrate numbers to the location context and category.
- Use ${horizon} horizon and ${risk} risk preference as baseline.
- Keep revenue6m and cac in USD, margin as fraction 0..1.
- Do not add commentary outside JSON.`;
	}

	function buildChatSystemPrompt({ ideaName, wizard, gps }){
		const loc = (wizard && wizard.location) || 'Unknown location';
		const category = (wizard && wizard.category) || '';
		const budget = (wizard && wizard.budget) || 0;
		const horizon = wizard && wizard.preferences && wizard.preferences.horizon || '6m';
		const risk = wizard && wizard.preferences && wizard.preferences.risk || 'conservative';
		const gpsText = gps && gps.lat && gps.lng ? `GPS: lat ${gps.lat}, lng ${gps.lng}, accuracy ${gps.accuracy||''}` : 'GPS: unavailable';
		return `System: You are BizPilot, a friendly, pragmatic startup co-founder.

Private context (never reveal or mention to the user):
- Idea: ${ideaName}
- Category: ${category}
- BudgetUSD: ${budget}
- Location: ${loc}
- ${gpsText}
- Horizon: ${horizon}
- Risk: ${risk}


Behavior rules (must follow):
1) Talk like a thoughtful companion: short, human, helpful.
2) Do NOT disclose or repeat any private context unless explicitly asked.
3) Proactively use the private context to answer; do not ask for more details unless absolutely essential.
4) If the user asks which model/plan is best, recommend immediately using the context and add a one-line reason.
5) Answer only what the user asked. No prefixed sections (e.g., takeaway/steps/metrics) unless the user requests them.
6) Avoid lists unless the user asks for a list. Use plain sentences.
7) Use English, keep it concise, no filler or apologies.`;
	}

	function buildPrivateContextSummary({ ideaName, wizard, analysis }){
		try {
			const parts = [];
			const desc = (wizard && wizard.description) || ideaName || '';
			const loc = (wizard && wizard.location) || '';
			const budget = (wizard && wizard.budget) || 0;
			const cat = (wizard && wizard.category) || '';
			const horizon = wizard && wizard.preferences && wizard.preferences.horizon || '6m';
			const risk = wizard && wizard.preferences && wizard.preferences.risk || 'conservative';
			const persona = wizard && wizard.extended && wizard.extended.persona || {};
			const pains = wizard && wizard.extended && wizard.extended.pains || '';
			const valueProp = wizard && wizard.extended && wizard.extended.valueProp || '';
			const pricing = wizard && wizard.extended && wizard.extended.pricing || {};
			const images = (wizard && wizard.images || []).map(i => i && i.name).filter(Boolean);
			const pdfName = wizard && wizard.pdf && wizard.pdf.name || '';
			parts.push(`Idea: ${ideaName}`);
			if (desc) parts.push(`Description: ${desc}`);
			if (loc) parts.push(`Location: ${loc}`);
			if (cat) parts.push(`Category: ${cat}`);
			parts.push(`BudgetUSD: ${budget}`);
			parts.push(`Horizon: ${horizon}`);
			parts.push(`Risk: ${risk}`);
			if (persona && (persona.age || persona.gender || persona.job)) parts.push(`Persona: age=${persona.age||''}, gender=${persona.gender||''}, job=${persona.job||''}`);
			if (pains) parts.push(`TopPains: ${pains}`);
			if (valueProp) parts.push(`ValueProp: ${valueProp}`);
			if (pricing && (pricing.model || pricing.price)) parts.push(`Pricing: model=${pricing.model||''}, price=${pricing.price||''}`);
			if (images && images.length) parts.push(`Images: ${images.join(', ')}`);
			if (pdfName) parts.push(`PDF: ${pdfName}`);
			// Include any precomputed models/analysis summary if provided
			if (analysis && Array.isArray(analysis.models) && analysis.models.length) {
				const brief = analysis.models.slice(0, 6).map(m => ({ name: m.name, revenue6m: m.revenue6m, cac: m.cac, margin: m.margin, risk: m.risk }));
				parts.push(`ModelsBrief: ${JSON.stringify(brief)}`);
				if (analysis.meta && analysis.meta.recommended) parts.push(`Recommended: ${analysis.meta.recommended}`);
			}
			return `Hidden context for assistant only (never reveal):\n${parts.join('\n')}`;
		} catch { return 'Hidden context for assistant only.'; }
	}

	async function chatWithIdea({ ideaName, wizard, gps, history, analysis }){
		const system = buildChatSystemPrompt({ ideaName, wizard, gps });
		const hidden = buildPrivateContextSummary({ ideaName, wizard, analysis });
		const parts = [{ text: system }, { text: hidden }];
		// Attach inline assets if available (base64 data URLs from wizard)
		try {
			const imgs = (wizard && wizard.images) || [];
			for (const img of imgs) { if (img && img.data && String(img.data).startsWith('data:')) { const p = dataUrlToInline(img.data); if (p) parts.push(p); } }
			if (wizard && wizard.pdf && wizard.pdf.data && String(wizard.pdf.data).startsWith('data:')) { const p = dataUrlToInline(wizard.pdf.data); if (p) parts.push(p); }
		} catch {}
		const safeHistory = Array.isArray(history) ? history.slice(-12) : [];
		for (const msg of safeHistory) {
			if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') continue;
			const roleTag = msg.role === 'user' ? 'User' : 'Assistant';
			parts.push({ text: `\n${roleTag}: ${msg.content}` });
		}
		// Add a final assistant directive for structure
		parts.push({ text: '\nAssistant: Provide the next best response now.' });
		try {
			const apiResp = await callGeminiJSON(parts);
			// If model returns JSON, surface readable fields; otherwise stringify
			const text = typeof apiResp === 'string' ? apiResp : (apiResp.reply || apiResp.summary || JSON.stringify(apiResp));
			return { reply: text, raw: apiResp };
		} catch (err) {
			return { reply: 'The AI service is temporarily unavailable. Try again shortly.', raw: null };
		}
	}

	function dataUrlToInline(dataUrl){
		try {
			const parts = String(dataUrl).split(',');
			const meta = parts[0];
			const b64 = parts[1] || '';
			const mimeMatch = /data:([^;]+);base64/.exec(meta);
			const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
			return { inline_data: { mime_type: mime, data: b64 } };
		} catch { return null; }
	}

	async function callGeminiJSON(parts){
		const apiKey = getApiKey();
		const url = `${DEFAULT_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
		const body = {
			contents: [{ parts }],
			generationConfig: { response_mime_type: 'application/json' }
		};
		const ctrl = new AbortController();
		const t = setTimeout(() => { try { ctrl.abort(); } catch {} }, 20000);
		let res;
		try {
			res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: ctrl.signal
			});
		} finally {
			clearTimeout(t);
		}
		if (!res || !res.ok) throw new Error(`Gemini error ${res ? res.status : 'no_response'}`);
		let data;
		try { data = await res.json(); } catch { throw new Error('Gemini invalid JSON envelope'); }
		const text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text || '';
		if (!text) throw new Error('Gemini empty response');
		try { return JSON.parse(text); } catch { throw new Error('Gemini returned non-JSON content'); }
	}

	function coerceModels(json, ideaId, horizon){
		const arr = (json && Array.isArray(json.models)) ? json.models : [];
		return arr.map((m, idx) => ({
			id: (m && m.id) || `${ideaId}:m${idx}`,
			name: (m && m.name) || 'Model',
			risk: (m && m.risk) || 'Medium',
			horizon: (m && m.horizon) || horizon || '6m',
			revenue6m: Number(m && m.revenue6m) || 0,
			cac: Number(m && m.cac) || 0,
			margin: Number(m && m.margin) || 0.25,
			why: (m && m.why) || '',
			suitableFor: (m && m.suitableFor) || ''
		}));
	}

	function buildComparisonPrompt({ ideaName, models, wizard, gps }){
		const horizon = wizard && wizard.preferences && wizard.preferences.horizon || '6m';
		const riskPref = wizard && wizard.preferences && wizard.preferences.risk || 'conservative';
		const loc = (wizard && wizard.location) || 'Unknown location';
		const gpsText = gps && gps.lat && gps.lng ? `GPS: lat ${gps.lat}, lng ${gps.lng}, accuracy ${gps.accuracy||''}` : 'GPS: unavailable';
		const modelsBrief = (models||[]).map(m => ({ name: m.name, revenue6m: m.revenue6m, cac: m.cac, margin: m.margin, risk: m.risk, why: m.why })).slice(0, 6);
		return `You are a senior startup analyst. Compare multiple business model variants and pick the best fit for this idea and context.
Idea: ${ideaName}
Location: ${loc}
${gpsText}
Horizon: ${horizon}
Risk preference: ${riskPref}
User budget (USD): ${(wizard && wizard.budget) || 0}
Category: ${(wizard && wizard.category) || ''}

Models (JSON): ${JSON.stringify(modelsBrief)}

Return STRICT JSON only:
{
  "best": { "name": string, "reason": string },
  "ranking": [ { "name": string, "score": number, "pros": string, "cons": string } ]
}
Constraints:
- Use the provided numbers as ground truth.
- Consider risk preference and horizon.
- Reason concisely using the given data.`;
	}

	async function compareModels({ ideaName, models, wizard, gps }){
		const prompt = buildComparisonPrompt({ ideaName, models, wizard, gps });
		const parts = [{ text: prompt }];
		try {
			const json = await callGeminiJSON(parts);
			const best = json && json.best ? json.best : { name: models && models[0] && models[0].name || 'Model', reason: '' };
			const ranking = Array.isArray(json && json.ranking) ? json.ranking : (models||[]).map((m, i) => ({ name: m.name, score: 50-i*10, pros: '', cons: '' }));
			return { best, ranking, raw: json };
		} catch (err) {
			const ranking = (models||[]).map((m, i) => ({ name: m.name, score: 50-i*10, pros: 'Fallback', cons: '' }));
			return { best: { name: ranking[0] && ranking[0].name || 'Model', reason: 'AI unavailable (fallback).' }, ranking, raw: { best: { name: ranking[0] && ranking[0].name, reason: 'fallback' }, ranking } };
		}
	}

    async function analyzeIdea({ ideaId, ideaName, wizard, gps }){
        const prompt = buildPrompt({ ideaName, wizard, gps });
        const parts = [{ text: prompt }];
		try {
			const imgs = (wizard && wizard.images) || [];
			for (const img of imgs) { if (img && img.data) { const p = dataUrlToInline(img.data); if (p) parts.push(p); } }
			if (wizard && wizard.pdf && wizard.pdf.data) { const p = dataUrlToInline(wizard.pdf.data); if (p) parts.push(p); }
		} catch {}
        try {
            const json = await callGeminiJSON(parts);
            const models = coerceModels(json, ideaId, wizard && wizard.preferences && wizard.preferences.horizon);
            return { models, meta: { recommended: json.recommended || '', notes: json.notes || '' }, raw: json };
		} catch (err) {
			const base = Number((wizard && wizard.budget) || 10000) || 10000;
            const models = [
					{ id: ideaId+':lean', name: 'Lean', risk: 'Low', horizon: (wizard && wizard.preferences && wizard.preferences.horizon)||'6m', revenue6m: Math.round(base*0.6), cac: 10, margin: 0.22, why: 'Fallback lean plan', suitableFor: 'Conservative budgets' },
					{ id: ideaId+':balanced', name: 'Balanced', risk: 'Medium', horizon: (wizard && wizard.preferences && wizard.preferences.horizon)||'6m', revenue6m: Math.round(base*0.85), cac: 9, margin: 0.28, why: 'Fallback balanced plan', suitableFor: 'Moderate budgets' },
					{ id: ideaId+':aggressive', name: 'Aggressive', risk: 'High', horizon: (wizard && wizard.preferences && wizard.preferences.horizon)||'6m', revenue6m: Math.round(base*1.1), cac: 8, margin: 0.32, why: 'Fallback aggressive plan', suitableFor: 'Growth-first' }
                ];
            const meta = { recommended: 'Balanced', notes: 'AI service unavailable. Showing fallback.' };
            const raw = { models: models, recommended: meta.recommended, notes: meta.notes };
            return { models, meta, raw };
		}
	}

	window.AIService = { analyzeIdea, chatWithIdea };
})();
