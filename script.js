// ========================================
// n8n Social Post Creator — Client Script
// ========================================

const CHAT_URL = '/api/chat';
const CONFIRM_URL = '/api/confirm-post';

marked.setOptions({ breaks: true, gfm: true });
function renderMarkdown(text) { return DOMPurify.sanitize(marked.parse(text)); }

// DOM refs
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearChat');
const welcomeScreen = document.getElementById('welcomeScreen');
const attachBtn = document.getElementById('attachBtn');
const imageFileInput = document.getElementById('imageFileInput');
const imagePreviewStrip = document.getElementById('imagePreviewStrip');
const previewScroll = document.getElementById('previewScroll');
const previewLabel = document.getElementById('previewLabel');
const clearAllImagesBtn = document.getElementById('clearAllImages');
const confirmPostBtn = document.getElementById('confirmPostBtn');
const toast = document.getElementById('toast');
const statusText = document.getElementById('statusText');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const dropOverlay = document.getElementById('dropOverlay');


// Preview Modal refs
const previewOverlay = document.getElementById('previewOverlay');
const previewClose = document.getElementById('previewClose');
const previewText = document.getElementById('previewText');
const previewImages = document.getElementById('previewImages');
const previewCancelBtn = document.getElementById('previewCancelBtn');
const previewConfirmBtn = document.getElementById('previewConfirmBtn');

// State
let isWaiting = false;
const SESSION_ID = (() => {
    let id = localStorage.getItem('n8n_session_id');
    if (!id) {
        id = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('n8n_session_id', id);
    }
    return id;
})();
let attachedImages = [];
let latestBotResponse = '';
let sessionImages = [];
let pendingPublish = null;
let socialLinks = {};  // Loaded from data.json
let selectedPlatforms = ['x']; // Active platforms

// ========================================
// Credit System — 3 posts per browser session
// ========================================
const MAX_CREDITS = 3;
let _devMode = false;
Object.defineProperty(window, 'devMode', {
    get() { return _devMode; },
    set(v) {
        _devMode = !!v;
        if (_devMode) {
            // Unfreeze everything
            confirmPostBtn.disabled = false;
            confirmPostBtn.classList.remove('frozen');
            setStatus('Online • Dev Mode ∞');
        }
        updateCreditBadge();
    }
});

function getCredits() { return MAX_CREDITS - (parseInt(localStorage.getItem('n8n_posts_used') || '0', 10)); }
function useCredit() {
    if (window.devMode) return;
    const used = parseInt(localStorage.getItem('n8n_posts_used') || '0', 10) + 1;
    localStorage.setItem('n8n_posts_used', String(used));
    updateCreditBadge();
    if (used >= MAX_CREDITS) freezePublishing();
}
function updateCreditBadge() {
    const badge = document.getElementById('creditBadge');
    if (!badge) return;
    if (window.devMode) {
        badge.textContent = '∞ Dev Mode';
        badge.className = 'credit-badge';
        return;
    }
    const remaining = getCredits();
    badge.textContent = `${remaining} post${remaining !== 1 ? 's' : ''} left`;
    badge.className = 'credit-badge' + (remaining <= 1 ? ' credit-low' : '') + (remaining <= 0 ? ' credit-zero' : '');
}
function freezePublishing() {
    // Disable all publish-related buttons
    confirmPostBtn.disabled = true;
    confirmPostBtn.classList.add('frozen');
    setStatus('Credits exhausted • Posting disabled');
    showToast('⚠️ You\'ve used all 3 post credits for this session.', 'warning');
}
function checkCredits() {
    if (window.devMode) return true;
    if (getCredits() <= 0) {
        showToast('⚠️ No post credits remaining. You\'ve used all 3.', 'warning');
        return false;
    }
    return true;
}

// ========================================
// Init
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    setupEventListeners();
    setupDragDrop();
    updateCreditBadge();
    if (getCredits() <= 0) freezePublishing();
    loadSocialLinks();
    messageInput.focus();
});

async function loadSocialLinks() {
    try {
        const res = await fetch('/data.json');
        if (res.ok) {
            socialLinks = await res.json();

            // Map the brand header social icons correctly
            const mapLink = (id, key) => {
                const el = document.getElementById(id);
                console.log(`Mapping ${key} to #${id}: found=${!!el}`);
                if (el && socialLinks[key]) {
                    let url = socialLinks[key];
                    if (!url.startsWith('http')) url = 'https://' + url;
                    el.href = url;
                    console.log(`Mapped ${key} to ${url}`);
                } else if (el) {
                    console.log(`Hiding ${key} (not in data.json)`);
                    el.style.display = 'none'; // hide if not in data.json
                }
            };

            mapLink('brandLinkX', 'X');
            mapLink('brandLinkLn', 'Linkedin');
            mapLink('brandLinkIg', 'Instagram');
            mapLink('brandLinkYt', 'youtube');
        }
    } catch (e) { console.warn('Could not load social links:', e); }
}

