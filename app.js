// ===================================    Module    ====================================
require('dotenv').config();

const { Client } = require('whatsapp-web.js');
const { google } = require('googleapis');

const qrcode = require('qrcode-terminal');
const qr = require('qrcode');
const express = require('express');
const fs = require('fs').promises;
const axios = require('axios');
const FormData = require('form-data');

// Define log severity levels
const LOG_LEVELS = {
    INFO: 'INFO',
    WARNING: 'WARNING',
    ERROR: 'ERROR',
};

// Google Sheet Environment
const serviceAccountKeyFile = "./doraymon-ff6b0213a80d.json";
const sheetIdCAPA = process.env.SHEET_ID_CAPA;
const tabCapa = " CAPA";
const tabPhone = "PHONENUMBER";


// =================================    WHATSAPP    ====================================
const app = express();

const client = new Client({
    puppeteer: {
        headless: true,
        args: ['--no-sandbox'],
    }
});

// Create a flag to track whether the client is already initialized
let isClientInitialized = false;
// initializeClient();

// Create an endpoint to initialize the client
app.get('/initialize', (req, res) => {
    if (isClientInitialized) {
        res.send('Client is already initialized');
    } else {
        initializeClient();
        res.send('Client initialized');
    }
});

// Initialize the client
function initializeClient() {
    if (!isClientInitialized) {
        client.initialize();
        log('Doraymon: initialize client WhatsApp', LOG_LEVELS.INFO);
        sendLogTelegram('Doraymon: [' + LOG_LEVELS.INFO + '] <b> initialize client WhatsApp </b>');
        isClientInitialized = true;
    }
}

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
});

client.on('qr', async (qr) => {
    try {
        // Generate the QR code as an image
        const qrCodeImage = await generateQRCode(qr);
        // Send the QR code image to Telegram
        sendQRCodeToTelegram(qrCodeImage);
    } catch (error) {
        log('Doraymon: generate QRCode\n' + error, LOG_LEVELS.ERROR);
        sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] Generate QRCode\n' + error);
    }
});

client.on('authenticated', () => {
    log('Doraymon: WhatsApp authenticated', LOG_LEVELS.INFO);
    sendLogTelegram('Doraymon: [' + LOG_LEVELS.INFO + '] <b> WhatsApp authenticated </b>');
});

client.on('auth_failure', msg => {
    log(`Doraymon: WhatsApp authenticated failure`, LOG_LEVELS.WARNING);
    sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] <b> WhatsApp authenticated failure </b>');
});

client.on('disconnected', (reason) => {
    isClientInitialized = false;
    log(`Doraymon: WhatsApp disconnected`, LOG_LEVELS.WARNING);
    sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] <b> WhatsApp disconnected </b>');
})

client.on('ready', () => {
    isClientInitialized = true;
    log(`Doraymon: WhatsApp ready`, LOG_LEVELS.INFO);
    sendLogTelegram('Doraymon: [' + LOG_LEVELS.INFO + '] <b> WhatsApp ready </b>');
});

