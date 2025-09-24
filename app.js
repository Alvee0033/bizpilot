(function() {
	'use strict';

	// Simple global store with localStorage persistence
	const Store = (function() {
		const STORAGE_KEY = 'bp_store_v1';
		let listeners = new Set();
		let state = {
			profile: { language: 'en', stage: 'Idea', user: null },
			ideas: {
				items: [
					{ id: cryptoRandomId(), name: 'Eco Shoes - Dhaka' },
					{ id: cryptoRandomId(), name: 'Cloud Kitchen - Banani' },
					{ id: cryptoRandomId(), name: 'Freelance Dev Agency' }
				],
				selectedId: null,
				filter: ''
			},
			wizard: {
				title: '',
				description: '',
				location: 'Dhaka, Bangladesh',
				budget: 10000,
				category: 'Fashion',
				voiceNoteBlobUrl: null,
				images: [],
				pdf: null,
				preferences: { horizon: '6m', risk: 'conservative' },
				extended: {
					persona: { age: '', gender: '', job: '' },
					pains: '',
					valueProp: '',
					pricing: { model: 'one_time', price: '' }
				}
			}
		};
		function cryptoRandomId() {
			try { return crypto.randomUUID(); } catch { return 'id_' + Math.random().toString(36).slice(2); }
		}
		function load() {
			try {
				const raw = localStorage.getItem(STORAGE_KEY);
				if (raw) {
					const parsed = JSON.parse(raw);
					state = Object.assign(state, parsed);
				}
			} catch {}
		}
		function persist() {
			try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
		}
		function set(partial) {
			state = deepMerge(state, partial);
			persist();
			listeners.forEach(fn => { try { fn(state); } catch {} });
		}
		function get() { return state; }
		function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
		function deepMerge(target, source) {
			if (!source || typeof source !== 'object') return target;
			for (const key of Object.keys(source)) {
				const s = source[key];
				if (s && typeof s === 'object' && !Array.isArray(s)) {
					target[key] = deepMerge(target[key] || {}, s);
				} else {
					target[key] = s;
				}
			}
			return target;
		}
		load();
		return { get, set, subscribe, cryptoRandomId };
	})();

	const views = {
		landing: document.getElementById('view-landing'),
		wizard: document.getElementById('view-wizard'),
		dashboard: document.getElementById('view-dashboard'),
		profile: document.getElementById('view-profile')
	};

	// Router
	function route() {
		const hash = window.location.hash || '#/';
		const path = hash.replace('#/', '') || '';
	Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
	switch (path) {
			case '':
				if (location.pathname.endsWith('dashboard.html') && views.dashboard) {
					views.dashboard.classList.add('active');
				} else if (location.pathname.endsWith('wizard.html') && views.wizard) {
					views.wizard.classList.add('active');
				} else if (views.landing) {
					views.landing.classList.add('active');
				}
				break;
			case 'wizard':
				if (!isAuthenticated()) { window.location.href = './login.html'; return; }
				if (!location.pathname.endsWith('wizard.html')) window.location.href = './wizard.html';
				break;
			case 'dashboard':
				if (!isAuthenticated()) { window.location.href = './login.html'; return; }
				if (views.dashboard) views.dashboard.classList.add('active');
				break;
			case 'profile':
				if (!isAuthenticated()) { window.location.href = './login.html'; return; }
				if (views.profile) views.profile.classList.add('active');
				break;
			default:
				if (views.landing) views.landing.classList.add('active');
		}
	}
	function isAuthenticated() {
		try { const u = JSON.parse(localStorage.getItem('bp_user')||'null'); return Boolean(u && u.uid); } catch { return false; }
	}

	window.addEventListener('hashchange', route);
	window.addEventListener('load', () => {
		route();
		const yearEl = document.getElementById('year');
		if (yearEl) yearEl.textContent = String(new Date().getFullYear());
		loadSettings();
		initLanding();
		initWizard();
		initDashboard();
		initHeaderProfile();
		initProfile();
		initReveals();
	});
	function loadSettings() {
		try {
			// Ensure default wizard shape before any reads
			ensureWizardShape();
			const lang = localStorage.getItem('bp_language');
			if (lang) Store.set({ profile: { language: lang } });
			const userJson = localStorage.getItem('bp_user');
            if (userJson) {
				const user = JSON.parse(userJson);
				Store.set({ profile: { user } });
				if (window.DB && user && user.uid) {
					window.DB.loadUserData(user.uid).then(({ profile, wizard, ideas }) => {
						if (profile) Store.set({ profile });
						if (wizard) { Store.set({ wizard }); ensureWizardShape(); }
                        // Merge remote ideas with local ones; do not overwrite with empty
                        try {
                            const current = Store.get().ideas || { items: [], selectedId: null, filter: '' };
                            const remote = Array.isArray(ideas) ? ideas : [];
                            const map = new Map();
                            for (const it of current.items || []) { if (it && it.id) map.set(it.id, { id: it.id, name: String(it.name||'Idea') }); }
                            for (const it of remote) { if (it && it.id) map.set(it.id, { id: it.id, name: String(it.name||'Idea') }); }
                            const combined = Array.from(map.values());
                            const selectedId = current.selectedId || (combined[0] && combined[0].id) || null;
                            Store.set({ ideas: { items: combined, selectedId } });
                        } catch {}
					}).catch(() => {});
				}
			}
			// Select first idea by default if none
			const st = Store.get();
			if (!st.ideas.selectedId && st.ideas.items.length) {
				Store.set({ ideas: { selectedId: st.ideas.items[0].id } });
			}
		} catch {}
	}

	function ensureWizardShape() {
		const w = Store.get().wizard || {};
		const extended = w.extended || {};
		const persona = extended.persona || {};
		const pricing = extended.pricing || {};
		Store.set({ wizard: {
			title: typeof w.title === 'string' ? w.title : '',
			description: typeof w.description === 'string' ? w.description : '',
			location: typeof w.location === 'string' ? w.location : 'Dhaka, Bangladesh',
			budget: typeof w.budget === 'number' ? w.budget : 10000,
			category: typeof w.category === 'string' ? w.category : 'Fashion',
			preferences: w.preferences || { horizon: '6m', risk: 'conservative' },
			extended: {
				persona: {
					age: typeof persona.age === 'string' ? persona.age : '',
					gender: typeof persona.gender === 'string' ? persona.gender : '',
					job: typeof persona.job === 'string' ? persona.job : ''
				},
				pains: typeof extended.pains === 'string' ? extended.pains : '',
				valueProp: typeof extended.valueProp === 'string' ? extended.valueProp : '',
				pricing: {
					model: typeof pricing.model === 'string' ? pricing.model : 'one_time',
					price: typeof pricing.price === 'string' ? pricing.price : ''
				}
			}
		}});
	}

	// Landing demo
	function initLanding() {
		const input = document.getElementById('demo-input');
		const run = document.getElementById('demo-run');
		const out = document.getElementById('demo-output');
		if (!input || !run || !out) return;
		run.addEventListener('click', () => {
			const q = (input.value || 'eco-friendly shoes in Dhaka').trim();
			out.textContent = 'Generating quick preview...';
			setTimeout(() => {
				out.innerHTML = `Idea: ${q}
				<ul>
					<li>Target: urban professionals (22-35)</li>
					<li>Est. budget: $8k - $15k</li>
					<li>Channels: Instagram, local marketplaces</li>
				</ul>`;
			}, 600);
		});
	}

	function initReveals() {
		const els = Array.from(document.querySelectorAll('.reveal'));
		if (!('IntersectionObserver' in window) || els.length === 0) {
			els.forEach(el => el.classList.add('visible'));
			return;
		}
		const io = new IntersectionObserver((entries) => {
			entries.forEach(e => {
				if (e.isIntersecting) {
					e.target.classList.add('visible');
					io.unobserve(e.target);
				}
			});
		}, { threshold: 0.15 });
		els.forEach(el => io.observe(el));
	}

/* floating testimonials removed */

	// Auth UI removed to standalone login.html

	// Wizard
	let currentStep = 1;
	function initWizard() {
		const prevBtn = document.getElementById('prev-step');
		const nextBtn = document.getElementById('next-step');
		const budget = document.getElementById('budget');
		const budgetValue = document.getElementById('budget-value');
		const ideaTitle = document.getElementById('idea-title');
		const ideaDesc = document.getElementById('idea-desc');
		if (ideaTitle) ideaTitle.addEventListener('input', () => { Store.set({ wizard: { title: String(ideaTitle.value) } }); const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeWizard(user.uid, Store.get().wizard); });
		const ideaLoc = document.getElementById('idea-location');
		const category = document.getElementById('category');
		const voiceBtn = document.getElementById('voice-btn');
		const voiceStatus = document.getElementById('voice-status');
		const imgUpload = document.getElementById('image-upload');
		const imgPreview = document.getElementById('image-preview');
		const pdfUpload = document.getElementById('pdf-upload');
		const pdfPreview = document.getElementById('pdf-preview');
		const summary = document.getElementById('wizard-summary');
		// Extended fields
		const personaAge = document.getElementById('persona-age');
		const personaGender = document.getElementById('persona-gender');
		const personaJob = document.getElementById('persona-job');
		const pains = document.getElementById('pains');
		const valueProp = document.getElementById('value-prop');
		const pricingModel = document.getElementById('pricing-model');
		const pricingPrice = document.getElementById('pricing-price');
		const dictateBtn = document.getElementById('dictate-btn');
		const dictateCanvas = document.getElementById('dictate-canvas');
		let audioCtx = null, analyser = null, mediaStream = null, raf = 0;
		let recognition = null; let recognizing = false;
		let finalText = '';
		let rafUpdate = 0; let pendingValue = null;

		if (budget && budgetValue) {
			budget.addEventListener('input', () => {
				budgetValue.textContent = `$${Number(budget.value).toLocaleString()}`;
				Store.set({ wizard: { budget: Number(budget.value) } });
				const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeWizard(user.uid, Store.get().wizard);
				// Fill gradient up to thumb
				const min = Number(budget.min)||0, max = Number(budget.max)||100;
				const pct = Math.round(((Number(budget.value)-min)/(max-min))*100);
				budget.style.background = `linear-gradient(90deg, var(--primary) 0%, var(--primary) ${pct}%, #ece7dd ${pct}%, #ece7dd 100%)`;
			});
		}
		if (ideaDesc) ideaDesc.addEventListener('input', () => { Store.set({ wizard: { description: String(ideaDesc.value) } }); const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeWizard(user.uid, Store.get().wizard); });
		if (ideaLoc) ideaLoc.addEventListener('input', () => { Store.set({ wizard: { location: String(ideaLoc.value) } }); const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeWizard(user.uid, Store.get().wizard); });
		if (category) category.addEventListener('change', () => { Store.set({ wizard: { category: String(category.value) } }); const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeWizard(user.uid, Store.get().wizard); });

		// Extended listeners
		if (personaAge) personaAge.addEventListener('input', () => Store.set({ wizard: { extended: { persona: { age: String(personaAge.value), gender: Store.get().wizard.extended.persona.gender, job: Store.get().wizard.extended.persona.job } } } }));
		if (personaGender) personaGender.addEventListener('change', () => Store.set({ wizard: { extended: { persona: { age: Store.get().wizard.extended.persona.age, gender: String(personaGender.value), job: Store.get().wizard.extended.persona.job } } } }));
		if (personaJob) personaJob.addEventListener('input', () => Store.set({ wizard: { extended: { persona: { age: Store.get().wizard.extended.persona.age, gender: Store.get().wizard.extended.persona.gender, job: String(personaJob.value) } } } }));
		if (pains) pains.addEventListener('input', () => Store.set({ wizard: { extended: { pains: String(pains.value) } } }));
		if (valueProp) valueProp.addEventListener('input', () => Store.set({ wizard: { extended: { valueProp: String(valueProp.value) } } }));
		if (pricingModel) pricingModel.addEventListener('change', () => Store.set({ wizard: { extended: { pricing: { model: String(pricingModel.value), price: Store.get().wizard.extended.pricing.price } } } }));
		if (pricingPrice) pricingPrice.addEventListener('input', () => Store.set({ wizard: { extended: { pricing: { model: Store.get().wizard.extended.pricing.model, price: String(pricingPrice.value) } } } }));

		if (imgUpload && imgPreview) {
			imgUpload.addEventListener('change', async () => {
				imgPreview.innerHTML = '';
				const files = Array.from(imgUpload.files || []).slice(0, 6);
				// Preview using object URLs
				for (const file of files) {
					const url = URL.createObjectURL(file);
					const img = document.createElement('img');
					img.src = url;
					img.alt = file.name;
					imgPreview.appendChild(img);
				}
				// Persist as base64 in state for Firestore
				async function toBase64(f){ return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
				const images = [];
				for (const f of files) {
					try { const dataUrl = await toBase64(f); images.push({ name: f.name, data: String(dataUrl) }); } catch {}
				}
				Store.set({ wizard: { images } });
				const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeWizard(user.uid, Store.get().wizard);
			});
		}

		if (pdfUpload && pdfPreview) {
			pdfUpload.addEventListener('change', async () => {
				pdfPreview.innerHTML = '';
				const file = (pdfUpload.files && pdfUpload.files[0]) || null;
				if (file) {
					const div = document.createElement('div');
					div.textContent = `Selected: ${file.name}`;
					pdfPreview.appendChild(div);
					// Read as base64
					async function toBase64(f){ return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
					let pdf = null;
					try { const dataUrl = await toBase64(file); pdf = { name: file.name, data: String(dataUrl) }; } catch {}
					Store.set({ wizard: { pdf } });
					const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeWizard(user.uid, Store.get().wizard);
				}
			});
		}

		if (voiceBtn && voiceStatus) {
			let recording = false;
			let mediaRecorder = null;
			let chunks = [];
			voiceBtn.addEventListener('click', async () => {
				try {
					if (!recording) {
						const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
						mediaRecorder = new MediaRecorder(stream);
						chunks = [];
						mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
						mediaRecorder.onstop = () => {
							const blob = new Blob(chunks, { type: 'audio/webm' });
							const url = URL.createObjectURL(blob);
							Store.set({ wizard: { voiceNoteBlobUrl: url } });
							voiceStatus.textContent = 'Recorded voice note';
							voiceBtn.textContent = 'Start Recording';
							recording = false;
						const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeWizard(user.uid, Store.get().wizard);
						};
						mediaRecorder.start();
						recording = true;
						voiceStatus.textContent = 'Recording...';
						voiceBtn.textContent = 'Stop';
					} else {
						mediaRecorder && mediaRecorder.stop();
					}
				} catch (err) {
					voiceStatus.textContent = 'Microphone access denied';
				}
			});
		}

		function setStep(step) {
			currentStep = step;
			const steps = Array.from(document.querySelectorAll('.wizard-step'));
			steps.forEach(s => s.toggleAttribute('hidden', String(s.getAttribute('data-step')) !== String(step)));
			const dots = Array.from(document.querySelectorAll('.step'));
			dots.forEach(d => d.classList.toggle('active', String(d.getAttribute('data-step')) === String(step)));
			const prev = document.getElementById('prev-step');
			const next = document.getElementById('next-step');
			if (prev) prev.disabled = step === 1;
			if (next) next.textContent = step === 3 ? 'Generate' : 'Next';
		if (step === 3 && summary) {
				summary.innerHTML = renderSummary();
			}
		}

		if (prevBtn) prevBtn.addEventListener('click', () => setStep(Math.max(1, currentStep - 1)));
		if (nextBtn) nextBtn.addEventListener('click', () => {
			if (currentStep < 3) {
				setStep(currentStep + 1);
			} else {
				// Generate: persist current wizard and add to ideas, then go to dashboard
				const st = Store.get();
				const ideaTitle = (st.wizard.title || st.wizard.description || 'New Idea').trim();
				const name = ideaTitle.length > 60 ? ideaTitle.slice(0, 57) + '…' : ideaTitle;
				const id = Store.cryptoRandomId();
				Store.set({ ideas: { items: [...st.ideas.items, { id, name }], selectedId: id } });
				const user = Store.get().profile.user;
				if (window.DB && user && user.uid) {
					try { window.DB.writeWizard(user.uid, Store.get().wizard); } catch {}
					try { window.DB.writeIdeas(user.uid, Store.get().ideas.items); } catch {}
				}
				// Go to dedicated dashboard page
				window.location.href = './dashboard.html';
			}
		});

		// Speech-to-text with live waveform
		if (dictateBtn) {
			const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
			if (SpeechRecognition) {
				recognition = new SpeechRecognition();
				recognition.lang = 'en-US';
				recognition.interimResults = true;
				recognition.continuous = true;
				recognition.maxAlternatives = 1;
				recognition.onresult = (e) => {
					let interim = '';
					for (let i = e.resultIndex; i < e.results.length; i++) {
						const res = e.results[i];
						const text = res[0].transcript;
						if (res.isFinal) {
							finalText += text + ' ';
						} else {
							interim = text;
						}
					}
					const nextVal = (finalText + interim).replace(/\s+/g,' ').trim();
					if (ideaDesc && nextVal !== pendingValue) {
						pendingValue = nextVal;
						if (!rafUpdate) {
							rafUpdate = requestAnimationFrame(() => {
								ideaDesc.value = pendingValue;
								Store.set({ wizard: { description: ideaDesc.value } });
								rafUpdate = 0;
							});
						}
					}
				};
				recognition.onerror = () => { recognizing = false; stopWave(true); };
				recognition.onend = () => { if (recognizing) { try { recognition.start(); } catch {} } else { stopWave(true); } };
				recognition.onspeechend = () => { /* allow continuous */ };
			}

			dictateBtn.addEventListener('click', async () => {
				const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
				if (!SpeechRecognition) { alert('Speech recognition not supported. Please use Chrome.'); return; }
				if (!recognizing) { await startDictation(); } else { recognizing = false; if (recognition) try { recognition.stop(); } catch{}; stopWave(true); }
			});

			async function startDictation() {
				try {
					if (!recognition) return;
					recognizing = true;
					finalText = ideaDesc ? (ideaDesc.value || '') + ' ' : '';
					if (!mediaStream) mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
					setupWave(mediaStream);
					recognition.start();
					dictateBtn.classList.add('btn-primary');
					dictateBtn.title = 'Stop dictation';
				} catch {}
			}
			function setupWave(stream) {
				if (!dictateCanvas) return;
				dictateCanvas.style.display = '';
				audioCtx = new (window.AudioContext || window.webkitAudioContext)();
				analyser = audioCtx.createAnalyser();
				analyser.fftSize = 2048;
				const src = audioCtx.createMediaStreamSource(stream);
				src.connect(analyser);
				drawWave();
			}
			function drawWave() {
				if (!analyser || !dictateCanvas) return;
				const ctx = dictateCanvas.getContext('2d');
				const bufferLength = analyser.frequencyBinCount;
				const dataArray = new Uint8Array(bufferLength);
				analyser.getByteTimeDomainData(dataArray);
				ctx.clearRect(0,0,dictateCanvas.width, dictateCanvas.height);
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0,0,dictateCanvas.width, dictateCanvas.height);
				ctx.lineWidth = 2; ctx.strokeStyle = '#EAB84E'; ctx.beginPath();
				const slice = dictateCanvas.width / bufferLength; let x = 0;
				for (let i=0;i<bufferLength;i++){ const v = dataArray[i]/128.0; const y = v*dictateCanvas.height/2; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); x+=slice; }
				ctx.lineTo(dictateCanvas.width, dictateCanvas.height/2); ctx.stroke();
				rafe();
			}
			function rafe(){ raf = requestAnimationFrame(drawWave); }
			function stopWave(forceHide){ if (raf) cancelAnimationFrame(raf); raf=0; if (audioCtx) { try { audioCtx.close(); } catch{} } audioCtx=null; analyser=null; if (dictateCanvas && forceHide) dictateCanvas.style.display='none'; dictateBtn.classList.remove('btn-primary'); dictateBtn.title='Dictate'; }
		}

		// set defaults
		setStep(1);
	}

	function renderSummary() {
		const prefH = (document.querySelector('input[name="horizon"]:checked') || { value: '6m' }).value;
		const prefR = (document.querySelector('input[name="risk"]:checked') || { value: 'conservative' }).value;
		Store.set({ wizard: { preferences: { horizon: String(prefH), risk: String(prefR) } } });
		return `
			<strong>Idea</strong>: ${escapeHtml(Store.get().wizard.description || '(no description)')}<br>
			<strong>Location</strong>: ${escapeHtml(Store.get().wizard.location)}<br>
			<strong>Budget</strong>: $${Number(Store.get().wizard.budget).toLocaleString()}<br>
			<strong>Category</strong>: ${escapeHtml(Store.get().wizard.category)}<br>
			<strong>Uploads</strong>: ${Store.get().wizard.images.length} images, ${Store.get().wizard.pdf ? 'PDF attached' : 'no PDF'}<br>
			<strong>Preferences</strong>: ${prefH}, ${prefR}
		`;
	}

	// Dashboard
	function initDashboard() {
		const list = document.getElementById('idea-list');
		const title = document.getElementById('workspace-title');
		const newBtn = document.getElementById('new-idea');
		const chat = document.getElementById('chat-open');
		const badge = document.getElementById('chat-badge');
		const search = document.getElementById('idea-search');
		const modelsGrid = document.getElementById('models-grid');
		// Profile elements
		const avatar = document.getElementById('profile-avatar');
		const nameEl = document.getElementById('profile-name');
		const emailEl = document.getElementById('profile-email');
		const langSel = document.getElementById('profile-language');
		const stageSel = document.getElementById('profile-stage');
		const logoutBtn = document.getElementById('logout-btn');

		function renderProfile() {
			const st = Store.get();
			const user = st.profile.user || {};
			if (avatar) avatar.src = user.photoURL || '';
			if (nameEl) nameEl.textContent = user.displayName || 'Guest';
			if (emailEl) emailEl.textContent = user.email || '';
			if (langSel) langSel.value = st.profile.language || 'en';
			if (stageSel) stageSel.value = st.profile.stage || 'Idea';
		}
        function renderIdeas() {
			const st = Store.get();
			if (!list) return;
			list.innerHTML = '';
            const q = (st.ideas.filter || '').toLowerCase();
			st.ideas.items
                .filter(it => String(it && it.name || '').toLowerCase().includes(q))
				.forEach(it => {
					const li = document.createElement('li');
					li.className = 'idea-item rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ' + (st.ideas.selectedId === it.id ? 'border-[color:var(--primary)] bg-[color:var(--primaryLightest)]' : 'border-[color:var(--muted)] hover:border-[color:var(--primary)] hover:bg-[color:var(--primaryLightest)]');
					li.dataset.id = it.id;
					const nameDiv = document.createElement('div');
					nameDiv.className = 'truncate';
					nameDiv.textContent = it.name;
					const actions = document.createElement('div');
					actions.className = 'flex items-center gap-2';
					const viewBtn = document.createElement('button');
					viewBtn.className = 'px-2 py-1 rounded-md border border-[color:var(--muted)] text-xs font-bold bg-white hover:bg-[color:var(--primaryLightest)]';
					viewBtn.textContent = 'View';
					viewBtn.setAttribute('data-action', 'view');
					viewBtn.setAttribute('data-id', it.id);
					const delBtn = document.createElement('button');
					delBtn.className = 'px-2 py-1 rounded-md border border-[color:var(--muted)] text-xs font-bold bg-white hover:bg-[color:var(--accent)] hover:text-white';
					delBtn.textContent = 'Delete';
					delBtn.setAttribute('data-action', 'delete');
					delBtn.setAttribute('data-id', it.id);
					actions.appendChild(viewBtn);
					actions.appendChild(delBtn);
					li.appendChild(nameDiv);
					li.appendChild(actions);
					list.appendChild(li);
				});
			if (title) {
				const sel = st.ideas.items.find(i => i.id === st.ideas.selectedId);
				title.textContent = sel ? sel.name : 'Workspace';
			}
		}
		function onStateChange() {
			renderProfile();
			renderIdeas();
			renderModels();
		}
		Store.subscribe(onStateChange);
		onStateChange();

		async function fetchGps(){
			return await new Promise((resolve) => {
				if (!navigator.geolocation) { resolve(null); return; }
				navigator.geolocation.getCurrentPosition(
					pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
					() => resolve(null),
					{ enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
				);
			});
		}

		function ensureAnalysis(ideaId){
			if (!ideaId || !window.AIService || !window.AIService.analyzeIdea) return;
			const st = Store.get();
			const analyses = Object.assign({}, st.analysisByIdea || {});
			if (analyses[ideaId] && (analyses[ideaId].models || analyses[ideaId].loading)) return;
			const startedAt = Date.now();
			analyses[ideaId] = { loading: true, startedAt };
			Store.set({ analysisByIdea: analyses });
			const idea = (st.ideas.items || []).find(i => i.id === ideaId);
			const ideaName = (idea && idea.name) || 'Idea';
			const wizard = st.wizard || {};
			// Timeout fallback: if still loading after 12s, show fallback models
			const fallbackTimer = setTimeout(() => {
				try {
					const cur = (Store.get().analysisByIdea || {})[ideaId];
					if (cur && cur.loading && cur.startedAt === startedAt) {
						const fb = buildFallbackModels(ideaId, wizard);
						const next = Object.assign({}, Store.get().analysisByIdea || {});
						next[ideaId] = { models: fb, meta: { recommended: 'Balanced', notes: 'Timed out contacting AI. Showing fallback.' }, error: 'timeout', loading: false };
						Store.set({ analysisByIdea: next });
					}
				} catch {}
			}, 12000);
			Promise.resolve().then(fetchGps).then(gps => window.AIService.analyzeIdea({ ideaId, ideaName, wizard, gps }))
				.then(result => {
					clearTimeout(fallbackTimer);
					const next = Object.assign({}, Store.get().analysisByIdea || {});
					next[ideaId] = { models: result.models || [], meta: result.meta || {}, error: null, loading: false };
					Store.set({ analysisByIdea: next });
				})
				.catch((err) => {
					clearTimeout(fallbackTimer);
					const next = Object.assign({}, Store.get().analysisByIdea || {});
					next[ideaId] = { models: buildFallbackModels(ideaId, wizard), meta: { notes: 'Analysis failed.' }, error: (err && err.message) || 'Analysis failed', loading: false };
					Store.set({ analysisByIdea: next });
				});
		}

		function buildFallbackModels(ideaId, wizard){
			const base = Number((wizard && wizard.budget) || 10000) || 10000;
			return [
				{ id: ideaId+':lean', name: 'Lean', risk: 'Low', horizon: (wizard && wizard.preferences && wizard.preferences.horizon)||'6m', revenue6m: Math.round(base*0.6), cac: 10, margin: 0.22, why: 'Fallback lean plan', suitableFor: 'Conservative budgets' },
				{ id: ideaId+':balanced', name: 'Balanced', risk: 'Medium', horizon: (wizard && wizard.preferences && wizard.preferences.horizon)||'6m', revenue6m: Math.round(base*0.85), cac: 9, margin: 0.28, why: 'Fallback balanced plan', suitableFor: 'Moderate budgets' },
				{ id: ideaId+':aggressive', name: 'Aggressive', risk: 'High', horizon: (wizard && wizard.preferences && wizard.preferences.horizon)||'6m', revenue6m: Math.round(base*1.1), cac: 8, margin: 0.32, why: 'Fallback aggressive plan', suitableFor: 'Growth-first' }
			];
		}

		async function renderModels() {
			if (!modelsGrid) return;
			const st = Store.get();
			const ideaId = st.ideas && st.ideas.selectedId;
			modelsGrid.innerHTML = '';
			if (!ideaId) {
				const empty = document.createElement('div');
				empty.className = 'text-sm text-[color:var(--ink-60)]';
				empty.textContent = 'Select an idea to view model variants.';
				modelsGrid.appendChild(empty);
				return;
			}
			// Analyze controls with idea name
			const idea = (st.ideas && st.ideas.items || []).find(i => i.id === ideaId);
			const ideaName = (idea && idea.name) || 'Idea';
			const controls = document.createElement('div');
			controls.className = 'flex items-center justify-between mb-2 gap-2';
			const label = document.createElement('div');
			label.className = 'text-sm font-bold';
			label.textContent = 'Models';
			const analyzeBtn = document.createElement('button');
			analyzeBtn.className = 'px-3 py-1 rounded-md bg-[color:var(--ink)] text-white text-sm font-bold';
			analyzeBtn.textContent = `Analyze ${ideaName}`;
			const compareBtn = document.createElement('button');
			compareBtn.className = 'px-3 py-1 rounded-md border border-[color:var(--muted)] text-sm font-bold';
			compareBtn.textContent = 'Compare models with AI';
			controls.appendChild(label);
			controls.appendChild(analyzeBtn);
			controls.appendChild(compareBtn);
			modelsGrid.appendChild(controls);
			const analysisState = (st.analysisByIdea || {})[ideaId];
			analyzeBtn.disabled = Boolean(analysisState && analysisState.loading);
			analyzeBtn.addEventListener('click', () => {
				const next = Object.assign({}, Store.get().analysisByIdea || {});
				next[ideaId] = { loading: true };
				Store.set({ analysisByIdea: next });
				ensureAnalysis(ideaId);
			});
			const analysis = (st.analysisByIdea || {})[ideaId];
			if (!analysis || analysis.loading) {
				const loading = document.createElement('div');
				loading.className = 'text-sm text-[color:var(--ink-60)]';
				loading.textContent = 'Analyzing idea with AI for your location and uploads...';
				modelsGrid.appendChild(loading);
				ensureAnalysis(ideaId);
				return;
			}
			if (analysis && analysis.error) {
				const err = document.createElement('div');
				err.className = 'text-sm text-red-600';
				err.textContent = `Analysis error: ${analysis.error}`;
				modelsGrid.appendChild(err);
				const retry = document.createElement('button');
				retry.className = 'mt-2 px-3 py-1 rounded-md border border-[color:var(--muted)] text-sm';
				retry.textContent = 'Retry analysis';
				retry.addEventListener('click', () => {
					const next = Object.assign({}, Store.get().analysisByIdea || {});
					next[ideaId] = { loading: true };
					Store.set({ analysisByIdea: next });
					ensureAnalysis(ideaId);
				});
				modelsGrid.appendChild(retry);
				return;
			}
			const models = analysis.models || [];
			// If no models yet, try to augment wizard with saved assets for better prompts
			if (models.length === 0) {
				const user = (Store.get().profile || {}).user;
				if (user && user.uid && window.DB && window.DB.readIdea) {
					try {
						const data = await window.DB.readIdea(user.uid, ideaId);
						if (data && (data.photos || data.pdf || data.gps)) {
							const st2 = Store.get();
							const wizard = Object.assign({}, st2.wizard || {});
							// Merge URLs as pseudo-uploads for AI prompt
							wizard.images = (data.photos || []).map(p => ({ name: p.name || 'photo', data: String(p.url) }));
							wizard.pdf = data.pdf ? { name: data.pdf.name || 'document.pdf', data: String(data.pdf.url) } : wizard.pdf || null;
							const analyses = Object.assign({}, st2.analysisByIdea || {});
							analyses[ideaId] = { loading: true };
							Store.set({ analysisByIdea: analyses });
							Promise.resolve().then(() => window.AIService.analyzeIdea({ ideaId, ideaName, wizard, gps: data.gps || null }))
								.then(result => { const next = Object.assign({}, Store.get().analysisByIdea || {}); next[ideaId] = { models: result.models||[], meta: result.meta||{}, error: null, loading: false }; Store.set({ analysisByIdea: next }); })
								.catch(() => { const next = Object.assign({}, Store.get().analysisByIdea || {}); next[ideaId] = { models: [], meta: { notes: 'Analysis failed.' }, error: 'Analysis failed', loading: false }; Store.set({ analysisByIdea: next }); });
						}
					} catch {}
				}
			}
			const selectedByIdea = st.selectedModelByIdea || {};
			const selectedId = selectedByIdea[ideaId] || (models[1] && models[1].id) || (models[0] && models[0].id) || '';
			models.forEach(m => {
				const card = document.createElement('div');
				card.className = 'border rounded-lg p-3 flex flex-col gap-2 ' + (m.id === selectedId ? 'border-[color:var(--primary)] bg-[color:var(--primaryLightest)]' : 'border-[color:var(--muted)]');
				const header = document.createElement('div');
				header.className = 'flex items-center justify-between';
				header.innerHTML = `<div class="font-bold">${m.name}</div><span class="text-[10px] px-2 py-0.5 rounded-md ${m.risk==='High'?'bg-[color:var(--accent)] text-white': m.risk==='Low'?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}">${m.risk} risk</span>`;
				const metrics = document.createElement('div');
				metrics.className = 'grid grid-cols-3 gap-2 text-xs text-[color:var(--ink-60)]';
				metrics.innerHTML = `
					<div><div class="text-[10px]">Revenue (6m)</div><div class="text-[color:var(--ink)] font-extrabold">$${Number(m.revenue6m).toLocaleString()}</div></div>
					<div><div class="text-[10px]">CAC</div><div class="text-[color:var(--ink)] font-extrabold">$${Number(m.cac).toLocaleString()}</div></div>
					<div><div class="text-[10px]">Margin</div><div class="text-[color:var(--ink)] font-extrabold">${Math.round(m.margin*100)}%</div></div>
				`;
				const explain = document.createElement('div');
				explain.className = 'text-xs text-[color:var(--ink-60)]';
				explain.innerHTML = `<div class="font-bold text-[color:var(--ink)]">Why</div><div>${m.why ? escapeHtml(m.why) : '—'}</div><div class="mt-1"><span class="font-bold text-[color:var(--ink)]">Suitable for</span>: ${m.suitableFor ? escapeHtml(m.suitableFor) : '—'}</div>`;
				const actions = document.createElement('div');
				actions.className = 'flex items-center gap-2 pt-1';
				const selectBtn = document.createElement('button');
				selectBtn.className = 'px-3 py-1 rounded-md text-xs font-bold ' + (m.id === selectedId ? 'bg-[color:var(--primary)]' : 'border border-[color:var(--muted)]');
				selectBtn.textContent = m.id === selectedId ? 'Selected' : 'Select model';
				selectBtn.disabled = m.id === selectedId;
				selectBtn.addEventListener('click', () => {
					const map = Object.assign({}, Store.get().selectedModelByIdea || {});
					map[ideaId] = m.id;
					Store.set({ selectedModelByIdea: map });
				});
				const canvasBtn = document.createElement('button');
				canvasBtn.className = 'px-3 py-1 rounded-md text-xs font-bold border border-[color:var(--muted)]';
				canvasBtn.textContent = 'Open Canvas';
				canvasBtn.addEventListener('click', () => { alert('Business Model Canvas (coming soon)'); });
				const notesBtn = document.createElement('button');
				notesBtn.className = 'px-3 py-1 rounded-md text-xs font-bold border border-[color:var(--muted)]';
				notesBtn.textContent = 'Notes';
				notesBtn.addEventListener('click', () => { const a = (Store.get().analysisByIdea||{})[ideaId]; alert((a && a.meta && a.meta.notes) || 'No notes'); });
				actions.appendChild(selectBtn);
				actions.appendChild(canvasBtn);
				actions.appendChild(notesBtn);
				card.appendChild(header);
				card.appendChild(metrics);
				card.appendChild(explain);
				card.appendChild(actions);
				modelsGrid.appendChild(card);
			});
			// Raw JSON viewer
			if (analysis && analysis.raw) {
				const pre = document.createElement('pre');
				pre.className = 'mt-3 whitespace-pre-wrap text-xs bg-[color:var(--primaryLightest)] border border-[color:var(--primary)] rounded p-2 overflow-auto';
				try { pre.textContent = JSON.stringify(analysis.raw, null, 2); } catch { pre.textContent = String(analysis.raw); }
				modelsGrid.appendChild(pre);
			}
			if (analysis && analysis.meta && analysis.meta.recommended) {
				const rec = document.createElement('div');
				rec.className = 'mt-2 text-sm';
				rec.innerHTML = `<span class="font-bold">Recommended:</span> ${escapeHtml(analysis.meta.recommended)}`;
				modelsGrid.appendChild(rec);
			}

			// Compare button wiring
			compareBtn.addEventListener('click', async () => {
				try {
					compareBtn.disabled = true; compareBtn.textContent = 'Comparing...';
					const stNow = Store.get();
					const ideaNow = (stNow.ideas && stNow.ideas.items || []).find(i => i.id === ideaId);
					const data = (Store.get().profile.user && window.DB && window.DB.readIdea) ? await window.DB.readIdea(Store.get().profile.user.uid, ideaId).catch(()=>null) : null;
					const wizardForCompare = Object.assign({}, stNow.wizard || {});
					if (data && (data.photos || data.pdf)) {
						wizardForCompare.images = (data.photos || []).map(p => ({ name: p.name||'photo', data: String(p.url) }));
						wizardForCompare.pdf = data.pdf ? { name: data.pdf.name||'document.pdf', data: String(data.pdf.url) } : null;
					}
					const cmp = await window.AIService.compareModels({ ideaName: (ideaNow && ideaNow.name) || ideaName, models, wizard: wizardForCompare, gps: data && data.gps || null });
					const box = document.createElement('div');
					box.className = 'mt-3 border border-[color:var(--muted)] rounded p-2 text-sm';
					box.innerHTML = `<div class="font-bold mb-1">Best model: ${escapeHtml(cmp.best && cmp.best.name || '')}</div><div class="text-[color:var(--ink-60)]">${escapeHtml(cmp.best && cmp.best.reason || '')}</div>`;
					const ul = document.createElement('ul'); ul.className = 'mt-2 list-disc pl-5';
					(cmp.ranking||[]).forEach(r => { const li = document.createElement('li'); li.innerHTML = `<span class="font-bold">${escapeHtml(r.name)}:</span> score ${Number(r.score)||0} — pros: ${escapeHtml(r.pros||'')}; cons: ${escapeHtml(r.cons||'')}`; ul.appendChild(li); });
					box.appendChild(ul);
					// Raw
					if (cmp.raw) { const pre = document.createElement('pre'); pre.className = 'mt-2 whitespace-pre-wrap text-xs bg-[color:var(--primaryLightest)] border border-[color:var(--primary)] rounded p-2 overflow-auto'; try { pre.textContent = JSON.stringify(cmp.raw, null, 2); } catch { pre.textContent = String(cmp.raw); } box.appendChild(pre); }
					modelsGrid.appendChild(box);
				} catch (e) {
					alert('Compare failed');
				} finally {
					compareBtn.disabled = false; compareBtn.textContent = 'Compare models with AI';
				}
			});
		}

		if (list && title) {
			list.addEventListener('click', (e) => {
				const target = e.target;
				if (!target) return;
				const action = target.getAttribute && target.getAttribute('data-action');
				const id = (target.getAttribute && target.getAttribute('data-id')) || (target.closest && target.closest('li') && target.closest('li').dataset.id) || '';
				if (action === 'view' && id) {
					Store.set({ ideas: { selectedId: id } });
					window.location.href = './view.html';
					return;
				}
				if (action === 'delete' && id) {
					openConfirm('Delete this idea? This cannot be undone.', async () => {
					const st = Store.get();
					const filtered = st.ideas.items.filter(i => i.id !== id);
					const nextSelected = st.ideas.selectedId === id && filtered.length ? filtered[0].id : st.ideas.selectedId === id ? null : st.ideas.selectedId;
					Store.set({ ideas: { items: filtered, selectedId: nextSelected } });
					const user = Store.get().profile.user;
					if (window.DB && user && user.uid) {
						try { window.DB.deleteIdea(user.uid, id); } catch {}
					}
					});
					return;
				}
				// default: clicking row selects
				const li = target.closest && target.closest('li');
				if (li && li.dataset.id) {
					Store.set({ ideas: { selectedId: li.dataset.id } });
				}
			});
		}

		function openConfirm(message, onOk) {
			const modal = document.getElementById('confirm-modal');
			const text = document.getElementById('confirm-text');
			const ok = document.getElementById('confirm-ok');
			const cancel = document.getElementById('confirm-cancel');
			if (!modal || !text || !ok || !cancel) { if (confirm(message)) onOk && onOk(); return; }
			text.textContent = message;
			modal.classList.remove('hidden'); modal.classList.add('flex');
			function close(){ modal.classList.add('hidden'); modal.classList.remove('flex'); ok.removeEventListener('click', okH); cancel.removeEventListener('click', cancelH); }
			function okH(){ close(); onOk && onOk(); }
			function cancelH(){ close(); }
			ok.addEventListener('click', okH);
			cancel.addEventListener('click', cancelH);
		}
		if (newBtn && list) {
			newBtn.addEventListener('click', () => {
				const name = prompt('Name your idea:', 'New Idea');
				if (!name) return;
				const id = Store.cryptoRandomId();
				const st = Store.get();
				Store.set({ ideas: { items: [...(st.ideas.items||[]), { id, name: String(name) }], selectedId: id } });
				const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeIdeas(user.uid, Store.get().ideas.items);
			});
		}
		if (search) {
			search.addEventListener('input', () => {
				Store.set({ ideas: { filter: String(search.value || '') } });
			});
		}
		if (chat && badge) {
			chat.addEventListener('click', () => {
				badge.textContent = '0';
				alert('Opening AI chat... (placeholder)');
			});
		}

		// Persist wizard uploads to Firebase for selected idea
		(async function persistAssetsIfNeeded(){
			try {
				const st = Store.get();
				const user = st.profile && st.profile.user;
				const ideaId = st.ideas && st.ideas.selectedId;
				if (!user || !user.uid || !ideaId || !window.DB || !window.DB.saveIdeaAssetsFromWizard) return;
				// Skip if already have photos/pdf/gps saved on idea
				const existing = await window.DB.readIdea(user.uid, ideaId).catch(() => null);
				const hasAny = existing && (Array.isArray(existing.photos) && existing.photos.length || existing.pdf || existing.gps);
				if (hasAny) return;
				const gps = await fetchGps();
				await window.DB.saveIdeaAssetsFromWizard(user.uid, ideaId, st.wizard || {}, gps || null);
			} catch {}
		})();

		// Profile handlers
		if (langSel) langSel.addEventListener('change', () => {
			const lang = String(langSel.value);
			Store.set({ profile: { language: lang } });
			try { localStorage.setItem('bp_language', lang); } catch {}
			const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeProfile(user.uid, Store.get().profile);
		});
		if (stageSel) stageSel.addEventListener('change', () => {
			Store.set({ profile: { stage: String(stageSel.value) } });
			const user = Store.get().profile.user; if (window.DB && user && user.uid) window.DB.writeProfile(user.uid, Store.get().profile);
		});
		if (logoutBtn) logoutBtn.addEventListener('click', () => {
			try { localStorage.removeItem('bp_user'); } catch {}
			Store.set({ profile: { user: null } });
			window.location.href = './login.html';
		});
	}

	function initHeaderProfile() {
		const btn = document.getElementById('header-profile-btn');
		const img = document.getElementById('header-avatar');
		if (!btn) return;
		function render() {
			const st = Store.get();
			if (img) {
				const src = (st.profile.user && st.profile.user.photoURL) || '';
				if (src) {
					img.style.display = '';
					img.src = src;
				} else {
					img.style.display = 'none';
				}
			}
		}
		render();
		Store.subscribe(render);
		btn.addEventListener('click', () => { window.location.hash = '#/profile'; });
	}

	function initProfile() {
		const avatar = document.getElementById('p-avatar');
		const nameEl = document.getElementById('p-name');
		const emailEl = document.getElementById('p-email');
		const langSel = document.getElementById('p-language');
		const stageSel = document.getElementById('p-stage');
		const logoutBtn = document.getElementById('p-logout');
		function render() {
			const st = Store.get();
			const user = st.profile.user || {};
			if (avatar) {
				if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ''; }
				else { avatar.style.display = 'none'; }
			}
			if (nameEl) nameEl.textContent = user.displayName || 'Guest';
			if (emailEl) emailEl.textContent = user.email || '';
			if (langSel) langSel.value = st.profile.language || 'en';
			if (stageSel) stageSel.value = st.profile.stage || 'Idea';
		}
		render();
		Store.subscribe(render);
		if (langSel) langSel.addEventListener('change', () => {
			const lang = String(langSel.value);
			Store.set({ profile: { language: lang } });
			try { localStorage.setItem('bp_language', lang); } catch {}
		});
		if (stageSel) stageSel.addEventListener('change', () => {
			Store.set({ profile: { stage: String(stageSel.value) } });
		});
		if (logoutBtn) logoutBtn.addEventListener('click', () => {
			try { localStorage.removeItem('bp_user'); } catch {}
			Store.set({ profile: { user: null } });
			window.location.href = './login.html';
		});
	}

	function escapeHtml(str) {
		return String(str)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}
})();