function getSocialLinksMessage() {
    const lines = ['✅ **Post published successfully!**', '', 'You can see your post on these pages in **2-3 minutes**:', ''];
    if (selectedPlatforms.includes('x') && socialLinks.X) lines.push(`🐦 **X (Twitter):** [${socialLinks.X}](${socialLinks.X})`);
    if (selectedPlatforms.includes('linkedin') && socialLinks.Linkedin) {
        const url = socialLinks.Linkedin.startsWith('http') ? socialLinks.Linkedin : 'https://' + socialLinks.Linkedin;
        lines.push(`💼 **LinkedIn:** [${socialLinks.Linkedin}](${url})`);
    }
    if (selectedPlatforms.includes('instagram') && socialLinks.Instagram) lines.push(`📸 **Instagram:** [${socialLinks.Instagram}](${socialLinks.Instagram})`);
    return lines.join('\n');
}

function setupEventListeners() {
    sendBtn.addEventListener('click', handleSend);
    messageInput.addEventListener('input', () => { autoResize(messageInput); updateSendButton(); });
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) handleSend(); }
    });
    clearBtn.addEventListener('click', clearChat);
    attachBtn.addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', handleImageAttach);
    confirmPostBtn.addEventListener('click', handleConfirmPost);
    clearAllImagesBtn.addEventListener('click', () => { attachedImages = []; renderImagePreview(); updateSendButton(); });

    // Lightbox
    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

    // Clipboard paste
    document.addEventListener('paste', handlePaste);


    // Platform pills
    document.querySelectorAll('.platform-pill').forEach(pill => {
        pill.addEventListener('click', () => togglePlatform(pill.dataset.platform));
    });


    // Preview Modal
    previewClose.addEventListener('click', closePreview);
    previewCancelBtn.addEventListener('click', closePreview);
    previewOverlay.addEventListener('click', (e) => { if (e.target === previewOverlay) closePreview(); });
    previewConfirmBtn.addEventListener('click', () => {
        if (pendingPublish) { pendingPublish(); pendingPublish = null; }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeLightbox(); closePreview(); }
    });

    // Quick prompts
    document.querySelectorAll('.quick-prompt').forEach((btn) => {
        btn.addEventListener('click', () => { messageInput.value = btn.dataset.prompt; autoResize(messageInput); handleSend(); });
    });
}

// ========================================
// Drag & Drop
// ========================================
function setupDragDrop() {
    const container = document.querySelector('.chat-container');
    let dragCounter = 0;
    container.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dropOverlay.classList.add('active'); });
    container.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('active'); } });
    container.addEventListener('dragover', (e) => e.preventDefault());
    container.addEventListener('drop', (e) => {
        e.preventDefault(); dragCounter = 0; dropOverlay.classList.remove('active');
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
        if (files.length) addImagesToAttachment(files);
    });
}

// ========================================
// Image Attachment
// ========================================
function handleImageAttach(e) { addImagesToAttachment(Array.from(e.target.files)); imageFileInput.value = ''; }

function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) { if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) imageFiles.push(f); } }
    if (imageFiles.length > 0) {
        e.preventDefault();
        addImagesToAttachment(imageFiles);
        showToast(`📋 ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} pasted`, 'info');
    }
}

function compressImage(dataUrl, targetBytes = 800 * 1024) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            const maxDim = 2000;
            if (width > maxDim || height > maxDim) {
                const scale = maxDim / Math.max(width, height);
                width = Math.round(width * scale); height = Math.round(height * scale);
            }
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            let quality = 0.92;
            let result = canvas.toDataURL('image/jpeg', quality);
            const getSize = (d) => Math.round((d.length - d.indexOf(',') - 1) * 0.75);
            while (getSize(result) > targetBytes && quality > 0.1) { quality -= 0.08; result = canvas.toDataURL('image/jpeg', quality); }
            resolve(result);
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

async function addImagesToAttachment(files) {
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        if (attachedImages.length >= 10) { showToast('Maximum 10 images', 'warning'); break; }
        const dataUrl = await new Promise((r) => { const rd = new FileReader(); rd.onload = (e) => r(e.target.result); rd.readAsDataURL(file); });
        const compressed = await compressImage(dataUrl);
        attachedImages.push({ file, dataUrl: compressed, name: file.name || `pasted_${Date.now()}.jpg`, type: 'image/jpeg' });
        renderImagePreview(); updateSendButton();
    }
}

