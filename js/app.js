import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getDatabase, ref, onValue, set, get, child } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

function getLocalConfig() {
    const savedConfig = localStorage.getItem('ketick_firebase_config');
    return savedConfig ? JSON.parse(savedConfig) : null;
}

window.resetConfig = function() {
    if(confirm("Padam config lokal?")) {
        localStorage.removeItem('ketick_firebase_config');
        location.reload();
    }
}

const config = getLocalConfig();
if (!config) {
    const apiKey = prompt("SISTEM: Masukkan Firebase API Key Anda:");
    const projectId = prompt("SISTEM: Masukkan Firebase Project ID Anda:");
    if (apiKey && projectId) {
        localStorage.setItem('ketick_firebase_config', JSON.stringify({ apiKey, projectId }));
        location.reload();
    }
} else {
    const firebaseConfig = {
        apiKey: config.apiKey,
        authDomain: `${config.projectId}.firebaseapp.com`,
        databaseURL: `https://${config.projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`,
        projectId: config.projectId,
        storageBucket: `${config.projectId}.appspot.com`,
    };

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    window.db = db;
    window.currentWorkspaceZone = '';
    window.currentChatMode = 'gemini';

    window.updateStatus = function(zoneId, newStatus) {
        set(ref(db, `zones/${zoneId}/status`), newStatus)
            .then(() => document.getElementById('ai-suggestion').innerText = `Tindakan: ${zoneId} -> ${newStatus}.`)
            .catch(err => alert("Ralat: " + err.message));
    };

    window.openWorkspace = async function(zoneId, folderName, phaseName) {
        window.currentWorkspaceZone = zoneId;
        document.getElementById('ws-zone-title').innerText = `${folderName.toUpperCase()} [${phaseName.toUpperCase()}]`;
        document.getElementById('workspace-modal').style.display = 'flex';
        
        const contentArea = document.getElementById('workspace-content');
        contentArea.innerHTML = '<p style="text-align:center; color: var(--accent); padding: 20px;">Memuat turun modul UI...</p>';

        try {
            const response = await fetch(`zones/${folderName}/${phaseName}.html`);
            if (!response.ok) throw new Error('Modul belum dibina');
            const html = await response.text();
            contentArea.innerHTML = html;

            if (folderName === 'arsitektur' && phaseName === 'p') {
                loadIntakeDraft(zoneId);
            }
        } catch (error) {
            contentArea.innerHTML = `<p style="color:var(--red); text-align:center; padding: 20px;">Ralat: Sila bina fail <b>zones/${folderName}/${phaseName}.html</b> dahulu.</p>`;
        }
    };

    window.closeWorkspace = function() {
        document.getElementById('workspace-modal').style.display = 'none';
    };

    // --- LOGIK BOTTOM NAVIGATION TABS (BARU DITAMBAH) ---
    window.switchAppTab = function(viewId, btnElement) {
        document.querySelectorAll('.app-nav-item').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active'));
        
        btnElement.classList.add('active');
        document.getElementById(`view-${viewId}`).classList.add('active');
    };

    async function loadIntakeDraft(zoneId) {
        try {
            const snapshot = await get(child(ref(db), `zones/${zoneId}/sop_data`));
            if (snapshot.exists()) {
                const data = snapshot.val();
                if(document.getElementById('sop-name')) document.getElementById('sop-name').value = data.name || '';
                if(document.getElementById('sop-obj')) document.getElementById('sop-obj').value = data.obj || '';
                if(document.getElementById('sop-users')) document.getElementById('sop-users').value = data.users || '';
                if(document.getElementById('sop-scope')) document.getElementById('sop-scope').value = data.scope || '';
            }
        } catch (error) { console.error("Gagal load draf:", error); }
    }

    window.saveIntakeData = function(isGreenlight) {
        const zoneId = window.currentWorkspaceZone;
        const projName = document.getElementById('sop-name').value;
        const data = {
            name: projName,
            obj: document.getElementById('sop-obj').value,
            users: document.getElementById('sop-users').value,
            scope: document.getElementById('sop-scope').value,
        };

        set(ref(db, `zones/${zoneId}/sop_data`), data).then(() => {
            if (projName) document.getElementById('dashboard-project-name').innerText = projName;
            
            if (isGreenlight) {
                window.updateStatus(zoneId, 'Active');
                document.getElementById('ai-suggestion').innerText = `Greenlight Diberikan! Projek kini Aktif.`;
            } else {
                window.updateStatus(zoneId, 'Pending');
            }
            window.closeWorkspace();
        });
    };

    window.switchChatMode = function(mode) {
        window.currentChatMode = mode;
        const tabs = document.querySelectorAll('.chat-tab');
        tabs.forEach(tab => {
            tab.className = 'chat-tab';
            if(tab.innerHTML.toLowerCase().includes(mode)) tab.classList.add(`active-${mode}`);
        });
        
        const welcomeMsg = document.getElementById('welcome-msg');
        if(mode === 'gemini') welcomeMsg.innerHTML = "Salam. Saya Gemini. Ada idea struktur nak bincang?";
        if(mode === 'telegram') welcomeMsg.innerHTML = "Log API Telegram diaktifkan. (Simulasi)";
        if(mode === 'slack') welcomeMsg.innerHTML = "Log API Slack diaktifkan. (Simulasi)";
    }

    window.handleChatEnter = function(e) {
        if(e.key === 'Enter') window.sendChatMessage();
    }

    window.sendChatMessage = async function() {
        const inputField = document.getElementById('chat-input');
        const message = inputField.value.trim();
        if(!message) return;

        window.appendMessage(message, 'user');
        inputField.value = '';

        if(window.currentChatMode === 'gemini') {
            document.getElementById('chat-loading').style.display = 'block';
            await fetchGeminiResponse(message);
        } else {
            setTimeout(() => {
                window.appendMessage(`Mesej dihantar ke ${window.currentChatMode.toUpperCase()}. (Simulasi)`, 'bot');
            }, 1000);
        }
    }

    window.appendMessage = function(text, sender) {
        const chatBox = document.getElementById('chat-box');
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg-bubble msg-${sender}`;
        msgDiv.innerText = text;
        const loadingDots = document.getElementById('chat-loading');
        chatBox.insertBefore(msgDiv, loadingDots);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function fetchGeminiResponse(promptText) {
        let apiKey = localStorage.getItem('gemini_api_key_ktd');
        if (!apiKey) {
            apiKey = prompt("SISTEM: Sila masukkan API Key Google Gemini anda:");
            if (apiKey) localStorage.setItem('gemini_api_key_ktd', apiKey);
            else {
                document.getElementById('chat-loading').style.display = 'none';
                window.appendMessage("Ralat: API Key diperlukan.", 'bot');
                return;
            }
        }

        const projName = document.getElementById('sop-name') ? document.getElementById('sop-name').value : "Projek Baru";
        const projObj = document.getElementById('sop-obj') ? document.getElementById('sop-obj').value : "Tiada info";
        const contextPrompt = `Konteks Projek: ${projName}. Objektif: ${projObj}. Soalan: ${promptText}`;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: contextPrompt }] }] })
            });

            if(!response.ok) throw new Error("API Key tidak sah atau kuota tamat.");
            const data = await response.json();
            
            document.getElementById('chat-loading').style.display = 'none';
            window.appendMessage(data.candidates[0].content.parts[0].text, 'bot');
        } catch (error) {
            document.getElementById('chat-loading').style.display = 'none';
            window.appendMessage(`Ralat: ${error.message}`, 'bot');
            localStorage.removeItem('gemini_api_key_ktd'); 
        }
    }

    ['zone1', 'zone2', 'zone3', 'zone4'].forEach(zoneId => {
        onValue(ref(db, `zones/${zoneId}/status`), (snapshot) => {
            const statusText = snapshot.val();
            const cardElement = document.getElementById(zoneId);
            if (cardElement && statusText) {
                const statusDisplay = cardElement.querySelector('.status');
                statusDisplay.innerText = `● ${statusText}`;
                const statusLower = statusText.toLowerCase();

                if(statusLower === 'active' || statusLower === 'done') {
                    statusDisplay.style.color = 'var(--green)'; 
                    statusDisplay.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'; 
                    cardElement.style.borderColor = 'var(--accent)'; 
                    if(statusLower === 'done') cardElement.classList.add('path-done');
                    else cardElement.classList.remove('path-done');
                } else {
                    statusDisplay.style.color = '#ffaa00'; 
                    statusDisplay.style.backgroundColor = 'rgba(255, 170, 0, 0.1)'; 
                    cardElement.style.borderColor = '#333';
                    cardElement.classList.remove('path-done');
                }
            }
        });
    });

    onValue(ref(db, `zones/zone1/sop_data/name`), (snapshot) => {
        if(snapshot.exists()) document.getElementById('dashboard-project-name').innerText = snapshot.val();
    });
}
