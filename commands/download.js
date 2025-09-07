const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getVideoMetadata } = require('../helpers/metadata');
const { generateUniqueFileName } = require('../helpers/fileutils');
const { getTikTokPhotoUrls } = require('../helpers/tiktokScraper');
const { tiktokDir, igDir, ytDir } = require('../config');

const downloadMedia = async (sock, sender, url) => {
    let platform;
    if (url.includes("tiktok.com")) {
        platform = "tiktok";
    } else if (url.includes("instagram.com")) {
        platform = "ig";
    } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
        platform = "youtube";
    } else {
        await sock.sendMessage(sender, { text: "⚠️ Platform tidak dikenali." });
        return;
    }

    const directories = { tiktok: tiktokDir, ig: igDir, youtube: ytDir };
    const mediaDir = directories[platform];
    const uniqueFileName = generateUniqueFileName();

    await sock.sendMessage(sender, { text: `📥 Sedang memproses media dari ${platform}, mohon tunggu...` });

    console.log(`⬇️ Mengunduh media dari ${platform}: ${url}`);

    if (platform === "tiktok" && url.includes("/photo/")) {
        const photoUrls = await getTikTokPhotoUrls(url);
        if (!photoUrls || photoUrls.length === 0) {
            await sock.sendMessage(sender, { text: "⚠️ Gagal mengambil foto dari TikTok!" });
            return;
        }

        for (let i = 0; i < photoUrls.length; i++) {
            const photoUrl = photoUrls[i];
            const photoPath = path.join(mediaDir, `${uniqueFileName}_${i}.jpg`);
            
            try {
                const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
                fs.writeFileSync(photoPath, response.data);

                await sock.sendMessage(sender, { image: fs.readFileSync(photoPath) });

                fs.unlinkSync(photoPath);
                console.log(`🗑️ Foto ${i + 1} berhasil dihapus: ${photoPath}`);
            } catch (err) {
                console.error(`⚠️ Gagal mengunduh foto ${i + 1}:`, err);
            }
        }

        return;
    }

    getVideoMetadata(url, async (metadata) => {
        if (!metadata) {
            await sock.sendMessage(sender, { text: "⚠️ Gagal mendapatkan metadata media." });
            return;
        }

        const mediaTitle = metadata.title || `Media ${platform}`;
        const mediaDescription = metadata.description || "Deskripsi tidak tersedia.";
        const isVideo = metadata.ext && metadata.ext.includes("mp4");

        let mediaPath;
        let command;
        
        if (isVideo) {
            mediaPath = path.join(mediaDir, `${uniqueFileName}.mp4`);
            command = `yt-dlp -o "${mediaPath}" "${url}"`;
        } else {
            mediaPath = path.join(mediaDir, `${uniqueFileName}.jpg`);
            command = `yt-dlp --skip-download --write-thumbnail -o "${mediaPath}" "${url}"`;
        }

        exec(command, async (error) => {
            if (error) {
                console.error(`❌ Error mengunduh ${platform}:`, error);
                await sock.sendMessage(sender, { text: `⚠️ Gagal mengunduh media dari ${platform}!` });
                return;
            }

            console.log(`📤 Mengirim ${isVideo ? "video" : "foto"} ke:`, sender);

            await sock.sendMessage(sender, isVideo 
                ? { video: fs.readFileSync(mediaPath) } 
                : { image: fs.readFileSync(mediaPath) }
            );

            await sock.sendMessage(sender, { text: `*${mediaTitle}*\n\n${mediaDescription}` });

            try {
                fs.unlinkSync(mediaPath);
                console.log(`🗑️ File berhasil dihapus: ${mediaPath}`);
            } catch (err) {
                console.error(`⚠️ Gagal menghapus file:`, err);
            }
        });
    });
};

module.exports = { downloadMedia };
