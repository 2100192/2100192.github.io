let packets = [];
let packetIdCounter = 1;

// Simulated Network Configurations
const MAC_SRC = "00:1A:2B:3C:4D:5E"; const MAC_SRC_HEX = "00 1A 2B 3C 4D 5E";
const MAC_DST = "00:50:56:C0:00:01"; const MAC_DST_HEX = "00 50 56 C0 00 01";
const IP_SRC = "192.168.1.10";       const IP_SRC_HEX = "C0 A8 01 0A";
const IP_DST = "8.8.8.8";            const IP_DST_HEX = "08 08 08 08";

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
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">No UDP traffic yet.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select a UDP datagram to inspect.</p>';
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

async function sendUdpDatagram() {
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = true;
    
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();

    const sPort = parseInt(document.getElementById('input-sport').value) || 5353;
    const dPort = parseInt(document.getElementById('input-dport').value) || 53;
    const payloadTxt = document.getElementById('input-data').value || "Data";
    const dropRate = parseInt(document.getElementById('input-drop-rate').value);

    updateStatus("TRANSMITTING");
    
    // Simulate network transmission delay
    await sleep(400);

    // Determine if the packet is lost based on the drop rate
    const isLost = (Math.random() * 100) < dropRate;

    if (isLost) {
        updateStatus("PACKET LOST", true);
        addErrorLog(`❌ DROP: UDP Datagram from port ${sPort} to ${dPort} lost in transit. (No retransmission)`);
    } else {
        updateStatus("DELIVERED");
        buildUdpPacket(sPort, dPort, payloadTxt);
    }

    setTimeout(() => {
        if(document.getElementById('net-status').innerText !== "PACKET LOST") {
             updateStatus("IDLE");
        }
    }, 1500);

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

function buildUdpPacket(sPort, dPort, payloadTxt) {
    const sPortHex = toHex(sPort, 4).replace(/(.{2})/g, "$1 ").trim();
    const dPortHex = toHex(dPort, 4).replace(/(.{2})/g, "$1 ").trim();
    
    const payloadBytes = payloadTxt.length;
    const payloadHex = strToHex(payloadTxt);
    
    // UDP Length = Header (8 bytes) + Payload length
    const udpLength = 8 + payloadBytes;
    const udpLengthHex = toHex(udpLength, 4).replace(/(.{2})/g, "$1 ").trim();
    
    // IP Total Length = IPv4 Header (20 bytes) + UDP Length
    const ipTotalLen = 20 + udpLength;

    const pkt = {
        id: packetIdCounter++,
        summary: `UDP A->B | SrcPort: ${sPort} | DstPort: ${dPort} | Len: ${udpLength}`,
        fields: [
            // Ethernet Layer
            { id: "eth_dst", label: "Dst MAC", val: MAC_DST, hex: MAC_DST_HEX, layer: "Ethernet", bits: 48, desc: "Destination physical address." },
            { id: "eth_src", label: "Src MAC", val: MAC_SRC, hex: MAC_SRC_HEX, layer: "Ethernet", bits: 48, desc: "Source physical address." },
            { id: "eth_typ", label: "Type", val: "IPv4 (0x0800)", hex: "08 00", layer: "Ethernet", bits: 16, desc: "Ethertype indicating IPv4." },
            
            // IPv4 Layer
            { id: "ip_vhl", label: "Ver/IHL", val: "45", hex: "45", layer: "IPv4", bits: 8, desc: "IPv4 Version 4, Header Length 20 bytes." },
            { id: "ip_tos", label: "TOS", val: "00", hex: "00", layer: "IPv4", bits: 8, desc: "Type of Service." },
            { id: "ip_len", label: "Total Length", val: ipTotalLen.toString(), hex: toHex(ipTotalLen, 4).replace(/(.{2})/g, "$1 ").trim(), layer: "IPv4", bits: 16, desc: "Length of IP header and data." },
            { id: "ip_id", label: "ID", val: "0x1A2B", hex: "1A 2B", layer: "IPv4", bits: 16, desc: "Identification for fragmentation." },
            { id: "ip_frag", label: "Flags/Off", val: "0x0000", hex: "00 00", layer: "IPv4", bits: 16, desc: "Fragmentation control." },
            { id: "ip_ttl", label: "TTL", val: "64", hex: "40", layer: "IPv4", bits: 8, desc: "Time to Live." },
            { id: "ip_pro", label: "Protocol", val: "17 (UDP)", hex: "11", layer: "IPv4", bits: 8, desc: "Indicates UDP payload (Protocol 17)." },
            { id: "ip_chk", label: "Checksum", val: "0xFE21", hex: "FE 21", layer: "IPv4", bits: 16, desc: "IP Header checksum." },
            { id: "ip_src", label: "Src IP", val: IP_SRC, hex: IP_SRC_HEX, layer: "IPv4", bits: 32, desc: "Source IP address." },
            { id: "ip_dst", label: "Dst IP", val: IP_DST, hex: IP_DST_HEX, layer: "IPv4", bits: 32, desc: "Destination IP address." },
            
            // UDP Layer (RFC 768)
            { id: "udp_sport", label: "Source Port", val: sPort.toString(), hex: sPortHex, layer: "UDP", bits: 16, desc: "Optional field. Indicates the port of the sending process. If not used, a value of zero is inserted." },
            { id: "udp_dport", label: "Destination Port", val: dPort.toString(), hex: dPortHex, layer: "UDP", bits: 16, desc: "Has a meaning within the context of a particular internet destination address." },
            { id: "udp_len", label: "Length", val: udpLength.toString(), hex: udpLengthHex, layer: "UDP", bits: 16, desc: "The length in octets of this user datagram including this header and the data. Minimum value is 8." },
            { id: "udp_chk", label: "Checksum", val: "0xA1B2", hex: "A1 B2", layer: "UDP", bits: 16, desc: "Pseudo-header checksum to verify integrity. Optional in IPv4 (can be all zeros), mandatory in IPv6." },
            
            // Payload
            { id: "udp_data", label: "Data Octets", val: payloadTxt, hex: payloadHex, layer: "Data", bits: payloadBytes * 8, desc: "The application data carried by the datagram. Delivery is not guaranteed." }
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
        
        if (layerName === "IPv4" || layerName === "UDP") {
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
            
            // Width based on bit count
            let widthPct = (field.bits / 32) * 100;
            if (field.bits >= 32 || layerName === "Ethernet" || layerName === "Data") {
                widthPct = 100;
            }
            
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