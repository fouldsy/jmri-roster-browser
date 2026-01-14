const db = new Dexie("LocoRosterDB");
db.version(1).stores({ photos: 'id' });

let locomotiveFiles = new Map();

document.getElementById('folderInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const rosterFile = files.find(f => f.name.toLowerCase() === 'roster.xml');
    
    if (!rosterFile) return alert("roster.xml not found!");

    for (const file of files) {
        if (file.name.endsWith('.xml') && file.name.toLowerCase() !== 'roster.xml') {
            locomotiveFiles.set(file.name, await file.text());
        }
    }

    const rosterText = await rosterFile.text();
    renderRoster(rosterText);
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Using './sw.js' ensures it looks in the current folder, not the domain root
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered!', reg))
            .catch(err => console.log('Service Worker registration failed', err));
    });
}

function filterRoster() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.loco-card');
    const sections = document.querySelectorAll('.group-section');

    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        card.classList.toggle('filtered-out', !text.includes(query));
    });

    // Hide group headings if all cards inside are filtered out
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

    // 1. Get Group Names
    const groupNodes = xml.querySelectorAll("rosterGroup group");
    const groupNames = Array.from(groupNodes).map(g => g.textContent);
    
    // 2. Prepare Group Buckets
    const groups = {};
    groupNames.forEach(name => groups[name] = []);
    groups["Other"] = [];

    // 3. Sort Locomotives into Buckets
    const entries = xml.querySelectorAll("locomotive");
    entries.forEach(entry => {
        let assigned = false;
        const keys = entry.querySelectorAll("keyvaluepair");
        
        keys.forEach(kv => {
            const key = kv.querySelector("key")?.textContent || "";
            const value = kv.querySelector("value")?.textContent || "";
            
            if (key.startsWith("RosterGroup:") && value.toLowerCase() === "yes") {
                const groupName = key.replace("RosterGroup:", "");
                if (groups[groupName]) {
                    groups[groupName].push(entry);
                    assigned = true;
                }
            }
        });

        if (!assigned) groups["Other"].push(entry);
    });

    // 4. Render Sections
    Object.keys(groups).forEach(groupName => {
        if (groups[groupName].length === 0) return;

        const section = document.createElement('div');
        section.className = 'group-section';
        section.innerHTML = `<h2 class="group-header">${groupName}</h2><div class="group-grid"></div>`;
        
        const groupGrid = section.querySelector('.group-grid');

        groups[groupName].forEach(entry => {
            const id = entry.getAttribute('id');
            const fileName = entry.getAttribute('fileName');
            const road = entry.getAttribute('roadName') || "Unknown Road";
            const model = entry.getAttribute('model') || "";
            
            const card = document.createElement('div');
            card.className = 'loco-card';
            card.innerHTML = `
                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                     id="img-${id}" class="loco-img" onclick="triggerPhotoUpload('${id}')">
                <div class="loco-info">
                    <h3 style="margin:0">${id}</h3>
                    <p style="color:#666; margin: 5px 0 15px 0;">${road} ${model}</p>
                    <button class="btn-primary" onclick="showDetails('${fileName}')">Details & Functions</button>
                </div>
            `;
            groupGrid.appendChild(card);
            loadSavedPhoto(id);
        });

        grid.appendChild(section);
    });

    updateCount();
}

function showDetails(fileName) {
    const content = locomotiveFiles.get(fileName);
    if (!content) return alert("Loco file not found.");

    const xml = new DOMParser().parseFromString(content, "text/xml");
    const locoTag = xml.querySelector('locomotive');
    if (!locoTag) return alert("Invalid locomotive file.");

    const id = locoTag.getAttribute('id');
    const mfg = locoTag.getAttribute('mfg') || "Unknown Mfg";
    const roadName = locoTag.getAttribute('roadName') || "";
    const model = locoTag.getAttribute('model') || "";

    const dccTag = xml.querySelector('dcclocoaddress');
    const dccAddress = dccTag ? dccTag.getAttribute('number') : "Unknown";

    const decoderTag = xml.querySelector('decoder');
    let decoderDisplay = "Unknown Decoder";
    
    if (decoderTag) {
        let dModel = decoderTag.getAttribute('model') || "";
        let dFamily = decoderTag.getAttribute('family') || "";

        if (dModel === "Diesel" || dModel === "Steam") {
            decoderDisplay = dFamily;
        } 
        else if (dModel.startsWith("D")) {
            decoderDisplay = `Digitrax ${dModel}`;
        }
        else if (dModel.startsWith("Lok")) {
            decoderDisplay = `ESU ${dModel}`;
        }
        else {
            decoderDisplay = dModel;
        }
    }

    const functionElements = Array.from(xml.querySelectorAll('functionlabel'));
    const sortedFuncs = functionElements.sort((a, b) => {
        return parseInt(a.getAttribute('num')) - parseInt(b.getAttribute('num'));
    });

    const funcLabels = sortedFuncs.map(f => {
        const num = f.getAttribute('num');
        const label = f.textContent || "Unlabeled";
        return `<li><strong>F${num}</strong> <span>${label}</span></li>`;
    }).join('');

    document.getElementById('modalBody').innerHTML = `
        <h2 style="margin:0 0 10px 0;">${id}</h2>
        <p style="color:#666; font-size:1.1rem; margin:0 0 15px 0;">${mfg} - ${roadName} ${model}</p>
        <div style="background: #f1f1f1; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 0.95rem;">
            <strong>DCC Address:</strong> ${dccAddress}<br>
            <strong>Decoder:</strong> ${decoderDisplay}
        </div>
        <hr style="border:0; border-top:1px solid #eee;">
        <h3 style="margin-top:20px;">Function Map</h3>
        <ul class="function-list">${funcLabels || '<li>No functions defined.</li>'}</ul>
    `;
    document.getElementById('modal').classList.remove('hidden');
}

async function triggerPhotoUpload(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await db.photos.put({ id: id, blob: file });
            loadSavedPhoto(id);
        }
    };
    input.click();
}

async function loadSavedPhoto(id) {
    const record = await db.photos.get(id);
    if (record) {
        const imgElement = document.getElementById(`img-${id}`);
        if (imgElement) imgElement.src = URL.createObjectURL(record.blob);
    }
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); }
window.onclick = function(e) { if (e.target.id == 'modal') closeModal(); }