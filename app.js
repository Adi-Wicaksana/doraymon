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
const moment = require('moment');
moment.updateLocale('id', {
    monthsShort: [
        'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
        'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
    ],
});
const cron = require('node-cron');
const { startOfMonth, addDays, format, getDay } = require('date-fns');

// ===================================    env    ====================================
const healthCheckUrl = process.env.HEALTHCHECK_URL;
const capaGroup = process.env.CAPA_GROUP;
var env = process.env.NODE_ENV || "develop";

var envPath = "";
if (env === "develop") {
    envPath = "";
} else if (env === "staging" || env === "production") {
    envPath = "/home/app/doraymon/.env";
}

var logPath = '';
if (env == "develop") {
    logPath = "app.log";
} else if (env === "staging" || env === "production") {
    envPath = "/home/app/doraymon/app.log";
}

// Log severity
const LOG_LEVELS = {
    INFO: 'INFO',
    WARNING: 'WARNING',
    ERROR: 'ERROR',
};

// Google Sheet
const serviceAccountKeyFile = "./doraymon-ff6b0213a80d.json";
const sheetIdCapa = process.env.SHEET_ID_CAPA;
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

let isClientInitialized1 = false;
// initializeClient();

// Create an endpoint to initialize the client
app.get('/initialize', (req, res) => {
    const clientNumber = parseInt(req.query.clientNumber);

    if (!clientNumber) {
        return res.status(400).json({
            status: 400,
            message: 'Client number is required in the query parameters',
        });
    } else {
        switch (clientNumber) {
            case 1:
                if (isClientInitialized1) {
                    res.json({
                        status: 200,
                        message: `Client ${clientNumber} is already initialized`,
                    });
                } else {
                    initializeClient(clientNumber);
                    res.json({
                        status: 200,
                        message: `Client ${clientNumber} initialized`,
                    });
                }
                break;
            default:
                res.json({
                    status: 500,
                    message: `Client failed to initialized`,
                });
                break;
        }
    }
});

// Initialize the client
async function initializeClient(clientNumber) {
    switch (clientNumber) {
        case 1:
            client.initialize();
            log('Doraymon: initialize client 1 WhatsApp', LOG_LEVELS.INFO);
            await sendLogTelegram('Doraymon: [' + LOG_LEVELS.INFO + '] <b> initialize client 1 WhatsApp </b>');
            isClientInitialized1 = true;
            break;
        default:
            break;
    }
}

// CLIENT 1
client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN 1', percent, message);
});

client.on('qr', async (qr) => {
    try {
        // Generate the QR code as an image
        const qrCodeImage = await generateQRCode(qr);
        // Send the QR code image to Telegram
        sendQRCodeToTelegram(qrCodeImage);
    } catch (error) {
        log('Doraymon: generate QRCode 1\n' + error, LOG_LEVELS.ERROR);
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] Generate QRCode 1\n' + error);
    }
});

client.on('authenticated', async () => {
    log('Doraymon: WhatsApp authenticated 1', LOG_LEVELS.INFO);
    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.INFO + '] <b> WhatsApp authenticated 1</b>');
});

client.on('auth_failure', async (msg) => {
    log(`Doraymon: WhatsApp authenticated failure 1`, LOG_LEVELS.WARNING);
    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] <b> WhatsApp authenticated failure 1</b>');
});

client.on('disconnected', async (reason) => {
    isClientInitialized1 = false;
    log(`Doraymon: WhatsApp disconnected 1`, LOG_LEVELS.WARNING);
    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] <b> WhatsApp disconnected 1</b>');
})

client.on('ready', async () => {
    isClientInitialized1 = true;
    log(`Doraymon: WhatsApp ready 1`, LOG_LEVELS.INFO);
    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.INFO + '] <b> WhatsApp ready 1</b>');
});

