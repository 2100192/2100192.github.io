let packets = [];
let packetIdCounter = 1;
let arpCacheA = false; // Tracks if Host A has resolved Host B's MAC

// Hardware & Protocol Addresses
const MAC_A = "00:50:56:C0:00:0A";        const MAC_A_HEX = "00 50 56 C0 00 0A";
const MAC_B = "00:0C:29:4F:8B:3B";        const MAC_B_HEX = "00 0C 29 4F 8B 3B";
const MAC_BROADCAST = "FF:FF:FF:FF:FF:FF";const MAC_BROADCAST_HEX = "FF FF FF FF FF FF";
const MAC_ZERO = "00:00:00:00:00:00";     const MAC_ZERO_HEX = "00 00 00 00 00 00";

const IP_A = "192.168.1.10";              const IP_A_HEX = "C0 A8 01 0A";
const IP_B = "192.168.1.20";              const IP_B_HEX = "C0 A8 01 14";

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
        if (status === "RESOLVED") {
            el.style.backgroundColor = "var(--accent-blue)";
            el.style.color = "white";
            el.style.borderColor = "var(--accent-blue)";
        } else if (status !== "IDLE") {
            el.style.backgroundColor = "var(--accent-blue-lighter)";
            el.style.color = "var(--accent-blue)";
            el.style.borderColor = "var(--accent-blue)";
        } else {
            el.style.backgroundColor = "var(--bg-body)";
            el.style.color = "var(--text-muted)";
            el.style.borderColor = "var(--border-color)";
        }
    }
}

function updateCacheUI() {
    const cacheEl = document.getElementById('arp-cache-a');
    if (arpCacheA) {
        cacheEl.innerHTML = `${IP_B} &rarr; ${MAC_B}`;
        cacheEl.style.color = 'var(--text-main)';
    } else {
        cacheEl.innerHTML = "Empty";
        cacheEl.style.color = 'var(--text-muted)';
    }
}

function resetSimulation() {
    packets = []; 
    packetIdCounter = 1;
    arpCacheA = false;
    updateCacheUI();
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">No ARP traffic yet.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select an ARP message to inspect.</p>';
    document.getElementById('hex-content').innerHTML = '';
    const btnSend = document.getElementById('btn-send');
    if(btnSend) btnSend.disabled = false;
    updateStatus("IDLE");
}

function toHex(num, padding) { 
    return num.toString(16).toUpperCase().padStart(padding, '0'); 
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runArpScenario() {
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = true;
    
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();

    if (arpCacheA) {
        addTextLog(`Host A already knows MAC for ${IP_B}. Sending direct IP packet.`);
        updateStatus("RESOLVED");
        await sleep(1000);
        if (btnSend) btnSend.disabled = false;
        return;
    }

    updateStatus("RESOLVING...");
    addTextLog(`Host A needs to send to ${IP_B} but MAC is unknown. Consults Address Resolution module.`);

    await sleep(800);
    
    // 1. Send ARP Request (Opcode 1)
    // Target Hardware Address is ignored/unknown, typically zeroes
    buildArpPacket('A->BROADCAST', 1, MAC_A, IP_A, MAC_ZERO, IP_B, MAC_A_HEX, MAC_BROADCAST_HEX, MAC_ZERO_HEX, IP_A_HEX, IP_B_HEX, "ARP Request");
    
    await sleep(1200);
    
    addTextLog(`Host B receives Request, updates its table, and generates Reply.`);
    
    await sleep(800);

    // 2. Send ARP Reply (Opcode 2)
    buildArpPacket('B->A', 2, MAC_B, IP_B, MAC_A, IP_A, MAC_B_HEX, MAC_A_HEX, MAC_A_HEX, IP_B_HEX, IP_A_HEX, "ARP Reply");
    
    await sleep(800);
    
    addTextLog(`Host A receives Reply and caches the mapping.`);
    arpCacheA = true;
    updateCacheUI();
    updateStatus("RESOLVED");

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

function buildArpPacket(dir, op, sha, spa, tha, tpa, ethSrcHex, ethDstHex, thaHex, spaHex, tpaHex, desc) {
    const opHex = toHex(op, 4);
    const opDesc = op === 1 ? "REQUEST (1)" : "REPLY (2)";

    const pkt = {
        id: packetIdCounter++,
        summary: `${dir} ${desc} Who has ${tpa}? Tell ${spa}`,
        fields: [
            // Ethernet Layer
            { id: "eth_dst", label: "Dst MAC", val: op === 1 ? MAC_BROADCAST : MAC_A, hex: ethDstHex, layer: "Ethernet", bits: 48, desc: op === 1 ? "Broadcast address for Request." : "Unicast to requester." },
            { id: "eth_src", label: "Src MAC", val: op === 1 ? MAC_A : MAC_B, hex: ethSrcHex, layer: "Ethernet", bits: 48, desc: "Sender's hardware address." },
            { id: "eth_type", label: "Type", val: "ARP (0x0806)", hex: "08 06", layer: "Ethernet", bits: 16, desc: "Ethertype indicating Address Resolution Protocol." },
            
            // ARP Layer (RFC 826)
            { id: "arp_hrd", label: "Hardware Type (ar$hrd)", val: "Ethernet (1)", hex: "00 01", layer: "ARP", bits: 16, desc: "Indicates Ethernet hardware space." },
            { id: "arp_pro", label: "Protocol Type (ar$pro)", val: "IPv4 (0x0800)", hex: "08 00", layer: "ARP", bits: 16, desc: "Protocol address space (same as Ethertype for IPv4)." },
            { id: "arp_hln", label: "HW Addr Len (ar$hln)", val: "6", hex: "06", layer: "ARP", bits: 8, desc: "Byte length of each hardware address." },
            { id: "arp_pln", label: "Proto Addr Len (ar$pln)", val: "4", hex: "04", layer: "ARP", bits: 8, desc: "Byte length of each protocol address (4 for IPv4)." },
            { id: "arp_op", label: "Opcode (ar$op)", val: opDesc, hex: opHex.replace(/(.{2})/g, "$1 ").trim(), layer: "ARP", bits: 16, desc: "1 for REQUEST, 2 for REPLY." },
            { id: "arp_sha", label: "Sender HW Addr (ar$sha)", val: sha, hex: ethSrcHex, layer: "ARP", bits: 48, desc: "Hardware address of sender." },
            { id: "arp_spa", label: "Sender Proto Addr (ar$spa)", val: spa, hex: spaHex, layer: "ARP", bits: 32, desc: "Protocol address of sender." },
            { id: "arp_tha", label: "Target HW Addr (ar$tha)", val: tha, hex: thaHex, layer: "ARP", bits: 48, desc: op === 1 ? "Target hardware address (ignored/zero in request)." : "Target hardware address being replied to." },
            { id: "arp_tpa", label: "Target Proto Addr (ar$tpa)", val: tpa, hex: tpaHex, layer: "ARP", bits: 32, desc: "Protocol address of target." }
        ]
    };

    if (op === 2) {
        pkt.summary = `${dir} ${desc} ${spa} is at ${sha}`;
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
        
        if (layerName === "ARP") {
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
            
            // Render 48-bit MAC addresses as full width to avoid breaking the 32-bit ruler grid logic nicely
            const widthPct = (field.bits === 48 || layerName === "Ethernet") ? 100 : (field.bits / 32) * 100;
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