const { exec } = require("child_process");

/**
 * Mengambil metadata video menggunakan yt-dlp
 * @param {string} url - URL video yang akan diambil metadata-nya
 * @param {function} callback - Fungsi callback untuk menangani hasil metadata
 */
const getVideoMetadata = (url, callback) => {
    exec(`yt-dlp -j "${url}"`, (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Error mengambil metadata:", stderr);
            callback(null);
            return;
        }

        // Jika stdout kosong, return null
        if (!stdout) {
            console.error("❌ Metadata kosong atau tidak ditemukan.");
            callback(null);
            return;
        }

        try {
            const metadata = JSON.parse(stdout.split("\n")[0]); // Ambil JSON pertama jika ada banyak
            callback(metadata);
        } catch (parseError) {
            console.error("❌ Error parsing metadata:", parseError);
            callback(null);
        }
    });
};

module.exports = { getVideoMetadata };