function removeImage(index) { attachedImages.splice(index, 1); renderImagePreview(); updateSendButton(); }

function renderImagePreview() {
    if (attachedImages.length === 0) { imagePreviewStrip.style.display = 'none'; previewScroll.innerHTML = ''; return; }
    imagePreviewStrip.style.display = 'block';
    previewLabel.textContent = `${attachedImages.length} image${attachedImages.length > 1 ? 's' : ''} selected`;
    previewScroll.innerHTML = attachedImages.map((img, i) => `
        <div class="preview-thumb" onclick="openLightbox('${img.dataUrl.replace(/'/g, "\\'")}')">
            <img src="${img.dataUrl}" alt="${escapeHTML(img.name)}">
            <button class="preview-remove" onclick="event.stopPropagation(); removeImage(${i})" title="Remove">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
    `).join('');
}

function updateSendButton() { sendBtn.disabled = (!messageInput.value.trim() && attachedImages.length === 0) || isWaiting; }

// ========================================
// Lightbox
// ========================================
function openLightbox(src) { lightboxImg.src = src; lightbox.classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeLightbox() { lightbox.classList.remove('active'); document.body.style.overflow = ''; }

// ========================================
// Publish Preview Modal
// ========================================
function showPublishPreview(text, images, onConfirm) {
    // Remove /n/n separators and render each platform section with a styled header
    const cleanText = text
        .replace(/\n\n\/n\/n\n\n/g, '\n\n---\n\n')
        .replace(/\/n\/n/g, '');
    previewText.innerHTML = renderMarkdown(cleanText);

    // Render image grid
    if (images && images.length > 0) {
        const imgSrcs = images.map((img) => {
            if (typeof img === 'string') return img;
            if (img.dataUrl) return img.dataUrl;
            if (img.base64) return `data:${img.type || 'image/jpeg'};base64,${img.base64}`;
            return '';
        }).filter(Boolean);

        previewImages.innerHTML = imgSrcs.map((src) =>
            `<div class="prev-img-wrap" onclick="openLightbox('${src.replace(/'/g, "\\'")}')">
                <img src="${src}" alt="Preview">
            </div>`
        ).join('');
        previewImages.style.display = '';
    } else {
        previewImages.innerHTML = '<span class="no-images-hint">No images attached</span>';
        previewImages.style.display = '';
    }

    pendingPublish = onConfirm;
    previewOverlay.classList.add('active');
}

function closePreview() {
    previewOverlay.classList.remove('active');
    pendingPublish = null;
}

// ========================================
// Core Chat Logic
// ========================================
async function handleSend() {
    const text = messageInput.value.trim();
    if ((!text && attachedImages.length === 0) || isWaiting) return;

    if (latestBotResponse) {
        showToast('⚠️ Please confirm and publish your pending post first, or click Clear Chat.', 'warning');
        return;
    }

    if (welcomeScreen) welcomeScreen.style.display = 'none';

    const imageDataUrls = attachedImages.map((img) => img.dataUrl);
    addMessage(text, 'user', false, imageDataUrls);
    saveToHistory({ role: 'user', text, time: getTimeString(), imageCount: imageDataUrls.length });

    const imagesToSend = attachedImages.map((img) => ({ name: img.name, type: img.type, base64: img.dataUrl.split(',')[1] }));
    if (imagesToSend.length > 0) sessionImages = [...imagesToSend];

    messageInput.value = ''; autoResize(messageInput); attachedImages = []; renderImagePreview(); sendBtn.disabled = true;

    isWaiting = true; setStatus('Generating post…');
    const typingEl = showTypingIndicator();

    try {
        const payload = { message: text, sessionId: SESSION_ID, platforms: selectedPlatforms };
        if (imagesToSend.length > 0) payload.images = imagesToSend;

        const response = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        typingEl.remove();
        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        const data = await response.json();
        let botReply = extractReply(data);

        latestBotResponse = botReply;
        addBotBubbles(botReply);
        saveToHistory({ role: 'bot', text: botReply, time: getTimeString() });
        showConfirmButton();
        setStatus('Online • Ready to refine');
    } catch (err) {
        typingEl.remove();
        addMessage("Sorry, I couldn't reach the server. Please try again.", 'bot', true);
        setStatus('Connection error');
        console.error('Chatbot error:', err);
    } finally {
        isWaiting = false; updateSendButton(); messageInput.focus();
    }
}

// ========================================
// Confirm Post (AI Refinement flow) — with Preview
// ========================================
function handleConfirmPost() {
    if (!latestBotResponse || isWaiting) return;
    if (!checkCredits()) return;

    // Build image array for preview
    const previewImgs = sessionImages.map((img) => ({
        base64: img.base64, type: img.type
    }));

    showPublishPreview(latestBotResponse, previewImgs, doConfirmPost);
}

async function doConfirmPost() {
    closePreview();
    confirmPostBtn.disabled = true;
    const origHTML = confirmPostBtn.innerHTML;
    confirmPostBtn.innerHTML = '<div class="btn-spinner"></div><span>Publishing…</span>';
    setStatus('Publishing post…');

    try {
        const payload = { text: latestBotResponse, sessionId: SESSION_ID, platforms: selectedPlatforms };
        if (sessionImages.length > 0) payload.images = sessionImages;

        const response = await fetch(CONFIRM_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        const data = await response.json();
        const replyText = extractReply(data);

        const confirmText = getSocialLinksMessage();
        addBotBubbles(confirmText);
        saveToHistory({ role: 'bot', text: confirmText, time: getTimeString() });
        showToast('Post published successfully! 🎉', 'success');
        useCredit();

        latestBotResponse = ''; sessionImages = []; hideConfirmButton();
        setStatus('Online • Ready to create');
    } catch (err) {
        showToast('Failed to publish. Please try again.', 'error');
        console.error('Confirm post error:', err);
    } finally {
        confirmPostBtn.disabled = false;
        confirmPostBtn.innerHTML = origHTML;
        setStatus('Online • Ready to create');
    }
}

function showConfirmButton() { confirmPostBtn.style.display = 'flex'; setTimeout(() => confirmPostBtn.classList.add('visible'), 10); }
function hideConfirmButton() { confirmPostBtn.classList.remove('visible'); setTimeout(() => { confirmPostBtn.style.display = 'none'; }, 250); }

// ========================================
// Platform Selection
// ========================================
function togglePlatform(platform) {
    const idx = selectedPlatforms.indexOf(platform);
    if (idx > -1) {
        if (selectedPlatforms.length <= 1) {
            showToast('At least one platform must be selected', 'warning');
            return;
        }
        selectedPlatforms.splice(idx, 1);
    } else {
        selectedPlatforms.push(platform);
    }
    // Sync all pill buttons
    document.querySelectorAll('.platform-pill').forEach(pill => {
        pill.classList.toggle('active', selectedPlatforms.includes(pill.dataset.platform));
    });
}

// ========================================
// Status & Toast
// ========================================
function setStatus(t) { statusText.textContent = t; }
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast toast-${type} toast-show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('toast-show'), 3500);
}

