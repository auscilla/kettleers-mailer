function safeCreateIcons() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
safeCreateIcons();

// -------------------------------------------------------------
// Supabase Database Connection
// -------------------------------------------------------------
const SUPABASE_URL = 'https://dzrrkdfdhkcwaydgifwi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lxJd164SV3appxkm68UDwQ_UN3mXDPD';
const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let loadedCampaigns = [];
let allSubscribers = [];
let currentEditingCampaignId = null;

// Block Engine & Styling Defaults
const WIZARD_STEPS = ['recipients', 'setup', 'template', 'design', 'confirm'];
let currentWizardStepIndex = 0;

const defaultStyle = {
    canvasBg: '#E8E4D1',
    contentBg: '#ffffff',
    headerBg: '#1A2B4C',
    accentColor: '#611724',
    fontFamily: 'Arial, Helvetica, sans-serif',
    buttonBg: '#2E5B82',
    buttonRadius: '4px'
};

const defaultSettings = {
    preheader: '',
    maxWidth: '620px',
    showBanner: true,
    showBrowserLink: true,
    footerText: '© 2026 Cotuit Kettleers Baseball. Lowell Park, Cotuit, MA.'
};

let wizardData = {
    segment: 'all',
    title: '',
    subject: '',
    template: 'Blank Canvas',
    blocks: [],
    style: { ...defaultStyle },
    settings: { ...defaultSettings }
};

// -------------------------------------------------------------
// Authentication Flow
// -------------------------------------------------------------
if (db) {
    db.auth.onAuthStateChange((event, session) => {
        const authView = document.getElementById('auth-view');
        const appView = document.getElementById('app-view');
        
        if (session) {
            authView.classList.add('hidden');
            appView.classList.remove('hidden-view');
            initDashboardFilters();
            loadSubscribers();
            loadDashboardAndCampaigns();
        } else {
            authView.classList.remove('hidden');
            appView.classList.add('hidden-view');
        }
    });
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    if (!db) return;

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const submitBtn = document.getElementById('auth-submit-btn');
    const errorDiv = document.getElementById('auth-error');

    submitBtn.textContent = 'Authenticating...';
    submitBtn.disabled = true;
    errorDiv.classList.add('hidden');

    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
        submitBtn.textContent = 'Sign In';
        submitBtn.disabled = false;
    } else {
        submitBtn.textContent = 'Sign In';
        submitBtn.disabled = false;
        document.getElementById('login-form').reset();
    }
}

async function handleLogout() {
    if (db) await db.auth.signOut();
}

// -------------------------------------------------------------
// Dashboard Time Frame & Date Filter Engine
// -------------------------------------------------------------
function initDashboardFilters() {
    const startInput = document.getElementById('dashboard-start-date');
    const endInput = document.getElementById('dashboard-end-date');
    
    if (startInput && endInput && !startInput.value) {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        endInput.value = today.toISOString().split('T')[0];
        startInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    }
}

function handleTimeframeChange() {
    const select = document.getElementById('dashboard-timeframe');
    const startInput = document.getElementById('dashboard-start-date');
    const endInput = document.getElementById('dashboard-end-date');
    if (!select || !startInput || !endInput) return;

    const val = select.value;
    const today = new Date();

    if (val === '30') {
        const past = new Date();
        past.setDate(today.getDate() - 30);
        startInput.value = past.toISOString().split('T')[0];
        endInput.value = today.toISOString().split('T')[0];
    } else if (val === '90') {
        const past = new Date();
        past.setDate(today.getDate() - 90);
        startInput.value = past.toISOString().split('T')[0];
        endInput.value = today.toISOString().split('T')[0];
    } else if (val === 'year') {
        startInput.value = '2026-01-01';
        endInput.value = '2026-12-31';
    } else if (val === 'all') {
        startInput.value = '2020-01-01';
        endInput.value = today.toISOString().split('T')[0];
    }

    applyDashboardFilters();
}

function handleCustomDateChange() {
    const select = document.getElementById('dashboard-timeframe');
    if (select) select.value = 'custom';
    applyDashboardFilters();
}

