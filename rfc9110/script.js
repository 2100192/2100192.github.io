let packets = [];
let packetIdCounter = 1;

document.addEventListener('click', () => {
    const balloon = document.getElementById('floating-balloon');
    if(balloon) balloon.style.display = 'none';
});

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerText = document.body.classList.contains('dark-mode') ? '☀️ Light Mode' : '🌙 Dark Mode';
}

function updateStatus(status, isError = false) {
    const el = document.getElementById('net-status');
    if(el) {
        el.innerText = status;
        if (isError) {
            el.style.backgroundColor = "var(--danger-bg)";
            el.style.color = "white";
            el.style.borderColor = "var(--danger-bg)";
        } else if (status !== "IDLE") {
            el.style.backgroundColor = "var(--accent-blue)";
            el.style.color = "white";
            el.style.borderColor = "var(--accent-blue)";
        } else {
            el.style.backgroundColor = "var(--bg-body)";
            el.style.color = "var(--text-muted)";
            el.style.borderColor = "var(--border-color)";
        }
    }
}

function resetSimulation() {
    packets = []; 
    packetIdCounter = 1;
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">No HTTP traffic recorded.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select an HTTP message to inspect.</p>';
    document.getElementById('hex-content').innerHTML = '';
    const btnSend = document.getElementById('btn-send');
    if(btnSend) btnSend.disabled = false;
    updateStatus("IDLE");
}