// ========================================
// Copy
// ========================================
function copyMessage(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success')).catch(() => {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('Copied!', 'success');
    });
}

// ========================================
// Extract Reply
// ========================================
function extractReply(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) { if (!data.length) return 'No response received.'; data = data[0]; }
    for (const key of ['output', 'response', 'message', 'text', 'reply', 'answer', 'content', 'result', 'data']) {
        if (data[key] != null) { const v = data[key]; return typeof v === 'string' ? v : JSON.stringify(v, null, 2); }
    }
    return JSON.stringify(data, null, 2);
}

// ========================================
// Platform-based bubble splitting
// ========================================
function addBotBubbles(text) {
    const platformRegex = /\n(?=\**(?:LinkedIn|X|Instagram|Facebook|Twitter|Threads|YouTube|TikTok|Pinterest|Reddit)\**\s*:\s*\n)/i;
    const parts = text.split(platformRegex).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) { addMessage(text, 'bot'); return; }
    parts.forEach((section, i) => { setTimeout(() => addMessage(section, 'bot'), i * 120); });
}

// ========================================
// Message Rendering
// ========================================
function addMessage(text, role, isError = false, images = []) {
    const time = getTimeString();
    const el = document.createElement('div');
    el.className = `message ${role}`;

    const isBot = role === 'bot';
    const avatarInner = isBot
        ? '<img src="logo.png" alt="Bot" class="bot-logo">'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

    const rendered = isBot ? renderMarkdown(text) : escapeHTML(text);

    let imageHTML = '';
    if (images && images.length > 0) {
        const gc = images.length === 1 ? 'single' : images.length === 2 ? 'double' : 'grid';
        imageHTML = `<div class="msg-images ${gc}">${images.map(s => `<div class="msg-img-wrap" onclick="openLightbox('${s.replace(/'/g, "\\'")}')"><img src="${s}" alt="Attached"><div class="img-zoom-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></div></div>`).join('')}</div>`;
    }

    const copyBtn = isBot && !isError ? `<button class="msg-action-btn copy-btn" onclick="copyMessage(${escapeAttr(text)})" title="Copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : '';

    el.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-av' : 'user-av'}">
            ${avatarInner}
        </div>
        <div class="msg-body">
            ${rendered ? `<div class="msg-bubble ${isError ? 'msg-error' : ''} ${isBot ? 'markdown-body' : ''}">${rendered}</div>` : ''}
            ${imageHTML}
            <div class="msg-footer"><span class="msg-time">${time}</span>${copyBtn}</div>
        </div>`;
    chatMessages.appendChild(el);
    scrollToBottom();
}

