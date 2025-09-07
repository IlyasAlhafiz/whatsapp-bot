const axios = require('axios');
const cheerio = require('cheerio');

const getTikTokPhotoUrls = async (url) => {
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        
        // Cari semua foto dalam post carousel
        const photoUrls = [];
        $('img').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.includes('tiktokcdn')) {
                photoUrls.push(src);
            }
        });

        return photoUrls;
    } catch (error) {
        console.error('❌ Error scraping TikTok photo:', error);
        return null;
    }
};

module.exports = { getTikTokPhotoUrls };
