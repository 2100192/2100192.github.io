let clientState = 'CLOSED';
let serverState = 'CLOSED';

let seqClient = 0;
let seqServer = 0;
let packets = [];
let packetIdCounter = 1;

const FLAGS = { FIN: 0x01, SYN: 0x02, RST: 0x04, PSH: 0x08, ACK: 0x10, URG: 0x20 };
const MAC_A = "00:1a:2b:3c:4d:5e"; const MAC_A_HEX = "00 1A 2B 3C 4D 5E";
const MAC_B = "00:5e:4d:3c:2b:1a"; const MAC_B_HEX = "00 5E 4D 3C 2B 1A";
const IP_A = "10.0.0.50";          const IP_A_HEX = "0A 00 00 32";
const IP_B = "203.0.113.10";       const IP_B_HEX = "CB 00 71 0A";
const PORT_A = 50000;              const PORT_A_HEX = "C3 50";
const PORT_B = 80;                 const PORT_B_HEX = "00 50";

document.addEventListener('click', () => {
    const balloon = document.getElementById('floating-balloon');
    if(balloon) balloon.style.display = 'none';
});

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('btn-theme');
    if (document.body.classList.contains('dark-mode')) {
        btn.innerText = '☀️ Light Mode';
    } else {
        btn.innerText = '🌙 Dark Mode';
    }
}

function updateUI() {
    document.getElementById('client-state').innerText = clientState;
    document.getElementById('server-state').innerText = serverState;
    
    document.getElementById('btn-active-open').disabled = clientState !== 'CLOSED';
    document.getElementById('btn-passive-open').disabled = serverState !== 'CLOSED';
    
    document.getElementById('btn-send-data').disabled = clientState !== 'ESTABLISHED';
    
    document.getElementById('btn-client-close').disabled = clientState !== 'ESTABLISHED';
    document.getElementById('btn-server-close').disabled = !(serverState === 'LISTEN' || serverState === 'ESTABLISHED');

    const clientIpEl = document.getElementById('client-ip');
    const serverIpEl = document.getElementById('server-ip');

    if (['ESTABLISHED', 'FIN-WAIT-1', 'FIN-WAIT-2', 'TIME-WAIT', 'SYN-SENT', 'CLOSE-WAIT', 'LAST-ACK'].includes(clientState)) {
        clientIpEl.innerText = "(10.0.0.50:50000)";
    } else {
        clientIpEl.innerText = "";
    }

    if (serverState !== 'CLOSED') {
        serverIpEl.innerText = "(203.0.113.10:80)";
    } else {
        serverIpEl.innerText = "";
    }
}

function resetSimulation() {
    clientState = 'CLOSED'; serverState = 'CLOSED';
    seqClient = 0; seqServer = 0; packets = []; packetIdCounter = 1;
    document.getElementById('packet-list').innerHTML = '<p id="empty-log-msg" class="empty-msg">Traffic log is empty.</p>';
    document.getElementById('diagram-content').innerHTML = '<p class="empty-msg">Select a packet to inspect.</p>';
    document.getElementById('hex-content').innerHTML = '';
    document.getElementById('floating-balloon').style.display = 'none';
    updateUI();
}

function toHex(num, padding) { return num.toString(16).padStart(padding, '0').toUpperCase(); }

function getFlagsString(flags) {
    let s = [];
    if(flags & FLAGS.SYN) s.push("SYN"); if(flags & FLAGS.ACK) s.push("ACK");
    if(flags & FLAGS.PSH) s.push("PSH"); if(flags & FLAGS.FIN) s.push("FIN");
    if(flags & FLAGS.RST) s.push("RST");
    return s.join(", ");
}

function getFlagsDesc(flags) {
    let desc = "Active Control Flags:\n";
    if(flags & FLAGS.SYN) desc += "• SYN: Synchronize sequence numbers to initiate a connection.\n";
    if(flags & FLAGS.ACK) desc += "• ACK: Indicates that the Acknowledgment field is significant and valid.\n";
    if(flags & FLAGS.PSH) desc += "• PSH: Push function. Asks to push the buffered data to the receiving application.\n";
    if(flags & FLAGS.FIN) desc += "• FIN: No more data from sender. Closes the connection.\n";
    if(flags & FLAGS.RST) desc += "• RST: Reset the connection immediately.\n";
    return desc.trim();
}