client.on('message', async msg => {
    if (msg.body == '!ping') {
        msg.reply("pong");
    }
    else if (msg.body == '!help') {
        var help = '*!ping* : check monitoring CAPA is active, if the system reply pong = active \n';
        help += '*!checkcapa* : check validation data master CAPA \n';
        help += '*!getcapapic [initial]* : get CAPA status OPEN depend on PIC \n';
        help += '*!getcapadept [department]* : get CAPA status OPEN depend on department \n';
        msg.reply(help)
    }
    else if (msg.body.startsWith('!checkcapa')) {
        var check = await checkCAPA();
        if (check.status == 200) {
            msg.reply(check.data);
        } else {
            msg.reply("wait for moment and try again.");
        }
    }
    else if (msg.body.startsWith('!getcapapic ')) {
        // Direct send a new message to specific id
        var pic = msg.body.split(' ')[1].toUpperCase();

        if (pic.trim() == '') {
            msg.reply("Please input the PIC.");
        } else {
            var capa = await getCAPAByPIC(pic);
            if (capa.status == 200) {
                var data = capa.data;

                let message = '*PIC: ' + pic + '*\n\n';

                if (data.hasOwnProperty(pic.toUpperCase())) {
                    const picData = data[pic.toUpperCase()]; // Access the property dynamically
                    for (const property in picData) {
                        if (picData.hasOwnProperty(property)) {
                            const valuesArray = picData[property];
                            message += `*=== ${property} ===*\n`;

                            for (const value of valuesArray) {
                                message += "```" + "- " + value + "```" + "\n";
                            }
                            message += '\n';
                        }
                    }
                } else {
                    message += '*No CAPA* 🥳';
                }
                msg.reply(message)
            } else {
                msg.reply("Can\'t get data 🙏🏻. Try again later.");
            }
        }
    }
    else if (msg.body.startsWith('!getcapadept ')) {
        // Direct send a new message to a specific id
        var dept = msg.body.split(' ')[1].toUpperCase();

        if (dept.trim() == '') {
            msg.reply("Please input the department.");
        } else {
            var capa = await getCAPAByDept(dept);
            if (capa.status == 200) {
                var data = capa.data;

                let message = '*Department: ' + dept + '*\n\n';

                if (data.hasOwnProperty(dept.toUpperCase())) {
                    const deptData = data[dept.toUpperCase()]; // Access the property dynamically
                    for (const pic in deptData) {
                        if (deptData.hasOwnProperty(pic)) {
                            const sumberCapaData = deptData[pic];
                            message += `*PIC: ${pic}* \n`;

                            for (const sumberCapa in sumberCapaData) {
                                if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                    const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                    message += `*=== ${sumberCapa} ===*\n`;

                                    for (const deskripsiCapa of deskripsiCapaArray) {
                                        message += "```" + "- " + deskripsiCapa + "```" + "\n";
                                    }
                                    message += '\n';
                                }
                            }
                        }
                    }
                } else {
                    message += '*No CAPA* 🥳';
                }
                msg.reply(message);
            } else {
                msg.reply("Can't get data 🙏🏻. Try again later.");
            }
        }
    }
});

// app.post('/group-message', express.json(), async (req, res) => {
//     try {
//         const groupName = req.body.groupName;
//         const messageText = req.body.messageText;
//         const mention = req.body.mention;

//         // Function to send a message to a group
//         const sendToGroup = async (groupName, messageText) => {
//             const chat = await client.getChats();
//             const group = chat.find(chat => chat.isGroup && chat.name === groupName);

//             if (group) {
//                 if (mention != null) {
//                     await group.sendMessage(messageText);
//                 } else {
//                     await group.sendMessage(`Hello @6281224164852`, { mentions: ["6281224164852@c.us"] });
//                 }
//                 console.log('Message sent to the group:', groupName);
//                 res.status(200).json({ status: 200, response: 'Message sent successfully.' });
//             } else {
//                 console.log('Group not found:', groupName);
//                 res.status(404).json({ status: 404, response: 'Group not found.' });
//             }
//         };

//         // Call the sendToGroup function
//         await sendToGroup(groupName, messageText);
//     } catch (error) {
//         console.error('Error sending message:', error);
//         res.status(500).json({ status: 500, response: 'Error sending message.' });
//     }
// });

// app.post('/private-message', express.json(), async (req, res) => {
//     try {
//         const phoneNumber = req.body.phoneNumber;
//         const messageText = req.body.messageText;

//         const formattedNumber = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;

//         // Send the message
//         const chat = await client.getChats();
//         const recipient = chat.find((chat) => chat.id._serialized === formattedNumber);

//         if (recipient) {
//             await recipient.sendMessage(messageText);
//             console.log('Message sent to:', formattedNumber);
//             res.status(200).json({ status: 200, response: 'Message sent successfully' });
//         } else {
//             console.log('Recipient not found:', formattedNumber);
//             res.status(404).json({ status: 404, response: 'Recipient not found' });
//         }
//     } catch (error) {
//         console.error('Error sending message:', error);
//         res.status(500).json({ status: 500, response: 'Error sending message.' });
//     }
// });