function escapeAttr(str) { return '`' + str.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'; }

function showTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'message bot typing-msg';
    el.innerHTML = `
        <div class="msg-avatar bot-av"><img src="logo.png" alt="Bot" class="bot-logo"></div>
        <div class="msg-body"><div class="typing-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`;
    chatMessages.appendChild(el);
    scrollToBottom();
    return el;
}

// ========================================
// Utilities
// ========================================
function scrollToBottom() { requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }); }
function autoResize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
function escapeHTML(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function getTimeString() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

// ========================================
// Chat History
// ========================================
function saveToHistory(msg) {
    const h = JSON.parse(localStorage.getItem('n8n_chat_history') || '[]');
    const s = { ...msg }; delete s.images;
    h.push(s); if (h.length > 100) h.splice(0, h.length - 100);
    localStorage.setItem('n8n_chat_history', JSON.stringify(h));
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('n8n_chat_history') || '[]');
    if (!history.length) return;
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    let lastBotMsg = '';

    history.forEach((msg) => {
        if (msg.role === 'bot') lastBotMsg = msg.text;
        if (msg.role === 'bot') {
            const platformRegex = /\n(?=\**(?:LinkedIn|X|Instagram|Facebook|Twitter|Threads|YouTube|TikTok|Pinterest|Reddit)\**\s*:\s*\n)/i;
            const sections = msg.text.split(platformRegex).map(s => s.trim()).filter(Boolean);
            sections.forEach((section) => addHistoryBubble(section, 'bot', msg.time, msg));
        } else {
            addHistoryBubble(msg.text, 'user', msg.time, msg);
        }
    });

    function addHistoryBubble(text, role, time, msg) {
        const el = document.createElement('div');
        el.className = `message ${role}`;
        const isBot = role === 'bot';
        const avatarInner = isBot
            ? '<img src="logo.png" alt="Bot" class="bot-logo">'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        const rendered = isBot ? renderMarkdown(text) : escapeHTML(text);
        let imgInd = '';
        if (!isBot && msg.imageCount && msg.imageCount > 0) {
            imgInd = `<div class="msg-image-indicator"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> ${msg.imageCount} image${msg.imageCount > 1 ? 's' : ''} attached</div>`;
        }
        const copyBtn = isBot ? `<button class="msg-action-btn copy-btn" onclick="copyMessage(${escapeAttr(text)})" title="Copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : '';
        el.innerHTML = `<div class="msg-avatar ${isBot ? 'bot-av' : 'user-av'}">${avatarInner}</div>
            <div class="msg-body"><div class="msg-bubble ${isBot ? 'markdown-body' : ''}">${rendered}${imgInd}</div><div class="msg-footer"><span class="msg-time">${time || ''}</span>${copyBtn}</div></div>`;
        el.style.animation = 'none';
        chatMessages.appendChild(el);
    }

    const isSuccess = lastBotMsg.includes('Post published successfully');
    const isError = lastBotMsg.includes("couldn't reach the server") || lastBotMsg.includes('Failed to publish');

    if (lastBotMsg && !isSuccess && !isError) {
        latestBotResponse = lastBotMsg;
        showConfirmButton();
        setStatus('Online • Ready to refine');
    } else {
        latestBotResponse = '';
    }

    scrollToBottom();
}

function clearChat() {
    localStorage.removeItem('n8n_chat_history');
    chatMessages.querySelectorAll('.message, .typing-msg').forEach((m) => m.remove());
    latestBotResponse = ''; sessionImages = []; attachedImages = [];
    renderImagePreview(); hideConfirmButton();
    setStatus('Online • Ready to create');
    if (welcomeScreen) welcomeScreen.style.display = '';
}
