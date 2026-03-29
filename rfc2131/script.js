let packets = [];
let packetIdCounter = 1;
let clientState = "INIT"; // INIT, SELECTING, REQUESTING, BOUND
let transactionId = "";

const MAC_CLIENT = "00:1A:2B:3C:4D:5E"; const MAC_CLIENT_HEX = "00 1A 2B 3C 4D 5E";
const MAC_SERVER = "00:50:56:C0:00:01"; const MAC_SERVER_HEX = "00 50 56 C0 00 01";
const MAC_BROADCAST = "FF:FF:FF:FF:FF:FF"; const MAC_BROADCAST_HEX = "FF FF FF FF FF FF";

const IP_CLIENT_OFFER = "192.168.1.100"; const IP_CLIENT_OFFER_HEX = "C0 A8 01 64";
const IP_SERVER = "192.168.1.1";         const IP_SERVER_HEX = "C0 A8 01 01";
const IP_ZERO = "0.0.0.0";               const IP_ZERO_HEX = "00 00 00 00";
const IP_BROADCAST = "255.255.255.255";  const IP_BROADCAST_HEX = "FF FF FF FF";

document.addEventListener('click', () => {
    const balloon = document.getElementById('floating-balloon');
    if(balloon) balloon.style.display = 'none';
});

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerText = document.body.classList.contains('dark-mode') ? '☀️ Light' : '🌙 Dark';
}

function updateUI() {
    const cStateEl = document.getElementById('client-state');
    const sStateEl = document.getElementById('server-state');
    const ipEl = document.getElementById('client-ip');
    
    if(cStateEl) cStateEl.innerText = clientState;
    
    if (clientState === "BOUND") {
        ipEl.innerText = `(${IP_CLIENT_OFFER})`;
        ipEl.style.color = "var(--accent-blue)";
        document.getElementById('btn-dora').disabled = true;
        document.getElementById('btn-release').disabled = false;
    } else {
        ipEl.innerText = `(0.0.0.0)`;
        ipEl.style.color = "var(--text-muted)";
        document.getElementById('btn-dora').disabled = false;
        document.getElementById('btn-release').disabled = true;
    }
}

function resetSimulation() {
    packets = []; 
    packetIdCounter = 1;
    clientState = "INIT";
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">No DHCP traffic yet.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select a DHCP message to inspect.</p>';
    document.getElementById('hex-content').innerHTML = '';
    document.getElementById('server-state').innerText = "IDLE";
    updateUI();
}

function toHex(num, padding) { 
    return num.toString(16).toUpperCase().padStart(padding, '0'); 
}

