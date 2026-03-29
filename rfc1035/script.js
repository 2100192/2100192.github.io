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

function updateStatus(status) {
    const el = document.getElementById('net-status');
    if(el) {
        el.innerText = status;
        if (status === "RESOLVING") {
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

function resetSimulation() {
    packets = []; 
    packetIdCounter = 1;
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">No DNS traffic recorded.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select a DNS message to inspect.</p>';
    document.getElementById('hex-content').innerHTML = '';
    const btnSend = document.getElementById('btn-send');
    if(btnSend) btnSend.disabled = false;
    updateStatus("IDLE");
}

function toHex(num, padding) { 
    return num.toString(16).toUpperCase().padStart(padding, '0'); 
}

// Converts a domain like "www.example.com" to DNS format: 03 w w w 07 e x a m p l e 03 c o m 00
function encodeDomainName(domain) {
    if (!domain) domain = "example.com";
    let hexStr = "";
    let byteLength = 0;
    const parts = domain.split('.');
    
    for (let part of parts) {
        if (part.length === 0) continue;
        hexStr += toHex(part.length, 2) + " ";
        byteLength++;
        for (let i = 0; i < part.length; i++) {
            hexStr += toHex(part.charCodeAt(i), 2) + " ";
            byteLength++;
        }
    }
    hexStr += "00"; // Null terminator for the root zone
    byteLength++;
    
    return { hex: hexStr.trim(), length: byteLength };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runDnsQuery() {
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = true;
    
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();

    let domain = document.getElementById('input-domain').value.trim().toLowerCase();
    if (!domain) domain = "example.com";
    const qtype = parseInt(document.getElementById('input-qtype').value);
    
    const transactionId = Math.floor(Math.random() * 65535);

    updateStatus("RESOLVING");
    addTextLog(`Resolver queries Local DNS Server for ${domain} (Type: ${getQtypeName(qtype)}).`);

    // 1. Client to DNS Server (Standard Query)
    buildDnsPacket("Client -> Server", "Standard query", transactionId, domain, qtype, true);
    
    await sleep(800);
    
    addTextLog(`DNS Server replies with Answer.`);
    
    // 2. DNS Server to Client (Standard Response)
    buildDnsPacket("Server -> Client", "Standard query response", transactionId, domain, qtype, false);

    updateStatus("RESOLVED");
    if (btnSend) btnSend.disabled = false;
}

function getQtypeName(qtype) {
    const types = { 1: "A", 2: "NS", 5: "CNAME", 15: "MX" };
    return types[qtype] || "UNKNOWN";
}

function getFakeRdata(qtype) {
    if (qtype === 1) return { val: "93.184.216.34", hex: "5D B8 D8 22", len: "00 04", desc: "A 32-bit Internet address (IPv4)." };
    if (qtype === 2) return { val: "ns1.example.com", hex: "03 6E 73 31 C0 0C", len: "00 06", desc: "A host name which specifies a host which should be authoritative for the specified class and domain." };
    if (qtype === 5) return { val: "alias.example.com", hex: "05 61 6C 69 61 73 C0 0C", len: "00 08", desc: "A domain name which specifies the canonical or primary name for the owner." };
    if (qtype === 15) return { val: "Preference: 10, mail.example.com", hex: "00 0A 04 6D 61 69 6C C0 0C", len: "00 09", desc: "A 16-bit preference and a host name willing to act as a mail exchange for the owner name." };
    return { val: "0.0.0.0", hex: "00 00 00 00", len: "00 04", desc: "Unknown record data." };
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

function buildDnsPacket(dir, summary, id, domain, qtype, isQuery) {
    const idHex = toHex(id, 4);
    const qtypeHex = toHex(qtype, 4);
    const qtypeName = getQtypeName(qtype);
    const encodedDomain = encodeDomainName(domain);
    
    let flagsHex = "01 00"; // Standard query, Recursion Desired
    let flagsDesc = "QR=0 (Query), OPCODE=0 (Standard Query), RD=1 (Recursion Desired).";
    let ancount = "00 00";
    let ancountVal = "0";
    
    if (!isQuery) {
        flagsHex = "81 80"; // Response, Recursion Desired, Recursion Available, No Error
        flagsDesc = "QR=1 (Response), OPCODE=0 (Standard), AA=0, TC=0, RD=1, RA=1, Z=0, RCODE=0 (No Error).";
        ancount = "00 01";
        ancountVal = "1";
    }

    let fields = [
        // UDP Wrapper
        { id: "udp_wrapper", label: "UDP Transport", val: isQuery ? "Port xxxxx -> 53" : "Port 53 -> xxxxx", hex: isQuery ? "DF 4A 00 35" : "00 35 DF 4A", layer: "UDP", bits: 32, desc: "DNS queries primarily use UDP port 53." },
        
        // DNS Header (12 bytes)
        { id: "dns_id", label: "Transaction ID", val: `0x${idHex}`, hex: idHex.replace(/(.{2})/g, "$1 ").trim(), layer: "DNS Header", bits: 16, desc: "A 16-bit identifier assigned by the program that generates any kind of query. This identifier is copied the corresponding reply and can be used by the requester to match up replies to outstanding queries." },
        { id: "dns_flags", label: "Flags", val: isQuery ? "0x0100" : "0x8180", hex: flagsHex, layer: "DNS Header", bits: 16, desc: flagsDesc },
        { id: "dns_qdcount", label: "Questions", val: "1", hex: "00 01", layer: "DNS Header", bits: 16, desc: "Number of entries in the question section." },
        { id: "dns_ancount", label: "Answer RRs", val: ancountVal, hex: ancount, layer: "DNS Header", bits: 16, desc: "Number of resource records in the answer section." },
        { id: "dns_nscount", label: "Authority RRs", val: "0", hex: "00 00", layer: "DNS Header", bits: 16, desc: "Number of name server resource records in the authority records section." },
        { id: "dns_arcount", label: "Additional RRs", val: "0", hex: "00 00", layer: "DNS Header", bits: 16, desc: "Number of resource records in the additional records section." },
        
        // DNS Question Section
        { id: "dns_qname", label: "QNAME", val: domain, hex: encodedDomain.hex, layer: "DNS Question", bits: encodedDomain.length * 8, desc: "A domain name represented as a sequence of labels, where each label consists of a length octet followed by that number of octets. The domain name terminates with the zero length octet for the null label of the root." },
        { id: "dns_qtype", label: "QTYPE", val: `${qtypeName} (${qtype})`, hex: qtypeHex.replace(/(.{2})/g, "$1 ").trim(), layer: "DNS Question", bits: 16, desc: "A two octet code which specifies the type of the query." },
        { id: "dns_qclass", label: "QCLASS", val: "IN (1)", hex: "00 01", layer: "DNS Question", bits: 16, desc: "A two octet code that specifies the class of the query. IN stands for the Internet." }
    ];

    if (!isQuery) {
        const rdata = getFakeRdata(qtype);
        
        // DNS Answer Section
        // Using Message Compression: 0xC00C is a pointer to offset 12 (the start of the QNAME in the packet)
        fields.push(
            { id: "dns_aname", label: "Name (Pointer)", val: domain, hex: "C0 0C", layer: "DNS Answer", bits: 16, desc: "Message Compression: The pointer 0xC00C specifies an offset of 12 bytes from the start of the DNS header, pointing directly to the QNAME already provided in the Question section." },
            { id: "dns_atype", label: "Type", val: `${qtypeName} (${qtype})`, hex: qtypeHex.replace(/(.{2})/g, "$1 ").trim(), layer: "DNS Answer", bits: 16, desc: "Two octets containing one of the RR type codes." },
            { id: "dns_aclass", label: "Class", val: "IN (1)", hex: "00 01", layer: "DNS Answer", bits: 16, desc: "Two octets which specify the class of the data in the RDATA field." },
            { id: "dns_attl", label: "TTL", val: "300 seconds", hex: "00 00 01 2C", layer: "DNS Answer", bits: 32, desc: "A 32-bit signed integer that specifies the time interval (in seconds) that the resource record may be cached before it should be discarded." },
            { id: "dns_ardlen", label: "RDLENGTH", val: parseInt(rdata.len.replace(' ', ''), 16).toString(), hex: rdata.len, layer: "DNS Answer", bits: 16, desc: "An unsigned 16-bit integer that specifies the length in octets of the RDATA field." },
            { id: "dns_ardata", label: "RDATA", val: rdata.val, hex: rdata.hex, layer: "DNS Answer", bits: (rdata.hex.replace(/\s+/g, '').length / 2) * 8, desc: rdata.desc }
        );
    }

    const pkt = {
        id: packetIdCounter++,
        summary: `${dir} [${summary} 0x${idHex} - ${qtypeName} ${domain}]`,
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
        
        if (layerName.startsWith("DNS")) {
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
            
            // Layout widths based on bit count
            let widthPct = (field.bits / 32) * 100;
            // Cap variable-length fields (like QNAME) to look visually correct without breaking grid math
            if (widthPct > 100 || field.id === "dns_qname" || field.id === "dns_ardata" || layerName === "UDP") {
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