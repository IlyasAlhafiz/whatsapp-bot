const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function downloadMsgBuffer(msg) {
  const node =
    msg.message?.imageMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage ||
    msg.message?.documentMessage;

  if (!node) return null;

  const type =
    msg.message?.imageMessage ? 'image' :
    msg.message?.videoMessage ? 'video' :
    msg.message?.stickerMessage ? 'sticker' : 'document';

  const stream = await downloadContentFromMessage(node, type);
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

module.exports = { downloadMsgBuffer };