function buildPacket(direction, seq, ack, flags, payloadHex = "", payloadAscii = "", payloadLen = 0) {
    let srcMac, dstMac, srcMacHex, dstMacHex, srcIp, dstIp, srcIpHex, dstIpHex, srcPort, dstPort, srcPortHex, dstPortHex;

    if (direction === 'A->B') {
        srcMac = MAC_A; dstMac = MAC_B; srcMacHex = MAC_A_HEX; dstMacHex = MAC_B_HEX;
        srcIp = IP_A; dstIp = IP_B; srcIpHex = IP_A_HEX; dstIpHex = IP_B_HEX;
        srcPort = PORT_A; dstPort = PORT_B; srcPortHex = PORT_A_HEX; dstPortHex = PORT_B_HEX;
    } else {
        srcMac = MAC_B; dstMac = MAC_A; srcMacHex = MAC_B_HEX; dstMacHex = MAC_A_HEX;
        srcIp = IP_B; dstIp = IP_A; srcIpHex = IP_B_HEX; dstIpHex = IP_A_HEX;
        srcPort = PORT_B; dstPort = PORT_A; srcPortHex = PORT_B_HEX; dstPortHex = PORT_A_HEX;
    }

    const ipTotalLen = 40 + payloadLen; 
    const ipTotalLenHex = toHex(ipTotalLen, 4);
    const flagStr = getFlagsString(flags);
    const flagsDesc = getFlagsDesc(flags);
    const summary = `${direction} [${flagStr}] Seq=${seq} Ack=${ack} Len=${payloadLen}`;

    let seqDesc = `Value: ${seq}\n`;
    if (flags & FLAGS.SYN) {
        seqDesc += "This is the Initial Sequence Number (ISN) generated for connection synchronization. By protocol rules, the SYN flag consumes 1 byte of sequence space.";
    } else {
        seqDesc += `Identifies the first byte of data in this segment. Since the start of the connection, ${seq > 0 ? seq - 1 : 0} logical bytes of sequence space have been consumed.`;
    }

    let ackDesc = `Value: ${ack}\n`;
    if (flags & FLAGS.ACK) {
        ackDesc += `The sender is acknowledging the successful receipt of all bytes up to ${ack > 0 ? ack - 1 : 0}, and is expecting to receive byte number ${ack} next.`;
    } else {
        ackDesc += `This field is currently ignored because the ACK flag is not set in the control bits.`;
    }

    const pkt = {
        id: packetIdCounter++, summary: summary,
        fields: [
            { id: "eth_dst", label: "Dst MAC", val: dstMac, hex: dstMacHex, layer: "Ethernet", bits: 48, desc: "Destination physical address." },
            { id: "eth_src", label: "Src MAC", val: srcMac, hex: srcMacHex, layer: "Ethernet", bits: 48, desc: "Source physical address." },
            { id: "eth_type", label: "Type", val: "IPv4 (0x0800)", hex: "08 00", layer: "Ethernet", bits: 16, desc: "Payload protocol type." },
            
            { id: "ip_vhl", label: "Ver/IHL", val: "45", hex: "45", layer: "IPv4", bits: 8, desc: "IPv4 Version (4 bits) and Internet Header Length (4 bits)." },
            { id: "ip_tos", label: "TOS", val: "00", hex: "00", layer: "IPv4", bits: 8, desc: "Type of Service / Differentiated Services." },
            { id: "ip_len", label: "Total Length", val: ipTotalLen.toString(), hex: ipTotalLenHex.substring(0,2) + " " + ipTotalLenHex.substring(2,4), layer: "IPv4", bits: 16, desc: "Total length of the IP datagram (header + data)." },
            { id: "ip_id", label: "Identification", val: "0xa10e", hex: "A1 0E", layer: "IPv4", bits: 16, desc: "Used for uniquely identifying fragments." },
            { id: "ip_flags", label: "Flags/Frag", val: "0x4000 (DF)", hex: "40 00", layer: "IPv4", bits: 16, desc: "Control flags and Fragment Offset." },
            { id: "ip_ttl", label: "TTL", val: "128", hex: "80", layer: "IPv4", bits: 8, desc: "Time to Live. Prevents infinite routing loops." },
            { id: "ip_proto", label: "Protocol", val: "TCP (6)", hex: "06", layer: "IPv4", bits: 8, desc: "Protocol used in the data portion of the IP datagram." },
            { id: "ip_chk", label: "Checksum", val: "0x7bc1", hex: "7B C1", layer: "IPv4", bits: 16, desc: "Error-checking for the IP header." },
            { id: "ip_src", label: "Src IP", val: srcIp, hex: srcIpHex, layer: "IPv4", bits: 32, desc: "Source logical address." },
            { id: "ip_dst", label: "Dst IP", val: dstIp, hex: dstIpHex, layer: "IPv4", bits: 32, desc: "Destination logical address." },
            
            { id: "tcp_sport", label: "Src Port", val: srcPort.toString(), hex: srcPortHex, layer: "TCP", bits: 16, desc: "Source logical port number." },
            { id: "tcp_dport", label: "Dst Port", val: dstPort.toString(), hex: dstPortHex, layer: "TCP", bits: 16, desc: "Destination logical port number." },
            { id: "tcp_seq", label: "Sequence Number", val: seq.toString(), hex: toHex(seq, 8).replace(/(.{2})/g, "$1 ").trim(), layer: "TCP", bits: 32, desc: seqDesc },
            { id: "tcp_ack", label: "Acknowledgment Num", val: ack.toString(), hex: toHex(ack, 8).replace(/(.{2})/g, "$1 ").trim(), layer: "TCP", bits: 32, desc: ackDesc },
            { id: "tcp_off_flags", label: "Offset/Flags", val: `0x50${toHex(flags, 2)} (${flagStr})`, hex: `50 ${toHex(flags, 2)}`, layer: "TCP", bits: 16, desc: `Header Length (4 bits) + Reserved (4 bits) + Flags (8 bits).\n\n${flagsDesc}` },
            { id: "tcp_win", label: "Window", val: "8192", hex: "20 00", layer: "TCP", bits: 16, desc: "Number of bytes the sender is currently willing to receive." },
            { id: "tcp_chk", label: "Checksum", val: "0x0000", hex: "00 00", layer: "TCP", bits: 16, desc: "Error-checking for TCP header and payload." },
            { id: "tcp_urg", label: "Urgent Ptr", val: "0", hex: "00 00", layer: "TCP", bits: 16, desc: "Points to the sequence number indicating the end of urgent data." }
        ]
    };

    if (payloadLen > 0) pkt.fields.push({ id: "payload", label: "Payload Data", val: payloadAscii, hex: payloadHex, layer: "Data", bits: payloadLen * 8, desc: "Application layer data." });

    packets.push(pkt);
    renderPacketList();
}

