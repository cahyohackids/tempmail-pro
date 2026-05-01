// ===== TempMail Pro — Multi-Provider Temp Email Client =====
// Providers: Mail.tm + DropMail.me (verified working)

const PROVIDERS = {
    mailtm: {
        name: 'Mail.tm',
        api: 'https://api.mail.tm',
        type: 'account',
    },
    dropmail: {
        name: 'DropMail',
        api: 'https://dropmail.me/api/graphql/web-test-2',
        type: 'graphql',
    },
};

const state = {
    provider: null,
    allDomains: [],
    // Mail.tm
    token: null,
    accountId: null,
    // DropMail
    dropSessionId: null,
    dropSession: null,
    // Common
    email: null,
    password: null,
    login: null,
    domain: null,
    messages: [],
    refreshInterval: null,
    timerInterval: null,
    sessionStart: null,
};

// ===== DOM =====
const $ = (s) => document.querySelector(s);
const createSection = $('#createSection');
const sessionSection = $('#sessionSection');
const usernameInput = $('#usernameInput');
const domainSelect = $('#domainSelect');
const previewEmail = $('#previewEmail');
const createBtn = $('#createBtn');
const randomBtn = $('#randomBtn');
const activeEmail = $('#activeEmail');
const copyBtn = $('#copyBtn');
const copyToast = $('#copyToast');
const refreshBtn = $('#refreshBtn');
const changeAliasBtn = $('#changeAliasBtn');
const deleteBtn = $('#deleteBtn');
const messageCount = $('#messageCount');
const inboxLoading = $('#inboxLoading');
const inboxEmpty = $('#inboxEmpty');
const messageList = $('#messageList');
const emailViewer = $('#emailViewer');
const statusDot = $('#statusDot');
const statusText = $('#statusText');
const timerText = $('#timerText');
const providerBadge = $('#providerBadge');
const domainCount = $('#domainCount');

// ===== HELPERS =====
function generateUsername() {
    const adj = ['swift','bright','cool','dark','fast','gold','iron','keen','live','mega',
                 'neo','pure','rare','star','true','ultra','vast','wild','zen','ace',
                 'bold','calm','epic','free','jade','nova','peak','rush','sage','trim'];
    const nouns = ['wolf','hawk','fox','bear','lion','lynx','crow','dove','fish','moth',
                   'owl','puma','seal','swan','viper','wasp','ant','colt','duke','elk'];
    const a = adj[Math.floor(Math.random() * adj.length)];
    const n = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 999);
    return `${a}_${n}${num}`;
}

function generatePassword() {
    const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let p = '';
    for (let i = 0; i < 16; i++) p += c[Math.floor(Math.random() * c.length)];
    return p;
}

function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function setStatus(online, text) {
    statusDot.className = 'status-dot' + (online ? ' online' : online === false ? ' error' : '');
    statusText.textContent = text;
}

function updatePreview() {
    const user = usernameInput.value.trim() || 'username';
    const domain = domainSelect.value || 'domain.com';
    previewEmail.textContent = `${user}@${domain}`;
}

function formatTimer(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getProviderForDomain(domain) {
    const entry = state.allDomains.find(d => d.domain === domain);
    return entry ? entry.provider : null;
}

// ===== FETCH ALL DOMAINS =====
async function fetchAllDomains() {
    state.allDomains = [];
    const results = await Promise.allSettled([
        fetchMailtmDomains(),
        fetchDropmailDomains(),
    ]);

    state.allDomains.sort((a, b) => a.domain.localeCompare(b.domain));

    domainSelect.innerHTML = '';
    if (state.allDomains.length === 0) {
        domainSelect.innerHTML = '<option value="">No domains available — check console</option>';
        setStatus(false, 'No providers available');
        return;
    }

    // Group by provider
    const grouped = {};
    state.allDomains.forEach(d => {
        if (!grouped[d.provider]) grouped[d.provider] = [];
        grouped[d.provider].push(d);
    });

    const providerLabels = {
        mailtm: `── Mail.tm (${grouped.mailtm?.length || 0}) ──`,
        dropmail: `── DropMail (${grouped.dropmail?.length || 0}) ──`,
    };

    for (const [prov, domains] of Object.entries(grouped)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = providerLabels[prov] || prov;
        domains.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.domain;
            opt.textContent = d.domain;
            opt.dataset.provider = d.provider;
            optgroup.appendChild(opt);
        });
        domainSelect.appendChild(optgroup);
    }

    domainCount.textContent = `${state.allDomains.length} domains`;
    setStatus(true, 'Ready');
    updatePreview();
}

