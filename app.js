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
let currentEditingSubscriberId = null;
let isEditingTemplate = false;
let currentEditingTemplateName = null;

const WIZARD_STEPS = ['recipients', 'setup', 'template', 'design', 'confirm'];
let currentWizardStepIndex = 0;

const ALL_AUDIENCE_SEGMENTS = ['General Fan', 'All-Star Member', 'Supporter', 'Host Family', 'Alumni'];

const defaultStyle = {
    canvasBg: '#E8E4D1',
    contentBg: '#ffffff',
    headerBg: '#611724', // Updated to Kettleer red
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
    footerText: '© 2026 Cotuit Kettleers Baseball. Lowell Park, Cotuit, MA.',
    bannerText: 'COTUIT<br>KETTLEERS',
    bannerImage: 'bannerplayer.png'
};

// -------------------------------------------------------------
// Authentication Flow (Fail-Safe View Toggle)
// -------------------------------------------------------------
function setViewAuthenticated(isAuthenticated) {
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');

    if (isAuthenticated) {
        if (authView) {
            authView.classList.add('hidden-view');
            authView.style.setProperty('display', 'none', 'important');
        }
        if (appView) {
            appView.classList.remove('hidden-view');
            appView.style.removeProperty('display');
        }
    } else {
        if (authView) {
            authView.classList.remove('hidden-view');
            authView.style.removeProperty('display');
        }
        if (appView) {
            appView.classList.add('hidden-view');
            appView.style.setProperty('display', 'none', 'important');
        }
    }
}

if (db) {
    db.auth.onAuthStateChange((event, session) => {
        if (session) {
            setViewAuthenticated(true);
            try { initDashboardFilters(); } catch (e) { console.warn(e); }
            try { loadSubscribers(); } catch (e) { console.warn(e); }
            try { loadDashboardAndCampaigns(); } catch (e) { console.warn(e); }
        } else {
            setViewAuthenticated(false);
        }
    });
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    const errorDiv = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (!db) {
        if (errorDiv) {
            errorDiv.textContent = 'Database failed to initialize. Please refresh.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (submitBtn) {
        submitBtn.textContent = 'Authenticating...';
        submitBtn.disabled = true;
    }
    if (errorDiv) errorDiv.classList.add('hidden');

    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });

        if (error) {
            if (errorDiv) {
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('hidden');
            }
            if (submitBtn) {
                submitBtn.textContent = 'Sign In';
                submitBtn.disabled = false;
            }
        } else if (data && data.session) {
            // Immediate forced UI swap on authentication success
            setViewAuthenticated(true);
            if (submitBtn) {
                submitBtn.textContent = 'Sign In';
                submitBtn.disabled = false;
            }
            document.getElementById('login-form')?.reset();
            try { initDashboardFilters(); } catch (e) { console.warn(e); }
            try { loadSubscribers(); } catch (e) { console.warn(e); }
            try { loadDashboardAndCampaigns(); } catch (e) { console.warn(e); }
        }
    } catch (err) {
        console.error('Login exception:', err);
        if (errorDiv) {
            errorDiv.textContent = err.message || 'Authentication error';
            errorDiv.classList.remove('hidden');
        }
        if (submitBtn) {
            submitBtn.textContent = 'Sign In';
            submitBtn.disabled = false;
        }
    }
}

async function handleLogout() {
    if (db) await db.auth.signOut();
    setViewAuthenticated(false);
}

// -------------------------------------------------------------
// Multi-Audience Selection Engine
// -------------------------------------------------------------
function toggleAudienceSegment(clickedSegment) {
    if (!wizardData.segments) wizardData.segments = [];
    const err = document.getElementById('audience-error');
    if (err) err.classList.add('hidden');

    if (clickedSegment === 'all') {
        if (wizardData.segments.includes('all')) {
            wizardData.segments = [];
        } else {
            wizardData.segments = ['all'];
        }
    } else {
        if (wizardData.segments.includes('all')) {
            wizardData.segments = [clickedSegment];
        } else {
            const idx = wizardData.segments.indexOf(clickedSegment);
            if (idx > -1) {
                wizardData.segments.splice(idx, 1);
            } else {
                wizardData.segments.push(clickedSegment);
                if (wizardData.segments.length === ALL_AUDIENCE_SEGMENTS.length) {
                    wizardData.segments = ['all'];
                }
            }
        }
    }

    renderAudienceCardsState();
}

function renderAudienceCardsState() {
    const isAll = wizardData.segments && wizardData.segments.includes('all');
    const summaryBadge = document.getElementById('audience-selection-summary');

    const updateCard = (id, checkId, isSelected) => {
        const card = document.getElementById(id);
        const check = document.getElementById(checkId);
        if (card) {
            if (isSelected) {
                card.classList.remove('border-gray-200', 'bg-white');
                card.classList.add('border-[#611724]', 'bg-[#F4F1E1]/40');
            } else {
                card.classList.remove('border-[#611724]', 'bg-[#F4F1E1]/40');
                card.classList.add('border-gray-200', 'bg-white');
            }
        }
        if (check) {
            if (isSelected) {
                check.className = 'w-4 h-4 rounded border border-[#611724] bg-[#611724] text-white flex items-center justify-center text-[10px] font-bold';
            } else {
                check.className = 'w-4 h-4 rounded border border-gray-400 bg-white text-transparent flex items-center justify-center text-[10px] font-bold';
            }
        }
    };

    updateCard('segment-card-all', 'segment-check-all', isAll);

    ALL_AUDIENCE_SEGMENTS.forEach(seg => {
        const isSelected = isAll || (wizardData.segments && wizardData.segments.includes(seg));
        updateCard(`segment-card-${seg}`, `segment-check-${seg}`, isSelected);
    });

    if (summaryBadge) {
        if (isAll) {
            summaryBadge.textContent = `All Active Subscribers (${allSubscribers.length} fans)`;
        } else if (!wizardData.segments || wizardData.segments.length === 0) {
            summaryBadge.textContent = `0 Groups Selected`;
        } else {
            const count = allSubscribers.filter(s => wizardData.segments.includes(s.segment)).length;
            summaryBadge.textContent = `${wizardData.segments.length} Groups Selected (${count} fans)`;
        }
    }
}

