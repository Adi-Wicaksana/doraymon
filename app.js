const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  puppeteer: {
    headless: true,
    args: ['--no-sandbox'],
  }
});

client.initialize();

client.on('loading_screen', (percent, message) => {
  console.log('LOADING SCREEN', percent, message);
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('AUTHENTICATED');
});

client.on('auth_failure', msg => {
  console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
  console.log('Client was logged out', reason);
})

client.on('ready', () => {
  console.log('READY');
});

client.on('message', msg => {
  if (msg.body == '!ping') {
    msg.reply("pong");
  } else {
    console.log(msg.body);
  }
});
