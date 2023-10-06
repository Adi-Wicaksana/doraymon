const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  puppeteer: {
    headless: true,
    args: ['--no-sandbox'],
  }
});

client.on('qr', qr => {
  console.log('qr');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('AUTHENTICATED');
});

client.on('auth_failure', msg => {
  // Fired if session restore was unsuccessful
  console.log('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
  console.log('Client was logged out', reason);
})

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', message => {
  if (message.body === '!ping') {
    message.reply('pong');
  } else {
    console.log(message.body);
  }
});

client.initialize();