client.on('message_create', async msg => {
    if (msg.body == '!ping') {
        msg.reply("pong");
    }
    else if (msg.body == '!help') {
        var help = '*!ping* : check monitoring CAPA is active, if the system reply pong = active \n';
        help += '*!checkcapa* : check validation data master CAPA \n';
        help += '*!getcapapic [initial]* : get CAPA status open depend on PIC \n';
        help += '*!getcapadept [department]* : get CAPA status open depend on department \n';
        // help += '*!getcapaoverdue [department]* : get CAPA status open and overdue depend on department \n';
        msg.reply(help)
    }
    else if (msg.body.startsWith('!checkcapa')) {
        var check = await checkCapa();
        if (check.status == 200) {
            msg.reply(check.data);
        } else {
            msg.reply("wait for moment and try again.");
        }
    }
    else if (msg.body.startsWith('!getcapaoverdue ')) {
        // Direct send a new message to a specific id
        var dept = msg.body.split(' ')[1].toUpperCase();

        if (dept.trim() == '') {
            msg.reply("Please input the department.");
        } else {
            var capa = await getCapaOverdue(dept);
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
                                    message += `*${sumberCapa}*\n`;

                                    for (const deskripsiCapa of deskripsiCapaArray) {
                                        message += "- " + deskripsiCapa + "\n";
                                    }
                                }
                            }
                            message += '\n';
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
    else if (msg.body.startsWith('!getcapapic ')) {
        // Direct send a new message to specific id
        var pic = msg.body.split(' ')[1].toUpperCase();

        if (pic.trim() == '') {
            msg.reply("Please input the PIC.");
        } else {
            var capa = await getCapaByPic(pic);
            if (capa.status == 200) {
                var data = capa.data;

                let message = '*PIC: ' + pic + '*\n\n';

                if (data.hasOwnProperty(pic.toUpperCase())) {
                    const picData = data[pic.toUpperCase()]; // Access the property dynamically
                    for (const property in picData) {
                        if (picData.hasOwnProperty(property)) {
                            const valuesArray = picData[property];
                            message += `*${property}*\n`;

                            for (const value of valuesArray) {
                                message += "- " + value + "\n";
                            }
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
            var capa = await getCapaByDept(dept);
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
                                    message += `*${sumberCapa}*\n`;

                                    for (const deskripsiCapa of deskripsiCapaArray) {
                                        message += "- " + deskripsiCapa + "\n";
                                    }
                                }
                            }
                            message += '\n';
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

// CLIENT 2
client2.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN 2', percent, message);
});

client2.on('qr', async (qr) => {
    try {
        // Generate the QR code as an image
        const qrCodeImage = await generateQRCode(qr);
        // Send the QR code image to Telegram
        sendQRCodeToTelegram(qrCodeImage);
    } catch (error) {
        log('Doraymon: generate QRCode 2\n' + error, LOG_LEVELS.ERROR);
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] Generate QRCode 2\n' + error);
    }
});

client2.on('authenticated', async () => {
    log('Doraymon: WhatsApp authenticated 2', LOG_LEVELS.INFO);
    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.INFO + '] <b> WhatsApp authenticated 2</b>');
});

client2.on('auth_failure', async (msg) => {
    log(`Doraymon: WhatsApp authenticated failure 2`, LOG_LEVELS.WARNING);
    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] <b> WhatsApp authenticated failure 2</b>');
});

client2.on('disconnected', async (reason) => {
    isClientInitialized1 = false;
    log(`Doraymon: WhatsApp disconnected 2`, LOG_LEVELS.WARNING);
    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] <b> WhatsApp disconnected 2</b>');
})

client2.on('ready', async () => {
    isClientInitialized1 = true;
    log(`Doraymon: WhatsApp ready 2`, LOG_LEVELS.INFO);
    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.INFO + '] <b> WhatsApp ready 2</b>');
});