function renderPacketList() {
    const listEl = document.getElementById('packet-list');
    const emptyMsg = document.getElementById('empty-log-msg');
    if(emptyMsg) emptyMsg.remove();
    
    const pkt = packets[packets.length - 1];
    const div = document.createElement('div');
    div.className = 'packet-row';
    div.innerText = `${pkt.id}. ${pkt.summary}`;
    div.onclick = () => loadPacket(pkt.id, div);
    listEl.appendChild(div);
    listEl.scrollTop = listEl.scrollHeight;
    loadPacket(pkt.id, div);
}

function passiveOpen() { if(serverState === 'CLOSED') { serverState = 'LISTEN'; updateUI(); } }

function activeOpen() {
    clientState = 'SYN-SENT';
    seqClient = 1; 
    buildPacket('A->B', seqClient, 0, FLAGS.SYN);
    updateUI();
    
    setTimeout(() => {
        if(serverState === 'CLOSED') {
            buildPacket('B->A', 0, seqClient + 1, FLAGS.RST | FLAGS.ACK);
            setTimeout(() => { clientState = 'CLOSED'; updateUI(); }, 400);
        } else if(serverState === 'LISTEN') {
            serverState = 'SYN-RECEIVED';
            seqServer = 100;
            buildPacket('B->A', seqServer, seqClient + 1, FLAGS.SYN | FLAGS.ACK);
            updateUI();
            
            setTimeout(() => {
                clientState = 'ESTABLISHED';
                seqClient++;
                buildPacket('A->B', seqClient, seqServer + 1, FLAGS.ACK);
                setTimeout(() => { serverState = 'ESTABLISHED'; seqServer++; updateUI(); }, 400);
            }, 400);
        }
    }, 500);
}

