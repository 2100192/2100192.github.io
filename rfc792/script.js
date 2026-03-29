let packets = [];
let packetIdCounter = 1;
let seqCounter = 1;

const MAC_A = "00:50:56:C0:00:01"; const MAC_A_HEX = "00 50 56 C0 00 01";
const MAC_ROUTER = "00:0C:29:4F:8B:33"; const MAC_ROUTER_HEX = "00 0C 29 4F 8B 33";
const IP_HOST_A = "10.0.0.5";        const IP_HOST_A_HEX = "0A 00 00 05";
const IP_DEST = "8.8.8.8";           const IP_DEST_HEX = "08 08 08 08";
const IP_ROUTER = "10.0.0.1";        const IP_ROUTER_HEX = "0A 00 00 01";

document.addEventListener('click', () => {
    const balloon = document.getElementById('floating-balloon');
    if(balloon) balloon.style.display = 'none';
});

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerText = document.body.classList.contains('dark-mode') ? '☀️ Light' : '🌙 Dark';
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
            el.style.backgroundColor = "var(--accent-blue-lighter)";
            el.style.color = "var(--accent-blue)";
            el.style.borderColor = "var(--accent-blue)";
        }
    }
}

function resetSimulation() {
    packets = []; 
    packetIdCounter = 1;
    seqCounter = 1;
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">No ICMP traffic yet.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select an ICMP message to inspect.</p>';
    document.getElementById('hex-content').innerHTML = '';
    const btnSend = document.getElementById('btn-send');
    if(btnSend) btnSend.disabled = false;
    updateStatus("IDLE");
}