client2.on('message_create', async msg => {
    if (msg.body == '!ping') {
        msg.reply("pong dari client 2");
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
        const logContent = await fs.readFile(`${logPath}`, 'utf-8');
        const logLines = logContent.split('\n');
        const formattedResponse = logLines.join('<br>'); // Use <br> for newline in HTML

        res.send(formattedResponse);
    } catch (error) {
        console.error('Error reading log file:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.use(express.json());
app.post('/reminder-capa', async (req, res) => {
    try {
        const requestBody = req.body;
        var to = requestBody.to;

        var reminder = await getCapaReminder(to.toUpperCase());
        if (reminder.status == 200) {
            res.json({
                status: 200,
                message: "trigger CAPA for " + to + " success."
            })
        } else if (reminder.status == 201) {
            res.json({
                status: 200,
                message: "trigger CAPA for " + to + " empty."
            })
        } else {
            res.json({
                status: 500,
                message: "trigger CAPA for " + to + " failed."
            })
        }
    } catch (error) {
        console.error('Error processing request:', error);
        res.json({
            status: 500,
            message: "Internal server error."
        })
    }
});

app.post('/friday-capa', async (req, res) => {
    try {
        const requestBody = req.body;
        var slot = requestBody.slot;

        var reminder = await getCapaEveryFriday(slot);
        if (reminder.status == 200) {
            res.json({
                status: 200,
                message: "trigger CAPA friday slot " + slot + " success."
            })
        } else if (reminder.status == 201) {
            res.json({
                status: 200,
                message: "trigger CAPA friday slot " + slot + " empty."
            })
        } else {
            res.json({
                status: 500,
                message: "trigger CAPA friday slot " + slot + " failed."
            })
        }
    } catch (error) {
        console.error('Error processing request:', error);
        res.json({
            status: 500,
            message: "Internal server error."
        })
    }
});

// ==============================    Monitoring CAPA    ================================
async function getInitializeCapa() {
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
        const capa = await readGoogleSheet(googleSheetClient, sheetIdCapa, tabCapa);
        const phones = await readGoogleSheet(googleSheetClient, sheetIdCapa, tabPhone);
        return { status: 200, capas: capa, phones: phones }
    } catch (error) {
        log('Doraymon: get initialize CAPA\n' + error, LOG_LEVELS.ERROR);
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get initialize CAPA\n' + error);
        return { status: 500, capas: [], phones: [] }
    }
}

async function checkCapa() {
    try {
        var raw = await getInitializeCapa();

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
                var slot = phones[m][6];

                phonebooks[pic] = {
                    phone: phone,
                    cc: cc,
                    phonecc: null,
                    slot: slot
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
                'CAPA tanpa status\nNo: ' + capaNoStatus.join(', ') +
                '\n==========================\n' +
                'CAPA Open tanpa PIC\nNo: ' + capaNoPIC.join(', ') +
                '\n==========================\n' +
                'CAPA Open tetapi PIC tidak terdaftar pada sheet PHONENUMBER\nInit: ' + picNotExist.join(', ');

            return { status: 200, message: 'success', data: data };
        }
    } catch (error) {
        return { status: 500, message: error, data: '-' };
    }
}

async function getCapaByPic(paramPic) {
    try {
        var raw = await getInitializeCapa();

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
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get CAPA by PIC\n' + error);
        return { status: 500, data: {} };
    }
}

async function getCapaByDept(paramDept) {
    try {
        var raw = await getInitializeCapa();

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
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get CAPA by department\n' + error);
        return { status: 500, data: {} };
    }
}

async function getCapaReminder(to) {
    try {
        var raw = await getInitializeCapa();

        if (raw.status == 200) {
            if (raw.capas.length > 0 && raw.phones.length > 0) {
                if (to == "ALL") {
                    var capaTemp = raw.capas.filter((row) => row[23] && row[23].toUpperCase() === 'OPEN');
                } else {
                    var capaTemp = raw.capas.filter((row) => row[23] && row[23].toUpperCase() === 'OPEN' && row[16] && row[16].toUpperCase().includes(to.toUpperCase()));
                }
                var phoneTemp = raw.phones;

                // ===============================================================================
                // ======== Collect Phones
                const phones = {};
                phoneTemp.slice(1).forEach(row => {
                    const [no, dept, line, spv, noWa, atasan, slot] = row;

                    const pic = spv.toUpperCase();
                    const pn = noWa || '';

                    phones[pic] = {
                        pn,
                        superior: atasan.toUpperCase(),
                        superiorPn: ''
                    };
                });

                phoneTemp.slice(1).forEach(row => {
                    const [no, dept, line, spv, noWa, atasan, slot] = row;

                    const pic = spv.toUpperCase();
                    const superior = atasan.toUpperCase();

                    phones[pic].superiorPn = phones[superior] ? phones[superior].pn : '';
                });

                // ===============================================================================
                // ======== Collect CAPA
                var capas = {};
                var depts = {};

                for (var i = 0; i < capaTemp.length; i++) {
                    var pic = capaTemp[i][16] ? capaTemp[i][16].toUpperCase().trim() : 'NOPIC';
                    var dept = capaTemp[i][17] ? capaTemp[i][17].toUpperCase().trim() : 'NODEPT';
                    var sumberCapa = capaTemp[i][3] ? capaTemp[i][3].trim() : '-';
                    var deskripsiCapa = capaTemp[i][15] ? capaTemp[i][15].trim() : '-';
                    var targetDate = capaTemp[i][18] ? capaTemp[i][18].trim() : '-';

                    if (isDateValid(targetDate)) {
                        const targetDateObj = moment(targetDate, 'DD MMM YYYY', 'id', true);
                        const currentDate = moment();
                        if (targetDateObj.month() === currentDate.month() && targetDateObj.year() === currentDate.year()) {
                            if (pic.includes(',') || pic.includes('/')) {
                                var picSplit = pic.split(/[,\/]/);
                                for (var j = 0; j < picSplit.length; j++) {
                                    if (to.toUpperCase() == "ALL") {
                                        if (!capas.hasOwnProperty(picSplit[j].trim())) {
                                            capas[picSplit[j].toUpperCase().trim()] = {};
                                        }
                                        if (!capas[picSplit[j].trim()].hasOwnProperty(sumberCapa)) {
                                            capas[picSplit[j].toUpperCase().trim()][sumberCapa] = [];
                                        }
                                        capas[picSplit[j].toUpperCase().trim()][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                                    } else {
                                        if (to.toUpperCase() == picSplit[j].toUpperCase()) {
                                            if (!capas.hasOwnProperty(picSplit[j].trim())) {
                                                capas[picSplit[j].toUpperCase().trim()] = {};
                                            }
                                            if (!capas[picSplit[j].trim()].hasOwnProperty(sumberCapa)) {
                                                capas[picSplit[j].toUpperCase().trim()][sumberCapa] = [];
                                            }
                                            capas[picSplit[j].toUpperCase().trim()][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                                        }
                                    }
                                    depts[picSplit[j].toUpperCase().trim()] = dept;
                                }
                            } else {
                                if (!capas.hasOwnProperty(pic)) {
                                    capas[pic] = {};
                                }
                                if (!capas[pic].hasOwnProperty(sumberCapa)) {
                                    capas[pic][sumberCapa] = [];
                                }
                                capas[pic][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                                depts[pic] = dept;
                            }
                        }
                    } else {
                        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] \n<b>✖️✖️ CAPA DUE DATE IS NOT VALID ✖️✖️</b> \n' + pic + ' - ' + sumberCapa + ' - ' + deskripsiCapa);
                    }
                }

                // ========================= SEND NOTIFICATION =========================
                // Loop through the main object
                for (const pic in capas) {
                    var message = '';

                    if (capas.hasOwnProperty(pic)) {
                        const sumberCapaData = capas[pic];
                        var dept = depts[pic];

                        if (pic == "NOPIC") {
                            message += '\n';
                            for (const sumberCapa in sumberCapaData) {
                                if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                    const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                    message += `<b>${sumberCapa}</b>\n`;

                                    for (const deskripsiCapa of deskripsiCapaArray) {
                                        message += "- " + deskripsiCapa + "\n";
                                    }
                                }
                            }

                            await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] \n<b>✖️✖️ CAPA NO PIC ✖️✖️</b> \n' + message);
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
                                message += `<b>Department: ${dept}</b>`;
                                message += '\n\n';
                                message += `<b>PIC: ${pic}</b> \n`;
                                for (const sumberCapa in sumberCapaData) {
                                    if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                        const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                        message += ` ${sumberCapa} \n`;

                                        for (const deskripsiCapa of deskripsiCapaArray) {
                                            message += "- " + deskripsiCapa + "\n";
                                        }
                                    }
                                }

                                message += '\n';

                                await sendLogTelegram("Doraymon: [" + LOG_LEVELS.WARNING + "] \n<b>✖️✖️ CAPA NO PIC NUMBER ✖️✖️</b> \n" + message);
                            } else {
                                message += `*Department: ${dept}*`;
                                message += '\n\n';
                                message += `*PIC: ${pic} @${number}* \n`;

                                for (const sumberCapa in sumberCapaData) {
                                    if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                        const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                        message += `*${sumberCapa}* \n`;

                                        for (const deskripsiCapa of deskripsiCapaArray) {
                                            message += "- " + deskripsiCapa + "\n";
                                        }
                                    }
                                }

                                message += '\n';
                                message += 'Apa ada progress terbaru? Mohon untuk diupdate ya';

                                if (isValidPhoneNumber(ccNumber)) {
                                    message += `\n\ncc: ${cc} @${ccNumber}`;
                                }

                                // Function to send a message to a group
                                const chat = await client.getChats();
                                const group = chat.find(chat => chat.isGroup && chat.name === capaGroup);

                                try {
                                    if (group) {
                                        if (isValidPhoneNumber(number) && isValidPhoneNumber(ccNumber)) {
                                            await group.sendMessage(`${message}`, { mentions: [number + "@c.us", ccNumber + "@c.us"] });
                                        } else if (isValidPhoneNumber(number)) {
                                            await group.sendMessage(`${message}`, { mentions: [number + "@c.us"] });
                                        }
                                    } else {
                                        log('Doraymon: get CAPA reminder \n cannot find group.', LOG_LEVELS.WARNING);
                                        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] get CAPA reminder \ncannot find group.');
                                    }
                                } catch (error) {
                                    await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] get CAPA reminder \ncannot mention ' + number + ' cc : ' + ccNumber);
                                }
                            }
                        }
                    }
                }
                return { status: 200, data: "success" };
            } else {
                return { status: 201, data: {} }
            }
        } else {
            return { status: 500, data: {} };
        }
    } catch (error) {
        log('Doraymon: get CAPA reminder \n' + error, LOG_LEVELS.ERROR);
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get CAPA reminder error \nCheck API Log.');
        return { status: 500, data: {} };
    }
}