function sendData() {
    const payloadHex = "48 65 6c 6c 6f 20 77 6f 72 6c 64 21"; 
    const payloadAscii = "Hello world!";
    const bytesSent = 12;
    
    buildPacket('A->B', seqClient, seqServer, FLAGS.PSH | FLAGS.ACK, payloadHex, payloadAscii, bytesSent);
    
    setTimeout(() => {
        seqClient += bytesSent; 
        buildPacket('B->A', seqServer, seqClient, FLAGS.ACK);
    }, 500);
}

function clientClose() {
    if (clientState !== 'ESTABLISHED') return;
    
    clientState = 'FIN-WAIT-1';
    buildPacket('A->B', seqClient, seqServer, FLAGS.FIN | FLAGS.ACK);
    updateUI();

    setTimeout(() => {
        serverState = 'CLOSE-WAIT';
        seqClient++; 
        buildPacket('B->A', seqServer, seqClient, FLAGS.ACK);
        updateUI();

        setTimeout(() => {
            clientState = 'FIN-WAIT-2'; 
            updateUI();
            
            setTimeout(() => {
                serverState = 'LAST-ACK';
                buildPacket('B->A', seqServer, seqClient, FLAGS.FIN | FLAGS.ACK);
                updateUI();

                setTimeout(() => {
                    clientState = 'TIME-WAIT';
                    seqServer++; 
                    buildPacket('A->B', seqClient, seqServer, FLAGS.ACK);
                    updateUI();

                    setTimeout(() => { 
                        serverState = 'CLOSED'; 
                        clientState = 'CLOSED'; 
                        updateUI(); 
                    }, 800);
                }, 500);
            }, 600);
        }, 400);
    }, 500);
}

function serverClose() {
    if (serverState === 'LISTEN') {
        serverState = 'CLOSED';
        updateUI();
    } else if (serverState === 'ESTABLISHED') {
        serverState = 'FIN-WAIT-1';
        buildPacket('B->A', seqServer, seqClient, FLAGS.FIN | FLAGS.ACK);
        updateUI();

        setTimeout(() => {
            clientState = 'CLOSE-WAIT';
            seqServer++; 
            buildPacket('A->B', seqClient, seqServer, FLAGS.ACK);
            updateUI();

            setTimeout(() => {
                serverState = 'FIN-WAIT-2'; 
                updateUI();
                
                setTimeout(() => {
                    clientState = 'LAST-ACK';
                    buildPacket('A->B', seqClient, seqServer, FLAGS.FIN | FLAGS.ACK);
                    updateUI();

                    setTimeout(() => {
                        serverState = 'TIME-WAIT';
                        seqClient++; 
                        buildPacket('B->A', seqServer, seqClient, FLAGS.ACK);
                        updateUI();

                        setTimeout(() => { 
                            clientState = 'CLOSED'; 
                            serverState = 'CLOSED'; 
                            updateUI(); 
                        }, 800);
                    }, 500);
                }, 600);
            }, 400);
        }, 500);
    }
}

function showFieldInfo(event, label, val, desc) {
    event.stopPropagation();
    const balloon = document.getElementById('floating-balloon');
    document.getElementById('balloon-title').innerText = `${label} (${val})`;
    document.getElementById('balloon-desc').innerText = desc;
    
    balloon.style.display = 'block';
    
    const rect = event.currentTarget.getBoundingClientRect();
    balloon.style.left = (rect.left + rect.width / 2) + 'px';
    balloon.style.top = rect.top + 'px';
}