function generateXID() {
    return toHex(Math.floor(Math.random() * 0xFFFFFFFF), 8);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runDORA() {
    const btnSend = document.getElementById('btn-dora');
    if (btnSend) btnSend.disabled = true;
    
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();

    transactionId = generateXID();
    document.getElementById('server-state').innerText = "LISTENING";

    // 1. DHCP DISCOVER
    addTextLog("Client initializes and broadcasts DHCPDISCOVER.");
    buildDHCPPacket("C->BROADCAST", "DHCPDISCOVER", 1, IP_ZERO_HEX, IP_BROADCAST_HEX, MAC_CLIENT_HEX, MAC_BROADCAST_HEX, IP_ZERO_HEX, IP_ZERO_HEX);
    clientState = "SELECTING";
    updateUI();
    
    await sleep(1000);

    // 2. DHCP OFFER
    addTextLog("Server offers IP 192.168.1.100 via DHCPOFFER.");
    document.getElementById('server-state').innerText = "OFFERING";
    buildDHCPPacket("S->BROADCAST", "DHCPOFFER", 2, IP_SERVER_HEX, IP_BROADCAST_HEX, MAC_SERVER_HEX, MAC_BROADCAST_HEX, IP_ZERO_HEX, IP_CLIENT_OFFER_HEX);
    
    await sleep(1000);

    // 3. DHCP REQUEST
    addTextLog("Client selects offer and broadcasts DHCPREQUEST.");
    clientState = "REQUESTING";
    updateUI();
    buildDHCPPacket("C->BROADCAST", "DHCPREQUEST", 1, IP_ZERO_HEX, IP_BROADCAST_HEX, MAC_CLIENT_HEX, MAC_BROADCAST_HEX, IP_ZERO_HEX, IP_ZERO_HEX, true);
    
    await sleep(1000);

    // 4. DHCP ACK
    addTextLog("Server commits binding and sends DHCPACK.");
    document.getElementById('server-state').innerText = "COMMITTED";
    buildDHCPPacket("S->BROADCAST", "DHCPACK", 2, IP_SERVER_HEX, IP_BROADCAST_HEX, MAC_SERVER_HEX, MAC_BROADCAST_HEX, IP_ZERO_HEX, IP_CLIENT_OFFER_HEX);
    
    clientState = "BOUND";
    updateUI();
    document.getElementById('server-state').innerText = "IDLE";
}

async function releaseLease() {
    document.getElementById('btn-release').disabled = true;
    addTextLog("Client relinquishes network address via DHCPRELEASE.");
    
    // DHCP RELEASE is Unicast to the server
    buildDHCPPacket("C->S", "DHCPRELEASE", 1, IP_CLIENT_OFFER_HEX, IP_SERVER_HEX, MAC_CLIENT_HEX, MAC_SERVER_HEX, IP_CLIENT_OFFER_HEX, IP_ZERO_HEX);
    
    clientState = "INIT";
    updateUI();
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

function buildDHCPPacket(dir, msgType, opCode, srcIpHex, dstIpHex, srcMacHex, dstMacHex, ciaddrHex, yiaddrHex, isRequest = false) {
    
    let msgTypeHex = "01"; // Discover
    let optionsHex = `63 82 53 63 35 01 01 FF`; // Magic cookie + Opt 53 (Type 1) + End
    let optionsDesc = "Option 53 (DHCP Message Type): Discover\nOption 255 (End)";

    if (msgType === "DHCPOFFER") {
        msgTypeHex = "02";
        optionsHex = `63 82 53 63 35 01 02 33 04 00 01 51 80 36 04 ${IP_SERVER_HEX} FF`; 
        optionsDesc = "Option 53 (DHCP Message Type): Offer\nOption 51 (IP Address Lease Time): 86400s (1 day)\nOption 54 (Server Identifier): 192.168.1.1\nOption 255 (End)";
    } else if (msgType === "DHCPREQUEST") {
        msgTypeHex = "03";
        optionsHex = `63 82 53 63 35 01 03 32 04 ${IP_CLIENT_OFFER_HEX} 36 04 ${IP_SERVER_HEX} FF`;
        optionsDesc = "Option 53 (DHCP Message Type): Request\nOption 50 (Requested IP Address): 192.168.1.100\nOption 54 (Server Identifier): 192.168.1.1\nOption 255 (End)";
    } else if (msgType === "DHCPACK") {
        msgTypeHex = "05";
        optionsHex = `63 82 53 63 35 01 05 33 04 00 01 51 80 36 04 ${IP_SERVER_HEX} FF`;
        optionsDesc = "Option 53 (DHCP Message Type): ACK\nOption 51 (IP Address Lease Time): 86400s (1 day)\nOption 54 (Server Identifier): 192.168.1.1\nOption 255 (End)";
    } else if (msgType === "DHCPRELEASE") {
        msgTypeHex = "07";
        optionsHex = `63 82 53 63 35 01 07 36 04 ${IP_SERVER_HEX} FF`;
        optionsDesc = "Option 53 (DHCP Message Type): Release\nOption 54 (Server Identifier): 192.168.1.1\nOption 255 (End)";
    }

    const opDesc = opCode === 1 ? "1 (BOOTREQUEST)" : "2 (BOOTREPLY)";
    
    // Padding CHADDR to 16 bytes (32 hex characters)
    const chaddrPadded = (MAC_CLIENT_HEX + " 00 00 00 00 00 00 00 00 00 00").substring(0, 47);
    
    const pkt = {
        id: packetIdCounter++,
        summary: `${dir} ${msgType} xid: 0x${transactionId}`,
        fields: [
            // Transport wrappers (simplified representation for the UI)
            { id: "udp_port", label: "UDP Ports", val: opCode === 1 ? "68 -> 67" : "67 -> 68", hex: opCode === 1 ? "00 44 00 43" : "00 43 00 44", layer: "UDP", bits: 32, desc: "DHCP Client port is 68, Server port is 67." },
            
            // DHCP/BOOTP Layer (RFC 2131)
            { id: "dhcp_op", label: "op", val: opDesc, hex: toHex(opCode, 2), layer: "DHCP", bits: 8, desc: "Message op code. 1 = BOOTREQUEST, 2 = BOOTREPLY." },
            { id: "dhcp_htype", label: "htype", val: "1 (Ethernet)", hex: "01", layer: "DHCP", bits: 8, desc: "Hardware address type (1 = 10mb ethernet)." },
            { id: "dhcp_hlen", label: "hlen", val: "6", hex: "06", layer: "DHCP", bits: 8, desc: "Hardware address length." },
            { id: "dhcp_hops", label: "hops", val: "0", hex: "00", layer: "DHCP", bits: 8, desc: "Used by relay agents. Set to 0 by client." },
            { id: "dhcp_xid", label: "xid", val: `0x${transactionId}`, hex: transactionId.replace(/(.{2})/g, "$1 ").trim(), layer: "DHCP", bits: 32, desc: "Transaction ID. Random number used to associate messages and responses." },
            { id: "dhcp_secs", label: "secs", val: "0", hex: "00 00", layer: "DHCP", bits: 16, desc: "Seconds elapsed since client began address acquisition." },
            { id: "dhcp_flags", label: "flags", val: dstIpHex === IP_BROADCAST_HEX ? "0x8000 (Broadcast)" : "0x0000", hex: dstIpHex === IP_BROADCAST_HEX ? "80 00" : "00 00", layer: "DHCP", bits: 16, desc: "Broadcast flag. 1 = Server should broadcast responses." },
            { id: "dhcp_ciaddr", label: "ciaddr", val: ciaddrHex === IP_ZERO_HEX ? "0.0.0.0" : IP_CLIENT_OFFER, hex: ciaddrHex, layer: "DHCP", bits: 32, desc: "Client IP address; only filled in if client is in BOUND, RENEW or REBINDING state." },
            { id: "dhcp_yiaddr", label: "yiaddr", val: yiaddrHex === IP_ZERO_HEX ? "0.0.0.0" : IP_CLIENT_OFFER, hex: yiaddrHex, layer: "DHCP", bits: 32, desc: "'Your' (client) IP address. Sent by server in DHCPOFFER/ACK." },
            { id: "dhcp_siaddr", label: "siaddr", val: "0.0.0.0", hex: "00 00 00 00", layer: "DHCP", bits: 32, desc: "IP address of next server to use in bootstrap." },
            { id: "dhcp_giaddr", label: "giaddr", val: "0.0.0.0", hex: "00 00 00 00", layer: "DHCP", bits: 32, desc: "Relay agent IP address." },
            { id: "dhcp_chaddr", label: "chaddr", val: MAC_CLIENT, hex: chaddrPadded, layer: "DHCP", bits: 128, desc: "Client hardware address (MAC)." },
            { id: "dhcp_sname", label: "sname", val: "(null)", hex: "00 ".repeat(64).trim(), layer: "DHCP", bits: 512, desc: "Optional server host name, null terminated string." },
            { id: "dhcp_file", label: "file", val: "(null)", hex: "00 ".repeat(128).trim(), layer: "DHCP", bits: 1024, desc: "Boot file name, null terminated string." },
            { id: "dhcp_options", label: "options", val: "Magic Cookie + DHCP Options", hex: optionsHex, layer: "DHCP", bits: 100, desc: optionsDesc } // bits value here is arbitrary for full width rendering
        ]
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
        
        if (layerName === "DHCP") {
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
            
            // Standardizing widths based on bit count
            let widthPct = (field.bits / 32) * 100;
            if (field.bits >= 128 || layerName === "UDP") widthPct = 100; // Force full width for large BOOTP fields
            
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