async function getCapaOverdue(paramDept) {
    try {
        var raw = await getInitializeCapa();

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

                    if (isDateValid(targetDate)) {
                        const targetDateObj = moment(targetDate, 'DD MMM YYYY', 'id', true);
                        const currentDate = moment();
                        if (currentDate > targetDateObj) {
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
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get CAPA by department\n' + error);
        return { status: 500, data: {} };
    }
}

async function getCapaEveryFriday(paramSlot) {
    try {
        var raw = await getInitializeCapa();

        if (raw.status == 200) {
            if (raw.capas.length > 0 && raw.phones.length > 0) {
                var capaTemp = raw.capas.filter((row) => row[23] && row[23].toUpperCase() === 'OPEN');

                var phoneTemp = raw.phones;

                // ===============================================================================
                // ======== Collect Phones
                const phones = {};
                phoneTemp.slice(1).forEach(row => {
                    const [no, dept, line, spv, noWa, atasan, slot] = row;

                    const pic = spv.toUpperCase();
                    const pn = noWa || '';

                    phones[pic] = {
                        pn,
                        superior: atasan.toUpperCase(),
                        superiorPn: '',
                        slot
                    };
                });

                phoneTemp.slice(1).forEach(row => {
                    const [no, dept, line, spv, noWa, atasan, slot] = row;

                    const pic = spv.toUpperCase();
                    const superior = atasan.toUpperCase();

                    phones[pic].superiorPn = phones[superior] ? phones[superior].pn : '';
                });

                // ===============================================================================
                // ======== Collect CAPA
                var capas = {};
                var depts = {};

                for (var i = 0; i < capaTemp.length; i++) {
                    var pic = capaTemp[i][16] ? capaTemp[i][16].toUpperCase().trim() : 'NOPIC';
                    var dept = capaTemp[i][17] ? capaTemp[i][17].toUpperCase().trim() : 'NODEPT';
                    var sumberCapa = capaTemp[i][3] ? capaTemp[i][3].trim() : '-';
                    var deskripsiCapa = capaTemp[i][15] ? capaTemp[i][15].trim() : '-';
                    var targetDate = capaTemp[i][18] ? capaTemp[i][18].trim() : '-';

                    if (isDateValid(targetDate)) {
                        const targetDateObj = moment(targetDate, 'DD MMM YYYY', 'id', true);
                        const currentDate = moment();
                        if (targetDateObj.month() === currentDate.month() && targetDateObj.year() === currentDate.year()) {
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
                                    depts[picSplit[j].toUpperCase().trim()] = dept;
                                }
                            } else {
                                if (!capas.hasOwnProperty(pic)) {
                                    capas[pic] = {};
                                }
                                if (!capas[pic].hasOwnProperty(sumberCapa)) {
                                    capas[pic][sumberCapa] = [];
                                }
                                capas[pic][sumberCapa].push(deskripsiCapa + ' (' + targetDate + ')');
                                depts[pic] = dept;
                            }
                        }
                    } else {
                        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] \n<b>✖️✖️ CAPA DUE DATE IS NOT VALID ✖️✖️</b> \n' + pic + ' - ' + sumberCapa + ' - ' + deskripsiCapa);
                    }
                }

                // ========================= SEND NOTIFICATION =========================
                // Loop through the main object
                for (const pic in capas) {
                    var message = '';

                    if (capas.hasOwnProperty(pic)) {
                        const sumberCapaData = capas[pic];
                        var dept = depts[pic];

                        if (pic == "NOPIC") {
                            message += '\n';
                            for (const sumberCapa in sumberCapaData) {
                                if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                    const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                    message += `<b>${sumberCapa}</b>\n`;

                                    for (const deskripsiCapa of deskripsiCapaArray) {
                                        message += "- " + deskripsiCapa + "\n";
                                    }
                                }
                            }

                            await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] \n<b>✖️✖️ CAPA NO PIC ✖️✖️</b> \n' + message);
                        } else {
                            var number = '-';
                            var cc = '-';
                            var ccNumber = '-';
                            var slot = '-';

                            if (phones.hasOwnProperty(pic)) {
                                number = phones[pic].pn;
                                cc = phones[pic].superior;
                                ccNumber = phones[pic].superiorPn;
                                slot = phones[pic].slot;
                            }

                            if (!isValidPhoneNumber(number)) {
                                message += `<b>Department: ${dept}</b>`;
                                message += '\n\n';
                                message += `<b>PIC: ${pic}</b> \n`;
                                for (const sumberCapa in sumberCapaData) {
                                    if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                        const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                        message += ` ${sumberCapa} \n`;

                                        for (const deskripsiCapa of deskripsiCapaArray) {
                                            message += "- " + deskripsiCapa + "\n";
                                        }
                                    }
                                }

                                message += '\n';

                                await sendLogTelegram("Doraymon: [" + LOG_LEVELS.WARNING + "] \n<b>✖️✖️ CAPA NO PIC NUMBER ✖️✖️</b> \n" + message);
                            } else {
                                message += `*Department: ${dept}*`;
                                message += '\n\n';
                                message += `*PIC: ${pic} @${number}* \n`;

                                for (const sumberCapa in sumberCapaData) {
                                    if (sumberCapaData.hasOwnProperty(sumberCapa)) {
                                        const deskripsiCapaArray = sumberCapaData[sumberCapa];
                                        message += `*${sumberCapa}* \n`;

                                        for (const deskripsiCapa of deskripsiCapaArray) {
                                            message += "- " + deskripsiCapa + "\n";
                                        }
                                    }
                                }

                                message += '\n';
                                message += 'Apa ada progress terbaru? Mohon untuk diupdate ya';

                                if (isValidPhoneNumber(ccNumber)) {
                                    message += `\n\ncc: ${cc} @${ccNumber}`;
                                }

                                // Function to send a message to a group
                                const chat = await client.getChats();
                                const group = chat.find(chat => chat.isGroup && chat.name === capaGroup);

                                if (slot == null || slot == "" || slot == undefined || slot == "-") {
                                    await sendLogTelegram(`Doraymon: [" + LOG_LEVELS.WARNING + "] \n<b>✖️✖️ PIC NO SLOT ✖️✖️</b> ${pic} \n`);
                                } else {
                                    if (slot == paramSlot) {
                                        try {
                                            if (group) {
                                                if (isValidPhoneNumber(number) && isValidPhoneNumber(ccNumber)) {
                                                    await group.sendMessage(`${message}`, { mentions: [number + "@c.us", ccNumber + "@c.us"] });
                                                } else if (isValidPhoneNumber(number)) {
                                                    await group.sendMessage(`${message}`, { mentions: [number + "@c.us"] });
                                                }
                                            } else {
                                                log('Doraymon: get CAPA every friday \n cannot find group.', LOG_LEVELS.WARNING);
                                                await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] get CAPA every friday \ncannot find group.');
                                            }
                                        } catch (error) {
                                            await sendLogTelegram('Doraymon: [' + LOG_LEVELS.WARNING + '] get CAPA every friday \ncannot mention ' + number + ' cc : ' + ccNumber);
                                        }
                                    }
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
        log('Doraymon: get CAPA every friday \n' + error, LOG_LEVELS.ERROR);
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] get CAPA every friday \n' + error);
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
async function readGoogleSheet(googleSheetClient, sheetIdCapa, tabName) {
    if (tabName == " CAPA") {
        var range = tabName + "!A:X";
    }
    if (tabName == "PHONENUMBER") {
        var range = tabName + "!A:G";
    }

    const res = await googleSheetClient.spreadsheets.values.get({
        spreadsheetId: sheetIdCapa,
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
    fs.appendFile(`${logPath}`, logEntry + '\n', (err) => {
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

async function cronHc() {
    try {
        await axios.get(healthCheckUrl);
    } catch (error) {
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] HC failed to ping!\n' + error);
    }
}

function isDateValid(dateString) {
    const parsedDate = moment(dateString, "DD MMM YYYY", true);
    return parsedDate.isValid();
}

// =======================================================
function getDatesAndDaysOfMonth(year, month) {
    const firstDayOfMonth = startOfMonth(new Date(year, month - 1)); // month is 0-indexed

    const datesAndDays = Array.from({ length: 5 }, (_, index) => {
        const currentDate = addDays(firstDayOfMonth, index);

        // Check if the current day is a weekend (0 is Sunday, 6 is Saturday)
        const dayOfWeek = getDay(currentDate);
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            // Skip weekends
            return null;
        }

        return {
            date: format(currentDate, 'yyyy-MM-dd'),
            day: format(currentDate, 'EEEE'), // 'EEEE' gives the full weekday name
        };
    });

    // Remove null entries (weekends)
    const filteredDatesAndDays = datesAndDays.filter(entry => entry !== null);

    return filteredDatesAndDays;
}

async function hitApiHoliday() {
    // Hit API holiday
    try {
        const apiHoliday = await axios.get(`https://api-harilibur.vercel.app/api`);

        if (apiHoliday.status === 200) {
            const apiHolidayData = apiHoliday.data;
            var holidays = [];
            for (var i = 0; i < apiHolidayData.length; i++) {
                if (apiHolidayData[i].is_national_holiday == true) {
                    holidays.push(apiHolidayData[i].holiday_date);
                }
            }
            return holidays;
        } else {
            await sendLogTelegram("Doraymon: [" + LOG_LEVELS.WARNING + "] Failed to hit API holiday.");
            return false;
        }
    } catch (error) {
        await sendLogTelegram("Doraymon: [" + LOG_LEVELS.ERROR + "] Holiday API " + error);
        return false;
    }
}

async function cronReminder() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // month is 0-indexed

    const datesAndDays = getDatesAndDaysOfMonth(currentYear, currentMonth);

    var holidays = await hitApiHoliday();
    if (holidays != false) {
        // Filter out null entries (weekends) and dates in holidays before using forEach
        const filteredDatesAndDays = datesAndDays.filter(entry => entry !== null && !holidays.includes(entry.date));

        if (filteredDatesAndDays.length > 0) {
            // Find the max date in filteredDatesAndDays
            const maxDate = filteredDatesAndDays.reduce((max, entry) => (new Date(entry.date) > new Date(max.date) ? entry : max), filteredDatesAndDays[0]);

            // Get the current date
            const currentDate = new Date();
            const formattedCurrentDate = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;

            // Check if the current date is the same as maxDate.date
            if (maxDate.date === formattedCurrentDate) {
                getCapaReminder("ALL");
            }
        } else {
            await sendLogTelegram("Doraymon: [" + LOG_LEVELS.WARNING + "] Unavailable date to do notification.")
        }
    }
}

async function cronFriday(slot) {
    try {
        const weekDates = [];
        for (let i = 1; i <= 5; i++) {
            weekDates.push(moment().day(i).format('YYYY-MM-DD'));
        }

        var holidays = await hitApiHoliday();
        if (holidays != false) {
            // Filter out null entries (weekends) and dates in holidays before using forEach
            const filteredDatesAndDays = weekDates.filter(entry => entry !== null && !holidays.includes(entry));

            if (filteredDatesAndDays.length > 0) {
                await getCapaEveryFriday(slot);
            } else {
                await sendLogTelegram("Doraymon: [" + LOG_LEVELS.WARNING + "] Unavailable date to do notification every friday.")
            }
        }
    } catch (error) {
        await sendLogTelegram('Doraymon: [' + LOG_LEVELS.ERROR + '] Failed cron friday!\n' + error);
    }
}

// Serve HTML page for the root path
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Handle form submission
app.post('/submit', (req, res) => {
    let data = '';

    // Event listener for receiving data chunks
    req.on('data', chunk => {
        data += chunk;
    });

    // Event listener for end of data stream
    req.on('end', () => {
        const formData = new URLSearchParams(data);
        const username = formData.get('username');

        // Respond with a simple message
        res.send(`Hello, ${username}!`);
    });
});

// Schedule the job with the cron expression
// const capaReminder = cron.schedule('30 7 1-5 * *', cronReminder); // per tanggal 5 (CAPA bulan berjalan)
// const healthCheck = cron.schedule('* * * * *', cronHc)

// const capaFridayOne = cron.schedule('30 8 * * 1-5', () => {
//     cronFriday(1)
// })
// const capaFridayTwo = cron.schedule('45 9 * * 1-5', () => {
//     cronFriday(2)
// })
// const capaFridayThree = cron.schedule('30 10 * * 1-5', () => {
//     cronFriday(3)
// })
// const capaFridayFour = cron.schedule('45 10 * * 1-5', () => {
//     cronFriday(4)
// })
// const capaFridayFive = cron.schedule('0 13 * * 1-5', () => {
//     cronFriday(5)
// })
// const capaFridaySix = cron.schedule('30 13 * * 1-5', () => {
//     cronFriday(6)
// })
// const capaFridaySeven = cron.schedule('45 13 * * 1-5', () => {
//     cronFriday(7)
// })
// const capaFridayEight = cron.schedule('00 14 * * 1-5', () => {
//     cronFriday(8)
// })

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
