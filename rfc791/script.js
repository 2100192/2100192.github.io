let packets = [];
let packetIdCounter = 1;

// Simulated Network Configurations
const MAC_SRC = "00:50:56:C0:00:01"; const MAC_SRC_HEX = "00 50 56 C0 00 01";
const MAC_DST = "00:0C:29:4F:8B:33"; const MAC_DST_HEX = "00 0C 29 4F 8B 33";
const IP_SRC = "192.168.1.10";       const IP_SRC_HEX = "C0 A8 01 0A";
const IP_DST = "8.8.8.8";            const IP_DST_HEX = "08 08 08 08";

const DEFAULT_TEXT = "Hello World!";

document.addEventListener('DOMContentLoaded', () => {
    const inputSize = document.getElementById('input-size');
    if (inputSize) inputSize.value = DEFAULT_TEXT.length;
    updateStatus("IDLE");
});

document.addEventListener('click', () => {
    const balloon = document.getElementById('floating-balloon');
    if(balloon) balloon.style.display = 'none';
});

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerText = document.body.classList.contains('dark-mode') ? '☀️ Light' : '🌙 Dark';
}

function updateStatus(status) {
    const el = document.getElementById('net-status');
    if(el) {
        el.innerText = status;
        if (status === "ICMP ERROR") {
            el.style.backgroundColor = "var(--danger-bg)";
            el.style.color = "white";
            el.style.borderColor = "var(--danger-bg)";
        } else if (status === "TRANSMITTING") {
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
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">Traffic log is empty.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select a fragment to inspect.</p>';
    document.getElementById('hex-content').innerHTML = '';
    const btnSend = document.getElementById('btn-send');
    if(btnSend) btnSend.disabled = false;
    updateStatus("IDLE");
}

function toHex(num, padding) { 
    return num.toString(16).toUpperCase().padStart(padding, '0'); 
}

// Utility to simulate network delay
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function processDatagram() {
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = true; // Prevent multiple simultaneous sends
    
    // Remove the empty log message if it exists
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();
    
    const dataSize = parseInt(document.getElementById('input-size').value) || DEFAULT_TEXT.length;
    const mtu = parseInt(document.getElementById('input-mtu').value);
    const ttl = parseInt(document.getElementById('input-ttl').value);
    const hops = parseInt(document.getElementById('input-hops').value);
    const tos = parseInt(document.getElementById('input-tos').value);
    
    // Determine simulation delay based on TOS
    // Low Delay (16) = 50ms, High Throughput (8) = 200ms, Routine (0) = 500ms
    const networkDelay = (tos === 16) ? 50 : (tos === 8) ? 200 : 500;

    updateStatus("TRANSMITTING");

    // ICMP Time Exceeded Logic (RFC 792)
    // If Hops distance is greater than or equal to TTL, the packet drops.
    if (ttl <= hops) {
        await sleep(networkDelay * ttl); // Wait time equivalent to travel before drop
        
        updateStatus("ICMP ERROR");
        addErrorLog(`❌ DROP at Hop ${ttl}: ICMP Type 11, Code 0 (Time to Live exceeded in transit)`);
        
        if (btnSend) btnSend.disabled = false;
        return;
    }

    const id = Math.floor(Math.random() * 65535);
    const maxIPPayload = Math.floor((mtu - 20) / 8) * 8; 
    
    let offset = 0;
    let remaining = 8 + dataSize; // UDP Header (8) + App Data

    while (remaining > 0) {
        await sleep(networkDelay); // Simulate network processing latency based on TOS
        
        let chunk = Math.min(remaining, maxIPPayload);
        let mf = (remaining - chunk > 0) ? 1 : 0; // More Fragments
        
        // Final TTL at destination is initial TTL minus hops
        buildIPPacket(id, chunk + 20, offset / 8, mf, ttl - hops, tos, chunk, offset === 0);
        
        offset += chunk;
        remaining -= chunk;
    }

    updateStatus("DELIVERED");
    if (btnSend) btnSend.disabled = false;
}

function addErrorLog(message) {
    const listEl = document.getElementById('packet-list');
    const div = document.createElement('div');
    div.className = 'packet-row';
    div.style.color = 'var(--danger-bg)';
    div.style.fontWeight = 'bold';
    div.innerText = message;
    listEl.appendChild(div);
    listEl.scrollTop = listEl.scrollHeight;
}

function buildIPPacket(ipId, ipTotalLen, offset, mf, receivedTtl, tos, payloadLen, isFirst) {
    const flags = mf; 
    const fragField = (flags << 13) | offset;
    const fragHex = toHex(fragField, 4);

    const pkt = {
        id: packetIdCounter++,
        summary: `ID: 0x${toHex(ipId, 4)} | Off: ${offset * 8} | Len: ${ipTotalLen} | MF: ${mf} | Arrived TTL: ${receivedTtl}`,
        fields: [
            { id: "eth_dst", label: "Dst MAC", val: MAC_DST, hex: MAC_DST_HEX, layer: "Ethernet", bits: 48, desc: "Destination physical address." },
            { id: "eth_src", label: "Src MAC", val: MAC_SRC, hex: MAC_SRC_HEX, layer: "Ethernet", bits: 48, desc: "Source physical address." },
            { id: "eth_typ", label: "Type", val: "0x0800", hex: "08 00", layer: "Ethernet", bits: 16, desc: "IPv4 Ethertype." },
            
            { id: "ip_vhl", label: "Ver/IHL", val: "4/5", hex: "45", layer: "IPv4", bits: 8, desc: "IPv4 Version and Header Length (20 octets)." },
            { id: "ip_tos", label: "TOS", val: tos.toString(), hex: toHex(tos, 2), layer: "IPv4", bits: 8, desc: "Type of Service." },
            { id: "ip_len", label: "Total Len", val: ipTotalLen.toString(), hex: toHex(ipTotalLen, 4).match(/.{2}/g).join(' '), layer: "IPv4", bits: 16, desc: "Total length of the IP datagram." },
            { id: "ip_id", label: "ID", val: `0x${toHex(ipId, 4)}`, hex: toHex(ipId, 4).match(/.{2}/g).join(' '), layer: "IPv4", bits: 16, desc: "Fragment identification number." },
            { id: "ip_frag", label: "Flags/Off", val: `MF:${mf}, Off:${offset*8}`, hex: fragHex.match(/.{2}/g).join(' '), layer: "IPv4", bits: 16, desc: "Fragmentation flags and offset." },
            { id: "ip_ttl", label: "TTL", val: receivedTtl.toString(), hex: toHex(receivedTtl, 2), layer: "IPv4", bits: 8, desc: "Remaining Time to Live at destination." },
            { id: "ip_pro", label: "Protocol", val: "17 (UDP)", hex: "11", layer: "IPv4", bits: 8, desc: "Higher level protocol (UDP)." },
            { id: "ip_chk", label: "Checksum", val: "0xFE21", hex: "FE 21", layer: "IPv4", bits: 16, desc: "Header checksum." },
            { id: "ip_src", label: "Src IP", val: IP_SRC, hex: IP_SRC_HEX, layer: "IPv4", bits: 32, desc: "Source IP address." },
            { id: "ip_dst", label: "Dst IP", val: IP_DST, hex: IP_DST_HEX, layer: "IPv4", bits: 32, desc: "Destination IP address." }
        ]
    };

    let currentPayload = payloadLen;
    if (isFirst) {
        pkt.fields.push({ id: "udp_hdr", label: "UDP Header", val: "5000→80", hex: "C3 50 00 50 00 14 00 00", layer: "UDP", bits: 64, desc: "UDP Source/Destination Ports and Length." });
        currentPayload -= 8;
    }
    
    if (currentPayload > 0) {
        const fullHex = DEFAULT_TEXT.split('').map(c => toHex(c.charCodeAt(0), 2)).join(' ');
        const start = isFirst ? 0 : (offset * 8) - 8;
        const fragmentHex = fullHex.split(' ').slice(start, start + currentPayload).join(' ');

        pkt.fields.push({ id: "payload", label: "Payload", val: "Data", hex: fragmentHex || "00", layer: "Data", bits: currentPayload * 8, desc: "Fragmented application data." });
    }

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
    
    // Automatically load the latest packet
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
        
        if (layerName === "IPv4") {
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
            const widthPct = (layerName === "Ethernet" || layerName === "Data") ? 100 : (field.bits / 32) * 100;
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
    
    // Prevent balloon from going off-screen
    let leftPos = event.clientX;
    if (leftPos > window.innerWidth - 300) {
        leftPos = window.innerWidth - 300;
    }
    
    balloon.style.left = leftPos + 'px';
    balloon.style.top = (event.clientY - 20) + 'px';
}