function strToHex(str) {
    return str.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runHttpScenario() {
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = true;
    
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();

    const scenario = document.getElementById('sim-scenario').value;

    if (scenario === 'get_200') {
        updateStatus("SENDING REQUEST");
        addTextLog("Client initiates a GET request for /index.html");
        
        buildHttpPacket("Client -> Server", "GET /index.html HTTP/1.1", "req", [
            "GET /index.html HTTP/1.1",
            "Host: www.example.com",
            "User-Agent: HttpEmulator/1.0",
            "Accept: text/html, application/xhtml+xml"
        ]);
        
        await sleep(1000);
        
        updateStatus("RECEIVING RESPONSE");
        addTextLog("Server responds with 200 OK and sends HTML document.");
        
        buildHttpPacket("Server -> Client", "HTTP/1.1 200 OK", "res", [
            "HTTP/1.1 200 OK",
            "Date: Sun, 29 Mar 2026 10:00:00 GMT",
            "Server: Apache/2.4.41 (Ubuntu)",
            "Content-Type: text/html; charset=UTF-8",
            "Content-Length: 46"
        ], "<html><body><h1>Hello HTTP World!</h1></body></html>");
        
        updateStatus("IDLE");

    } else if (scenario === 'post_201') {
        updateStatus("SENDING REQUEST");
        addTextLog("Client sends a JSON payload via POST to /api/data");
        
        const jsonPayload = '{"user":"admin", "action":"login"}';
        buildHttpPacket("Client -> Server", "POST /api/data HTTP/1.1", "req", [
            "POST /api/data HTTP/1.1",
            "Host: api.example.com",
            "User-Agent: HttpEmulator/1.0",
            "Content-Type: application/json",
            `Content-Length: ${jsonPayload.length}`
        ], jsonPayload);
        
        await sleep(1200);
        
        updateStatus("RECEIVING RESPONSE");
        addTextLog("Server accepts the data and responds with 201 Created.");
        
        buildHttpPacket("Server -> Client", "HTTP/1.1 201 Created", "res", [
            "HTTP/1.1 201 Created",
            "Date: Sun, 29 Mar 2026 10:01:15 GMT",
            "Location: /api/data/9942",
            "Content-Length: 0"
        ]);
        
        updateStatus("IDLE");

    } else if (scenario === 'get_404') {
        updateStatus("SENDING REQUEST");
        addTextLog("Client attempts to access a non-existent resource (/secret.html)");
        
        buildHttpPacket("Client -> Server", "GET /secret.html HTTP/1.1", "req", [
            "GET /secret.html HTTP/1.1",
            "Host: www.example.com",
            "User-Agent: HttpEmulator/1.0"
        ]);
        
        await sleep(800);
        
        updateStatus("404 ERROR", true);
        addTextLog("Server cannot find the resource and returns 404 Not Found.");
        
        const errorHtml = "404 Not Found: The requested resource does not exist.";
        buildHttpPacket("Server -> Client", "HTTP/1.1 404 Not Found", "res", [
            "HTTP/1.1 404 Not Found",
            "Date: Sun, 29 Mar 2026 10:05:00 GMT",
            "Content-Type: text/plain",
            `Content-Length: ${errorHtml.length}`
        ], errorHtml);
        
        setTimeout(() => updateStatus("IDLE"), 2000);
    }

    if (btnSend) btnSend.disabled = false;
}

function addTextLog(text) {
    const listEl = document.getElementById('packet-list');
    const div = document.createElement('div');
    div.className = 'packet-row';
    div.style.color = 'var(--text-muted)';
    div.style.fontStyle = 'italic';
    div.innerText = `[System] ${text}`;
    listEl.appendChild(div);
    listEl.scrollTop = listEl.scrollHeight;
}

function buildHttpPacket(dir, summary, type, lines, body = "") {
    let fields = [];

    lines.forEach((line, idx) => {
        // RFC requires CRLF termination at the end of each header line
        const lineWithCRLF = line + "\r\n";
        const lineHex = strToHex(lineWithCRLF);
        
        let labelName = "Header Field";
        let desc = "An HTTP header field in the format 'Name: Value', followed by CRLF.";
        
        if (idx === 0) {
            if (type === "req") {
                labelName = "Request-Line";
                desc = "Contains the Method (e.g., GET), the Target (Path), and the HTTP Version.";
            } else {
                labelName = "Status-Line";
                desc = "Contains the HTTP Version, the Status Code (e.g., 200), and the Reason Phrase (e.g., OK).";
            }
        }

        fields.push({
            id: `http_l${idx}`,
            label: labelName,
            val: line.replace(/</g, "&lt;"), // simple escapes for visual HTML
            hex: lineHex,
            layer: "HTTP",
            bits: 100, // Arbitrary value; the renderer will force 100% width
            desc: desc
        });
    });

    // Mandatory empty line (single CRLF) indicating the end of the header section
    fields.push({
        id: "http_empty",
        label: "Empty Line (CRLF)",
        val: "\\r\\n",
        hex: "0D 0A",
        layer: "HTTP",
        bits: 100,
        desc: "The mandatory empty line that separates the header section from the message body."
    });

    // Optional message body
    if (body) {
        fields.push({
            id: "http_body",
            label: "Message Body",
            val: body.length > 50 ? body.substring(0, 50) + "..." : body.replace(/</g, "&lt;"),
            hex: strToHex(body),
            layer: "Payload / Body",
            bits: 100,
            desc: "The data transported associated with the request or response."
        });
    }

    const pkt = {
        id: packetIdCounter++,
        summary: `${dir} [${summary}]`,
        fields: fields
    };

    packets.push(pkt);
    renderPacketList();
}

function renderPacketList() {
    const listEl = document.getElementById('packet-list');
    const pkt = packets[packets.length - 1];
    
    const div = document.createElement('div');
    div.className = 'packet-row';
    div.innerText = `${pkt.id}. ${pkt.summary}`;
    div.onclick = () => loadPacket(pkt.id, div);
    
    listEl.appendChild(div);
    listEl.scrollTop = listEl.scrollHeight;
    
    loadPacket(pkt.id, div);
}

function loadPacket(id, rowElement) {
    document.querySelectorAll('.packet-row').forEach(el => el.classList.remove('active'));
    if(rowElement) rowElement.classList.add('active');
    
    const pkt = packets.find(p => p.id === id);
    if (!pkt) return;

    const container = document.getElementById('diagram-content');
    container.innerHTML = '';
    
    const layers = [...new Set(pkt.fields.map(f => f.layer))];
    layers.forEach(layerName => {
        const layerDiv = document.createElement('div');
        layerDiv.className = 'protocol-layer';
        layerDiv.innerHTML = `<div class="layer-title">${layerName}</div>`;
        
        // In HTTP we don't use the "bit-ruler" because it is a text/line-based protocol
        // rather than having strict bit offsets.
        
        const gridDiv = document.createElement('div');
        gridDiv.className = 'field-grid';
        
        pkt.fields.filter(f => f.layer === layerName).forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field';
            fieldDiv.id = `diagram-field-${field.id}`;
            
            // In HTTP we force each field to take up the full width (100%)
            // to represent that each is a line of text.
            fieldDiv.style.width = `100%`;
            fieldDiv.style.textAlign = `left`;
            fieldDiv.style.paddingLeft = `10px`;
            
            fieldDiv.innerHTML = `<span class="field-label" style="display:inline-block; width:200px; color: var(--accent-blue);">${field.label}</span><span class="field-val">${field.val}</span>`;
            fieldDiv.onclick = (e) => showFieldInfo(e, field.label, field.val, field.desc);
            fieldDiv.onmouseenter = () => highlightField(field.id);
            fieldDiv.onmouseleave = () => unhighlightField(field.id);
            gridDiv.appendChild(fieldDiv);
        });
        
        layerDiv.appendChild(gridDiv);
        container.appendChild(layerDiv);
    });
    
    renderHexView(pkt);
}

