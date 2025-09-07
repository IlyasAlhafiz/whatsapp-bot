const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

const getVideoMetadata = async (url) => {
    try {
        const { stdout } = await execPromise(`yt-dlp -j "${url}"`);
        return JSON.parse(stdout.split("\n")[0]);
    } catch (error) {
        console.error("❌ Gagal mendapatkan metadata:", error);
        return null;
    }
};

module.exports = { getVideoMetadata };
