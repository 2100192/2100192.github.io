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
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">No SSH traffic recorded.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select an SSH packet to inspect.</p>';
    document.getElementById('hex-content').innerHTML = '';
    const btnSend = document.getElementById('btn-send');
    if(btnSend) btnSend.disabled = false;
    updateStatus("IDLE");
}

function toHex(num, padding) { 
    return num.toString(16).toUpperCase().padStart(padding, '0'); 
}

function strToHex(str) {
    return str.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runSshScenario() {
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = true;
    
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();

    const scenario = document.getElementById('sim-scenario').value;

    if (scenario === 'transport') {
        updateStatus("NEGOTIATING");
        addTextLog("TCP Connection established. Exchanging Identification Strings.");
        await sleep(600);

        addTextLog("Client and Server enter the Transport Layer Protocol (Key Exchange).");
        
        // Client KEXINIT (Message 20)
        buildSshPacket("Client -> Server", "SSH_MSG_KEXINIT", 20, false, 
            "00 00 00 10 63 75 72 76 65 32 35 35 31 39 2D 73 68 61 32 35 36", 
            "Key Exchange Algorithms: curve25519-sha256...");
        
        await sleep(800);

        // Server KEXINIT (Message 20)
        buildSshPacket("Server -> Client", "SSH_MSG_KEXINIT", 20, false, 
            "00 00 00 10 63 75 72 76 65 32 35 35 31 39 2D 73 68 61 32 35 36", 
            "Key Exchange Algorithms: curve25519-sha256...");

        await sleep(800);
        updateStatus("SECURED");
        addTextLog("Key exchange completed. Keys derived. Connection is now Encrypted and Authenticated (Server).");

    } else if (scenario === 'auth') {
        updateStatus("AUTHENTICATING");
        addTextLog("Transport Layer is secure. Client requests User Authentication.");
        await sleep(600);

        // Client UserAuth Request (Message 50)
        buildSshPacket("Client -> Server", "SSH_MSG_USERAUTH_REQUEST", 50, true, 
            "00 00 00 05 61 64 6D 69 6E 00 00 00 0E 73 73 68 2D 63 6F 6E 6E 65 63 74 69 6F 6E", 
            "User: admin, Service: ssh-connection, Method: publickey");

        await sleep(1000);

        // Server UserAuth Success (Message 52)
        buildSshPacket("Server -> Client", "SSH_MSG_USERAUTH_SUCCESS", 52, true, 
            "", 
            "Authentication successful.");
        
        await sleep(600);
        updateStatus("AUTHENTICATED");
        addTextLog("Client is successfully authenticated.");

    } else if (scenario === 'connection') {
        updateStatus("MULTIPLEXING");
        addTextLog("Entering Connection Protocol. Multiplexing encrypted tunnel into logical channels.");
        await sleep(600);

        // Channel Open (Message 90)
        buildSshPacket("Client -> Server", "SSH_MSG_CHANNEL_OPEN", 90, true, 
            "00 00 00 07 73 65 73 73 69 6F 6E 00 00 00 00 00 20 00 00 00 00 80 00", 
            "Channel Type: session, Sender Channel: 0, Initial Window: 2MB");

        await sleep(1000);

        // Channel Open Confirmation (Message 91)
        buildSshPacket("Server -> Client", "SSH_MSG_CHANNEL_OPEN_CONFIRMATION", 91, true, 
            "00 00 00 00 00 00 00 00 00 20 00 00 00 00 80 00", 
            "Recipient Channel: 0, Sender Channel: 0, Initial Window: 2MB");
        
        await sleep(600);
        updateStatus("ESTABLISHED");
        addTextLog("Session channel opened successfully. Ready for interactive shell.");
    }

    setTimeout(() => {
        if(document.getElementById('net-status').innerText !== "ERROR") {
             updateStatus("IDLE");
        }
    }, 3000);

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

function buildSshPacket(dir, summary, msgCode, isEncrypted, payloadHex, payloadDesc) {
    let fields = [];

    // Calculate lengths
    const payloadBytes = (payloadHex.replace(/\s+/g, '').length / 2) + 1; // +1 for the msgCode byte
    
    // Padding must ensure total packet length (excluding packet_length field itself) is a multiple of block size or 8
    // min padding is 4. Let's assume block size 8 for this simulation.
    let paddingLength = 8 - ((payloadBytes + 5) % 8); 
    if (paddingLength < 4) paddingLength += 8;

    const packetLength = payloadBytes + paddingLength + 1; // +1 for padding_length byte

    // TCP Wrapper (Visual context)
    fields.push({ id: "tcp_wrapper", label: "TCP Transport", val: "Port 22", hex: "00 16", layer: "Transport", bits: 16, desc: "SSH runs reliably over TCP." });

    // SSH Binary Packet Protocol (RFC 4253, base of 4251 architecture)
    fields.push({ id: "ssh_pkt_len", label: "Packet Length", val: packetLength.toString(), hex: toHex(packetLength, 8).match(/.{2}/g).join(' '), layer: "SSH Packet", bits: 32, desc: "Length of the packet in bytes, not including 'mac' or the 'packet_length' field itself." });
    fields.push({ id: "ssh_pad_len", label: "Padding Length", val: paddingLength.toString(), hex: toHex(paddingLength, 2), layer: "SSH Packet", bits: 8, desc: "Length of the 'random padding' (in bytes)." });
    
    // Payload
    let fullPayloadHex = `${toHex(msgCode, 2)} ${payloadHex}`.trim();
    fields.push({ id: "ssh_payload", label: isEncrypted ? "Encrypted Payload" : "Payload", val: `Msg Code: ${msgCode}`, hex: fullPayloadHex, layer: "SSH Packet", bits: payloadBytes * 8, desc: isEncrypted ? `[Encrypted] ${payloadDesc}` : payloadDesc });
    
    // Padding
    const randomPadding = Array.from({length: paddingLength}, () => toHex(Math.floor(Math.random() * 256), 2)).join(' ');
    fields.push({ id: "ssh_padding", label: isEncrypted ? "Encrypted Padding" : "Random Padding", val: `${paddingLength} bytes`, hex: randomPadding, layer: "SSH Packet", bits: paddingLength * 8, desc: "Arbitrary-length padding, random bytes. Encrypted with the payload." });

    // MAC (Message Authentication Code)
    const dummyMac = "A1 B2 C3 D4 E5 F6 78 90 12 34 56 78 9A BC DE F0"; // 16 byte dummy MAC
    if (isEncrypted) {
        fields.push({ id: "ssh_mac", label: "MAC", val: "Message Authentication Code", hex: dummyMac, layer: "SSH Packet", bits: 128, desc: "Message Authentication Code. Computed over the unencrypted packet to ensure data integrity." });
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
        
        if (layerName === "SSH Packet") {
            const ruler = document.createElement('div');
            ruler.className = 'bit-ruler';
            ruler.innerHTML = `<span style="left:0%;">0</span><span style="left:25%;">8</span><span style="left:50%;">16</span><span style="left:75%;">24</span><span style="left:100%;">31</span>`;
            layerDiv.appendChild(ruler);
        }
        
        const gridDiv = document.createElement('div');
        gridDiv.className = 'field-grid';
        
        pkt.fields.filter(f => f.layer === layerName).forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field';
            fieldDiv.id = `diagram-field-${field.id}`;
            
            // Adjust visual width based on bits. Payload and MAC take full width.
            let widthPct = (field.bits / 32) * 100;
            if (field.bits >= 32 || field.id === "ssh_payload" || field.id === "ssh_padding" || field.id === "ssh_mac") widthPct = 100;
            
            fieldDiv.style.width = `${widthPct}%`;
            
            fieldDiv.innerHTML = `<span class="field-label">${field.label}</span><span class="field-val">${field.val}</span>`;
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