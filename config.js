const path = require('path');
const fs = require('fs');

const databaseDir = './database';
const stickerDir = path.join(databaseDir, 'sticker');
const bratDir = path.join(databaseDir, 'brat');
const igDir = path.join(databaseDir, 'ig');
const tiktokDir = path.join(databaseDir, 'tiktok');
const ytDir = path.join(databaseDir, 'yt');

const createDirectoryIfNotExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

[databaseDir, stickerDir, bratDir, igDir, tiktokDir, ytDir].forEach(createDirectoryIfNotExists);

module.exports = {
    databaseDir,
    stickerDir,
    bratDir,
    igDir,
    tiktokDir,
    ytDir,
};
