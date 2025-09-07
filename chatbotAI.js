const tf = require('@tensorflow/tfjs-node');
const use = require('@tensorflow-models/universal-sentence-encoder');
const fs = require('fs');

let model;
let responses = {};

// **Muat model dan database saat bot dijalankan**
async function loadModel() {
    model = await use.load();
    console.log("✅ Model AI telah dimuat!");

    // **Muat database JSON**
    if (fs.existsSync('./responses.json')) {
        responses = JSON.parse(fs.readFileSync('./responses.json', 'utf-8'));
    } else {
        console.log("⚠️ Database respons tidak ditemukan.");
    }
}
loadModel();

// **Fungsi untuk mendapatkan respons terbaik berdasarkan similarity score**
async function getAIResponse(userInput) {
    if (!model) return "⚠️ Model AI belum siap. Coba lagi nanti.";

    // Konversi input pengguna ke embedding
    const inputEmbedding = await model.embed([userInput]);
    const inputArray = inputEmbedding.arraySync()[0];

    let bestMatch = null;
    let highestScore = 0.5;  // **Threshold minimal untuk kecocokan**

    for (let question in responses) {
        const responseEmbedding = await model.embed([question]);
        const responseArray = responseEmbedding.arraySync()[0];

        // **Menghitung cosine similarity**
        const similarity = cosineSimilarity(inputArray, responseArray);

        if (similarity > highestScore) {
            highestScore = similarity;
            bestMatch = responses[question];
        }
    }

    return bestMatch || "Maaf, saya tidak mengerti. Bisa dijelaskan lebih lanjut? 🤖";
}

// **Fungsi menghitung cosine similarity**
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val ** 2, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val ** 2, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// **Fungsi untuk menambahkan pertanyaan baru jika tidak ada jawaban**
function addNewResponse(question, answer) {
    responses[question] = answer;
    fs.writeFileSync('./responses.json', JSON.stringify(responses, null, 2));
    console.log(`✅ Respons baru ditambahkan: "${question}" -> "${answer}"`);
}

// **Ekspor fungsi**
module.exports = async (message) => {
    const response = await getAIResponse(message);
    return response;
};

// **Fitur Pembelajaran AI (Opsional, Tambahkan ke Bot)**
module.exports.learn = (question, answer) => {
    addNewResponse(question, answer);
    return `✅ Respons baru telah ditambahkan! Bot sekarang bisa menjawab "${question}".`;
};