function toHex(num, padding) { 
    return num.toString(16).toUpperCase().padStart(padding, '0'); 
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runScenario() {
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = true;
    
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();

    const scenario = document.getElementById('sim-scenario').value;
    const identifier = Math.floor(Math.random() * 65535);

    if (scenario === 'echo') {
        updateStatus("PINGING...");
        // 1. Send Echo Request (Type 8)
        buildICMPPacket('A->B', 8, 0, identifier, seqCounter, IP_HOST_A, IP_DEST, MAC_A, MAC_ROUTER, "Echo Request");
        
        await sleep(600);
        
        // 2. Receive Echo Reply (Type 0)
        buildICMPPacket('B->A', 0, 0, identifier, seqCounter, IP_DEST, IP_HOST_A, MAC_ROUTER, MAC_A, "Echo Reply");
        seqCounter++;
        updateStatus("REPLY RECEIVED");

    } else if (scenario === 'unreachable') {
        updateStatus("SENDING UDP...");
        // 1. Host A sends a UDP packet to a closed port on Host B
        addTextLog("Host A sent UDP Datagram to 8.8.8.8:33434");
        await sleep(500);
        
        // 2. Host B responds with ICMP Destination Unreachable (Type 3, Code 3)
        buildICMPErrorPacket('B->A', 3, 3, IP_DEST, IP_HOST_A, MAC_ROUTER, MAC_A, "Destination Unreachable (Port Unreachable)");
        updateStatus("UNREACHABLE", true);

    } else if (scenario === 'ttl') {
        updateStatus("TRACEROUTE (TTL=1)...");
        // 1. Host A sends UDP with TTL=1
        addTextLog("Host A sent UDP Datagram with TTL=1");
        await sleep(500);
        
        // 2. Router drops it and sends ICMP Time Exceeded (Type 11, Code 0)
        buildICMPErrorPacket('R->A', 11, 0, IP_ROUTER, IP_HOST_A, MAC_ROUTER, MAC_A, "Time Exceeded (TTL expired in transit)");
        updateStatus("TIME EXCEEDED", true);
    }

    if (btnSend) btnSend.disabled = false;
}

function addTextLog(text) {
    const listEl = document.getElementById('packet-list');
    const div = document.createElement('div');
    div.className = 'packet-row';
    div.style.color = 'var(--text-muted)';
    div.style.fontStyle = 'italic';
    div.innerText = `[Action] ${text}`;
    listEl.appendChild(div);
}

// Builds ICMP Query Messages (Echo Request/Reply)
function buildICMPPacket(dir, type, code, id, seq, srcIp, dstIp, srcMac, dstMac, desc) {
    const isRequest = type === 8;
    const typeHex = toHex(type, 2);
    const codeHex = toHex(code, 2);
    const idHex = toHex(id, 4);
    const seqHex = toHex(seq, 4);
    
    // Fake Payload: "abcdefghijklmnopqrstuvwabcdefghi" (32 bytes)
    const payloadHex = "61 62 63 64 65 66 67 68 69 6A 6B 6C 6D 6E 6F 70 71 72 73 74 75 76 77 61 62 63 64 65 66 67 68 69";
    const ipTotalLen = 20 + 8 + 32; // IP(20) + ICMP(8) + Data(32)

    const pkt = {
        id: packetIdCounter++,
        summary: `${dir} ICMP ${desc} id=0x${toHex(id,4)} seq=${seq}`,
        fields: [
            { id: "ip_vhl", label: "Ver/IHL", val: "45", hex: "45", layer: "IPv4", bits: 8, desc: "IPv4 Version 4, Header Length 20 bytes." },
            { id: "ip_tos", label: "TOS", val: "00", hex: "00", layer: "IPv4", bits: 8, desc: "Type of Service." },
            { id: "ip_len", label: "Total Length", val: ipTotalLen.toString(), hex: toHex(ipTotalLen, 4).replace(/(.{2})/g, "$1 ").trim(), layer: "IPv4", bits: 16, desc: "Total IP datagram length." },
            { id: "ip_id", label: "Identification", val: "0x1234", hex: "12 34", layer: "IPv4", bits: 16, desc: "IP Fragmentation ID." },
            { id: "ip_frag", label: "Flags/Offset", val: "0x0000", hex: "00 00", layer: "IPv4", bits: 16, desc: "No fragmentation." },
            { id: "ip_ttl", label: "TTL", val: "64", hex: "40", layer: "IPv4", bits: 8, desc: "Time to live." },
            { id: "ip_pro", label: "Protocol", val: "1 (ICMP)", hex: "01", layer: "IPv4", bits: 8, desc: "Indicates ICMP payload[cite: 46, 47]." },
            { id: "ip_chk", label: "Checksum", val: "0xABCD", hex: "AB CD", layer: "IPv4", bits: 16, desc: "IP Header Checksum." },
            { id: "ip_src", label: "Src IP", val: srcIp, hex: srcIp === IP_HOST_A ? IP_HOST_A_HEX : IP_DEST_HEX, layer: "IPv4", bits: 32, desc: "Source Address." },
            { id: "ip_dst", label: "Dst IP", val: dstIp, hex: dstIp === IP_HOST_A ? IP_HOST_A_HEX : IP_DEST_HEX, layer: "IPv4", bits: 32, desc: "Destination Address." },
            
            // ICMP Layer (Echo Request/Reply format)
            { id: "icmp_type", label: "Type", val: type.toString(), hex: typeHex, layer: "ICMP", bits: 8, desc: `Type ${type}: ${desc}[cite: 343, 344, 345].` },
            { id: "icmp_code", label: "Code", val: code.toString(), hex: codeHex, layer: "ICMP", bits: 8, desc: "Code 0 for Echo messages[cite: 347]." },
            { id: "icmp_chk", label: "Checksum", val: "0x4D32", hex: "4D 32", layer: "ICMP", bits: 16, desc: "Error checking for ICMP header and data[cite: 349]." },
            { id: "icmp_id", label: "Identifier", val: `0x${idHex}`, hex: idHex.replace(/(.{2})/g, "$1 ").trim(), layer: "ICMP", bits: 16, desc: "Used to match replies with requests[cite: 362]." },
            { id: "icmp_seq", label: "Sequence Num", val: seq.toString(), hex: seqHex.replace(/(.{2})/g, "$1 ").trim(), layer: "ICMP", bits: 16, desc: "Incremented on each request to match replies[cite: 363]." },
            { id: "icmp_data", label: "Data Payload", val: "Data", hex: payloadHex, layer: "Data", bits: 32 * 8, desc: "The data received in the echo message must be returned in the echo reply message[cite: 361]." }
        ]
    };

    packets.push(pkt);
    renderPacketList();
}

// Builds ICMP Error Messages (Time Exceeded, Dest Unreachable)
function buildICMPErrorPacket(dir, type, code, srcIp, dstIp, srcMac, dstMac, desc) {
    const typeHex = toHex(type, 2);
    const codeHex = toHex(code, 2);
    
    // Original IP Header (20 bytes) + First 64 bits of original UDP payload (8 bytes)
    const origIpHeaderHex = "45 00 00 28 12 34 00 00 01 11 A1 B2 0A 00 00 05 08 08 08 08";
    const origUdpHex = "C3 50 82 9A 00 14 00 00"; // SrcPort, DstPort, Len, Chksum
    
    const ipTotalLen = 20 + 8 + 20 + 8; // IP(20) + ICMP(8) + OrigIP(20) + OrigUDP(8)

    const pkt = {
        id: packetIdCounter++,
        summary: `${dir} ICMP ERROR: ${desc}`,
        fields: [
            { id: "ip_vhl", label: "Ver/IHL", val: "45", hex: "45", layer: "IPv4", bits: 8, desc: "IPv4 Version 4, Header Length 20 bytes." },
            { id: "ip_tos", label: "TOS", val: "00", hex: "00", layer: "IPv4", bits: 8, desc: "Type of Service." },
            { id: "ip_len", label: "Total Length", val: ipTotalLen.toString(), hex: toHex(ipTotalLen, 4).replace(/(.{2})/g, "$1 ").trim(), layer: "IPv4", bits: 16, desc: "Total IP datagram length." },
            { id: "ip_id", label: "Identification", val: "0x9876", hex: "98 76", layer: "IPv4", bits: 16, desc: "IP Fragmentation ID." },
            { id: "ip_frag", label: "Flags/Offset", val: "0x0000", hex: "00 00", layer: "IPv4", bits: 16, desc: "No fragmentation." },
            { id: "ip_ttl", label: "TTL", val: "255", hex: "FF", layer: "IPv4", bits: 8, desc: "Time to live." },
            { id: "ip_pro", label: "Protocol", val: "1 (ICMP)", hex: "01", layer: "IPv4", bits: 8, desc: "Indicates ICMP payload[cite: 46, 47]." },
            { id: "ip_chk", label: "Checksum", val: "0xABCD", hex: "AB CD", layer: "IPv4", bits: 16, desc: "IP Header Checksum." },
            { id: "ip_src", label: "Src IP", val: srcIp, hex: srcIp === IP_ROUTER ? IP_ROUTER_HEX : IP_DEST_HEX, layer: "IPv4", bits: 32, desc: "Source Address (Router or Destination Host)." },
            { id: "ip_dst", label: "Dst IP", val: dstIp, hex: IP_HOST_A_HEX, layer: "IPv4", bits: 32, desc: "Destination Address (Original Sender)." },
            
            // ICMP Layer (Error Format)
            { id: "icmp_type", label: "Type", val: type.toString(), hex: typeHex, layer: "ICMP", bits: 8, desc: `Type ${type}: ${desc}.` },
            { id: "icmp_code", label: "Code", val: code.toString(), hex: codeHex, layer: "ICMP", bits: 8, desc: `Code ${code}.` },
            { id: "icmp_chk", label: "Checksum", val: "0xF21B", hex: "F2 1B", layer: "ICMP", bits: 16, desc: "ICMP Checksum." },
            { id: "icmp_unused", label: "Unused", val: "0x00000000", hex: "00 00 00 00", layer: "ICMP", bits: 32, desc: "Reserved for later extensions, must be zero[cite: 31]." },
            
            // ICMP Error Payload: Original IP + 64 bits
            { id: "icmp_orig_ip", label: "Original IP Header", val: "Header", hex: origIpHeaderHex, layer: "Original Datagram", bits: 20 * 8, desc: "The internet header of the original datagram that caused the error." },
            { id: "icmp_orig_data", label: "Orig. 64 bits", val: "L4 Header", hex: origUdpHex, layer: "Original Datagram", bits: 64, desc: "First 64 bits of original data (usually L4 ports). Used by the host to match the message to the appropriate process[cite: 105, 106, 155, 156]." }
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
        
        if (layerName === "IPv4" || layerName === "ICMP") {
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
            const widthPct = (layerName === "Data" || layerName === "Original Datagram") ? 100 : (field.bits / 32) * 100;
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
    if (leftPos > window.innerWidth - 300) {
        leftPos = window.innerWidth - 300;
    }
    
    balloon.style.left = leftPos + 'px';
    balloon.style.top = (event.clientY - 20) + 'px';
}