// Define a route to read the app.log file
app.get('/api/logs', async (req, res) => {
    try {
        const logContent = await fs.readFile(`${process.env.LOG_PATH}`, 'utf-8');
        const logLines = logContent.split('\n');
        const formattedResponse = logLines.join('<br>'); // Use <br> for newline in HTML

        res.send(formattedResponse);
    } catch (error) {
        console.error('Error reading log file:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/reminder-capa', async (req, res) => {
    try {
        var result = await getCapaReminder();
        res.send(result);
    } catch (error) {
        console.error('Error reading log file:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ==============================    Monitoring CAPA    ================================
async function getInitializeCAPA() {
    try {
        // 0 No                             | 5 Lokasi                      | 10 Personil Terkait
        // 1 Nomor Dokumen Referensi CAPA   | 6 Waktu                       | 11 Dep Terkait
        // 2 No. CAPA                       | 7 Masalah                     | 12 BD/GF
        // 3 Sumber CAPA                    | 8 Deskripsi/Rootcause         | 13 C/M/m
        // 4 Nomor Urut (untuk QRM)         | 9 Produk/Sistem Terdampak     | 14 Category (CAPA)

        // 15 Deskripsi CAPA                    | 20 Tanggal Approved CAPA
        // 16 PIC                               | 21 Extend
        // 17 Dept                              | 22 Keterangan
        // 18 Target Date                       | 23 Status (Open/Close)
        // 19 Tanggal Pembuatan Verifikasi CAPA

        const googleSheetClient = await getGoogleSheetClient();
        const capa = await readGoogleSheet(googleSheetClient, sheetIdCAPA, tabCapa);
        const phones = await readGoogleSheet(googleSheetClient, sheetIdCAPA, tabPhone);
        return { status: 200, capas: capa, phones: phones }
    } catch (error) {
        log('Doraymon: get initialize CAPA\n' + error, LOG_LEVELS.ERROR);
        sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get initialize CAPA\n' + error);
        return { status: 500, capas: [], phones: [] }
    }
}

async function checkCAPA() {
    try {
        var raw = await getInitializeCAPA();

        if (raw.status == 200) {
            var capas = raw.capas;
            var phones = raw.phones;
            var pics = [];

            // CAPA
            var capaNoStatus = [];
            var capaNoPIC = [];
            var picNotExist = [];

            for (var i = 0; i < capas.length; i++) {
                var number = capas[i][0];
                var pic = capas[i][16] != undefined && capas[i][16] != '' ? capas[i][16].toUpperCase().trim() : 'NOPIC';
                var status = capas[i][23] != undefined && capas[i][23] != '' ? capas[i][23].toUpperCase().trim() : 'NOSTATUS';
                var noDoc = capas[i][1] != undefined && capas[i][1] != '' ? capas[i][1] : 'NODOC';
                var sumberCapa = capas[i][3] != undefined && capas[i][3] != '' ? capas[i][3] : 'NORESOURCE';
                var lokasi = capas[i][5] != undefined && capas[i][5] != '' ? capas[i][5] : 'NOLOC';
                var desc = capas[i][8] != undefined && capas[i][8] != '' ? capas[i][8] : 'NODESC';

                // if number exist but no data
                if (pic == 'NOPIC' && status == 'NOSTATUS' && noDoc == 'NODOC' && sumberCapa == 'NORESOURCE' && lokasi == 'NOLOC' && desc == 'NODESC') {
                    // data is empty
                } else {
                    if (status === "OPEN") {
                        // Split /, -&
                        if (pic == "NOPIC") {
                            capaNoPIC.push(number);
                        } else {
                            if (pic.includes(',') || pic.includes('/')) {
                                var picSplit = pic.split(/[,\/]/);
                                for (var j = 0; j < picSplit.length; j++) {
                                    if (picSplit[j].trim() != '') {
                                        pics.push(picSplit[j].toUpperCase().trim());
                                    }
                                }
                            } else {
                                pics.push(pic)
                            }
                        }
                    } else if (status == "NOSTATUS") {
                        capaNoStatus.push(number);
                    }
                }
            }

            var uniquePic = [...new Set(pics)];

            // PHONES
            var phonebooks = {};
            for (var m = 1; m < phones.length; m++) {
                var pic = phones[m][3];
                var phone = phones[m][4];
                var cc = phones[m][5];

                phonebooks[pic] = {
                    phone: phone,
                    cc: cc,
                    phonecc: null,
                };
            }

            for (const key in phonebooks) {
                const item = phonebooks[key];
                if (item.cc) {
                    if (phonebooks[item.cc]) {
                        item.phonecc = phonebooks[item.cc].phone;
                    }
                }
            }

            // PIC NOT EXIST ON PHONENUMBER SHEET
            for (const key of uniquePic) {
                if (!phonebooks[key]) {
                    picNotExist.push(key);
                }
            }

            var data =
                'CAPA tanpa status\nNo: *' + capaNoStatus.join(',') +
                '*\n==========================\n' +
                'CAPA Open tanpa PIC\nNo: *' + capaNoPIC.join(',') +
                '*\n==========================\n' +
                'CAPA Open tetapi PIC tidak terdaftar pada sheet PHONENUMBER\nInit: *' + picNotExist.join(',') + '*';

            return { status: 200, message: 'success', data: data };
        }
    } catch (error) {
        return { status: 500, message: error, data: '-' };
    }
}

async function getCAPAByPIC(paramPic) {
    try {
        var raw = await getInitializeCAPA();

        if (raw.status == 200) {
            if (raw.capas.length > 0) {
                var capaTemp = raw.capas
                // Filter rows with "Open" status
                const capas = capaTemp.filter((row) => row[23] && row[23].toUpperCase() === 'OPEN' && row[16] && row[16].toUpperCase().includes(paramPic.toUpperCase()));

                var result = {};

                for (var i = 0; i < capas.length; i++) {
                    var pic = capas[i][16] ? capas[i][16].toUpperCase().trim() : 'NOPIC';
                    var sumberCapa = capas[i][3] ? capas[i][3].trim() : '-';
                    var deskripsiCapa = capas[i][15] ? capas[i][15].trim() : '-';
                    var targetDate = capas[i][18] ? capas[i][18].trim() : '-';
                    // var keterangan = capas[i][22] ? capas[i][22].trim() : '';

                    if (pic.includes(',') || pic.includes('/')) {
                        var picSplit = pic.split(/[,\/]/);
                        for (var j = 0; j < picSplit.length; j++) {
                            if (picSplit[j].toUpperCase().trim() === paramPic.toUpperCase()) {
                                if (!result.hasOwnProperty(picSplit[j].trim())) {
                                    result[picSplit[j].toUpperCase().trim()] = {};
                                }
                                if (!result[picSplit[j].trim()].hasOwnProperty(sumberCapa)) {
                                    result[picSplit[j].toUpperCase().trim()][sumberCapa] = [];
                                }
                                result[picSplit[j].toUpperCase().trim()][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                            }
                        }
                    } else {
                        if (pic.toUpperCase() === paramPic.toUpperCase()) {
                            if (!result.hasOwnProperty(pic)) {
                                result[pic] = {};
                            }
                            if (!result[pic].hasOwnProperty(sumberCapa)) {
                                result[pic][sumberCapa] = [];
                            }
                            result[pic][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                        }
                    }
                }

                return { status: 200, data: result };
            } else {
                return { status: 200, data: {} }
            }
        } else {
            return { status: 500, data: {} };
        }
    } catch (error) {
        log('Doraymon: get CAPA by PIC\n' + error, LOG_LEVELS.ERROR);
        sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get CAPA by PIC\n' + error);
        return { status: 500, data: {} };
    }
}

async function getCAPAByDept(paramDept) {
    try {
        var raw = await getInitializeCAPA();

        if (raw.status == 200) {
            if (raw.capas.length > 0) {
                var capaTemp = raw.capas
                // Filter rows with "Open" status
                const capas = capaTemp.filter((row) => row[23] && row[23].toUpperCase() === 'OPEN' && row[17] && row[17].toUpperCase().includes(paramDept.toUpperCase()));

                var result = {};

                for (var i = 0; i < capas.length; i++) {
                    var pic = capas[i][16] ? capas[i][16].toUpperCase().trim() : 'NOPIC';
                    var dept = capas[i][17] ? capas[i][17].toUpperCase().trim() : 'NODEPT';
                    var sumberCapa = capas[i][3] ? capas[i][3].trim() : '-';
                    var deskripsiCapa = capas[i][15] ? capas[i][15].trim() : '-';
                    var targetDate = capas[i][18] ? capas[i][18].trim() : '-';

                    if (dept.includes(',') || dept.includes('/')) {
                        var deptSplit = dept.split(/[,\/]/);
                        for (var j = 0; j < deptSplit.length; j++) {
                            if (deptSplit[j].toUpperCase().trim() === paramDept.toUpperCase()) {
                                if (!result.hasOwnProperty(deptSplit[j].trim())) {
                                    result[deptSplit[j].toUpperCase().trim()] = {};
                                }
                                if (!result[deptSplit[j].trim()].hasOwnProperty(pic)) {
                                    result[deptSplit[j].toUpperCase().trim()][pic] = {};
                                }
                                if (!result[deptSplit[j].trim()][pic].hasOwnProperty(sumberCapa)) {
                                    result[deptSplit[j].toUpperCase().trim()][pic][sumberCapa] = [];
                                }
                                result[deptSplit[j].toUpperCase().trim()][pic][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                            }
                        }
                    } else {
                        if (dept.toUpperCase() === paramDept.toUpperCase()) {
                            if (!result.hasOwnProperty(dept)) {
                                result[dept] = {};
                            }
                            if (!result[dept].hasOwnProperty(pic)) {
                                result[dept][pic] = {};
                            }
                            if (!result[dept][pic].hasOwnProperty(sumberCapa)) {
                                result[dept][pic][sumberCapa] = [];
                            }
                            result[dept][pic][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                        }
                    }
                }

                return { status: 200, data: result };
            } else {
                return { status: 200, data: {} }
            }
        } else {
            return { status: 500, data: {} };
        }
    } catch (error) {
        log('Doraymon: get CAPA by department\n' + error, LOG_LEVELS.ERROR);
        sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get CAPA by department\n' + error);
        return { status: 500, data: {} };
    }
}

async function getCapaReminder() {
    try {
        var raw = await getInitializeCAPA();

        if (raw.status == 200) {
            if (raw.capas.length > 0 && raw.phones.length > 0) {
                var capaTemp = raw.capas.filter((row) => row[23] && row[23].toUpperCase() === 'OPEN');
                var phoneTemp = raw.phones;

                // ===============================================================================
                // ======== Collect CAPA
                var capas = {};
                for (var i = 0; i < capaTemp.length; i++) {
                    var pic = capaTemp[i][16] ? capaTemp[i][16].toUpperCase().trim() : 'NOPIC';
                    var sumberCapa = capaTemp[i][3] ? capaTemp[i][3].trim() : '-';
                    var deskripsiCapa = capaTemp[i][15] ? capaTemp[i][15].trim() : '-';
                    var targetDate = capaTemp[i][18] ? capaTemp[i][18].trim() : '-';

                    if (pic.includes(',') || pic.includes('/')) {
                        var picSplit = pic.split(/[,\/]/);
                        for (var j = 0; j < picSplit.length; j++) {
                            if (!capas.hasOwnProperty(picSplit[j].trim())) {
                                capas[picSplit[j].toUpperCase().trim()] = {};
                            }
                            if (!capas[picSplit[j].trim()].hasOwnProperty(sumberCapa)) {
                                capas[picSplit[j].toUpperCase().trim()][sumberCapa] = [];
                            }
                            capas[picSplit[j].toUpperCase().trim()][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                        }
                    } else {
                        if (!capas.hasOwnProperty(pic)) {
                            capas[pic] = {};
                        }
                        if (!capas[pic].hasOwnProperty(sumberCapa)) {
                            capas[pic][sumberCapa] = [];
                        }
                        capas[pic][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                    }
                }

                // ===============================================================================
                // ======== Collect Phones
                const phones = {};
                phoneTemp.slice(1).forEach(row => {
                    const [no, dept, line, spv, noWa, atasan] = row;

                    const pic = spv.toUpperCase();
                    const pn = noWa || '';

                    phones[pic] = {
                        pn,
                        superior: atasan.toUpperCase(),
                        superiorPn: ''
                    };
                });

                phoneTemp.slice(1).forEach(row => {
                    const [no, dept, line, spv, noWa, atasan] = row;

                    const pic = spv.toUpperCase();
                    const superior = atasan.toUpperCase();

                    phones[pic].superiorPn = phones[superior] ? phones[superior].pn : '';
                });

                // ========================= SEND NOTIFICATION =========================
                // Loop through the main object
                for (const pic in capas) {
                    var message = '';

                    if (capas.hasOwnProperty(pic)) {
                        const sumberCapaData = capas[pic];

                        if (pic == "NOPIC") {
                            message += '\n';
                            for (const sumberCapa in sumberCapaData) {
                                if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                    const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                    message += `=== ${sumberCapa} ===\n`;

                                    for (const deskripsiCapa of deskripsiCapaArray) {
                                        message += "- " + deskripsiCapa + "\n";
                                    }
                                }
                            }

                            sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] \n<b>✖️✖️ CAPA PIC ✖️✖️</b> \n' + message);
                        } else {
                            var number = '-';
                            var cc = '-';
                            var ccNumber = '-';

                            if (phones.hasOwnProperty(pic)) {
                                number = phones[pic].pn;
                                cc = phones[pic].superior;
                                ccNumber = phones[pic].superiorPn
                            }

                            if (!isValidPhoneNumber(number)) {
                                message += '\n';
                                message += `<b>PIC: ${pic}</b> \n\n`;
                                for (const sumberCapa in sumberCapaData) {
                                    if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                        const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                        message += `=== ${sumberCapa} ===\n`;

                                        for (const deskripsiCapa of deskripsiCapaArray) {
                                            message += "- " + deskripsiCapa + "\n";
                                        }
                                        message += '\n';
                                    }
                                }

                                message += 'Apa ada progress terbaru? Mohon untuk diupdate ya \n';
                                message += '----------------------------------------------------';

                                sendLogTelegram("Doraymon: [" + LOG_LEVELS.WARNING + "] \n<b>✖️✖️ CAPA PIC Number ✖️✖️</b> \n" + message);
                            } else {
                                message += `*PIC: ${pic} @${number}* \n\n`;

                                for (const sumberCapa in sumberCapaData) {
                                    if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                        const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                        message += `*=== ${sumberCapa} ===*\n`;

                                        for (const deskripsiCapa of deskripsiCapaArray) {
                                            message += "```" + "- " + deskripsiCapa + "```" + "\n";
                                        }
                                        message += '\n';
                                    }
                                }

                                message += 'Apa ada progress terbaru? Mohon untuk diupdate ya';

                                if (isValidPhoneNumber(ccNumber)) {
                                    message += `\n\ncc: ${cc} @${ccNumber}`;
                                }

                                // Function to send a message to a group
                                const chat = await client.getChats();
                                const group = chat.find(chat => chat.isGroup && chat.name === "Testing Notification");

                                if (group) {
                                    if (isValidPhoneNumber(number) && isValidPhoneNumber(ccNumber)) {
                                        await group.sendMessage(`${message}`, { mentions: [number + "@c.us", ccNumber + "@c.us"] });
                                    } else if (isValidPhoneNumber(number)) {
                                        await group.sendMessage(`${message}`, { mentions: [number + "@c.us"] });
                                    }
                                } else {
                                    log('Doraymon: get CAPA reminder \n' + error, LOG_LEVELS.ERROR);
                                }
                            }
                        }
                    }
                }
                return { status: 200, data: "success" };
            } else {
                return { status: 200, data: {} }
            }
        } else {
            return { status: 500, data: {} };
        }
    } catch (error) {
        log('Doraymon: get CAPA reminder \n' + error, LOG_LEVELS.ERROR);
        sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get CAPA reminder\n' + error);
        return { status: 500, data: {} };
    }
}

// Auth
async function getGoogleSheetClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: serviceAccountKeyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    return google.sheets({
        version: 'v4',
        auth: authClient,
    });
}

// Read Data
async function readGoogleSheet(googleSheetClient, sheetIdCAPA, tabName) {
    if (tabName == " CAPA") {
        var range = tabName + "!A:X";
    }
    if (tabName == "PHONENUMBER") {
        var range = tabName + "!A:F";
    }

    const res = await googleSheetClient.spreadsheets.values.get({
        spreadsheetId: sheetIdCAPA,
        range: range
    });

    return res.data.values || [];
}

// QR Code
async function generateQRCode(qrData) {
    return new Promise((resolve, reject) => {
        qr.toDataURL(qrData, (err, qrCodeImageUrl) => {
            if (err) {
                reject(err);
            } else {
                resolve(qrCodeImageUrl);
            }
        });
    });
}

// Is valid phone number
function isValidPhoneNumber(phoneNumber) {
    // Define a regular expression for a basic phone number pattern
    const phoneRegex = /^\d{10,15}$/;

    // Test the phone number against the regular expression
    return phoneRegex.test(phoneNumber);
}

// =================================    Logging     ===================================
async function sendLogTelegram(message) {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;

    const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const params = {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML',
    };

    let maxRetries = 3;
    let retryCount = 0;
    let success = false;

    while (retryCount < maxRetries && !success) {
        try {
            const response = await axios.post(apiUrl, params);

            if (response.status === 200) {
                success = true;
            } else {
                // Log or handle errors
                // log('Telegram Doraymon failed: ' + message + '\n', LOG_LEVELS.ERROR);
            }
        } catch (error) {
            // Log or handle errors
            // log('Telegram Doraymon error: ' + message + '\n', LOG_LEVELS.ERROR);
        }

        // If not successful, wait for a while before retrying
        if (!success) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before retrying
            retryCount++;
        }
    }

    if (!success) {
        log('Telegram Doraymon: ' + message + ' exceeded maximum retries', LOG_LEVELS.ERROR);
    }
}

// Function to format the current date and time as a UTC+7 timestamp
function getUTCPlus7Timestamp() {
    const now = new Date();
    // Add 7 hours (in milliseconds) to adjust for UTC+7
    now.setTime(now.getTime() + 7 * 60 * 60 * 1000);

    // Format the timestamp without "GMT"
    const formattedTimestamp = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    return formattedTimestamp;
}

// Function to log messages with a specified severity level and UTC+7 timestamp
function log(message, level = LOG_LEVELS.INFO) {
    const timestamp = getUTCPlus7Timestamp();
    const logEntry = `[${timestamp}] [${level}] ${message}`;

    // Log to a file (append mode)
    fs.appendFile(`${process.env.LOG_PATH}`, logEntry + '\n', (err) => {
        if (err) {
            console.log('Error writing to log file:', err);
        }
    });
}

// Function to send qr code initialize
async function sendQRCodeToTelegram(qrCodeImageUrl) {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;
    const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;

    // Replace this with your base64-encoded image
    const base64Image = qrCodeImageUrl;

    // Convert base64 image to binary data
    const imageBuffer = Buffer.from(base64Image.split(',')[1], 'base64');

    // Create a FormData instance
    const formData = new FormData();

    // Append the image as a file to the form data
    formData.append('chat_id', CHAT_ID);
    formData.append('photo', imageBuffer, { filename: 'image.jpg' });

    try {
        const response = await axios.post(API_URL, formData, {
            headers: {
                ...formData.getHeaders(),
            },
        });

        if (response.status === 200) {
            console.log('Image sent successfully');
        } else {
            console.log('Failed to send image:', response.status, response.statusText);
        }
    } catch (error) {
        console.log('Error sending image:', error.message);
    }
}
// =====================================================================================

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