// ===== MAIL.TM =====
async function fetchMailtmDomains() {
    try {
        const res = await fetch(`${PROVIDERS.mailtm.api}/domains`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const domains = data['hydra:member'] || data;
        domains.forEach(d => state.allDomains.push({ domain: d.domain, provider: 'mailtm' }));
        console.log(`✅ Mail.tm: ${domains.length} domains loaded`);
    } catch (e) {
        console.warn('❌ Mail.tm failed:', e.message);
    }
}

async function mailtmCreate(address, password) {
    const res = await fetch(`${PROVIDERS.mailtm.api}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err['hydra:description'] || err.message || `HTTP ${res.status}`);
    }
    return res.json();
}

async function mailtmAuth(address, password) {
    const res = await fetch(`${PROVIDERS.mailtm.api}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
    });
    if (!res.ok) throw new Error('Authentication failed');
    return res.json();
}

async function mailtmGetMessages() {
    const res = await fetch(`${PROVIDERS.mailtm.api}/messages`, {
        headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error('Fetch messages failed');
    const data = await res.json();
    return (data['hydra:member'] || data).map(m => ({
        id: m.id,
        from: m.from?.address || m.from?.name || 'Unknown',
        fromName: m.from?.name || '',
        subject: m.subject || '(No Subject)',
        date: m.createdAt,
        seen: m.seen,
        _provider: 'mailtm',
    }));
}

async function mailtmReadMessage(id) {
    const res = await fetch(`${PROVIDERS.mailtm.api}/messages/${id}`, {
        headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error('Read message failed');
    const m = await res.json();
    return {
        subject: m.subject || '(No Subject)',
        from: m.from?.address || 'Unknown',
        date: m.createdAt,
        html: m.html ? (Array.isArray(m.html) ? m.html.join('') : m.html) : null,
        text: m.text || '',
        attachments: m.attachments || [],
    };
}

async function mailtmDelete() {
    if (!state.accountId || !state.token) return;
    try {
        await fetch(`${PROVIDERS.mailtm.api}/accounts/${state.accountId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${state.token}` },
        });
    } catch (e) { console.warn('Delete fail:', e); }
}

// ===== DROPMAIL =====
async function fetchDropmailDomains() {
    try {
        const query = `{ domains { name } }`;
        const res = await fetch(PROVIDERS.dropmail.api, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.data?.domains) {
            data.data.domains.forEach(d =>
                state.allDomains.push({ domain: d.name, provider: 'dropmail' })
            );
            console.log(`✅ DropMail: ${data.data.domains.length} domains loaded`);
        }
    } catch (e) {
        console.warn('❌ DropMail failed:', e.message);
    }
}

async function dropmailCreateSession(domain) {
    const query = `mutation { introduceSession(input: { chooseDomain: "${domain}" }) { id expiresAt addresses { address } } }`;
    const res = await fetch(PROVIDERS.dropmail.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error('DropMail session creation failed');
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0]?.message || 'GraphQL error');
    return data.data?.introduceSession;
}

async function dropmailGetMessages() {
    if (!state.dropSessionId) return [];
    const query = `{ session(id: "${state.dropSessionId}") { mails { rawId fromAddr headerSubject text receivedAt } } }`;
    const res = await fetch(PROVIDERS.dropmail.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error('Fetch messages failed');
    const data = await res.json();
    const mails = data.data?.session?.mails || [];
    return mails.map(m => ({
        id: m.rawId,
        from: m.fromAddr || 'Unknown',
        fromName: '',
        subject: m.headerSubject || '(No Subject)',
        date: m.receivedAt,
        seen: false,
        _provider: 'dropmail',
        _text: m.text,
    }));
}

async function dropmailReadMessage(msg) {
    // DropMail returns full content inline
    // Try to fetch HTML version via source
    let html = null;
    if (state.dropSessionId && msg.id) {
        try {
            const query = `{ session(id: "${state.dropSessionId}") { mails(rawId: "${msg.id}") { rawId headerSubject fromAddr text html receivedAt } } }`;
            const res = await fetch(PROVIDERS.dropmail.api, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            const data = await res.json();
            const mail = data.data?.session?.mails?.[0];
            if (mail?.html) html = mail.html;
        } catch (e) { /* fallback to text */ }
    }
    return {
        subject: msg.subject || '(No Subject)',
        from: msg.from || 'Unknown',
        date: msg.date,
        html: html,
        text: msg._text || '',
        attachments: [],
    };
}

// ===== UNIFIED CREATE =====
async function createEmail() {
    let username = usernameInput.value.trim();
    if (!username) {
        username = generateUsername();
        usernameInput.value = username;
    }
    const domain = domainSelect.value;
    if (!domain) return alert('No domain selected');

    const provider = getProviderForDomain(domain);
    if (!provider) return alert('Unknown domain provider');

    state.provider = provider;
    state.domain = domain;
    state.login = username;
    state.email = `${username}@${domain}`.toLowerCase();

    createBtn.disabled = true;
    createBtn.querySelector('span').textContent = 'Creating...';

    try {
        if (provider === 'mailtm') {
            const password = generatePassword();
            state.password = password;
            const account = await mailtmCreate(state.email, password);
            state.accountId = account.id;
            const tokenData = await mailtmAuth(state.email, password);
            state.token = tokenData.token;
        } else if (provider === 'dropmail') {
            const session = await dropmailCreateSession(domain);
            if (!session) throw new Error('Failed to create DropMail session');
            state.dropSessionId = session.id;
            state.dropSession = session;
            if (session.addresses?.length > 0) {
                state.email = session.addresses[0].address;
            }
        }

        setStatus(true, 'Active Session');
        if (providerBadge) {
            providerBadge.textContent = PROVIDERS[provider].name;
            providerBadge.className = `provider-badge badge-${provider}`;
        }
        showSession();
    } catch (e) {
        alert('Error creating email: ' + e.message);
        setStatus(false, 'Creation failed');
    } finally {
        createBtn.disabled = false;
        createBtn.querySelector('span').textContent = 'Create Email';
    }
}

// ===== UNIFIED FETCH / READ / DELETE =====
async function getMessages() {
    if (state.provider === 'mailtm') return mailtmGetMessages();
    if (state.provider === 'dropmail') return dropmailGetMessages();
    return [];
}

async function readMessage(msg) {
    if (msg._provider === 'mailtm') return mailtmReadMessage(msg.id);
    if (msg._provider === 'dropmail') return dropmailReadMessage(msg);
    throw new Error('Unknown provider');
}

async function deleteSession() {
    if (state.provider === 'mailtm') await mailtmDelete();
}

// ===== UI =====
function showCreate() {
    createSection.classList.remove('hidden');
    sessionSection.classList.add('hidden');
    emailViewer.classList.add('hidden');
    clearIntervals();
}

function showSession() {
    createSection.classList.add('hidden');
    sessionSection.classList.remove('hidden');
    emailViewer.classList.add('hidden');
    activeEmail.textContent = state.email;
    startTimer();
    startAutoRefresh();
}

function startTimer() {
    state.sessionStart = Date.now();
    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
        timerText.textContent = formatTimer(elapsed);
    }, 1000);
}

function startAutoRefresh() {
    refreshInbox();
    state.refreshInterval = setInterval(refreshInbox, 5000);
}

function clearIntervals() {
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.refreshInterval = null;
    state.timerInterval = null;
}

async function refreshInbox() {
    try {
        inboxLoading.classList.remove('hidden');
        const msgs = await getMessages();
        state.messages = msgs;
        renderMessages(msgs);
        setStatus(true, 'Connected');
    } catch (e) {
        console.error('Refresh error:', e);
        setStatus(false, 'Connection lost — retrying...');
    } finally {
        inboxLoading.classList.add('hidden');
    }
}

function renderMessages(msgs) {
    messageCount.textContent = `${msgs.length} message${msgs.length !== 1 ? 's' : ''}`;
    if (msgs.length === 0) {
        inboxEmpty.classList.remove('hidden');
        messageList.classList.add('hidden');
        return;
    }
    inboxEmpty.classList.add('hidden');
    messageList.classList.remove('hidden');
    messageList.innerHTML = msgs.map((msg, idx) => {
        const initial = (msg.fromName || msg.from || '?')[0].toUpperCase();
        const fromDisplay = msg.fromName || msg.from || 'Unknown';
        const time = timeAgo(msg.date);
        const unread = !msg.seen ? ' unread' : '';
        return `
            <div class="message-item${unread}" data-idx="${idx}">
                <div class="msg-avatar">${escapeHtml(initial)}</div>
                <div class="msg-content">
                    <div class="msg-from">${escapeHtml(fromDisplay)}</div>
                    <div class="msg-subject">${escapeHtml(msg.subject)}</div>
                </div>
                <div class="msg-time">${time}</div>
            </div>
        `;
    }).join('');

    messageList.querySelectorAll('.message-item').forEach(item => {
        item.addEventListener('click', () => openMessage(parseInt(item.dataset.idx)));
    });
}

async function openMessage(idx) {
    const msg = state.messages[idx];
    if (!msg) return;
    try {
        inboxLoading.classList.remove('hidden');
        const full = await readMessage(msg);
        $('#viewerSubject').textContent = full.subject;
        $('#viewerFrom').textContent = full.from;
        $('#viewerDate').textContent = new Date(full.date).toLocaleString();

        const body = $('#viewerBody');
        if (full.html) {
            body.innerHTML = full.html;
        } else {
            body.textContent = full.text || 'No content';
        }

        const attSection = $('#viewerAttachments');
        const attList = $('#attachmentList');
        if (full.attachments?.length > 0) {
            attSection.classList.remove('hidden');
            attList.innerHTML = full.attachments.map(a => {
                const dl = a.downloadUrl ? ` onclick="window.open('${a.downloadUrl}')"` : '';
                return `<div class="attachment-item"${dl}>📎 ${escapeHtml(a.filename)} (${(a.size / 1024).toFixed(1)} KB)</div>`;
            }).join('');
        } else {
            attSection.classList.add('hidden');
        }

        emailViewer.classList.remove('hidden');
        messageList.parentElement.classList.add('hidden');
    } catch (e) {
        alert('Failed to load: ' + e.message);
    } finally {
        inboxLoading.classList.add('hidden');
    }
}

function resetState() {
    clearIntervals();
    state.provider = null;
    state.token = null;
    state.accountId = null;
    state.login = null;
    state.domain = null;
    state.dropSession = null;
    state.dropSessionId = null;
    state.email = null;
    state.password = null;
    state.messages = [];
    setStatus(true, 'Ready');
}

// ===== EVENTS =====
randomBtn.addEventListener('click', () => {
    usernameInput.value = generateUsername();
    updatePreview();
});
usernameInput.addEventListener('input', updatePreview);
domainSelect.addEventListener('change', updatePreview);
createBtn.addEventListener('click', createEmail);

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(state.email).then(() => {
        copyToast.classList.remove('hidden');
        setTimeout(() => copyToast.classList.add('hidden'), 2000);
    });
});

refreshBtn.addEventListener('click', refreshInbox);

changeAliasBtn.addEventListener('click', async () => {
    if (confirm('Create a new email? Current session will end.')) {
        await deleteSession();
        resetState();
        showCreate();
        usernameInput.value = generateUsername();
        updatePreview();
    }
});

deleteBtn.addEventListener('click', async () => {
    if (confirm('Delete this email and end session?')) {
        deleteBtn.querySelector('span').textContent = 'Deleting...';
        await deleteSession();
        resetState();
        showCreate();
        deleteBtn.querySelector('span').textContent = 'Delete & Exit';
    }
});

$('#backBtn').addEventListener('click', () => {
    emailViewer.classList.add('hidden');
    messageList.parentElement.classList.remove('hidden');
});

// ===== INIT =====
(async function init() {
    usernameInput.value = generateUsername();
    setStatus(null, 'Loading domains...');
    await fetchAllDomains();
})();
