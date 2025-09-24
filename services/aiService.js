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

	async function analyzeFinancialData({ ideaName, data, context }){
		const parts = [
			{ text: `You are a financial analyst. Analyze the following financial data for the business idea "${ideaName}" and provide comprehensive insights and chart data in JSON format.` },
			{ text: `Business Context: ${context ? JSON.stringify(context) : 'No additional context provided'}` },
			{ text: `Data Type: ${data.type}` },
			{ text: `Total Rows: ${data.rows.length}` },
			{ text: `Columns: ${data.columns.join(', ')}` }
		];

		// Add the plain text data for AI analysis
		if (data.plainText) {
			parts.push({ text: `Financial Data (Plain Text Format):\n${data.plainText}` });
		} else {
			// Fallback to structured data if plain text not available
			parts.push({ text: `Sample Data (first 5 rows): ${JSON.stringify(data.rows.slice(0, 5))}` });
		}

		parts.push({ 
			text: `Based on the financial data provided, analyze and return a JSON response with this exact structure:
			{
				"insights": ["insight1", "insight2", "insight3"],
				"chartData": {
					"revenue": {
						"labels": ["Q1", "Q2", "Q3", "Q4"],
						"data": [1000, 1500, 2000, 2500]
					},
					"costs": {
						"labels": ["COGS", "Marketing", "Operations"],
						"data": [40, 30, 30]
					},
					"cacltv": {
						"labels": ["Q1", "Q2", "Q3", "Q4"],
						"cac": [50, 45, 40, 35],
						"ltv": [200, 220, 250, 280]
					},
					"kpi": {
						"labels": ["Growth", "Retention", "Margin", "Reach", "Satisfaction"],
						"target": [80, 85, 70, 75, 90],
						"current": [60, 70, 55, 65, 80]
					}
				},
				"recommendations": ["recommendation1", "recommendation2"],
				"riskAssessment": "Low/Medium/High",
				"growthPotential": "Conservative/Moderate/Aggressive"
			}
			
			Instructions:
			- Analyze the actual data provided and extract meaningful financial patterns
			- If the data contains revenue, costs, customer metrics, or other financial indicators, use those to generate realistic projections
			- If the data is limited, provide reasonable estimates based on the business context and industry standards
			- Ensure all chart data arrays have the same length as their corresponding labels arrays
			- Make insights specific to the data patterns you observe
			- Return ONLY valid JSON, no additional text or explanations`
		});

		try {
			const json = await callGeminiJSON(parts);
			console.log('AI Financial Analysis Result:', json);
			return json;
		} catch (err) {
			console.error('Error during financial analysis:', err);
			// Return fallback data structure
			return {
				insights: ['Data analysis failed - using fallback projections', 'Please check your data format and try again'],
				chartData: {
					revenue: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], data: [1000, 1200, 1400, 1600] },
					costs: { labels: ['COGS', 'Marketing', 'Operations'], data: [45, 30, 25] },
					cacltv: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], cac: [50, 45, 40, 35], ltv: [200, 220, 250, 280] },
					kpi: { labels: ['Growth', 'Retention', 'Margin', 'Reach', 'Satisfaction'], target: [80, 85, 70, 75, 90], current: [60, 70, 55, 65, 80] }
				},
				recommendations: ['Review data format', 'Ensure numeric columns are properly formatted'],
				riskAssessment: 'Medium',
				growthPotential: 'Moderate'
			};
		}
	}

	async function analyzeIdeaWithPlainText({ ideaId, ideaName, plainTextData }){
		const parts = [
			{ text: `You are a senior business analyst. Analyze the following business idea and provide 3 distinct business models in JSON format.` },
			{ text: `Business Idea Data:\n${plainTextData}` },
			{ text: `Return STRICT JSON with this exact structure:
			{
				"models": [
					{ 
						"id": "model1", 
						"name": "Model Name", 
						"risk": "Low/Medium/High", 
						"horizon": "6m/1y/2y", 
						"revenue6m": number, 
						"cac": number, 
						"margin": number, 
						"why": "explanation", 
						"suitableFor": "target scenario",
						"strengths": ["strength1", "strength2", "strength3"],
						"weaknesses": ["weakness1", "weakness2", "weakness3"],
						"score": number
					}
				],
				"recommended": "Model Name",
				"analysis": "Detailed analysis of why the recommended model is best",
				"insights": ["insight1", "insight2", "insight3"],
				"ranking": [
					{ "name": "Model Name", "score": number, "reason": "why this model ranks here" }
				]
			}
			
			Instructions:
			- Analyze the business idea thoroughly
			- Create 3 distinct business models (e.g., Lean, Balanced, Aggressive)
			- Provide realistic financial projections based on the idea context
			- Recommend the most suitable model with detailed reasoning
			- Return ONLY valid JSON, no additional text` }
		];

		try {
			const json = await callGeminiJSON(parts);
			console.log('AI Model Analysis Result:', json);
			return json;
		} catch (err) {
			console.error('Error during model analysis:', err);
			// Return fallback models
			return {
				models: [
					{ 
						id: 'lean', 
						name: 'Lean Model', 
						risk: 'Low', 
						horizon: '6m', 
						revenue6m: 15000, 
						cac: 25, 
						margin: 0.3, 
						why: 'Conservative approach with low risk', 
						suitableFor: 'Limited budget scenarios',
						strengths: ['Low initial investment', 'Quick to market', 'Low risk'],
						weaknesses: ['Limited scalability', 'Lower profit margins', 'Slower growth'],
						score: 75
					},
					{ 
						id: 'balanced', 
						name: 'Balanced Model', 
						risk: 'Medium', 
						horizon: '1y', 
						revenue6m: 35000, 
						cac: 20, 
						margin: 0.4, 
						why: 'Balanced growth with moderate risk', 
						suitableFor: 'Standard business scenarios',
						strengths: ['Steady growth', 'Good risk-reward ratio', 'Sustainable'],
						weaknesses: ['Moderate competition', 'Requires more capital', 'Medium complexity'],
						score: 85
					},
					{ 
						id: 'aggressive', 
						name: 'Aggressive Model', 
						risk: 'High', 
						horizon: '2y', 
						revenue6m: 75000, 
						cac: 15, 
						margin: 0.5, 
						why: 'High growth potential with higher risk', 
						suitableFor: 'Growth-focused scenarios',
						strengths: ['High growth potential', 'Market leadership', 'High margins'],
						weaknesses: ['High risk', 'Requires significant capital', 'Complex execution'],
						score: 70
					}
				],
				recommended: 'Balanced Model',
				analysis: 'AI analysis failed - showing fallback models',
				insights: ['Analysis service unavailable', 'Using default model recommendations'],
				ranking: [
					{ name: 'Balanced Model', score: 85, reason: 'Best overall risk-reward ratio' },
					{ name: 'Lean Model', score: 75, reason: 'Good for beginners with limited capital' },
					{ name: 'Aggressive Model', score: 70, reason: 'High potential but requires significant resources' }
				]
			};
		}
	}

	async function analyzeLocationViability({ businessData, locationData }){
		const parts = [
			{ text: `You are a business location analyst. Analyze if this business will survive and thrive in the specified location.` },
			{ text: `Business Information:
			- Name: ${businessData.title || 'Business'}
			- Description: ${businessData.description || 'No description'}
			- Category: ${businessData.category || 'General'}
			- Budget: $${businessData.budget || 0}
			- Target Market: ${businessData.age || 'Not specified'} age, ${businessData.gender || 'Not specified'} gender
			- Pricing: $${businessData.price || 0} (${businessData.pricingModel || 'Not specified'})
			- Value Proposition: ${businessData.valueProp || 'Not specified'}` },
			{ text: `Location Information:
			- Address: ${locationData.address || 'Not specified'}
			- Coordinates: ${locationData.lat}, ${locationData.lng}
			- City: ${locationData.city || 'Not specified'}
			- State/Region: ${locationData.state || 'Not specified'}
			- Country: ${locationData.country || 'Not specified'}
			- Population: ${locationData.population || 'Not available'}
			- Economic Indicators: ${locationData.economicData || 'Not available'}` },
			{ text: `Return STRICT JSON with this exact structure:
			{
				"survivalScore": number (0-100),
				"viability": "High/Medium/Low",
				"keyFactors": ["factor1", "factor2", "factor3"],
				"marketAnalysis": {
					"demand": "High/Medium/Low",
					"competition": "High/Medium/Low",
					"accessibility": "High/Medium/Low",
					"economicClimate": "Favorable/Neutral/Challenging"
				},
				"risks": ["risk1", "risk2", "risk3"],
				"opportunities": ["opportunity1", "opportunity2", "opportunity3"],
				"recommendations": ["recommendation1", "recommendation2", "recommendation3"],
				"alternativeLocations": ["location1", "location2"],
				"summary": "Detailed summary of location viability"
			}
			
			Instructions:
			- Analyze the business model against the location's characteristics
			- Consider market demand, competition, accessibility, and economic factors
			- Provide a survival score from 0-100
			- Identify key risks and opportunities
			- Suggest alternative locations if current location is not ideal
			- Return ONLY valid JSON, no additional text` }
		];

		try {
			const json = await callGeminiJSON(parts);
			console.log('AI Location Analysis Result:', json);
			return json;
		} catch (err) {
			console.error('Error during location analysis:', err);
			// Return fallback analysis
			return {
				survivalScore: 65,
				viability: 'Medium',
				keyFactors: ['Market demand analysis needed', 'Competition assessment required', 'Economic climate evaluation needed'],
				marketAnalysis: {
					demand: 'Medium',
					competition: 'Medium',
					accessibility: 'Medium',
					economicClimate: 'Neutral'
				},
				risks: ['Limited market data available', 'Competition analysis incomplete'],
				opportunities: ['Market research needed', 'Local partnerships potential'],
				recommendations: ['Conduct detailed market research', 'Analyze local competition', 'Evaluate economic indicators'],
				alternativeLocations: ['Nearby cities', 'Adjacent neighborhoods'],
				summary: 'AI analysis service unavailable. Please conduct manual market research for accurate location viability assessment.'
			};
		}
	}

	async function generateBusinessTasks({ ideaData, locationData, businessModel }){
		const parts = [
			{ text: `You are a business growth consultant. Generate specific, actionable tasks to help this business grow and succeed.` },
			{ text: `Business Information:
			- Name: ${ideaData.title || 'Business'}
			- Description: ${ideaData.description || 'No description'}
			- Category: ${ideaData.category || 'General'}
			- Budget: $${ideaData.budget || 0}
			- Location: ${ideaData.location || 'Not specified'}
			- Target Market: ${ideaData.age || 'Not specified'} age, ${ideaData.gender || 'Not specified'} gender
			- Value Proposition: ${ideaData.valueProp || 'Not specified'}
			- Pricing: $${ideaData.price || 0} (${ideaData.pricingModel || 'Not specified'})` },
			{ text: `Location Context:
			- Address: ${locationData.address || 'Not specified'}
			- Coordinates: ${locationData.lat}, ${locationData.lng}
			- Market Analysis: Consider local competition, demographics, and economic factors` },
			{ text: `Business Model: ${businessModel || 'General business model'}` },
			{ text: `Return STRICT JSON with this exact structure:
			{
				"tasks": [
					{
						"id": "task1",
						"title": "Task title",
						"category": "Setup/Marketing/Operations/Finance/Legal",
						"priority": "High/Medium/Low",
						"timeline": "1-2 weeks/1 month/2-3 months",
						"description": "Detailed description of what needs to be done",
						"resources": ["resource1", "resource2"],
						"successMetrics": "How to measure success"
					}
				],
				"summary": "Overall strategy summary",
				"nextSteps": ["immediate action 1", "immediate action 2"]
			}
			
			Instructions:
			- Generate 8-12 specific, actionable tasks
			- Consider the business type, location, and target market
			- Include tasks for setup, marketing, operations, and growth
			- Prioritize tasks based on business needs and timeline
			- Make tasks location-specific and industry-relevant
			- Return ONLY valid JSON, no additional text` }
		];

		try {
			const json = await callGeminiJSON(parts);
			console.log('AI Task Generation Result:', json);
			return json;
		} catch (err) {
			console.error('Error during task generation:', err);
			// Return fallback tasks
			return {
				tasks: [
					{
						id: "task1",
						title: "Register business domain and social media handles",
						category: "Setup",
						priority: "High",
						timeline: "1-2 weeks",
						description: "Secure your online presence with a professional domain and consistent social media handles",
						resources: ["Domain registrar", "Social media platforms"],
						successMetrics: "Domain registered, social handles secured"
					},
					{
						id: "task2",
						title: "Create brand identity and marketing materials",
						category: "Marketing",
						priority: "High",
						timeline: "2-3 weeks",
						description: "Develop logo, color scheme, and basic marketing materials for brand consistency",
						resources: ["Design tools", "Brand guidelines"],
						successMetrics: "Logo created, brand kit completed"
					},
					{
						id: "task3",
						title: "Set up payment processing system",
						category: "Finance",
						priority: "High",
						timeline: "1-2 weeks",
						description: "Choose and integrate payment gateway for customer transactions",
						resources: ["Payment processors", "Bank account"],
						successMetrics: "Payment system operational"
					}
				],
				summary: "Focus on establishing online presence, brand identity, and payment processing for business launch",
				nextSteps: ["Register domain", "Create brand materials", "Set up payments"]
			};
		}
	}

	// Enhanced chat function with web search support
	async function chatWithIdeaEnhanced({ ideaName, wizard, gps, history, analysis, webSearchResults }){
		const system = buildChatSystemPrompt({ ideaName, wizard, gps });
		const hidden = buildPrivateContextSummary({ ideaName, wizard, analysis });
		const parts = [{ text: system }, { text: hidden }];
		
		// Add web search results if available
		if (webSearchResults && webSearchResults.length > 0) {
			const searchContext = `Current web search results for context:\n${webSearchResults.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}`;
			parts.push({ text: searchContext });
		}
		
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
		parts.push({ text: '\nAssistant: Provide a helpful, well-formatted response. Use **bold** for emphasis, *italics* for subtle emphasis, and `code` for technical terms. Keep responses conversational and actionable.' });
		
		try {
			const apiResp = await callGeminiPlainText(parts);
			// Ensure we return plain text, not JSON
			const text = typeof apiResp === 'string' ? apiResp : (apiResp.reply || apiResp.summary || 'I apologize, but I encountered an issue processing your request.');
			return { reply: text, raw: apiResp };
		} catch (err) {
			console.error('Enhanced chat error:', err);
			return { reply: 'I apologize, but I encountered an issue processing your request. Please try again shortly.', raw: null };
		}
	}

	// Call Gemini API for plain text responses (not JSON)
	async function callGeminiPlainText(parts){
		const apiKey = getApiKey();
		const url = `${DEFAULT_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
		const body = {
			contents: [{ parts }],
			generationConfig: { 
				response_mime_type: 'text/plain',
				temperature: 0.7,
				maxOutputTokens: 2048
			}
		};
		const ctrl = new AbortController();
		const t = setTimeout(() => { try { ctrl.abort(); } catch {} }, 30000);
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
		return text;
	}

	window.AIService = { analyzeIdea, chatWithIdea, chatWithIdeaEnhanced, analyzeFinancialData, analyzeIdeaWithPlainText, analyzeLocationViability, generateBusinessTasks };
})();