function loadPacket(id, rowElement) {
    document.querySelectorAll('.packet-row').forEach(el => el.classList.remove('active'));
    if(rowElement) rowElement.classList.add('active');
    document.getElementById('floating-balloon').style.display = 'none';

    const pkt = packets.find(p => p.id === id);
    if(!pkt) return;
    
    const container = document.getElementById('diagram-content');
    container.innerHTML = '';
    const layers = [...new Set(pkt.fields.map(f => f.layer))];

    layers.forEach(layerName => {
        const layerDiv = document.createElement('div');
        layerDiv.className = 'protocol-layer';
        layerDiv.innerHTML = `<div class="layer-title">${layerName}</div>`;
        
        if (layerName === 'IPv4' || layerName === 'TCP') {
            const ruler = document.createElement('div');
            ruler.className = 'bit-ruler';
            ruler.innerHTML = `<span style="left:0%;">0</span><span style="left:12.5%;">4</span><span style="left:25%;">8</span><span style="left:50%;">16</span><span style="left:75%;">24</span><span style="left:100%;">31</span>`;
            layerDiv.appendChild(ruler);
        }

        const gridDiv = document.createElement('div');
        gridDiv.className = 'field-grid';

        pkt.fields.filter(f => f.layer === layerName).forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field';
            fieldDiv.id = `diagram-field-${field.id}`;
            
            const widthPct = layerName === 'Ethernet' || layerName === 'Data' ? 100 : (field.bits / 32) * 100;
            fieldDiv.style.width = `${widthPct}%`;
            
            fieldDiv.onclick = (e) => showFieldInfo(e, field.label, field.val, field.desc);
            
            fieldDiv.innerHTML = `<span class="field-label">${field.label}</span><span class="field-val">${field.val}</span>`;
            fieldDiv.onmouseenter = () => highlightField(field.id);
            fieldDiv.onmouseleave = () => unhighlightField(field.id);
            gridDiv.appendChild(fieldDiv);
        });
        layerDiv.appendChild(gridDiv);
        container.appendChild(layerDiv);
    });

    const hexContainer = document.getElementById('hex-content');
    hexContainer.innerHTML = '';
    let allBytes = [];
    pkt.fields.forEach(f => {
        const cleanHex = f.hex.replace(/\s+/g, '');
        for(let i=0; i < cleanHex.length; i+=2) {
            const dec = parseInt(cleanHex.substring(i, i+2), 16);
            allBytes.push({ hex: cleanHex.substring(i, i+2), ascii: (dec >= 32 && dec <= 126) ? String.fromCharCode(dec) : '.', fieldId: f.id });
        }
    });

    for(let i=0; i < allBytes.length; i += 16) {
        const row = document.createElement('div');
        row.className = 'hex-row';
        row.innerHTML = `<div class="hex-offset">${i.toString(16).padStart(4, '0')}</div>`;
        
        const hexBytes = document.createElement('div'); hexBytes.className = 'hex-bytes';
        const asciiChars = document.createElement('div'); asciiChars.className = 'hex-ascii';

        allBytes.slice(i, i + 16).forEach(b => {
            const bSpan = document.createElement('span'); bSpan.className = `byte byte-${b.fieldId}`; bSpan.innerText = b.hex;
            bSpan.onmouseenter = () => highlightField(b.fieldId); bSpan.onmouseleave = () => unhighlightField(b.fieldId);
            
            const targetField = pkt.fields.find(f => f.id === b.fieldId);
            bSpan.onclick = (e) => { 
                if(targetField) {
                    const diagField = document.getElementById(`diagram-field-${b.fieldId}`);
                    if(diagField) {
                        const rect = diagField.getBoundingClientRect();
                        const ev = { currentTarget: diagField, stopPropagation: () => e.stopPropagation() };
                        showFieldInfo(ev, targetField.label, targetField.val, targetField.desc);
                    }
                }
            };
            
            hexBytes.appendChild(bSpan);

            const aSpan = document.createElement('span'); aSpan.className = `ascii-char ascii-${b.fieldId}`; aSpan.innerText = b.ascii;
            aSpan.onmouseenter = () => highlightField(b.fieldId); aSpan.onmouseleave = () => unhighlightField(b.fieldId);
            aSpan.onclick = bSpan.onclick;
            asciiChars.appendChild(aSpan);
        });
        row.appendChild(hexBytes); row.appendChild(asciiChars);
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