// -------------------------------------------------------------
// Step Validation (Title, Subject & Audience Required)
// -------------------------------------------------------------
function validateCurrentStep() {
    if (currentWizardStepIndex === 0) {
        if (!wizardData.segments || wizardData.segments.length === 0) {
            const err = document.getElementById('audience-error');
            if (err) err.classList.remove('hidden');
            return false;
        }
        return true;
    }

    if (currentWizardStepIndex === 1) {
        syncSetupFields();
        const titleInput = document.getElementById('setup-campaign-title');
        const subjectInput = document.getElementById('setup-campaign-subject');
        const titleErr = document.getElementById('setup-title-error');
        const subjectErr = document.getElementById('setup-subject-error');

        let valid = true;

        if (!wizardData.title || !wizardData.title.trim()) {
            if (titleInput) {
                titleInput.classList.add('border-red-500', 'bg-red-50/20');
                titleInput.focus();
            }
            if (titleErr) titleErr.classList.remove('hidden');
            valid = false;
        } else {
            if (titleInput) titleInput.classList.remove('border-red-500', 'bg-red-50/20');
            if (titleErr) titleErr.classList.add('hidden');
        }

        if (!wizardData.subject || !wizardData.subject.trim()) {
            if (subjectInput) {
                subjectInput.classList.add('border-red-500', 'bg-red-50/20');
                if (valid) subjectInput.focus();
            }
            if (subjectErr) subjectErr.classList.remove('hidden');
            valid = false;
        } else {
            if (subjectInput) subjectInput.classList.remove('border-red-500', 'bg-red-50/20');
            if (subjectErr) subjectErr.classList.add('hidden');
        }

        safeCreateIcons();
        return valid;
    }

    return true;
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
// Live Analytics Screen Rendering
// -------------------------------------------------------------
function renderAnalyticsView() {
    const totalDeliveriesEl = document.getElementById('analytics-total-deliveries');
    const avgOpenEl = document.getElementById('analytics-avg-open');
    const avgClickEl = document.getElementById('analytics-avg-click');
    const bounceRateEl = document.getElementById('analytics-bounce-rate');
    const totalBouncesEl = document.getElementById('analytics-total-bounces');
    const totalSubscribersEl = document.getElementById('analytics-total-subscribers');
    const segmentBarsContainer = document.getElementById('analytics-segment-bars');
    const campaignsChartContainer = document.getElementById('analytics-campaigns-chart');

    let sent = loadedCampaigns.filter(c => c.status === 'Sent');

    const startDateInput = document.getElementById('analytics-start-date');
    const endDateInput = document.getElementById('analytics-end-date');
    
    if (startDateInput && endDateInput) {
        const startVal = startDateInput.value;
        const endVal = endDateInput.value;
        
        if (startVal || endVal) {
            sent = sent.filter(c => {
                if (!c.target_date && !c.created_at) return false;
                const campDate = new Date(c.target_date || c.created_at);
                campDate.setHours(0,0,0,0);
                let pass = true;
                
                if (startVal) {
                    const sParts = startVal.split('-');
                    const sDate = new Date(sParts[0], sParts[1]-1, sParts[2]);
                    if (campDate < sDate) pass = false;
                }
                if (endVal) {
                    const eParts = endVal.split('-');
                    const eDate = new Date(eParts[0], eParts[1]-1, eParts[2]);
                    if (campDate > eDate) pass = false;
                }
                return pass;
            });
        }
    }

    const deliveriesCount = sent.reduce((sum, c) => sum + (Number(c.deliveries) || 0), 0);
    const opensCount = sent.reduce((sum, c) => sum + (Number(c.opens) || 0), 0);
    const clicksCount = sent.reduce((sum, c) => sum + (Number(c.clicks) || 0), 0);
    const bouncesCount = sent.reduce((sum, c) => sum + (Number(c.bounces) || 0), 0);

    const avgOpenRate = sent.length > 0 
        ? (sent.reduce((sum, c) => sum + Number(c.open_rate || 0), 0) / sent.length).toFixed(1)
        : '0.0';

    const avgClickRate = sent.length > 0 
        ? (sent.reduce((sum, c) => sum + Number(c.click_rate || 0), 0) / sent.length).toFixed(1)
        : '0.0';

    const totalAttempts = deliveriesCount + bouncesCount;
    const bounceRate = totalAttempts > 0 
        ? ((bouncesCount / totalAttempts) * 100).toFixed(1)
        : '0.0';

    if (totalDeliveriesEl) totalDeliveriesEl.textContent = deliveriesCount.toLocaleString();
    if (avgOpenEl) avgOpenEl.textContent = `${avgOpenRate}%`;
    if (avgClickEl) avgClickEl.textContent = `${avgClickRate}%`;
    if (bounceRateEl) bounceRateEl.textContent = `${bounceRate}%`;
    if (totalBouncesEl) totalBouncesEl.textContent = `${bouncesCount} total bounces`;
    if (totalSubscribersEl) totalSubscribersEl.textContent = `${allSubscribers.length.toLocaleString()} Total Fans`;

    // Funnel
    const funnelDeliveredVal = document.getElementById('funnel-delivered-val');
    const funnelOpenedVal = document.getElementById('funnel-opened-val');
    const funnelOpenedBar = document.getElementById('funnel-opened-bar');
    const funnelClickedVal = document.getElementById('funnel-clicked-val');
    const funnelClickedBar = document.getElementById('funnel-clicked-bar');
    const funnelBouncedVal = document.getElementById('funnel-bounced-val');
    const funnelBouncedBar = document.getElementById('funnel-bounced-bar');

    if (funnelDeliveredVal) funnelDeliveredVal.textContent = `${deliveriesCount} (100%)`;

    const openPct = deliveriesCount > 0 ? Math.min(100, Math.round((opensCount / deliveriesCount) * 100)) : (Number(avgOpenRate) || 0);
    if (funnelOpenedVal) funnelOpenedVal.textContent = `${opensCount} (${openPct}%)`;
    if (funnelOpenedBar) funnelOpenedBar.style.width = `${openPct}%`;

    const clickPct = deliveriesCount > 0 ? Math.min(100, Math.round((clicksCount / deliveriesCount) * 100)) : (Number(avgClickRate) || 0);
    if (funnelClickedVal) funnelClickedVal.textContent = `${clicksCount} (${clickPct}%)`;
    if (funnelClickedBar) funnelClickedBar.style.width = `${clickPct}%`;

    if (funnelBouncedVal) funnelBouncedVal.textContent = `${bouncesCount} (${bounceRate}%)`;
    if (funnelBouncedBar) funnelBouncedBar.style.width = `${Math.min(100, Number(bounceRate))}%`;

    // Audience Bars
    if (segmentBarsContainer) {
        const total = allSubscribers.length || 1;
        segmentBarsContainer.innerHTML = ALL_AUDIENCE_SEGMENTS.map(seg => {
            const count = allSubscribers.filter(s => s.segment === seg).length;
            const pct = Math.round((count / total) * 100);
            return `
                <div>
                    <div class="flex justify-between font-bold mb-1">
                        <span>${seg}</span>
                        <span>${count} fans (${pct}%)</span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div class="bg-[#4f111c] h-2.5 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // History Chart
    if (campaignsChartContainer) {
        if (sent.length === 0) {
            campaignsChartContainer.innerHTML = `<div class="text-center text-gray-400 py-8 font-sans italic">No campaign blasts dispatched yet. Send a broadcast to generate engagement graphs.</div>`;
        } else {
            campaignsChartContainer.innerHTML = sent.slice(0, 5).map(c => {
                const openVal = Math.min(100, Number(c.open_rate || 0));
                const clickVal = Math.min(100, Number(c.click_rate || 0));
                return `
                    <div class="font-sans text-xs border-b border-gray-100 pb-3">
                        <div class="flex justify-between items-center mb-1 font-bold">
                            <span class="text-gray-900">${escapeHtml(c.title)}</span>
                            <span class="text-gray-500">${c.target_date || 'Recent'}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-4 mt-2">
                            <div>
                                <div class="flex justify-between text-[11px] mb-1">
                                    <span class="text-gray-600">Opens</span>
                                    <span class="font-bold text-[#611724]">${openVal}%</span>
                                </div>
                                <div class="w-full bg-gray-100 rounded-full h-2">
                                    <div class="bg-[#611724] h-2 rounded-full" style="width: ${openVal}%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex justify-between text-[11px] mb-1">
                                    <span class="text-gray-600">Clicks</span>
                                    <span class="font-bold text-[#387843]">${clickVal}%</span>
                                </div>
                                <div class="w-full bg-gray-100 rounded-full h-2">
                                    <div class="bg-[#387843] h-2 rounded-full" style="width: ${clickVal}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
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
        renderAudienceCardsState();
        renderAnalyticsView();
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
            <tr onclick="openEditSubscriberModal('${sub.id}')" class="cursor-pointer border-b border-gray-200 hover:bg-black/5 transition-colors">
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
    ALL_AUDIENCE_SEGMENTS.forEach(seg => {
        setCardCount(`segment-count-${seg}`, allSubscribers.filter(s => s.segment === seg).length);
    });
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
        renderAnalyticsView();

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
                
                const actionBtn = isDraft  
    ? `<button onclick="editCampaign(${c.id})" class="bg-[#4f111c] text-[#F4F1E1] text-xs font-bold px-3 py-1.5 rounded uppercase hover:bg-black transition-colors">Edit</button>
       <button onclick="deleteCampaign(${c.id})" class="ml-2 bg-red-100 text-red-600 text-xs font-bold px-3 py-1.5 rounded uppercase hover:bg-red-200 transition-colors">Delete</button>`
    : `<button onclick="openReportView(${c.id})" class="bg-[#387843] text-white text-xs font-bold px-3 py-1.5 rounded uppercase hover:bg-black transition-colors">Report</button>
       <button onclick="deleteCampaign(${c.id})" class="ml-2 bg-red-100 text-red-600 text-xs font-bold px-3 py-1.5 rounded uppercase hover:bg-red-200 transition-colors">Delete</button>`;
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
    setVal('settings-banner-text', cfg.bannerText || 'COTUIT<br>KETTLEERS');
    setVal('settings-banner-image', cfg.bannerImage || 'bannerplayer.png');
    setVal('settings-footer-text', cfg.footerText || defaultSettings.footerText);

    const bannerCheck = document.getElementById('settings-show-banner');
    if (bannerCheck) bannerCheck.checked = cfg.showBanner !== false;

    const browserCheck = document.getElementById('settings-show-browser-link');
    if (browserCheck) browserCheck.checked = cfg.showBrowserLink !== false;

    const count = document.getElementById('settings-preheader-count');
    if (count) count.textContent = `${(cfg.preheader || '').length} / 120`;
}

// -------------------------------------------------------------
// Mailchimp 13-Block Engine (Add, Edit, Move, Delete)
// -------------------------------------------------------------
function addBlock(type) {
    if (!wizardData.blocks) wizardData.blocks = [];

    switch (type) {
        case 'text':
            wizardData.blocks.push({ type: 'text', heading: 'New Headline', body: 'Start typing your newsletter announcement here...' });
            break;
        case 'boxed_text':
            wizardData.blocks.push({ type: 'boxed_text', heading: 'Important Notice', body: 'Boxed callout message details go here...', bg_color: '#F4F1E1', border_color: '#611724' });
            break;
        case 'divider':
            wizardData.blocks.push({ type: 'divider', line_style: 'solid', line_color: '#e8e4d1' });
            break;
        case 'image':
            wizardData.blocks.push({ type: 'image', image_url: 'StockingStuffer.png', link_url: 'https://kettleers.org', alt_text: 'Kettleers Image' });
            break;
        case 'image_group':
            wizardData.blocks.push({ type: 'image_group', image1_url: 'StockingStuffer.png', link1_url: '#', image2_url: 'bannerplayer.png', link2_url: '#' });
            break;
        case 'image_card':
            wizardData.blocks.push({ type: 'image_card', image_url: 'StockingStuffer.png', heading: 'Featured Item', body: 'Card description and details.', cta_text: 'Learn More', cta_url: '#', bg_color: '#FFFDFB' });
            break;
        case 'image_caption':
            wizardData.blocks.push({ type: 'image_caption', image_url: 'bannerplayer.png', caption: 'Lowell Park action during the Cape Cod Baseball League season.' });
            break;
        case 'social_share':
            wizardData.blocks.push({ type: 'social_share', heading: 'Share this update with fellow fans' });
            break;
        case 'social_follow':
            wizardData.blocks.push({ type: 'social_follow', facebook_url: 'https://facebook.com/kettleers', instagram_url: 'https://instagram.com/kettleers', twitter_url: 'https://x.com/kettleers', website_url: 'https://kettleers.org' });
            break;
        case 'button':
            wizardData.blocks.push({ type: 'button', cta_text: 'Visit Lowell Park', cta_url: 'https://kettleers.org', align: 'center', button_color: '#2E5B82' });
            break;
        case 'footer':
            wizardData.blocks.push({ type: 'footer', text: 'You are receiving this because you are an official supporter of Cotuit Kettleers Baseball.' });
            break;
        case 'code':
            wizardData.blocks.push({ type: 'code', html_code: '<div style="padding: 15px; text-align: center; background: #f4f4f4; border: 1px dashed #ccc; font-family: sans-serif; font-size: 13px;">Custom HTML embed block</div>' });
            break;
        case 'video':
            wizardData.blocks.push({ type: 'video', title: 'Cotuit Kettleers Highlights', video_url: 'https://youtube.com', thumbnail_url: 'bannerplayer.png' });
            break;
        case 'promo':
            wizardData.blocks.push({ type: 'promo', heading: 'Stocking Stuffers Promo', body: 'The Perfect Stocking Stuffers! Use code FANS20 for 20% off.', cta: 'Shop Holiday Special', image: 'StockingStuffer.png' });
            break;
    }

    renderEditorBlocks();
    renderEmailPreview();
    
    setTimeout(() => {
        const listEl = document.getElementById('editor-blocks-list');
        if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
}

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
                <div class="mb-3">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Body</label>
                    <textarea rows="4" oninput="updateBlock(${i}, 'body', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none resize-none leading-relaxed">${escapeHtml(block.body || '')}</textarea>
                </div>
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Alignment</label>
                    <select onchange="updateBlock(${i}, 'align', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                        <option value="left" ${block.align === 'left' || !block.align ? 'selected' : ''}>Left</option>
                        <option value="center" ${block.align === 'center' ? 'selected' : ''}>Center</option>
                        <option value="right" ${block.align === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                </div>
            `;
        } else if (block.type === 'boxed_text') {
            innerInputs = `
                <div class="mb-3">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Boxed Heading</label>
                    <input type="text" value="${escapeHtml(block.heading || '')}" oninput="updateBlock(${i}, 'heading', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none">
                </div>
                <div class="mb-3">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Message Body</label>
                    <textarea rows="3" oninput="updateBlock(${i}, 'body', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none resize-none leading-relaxed">${escapeHtml(block.body || '')}</textarea>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Background Color</label>
                        <input type="color" value="${block.bg_color || '#F4F1E1'}" oninput="updateBlock(${i}, 'bg_color', this.value)" class="w-full h-8 rounded border border-gray-300 p-0.5 cursor-pointer">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Border Color</label>
                        <input type="color" value="${block.border_color || '#611724'}" oninput="updateBlock(${i}, 'border_color', this.value)" class="w-full h-8 rounded border border-gray-300 p-0.5 cursor-pointer">
                    </div>
                </div>
            `;
        } else if (block.type === 'divider') {
            innerInputs = `
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Line Style</label>
                        <select onchange="updateBlock(${i}, 'line_style', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                            <option value="solid" ${block.line_style === 'solid' ? 'selected' : ''}>Solid</option>
                            <option value="dashed" ${block.line_style === 'dashed' ? 'selected' : ''}>Dashed</option>
                            <option value="dotted" ${block.line_style === 'dotted' ? 'selected' : ''}>Dotted</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Line Color</label>
                        <input type="color" value="${block.line_color || '#e8e4d1'}" oninput="updateBlock(${i}, 'line_color', this.value)" class="w-full h-8 rounded border border-gray-300 p-0.5 cursor-pointer">
                    </div>
                </div>
            `;
        } else if (block.type === 'image') {
            innerInputs = `
                <div class="mb-3">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Image URL / Filename</label>
                    <input type="text" value="${escapeHtml(block.image_url || '')}" oninput="updateBlock(${i}, 'image_url', this.value)" placeholder="StockingStuffer.png or https://..." class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none">
                </div>
                <div class="mb-3">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Link URL (Optional)</label>
                    <input type="text" value="${escapeHtml(block.link_url || '')}" oninput="updateBlock(${i}, 'link_url', this.value)" placeholder="https://kettleers.org" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none">
                </div>
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Alt Text</label>
                    <input type="text" value="${escapeHtml(block.alt_text || '')}" oninput="updateBlock(${i}, 'alt_text', this.value)" placeholder="Image description" class="w-full bg-white border border-gray-300 rounded p-2 text-sm focus:border-[#4f111c] focus:outline-none">
                </div>
            `;
        } else if (block.type === 'image_group') {
            innerInputs = `
                <div class="p-2 border border-gray-200 rounded mb-3 bg-gray-50">
                    <label class="block text-[10px] font-bold uppercase text-gray-700 mb-1">Left Image</label>
                    <input type="text" value="${escapeHtml(block.image1_url || '')}" oninput="updateBlock(${i}, 'image1_url', this.value)" placeholder="Image 1 URL" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs mb-1">
                    <input type="text" value="${escapeHtml(block.link1_url || '')}" oninput="updateBlock(${i}, 'link1_url', this.value)" placeholder="Click Link 1" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
                <div class="p-2 border border-gray-200 rounded bg-gray-50">
                    <label class="block text-[10px] font-bold uppercase text-gray-700 mb-1">Right Image</label>
                    <input type="text" value="${escapeHtml(block.image2_url || '')}" oninput="updateBlock(${i}, 'image2_url', this.value)" placeholder="Image 2 URL" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs mb-1">
                    <input type="text" value="${escapeHtml(block.link2_url || '')}" oninput="updateBlock(${i}, 'link2_url', this.value)" placeholder="Click Link 2" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
            `;
        } else if (block.type === 'image_card') {
            innerInputs = `
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Card Image</label>
                    <input type="text" value="${escapeHtml(block.image_url || '')}" oninput="updateBlock(${i}, 'image_url', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Card Heading</label>
                    <input type="text" value="${escapeHtml(block.heading || '')}" oninput="updateBlock(${i}, 'heading', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Card Text</label>
                    <textarea rows="2" oninput="updateBlock(${i}, 'body', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs resize-none">${escapeHtml(block.body || '')}</textarea>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <input type="text" value="${escapeHtml(block.cta_text || '')}" oninput="updateBlock(${i}, 'cta_text', this.value)" placeholder="Button Label" class="bg-white border border-gray-300 rounded p-1.5 text-xs">
                    <input type="text" value="${escapeHtml(block.cta_url || '')}" oninput="updateBlock(${i}, 'cta_url', this.value)" placeholder="Button Link" class="bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
            `;
        } else if (block.type === 'image_caption') {
            innerInputs = `
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Image URL</label>
                    <input type="text" value="${escapeHtml(block.image_url || '')}" oninput="updateBlock(${i}, 'image_url', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-xs">
                </div>
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Caption Text</label>
                    <textarea rows="2" oninput="updateBlock(${i}, 'caption', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-xs resize-none leading-relaxed">${escapeHtml(block.caption || '')}</textarea>
                </div>
            `;
        } else if (block.type === 'social_share') {
            innerInputs = `
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Callout Text</label>
                    <input type="text" value="${escapeHtml(block.heading || '')}" oninput="updateBlock(${i}, 'heading', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm">
                    <p class="text-[10px] text-gray-500 mt-1 italic">Automatically inserts Facebook, X, LinkedIn, and Email share buttons.</p>
                </div>
            `;
        } else if (block.type === 'social_follow') {
            innerInputs = `
                <div class="space-y-2">
                    <input type="text" value="${escapeHtml(block.facebook_url || '')}" oninput="updateBlock(${i}, 'facebook_url', this.value)" placeholder="Facebook URL" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                    <input type="text" value="${escapeHtml(block.instagram_url || '')}" oninput="updateBlock(${i}, 'instagram_url', this.value)" placeholder="Instagram URL" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                    <input type="text" value="${escapeHtml(block.twitter_url || '')}" oninput="updateBlock(${i}, 'twitter_url', this.value)" placeholder="X / Twitter URL" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                    <input type="text" value="${escapeHtml(block.website_url || '')}" oninput="updateBlock(${i}, 'website_url', this.value)" placeholder="Official Website" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
            `;
        } else if (block.type === 'button') {
            innerInputs = `
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Button Text</label>
                    <input type="text" value="${escapeHtml(block.cta_text || '')}" oninput="updateBlock(${i}, 'cta_text', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm">
                </div>
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Destination URL</label>
                    <input type="text" value="${escapeHtml(block.cta_url || '')}" oninput="updateBlock(${i}, 'cta_url', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-sm">
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Alignment</label>
                        <select onchange="updateBlock(${i}, 'align', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                            <option value="center" ${block.align === 'center' ? 'selected' : ''}>Center</option>
                            <option value="left" ${block.align === 'left' ? 'selected' : ''}>Left</option>
                            <option value="right" ${block.align === 'right' ? 'selected' : ''}>Right</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Button Color</label>
                        <input type="color" value="${block.button_color || '#2E5B82'}" oninput="updateBlock(${i}, 'button_color', this.value)" class="w-full h-8 rounded border border-gray-300 p-0.5 cursor-pointer">
                    </div>
                </div>
            `;
        } else if (block.type === 'footer') {
            innerInputs = `
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Footer Disclaimer & Address</label>
                    <textarea rows="3" oninput="updateBlock(${i}, 'text', this.value)" class="w-full bg-white border border-gray-300 rounded p-2 text-xs resize-none">${escapeHtml(block.text || '')}</textarea>
                </div>
            `;
        } else if (block.type === 'code') {
            innerInputs = `
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Custom Raw HTML</label>
                    <textarea rows="4" oninput="updateBlock(${i}, 'html_code', this.value)" class="w-full bg-gray-900 text-emerald-400 font-mono border border-gray-700 rounded p-2 text-xs resize-none">${escapeHtml(block.html_code || '')}</textarea>
                </div>
            `;
        } else if (block.type === 'video') {
            innerInputs = `
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Video Title</label>
                    <input type="text" value="${escapeHtml(block.title || '')}" oninput="updateBlock(${i}, 'title', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Video URL (YouTube/Vimeo)</label>
                    <input type="text" value="${escapeHtml(block.video_url || '')}" oninput="updateBlock(${i}, 'video_url', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Video Thumbnail Image</label>
                    <input type="text" value="${escapeHtml(block.thumbnail_url || '')}" oninput="updateBlock(${i}, 'thumbnail_url', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
            `;
        } else if (block.type === 'promo') {
            innerInputs = `
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Promo Title</label>
                    <input type="text" value="${escapeHtml(block.heading || '')}" oninput="updateBlock(${i}, 'heading', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
                <div class="mb-2">
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Promo Details</label>
                    <textarea rows="2" oninput="updateBlock(${i}, 'body', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs resize-none">${escapeHtml(block.body || '')}</textarea>
                </div>
                <div>
                    <label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Button Text</label>
                    <input type="text" value="${escapeHtml(block.cta || '')}" oninput="updateBlock(${i}, 'cta', this.value)" class="w-full bg-white border border-gray-300 rounded p-1.5 text-xs">
                </div>
            `;
        }

        return `
            <div class="bg-white border-2 border-gray-200 rounded-lg shadow-sm overflow-hidden focus-within:border-[#4f111c] transition-colors">
                <div class="bg-gray-100 p-2.5 flex justify-between items-center border-b border-gray-200">
                    <div class="flex items-center gap-2 text-gray-700">
                        <i data-lucide="grip-vertical" class="w-4 h-4 opacity-50"></i>
                        <span class="text-xs font-bold uppercase tracking-wider">${block.type.replace('_', ' ')} Block</span>
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
// Live HTML Generator for all 13 Blocks
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
            switch (b.type) {
                case 'text':
                    return `
                    <div style="padding: 20px 25px; margin: 10px 15px; font-family: 'Clean Sans', sans-serif; text-align: ${b.align || 'left'};">
                        <h2 style="margin: 0 0 10px 0; color: #111827; font-size: 22px; font-family: 'Zilla Slab', serif;">${escapeHtml(b.heading || '')}</h2>
                        <p style="margin: 0; line-height: 1.6; color: #374151; font-size: 15px; font-family: 'Clean Sans', sans-serif;">${escapeHtml(b.body || '').replace(/\n/g, '<br>')}</p>
                    </div>`;

                case 'boxed_text':
                    return `
                    <div style="margin: 15px; padding: 22px 20px; background-color: ${b.bg_color || '#F4F1E1'}; border: 2px solid ${b.border_color || style.accentColor}; border-radius: 6px; font-family: 'Clean Sans', sans-serif;">
                        <h3 style="margin: 0 0 8px 0; color: ${b.border_color || style.accentColor}; font-size: 18px; font-weight: bold; font-family: 'Zilla Slab', serif;">${escapeHtml(b.heading || '')}</h3>
                        <p style="margin: 0; line-height: 1.5; color: #374151; font-size: 14px; font-family: 'Clean Sans', sans-serif;">${escapeHtml(b.body || '').replace(/\n/g, '<br>')}</p>
                    </div>`;

                case 'divider':
                    return `
                    <div style="padding: 12px 25px;">
                        <hr style="border: 0; border-top: 2px ${b.line_style || 'solid'} ${b.line_color || '#e8e4d1'}; margin: 0;">
                    </div>`;

                case 'image':
                    return `
                    <div style="padding: 15px; text-align: center;">
                        <a href="${b.link_url || '#'}" target="_blank">
                            <img src="${baseUrl}${b.image_url || 'StockingStuffer.png'}" alt="${escapeHtml(b.alt_text || 'Image')}" style="max-width: 100%; height: auto; display: inline-block; border-radius: 4px;">
                        </a>
                    </div>`;

                case 'image_group':
                    return `
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding: 15px 10px;">
                        <tr>
                            <td width="50%" align="center" style="padding: 0 5px;">
                                <a href="${b.link1_url || '#'}" target="_blank">
                                    <img src="${baseUrl}${b.image1_url || 'StockingStuffer.png'}" style="width: 100%; max-width: 280px; height: auto; display: block; border-radius: 4px;">
                                </a>
                            </td>
                            <td width="50%" align="center" style="padding: 0 5px;">
                                <a href="${b.link2_url || '#'}" target="_blank">
                                    <img src="${baseUrl}${b.image2_url || 'bannerplayer.png'}" style="width: 100%; max-width: 280px; height: auto; display: block; border-radius: 4px;">
                                </a>
                            </td>
                        </tr>
                    </table>`;

                case 'image_card':
            return `
            <div style="margin: 15px; background-color: ${b.bg_color || '#FFFDFB'}; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <img src="${baseUrl}${b.image_url || 'StockingStuffer.png'}" alt="Card" style="width: 100%; height: auto; display: block;">
                <div style="padding: 20px; font-family: sans-serif; text-align: center;">
                    <h3 style="margin: 0 0 10px 0; font-size: 20px; color: #111827; font-family: 'Zilla Slab', serif;">${escapeHtml(b.heading || '')}</h3>
                    <p style="margin: 0 0 15px 0; font-size: 14px; line-height: 1.5; color: #4b5563;">${escapeHtml(b.body || '').replace(/\n/g, '<br>')}</p>
                    ${b.cta_text ? `<a href="${b.cta_url || '#'}" style="display: inline-block; background-color: ${style.buttonBg}; color: #ffffff; padding: 10px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 4px;">${escapeHtml(b.cta_text)}</a>` : ''}
                </div>
            </div>`;

                case 'image_caption':
                    return `
                    <div style="padding: 15px; text-align: center;">
                        <img src="${baseUrl}${b.image_url || 'bannerplayer.png'}" alt="Caption" style="max-width: 100%; height: auto; display: inline-block; border-radius: 4px;">
                        <p style="margin: 8px 0 0 0; font-size: 13px; font-style: italic; color: #6b7280; font-family: ${style.fontFamily};">${escapeHtml(b.caption || '')}</p>
                    </div>`;

                case 'social_share':
                    return `
                    <div style="padding: 20px 25px; text-align: center; border-top: 1px solid #f0f0f0;">
                        <p style="margin: 0 0 12px 0; font-size: 13px; font-weight: bold; color: #4f111c; text-transform: uppercase; font-family: ${style.fontFamily};">${escapeHtml(b.heading || 'Share This Update')}</p>
                        <table align="center" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding: 0 6px;"><a href="https://www.facebook.com/sharer/sharer.php?u=https://kettleers.org" target="_blank" style="display:inline-block;background-color:#1877F2;color:#ffffff;padding:6px 12px;font-size:11px;font-weight:bold;text-decoration:none;border-radius:4px;">Share on Facebook</a></td>
                                <td style="padding: 0 6px;"><a href="https://twitter.com/intent/tweet?text=Cotuit%20Kettleers" target="_blank" style="display:inline-block;background-color:#000000;color:#ffffff;padding:6px 12px;font-size:11px;font-weight:bold;text-decoration:none;border-radius:4px;">Post on X</a></td>
                                <td style="padding: 0 6px;"><a href="mailto:?subject=Cotuit Kettleers Update" style="display:inline-block;background-color:#611724;color:#ffffff;padding:6px 12px;font-size:11px;font-weight:bold;text-decoration:none;border-radius:4px;">Forward Email</a></td>
                            </tr>
                        </table>
                    </div>`;

                case 'social_follow':
                    return `
                    <div style="padding: 22px; text-align: center; background-color: #FAFAFA; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 12px 0; font-size: 12px; font-weight: bold; color: #4f111c; text-transform: uppercase; letter-spacing: 1px; font-family: ${style.fontFamily};">Follow The Cotuit Kettleers</p>
                        <table align="center" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding: 0 8px;"><a href="${b.facebook_url || 'https://facebook.com/kettleers'}" target="_blank" style="display:inline-block;"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/color-facebook-48.png" alt="Facebook" style="width: 32px; height: 32px; display: block; border: 0;"></a></td>
                                <td style="padding: 0 8px;"><a href="${b.instagram_url || 'https://instagram.com/kettleers'}" target="_blank" style="display:inline-block;"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/color-instagram-48.png" alt="Instagram" style="width: 32px; height: 32px; display: block; border: 0;"></a></td>
                                <td style="padding: 0 8px;"><a href="${b.twitter_url || 'https://x.com/kettleers'}" target="_blank" style="display:inline-block;"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/color-twitter-48.png" alt="X" style="width: 32px; height: 32px; display: block; border: 0;"></a></td>
                                <td style="padding: 0 8px;"><a href="${b.website_url || 'https://kettleers.org'}" target="_blank" style="display:inline-block;"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/color-link-48.png" alt="Website" style="width: 32px; height: 32px; display: block; border: 0;"></a></td>
                            </tr>
                        </table>
                    </div>`;

                case 'button':
                    return `
                    <div style="padding: 15px 25px; text-align: ${b.align || 'center'};">
                        <a href="${b.cta_url || '#'}" target="_blank" style="display: inline-block; background-color: ${b.button_color || style.buttonBg}; color: #ffffff; padding: 12px 28px; font-family: ${style.fontFamily}; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: ${style.buttonRadius}; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(b.cta_text || 'Click Here')}</a>
                    </div>`;

                case 'footer':
                    return `
                    <div style="padding: 20px 25px; text-align: center; border-top: 1px solid #eee; background-color: #FAFAFA; font-family: ${style.fontFamily};">
                        <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; line-height: 1.4;">${escapeHtml(b.text || '')}</p>
                        <p style="margin: 0; font-size: 11px; color: #9ca3af;">Lowell Park, Cotuit, MA 02635 • <a href="#" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p>
                    </div>`;

                case 'code':
                    return `<div style="padding: 10px 15px;">${b.html_code || ''}</div>`;

                case 'video':
                    return `
                    <div style="padding: 18px 25px; text-align: center;">
                        <div style="position: relative; max-width: 560px; margin: 0 auto; background: #000; border-radius: 8px; overflow: hidden;">
                            <a href="${b.video_url || 'https://youtube.com'}" target="_blank" style="display: block; text-decoration: none;">
                                <img src="${baseUrl}${b.thumbnail_url || 'bannerplayer.png'}" alt="Video" style="width: 100%; height: auto; display: block; opacity: 0.85;">
                                <div style="padding: 12px; background-color: #1A2B4C; color: #F4F1E1; font-weight: bold; font-size: 13px; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
                                    &#9658; ${escapeHtml(b.title || 'Play Video')}
                                </div>
                            </a>
                        </div>
                    </div>`;

                case 'promo':
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

                default:
                    return '';
            }
        }).join('');
    }

    const preheaderHtml = settings.preheader ? `
        <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
            ${escapeHtml(settings.preheader)}
        </div>
    ` : '';

    const browserLinkHtml = settings.showBrowserLink !== false ? `
        <div style="text-align: right; font-size: 11px; color: #777777; padding: 10px 18px; border-bottom: 1px solid #f0f0f0;">
            <a href="${isLiveSend ? 'https://kettleers.org' : '#'}" ${!isLiveSend ? `onclick="const w = window.open(); w.document.write(document.getElementById('email-preview-container').innerHTML); w.document.close(); return false;"` : ''} target="_blank" style="color: #666666; text-decoration: underline;">View this email in your browser</a>
        </div>
    ` : '';

    const bannerHtml = settings.showBanner !== false ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${style.headerBg};">
            <tr>
                <td width="38%" valign="bottom" style="padding: 12px 0 0 15px; line-height: 0;">
                    <img src="${baseUrl}${settings.bannerImage || 'bannerplayer.png'}" alt="Cotuit Player" style="display: block; max-height: 170px; width: auto; max-width: 100%;">
                </td>
                <td width="62%" valign="middle" align="right" style="padding: 20px 25px 20px 10px;">
                    <div style="font-family: 'Rye', serif; font-size: 34px; line-height: 1.05; text-transform: uppercase; color: #F4F1E1; letter-spacing: 2px; font-weight: bold; text-align: right;">${settings.bannerText || 'COTUIT<br>KETTLEERS'}</div>
                </td>
            </tr>
        </table>
    ` : '';

            return `
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Rye&family=Zilla+Slab:wght@400;700&display=swap" rel="stylesheet"></head>
            ${preheaderHtml}
            <div style="max-width: ${settings.maxWidth || '620px'}; margin: 0 auto; background-color: ${style.contentBg}; box-shadow: 0 4px 10px rgba(0,0,0,0.15); ${!isLiveSend ? 'width: 100%;' : ''}">
                ${browserLinkHtml}
                ${bannerHtml}
                ${blocksHtml}
                <div style="text-align: center; padding: 20px 10px 25px 10px; border-top: 1px solid #EEEEEE; background-color: #FAFAFA;">
                    <p style="margin: 0 0 10px 0; font-size: 11px; color: #888888; font-family: ${style.fontFamily}; line-height: 1.4;">${escapeHtml(settings.footerText || defaultSettings.footerText)}</p>
                    <p style="margin: 0; font-size: 11px; font-family: ${style.fontFamily};"><a href="#" style="color: #6b7280; text-decoration: underline;">Unsubscribe from this list</a></p>
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
    isEditingTemplate = false;
    currentEditingTemplateName = null;
    
    // Restore the wizard progress footer
    const footer = document.querySelector('#view-campaign-editor .sticky.bottom-0');
    if (footer) footer.classList.remove('hidden-view');

    // Restore Back button destination
    const backBtn = document.querySelector('#view-campaign-editor [onclick*="switchTab"]');
    if (backBtn) {
        backBtn.setAttribute('onclick', "switchTab('campaigns')");
        backBtn.innerHTML = '<i data-lucide="chevron-left" class="w-4 h-4 md:w-5 md:h-5"></i> Back to Campaigns';
    }

    wizardData = {
        segments: ['all'],
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

async function deleteCampaign(campaignId) {
    if (!confirm("Are you sure you want to permanently delete this campaign?")) return;
    
    try {
        const { error } = await db.from('campaigns').delete().eq('id', campaignId);
        if (error) throw error;
        
        loadDashboardAndCampaigns();
    } catch (err) {
        console.error('Error deleting campaign:', err);
        alert('Could not delete campaign: ' + err.message);
    }
}

function editCampaign(campaignId) {
    const c = loadedCampaigns.find(item => item.id === campaignId);
    if (!c) return;

    currentEditingCampaignId = c.id;
    
    isEditingTemplate = false;
    currentEditingTemplateName = null;
    
    // Restore the wizard progress footer
    const footer = document.querySelector('#view-campaign-editor .sticky.bottom-0');
    if (footer) footer.classList.remove('hidden-view');

    // Restore Back button destination
    const backBtn = document.querySelector('#view-campaign-editor [onclick*="switchTab"]');
    if (backBtn) {
        backBtn.setAttribute('onclick', "switchTab('campaigns')");
        backBtn.innerHTML = '<i data-lucide="chevron-left" class="w-4 h-4 md:w-5 md:h-5"></i> Back to Campaigns';
    }

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
        segments: ['all'],
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

function selectWizardTemplate(templateName) {
    wizardData.template = templateName;
    
    // Check for saved custom template in LocalStorage first
    const savedCustom = localStorage.getItem('kettleers_template_' + templateName);
    if (savedCustom) {
        try {
            const parsed = JSON.parse(savedCustom);
            wizardData.blocks = parsed.blocks || [];
            if (parsed.style) wizardData.style = { ...defaultStyle, ...parsed.style };
            if (parsed.settings) wizardData.settings = { ...defaultSettings, ...parsed.settings };
        } catch(e) { console.error('Error loading saved template'); }
    } else {
        // Fallback to hardcoded defaults
        if (templateName === 'Blank Canvas') {
            wizardData.blocks = [];
        } else if (templateName === 'The Weekly Ballpark Bulletin' || templateName === 'The Kettleers Gazette') {
            wizardData.blocks = [
                { type: 'text', heading: 'Welcome to the Newsletter!', body: 'The first update from Kettleers Nation!' },
                { type: 'promo', heading: 'Stocking Stuffers Promo', body: 'The Perfect Stocking Stuffers! Use code FANS20 for 20% off.', cta: 'Shop Holiday Special', image: 'StockingStuffer.png' }
            ];
        }
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
    const titleErr = document.getElementById('setup-title-error');
    const subjectErr = document.getElementById('setup-subject-error');

    if (titleInput) {
        wizardData.title = titleInput.value;
        if (titleInput.value.trim()) {
            titleInput.classList.remove('border-red-500', 'bg-red-50/20');
            if (titleErr) titleErr.classList.add('hidden');
        }
    }
    if (subjectInput) {
        wizardData.subject = subjectInput.value;
        if (subjectInput.value.trim()) {
            subjectInput.classList.remove('border-red-500', 'bg-red-50/20');
            if (subjectErr) subjectErr.classList.add('hidden');
        }
    }
}

function syncWizardUI() {
    const titleInput = document.getElementById('setup-campaign-title');
    const subjectInput = document.getElementById('setup-campaign-subject');
    if (titleInput) titleInput.value = wizardData.title || '';
    if (subjectInput) subjectInput.value = wizardData.subject || '';
    renderAudienceCardsState();
    selectWizardTemplate(wizardData.template || 'Blank Canvas');
    syncStyleAndSettingsUI();
}

function populateConfirmStep() {
    syncSetupFields();
    
    const segments = wizardData.segments || ['all'];
    let audienceName = 'All Active Subscribers';
    let audienceCount = allSubscribers.length;

    if (!segments.includes('all')) {
        audienceName = segments.join(', ');
        audienceCount = allSubscribers.filter(s => segments.includes(s.segment)).length;
    }
    
    const audEl = document.getElementById('confirm-review-audience');
    const subEl = document.getElementById('confirm-review-subject');
    const tplEl = document.getElementById('confirm-review-template');

    if (audEl) audEl.textContent = `${audienceName} (${audienceCount} fans)`;
    if (subEl) subEl.textContent = wizardData.subject || '(No Subject Line Set)';
    if (tplEl) tplEl.textContent = wizardData.template;
}

function goToWizardStep(stepName) {
    const targetIndex = WIZARD_STEPS.indexOf(stepName);
    if (targetIndex === -1) return;

    // Only enforce title/subject/audience validation when building actual campaigns
    if (!isEditingTemplate) {
        if (targetIndex > 0 && !validateCurrentStep()) return;
        if (targetIndex > 1) {
            currentWizardStepIndex = 1;
            if (!validateCurrentStep()) return;
        }
    }

    currentWizardStepIndex = targetIndex;

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

    if (stepName === 'recipients') renderAudienceCardsState();
    if (stepName === 'design') {
        syncSetupFields();
        syncStyleAndSettingsUI();
        renderEditorBlocks();
        renderEmailPreview();
    }
    if (stepName === 'confirm') populateConfirmStep();

    safeCreateIcons();
}

function wizardNextStep() {
    if (!validateCurrentStep()) return;
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
        if (container) {
            container.classList.add('preview-mobile');
            container.style.height = '600px';
            container.style.overflowY = 'auto';
            container.style.overflowX = 'hidden';
        }
        if (desktopBtn) desktopBtn.className = "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold text-gray-500 hover:text-black transition-colors";
        if (mobileBtn) mobileBtn.className = "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold text-[#611724] bg-gray-200 transition-colors";
    } else {
        if (container) {
            container.classList.remove('preview-mobile');
            container.style.height = 'auto';
            container.style.overflowY = 'visible';
            container.style.overflowX = 'visible';
        }
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
    
    if (window.innerWidth < 768 && sidebar) { sidebar.classList.add('hidden'); }
    if (tabId === 'dashboard' || tabId === 'campaigns') loadDashboardAndCampaigns();
    if (tabId === 'subscribers') loadSubscribers();
    if (tabId === 'analytics') renderAnalyticsView();
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
            const rDeliveries = document.getElementById('report-deliveries');
            const rOpens = document.getElementById('report-opens');
            const rOpenRate = document.getElementById('report-open-rate');
            const rClicks = document.getElementById('report-clicks');
            const rClickRate = document.getElementById('report-click-rate');
            const rBounces = document.getElementById('report-bounces');
            const rBounceRate = document.getElementById('report-bounce-rate');

            if (rTitle) rTitle.textContent = c.title;
            if (rMeta) rMeta.textContent = `Dispatched • ${c.target_date || 'Recent'}`;
            
            const deliveries = Number(c.deliveries) || 0;
            const opens = Number(c.opens) || 0;
            const clicks = Number(c.clicks) || 0;
            const bounces = Number(c.bounces) || 0;
            const totalAttempts = deliveries + bounces;
            
            const openRate = deliveries > 0 ? ((opens / deliveries) * 100).toFixed(1) : (Number(c.open_rate) || 0).toFixed(1);
            const clickRate = deliveries > 0 ? ((clicks / deliveries) * 100).toFixed(1) : (Number(c.click_rate) || 0).toFixed(1);
            const bounceRate = totalAttempts > 0 ? ((bounces / totalAttempts) * 100).toFixed(1) : '0.0';

            if (rDeliveries) rDeliveries.textContent = deliveries.toLocaleString();
            if (rOpens) rOpens.textContent = opens.toLocaleString();
            if (rOpenRate) rOpenRate.textContent = `${openRate}% Open Rate`;
            if (rClicks) rClicks.textContent = clicks.toLocaleString();
            if (rClickRate) rClickRate.textContent = `${clickRate}% Click Rate`;
            if (rBounces) {
                rBounces.textContent = bounces.toLocaleString();
                rBounces.className = "font-display text-4xl md:text-5xl text-gray-500 mb-1";
            }
            if (rBounceRate) rBounceRate.textContent = `${bounceRate}% Bounce Rate`;
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
function openEditSubscriberModal(id) {
    const sub = allSubscribers.find(s => s.id === id || s.id == id);
    if (!sub) return;
    currentEditingSubscriberId = sub.id;
    
    document.getElementById('edit-sub-name').value = sub.name || '';
    document.getElementById('edit-sub-email').value = sub.email || '';
    document.getElementById('edit-sub-segment').value = sub.segment || 'General Fan';
    document.getElementById('edit-sub-status').value = sub.status || 'Active';
    
    const modal = document.getElementById('modal-edit-subscriber');
    if (modal) modal.classList.remove('hidden');
}

function closeEditSubscriberModal() {
    const modal = document.getElementById('modal-edit-subscriber');
    if (modal) modal.classList.add('hidden');
    currentEditingSubscriberId = null;
    const err = document.getElementById('edit-sub-error');
    if(err) err.classList.add('hidden');
}

async function handleEditSubscriber(e) {
    e.preventDefault();
    if (!currentEditingSubscriberId) return;

    const nameInput = document.getElementById('edit-sub-name').value;
    const emailInput = document.getElementById('edit-sub-email').value;
    const segmentInput = document.getElementById('edit-sub-segment').value;
    const statusInput = document.getElementById('edit-sub-status').value;
    
    const submitBtn = document.getElementById('edit-sub-submit-btn');
    const errorDiv = document.getElementById('edit-sub-error');

    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;
    errorDiv.classList.add('hidden');

    const { error } = await db.from('subscribers').update({
        name: nameInput, email: emailInput, segment: segmentInput, status: statusInput
    }).eq('id', currentEditingSubscriberId);

    if (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
        submitBtn.textContent = 'Save Changes';
        submitBtn.disabled = false;
        return;
    }

    closeEditSubscriberModal();
    loadSubscribers();
    loadDashboardAndCampaigns();
    submitBtn.textContent = 'Save Changes';
    submitBtn.disabled = false;
}

async function handleDeleteSubscriber() {
    if (!currentEditingSubscriberId) return;
    if (!confirm("Are you sure you want to permanently delete this subscriber?")) return;
    
    const errorDiv = document.getElementById('edit-sub-error');
    const { error } = await db.from('subscribers').delete().eq('id', currentEditingSubscriberId);
    
    if (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
        return;
    }
    
    closeEditSubscriberModal();
    loadSubscribers();
    loadDashboardAndCampaigns();
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

    // Intercept: If editing a template, save to local storage instead of campaigns database
    if (isEditingTemplate && currentEditingTemplateName) {
        const templateData = {
            blocks: wizardData.blocks || [],
            style: wizardData.style || defaultStyle,
            settings: wizardData.settings || defaultSettings
        };
        localStorage.setItem('kettleers_template_' + currentEditingTemplateName, JSON.stringify(templateData));
        
        if (statusText) statusText.textContent = 'Template Saved';
        if (saveBtn) saveBtn.disabled = false;
        if (exitAfterSave) switchTab('templates');
        return;
    }

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
    const segments = wizardData.segments || ['all'];
    const segmentParam = segments.includes('all') ? 'all' : segments.join(',');

    try {
        const { data, error } = await db.functions.invoke('send-campaign', {
            body: { 
                subject, 
                html_content, 
                is_test: false, 
                segment: segmentParam,
                segments: segments 
            }
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
function openTemplatePreview(templateName) {
    document.getElementById('preview-modal-title').innerText = templateName;
    const contentContainer = document.getElementById('preview-modal-content');
    
    // Safely store previous data to prevent JSON.parse errors if wizardData is empty
    const previousData = (typeof wizardData !== 'undefined' && wizardData) ? JSON.stringify(wizardData) : null;
    
    // Temporarily build out the template object
    wizardData = {
        blocks: [],
        style: typeof defaultStyle !== 'undefined' ? { ...defaultStyle } : {},
        settings: typeof defaultSettings !== 'undefined' ? { ...defaultSettings } : {}
    };
    
    selectWizardTemplate(templateName);
    contentContainer.innerHTML = generateEmailHtml(false);
    
    // Restore the user's actual data safely
    if (previousData) {
        wizardData = JSON.parse(previousData);
    } else {
        wizardData = null; 
    }
    
    document.getElementById('modal-template-preview').classList.remove('hidden');
}

function closeTemplatePreview() {
    const modal = document.getElementById('modal-template-preview');
    if (modal) modal.classList.add('hidden');
}

function editTemplate(templateName) {
    isEditingTemplate = true;
    currentEditingTemplateName = templateName;

    // Dummy values to satisfy any lingering checks
    wizardData = {
        segments: ['all'],
        title: templateName,
        subject: 'Template Preview',
        template: templateName,
        blocks: [],
        style: typeof defaultStyle !== 'undefined' ? { ...defaultStyle } : {},
        settings: typeof defaultSettings !== 'undefined' ? { ...defaultSettings } : {}
    };

    // Load from localStorage if a saved customized version exists
    const savedCustom = localStorage.getItem('kettleers_template_' + templateName);
    if (savedCustom) {
        try {
            const parsed = JSON.parse(savedCustom);
            wizardData.blocks = parsed.blocks || [];
            if (parsed.style) wizardData.style = { ...defaultStyle, ...parsed.style };
            if (parsed.settings) wizardData.settings = { ...defaultSettings, ...parsed.settings };
        } catch(e) {
            console.error('Error parsing template for editor');
        }
    } else {
        selectWizardTemplate(templateName);
    }

    // Switch to editor view
    switchTab('campaign-editor');
    
    // Jump directly to the design pane
    goToWizardStep('design');

    // Force hide the wizard steps footer
    const footer = document.querySelector('#view-campaign-editor .sticky.bottom-0');
    if (footer) footer.classList.add('hidden-view');

    // Update top header bar for pure template editing
    const titleEl = document.getElementById('editor-title');
    if (titleEl) titleEl.innerText = "Editing Template: " + templateName;

    // Adjust Back button to return to Templates instead of Campaigns
    const backBtn = document.querySelector('#view-campaign-editor header button, #view-campaign-editor [onclick*="switchTab(\'campaigns\')"]');
    if (backBtn) {
        backBtn.setAttribute('onclick', "switchTab('templates')");
        backBtn.innerHTML = '<i data-lucide="chevron-left" class="w-4 h-4 md:w-5 md:h-5"></i> Back to Templates';
    }

    renderEditorBlocks();
    renderEmailPreview();
    safeCreateIcons();
}

function clearAnalyticsDateFilter() {
    const startDateInput = document.getElementById('analytics-start-date');
    const endDateInput = document.getElementById('analytics-end-date');
    if (startDateInput) startDateInput.value = '';
    if (endDateInput) endDateInput.value = '';
    renderAnalyticsView();
}