function applyDashboardFilters() {
    const startVal = document.getElementById('dashboard-start-date')?.value;
    const endVal = document.getElementById('dashboard-end-date')?.value;
    const avgOpenEl = document.getElementById('stat-open-rate');
    const avgClickEl = document.getElementById('stat-click-rate');
    const recentCampaignsEl = document.getElementById('dashboard-recent-campaigns');

    const startDate = startVal ? new Date(startVal + 'T00:00:00') : new Date('2000-01-01');
    const endDate = endVal ? new Date(endVal + 'T23:59:59') : new Date('2100-01-01');

    const filtered = loadedCampaigns.filter(c => {
        const campDate = c.created_at ? new Date(c.created_at) : (c.target_date ? new Date(c.target_date) : new Date());
        return campDate >= startDate && campDate <= endDate;
    });

    const sent = filtered.filter(c => c.status === 'Sent');

    if (sent.length > 0) {
        const totalOpen = sent.reduce((sum, c) => sum + Number(c.open_rate || 0), 0);
        const totalClick = sent.reduce((sum, c) => sum + Number(c.click_rate || 0), 0);
        if (avgOpenEl) avgOpenEl.textContent = (totalOpen / sent.length).toFixed(1) + '%';
        if (avgClickEl) avgClickEl.textContent = (totalClick / sent.length).toFixed(1) + '%';
    } else {
        if (avgOpenEl) avgOpenEl.textContent = '0.0%';
        if (avgClickEl) avgClickEl.textContent = '0.0%';
    }

    if (recentCampaignsEl) {
        if (sent.length === 0) {
            recentCampaignsEl.innerHTML = `<div class="py-6 text-center text-gray-500 font-sans italic">No dispatched campaigns in this date range.</div>`;
        } else {
            recentCampaignsEl.innerHTML = sent.slice(0, 4).map(c => `
                <div class="py-4 md:py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-4 font-sans">
                    <h4 class="font-display text-lg md:text-2xl uppercase tracking-wider text-black w-full">${escapeHtml(c.title)}</h4>
                    <div class="flex gap-6 md:gap-10 w-full md:w-auto justify-start md:justify-end bg-transparent p-0 rounded items-center">
                        <div class="text-left md:text-center">
                            <div class="text-xs text-gray-600 mb-1">Open</div>
                            <div class="font-bold text-lg md:text-xl text-black">${c.open_rate}%</div>
                        </div>
                        <div class="text-left md:text-center">
                            <div class="text-xs text-gray-600 mb-1">CTR</div>
                            <div class="font-bold text-lg md:text-xl text-black">${c.click_rate}%</div>
                        </div>
                        <button onclick="openReportView(${c.id})" class="ml-auto md:ml-4 border border-gray-400 text-gray-700 text-xs font-bold px-3 py-1.5 rounded uppercase hover:bg-white transition-colors shrink-0">Report</button>
                    </div>
                </div>
            `).join('');
        }
    }
}

// -------------------------------------------------------------
// Data Fetching & Subscriber Handling
// -------------------------------------------------------------
async function loadSubscribers() {
    if (!db) return;
    const tableBody = document.getElementById('subscribers-table-body');
    
    try {
        const { data, error } = await db.from('subscribers').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        allSubscribers = data || [];
        renderSubscribers(allSubscribers);
        updateAudienceCounts();
    } catch (err) {
        console.error('Error fetching subscribers:', err);
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-red-700 font-sans">Error connecting to Supabase: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderSubscribers(dataToRender) {
    const tableBody = document.getElementById('subscribers-table-body');
    const countDisplay = document.getElementById('subscribers-count-display');
    if (!tableBody) return;
    
    if (!dataToRender || dataToRender.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-gray-500 font-sans italic">No subscribers found.</td></tr>`;
        if (countDisplay) countDisplay.textContent = 'Showing 0 subscribers';
        return;
    }

    tableBody.innerHTML = dataToRender.map(sub => {
        const dateJoined = sub.created_at ? new Date(sub.created_at).toLocaleDateString() : 'N/A';
        return `
            <tr class="border-b border-gray-200 hover:bg-black/5 transition-colors">
                <td class="py-3 md:py-5 font-bold text-[#611724]">${escapeHtml(sub.name)}</td>
                <td class="py-3 md:py-5 text-gray-800 text-sm md:text-lg">${escapeHtml(sub.email)}</td>
                <td class="py-3 md:py-5 text-gray-800 text-sm md:text-lg">${escapeHtml(sub.segment || 'General Fan')}</td>
                <td class="py-3 md:py-5 text-center"><span class="bg-kettleer-green text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded tracking-wider uppercase">${escapeHtml(sub.status || 'Active')}</span></td>
                <td class="py-3 md:py-5 text-gray-800 text-right pr-2 text-sm md:text-lg">${dateJoined}</td>
            </tr>
        `;
    }).join('');

    if (countDisplay) {
        countDisplay.textContent = `Showing 1-${dataToRender.length} of ${dataToRender.length}`;
    }
}

function handleSubscriberSearch(e) {
    const query = e.target.value.toLowerCase();
    if (!query) {
        renderSubscribers(allSubscribers);
        return;
    }

    const filteredData = allSubscribers.filter(sub => {
        const name = (sub.name || '').toLowerCase();
        const email = (sub.email || '').toLowerCase();
        const segment = (sub.segment || '').toLowerCase();
        return name.includes(query) || email.includes(query) || segment.includes(query);
    });

    renderSubscribers(filteredData);
}

function updateAudienceCounts() {
    const total = allSubscribers.length;
    const setCardCount = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `${count} fans`;
    };

    setCardCount('segment-count-all', total);
    setCardCount('segment-count-General Fan', allSubscribers.filter(s => s.segment === 'General Fan').length);
    setCardCount('segment-count-All-Star Member', allSubscribers.filter(s => s.segment === 'All-Star Member').length);
    setCardCount('segment-count-Supporter', allSubscribers.filter(s => s.segment === 'Supporter').length);
    setCardCount('segment-count-Host Family', allSubscribers.filter(s => s.segment === 'Host Family').length);
    setCardCount('segment-count-Alumni', allSubscribers.filter(s => s.segment === 'Alumni').length);
}

