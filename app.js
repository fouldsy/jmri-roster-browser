const db = new Dexie("LocoRosterDB");
db.version(1).stores({ photos: 'id' });

let locomotiveFiles = new Map();
const ROSTER_PATH = './roster/'; 

window.addEventListener('DOMContentLoaded', init);

async function init() {
    const status = document.getElementById('status');
    const updatedEl = document.getElementById('lastUpdated');
    
    try {
        const response = await fetch(`${ROSTER_PATH}roster.xml`);
        if (!response.ok) throw new Error("roster.xml not found");
        
        // Extract "Last Modified" from GitHub headers
        const lastMod = response.headers.get('Last-Modified');
        if (lastMod) {
            const date = new Date(lastMod);
            updatedEl.innerText = `Updated: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        }

        const rosterText = await rosterText = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(rosterText, "text/xml");
        const entries = xml.querySelectorAll("locomotive");

        status.innerText = "Syncing...";
        const fetchPromises = Array.from(entries).map(async (entry) => {
            const fileName = entry.getAttribute('fileName');
            try {
                const locoRes = await fetch(`${ROSTER_PATH}${fileName}`);
                if (locoRes.ok) {
                    locomotiveFiles.set(fileName, await locoRes.text());
                }
            } catch (err) { console.warn(`Missing: ${fileName}`); }
        });

        await Promise.all(fetchPromises);
        status.innerText = "Roster Online";
        renderRoster(rosterText);

    } catch (err) {
        status.innerText = "Offline/Error";
        console.error(err);
    }
}

// Logic remains the same for filtering, rendering, and details...
function filterRoster() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.loco-card');
    const sections = document.querySelectorAll('.group-section');
    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        card.classList.toggle('filtered-out', !text.includes(query));
    });
    sections.forEach(section => {
        const hasVisibleCards = section.querySelectorAll('.loco-card:not(.filtered-out)').length > 0;
        section.style.display = hasVisibleCards ? 'block' : 'none';
    });
    updateCount();
}

function updateCount() {
    const visibleCards = document.querySelectorAll('.loco-card:not(.filtered-out)').length;
    document.getElementById('locoCount').innerText = visibleCards;
}

function renderRoster(xmlString) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "text/xml");
    const grid = document.getElementById('rosterGrid');
    grid.innerHTML = '';

    const groupNodes = xml.querySelectorAll("rosterGroup group");
    const groupNames = Array.from(groupNodes).map(g => g.textContent);
    const groups = { "Other": [] };
    groupNames.forEach(name => groups[name] = []);

    const entries = xml.querySelectorAll("locomotive");
    entries.forEach(entry => {
        let assigned = false;
        const keys = entry.querySelectorAll("keyvaluepair");
        keys.forEach(kv => {
            const key = kv.querySelector("key")?.textContent || "";
            const value = kv.querySelector("value")?.textContent || "";
            if (key.startsWith("RosterGroup:") && value.toLowerCase() === "yes") {
                const gName = key.replace("RosterGroup:", "");
                if (groups[gName]) { groups[gName].push(entry); assigned = true; }
            }
        });
        if (!assigned) groups["Other"].push(entry);
    });

    Object.keys(groups).forEach(groupName => {
        if (groups[groupName].length === 0) return;
        const section = document.createElement('div');
        section.className = 'group-section';
        section.innerHTML = `<h2 class="group-header">${groupName}</h2><div class="group-grid"></div>`;
        const groupGrid = section.querySelector('.group-grid');

        groups[groupName].forEach(entry => {
            const id = entry.getAttribute('id');
            const fileName = entry.getAttribute('fileName');
            const road = entry.getAttribute('roadName') || "";
            const model = entry.getAttribute('model') || "";
            const card = document.createElement('div');
            card.className = 'loco-card';
            card.innerHTML = `
                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                     id="img-${id}" class="loco-img" onclick="triggerPhotoUpload('${id}')">
                <div class="loco-info">
                    <h3 style="margin:0">${id}</h3>
                    <p style="color:#666; margin: 5px 0 15px 0;">${road} ${model}</p>
                    <button class="btn-primary" onclick="showDetails('${fileName}')">Details</button>
                </div>`;
            groupGrid.appendChild(card);
            loadSavedPhoto(id);
        });
        grid.appendChild(section);
    });
    updateCount();
}

function showDetails(fileName) {
    const content = locomotiveFiles.get(fileName);
    if (!content) return;
    const xml = new DOMParser().parseFromString(content, "text/xml");
    const locoTag = xml.querySelector('locomotive');
    const id = locoTag.getAttribute('id');
    const mfg = locoTag.getAttribute('mfg') || "";
    const road = locoTag.getAttribute('roadName') || "";
    const model = locoTag.getAttribute('model') || "";
    const dcc = xml.querySelector('dcclocoaddress')?.getAttribute('number') || "Unknown";
    
    const dec = xml.querySelector('decoder');
    let decDisp = "Unknown";
    if (dec) {
        const m = dec.getAttribute('model');
        const f = dec.getAttribute('family');
        decDisp = (m === "Diesel" || m === "Steam") ? f : (m.startsWith("D") ? `Digitrax ${m}` : (m.startsWith("Lok") ? `ESU ${m}` : m));
    }

    const funcs = Array.from(xml.querySelectorAll('functionlabel'))
        .sort((a,b) => parseInt(a.getAttribute('num')) - parseInt(b.getAttribute('num')))
        .map(f => `<li><strong>F${f.getAttribute('num')}</strong> <span>${f.textContent}</span></li>`).join('');

    document.getElementById('modalBody').innerHTML = `
        <h2>${id}</h2>
        <p>${mfg} - ${road} ${model}</p>
        <div style="background:#f1f1f1; padding:10px; border-radius:8px; margin-bottom:15px;">
            <strong>DCC:</strong> ${dcc}<br><strong>Decoder:</strong> ${decDisp}
        </div>
        <hr><ul class="function-list">${funcs || '<li>No functions.</li>'}</ul>`;
    document.getElementById('modal').classList.remove('hidden');
}

async function triggerPhotoUpload(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) { await db.photos.put({ id: id, blob: file }); loadSavedPhoto(id); }
    };
    input.click();
}

async function loadSavedPhoto(id) {
    const record = await db.photos.get(id);
    if (record) {
        const img = document.getElementById(`img-${id}`);
        if (img) img.src = URL.createObjectURL(record.blob);
    }
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); }
window.onclick = (e) => { if (e.target.id == 'modal') closeModal(); }
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js')); }