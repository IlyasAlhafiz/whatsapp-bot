const fs = require('fs');
const crypto = require('crypto');

const generateUniqueFileName = () => {
    return crypto.randomBytes(16).toString('hex') + Date.now();
};

module.exports = { generateUniqueFileName };