// -------------------------------------------------------------
// Campaigns Data Fetching
// -------------------------------------------------------------
async function loadDashboardAndCampaigns() {
    if (!db) return;
    const fansCountEl = document.getElementById('stat-fans-count');
    const campaignsTableBody = document.getElementById('campaigns-table-body');

    try {
        const { count: subscriberCount } = await db.from('subscribers').select('*', { count: 'exact', head: true });
        if (fansCountEl && subscriberCount !== null && subscriberCount !== undefined) {
            fansCountEl.textContent = subscriberCount.toLocaleString();
        }
    } catch (err) {
        console.warn('Could not query subscribers count:', err);
    }

    try {
        const { data: campaigns, error } = await db.from('campaigns').select('*').order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching campaigns:', error);
            if (campaignsTableBody) {
                campaignsTableBody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-red-600 font-sans font-bold">Error loading campaigns: ${escapeHtml(error.message)}</td></tr>`;
            }
            return;
        }

        loadedCampaigns = campaigns || [];
        applyDashboardFilters();

        if (campaignsTableBody) {
            if (loadedCampaigns.length === 0) {
                campaignsTableBody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-gray-500 font-sans italic">No campaigns found. Click "Create Campaign" above to make your first one!</td></tr>`;
                return;
            }

            campaignsTableBody.innerHTML = loadedCampaigns.map(c => {
                const isDraft = c.status === 'Draft';
                const statusBadge = isDraft 
                    ? `<span class="bg-amber-600 text-white text-[10px] md:text-xs font-bold px-2.5 py-1 rounded tracking-wider uppercase">Draft</span>`
                    : `<span class="bg-kettleer-green text-white text-[10px] md:text-xs font-bold px-2.5 py-1 rounded tracking-wider uppercase">Sent</span>`;
                
                const perfText = isDraft 
                    ? `<span class="text-xs text-gray-400 italic font-sans">—</span>`
                    : `<span class="text-sm font-bold text-black">${c.open_rate}% Open / ${c.click_rate}% CTR</span>`;
                
                const actionBtn = `<button onclick="editCampaign(${c.id})" class="bg-[#4f111c] text-[#F4F1E1] text-xs font-bold px-3 py-1.5 rounded uppercase hover:bg-black transition-colors">Edit</button>`;
                const dateDisplay = c.target_date || (c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A');

                return `
                    <tr class="hover:bg-black/5 transition-colors">
                        <td class="py-4 font-bold text-[#611724]">
                            <div>${escapeHtml(c.title)}</div>
                            <div class="text-xs font-normal text-gray-500 font-sans">${escapeHtml(c.subject || '')}</div>
                        </td>
                        <td class="py-4">${statusBadge}</td>
                        <td class="py-4 text-sm text-gray-700 font-sans">${escapeHtml(c.template_name || 'Weekly Bulletin')}</td>
                        <td class="py-4 text-sm text-gray-700 font-sans">${dateDisplay}</td>
                        <td class="py-4 text-center">${perfText}</td>
                        <td class="py-4 text-right pr-2">${actionBtn}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Critical failure in loadDashboardAndCampaigns:', err);
        if (campaignsTableBody) {
            campaignsTableBody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-red-600 font-sans font-bold">Failed to connect to database: ${escapeHtml(err.message)}</td></tr>`;
        }
    }
}

// -------------------------------------------------------------
// Builder Tools: Tabs, Style & Settings Control Engine
// -------------------------------------------------------------
function switchBuilderTab(tab) {
    const tabs = ['blocks', 'style', 'settings'];
    tabs.forEach(t => {
        const btn = document.getElementById(`btn-tab-${t}`);
        const pane = document.getElementById(`pane-${t}`);
        
        if (t === tab) {
            btn.className = "flex-1 bg-[#4f111c] text-[#F4F1E1] py-2 font-bold text-xs tracking-wide" + (t === 'style' ? ' border-l border-r border-[#4f111c]' : '');
            if (pane) pane.classList.remove('hidden-view');
        } else {
            btn.className = "flex-1 bg-transparent text-[#4f111c] py-2 font-bold text-xs tracking-wide hover:bg-black/5" + (t === 'style' ? ' border-l border-r border-[#4f111c]' : '');
            if (pane) pane.classList.add('hidden-view');
        }
    });
}

function updateStyle(field, value) {
    if (!wizardData.style) wizardData.style = { ...defaultStyle };
    wizardData.style[field] = value;

    // Sync companion inputs
    const picker = document.getElementById(`style-${field.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
    const text = document.getElementById(`style-${field.replace(/([A-Z])/g, '-$1').toLowerCase()}-text`);
    if (picker && picker.value !== value) picker.value = value;
    if (text && text.value !== value) text.value = value;

    renderEmailPreview();
}

function updateSettings(field, value) {
    if (!wizardData.settings) wizardData.settings = { ...defaultSettings };
    wizardData.settings[field] = value;

    if (field === 'preheader') {
        const count = document.getElementById('settings-preheader-count');
        if (count) count.textContent = `${value.length} / 120`;
    }

    renderEmailPreview();
}

function syncStyleAndSettingsUI() {
    const s = wizardData.style || defaultStyle;
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    setVal('style-canvas-bg', s.canvasBg);
    setVal('style-canvas-bg-text', s.canvasBg);
    setVal('style-content-bg', s.contentBg);
    setVal('style-content-bg-text', s.contentBg);
    setVal('style-header-bg', s.headerBg);
    setVal('style-header-bg-text', s.headerBg);
    setVal('style-accent-color', s.accentColor);
    setVal('style-accent-color-text', s.accentColor);
    setVal('style-font-family', s.fontFamily);
    setVal('style-button-bg', s.buttonBg);
    setVal('style-button-bg-text', s.buttonBg);
    setVal('style-button-radius', s.buttonRadius);

    const cfg = wizardData.settings || defaultSettings;
    setVal('settings-preheader', cfg.preheader || '');
    setVal('settings-max-width', cfg.maxWidth || '620px');
    setVal('settings-footer-text', cfg.footerText || defaultSettings.footerText);

    const bannerCheck = document.getElementById('settings-show-banner');
    if (bannerCheck) bannerCheck.checked = cfg.showBanner !== false;

    const browserCheck = document.getElementById('settings-show-browser-link');
    if (browserCheck) browserCheck.checked = cfg.showBrowserLink !== false;

    const count = document.getElementById('settings-preheader-count');
    if (count) count.textContent = `${(cfg.preheader || '').length} / 120`;
}

// -------------------------------------------------------------
// Block Engine (Design Phase)
// -------------------------------------------------------------
function renderEditorBlocks() {
    const listEl = document.getElementById('editor-blocks-list');
    if (!listEl) return;

    if (!wizardData.blocks || wizardData.blocks.length === 0) {
        listEl.innerHTML = `<div class="text-center p-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-sans text-xs">Your email is empty.<br>Click a block type below to begin building.</div>`;
        safeCreateIcons();
        return;
    }

    listEl.innerHTML = wizardData.blocks.map((block, i) => {
        let innerInputs = '';
        
        if (block.type === 'text') {
            innerInputs = `
                <div class="mb-3">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Heading</label>
                    <input type="text" value="${escapeHtml(block.heading || '')}" oninput="updateBlock(${i}, 'heading', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none">
                </div>
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Body</label>
                    <textarea rows="4" oninput="updateBlock(${i}, 'body', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none resize-none leading-relaxed">${escapeHtml(block.body || '')}</textarea>
                </div>
            `;
        } else if (block.type === 'promo') {
            innerInputs = `
                <div class="mb-3">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Promo Title</label>
                    <input type="text" value="${escapeHtml(block.heading || '')}" oninput="updateBlock(${i}, 'heading', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none">
                </div>
                <div class="mb-3">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Promo Details</label>
                    <textarea rows="3" oninput="updateBlock(${i}, 'body', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none resize-none leading-relaxed">${escapeHtml(block.body || '')}</textarea>
                </div>
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Button Text</label>
                    <input type="text" value="${escapeHtml(block.cta || '')}" oninput="updateBlock(${i}, 'cta', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none">
                </div>
            `;
        } else if (block.type === 'divider') {
            innerInputs = `<div class="text-xs text-gray-500 italic py-2">Horizontal separator line.</div>`;
        }

        return `
            <div class="bg-white border-2 border-gray-200 rounded-lg shadow-sm overflow-hidden focus-within:border-[#4f111c] transition-colors">
                <div class="bg-gray-100 p-2.5 flex justify-between items-center border-b border-gray-200">
                    <div class="flex items-center gap-2 text-gray-700">
                        <i data-lucide="grip-vertical" class="w-4 h-4 opacity-50"></i>
                        <span class="text-xs font-bold uppercase tracking-wider">${block.type} Block</span>
                    </div>
                    <div class="flex gap-1">
                        <button onclick="moveBlock(${i}, -1)" class="p-1 hover:bg-white rounded text-gray-500 hover:text-black transition-colors" title="Move Up"><i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>
                        <button onclick="moveBlock(${i}, 1)" class="p-1 hover:bg-white rounded text-gray-500 hover:text-black transition-colors" title="Move Down"><i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>
                        <button onclick="deleteBlock(${i})" class="p-1 hover:bg-red-100 rounded text-red-500 transition-colors ml-1" title="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                    </div>
                </div>
                <div class="p-4 font-sans">
                    ${innerInputs}
                </div>
            </div>
        `;
    }).join('');

    safeCreateIcons();
}

function updateBlock(index, field, value) {
    if (wizardData.blocks && wizardData.blocks[index]) {
        wizardData.blocks[index][field] = value;
        renderEmailPreview();
    }
}

function addBlock(type) {
    if (!wizardData.blocks) wizardData.blocks = [];
    if (type === 'text') {
        wizardData.blocks.push({ type: 'text', heading: 'New Headline', body: 'Start typing your newsletter announcement here...' });
    } else if (type === 'promo') {
        wizardData.blocks.push({ type: 'promo', heading: 'Stocking Stuffers Promo', body: 'The Perfect Stocking Stuffers! Use code FANS20 for 20% off.', cta: 'Shop Holiday Special', image: 'StockingStuffer.png' });
    } else if (type === 'divider') {
        wizardData.blocks.push({ type: 'divider' });
    }
    renderEditorBlocks();
    renderEmailPreview();
    
    setTimeout(() => {
        const listEl = document.getElementById('editor-blocks-list');
        if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
}

function moveBlock(index, direction) {
    if (!wizardData.blocks) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= wizardData.blocks.length) return;
    const temp = wizardData.blocks[index];
    wizardData.blocks[index] = wizardData.blocks[newIndex];
    wizardData.blocks[newIndex] = temp;
    renderEditorBlocks();
    renderEmailPreview();
}

function deleteBlock(index) {
    if (!wizardData.blocks) return;
    wizardData.blocks.splice(index, 1);
    renderEditorBlocks();
    renderEmailPreview();
}

// -------------------------------------------------------------
// Live HTML Generator with Full Styling & Settings Injection
// -------------------------------------------------------------
function generateEmailHtml(isLiveSend = false) {
    const baseUrl = isLiveSend ? (window.location.origin + window.location.pathname.replace('index.html', '')) : '';
    const style = wizardData.style || defaultStyle;
    const settings = wizardData.settings || defaultSettings;

    let blocksHtml = '';

    if (!wizardData.blocks || wizardData.blocks.length === 0) {
        blocksHtml = `<div style="padding: 60px 20px; text-align: center; color: #999999; font-family: ${style.fontFamily}; font-style: italic;">Canvas is empty. Add a block to begin building.</div>`;
    } else {
        blocksHtml = wizardData.blocks.map(b => {
            if (b.type === 'text') {
                return `
                <div style="padding: 30px 25px; border: 4px solid ${style.accentColor}; background-color: #FFFDFB; text-align: center; margin: 15px;">
                    <h1 style="font-family: ${style.fontFamily}; font-size: 26px; font-weight: bold; color: #000000; margin: 0 0 14px 0;">${escapeHtml(b.heading || '')}</h1>
                    <p style="font-family: ${style.fontFamily}; font-size: 16px; line-height: 1.6; color: #333333; margin: 0;">${escapeHtml(b.body || '').replace(/\n/g, '<br>')}</p>
                </div>`;
            } else if (b.type === 'promo') {
                return `
                <div style="padding: 35px 30px; text-align: center; background-color: #ffffff; margin-bottom: 15px;">
                    <h2 style="font-family: 'Georgia', 'Times New Roman', serif; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; color: #1A2B4C; margin: 0 0 20px 0;">${escapeHtml(b.heading || '')}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
                        <tr>
                            <td width="190" valign="middle" align="center" style="padding-right: 18px;">
                                <div style="background-color: #F8F8F8; border-radius: 8px; padding: 10px; border: 1px solid #ECEAE0;">
                                    <img src="${baseUrl}${b.image || 'StockingStuffer.png'}" alt="Promo" style="max-width: 170px; width: 100%; height: auto; display: block; margin: 0 auto;">
                                </div>
                            </td>
                            <td valign="middle" align="left" style="font-family: ${style.fontFamily}; font-size: 15px; line-height: 1.5; color: #333333;">
                                ${escapeHtml(b.body || '').replace(/\n/g, '<br>')}
                            </td>
                        </tr>
                    </table>
                    <div style="text-align: center; margin-top: 10px;">
                        <a href="#" style="display: inline-block; background-color: ${style.buttonBg}; color: #ffffff; padding: 13px 32px; font-family: ${style.fontFamily}; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: ${style.buttonRadius}; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(b.cta || 'Shop Now')}</a>
                    </div>
                </div>`;
            } else if (b.type === 'divider') {
                return `
                <div style="padding: 10px 30px; background-color: #ffffff;">
                    <hr style="border: 0; border-top: 2px solid #e8e4d1; margin: 0;">
                </div>`;
            }
            return '';
        }).join('');
    }

    const preheaderHtml = settings.preheader ? `
        <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
            ${escapeHtml(settings.preheader)}
        </div>
    ` : '';

    const browserLinkHtml = settings.showBrowserLink !== false ? `
        <div style="text-align: right; font-size: 11px; color: #777777; padding: 10px 18px; border-bottom: 1px solid #f0f0f0;">
            <a href="#" style="color: #666666; text-decoration: underline;">View this email in your browser</a>
        </div>
    ` : '';

    const bannerHtml = settings.showBanner !== false ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${style.headerBg};">
            <tr>
                <td width="38%" valign="bottom" style="padding: 12px 0 0 15px; line-height: 0;">
                    <img src="${baseUrl}bannerplayer.png" alt="Cotuit Player" style="display: block; max-height: 170px; width: auto; max-width: 100%;">
                </td>
                <td width="62%" valign="middle" align="right" style="padding: 20px 25px 20px 10px;">
                    <div style="font-family: 'Georgia', 'Times New Roman', serif; font-size: 34px; line-height: 1.05; text-transform: uppercase; color: #F4F1E1; letter-spacing: 2px; font-weight: bold; text-align: right;">COTUIT<br>KETTLEERS</div>
                </td>
            </tr>
        </table>
    ` : '';

    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; background-color: ${style.canvasBg}; font-family: ${style.fontFamily};">
        ${preheaderHtml}
        <div style="max-width: ${settings.maxWidth || '620px'}; margin: 0 auto; background-color: ${style.contentBg}; box-shadow: 0 4px 10px rgba(0,0,0,0.15); ${!isLiveSend ? 'width: 100%;' : ''}">
            ${browserLinkHtml}
            ${bannerHtml}
            ${blocksHtml}
            <div style="text-align: center; padding: 20px 10px 25px 10px; border-top: 1px solid #EEEEEE; background-color: #FAFAFA;">
                <p style="margin: 0; font-size: 11px; color: #888888; font-family: ${style.fontFamily};">${escapeHtml(settings.footerText || defaultSettings.footerText)}</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

function renderEmailPreview() {
    const container = document.getElementById('email-preview-container');
    if (container) {
        container.innerHTML = generateEmailHtml(false);
    }
}

// -------------------------------------------------------------
// Campaigns & Wizard Navigation
// -------------------------------------------------------------
function startNewCampaignWizard() {
    currentEditingCampaignId = null;
    wizardData = {
        segment: 'all',
        title: '',
        subject: '',
        template: 'Blank Canvas',
        blocks: [],
        style: { ...defaultStyle },
        settings: { ...defaultSettings }
    };
    syncWizardUI();
    switchTab('campaign-editor');
    goToWizardStep('recipients');
}

function startNewCampaignWizardWithTemplate(templateName) {
    startNewCampaignWizard();
    selectWizardTemplate(templateName);
    goToWizardStep('setup');
}

function editCampaign(campaignId) {
    const c = loadedCampaigns.find(item => item.id === campaignId);
    if (!c) return;

    currentEditingCampaignId = c.id;
    
    let loadedBlocks = [];
    let loadedStyle = { ...defaultStyle };
    let loadedSettings = { ...defaultSettings };

    try {
        if (c.body_text && c.body_text.trim().startsWith('{')) {
            const parsed = JSON.parse(c.body_text);
            loadedBlocks = parsed.blocks || [];
            loadedStyle = { ...defaultStyle, ...(parsed.style || {}) };
            loadedSettings = { ...defaultSettings, ...(parsed.settings || {}) };
        } else if (c.body_text && c.body_text.trim().startsWith('[')) {
            loadedBlocks = JSON.parse(c.body_text);
        } else {
            loadedBlocks = [{ type: 'text', heading: c.headline || c.title || 'Welcome', body: c.body_text || '' }];
        }
    } catch (e) {
        loadedBlocks = [{ type: 'text', heading: c.headline || c.title || 'Welcome', body: c.body_text || '' }];
    }

    wizardData = {
        segment: 'all',
        title: c.title || '',
        subject: c.subject || '',
        template: c.template_name || 'Blank Canvas',
        blocks: loadedBlocks,
        style: loadedStyle,
        settings: loadedSettings
    };

    syncWizardUI();
    switchTab('campaign-editor');
    goToWizardStep('design');
}

function selectAudienceSegment(segment) {
    wizardData.segment = segment;
    document.querySelectorAll('.segment-card').forEach(card => {
        card.classList.remove('border-[#611724]', 'bg-red-50/20');
        card.classList.add('border-gray-200');
    });
    const activeCard = document.getElementById(`segment-card-${segment}`);
    if (activeCard) {
        activeCard.classList.remove('border-gray-200');
        activeCard.classList.add('border-[#611724]', 'bg-red-50/20');
    }
}

function selectWizardTemplate(templateName) {
    wizardData.template = templateName;
    
    if (templateName === 'Blank Canvas') {
        wizardData.blocks = [];
    } else if (templateName === 'The Weekly Ballpark Bulletin' || templateName === 'The Kettleers Gazette') {
        wizardData.blocks = [
            { type: 'text', heading: 'Welcome to the Newsletter!', body: 'The first update from Kettleers Nation!' },
            { type: 'promo', heading: 'Stocking Stuffers Promo', body: 'The Perfect Stocking Stuffers! Use code FANS20 for 20% off all caps, tees, and collectibles.', cta: 'Shop Holiday Special', image: 'StockingStuffer.png' }
        ];
    }

    document.querySelectorAll('.template-wizard-card').forEach(card => {
        card.classList.remove('border-[#4f111c]', 'shadow-lg');
        card.classList.add('border-gray-200');
    });
    const activeCard = document.getElementById(`template-card-${templateName}`);
    if (activeCard) {
        activeCard.classList.remove('border-gray-200');
        activeCard.classList.add('border-[#4f111c]', 'shadow-lg');
    }

    renderEditorBlocks();
    renderEmailPreview();
}

function syncSetupFields() {
    const titleInput = document.getElementById('setup-campaign-title');
    const subjectInput = document.getElementById('setup-campaign-subject');
    if (titleInput) wizardData.title = titleInput.value;
    if (subjectInput) wizardData.subject = subjectInput.value;
}

function syncWizardUI() {
    const titleInput = document.getElementById('setup-campaign-title');
    const subjectInput = document.getElementById('setup-campaign-subject');
    if (titleInput) titleInput.value = wizardData.title || '';
    if (subjectInput) subjectInput.value = wizardData.subject || '';
    selectAudienceSegment(wizardData.segment || 'all');
    selectWizardTemplate(wizardData.template || 'Blank Canvas');
    syncStyleAndSettingsUI();
}

function populateConfirmStep() {
    syncSetupFields();
    
    const audienceCount = wizardData.segment === 'all' 
        ? allSubscribers.length 
        : allSubscribers.filter(s => s.segment === wizardData.segment).length;

    const audienceName = wizardData.segment === 'all' ? 'All Active Subscribers' : wizardData.segment;
    
    const audEl = document.getElementById('confirm-review-audience');
    const subEl = document.getElementById('confirm-review-subject');
    const tplEl = document.getElementById('confirm-review-template');

    if (audEl) audEl.textContent = `${audienceName} (${audienceCount} fans)`;
    if (subEl) subEl.textContent = wizardData.subject || '(No Subject Line Set)';
    if (tplEl) tplEl.textContent = wizardData.template;
}

function goToWizardStep(stepName) {
    const stepIndex = WIZARD_STEPS.indexOf(stepName);
    if (stepIndex === -1) return;
    currentWizardStepIndex = stepIndex;

    document.querySelectorAll('.wizard-pane').forEach(el => el.classList.add('hidden-view'));
    const activePane = document.getElementById(`wizard-step-${stepName}`);
    if (activePane) activePane.classList.remove('hidden-view');

    WIZARD_STEPS.forEach((name, i) => {
        const link = document.getElementById(`step-nav-${name}`);
        if (!link) return;
        if (i === currentWizardStepIndex) {
            link.className = "wizard-step-link font-bold text-white text-xs md:text-sm underline underline-offset-4";
        } else if (i < currentWizardStepIndex) {
            link.className = "wizard-step-link text-white/90 hover:text-white text-xs md:text-sm cursor-pointer";
        } else {
            link.className = "wizard-step-link opacity-40 hover:opacity-100 text-xs md:text-sm cursor-pointer";
        }
    });

    const prevLabel = document.getElementById('wizard-prev-label');
    const nextBtn = document.getElementById('wizard-next-btn');

    if (prevLabel) prevLabel.textContent = currentWizardStepIndex === 0 ? "Exit" : "Back";
    
    if (nextBtn) {
        if (currentWizardStepIndex === WIZARD_STEPS.length - 1) {
            nextBtn.classList.add('hidden');
        } else {
            nextBtn.classList.remove('hidden');
            const nextStepName = WIZARD_STEPS[currentWizardStepIndex + 1];
            const nextLabel = document.getElementById('wizard-next-label');
            if (nextLabel) nextLabel.textContent = `Next: ${nextStepName.charAt(0).toUpperCase() + nextStepName.slice(1)}`;
        }
    }

    if (stepName === 'design') {
        syncSetupFields();
        syncStyleAndSettingsUI();
        renderEditorBlocks();
        renderEmailPreview();
    }

    if (stepName === 'confirm') {
        populateConfirmStep();
    }

    safeCreateIcons();
}

function wizardNextStep() {
    if (currentWizardStepIndex < WIZARD_STEPS.length - 1) {
        goToWizardStep(WIZARD_STEPS[currentWizardStepIndex + 1]);
    }
}

function wizardPrevStep() {
    if (currentWizardStepIndex > 0) {
        goToWizardStep(WIZARD_STEPS[currentWizardStepIndex - 1]);
    } else {
        switchTab('campaigns');
    }
}

function setPreviewDevice(device) {
    const container = document.getElementById('email-preview-container');
    const desktopBtn = document.getElementById('preview-btn-desktop');
    const mobileBtn = document.getElementById('preview-btn-mobile');

    if (device === 'mobile') {
        if (container) container.classList.add('preview-mobile');
        if (desktopBtn) desktopBtn.className = "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold text-gray-500 hover:text-black transition-colors";
        if (mobileBtn) mobileBtn.className = "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold text-[#611724] bg-gray-200 transition-colors";
    } else {
        if (container) container.classList.remove('preview-mobile');
        if (desktopBtn) desktopBtn.className = "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold text-[#611724] bg-gray-200 transition-colors";
        if (mobileBtn) mobileBtn.className = "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold text-gray-500 hover:text-black transition-colors";
    }
}

// -------------------------------------------------------------
// App Navigation & Modals
// -------------------------------------------------------------
const btn = document.getElementById('mobile-menu-btn');
const sidebar = document.getElementById('sidebar');
if (btn) btn.addEventListener('click', () => { sidebar.classList.toggle('hidden'); });

function switchTab(tabId) {
    const views = [
        'view-dashboard', 'view-campaigns', 'view-templates', 'view-subscribers', 
        'view-campaign-editor', 'view-report', 'view-transactional', 
        'view-analytics', 'view-settings'
    ];
    
    views.forEach(id => { 
        const el = document.getElementById(id); 
        if (el) el.classList.add('hidden-view'); 
    });
    
    const selectedView = document.getElementById('view-' + tabId);
    if (selectedView) selectedView.classList.remove('hidden-view');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + tabId);
    if (activeNav) activeNav.classList.add('active');
    
    if(window.innerWidth < 768 && sidebar) { sidebar.classList.add('hidden'); }
    if (tabId === 'dashboard' || tabId === 'campaigns') loadDashboardAndCampaigns();
    if (tabId === 'subscribers') loadSubscribers();
    safeCreateIcons();
}

function openReportView(campaignId = null) {
    switchTab('report');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const cNav = document.getElementById('nav-campaigns');
    if (cNav) cNav.classList.add('active');

    if (campaignId && loadedCampaigns.length > 0) {
        const c = loadedCampaigns.find(item => item.id === campaignId);
        if (c) {
            const rTitle = document.getElementById('report-title');
            const rMeta = document.getElementById('report-meta');
            const rOpens = document.getElementById('report-opens');
            const rOpenRate = document.getElementById('report-open-rate');
            const rClicks = document.getElementById('report-clicks');
            const rClickRate = document.getElementById('report-click-rate');

            if (rTitle) rTitle.textContent = c.title;
            if (rMeta) rMeta.textContent = `Dispatched • ${c.target_date || 'Recent'}`;
            if (rOpens) rOpens.textContent = Math.round(12410 * (c.open_rate / 100)).toLocaleString();
            if (rOpenRate) rOpenRate.textContent = `${c.open_rate}% Open Rate`;
            if (rClicks) rClicks.textContent = Math.round(12410 * (c.click_rate / 100)).toLocaleString();
            if (rClickRate) rClickRate.textContent = `${c.click_rate}% Click Rate`;
        }
    }
}

function openAddSubscriberModal() {
    const modal = document.getElementById('modal-add-subscriber');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('sub-name').focus();
    }
}

function closeAddSubscriberModal() {
    const modal = document.getElementById('modal-add-subscriber');
    if (modal) {
        modal.classList.add('hidden');
        document.getElementById('add-subscriber-form').reset();
        document.getElementById('sub-error').classList.add('hidden');
    }
}

async function handleAddSubscriber(e) {
    e.preventDefault();
    const nameInput = document.getElementById('sub-name').value;
    const emailInput = document.getElementById('sub-email').value;
    const segmentInput = document.getElementById('sub-segment').value;
    const submitBtn = document.getElementById('sub-submit-btn');
    const errorDiv = document.getElementById('sub-error');
    
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;
    errorDiv.classList.add('hidden');

    const { error } = await db.from('subscribers').insert([
        { name: nameInput, email: emailInput, segment: segmentInput, status: 'Active' }
    ]);

    if (error) {
        console.error('Error inserting subscriber:', error);
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
        submitBtn.textContent = 'Add to List';
        submitBtn.disabled = false;
        return;
    }

    document.getElementById('add-subscriber-form').reset();
    closeAddSubscriberModal();
    loadSubscribers();
    loadDashboardAndCampaigns();
    submitBtn.textContent = 'Add to List';
    submitBtn.disabled = false;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// Save & Send Data
// -------------------------------------------------------------
async function saveCampaign(exitAfterSave = false) {
    syncSetupFields();
    const statusText = document.getElementById('editor-status-text');
    const saveBtn = document.getElementById('editor-save-btn');

    if (statusText) statusText.textContent = 'Saving...';
    if (saveBtn) saveBtn.disabled = true;

    let firstHeadline = 'Kettleers Broadcast';
    if (wizardData.blocks && wizardData.blocks.length > 0) {
        const textBlock = wizardData.blocks.find(b => b.type === 'text') || wizardData.blocks[0];
        firstHeadline = textBlock.heading || 'Kettleers Broadcast';
    }

    const payload = {
        title: (wizardData.title || '').trim() || 'Untitled Campaign',
        subject: (wizardData.subject || '').trim() || 'No Subject',
        headline: firstHeadline,
        body_text: JSON.stringify({
            blocks: wizardData.blocks || [],
            style: wizardData.style || defaultStyle,
            settings: wizardData.settings || defaultSettings
        }), 
        template_name: wizardData.template || 'Blank Canvas',
        status: 'Draft',
        html_content: generateEmailHtml(true)
    };

    let response;
    try {
        if (currentEditingCampaignId) {
            response = await db.from('campaigns').update(payload).eq('id', currentEditingCampaignId);
        } else {
            response = await db.from('campaigns').insert([payload]).select();
            if (response.data && response.data.length > 0) { 
                currentEditingCampaignId = response.data[0].id; 
            }
        }
    } catch (err) {
        console.error('Save failed exception:', err);
        response = { error: err };
    }

    if (saveBtn) saveBtn.disabled = false;

    if (response && response.error) {
        console.error('Error saving campaign:', response.error);
        if (statusText) statusText.textContent = 'Save failed';
        alert('Save failed: ' + (response.error.message || 'Unknown database error'));
        return;
    }

    if (statusText) statusText.textContent = 'Saved to database';
    await loadDashboardAndCampaigns();
    if (exitAfterSave) switchTab('campaigns');
}

async function dispatchCampaignBlast() {
    const btn = document.getElementById('confirm-dispatch-btn');
    btn.textContent = 'Dispatching to fans...';
    btn.disabled = true;

    await saveCampaign(false);

    syncSetupFields();
    const subject = (wizardData.subject || '').trim() || 'Kettleers Broadcast';
    const html_content = generateEmailHtml(true);
    const segment = wizardData.segment || 'all';

    try {
        const { data, error } = await db.functions.invoke('send-campaign', {
            body: { subject, html_content, is_test: false, segment: segment }
        });

        if (error) throw error;

        if (currentEditingCampaignId) {
            await db.from('campaigns').update({ 
                status: 'Sent', 
                open_rate: '0.0', 
                click_rate: '0.0',
                target_date: new Date().toLocaleDateString()
            }).eq('id', currentEditingCampaignId);
        }

        btn.textContent = 'Campaign Dispatched!';
        setTimeout(() => {
            switchTab('campaigns');
            loadDashboardAndCampaigns();
        }, 1200);

    } catch (error) {
        console.error('Error dispatching live blast:', error);
        btn.textContent = 'Send Campaign Now';
        btn.disabled = false;
        alert('Error sending campaign: ' + (error.message || 'Check console'));
    }
}

async function sendTestEmail() {
    const statusText = document.getElementById('editor-status-text');
    if (statusText) statusText.textContent = 'Sending test...';

    syncSetupFields();
    const subject = (wizardData.subject || '').trim() || 'Test Campaign';
    const html_content = generateEmailHtml(true);

    try {
        const { data, error } = await db.functions.invoke('send-campaign', {
            body: { subject, html_content, is_test: true }
        });

        if (error) throw error;
        if (statusText) statusText.textContent = 'Test sent!';
        alert('Success! Test sent to aaron@uscilla.com.');
    } catch (error) {
        console.error('Error sending email:', error);
        if (statusText) statusText.textContent = 'Send failed';
        alert('Error sending email: ' + (error.message || 'Check console'));
    }
}