function renderHexView(pkt) {
    const hexContainer = document.getElementById('hex-content');
    hexContainer.innerHTML = '';
    let allBytes = [];
    
    pkt.fields.forEach(f => {
        const cleanHex = f.hex.replace(/\s+/g, '');
        for(let i=0; i < cleanHex.length; i+=2) {
            const hex = cleanHex.substring(i, i+2);
            const dec = parseInt(hex, 16);
            // Show dots for control characters (like CR and LF)
            allBytes.push({ hex: hex, ascii: (dec >= 32 && dec <= 126) ? String.fromCharCode(dec) : '.', fieldId: f.id });
        }
    });
    
    for(let i=0; i < allBytes.length; i += 16) {
        const row = document.createElement('div');
        row.className = 'hex-row';
        row.innerHTML = `<div class="hex-offset">${i.toString(16).padStart(4, '0')}</div>`;
        
        const hexB = document.createElement('div'); hexB.className = 'hex-bytes';
        const ascC = document.createElement('div'); ascC.className = 'hex-ascii';
        
        allBytes.slice(i, i + 16).forEach(b => {
            const bS = document.createElement('span'); 
            bS.className = `byte byte-${b.fieldId}`; 
            bS.innerText = b.hex;
            bS.onmouseenter = () => highlightField(b.fieldId); 
            bS.onmouseleave = () => unhighlightField(b.fieldId);
            hexB.appendChild(bS);
            
            const aS = document.createElement('span'); 
            aS.className = `ascii-char ascii-${b.fieldId}`; 
            aS.innerText = b.ascii;
            aS.onmouseenter = () => highlightField(b.fieldId); 
            aS.onmouseleave = () => unhighlightField(b.fieldId);
            ascC.appendChild(aS);
        });
        
        row.appendChild(hexB); 
        row.appendChild(ascC);
        hexContainer.appendChild(row);
    }
}

function highlightField(id) { 
    document.querySelectorAll(`.byte-${id}, .ascii-${id}`).forEach(el => el.classList.add('highlighted')); 
    const diagField = document.getElementById(`diagram-field-${id}`);
    if(diagField) diagField.classList.add('highlighted');
}

function unhighlightField(id) { 
    document.querySelectorAll(`.byte-${id}, .ascii-${id}`).forEach(el => el.classList.remove('highlighted')); 
    const diagField = document.getElementById(`diagram-field-${id}`);
    if(diagField) diagField.classList.remove('highlighted');
}

function showFieldInfo(event, label, val, desc) {
    event.stopPropagation();
    const balloon = document.getElementById('floating-balloon');
    document.getElementById('balloon-title').innerText = label;
    document.getElementById('balloon-desc').innerText = desc;
    balloon.style.display = 'block';
    
    let leftPos = event.clientX;
    if (leftPos > window.innerWidth - 300) leftPos = window.innerWidth - 300;
    
    balloon.style.left = leftPos + 'px';
    balloon.style.top = (event.clientY - 20) + 'px';
}