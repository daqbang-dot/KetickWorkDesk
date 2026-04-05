import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getDatabase, ref, onValue, set, get, child } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

// --- PENGURUSAN CONFIG ---
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
    // --- INIT FIREBASE ---
    const firebaseConfig = {
        apiKey: config.apiKey,
        authDomain: `${config.projectId}.firebaseapp.com`,
        databaseURL: `https://${config.projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`,
        projectId: config.projectId,
        storageBucket: `${config.projectId}.appspot.com`,
    };

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    window.db = db; // Dedahkan ke global 
    window.currentWorkspaceZone = ''; // Simpan ID Zon semasa

    // --- FUNGSI UPDATE STATUS ZON ---
    window.updateStatus = function(zoneId, newStatus) {
        set(ref(db, `zones/${zoneId}/status`), newStatus)
            .then(() => {
                document.getElementById('ai-suggestion').innerText = `Tindakan: ${zoneId} ditukar kepada ${newStatus}.`;
            })
            .catch(err => alert("Ralat: " + err.message));
    };

    // --- FUNGSI BUKA MODAL & FETCH HTML DINAMIK ---
    window.openWorkspace = async function(zoneId, folderName, phaseName) {
        window.currentWorkspaceZone = zoneId;
        document.getElementById('ws-zone-title').innerText = `${folderName} [${phaseName}]`;
        document.getElementById('workspace-modal').style.display = 'flex';
        
        const contentArea = document.getElementById('workspace-content');
        contentArea.innerHTML = '<p style="text-align:center; color: var(--accent);">Memuat turun modul...</p>';

        try {
            // Fetch fail HTML dari folder (cth: zones/arsitektur/p.html)
            const response = await fetch(`zones/${folderName}/${phaseName}.html`);
            if (!response.ok) throw new Error('Modul belum dibina');
            
            const html = await response.text();
            contentArea.innerHTML = html;

            // Jika fasa P untuk Arsitektur, tarik data dari Firebase ke dalam form
            if (folderName === 'arsitektur' && phaseName === 'p') {
                loadIntakeDraft(zoneId);
            }

        } catch (error) {
            contentArea.innerHTML = `<p style="color:var(--red); text-align:center; padding: 20px; border: 1px dashed var(--red);">Ralat 404: Sila bina fail <b>zones/${folderName}/${phaseName}.html</b> dahulu.</p>`;
        }
    };

    window.closeWorkspace = function() {
        document.getElementById('workspace-modal').style.display = 'none';
    };

    // --- LOGIK: LOAD INTAKE DATA ---
    async function loadIntakeDraft(zoneId) {
        try {
            const snapshot = await get(child(ref(db), `zones/${zoneId}/sop_data`));
            if (snapshot.exists()) {
                const data = snapshot.val();
                if(document.getElementById('sop-name')) document.getElementById('sop-name').value = data.name || '';
                if(document.getElementById('sop-obj')) document.getElementById('sop-obj').value = data.obj || '';
                if(document.getElementById('sop-users')) document.getElementById('sop-users').value = data.users || '';
                if(document.getElementById('sop-room')) document.getElementById('sop-room').value = data.room || '';
                if(document.getElementById('sop-scope')) document.getElementById('sop-scope').value = data.scope || '';
            }
        } catch (error) { console.error("Gagal load draf:", error); }
    }

    // --- LOGIK: SAVE INTAKE DATA (DARI p.html) ---
    window.saveIntakeData = function(isGreenlight) {
        const zoneId = window.currentWorkspaceZone;
        const projName = document.getElementById('sop-name').value;
        const data = {
            name: projName,
            obj: document.getElementById('sop-obj').value,
            users: document.getElementById('sop-users').value,
            room: document.getElementById('sop-room').value,
            scope: document.getElementById('sop-scope').value,
        };

        set(ref(db, `zones/${zoneId}/sop_data`), data).then(() => {
            if (projName) document.getElementById('dashboard-project-name').innerText = projName;
            
            if (isGreenlight) {
                window.updateStatus(zoneId, 'Active');
                document.getElementById('ai-suggestion').innerText = `Greenlight Diberikan! Projek kini Aktif.`;
            } else {
                window.updateStatus(zoneId, 'Pending');
                document.getElementById('ai-suggestion').innerText = `Draf Intake disimpan.`;
            }
            window.closeWorkspace();
        });
    };

    // --- LISTENER UI AUTOMATIK ZON STATUS ---
    function listenToZone(zoneId) {
        const statusRef = ref(db, `zones/${zoneId}/status`);
        onValue(statusRef, (snapshot) => {
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

        // Pantau nama projek di Header
        if(zoneId === 'zone1') {
            onValue(ref(db, `zones/zone1/sop_data/name`), (snapshot) => {
                if(snapshot.exists()) {
                    document.getElementById('dashboard-project-name').innerText = snapshot.val();
                }
            });
        }
    }

    ['zone1', 'zone2', 'zone3', 'zone4'].forEach(listenToZone);
}
